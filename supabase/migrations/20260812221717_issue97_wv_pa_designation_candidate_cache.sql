-- GitHub #97 — cache exact non-Ohio route-designation candidates per state.
--
-- After exact-name lookup was moved to indexed normalized_name equality, the next
-- full-corpus bottleneck was the non-OH designation candidate query. It rebuilt four
-- exact designation tokens for every authoritative identity on every route step.
-- Materialize the exact same token set once per state/transaction and index it.
-- This changes performance only: designation equality remains candidate evidence,
-- never authoritative proof, and fuzzy/name-only/nearest-road resolution stays forbidden.

create or replace function private_verification.brinesearch_issue97_prepare_designation_cache(
  p_state text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_state is null or p_state not in ('WV','PA') then return; end if;

  perform private_verification.brinesearch_issue97_prepare_scope_current_cache(p_state);

  create temp table if not exists tmp_issue97_designation_cache(
    state_code text not null,
    token text not null,
    identity_id uuid not null,
    primary key(state_code,token,identity_id)
  ) on commit drop;

  if exists(select 1 from pg_temp.tmp_issue97_designation_cache where state_code=p_state limit 1) then
    return;
  end if;

  insert into pg_temp.tmp_issue97_designation_cache(state_code,token,identity_id)
  select distinct i.state_code,u.token,i.id
  from public.brinesearch_authoritative_road_identities i
  cross join lateral unnest(array[
    private_verification.brinesearch_issue97_normalize_route_token(
      pg_catalog.concat_ws(' ',i.route_system,i.route_number)
    ),
    private_verification.brinesearch_issue97_normalize_route_token(case i.road_class
      when 'interstate' then 'I-'||i.route_number
      when 'us_route' then 'US-'||i.route_number
      when 'state_route' then 'SR-'||i.route_number
      when 'county' then 'CR-'||i.route_number
      when 'township' then 'TR-'||i.route_number
      else null end),
    private_verification.brinesearch_issue97_normalize_route_token(case i.road_class
      when 'state_route' then 'Route '||i.route_number
      when 'county' then 'County Road '||i.route_number
      when 'township' then 'Township Road '||i.route_number
      else null end),
    private_verification.brinesearch_issue97_normalize_route_token(case
      when i.road_class='state_route' then i.state_code||'-'||i.route_number else null end)
  ]) u(token)
  where i.state_code=p_state and i.active and nullif(i.route_number,'') is not null
    and nullif(u.token,'') is not null
    and private_verification.brinesearch_issue97_dataset_scope_current_cached(
      i.dataset_id,i.state_code,i.county_code
    );
end
$$;

revoke all on function private_verification.brinesearch_issue97_prepare_designation_cache(text)
from public,anon,authenticated,service_role;

do $issue97_patch_wv_pa_designation_candidates$
declare
  v_definition text;
  v_prepare_old constant text := E'  perform private_verification.brinesearch_issue97_prepare_scope_current_cache(v_state);\n';
  v_prepare_new constant text := E'  perform private_verification.brinesearch_issue97_prepare_scope_current_cache(v_state);\n  perform private_verification.brinesearch_issue97_prepare_designation_cache(v_state);\n';
  v_old constant text := E'    from public.brinesearch_authoritative_road_identities i\n    left join public.brinesearch_road_identity_mappings m\n      on m.identity_id=i.id and m.mapping_status=''verified''\n    where i.state_code=v_state and i.active and nullif(i.route_number,'''') is not null\n      and private_verification.brinesearch_issue97_dataset_scope_current_cached(i.dataset_id,i.state_code,i.county_code)\n      and i.drivable_status=''drivable''\n      and (v_step.step_kind=''private_segment''\n        or i.public_access_status=''public''\n        or i.public_access_status=''access'')\n      and v_token=any(array[\n        private_verification.brinesearch_issue97_normalize_route_token(pg_catalog.concat_ws('' '',i.route_system,i.route_number)),\n        private_verification.brinesearch_issue97_normalize_route_token(case i.road_class\n          when ''interstate'' then ''I-''||i.route_number\n          when ''us_route'' then ''US-''||i.route_number\n          when ''state_route'' then ''SR-''||i.route_number\n          when ''county'' then ''CR-''||i.route_number\n          when ''township'' then ''TR-''||i.route_number\n          else null end),\n        private_verification.brinesearch_issue97_normalize_route_token(case i.road_class\n          when ''state_route'' then ''Route ''||i.route_number\n          when ''county'' then ''County Road ''||i.route_number\n          when ''township'' then ''Township Road ''||i.route_number\n          else null end),\n        private_verification.brinesearch_issue97_normalize_route_token(case\n          when i.road_class=''state_route'' then i.state_code||''-''||i.route_number else null end)\n      ])';
  v_new constant text := E'    from pg_temp.tmp_issue97_designation_cache dc\n    join public.brinesearch_authoritative_road_identities i on i.id=dc.identity_id and i.active\n    left join public.brinesearch_road_identity_mappings m\n      on m.identity_id=i.id and m.mapping_status=''verified''\n    where dc.state_code=v_state and dc.token=v_token\n      and i.drivable_status=''drivable''\n      and (v_step.step_kind=''private_segment''\n        or i.public_access_status=''public''\n        or i.public_access_status=''access'')';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  v_count := (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_prepare_old,'')))
    /pg_catalog.length(v_prepare_old);
  if v_count<>1 then
    raise exception 'Issue #97 designation-cache prepare anchor changed: %',v_count;
  end if;

  v_count := (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 WV/PA designation cache query target changed: %',v_count;
  end if;

  v_definition:=pg_catalog.replace(v_definition,v_prepare_old,v_prepare_new);
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_wv_pa_designation_candidates$;

revoke all on function private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)
from public,anon,authenticated,service_role;

do $issue97_verify_wv_pa_designation_candidates$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition not like '%perform private_verification.brinesearch_issue97_prepare_designation_cache(v_state);%'
     or v_definition not like '%from pg_temp.tmp_issue97_designation_cache dc%'
     or v_definition not like '%where dc.state_code=v_state and dc.token=v_token%'
     or v_definition like '%where i.state_code=v_state and i.active and nullif(i.route_number,''''%)'
  then
    raise exception 'Issue #97 WV/PA designation cache did not install cleanly';
  end if;

  if v_definition like '%similarity(%'
     or v_definition like '%<->%'
     or v_definition like '%exact_authoritative_designation_candidate'',true%'
  then
    raise exception 'Issue #97 WV/PA designation cache weakened no-guess semantics';
  end if;
end
$issue97_verify_wv_pa_designation_candidates$;
