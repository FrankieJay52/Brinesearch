-- GitHub #97 — make WV/PA exact-name occurrence candidate discovery use indexed
-- normalized-name hits before source-currentness checks.
--
-- The full corpus reconciliation exposed a production statement timeout in the
-- non-Ohio exact-name candidate path. That path filtered state-wide identities
-- and invoked dataset-scope currentness before the exact-name predicate could
-- reduce the row set. This migration repairs only derived normalized-name fields
-- and changes candidate discovery order. It does not make exact-name evidence
-- authoritative: strong_proof remains false and the existing unique graph-path
-- resolver still decides exact-or-held disposition. No fuzzy/name-only/nearest
-- road resolution is introduced.

update public.brinesearch_authoritative_road_identities i
set normalized_name=private_verification.brinesearch_issue97_normalize_route_token(i.display_name)
where i.state_code in ('WV','PA') and i.active
  and coalesce(i.normalized_name,'') is distinct from
      private_verification.brinesearch_issue97_normalize_route_token(i.display_name);

update public.brinesearch_authoritative_road_names n
set normalized_name=private_verification.brinesearch_issue97_normalize_route_token(n.road_name),
    updated_at=now()
from public.brinesearch_authoritative_road_identities i
where i.id=n.identity_id and i.state_code in ('WV','PA') and i.active and n.active
  and coalesce(n.normalized_name,'') is distinct from
      private_verification.brinesearch_issue97_normalize_route_token(n.road_name);

create index if not exists brinesearch_authoritative_identities_state_exact_name_issue97_idx
  on public.brinesearch_authoritative_road_identities(state_code,normalized_name,id)
  where active;

create index if not exists brinesearch_authoritative_names_exact_issue97_idx
  on public.brinesearch_authoritative_road_names(normalized_name,identity_id)
  where active;

do $issue97_patch_wv_pa_indexed_exact_name_candidates$
declare
  v_definition text;
  v_old text:=E'    from public.brinesearch_authoritative_road_identities i\n'
    ||E'    left join public.brinesearch_road_identity_mappings m\n'
    ||E'      on m.identity_id=i.id and m.mapping_status=''verified''\n'
    ||E'    where i.state_code=v_state and i.active\n'
    ||E'      and private_verification.brinesearch_issue97_dataset_scope_current_cached(i.dataset_id,i.state_code,i.county_code)\n'
    ||E'      and i.drivable_status=''drivable''\n'
    ||E'      and (v_step.step_kind=''private_segment''\n'
    ||E'        or i.public_access_status=''public''\n'
    ||E'        or i.public_access_status=''access'')\n'
    ||E'      and (\n'
    ||E'        i.normalized_name=v_token\n'
    ||E'        or exists(\n'
    ||E'          select 1 from public.brinesearch_authoritative_road_names n\n'
    ||E'          where n.identity_id=i.id and n.active\n'
    ||E'            and (n.valid_from is null or n.valid_from<=now())\n'
    ||E'            and (n.valid_to is null or n.valid_to>now())\n'
    ||E'            and n.normalized_name=v_token\n'
    ||E'            and private_verification.brinesearch_issue97_dataset_scope_current_cached(\n'
    ||E'              n.source_dataset_id,i.state_code,i.county_code\n'
    ||E'            )\n'
    ||E'        )\n'
    ||E'      )\n';
  v_new text:=E'    from (\n'
    ||E'      select i.id as identity_id\n'
    ||E'      from public.brinesearch_authoritative_road_identities i\n'
    ||E'      where i.state_code=v_state and i.active and i.normalized_name=v_token\n'
    ||E'      union\n'
    ||E'      select n.identity_id\n'
    ||E'      from public.brinesearch_authoritative_road_names n\n'
    ||E'      join public.brinesearch_authoritative_road_identities i\n'
    ||E'        on i.id=n.identity_id and i.state_code=v_state and i.active\n'
    ||E'      where n.active and n.normalized_name=v_token\n'
    ||E'        and (n.valid_from is null or n.valid_from<=now())\n'
    ||E'        and (n.valid_to is null or n.valid_to>now())\n'
    ||E'        and private_verification.brinesearch_issue97_dataset_scope_current_cached(\n'
    ||E'          n.source_dataset_id,i.state_code,i.county_code\n'
    ||E'        )\n'
    ||E'    ) hit\n'
    ||E'    join public.brinesearch_authoritative_road_identities i\n'
    ||E'      on i.id=hit.identity_id and i.state_code=v_state and i.active\n'
    ||E'    left join public.brinesearch_road_identity_mappings m\n'
    ||E'      on m.identity_id=i.id and m.mapping_status=''verified''\n'
    ||E'    where private_verification.brinesearch_issue97_dataset_scope_current_cached(i.dataset_id,i.state_code,i.county_code)\n'
    ||E'      and i.drivable_status=''drivable''\n'
    ||E'      and (v_step.step_kind=''private_segment''\n'
    ||E'        or i.public_access_status=''public''\n'
    ||E'        or i.public_access_status=''access'')\n';
begin
  select pg_catalog.pg_get_functiondef('private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure) into v_definition;
  if pg_catalog.strpos(v_definition,v_old)=0 then raise exception 'Issue #97 WV/PA indexed exact-name patch target not found'; end if;
  if pg_catalog.strpos(pg_catalog.substr(v_definition,pg_catalog.strpos(v_definition,v_old)+1),v_old)>0 then raise exception 'Issue #97 WV/PA indexed exact-name patch target is not unique'; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_wv_pa_indexed_exact_name_candidates$;

do $issue97_verify_wv_pa_indexed_exact_name_candidates$
declare v_definition text;
begin
  if exists(select 1 from public.brinesearch_authoritative_road_identities i where i.state_code in ('WV','PA') and i.active and coalesce(i.normalized_name,'') is distinct from private_verification.brinesearch_issue97_normalize_route_token(i.display_name)) or exists(select 1 from public.brinesearch_authoritative_road_names n join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id where i.state_code in ('WV','PA') and i.active and n.active and coalesce(n.normalized_name,'') is distinct from private_verification.brinesearch_issue97_normalize_route_token(n.road_name)) then raise exception 'Issue #97 WV/PA normalized-name repair did not converge'; end if;
  select pg_catalog.pg_get_functiondef('private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure) into v_definition;
  if v_definition not like '%where i.state_code=v_state and i.active and i.normalized_name=v_token%' or v_definition not like '%where n.active and n.normalized_name=v_token%' or v_definition not like '%join public.brinesearch_authoritative_road_identities i%on i.id=hit.identity_id and i.state_code=v_state and i.active%' or v_definition like '%similarity(%' or v_definition like '%nearest_road_used'',true%' then raise exception 'Issue #97 WV/PA indexed exact-name candidate contract did not install cleanly'; end if;
end
$issue97_verify_wv_pa_indexed_exact_name_candidates$;
