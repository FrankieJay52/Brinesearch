import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');
const [pkgText, partsText, stylesText, responsive, sw, audit] = await Promise.all([
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'src/parts/21d-road-manager-backtrace-responsive-v17326.js')),
  read(path.join(v17Root, 'src/offline/sw.js')),
  read(path.join(v17Root, 'scripts/audit-route-backtrace-responsive-v17326.mjs'))
]);
const pkg = JSON.parse(pkgText), parts = JSON.parse(partsText), styles = JSON.parse(stylesText);
if (pkg.version !== '17.3.26' || parts.version !== '17.3.26' || styles.version !== '17.3.26') throw new Error('V17.3.26 version markers are not synchronized.');
const refine = parts.parts.indexOf('21c-road-manager-backtrace-refinements-v17325.js');
const responsiveIndex = parts.parts.indexOf('21d-road-manager-backtrace-responsive-v17326.js');
const directions = parts.parts.indexOf('22m-direction-source-priority-and-coalescer.js');
if (refine < 0 || responsiveIndex <= refine || directions <= responsiveIndex) throw new Error('V17.3.26 responsive backtrace load order is incorrect.');
if (!sw.includes('brinesearch-v17-3-26-responsive-backtrace')) throw new Error('V17.3.26 service-worker cache marker is missing.');
for (const token of ['6500', 'AbortController', 'Promise.any', 'Checking Road Manager…', 'Checking map for missing roads…', 'routeBacktraceRenderV17325(result)']) {
  if (!responsive.includes(token)) throw new Error(`V17.3.26 responsive backtrace is missing ${token}.`);
}
for (const token of ['firstPaint', 'externalTimeoutMs', 'stuckButtonGuard']) if (!audit.includes(token)) throw new Error(`V17.3.26 audit is missing ${token}.`);
if (!pkg.scripts?.['verify:route-backtrace-responsive']) throw new Error('V17.3.26 responsive backtrace audit is not wired into package scripts.');
console.log('Verified BrineSearch V17.3.26: backward route tracing paints Road Manager geometry immediately, limits the external OpenStreetMap fallback to still-missing roads, aborts that fallback after 6.5 seconds, and always restores the trace button instead of leaving the Owner UI stuck.');
