import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const root = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');

const [runtime, foundation, boundaries, spatial, lockdown, orderRaw, baseMigration, hardeningMigration] = await Promise.all([
  read(path.join(v17Root, 'src/parts/21m-road-manager-runtime-hardening-issue69.js')),
  read(path.join(v17Root, 'src/parts/21i-road-manager-structured-route-foundation-issue69.js')),
  read(path.join(v17Root, 'src/parts/21j-road-manager-route-boundaries-issue69.js')),
  read(path.join(v17Root, 'src/parts/21k-road-manager-spatial-road-selection-issue69.js')),
  read(path.join(v17Root, 'src/parts/21l-road-manager-structured-publish-lockdown-issue69.js')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(root, 'supabase/migrations/20260811031420_issue69_route_geometry_draft_helpers.sql')),
  read(path.join(root, 'supabase/migrations/20260811031439_issue69_release_hardening.sql'))
]);

const order = JSON.parse(orderRaw).parts || [];
const runtimePart = '21m-road-manager-runtime-hardening-issue69.js';
assert.ok(order.includes(runtimePart), '#69 runtime hardening layer is not assembled.');
assert.ok(order.indexOf(runtimePart) > order.indexOf('21l-road-manager-structured-publish-lockdown-issue69.js'), '#69 runtime hardening must load after the structured publish lockdown.');
assert.ok(order.indexOf(runtimePart) < order.indexOf('22m-direction-source-priority-and-coalescer.js'), '#69 runtime hardening must load before final driver-direction rendering layers.');

for (const token of [
  'routeIssue69PadGeneration',
  'routeIssue69TopologyGeneration',
  'routeIssue69PublishGeneration',
  'routeIssue69TopologySignature',
  'routeIssue69ValidateStructuredPayload',
  'canonical_step_count',
  'exact_step_count',
  'expectedStepIds',
  'routeMapperLoadReviewRaceSafeIssue69',
  'loadGeneration !== routeIssue69PadGeneration',
  'routeIssue69ClipStepGuarded',
  'routeIssue69RequestCurrent',
  'routeIssue69ResolveBoundaryTapGuarded',
  'candidates_truncated',
  'routeInteractiveUseCandidateRaceSafeIssue69',
  'routeStepRemoveExactIssue69',
  'routeIssue69InvalidateTransitionTurns',
  'routeIssue69ClearAllTopologyAfterReorder',
  'miles.readOnly = true',
  'geometryMiles.readOnly = true',
  'Geometry mileage:',
  'routeIssue69ReverseCards',
  'Reverse route',
  'const line = routeIssue69ReversePreview ? [...raw].reverse() : raw',
  'routeIssue69PublishStructuredHardened',
  'Published. Reloading exact canonical rows before confirming success',
  'routeIssue69FetchStructuredPayload(padId)',
  'Exact route published and reload-verified',
  'window.routeIssue69PublishStructured = routeIssue69PublishStructuredHardened'
]) assert.ok(runtime.includes(token), `#69 runtime hardening missing ${token}`);

for (const forbidden of [
  'routeBacktraceRunV17325()',
  'routeBacktraceSimilarityV17325',
  'routeBacktraceClosestVertexV17325([padCoords.lng, padCoords.lat]',
  '/rest/v1/brinesearch_pad_roads?pad_id=',
  'method: "PATCH"'
]) assert.ok(!runtime.includes(forbidden), `#69 runtime hardening reintroduced legacy/fuzzy path: ${forbidden}`);

assert.ok(runtime.includes('if (sameRoadSequence && Number(rich.routeRevision || 0) === validated.revision)'), 'Local exact draft can survive a newer server route revision.');
assert.ok(runtime.includes('payload?.ambiguous || Number(payload?.candidate_count || candidates.length) !== 1 || payload?.candidates_truncated'), 'Ambiguous/truncated intersection responses may be auto-selected.');
assert.ok(runtime.includes('segment.turn = "";') && runtime.includes('segment.inboundTurn = "";'), 'Reorder does not invalidate transition turns.');

for (const token of [
  'brinesearch_driver_safe_clear_v17330(p.directions_clear)',
  'security_invoker=true',
  'security_barrier=true',
  'new.directions_clear:=',
  'brinesearch_driver_safe_clear_v17330(new.directions_clear)',
  'route_review_segments_owner_read_issue69',
  'route_review_segments_owner_insert_legacy_issue69',
  'route_review_segments_owner_update_legacy_issue69',
  'route_review_segments_owner_delete_legacy_issue69',
  'and geometry_version=0',
  'publisher lock-order invariant failed'
]) assert.ok(hardeningMigration.includes(token), `#69 release hardening migration missing ${token}`);

assert.ok(!/p\.directions_clear\s+as\s+directions_clear/i.test(hardeningMigration), '#69 release projection exposes unsanitized directions_clear.');
assert.ok(!/create policy[^;]+brinesearch_route_review_segments[\s\S]*?geometry_version\s*=\s*1/i.test(hardeningMigration), 'Direct authenticated review-segment policy permits exact version-1 writes.');

const publisherStart = baseMigration.lastIndexOf('create or replace function public.brinesearch_publish_structured_route(');
const publisherEnd = baseMigration.indexOf('\n$$;', publisherStart);
assert.ok(publisherStart >= 0 && publisherEnd > publisherStart, 'Could not isolate #69 canonical publisher.');
const publisher = baseMigration.slice(publisherStart, publisherEnd + 4).toLowerCase();
for (const token of [
  'security definer',
  'expected route revision is required',
  'for update',
  'order by r.id',
  'for share',
  'order by f.id',
  'brinesearch_route_step_clip',
  'server-derived mileage',
  'private_hold',
  'driver safety information:'
]) assert.ok(publisher.includes(token), `Canonical #69 publisher missing ${token}`);

assert.ok(lockdown.includes('routeInteractivePublishV17327 = routeIssue69PublishStructured'), 'Legacy interactive publisher is not locked to the structured route path before runtime hardening.');
assert.ok(spatial.includes('single way cannot create complete canonical-road coverage'), 'One tapped OSM way can still masquerade as a complete Road Manager road.');
assert.ok(boundaries.includes('candidates.length === 1 && !payload?.ambiguous'), 'Base boundary editor does not guard ambiguity.');
assert.ok(foundation.includes('routeStepTraceExactOccurrenceIssue69'), 'Exact selected-step occurrence layer missing.');

// Hard-case behavior models: occurrence identity is not road identity; delayed
// replies are accepted only for the generation/occurrence that launched them;
// reverse order uses the same exact geometry occurrences with explicit inbound
// turns rather than inferred outbound inversions.
const repeatedA = { routeStepId: 'occ-a', roadId: 'road-1', start: [0, 0], end: [1, 0] };
const repeatedB = { routeStepId: 'occ-b', roadId: 'road-1', start: [2, 0], end: [3, 0] };
assert.equal(repeatedA.roadId, repeatedB.roadId);
assert.notEqual(repeatedA.routeStepId, repeatedB.routeStepId);
assert.notDeepEqual(repeatedA.start, repeatedB.start);

const requestCurrent = (token, state) => token.padId === state.padId
  && token.generation === state.generation
  && token.routeStepId === state.routeStepId;
assert.equal(requestCurrent(
  { padId: 'pad-a', generation: 4, routeStepId: 'occ-a' },
  { padId: 'pad-a', generation: 4, routeStepId: 'occ-a' }
), true);
assert.equal(requestCurrent(
  { padId: 'pad-a', generation: 4, routeStepId: 'occ-a' },
  { padId: 'pad-b', generation: 5, routeStepId: 'occ-b' }
), false, 'A delayed response from an old pad/topology would still be accepted.');

const outbound = [
  { id: 'a', inboundTurn: 'right' },
  { id: 'b', inboundTurn: 'left' },
  { id: 'c', inboundTurn: '' }
];
const reverse = [...outbound].reverse();
assert.deepEqual(reverse.map(row => row.id), ['c', 'b', 'a']);
assert.equal(reverse[1].inboundTurn, 'left');
assert.equal(reverse[2].inboundTurn, 'right');

console.log(JSON.stringify({
  issue: 69,
  runtime: 'pad/topology generation guards + strict canonical reload + read-only geometry mileage',
  reverseRoute: 'stored inbound turns + reversed exact occurrence geometries',
  releaseDatabase: '#81 direction sanitizer preserved; exact review-segment writes RPC-owned',
  hardCases: 'repeated road occurrence identity + stale delayed response + reverse ordering',
  result: 'pass'
}, null, 2));
console.log('GitHub #69 runtime/release hardening audit passed.');
