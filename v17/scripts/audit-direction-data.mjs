import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const publicRoot = path.join(v17Root, 'public');

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const normalize = value => String(value ?? '').trim();

function mileageTokens(value) {
  const text = String(value ?? '');
  const regex = /(\d+\s*\/\s*\d+|[½¼¾]|\d+\.\d+|\.\d+|\d+)\s*\.?\s*(miles?|mile|mi\b|feet|foot|ft\b)/gi;
  const values = [];
  let match;
  while ((match = regex.exec(text))) {
    const raw = String(match[1] || '').replace(/\s+/g, '');
    const unit = String(match[2] || '').toLowerCase();
    let number = null;
    if (raw === '½') number = 0.5;
    else if (raw === '¼') number = 0.25;
    else if (raw === '¾') number = 0.75;
    else if (/^\d+\/\d+$/.test(raw)) {
      const [a,b] = raw.split('/').map(Number);
      if (b) number = a / b;
    } else if (raw.startsWith('.') && /^(?:feet|foot|ft)/i.test(unit)) {
      number = Number(raw.slice(1));
    } else number = Number(raw);
    if (!Number.isFinite(number)) continue;
    values.push(/^(?:feet|foot|ft)/i.test(unit) ? number / 5280 : number);
  }
  return values;
}

function rewriteAddsMileage(source, rewrite) {
  const sourceValues = mileageTokens(source);
  const rewriteValues = mileageTokens(rewrite);
  return rewriteValues.some(value => !sourceValues.some(saved => Math.abs(saved - value) <= 0.00001));
}

function hasFusedRouteMileage(value) {
  return /\b((?:(?:I|US|OH|WV|PA|SR)-\d{1,4})|(?:(?:County|Township)\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*\d{1,4})|(?:(?:C\.?\s*R\.?|T\.?\s*R\.?|CR|TR|Co\.?\s*Rd\.?)\s*[- ]?\s*\d{1,4}))\.(\d+)(?=\s*\.?\s*(?:miles?|mile|mi)\b)/i.test(String(value ?? ''));
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else current += char;
  }
  values.push(current);
  return values;
}

function structuredAliasDisplay(value) {
  const text = normalize(value).replace(/\s{2,}/g, ' ');
  if (!text || !text.includes('/')) return false;
  const suffix = '(?:Rd|Road|St|Street|Ave|Avenue|Hwy|Highway|Ln|Lane|Dr|Drive|Pike|Ridge|Crossing|Run|Hollow|Hill|Creek|Fork)';
  const compass = '(?:northwest|northeast|southwest|southeast|north|south|east|west|NW|NE|SW|SE|N|S|E|W)';
  const numbered = '(?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d{1,4}[A-Z]?';
  const worded = '(?:(?:State\\s+Route|County\\s+(?:Road|Rd|Route|Hwy)|Township\\s+(?:Road|Rd|Route|Hwy)|C\\.?\\s*R\\.?|T\\.?\\s*R\\.?|Co\\.?\\s*Rd\\.?)\\s*[- ]?\\s*\\d{1,4}[A-Z]?)';
  const generic = '(?:Route\\s*[- ]?\\s*\\d{1,4}[A-Z]?)';
  const primary = `(?:${numbered}|${worded}|${generic})`;
  if (new RegExp(`\\b${primary}(?:\\s+${compass})?\\s*\\/\\s*(?:${compass}\\s*\\/\\s*)?[A-Za-z0-9][A-Za-z0-9 .'-]{0,70}?${suffix}\\b`, 'i').test(text)) return true;
  if (new RegExp(`\\b[A-Za-z0-9][A-Za-z0-9 .'-]{0,70}?${suffix}\\.?\\s*\\/\\s*(?:C\\.?\\s*R\\.?|CR|T\\.?\\s*R\\.?|TR)\\s*[- ]?\\s*\\d{1,4}[A-Z]?\\b`, 'i').test(text)) return true;
  return false;
}

const fallback = await readJson(path.join(publicRoot, 'pad-fallback-data.json'));
const pads = Array.isArray(fallback?.pads) ? fallback.pads : [];
if (pads.length < 1000) throw new Error(`Direction audit expected the full fallback directory; found only ${pads.length} records.`);

const directionManifest = await readJson(path.join(publicRoot, 'data/directions/index.json'));
const rewrites = {};
for (const file of directionManifest.files || []) {
  Object.assign(rewrites, await readJson(path.join(publicRoot, 'data/directions', file)));
}

const app = await fs.readFile(path.join(publicRoot, 'app/brinesearch-app.js'), 'utf8');
const padById = new Map(pads.map(pad => [String(pad?._id || ''), pad]));

let withWrittenDirections = 0;
let withMileageEvidence = 0;
let writtenWithoutMileage = 0;
let withoutWrittenDirections = 0;
let genericRouteSequences = 0;
let exactRewriteSources = 0;
let staleRewriteSources = 0;
let unsafePackagedRewrites = 0;
let fusedRouteMileageSources = 0;
const unsafeExamples = [];
const fusedExamples = [];

for (const pad of pads) {
  const id = String(pad?._id || '');
  if (!id) throw new Error('Direction audit found a fallback pad without an _id.');
  const source = normalize(pad?.writtenDirections);
  if (source) {
    withWrittenDirections += 1;
    if (mileageTokens(source).length) withMileageEvidence += 1;
    else writtenWithoutMileage += 1;
    if (hasFusedRouteMileage(source)) {
      fusedRouteMileageSources += 1;
      if (fusedExamples.length < 12) fusedExamples.push(id);
    }
  } else withoutWrittenDirections += 1;

  if (/(^|→)\s*Route\s*[- ]?\s*\d/i.test(normalize(pad?.Structured_Road_Sequence))) genericRouteSequences += 1;
}

for (const [id, entry] of Object.entries(rewrites)) {
  const pad = padById.get(id);
  if (!pad) continue;
  const currentSource = normalize(pad.writtenDirections);
  if (normalize(entry?.s) !== currentSource) {
    staleRewriteSources += 1;
    continue;
  }
  exactRewriteSources += 1;
  if (rewriteAddsMileage(currentSource, entry?.r)) {
    unsafePackagedRewrites += 1;
    if (unsafeExamples.length < 12) unsafeExamples.push(id);
  }
}

if (unsafePackagedRewrites && (!app.includes('directionRewriteAddsMileageV17312') || !app.includes('directionSavedMileageSourceV17312'))) {
  throw new Error(`${unsafePackagedRewrites} packaged direction rewrites add unsaved mileage and the runtime safety fallback is missing.`);
}
if (fusedRouteMileageSources && !app.includes('directionSourceNeedsMileageRepairV17312')) {
  throw new Error(`${fusedRouteMileageSources} saved directions contain fused route-number/mileage punctuation and the repair guard is missing.`);
}

const roadReviewText = await fs.readFile(path.join(publicRoot, 'road_name_review.csv'), 'utf8');
const roadReviewLines = roadReviewText.split(/\r?\n/).filter(Boolean);
const roadHeader = parseCsvLine(roadReviewLines.shift() || '');
const displayIndex = roadHeader.indexOf('standardized_display');
const reasonIndex = roadHeader.indexOf('review_reason');
const recordIndex = roadHeader.indexOf('record_id');
const stateIndex = roadHeader.indexOf('state');
const aliasRows = [];
for (const line of roadReviewLines) {
  const row = parseCsvLine(line);
  if (row[reasonIndex] === 'slash/alias road name needs source verification') aliasRows.push(row);
}
const structuredAliasRows = aliasRows.filter(row => structuredAliasDisplay(row[displayIndex]));
const slashNoiseRows = aliasRows.filter(row => !structuredAliasDisplay(row[displayIndex]));
if (structuredAliasRows.length && (!app.includes('directionInlineDualRoadV17312') || !app.includes('directionUsefulAliasV17312'))) {
  throw new Error(`${structuredAliasRows.length} structured dual-road rows exist but the explicit dual-name runtime fallback is missing.`);
}
if (app.includes('Left/East Onto County Rd') && app.includes('directionInlineDualRoadV17312("Left/East Onto County Rd"')) {
  throw new Error('Narrative slash text must not be promoted as a dual road name.');
}

const aliasSupport = new Map();
for (const row of structuredAliasRows) {
  const key = `${row[stateIndex]}|${row[displayIndex]}`;
  if (!aliasSupport.has(key)) aliasSupport.set(key, new Set());
  aliasSupport.get(key).add(row[recordIndex]);
}
const repeatedAliasPairs = [...aliasSupport.entries()]
  .filter(([, records]) => records.size >= 2)
  .map(([key, records]) => ({ key, support:records.size }))
  .sort((a,b) => b.support - a.support || a.key.localeCompare(b.key));

const accounted = withMileageEvidence + writtenWithoutMileage + withoutWrittenDirections;
if (accounted !== pads.length) throw new Error(`Direction audit failed to account for every pad (${accounted}/${pads.length}).`);

console.log(JSON.stringify({
  version:'17.3.12',
  padsAudited:pads.length,
  withWrittenDirections,
  withSavedNumericMileage:withMileageEvidence,
  writtenDirectionsWithoutNumericMileage:writtenWithoutMileage,
  noWrittenDirections:withoutWrittenDirections,
  genericRouteSequences,
  rewriteRecords:Object.keys(rewrites).length,
  exactRewriteSources,
  staleRewriteSources,
  packagedRewritesProtectedByMileageGuard:unsafePackagedRewrites,
  unsafeRewriteExamples:unsafeExamples,
  fusedRouteMileageSources,
  fusedRouteMileageExamples:fusedExamples,
  roadNameReviewRows:roadReviewLines.length,
  explicitSlashAliasRows:aliasRows.length,
  structuredDualRoadRows:structuredAliasRows.length,
  slashNarrativeOrAmbiguousRowsHeldForReview:slashNoiseRows.length,
  slashNoiseExamples:slashNoiseRows.slice(0,12).map(row => `${row[recordIndex]}: ${row[displayIndex]}`),
  repeatedStructuredAliasPairs:repeatedAliasPairs.slice(0,20)
}, null, 2));
