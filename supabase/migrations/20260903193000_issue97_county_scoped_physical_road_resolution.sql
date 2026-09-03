-- GitHub #97 — Gate 2: county-scope unresolved occurrence candidates before
-- route-graph uniqueness and permit the narrow direct case where both the
-- physical canonical road and its authoritative identity representation are
-- unique.
--
-- SAFETY BOUNDARY
-- * Explicit source-receipt resolution remains first and unchanged.
-- * The >50-candidate bail remains ahead of this pass and unchanged.
-- * County is matched by state + normalized county name, never county alone.
-- * Null/blank/non-unique county scope never guesses.
-- * Physical-road equivalence uses only current VERIFIED canonical road
--   mappings. Normalized-name equality is never a grouping key here.
-- * Multiple authoritative identity variants for one physical road are NOT
--   arbitrarily collapsed into one identity. They stay held for the existing
--   graph-path solver to disambiguate from topology.
-- * No GPS, provider route, proximity, fuzzy name or nearest-road evidence is
--   used by this migration.

set local statement_timeout='5min';
set local lock_timeout='5s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97)
);

create or replace function
  private_verification.brinesearch_issue97_county_scope_candidate_set(
    p_step_id uuid
  )
returns jsonb
language plpgsql
security definer
set search_path=''
set statement_timeout='5s'
set lock_timeout='500ms'
as $function$
declare
  v_pad_id uuid;
  v_pad_state text;
  v_pad_county text;
  v_state_code text;
  v_county_code text;
  v_county_match_count integer:=0;
  v_pre_count integer:=0;
  v_post_count integer:=0;
  v_mapped_count integer:=0;
  v_physical_count integer:=0;
  v_road_id uuid;
  v_identity_id uuid;
  v_members jsonb:='[]'::jsonb;
  v_status text:='held';
begin
  select route.pad_id,pad.state,nullif(pg_catalog.btrim(pad.county),'')
  into strict v_pad_id,v_pad_state,v_pad_county
  from public.brinesearch_route_prep_steps step
  join public.brinesearch_route_prep route on route.id=step.route_prep_id
  join public.pads pad on pad.id=route.pad_id
  where step.id=p_step_id;

  v_state_code:=
    private_verification.brinesearch_issue97_route_state_code(v_pad_state);

  select count(*)::integer,min(county.county_code)
  into v_county_match_count,v_county_code
  from public.brinesearch_road_graph_counties county
  where county.active
    and county.state_code=v_state_code
    and v_pad_county is not null
    and pg_catalog.lower(pg_catalog.btrim(county.county_name))=
        pg_catalog.lower(v_pad_county);

  select count(distinct candidate.identity_id)::integer
  into v_pre_count
  from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
  where candidate.route_prep_step_id=p_step_id;

  if v_state_code is null then
    return pg_catalog.jsonb_build_object(
      'scope_status','unrecognized_pad_state',
      'resolution_eligible',false,
      'pad_id',v_pad_id,
      'state',v_pad_state,
      'county',v_pad_county,
      'county_match_count',v_county_match_count,
      'pre_scope_identity_count',v_pre_count,
      'post_scope_identity_count',v_pre_count,
      'mapped_identity_count',0,
      'physical_road_count',0,
      'selection_uses_name_similarity',false,
      'selection_uses_nearest_road',false,
      'selection_uses_provider_geometry',false
    );
  end if;

  if v_pad_county is null then
    return pg_catalog.jsonb_build_object(
      'scope_status','null_or_blank_pad_county',
      'resolution_eligible',false,
      'pad_id',v_pad_id,
      'state_code',v_state_code,
      'county',null,
      'county_match_count',v_county_match_count,
      'pre_scope_identity_count',v_pre_count,
      'post_scope_identity_count',v_pre_count,
      'mapped_identity_count',0,
      'physical_road_count',0,
      'selection_uses_name_similarity',false,
      'selection_uses_nearest_road',false,
      'selection_uses_provider_geometry',false
    );
  end if;

  if v_county_match_count<>1 then
    return pg_catalog.jsonb_build_object(
      'scope_status','county_scope_not_unique',
      'resolution_eligible',false,
      'pad_id',v_pad_id,
      'state_code',v_state_code,
      'county',v_pad_county,
      'county_match_count',v_county_match_count,
      'pre_scope_identity_count',v_pre_count,
      'post_scope_identity_count',v_pre_count,
      'mapped_identity_count',0,
      'physical_road_count',0,
      'selection_uses_name_similarity',false,
      'selection_uses_nearest_road',false,
      'selection_uses_provider_geometry',false
    );
  end if;

  -- This function is called only from the unresolved/no-explicit-source branch.
  -- Narrow the current machine candidate set rather than creating new candidates.
  delete from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
  using public.brinesearch_authoritative_road_identities identity
  where candidate.route_prep_step_id=p_step_id
    and identity.id=candidate.identity_id
    and (
      identity.state_code is distinct from v_state_code
      or identity.county_code is distinct from v_county_code
    );

  select count(distinct candidate.identity_id)::integer
  into v_post_count
  from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
  where candidate.route_prep_step_id=p_step_id;

  with scoped as (
    select distinct
      candidate.identity_id,
      identity.source_identity_key,
      identity.display_name,
      identity.road_class,
      identity.route_system,
      identity.route_number,
      identity.route_suffix,
      identity.route_fraction,
      identity.route_extension,
      mapping.road_id,
      mapping.mapping_method,
      private_verification.brinesearch_issue97_mapping_fingerprint(
        candidate.identity_id
      ) as mapping_fingerprint
    from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
    join public.brinesearch_authoritative_road_identities identity
      on identity.id=candidate.identity_id
     and identity.active
     and identity.state_code=v_state_code
     and identity.county_code=v_county_code
     and private_verification.brinesearch_issue97_dataset_scope_current(
       identity.dataset_id,identity.state_code,identity.county_code
     )
    left join public.brinesearch_road_identity_mappings mapping
      on mapping.identity_id=identity.id
     and mapping.mapping_status='verified'
    left join public.brinesearch_roads road
      on road.id=mapping.road_id
     and road.verification_status='verified'
     and not road.candidate_only
    where candidate.route_prep_step_id=p_step_id
  )
  select
    count(distinct identity_id)
      filter(where road_id is not null)::integer,
    count(distinct road_id)
      filter(where road_id is not null)::integer,
    (pg_catalog.array_agg(distinct road_id order by road_id)
      filter(where road_id is not null))[1],
    coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'identity_id',identity_id,
        'source_identity_key',source_identity_key,
        'display_name',display_name,
        'road_class',road_class,
        'route_system',route_system,
        'route_number',route_number,
        'route_suffix',route_suffix,
        'route_fraction',route_fraction,
        'route_extension',route_extension,
        'canonical_road_id',road_id,
        'mapping_method',mapping_method,
        'mapping_fingerprint',mapping_fingerprint
      ) order by source_identity_key
    ) filter(where identity_id is not null),'[]'::jsonb)
  into v_mapped_count,v_physical_count,v_road_id,v_members
  from scoped;

  -- Direct resolution remains stricter than physical-road uniqueness alone.
  -- The occurrence receipt's `resolved` contract requires an authoritative
  -- identity_id, and downstream graph/geometry is identity-specific. If more
  -- than one identity represents the one physical road, do not choose one by
  -- UUID/name/order. Keep those candidates for the existing graph-path solver.
  if v_post_count=1
     and v_mapped_count=1
     and v_physical_count=1
     and v_road_id is not null then
    select candidate.identity_id
    into strict v_identity_id
    from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
    where candidate.route_prep_step_id=p_step_id
    group by candidate.identity_id;
    v_status:='direct_identity_safe';
  elsif v_post_count>1
        and v_mapped_count=v_post_count
        and v_physical_count=1 then
    v_status:='physical_road_unique_identity_variant_unresolved';
  elsif v_post_count=0 then
    v_status:='no_candidate_in_pad_county';
  elsif v_mapped_count<>v_post_count then
    v_status:='unmapped_identity_in_county_candidate_set';
  elsif v_physical_count>1 then
    v_status:='multiple_physical_roads_in_pad_county';
  else
    v_status:='county_scoped_still_unresolved';
  end if;

  return pg_catalog.jsonb_build_object(
    'scope_status',v_status,
    'resolution_eligible',v_status='direct_identity_safe',
    'pad_id',v_pad_id,
    'state_code',v_state_code,
    'county',v_pad_county,
    'county_code',v_county_code,
    'county_match_count',v_county_match_count,
    'pre_scope_identity_count',v_pre_count,
    'post_scope_identity_count',v_post_count,
    'mapped_identity_count',v_mapped_count,
    'physical_road_count',v_physical_count,
    'identity_id',v_identity_id,
    'canonical_road_id',v_road_id,
    'physical_road_group_members',v_members,
    'physical_road_key_method','verified_canonical_road_mapping',
    'normalized_name_grouping_used',false,
    'selection_uses_name_similarity',false,
    'selection_uses_nearest_road',false,
    'selection_uses_provider_geometry',false
  );
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'scope_status','source_step_or_scope_missing',
    'resolution_eligible',false,
    'pre_scope_identity_count',v_pre_count,
    'post_scope_identity_count',v_pre_count,
    'selection_uses_name_similarity',false,
    'selection_uses_nearest_road',false,
    'selection_uses_provider_geometry',false
  );
end
$function$;

revoke all on function
  private_verification.brinesearch_issue97_county_scope_candidate_set(uuid)
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_issue97_county_scope_candidate_set(uuid) is
'Issue #97 Gate 2 fail-closed candidate narrowing. It matches pad state+county to the active graph county registry, removes only out-of-scope unresolved candidates, groups physical roads only through verified canonical mappings, and refuses to invent an authoritative identity when one physical road still has multiple identity variants.';

-- Patch only the final unresolved door in the reviewed occurrence resolver.
-- The exact function digest is pinned by the Aug-26 rollout checkpoints.
do $issue97_gate2_patch_occurrence_resolver$
declare
  v_definition text;
  v_current_md5 text;
  v_start integer;
  v_end_rel integer;
  v_end integer;
  v_old_block text;
  v_new_block text:=$replacement$  else
    v_evidence:=
      private_verification.brinesearch_issue97_county_scope_candidate_set(
        p_step_id
      );
    v_candidate_count:=coalesce(
      (v_evidence->>'post_scope_identity_count')::integer,
      v_candidate_count
    );

    if coalesce((v_evidence->>'resolution_eligible')::boolean,false) then
      v_identity:=(v_evidence->>'identity_id')::uuid;
      v_road:=(v_evidence->>'canonical_road_id')::uuid;

      select identity.source_identity_key,identity.source_digest,
        private_verification.brinesearch_issue97_mapping_fingerprint(identity.id)
      into strict v_source_key,v_source_digest,v_mapping_fingerprint
      from public.brinesearch_authoritative_road_identities identity
      where identity.id=v_identity
        and identity.active
        and private_verification.brinesearch_issue97_dataset_scope_current(
          identity.dataset_id,identity.state_code,identity.county_code
        );

      v_driver:=
        private_verification.brinesearch_issue97_identity_driver_name(v_identity);
      v_aliases:=
        private_verification.brinesearch_issue97_identity_aliases(v_identity,v_road);
      v_status:='resolved';
      v_method:='county_scoped_exact_road';
      v_reason:=null;
      v_evidence:=pg_catalog.jsonb_build_object(
        'proof','state+county scoped unique physical road with unique authoritative identity representation',
        'county_scope',v_evidence,
        'candidate_count',v_candidate_count,
        'canonical_mapping_present',true,
        'selection_uses_name_similarity',false,
        'selection_uses_nearest_road',false,
        'selection_uses_provider_geometry',false
      );
    else
      v_reason:='requires_unique_authoritative_route_graph_path';
      select v_evidence||pg_catalog.jsonb_build_object(
        'candidate_count',v_candidate_count,
        'candidates',coalesce(
          pg_catalog.jsonb_agg(row_data order by row_data->>'source_identity_key'),
          '[]'::jsonb
        )
      ) into v_evidence
      from (
        select pg_catalog.jsonb_build_object(
          'identity_id',identity.id,
          'source_identity_key',identity.source_identity_key,
          'display_name',identity.display_name,
          'county_code',identity.county_code,
          'road_class',identity.road_class,
          'canonical_road_id',max(candidate.canonical_road_id::text),
          'candidate_basis',pg_catalog.jsonb_agg(distinct candidate.candidate_basis)
        ) as row_data
        from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
        join public.brinesearch_authoritative_road_identities identity
          on identity.id=candidate.identity_id
        where candidate.route_prep_step_id=p_step_id
        group by identity.id,identity.source_identity_key,identity.display_name,
          identity.county_code,identity.road_class
        order by identity.source_identity_key
        limit 25
      ) bounded;
    end if;$replacement$;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::
      pg_catalog.regprocedure
  ) into strict v_definition;

  v_current_md5:=pg_catalog.md5(v_definition);
  if v_current_md5<>'0f139df2a01f68722958ff10f1dd6f49' then
    raise exception
      'Issue #97 Gate 2 occurrence resolver drifted before patch: %',
      v_current_md5;
  end if;

  v_start:=pg_catalog.strpos(
    v_definition,
    E'  else\n    v_reason:=''requires_unique_authoritative_route_graph_path'';'
  );
  if v_start<1 then
    raise exception 'Issue #97 Gate 2 final unresolved anchor missing';
  end if;

  v_end_rel:=pg_catalog.strpos(
    pg_catalog.substr(v_definition,v_start),
    E'\n  end if;\n\n  insert into private_verification.brinesearch_route_occurrence_receipts_issue97('
  );
  if v_end_rel<1 then
    raise exception 'Issue #97 Gate 2 receipt boundary missing';
  end if;
  v_end:=v_start+v_end_rel-2;
  v_old_block:=pg_catalog.substr(v_definition,v_start,v_end-v_start+1);

  if (pg_catalog.length(v_definition)-pg_catalog.length(
        pg_catalog.replace(
          v_definition,
          E'  else\n    v_reason:=''requires_unique_authoritative_route_graph_path'';',
          ''
        )
      ))/pg_catalog.length(
        E'  else\n    v_reason:=''requires_unique_authoritative_route_graph_path'';'
      )<>1 then
    raise exception 'Issue #97 Gate 2 final unresolved anchor is not unique';
  end if;

  execute pg_catalog.substr(v_definition,1,v_start-1)
    ||v_new_block
    ||pg_catalog.substr(v_definition,v_end+1);
end
$issue97_gate2_patch_occurrence_resolver$;

revoke all on function
  private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)
from public,anon,authenticated,service_role;

-- Installation contract: Gate 2 changed only the reviewed final unresolved
-- branch; explicit-source and broad-candidate gates remain present. Gate 3 is
-- intentionally not weakened by this migration.
do $issue97_gate2_verify_install$
declare
  v_occurrence text;
  v_route text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::
      pg_catalog.regprocedure
  ) into strict v_occurrence;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::
      pg_catalog.regprocedure
  ) into strict v_route;

  if v_occurrence not like '%county_scoped_exact_road%'
     or v_occurrence not like '%brinesearch_issue97_county_scope_candidate_set%'
     or v_occurrence not like '%v_candidate_count>50%'
     or v_occurrence not like '%explicit_authoritative_source_receipt%'
     or v_occurrence like '%normalized_name_grouping_used'',true%'
  then
    raise exception 'Issue #97 Gate 2 occurrence contract did not install';
  end if;

  if pg_catalog.md5(v_route)<>'8283a543bf42f939296d32e5e5a92b4f' then
    raise exception
      'Issue #97 Gate 2 migration unexpectedly changed route receipt Gate 3 contract';
  end if;
end
$issue97_gate2_verify_install$;
