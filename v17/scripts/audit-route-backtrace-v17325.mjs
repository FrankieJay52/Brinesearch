import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = await fs.readFile(path.join(scriptDir, '../src/parts/21b-road-manager-backtrace-route-v17325.js'), 'utf8');

const context = {
  console: { warn() {}, log() {} },
  window: {},
  routeMapperSegmentsV17324: [],
  routeMapperSelectedPadV17324: null,
  routeMapperRenderWorkspaceV17324() {},
  routeMapperPadCoordinateV17324() { return null; },
  routeMapperLegacyIdV17324() { return 'test-pad'; },
  routeMapperOsmUrlV17324() { return ''; },
  roadManagerRows: [],
  fetchRoads: async () => [],
  fetch: async () => { throw new Error('network disabled in audit'); },
  normalize: value => String(value ?? '').trim(),
  esc: value => String(value ?? ''),
  showToast() {},
  document: { querySelector() { return null; }, getElementById() { return null; }, createElement() { return {}; }, createElementNS() { return {}; } }
};
vm.createContext(context);
vm.runInContext(source, context, { filename: '21b-road-manager-backtrace-route-v17325.js' });

for (const fn of ['routeBacktraceRoadTokensV17325', 'routeBacktraceBuildTraceV17325']) {
  if (typeof context[fn] !== 'function') throw new Error(`${fn} was not exported.`);
}

const pad = { Structured_Road_Sequence: 'I-70 → Exit 202 → OH-800 → Muskrat Rd → CR-102 / Mt Olivett Rd → Access Road' };
const tokens = context.routeBacktraceRoadTokensV17325(pad);
const labels = tokens.map(token => token.label);
if (labels.join(' | ') !== 'Access Road | CR-102 / Mt Olivett Rd | Muskrat Rd | OH-800 | Exit 202 | I-70') {
  throw new Error(`Backward token order is wrong: ${labels.join(' | ')}`);
}
if (tokens[0].kind !== 'access' || tokens[4].kind !== 'exit' || tokens[1].kind !== 'road') {
  throw new Error('Backward token classification failed.');
}
if (context.routeBacktraceRoadKeyV17325('Muscrat Rd') === context.routeBacktraceRoadKeyV17325('Muskrat Rd')) {
  // Exact equality is not required; fuzzy matching is what protects source spelling differences.
} else if (context.routeBacktraceSimilarityV17325('Muscrat Rd', 'Muskrat Rd') < 0.8) {
  throw new Error('Minor saved-road spelling differences are not fuzzy matched.');
}

const roads = [
  { canonical_name: 'CR-102 / Mt Olivett Rd', aliases: ['Mt Olivett Rd'], centerline_geojson: { type: 'LineString', coordinates: [[0, 0.01], [0, 0]] } },
  { canonical_name: 'Muskrat Rd', aliases: ['Muscrat Rd'], centerline_geojson: { type: 'LineString', coordinates: [[0, 0], [-0.02, 0]] } },
  { canonical_name: 'OH-800', aliases: ['SR-800'], centerline_geojson: { type: 'LineString', coordinates: [[-0.02, 0], [-0.02, -0.02]] } },
  { canonical_name: 'I-70', aliases: ['Interstate 70'], centerline_geojson: { type: 'LineString', coordinates: [[-0.04, -0.02], [0, -0.02]] } }
];
const trace = context.routeBacktraceBuildTraceV17325(tokens, roads, [], { lat: 0.0095, lng: 0.0004 });
const matched = trace.filter(row => row.matched);
if (matched.length !== 4) throw new Error(`Expected four matched public roads, found ${matched.length}.`);
if (!matched[0].traceLine?.length || !matched[1].traceLine?.length || !matched[2].traceLine?.length) {
  throw new Error('Connected backward roads did not produce highlighted trace geometry.');
}

const missing = context.routeBacktraceBuildTraceV17325(
  context.routeBacktraceRoadTokensV17325({ Structured_Road_Sequence: 'OH-800 → Mystery Access Rd' }),
  roads,
  [],
  { lat: 0.0095, lng: 0.0004 }
);
if (!missing.some(row => row.token.label === 'Mystery Access Rd' && !row.matched)) {
  throw new Error('Unmatched road was not preserved as an untraced no-guess gap.');
}

for (const token of ['overpass-api.de', 'overpass.kumi.systems', 'route-backtrace-overlay-v17325', 'Highlight route backward', 'not drawn', 'saved primary route']) {
  if (!source.includes(token)) throw new Error(`Backtrace source missing ${token}.`);
}

console.log(JSON.stringify({
  version: '17.3.25',
  direction: 'pad outward / saved primary route reversed',
  syntheticRoadsMatched: matched.length,
  noGuessGap: 'pass',
  roadSources: ['Road Manager centerline geometry', 'OpenStreetMap Overpass fallback'],
  mapOverlay: 'fixed OSM preview + SVG road trace'
}, null, 2));
console.log('V17.3.25 backward route-highlight audit passed.');
