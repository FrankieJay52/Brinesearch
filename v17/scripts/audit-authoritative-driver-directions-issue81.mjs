import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const root = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');

const [
  packageRaw, orderRaw, styleRaw, vite, sw, directionManifestRaw, authoritative,
  genericT, genericX, genericZ, safety, migration, whitespaceFix, parserWording,
  projectionSecurityRestore, issue69Migration
] = await Promise.all([
  read(path.join(root, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'vite.config.js')),
  read(path.join(v17Root, 'src/offline/sw.js')),
  read(path.join(v17Root, 'src/data/directions/index.json')),
  read(path.join(v17Root, 'src/parts/00a-authoritative-driver-directions-v17330.js')),
  read(path.join(v17Root, 'src/parts/22t-generic-source-cleanups-v17330.js')),
  read(path.join(v17Root, 'src/parts/22x-generic-direction-integrity-v17330.js')),
  read(path.join(v17Root, 'src/parts/22z-generic-exit-road-truth-v17330.js')),
  read(path.join(v17Root, 'src/parts/22za-driver-safety-contract-v17330.js')),
  read(path.join(root, 'supabase/migrations/20260810233900_authoritative_driver_directions_issue_81.sql')),
  read(path.join(root, 'supabase/migrations/20260810234024_authoritative_driver_directions_issue_81_whitespace_fix.sql')),
  read(path.join(root, 'supabase/migrations/20260810234337_authoritative_driver_directions_issue_81_parser_wording.sql')),
  read(path.join(root, 'supabase/migrations/20260810234927_authoritative_driver_directions_issue_81_projection_security_restore.sql')),
  read(path.join(root, 'supabase/migrations/20260811031420_issue69_route_geometry_draft_helpers.sql'))
]);

const pkg = JSON.parse(packageRaw);
const order = JSON.parse(orderRaw);
const styles = JSON.parse(styleRaw);
const directionManifest = JSON.parse(directionManifestRaw);

// #81 remains the direction-data contract from V17.3.30 while later releases may
// advance the application shell for unrelated work such as #69 map geometry.
assert.equal(pkg.version, '17.3.31');
assert.equal(order.version, '17.3.31');
assert.equal(styles.version, '17.3.31');
assert.equal(directionManifest.version, '17.3.30');
assert.match(vite, /RELEASE_VERSION\s*=\s*'17\.3\.31'/);
assert.match(sw, /brinesearch-v17-3-31-exact-structured-route-geometry/);
assert.match(sw, /brinesearch-v17-3-30-authoritative-driver-directions/);

for (const obsolete of [
  '00a-live-clear-directions-precedence.js',
  '22i-lee-written-step-prototype.js',
  '22t-known-source-cleanups.js',
  '22x-direction-final-integrity-v17321.js',
  '22z-direction-exit-road-truth-v17323.js'
]) {
  assert.ok(!order.parts.includes(obsolete), `Obsolete direction layer is still assembled: ${obsolete}`);
}
for (const required of [
  '00a-authoritative-driver-directions-v17330.js',
  '22t-generic-source-cleanups-v17330.js',
  '22x-generic-direction-integrity-v17330.js',
  '22z-generic-exit-road-truth-v17330.js',
  '22za-driver-safety-contract-v17330.js'
]) {
  assert.ok(order.parts.includes(required), `V17.3.30 direction layer missing: ${required}`);
}

const directionLayerFiles = order.parts.filter(name => /direction|written|source-cleanups|exit-road/i.test(name));
const assembledDirectionSources = await Promise.all(directionLayerFiles.map(name => read(path.join(v17Root, 'src/parts', name))));
const assembledDirectionText = assembledDirectionSources.join('\n');
for (const forbidden of ['ascent--lee', 'ascent--albert', 'expand--timmy-minch', 'expand--van-aston', 'TIMMY_MINCH_CLEAR', 'VAN_ASTON_CLEAR']) {
  assert.ok(!assembledDirectionText.includes(forbidden), `Pad-specific route fact remains assembled: ${forbidden}`);
}

for (const token of [
  '/rest/v1/brinesearch_driver_directions_public',
  'select", "pad_id,legacy_id,directions_clear,source_revision',
  'directionInvalidateLiveFallbackV17330',
  'Live authoritative driver directions'
]) assert.ok(authoritative.includes(token), `Authoritative live direction bridge missing ${token}`);

for (const token of [
  'Nearest\\s+Hospital', 'McDonald', 'dealership', 'YMCA', 'VFD', 'post\\s+office',
  'directionDriverSafetyPhraseV17330', 'directionTransientLandmarkV17330',
  'directionStripLandmarkContextV17330', 'directionManeuverWithoutLandmarkV17330',
  'directionRoadLikeV17330', 'YMCA Camp Road', 'Water Tower Road'
]) assert.ok(safety.includes(token), `Driver safety contract missing ${token}`);

for (const source of [genericT, genericX, genericZ]) {
  for (const forbidden of ['ascent--albert', 'expand--timmy-minch', 'expand--van-aston', 'ascent--lee']) {
    assert.ok(!source.includes(forbidden), `Generic direction layer contains ${forbidden}`);
  }
}

for (const token of [
  'brinesearch_driver_safe_clear_v17330',
  'brinesearch_driver_directions_public',
  "array['pad_id','legacy_id','directions_clear','source_revision']",
  "when 'ascent--albert'",
  "when 'expand--timmy-minch'",
  "when 'expand--van-aston'",
  'OH-114', 'CR-15/1 / Boggs Hill Rd', 'Brushy Run Rd'
]) assert.ok(migration.includes(token), `Issue #81 migration missing ${token}`);
for (const token of [
  'brinesearch_driver_safe_clear_v17330',
  "'[ \\t]{2,}'",
  'public line breaks lost'
]) assert.ok(whitespaceFix.includes(token), `Issue #81 whitespace follow-up missing ${token}`);
for (const token of [
  'From westbound I-70, take Exit 198.',
  'US-40 / National Rd eastbound',
  "display_road is distinct from 'US-40 / National Rd'"
]) assert.ok(parserWording.includes(token), `Issue #81 parser-wording follow-up missing ${token}`);
for (const token of [
  'security_invoker = true',
  'security_barrier = true',
  "has_table_privilege('anon','private_verification.public_pad_projection_source','SELECT')",
  "grant select on private_verification.public_pad_projection_source to service_role"
]) assert.ok(projectionSecurityRestore.includes(token), `Issue #81 projection-security restore missing ${token}`);

for (const token of [
  'brinesearch_driver_safety_facts_issue69',
  "publication_status='verified_public'",
  "publication_status='private_hold'",
  'Driver safety information:',
  'driver_safety_context=v_public_safety',
  'Issue #69 safety inventory count drift',
  'Issue #69 access-credential hold count drift',
  'Issue #69 unresolved safety review hold count drift',
  "'cb_callout',13",
  "'curfew',18",
  "'truck_prohibition',8"
]) assert.ok(issue69Migration.includes(token), `#69/#81 durable safety contract missing ${token}`);
const issue69PublicSafety = issue69Migration.match(
  /create or replace function private_verification\.brinesearch_sanitize_public_safety_context_issue69[\s\S]*?\n\$\$;/
)?.[0] || '';
for (const forbidden of [
  'source_text_digest','source_excerpt_digest','verification_method','verified_at',
  'evidence','reviewer','source_url','note'
]) assert.ok(!issue69PublicSafety.includes(`'${forbidden}'`),
  `#69/#81 public safety snapshot exposes private provenance key ${forbidden}`);

// The public contract must never grow hidden/private columns.
for (const forbidden of [
  'extra_data', 'written_directions', 'research_note', 'research_notes', 'research_sources',
  'created_by', 'updated_by', 'structured_route_steps', 'directions_clear_method'
]) {
  const viewBlock = migration.match(/create view public\.brinesearch_driver_directions_public[\s\S]*?revoke all/i)?.[0] || '';
  assert.ok(!viewBlock.includes(forbidden), `Public direction allow-list exposes ${forbidden}`);
}

const landmarkRe = /\b(?:nearest\s+hospital|medical\s+park|medical\s+center|hospital|mcdonald'?s?|dealership|ymca|vfd|post\s+office|dairy\s+queen|restaurant|landmark|cemetery|church|school|high\s+school|prison|storage\s+units?|ballfield|police\s+department|fire\s+department|mailbox|house|barn|bar|scrap\s+yard|rest\s+area|water\s+tower|power\s+station)\b/i;
const roadNameProtected = value => String(value || '').replace(/\b(?:(?:stone\s+)?church|cemetery|school|hospital|ymca\s+camp|water\s+tower|barn|rest\s+area|fire\s+department|post\s+office|power\s+station)\s+(?:rd|road|ln|lane|dr|drive|st|street|ave|avenue|hwy|highway|run|ridge|fork|hollow|creek)\b/gi, '');
const transient = value => landmarkRe.test(roadNameProtected(value));
function driverSafe(value) {
  let text = String(value || '').replace(/[ \t]{2,}/g, ' ').trim();
  text = text.replace(/\s+Nearest\s+Hospital\b[\s\S]*$/i, '');
  text = text.replace(/\s*\([^)]*(?:McDonald'?s?|dealership|YMCA|VFD|post\s+office|Dairy\s+Queen|restaurant|church\s+(?:is|parking)|cemetery\s+(?:is|at|on)|school\s+(?:is|on)|hospital|medical\s+center)[^)]*\)/gi, '');
  text = text.replace(/\bhttps?:\/\/\S+/gi, '');
  return text.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.;])/g, '$1').trim();
}
function safeManeuver(value) {
  const text = driverSafe(value);
  if (!text || !transient(text)) return text;
  const turns = [...text.matchAll(/\b(?:turn|bear|veer|slight)\s+(left|right)\b[\s\S]*?\b(?:on|onto)\s+([^,.;]+)/ig)];
  if (turns.length) {
    const m = turns.at(-1);
    const road = String(m[2] || '').replace(/\s+(?:at|near|past|before|after|by|across\s+from)\b[\s\S]*$/i, '').trim();
    if (road && !transient(road)) return `${/^slight/i.test(m[0]) ? 'Slight' : 'Turn'} ${m[1].toLowerCase()} on ${road}`;
  }
  const side = text.match(/\bturn\s+(left|right)\b/i);
  return side ? `Turn ${side[1].toLowerCase()}` : '';
}

assert.equal(driverSafe('Turn left on CR-25 / Peters Run Rd. Continue 3.05 miles. Nearest Hospital Example'), 'Turn left on CR-25 / Peters Run Rd. Continue 3.05 miles.');
assert.equal(driverSafe("Turn left (A McDonald's is on the corner) on Kruger Rd."), 'Turn left on Kruger Rd.');
assert.match(driverSafe('Turn left on Church Road. Curfew: 6:30–8:00 AM.'), /Church Road/);
assert.match(driverSafe('Road sequence reference:\nOH-800 → OH-145\n\nStep-by-step directions:\n1. Turn right on OH-145.'), /\n\nStep-by-step directions:\n/);
assert.equal(safeManeuver('Continue past Dairy Queen.'), '');
assert.equal(safeManeuver('Just past Dairy Queen, turn right onto Litter Rd.'), 'Turn right on Litter Rd');
assert.equal(safeManeuver('At the power station, turn right onto Warren Ridge Rd.'), 'Turn right on Warren Ridge Rd');
assert.equal(safeManeuver('Turn right onto YMCA Camp Road.'), 'Turn right onto YMCA Camp Road.');
assert.equal(safeManeuver('Turn left onto Water Tower Road.'), 'Turn left onto Water Tower Road.');
assert.equal(safeManeuver('Pass the prison on the left.'), '');

const rewrites = {};
for (const file of directionManifest.files || []) {
  Object.assign(rewrites, JSON.parse(await read(path.join(v17Root, 'src/data/directions', file))));
}
assert.ok(Object.keys(rewrites).length >= 1100, `Expected packaged fallback coverage; found ${Object.keys(rewrites).length}`);
let hospitalFallbacks = 0;
for (const record of Object.values(rewrites)) {
  const raw = String(record?.r || '');
  if (/Nearest\s+Hospital/i.test(raw)) hospitalFallbacks += 1;
  assert.ok(!/Nearest\s+Hospital/i.test(driverSafe(raw)), 'Packaged fallback sanitizer left a hospital tail');
}
assert.ok(hospitalFallbacks > 0, 'Audit did not exercise any legacy hospital-contaminated fallback records');

assert.equal(pkg.scripts?.['verify:directions-authoritative'], 'node v17/scripts/audit-authoritative-driver-directions-issue81.mjs');
assert.ok(pkg.scripts?.build?.includes('verify:directions-authoritative'), 'Full build must run #81 authoritative direction audit');
assert.ok(!assembledDirectionText.includes('console.log('), 'Direction layers should not dump raw direction bodies to CI/browser logs');

console.log(JSON.stringify({
  issue: 81,
  applicationVersion: '17.3.31',
  directionContractVersion: '17.3.30',
  packagedRecords: Object.keys(rewrites).length,
  legacyHospitalFallbacksExercised: hospitalFallbacks,
  liveContract: ['pad_id','legacy_id','directions_clear','source_revision'],
  landmarkOnlyCardRule: 'drop; source-explicit maneuver survives without landmark identity',
  productionMigrationChain: [
    '20260810233900_authoritative_driver_directions_issue_81',
    '20260810234024_authoritative_driver_directions_issue_81_whitespace_fix',
    '20260810234337_authoritative_driver_directions_issue_81_parser_wording',
    '20260810234927_authoritative_driver_directions_issue_81_projection_security_restore'
  ],
  padSpecificFrontendRouteFacts: 0
}, null, 2));
console.log('GitHub #81 authoritative driver-direction audit passed.');
