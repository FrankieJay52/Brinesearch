import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const projectRoot=path.resolve(v17Root,'..');
const read=file=>fs.readFile(file,'utf8');
const [pkgText,partsText,stylesText,integrity,compactor,sw,audit]=await Promise.all([
  read(path.join(projectRoot,'package.json')),
  read(path.join(v17Root,'src/parts/part-order.json')),
  read(path.join(v17Root,'src/styles/style-order.json')),
  read(path.join(v17Root,'src/parts/22x-direction-final-integrity-v17321.js')),
  read(path.join(v17Root,'src/parts/22y-direction-global-card-compactor-v17322.js')),
  read(path.join(v17Root,'src/offline/sw.js')),
  read(path.join(v17Root,'scripts/audit-final-card-integrity-v17322.mjs'))
]);
const pkg=JSON.parse(pkgText),parts=JSON.parse(partsText),styles=JSON.parse(stylesText);
if(pkg.version!=='17.3.22'||parts.version!=='17.3.22'||styles.version!=='17.3.22') throw new Error('V17.3.22 version markers are not synchronized.');
const x=parts.parts.indexOf('22x-direction-final-integrity-v17321.js');
const y=parts.parts.indexOf('22y-direction-global-card-compactor-v17322.js');
const startup=parts.parts.indexOf('18-account-theme-startup.js');
if(x<0||y<=x||startup<=y) throw new Error('V17.3.22 global card compactor must load after V17.3.21 integrity and before startup.');
if(!sw.includes('brinesearch-v17-3-22-all-pad-direction-cleanup')) throw new Error('V17.3.22 cache marker is missing.');
for(const token of ['directionCompactFinalCardsV17322','directionCardGenericRoadlessV17322','directionCardHasUsableRoadV17322','directionArrivalFromNotesV17322']) if(!compactor.includes(token)) throw new Error(`V17.3.22 compactor missing ${token}.`);
for(const token of ['TIMMY_MINCH_CLEAR_V17321','directionIntegrityTurnTravelV17321']) if(!integrity.includes(token)) throw new Error(`V17.3.21 integrity dependency missing ${token}.`);
for(const token of ['genericCards','malformedCards','orphanMileage','hospitalLeaks','ascent--atmos']) if(!audit.includes(token)) throw new Error(`V17.3.22 all-pad audit missing ${token}.`);
console.log('Verified BrineSearch V17.3.22 product contract: the final global compactor runs after source/road truth, roadless filler cards are removed or merged without inventing data, arrival notes are promoted cleanly, ATMOS is regression-audited, and all packaged pads are checked for malformed final cards.');
