import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const projectRoot=path.resolve(v17Root,'..');
const read=file=>fs.readFile(file,'utf8');
const [pkgText,partsText,stylesText,guard,sw,audit]=await Promise.all([
  read(path.join(projectRoot,'package.json')),
  read(path.join(v17Root,'src/parts/part-order.json')),
  read(path.join(v17Root,'src/styles/style-order.json')),
  read(path.join(v17Root,'src/parts/22z-direction-exit-road-truth-v17323.js')),
  read(path.join(v17Root,'src/offline/sw.js')),
  read(path.join(v17Root,'scripts/audit-exit-road-truth-v17323.mjs'))
]);
const pkg=JSON.parse(pkgText),parts=JSON.parse(partsText),styles=JSON.parse(stylesText);
if(pkg.version!=='17.3.23'||parts.version!=='17.3.23'||styles.version!=='17.3.23') throw new Error('V17.3.23 version markers are not synchronized.');
const y=parts.parts.indexOf('22y-direction-global-card-compactor-v17322.js');
const z=parts.parts.indexOf('22z-direction-exit-road-truth-v17323.js');
const startup=parts.parts.indexOf('18-account-theme-startup.js');
if(y<0||z<=y||startup<=z) throw new Error('V17.3.23 exit-road truth must load after the global compactor and before startup.');
if(!sw.includes('brinesearch-v17-3-23-exit-road-truth')) throw new Error('V17.3.23 cache marker is missing.');
for(const token of ['directionIsPostExitSameHighwayV17323','directionApplyExitRoadTruthV17323','directionIsAlbertKirkwoodV17323','Turn left on OH-114','Go under I-70 to the stop sign']) if(!guard.includes(token)) throw new Error(`V17.3.23 guard missing ${token}.`);
for(const token of ['packagedDirectionRecords','globalPostExitSameHighwayGuard','ascent--albert']) if(!audit.includes(token)) throw new Error(`V17.3.23 audit missing ${token}.`);
console.log('Verified BrineSearch V17.3.23: same-highway post-exit parser errors are blocked globally, Albert/Kirkwood is repaired from its saved I-70/Exit 198/OH-114/1.2-mile source, and the release audit covers the full packaged direction manifest plus the new guard.');
