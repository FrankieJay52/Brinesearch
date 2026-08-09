import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const publicRoot = path.join(v17Root, 'public');
const read = file => fs.readFile(file, 'utf8');
const normalize = value => String(value ?? '').replace(/\r\n?/g, '\n').trim();

const [fallbackText, directionManifestText, globalSource, aliasSafetySource, sourcePrioritySource, app] = await Promise.all([
  read(path.join(publicRoot, 'pad-fallback-data.json')),
  read(path.join(publicRoot, 'data/directions/index.json')),
  read(path.join(v17Root, 'src/parts/22j-global-written-directions.js')),
  read(path.join(v17Root, 'src/parts/22k-global-written-alias-safety.js')),
  read(path.join(v17Root, 'src/parts/22m-direction-source-priority-and-coalescer.js')),
  read(path.join(publicRoot, 'app/brinesearch-app.js'))
]);
const fallback = JSON.parse(fallbackText);
const pads = Array.isArray(fallback?.pads) ? fallback.pads : [];
if (pads.length < 1000) throw new Error(`Global written-direction audit expected the complete pad directory; found ${pads.length}.`);

const directionManifest = JSON.parse(directionManifestText);
const rewrites = {};
for (const file of directionManifest.files || []) {
  Object.assign(rewrites, JSON.parse(await read(path.join(publicRoot, 'data/directions', file))));
}

const idOf = pad => String(pad?._id ?? pad?.legacy_id ?? '').trim();
const structuredOf = pad => normalize(pad?.Structured_Road_Sequence ?? pad?.structured_road_sequence);
const writtenOf = pad => normalize(pad?.writtenDirections ?? pad?.written_directions);
const storedClearOf = pad => normalize(pad?.directionsClear ?? pad?.directions_clear);
function clearOf(pad) {
  const id = idOf(pad);
  const written = writtenOf(pad);
  const rewrite = rewrites[id];
  if (rewrite && normalize(rewrite?.s) === written) return normalize(rewrite?.r);
  return storedClearOf(pad);
}

function parseClearEntries(clearText) {
  const text = normalize(clearText);
  const marker = /Step-by-step directions\s*:/i.exec(text);
  const body = marker ? text.slice(marker.index + marker[0].length) : text;
  const entries = [];
  const numbered = /(?:^|\n)\s*(\d+)\.\s*([\s\S]*?)(?=(?:\n\s*\d+\.\s)|$)/g;
  let match;
  while ((match = numbered.exec(body))) {
    const instruction = normalize(match[2]).replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (instruction) entries.push({ instruction, notes:[], sourceStepOrder:Number(match[1]) || entries.length + 1 });
  }
  return entries;
}

const context = {
  console:{ log(){}, warn(){} },
  directionGlobalWrittenEntriesV17315: clearText => ({ reference:'', steps:parseClearEntries(clearText) }),
  directionWrittenSentenceV17315: value => String(value || '').trim(),
  navigator:{ onLine:false },
  window:{},
  renderPad:async () => {},
  padById:() => null,
  pads:[],
  SUPABASE_URL:'https://example.invalid',
  SUPABASE_PUBLISHABLE_KEY:'test',
  fetch:async () => { throw new Error('network disabled in audit'); },
  URL,
  AbortController,
  setTimeout,
  clearTimeout
};
vm.createContext(context);
vm.runInContext(sourcePrioritySource, context, { filename:'22m-direction-source-priority-and-coalescer.js' });

const stateDual = /\b(?:(?:OH|WV|PA|SR)\s*[- ]?\s*\d{1,4}[A-Z]?|State\s+Route\s*[- ]?\s*\d{1,4}[A-Z]?)[^\n.;]{0,90}\s*\/\s*[^\n.;]{1,90}/i;
const countyDual = /\b(?:(?:CR|C\.?\s*R\.?)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?|County\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?)[^\n.;]{0,90}\s*\/\s*[^\n.;]{1,90}/i;
const townshipDual = /\b(?:(?:TR|T\.?\s*R\.?)\s*[- ]?\s*\d{1,4}[A-Z]?|Township\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*\d{1,4}[A-Z]?)[^\n.;]{0,90}\s*\/\s*[^\n.;]{1,90}/i;
const reverseNumberedDual = /\b[A-Za-z0-9][A-Za-z0-9 .'-]{0,90}?(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Trail|Byway|Way|Run|Ridge|Fork|Hollow|Creek|Crossing)\s*\/\s*(?:(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?|(?:State|County|Township)\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?)/i;

const obviousFragment = value => {
  const text = String(value || '').replace(/\s{2,}/g, ' ').trim();
  return context.directionStepHardFragmentV17316(text)
    || context.directionStepShortOriginV17316(text)
    || /^Exit\.?$/i.test(text)
    || context.directionStepArrivalTokenV17316(text);
};

let withClear = 0;
let withoutClear = 0;
let exactRewriteClear = 0;
let storedClear = 0;
let withoutClearWithStructured = 0;
let withoutClearWithWritten = 0;
let withoutAnyDirectionEvidence = 0;
let stateDualPads = 0;
let countyDualPads = 0;
let townshipDualPads = 0;
let reverseDualPads = 0;
let rawFragmentCards = 0;
let coalescedFragmentCards = 0;
let coalescedPads = 0;
const survivingFragmentExamples = [];
const dualExamples = [];

for (const pad of pads) {
  const id = idOf(pad);
  const clear = clearOf(pad);
  const structured = structuredOf(pad);
  const written = writtenOf(pad);
  const rewrite = rewrites[id];
  if (clear) {
    withClear += 1;
    if (rewrite && normalize(rewrite?.s) === written && normalize(rewrite?.r)) exactRewriteClear += 1;
    else if (storedClearOf(pad)) storedClear += 1;

    const rawEntries = parseClearEntries(clear);
    rawFragmentCards += rawEntries.filter(entry => obviousFragment(entry.instruction)).length;
    const cleaned = context.directionCoalesceEntriesV17316(rawEntries);
    if (cleaned.length !== rawEntries.length) coalescedPads += 1;
    const surviving = cleaned.filter(entry => obviousFragment(entry.instruction));
    coalescedFragmentCards += surviving.length;
    if (surviving.length && survivingFragmentExamples.length < 20) {
      survivingFragmentExamples.push({ id, steps:surviving.map(entry => entry.instruction) });
    }

    const state = stateDual.test(clear);
    const county = countyDual.test(clear);
    const township = townshipDual.test(clear);
    const reverse = reverseNumberedDual.test(clear);
    if (state) stateDualPads += 1;
    if (county) countyDualPads += 1;
    if (township) townshipDualPads += 1;
    if (reverse) reverseDualPads += 1;
    if ((state || county || township || reverse) && dualExamples.length < 30) dualExamples.push(id || String(pad?.padName || pad?.pad_name || 'unknown'));
  } else {
    withoutClear += 1;
    if (structured) withoutClearWithStructured += 1;
    if (written) withoutClearWithWritten += 1;
    if (!structured && !written) withoutAnyDirectionEvidence += 1;
  }
}

if (withClear < 1000) throw new Error(`Expected at least 1,000 verified/stored Clear Direction records in the packaged fallback path; found ${withClear}.`);
if (exactRewriteClear < 1000) throw new Error(`Expected the verified direction rewrite layer to cover at least 1,000 fallback pads; found ${exactRewriteClear}.`);
if (withClear + withoutClear !== pads.length) throw new Error('Global written-direction audit did not account for every packaged pad.');
if (rawFragmentCards < 100) throw new Error(`Expected the audit fixture to expose the known legacy fragment problem; found only ${rawFragmentCards} raw fragment cards.`);
if (coalescedFragmentCards !== 0) throw new Error(`V17.3.16 left ${coalescedFragmentCards} obvious fragment cards after coalescing: ${JSON.stringify(survivingFragmentExamples)}`);
if (stateDualPads < 100) throw new Error(`Expected broad state-route double-name coverage; found only ${stateDualPads} packaged pads.`);
if (countyDualPads < 100) throw new Error(`Expected broad county-road double-name coverage; found only ${countyDualPads} packaged pads.`);
if (townshipDualPads < 10) throw new Error(`Expected township-road double-name coverage; found only ${townshipDualPads} packaged pads.`);
if (!reverseDualPads) throw new Error('Expected at least one local-name / numbered-route source pair for reverse-order protection.');

const noellePad = pads.find(pad => idOf(pad) === 'ascent--noelle');
if (!noellePad) throw new Error('Noelle regression pad is missing from the packaged directory.');
const noelleRaw = parseClearEntries(clearOf(noellePad));
const noelleClean = context.directionCoalesceEntriesV17316(noelleRaw);
if (noelleClean.length > 10) throw new Error(`Noelle still produces ${noelleClean.length} written cards; expected 10 or fewer after coalescing.`);
if (noelleClean.some(entry => obviousFragment(entry.instruction))) throw new Error(`Noelle still contains an orphan fragment: ${JSON.stringify(noelleClean)}`);
if (!/\bexit\b/i.test(noelleClean[0]?.instruction || '')) throw new Error(`Noelle's first exit instruction was not reassembled: ${noelleClean[0]?.instruction}`);

const dualFixture = context.directionCoalesceEntriesV17316([
  { instruction:'Turn right on OH-151 / Mill St for 0.2 mi.', notes:[], sourceStepOrder:1 },
  { instruction:'Turn left on Fernwood-Bloomingdale Rd / CR-26.', notes:[], sourceStepOrder:2 },
  { instruction:'Turn right on Township Hwy 141 / TR-141 for 0.7 mi.', notes:[], sourceStepOrder:3 }
]);
if (!dualFixture[0]?.instruction.includes('OH-151 / Mill St')) throw new Error('State-route/local-name pair was damaged by V17.3.16 coalescing.');
if (!dualFixture[1]?.instruction.includes('Fernwood-Bloomingdale Rd / CR-26')) throw new Error('Reverse county-road/local-name pair was damaged by V17.3.16 coalescing.');
if (!dualFixture[2]?.instruction.includes('Township Hwy 141 / TR-141')) throw new Error('Township-road double name was damaged by V17.3.16 coalescing.');

for (const token of [
  'directionGlobalWrittenEntriesV17315',
  'directionGlobalWrittenPrimaryHtmlV17315',
  'directionWrittenStrongSharedAliasV17315',
  'ROUTE SEQUENCE ONLY',
  'Turn-by-turn directions are not verified for this pad yet.'
]) if (!globalSource.includes(token)) throw new Error(`Global renderer is missing ${token}.`);
for (const token of ['directionWrittenHasExplicitReverseAliasV17315','directionWrittenStrongSharedAliasReverseSafeV17315']) {
  if (!aliasSafetySource.includes(token)) throw new Error(`Reverse-order alias safety is missing ${token}.`);
}
for (const token of [
  'directionCoalesceEntriesV17316',
  'directionHydrateSelectedLiveClearV17316',
  'directionRefreshAllLiveClearV17316',
  '__brineLiveClearDirectionsReadyV17316',
  'DATA_SOURCE_LABEL being "Live database"'
]) if (!sourcePrioritySource.includes(token)) throw new Error(`V17.3.16 source-priority layer is missing ${token}.`);
for (const token of ['directionGlobalWrittenEntriesV17315','directionWrittenHasExplicitReverseAliasV17315','directionCoalesceEntriesV17316','directionHydrateSelectedLiveClearV17316']) {
  if (!app.includes(token)) throw new Error(`Assembled app is missing ${token}.`);
}
if (globalSource.includes('direction-highway-badge') || globalSource.includes('street-sign-board')) throw new Error('Global written renderer contains road-sign graphics.');

console.log(JSON.stringify({
  version:'17.3.16',
  packagedPadsAudited:pads.length,
  packagedPadsWithVerifiedOrStoredClearDirections:withClear,
  exactVerifiedRewriteMatches:exactRewriteClear,
  storedClearDirectionRecords:storedClear,
  packagedPadsWithoutClearDirections:withoutClear,
  missingClearWithStructuredRoute:withoutClearWithStructured,
  missingClearWithWrittenSource:withoutClearWithWritten,
  missingAllDirectionEvidence:withoutAnyDirectionEvidence,
  rawObviousFragmentCards:rawFragmentCards,
  obviousFragmentCardsAfterCoalescing:coalescedFragmentCards,
  padsWhoseCardCountWasCoalesced:coalescedPads,
  noelleRawCards:noelleRaw.length,
  noelleCardsAfterCoalescing:noelleClean.length,
  clearPadsWithStateRouteDoubleNames:stateDualPads,
  clearPadsWithCountyRoadDoubleNames:countyDualPads,
  clearPadsWithTownshipRoadDoubleNames:townshipDualPads,
  clearPadsWithReverseLocalNameNumberPairs:reverseDualPads,
  exampleDoubleNamePads:dualExamples,
  displayPolicy:'live Clear Directions win when online; packaged fallback is fragment-coalesced; numbered written sentences; no road-sign graphics; explicit dual names preserved; no invented roads/turns/mileage',
  result:'pass'
}, null, 2));
