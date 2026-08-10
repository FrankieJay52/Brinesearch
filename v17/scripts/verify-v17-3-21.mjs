import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const projectRoot=path.resolve(v17Root,'..');
const read=file=>fs.readFile(file,'utf8');
const [pkgText,partsText,stylesText,integrity,sw]=await Promise.all([
  read(path.join(projectRoot,'package.json')),
  read(path.join(v17Root,'src/parts/part-order.json')),
  read(path.join(v17Root,'src/styles/style-order.json')),
  read(path.join(v17Root,'src/parts/22x-direction-final-integrity-v17321.js')),
  read(path.join(v17Root,'src/offline/sw.js'))
]);
const pkg=JSON.parse(pkgText),parts=JSON.parse(partsText),styles=JSON.parse(stylesText);
if(pkg.version!=='17.3.21'||parts.version!=='17.3.21'||styles.version!=='17.3.21') throw new Error('V17.3.21 version markers are not synchronized.');
const u=parts.parts.indexOf('22u-direction-road-data-enrichment.js');
const v=parts.parts.indexOf('22v-direction-road-turn-mileage-truth.js');
const w=parts.parts.indexOf('22w-direction-unspecified-turn-support.js');
const x=parts.parts.indexOf('22x-direction-final-integrity-v17321.js');
const startup=parts.parts.indexOf('18-account-theme-startup.js');
if(u<0||v<=u||w<=v||x<=w||startup<=x) throw new Error('V17.3.21 final integrity layer is in the wrong load order.');
if(!sw.includes('brinesearch-v17-3-21-final-direction-integrity')) throw new Error('V17.3.21 cache marker is missing.');
for(const token of ['TIMMY_MINCH_CLEAR_V17321','CR-25 / Peters Run Rd','CR-15 / Warden Run Rd','CR-15/1 / Boggs Hill Rd','CR-25/1 / Browns Run Rd','directionIntegrityTurnTravelV17321','directionIntegrityBadMainV17321','Nearest\\s+Hospital']) {
  if(!integrity.includes(token)) throw new Error(`V17.3.21 integrity source missing ${token}.`);
}
for(const bad of ['Turn left on North East','Turn left on Cr','Continue on Left Nearest']) {
  if(integrity.includes(`>${bad}<`)) throw new Error(`Malformed Timmy card leaked into V17.3.21 source: ${bad}`);
}
console.log('Verified BrineSearch V17.3.21: Timmy Minch uses the exact source-grounded seven-step route, turn+travel imports are repaired before final rendering, hospital text cannot become a road, and the new cache/version markers are synchronized.');
