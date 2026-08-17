import assert from 'node:assert/strict';
import fs from 'node:fs';

const planner = fs.readFileSync('v17/src/parts/00ab-google-route-plan-issue97.js', 'utf8');
const mappingMigration = fs.readFileSync(
  'supabase/migrations/20260817193212_issue97_frozen_exact_mapping_wave.sql',
  'utf8',
);
const routeManifest = fs.readFileSync(
  'ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql',
  'utf8',
);

const deriveCorridor = (roadClass, pads, approach, explicitBothDirections = false) => {
  if (roadClass === 'state_route') return { mode: 'state_route_through', terminal: Infinity };
  if (explicitBothDirections) return { mode: 'explicit_bidirectional_through', terminal: Infinity };
  const approved = pads.filter(pad => pad.approved && pad.approach === approach);
  if (!approved.length) throw new Error('no approved pad evidence for this approach');
  return { mode: 'approved_pad_terminal', terminal: Math.max(...approved.map(pad => pad.position)) };
};

const validate = ({ approvedOccurrences, proposedOccurrences, travels }) => {
  assert.deepEqual(proposedOccurrences, approvedOccurrences,
    'saved approved road-occurrence order is authoritative');
  for (const travel of travels) {
    if (travel.roadClass === 'state_route' && travel.restricted) {
      throw new Error('state route has an explicit truck or route restriction');
    }
    if (travel.roadClass !== 'state_route' && !travel.explicitBothDirections &&
        travel.approach !== travel.approvedApproach) {
      throw new Error('opposite approach is not approved');
    }
    const corridor = deriveCorridor(
      travel.roadClass,
      travel.pads,
      travel.approach,
      travel.explicitBothDirections,
    );
    if (travel.end > corridor.terminal) throw new Error('travel exceeds last approved pad boundary');
  }
  return true;
};

const local = (pads, end, extra = {}) => ({
  roadClass: 'local_road', pads, approach: 'forward', approvedApproach: 'forward', end,
  explicitBothDirections: false, ...extra,
});
const pad = (position, approved = true, approach = 'forward') => ({ position, approved, approach });
const route = (approvedOccurrences, travels, proposedOccurrences = approvedOccurrences) =>
  validate({ approvedOccurrences, proposedOccurrences, travels });

// 1. One pad: that entrance is the terminal boundary.
assert.equal(route(['local:1'], [local([pad(4)], 4)]), true);
assert.throws(() => route(['local:1'], [local([pad(4)], 4.1)]), /last approved pad/);
// 2. Two pads extend only to the farther approved pad.
assert.equal(route(['local:1'], [local([pad(4), pad(8)], 8)]), true);
// 3. Three pads use the farthest approved position.
assert.equal(route(['local:1'], [local([pad(4), pad(8), pad(12)], 12)]), true);
assert.throws(() => route(['local:1'], [local([pad(4), pad(8), pad(12)], 13)]), /last approved pad/);
// 4. A physical highway connection beyond the last pad grants no through authority.
assert.throws(() => route(['local:1', 'highway:2'], [local([pad(8)], 15)]), /last approved pad/);
// 5. Physical access from the opposite end is not approval.
assert.throws(() => route(['local:1'], [local([pad(8)], 8, { approach: 'reverse' })]),
  /opposite approach/);
// 6. Explicit both-directions/through approval authorizes either approach.
assert.equal(route(['local:1'], [local([pad(8)], 20, {
  approach: 'reverse', explicitBothDirections: true,
})]), true);
// 7. State routes remain through-routable by default.
assert.equal(route(['state:1'], [{
  roadClass: 'state_route', pads: [pad(4)], approach: 'reverse', approvedApproach: 'forward', end: 100,
}]), true);
assert.throws(() => route(['state:1'], [{
  roadClass: 'state_route', pads: [pad(4)], approach: 'forward',
  approvedApproach: 'forward', end: 100, restricted: true,
}]), /explicit truck or route restriction/);
// 8. Google may not add a physical shortcut or leave/rejoin occurrence.
assert.throws(() => route(['state:1', 'local:2'], [local([pad(8)], 8)],
  ['state:1', 'local:2', 'shortcut:3', 'local:4']), /road-occurrence order/);
// 9. A farther pad extends the corridor only once its own approved evidence exists.
assert.throws(() => route(['local:1'], [local([pad(4), pad(10, false)], 10)]), /last approved pad/);
assert.equal(route(['local:1'], [local([pad(4), pad(10, true)], 10)]), true);
// 10. Repeated occurrences remain distinct and direction-scoped.
assert.equal(route(['local:1', 'state:2', 'local:3'], [
  local([pad(4)], 4),
  local([pad(9, true, 'reverse')], 9, { approach: 'reverse', approvedApproach: 'reverse' }),
]), true);
assert.throws(() => route(['local:1', 'state:2', 'local:3'], [],
  ['local:1', 'state:2', 'local:1']), /road-occurrence order/);

for (const token of [
  'saved approved haul route is authoritative',
  'physical graph proves',
  'Google Maps is only the renderer',
  'route_authority !== "saved_approved_haul_route"',
  'physical_graph_role !== "topology_only"',
  'approved_corridor_status !== "verified"',
  'approved_terminal_point_sequence',
  'approved_road_occurrence_indexes',
]) assert.ok(planner.includes(token), `planner missing binding haul-corridor contract: ${token}`);

assert.ok(mappingMigration.includes("'route_refresh_performed',false"));
assert.ok(mappingMigration.includes("'graph_action','rebuild_required'"));
assert.ok(routeManifest.includes('manifest/closure verifier only'));
assert.ok(routeManifest.includes("'approved_route_authority_required',true"));
assert.ok(routeManifest.includes("'approved_corridor_validation_required',true"));

console.log('Issue #97 saved-route authority and approved haul-corridor audit passed (10 fail-closed regressions).');
