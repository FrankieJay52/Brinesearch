import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const read=file=>fs.readFile(file,'utf8');
const partNames=[
  '22m-direction-source-priority-and-coalescer.js','22n-direction-context-coalescing.js',
  '22o-direction-mileage-badges-double-name.js','22p-direction-concise-driver-cards.js',
  '22q-direction-road-pair-safety.js','22r-direction-final-card-contract.js',
  '22s-direction-range-mileage-final-scrub.js','22t-known-source-cleanups.js',
  '22u-direction-road-data-enrichment.js','22v-direction-road-turn-mileage-truth.js',
  '22w-direction-unspecified-turn-support.js','22x-direction-final-integrity-v17321.js',
  '22y-direction-global-card-compactor-v17322.js'
];
const [manifestText,...sources]=await Promise.all([
  read(path.join(v17Root,'src/data/directions/index.json')),
  ...partNames.map(name=>read(path.join(v17Root,'src/parts',name)))
]);
const manifest=JSON.parse(manifestText),rewrites={};
for(const file of manifest.files||[]) Object.assign(rewrites,JSON.parse(await read(path.join(v17Root,'src/data/directions',file))));
if(Object.keys(rewrites).length<1000) throw new Error(`Expected full packaged direction set; found ${Object.keys(rewrites).length}.`);

const clean=v=>String(v??'').replace(/\r\n?/g,'\n').trim();
function sourceDistanceFacts(value){
  const text=String(value||''),out=[],re=/(^|[^0-9])((?:\.\d+|\d+(?:\.\d+)?))\s*(miles?|mile|mi|feet|foot|ft|yards?|yard|yd)\b/ig;let m;
  while((m=re.exec(text))){const prefix=String(m[1]||'').length,num=String(m[2]||''),unitRaw=String(m[3]||'').toLowerCase(),unit=/^(?:mile|miles|mi)$/.test(unitRaw)?'mi':/^(?:feet|foot|ft)$/.test(unitRaw)?'ft':'yd',start=(m.index||0)+prefix;out.push({number:num,unit,start,end:start+num.length});}
  return out;
}
function repairLeadingDecimals(sourceValue,clearValue){
  const source=String(sourceValue||'');let clear=String(clearValue||'');
  if(!source||!clear||!/(?:^|[^0-9])\.\d+\s*(?:miles?|mile|mi|feet|foot|ft|yards?|yard|yd)\b/i.test(source))return clear;
  const s=sourceDistanceFacts(source),c=sourceDistanceFacts(clear),changes=[];
  for(let i=0;i<Math.min(s.length,c.length);i+=1){if(!/^\.\d+$/.test(s[i].number)||s[i].unit!==c[i].unit)continue;const digits=s[i].number.slice(1);if(String(Number(c[i].number))!==String(Number(digits)))continue;changes.push({start:c[i].start,end:c[i].end,replacement:`0${s[i].number}`});}
  for(const x of changes.sort((a,b)=>b.start-a.start))clear=`${clear.slice(0,x.start)}${x.replacement}${clear.slice(x.end)}`;
  return clear;
}
function parseEntries(clearText){
  const text=clean(clearText),marker=/Step-by-step directions\s*:/i.exec(text),body=marker?text.slice(marker.index+marker[0].length):text,out=[];
  const re=/(?:^|\n)\s*(\d+)\.\s*([\s\S]*?)(?=(?:\n\s*\d+\.\s)|$)/g; let m;
  while((m=re.exec(body))){const instruction=clean(m[2]).replace(/\s*\n\s*/g,' ').replace(/\s{2,}/g,' ').trim();if(instruction)out.push({instruction,notes:[],sourceStepOrder:Number(m[1])||out.length+1});}
  return out;
}
function canonicalRoute(value){
  let text=String(value||'').trim(),m=text.match(/^County\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)$/i);if(m)return`CR-${m[1]}`;
  m=text.match(/^Township\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)$/i);if(m)return`TR-${m[1]}`;
  m=text.match(/^(I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)$/i);if(m)return`${m[1].toUpperCase()}-${m[2]}`;
  return text;
}
function goodAlias(value){const a=String(value||'').trim();return Boolean(a&&!/^\d/.test(a)&&!/\b(?:turn|onto|continue|follow|take)\b/i.test(a));}
function simpleDualRoad(value){
  const text=String(value||''),route='((?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d{1,4}(?:\\/\\d+)?[A-Z]?|(?:State|County|Township)\\s+(?:Route|Road|Rd|Hwy)\\s*[- ]?\\s*\\d{1,4}(?:\\/\\d+)?[A-Z]?)',local="([A-Za-z][A-Za-z0-9 .'-]{0,70}?(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way))";
  let m=text.match(new RegExp(`\\b${route}\\s*\\/\\s*${local}\\b`,'i'));if(m&&goodAlias(m[2]))return{kind:'route',text:canonicalRoute(m[1]),alias:m[2].trim()};
  m=text.match(new RegExp(`\\b${local}\\s*\\/\\s*${route}\\b`,'i'));if(m&&goodAlias(m[1]))return{kind:'route',text:canonicalRoute(m[2]),alias:m[1].trim()};return null;
}
function simpleStepView(value){
  const text=String(value||'').replace(/\bonto\b/gi,'on').trim(),dual=simpleDualRoad(text);if(dual)return{road:dual,maneuver:'',note:''};
  let m=text.match(/\bExit\s*([0-9A-Z-]+)/i);if(m)return{road:{kind:'exit',text:`Exit ${m[1]}`},maneuver:'',note:''};
  m=text.match(/\b(?:on|along|take|follow)\s+(?:the\s+)?(.+?)(?=\s+(?:for|in|and|then|until|toward|towards|continue|past|through|to|at)\b|[.;,]|$)/i);if(m?.[1])return{road:{kind:'road',text:m[1].trim().replace(/^(?:north|south|east|west)\s+/i,'')},maneuver:'',note:''};
  m=text.match(/\b((?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?|(?:State|County|Township)\s+(?:Route|Road|Rd|Hwy)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?)\b/i);if(m)return{road:{kind:'route',text:canonicalRoute(m[1])},maneuver:'',note:''};
  return{road:{kind:'',text:''},maneuver:'',note:''};
}
function simpleLegacySplit(value){const t=String(value||'').replace(/\s{2,}/g,' ').trim();if(!t)return[];return t.replace(/\s+(?=(?:turn\s+(?:left|right)\b|slight\s+(?:left|right)\b|veer\s+(?:left|right)\b|bear\s+(?:left|right)\b|take\s+(?:exit|I-|US-|OH-|WV-|PA-|SR-|Route)|head\s+(?:north|south|east|west)\b|merge\b|travel\b|go\s+to\b))/gi,'\n').split(/\n+/).map(x=>x.trim()).filter(Boolean);}

const context={
  console:{log(){},warn(){}},window:{},navigator:{onLine:false},URL,AbortController,setTimeout,clearTimeout,
  renderPad:async()=>{},padById:()=>null,pads:[],SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'test',
  fetch:async()=>{throw new Error('network disabled');},esc:v=>String(v??''),
  directionWrittenCleanV17315:v=>String(v||'').replace(/\s{2,}/g,' ').replace(/\s+([,.;])/g,'$1').trim(),
  directionWrittenSentenceV17315:v=>String(v||'').replace(/\s{2,}/g,' ').trim(),
  directionGlobalWrittenEntriesV17315:v=>v,directionGlobalWrittenPrimaryHtmlV17315:()=>'',
  directionInlineDualRoadV17312:simpleDualRoad,directionClearStepViewV1733:simpleStepView,directionSplitDriverStepV17312:simpleLegacySplit,
  directionNormalizeTargetRoadV17310:(v)=>canonicalRoute(v),directionRepairLeadingDecimalMileageV17322:repairLeadingDecimals
};
vm.createContext(context);sources.forEach((source,i)=>vm.runInContext(source,context,{filename:partNames[i]}));
if(typeof context.directionCompactFinalCardsV17322!=='function')throw new Error('V17.3.22 global card compactor unavailable.');

const malformedRoad=/\bon\s+(?:CR|TR|SR|Route|Road|County\s+Road|Township\s+Road|State\s+Route|North\s+East|North\s+West|South\s+East|South\s+West|Left\s+Nearest|Right\s+Nearest)\s*$/i;
const generic=/^(?:Continue|Continue\s+on|Head\s+(?:northwest|northeast|southwest|southeast|north|south|east|west)|Continue\s+(?:northwest|northeast|southwest|southeast|north|south|east|west)|Turn\s+(?:left|right)|Turn|Merge|Take\s+route)$/i;
const gapNote='Road name not present in saved directions';
let padsAudited=0,cardsAudited=0,unsafeGenericCards=0,sourceLimitedCards=0,malformedCards=0,orphanMileage=0,hospitalLeaks=0,leadingDecimalRepairs=0;const failures=[];
for(const [id,record] of Object.entries(rewrites)){
  const repaired=repairLeadingDecimals(record?.s,record?.r);if(repaired!==String(record?.r||''))leadingDecimalRepairs++;
  const raw=parseEntries(repaired);if(!raw.length)continue;padsAudited++;
  const coalesced=context.directionCoalesceEntriesV17316(raw);
  const pad={_id:id,legacy_id:id,state:'',directionRoadIntelligence:[],officialRoadAliasesV17318:[],measuredRoadSegmentsV17318:[]};
  let cards;try{cards=context.directionFinalCardsFromEntriesV17317(coalesced,pad)||[];}catch(error){failures.push(`${id}: render error: ${error.message}`);continue;}
  cardsAudited+=cards.length;
  for(const card of cards){
    const main=String(card?.instruction||'').replace(/\s{2,}/g,' ').trim(),notes=(card?.notes||[]).map(String),sourceLimited=notes.some(n=>n===gapNote);
    if(generic.test(main)){if(sourceLimited)sourceLimitedCards++;else{unsafeGenericCards++;if(failures.length<80)failures.push(`${id}: unresolved roadless card: ${main}${card?.distance?` [${card.distance}]`:''}`);}}
    if(malformedRoad.test(main)){malformedCards++;if(failures.length<80)failures.push(`${id}: malformed road: ${main}`);}
    if(card?.distance&&generic.test(main)&&!sourceLimited){orphanMileage++;}
    if(/Nearest\s+Hospital|Medical\s+Park/i.test(main)||notes.some(n=>/Nearest\s+Hospital/i.test(n))){hospitalLeaks++;if(failures.length<80)failures.push(`${id}: hospital leak: ${main}`);}
  }
}
const atmosRecord=rewrites['ascent--atmos'];
const atmosClear=repairLeadingDecimals(atmosRecord?.s,atmosRecord?.r),atmosRaw=parseEntries(atmosClear),atmosCoalesced=context.directionCoalesceEntriesV17316(atmosRaw),atmosCards=context.directionFinalCardsFromEntriesV17317(atmosCoalesced,{_id:'ascent--atmos',legacy_id:'ascent--atmos',state:'Ohio',directionRoadIntelligence:[],officialRoadAliasesV17318:[],measuredRoadSegmentsV17318:[]});
const atmosMain=atmosCards.map(c=>`${c.instruction}${c.distance?` — ${c.distance}`:''}`);
if(atmosCards.some(c=>generic.test(String(c.instruction||''))&&!((c.notes||[]).includes(gapNote)))||atmosCards.some(c=>malformedRoad.test(String(c.instruction||''))))failures.unshift(`ascent--atmos regression: ${JSON.stringify(atmosMain)}`);
if(!atmosMain.some(v=>/Fair Road.*0\.5 mi/i.test(v)))failures.unshift(`ascent--atmos saved .5 mile was not restored: ${JSON.stringify(atmosMain)}`);
if(atmosCards.filter(c=>/^Arrive$/i.test(String(c.instruction||''))).length)failures.unshift(`ascent--atmos duplicate Arrive card remains: ${JSON.stringify(atmosMain)}`);
console.log(JSON.stringify({version:'17.3.22',padsAudited,cardsAudited,unsafeGenericCards,sourceLimitedCards,malformedCards,orphanMileage,hospitalLeaks,leadingDecimalRepairs,atmos:atmosMain,examples:failures.slice(0,80)},null,2));
if(padsAudited<1000)throw new Error(`Only ${padsAudited} pads audited.`);
if(leadingDecimalRepairs<1)throw new Error('No saved leading-decimal mileage repair was exercised.');
if(unsafeGenericCards||malformedCards||orphanMileage||hospitalLeaks||failures.length)throw new Error(`Final driver-card integrity failed: unresolved=${unsafeGenericCards}, malformed=${malformedCards}, orphanMileage=${orphanMileage}, hospitalLeaks=${hospitalLeaks}. Examples: ${failures.slice(0,20).join(' | ')}`);
console.log('V17.3.22 all-pad final driver-card integrity audit passed.');
