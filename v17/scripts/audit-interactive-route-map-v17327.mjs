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
  'window.routeIssue69PublishStructured',
  'legacy direct publisher is retired',
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
const delegatedPublisher = source.match(/async function routeInteractivePublishV17327\(\) \{[\s\S]*?\n    \}/)?.[0] || '';
if (!delegatedPublisher.includes('window.routeIssue69PublishStructured')) throw new Error('Legacy publisher does not delegate to #69 exact publishing.');
if (delegatedPublisher.includes('editorRequest(')) throw new Error('Legacy publisher retains a direct REST write path.');
if (source.includes('iframe.style.pointerEvents = "none"')) throw new Error('V17.3.27 must not disable map interaction.');

console.log(JSON.stringify({
  version: '17.3.27',
  mapInteraction: 'one-finger pan + pinch/buttons zoom + full screen',
  routeEditing: 'select step + tap mapped road + Road Manager reuse/create',
  publish: 'legacy save delegates to the #69 exact structured publisher only',
  noGuess: 'legacy direct route-row/pad publishing fails closed when #69 is unavailable'
}, null, 2));
console.log('V17.3.27 interactive route-map audit passed.');
