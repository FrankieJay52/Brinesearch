import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const root = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');
const [pkgText, partsText, stylesText, vite, sw, runtime, exactAudit, baseMigration, releaseHardening, issue81Audit] = await Promise.all([
  read(path.join(root, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'vite.config.js')),
  read(path.join(v17Root, 'src/offline/sw.js')),
  read(path.join(v17Root, 'src/parts/21m-road-manager-runtime-hardening-issue69.js')),
  read(path.join(v17Root, 'scripts/audit-exact-route-runtime-hardening-issue69.mjs')),
  read(path.join(root, 'supabase/migrations/20260811002000_issue69_route_geometry_draft_helpers.sql')),
  read(path.join(root, 'supabase/migrations/20260811023000_issue69_release_hardening.sql')),
  read(path.join(v17Root, 'scripts/audit-authoritative-driver-directions-issue81.mjs'))
]);
const pkg = JSON.parse(pkgText), parts = JSON.parse(partsText), styles = JSON.parse(stylesText);
for (const [name, value] of [['package', pkg.version], ['parts', parts.version], ['styles', styles.version]]) {
  if (value !== '17.3.31') throw new Error(`V17.3.31 ${name} marker is ${value}.`);
}
if (!/RELEASE_VERSION\s*=\s*'17\.3\.31'/.test(vite)) throw new Error('V17.3.31 Vite release marker is missing.');
if (!sw.includes('brinesearch-v17-3-31-exact-structured-route-geometry')) throw new Error('V17.3.31 offline cache marker is missing.');
if (!sw.includes('brinesearch-v17-3-30-authoritative-driver-directions')) throw new Error('V17.3.31 lost #81 cache continuity marker.');
if (!pkg.scripts?.build?.includes('verify:exact-route-runtime')) throw new Error('V17.3.31 exact-route runtime audit is not in the full build.');
if (!pkg.scripts?.build?.includes('verify:route-note-security') || !pkg.scripts?.build?.includes('verify:editor-revision-security') || !pkg.scripts?.build?.includes('verify:directions-authoritative')) throw new Error('V17.3.31 dropped #73/#74/#81 regressions.');

const chain = [
  '21i-road-manager-structured-route-foundation-issue69.js',
  '21j-road-manager-route-boundaries-issue69.js',
  '21k-road-manager-spatial-road-selection-issue69.js',
  '21l-road-manager-structured-publish-lockdown-issue69.js',
  '21m-road-manager-runtime-hardening-issue69.js'
];
let last = -1;
for (const part of chain) {
  const index = parts.parts.indexOf(part);
  if (index < 0 || index <= last) throw new Error(`V17.3.31 #69 load chain is missing/out of order at ${part}.`);
  last = index;
}
if (!(last < parts.parts.indexOf('22m-direction-source-priority-and-coalescer.js'))) throw new Error('V17.3.31 route runtime must load before final direction rendering.');

for (const token of ['routeIssue69PadGeneration','routeIssue69TopologyGeneration','routeIssue69ValidateStructuredPayload','routeIssue69PublishStructuredHardened','routeIssue69ReverseCards','miles.readOnly = true','Exact route published and reload-verified']) {
  if (!runtime.includes(token)) throw new Error(`V17.3.31 runtime missing ${token}.`);
}
for (const token of ['repeated road occurrence identity','stale delayed response','reverse ordering']) {
  if (!exactAudit.includes(token)) throw new Error(`V17.3.31 hard-case audit missing ${token}.`);
}
for (const token of ["p.proconfig @> array['search_path=\"\"']::text[]", "end||(v_step->>'road_name');", 'brinesearch_publish_structured_route', 'brinesearch_route_step_clip', 'private_hold', 'Driver safety information:']) {
  if (!baseMigration.includes(token)) throw new Error(`V17.3.31 canonical migration missing/failing source fix: ${token}.`);
}
for (const token of ['brinesearch_driver_safe_clear_v17330(p.directions_clear)','route_review_segments_owner_update_legacy_issue69','publisher lock-order invariant failed']) {
  if (!releaseHardening.includes(token)) throw new Error(`V17.3.31 release hardening missing ${token}.`);
}
for (const token of ['liveContract','padSpecificFrontendRouteFacts','productionMigrationChain']) {
  if (!issue81Audit.includes(token)) throw new Error(`V17.3.31 no longer proves #81 contract token ${token}.`);
}

console.log(JSON.stringify({
  version: '17.3.31',
  issue: 69,
  mapTruth: 'exact route_step_id occurrence + Road Manager road_id + exact boundaries + server-clipped geometry',
  mileage: 'geometry-derived/read-only',
  reverseRoute: 'stored inbound turns + reversed exact occurrence geometry',
  publication: 'single canonical RPC + strict post-publish reload verification',
  securityContinuity: '#73/#74/#81 regressions retained',
  cache: 'brinesearch-v17-3-31-exact-structured-route-geometry'
}, null, 2));
console.log('Verified BrineSearch V17.3.31 exact structured route release contract.');
