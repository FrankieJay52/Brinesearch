-- GitHub #97 — supplemental source occurrence identity.
--
-- Fayette County proves a source-native NG911 identifier is not necessarily a
-- unique ArcGIS feature-row identifier. OBJECTID_12 11802 and 14051 are distinct
-- Convenient St centerline segments with different address ranges, but both use
-- RCL_NGUID `RCL11946@fcema.org`. Treating that NGUID as the persisted feature key
-- collapses one authoritative source occurrence.
--
-- Preserve the native ID as provenance, but key each supplemental source
-- occurrence by:
--   source + native stable ID + state/county scope + exact ArcGIS source record ID.
-- This retains both legitimate source segments while still exposing the shared
-- native NGUID. The rule is generic across all supported supplemental sources and
-- applies equally to real centerlines and source-geometry holds.

create or replace function private_verification.brinesearch_issue97_supplemental_occurrence_feature_key(
  p_source_key text,
  p_stable_id text,
  p_record_id text,
  p_state_code text,
  p_county_code text
)
returns text
language plpgsql
immutable
security definer
set search_path=''
as $issue97_supp_occurrence_key$
declare
  v_source text:=nullif(pg_catalog.btrim(p_source_key),'');
  v_stable text:=nullif(pg_catalog.btrim(p_stable_id),'');
  v_record text:=nullif(pg_catalog.btrim(p_record_id),'');
  v_state text:=nullif(pg_catalog.upper(pg_catalog.btrim(p_state_code)),'');
  v_county text:=nullif(pg_catalog.upper(pg_catalog.btrim(p_county_code)),'');
begin
  if v_source is null or v_stable is null or v_record is null
     or v_state is null or v_county is null then
    raise exception 'Supplemental occurrence feature key requires source, stable ID, record ID, state, and county'
      using errcode='22023';
  end if;
  return v_source||':'||v_stable||':SCOPE:'||v_state||':'||v_county||':RECORD:'||v_record;
end
$issue97_supp_occurrence_key$;

revoke all on function private_verification.brinesearch_issue97_supplemental_occurrence_feature_key(text,text,text,text,text)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_supplemental_occurrence_feature_key(text,text,text,text,text)
to service_role;

-- Real Fayette collision class: shared native NGUID must remain two distinct source
-- occurrences because the official ArcGIS source record IDs are different.
do $issue97_supp_occurrence_key_regression$
declare
  v_11802 text;
  v_14051 text;
begin
  v_11802:=private_verification.brinesearch_issue97_supplemental_occurrence_feature_key(
    'pa_fayette_ng911_centerlines','NGUID:RCL11946@fcema.org','11802','PA','FAY'
  );
  v_14051:=private_verification.brinesearch_issue97_supplemental_occurrence_feature_key(
    'pa_fayette_ng911_centerlines','NGUID:RCL11946@fcema.org','14051','PA','FAY'
  );
  if v_11802=v_14051
     or v_11802<>'pa_fayette_ng911_centerlines:NGUID:RCL11946@fcema.org:SCOPE:PA:FAY:RECORD:11802'
     or v_14051<>'pa_fayette_ng911_centerlines:NGUID:RCL11946@fcema.org:SCOPE:PA:FAY:RECORD:14051' then
    raise exception 'Issue #97 supplemental occurrence-key regression failed: %, %',v_11802,v_14051;
  end if;
end
$issue97_supp_occurrence_key_regression$;

-- Patch both valid supplemental centerlines and supplemental source holds through
-- the same occurrence-key helper. Guard exact source targets so drift fails closed.
do $issue97_patch_supplemental_occurrence_keys$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer)'::pg_catalog.regprocedure
  ) into v_definition;

  v_old:=E'      v_hold_feature_key:=v_run.source_key||'':''||v_hold_stable_id||'':SCOPE:''||\n        v_run.state_code||'':''||v_run.county_code;';
  v_new:=E'      v_hold_feature_key:=private_verification.brinesearch_issue97_supplemental_occurrence_feature_key(\n        v_run.source_key,v_hold_stable_id,v_hold_record_id,v_run.state_code,v_run.county_code\n      );';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental held occurrence-key patch expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'    v_feature_key:=v_run.source_key||'':''||v_stable_id||'':SCOPE:''||\n      v_run.state_code||'':''||v_run.county_code;';
  v_new:=E'    v_feature_key:=private_verification.brinesearch_issue97_supplemental_occurrence_feature_key(\n      v_run.source_key,v_stable_id,v_record_id,v_run.state_code,v_run.county_code\n    );';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental centerline occurrence-key patch expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  execute v_definition;
end
$issue97_patch_supplemental_occurrence_keys$;

-- Composed runtime proof: both source paths use the occurrence helper, the old
-- native-only scoped feature-key assignments are gone, and native provenance is
-- still persisted independently in source attributes / hold fields.
do $issue97_verify_supplemental_occurrence_keys$
declare
  v_definition text;
  v_calls integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer)'::pg_catalog.regprocedure
  ) into v_definition;

  v_calls:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
    v_definition,'private_verification.brinesearch_issue97_supplemental_occurrence_feature_key(',''
  )))/pg_catalog.length('private_verification.brinesearch_issue97_supplemental_occurrence_feature_key(');

  if v_calls<>2
     or v_definition like '%v_feature_key:=v_run.source_key||'':''||v_stable_id||'':SCOPE:''%'
     or v_definition like '%v_hold_feature_key:=v_run.source_key||'':''||v_hold_stable_id||'':SCOPE:''%'
     or v_definition not like '%''source_native_feature_key'',v_run.source_key||'':''||v_stable_id%'
  then
    raise exception 'Issue #97 supplemental source occurrence-key contract did not install cleanly';
  end if;
end
$issue97_verify_supplemental_occurrence_keys$;
