\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Read-only raw evidence inventory for researching public-road occurrences
-- shared by current Ascent Ohio pads. Inclusion is not route eligibility: a
-- downstream review must enforce the complete route/source/occurrence/anchor
-- binding contract. This report does not infer connectivity from distance,
-- names, or line crossings. It does not create a reviewed navigation candidate
-- or change route, graph, Google, or cutover authority.
begin transaction isolation level repeatable read read only;
set local statement_timeout='60s';
set local lock_timeout='2s';
set local search_path='pg_catalog';

with current_snapshot as materialized (
  select snapshot.*
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.publication_state='current'
  order by snapshot.source_revision desc
  limit 1
), pad_scope as materialized (
  select
    row.pad_id,row.legacy_id,row.record_revision,row.pad_name,row.company,
    row.state,row.county,row.township,row.structured_road_sequence,
    pg_catalog.md5(coalesce(row.structured_road_sequence,'')) as structured_sequence_digest
  from public.brinesearch_directory_snapshot_rows_v18 row
  join current_snapshot snapshot on snapshot.snapshot_id=row.snapshot_id
  where row.record_type='pad'
    and row.company='Ascent'
    and row.state='Ohio'
    and row.county in ('Belmont','Guernsey','Harrison','Jefferson','Monroe','Noble')
), route_scope as materialized (
  select route.*
  from public.brinesearch_route_prep route
  join pad_scope pad on pad.pad_id=route.pad_id
  where route.active and route.route_group in ('primary','alternate')
), step_rows as materialized (
  select
    step.id as route_prep_step_id,step.route_prep_id,step.step_order,
    step.raw_text,step.normalized_text,step.step_kind,step.road_id,
    occurrence.occurrence_index,occurrence.resolution_status,
    occurrence.resolution_method,occurrence.hold_reason,
    occurrence.identity_id,occurrence.canonical_road_id,
    occurrence.source_identity_key,occurrence.driver_road_name,
    occurrence.source_digest as occurrence_source_digest,
    occurrence.mapping_fingerprint,occurrence.receipt_digest as occurrence_receipt_digest,
    identity.route_system,identity.route_number,identity.road_class,
    identity.public_access_status,identity.drivable_status,
    identity.active as identity_active,identity.source_digest as identity_source_digest,
    private_verification.brinesearch_issue97_dataset_scope_current(
      identity.dataset_id,identity.state_code,identity.county_code
    ) as identity_source_current,
    geometry.occurrence_role,geometry.status as geometry_status,
    geometry.geometry_method,geometry.hold_reason as geometry_hold_reason,
    geometry.road_geometry_digest,geometry.receipt_digest as geometry_receipt_digest
  from route_scope route
  join public.brinesearch_route_prep_steps step
    on step.route_prep_id=route.id and step.active
  left join private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
    on occurrence.route_prep_step_id=step.id
  left join public.brinesearch_authoritative_road_identities identity
    on identity.id=occurrence.identity_id
  left join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
    on geometry.route_prep_step_id=step.id
), transition_rows as materialized (
  select
    transition.route_prep_id,transition.boundary_index,
    transition.left_route_prep_step_id,transition.right_route_prep_step_id,
    transition.left_identity_id,transition.right_identity_id,
    transition.left_road_id,transition.right_road_id,
    transition.status,transition.resolution_method,transition.hold_reason,
    transition.junction_id,transition.anchor_id,transition.anchor_role,
    transition.graph_build_id,transition.graph_digest,
    transition.source_revision_digest,transition.anchor_digest,
    transition.receipt_digest,
    junction.logical_junction_id,junction.stable_junction_key,
    junction.junction_type,junction.verification_status,
    build.status as graph_build_status,
    private_verification.brinesearch_issue97_graph_build_release_current(build.id)
      as graph_build_release_current,
    coalesce(membership.left_membership_count,0) as left_membership_count,
    coalesce(membership.right_membership_count,0) as right_membership_count,
    coalesce(membership.left_exact_current_membership_count,0)
      as left_exact_current_membership_count,
    coalesce(membership.right_exact_current_membership_count,0)
      as right_exact_current_membership_count,
    -- These are raw lookup results only. Do not collapse them into a route or
    -- candidate eligibility flag: that would also need complete occurrence,
    -- geometry, anchor, digest, route-order, and release bindings.
    true as raw_evidence_only
  from private_verification.brinesearch_route_transition_receipts_issue97 transition
  join route_scope route on route.id=transition.route_prep_id
  left join public.brinesearch_road_junctions junction
    on junction.id=transition.junction_id
  left join public.brinesearch_road_graph_builds build
    on build.id=transition.graph_build_id and build.id=junction.build_id
  left join lateral (
    select
      count(*) filter(where member.identity_id=transition.left_identity_id)::integer
        as left_membership_count,
      count(*) filter(where member.identity_id=transition.right_identity_id)::integer
        as right_membership_count,
      count(*) filter(where member.identity_id=transition.left_identity_id
        and member.road_id=transition.left_road_id
        and member_identity.active
        and private_verification.brinesearch_issue97_dataset_scope_current(
          member_identity.dataset_id,member_identity.state_code,member_identity.county_code
        ))::integer as left_exact_current_membership_count,
      count(*) filter(where member.identity_id=transition.right_identity_id
        and member.road_id=transition.right_road_id
        and member_identity.active
        and private_verification.brinesearch_issue97_dataset_scope_current(
          member_identity.dataset_id,member_identity.state_code,member_identity.county_code
        ))::integer as right_exact_current_membership_count
    from public.brinesearch_road_junction_memberships member
    join public.brinesearch_authoritative_road_identities member_identity
      on member_identity.id=member.identity_id
    where member.junction_id=transition.junction_id
      and member.identity_id in (transition.left_identity_id,transition.right_identity_id)
  ) membership on true
), route_rows as materialized (
  select
    route.pad_id,route.id as route_prep_id,route.route_group,route.variant_index,
    route.source_sequence_hash,route.readiness_status,route.issue_codes,
    route.highway_anchor_text,route.highway_anchor_kind,
    reconciliation.route_status,reconciliation.stage,
    reconciliation.road_occurrence_count,reconciliation.resolved_occurrence_count,
    reconciliation.held_occurrence_count,reconciliation.canonical_mapping_count,
    reconciliation.exact_geometry_count,reconciliation.exception_reasons,
    reconciliation.dependency_digest,reconciliation.receipt_digest,
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'routePrepStepId',step.route_prep_step_id,
        'stepOrder',step.step_order,
        'rawText',step.raw_text,
        'normalizedText',step.normalized_text,
        'stepKind',step.step_kind,
        'occurrenceIndex',step.occurrence_index,
        'resolutionStatus',step.resolution_status,
        'resolutionMethod',step.resolution_method,
        'holdReason',step.hold_reason,
        'identityId',step.identity_id,
        'canonicalRoadId',step.canonical_road_id,
        'sourceIdentityKey',step.source_identity_key,
        'driverRoadName',step.driver_road_name,
        'occurrenceSourceDigest',step.occurrence_source_digest,
        'mappingFingerprint',step.mapping_fingerprint,
        'occurrenceReceiptDigest',step.occurrence_receipt_digest,
        'routeSystem',step.route_system,
        'routeNumber',step.route_number,
        'roadClass',step.road_class,
        'publicAccessStatus',step.public_access_status,
        'drivableStatus',step.drivable_status,
        'identityActive',step.identity_active,
        'identitySourceDigest',step.identity_source_digest,
        'identitySourceCurrent',step.identity_source_current,
        'occurrenceRole',step.occurrence_role,
        'geometryStatus',step.geometry_status,
        'geometryMethod',step.geometry_method,
        'geometryHoldReason',step.geometry_hold_reason,
        'roadGeometryDigest',step.road_geometry_digest,
        'geometryReceiptDigest',step.geometry_receipt_digest
      )) order by step.step_order,step.occurrence_index nulls first)
      from step_rows step where step.route_prep_id=route.id
    ),'[]'::jsonb) as steps,
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'boundaryIndex',transition.boundary_index,
        'leftRoutePrepStepId',transition.left_route_prep_step_id,
        'rightRoutePrepStepId',transition.right_route_prep_step_id,
        'leftIdentityId',transition.left_identity_id,
        'rightIdentityId',transition.right_identity_id,
        'leftRoadId',transition.left_road_id,
        'rightRoadId',transition.right_road_id,
        'status',transition.status,
        'resolutionMethod',transition.resolution_method,
        'holdReason',transition.hold_reason,
        'junctionId',transition.junction_id,
        'logicalJunctionId',transition.logical_junction_id,
        'stableJunctionKey',transition.stable_junction_key,
        'junctionType',transition.junction_type,
        'junctionVerificationStatus',transition.verification_status,
        'anchorId',transition.anchor_id,
        'anchorRole',transition.anchor_role,
        'anchorDigest',transition.anchor_digest,
        'graphBuildId',transition.graph_build_id,
        'graphBuildStatus',transition.graph_build_status,
        'graphBuildReleaseCurrent',transition.graph_build_release_current,
        'graphDigest',transition.graph_digest,
        'sourceRevisionDigest',transition.source_revision_digest,
        'leftMembershipCount',transition.left_membership_count,
        'rightMembershipCount',transition.right_membership_count,
        'leftExactCurrentMembershipCount',transition.left_exact_current_membership_count,
        'rightExactCurrentMembershipCount',transition.right_exact_current_membership_count,
        'rawEvidenceOnly',transition.raw_evidence_only,
        'receiptDigest',transition.receipt_digest
      )) order by transition.boundary_index)
      from transition_rows transition where transition.route_prep_id=route.id
    ),'[]'::jsonb) as transitions
  from route_scope route
  left join private_verification.brinesearch_route_reconciliation_receipts_issue97 reconciliation
    on reconciliation.route_prep_id=route.id
), pad_rows as (
  select
    pad.*,
    exists(select 1 from public.brinesearch_driver_google_routes_public google
      where google.pad_id=pad.pad_id) as public_google_published,
    coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(route)
      order by route.route_group,route.variant_index,route.route_prep_id)
      from route_rows route where route.pad_id=pad.pad_id),'[]'::jsonb) as routes
  from pad_scope pad
)
select pg_catalog.jsonb_build_object(
  'schemaVersion',1,
  'artifactKind','ascent_corridor_backtrace_evidence',
  'scope',pg_catalog.jsonb_build_object(
    'snapshotId',snapshot.snapshot_id,
    'sourceRevision',snapshot.source_revision::text,
    'directoryContentSha256',snapshot.content_sha256,
    'company','Ascent',
    'state','Ohio',
    'counties',pg_catalog.jsonb_build_array(
      'Belmont','Guernsey','Harrison','Jefferson','Monroe','Noble'
    ),
    'padCount',(select count(*) from pad_rows)
  ),
  'pads',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(pad)
    order by pad.county,pad.pad_name,pad.pad_id) from pad_rows pad),'[]'::jsonb),
  'authorityEffect',pg_catalog.jsonb_build_object(
    'reviewedHandoffGranted',false,
    'graphRouteApproved',false,
    'publicGooglePublicationChanged',false,
    'cutoverChanged',false,
    'productionWrites',0
  ),
  'limitations',pg_catalog.jsonb_build_object(
    'rawEvidenceOnly',true,
    'candidateEligibilityDerived',false,
    'wholeRoadIdentityProvesSharedSegment',false,
    'distanceProvesConnectivity',false,
    'routeOrderProvenByThisExport',false
  )
) as ascent_corridor_backtrace_evidence
from current_snapshot snapshot;

rollback;
