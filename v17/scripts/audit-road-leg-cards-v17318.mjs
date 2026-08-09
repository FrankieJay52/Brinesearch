import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const publicRoot=path.join(v17Root,'public');
const read=file=>fs.readFile(file,'utf8');
const names=['22m-direction-source-priority-and-coalescer.js','22n-direction-context-coalescing.js','22o-direction-mileage-badges-double-name.js','22p-direction-concise-driver-cards.js','22q-direction-road-pair-safety.js','22r-direction-final-card-contract.js','22s-direction-range-mileage-final-scrub.js','22t-known-source-cleanups.js','22u-direction-road-data-enrichment.js'];
const [manifestText,...sources]=await Promise.all([read(path.join(publicRoot,'data/directions/index.json')),...names.map(name=>read(path.join(v17Root,'src/parts',name)))]);
const manifest=JSON.parse(manifestText),rewrites={};
for(const file of manifest.files||[]) Object.assign(rewrites,JSON.parse(await read(path.join(publicRoot,'data/directions',file))));
if(Object.keys(rewrites).length<1000) throw new Error(`Expected full rewrite directory, found ${Object.keys(rewrites).length}.`);

function parseEntries(clearText){
  const text=String(clearText||'').replace(/\r\n?/g,'\n').trim();
  const marker=/Step-by-step directions\s*:/i.exec(text);const body=marker?text.slice(marker.index+marker[0].length):text;
  const out=[];const re=/(?:^|\n)\s*(\d+)\.\s*([\s\S]*?)(?=(?:\n\s*\d+\.\s)|$)/g;let m;
  while((m=re.exec(body))){const instruction=String(m[2]||'').replace(/\s*\n\s*/g,' ').replace(/\s{2,}/g,' ').trim();if(instruction)out.push({instruction,notes:[],sourceStepOrder:Number(m[1])||out.length+1});}
  return out;
}
const clean=value=>String(value||'').replace(/\s{2,}/g,' ').replace(/\s+([,.;])/g,'$1').trim();
const compact=value=>String(value||'').replace(/\bonto\b/gi,'on').replace(/\.\s*Continue\s+(about\s+|approximately\s+|approx\.?\s+|roughly\s+)?(\d+(?:\.\d+)?|\.\d+|\d+\s*\/\s*\d+|[½¼¾])\s*(miles?|mile|mi)\b/ig,(_,q,n)=>` for ${q?'about ':''}${n} mi`).replace(/\s{2,}/g,' ').trim();
function canonicalRoute(value){let text=clean(value),m=text.match(/^County\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*(\d+)/i);if(m)return`CR-${m[1]}`;m=text.match(/^Township\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*(\d+)/i);if(m)return`TR-${m[1]}`;return text.replace(/^(I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*/i,(_,f)=>`${f.toUpperCase()}-`);}
function dual(value){const text=String(value||''),route='((?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d{1,4}[A-Z]?|(?:State|County|Township)\\s+(?:Route|Road|Rd|Hwy)\\s*[- ]?\\s*\\d{1,4}[A-Z]?)',local="([A-Za-z0-9][A-Za-z0-9 .'-]{0,70}?(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way))";let m=text.match(new RegExp(`\\b${route}\\s*\\/\\s*${local}\\b`,'i'));if(m)return{kind:'route',text:canonicalRoute(m[1]),alias:clean(m[2])};m=text.match(new RegExp(`\\b${local}\\s*\\/\\s*${route}\\b`,'i'));if(m)return{kind:'route',text:canonicalRoute(m[2]),alias:clean(m[1])};return null;}
function view(value){const text=String(value||'').replace(/\bonto\b/gi,'on'),d=dual(text);if(d)return{road:d,note:''};let m=text.match(/\bExit\s*([0-9A-Z-]+)/i);if(m)return{road:{kind:'exit',text:`Exit ${m[1]}`},note:''};m=text.match(/\b(?:on|along|take|follow)\s+(?:the\s+)?(.+?)(?=\s+(?:for|in|and|then|until|toward|towards|continue|past|through|to|at)\b|[.;,]|$)/i);if(m?.[1])return{road:{kind:'road',text:clean(m[1])},note:''};m=text.match(/\b((?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}[A-Z]?)\b/i);return{road:m?{kind:'route',text:canonicalRoute(m[1])}:{kind:'',text:''},note:''};}
const context={console:{log(){},warn(){}},window:{},navigator:{onLine:false},renderPad:async()=>{},padById:()=>null,pads:[],SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'test',fetch:async()=>{throw new Error('network disabled');},URL,AbortController,setTimeout,clearTimeout,esc:v=>String(v??''),directionWrittenCleanV17315:clean,directionWrittenSentenceV17315:compact,directionGlobalWrittenEntriesV17315:v=>v,directionGlobalWrittenPrimaryHtmlV17315:()=>'',directionInlineDualRoadV17312:dual,directionClearStepViewV1733:view,directionSplitDriverStepV17312:value=>[clean(value)]};
vm.createContext(context);
for(let i=0;i<sources.length-1;i++) vm.runInContext(sources[i],context,{filename:names[i]});
const preGroup=context.directionFinalCardsFromEntriesV17317.bind(context);
vm.runInContext(sources[sources.length-1],context,{filename:names[names.length-1]});

const mileage=/(?:\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?|\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|[½¼¾]|\d+(?:\.\d+)?|\.\d+)\s*(?:miles?|mile|mi\b|feet|foot|ft\b|yards?|yard|yd\b)/i;
let pads=0,baseCards=0,finalCards=0,reducedPads=0,contextMain=0,mileageMain=0,narrativeMain=0,extraCardPads=0;
const examples=[];
for(const [id,record] of Object.entries(rewrites)){
  const raw=parseEntries(record?.r);if(!raw.length)continue;pads++;
  const coalesced=context.directionCoalesceEntriesV17316(raw);
  const pad={state:'',directionRoadIntelligence:[],officialRoadAliasesV17318:[],measuredRoadSegmentsV17318:[]};
  const before=preGroup(coalesced,pad),after=context.directionFinalCardsFromEntriesV17317(coalesced,pad);
  baseCards+=before.length;finalCards+=after.length;if(after.length<before.length)reducedPads++;if(after.length>before.length){extraCardPads++;if(examples.length<20)examples.push(`${id}: ${before.length}->${after.length}`);}
  for(const card of after){const main=String(card?.instruction||'');if(/^(?:From|At)\b/i.test(main))contextMain++;if(mileage.test(main))mileageMain++;if(/\.\s+\S/.test(main))narrativeMain++;}
}
const summary={version:'17.3.18',padsAudited:pads,cardsBeforeRoadGrouping:baseCards,cardsAfterRoadGrouping:finalCards,padsReducedBySameRoadGrouping:reducedPads,padsThatGainedCards:extraCardPads,mainLinesStartingWithContext:contextMain,mainLinesWithEmbeddedMileage:mileageMain,multiSentenceMainLines:narrativeMain,examples};
console.log(JSON.stringify(summary,null,2));
if(pads<1000)throw new Error(`Only ${pads} pads audited.`);
if(finalCards<4000)throw new Error(`Only ${finalCards} final cards audited.`);
if(extraCardPads)throw new Error(`${extraCardPads} pads gained cards during road grouping.`);
if(contextMain||mileageMain||narrativeMain)throw new Error(`Road grouping violated concise-card contract: context=${contextMain}, mileage=${mileageMain}, narrative=${narrativeMain}.`);
if(reducedPads<10)throw new Error(`Road grouping reduced only ${reducedPads} pads; expected repeated-road cleanup across the directory.`);
console.log('V17.3.18 all-pad road-leg audit passed.');
