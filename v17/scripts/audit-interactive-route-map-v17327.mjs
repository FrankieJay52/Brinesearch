import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const source = await fs.readFile(path.join(v17Root, 'src/parts/21e-road-manager-interactive-route-map-v17327.js'), 'utf8');
const css = await fs.readFile(path.join(v17Root, 'src/styles/43-road-manager-interactive-route-map.css'), 'utf8');

const requiredSource = [
  'routeInteractivePanPixelsV17327',
  'routeInteractiveSetZoomV17327',
  'routeInteractiveToggleFullscreenV17327',
  'routeInteractiveTapRoadV17327',
  'routeInteractiveLookupRoadsV17327',
  'owner_map_tap_v17327',
  'Save route & update directions',
  'structured_road_sequence',
  'directions_clear',
  'brinesearch_pad_roads',
  'owner_interactive_route_map_v17327',
  'Set the turn for step',
  'routeBacktraceMemoryV17325.clear()',
  'routeInteractiveBuildClearDirectionsV17327'
];
for (const token of requiredSource) if (!source.includes(token)) throw new Error(`Interactive route map missing ${token}`);

const requiredCss = [
  'touch-action:none',
  'route-map-fullscreen-v17327',
  'route-map-road-sheet-v17327',
  'route-map-edit-bar-v17327',
  'route-interactive-controls-v17327'
];
for (const token of requiredCss) if (!css.includes(token)) throw new Error(`Interactive route map CSS missing ${token}`);

if (!/onpointermove\s*=/.test(source) || !/onpointerdown\s*=/.test(source) || !/onpointerup\s*=/.test(source)) throw new Error('One-finger/pointer map controls are not wired.');
if (!source.includes('Promise.any') || !source.includes('AbortController')) throw new Error('Tap-to-road lookup is not bounded/failover-enabled.');
if (!source.includes('routeMapperSegmentsV17324[index] =')) throw new Error('Map tap does not replace the selected route step.');
if (!source.includes('routeMapperSaveReviewV17324 = async function routeMapperSaveAndPublishV17327')) throw new Error('Route Mapper save action is not connected to direction publishing.');
if (!source.includes('if (index > 0 && !segment.turn)')) throw new Error('Publish no-guess turn validation is missing.');
if (source.includes('iframe.style.pointerEvents = "none"')) throw new Error('V17.3.27 must not disable map interaction.');

console.log(JSON.stringify({
  version: '17.3.27',
  mapInteraction: 'one-finger pan + pinch/buttons zoom + full screen',
  routeEditing: 'select step + tap mapped road + Road Manager reuse/create',
  publish: 'route review + brinesearch_pad_roads + structured road sequence + Clear Directions',
  noGuess: 'publish blocks unresolved Road Manager roads and missing transition turns'
}, null, 2));
console.log('V17.3.27 interactive route-map audit passed.');
