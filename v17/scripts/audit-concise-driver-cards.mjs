import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const publicRoot = path.join(v17Root, 'public');
const read = file => fs.readFile(file, 'utf8');
const clean = value => String(value ?? '').replace(/\r\n?/g, '\n').trim();

const [manifestText, sourcePriority, contextCoalescing, mileageSource, conciseSource, pairSafetySource] = await Promise.all([
  read(path.join(publicRoot, 'data/directions/index.json')),
  read(path.join(v17Root, 'src/parts/22m-direction-source-priority-and-coalescer.js')),
  read(path.join(v17Root, 'src/parts/22n-direction-context-coalescing.js')),
  read(path.join(v17Root, 'src/parts/22o-direction-mileage-badges-double-name.js')),
  read(path.join(v17Root, 'src/parts/22p-direction-concise-driver-cards.js')),
  read(path.join(v17Root, 'src/parts/22q-direction-road-pair-safety.js'))
]);
const manifest = JSON.parse(manifestText);
const rewrites = {};
for (const file of manifest.files || []) Object.assign(rewrites, JSON.parse(await read(path.join(publicRoot, 'data/directions', file))));
if (Object.keys(rewrites).length < 1000) throw new Error(`Expected the full direction rewrite directory; found ${Object.keys(rewrites).length}.`);

function parseEntries(clearText) {
  const text = clean(clearText);
  const marker = /Step-by-step directions\s*:/i.exec(text);
  const body = marker ? text.slice(marker.index + marker[0].length) : text;
  const entries = [];
  const numbered = /(?:^|\n)\s*(\d+)\.\s*([\s\S]*?)(?=(?:\n\s*\d+\.\s)|$)/g;
  let match;
  while ((match = numbered.exec(body))) {
    const instruction = clean(match[2]).replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (instruction) entries.push({ instruction, notes:[], sourceStepOrder:Number(match[1]) || entries.length + 1 });
  }
  return entries;
}

const compactSentence = value => String(value || '')
  .replace(/\bonto\b/gi, 'on')
  .replace(/\.\s*Continue\s+(about\s+|approximately\s+|approx\.?\s+|roughly\s+)?(\d+(?:\.\d+)?|\.\d+|\d+\s*\/\s*\d+|[½¼¾])\s*(miles?|mile|mi)\b/ig, (_, qualifier, amount) => ` for ${qualifier ? 'about ' : ''}${amount} mi`)
  .replace(/\.\s*Continue\s+(about\s+|approximately\s+|approx\.?\s+|roughly\s+)?(\d+(?:\.\d+)?|\.\d+)\s*(feet|foot|ft)\b/ig, (_, qualifier, amount) => ` for ${qualifier ? 'about ' : ''}${amount} ft`)
  .replace(/\s{2,}/g, ' ')
  .trim();

const context = {
  console:{ log(){}, warn(){} },
  window:{},
  navigator:{ onLine:false },
  renderPad:async () => {},
  padById:() => null,
  pads:[],
  SUPABASE_URL:'https://example.invalid',
  SUPABASE_PUBLISHABLE_KEY:'test',
  fetch:async () => { throw new Error('network disabled in audit'); },
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  esc:value => String(value ?? ''),
  directionWrittenCleanV17315:value => String(value || '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim(),
  directionWrittenSentenceV17315:compactSentence,
  directionGlobalWrittenEntriesV17315:value => value,
  directionGlobalWrittenPrimaryHtmlV17315:() => '',
};
vm.createContext(context);
vm.runInContext(sourcePriority, context, { filename:'22m-direction-source-priority-and-coalescer.js' });
vm.runInContext(contextCoalescing, context, { filename:'22n-direction-context-coalescing.js' });
vm.runInContext(mileageSource, context, { filename:'22o-direction-mileage-badges-double-name.js' });
vm.runInContext(conciseSource, context, { filename:'22p-direction-concise-driver-cards.js' });
vm.runInContext(pairSafetySource, context, { filename:'22q-direction-road-pair-safety.js' });

const mileagePattern = /(\d+(?:\.\d+)?|\.\d+|\d+\s*\/\s*\d+|[½¼¾])\s*(?:miles?|mile|mi\b|feet|foot|ft\b|yards?|yd\b)/ig;
const mainMileagePattern = /(\d+(?:\.\d+)?|\.\d+|\d+\s*\/\s*\d+|[½¼¾])\s*(?:miles?|mile|mi\b|feet|foot|ft\b|yards?|yd\b)/i;
let padsAudited = 0;
let rawCards = 0;
let coalescedCards = 0;
let renderedCards = 0;
let oneDistanceCandidates = 0;
let oneDistanceBadges = 0;
let mainLinesWithEmbeddedMileage = 0;
let mainLinesStartingWithContext = 0;
let mainLinesWithMultipleSentences = 0;
let explicitDoublePairs = 0;
let explicitDoublePairsPreserved = 0;
let routeConcurrencies = 0;
let routeConcurrenciesPreserved = 0;
const failures = [];

const routeToken = value => /^(?:(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?|(?:State|County|Township)\s+(?:Route|Road|Rd|Hwy)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?)$/i.test(String(value || '').trim());

for (const [id, record] of Object.entries(rewrites)) {
  const raw = parseEntries(record?.r);
  if (!raw.length) continue;
  padsAudited += 1;
  rawCards += raw.length;
  const entries = context.directionCoalesceEntriesV17316(raw);
  coalescedCards += entries.length;
  const fakePad = { directionRoadIntelligence:[] };

  for (const entry of entries) {
    const rendered = compactSentence(entry.instruction);
    const distanceMatches = [...rendered.matchAll(mileagePattern)];
    const display = context.directionConciseMetaV17317(entry, fakePad);
    renderedCards += 1;

    if (!display?.instruction) {
      if (failures.length < 30) failures.push(`${id}: empty main line from ${entry.instruction}`);
      continue;
    }
    if (/^(?:From|At)\b/i.test(display.instruction)) {
      mainLinesStartingWithContext += 1;
      if (failures.length < 30) failures.push(`${id}: context stayed in main line: ${display.instruction}`);
    }
    if (/\.\s+\S/.test(display.instruction)) {
      mainLinesWithMultipleSentences += 1;
      if (failures.length < 30) failures.push(`${id}: narrative main line: ${display.instruction}`);
    }
    if (mainMileagePattern.test(display.instruction)) {
      mainLinesWithEmbeddedMileage += 1;
      if (failures.length < 30) failures.push(`${id}: mileage stayed in main line: ${display.instruction}`);
    }
    if (distanceMatches.length === 1) {
      oneDistanceCandidates += 1;
      if (display.distance) oneDistanceBadges += 1;
    }

    if (context.directionExplicitDoubleNameV17317(rendered)) {
      explicitDoublePairs += 1;
      if (context.directionExplicitDoubleNameV17317(display.instruction)) explicitDoublePairsPreserved += 1;
      else if (failures.length < 30) failures.push(`${id}: explicit double name was lost: ${entry.instruction} -> ${display.instruction}`);
    }

    const slash = display.instruction.split('/').map(part => part.trim());
    if (slash.length === 2 && slash.every(part => routeToken(part.replace(/^(?:Turn|Take|Continue|Veer|Bear|Slight|Sharp|Stay|Keep|Merge)\b.*?\bon\s+/i, '')))) {
      routeConcurrencies += 1;
      if (display.instruction.includes('/')) routeConcurrenciesPreserved += 1;
    }
  }
}

const mileageCoverage = oneDistanceCandidates ? oneDistanceBadges / oneDistanceCandidates : 0;
if (padsAudited < 1000) throw new Error(`Concise-card audit covered only ${padsAudited} pads.`);
if (renderedCards < 5000) throw new Error(`Concise-card audit covered only ${renderedCards} cards.`);
if (mainLinesStartingWithContext !== 0) throw new Error(`Found ${mainLinesStartingWithContext} main lines still starting with From/At. Examples: ${JSON.stringify(failures)}`);
if (mainLinesWithMultipleSentences !== 0) throw new Error(`Found ${mainLinesWithMultipleSentences} multi-sentence main lines. Examples: ${JSON.stringify(failures)}`);
if (mainLinesWithEmbeddedMileage !== 0) throw new Error(`Found ${mainLinesWithEmbeddedMileage} main lines with mileage still embedded. Examples: ${JSON.stringify(failures)}`);
if (oneDistanceCandidates < 1500) throw new Error(`Expected broad saved-mileage coverage; found only ${oneDistanceCandidates} single-distance cards.`);
if (mileageCoverage < 0.95) throw new Error(`Only ${(mileageCoverage * 100).toFixed(1)}% of single-distance cards got mileage badges (${oneDistanceBadges}/${oneDistanceCandidates}).`);
if (explicitDoublePairs < 100) throw new Error(`Expected broad explicit double-name coverage; found only ${explicitDoublePairs} cards.`);
if (explicitDoublePairsPreserved !== explicitDoublePairs) throw new Error(`Preserved ${explicitDoublePairsPreserved}/${explicitDoublePairs} explicit double-name cards.`);

console.log(JSON.stringify({
  version:'17.3.17',
  padsAudited,
  rawCards,
  cardsAfterFragmentCoalescing:coalescedCards,
  conciseCardsAudited:renderedCards,
  singleDistanceCandidates:oneDistanceCandidates,
  mileageBadges:oneDistanceBadges,
  mileageBadgeCoverage:Number((mileageCoverage * 100).toFixed(2)),
  mainLinesStartingWithContext,
  mainLinesWithMultipleSentences,
  mainLinesWithEmbeddedMileage,
  explicitDoubleNameCards:explicitDoublePairs,
  explicitDoubleNameCardsPreserved:explicitDoublePairsPreserved,
  routeConcurrencySamples:routeConcurrencies,
  routeConcurrencySamplesPreserved:routeConcurrenciesPreserved,
  policy:'main line = maneuver + road; right-side saved mileage badge; supporting context in notes; route/local double names inline; no sign graphics',
  result:'pass'
}, null, 2));
