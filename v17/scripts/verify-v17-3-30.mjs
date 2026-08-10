import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');

const [pkgText, partsText, stylesText, vite, sw, audit, migration, whitespaceFix, parserWording] = await Promise.all([
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'vite.config.js')),
  read(path.join(v17Root, 'src/offline/sw.js')),
  read(path.join(v17Root, 'scripts/audit-authoritative-driver-directions-issue81.mjs')),
  read(path.join(projectRoot, 'supabase/migrations/20260810233900_authoritative_driver_directions_issue_81.sql')),
  read(path.join(projectRoot, 'supabase/migrations/20260810234024_authoritative_driver_directions_issue_81_whitespace_fix.sql')),
  read(path.join(projectRoot, 'supabase/migrations/20260810234337_authoritative_driver_directions_issue_81_parser_wording.sql'))
]);
const pkg = JSON.parse(pkgText), parts = JSON.parse(partsText), styles = JSON.parse(stylesText);
if (pkg.version !== '17.3.30' || parts.version !== '17.3.30' || styles.version !== '17.3.30') {
  throw new Error('V17.3.30 version markers are not synchronized.');
}
if (!/RELEASE_VERSION\s*=\s*'17\.3\.30'/.test(vite)) throw new Error('V17.3.30 Vite release marker is missing.');
if (!sw.includes('brinesearch-v17-3-30-authoritative-driver-directions')) throw new Error('V17.3.30 offline cache marker is missing.');
if (!pkg.scripts?.['verify:directions-authoritative']) throw new Error('V17.3.30 #81 audit is not wired into package scripts.');
if (!pkg.scripts?.build?.includes('verify:directions-authoritative')) throw new Error('V17.3.30 #81 audit is not in the full build.');

const authoritativeIndex = parts.parts.indexOf('00a-authoritative-driver-directions-v17330.js');
const globalWrittenIndex = parts.parts.indexOf('22j-global-written-directions.js');
const genericT = parts.parts.indexOf('22t-generic-source-cleanups-v17330.js');
const genericX = parts.parts.indexOf('22x-generic-direction-integrity-v17330.js');
const genericZ = parts.parts.indexOf('22z-generic-exit-road-truth-v17330.js');
const safety = parts.parts.indexOf('22za-driver-safety-contract-v17330.js');
if (authoritativeIndex < 0 || globalWrittenIndex < 0 || genericT < 0 || genericX < 0 || genericZ < 0 || safety < 0) {
  throw new Error('V17.3.30 direction load chain is incomplete.');
}
if (!(genericT < genericX && genericX < genericZ && genericZ < safety)) throw new Error('V17.3.30 final direction layers are out of order.');
for (const obsolete of ['00a-live-clear-directions-precedence.js','22i-lee-written-step-prototype.js','22t-known-source-cleanups.js','22x-direction-final-integrity-v17321.js','22z-direction-exit-road-truth-v17323.js']) {
  if (parts.parts.includes(obsolete)) throw new Error(`V17.3.30 still assembles obsolete direction layer ${obsolete}.`);
}
for (const token of ['liveContract','padSpecificFrontendRouteFacts','legacyHospitalFallbacksExercised','productionMigrationChain']) {
  if (!audit.includes(token)) throw new Error(`V17.3.30 #81 audit missing ${token}.`);
}
for (const token of ['brinesearch_driver_directions_public','brinesearch_driver_safe_clear_v17330','ascent--albert','expand--timmy-minch','expand--van-aston']) {
  if (!migration.includes(token)) throw new Error(`V17.3.30 migration missing ${token}.`);
}
for (const token of ['brinesearch_driver_safe_clear_v17330', "'[ \\t]{2,}'", 'public line breaks lost']) {
  if (!whitespaceFix.includes(token)) throw new Error(`V17.3.30 whitespace follow-up missing ${token}.`);
}
for (const token of ['From westbound I-70, take Exit 198.', 'US-40 / National Rd eastbound', "display_road is distinct from 'US-40 / National Rd'"]) {
  if (!parserWording.includes(token)) throw new Error(`V17.3.30 parser-wording follow-up missing ${token}.`);
}

// #81 deliberately does not modify the V17.3.28 structural map implementation.
for (const mapPart of [
  '21e-road-manager-interactive-route-map-v17327.js',
  '21f-road-manager-interactive-route-canonical-v17327.js',
  '21g-road-manager-step-snap-route-editor-v17328.js',
  '21h-road-manager-step-tap-lookup-bound-v17328.js'
]) {
  if (!parts.parts.includes(mapPart)) throw new Error(`#81 unexpectedly dropped map dependency ${mapPart}.`);
}

console.log('Verified BrineSearch V17.3.30: live driver directions use one narrow sanitized Supabase contract, stale packaged cards are not allowed to override live truth, pad-specific direction facts were moved out of assembled frontend renderers, transient landmark/contact identifiers are removed from driver output, production line breaks and route aliases are preserved, and #69 map code remains untouched.');
