import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const data = JSON.parse(await fs.readFile(path.join(projectRoot, 'pad-fallback-data.json'), 'utf8'));
const cleanup = await fs.readFile(path.join(v17Root, 'src/parts/00zz-expand-company-cleanup.js'), 'utf8');
const headerGuard = await fs.readFile(path.join(v17Root, 'src/parts/11g-pad-header-data-guard.js'), 'utf8');
const partManifest = JSON.parse(await fs.readFile(path.join(v17Root, 'src/parts/part-order.json'), 'utf8'));

const cleanupIndex = partManifest.parts.indexOf('00zz-expand-company-cleanup.js');
const coreIndex = partManifest.parts.indexOf('00-core-data.js');
if (cleanupIndex < 0 || coreIndex < 0 || cleanupIndex <= coreIndex) {
  throw new Error('Expand company cleanup must load immediately after core pad data.');
}

const pads = Array.isArray(data.pads) ? data.pads : [];
const expand = pads.filter(row => String(row.company || '').trim().toLowerCase() === 'expand');
const wv = expand.filter(row => ['west virginia', 'wv'].includes(String(row.state || '').trim().toLowerCase()));
const noiseIds = new Set(['expand--expand-in-west-virginia', 'expand--west-virginia']);
const realWv = wv.filter(row => !noiseIds.has(String(row._id || row.legacy_id || '')));
const validCounties = new Set(['Brooke', 'Marion', 'Marshall', 'Monongalia', 'Ohio', 'Wetzel']);

const map = new Map();
for (const match of cleanup.matchAll(/"(expand--[^"]+)"\s*:\s*"(Brooke|Marion|Marshall|Monongalia|Ohio|Wetzel)"/g)) {
  map.set(match[1], match[2]);
}

if (expand.length < 141) throw new Error(`Expand source inventory unexpectedly shrank to ${expand.length} rows.`);
if (realWv.length !== 127) throw new Error(`Expected 127 real West Virginia Expand records; found ${realWv.length}.`);
if (map.size !== 127) throw new Error(`Expand county repair map should contain 127 records; found ${map.size}.`);

const uncovered = [];
for (const row of realWv) {
  const id = String(row._id || row.legacy_id || '');
  const savedCounty = String(row.county || '').trim();
  const savedCountyAlreadyClean = validCounties.has(savedCounty);
  if (!savedCountyAlreadyClean && !map.has(id)) uncovered.push(id);
}
if (uncovered.length) throw new Error(`Expand West Virginia rows are missing county cleanup coverage: ${uncovered.join(', ')}`);

for (const [id, county] of map) {
  if (!validCounties.has(county)) throw new Error(`Unexpected Expand county ${county} for ${id}.`);
}
if (map.get('expand--shannon-fields') !== 'Ohio') throw new Error('Shannon Fields county cleanup is missing or incorrect.');
for (const id of noiseIds) {
  if (!cleanup.includes(`"${id}"`)) throw new Error(`Expand import-noise suppression is missing ${id}.`);
}
for (const token of ['safePadHeaderGeo', 'officialHeaderGeo', 'raw.length > maxLength']) {
  if (!headerGuard.includes(token)) throw new Error(`Pad header corruption guard is missing ${token}.`);
}
if (!cleanup.includes('countyLooksCorrupt') || !cleanup.includes('V17.3.12 Expand company cleanup')) {
  throw new Error('Expand runtime county repair guard is incomplete.');
}

const sourceCorrupt = realWv.filter(row => String(row.county || '').trim().length > 60).length;
console.log(JSON.stringify({
  version: '17.3.12',
  expandSourceRows: expand.length,
  westVirginiaRealPads: realWv.length,
  runtimeCountyMappings: map.size,
  sourceRowsStillProtectedByRuntimeRepair: sourceCorrupt,
  importNoiseRowsSuppressed: [...noiseIds],
  shannonFieldsCounty: map.get('expand--shannon-fields'),
  result: 'pass'
}, null, 2));
