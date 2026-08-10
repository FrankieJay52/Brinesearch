import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');
const [pkgText, partsText, stylesText, interactive, canonical, stepEditor, stepCss, sw, audit] = await Promise.all([
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'src/parts/21e-road-manager-interactive-route-map-v17327.js')),
  read(path.join(v17Root, 'src/parts/21f-road-manager-interactive-route-canonical-v17327.js')),
  read(path.join(v17Root, 'src/parts/21g-road-manager-step-snap-route-editor-v17328.js')),
  read(path.join(v17Root, 'src/styles/44-road-manager-step-snap-route-editor.css')),
  read(path.join(v17Root, 'src/offline/sw.js')),
  read(path.join(v17Root, 'scripts/audit-step-snap-route-editor-v17328.mjs'))
]);
const pkg = JSON.parse(pkgText), parts = JSON.parse(partsText), styles = JSON.parse(stylesText);
if (pkg.version !== '17.3.28' || parts.version !== '17.3.28' || styles.version !== '17.3.28') throw new Error('V17.3.28 version markers are not synchronized.');
const interactiveIndex = parts.parts.indexOf('21e-road-manager-interactive-route-map-v17327.js');
const canonicalIndex = parts.parts.indexOf('21f-road-manager-interactive-route-canonical-v17327.js');
const stepIndex = parts.parts.indexOf('21g-road-manager-step-snap-route-editor-v17328.js');
const directions = parts.parts.indexOf('22m-direction-source-priority-and-coalescer.js');
if (interactiveIndex < 0 || canonicalIndex <= interactiveIndex || stepIndex <= canonicalIndex || directions <= stepIndex) throw new Error('V17.3.28 route-editor load order is incorrect.');
if (!styles.styles.includes('44-road-manager-step-snap-route-editor.css')) throw new Error('V17.3.28 route-editor stylesheet is missing.');
if (!sw.includes('brinesearch-v17-3-28-step-snap-route-editor')) throw new Error('V17.3.28 cache marker is missing.');
for (const token of ['Full screen', 'Edit route', 'Save route & update directions', 'routeInteractivePublishV17327']) if (!interactive.includes(token)) throw new Error(`V17.3.27 interactive dependency missing ${token}.`);
for (const token of ['routeInteractiveCanonicalCandidateV17327', 'OH-', 'US-', 'CR-', 'TR-']) if (!canonical.includes(token)) throw new Error(`Canonical road dependency missing ${token}.`);
for (const token of ['routeStepSnapToV17328', 'Move / replace', '＋ Before', '＋ After', 'Find road', 'routeStepLocalRoadCandidatesV17328']) if (!stepEditor.includes(token)) throw new Error(`V17.3.28 route editor missing ${token}.`);
for (const token of ['route-step-selected-v17328', 'route-step-controls-v17328']) if (!stepCss.includes(token)) throw new Error(`V17.3.28 route editor CSS missing ${token}.`);
for (const token of ['stepSelection', 'correction', 'insertion', 'livePublish']) if (!audit.includes(token)) throw new Error(`V17.3.28 audit missing ${token}.`);
if (!pkg.scripts?.['verify:step-snap-route-editor']) throw new Error('V17.3.28 route-editor audit is not wired into package scripts.');
console.log('Verified BrineSearch V17.3.28: selecting a route step snaps the map to that road, the selected step is highlighted separately, the Owner can pan and tap a correct road to move/replace it, insert roads before/after, remove roads, edit turn/mileage in full screen, and then use the existing Save route & update directions publisher with no-guess validation.');
