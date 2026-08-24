-- GitHub #97 — route-occurrence source freshness cache.
--
-- Cologie proved that occurrence reconciliation was re-running the full source-page
-- receipt verifier once per candidate identity/name row. Preserve the exact same
-- freshness contract, but compute it once per authoritative dataset/county scope
-- for each route state and reuse that locked snapshot during the routing transaction.
-- Ingest uses the matching advisory key exclusively; routing holds shared locks so
-- a cached `current=true` scope cannot become stale before the route transaction ends.

create or replace function private_verification.brinesearch_issue97_prepare_scope_current_cache(
  p_state_code text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_state text:=upper(nullif(pg_catalog.btrim(p_state_code),''));
  v_scope record;
  v_loaded boolean:=false;
begin
  if v_state not in ('OH','WV','PA') then
    return;
  end if;

  if pg_catalog.to_regclass('pg_temp.tmp_issue97_scope_current_cache') is null then
    execute 'create temporary table tmp_issue97_scope_current_cache(
      dataset_id uuid not null,
      state_code text not null,
      county_code text not null,
      is_current boolean not null,
      primary key(dataset_id,state_code,county_code)
    ) on commit drop';
  end if;

  execute 'select exists(
    select 1 from pg_temp.tmp_issue97_scope_current_cache where state_code=$1
  )' into v_loaded using v_state;
  if v_loaded then
    return;
  end if;

  for v_scope in
    select scope.dataset_id,scope.state_code,scope.county_code
    from public.brinesearch_road_source_dataset_counties scope
    join public.brinesearch_road_source_datasets d
      on d.id=scope.dataset_id and d.active
    where scope.active and scope.ingest_enabled and scope.state_code=v_state
    order by scope.dataset_id,scope.county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtext(
      'brinesearch:issue97:ingest:'||v_scope.dataset_id::text||':'||v_scope.county_code
    ));
  end loop;

  execute 'insert into pg_temp.tmp_issue97_scope_current_cache(
      dataset_id,state_code,county_code,is_current
    )
    select scope.dataset_id,scope.state_code,scope.county_code,
      private_verification.brinesearch_issue97_dataset_scope_current(
        scope.dataset_id,scope.state_code,scope.county_code
      )
    from public.brinesearch_road_source_dataset_counties scope
    join public.brinesearch_road_source_datasets d
      on d.id=scope.dataset_id and d.active
    where scope.active and scope.ingest_enabled and scope.state_code=$1
    on conflict(dataset_id,state_code,county_code) do update
      set is_current=excluded.is_current'
  using v_state;

  execute 'analyze pg_temp.tmp_issue97_scope_current_cache';
end
$$;

create or replace function private_verification.brinesearch_issue97_dataset_scope_current_cached(
  p_dataset_id uuid,
  p_state_code text,
  p_county_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_current boolean:=false;
begin
  if pg_catalog.to_regclass('pg_temp.tmp_issue97_scope_current_cache') is null then
    return false;
  end if;
  execute 'select coalesce((
    select is_current from pg_temp.tmp_issue97_scope_current_cache
    where dataset_id=$1 and state_code=$2 and county_code=$3
  ),false)'
  into v_current using p_dataset_id,p_state_code,p_county_code;
  return coalesce(v_current,false);
end
$$;

do $issue97_patch_occurrence_scope_cache$
declare
  v_definition text;
  v_anchor text:='v_state:=private_verification.brinesearch_issue97_route_state_code(v_step.route_state);';
  v_anchor_new text:='v_state:=private_verification.brinesearch_issue97_route_state_code(v_step.route_state);
  perform private_verification.brinesearch_issue97_prepare_scope_current_cache(v_state);';
  v_old text:='private_verification.brinesearch_issue97_dataset_scope_current(';
  v_new text:='private_verification.brinesearch_issue97_dataset_scope_current_cached(';
  v_anchor_count integer;
  v_call_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  v_anchor_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_anchor,'')))
    /pg_catalog.length(v_anchor);
  v_call_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_anchor_count<>1 or v_call_count<>5 then
    raise exception 'Issue #97 occurrence freshness-cache patch changed unexpectedly: anchor=% calls=%',
      v_anchor_count,v_call_count;
  end if;

  v_definition:=pg_catalog.replace(v_definition,v_anchor,v_anchor_new);
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_occurrence_scope_cache$;

revoke all on function private_verification.brinesearch_issue97_prepare_scope_current_cache(text)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_dataset_scope_current_cached(uuid,text,text)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)
from public,anon,authenticated,service_role;

comment on function private_verification.brinesearch_issue97_prepare_scope_current_cache(text) is
  'Issue #97 internal route freshness snapshot. Acquires shared ingest-scope transaction locks, verifies each active source scope once, and caches only boolean current/not-current receipts for the route transaction.';
comment on function private_verification.brinesearch_issue97_dataset_scope_current_cached(uuid,text,text) is
  'Issue #97 internal cached source-scope freshness lookup. Fails closed when the locked route-transaction cache is absent.';
comment on function private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid) is
  'Issue #97 occurrence candidate resolver. Authoritative source freshness is verified once per locked state scope and reused; name/designation remain candidate evidence only and never prove an occurrence without exact source/topology evidence.';
