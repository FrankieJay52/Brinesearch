import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');

const [
  source, boundaryEditor, spatialRoadSelection, publishLockdown,
  legacyInteractive, orderRaw, geometryMigration, draftHelpers
] = await Promise.all([
  read(path.join(v17Root, 'src/parts/21i-road-manager-structured-route-foundation-issue69.js')),
  read(path.join(v17Root, 'src/parts/21j-road-manager-route-boundaries-issue69.js')),
  read(path.join(v17Root, 'src/parts/21k-road-manager-spatial-road-selection-issue69.js')),
  read(path.join(v17Root, 'src/parts/21l-road-manager-structured-publish-lockdown-issue69.js')),
  read(path.join(v17Root, 'src/parts/21e-road-manager-interactive-route-map-v17327.js')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(projectRoot, 'supabase/migrations/20260810165718_v17329_structured_route_step_geometry.sql')),
  read(path.join(projectRoot, 'supabase/migrations/20260811031420_issue69_route_geometry_draft_helpers.sql'))
]);

const order = JSON.parse(orderRaw).parts || [];
const foundation = '21i-road-manager-structured-route-foundation-issue69.js';
const boundaries = '21j-road-manager-route-boundaries-issue69.js';
const spatialSelection = '21k-road-manager-spatial-road-selection-issue69.js';
const lockdown = '21l-road-manager-structured-publish-lockdown-issue69.js';
assert.ok(order.includes(foundation), '#69 structured route layer is not assembled.');
assert.ok(order.includes(boundaries), '#69 boundary editor is not assembled.');
assert.ok(order.includes(spatialSelection), '#69 spatial road-selection guard is not assembled.');
assert.ok(order.includes(lockdown), '#69 structured publish lockdown is not assembled.');
assert.ok(order.indexOf(foundation) > order.indexOf('21h-road-manager-step-tap-lookup-bound-v17328.js'), '#69 must shadow the legacy V17.3.27/V17.3.28 occurrence/publish path.');
assert.ok(order.indexOf(boundaries) > order.indexOf(foundation), '#69 boundary tools must load after the structured step model.');
assert.ok(order.indexOf(spatialSelection) > order.indexOf(boundaries), '#69 spatial road identity guard must load after legacy map-tap road matching.');
assert.ok(order.indexOf(lockdown) > order.indexOf(spatialSelection), '#69 publish lockdown must load after all legacy interactive map code.');

for (const token of [
  'brinesearch_get_structured_route_steps',
  'brinesearch_publish_structured_route',
  'p_expected_revision',
  'routeStepId',
  'startCoordinate',
  'endCoordinate',
  'clippedGeometry',
  'inboundTurn',
  'geometryVersion',
  'routeStepTraceExactOccurrenceIssue69',
  'routeStepSnapExactOccurrenceIssue69',
  'routeInteractiveRenderExactOccurrencesIssue69',
  'Exact geometry unresolved',
  'Publish exact route & update directions'
]) assert.ok(source.includes(token), `#69 foundation missing ${token}`);

for (const forbidden of [
  'routeBacktraceSimilarityV17325(segment.roadName',
  'routeBacktraceClosestVertexV17325([padCoords.lng, padCoords.lat]'
]) assert.ok(!source.includes(forbidden), `#69 exact occurrence layer reintroduced forbidden heuristic: ${forbidden}`);

for (const token of [
  'route_step_id', 'road_id', 'start_coordinate', 'end_coordinate',
  'clipped_geometry', 'turn_direction', 'inbound_turn', 'geometry_status'
]) assert.ok(source.includes(token), `#69 publish payload missing ${token}`);
assert.ok(source.includes('needs an explicit reverse-route turn'), '#69 publish must require occurrence-specific reverse turns instead of guessing.');

for (const token of [
  'Set start boundary',
  'Set end boundary',
  'Reverse turn',
  'brinesearch_route_step_clip',
  'brinesearch_route_step_snap_point',
  'brinesearch_route_step_boundary_candidates',
  'routeIssue69ApplyBoundary',
  'routeIssue69ReclipAround',
  'routeIssue69InvalidateWindow',
  'Same-road occurrence split',
  'shared Road Manager nodes',
  'Route order changed — exact boundaries must be re-established',
  'Reverse turn'
]) assert.ok(boundaryEditor.includes(token), `#69 boundary editor missing ${token}`);
assert.ok(!boundaryEditor.includes('routeIssue69ReverseTurn'), 'Reverse-route turns must not be guessed by inverting the same occurrence outbound turn.');
assert.ok(boundaryEditor.includes('candidates.length === 1 && !payload?.ambiguous'), 'Boundary editor can auto-select a truncated ambiguous intersection set.');

assert.ok(boundaryEditor.includes('routeInteractiveUseCandidateInvalidateTopologyIssue69'), 'Road replace/insert is not topology-invalidating.');
assert.ok(boundaryEditor.includes('routeStepRemoveInvalidateTopologyIssue69'), 'Road removal is not topology-invalidating.');
assert.ok(boundaryEditor.includes('routeMapperRenderTopologyControlsIssue69'), 'Road reorder is not topology-invalidating.');

for (const token of [
  'ROUTE_ISSUE69_SPATIAL_MATCH_MI',
  'routeIssue69RoadSpatialDistance',
  'source_record_id',
  'Exact source identity wins',
  'Spatial support comes before naming',
  'More than one Road Manager road is spatially valid at this tap',
  'routeIssue69CompleteRoadGeometry',
  'routeIssue69TapLocalCandidatePoint',
  '_tapPoint',
  'One tapped OSM way is only partial source geometry',
  'single way cannot create complete canonical-road coverage',
  'other?.id',
  'routeInteractiveLookupRoadsSpatialIssue69'
]) assert.ok(spatialRoadSelection.includes(token), `#69 spatial road selection missing ${token}`);
assert.ok(!spatialRoadSelection.includes('best?.score'), '#69 map taps must not silently choose a fuzzy best-name Road Manager record.');
assert.ok(!spatialRoadSelection.includes('routeBacktraceSimilarityV17325'), '#69 spatial road identity guard must not depend on fuzzy name similarity.');
assert.ok(!spatialRoadSelection.includes('routeInteractiveCandidateNameV17327(other) === routeInteractiveCandidateNameV17327(row)'), '#69 external road candidates must not be deduplicated by name.');
assert.ok(spatialRoadSelection.includes('routeStepMilesPerPixelV17328(point) * 34'), '#69 local Road Manager tap threshold is not using the full map point.');
assert.ok(!spatialRoadSelection.includes('routeStepMilesPerPixelV17328(point.lat)'), '#69 local Road Manager tap threshold still passes a latitude number and becomes NaN.');
assert.ok(!spatialRoadSelection.includes('method: "PATCH"') && !spatialRoadSelection.includes('method: "POST"'), '#69 must not turn one tapped OSM way into canonical Road Manager geometry.');

for (const token of [
  'routeInteractivePublishV17327 = routeIssue69PublishStructured',
  'window.routeInteractivePublishV17327 = routeIssue69PublishStructured',
  'brinesearch_publish_structured_route'
]) assert.ok(publishLockdown.includes(token), `#69 publish lockdown missing ${token}`);
assert.ok(!publishLockdown.includes('/rest/v1/brinesearch_pad_roads'), '#69 publish lockdown must not retain the legacy direct route-row write path.');
assert.ok(!publishLockdown.includes('method: "PATCH"'), '#69 publish lockdown must not PATCH pads directly.');

const delegatedPublisher = legacyInteractive.match(/async function routeInteractivePublishV17327\(\) \{[\s\S]*?\n    \}/)?.[0] || '';
assert.ok(delegatedPublisher.includes('window.routeIssue69PublishStructured'), 'Legacy interactive publisher does not delegate to the exact structured publisher.');
assert.ok(delegatedPublisher.includes('legacy direct publisher is retired'), 'Legacy interactive publisher does not fail closed when exact publishing is unavailable.');
assert.ok(!delegatedPublisher.includes('editorRequest('), 'Legacy interactive publisher still has a direct REST write path.');

for (const token of [
  'brinesearch_publish_structured_route',
  'route_step_id',
  'step_geometry',
  'start_coordinate',
  'end_coordinate',
  'clipped_geometry',
  'shared Road Manager intersection node',
  "geometry_version=1",
  'structured_route_steps=v_public_steps'
]) assert.ok(geometryMigration.includes(token), `Existing V17.3.29 structured-route database contract missing ${token}`);

for (const token of [
  'brinesearch_route_step_snap_point',
  'brinesearch_route_step_boundary_candidates',
  'brinesearch_route_step_clip',
  'security invoker',
  'shared_road_manager_node',
  'same_road_explicit_split',
  'same_road_split_requires_explicit_point',
  'no_shared_road_manager_node',
  'no_shared_road_manager_node_near_tap',
  'boundaries_not_on_one_continuous_road_component',
  'ambiguous_continuous_road_components',
  'boundary_outside_publisher_tolerance',
  'clip_precision_canonicalization_failed',
  'st_asgeojson(v_clip,15)',
  'road_geometry_not_complete',
  'candidates_truncated',
  'clip_outside_road_manager_support',
  'st_dumppoints',
  'st_linelocatepoint',
  'st_linesubstring',
  'st_setpoint',
  'st_reverse',
  "extensions.st_dwithin(l.geom::extensions.geography,r.geom::extensions.geography,1)"
]) assert.ok(draftHelpers.toLowerCase().includes(token.toLowerCase()), `#69 spatial helper migration missing ${token}`);

assert.ok(!draftHelpers.includes('private_verification.brinesearch_issue69_point'), '#69 public SECURITY INVOKER helpers must not depend on a private helper the authenticated caller cannot execute.');
assert.ok(!/similarity|normalized_name|canonical_name\s*(?:=|like|ilike)/i.test(
  draftHelpers.match(/create or replace function public\.brinesearch_route_step_boundary_candidates[\s\S]*?comment on function public\.brinesearch_route_step_boundary_candidates/)?.[0] || ''
), 'Boundary-candidate helper must not choose intersections using road-name similarity.');

const canonicalPublisherStart = draftHelpers.lastIndexOf(
  'create or replace function public.brinesearch_publish_structured_route('
);
const canonicalPublisherEnd = draftHelpers.indexOf('\n$$;', canonicalPublisherStart);
assert.ok(canonicalPublisherStart >= 0 && canonicalPublisherEnd > canonicalPublisherStart,
  'Could not isolate the hardened #69 canonical publisher.');
const canonicalPublisher = draftHelpers.slice(canonicalPublisherStart, canonicalPublisherEnd + 4).replace(/\r\n/g, '\n');
for (const token of [
  'security definer',
  "set search_path=''",
  'Expected route revision is required',
  'structured_route_revision',
  'for update',
  'for share',
  'brinesearch_route_step_clip',
  'server-derived mileage',
  'one exact shared Road Manager node pair',
  'road_geometry_digest',
  'road_geometry_checked_at',
  'road_source_method',
  'private_hold',
  'verified_public',
  'Driver safety information:',
  'driver_safety_context=v_public_safety'
]) assert.ok(canonicalPublisher.toLowerCase().includes(token.toLowerCase()),
  `#69 canonical publisher missing ${token}`);

const derivationStart = canonicalPublisher.indexOf('-- Server-derive every traveled occurrence');
const derivationEnd = canonicalPublisher.indexOf('\n  if exists (\n    select 1\n    from private_verification.brinesearch_driver_safety_facts_issue69', derivationStart);
assert.ok(derivationStart >= 0 && derivationEnd > derivationStart,
  'Could not isolate the server-authoritative geometry derivation phase.');
const derivationPhase = canonicalPublisher.slice(derivationStart, derivationEnd);
for (const forbidden of [
  "v_step->'clipped_geometry'",
  "v_step->>'miles'",
  "v_step->'aliases'",
  "v_step->>'geometry_source'",
  "v_step->>'geometry_status'"
]) assert.ok(!derivationPhase.includes(forbidden),
  `#69 publisher trusts client geometry authority: ${forbidden}`);
for (const token of [
  "'clipped_geometry',v_clip_result->'clipped_geometry'",
  "'miles',v_miles",
  "'aliases',pg_catalog.to_jsonb(coalesce(v_road.aliases",
  "'geometry_source','road_manager_clip_issue69'"
]) assert.ok(derivationPhase.includes(token),
  `#69 publisher does not derive canonical ${token}`);

const publicSnapshot = canonicalPublisher.match(
  /select coalesce\(pg_catalog\.jsonb_agg\(pg_catalog\.jsonb_build_object\([\s\S]*?into v_public_steps/
)?.[0] || '';
assert.ok(publicSnapshot, 'Could not isolate the canonical public route snapshot.');
for (const forbidden of ['step_note', 'private_step_note', "'note'"]) {
  assert.ok(!publicSnapshot.includes(forbidden),
    `#69 public structured snapshot exposes private route data: ${forbidden}`);
}

for (const token of [
  'brinesearch_driver_safety_facts_issue69',
  'force row level security',
  'brinesearch_sanitize_public_safety_context_issue69',
  'pads_public_safety_snapshot_canonical_issue69',
  'public_pad_detail_safety_snapshot_canonical_issue69',
  'geometry_version=0',
  'brinesearch_guard_exact_route_road_geometry_issue69',
  'brinesearch_guard_structured_pad_route_fields_issue69',
  'Issue #69 safety inventory count drift',
  'Issue #69 access-credential hold count drift',
  'Issue #69 unresolved safety review hold count drift',
  'aclexplode',
  'pg_get_userbyid'
]) assert.ok(draftHelpers.includes(token), `#69 durable database guard missing ${token}`);
assert.ok(
  draftHelpers.includes('from public,anon,authenticated;') &&
  draftHelpers.includes('to authenticated;'),
  '#69 canonical publisher ACL must revoke broad execution and grant authenticated RPC execution only.'
);

const occurrenceA = { routeStepId: 'a', roadId: 'same-road', startCoordinate: [0, 0], endCoordinate: [1, 0] };
const occurrenceB = { routeStepId: 'b', roadId: 'same-road', startCoordinate: [1, 0], endCoordinate: [2, 0] };
assert.equal(occurrenceA.roadId, occurrenceB.roadId);
assert.notEqual(occurrenceA.routeStepId, occurrenceB.routeStepId);
assert.notDeepEqual(occurrenceA.startCoordinate, occurrenceB.startCoordinate);

console.log(JSON.stringify({
  issue: 69,
  status: 'canonical server-clipped publisher + durable safety context + spatial/editor foundation',
  occurrenceIdentity: 'route_step_id + exact boundaries; never road-name similarity',
  exactHighlight: 'clippedGeometry only',
  publishBoundary: 'single runtime entrypoint -> brinesearch_publish_structured_route with optimistic route revision',
  draftGeometry: 'explicit tap snap + shared Road Manager node candidates + one-component clipping',
  topologyEdits: 'replace/insert/remove/reorder invalidate affected exact geometry',
  roadIdentity: 'exact source ID or spatial support; ambiguous/name-only matches block instead of guessing',
  reverseRoute: 'occurrence-specific inbound turn is explicit; same-row outbound inversion is forbidden',
  unresolvedBehavior: 'no fake exact highlight and publish blocked',
  safetyContext: 'verified allowlisted facts regenerate separately; private/unresolved facts block instead of being deleted',
  remaining: 'browser race/runtime regressions + rollback hard-case rehearsal + production rollout/live verification'
}, null, 2));
console.log('GitHub #69 structured-route foundation audit passed.');
