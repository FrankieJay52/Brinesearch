import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const read = file => fs.readFile(file, 'utf8');

const [part, css, partsText, stylesText] = await Promise.all([
  read(path.join(v17Root, 'src/parts/21a-road-manager-route-mapper-v17324.js')),
  read(path.join(v17Root, 'src/styles/41-road-manager-route-mapper.css')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json'))
]);

new vm.Script(part, { filename: '21a-road-manager-route-mapper-v17324.js' });
const parts = JSON.parse(partsText);
const styles = JSON.parse(stylesText);

function need(source, token, label) {
  if (!source.includes(token)) throw new Error(`${label} missing ${token}`);
}

const mapperIndex = parts.parts.indexOf('21a-road-manager-route-mapper-v17324.js');
const liveFixIndex = parts.parts.indexOf('21-road-manager-live-fixes.js');
const directionIndex = parts.parts.indexOf('22m-direction-source-priority-and-coalescer.js');
if (mapperIndex <= liveFixIndex || mapperIndex >= directionIndex) throw new Error('Route Mapper must load after Road Manager live fixes and before direction rendering.');
if (!styles.styles.includes('41-road-manager-route-mapper.css')) throw new Error('Route Mapper stylesheet is not loaded.');

for (const token of [
  'Route QA &amp; Exceptions',
  'data-road-manager-tab',
  'Route QA',
  'review and exception tool',
  'Automatic route generation remains the product path',
  'routeMapperPadCoordinateV17324',
  'official_pad_record',
  'Saved driver GPS',
  'www.openstreetmap.org/export/embed.html',
  'www.google.com/maps/search/',
  'fetchRoads(q, 50)',
  'renderRoadForm(draft)',
  '/rest/v1/brinesearch_roads',
  '/rest/v1/brinesearch_route_reviews?on_conflict=pad_id',
  '/rest/v1/brinesearch_route_review_segments',
  'owner_route_mapper',
  'owner_verified',
  'owner_confirmed',
  'Driver directions were not changed'
]) need(part, token, 'Route Mapper contract');

for (const token of ['route-mapper-map-frame', 'route-mapper-segment', 'route-mapper-road-search', '@media(max-width:720px)']) need(css, token, 'Route Mapper CSS');

if (part.includes('brinesearch_pad_roads')) throw new Error('Route Mapper writes directly to live pad-road publication instead of review storage.');
if (/directions_clear\s*[:=]/i.test(part) || /written_directions\s*[:=]/i.test(part)) throw new Error('Route Mapper mutates driver direction source fields.');
if (!part.includes('if (!editorIsOwner()) return;')) throw new Error('Route Mapper extension is not Owner-gated.');

console.log(JSON.stringify({
  version: '17.3.24',
  ownerOnly: true,
  mapPreview: 'review/exception-only OpenStreetMap + pad GPS launch',
  roadSource: 'master brinesearch_roads',
  saveTarget: 'route-review staging only',
  liveDriverDirectionsChanged: false
}, null, 2));
console.log('V17.3.24 Route QA/exception audit passed.');
