-- GitHub #97 — make transaction-local graph freshness cache misses fail closed.
--
-- When the route-corpus entrypoint explicitly prepares tmp_issue97_graph_current_cache,
-- that table is the transaction snapshot for active graph readiness. Recomputing an
-- uncached build inside recursive path search is both expensive and unnecessary.
-- A cache miss while the snapshot exists now returns false. Calls made outside a
-- prepared-cache transaction still use the authoritative live freshness function.
-- This is conservative: a concurrently appearing build cannot become route truth
-- mid-reconciliation.

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
    if found then
      return coalesce(v_current,false);
    end if;
    -- A prepared snapshot is intentionally fail-closed for unknown builds.
    return false;
  end if;

  return private_verification.brinesearch_issue97_graph_build_sources_current(p_build_id);
end
$$;

revoke all on function private_verification.brinesearch_issue97_graph_build_sources_current_cached(uuid)
from public,anon,authenticated,service_role;

do $issue97_verify_graph_current_cache_fail_closed$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_graph_build_sources_current_cached(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition not like '%A prepared snapshot is intentionally fail-closed for unknown builds.%'
     or v_definition not like '%return false;%'
     or v_definition not like '%brinesearch_issue97_graph_build_sources_current(p_build_id)%'
  then
    raise exception 'Issue #97 graph-current cache fail-closed contract did not install cleanly';
  end if;
end
$issue97_verify_graph_current_cache_fail_closed$;
