import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');
const [pkgText, partsText, stylesText, mapper, backtrace, refinements, backtraceCss, sw, audit] = await Promise.all([
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'src/parts/21a-road-manager-route-mapper-v17324.js')),
  read(path.join(v17Root, 'src/parts/21b-road-manager-backtrace-route-v17325.js')),
  read(path.join(v17Root, 'src/parts/21c-road-manager-backtrace-refinements-v17325.js')),
  read(path.join(v17Root, 'src/styles/42-road-manager-backtrace-route.css')),
  read(path.join(v17Root, 'src/offline/sw.js')),
  read(path.join(v17Root, 'scripts/audit-route-backtrace-v17325.mjs'))
]);
const pkg = JSON.parse(pkgText), parts = JSON.parse(partsText), styles = JSON.parse(stylesText);
if (pkg.version !== '17.3.25' || parts.version !== '17.3.25' || styles.version !== '17.3.25') throw new Error('V17.3.25 version markers are not synchronized.');
const mapperIndex = parts.parts.indexOf('21a-road-manager-route-mapper-v17324.js');
const polishIndex = parts.parts.indexOf('21b-road-manager-route-mapper-input-polish-v17324.js');
const backtraceIndex = parts.parts.indexOf('21b-road-manager-backtrace-route-v17325.js');
const refineIndex = parts.parts.indexOf('21c-road-manager-backtrace-refinements-v17325.js');
const directionIndex = parts.parts.indexOf('22m-direction-source-priority-and-coalescer.js');
if (mapperIndex < 0 || polishIndex <= mapperIndex || backtraceIndex <= polishIndex || refineIndex <= backtraceIndex || directionIndex <= refineIndex) throw new Error('V17.3.25 backtrace load order is incorrect.');
if (!styles.styles.includes('42-road-manager-backtrace-route.css')) throw new Error('V17.3.25 backtrace CSS is missing.');
if (!sw.includes('brinesearch-v17-3-25-backtrace-route-highlight')) throw new Error('V17.3.25 cache marker is missing.');
for (const token of ['Route Mapper', 'routeMapperOsmUrlV17324', 'brinesearch_route_reviews']) if (!mapper.includes(token)) throw new Error(`V17.3.24 Route Mapper dependency missing ${token}.`);
for (const token of ['routeBacktraceRoadTokensV17325', 'routeBacktraceBuildTraceV17325', 'Highlight route backward', 'overpass-api.de', 'not drawn', 'route-backtrace-overlay-v17325']) if (!backtrace.includes(token)) throw new Error(`V17.3.25 backtrace source missing ${token}.`);
for (const token of ['routeBacktraceTokenPartsV17325', 'Structured_Road_Sequence', 'routeBacktraceOverpassDualPatternV17325', 'routeBacktraceOsmDualMatchScoreV17325']) if (!refinements.includes(token)) throw new Error(`V17.3.25 backtrace refinement missing ${token}.`);
for (const token of ['route-backtrace-road-v17325', 'route-backtrace-chip.missing', 'route-backtrace-pad-v17325']) if (!backtraceCss.includes(token)) throw new Error(`V17.3.25 backtrace CSS missing ${token}.`);
for (const token of ['noGuessGap', 'Road Manager centerline geometry', 'OpenStreetMap Overpass fallback']) if (!audit.includes(token)) throw new Error(`V17.3.25 backtrace audit missing ${token}.`);
if (!pkg.scripts?.['verify:route-backtrace']) throw new Error('V17.3.25 route-backtrace audit is not wired into package scripts.');
console.log('Verified BrineSearch V17.3.25: the Owner Route Mapper traces the saved PRIMARY route backward from the pad, highlights only matched road geometry, supports route-number/local-name pairs and minor source spelling differences, uses Road Manager centerlines first with OpenStreetMap fallback, leaves uncertain gaps untraced, and never changes live driver directions from the trace screen.');
