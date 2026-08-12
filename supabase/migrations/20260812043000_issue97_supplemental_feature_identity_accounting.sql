-- GitHub #97 — supplemental source-feature identity + full materialization accounting.
--
-- Bradford County exposed a silent source-loss class: whitespace-only RCL_NGUID
-- values were treated as stable native IDs because NULLIF(...,'') did not trim.
-- Hundreds of distinct ArcGIS OBJECTIDs therefore upserted onto one feature key
-- while the page receipt still counted every source feature as ingested.
--
-- Fix the root cause for every PA NG911/native-key source and add a generic
-- supplemental finalization invariant: a supplemental run cannot complete unless
-- the number of distinct rows materialized by that exact run equals the number of
-- source features reported as ingested by its verified page receipts.

create or replace function private_verification.brinesearch_issue97_supplemental_native_feature_key(
  p_source_version text,
  p_record_id text,
  p_native_id text
)
returns text
language plpgsql
immutable
security definer
set search_path=''
as $issue97_supplemental_native_key$
declare
  v_version text:=nullif(pg_catalog.btrim(coalesce(p_source_version,'')),'');
  v_record text:=nullif(pg_catalog.btrim(coalesce(p_record_id,'')),'');
  v_native text:=nullif(pg_catalog.btrim(coalesce(p_native_id,'')),'');
begin
  if v_record is null or v_version is null then
    raise exception 'Supplemental source version and record id are required for stable feature identity'
      using errcode='22023';
  end if;
  return coalesce(v_native,v_version||':'||v_record);
end
$issue97_supplemental_native_key$;

revoke all on function private_verification.brinesearch_issue97_supplemental_native_feature_key(text,text,text)
from public,anon,authenticated;

-- Executable key regression: whitespace-only native IDs must fall back to the
-- immutable source-version + ArcGIS object ID; padded real IDs are normalized;
-- two blank IDs with different OBJECTIDs must remain distinct.
do $issue97_supplemental_native_key_regression$
declare
  v_blank_101 text;
  v_blank_102 text;
  v_padded text;
begin
  v_blank_101:=private_verification.brinesearch_issue97_supplemental_native_feature_key(
    '2025-Q4','101',' '
  );
  v_blank_102:=private_verification.brinesearch_issue97_supplemental_native_feature_key(
    '2025-Q4','102',E'\t  '
  );
  v_padded:=private_verification.brinesearch_issue97_supplemental_native_feature_key(
    '2025-Q4','103','  NG-ABC-123  '
  );
  if v_blank_101<>'2025-Q4:101'
     or v_blank_102<>'2025-Q4:102'
     or v_blank_101=v_blank_102
     or v_padded<>'NG-ABC-123' then
    raise exception 'Issue #97 supplemental native feature-key regression failed: %, %, %',
      v_blank_101,v_blank_102,v_padded;
  end if;
end
$issue97_supplemental_native_key_regression$;

-- Patch the current supplemental page loader compositionally. Do not replace
-- earlier source paging, geometry validation, source naming, or scope semantics.
do $issue97_patch_supplemental_native_keys$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer)'::pg_catalog.regprocedure
  ) into v_definition;

  v_old:='if nullif(v_record_id,'''') is null then continue; end if;';
  v_new:='if nullif(pg_catalog.btrim(v_record_id),'''') is null then continue; end if;'||chr(10)||
    '    v_record_id:=pg_catalog.btrim(v_record_id);';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental record-id trim patch expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:='coalesce(nullif(v_props->>''FEATURE_KE'',''''),v_run.source_version||'':''||v_record_id)';
  v_new:='private_verification.brinesearch_issue97_supplemental_native_feature_key('||
    'v_run.source_version,v_record_id,v_props->>''FEATURE_KE'')';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 Allegheny FEATURE_KE patch expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:='coalesce(nullif(v_props->>''RCL_NGUID'',''''),v_run.source_version||'':''||v_record_id)';
  v_new:='private_verification.brinesearch_issue97_supplemental_native_feature_key('||
    'v_run.source_version,v_record_id,v_props->>''RCL_NGUID'')';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>4 then
    raise exception 'Issue #97 RCL_NGUID patch expected 4 targets, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  if v_definition like '%coalesce(nullif(v_props->>''RCL_NGUID'',''''),v_run.source_version%'
     or v_definition like '%coalesce(nullif(v_props->>''FEATURE_KE'',''''),v_run.source_version%'
  then
    raise exception 'Issue #97 supplemental untrimmed native-key fallback remains after patch';
  end if;

  execute v_definition;
end
$issue97_patch_supplemental_native_keys$;

-- A page counter is not proof that distinct source features survived their
-- upserts. Harden the lower finalizer before any stale-row retirement or alias
-- materialization so every supplemental source must prove current-run row count.
do $issue97_patch_supplemental_materialized_count_gate$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)'::pg_catalog.regprocedure
  ) into v_definition;

  v_old:=E'  v_content_digest text;\n  v_supplemental_result jsonb;\nbegin';
  v_new:=E'  v_content_digest text;\n  v_supplemental_result jsonb;\n  v_materialized_supplemental_features integer:=0;\n  v_supplemental_feature_accounting_verified boolean:=false;\nbegin';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental finalizer declaration patch expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'  perform pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtext(''brinesearch:issue97:ingest:''||v_run.dataset_id::text||'':''||v_run.county_code)\n  );\n\n  if v_source=''oh_odot_tims_road_inventory'' then';
  v_new:=E'  if v_role=''supplemental_aliases'' then\n    select count(*)::integer into v_materialized_supplemental_features\n    from public.brinesearch_authoritative_supplemental_centerlines c\n    where c.dataset_id=v_run.dataset_id and c.state_code=v_run.state_code\n      and c.county_code=v_run.county_code and c.active\n      and c.last_ingest_run_id=p_run_id;\n\n    if v_materialized_supplemental_features<>coalesce(p_ingested_row_count,-1) then\n      update public.brinesearch_road_source_ingest_runs set\n        status=''failed'',completed_at=now(),page_count=greatest(coalesce(p_page_count,0),0),\n        source_row_count=greatest(coalesce(p_source_row_count,0),0),\n        ingested_row_count=greatest(coalesce(p_ingested_row_count,0),0),\n        details=details||coalesce(p_details,''{}''::jsonb)||pg_catalog.jsonb_build_object(\n          ''coverage_complete'',false,\n          ''source_feature_accounting_verified'',false,\n          ''materialized_supplemental_feature_count'',v_materialized_supplemental_features,\n          ''failure'',''supplemental source feature identity/materialization count mismatch''\n        )\n      where id=p_run_id;\n      return pg_catalog.jsonb_build_object(\n        ''run_id'',p_run_id,''status'',''failed'',''coverage_complete'',false,\n        ''source_rows'',greatest(coalesce(p_source_row_count,0),0),\n        ''ingested_rows'',greatest(coalesce(p_ingested_row_count,0),0),\n        ''materialized_supplemental_feature_count'',v_materialized_supplemental_features,\n        ''source_feature_accounting_verified'',false\n      );\n    end if;\n    v_supplemental_feature_accounting_verified:=true;\n  end if;\n\n  perform pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtext(''brinesearch:issue97:ingest:''||v_run.dataset_id::text||'':''||v_run.county_code)\n  );\n\n  if v_source=''oh_odot_tims_road_inventory'' then';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental materialized-count gate expected 1 insertion target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'      ''supplemental_materialization'',coalesce(v_supplemental_result,''{}''::jsonb)\n    )';
  v_new:=E'      ''supplemental_materialization'',coalesce(v_supplemental_result,''{}''::jsonb),\n      ''materialized_supplemental_feature_count'',case when v_role=''supplemental_aliases'' then v_materialized_supplemental_features else null end,\n      ''source_feature_accounting_verified'',case when v_role=''supplemental_aliases'' then v_supplemental_feature_accounting_verified else null end\n    )';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 supplemental success receipt patch expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  execute v_definition;
end
$issue97_patch_supplemental_materialized_count_gate$;

-- Composed-runtime regression: prove every relevant native key is routed through
-- the trim/fallback helper, and the finalizer cannot proceed to supplemental alias
-- materialization without a distinct current-run feature-count check.
do $issue97_verify_supplemental_feature_accounting$
declare
  v_loader text;
  v_finalizer text;
  v_helper_calls integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer)'::pg_catalog.regprocedure
  ) into v_loader;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)'::pg_catalog.regprocedure
  ) into v_finalizer;

  v_helper_calls:=(pg_catalog.length(v_loader)-pg_catalog.length(pg_catalog.replace(
    v_loader,'private_verification.brinesearch_issue97_supplemental_native_feature_key(','')))
    /pg_catalog.length('private_verification.brinesearch_issue97_supplemental_native_feature_key(');

  if v_helper_calls<>5
     or v_loader like '%coalesce(nullif(v_props->>''RCL_NGUID'',''''),v_run.source_version%'
     or v_loader like '%coalesce(nullif(v_props->>''FEATURE_KE'',''''),v_run.source_version%'
     or v_loader not like '%v_record_id:=pg_catalog.btrim(v_record_id)%'
     or v_finalizer not like '%materialized_supplemental_feature_count%'
     or v_finalizer not like '%supplemental source feature identity/materialization count mismatch%'
     or v_finalizer not like '%c.last_ingest_run_id=p_run_id%'
     or v_finalizer not like '%source_feature_accounting_verified%'
  then
    raise exception 'Issue #97 supplemental source-feature accounting contract did not install cleanly';
  end if;
end
$issue97_verify_supplemental_feature_accounting$;

comment on function private_verification.brinesearch_issue97_supplemental_native_feature_key(text,text,text) is
  'Issue #97 stable supplemental feature identity helper. Trims native IDs, falls back to immutable source-version + ArcGIS record ID when native IDs are blank/whitespace, and prevents source-feature collapse.';
