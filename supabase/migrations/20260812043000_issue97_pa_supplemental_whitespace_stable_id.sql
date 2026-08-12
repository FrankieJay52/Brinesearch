-- GitHub #97 — preserve every PA NG911 source feature when RCL_NGUID is blank
-- or whitespace-only. Bradford exposed that a literal single-space RCL_NGUID was
-- being treated as a stable identifier, collapsing hundreds of distinct ArcGIS
-- OBJECTIDs onto one source_feature_key while the page receipt still counted
-- every source row as ingested.
--
-- This migration does two things:
--   1. Centralizes PA NG911 RCL_NGUID stable-ID construction. RCL_NGUID is
--      btrim()'d first; blank/whitespace falls back to source_version + OBJECTID.
--      The same rule applies to Bradford, Fayette, Indiana, and Washington.
--   2. Adds a run/page materialization invariant. After every supplemental page,
--      the number of unique rows materialized for the run must exactly equal the
--      prior durable ingested-page count plus the current page's accounted rows.
--      A future source-key collision therefore fails the page transaction instead
--      of silently under-materializing authoritative source features.
--
-- No road-name, fuzzy, nearest-road, geometry repair, or topology inference is
-- introduced here.

create or replace function private_verification.brinesearch_issue97_pa_ng911_stable_id(
  p_source_key text,
  p_source_version text,
  p_record_id text,
  p_properties jsonb
)
returns text
language plpgsql
stable
security definer
set search_path=''
as $issue97_pa_ng911_stable_id$
declare
  v_source_key text:=pg_catalog.btrim(coalesce(p_source_key,''));
  v_source_version text:=pg_catalog.btrim(coalesce(p_source_version,''));
  v_record_id text:=nullif(pg_catalog.btrim(p_record_id),'');
  v_nguid text:=nullif(pg_catalog.btrim(coalesce(p_properties->>'RCL_NGUID','')),'');
begin
  if v_source_key not in (
    'pa_bradford_ng911_centerlines',
    'pa_fayette_ng911_centerlines',
    'pa_indiana_ng911_centerlines',
    'pa_washington_ng911_centerlines'
  ) then
    raise exception 'Issue #97 PA NG911 stable-ID helper received unsupported source %',p_source_key
      using errcode='22023';
  end if;
  if v_record_id is null then
    return null;
  end if;
  if v_nguid is not null then
    return 'NGUID:'||v_nguid;
  end if;
  if v_source_version='' then
    raise exception 'Issue #97 PA NG911 stable-ID fallback requires source_version'
      using errcode='22023';
  end if;
  return 'NGUID:'||v_source_version||':'||v_record_id;
end
$issue97_pa_ng911_stable_id$;

revoke all on function private_verification.brinesearch_issue97_pa_ng911_stable_id(text,text,text,jsonb)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_pa_ng911_stable_id(text,text,text,jsonb)
to service_role;

-- Synthetic regression for the Bradford failure class. Two independent source
-- rows with whitespace-only RCL_NGUID must remain distinct by immutable OBJECTID
-- fallback, while a real NGUID is trimmed and preserved.
do $issue97_pa_ng911_stable_id_regression$
declare
  v_a text;
  v_b text;
  v_real text;
begin
  v_a:=private_verification.brinesearch_issue97_pa_ng911_stable_id(
    'pa_bradford_ng911_centerlines','2024_08','1001',
    pg_catalog.jsonb_build_object('RCL_NGUID',' ')
  );
  v_b:=private_verification.brinesearch_issue97_pa_ng911_stable_id(
    'pa_bradford_ng911_centerlines','2024_08','1002',
    pg_catalog.jsonb_build_object('RCL_NGUID','   ')
  );
  v_real:=private_verification.brinesearch_issue97_pa_ng911_stable_id(
    'pa_bradford_ng911_centerlines','2024_08','1003',
    pg_catalog.jsonb_build_object('RCL_NGUID','  01234567-89AB-CDEF  ')
  );

  if v_a<>'NGUID:2024_08:1001'
     or v_b<>'NGUID:2024_08:1002'
     or v_a=v_b
     or v_real<>'NGUID:01234567-89AB-CDEF' then
    raise exception 'Issue #97 PA NG911 whitespace stable-ID regression failed: %, %, %',
      v_a,v_b,v_real;
  end if;
end
$issue97_pa_ng911_stable_id_regression$;

-- Patch the current supplemental loader without replacing any of the existing
-- durable paging, source-snapshot, geometry, provenance, or alias materialization
-- contracts. Exact source text counts are guarded so drift fails the migration.
do $issue97_patch_pa_supplemental_stable_ids$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer)'::pg_catalog.regprocedure
  ) into v_definition;

  v_old:=E'  v_rows integer:=0;\n  v_source_rows integer:=0;';
  v_new:=E'  v_rows integer:=0;\n  v_source_rows integer:=0;\n  v_prior_ingested_rows integer:=0;\n  v_materialized_rows integer:=0;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental uniqueness declaration patch target changed: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'''NGUID:''||coalesce(nullif(v_props->>''RCL_NGUID'',''''),v_run.source_version||'':''||v_record_id)';
  v_new:=E'private_verification.brinesearch_issue97_pa_ng911_stable_id(\n          v_run.source_key,v_run.source_version,v_record_id,v_props\n        )';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>4 then
    raise exception 'Issue #97 expected four PA RCL_NGUID stable-ID expressions, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    v_rows:=v_rows+1;\n  end loop;\n  return pg_catalog.jsonb_build_object(';
  v_new:=E'    v_rows:=v_rows+1;\n  end loop;\n\n  -- Generic anti-collapse invariant. Page receipts for earlier pages are already\n  -- durable; the current page has not been receipted yet. The run must therefore\n  -- own exactly prior accounted rows + current accounted rows as unique source\n  -- features. Any duplicate source_feature_key within or across pages fails.\n  select coalesce(pg_catalog.sum(p.ingested_row_count),0)::integer\n  into v_prior_ingested_rows\n  from public.brinesearch_road_source_ingest_pages p\n  where p.run_id=p_run_id;\n\n  select count(*)::integer into v_materialized_rows\n  from public.brinesearch_authoritative_supplemental_centerlines c\n  where c.dataset_id=v_run.dataset_id\n    and c.state_code=v_run.state_code\n    and c.county_code=v_run.county_code\n    and c.last_ingest_run_id=p_run_id;\n\n  if v_materialized_rows<>v_prior_ingested_rows+v_rows then\n    raise exception ''Supplemental source feature uniqueness contract failed: materialized %, expected % for run % page offset %'',\n      v_materialized_rows,v_prior_ingested_rows+v_rows,p_run_id,v_offset\n      using errcode=''23505'';\n  end if;\n\n  return pg_catalog.jsonb_build_object(';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental uniqueness guard patch target changed: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  execute v_definition;
end
$issue97_patch_pa_supplemental_stable_ids$;

-- Executable install contract: all four RCL_NGUID sources must now call the
-- whitespace-safe helper, the materialized-row invariant must be present, and
-- no forbidden heuristic is introduced.
do $issue97_verify_pa_supplemental_stable_ids$
declare
  v_loader text;
  v_helper_calls integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer)'::pg_catalog.regprocedure
  ) into v_loader;

  v_helper_calls:=(pg_catalog.length(v_loader)-pg_catalog.length(pg_catalog.replace(
    v_loader,'private_verification.brinesearch_issue97_pa_ng911_stable_id(',''
  )))/pg_catalog.length('private_verification.brinesearch_issue97_pa_ng911_stable_id(');

  if v_helper_calls<>4
     or v_loader not ilike '%v_materialized_rows<>v_prior_ingested_rows+v_rows%'
     or v_loader not ilike '%Supplemental source feature uniqueness contract failed%'
     or v_loader ilike '%nearest_road_used'',true%'
  then
    raise exception 'Issue #97 PA supplemental stable-ID/uniqueness contract did not install cleanly';
  end if;
end
$issue97_verify_pa_supplemental_stable_ids$;
