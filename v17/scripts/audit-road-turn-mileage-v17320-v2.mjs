import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const read=file=>fs.readFile(file,'utf8');
const [truthSource,turnSource,manifestText]=await Promise.all([
  read(path.join(v17Root,'src/parts/22v-direction-road-turn-mileage-truth.js')),
  read(path.join(v17Root,'src/parts/22w-direction-unspecified-turn-support.js')),
  read(path.join(v17Root,'src/data/directions/index.json'))
]);
const manifest=JSON.parse(manifestText),rewrites={};
for(const file of manifest.files||[]) Object.assign(rewrites,JSON.parse(await read(path.join(v17Root,'src/data/directions',file))));

const clean=v=>String(v||'').replace(/\bonto\b/ig,'on').replace(/\s{2,}/g,' ').trim();
function leading(value){const raw=clean(value),m=raw.match(/^From\s+(.+?),\s*(?=(?:take|turn|head|travel|continue|follow|go|proceed|stay|keep|bear|veer|slight)\b)([\s\S]+)$/i);return m?{work:clean(m[2]),notes:[`Start: ${clean(m[1])}`],contextOnly:false}:{work:raw,notes:[],contextOnly:false};}
function canonical(value){let text=clean(value),m=text.match(/^(?:County\s+(?:Road|Rd|Route|Hwy)|CR)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)/i);if(m)return`CR-${m[1]}`;m=text.match(/^(?:Township\s+(?:Road|Rd|Route|Hwy)|TR)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)/i);if(m)return`TR-${m[1]}`;m=text.match(/^(I|US|OH|WV|PA|SR)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)/i);if(m)return`${m[1].toUpperCase()}-${m[2]}`;return text;}
function roadFrom(value){const text=clean(value);let m=text.match(/\b(?:Turn\s+(?:(?:left|right|north|south|east|west)\s+)?|Stay\s+(?:left|right)|Keep\s+(?:left|right)|Bear\s+(?:left|right)|Veer\s+(?:left|right)|Slight\s+(?:left|right)|Head\s+(?:north|south|east|west)|Continue|Follow|Travel|Proceed|Go)\b[^.;]{0,80}\bon\s+(.+?)(?=\s+(?:for|toward|towards|to|and|then)\b|[.;,]|$)/i);if(m)return{road:clean(m[1])};m=text.match(/^Take\s+(.+?)(?=\s+(?:for|toward|towards|and|then)\b|[.;,]|$)/i);if(m)return{road:clean(m[1])};m=text.match(/\b(?:Follow|Travel|Proceed|Go)\s+((?:I|US|OH|WV|PA|SR|CR|TR)[- ]?\d{1,4}(?:\/\d+)?[A-Z]?|[A-Za-z][A-Za-z0-9 .'-]+(?:Rd|Road|St|Street|Ave|Avenue|Pike|Trail))\b/i);return{road:m?clean(m[1]):''};}
function facts(value){const text=String(value||''),out=[];let m;const range=/(^|[^0-9])((?:approximately|about|roughly)\s+)?(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(miles?|mile|mi|feet|foot|ft)\b/ig;while((m=range.exec(text))){const o=m[1].length,u=/mile|mi/i.test(m[5])?'mi':'ft';out.push({start:m.index+o,end:m.index+m[0].length,raw:m[0].slice(o).trim(),label:`${m[2]?'≈':''}${Number(m[3])}–${Number(m[4])} ${u}`});}const single=/(^|[^0-9-])(approximately\s+|about\s+|roughly\s+)?(\d+(?:\.\d+)?|\.\d+)\s*(miles?|mile|mi|feet|foot|ft)\b/ig;while((m=single.exec(text))){const o=m[1].length,s=m.index+o,e=m.index+m[0].length;if(out.some(x=>s<x.end&&e>x.start))continue;const u=/mile|mi/i.test(m[4])?'mi':'ft';out.push({start:s,end:e,raw:m[0].slice(o).trim(),label:`${m[2]?'≈':''}${Number(m[3])} ${u}`});}return out.sort((a,b)=>a.start-b.start);}
const unique=values=>[...new Set((values||[]).filter(Boolean).map(v=>String(v).trim()))];
const context={console:{log(){},warn(){}},window:{},directionLeadingContextFinalV17317:leading,directionRoadFromViewFinalV17317:value=>roadFrom(value),directionDistanceFactsFinalV17317:facts,directionFinalCardsFromEntriesV17317:entries=>entries,directionMainCleanV17317:clean,directionNormalizeShorthandFinalV17317:clean,directionExplicitRoadDisplayFinalV17317:value=>{const t=clean(value);return /\s\/\s/.test(t)?{road:t,doubleName:true}:null;},directionNormalizeTargetRoadV17310:value=>canonical(value),directionUniqueNotesV17317:unique,directionRoadPartsV17318:instruction=>({prefix:'',road:roadFrom(instruction).road}),directionMainActionFinalV17317:value=>({main:clean(value),roadInfo:{road:roadFrom(value).road,doubleName:false},view:null})};
vm.createContext(context);vm.runInContext(truthSource,context,{filename:'22v'});vm.runInContext(turnSource,context,{filename:'22w'});
const truth=context.directionTruthEntriesV17320;if(typeof truth!=='function')throw new Error('V17.3.20 truth splitter unavailable.');

const synthetic=truth([{instruction:'Turn right on CR-10',notes:[],sourceStepOrder:1},{instruction:'Continue 1.3 miles and turn left on CR-20',notes:[],sourceStepOrder:2}],{});
if(synthetic.length!==3||synthetic[1].instruction!=='Continue on CR-10 for 1.3 miles'||!/^Turn left on CR-20$/i.test(synthetic[2].instruction)||facts(synthetic[2].instruction).length)throw new Error(`Single-distance-before-turn failed: ${JSON.stringify(synthetic)}`);
const rangeCase=truth([{instruction:'Turn left on CR-11',notes:[],sourceStepOrder:1},{instruction:'Continue approximately 6-7 miles and turn right on CR-12',notes:[],sourceStepOrder:2}],{});
if(rangeCase.length!==3||!/6-7 miles/i.test(rangeCase[1].instruction)||/6-7 miles/i.test(rangeCase[2].instruction))throw new Error(`Range-before-turn failed: ${JSON.stringify(rangeCase)}`);
const legitimate=truth([{instruction:'Turn right on Road A and travel 0.6 miles, then turn left on Road B',notes:[],sourceStepOrder:1}],{});
if(legitimate.length<2||!facts(legitimate[0].instruction).length||facts(legitimate[legitimate.length-1].instruction).length)throw new Error(`Legitimate turned-road mileage was not preserved correctly: ${JSON.stringify(legitimate)}`);
const transition=truth([{instruction:'From Bloomingdale, take US-22 and go south on E Steubenville St / SR-152. Continue 0.3 mile.',notes:[],sourceStepOrder:1}],{});
if(transition.length!==2||transition[0].instruction!=='Take US-22'||!/^Head south on E Steubenville St \/ SR-152/i.test(transition[1].instruction)||!/0\.3 mile/i.test(transition[1].instruction))throw new Error(`Two-road transition failed: ${JSON.stringify(transition)}`);
const triplett=truth([{instruction:'Follow Deersville Rd.',notes:[],sourceStepOrder:1},{instruction:'Stay right at the curve, then turn left before the white church with the blue roof onto Barber Hill Rd.',notes:[],sourceStepOrder:2}],{});
if(triplett.length!==3||!/^Stay right on Deersville Rd$/i.test(triplett[1].instruction)||!/^Turn left on Barber Hill Rd$/i.test(triplett[2].instruction)||!triplett[2].notes?.some(n=>/white church/i.test(n)))throw new Error(`Triplett split failed: ${JSON.stringify(triplett)}`);
const unspecified=truth([{instruction:'From SR 513 Turn onto CR 690',notes:[],sourceStepOrder:1}],{});if(unspecified.length!==1||!/^Turn on CR 690$/i.test(unspecified[0].instruction)||!unspecified[0].notes?.some(n=>/Start: SR 513/i.test(n)))throw new Error(`Unspecified turn failed: ${JSON.stringify(unspecified)}`);
const bearingTurn=truth([{instruction:'From OH-9, turn onto US-30 east.',notes:[],sourceStepOrder:1}],{});if(bearingTurn.length!==1||!/^Turn east on US-30/i.test(bearingTurn[0].instruction))throw new Error(`Route-bearing turn failed: ${JSON.stringify(bearingTurn)}`);
const compass=truth([{instruction:'From SR-212 in Leesville, turn west onto CR-22 / Azalea Rd. Continue 1.9 miles.',notes:[],sourceStepOrder:1}],{});if(compass.length!==1||!/^Turn west on CR-22 \/ Azalea Rd/i.test(compass[0].instruction)||!/1\.9 miles/i.test(compass[0].instruction))throw new Error(`Compass turn failed: ${JSON.stringify(compass)}`);
const cologieInput=['Take US-250 South','Turn left on CR-15 / Foxes Bottom Rd','Turn left on TR-79 / Springdale Hill Rd','Turn right on TR-72 / Lamborn Rd','Turn left on TR-79 / Springdale Hill Rd','Turn left on CR-13 / Unionvale-Kenwood Rd'].map((instruction,i)=>({instruction,notes:[],sourceStepOrder:i+1}));const cologie=truth(cologieInput,{});if(JSON.stringify(cologie.map(x=>x.instruction))!==JSON.stringify(cologieInput.map(x=>x.instruction)))throw new Error('COLOGIE changed.');

function parseEntries(clearText){const text=String(clearText||'').replace(/\r\n?/g,'\n').trim(),marker=/Step-by-step directions\s*:/i.exec(text),body=marker?text.slice(marker.index+marker[0].length):text,out=[],re=/(?:^|\n)\s*(\d+)\.\s*([\s\S]*?)(?=(?:\n\s*\d+\.\s)|$)/g;let m;while((m=re.exec(body))){const instruction=clean(m[2]).replace(/[.\s]+$/,'');if(instruction)out.push({instruction,notes:[],sourceStepOrder:Number(m[1])||out.length+1});}return out;}
const turnRe=/\b(?:turn|stay|keep|veer|bear|slight)\s+(?:left|right|straight)\b/i;
let padsAudited=0,sourceCards=0,truthCards=0,padsSplit=0,singleDistanceTurnSplitsChecked=0;const failures=[];
for(const [id,record] of Object.entries(rewrites)){
  const entries=parseEntries(record?.r);if(!entries.length)continue;padsAudited++;sourceCards+=entries.length;
  let transformed;try{transformed=truth(entries,{});}catch(error){failures.push(`${id}: ${error.message}`);continue;}
  truthCards+=transformed.length;if(transformed.length>entries.length)padsSplit++;
  const byOrder=new Map();for(const item of transformed){const key=Number(item.sourceStepOrder)||0;if(!byOrder.has(key))byOrder.set(key,[]);byOrder.get(key).push(item);}
  for(const original of entries){const originalFacts=facts(original.instruction);if(originalFacts.length!==1)continue;const group=byOrder.get(Number(original.sourceStepOrder)||0)||[];if(group.length<=1)continue;const last=group[group.length-1];if(!turnRe.test(last.instruction))continue;singleDistanceTurnSplitsChecked++;if(facts(last.instruction).length)failures.push(`${id} step ${original.sourceStepOrder}: single pre-turn mileage crossed to target: ${last.instruction}`);}
}
if(failures.length)throw new Error(`V17.3.20 truth audit failures: ${failures.slice(0,20).join(' | ')}`);
if(padsAudited<1000)throw new Error(`Only ${padsAudited} pads audited.`);
// All packaged pads are audited above. The count below only proves that the new
// semantic splitter and single-distance-before-turn path actually occur in real
// production data. Most legacy fragmentation was already fixed in V17.3.15–19, so
// correctness must not depend on an arbitrary number of pads changing.
if(padsSplit<1)throw new Error('No packaged pad exercised the V17.3.20 semantic splitter.');
if(singleDistanceTurnSplitsChecked<1)throw new Error('No packaged single-distance turn split was exercised.');
console.log(JSON.stringify({version:'17.3.20',padsAudited,sourceCards,truthCards,padsSplit,singleDistanceTurnSplitsChecked,singleDistanceBeforeTurn:'pass',rangeBeforeTurn:'pass',legitimateTurnedRoadMileage:'pass',twoRoadTransition:'pass',triplettCompound:'pass',unspecifiedTurn:'pass',compassTurn:'pass',cologieContract:'pass'},null,2));
console.log('V17.3.20 source-aware road/turn/mileage audit passed.');
