import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const publicRoot = path.join(v17Root, 'public');
const read = file => fs.readFile(file, 'utf8');
const normalize = value => String(value ?? '').replace(/\r\n?/g, '\n').trim();

const [fallbackText, globalSource, aliasSafetySource, app] = await Promise.all([
  read(path.join(publicRoot, 'pad-fallback-data.json')),
  read(path.join(v17Root, 'src/parts/22j-global-written-directions.js')),
  read(path.join(v17Root, 'src/parts/22k-global-written-alias-safety.js')),
  read(path.join(publicRoot, 'app/brinesearch-app.js'))
]);
const fallback = JSON.parse(fallbackText);
const pads = Array.isArray(fallback?.pads) ? fallback.pads : [];
if (pads.length < 1000) throw new Error(`Global written-direction audit expected the complete pad directory; found ${pads.length}.`);

const clearOf = pad => normalize(pad?.directionsClear ?? pad?.directions_clear);
const structuredOf = pad => normalize(pad?.Structured_Road_Sequence ?? pad?.structured_road_sequence);
const writtenOf = pad => normalize(pad?.writtenDirections ?? pad?.written_directions);

const stateDual = /\b(?:(?:OH|WV|PA|SR)\s*[- ]?\s*\d{1,4}[A-Z]?|State\s+Route\s*[- ]?\s*\d{1,4}[A-Z]?)[^\n.;]{0,90}\s*\/\s*[^\n.;]{1,90}/i;
const countyDual = /\b(?:(?:CR|C\.?\s*R\.?)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?|County\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?)[^\n.;]{0,90}\s*\/\s*[^\n.;]{1,90}/i;
const townshipDual = /\b(?:(?:TR|T\.?\s*R\.?)\s*[- ]?\s*\d{1,4}[A-Z]?|Township\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*\d{1,4}[A-Z]?)[^\n.;]{0,90}\s*\/\s*[^\n.;]{1,90}/i;
const reverseNumberedDual = /\b[A-Za-z0-9][A-Za-z0-9 .'-]{0,90}?(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Trail|Byway|Way|Run|Ridge|Fork|Hollow|Creek|Crossing)\s*\/\s*(?:(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?|(?:State|County|Township)\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?)/i;

let withClear = 0;
let withoutClear = 0;
let withoutClearWithStructured = 0;
let withoutClearWithWritten = 0;
let withoutAnyDirectionEvidence = 0;
let stateDualPads = 0;
let countyDualPads = 0;
let townshipDualPads = 0;
let reverseDualPads = 0;
const dualExamples = [];

for (const pad of pads) {
  const clear = clearOf(pad);
  const structured = structuredOf(pad);
  const written = writtenOf(pad);
  if (clear) {
    withClear += 1;
    const combined = clear;
    const state = stateDual.test(combined);
    const county = countyDual.test(combined);
    const township = townshipDual.test(combined);
    const reverse = reverseNumberedDual.test(combined);
    if (state) stateDualPads += 1;
    if (county) countyDualPads += 1;
    if (township) townshipDualPads += 1;
    if (reverse) reverseDualPads += 1;
    if ((state || county || township || reverse) && dualExamples.length < 30) {
      dualExamples.push(String(pad?._id || pad?.legacy_id || pad?.padName || pad?.pad_name || 'unknown'));
    }
  } else {
    withoutClear += 1;
    if (structured) withoutClearWithStructured += 1;
    if (written) withoutClearWithWritten += 1;
    if (!structured && !written) withoutAnyDirectionEvidence += 1;
  }
}

if (withClear < 1000) throw new Error(`Expected at least 1,000 pads with Clear Directions; found ${withClear}.`);
if (withClear + withoutClear !== pads.length) throw new Error('Global written-direction audit did not account for every pad.');
if (stateDualPads < 100) throw new Error(`Expected broad state-route double-name coverage; found only ${stateDualPads} pads.`);
if (countyDualPads < 100) throw new Error(`Expected broad county-road double-name coverage; found only ${countyDualPads} pads.`);
if (townshipDualPads < 10) throw new Error(`Expected township-road double-name coverage; found only ${townshipDualPads} pads.`);
if (!reverseDualPads) throw new Error('Expected at least one local-name / numbered-route source pair for reverse-order protection.');

for (const token of [
  'directionGlobalWrittenEntriesV17315',
  'directionGlobalWrittenPrimaryHtmlV17315',
  'directionWrittenStrongSharedAliasV17315',
  'ROUTE SEQUENCE ONLY',
  'Turn-by-turn directions are not verified for this pad yet.'
]) {
  if (!globalSource.includes(token)) throw new Error(`Global renderer is missing ${token}.`);
}
for (const token of ['directionWrittenHasExplicitReverseAliasV17315','directionWrittenStrongSharedAliasReverseSafeV17315']) {
  if (!aliasSafetySource.includes(token)) throw new Error(`Reverse-order alias safety is missing ${token}.`);
}
for (const token of ['directionGlobalWrittenEntriesV17315','directionWrittenHasExplicitReverseAliasV17315']) {
  if (!app.includes(token)) throw new Error(`Assembled app is missing ${token}.`);
}
if (globalSource.includes('direction-highway-badge') || globalSource.includes('street-sign-board')) {
  throw new Error('Global written renderer contains road-sign graphics.');
}

console.log(JSON.stringify({
  version:'17.3.15',
  padsAudited:pads.length,
  padsWithClearDirections:withClear,
  padsWithoutClearDirections:withoutClear,
  missingClearWithStructuredRoute:withoutClearWithStructured,
  missingClearWithWrittenSource:withoutClearWithWritten,
  missingAllDirectionEvidence:withoutAnyDirectionEvidence,
  clearPadsWithStateRouteDoubleNames:stateDualPads,
  clearPadsWithCountyRoadDoubleNames:countyDualPads,
  clearPadsWithTownshipRoadDoubleNames:townshipDualPads,
  clearPadsWithReverseLocalNameNumberPairs:reverseDualPads,
  exampleDoubleNamePads:dualExamples,
  displayPolicy:'numbered written sentences; no road-sign graphics; explicit dual names preserved; shared aliases require >=2 saved-route supports; catalog-only aliases are not injected by number alone',
  result:'pass'
}, null, 2));
