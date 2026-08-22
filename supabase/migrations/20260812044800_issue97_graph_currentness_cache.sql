-- GitHub #97 — cache active graph-build currentness during route path solving.
--
-- Full dark corpus reconciliation reached a second repeated-work bottleneck after
-- exact candidate lookup was indexed: every recursive identity-pair edge check
-- recomputed the complete source-run + mapping-snapshot currentness proof for the
-- same small set of active graph builds. Evaluate that proof once per active build
-- in the transaction, then let the recursive solver read the cached boolean.
-- Direct callers remain safe: the cached helper falls back to the original proof
-- when no transaction cache has been prepared.

create or replace function private_verification.brinesearch_issue97_prepare_graph_current_cache()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  create temp table if not exists tmp_issue97_graph_current_cache(
    build_id uuid primary key,
    is_current boolean not null
  ) on commit drop;

  if exists(select 1 from pg_temp.tmp_issue97_graph_current_cache limit 1) then return; end if;

  insert into pg_temp.tmp_issue97_graph_current_cache(build_id,is_current)
  select b.id,private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
  from public.brinesearch_road_graph_builds b
  where b.status='active';
end
$$;

revoke all on function private_verification.brinesearch_issue97_prepare_graph_current_cache()
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_graph_build_sources_current_cached(
  p_build_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_current boolean;
begin
  if pg_catalog.to_regclass('pg_temp.tmp_issue97_graph_current_cache') is not null then
    execute 'select is_current from pg_temp.tmp_issue97_graph_current_cache where build_id=$1'
      into v_current using p_build_id;
    if found then return coalesce(v_current,false); end if;
  end if;
  return private_verification.brinesearch_issue97_graph_build_sources_current(p_build_id);
end
$$;

revoke all on function private_verification.brinesearch_issue97_graph_build_sources_current_cached(uuid)
from public,anon,authenticated,service_role;

do $issue97_patch_graph_current_cache$
declare
  v_connected text;
  v_resolver text;
  v_old_call constant text := 'private_verification.brinesearch_issue97_graph_build_sources_current(b.id)';
  v_new_call constant text := 'private_verification.brinesearch_issue97_graph_build_sources_current_cached(b.id)';
  v_old_anchor constant text := E'  if v_zero>0 or v_broad>0 then\n    return pg_catalog.jsonb_build_object(\n      ''status'',''held'',''zero_candidate_occurrences'',v_zero,''broad_candidate_occurrences'',v_broad\n    );\n  end if;\n\n  with recursive ordered as (';
  v_new_anchor constant text := E'  if v_zero>0 or v_broad>0 then\n    return pg_catalog.jsonb_build_object(\n      ''status'',''held'',''zero_candidate_occurrences'',v_zero,''broad_candidate_occurrences'',v_broad\n    );\n  end if;\n\n  perform private_verification.brinesearch_issue97_prepare_graph_current_cache();\n\n  with recursive ordered as (';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_identities_connected(uuid,uuid)'::pg_catalog.regprocedure
  ) into v_connected;
  v_count := (pg_catalog.length(v_connected)-pg_catalog.length(pg_catalog.replace(v_connected,v_old_call,'')))
    /pg_catalog.length(v_old_call);
  if v_count<>1 then raise exception 'Issue #97 connected-currentness patch target changed: %',v_count; end if;
  execute pg_catalog.replace(v_connected,v_old_call,v_new_call);

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)'::pg_catalog.regprocedure
  ) into v_resolver;
  v_count := (pg_catalog.length(v_resolver)-pg_catalog.length(pg_catalog.replace(v_resolver,v_old_anchor,'')))
    /pg_catalog.length(v_old_anchor);
  if v_count<>1 then raise exception 'Issue #97 route solver graph-cache anchor changed: %',v_count; end if;
  execute pg_catalog.replace(v_resolver,v_old_anchor,v_new_anchor);
end
$issue97_patch_graph_current_cache$;

revoke all on function private_verification.brinesearch_issue97_identities_connected(uuid,uuid)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)
from public,anon,authenticated,service_role;

do $issue97_verify_graph_current_cache$
declare
  v_connected text;
  v_resolver text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_identities_connected(uuid,uuid)'::pg_catalog.regprocedure
  ) into v_connected;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)'::pg_catalog.regprocedure
  ) into v_resolver;

  if v_connected not like '%brinesearch_issue97_graph_build_sources_current_cached(b.id)%'
     or v_connected like '%brinesearch_issue97_graph_build_sources_current(b.id)%'
     or v_resolver not like '%brinesearch_issue97_prepare_graph_current_cache();%'
  then raise exception 'Issue #97 graph currentness cache did not install cleanly'; end if;

  if v_connected like '%similarity(%' or v_connected like '%<->%'
     or v_resolver like '%similarity(%' or v_resolver like '%<->%'
  then raise exception 'Issue #97 graph currentness cache weakened topology no-guess rules'; end if;
end
$issue97_verify_graph_current_cache$;
