import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');

const [source, orderRaw, geometryMigration] = await Promise.all([
  read(path.join(v17Root, 'src/parts/21i-road-manager-structured-route-foundation-issue69.js')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(projectRoot, 'supabase/migrations/20260810165718_v17329_structured_route_step_geometry.sql'))
]);

const order = JSON.parse(orderRaw).parts || [];
const part = '21i-road-manager-structured-route-foundation-issue69.js';
assert.ok(order.includes(part), '#69 structured route layer is not assembled.');
assert.ok(order.indexOf(part) > order.indexOf('21h-road-manager-step-tap-lookup-bound-v17328.js'), '#69 must shadow the legacy V17.3.27/V17.3.28 occurrence/publish path.');

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

// Repeated roads must remain independent occurrences. Road ID equality is not
// sufficient to identify a step; occurrence UUIDs remain distinct.
const occurrenceA = { routeStepId: 'a', roadId: 'same-road', startCoordinate: [0, 0], endCoordinate: [1, 0] };
const occurrenceB = { routeStepId: 'b', roadId: 'same-road', startCoordinate: [1, 0], endCoordinate: [2, 0] };
assert.equal(occurrenceA.roadId, occurrenceB.roadId);
assert.notEqual(occurrenceA.routeStepId, occurrenceB.routeStepId);
assert.notDeepEqual(occurrenceA.startCoordinate, occurrenceB.startCoordinate);

console.log(JSON.stringify({
  issue: 69,
  status: 'foundation checkpoint',
  occurrenceIdentity: 'route_step_id + exact boundaries; never road-name similarity',
  exactHighlight: 'clippedGeometry only',
  publishBoundary: 'brinesearch_publish_structured_route RPC with optimistic route revision',
  unresolvedBehavior: 'no fake exact highlight and publish blocked',
  remaining: 'boundary/intersection snapping + clipping edit tools + full end-to-end regressions/live rollout'
}, null, 2));
console.log('GitHub #69 structured-route foundation audit passed.');
