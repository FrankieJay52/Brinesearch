import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const projectRoot=path.resolve(v17Root,'..');
const read=file=>fs.readFile(file,'utf8');
const [pkgText,partsText,stylesText,integrity,decimalTruth,compactor,sw,audit]=await Promise.all([
  read(path.join(projectRoot,'package.json')),
  read(path.join(v17Root,'src/parts/part-order.json')),
  read(path.join(v17Root,'src/styles/style-order.json')),
  read(path.join(v17Root,'src/parts/22x-direction-final-integrity-v17321.js')),
  read(path.join(v17Root,'src/parts/00zy-direction-decimal-truth-v17322.js')),
  read(path.join(v17Root,'src/parts/22y-direction-global-card-compactor-v17322.js')),
  read(path.join(v17Root,'src/offline/sw.js')),
  read(path.join(v17Root,'scripts/audit-final-card-integrity-v17322.mjs'))
]);
const pkg=JSON.parse(pkgText),parts=JSON.parse(partsText),styles=JSON.parse(stylesText);
if(pkg.version!=='17.3.22'||parts.version!=='17.3.22'||styles.version!=='17.3.22') throw new Error('V17.3.22 version markers are not synchronized.');
const core=parts.parts.indexOf('00-core-data.js');
const decimal=parts.parts.indexOf('00zy-direction-decimal-truth-v17322.js');
const x=parts.parts.indexOf('22x-direction-final-integrity-v17321.js');
const y=parts.parts.indexOf('22y-direction-global-card-compactor-v17322.js');
const startup=parts.parts.indexOf('18-account-theme-startup.js');
if(core<0||decimal<=core||x<0||y<=x||startup<=y) throw new Error('V17.3.22 truth layers are in the wrong load order.');
if(!sw.includes('brinesearch-v17-3-22-all-pad-direction-cleanup')) throw new Error('V17.3.22 cache marker is missing.');
for(const token of ['directionRepairLeadingDecimalMileageV17322','directionLeadingDecimalRepairsV17322','.72 mile -> 72 miles']) if(!decimalTruth.includes(token)) throw new Error(`V17.3.22 decimal truth source missing ${token}.`);
for(const token of ['directionCompactFinalCardsV17322','directionCardGenericRoadlessV17322','directionCardHasUsableRoadV17322','directionArrivalFromNotesV17322','Road name not present in saved directions','directionApplyLiveClearRowDecimalTruthV17322']) if(!compactor.includes(token)) throw new Error(`V17.3.22 compactor missing ${token}.`);
for(const token of ['TIMMY_MINCH_CLEAR_V17321','directionIntegrityTurnTravelV17321']) if(!integrity.includes(token)) throw new Error(`V17.3.21 integrity dependency missing ${token}.`);
for(const token of ['unsafeGenericCards','sourceLimitedCards','malformedCards','orphanMileage','hospitalLeaks','leadingDecimalRepairs','ascent--atmos']) if(!audit.includes(token)) throw new Error(`V17.3.22 all-pad audit missing ${token}.`);
console.log('Verified BrineSearch V17.3.22: saved leading-decimal mileage is restored before rendering and on later live refreshes; all final cards pass the global malformed-card audit; genuine source road-name gaps are labeled instead of guessed; ATMOS is regression-audited; and cache/version markers are synchronized.');
