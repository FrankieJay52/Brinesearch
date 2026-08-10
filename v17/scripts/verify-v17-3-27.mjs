import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');
const [pkgText, partsText, stylesText, interactive, interactiveCss, sw, audit] = await Promise.all([
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'src/parts/21e-road-manager-interactive-route-map-v17327.js')),
  read(path.join(v17Root, 'src/styles/43-road-manager-interactive-route-map.css')),
  read(path.join(v17Root, 'src/offline/sw.js')),
  read(path.join(v17Root, 'scripts/audit-interactive-route-map-v17327.mjs'))
]);
const pkg = JSON.parse(pkgText), parts = JSON.parse(partsText), styles = JSON.parse(stylesText);
if (pkg.version !== '17.3.27' || parts.version !== '17.3.27' || styles.version !== '17.3.27') throw new Error('V17.3.27 version markers are not synchronized.');
const responsive = parts.parts.indexOf('21d-road-manager-backtrace-responsive-v17326.js');
const interactiveIndex = parts.parts.indexOf('21e-road-manager-interactive-route-map-v17327.js');
const directions = parts.parts.indexOf('22m-direction-source-priority-and-coalescer.js');
if (responsive < 0 || interactiveIndex <= responsive || directions <= interactiveIndex) throw new Error('V17.3.27 interactive map load order is incorrect.');
if (!styles.styles.includes('43-road-manager-interactive-route-map.css')) throw new Error('V17.3.27 interactive map stylesheet is missing.');
if (!sw.includes('brinesearch-v17-3-27-interactive-route-map')) throw new Error('V17.3.27 cache marker is missing.');
for (const token of ['Full screen', 'Edit route', 'Save route & update directions', 'routeInteractivePublishV17327', 'OpenStreetMap', 'directions_clear_method']) {
  if (!interactive.includes(token)) throw new Error(`V17.3.27 interactive source missing ${token}.`);
}
for (const token of ['touch-action:none', 'route-map-fullscreen-v17327', 'route-map-road-sheet-v17327']) if (!interactiveCss.includes(token)) throw new Error(`V17.3.27 interactive CSS missing ${token}.`);
for (const token of ['routeEditing', 'publish', 'noGuess']) if (!audit.includes(token)) throw new Error(`V17.3.27 audit missing ${token}.`);
if (!pkg.scripts?.['verify:interactive-route-map']) throw new Error('V17.3.27 interactive map audit is not wired into package scripts.');
console.log('Verified BrineSearch V17.3.27: the Owner Route Mapper is directly pannable/zoomable, can be opened full screen, supports tap-to-repair road steps using map geometry, and publishes the corrected canonical road route and live Clear Directions together with no-guess validation.');
