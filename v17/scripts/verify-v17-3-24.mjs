import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');

const [pkgText, partsText, stylesText, mapper, sw] = await Promise.all([
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'src/parts/21a-road-manager-route-mapper-v17324.js')),
  read(path.join(v17Root, 'src/offline/sw.js'))
]);
const pkg = JSON.parse(pkgText);
const parts = JSON.parse(partsText);
const styles = JSON.parse(stylesText);
if (pkg.version !== '17.3.24' || parts.version !== '17.3.24' || styles.version !== '17.3.24') throw new Error('V17.3.24 version markers are not synchronized.');
const live = parts.parts.indexOf('21-road-manager-live-fixes.js');
const mapperIndex = parts.parts.indexOf('21a-road-manager-route-mapper-v17324.js');
const directions = parts.parts.indexOf('22m-direction-source-priority-and-coalescer.js');
if (live < 0 || mapperIndex <= live || directions <= mapperIndex) throw new Error('V17.3.24 Route Mapper load order is incorrect.');
if (!styles.styles.includes('41-road-manager-route-mapper.css')) throw new Error('V17.3.24 Route Mapper CSS is missing from style order.');
if (!sw.includes('brinesearch-v17-3-24-road-manager-route-mapper')) throw new Error('V17.3.24 cache marker is missing.');
for (const token of ['Route Mapper','brinesearch_route_reviews','brinesearch_route_review_segments','fetchRoads','renderRoadForm','Open Google Maps','www.openstreetmap.org/export/embed.html','Save map review']) {
  if (!mapper.includes(token)) throw new Error(`V17.3.24 Route Mapper source missing ${token}.`);
}
console.log('Verified BrineSearch V17.3.24: Owner-only Route Mapper is a third Road Manager tab, starts from official/saved pad coordinates, opens map context, uses canonical Road Manager records for each route segment, captures measured mileage/turns, and saves only to route-review staging until a later explicit publish action.');
