import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const publicRoot=path.join(v17Root,'public');
const read=file=>fs.readFile(file,'utf8');
const source=await read(path.join(v17Root,'src/parts/22v-direction-road-turn-mileage-truth.js'));
const manifest=JSON.parse(await read(path.join(v17Root,'src/data/directions/index.json')));
const rewrites={};
for(const file of manifest.files||[]) Object.assign(rewrites,JSON.parse(await read(path.join(v17Root,'src/data/directions',file))));

const clean=v=>String(v||'').replace(/\bonto\b/ig,'on').replace(/\s{2,}/g,' ').trim();
function leading(value){
  const raw=clean(value);
  const m=raw.match(/^From\s+(.+?),\s*(?=(?:take|turn|head|travel|continue|follow|go|proceed|stay|keep|bear|veer|slight)\b)([\s\S]+)$/i);
  return m?{work:clean(m[2]),notes:[`Start: ${clean(m[1])}`],contextOnly:false}:{work:raw,notes:[],contextOnly:false};
}
function roadFrom(value){
  const text=clean(value);
  let m=text.match(/\b(?:Turn\s+(?:left|right)|Stay\s+(?:left|right)|Keep\s+(?:left|right)|Bear\s+(?:left|right)|Veer\s+(?:left|right)|Slight\s+(?:left|right)|Head\s+(?:north|south|east|west)|Continue|Follow|Travel|Proceed|Go)\b[^.;]{0,80}\bon\s+(.+?)(?=\s+(?:for|toward|towards|to|and|then)\b|[.;,]|$)/i);
  if(m) return {road:clean(m[1])};
  m=text.match(/^Take\s+(.+?)(?=\s+(?:for|toward|towards|and|then)\b|[.;,]|$)/i);
  if(m) return {road:clean(m[1])};
  m=text.match(/\b(?:Follow|Travel|Proceed|Go)\s+((?:I|US|OH|WV|PA|SR|CR|TR)[- ]?\d{1,4}(?:\/\d+)?[A-Z]?|[A-Za-z][A-Za-z0-9 .'-]+(?:Rd|Road|St|Street|Ave|Avenue|Pike|Trail))\b/i);
  return {road:m?clean(m[1]):''};
}
function facts(value){
  const text=String(value||'');
  const out=[];
  const range=/(^|[^0-9])((?:approximately|about|roughly)\s+)?(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(miles?|mile|mi|feet|foot|ft)\b/ig;
  let m;
  while((m=range.exec(text))){const offset=m[1].length;const unit=/mile|mi/i.test(m[5])?'mi':'ft';out.push({start:m.index+offset,end:m.index+m[0].length,raw:m[0].slice(offset).trim(),label:`${m[2]?'≈':''}${Number(m[3])}–${Number(m[4])} ${unit}`});}
  const single=/(^|[^0-9-])(approximately\s+|about\s+|roughly\s+)?(\d+(?:\.\d+)?|\.\d+)\s*(miles?|mile|mi|feet|foot|ft)\b/ig;
  while((m=single.exec(text))){const offset=m[1].length;const start=m.index+offset,end=m.index+m[0].length;if(out.some(x=>start<x.end&&end>x.start))continue;const unit=/mile|mi/i.test(m[4])?'mi':'ft';out.push({start,end,raw:m[0].slice(offset).trim(),label:`${m[2]?'≈':''}${Number(m[3])} ${unit}`});}
  return out.sort((a,b)=>a.start-b.start);
}
const context={
  console:{log(){},warn(){}},window:{},
  directionLeadingContextFinalV17317:leading,
  directionRoadFromViewFinalV17317:(value)=>roadFrom(value),
  directionDistanceFactsFinalV17317:facts,
  directionFinalCardsFromEntriesV17317:entries=>entries
};
vm.createContext(context);vm.runInContext(source,context,{filename:'22v-direction-road-turn-mileage-truth.js'});
const truth=context.window.directionTruthEntriesV17320;
if(typeof truth!=='function') throw new Error('V17.3.20 truth splitter was not exported.');

const synthetic=truth([
  {instruction:'Turn right on CR-10',notes:[]},
  {instruction:'Continue 1.3 miles and turn left on CR-20',notes:[]}
],{});
if(synthetic.length!==3) throw new Error(`Single-distance-before-turn split failed: ${JSON.stringify(synthetic)}`);
if(synthetic[1].instruction!=='Continue on CR-10 for 1.3 miles') throw new Error(`Mileage did not stay on prior road: ${JSON.stringify(synthetic)}`);
if(!/^Turn left on CR-20$/i.test(synthetic[2].instruction)) throw new Error(`Target turn changed: ${JSON.stringify(synthetic)}`);

const rangeCase=truth([
  {instruction:'Turn left on CR-11',notes:[]},
  {instruction:'Continue approximately 6-7 miles and turn right on CR-12',notes:[]}
],{});
if(rangeCase.length!==3||!/6-7 miles/i.test(rangeCase[1].instruction)||/6-7 miles/i.test(rangeCase[2].instruction)) throw new Error(`Range-before-turn split failed: ${JSON.stringify(rangeCase)}`);

const transition=truth([{instruction:'From Bloomingdale, take US-22 and go south on E Steubenville St / SR-152. Continue 0.3 mile.',notes:[]}],{});
if(transition.length!==2||transition[0].instruction!=='Take US-22'||!/^Head south on E Steubenville St \/ SR-152/i.test(transition[1].instruction)||!/0\.3 mile/i.test(transition[1].instruction)) throw new Error(`Two-road transition split failed: ${JSON.stringify(transition)}`);
if(!transition[0].notes?.some(note=>/Start: Bloomingdale/i.test(note))) throw new Error('Start context was lost from two-road transition.');

const triplett=truth([
  {instruction:'Follow Deersville Rd.',notes:[]},
  {instruction:'Stay right at the curve, then turn left before the white church with the blue roof onto Barber Hill Rd.',notes:[]}
],{});
if(triplett.length!==3||!/^Stay right on Deersville Rd$/i.test(triplett[1].instruction)||!/^Turn left on Barber Hill Rd$/i.test(triplett[2].instruction)) throw new Error(`Triplett-style split failed: ${JSON.stringify(triplett)}`);
if(!triplett[2].notes?.some(note=>/white church/i.test(note))) throw new Error('Triplett landmark context did not become a note.');

const cologieInput=[
  'Take US-250 South','Turn left on CR-15 / Foxes Bottom Rd','Turn left on TR-79 / Springdale Hill Rd','Turn right on TR-72 / Lamborn Rd','Turn left on TR-79 / Springdale Hill Rd','Turn left on CR-13 / Unionvale-Kenwood Rd'
].map(instruction=>({instruction,notes:[]}));
const cologie=truth(cologieInput,{});
if(JSON.stringify(cologie.map(x=>x.instruction))!==JSON.stringify(cologieInput.map(x=>x.instruction))) throw new Error('COLOGIE contract changed during truth splitting.');

function parseEntries(clearText){
  const text=String(clearText||'').replace(/\r\n?/g,'\n').trim();
  const marker=/Step-by-step directions\s*:/i.exec(text);const body=marker?text.slice(marker.index+marker[0].length):text;
  const out=[];const re=/(?:^|\n)\s*(\d+)\.\s*([\s\S]*?)(?=(?:\n\s*\d+\.\s)|$)/g;let m;
  while((m=re.exec(body))){const instruction=clean(m[2]).replace(/[.\s]+$/,'');if(instruction)out.push({instruction,notes:[],sourceStepOrder:Number(m[1])||out.length+1});}
  return out;
}
let padsAudited=0,sourceCards=0,truthCards=0,padsSplit=0;
const failures=[];
for(const [id,record] of Object.entries(rewrites)){
  const entries=parseEntries(record?.r);if(!entries.length)continue;padsAudited++;sourceCards+=entries.length;
  let transformed;
  try{transformed=truth(entries,{});}catch(error){failures.push(`${id}: ${error.message}`);continue;}
  truthCards+=transformed.length;if(transformed.length>entries.length)padsSplit++;
  for(const entry of transformed){
    if(entry?.sourceTruthSplitV17320&&/\b(?:turn|stay|keep|veer|bear|slight)\s+(?:left|right|straight)\b/i.test(entry.instruction)&&facts(entry.instruction).length) failures.push(`${id}: split turn retained mileage: ${entry.instruction}`);
  }
}
if(failures.length) throw new Error(`V17.3.20 truth audit failures: ${failures.slice(0,20).join(' | ')}`);
if(padsAudited<1000) throw new Error(`Only ${padsAudited} packaged pads audited.`);
if(padsSplit<10) throw new Error(`Truth splitter affected only ${padsSplit} pads; expected legacy semantic repairs across the directory.`);
console.log(JSON.stringify({version:'17.3.20',padsAudited,sourceCards,truthCards,padsSplit,syntheticSingleDistance:'pass',syntheticRange:'pass',twoRoadTransition:'pass',triplettCompound:'pass',cologieContract:'pass'},null,2));
console.log('V17.3.20 road/turn/mileage truth audit passed.');
