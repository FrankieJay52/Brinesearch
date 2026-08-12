-- GitHub #97 — preserve PennDOT at-grade source rows whose point geometry is unusable.
--
-- At-grade records are authoritative evidence, but a missing/empty/invalid point
-- cannot be turned into a physical junction. Preserve the exact source row in a
-- private hold ledger, count it as accounted source coverage, emit no node, and
-- retire the hold automatically if a later source generation supplies a usable point.

create table if not exists private_verification.brinesearch_issue97_source_node_holds(
  id uuid primary key,
  dataset_id uuid not null references public.brinesearch_road_source_datasets(id),
  state_code text not null check(state_code='PA'),
  county_code text not null,
  county_name text,
  source_record_id text not null,
  source_node_key text not null,
  source_node_id text,
  source_label text,
  hold_reason text not null check(hold_reason in (
    'missing_source_geometry','empty_source_geometry','invalid_source_geometry','unsupported_source_geometry'
  )),
  source_attributes jsonb not null default '{}'::jsonb,
  source_geometry jsonb not null,
  source_digest text not null,
  source_timestamp timestamptz,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  unique(dataset_id,state_code,county_code,source_record_id)
);

create index if not exists brinesearch_issue97_source_node_holds_scope_active_idx
  on private_verification.brinesearch_issue97_source_node_holds(dataset_id,state_code,county_code,active);

revoke all on table private_verification.brinesearch_issue97_source_node_holds
from public,anon,authenticated;

grant select on table private_verification.brinesearch_issue97_source_node_holds
to service_role;

create or replace function private_verification.brinesearch_issue97_pa_node_hold_reason(
  p_geometry jsonb
)
returns text
language plpgsql
stable
security definer
set search_path=''
as $issue97_pa_node_hold_reason$
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
  if extensions.geometrytype(v_geom)<>'POINT' then
    return 'unsupported_source_geometry';
  end if;
  if not extensions.st_isvalid(v_geom)
     or not extensions.st_coveredby(v_geom,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
    return 'invalid_source_geometry';
  end if;
  return null;
end
$issue97_pa_node_hold_reason$;

revoke all on function private_verification.brinesearch_issue97_pa_node_hold_reason(jsonb)
from public,anon,authenticated;

-- Executable classifier regression.
do $issue97_pa_node_hold_regression$
declare
  v_good text;
  v_empty text;
  v_missing text;
  v_line text;
begin
  v_good:=private_verification.brinesearch_issue97_pa_node_hold_reason(
    '{"type":"Point","coordinates":[-80,40]}'::jsonb
  );
  v_empty:=private_verification.brinesearch_issue97_pa_node_hold_reason(
    '{"type":"Point","coordinates":[]}'::jsonb
  );
  v_missing:=private_verification.brinesearch_issue97_pa_node_hold_reason(null);
  v_line:=private_verification.brinesearch_issue97_pa_node_hold_reason(
    '{"type":"LineString","coordinates":[[-80,40],[-80.1,40.1]]}'::jsonb
  );
  if v_good is not null
     or v_empty is distinct from 'empty_source_geometry'
     or v_missing is distinct from 'missing_source_geometry'
     or v_line is distinct from 'unsupported_source_geometry' then
    raise exception 'Issue #97 PA at-grade node hold classifier regression failed';
  end if;
end
$issue97_pa_node_hold_regression$;

-- Patch only the at-grade branch of the already-hardened PA loader.
do $issue97_patch_pa_at_grade_loader$
declare
  v_loader text;
  v_original text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_pa_page(text,text,integer,integer)'::pg_catalog.regprocedure
  ) into v_loader;
  v_original:=v_loader;
  v_loader:=pg_catalog.replace(v_loader,$old$
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

$old$,$new$
    if v_source='pa_penndot_at_grade_intersections' then
      if nullif(v_props->>'OBJECTID','') is null then continue; end if;
      v_segment_key:='PA:PENNDOT:AT_GRADE:OCCURRENCE:'||(v_props->>'OBJECTID')
        ||':SCOPE:PA:'||v_county;
      v_hold_reason:=private_verification.brinesearch_issue97_pa_node_hold_reason(v_geometry_json);
      if v_hold_reason is not null then
        v_source_digest:=pg_catalog.md5(v_props::text||coalesce(v_geometry_json::text,'null'));
        insert into private_verification.brinesearch_issue97_source_node_holds(
          id,dataset_id,state_code,county_code,county_name,source_record_id,
          source_node_key,source_node_id,source_label,hold_reason,source_attributes,
          source_geometry,source_digest,source_timestamp,active,first_seen_at,last_seen_at,
          resolved_at,details
        ) values (
          private_verification.brinesearch_issue97_uuid(
            'source-node-hold:'||v_dataset::text||':PA:'||v_county||':'||(v_props->>'OBJECTID')
          ),v_dataset,'PA',v_county,v_county_name,v_props->>'OBJECTID',v_segment_key,
          nullif(v_props->>'NODE_ID',''),nullif(pg_catalog.btrim(v_props->>'STREET_NAM'),''),
          v_hold_reason,v_props,coalesce(v_geometry_json,'null'::jsonb),v_source_digest,
          case when coalesce(v_props->>'GIS_UPDATE',v_props->>'GIS_GEOMET')~'^[0-9]+$'
            then pg_catalog.to_timestamp(coalesce(v_props->>'GIS_UPDATE',v_props->>'GIS_GEOMET')::numeric/1000.0) end,
          true,now(),now(),null,
          pg_catalog.jsonb_build_object(
            'source','PennDOT at-grade intersections','source_key',v_source,
            'topology_action','hold_without_graph_node',
            'node_id',nullif(v_props->>'NODE_ID',''),
            'name_used_for_resolution',false,
            'nearest_road_used',false,
            'source_coordinate_invented',false
          )
        ) on conflict(dataset_id,state_code,county_code,source_record_id) do update set
          county_name=excluded.county_name,source_node_key=excluded.source_node_key,
          source_node_id=excluded.source_node_id,source_label=excluded.source_label,
          hold_reason=excluded.hold_reason,source_attributes=excluded.source_attributes,
          source_geometry=excluded.source_geometry,source_digest=excluded.source_digest,
          source_timestamp=excluded.source_timestamp,active=true,last_seen_at=now(),
          resolved_at=null,details=excluded.details;
        v_held_rows:=v_held_rows+1;
        v_rows:=v_rows+1;
        continue;
      end if;
      begin
        v_geom:=extensions.st_force2d(
          extensions.st_setsrid(extensions.st_geomfromgeojson(v_geometry_json::text),4326)
        );
      exception when others then
        raise exception 'Issue #97 PA at-grade classifier admitted unparsable geometry';
      end;
      -- NODE_ID identifies the physical intersection, not a source row. Layer
      -- 23 repeats it for every ordered participating route tuple and across
      -- some county scopes. Land each OBJECTID occurrence so multiway evidence
      -- is never overwritten by the last page or county.
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

$new$);
  if v_loader=v_original then
    raise exception 'Issue #97 PA at-grade loader patch target was not found';
  end if;
  execute v_loader;
end
$issue97_patch_pa_at_grade_loader$;

-- Patch finalization so stale node holds retire automatically and active node
-- holds participate in the immutable source content digest.
do $issue97_patch_pa_node_hold_finalizer$
declare
  v_finalizer text;
  v_original text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)'::pg_catalog.regprocedure
  ) into v_finalizer;
  v_original:=v_finalizer;

  v_finalizer:=pg_catalog.replace(v_finalizer,$old$
  if v_role='primary_network' and v_run.state_code in ('WV','PA') then
    update private_verification.brinesearch_issue97_source_geometry_holds h
    set active=false,resolved_at=now()
    where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code
      and h.county_code=v_run.county_code and h.active and h.last_seen_at<v_run.started_at;
    get diagnostics v_retired_source_holds=row_count;
  end if;

$old$,$new$
  if v_role='primary_network' and v_run.state_code in ('WV','PA') then
    update private_verification.brinesearch_issue97_source_geometry_holds h
    set active=false,resolved_at=now()
    where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code
      and h.county_code=v_run.county_code and h.active and h.last_seen_at<v_run.started_at;
    get diagnostics v_retired_source_holds=row_count;
  end if;

  if v_role='at_grade_nodes' and v_run.state_code='PA' then
    update private_verification.brinesearch_issue97_source_node_holds h
    set active=false,resolved_at=now()
    where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code
      and h.county_code=v_run.county_code and h.active and h.last_seen_at<v_run.started_at;
  end if;

$new$);

  v_finalizer:=pg_catalog.replace(v_finalizer,$old$
    union all select h.source_digest from private_verification.brinesearch_issue97_source_geometry_holds h where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code and h.county_code=v_run.county_code and h.active
    union all select n.source_digest from public.brinesearch_authoritative_road_nodes n where n.dataset_id=v_run.dataset_id and n.state_code=v_run.state_code and n.county_code=v_run.county_code and n.active
$old$,$new$
    union all select h.source_digest from private_verification.brinesearch_issue97_source_geometry_holds h where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code and h.county_code=v_run.county_code and h.active
    union all select nh.source_digest from private_verification.brinesearch_issue97_source_node_holds nh where nh.dataset_id=v_run.dataset_id and nh.state_code=v_run.state_code and nh.county_code=v_run.county_code and nh.active
    union all select n.source_digest from public.brinesearch_authoritative_road_nodes n where n.dataset_id=v_run.dataset_id and n.state_code=v_run.state_code and n.county_code=v_run.county_code and n.active
$new$);

  if v_finalizer=v_original then
    raise exception 'Issue #97 PA source-node hold finalizer patch targets were not found';
  end if;
  execute v_finalizer;
end
$issue97_patch_pa_node_hold_finalizer$;

revoke all on function public.brinesearch_issue97_ingest_pa_page(text,text,integer,integer)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_ingest_pa_page(text,text,integer,integer)
to service_role;

-- Verify the composed runtime functions contain the no-invention contract.
do $issue97_verify_pa_node_hold_install$
declare
  v_loader text;
  v_finalizer text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_pa_page(text,text,integer,integer)'::pg_catalog.regprocedure
  ) into v_loader;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)'::pg_catalog.regprocedure
  ) into v_finalizer;
  if v_loader not ilike '%brinesearch_issue97_pa_node_hold_reason%'
     or v_loader not ilike '%brinesearch_issue97_source_node_holds%'
     or v_loader not ilike '%hold_without_graph_node%'
     or v_loader not ilike '%source_coordinate_invented%false%'
     or v_finalizer not ilike '%brinesearch_issue97_source_node_holds%'
  then
    raise exception 'Issue #97 PA at-grade source-node hold contract did not install cleanly';
  end if;
end
$issue97_verify_pa_node_hold_install$;
