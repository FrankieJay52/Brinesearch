-- GitHub #97 — Pennsylvania authoritative-source accounting hardening.
--
-- PennDOT state/local road layers can contain durable source rows with unusable
-- geometry (for example a LineString with zero coordinates) and sentinel NLF_ID
-- values such as -1. Those rows are still part of the official source snapshot,
-- but they must never become graph topology and a sentinel must never merge
-- unrelated roads into one authoritative identity.
--
-- This migration:
--   * treats NLF_ID -1/0 as missing and falls back to GPID then OBJECTID;
--   * preserves unusable state/local source geometry in the existing private
--     source-geometry hold ledger;
--   * counts held rows as fully accounted source rows while emitting no segment;
--   * keeps at-grade node rows fail-closed when their point geometry is unusable;
--   * preserves exact source attributes/geometry/digests for later correction.

alter table private_verification.brinesearch_issue97_source_geometry_holds
  drop constraint if exists brinesearch_issue97_source_geometry_holds_reason_check;

alter table private_verification.brinesearch_issue97_source_geometry_holds
  add constraint brinesearch_issue97_source_geometry_holds_reason_check
  check(hold_reason in (
    'non_simple_source_geometry_topology_unproven',
    'missing_source_geometry',
    'empty_source_geometry',
    'invalid_source_geometry',
    'unsupported_source_geometry'
  ));

create or replace function private_verification.brinesearch_issue97_pa_geometry_hold_reason(
  p_geometry jsonb
)
returns text
language plpgsql
stable
security definer
set search_path=''
as $issue97_pa_geometry_hold_reason$
declare
  v_geom extensions.geometry;
begin
  if p_geometry is null or pg_catalog.jsonb_typeof(p_geometry)='null' then
    return 'missing_source_geometry';
  end if;

  begin
    v_geom:=extensions.st_force2d(
      extensions.st_setsrid(extensions.st_geomfromgeojson(p_geometry::text),4326)
    );
  exception when others then
    return 'invalid_source_geometry';
  end;

  if v_geom is null or extensions.st_isempty(v_geom) then
    return 'empty_source_geometry';
  end if;
  if extensions.st_dimension(v_geom)<>1 then
    return 'unsupported_source_geometry';
  end if;
  if not extensions.st_isvalid(v_geom)
     or not extensions.st_coveredby(
       v_geom,extensions.st_makeenvelope(-180,-90,180,90,4326)
     ) then
    return 'invalid_source_geometry';
  end if;
  if not extensions.st_issimple(v_geom) then
    return 'non_simple_source_geometry_topology_unproven';
  end if;
  return null;
end
$issue97_pa_geometry_hold_reason$;

revoke all on function private_verification.brinesearch_issue97_pa_geometry_hold_reason(jsonb)
from public,anon,authenticated;

-- Executable geometry classification regression.
do $issue97_pa_geometry_hold_regression$
declare
  v_simple text;
  v_empty text;
  v_missing text;
  v_wrong_dimension text;
  v_bowtie text;
begin
  v_simple:=private_verification.brinesearch_issue97_pa_geometry_hold_reason(
    '{"type":"LineString","coordinates":[[-80,40],[-80.1,40.1]]}'::jsonb
  );
  v_empty:=private_verification.brinesearch_issue97_pa_geometry_hold_reason(
    '{"type":"LineString","coordinates":[]}'::jsonb
  );
  v_missing:=private_verification.brinesearch_issue97_pa_geometry_hold_reason(null);
  v_wrong_dimension:=private_verification.brinesearch_issue97_pa_geometry_hold_reason(
    '{"type":"Point","coordinates":[-80,40]}'::jsonb
  );
  v_bowtie:=private_verification.brinesearch_issue97_pa_geometry_hold_reason(
    '{"type":"LineString","coordinates":[[0,0],[1,1],[0,1],[1,0]]}'::jsonb
  );

  if v_simple is not null
     or v_empty is distinct from 'empty_source_geometry'
     or v_missing is distinct from 'missing_source_geometry'
     or v_wrong_dimension is distinct from 'unsupported_source_geometry'
     or v_bowtie is distinct from 'non_simple_source_geometry_topology_unproven' then
    raise exception 'Issue #97 PA geometry hold regression failed: simple %, empty %, missing %, dimension %, bowtie %',
      v_simple,v_empty,v_missing,v_wrong_dimension,v_bowtie;
  end if;
end
$issue97_pa_geometry_hold_regression$;

create or replace function public.brinesearch_issue97_ingest_pa_page(
  p_source_key text,
  p_county_code text,
  p_offset integer default 0,
  p_page_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $issue97_ingest_pa_page$
declare
  v_source text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_source_key,'')));
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_source_county text;
  v_county_name text;
  v_dataset uuid;
  v_layer integer;
  v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_limit integer:=greatest(1,least(coalesce(p_page_size,1000),2000));
  v_url text;
  v_response extensions.http_response;
  v_body jsonb;
  v_feature jsonb;
  v_props jsonb;
  v_geometry_json jsonb;
  v_geom extensions.geometry;
  v_geometry_hold boolean:=false;
  v_hold_reason text;
  v_identity uuid;
  v_identity_key text;
  v_identity_key_kind text;
  v_segment_key text;
  v_display text;
  v_source_name text;
  v_internal_id text;
  v_internal_route text;
  v_signed text;
  v_signed_index integer;
  v_signed_type_fields constant text[]:=array['TRAF_RT_NO','TRAF_RT__3','TRAF_RT__6'];
  v_signed_number_fields constant text[]:=array['TRAF_RT__1','TRAF_RT__4','TRAF_RT__7'];
  v_signed_suffix_fields constant text[]:=array['TRAF_RT__2','TRAF_RT__5','TRAF_RT__8'];
  v_access text;
  v_drivable text;
  v_source_access text;
  v_source_drivable text;
  v_source_digest text;
  v_rows integer:=0;
  v_held_rows integer:=0;
  v_source_rows integer:=0;
  v_has_more boolean:=false;
begin
  select source_county_code,county_name into v_source_county,v_county_name
  from public.brinesearch_road_graph_counties
  where state_code='PA' and county_code=v_county and active;
  if not found then raise exception 'County is outside the issue #97 Pennsylvania footprint'; end if;

  select case v_source when 'pa_penndot_state_roads' then 4
    when 'pa_penndot_local_roads' then 3
    when 'pa_penndot_at_grade_intersections' then 23 else null end,d.id
  into v_layer,v_dataset
  from public.brinesearch_road_source_datasets d where d.source_key=v_source;
  if v_layer is null then raise exception 'Unsupported PennDOT source'; end if;

  v_url:='https://mapservices.pasda.psu.edu/server/rest/services/pasda/PennDOT/MapServer/'||v_layer||'/query'
    ||'?where=CTY_CODE%3D%27'||v_source_county||'%27&outFields=*'
    ||'&returnGeometry=true&returnM=false&returnZ=false&outSR=4326'
    ||'&orderByFields=OBJECTID'
    ||'&resultOffset='||v_offset||'&resultRecordCount='||v_limit||'&f=geojson';
  v_response:=extensions.http_get(v_url);
  if v_response.status<>200 then raise exception 'PennDOT request failed with HTTP %',v_response.status; end if;
  v_body:=v_response.content::jsonb;
  if v_body ? 'error' then raise exception 'PennDOT response contained an ArcGIS error'; end if;
  v_source_rows:=pg_catalog.jsonb_array_length(coalesce(v_body->'features','[]'::jsonb));
  v_has_more:=coalesce(
    nullif(v_body->>'exceededTransferLimit','')::boolean,
    nullif(v_body->'properties'->>'exceededTransferLimit','')::boolean,
    v_source_rows=v_limit
  );

  for v_feature in select value from pg_catalog.jsonb_array_elements(coalesce(v_body->'features','[]'::jsonb))
  loop
    v_props:=v_feature->'properties';
    v_geometry_json:=v_feature->'geometry';
    v_geom:=null;
    v_geometry_hold:=false;
    v_hold_reason:=null;

    -- At-grade nodes have no useful source identity without a point. They remain
    -- rejected rather than inventing a node or treating a missing point as a road.
    if v_source='pa_penndot_at_grade_intersections' then
      if v_geometry_json is null or pg_catalog.jsonb_typeof(v_geometry_json)='null' then continue; end if;
      begin
        v_geom:=extensions.st_force2d(
          extensions.st_setsrid(extensions.st_geomfromgeojson(v_geometry_json::text),4326)
        );
      exception when others then
        continue;
      end;
      if extensions.geometrytype(v_geom)<>'POINT'
         or extensions.st_isempty(v_geom)
         or not extensions.st_isvalid(v_geom)
         or not extensions.st_coveredby(v_geom,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
        continue;
      end if;
      -- NODE_ID identifies the physical intersection, not a source row. Layer
      -- 23 repeats it for every ordered participating route tuple and across
      -- some county scopes. Land each OBJECTID occurrence so multiway evidence
      -- is never overwritten by the last page or county.
      if nullif(v_props->>'OBJECTID','') is null then continue; end if;
      v_segment_key:='PA:PENNDOT:AT_GRADE:OCCURRENCE:'||(v_props->>'OBJECTID')
        ||':SCOPE:PA:'||v_county;
      insert into public.brinesearch_authoritative_road_nodes(
        id,dataset_id,source_node_key,source_record_id,state_code,county_code,
        county_name,node_type,geom,attributes,source_digest,active,fetched_at
      ) values (
        private_verification.brinesearch_issue97_uuid(v_segment_key),v_dataset,v_segment_key,
        v_props->>'OBJECTID','PA',v_county,v_county_name,
        'at_grade_intersection',v_geom,v_props,
        pg_catalog.md5(v_props::text||extensions.st_asgeojson(v_geom,15)),true,now()
      ) on conflict(source_node_key) do update set
        county_code=excluded.county_code,county_name=excluded.county_name,geom=excluded.geom,
        attributes=excluded.attributes,source_digest=excluded.source_digest,active=true,fetched_at=now();
      v_rows:=v_rows+1;
      continue;
    end if;

    -- State/local road rows are official source records even when their geometry
    -- is unusable. Classify that condition explicitly and preserve it in the
    -- private hold ledger instead of rejecting it or inventing topology.
    v_hold_reason:=private_verification.brinesearch_issue97_pa_geometry_hold_reason(v_geometry_json);
    v_geometry_hold:=v_hold_reason is not null;
    if not v_geometry_hold then
      begin
        v_geom:=extensions.st_force2d(
          extensions.st_setsrid(extensions.st_geomfromgeojson(v_geometry_json::text),4326)
        );
      exception when others then
        v_geometry_hold:=true;
        v_hold_reason:='invalid_source_geometry';
        v_geom:=null;
      end;
    end if;

    if v_source='pa_penndot_state_roads' then
      -- PennDOT uses -1 as a no-NLF sentinel in current state-road records. It
      -- must never become a shared identity key. Fall back to GPID then OBJECTID.
      v_internal_id:=coalesce(
        nullif(nullif(nullif(pg_catalog.btrim(v_props->>'NLF_ID'),''),'-1'),'0'),
        nullif(nullif(nullif(pg_catalog.btrim(v_props->>'GPID'),''),'-1'),'0'),
        v_props->>'OBJECTID'
      );
      v_identity_key_kind:=case
        when nullif(nullif(nullif(pg_catalog.btrim(v_props->>'NLF_ID'),''),'-1'),'0') is not null then 'NLF'
        when nullif(nullif(nullif(pg_catalog.btrim(v_props->>'GPID'),''),'-1'),'0') is not null then 'GPID'
        else 'OBJECTID' end;
      v_identity_key:='PA:PENNDOT:STATE:'||v_source_county||':'||v_identity_key_kind||':'||v_internal_id;
      v_source_name:=nullif(pg_catalog.btrim(v_props->>'STREET_NAM'),'');
      v_display:=coalesce(
        v_source_name,
        nullif(pg_catalog.btrim(v_props->>'STREET_N_1'),''),
        'PennDOT internal road '||v_internal_id
      );
      v_internal_route:=nullif(pg_catalog.btrim(v_props->>'T_RT_NO'),'');
      v_signed:=null;
      v_segment_key:='PA:PENNDOT:STATE:SEGMENT:'||(v_props->>'OBJECTID');
      v_access:=case when nullif(pg_catalog.btrim(v_props->>'SEG_STATUS'),'')='A'
        then 'public' else 'held' end;
      v_drivable:=case when nullif(pg_catalog.btrim(v_props->>'SEG_STATUS'),'')='A'
        then 'drivable' else 'held' end;
    else
      v_internal_id:=coalesce(
        nullif(nullif(nullif(v_props->>'LR_ID',''),'0'),'-1'),
        nullif(nullif(nullif(v_props->>'RS_ID',''),'0'),'-1'),
        nullif(nullif(nullif(v_props->>'ID',''),'0'),'-1'),
        nullif(nullif(nullif(v_props->>'LR_RT_NO',''),'0'),'-1'),
        v_props->>'OBJECTID'
      );
      v_identity_key:='PA:PENNDOT:LOCAL:'||v_source_county||':'
        ||coalesce(v_props->>'MUN_ID','UNKNOWN')||':'||v_internal_id||':'||coalesce(v_props->>'LR_RT_NO','UNKNOWN');
      v_source_name:=nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ',
        nullif(v_props->>'LR_NAME',''),nullif(v_props->>'LR_TYPE','')
      )), '');
      v_display:=coalesce(v_source_name,'PennDOT local road '||v_internal_id);
      v_internal_route:=nullif(pg_catalog.btrim(v_props->>'LR_RT_NO'),'');
      v_signed:=null;
      v_segment_key:='PA:PENNDOT:LOCAL:SEGMENT:'||(v_props->>'OBJECTID');
      -- Layer 3 is PennDOT's inventory of identified public roads not
      -- PennDOT-maintained. A missing display label is not access evidence.
      v_access:='public';
      v_drivable:='drivable';
    end if;

    if nullif(v_props->>'OBJECTID','') is null or nullif(v_internal_id,'') is null then
      continue;
    end if;

    v_source_access:=v_access;
    v_source_drivable:=v_drivable;
    if v_geometry_hold then
      v_access:='held';
      v_drivable:='held';
    end if;
    v_source_digest:=case when v_geometry_hold then
      pg_catalog.md5(v_props::text||coalesce(v_geometry_json::text,'null'))
    else
      pg_catalog.md5(v_props::text||extensions.st_asgeojson(v_geom,15))
    end;

    v_identity:=private_verification.brinesearch_issue97_uuid(v_identity_key);
    insert into public.brinesearch_authoritative_road_identities(
      id,dataset_id,source_identity_key,state_code,county_code,county_name,
      municipality,route_system,route_number,display_name,normalized_name,road_class,
      public_access_status,drivable_status,maintainer,surface,truck_status,
      source_record_ids,attributes,source_digest,source_timestamp,active,last_seen_at
    ) values (
      v_identity,v_dataset,v_identity_key,'PA',v_county,v_county_name,
      nullif(coalesce(v_props->>'MUNICIPAL1',v_props->>'MUNICIPAL_'),''),
      case when v_source='pa_penndot_state_roads' then 'PennDOT NLF' else 'PennDOT local LRS' end,
      v_internal_route,v_display,pg_catalog.regexp_replace(pg_catalog.lower(v_display),'[^a-z0-9]+',' ','g'),
      case when v_source='pa_penndot_state_roads' and (
          pg_catalog.upper(v_display) like 'RAMP %'
          or (v_internal_route ~ '^8[0-9]{3}$' and coalesce(v_props->>'FAC_TYPE','') in ('7','8','9'))
        ) then 'ramp'
        when v_source='pa_penndot_state_roads' then 'state_route' else 'local' end,
      v_access,v_drivable,'Pennsylvania Department of Transportation',
      nullif(coalesce(v_props->>'SURF_TYPE',v_props->>'SURFACE_TY'),''),
      case when coalesce(v_props->>'TRUCK_DAIL','0')<>'0' then 'truck_data_present' end,
      array[v_props->>'OBJECTID'],
      v_props||pg_catalog.jsonb_build_object(
        'issue97_identity_key_kind',coalesce(v_identity_key_kind,'LOCAL'),
        'issue97_source_geometry_hold',v_geometry_hold,
        'issue97_source_geometry_hold_reason',v_hold_reason
      ),
      v_source_digest,
      case when (coalesce(v_props->>'GIS_UPDATE',v_props->>'GIS_GEOMET')) ~ '^[0-9]+$'
        then pg_catalog.to_timestamp((coalesce(v_props->>'GIS_UPDATE',v_props->>'GIS_GEOMET'))::numeric/1000.0) end,
      true,now()
    ) on conflict(source_identity_key) do update set
      county_code=excluded.county_code,county_name=excluded.county_name,
      municipality=coalesce(excluded.municipality,public.brinesearch_authoritative_road_identities.municipality),
      route_system=excluded.route_system,
      route_number=coalesce(excluded.route_number,public.brinesearch_authoritative_road_identities.route_number),
      display_name=case when public.brinesearch_authoritative_road_identities.display_name like 'PennDOT % road %'
        then excluded.display_name else public.brinesearch_authoritative_road_identities.display_name end,
      normalized_name=case when public.brinesearch_authoritative_road_identities.display_name like 'PennDOT % road %'
        then excluded.normalized_name else public.brinesearch_authoritative_road_identities.normalized_name end,
      road_class=excluded.road_class,public_access_status=excluded.public_access_status,
      drivable_status=excluded.drivable_status,maintainer=excluded.maintainer,
      surface=coalesce(excluded.surface,public.brinesearch_authoritative_road_identities.surface),
      truck_status=coalesce(excluded.truck_status,public.brinesearch_authoritative_road_identities.truck_status),
      source_record_ids=array(select distinct x from unnest(
        public.brinesearch_authoritative_road_identities.source_record_ids||excluded.source_record_ids
      ) x),attributes=excluded.attributes,source_digest=excluded.source_digest,
      source_timestamp=excluded.source_timestamp,active=true,last_seen_at=now();

    -- Identifier-only fallbacks are useful identity labels, but they are not
    -- source-backed road names and must never seed search or name-change events.
    if v_source_name is not null then
      insert into public.brinesearch_authoritative_road_names(
        identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,
        source_segment_key,from_measure,to_measure,provenance
      ) values (
        v_identity,v_dataset,v_props->>'OBJECTID','official',v_source_name,
        pg_catalog.regexp_replace(pg_catalog.lower(v_source_name),'[^a-z0-9]+',' ','g'),v_segment_key,
        nullif(coalesce(v_props->>'NLF_CNTL_B',v_props->>'CUM_OFFSET'),'')::numeric/5280.0,
        nullif(coalesce(v_props->>'NLF_CNTL_E',v_props->>'CUM_OFFS_1'),'')::numeric/5280.0,
        pg_catalog.jsonb_build_object(
          'source_key',v_source,'internal_identity',v_internal_id,
          'identity_key_kind',coalesce(v_identity_key_kind,'LOCAL'),
          'measure_unit','mile','source_measure_unit','foot','attributes',v_props,
          'source_geometry_hold',v_geometry_hold,'source_geometry_hold_reason',v_hold_reason
        )
      ) on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update set
        source_segment_key=excluded.source_segment_key,from_measure=excluded.from_measure,
        to_measure=excluded.to_measure,provenance=excluded.provenance,
        active=true,last_seen_at=now(),updated_at=now();
    end if;

    if v_source='pa_penndot_state_roads' then
      if nullif(pg_catalog.btrim(v_props->>'STREET_N_1'),'') is not null then
        insert into public.brinesearch_authoritative_road_names(
          identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,source_segment_key,provenance
        ) values(v_identity,v_dataset,(v_props->>'OBJECTID')||':name1','local',pg_catalog.btrim(v_props->>'STREET_N_1'),
          pg_catalog.regexp_replace(pg_catalog.lower(v_props->>'STREET_N_1'),'[^a-z0-9]+',' ','g'),v_segment_key,
          pg_catalog.jsonb_build_object('field','STREET_N_1','source_key',v_source,
            'source_geometry_hold',v_geometry_hold,'source_geometry_hold_reason',v_hold_reason))
        on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update
          set source_segment_key=excluded.source_segment_key,provenance=excluded.provenance,
              active=true,last_seen_at=now(),updated_at=now();
      end if;
      if nullif(pg_catalog.btrim(v_props->>'STREET_N_2'),'') is not null then
        insert into public.brinesearch_authoritative_road_names(
          identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,source_segment_key,provenance
        ) values(v_identity,v_dataset,(v_props->>'OBJECTID')||':name2','local',pg_catalog.btrim(v_props->>'STREET_N_2'),
          pg_catalog.regexp_replace(pg_catalog.lower(v_props->>'STREET_N_2'),'[^a-z0-9]+',' ','g'),v_segment_key,
          pg_catalog.jsonb_build_object('field','STREET_N_2','source_key',v_source,
            'source_geometry_hold',v_geometry_hold,'source_geometry_hold_reason',v_hold_reason))
        on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update
          set source_segment_key=excluded.source_segment_key,provenance=excluded.provenance,
              active=true,last_seen_at=now(),updated_at=now();
      end if;
      for v_signed_index in 1..3 loop
        v_signed:=case
          when nullif(pg_catalog.btrim(v_props->>(v_signed_type_fields[v_signed_index])),'') is not null
           and nullif(pg_catalog.ltrim(pg_catalog.btrim(coalesce(
             v_props->>(v_signed_number_fields[v_signed_index]),''
           )),'0'),'') is not null
          then pg_catalog.upper(pg_catalog.btrim(v_props->>(v_signed_type_fields[v_signed_index])))||'-'
            ||pg_catalog.ltrim(pg_catalog.btrim(v_props->>(v_signed_number_fields[v_signed_index])),'0')
            ||coalesce(nullif(pg_catalog.btrim(coalesce(
              v_props->>(v_signed_suffix_fields[v_signed_index]),''
            )),''),'')
        end;
        if v_signed is not null then
          insert into public.brinesearch_authoritative_road_names(
            identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,
            source_segment_key,provenance
          ) values(
            v_identity,v_dataset,(v_props->>'OBJECTID')||':signed:'||v_signed_index,
            'signed',v_signed,
            pg_catalog.regexp_replace(pg_catalog.lower(v_signed),'[^a-z0-9]+',' ','g'),v_segment_key,
            pg_catalog.jsonb_build_object(
              'fields',pg_catalog.jsonb_build_array(
                v_signed_type_fields[v_signed_index],v_signed_number_fields[v_signed_index],
                v_signed_suffix_fields[v_signed_index]
              ),'explicitly_signed',true,'source_key',v_source,
              'source_geometry_hold',v_geometry_hold,'source_geometry_hold_reason',v_hold_reason
            )
          ) on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update
            set source_segment_key=excluded.source_segment_key,provenance=excluded.provenance,
                active=true,last_seen_at=now(),updated_at=now();
        end if;
      end loop;
      if v_internal_route is not null then
        insert into public.brinesearch_authoritative_road_names(
          identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,source_segment_key,provenance
        ) values(v_identity,v_dataset,(v_props->>'OBJECTID')||':internal','internal',v_internal_route,
          pg_catalog.regexp_replace(pg_catalog.lower(v_internal_route),'[^a-z0-9]+',' ','g'),v_segment_key,
          pg_catalog.jsonb_build_object('field','T_RT_NO','explicitly_signed',false,'source_key',v_source,
            'source_geometry_hold',v_geometry_hold,'source_geometry_hold_reason',v_hold_reason))
        on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update
          set source_segment_key=excluded.source_segment_key,provenance=excluded.provenance,
              active=true,last_seen_at=now(),updated_at=now();
      end if;
    end if;

    if v_geometry_hold then
      insert into private_verification.brinesearch_issue97_source_geometry_holds(
        id,dataset_id,identity_id,source_identity_key,state_code,county_code,county_name,
        source_record_id,source_label,hold_reason,source_attributes,source_geometry_zm,
        source_digest,source_timestamp,classified_public_access_status,classified_drivable_status,
        active,first_seen_at,last_seen_at,resolved_at,details
      ) values (
        private_verification.brinesearch_issue97_uuid(
          'source-geometry-hold:'||v_dataset::text||':PA:'||v_county||':'||(v_props->>'OBJECTID')
        ),v_dataset,v_identity,v_identity_key,'PA',v_county,v_county_name,
        v_props->>'OBJECTID',v_source_name,v_hold_reason,v_props,
        coalesce(v_geometry_json,'null'::jsonb),v_source_digest,
        case when (coalesce(v_props->>'GIS_UPDATE',v_props->>'GIS_GEOMET')) ~ '^[0-9]+$'
          then pg_catalog.to_timestamp((coalesce(v_props->>'GIS_UPDATE',v_props->>'GIS_GEOMET'))::numeric/1000.0) end,
        v_source_access,v_source_drivable,true,now(),now(),null,
        pg_catalog.jsonb_build_object(
          'source',case when v_source='pa_penndot_state_roads' then 'PennDOT state roads' else 'PennDOT local roads' end,
          'source_key',v_source,
          'topology_action','hold_without_graph_segment',
          'identity_key_kind',coalesce(v_identity_key_kind,'LOCAL'),
          'nlf_sentinel_ignored',v_source='pa_penndot_state_roads' and coalesce(v_props->>'NLF_ID','') in ('-1','0'),
          'name_used_for_resolution',false,
          'nearest_road_used',false,
          'source_vertex_invented',false
        )
      ) on conflict(dataset_id,state_code,county_code,source_record_id) do update set
        identity_id=excluded.identity_id,source_identity_key=excluded.source_identity_key,
        county_name=excluded.county_name,source_label=excluded.source_label,
        hold_reason=excluded.hold_reason,source_attributes=excluded.source_attributes,
        source_geometry_zm=excluded.source_geometry_zm,source_digest=excluded.source_digest,
        source_timestamp=excluded.source_timestamp,
        classified_public_access_status=excluded.classified_public_access_status,
        classified_drivable_status=excluded.classified_drivable_status,
        active=true,last_seen_at=now(),resolved_at=null,details=excluded.details;
      v_held_rows:=v_held_rows+1;
      v_rows:=v_rows+1;
      continue;
    end if;

    insert into public.brinesearch_authoritative_external_road_segments(
      id,dataset_id,identity_id,source_segment_key,source_record_id,state_code,
      county_code,county_name,municipality,from_measure,to_measure,route_direction,
      z_level,bridge_status,tunnel_status,public_access_status,drivable_status,
      geom,attributes,source_digest,source_timestamp,active,fetched_at
    ) values (
      private_verification.brinesearch_issue97_uuid(v_segment_key),v_dataset,v_identity,
      v_segment_key,v_props->>'OBJECTID','PA',v_county,v_county_name,
      nullif(coalesce(v_props->>'MUNICIPAL1',v_props->>'MUNICIPAL_'),''),
      nullif(coalesce(v_props->>'NLF_CNTL_B',v_props->>'CUM_OFFSET'),'')::numeric/5280.0,
      nullif(coalesce(v_props->>'NLF_CNTL_E',v_props->>'CUM_OFFS_1'),'')::numeric/5280.0,
      v_props->>'ROUTE_DIR',case when coalesce(v_props->>'ELEMENTLEV','')~'^-?[0-9]+$'
        then (v_props->>'ELEMENTLEV')::integer end,
      case when coalesce(v_props->>'IS_STRUCTU','0') not in ('0','')
          or coalesce(nullif(v_props->>'BRIDGE_COU',''),'0')::numeric>0 then 'bridge'
        when (v_props ? 'IS_STRUCTU' or v_props ? 'BRIDGE_COU') then 'surface' end,
      case when pg_catalog.upper(coalesce(v_props->>'TUNNEL_IND','')) in ('Y','1','TRUE') then 'tunnel'
        when pg_catalog.upper(coalesce(v_props->>'TUNNEL_IND','')) in ('N','0','FALSE') then 'surface' end,
      v_access,v_drivable,v_geom,v_props,v_source_digest,
      case when (coalesce(v_props->>'GIS_UPDATE',v_props->>'GIS_GEOMET')) ~ '^[0-9]+$'
        then pg_catalog.to_timestamp((coalesce(v_props->>'GIS_UPDATE',v_props->>'GIS_GEOMET'))::numeric/1000.0) end,
      true,now()
    ) on conflict(source_segment_key) do update set
      identity_id=excluded.identity_id,county_code=excluded.county_code,county_name=excluded.county_name,
      municipality=excluded.municipality,from_measure=excluded.from_measure,to_measure=excluded.to_measure,
      route_direction=excluded.route_direction,z_level=excluded.z_level,
      bridge_status=excluded.bridge_status,tunnel_status=excluded.tunnel_status,
      public_access_status=excluded.public_access_status,drivable_status=excluded.drivable_status,
      geom=excluded.geom,attributes=excluded.attributes,source_digest=excluded.source_digest,
      source_timestamp=excluded.source_timestamp,active=true,fetched_at=now();
    v_rows:=v_rows+1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'source',v_source,'county_code',v_county,'source_county_code',v_source_county,
    'offset',v_offset,'page_size',v_limit,'source_rows',v_source_rows,
    'rows',v_rows,'held_rows',v_held_rows,'rejected_rows',v_source_rows-v_rows,
    'has_more',v_has_more,
    'page_digest',pg_catalog.md5(coalesce((v_body->'features')::text,'[]'))
  );
end
$issue97_ingest_pa_page$;

revoke all on function public.brinesearch_issue97_ingest_pa_page(text,text,integer,integer)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_ingest_pa_page(text,text,integer,integer)
to service_role;

comment on function public.brinesearch_issue97_ingest_pa_page(text,text,integer,integer) is
  'Issue #97 PennDOT loader. NLF sentinel -1/0 never becomes a shared identity; GPID/OBJECTID is used instead. Valid simple road geometry becomes topology. Missing/empty/invalid/non-simple/unsupported state/local geometry is preserved as an explicit source hold with zero graph segment. At-grade nodes remain point-only and fail closed.';

-- Verify the composed runtime loader, not only source text.
do $issue97_verify_pa_hold_install$
declare
  v_loader text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_pa_page(text,text,integer,integer)'::pg_catalog.regprocedure
  ) into v_loader;
  if v_loader not ilike '%brinesearch_issue97_pa_geometry_hold_reason%'
     or v_loader not ilike '%source_geometry_holds%'
     or v_loader not ilike '%hold_without_graph_segment%'
     or v_loader not ilike '%nlf_sentinel_ignored%'
     or v_loader not ilike '%v_held_rows%'
     or v_loader not ilike '%GPID%'
     or v_loader not ilike '%source_vertex_invented%false%'
  then
    raise exception 'Issue #97 PA source geometry hold / NLF sentinel contract did not install cleanly';
  end if;
end
$issue97_verify_pa_hold_install$;
