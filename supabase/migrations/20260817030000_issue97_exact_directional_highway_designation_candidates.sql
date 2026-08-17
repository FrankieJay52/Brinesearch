-- Issue #97: a saved highway designation may carry a trailing travel direction
-- (for example SR-78E). ODOT identities bind the route, not that direction.
-- Add those exact class/system/number matches as candidates only; the existing
-- authoritative graph-path solver remains the sole identity resolver.

do $issue97_patch_directional_designation_candidates$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  if pg_catalog.md5(v_definition)<>'72c16f75efdb356dc2b6d15c691e944c' then
    raise exception 'Issue #97 occurrence-candidate definition drifted before directional-designation patch';
  end if;

  v_old:=$issue97_directional_old$
  end if;

  select count(distinct identity_id),count(distinct identity_id) filter(where strong_proof)
  into v_candidate_count,v_strong_count
$issue97_directional_old$;

  v_new:=$issue97_directional_new$
  end if;

  if v_state is not null
     and v_step.step_kind in ('interstate','us_route','state_route') then
    insert into private_verification.brinesearch_route_occurrence_candidates_issue97(
      route_prep_step_id,identity_id,canonical_road_id,candidate_basis,strong_proof,
      source_identity_key,source_digest,mapping_fingerprint,evidence
    )
    select distinct p_step_id,i.id,m.road_id,
      'exact_authoritative_designation_candidate',false,
      i.source_identity_key,i.source_digest,
      private_verification.brinesearch_issue97_mapping_fingerprint(i.id),
      pg_catalog.jsonb_build_object(
        'token',v_token,'route_system',i.route_system,'route_number',i.route_number,
        'travel_direction',directional.travel_direction,
        'proof','exact directional highway system/class/number candidate',
        'warning','travel direction is retained evidence; graph topology remains required'
      )
    from public.brinesearch_authoritative_road_identities i
    left join public.brinesearch_road_identity_mappings m
      on m.identity_id=i.id and m.mapping_status='verified'
    cross join lateral (
      select parsed[1] as prefix,
        nullif(pg_catalog.ltrim(parsed[2],'0'),'') as route_number,
        parsed[3] as travel_direction
      from pg_catalog.regexp_match(
        v_token,'^(i|ir|us|oh|sr)[[:space:]]+0*([0-9]+)([nsew])$'
      ) parsed
    ) directional
    where i.state_code=v_state and i.active
      and private_verification.brinesearch_issue97_dataset_scope_current_cached(
        i.dataset_id,i.state_code,i.county_code
      )
      and i.drivable_status='drivable'
      and i.public_access_status in ('public','access')
      and i.road_class=v_step.step_kind
      and i.route_system=case
        when directional.prefix in ('i','ir') then 'IR'
        when directional.prefix='us' then 'US'
        else 'SR' end
      and nullif(pg_catalog.ltrim(i.route_number,'0'),'')=directional.route_number
    on conflict(route_prep_step_id,identity_id,candidate_basis) do update set
      canonical_road_id=excluded.canonical_road_id,source_digest=excluded.source_digest,
      mapping_fingerprint=excluded.mapping_fingerprint,evidence=excluded.evidence,updated_at=now();
  end if;

  select count(distinct identity_id),count(distinct identity_id) filter(where strong_proof)
  into v_candidate_count,v_strong_count
$issue97_directional_new$;

  if pg_catalog.strpos(v_definition,v_old)=0 then
    raise exception 'Issue #97 directional-designation candidate patch point missing';
  end if;
  if pg_catalog.strpos(
       pg_catalog.substr(
         v_definition,pg_catalog.strpos(v_definition,v_old)+pg_catalog.length(v_old)
       ),v_old
     )<>0 then
    raise exception 'Issue #97 directional-designation candidate patch point is ambiguous';
  end if;

  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_directional_designation_candidates$;

revoke all on function private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)
from public,anon,authenticated,service_role;

do $issue97_directional_designation_postflight$
declare
  v_definition text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  );
begin
  if v_definition not like '%exact directional highway system/class/number candidate%'
     or v_definition not like '%travel direction is retained evidence; graph topology remains required%'
     or v_definition not like '%^(i|ir|us|oh|sr)[[:space:]]+0*([0-9]+)([nsew])$%'
     or v_definition not like '%i.road_class=v_step.step_kind%'
     or v_definition not like '%i.route_system=case%'
     or v_definition not like '%brinesearch_issue97_dataset_scope_current_cached(%'
     or v_definition ~* 'similarity\s*\(|<->|st_dwithin|st_distance'
     or has_function_privilege('public',
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)','EXECUTE')
     or has_function_privilege('anon',
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)','EXECUTE')
     or has_function_privilege('authenticated',
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)','EXECUTE')
     or has_function_privilege('service_role',
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)','EXECUTE') then
    raise exception 'Issue #97 directional-designation candidate postflight failed';
  end if;
end
$issue97_directional_designation_postflight$;
