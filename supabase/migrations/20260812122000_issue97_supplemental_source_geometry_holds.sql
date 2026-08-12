-- GitHub #97 — preserve unusable supplemental source geometry without inventing centerlines.
--
-- Supplemental centerline feeds are alias/jurisdiction evidence only. A real source
-- feature may exist while its geometry is missing, empty, invalid, unsupported, or
-- non-simple. Such a row must count toward verified source coverage but must never
-- create a centerline, alias mapping, junction, or routing topology.

create table if not exists private_verification.brinesearch_issue97_supplemental_source_holds (
  id uuid primary key,
  dataset_id uuid not null references public.brinesearch_road_source_datasets(id),
  last_ingest_run_id uuid not null,
  state_code text not null,
  county_code text not null,
  source_record_id text not null,
  source_feature_key text not null,
  source_native_feature_key text not null,
  source_version text not null,
  hold_reason text not null,
  source_attributes jsonb not null default '{}'::jsonb,
  source_geometry jsonb,
  source_digest text not null,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint brinesearch_issue97_supplemental_source_holds_scope_unique
    unique(dataset_id,source_feature_key),
  constraint brinesearch_issue97_supplemental_source_holds_state_check
    check(state_code in ('OH','PA')),
  constraint brinesearch_issue97_supplemental_source_holds_reason_check
    check(hold_reason in (
      'missing_source_geometry','empty_source_geometry','invalid_source_geometry',
      'unsupported_source_geometry','non_simple_source_geometry_topology_unproven',
      'out_of_bounds_source_geometry'
    )),
  constraint brinesearch_issue97_supplemental_source_holds_run_scope_fkey
    foreign key(last_ingest_run_id,dataset_id,state_code,county_code)
    references public.brinesearch_road_source_ingest_runs(id,dataset_id,state_code,county_code)
);

create index if not exists brinesearch_issue97_supplemental_source_holds_scope_active_idx
  on private_verification.brinesearch_issue97_supplemental_source_holds(dataset_id,state_code,county_code,active);
create index if not exists brinesearch_issue97_supplemental_source_holds_run_idx
  on private_verification.brinesearch_issue97_supplemental_source_holds(last_ingest_run_id,active);

revoke all on private_verification.brinesearch_issue97_supplemental_source_holds
from public,anon,authenticated;
grant select,insert,update,delete on private_verification.brinesearch_issue97_supplemental_source_holds
to service_role;

create or replace function private_verification.brinesearch_issue97_supplemental_source_record_id(
  p_source_key text,
  p_props jsonb
)
returns text
language plpgsql
immutable
security definer
set search_path=''
as $issue97_supplemental_record_id$
declare
  v_value text;
begin
  v_value:=case p_source_key
    when 'oh_ogrip_lbrs_centerlines' then coalesce(p_props->>'objectid',p_props->>'OBJECTID')
    when 'pa_allegheny_ng911_centerlines' then p_props->>'OBJECTID'
    when 'pa_bradford_ng911_centerlines' then p_props->>'OBJECTID_12'
    when 'pa_butler_centerlines' then p_props->>'OBJECTID'
    when 'pa_fayette_ng911_centerlines' then p_props->>'OBJECTID_12'
    when 'pa_indiana_ng911_centerlines' then p_props->>'OBJECTID'
    when 'pa_washington_ng911_centerlines' then p_props->>'OBJECTID'
    else null end;
  return nullif(pg_catalog.regexp_replace(coalesce(v_value,''),'^[[:space:]]+|[[:space:]]+$','','g'),'');
end
$issue97_supplemental_record_id$;

create or replace function private_verification.brinesearch_issue97_supplemental_stable_feature_id(
  p_source_key text,
  p_source_version text,
  p_record_id text,
  p_props jsonb
)
returns text
language plpgsql
immutable
security definer
set search_path=''
as $issue97_supplemental_stable_id$
declare
  v_record text:=private_verification.brinesearch_issue97_supplemental_source_record_id(p_source_key,p_props);
  v_seg text:=nullif(pg_catalog.regexp_replace(coalesce(p_props->>'seg_id',''),'^[[:space:]]+|[[:space:]]+$','','g'),'');
begin
  if v_record is null then
    raise exception 'Supplemental source record id is required for stable feature identity' using errcode='22023';
  end if;
  if p_record_id is not null and v_record<>nullif(pg_catalog.regexp_replace(coalesce(p_record_id,''),'^[[:space:]]+|[[:space:]]+$','','g'),'') then
    raise exception 'Supplemental source record id changed during stable identity resolution' using errcode='22023';
  end if;
  return case p_source_key
    when 'oh_ogrip_lbrs_centerlines' then case
      when v_seg is not null and (v_seg like 'RCL_%' or v_seg like '%@%') then 'SEG:'||v_seg
      else 'OID:'||pg_catalog.btrim(p_source_version)||':'||v_record end
    when 'pa_allegheny_ng911_centerlines' then
      'FEATURE:'||private_verification.brinesearch_issue97_supplemental_native_feature_key(p_source_version,v_record,p_props->>'FEATURE_KE')
    when 'pa_bradford_ng911_centerlines' then
      'NGUID:'||private_verification.brinesearch_issue97_supplemental_native_feature_key(p_source_version,v_record,p_props->>'RCL_NGUID')
    when 'pa_butler_centerlines' then 'OID:'||pg_catalog.btrim(p_source_version)||':'||v_record
    when 'pa_fayette_ng911_centerlines' then
      'NGUID:'||private_verification.brinesearch_issue97_supplemental_native_feature_key(p_source_version,v_record,p_props->>'RCL_NGUID')
    when 'pa_indiana_ng911_centerlines' then
      'NGUID:'||private_verification.brinesearch_issue97_supplemental_native_feature_key(p_source_version,v_record,p_props->>'RCL_NGUID')
    when 'pa_washington_ng911_centerlines' then
      'NGUID:'||private_verification.brinesearch_issue97_supplemental_native_feature_key(p_source_version,v_record,p_props->>'RCL_NGUID')
    else null end;
end
$issue97_supplemental_stable_id$;

create or replace function private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(
  p_geometry jsonb
)
returns text
language plpgsql
stable
security definer
set search_path=''
as $issue97_supplemental_geometry_hold_reason$
declare
  v_geom extensions.geometry;
  v_type text;
begin
  if p_geometry is null or p_geometry='null'::jsonb then return 'missing_source_geometry'; end if;
  if pg_catalog.jsonb_typeof(p_geometry)<>'object' then return 'invalid_source_geometry'; end if;
  v_type:=coalesce(p_geometry->>'type','');
  if v_type not in ('LineString','MultiLineString') then return 'unsupported_source_geometry'; end if;
  if pg_catalog.jsonb_typeof(p_geometry->'coordinates')<>'array'
     or pg_catalog.jsonb_array_length(p_geometry->'coordinates')=0 then return 'empty_source_geometry'; end if;
  begin
    v_geom:=extensions.st_force2d(extensions.st_multi(extensions.st_collectionextract(
      extensions.st_setsrid(extensions.st_geomfromgeojson(p_geometry::text),4326),2
    )));
  exception when others then
    return 'invalid_source_geometry';
  end;
  if v_geom is null or extensions.st_isempty(v_geom) then return 'empty_source_geometry'; end if;
  if extensions.st_dimension(v_geom)<>1 then return 'unsupported_source_geometry'; end if;
  if not extensions.st_isvalid(v_geom) then return 'invalid_source_geometry'; end if;
  if not extensions.st_issimple(v_geom) then return 'non_simple_source_geometry_topology_unproven'; end if;
  if not extensions.st_coveredby(v_geom,extensions.st_makeenvelope(-180,-90,180,90,4326)) then return 'out_of_bounds_source_geometry'; end if;
  return null;
end
$issue97_supplemental_geometry_hold_reason$;

revoke all on function private_verification.brinesearch_issue97_supplemental_source_record_id(text,jsonb)
from public,anon,authenticated;
revoke all on function private_verification.brinesearch_issue97_supplemental_stable_feature_id(text,text,text,jsonb)
from public,anon,authenticated;
revoke all on function private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(jsonb)
from public,anon,authenticated;

-- Executable source-hold regressions.
do $issue97_supplemental_hold_regression$
declare
  v_empty text;
  v_simple text;
  v_bowtie text;
  v_record text;
  v_stable text;
begin
  v_empty:=private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(
    '{"type":"LineString","coordinates":[]}'::jsonb);
  v_simple:=private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(
    '{"type":"LineString","coordinates":[[-76.1,41.9],[-76.0,41.8]]}'::jsonb);
  v_bowtie:=private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(
    '{"type":"LineString","coordinates":[[0,0],[1,1],[0,1],[1,0]]}'::jsonb);
  v_record:=private_verification.brinesearch_issue97_supplemental_source_record_id(
    'pa_bradford_ng911_centerlines','{"OBJECTID_12":" 9162 ","RCL_NGUID":" "}'::jsonb);
  v_stable:=private_verification.brinesearch_issue97_supplemental_stable_feature_id(
    'pa_bradford_ng911_centerlines','2025_11',v_record,
    '{"OBJECTID_12":" 9162 ","RCL_NGUID":" "}'::jsonb);
  if v_empty<>'empty_source_geometry' or v_simple is not null
     or v_bowtie<>'non_simple_source_geometry_topology_unproven'
     or v_record<>'9162' or v_stable<>'NGUID:2025_11:9162' then
    raise exception 'Issue #97 supplemental source-hold regression failed: %, %, %, %, %',
      v_empty,v_simple,v_bowtie,v_record,v_stable;
  end if;
end
$issue97_supplemental_hold_regression$;

-- Patch the current supplemental loader so source identity is resolved before
-- geometry classification and unusable source geometry becomes an explicit hold.
do $issue97_patch_supplemental_loader_holds$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer)'::pg_catalog.regprocedure
  ) into v_definition;

  v_old:=E'  v_feature_key text;\n  v_name text;\n  v_names jsonb;\n  v_rows integer:=0;';
  v_new:=E'  v_feature_key text;\n  v_name text;\n  v_names jsonb;\n  v_geometry_json jsonb;\n  v_hold_reason text;\n  v_held_rows integer:=0;\n  v_rows integer:=0;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 supplemental hold declaration patch expected 1 target, found %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    v_props:=v_feature->''properties'';\n    if v_feature->''geometry'' is null then continue; end if;';
  v_new:=E'    v_props:=v_feature->''properties'';\n    v_record_id:=private_verification.brinesearch_issue97_supplemental_source_record_id(v_run.source_key,v_props);\n    if v_record_id is null then continue; end if;\n    v_stable_id:=private_verification.brinesearch_issue97_supplemental_stable_feature_id(v_run.source_key,v_run.source_version,v_record_id,v_props);\n    v_feature_key:=v_run.source_key||'':''||v_stable_id||'':SCOPE:''||v_run.state_code||'':''||v_run.county_code;\n    v_geometry_json:=v_feature->''geometry'';\n    v_hold_reason:=private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(v_geometry_json);\n    if v_hold_reason is not null then\n      insert into private_verification.brinesearch_issue97_supplemental_source_holds(\n        id,dataset_id,last_ingest_run_id,state_code,county_code,source_record_id,\n        source_feature_key,source_native_feature_key,source_version,hold_reason,\n        source_attributes,source_geometry,source_digest,active,first_seen_at,last_seen_at,resolved_at\n      ) values (\n        private_verification.brinesearch_issue97_uuid(''supplemental-source-hold:''||v_run.dataset_id::text||'':''||v_feature_key),\n        v_run.dataset_id,p_run_id,v_run.state_code,v_run.county_code,v_record_id,\n        v_feature_key,v_run.source_key||'':''||v_stable_id,v_run.source_version,v_hold_reason,\n        v_props,v_geometry_json,pg_catalog.md5(v_props::text||coalesce(v_geometry_json::text,''null'')),\n        true,now(),now(),null\n      ) on conflict(dataset_id,source_feature_key) do update set\n        last_ingest_run_id=excluded.last_ingest_run_id,state_code=excluded.state_code,county_code=excluded.county_code,\n        source_record_id=excluded.source_record_id,source_native_feature_key=excluded.source_native_feature_key,\n        source_version=excluded.source_version,hold_reason=excluded.hold_reason,source_attributes=excluded.source_attributes,\n        source_geometry=excluded.source_geometry,source_digest=excluded.source_digest,active=true,last_seen_at=now(),resolved_at=null;\n      v_held_rows:=v_held_rows+1;\n      v_rows:=v_rows+1;\n      continue;\n    end if;\n    if v_feature->''geometry'' is null then raise exception ''Supplemental geometry classifier/materializer mismatch for source record %'',v_record_id; end if;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 supplemental hold insertion patch expected 1 target, found %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    exception when others then continue;\n    end;\n    if v_geom is null or extensions.st_isempty(v_geom) or extensions.st_dimension(v_geom)<>1\n       or not extensions.st_isvalid(v_geom) then continue; end if;';
  v_new:=E'    exception when others then\n      raise exception ''Supplemental geometry passed hold classifier but failed materialization for source record %'',v_record_id;\n    end;\n    if v_geom is null or extensions.st_isempty(v_geom) or extensions.st_dimension(v_geom)<>1\n       or not extensions.st_isvalid(v_geom) then\n      raise exception ''Supplemental geometry passed hold classifier but failed post-materialization validation for source record %'',v_record_id;\n    end if;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 supplemental materialization fail-closed patch expected 1 target, found %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    ''page_size'',v_limit,''source_rows'',v_source_rows,''rows'',v_rows,\n    ''rejected_rows'',v_source_rows-v_rows,''has_more'',v_has_more,';
  v_new:=E'    ''page_size'',v_limit,''source_rows'',v_source_rows,''rows'',v_rows,''held_rows'',v_held_rows,\n    ''rejected_rows'',v_source_rows-v_rows,''has_more'',v_has_more,';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 supplemental held-row result patch expected 1 target, found %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  execute v_definition;
end
$issue97_patch_supplemental_loader_holds$;

-- Extend supplemental accounting from centerlines-only to centerlines + held rows,
-- retire stale holds after the new generation is proven complete, and include
-- active hold digests in the immutable source content receipt.
do $issue97_patch_supplemental_hold_finalizer$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)'::pg_catalog.regprocedure
  ) into v_definition;

  v_old:=E'  v_materialized_supplemental_features integer:=0;\n  v_supplemental_feature_accounting_verified boolean:=false;';
  v_new:=E'  v_materialized_supplemental_features integer:=0;\n  v_held_supplemental_features integer:=0;\n  v_retired_supplemental_source_holds integer:=0;\n  v_supplemental_feature_accounting_verified boolean:=false;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 supplemental hold finalizer declaration target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'      and c.last_ingest_run_id=p_run_id;\n\n    if v_materialized_supplemental_features<>coalesce(p_ingested_row_count,-1) then';
  v_new:=E'      and c.last_ingest_run_id=p_run_id;\n    select count(*)::integer into v_held_supplemental_features\n    from private_verification.brinesearch_issue97_supplemental_source_holds h\n    where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code\n      and h.county_code=v_run.county_code and h.active and h.last_ingest_run_id=p_run_id;\n\n    if v_materialized_supplemental_features+v_held_supplemental_features<>coalesce(p_ingested_row_count,-1) then';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 supplemental hold accounting gate target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'          ''materialized_supplemental_feature_count'',v_materialized_supplemental_features,\n          ''failure'',''supplemental source feature identity/materialization count mismatch''';
  v_new:=E'          ''materialized_supplemental_feature_count'',v_materialized_supplemental_features,\n          ''held_supplemental_feature_count'',v_held_supplemental_features,\n          ''failure'',''supplemental source feature identity/materialization count mismatch''';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 supplemental hold failure details target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'        ''materialized_supplemental_feature_count'',v_materialized_supplemental_features,\n        ''source_feature_accounting_verified'',false';
  v_new:=E'        ''materialized_supplemental_feature_count'',v_materialized_supplemental_features,\n        ''held_supplemental_feature_count'',v_held_supplemental_features,\n        ''source_feature_accounting_verified'',false';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 supplemental hold failure return target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    v_supplemental_feature_accounting_verified:=true;\n  end if;\n\n  perform pg_catalog.pg_advisory_xact_lock(';
  v_new:=E'    v_supplemental_feature_accounting_verified:=true;\n  end if;\n\n  if v_role=''supplemental_aliases'' then\n    update private_verification.brinesearch_issue97_supplemental_source_holds h\n    set active=false,resolved_at=now()\n    where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code\n      and h.county_code=v_run.county_code and h.active and h.last_ingest_run_id is distinct from p_run_id;\n    get diagnostics v_retired_supplemental_source_holds=row_count;\n  end if;\n\n  perform pg_catalog.pg_advisory_xact_lock(';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 supplemental stale-hold retirement target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:='select c.source_digest as digest from public.brinesearch_authoritative_supplemental_centerlines c where c.dataset_id=v_run.dataset_id and c.state_code=v_run.state_code and c.county_code=v_run.county_code and c.active';
  v_new:=v_old||E'\n    union all select sh.source_digest from private_verification.brinesearch_issue97_supplemental_source_holds sh where sh.dataset_id=v_run.dataset_id and sh.state_code=v_run.state_code and sh.county_code=v_run.county_code and sh.active';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 supplemental hold digest target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'      ''materialized_supplemental_feature_count'',case when v_role=''supplemental_aliases'' then v_materialized_supplemental_features else null end,\n      ''source_feature_accounting_verified'',case when v_role=''supplemental_aliases'' then v_supplemental_feature_accounting_verified else null end';
  v_new:=E'      ''materialized_supplemental_feature_count'',case when v_role=''supplemental_aliases'' then v_materialized_supplemental_features else null end,\n      ''held_supplemental_feature_count'',case when v_role=''supplemental_aliases'' then v_held_supplemental_features else null end,\n      ''retired_supplemental_source_holds'',case when v_role=''supplemental_aliases'' then v_retired_supplemental_source_holds else null end,\n      ''source_feature_accounting_verified'',case when v_role=''supplemental_aliases'' then v_supplemental_feature_accounting_verified else null end';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 supplemental hold success details target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    ''active_source_geometry_holds'',v_active_source_holds,\n    ''content_digest'',v_content_digest';
  v_new:=E'    ''active_source_geometry_holds'',v_active_source_holds,\n    ''held_supplemental_feature_count'',case when v_role=''supplemental_aliases'' then v_held_supplemental_features else null end,\n    ''retired_supplemental_source_holds'',case when v_role=''supplemental_aliases'' then v_retired_supplemental_source_holds else null end,\n    ''content_digest'',v_content_digest';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 supplemental hold success return target changed: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  execute v_definition;
end
$issue97_patch_supplemental_hold_finalizer$;

-- Composed runtime proof: holds must be counted as ingested source rows, have no
-- geometry materialization path, participate in final accounting and digests,
-- and retire when the next official generation repairs/removes them.
do $issue97_verify_supplemental_source_holds$
declare
  v_loader text;
  v_finalizer text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer)'::pg_catalog.regprocedure
  ) into v_loader;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)'::pg_catalog.regprocedure
  ) into v_finalizer;
  if v_loader not like '%brinesearch_issue97_supplemental_source_holds%'
     or v_loader not like '%v_held_rows:=v_held_rows+1%'
     or v_loader not like '%v_rows:=v_rows+1%'
     or v_loader not like '%supplemental_geometry_hold_reason%'
     or v_loader not like '%''held_rows'',v_held_rows%'
     or v_finalizer not like '%v_materialized_supplemental_features+v_held_supplemental_features%'
     or v_finalizer not like '%held_supplemental_feature_count%'
     or v_finalizer not like '%retired_supplemental_source_holds%'
     or v_finalizer not like '%brinesearch_issue97_supplemental_source_holds sh%'
  then
    raise exception 'Issue #97 supplemental source-hold contract did not install cleanly';
  end if;
end
$issue97_verify_supplemental_source_holds$;

comment on table private_verification.brinesearch_issue97_supplemental_source_holds is
  'Issue #97 private source receipt for supplemental alias/jurisdiction features whose authoritative geometry cannot safely materialize. Held rows count toward source coverage but never create centerlines, mappings, aliases, junctions, or route topology.';
