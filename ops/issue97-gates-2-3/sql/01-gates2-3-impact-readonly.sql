-- BRINESEARCH V18 / Issue #97 Gates 2 + 3
-- READ-ONLY impact model. No refresh functions are called and no rows are changed.
\pset pager off
\set ON_ERROR_STOP on

-- Gate 2: measure what state+county scoping actually does to currently held
-- occurrence candidate sets. Physical-road uniqueness is intentionally based
-- only on VERIFIED canonical road mappings; normalized-name equality alone is
-- not accepted as a physical-road equivalence proof.
with occurrence_scope as (
  select
    receipt.route_prep_step_id,
    receipt.route_prep_id,
    receipt.pad_id,
    receipt.occurrence_index,
    receipt.raw_text,
    receipt.normalized_text,
    receipt.step_kind,
    receipt.hold_reason,
    private_verification.brinesearch_issue97_route_state_code(pad.state) as state_code,
    nullif(pg_catalog.btrim(pad.county),'') as pad_county,
    count(county.*) as county_match_count,
    min(county.county_code) as county_code
  from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  join public.pads pad on pad.id=receipt.pad_id
  left join public.brinesearch_road_graph_counties county
    on county.active
   and county.state_code=private_verification.brinesearch_issue97_route_state_code(pad.state)
   and pg_catalog.lower(pg_catalog.btrim(county.county_name))=
       pg_catalog.lower(pg_catalog.btrim(pad.county))
  where receipt.resolution_status='held'
    and receipt.hold_reason='requires_unique_authoritative_route_graph_path'
  group by receipt.route_prep_step_id,receipt.route_prep_id,receipt.pad_id,
    receipt.occurrence_index,receipt.raw_text,receipt.normalized_text,
    receipt.step_kind,receipt.hold_reason,pad.state,pad.county
), pre_candidates as (
  select scope.route_prep_step_id,
    count(distinct candidate.identity_id)::integer as pre_scope_identity_count
  from occurrence_scope scope
  left join private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
    on candidate.route_prep_step_id=scope.route_prep_step_id
  group by scope.route_prep_step_id
), county_candidates as (
  select distinct
    scope.route_prep_step_id,
    candidate.identity_id,
    identity.source_identity_key,
    identity.display_name,
    identity.road_class,
    identity.route_system,
    identity.route_number,
    identity.route_suffix,
    identity.route_fraction,
    identity.route_extension,
    mapping.road_id as verified_canonical_road_id,
    mapping.mapping_method,
    mapping.mapping_fingerprint
  from occurrence_scope scope
  join private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
    on candidate.route_prep_step_id=scope.route_prep_step_id
  join public.brinesearch_authoritative_road_identities identity
    on identity.id=candidate.identity_id
   and identity.active
   and identity.state_code=scope.state_code
   and identity.county_code=scope.county_code
  left join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=identity.id
   and mapping.mapping_status='verified'
  where scope.county_match_count=1
), county_aggregate as (
  select
    scope.route_prep_step_id,
    count(distinct candidate.identity_id)::integer as post_scope_identity_count,
    count(distinct candidate.identity_id)
      filter(where candidate.verified_canonical_road_id is not null)::integer
      as mapped_identity_count,
    count(distinct candidate.verified_canonical_road_id)
      filter(where candidate.verified_canonical_road_id is not null)::integer
      as physical_road_count,
    min(candidate.verified_canonical_road_id) as sole_physical_road_id,
    coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'identity_id',candidate.identity_id,
        'source_identity_key',candidate.source_identity_key,
        'display_name',candidate.display_name,
        'road_class',candidate.road_class,
        'route_system',candidate.route_system,
        'route_number',candidate.route_number,
        'route_suffix',candidate.route_suffix,
        'route_fraction',candidate.route_fraction,
        'route_extension',candidate.route_extension,
        'canonical_road_id',candidate.verified_canonical_road_id,
        'mapping_method',candidate.mapping_method,
        'mapping_fingerprint',candidate.mapping_fingerprint
      ) order by candidate.source_identity_key
    ) filter(where candidate.identity_id is not null),'[]'::jsonb) as member_evidence
  from occurrence_scope scope
  left join county_candidates candidate
    on candidate.route_prep_step_id=scope.route_prep_step_id
  group by scope.route_prep_step_id
), classified as (
  select scope.*,
    coalesce(pre.pre_scope_identity_count,0) as pre_scope_identity_count,
    coalesce(post.post_scope_identity_count,0) as post_scope_identity_count,
    coalesce(post.mapped_identity_count,0) as mapped_identity_count,
    coalesce(post.physical_road_count,0) as physical_road_count,
    post.sole_physical_road_id,
    post.member_evidence,
    case
      when scope.state_code is null then 'held_unrecognized_state'
      when scope.pad_county is null then 'held_null_county'
      when scope.county_match_count<>1 then 'held_county_scope_not_unique'
      when coalesce(post.post_scope_identity_count,0)=0 then 'held_no_candidate_in_pad_county'
      when post.mapped_identity_count<>post.post_scope_identity_count
        then 'held_unmapped_identity_in_county_candidate_set'
      when post.physical_road_count=1 and post.post_scope_identity_count=1
        then 'direct_identity_safe_single_physical_road'
      when post.physical_road_count=1 and post.post_scope_identity_count>1
        then 'physical_road_unique_but_identity_variant_unresolved'
      when post.physical_road_count>1 then 'held_multiple_physical_roads_in_county'
      else 'held_other'
    end as gate2_class
  from occurrence_scope scope
  join pre_candidates pre using(route_prep_step_id)
  join county_aggregate post using(route_prep_step_id)
)
select gate2_class,
  count(*) as occurrences,
  count(distinct pad_id) as pads,
  min(pre_scope_identity_count) as min_pre_candidates,
  max(pre_scope_identity_count) as max_pre_candidates,
  min(post_scope_identity_count) as min_post_candidates,
  max(post_scope_identity_count) as max_post_candidates
from classified
group by gate2_class
order by occurrences desc,gate2_class;

-- Requested Gate 2 pressure examples. This reveals whether the same normalized
-- token becomes one physical road after county scoping while preserving the
-- identity variants that still matter to graph geometry.
with requested(token) as (
  values ('SR-647'),('Route 7'),('CR-28'),('TR-120'),('CR-11')
), target as (
  select
    request.token,
    private_verification.brinesearch_issue97_normalize_route_token(request.token)
      as normalized_token
  from requested request
), candidates as (
  select target.token,target.normalized_token,identity.*,
    mapping.road_id as verified_canonical_road_id,
    mapping.mapping_method
  from target
  join public.brinesearch_authoritative_road_identities identity
    on identity.active and identity.drivable_status='drivable'
   and (
     private_verification.brinesearch_issue97_normalize_route_token(identity.display_name)=target.normalized_token
     or target.normalized_token=any(array[
       private_verification.brinesearch_issue97_normalize_route_token(
         pg_catalog.concat_ws(' ',identity.route_system,identity.route_number)
       ),
       private_verification.brinesearch_issue97_normalize_route_token(case identity.road_class
         when 'interstate' then 'I-'||identity.route_number
         when 'us_route' then 'US-'||identity.route_number
         when 'state_route' then 'SR-'||identity.route_number
         when 'county' then 'CR-'||identity.route_number
         when 'township' then 'TR-'||identity.route_number
         else null end),
       private_verification.brinesearch_issue97_normalize_route_token(case identity.road_class
         when 'state_route' then 'Route '||identity.route_number
         when 'county' then 'County Road '||identity.route_number
         when 'township' then 'Township Road '||identity.route_number
         else null end)
     ])
   )
  left join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=identity.id and mapping.mapping_status='verified'
)
select token,state_code,county_code,
  count(distinct id) as identity_candidates,
  count(distinct verified_canonical_road_id)
    filter(where verified_canonical_road_id is not null) as mapped_physical_roads,
  count(distinct id) filter(where verified_canonical_road_id is null)
    as unmapped_identities,
  pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'identityId',id,'sourceIdentityKey',source_identity_key,
      'displayName',display_name,'routeNumber',route_number,
      'routeSuffix',route_suffix,'routeFraction',route_fraction,
      'routeExtension',route_extension,'canonicalRoadId',verified_canonical_road_id,
      'mappingMethod',mapping_method
    ) order by source_identity_key
  ) as candidates
from candidates
group by token,state_code,county_code
order by token,state_code,county_code;

-- Gate 3: identify the exact set that the original proposal wants to exempt.
-- This report does not call refresh_route_receipt and does not change any
-- receipt. It also shows why generic route_ready is not equivalent to the
-- existing named public-core contract.
with per_route as (
  select
    route.id as route_prep_id,
    route.pad_id,
    route.route_group,
    route.variant_index,
    count(receipt.*)::integer as occurrence_count,
    count(receipt.*) filter(where receipt.resolution_status='resolved')::integer
      as resolved_count,
    count(receipt.*) filter(where receipt.resolution_status='held')::integer
      as held_count,
    count(receipt.*) filter(where
      receipt.resolution_status='held'
      and receipt.hold_reason=
        'terminal_private_access_destination_requires_authoritative_geometry'
      and private_verification.brinesearch_issue97_terminal_private_access_destination(
        receipt.route_prep_step_id
      )
    )::integer as terminal_private_hold_count,
    count(receipt.*) filter(where
      receipt.resolution_status='held'
      and not (
        receipt.hold_reason=
          'terminal_private_access_destination_requires_authoritative_geometry'
        and private_verification.brinesearch_issue97_terminal_private_access_destination(
          receipt.route_prep_step_id
        )
      )
    )::integer as other_hold_count,
    count(receipt.*) filter(where
      receipt.resolution_status='resolved' and receipt.canonical_road_id is not null
    )::integer as canonical_count,
    pad.latitude,pad.longitude,
    verification.gps_verified,
    route_receipt.route_status as current_route_status,
    route_receipt.stage as current_stage,
    route_receipt.exact_geometry_count,
    route_receipt.google_manifest_status
  from public.brinesearch_route_prep route
  join public.pads pad on pad.id=route.pad_id
  left join public.pad_verification_status verification on verification.pad_id=route.pad_id
  left join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    on receipt.route_prep_id=route.id
  left join private_verification.brinesearch_route_reconciliation_receipts_issue97 route_receipt
    on route_receipt.route_prep_id=route.id
  where route.active
  group by route.id,route.pad_id,route.route_group,route.variant_index,
    pad.latitude,pad.longitude,verification.gps_verified,
    route_receipt.route_status,route_receipt.stage,
    route_receipt.exact_geometry_count,route_receipt.google_manifest_status
), eligible_shape as (
  select *,
    terminal_private_hold_count=1
    and other_hold_count=0
    and held_count=1
    and resolved_count=occurrence_count-1
    and canonical_count=resolved_count
    and gps_verified
    and latitude between -90 and 90
    and longitude between -180 and 180
    and not (latitude=0 and longitude=0) as original_gate3_shape
  from per_route
)
select
  original_gate3_shape,
  current_route_status,
  current_stage,
  count(*) as routes,
  count(distinct pad_id) as pads,
  min(occurrence_count) as min_occurrences,
  max(occurrence_count) as max_occurrences,
  min(exact_geometry_count) as min_exact_geometry,
  max(exact_geometry_count) as max_exact_geometry
from eligible_shape
group by original_gate3_shape,current_route_status,current_stage
order by original_gate3_shape desc,routes desc;

select
  final_leg_mode,
  count(*) as private_named_releases,
  count(*) filter(where revoked_at is null) as active_private_named_releases
from private_verification.brinesearch_v18_named_approach_releases
group by final_leg_mode
order by final_leg_mode;
