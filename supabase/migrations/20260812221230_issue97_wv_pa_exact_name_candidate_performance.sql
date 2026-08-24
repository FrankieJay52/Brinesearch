-- GitHub #97 — WV/PA exact-name candidate performance without changing semantics.
--
-- Full dark corpus reconciliation timed out in the non-Ohio candidate branch because
-- it normalized every authoritative display/name row at query time. The authoritative
-- tables already carry indexed normalized_name values. Current production drift is
-- limited to trailing whitespace only, so normalize those rows to the exact current
-- issue97 token function, then switch the non-OH candidate lookup to indexed equality.
--
-- This remains candidate evidence only. It does NOT turn exact name equality into
-- authoritative proof and introduces no fuzzy, route-number-only, or nearest-road
-- resolution.

do $issue97_wv_pa_normalized_name_safety$
declare
  v_bad_identity integer;
  v_bad_name integer;
begin
  select count(*)::integer into v_bad_identity
  from public.brinesearch_authoritative_road_identities i
  where i.active and i.state_code in ('WV','PA')
    and i.normalized_name is distinct from
      private_verification.brinesearch_issue97_normalize_route_token(i.display_name)
    and pg_catalog.btrim(i.normalized_name) is distinct from
      private_verification.brinesearch_issue97_normalize_route_token(i.display_name);

  select count(*)::integer into v_bad_name
  from public.brinesearch_authoritative_road_names n
  join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
  where n.active and i.active and i.state_code in ('WV','PA')
    and n.normalized_name is distinct from
      private_verification.brinesearch_issue97_normalize_route_token(n.road_name)
    and pg_catalog.btrim(n.normalized_name) is distinct from
      private_verification.brinesearch_issue97_normalize_route_token(n.road_name);

  if v_bad_identity<>0 or v_bad_name<>0 then
    raise exception 'Issue #97 WV/PA normalized-name drift is not trim-only: identities %, names %',
      v_bad_identity,v_bad_name;
  end if;
end
$issue97_wv_pa_normalized_name_safety$;

update public.brinesearch_authoritative_road_identities i
set normalized_name=private_verification.brinesearch_issue97_normalize_route_token(i.display_name)
where i.active and i.state_code in ('WV','PA')
  and i.normalized_name is distinct from
    private_verification.brinesearch_issue97_normalize_route_token(i.display_name);

update public.brinesearch_authoritative_road_names n
set normalized_name=private_verification.brinesearch_issue97_normalize_route_token(n.road_name),
    updated_at=pg_catalog.now()
from public.brinesearch_authoritative_road_identities i
where i.id=n.identity_id and n.active and i.active and i.state_code in ('WV','PA')
  and n.normalized_name is distinct from
    private_verification.brinesearch_issue97_normalize_route_token(n.road_name);

create index if not exists brinesearch_authoritative_identities_state_exact_name_issue97_idx
on public.brinesearch_authoritative_road_identities(state_code,normalized_name,id)
where active;

do $issue97_patch_wv_pa_exact_candidate_lookup$
declare
  v_definition text;
  v_old_identity constant text := 'private_verification.brinesearch_issue97_normalize_route_token(i.display_name)=v_token';
  v_old_name constant text := 'private_verification.brinesearch_issue97_normalize_route_token(n.road_name)=v_token';
  v_identity_count integer;
  v_name_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  v_identity_count := (
    pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_identity,''))
  )/pg_catalog.length(v_old_identity);
  v_name_count := (
    pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_name,''))
  )/pg_catalog.length(v_old_name);

  if v_identity_count<>1 or v_name_count<>1 then
    raise exception 'Issue #97 WV/PA exact-candidate patch target changed: identity %, name %',
      v_identity_count,v_name_count;
  end if;

  v_definition:=pg_catalog.replace(v_definition,v_old_identity,'i.normalized_name=v_token');
  v_definition:=pg_catalog.replace(v_definition,v_old_name,'n.normalized_name=v_token');
  execute v_definition;
end
$issue97_patch_wv_pa_exact_candidate_lookup$;

-- Preserve the resolver as an internal/service process only.
revoke all on function private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)
from public,anon,authenticated,service_role;

-- Executable invariants: materialized tokens exactly match runtime semantics and
-- the composed resolver has no per-row normalization left in the non-OH path.
do $issue97_verify_wv_pa_exact_candidate_lookup$
declare
  v_identity_mismatch integer;
  v_name_mismatch integer;
  v_definition text;
begin
  select count(*)::integer into v_identity_mismatch
  from public.brinesearch_authoritative_road_identities i
  where i.active and i.state_code in ('WV','PA')
    and i.normalized_name is distinct from
      private_verification.brinesearch_issue97_normalize_route_token(i.display_name);

  select count(*)::integer into v_name_mismatch
  from public.brinesearch_authoritative_road_names n
  join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
  where n.active and i.active and i.state_code in ('WV','PA')
    and n.normalized_name is distinct from
      private_verification.brinesearch_issue97_normalize_route_token(n.road_name);

  if v_identity_mismatch<>0 or v_name_mismatch<>0 then
    raise exception 'Issue #97 WV/PA materialized exact-name tokens mismatch: identities %, names %',
      v_identity_mismatch,v_name_mismatch;
  end if;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%brinesearch_issue97_normalize_route_token(i.display_name)=v_token%'
     or v_definition like '%brinesearch_issue97_normalize_route_token(n.road_name)=v_token%'
     or (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,'i.normalized_name=v_token','')))
        /pg_catalog.length('i.normalized_name=v_token')<>2
     or (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,'n.normalized_name=v_token','')))
        /pg_catalog.length('n.normalized_name=v_token')<>2
  then
    raise exception 'Issue #97 WV/PA indexed exact-name candidate lookup did not install cleanly';
  end if;

  if v_definition like '%similarity(%'
     or v_definition like '%<->%'
     or v_definition like '%exact_authoritative_name_candidate'',true%'
  then
    raise exception 'Issue #97 WV/PA performance patch weakened no-guess candidate semantics';
  end if;
end
$issue97_verify_wv_pa_exact_candidate_lookup$;
