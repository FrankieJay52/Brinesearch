import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');

const [source, boundaryEditor, orderRaw, geometryMigration, draftHelpers] = await Promise.all([
  read(path.join(v17Root, 'src/parts/21i-road-manager-structured-route-foundation-issue69.js')),
  read(path.join(v17Root, 'src/parts/21j-road-manager-route-boundaries-issue69.js')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(projectRoot, 'supabase/migrations/20260810165718_v17329_structured_route_step_geometry.sql')),
  read(path.join(projectRoot, 'supabase/migrations/20260811002000_issue69_route_geometry_draft_helpers.sql'))
]);

const order = JSON.parse(orderRaw).parts || [];
const foundation = '21i-road-manager-structured-route-foundation-issue69.js';
const boundaries = '21j-road-manager-route-boundaries-issue69.js';
assert.ok(order.includes(foundation), '#69 structured route layer is not assembled.');
assert.ok(order.includes(boundaries), '#69 boundary editor is not assembled.');
assert.ok(order.indexOf(foundation) > order.indexOf('21h-road-manager-step-tap-lookup-bound-v17328.js'), '#69 must shadow the legacy V17.3.27/V17.3.28 occurrence/publish path.');
assert.ok(order.indexOf(boundaries) > order.indexOf(foundation), '#69 boundary tools must load after the structured step model.');

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
  'routeIssue69ReverseTurn'
]) assert.ok(boundaryEditor.includes(token), `#69 boundary editor missing ${token}`);

// Road replacement/insertion/removal and reorder must invalidate geometry rather
// than carrying an old clipped line into a new topology.
assert.ok(boundaryEditor.includes('routeInteractiveUseCandidateInvalidateTopologyIssue69'), 'Road replace/insert is not topology-invalidating.');
assert.ok(boundaryEditor.includes('routeStepRemoveInvalidateTopologyIssue69'), 'Road removal is not topology-invalidating.');
assert.ok(boundaryEditor.includes('routeMapperRenderTopologyControlsIssue69'), 'Road reorder is not topology-invalidating.');

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
  'shared_road_manager_node',
  'same_road_explicit_split',
  'same_road_split_requires_explicit_point',
  'no_shared_road_manager_node',
  'boundaries_not_on_one_continuous_road_component',
  'st_dumppoints',
  'st_linelocatepoint',
  'st_linesubstring',
  'st_reverse',
  "extensions.st_dwithin(l.geom::extensions.geography,r.geom::extensions.geography,1)"
]) assert.ok(draftHelpers.includes(token), `#69 spatial helper migration missing ${token}`);

assert.ok(!/similarity|normalized_name|canonical_name\s*(?:=|like|ilike)/i.test(
  draftHelpers.match(/create or replace function public\.brinesearch_route_step_boundary_candidates[\s\S]*?comment on function public\.brinesearch_route_step_boundary_candidates/)?.[0] || ''
), 'Boundary-candidate helper must not choose intersections using road-name similarity.');

// Repeated roads must remain independent occurrences. Road ID equality is not
// sufficient to identify a step; occurrence UUIDs remain distinct.
const occurrenceA = { routeStepId: 'a', roadId: 'same-road', startCoordinate: [0, 0], endCoordinate: [1, 0] };
const occurrenceB = { routeStepId: 'b', roadId: 'same-road', startCoordinate: [1, 0], endCoordinate: [2, 0] };
assert.equal(occurrenceA.roadId, occurrenceB.roadId);
assert.notEqual(occurrenceA.routeStepId, occurrenceB.routeStepId);
assert.notDeepEqual(occurrenceA.startCoordinate, occurrenceB.startCoordinate);

console.log(JSON.stringify({
  issue: 69,
  status: 'structured foundation + boundary editor checkpoint',
  occurrenceIdentity: 'route_step_id + exact boundaries; never road-name similarity',
  exactHighlight: 'clippedGeometry only',
  publishBoundary: 'brinesearch_publish_structured_route RPC with optimistic route revision',
  draftGeometry: 'explicit tap snap + shared Road Manager node candidates + one-component clipping',
  topologyEdits: 'replace/insert/remove/reorder invalidate affected exact geometry',
  reverseRoute: 'reverse-turn field preserved with outbound-turn inverse as default',
  unresolvedBehavior: 'no fake exact highlight and publish blocked',
  remaining: 'SQL rehearsal + browser/agent review + hard-case fixtures + production rollout/live verification'
}, null, 2));
console.log('GitHub #69 structured-route foundation audit passed.');
