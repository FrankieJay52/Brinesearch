import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const publicRoot = path.join(v17Root, 'public');
const read = file => fs.readFile(file, 'utf8');
const clean = value => String(value ?? '').replace(/\r\n?/g, '\n').trim();

const [manifestText, sourcePriority, contextCoalescing, mileageSource, conciseSource, pairSafetySource, finalContractSource] = await Promise.all([
  read(path.join(publicRoot, 'data/directions/index.json')),
  read(path.join(v17Root, 'src/parts/22m-direction-source-priority-and-coalescer.js')),
  read(path.join(v17Root, 'src/parts/22n-direction-context-coalescing.js')),
  read(path.join(v17Root, 'src/parts/22o-direction-mileage-badges-double-name.js')),
  read(path.join(v17Root, 'src/parts/22p-direction-concise-driver-cards.js')),
  read(path.join(v17Root, 'src/parts/22q-direction-road-pair-safety.js')),
  read(path.join(v17Root, 'src/parts/22r-direction-final-card-contract.js'))
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

function canonicalRoute(value) {
  const text = String(value || '').trim();
  let match = text.match(/^County\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)$/i);
  if (match) return `CR-${match[1]}`;
  match = text.match(/^Township\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)$/i);
  if (match) return `TR-${match[1]}`;
  return text.replace(/\s*[- ]\s*/g, '-').replace(/^(I|US|OH|WV|PA|SR|CR|TR)-?/i, (_, family) => `${family.toUpperCase()}-`);
}

function simpleDualRoad(value) {
  const text = String(value || '');
  const route = '((?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d{1,4}(?:\\/\\d+)?[A-Z]?|(?:State|County|Township)\\s+(?:Route|Road|Rd|Hwy)\\s*[- ]?\\s*\\d{1,4}(?:\\/\\d+)?[A-Z]?)';
  const local = "([A-Za-z0-9][A-Za-z0-9 .'-]{0,70}?(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way))";
  let match = text.match(new RegExp(`\\b${route}\\s*\\/\\s*${local}\\b`, 'i'));
  if (match) return { kind:'route', text:canonicalRoute(match[1]), alias:match[2].trim() };
  match = text.match(new RegExp(`\\b${local}\\s*\\/\\s*${route}\\b`, 'i'));
  if (match) return { kind:'route', text:canonicalRoute(match[2]), alias:match[1].trim() };
  return null;
}

function simpleStepView(value) {
  const text = String(value || '').replace(/\bonto\b/gi, 'on').trim();
  const dual = simpleDualRoad(text);
  if (dual) return { road:dual, maneuver:'', note:'' };
  let match = text.match(/\bExit\s*([0-9A-Z-]+)/i);
  if (match) return { road:{ kind:'exit', text:`Exit ${match[1]}` }, maneuver:'', note:'' };
  match = text.match(/\b(?:on|along|take|follow)\s+(?:the\s+)?(.+?)(?=\s+(?:for|in|and|then|until|toward|towards|continue|past|through|to|at)\b|[.;,]|$)/i);
  if (match?.[1]) {
    const candidate = match[1].trim().replace(/^(?:north|south|east|west)\s+/i, '');
    return { road:{ kind:'road', text:candidate }, maneuver:'', note:'' };
  }
  match = text.match(/\b((?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}[A-Z]?|(?:State|County|Township)\s+(?:Route|Road|Rd|Hwy)\s*[- ]?\s*\d{1,4}[A-Z]?)\b/i);
  if (match) return { road:{ kind:'route', text:canonicalRoute(match[1]) }, maneuver:'', note:'' };
  return { road:{ kind:'', text:'' }, maneuver:'', note:'' };
}

function simpleLegacySplit(value) {
  const text = String(value || '').replace(/\s{2,}/g, ' ').trim();
  if (!text) return [];
  return text
    .replace(/\s+(?=(?:turn\s+(?:left|right)\b|slight\s+(?:left|right)\b|veer\s+(?:left|right)\b|bear\s+(?:left|right)\b|take\s+(?:exit|I-|US-|OH-|WV-|PA-|SR-|Route)|head\s+(?:north|south|east|west)\b|merge\b|travel\b|go\s+to\b))/gi, '\n')
    .split(/\n+/)
    .map(part => part.trim())
    .filter(Boolean);
}

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
  directionInlineDualRoadV17312:simpleDualRoad,
  directionClearStepViewV1733:simpleStepView,
  directionSplitDriverStepV17312:simpleLegacySplit,
};
vm.createContext(context);
vm.runInContext(sourcePriority, context, { filename:'22m-direction-source-priority-and-coalescer.js' });
vm.runInContext(contextCoalescing, context, { filename:'22n-direction-context-coalescing.js' });
vm.runInContext(mileageSource, context, { filename:'22o-direction-mileage-badges-double-name.js' });
vm.runInContext(conciseSource, context, { filename:'22p-direction-concise-driver-cards.js' });
vm.runInContext(pairSafetySource, context, { filename:'22q-direction-road-pair-safety.js' });
vm.runInContext(finalContractSource, context, { filename:'22r-direction-final-card-contract.js' });

const mainMileagePattern = /(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|[½¼¾]|\d+(?:\.\d+)?|\.\d+)\s*(?:miles?|mile|mi\b|feet|foot|ft\b|yards?|yard|yd\b)/i;
let padsAudited = 0;
let rawCards = 0;
let coalescedCards = 0;
let splitCards = 0;
let renderedCards = 0;
let contextRowsSuppressed = 0;
let oneDistanceCandidates = 0;
let oneDistanceBadges = 0;
let mainLinesWithEmbeddedMileage = 0;
let mainLinesStartingWithContext = 0;
let mainLinesWithMultipleSentences = 0;
let explicitDoublePairs = 0;
let explicitDoublePairsPreserved = 0;
const failures = [];

for (const [id, record] of Object.entries(rewrites)) {
  const raw = parseEntries(record?.r);
  if (!raw.length) continue;
  padsAudited += 1;
  rawCards += raw.length;
  const coalesced = context.directionCoalesceEntriesV17316(raw);
  coalescedCards += coalesced.length;
  const entries = context.directionFinalSplitEntriesV17317(coalesced);
  splitCards += entries.length;
  const fakePad = { directionRoadIntelligence:[] };

  for (const entry of entries) {
    const facts = context.directionDistanceFactsFinalV17317(entry.instruction);
    const explicitPair = context.directionExplicitRoadDisplayFinalV17317(entry.instruction, fakePad);
    const display = context.directionFinalMetaV17317(entry, fakePad);
    if (display.suppress) {
      contextRowsSuppressed += 1;
      continue;
    }
    renderedCards += 1;

    if (!display.instruction) {
      if (failures.length < 40) failures.push(`${id}: empty final main line from ${entry.instruction}`);
      continue;
    }
    if (/^(?:From|At)\b/i.test(display.instruction)) {
      mainLinesStartingWithContext += 1;
      if (failures.length < 40) failures.push(`${id}: context stayed in main line: ${display.instruction}`);
    }
    if (/\.\s+\S/.test(display.instruction)) {
      mainLinesWithMultipleSentences += 1;
      if (failures.length < 40) failures.push(`${id}: narrative main line: ${display.instruction}`);
    }
    if (mainMileagePattern.test(display.instruction)) {
      mainLinesWithEmbeddedMileage += 1;
      if (failures.length < 40) failures.push(`${id}: mileage stayed in main line: ${display.instruction}`);
    }
    if (facts.length === 1) {
      oneDistanceCandidates += 1;
      if (display.distance) oneDistanceBadges += 1;
      else if (failures.length < 40) failures.push(`${id}: one saved distance did not become a badge: ${entry.instruction}`);
    }

    if (explicitPair?.doubleName) {
      explicitDoublePairs += 1;
      if (display.doubleName && display.instruction.includes('/')) explicitDoublePairsPreserved += 1;
      else if (failures.length < 40) failures.push(`${id}: explicit road/route pair was lost: ${entry.instruction} -> ${display.instruction}`);
    }
  }
}

const mileageCoverage = oneDistanceCandidates ? oneDistanceBadges / oneDistanceCandidates : 0;
const summary = {
  version:'17.3.17',
  padsAudited,
  rawCards,
  cardsAfterFragmentCoalescing:coalescedCards,
  cardsAfterFinalCompoundSplit:splitCards,
  finalDriverCardsAudited:renderedCards,
  contextOnlyRowsFoldedIntoNotes:contextRowsSuppressed,
  singleDistanceCandidates:oneDistanceCandidates,
  mileageBadges:oneDistanceBadges,
  mileageBadgeCoverage:Number((mileageCoverage * 100).toFixed(2)),
  mainLinesStartingWithContext,
  mainLinesWithMultipleSentences,
  mainLinesWithEmbeddedMileage,
  explicitRoadRouteDoubleNames:explicitDoublePairs,
  explicitRoadRouteDoubleNamesPreserved:explicitDoublePairsPreserved,
  examples:failures,
  policy:'main line = maneuver + road; saved distance badge at right; extra context underneath; road/local-route double names inline; no signs',
};
console.log(JSON.stringify(summary, null, 2));

if (padsAudited < 1000) throw new Error(`Final-card audit covered only ${padsAudited} pads.`);
if (renderedCards < 4500) throw new Error(`Final-card audit covered only ${renderedCards} final cards.`);
if (mainLinesStartingWithContext !== 0) throw new Error(`Found ${mainLinesStartingWithContext} final main lines still starting with From/At.`);
if (mainLinesWithMultipleSentences !== 0) throw new Error(`Found ${mainLinesWithMultipleSentences} multi-sentence final main lines.`);
if (mainLinesWithEmbeddedMileage !== 0) throw new Error(`Found ${mainLinesWithEmbeddedMileage} final main lines with mileage still embedded.`);
if (oneDistanceCandidates < 1500) throw new Error(`Expected broad saved-mileage coverage; found only ${oneDistanceCandidates} one-distance cards.`);
if (mileageCoverage < 0.98) throw new Error(`Only ${(mileageCoverage * 100).toFixed(1)}% of one-distance cards got right-side badges (${oneDistanceBadges}/${oneDistanceCandidates}).`);
if (explicitDoublePairs < 100) throw new Error(`Expected broad explicit road/route double-name coverage; found only ${explicitDoublePairs}.`);
if (explicitDoublePairsPreserved !== explicitDoublePairs) throw new Error(`Preserved ${explicitDoublePairsPreserved}/${explicitDoublePairs} explicit road/route double names.`);
console.log('Final concise driver-card audit passed.');
