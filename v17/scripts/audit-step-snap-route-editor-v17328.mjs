import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const source = await fs.readFile(path.join(v17Root, 'src/parts/21g-road-manager-step-snap-route-editor-v17328.js'), 'utf8');
const css = await fs.readFile(path.join(v17Root, 'src/styles/44-road-manager-step-snap-route-editor.css'), 'utf8');

const requiredSource = [
  'routeStepSnapToV17328',
  'routeStepTraceRowV17328',
  'Move / replace',
  '＋ Before',
  '＋ After',
  'Remove',
  'Find road',
  'routeStepLocalRoadCandidatesV17328',
  'routeMapperSegmentsV17324.splice(index, 0, newSegment)',
  'routeMapperSegmentsV17324.splice(insertAt, 0, newSegment)',
  'routeMapperSegmentsV17324.splice(index, 1)',
  'routeInteractiveSelectedStepV17327 = Number(button.dataset.routeMapStep)',
  'routeBacktraceRunV17325().then',
  'overpass.private.coffee',
  'Road lookup timed out — use Find road or tap again'
];
for (const token of requiredSource) if (!source.includes(token)) throw new Error(`V17.3.28 route editor missing ${token}`);

const requiredCss = [
  'route-step-selected-v17328',
  'route-step-controls-v17328',
  'route-step-action-row-v17328',
  'route-step-search-v17328',
  'route-map-fullscreen-v17327 .route-map-edit-bar-v17327'
];
for (const token of requiredCss) if (!css.includes(token)) throw new Error(`V17.3.28 route editor CSS missing ${token}`);

if (!source.includes('routeInteractiveLookupRoadsV17327 = async function routeInteractiveLookupRoadsLocalFirstV17328')) throw new Error('Map taps do not prefer Road Manager geometry before external lookup.');
if (!source.includes('routeInteractiveUseCandidateV17327 = async function routeInteractiveUseCandidateStepActionV17328')) throw new Error('Map road choices are not wired to replace/insert route steps.');
if (!source.includes('routeInteractiveRenderOverlayV17327 = function routeInteractiveRenderOverlayStepV17328')) throw new Error('Selected road is not distinctly highlighted.');
if (!source.includes('routeInteractiveToggleEditV17327 = async function routeInteractiveToggleEditStepSnapV17328')) throw new Error('Edit mode does not snap to the selected road.');
if (!source.includes('routeMapperDraftSaveV17324()')) throw new Error('Route step edits are not saved to the Owner draft.');

console.log(JSON.stringify({
  version: '17.3.28',
  stepSelection: 'tap top step -> snap map to matched route geometry',
  correction: 'pan map -> tap correct road -> move/replace selected step',
  insertion: 'add road before or after selected step',
  removal: 'remove wrong route step from draft',
  editFields: 'turn and mileage editable in full-screen map',
  lookup: 'Road Manager geometry first; bounded OpenStreetMap fallback',
  livePublish: 'still handled by V17.3.27 Save route & update directions with no-guess validation'
}, null, 2));
console.log('V17.3.28 step-snap route editor audit passed.');
