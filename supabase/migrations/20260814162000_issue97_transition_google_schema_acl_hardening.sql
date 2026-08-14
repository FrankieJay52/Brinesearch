-- GitHub #97 — repair transition-derived Google dependency schema drift and
-- close service-role bypasses around reviewed wrappers.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

-- The transition dependency was left on a pre-hardening schema vocabulary.
-- Patch only the stale helper/column/status references; route semantics remain
-- exact-authoritative and fail closed.
do $issue97_transition_dependency_schema_patch$
declare
  v_definition text;
  v_patched text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_transition_google_dependency(uuid)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>'ed97980f30ce29180177508c6943d183' then
    raise exception 'Issue #97 transition Google dependency changed before schema repair';
  end if;

  v_patched:=pg_catalog.replace(
    v_definition,
    'public.brinesearch_issue97_road_mapping_fingerprint(o.canonical_road_id)',
    'private_verification.brinesearch_issue97_mapping_fingerprint(o.identity_id)'
  );
  v_patched:=pg_catalog.replace(
    v_patched,
    'public.brinesearch_issue97_dataset_scope_current(',
    'private_verification.brinesearch_issue97_dataset_scope_current('
  );
  v_patched:=pg_catalog.replace(
    v_patched,
    't.graph_build_digest is null',
    't.graph_digest is null'
  );
  v_patched:=pg_catalog.replace(
    v_patched,
    'public.brinesearch_issue97_graph_build_sources_current(t.graph_build_id)',
    'private_verification.brinesearch_issue97_graph_build_sources_current(t.graph_build_id)'
  );
  v_patched:=pg_catalog.replace(
    v_patched,
    'coalesce(run.page_set_digest,'''')',
    'coalesce(run.details->>''page_set_digest'','''')'
  );
  v_patched:=pg_catalog.replace(
    v_patched,
    'run.status=''succeeded'' and run.coverage_complete',
    'private_verification.brinesearch_issue97_ingest_run_verified(run.id)'
  );

  if v_patched like '%public.brinesearch_issue97_road_mapping_fingerprint(%'
     or v_patched like '%public.brinesearch_issue97_dataset_scope_current(%'
     or v_patched like '%t.graph_build_digest%'
     or v_patched like '%public.brinesearch_issue97_graph_build_sources_current(%'
     or v_patched like '%run.page_set_digest%'
     or v_patched like '%run.coverage_complete%'
     or v_patched like '%run.status=''succeeded''%' then
    raise exception 'Issue #97 transition Google dependency retained stale schema references';
  end if;
  if v_patched not like '%private_verification.brinesearch_issue97_mapping_fingerprint(o.identity_id)%'
     or v_patched not like '%t.graph_digest is null%'
     or v_patched not like '%private_verification.brinesearch_issue97_graph_build_sources_current(t.graph_build_id)%'
     or v_patched not like '%private_verification.brinesearch_issue97_ingest_run_verified(run.id)%'
     or v_patched not like '%run.details->>''page_set_digest''%' then
    raise exception 'Issue #97 transition Google dependency current-schema guards are incomplete';
  end if;

  execute v_patched;
end
$issue97_transition_dependency_schema_patch$;

-- The transition-backed route materializer carried the same stale public helper
-- vocabulary. Repair it independently so the executable transition lane is not
-- left dormant behind the dependency checker fix.
do $issue97_transition_route_schema_patch$
declare
  v_definition text;
  v_patched text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)'::pg_catalog.regprocedure
  ) into strict v_definition;
  v_patched:=pg_catalog.replace(
    v_definition,
    'public.brinesearch_issue97_dataset_scope_current(',
    'private_verification.brinesearch_issue97_dataset_scope_current('
  );
  v_patched:=pg_catalog.replace(
    v_patched,
    'public.brinesearch_issue97_road_mapping_fingerprint(o.canonical_road_id)',
    'private_verification.brinesearch_issue97_mapping_fingerprint(o.identity_id)'
  );
  if v_patched=v_definition
     or v_patched like '%public.brinesearch_issue97_dataset_scope_current(%'
     or v_patched like '%public.brinesearch_issue97_road_mapping_fingerprint(%' then
    raise exception 'Issue #97 transition route materializer schema repair did not converge';
  end if;
  execute v_patched;
end
$issue97_transition_route_schema_patch$;

-- The public cutover wrapper is the only reviewed production entry point. Its
-- inner implementation remains callable by the postgres owner from SECURITY
-- DEFINER context, but not directly by service_role.
revoke all on function public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)
from public,anon,authenticated,service_role;
revoke all on function public.brinesearch_publish_structured_route_issue97_without_google(uuid,uuid,jsonb,bigint)
from public,anon,authenticated,service_role;

-- Keep only the intended outer grants.
revoke all on function public.brinesearch_issue97_activate_cutover(jsonb)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_activate_cutover(jsonb)
to service_role;
revoke all on function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)
from public,anon;
grant execute on function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)
to authenticated,service_role;

-- Cutover must not commit merely because the inner release flip succeeded. The
-- all-pad Google refresh already accounts every non-list-only pad; bind that
-- accounting result to the transaction before returning success.
do $issue97_cutover_google_accounting_patch$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_cutover(jsonb)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>'5a3d5d0b0fa038ae1b5349dccc86b2eb' then
    raise exception 'Issue #97 public cutover wrapper changed before Google accounting hardening';
  end if;

  v_old:=$old$  if coalesce((v_result->>'activated')::boolean,false) then
    v_google:=public.brinesearch_issue97_refresh_google_routes(null);
    return v_result||pg_catalog.jsonb_build_object('google_route_backfill',v_google);
  end if;$old$;
  v_new:=$new$  if coalesce((v_result->>'activated')::boolean,false) then
    v_google:=public.brinesearch_issue97_refresh_google_routes(null);
    if coalesce((v_google->>'all_current_pads_accounted')::boolean,false)<>true
       or coalesce((v_google->>'processed')::integer,-1)
          <>coalesce((v_google->>'current_pad_scope')::integer,-2)
       or coalesce((v_google->>'ready')::integer,0)
          +coalesce((v_google->>'held')::integer,0)
          +coalesce((v_google->>'stale')::integer,0)
          <>coalesce((v_google->>'processed')::integer,-1)
       or coalesce((v_google->>'stale')::integer,0)<>0 then
      raise exception 'Issue #97 cutover Google-route backfill did not account every current pad as ready or explicitly held: %',
        v_google using errcode='55000';
    end if;
    if (select count(*) from public.brinesearch_driver_google_routes_public)
         <>coalesce((v_google->>'ready')::integer,0)
       or (select count(*) from private_verification.brinesearch_google_route_receipts_issue97
             where status='ready')<>coalesce((v_google->>'ready')::integer,0)
       or (select count(*) from private_verification.brinesearch_google_route_receipts_issue97
             where status='held')<>coalesce((v_google->>'held')::integer,0) then
      raise exception 'Issue #97 cutover Google-route persisted receipt/public projection accounting disagrees with refresh result: %',
        v_google using errcode='55000';
    end if;
    return v_result||pg_catalog.jsonb_build_object('google_route_backfill',v_google);
  end if;$new$;

  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 cutover Google accounting patch anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_patched;
end
$issue97_cutover_google_accounting_patch$;

-- Explicit runtime ACL/schema verification. The next release-currentness
-- migration will replace the temporary source/mapping currentness call with the
-- stronger release-current predicate; until then this function is at least
-- executable against the real current schema rather than a dead code path.
do $issue97_transition_acl_verify$
declare v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_transition_google_dependency(uuid)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if v_definition like '%public.brinesearch_issue97_road_mapping_fingerprint%'
     or v_definition like '%graph_build_digest%'
     or v_definition like '%run.page_set_digest%'
     or v_definition like '%run.coverage_complete%'
     or v_definition like '%status=''succeeded''%'
     or v_definition like '%public.brinesearch_issue97_graph_build_sources_current%'
     or v_definition like '%public.brinesearch_issue97_dataset_scope_current%' then
    raise exception 'Issue #97 transition dependency schema repair is incomplete';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if v_definition like '%public.brinesearch_issue97_road_mapping_fingerprint%'
     or v_definition like '%public.brinesearch_issue97_dataset_scope_current%' then
    raise exception 'Issue #97 transition route materializer schema repair is incomplete';
  end if;

  if pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_publish_structured_route_issue97_without_google(uuid,uuid,jsonb,bigint)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon','public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_publish_structured_route_issue97_without_google(uuid,uuid,jsonb,bigint)','EXECUTE'
     ) then
    raise exception 'Issue #97 internal cutover/publisher implementation remains directly executable';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_issue97_activate_cutover(jsonb)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)','EXECUTE'
     ) then
    raise exception 'Issue #97 approved public wrapper grants were lost';
  end if;
end
$issue97_transition_acl_verify$;
