-- GitHub #97 — preserve unusable official supplemental centerline source rows
-- without inventing geometry or silently dropping source coverage.
--
-- Bradford County current PASDA source row OBJECTID_12=9162 proves the need:
-- the official row is a LineString with an empty coordinate array. The existing
-- supplemental centerline table correctly requires real line geometry, but the
-- page loader previously had no raw-source hold lane and therefore rejected the
-- required page.
--
-- This migration mirrors the existing road/node source-hold architecture:
--   * unusable source geometry is stored verbatim in a private hold ledger;
--   * the row counts as an accounted source feature but emits no centerline,
--     aliases, mappings, nodes, junctions, or graph topology;
--   * supplemental finalization proves centerlines + source holds = ingested rows;
--   * stale holds retire automatically when a later source generation fixes or
--     removes the official row;
--   * hold digests participate in immutable scope/dataset freshness.
--
-- No fuzzy/name/nearest-road matching, ST_Node, ST_MakeValid, or invented source
-- coordinates are introduced.

create table if not exists private_verification.brinesearch_issue97_supplemental_source_holds (
  id uuid primary key,
  dataset_id uuid not null references public.brinesearch_road_source_datasets(id),
  state_code text not null,
  county_code text not null,
  county_name text,
  source_record_id text not null,
  source_feature_key text not null,
  source_native_feature_key text not null,
  hold_reason text not null,
  source_attributes jsonb not null default '{}'::jsonb,
  source_geometry jsonb not null default 'null'::jsonb,
  source_digest text not null,
  source_timestamp timestamptz,
  last_ingest_run_id uuid not null,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  constraint brinesearch_issue97_supp_source_holds_scope_record_unique
    unique(dataset_id,state_code,county_code,source_record_id),
  constraint brinesearch_issue97_supp_source_holds_feature_unique
    unique(dataset_id,state_code,county_code,source_feature_key),
  constraint brinesearch_issue97_supp_source_holds_state_check
    check(state_code in ('OH','PA')),
  constraint brinesearch_issue97_supp_source_holds_reason_check
    check(hold_reason in (
      'missing_source_geometry','empty_source_geometry',
      'invalid_source_geometry','unsupported_source_geometry'
    )),
  constraint brinesearch_issue97_supp_source_holds_run_scope_fkey
    foreign key(last_ingest_run_id,dataset_id,state_code,county_code)
    references public.brinesearch_road_source_ingest_runs(id,dataset_id,state_code,county_code)
);

create index if not exists brinesearch_issue97_supp_source_holds_scope_active_idx
  on private_verification.brinesearch_issue97_supplemental_source_holds(
    dataset_id,state_code,county_code,active
  );
create index if not exists brinesearch_issue97_supp_source_holds_run_idx
  on private_verification.brinesearch_issue97_supplemental_source_holds(last_ingest_run_id,active);

revoke all on private_verification.brinesearch_issue97_supplemental_source_holds
from public,anon,authenticated;
grant select,insert,update,delete
on private_verification.brinesearch_issue97_supplemental_source_holds
to service_role;

create or replace function private_verification.brinesearch_issue97_supplemental_source_record_id(
  p_source_key text,
  p_properties jsonb
)
returns text
language plpgsql
immutable
security definer
set search_path=''
as $issue97_supp_source_record_id$
declare
  v_record text;
begin
  v_record:=case p_source_key
    when 'oh_ogrip_lbrs_centerlines' then coalesce(p_properties->>'objectid',p_properties->>'OBJECTID')
    when 'pa_allegheny_ng911_centerlines' then p_properties->>'OBJECTID'
    when 'pa_bradford_ng911_centerlines' then p_properties->>'OBJECTID_12'
    when 'pa_butler_centerlines' then p_properties->>'OBJECTID'
    when 'pa_fayette_ng911_centerlines' then p_properties->>'OBJECTID_12'
    when 'pa_indiana_ng911_centerlines' then p_properties->>'OBJECTID'
    when 'pa_washington_ng911_centerlines' then p_properties->>'OBJECTID'
    else null
  end;
  return nullif(pg_catalog.btrim(v_record),'');
end
$issue97_supp_source_record_id$;

revoke all on function private_verification.brinesearch_issue97_supplemental_source_record_id(text,jsonb)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_supplemental_source_record_id(text,jsonb)
to service_role;

create or replace function private_verification.brinesearch_issue97_supplemental_source_stable_id(
  p_source_key text,
  p_source_version text,
  p_record_id text,
  p_properties jsonb
)
returns text
language plpgsql
immutable
security definer
set search_path=''
as $issue97_supp_source_stable_id$
declare
  v_record text:=nullif(pg_catalog.btrim(p_record_id),'');
  v_seg text;
begin
  if v_record is null then return null; end if;
  case p_source_key
    when 'oh_ogrip_lbrs_centerlines' then
      v_seg:=nullif(p_properties->>'seg_id','');
      if v_seg is not null and (v_seg like 'RCL_%' or v_seg like '%@%') then
        return 'SEG:'||v_seg;
      end if;
      return 'OID:'||p_source_version||':'||v_record;
    when 'pa_allegheny_ng911_centerlines' then
      return 'FEATURE:'||private_verification.brinesearch_issue97_supplemental_native_feature_key(
        p_source_version,v_record,p_properties->>'FEATURE_KE'
      );
    when 'pa_bradford_ng911_centerlines' then
      return 'NGUID:'||private_verification.brinesearch_issue97_supplemental_native_feature_key(
        p_source_version,v_record,p_properties->>'RCL_NGUID'
      );
    when 'pa_butler_centerlines' then
      return 'OID:'||p_source_version||':'||v_record;
    when 'pa_fayette_ng911_centerlines' then
      return 'NGUID:'||private_verification.brinesearch_issue97_supplemental_native_feature_key(
        p_source_version,v_record,p_properties->>'RCL_NGUID'
      );
    when 'pa_indiana_ng911_centerlines' then
      return 'NGUID:'||private_verification.brinesearch_issue97_supplemental_native_feature_key(
        p_source_version,v_record,p_properties->>'RCL_NGUID'
      );
    when 'pa_washington_ng911_centerlines' then
      return 'NGUID:'||private_verification.brinesearch_issue97_supplemental_native_feature_key(
        p_source_version,v_record,p_properties->>'RCL_NGUID'
      );
    else
      return null;
  end case;
end
$issue97_supp_source_stable_id$;

revoke all on function private_verification.brinesearch_issue97_supplemental_source_stable_id(text,text,text,jsonb)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_supplemental_source_stable_id(text,text,text,jsonb)
to service_role;

create or replace function private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(
  p_geometry jsonb
)
returns text
language plpgsql
stable
security definer
set search_path=''
as $issue97_supp_geometry_hold_reason$
declare
  v_geom extensions.geometry;
  v_type text;
begin
  if p_geometry is null or p_geometry='null'::jsonb then
    return 'missing_source_geometry';
  end if;
  if pg_catalog.jsonb_typeof(p_geometry)<>'object' then
    return 'invalid_source_geometry';
  end if;
  v_type:=p_geometry->>'type';
  if v_type not in ('LineString','MultiLineString') then
    return 'unsupported_source_geometry';
  end if;
  begin
    v_geom:=extensions.st_force2d(extensions.st_multi(extensions.st_collectionextract(
      extensions.st_setsrid(extensions.st_geomfromgeojson(p_geometry::text),4326),2
    )));
  exception when others then
    return 'invalid_source_geometry';
  end;
  if v_geom is null or extensions.st_isempty(v_geom) then
    return 'empty_source_geometry';
  end if;
  if extensions.st_dimension(v_geom)<>1 then
    return 'unsupported_source_geometry';
  end if;
  if not extensions.st_isvalid(v_geom) then
    return 'invalid_source_geometry';
  end if;
  if not extensions.st_coveredby(v_geom,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
    return 'invalid_source_geometry';
  end if;
  return null;
end
$issue97_supp_geometry_hold_reason$;

revoke all on function private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(jsonb)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(jsonb)
to service_role;

-- Synthetic proof: valid line is routable supplemental evidence; empty, missing,
-- unsupported, and malformed geometries are explicit source holds.
do $issue97_supp_source_hold_regression$
declare
  v_valid text;
  v_empty text;
  v_missing text;
  v_point text;
  v_bad text;
  v_bradford_record text;
  v_bradford_stable text;
begin
  v_valid:=private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(
    '{"type":"LineString","coordinates":[[-80,40],[-80.1,40.1]]}'::jsonb
  );
  v_empty:=private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(
    '{"type":"LineString","coordinates":[]}'::jsonb
  );
  v_missing:=private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(null);
  v_point:=private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(
    '{"type":"Point","coordinates":[-80,40]}'::jsonb
  );
  v_bad:=private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(
    '{"type":"LineString","coordinates":"bad"}'::jsonb
  );
  v_bradford_record:=private_verification.brinesearch_issue97_supplemental_source_record_id(
    'pa_bradford_ng911_centerlines',pg_catalog.jsonb_build_object('OBJECTID_12',' 9162 ')
  );
  v_bradford_stable:=private_verification.brinesearch_issue97_supplemental_source_stable_id(
    'pa_bradford_ng911_centerlines','2025_11',v_bradford_record,
    pg_catalog.jsonb_build_object('RCL_NGUID',' ')
  );

  if v_valid is not null
     or v_empty<>'empty_source_geometry'
     or v_missing<>'missing_source_geometry'
     or v_point<>'unsupported_source_geometry'
     or v_bad<>'invalid_source_geometry'
     or v_bradford_record<>'9162'
     or v_bradford_stable<>'NGUID:2025_11:9162' then
    raise exception 'Issue #97 supplemental source-hold regression failed: %, %, %, %, %, %, %',
      v_valid,v_empty,v_missing,v_point,v_bad,v_bradford_record,v_bradford_stable;
  end if;
end
$issue97_supp_source_hold_regression$;

-- Patch the current supplemental page loader compositionally. The existing
-- valid-geometry path is left unchanged. We classify and account source holds
-- immediately after reading source properties, before the old geometry rejection.
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

  v_old:=E'  v_names jsonb;\n  v_rows integer:=0;';
  v_new:=E'  v_names jsonb;\n  v_hold_reason text;\n  v_hold_record_id text;\n  v_hold_stable_id text;\n  v_hold_feature_key text;\n  v_held_rows integer:=0;\n  v_rows integer:=0;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental hold declaration patch expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    v_props:=v_feature->''properties'';\n    if v_feature->''geometry'' is null then continue; end if;';
  v_new:=E'    v_props:=v_feature->''properties'';\n    v_hold_reason:=private_verification.brinesearch_issue97_supplemental_geometry_hold_reason(v_feature->''geometry'');\n    if v_hold_reason is not null then\n      v_hold_record_id:=private_verification.brinesearch_issue97_supplemental_source_record_id(v_run.source_key,v_props);\n      if v_hold_record_id is null then continue; end if;\n      v_hold_stable_id:=private_verification.brinesearch_issue97_supplemental_source_stable_id(\n        v_run.source_key,v_run.source_version,v_hold_record_id,v_props\n      );\n      if v_hold_stable_id is null then continue; end if;\n      v_hold_feature_key:=v_run.source_key||'':''||v_hold_stable_id||'':SCOPE:''||\n        v_run.state_code||'':''||v_run.county_code;\n      insert into private_verification.brinesearch_issue97_supplemental_source_holds(\n        id,dataset_id,state_code,county_code,county_name,source_record_id,\n        source_feature_key,source_native_feature_key,hold_reason,source_attributes,\n        source_geometry,source_digest,source_timestamp,last_ingest_run_id,active,\n        first_seen_at,last_seen_at,resolved_at,details\n      ) values (\n        private_verification.brinesearch_issue97_uuid(\n          ''supplemental-source-hold:''||v_run.dataset_id::text||'':''||v_run.state_code||'':''||v_run.county_code||'':''||v_hold_record_id\n        ),v_run.dataset_id,v_run.state_code,v_run.county_code,\n        (select county_name from public.brinesearch_road_graph_counties\n          where state_code=v_run.state_code and county_code=v_run.county_code),\n        v_hold_record_id,v_hold_feature_key,v_run.source_key||'':''||v_hold_stable_id,\n        v_hold_reason,v_props,coalesce(v_feature->''geometry'',''null''::jsonb),\n        pg_catalog.md5(v_props::text||coalesce((v_feature->''geometry'')::text,''null'')),\n        case when coalesce(v_props->>''DateUpdate'',v_props->>''DATEMODIFI'')~''^[0-9]+$''\n          then pg_catalog.to_timestamp(coalesce(v_props->>''DateUpdate'',v_props->>''DATEMODIFI'')::numeric/1000.0) end,\n        p_run_id,true,now(),now(),null,pg_catalog.jsonb_build_object(\n          ''topology_action'',''hold_without_centerline_geometry'',\n          ''name_used_for_resolution'',false,''nearest_road_used'',false,\n          ''source_coordinate_invented'',false,''source_geometry_rewritten'',false\n        )\n      ) on conflict(dataset_id,state_code,county_code,source_record_id) do update set\n        county_name=excluded.county_name,source_feature_key=excluded.source_feature_key,\n        source_native_feature_key=excluded.source_native_feature_key,hold_reason=excluded.hold_reason,\n        source_attributes=excluded.source_attributes,source_geometry=excluded.source_geometry,\n        source_digest=excluded.source_digest,source_timestamp=excluded.source_timestamp,\n        last_ingest_run_id=excluded.last_ingest_run_id,active=true,last_seen_at=now(),\n        resolved_at=null,details=excluded.details;\n      v_held_rows:=v_held_rows+1;\n      v_rows:=v_rows+1;\n      continue;\n    end if;\n    if v_feature->''geometry'' is null then continue; end if;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental hold classifier patch expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    ''page_size'',v_limit,''source_rows'',v_source_rows,''rows'',v_rows,\n    ''rejected_rows'',v_source_rows-v_rows,''has_more'',v_has_more,';
  v_new:=E'    ''page_size'',v_limit,''source_rows'',v_source_rows,''rows'',v_rows,\n    ''held_rows'',v_held_rows,''rejected_rows'',v_source_rows-v_rows,''has_more'',v_has_more,';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental held-row result patch expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  execute v_definition;
end
$issue97_patch_supplemental_loader_holds$;

-- Finalizer accounting: a supplemental source feature is accounted when it is
-- either materialized as real centerline geometry OR stored as a current-run
-- source hold. Old holds retire before the completed scope digest is calculated.
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
  v_new:=E'  v_materialized_supplemental_features integer:=0;\n  v_held_supplemental_source_features integer:=0;\n  v_retired_supplemental_source_holds integer:=0;\n  v_supplemental_feature_accounting_verified boolean:=false;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental finalizer hold declarations expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'      and c.last_ingest_run_id=p_run_id;\n\n    if v_materialized_supplemental_features<>coalesce(p_ingested_row_count,-1) then';
  v_new:=E'      and c.last_ingest_run_id=p_run_id;\n    select count(*)::integer into v_held_supplemental_source_features\n    from private_verification.brinesearch_issue97_supplemental_source_holds h\n    where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code\n      and h.county_code=v_run.county_code and h.active\n      and h.last_ingest_run_id=p_run_id;\n\n    if v_materialized_supplemental_features+v_held_supplemental_source_features<>coalesce(p_ingested_row_count,-1) then';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental finalizer accounted-row gate expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'          ''materialized_supplemental_feature_count'',v_materialized_supplemental_features,\n          ''failure'',''supplemental source feature identity/materialization count mismatch''';
  v_new:=E'          ''materialized_supplemental_feature_count'',v_materialized_supplemental_features,\n          ''held_supplemental_source_feature_count'',v_held_supplemental_source_features,\n          ''accounted_supplemental_source_feature_count'',v_materialized_supplemental_features+v_held_supplemental_source_features,\n          ''failure'',''supplemental source feature identity/materialization count mismatch''';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental failure receipt hold metrics expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'        ''materialized_supplemental_feature_count'',v_materialized_supplemental_features,\n        ''source_feature_accounting_verified'',false';
  v_new:=E'        ''materialized_supplemental_feature_count'',v_materialized_supplemental_features,\n        ''held_supplemental_source_feature_count'',v_held_supplemental_source_features,\n        ''accounted_supplemental_source_feature_count'',v_materialized_supplemental_features+v_held_supplemental_source_features,\n        ''source_feature_accounting_verified'',false';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental failure return hold metrics expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'  if v_source in (\n    ''oh_ogrip_lbrs_centerlines'',';
  v_new:=E'  if v_role=''supplemental_aliases'' then\n    update private_verification.brinesearch_issue97_supplemental_source_holds h\n    set active=false,resolved_at=now()\n    where h.dataset_id=v_run.dataset_id and h.state_code=v_run.state_code\n      and h.county_code=v_run.county_code and h.active\n      and h.last_ingest_run_id is distinct from p_run_id;\n    get diagnostics v_retired_supplemental_source_holds=row_count;\n  end if;\n\n  if v_source in (\n    ''oh_ogrip_lbrs_centerlines'',';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental stale-hold retirement expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    select c.source_digest as digest from public.brinesearch_authoritative_supplemental_centerlines c where c.dataset_id=v_run.dataset_id and c.state_code=v_run.state_code and c.county_code=v_run.county_code and c.active\n    union all select s.source_digest';
  v_new:=E'    select c.source_digest as digest from public.brinesearch_authoritative_supplemental_centerlines c where c.dataset_id=v_run.dataset_id and c.state_code=v_run.state_code and c.county_code=v_run.county_code and c.active\n    union all select sh.source_digest from private_verification.brinesearch_issue97_supplemental_source_holds sh where sh.dataset_id=v_run.dataset_id and sh.state_code=v_run.state_code and sh.county_code=v_run.county_code and sh.active\n    union all select s.source_digest';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental hold digest inclusion expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'      ''materialized_supplemental_feature_count'',case when v_role=''supplemental_aliases'' then v_materialized_supplemental_features else null end,\n      ''source_feature_accounting_verified'',case when v_role=''supplemental_aliases'' then v_supplemental_feature_accounting_verified else null end';
  v_new:=E'      ''materialized_supplemental_feature_count'',case when v_role=''supplemental_aliases'' then v_materialized_supplemental_features else null end,\n      ''held_supplemental_source_feature_count'',case when v_role=''supplemental_aliases'' then v_held_supplemental_source_features else null end,\n      ''retired_supplemental_source_holds'',case when v_role=''supplemental_aliases'' then v_retired_supplemental_source_holds else null end,\n      ''source_feature_accounting_verified'',case when v_role=''supplemental_aliases'' then v_supplemental_feature_accounting_verified else null end';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental success hold metrics expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    ''active_source_geometry_holds'',v_active_source_holds,\n    ''content_digest'',v_content_digest';
  v_new:=E'    ''active_source_geometry_holds'',v_active_source_holds,\n    ''held_supplemental_source_feature_count'',case when v_role=''supplemental_aliases'' then v_held_supplemental_source_features else null end,\n    ''retired_supplemental_source_holds'',case when v_role=''supplemental_aliases'' then v_retired_supplemental_source_holds else null end,\n    ''content_digest'',v_content_digest';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental return hold metrics expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  execute v_definition;
end
$issue97_patch_supplemental_hold_finalizer$;

-- Composed runtime install proof.
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

  if v_loader not like '%brinesearch_issue97_supplemental_geometry_hold_reason%'
     or v_loader not like '%brinesearch_issue97_supplemental_source_holds%'
     or v_loader not like '%hold_without_centerline_geometry%'
     or v_loader not like '%''held_rows'',v_held_rows%'
     or v_finalizer not like '%v_materialized_supplemental_features+v_held_supplemental_source_features%'
     or v_finalizer not like '%retired_supplemental_source_holds%'
     or v_finalizer not like '%brinesearch_issue97_supplemental_source_holds%'
     or v_finalizer not like '%union all select sh.source_digest%'
  then
    raise exception 'Issue #97 supplemental source-hold contract did not install cleanly';
  end if;
end
$issue97_verify_supplemental_source_holds$;
