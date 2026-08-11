-- GitHub #97 — WVDOT multipart source geometry + durable failed-run hardening.
--
-- Production discovery on the first Ohio County WV scope found valid WVDOT
-- Publication LRS features whose ArcGIS geometry contains two individually
-- simple paths (for example a closed loop plus a stem touching at one point).
-- Combining those original source paths into one MultiLineString makes the
-- collection non-simple even though neither source path is invalid, crossed or
-- overlapping. The authoritative raw-segment layer intentionally keeps its
-- ST_IsSimple safety constraint, so preserve each ArcGIS path as its own source
-- segment row under the same authoritative road identity instead of weakening
-- the constraint or noding/inventing source topology.
--
-- The same production failure exposed that the source-scope orchestrator's
-- outer EXCEPTION block rolled back begin_ingest before fail_ingest ran. Move
-- page/finalization work into an inner subtransaction so a failed run receipt
-- remains durable while all partial page/source writes still roll back.

create or replace function public.brinesearch_issue97_ingest_wv_network_page(
  p_county_code text,
  p_offset integer default 0,
  p_page_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_source_county text;
  v_county_name text;
  v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_limit integer:=greatest(1,least(coalesce(p_page_size,1000),2000));
  v_dataset uuid:=private_verification.brinesearch_issue97_uuid('dataset:wv_wvdot_publication_lrs');
  v_url text;
  v_response extensions.http_response;
  v_body jsonb;
  v_feature jsonb;
  v_props jsonb;
  v_identity uuid;
  v_identity_key text;
  v_base_segment_key text;
  v_segment_key text;
  v_label text;
  v_source_label text;
  v_sign text;
  v_supp text;
  v_access text;
  v_drivable text;
  v_from_measure numeric;
  v_to_measure numeric;
  v_z_level integer;
  v_path record;
  v_path_count integer;
  v_valid_path_count integer;
  v_source_path_count integer;
  v_rows integer:=0;
  v_source_rows integer:=0;
  v_has_more boolean:=false;
begin
  select source_county_code,county_name into v_source_county,v_county_name
  from public.brinesearch_road_graph_counties
  where state_code='WV' and county_code=v_county and active;
  if not found then raise exception 'County is outside the issue #97 West Virginia footprint'; end if;

  v_url:='https://gis.transportation.wv.gov/arcgis/rest/services/Roads_And_Highways/Publication_LRS/MapServer/89/query'
    ||'?where=CO_CountyID%3D%27'||v_source_county||'%27'
    ||'&outFields=*&returnGeometry=true&returnM=true&returnZ=true&outSR=4326'
    ||'&orderByFields=OBJECTID'
    ||'&resultOffset='||v_offset||'&resultRecordCount='||v_limit||'&f=json';
  v_response:=extensions.http_get(v_url);
  if v_response.status<>200 then raise exception 'WVDOT request failed with HTTP %',v_response.status; end if;
  v_body:=v_response.content::jsonb;
  if v_body ? 'error' then raise exception 'WVDOT response contained an ArcGIS error'; end if;
  v_source_rows:=pg_catalog.jsonb_array_length(coalesce(v_body->'features','[]'::jsonb));
  v_has_more:=coalesce(
    nullif(v_body->>'exceededTransferLimit','')::boolean,
    nullif(v_body->'properties'->>'exceededTransferLimit','')::boolean,
    v_source_rows=v_limit
  );

  for v_feature in
    select value from pg_catalog.jsonb_array_elements(coalesce(v_body->'features','[]'::jsonb))
  loop
    v_props:=v_feature->'attributes';
    if nullif(v_props->>'CO_ROUTEID','') is null
       or pg_catalog.jsonb_typeof(v_feature->'geometry'->'paths')<>'array' then
      continue;
    end if;

    v_source_path_count:=pg_catalog.jsonb_array_length(v_feature->'geometry'->'paths');
    begin
      select
        count(*)::integer,
        count(*) filter(where
          q.path_from is not null and q.path_to is not null
          and not extensions.st_isempty(q.path_geom)
          and extensions.st_dimension(q.path_geom)=1
          and extensions.st_isvalid(q.path_geom)
          and extensions.st_issimple(q.path_geom)
          and extensions.st_coveredby(
            q.path_geom,
            extensions.st_makeenvelope(-180,-90,180,90,4326)
          )
        )::integer,
        (array_agg(q.path_from order by q.path_number))[1],
        (array_agg(q.path_to order by q.path_number desc))[1],
        case when max(q.max_abs_z)>0.01 then pg_catalog.round(avg(q.avg_z))::integer end
      into v_path_count,v_valid_path_count,v_from_measure,v_to_measure,v_z_level
      from (
        select path_number,
          extensions.st_force2d(extensions.st_makeline(
            extensions.st_setsrid(extensions.st_makepoint(
              (coordinate->>0)::double precision,(coordinate->>1)::double precision
            ),4326) order by point_number
          )) as path_geom,
          (array_agg(nullif(coordinate->>3,'')::numeric order by point_number))[1] as path_from,
          (array_agg(nullif(coordinate->>3,'')::numeric order by point_number desc))[1] as path_to,
          max(pg_catalog.abs(coalesce(nullif(coordinate->>2,'')::numeric,0))) as max_abs_z,
          avg(coalesce(nullif(coordinate->>2,'')::numeric,0)) as avg_z
        from pg_catalog.jsonb_array_elements(v_feature->'geometry'->'paths')
          with ordinality path(path_value,path_number)
        cross join lateral pg_catalog.jsonb_array_elements(path.path_value)
          with ordinality point(coordinate,point_number)
        group by path_number
        having count(*)>=2
      ) q;
    exception when others then
      continue;
    end;

    -- Every original ArcGIS path must survive independently. Do not silently
    -- drop a one-point/bad-measure/non-simple path from a required source.
    if coalesce(v_path_count,0)=0
       or v_path_count<>v_source_path_count
       or v_valid_path_count<>v_path_count
       or v_from_measure is null or v_to_measure is null then
      continue;
    end if;

    v_identity_key:='WV:WVDOT:ROUTE_ID:'||(v_props->>'CO_ROUTEID');
    v_identity:=private_verification.brinesearch_issue97_uuid(v_identity_key);
    v_base_segment_key:='WV:WVDOT:SEGMENT:'||(v_props->>'OBJECTID');
    v_source_label:=nullif(pg_catalog.btrim(v_props->>'CO_RouteLabel'),'');
    v_label:=coalesce(v_source_label,'WVDOT route '||(v_props->>'CO_ROUTEID'));
    v_sign:=coalesce(v_props->>'CO_SignSystem','');
    v_supp:=coalesce(v_props->>'CO_SuppCode','');
    v_access:=case
      when v_sign in ('R','T','9') or v_supp in ('21','23','24','51','99') then 'held'
      when v_sign in ('0','1','2','3','4','6','7','8') then 'public'
      else 'held' end;
    v_drivable:=case
      when v_sign in ('R','T') or v_supp in ('21','51','99') then 'non_drivable'
      when v_sign='9' or v_supp in ('23','24') then 'held'
      when v_sign in ('0','1','2','3','4','6','7','8') then 'drivable'
      else 'held' end;

    insert into public.brinesearch_authoritative_road_identities(
      id,dataset_id,source_identity_key,state_code,county_code,county_name,
      route_system,route_number,route_suffix,route_fraction,route_extension,
      display_name,normalized_name,road_class,public_access_status,drivable_status,
      maintainer,source_record_ids,attributes,source_digest,source_timestamp,active,last_seen_at
    ) values (
      v_identity,v_dataset,v_identity_key,'WV',v_county,v_county_name,v_sign,
      v_props->>'CO_RouteNumber',nullif(v_props->>'CO_RouteDirection','00'),
      nullif(v_props->>'CO_SubRoute','00'),nullif(v_supp,'00'),v_label,
      pg_catalog.regexp_replace(pg_catalog.lower(v_label),'[^a-z0-9]+',' ','g'),
      case when v_supp in ('17','23','24') then 'ramp' else case v_sign
        when '1' then 'interstate' when '2' then 'us_route' when '3' then 'state_route'
        when '4' then 'county' when '6' then 'park' when '7' then 'local'
        when '8' then 'local' when '0' then 'local' when 'T' then 'trail'
        when 'R' then 'rail' else 'other' end end,
      v_access,v_drivable,'West Virginia Division of Highways',array[v_props->>'OBJECTID'],
      v_props||pg_catalog.jsonb_build_object(
        'source_geometry_zm',v_feature->'geometry',
        'source_geometry_has_z',coalesce((v_body->>'hasZ')::boolean,true),
        'source_geometry_has_m',coalesce((v_body->>'hasM')::boolean,true),
        'source_average_z',v_z_level,
        'source_path_count',v_path_count,
        'multipart_paths_preserved',v_path_count>1,
        'measure_direction_preserved',true
      ),pg_catalog.md5(v_props::text||(v_feature->'geometry')::text),
      case when (v_props->>'SYSTEM_MOD_DATE') ~ '^[0-9]+$'
        then pg_catalog.to_timestamp((v_props->>'SYSTEM_MOD_DATE')::numeric/1000.0) end,
      true,now()
    )
    on conflict(source_identity_key) do update set
      county_code=excluded.county_code,county_name=excluded.county_name,
      route_system=excluded.route_system,route_number=excluded.route_number,
      route_suffix=excluded.route_suffix,route_fraction=excluded.route_fraction,
      route_extension=excluded.route_extension,display_name=excluded.display_name,
      normalized_name=excluded.normalized_name,road_class=excluded.road_class,
      public_access_status=excluded.public_access_status,drivable_status=excluded.drivable_status,
      source_record_ids=array(select distinct x from unnest(
        public.brinesearch_authoritative_road_identities.source_record_ids||excluded.source_record_ids
      ) x),attributes=excluded.attributes,source_digest=excluded.source_digest,
      source_timestamp=excluded.source_timestamp,active=true,last_seen_at=now();

    if v_source_label is not null then
      insert into public.brinesearch_authoritative_road_names(
        identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,
        source_segment_key,from_measure,to_measure,provenance
      ) values (
        v_identity,v_dataset,v_props->>'OBJECTID','official',v_source_label,
        pg_catalog.regexp_replace(pg_catalog.lower(v_source_label),'[^a-z0-9]+',' ','g'),
        case when v_path_count=1 then v_base_segment_key else null end,
        v_from_measure,v_to_measure,
        pg_catalog.jsonb_build_object(
          'route_id',v_props->>'CO_ROUTEID','source','WVDOT Publication LRS',
          'source_path_count',v_path_count,'multipart_paths_preserved',v_path_count>1
        )
      ) on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update
        set source_segment_key=excluded.source_segment_key,from_measure=excluded.from_measure,
            to_measure=excluded.to_measure,provenance=excluded.provenance,
            active=true,last_seen_at=now(),updated_at=now();
    end if;

    for v_path in
      select path_number,
        extensions.st_force2d(extensions.st_makeline(
          extensions.st_setsrid(extensions.st_makepoint(
            (coordinate->>0)::double precision,(coordinate->>1)::double precision
          ),4326) order by point_number
        )) as path_geom,
        (array_agg(nullif(coordinate->>3,'')::numeric order by point_number))[1] as path_from,
        (array_agg(nullif(coordinate->>3,'')::numeric order by point_number desc))[1] as path_to,
        case when max(pg_catalog.abs(coalesce(nullif(coordinate->>2,'')::numeric,0)))>0.01
          then pg_catalog.round(avg(coalesce(nullif(coordinate->>2,'')::numeric,0)))::integer end as path_z,
        pg_catalog.md5(path.path_value::text) as path_digest
      from pg_catalog.jsonb_array_elements(v_feature->'geometry'->'paths')
        with ordinality path(path_value,path_number)
      cross join lateral pg_catalog.jsonb_array_elements(path.path_value)
        with ordinality point(coordinate,point_number)
      group by path_number,path.path_value
      having count(*)>=2
      order by path_number
    loop
      v_segment_key:=case when v_path_count=1 then v_base_segment_key
        else v_base_segment_key||':PATH:'||v_path.path_number::text end;

      insert into public.brinesearch_authoritative_external_road_segments(
        id,dataset_id,identity_id,source_segment_key,source_record_id,state_code,
        county_code,county_name,from_measure,to_measure,route_direction,z_level,
        public_access_status,drivable_status,geom,attributes,source_digest,
        source_timestamp,active,fetched_at
      ) values (
        private_verification.brinesearch_issue97_uuid(v_segment_key),v_dataset,v_identity,
        v_segment_key,v_props->>'OBJECTID','WV',v_county,v_county_name,
        v_path.path_from,v_path.path_to,v_props->>'CO_RouteDirection',null,
        v_access,v_drivable,v_path.path_geom,
        v_props||pg_catalog.jsonb_build_object(
          'source_geometry_zm',v_feature->'geometry',
          'source_geometry_has_z',coalesce((v_body->>'hasZ')::boolean,true),
          'source_geometry_has_m',coalesce((v_body->>'hasM')::boolean,true),
          'source_average_z',v_path.path_z,
          'source_path_number',v_path.path_number,
          'source_path_count',v_path_count,
          'multipart_paths_preserved',v_path_count>1,
          'measure_direction_preserved',true
        ),
        pg_catalog.md5(v_props::text||v_path.path_digest),
        case when (v_props->>'SYSTEM_MOD_DATE') ~ '^[0-9]+$'
          then pg_catalog.to_timestamp((v_props->>'SYSTEM_MOD_DATE')::numeric/1000.0) end,
        true,now()
      ) on conflict(source_segment_key) do update set
        identity_id=excluded.identity_id,county_code=excluded.county_code,county_name=excluded.county_name,
        from_measure=excluded.from_measure,to_measure=excluded.to_measure,
        route_direction=excluded.route_direction,z_level=excluded.z_level,
        public_access_status=excluded.public_access_status,
        drivable_status=excluded.drivable_status,geom=excluded.geom,attributes=excluded.attributes,
        source_digest=excluded.source_digest,source_timestamp=excluded.source_timestamp,
        active=true,fetched_at=now();
    end loop;

    v_rows:=v_rows+1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'source','wv_wvdot_publication_lrs','county_code',v_county,
    'source_county_code',v_source_county,'offset',v_offset,'page_size',v_limit,
    'source_rows',v_source_rows,'rows',v_rows,'rejected_rows',v_source_rows-v_rows,
    'has_more',v_has_more,
    'page_digest',pg_catalog.md5(coalesce((v_body->'features')::text,'[]'))
  );
end
$$;

revoke all on function public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer)
to service_role;

create or replace function public.brinesearch_issue97_refresh_source_scope(
  p_source_key text,
  p_county_code text,
  p_page_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source text:=pg_catalog.btrim(coalesce(p_source_key,''));
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_limit integer:=greatest(1,least(coalesce(p_page_size,1000),2000));
  v_snapshot jsonb;
  v_expected integer;
  v_expected_pages integer;
  v_begin jsonb;
  v_page jsonb;
  v_final jsonb;
  v_run_id uuid;
  v_offset integer:=0;
  v_pages integer:=0;
  v_source_rows integer:=0;
  v_ingested_rows integer:=0;
  v_rejected_rows integer:=0;
  v_error text;
  v_sqlstate text;
begin
  if v_source='' or v_county='' then
    raise exception 'Source key and county code are required' using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.brinesearch_road_source_datasets d
    join public.brinesearch_road_source_dataset_counties scope
      on scope.dataset_id=d.id and scope.state_code=d.state_code
    join public.brinesearch_road_graph_counties county
      on county.state_code=scope.state_code and county.county_code=scope.county_code
    where d.source_key=v_source and d.active
      and scope.county_code=v_county and scope.active and scope.ingest_enabled
      and county.active
  ) then
    raise exception 'Issue #97 source/county scope is not active and ingest-enabled: % / %',
      v_source,v_county using errcode='22023';
  end if;

  v_snapshot:=public.brinesearch_issue97_source_snapshot(v_source,v_county);
  if v_snapshot is null or pg_catalog.jsonb_typeof(v_snapshot)<>'object'
     or coalesce(v_snapshot->>'expected_source_rows','')!~'^[0-9]+$' then
    raise exception 'Issue #97 source snapshot did not return an expected row count'
      using errcode='P0001';
  end if;
  v_expected:=(v_snapshot->>'expected_source_rows')::integer;
  v_expected_pages:=greatest(1,pg_catalog.ceil(v_expected::numeric/v_limit)::integer);

  -- This row is intentionally created outside the inner exception block so a
  -- loader/finalizer failure cannot roll it back before fail_ingest records it.
  v_begin:=public.brinesearch_issue97_begin_ingest(
    v_source,v_county,v_expected,v_snapshot
  );
  v_run_id:=(v_begin->>'run_id')::uuid;
  if v_run_id is null then
    raise exception 'Issue #97 begin_ingest did not return a run id' using errcode='P0001';
  end if;

  begin
    loop
      v_page:=public.brinesearch_issue97_ingest_page(v_run_id,v_offset,v_limit);
      v_pages:=v_pages+1;
      v_source_rows:=v_source_rows+coalesce((v_page->>'source_rows')::integer,0);
      v_ingested_rows:=v_ingested_rows+coalesce((v_page->>'rows')::integer,0);
      v_rejected_rows:=v_rejected_rows+coalesce((v_page->>'rejected_rows')::integer,0);

      if v_pages>v_expected_pages then
        raise exception 'page count exceeded source snapshot expectation' using errcode='P0001';
      end if;

      exit when coalesce((v_page->>'has_more')::boolean,false) is false;
      v_offset:=v_offset+v_limit;
    end loop;

    v_final:=public.brinesearch_issue97_finalize_ingest(
      v_run_id,
      pg_catalog.jsonb_build_object(
        'orchestrator','brinesearch_issue97_refresh_source_scope',
        'requested_page_size',v_limit,
        'orchestrator_page_count',v_pages,
        'orchestrator_source_rows',v_source_rows,
        'orchestrator_ingested_rows',v_ingested_rows,
        'orchestrator_rejected_rows',v_rejected_rows
      )
    );
  exception when others then
    get stacked diagnostics v_error=message_text,v_sqlstate=returned_sqlstate;
    perform public.brinesearch_issue97_fail_ingest(
      v_run_id,
      'source-scope orchestrator error',
      pg_catalog.jsonb_build_object(
        'sqlstate',v_sqlstate,'message',v_error,
        'orchestrator','brinesearch_issue97_refresh_source_scope',
        'pages_completed',v_pages,
        'source_rows_seen',v_source_rows,
        'ingested_rows_seen',v_ingested_rows,
        'rejected_rows_seen',v_rejected_rows,
        'expected_source_rows',v_expected,'expected_pages',v_expected_pages
      )
    );
    return pg_catalog.jsonb_build_object(
      'source_key',v_source,'county_code',v_county,
      'run_id',v_run_id,'status','failed',
      'sqlstate',v_sqlstate,'error',v_error,
      'pages_completed',v_pages,
      'source_rows_seen',v_source_rows,
      'ingested_rows_seen',v_ingested_rows,
      'rejected_rows_seen',v_rejected_rows
    );
  end;

  return pg_catalog.jsonb_build_object(
    'source_key',v_source,'county_code',v_county,
    'run_id',v_run_id,'expected_source_rows',v_expected,
    'pages',v_pages,'source_rows',v_source_rows,
    'ingested_rows',v_ingested_rows,'rejected_rows',v_rejected_rows,
    'status',coalesce(v_final->>'status','failed'),
    'coverage_complete',coalesce((v_final->>'coverage_complete')::boolean,false),
    'page_set_digest',v_final->>'page_set_digest',
    'content_digest',v_final->>'content_digest',
    'finalize',v_final
  );
end
$$;

revoke all on function public.brinesearch_issue97_refresh_source_scope(text,text,integer)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_refresh_source_scope(text,text,integer)
to service_role;

comment on function public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer) is
  'Issue #97 WVDOT Publication LRS loader. Preserves every ArcGIS path as an independent simple source segment under one road identity; multipart paths are never combined/noded into invented topology.';
comment on function public.brinesearch_issue97_refresh_source_scope(text,text,integer) is
  'Issue #97 restartable service-only source orchestrator. Page/finalizer failures roll back partial source writes but preserve an explicit failed ingest-run receipt.';
