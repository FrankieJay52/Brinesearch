import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const source=await fs.readFile(path.join(v17Root,'src/parts/22z-direction-exit-road-truth-v17323.js'),'utf8');
const context={
  window:{},
  directionFinalCardsFromEntriesV17317:(entries,p)=>Array.isArray(entries)?entries:[],
  directionUniqueNotesV17317:notes=>[...new Set((notes||[]).filter(Boolean))],
  DIRECTION_SOURCE_ROAD_GAP_NOTE_V17322:'Road name not present in saved directions'
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'22z-direction-exit-road-truth-v17323.js'});
if(typeof context.window.directionApplyExitRoadTruthV17323!=='function') throw new Error('V17.3.23 exit-road truth guard did not load.');

const apply=context.window.directionApplyExitRoadTruthV17323;
const generic=[
  {instruction:'Take Exit 198',distance:'',notes:['Start: I-70 west']},
  {instruction:'Turn left on I-70',distance:'',notes:['At the stop sign']},
  {instruction:'Turn left',distance:'1.2 mi',notes:['Road name not present in saved directions']}
];
const guarded=apply(generic,{_id:'synthetic--exit-bounce'});
if(/on\s+I-70/i.test(String(guarded[1]?.instruction||''))) throw new Error('Same-highway post-exit false road survived the global guard.');
if(!String(guarded[1]?.notes||[]).includes('Road name not present in saved directions')) throw new Error('Global exit guard did not preserve source-gap disclosure.');

const albert=apply(generic,{_id:'ascent--albert',padName:'ALBERT KKW BL (fka KIRKWOOD B)'});
const albertText=albert.map(card=>`${card.instruction}${card.distance?` — ${card.distance}`:''}`).join(' | ');
for(const expected of ['Take Exit 198','Turn left on OH-114 — 1.2 mi','Lease road entrance on left']) {
  if(!albertText.includes(expected)) throw new Error(`Albert regression missing: ${expected}. Got ${albertText}`);
}
if(albert.some(card=>/Turn left on I-70/i.test(String(card.instruction||'')))) throw new Error(`Albert still falsely turns onto I-70: ${albertText}`);
if(!albert.some(card=>(card.notes||[]).some(note=>/under I-70.*stop sign/i.test(String(note))))) throw new Error(`Albert under-I-70 stop-sign context missing: ${albertText}`);

const manifest=JSON.parse(await fs.readFile(path.join(v17Root,'src/data/directions/index.json'),'utf8'));
let records=0,albertSource=null;
for(const file of manifest.files||[]) {
  const json=JSON.parse(await fs.readFile(path.join(v17Root,'src/data/directions',file),'utf8'));
  records+=Object.keys(json).length;
  if(json['ascent--albert']) albertSource=json['ascent--albert'];
}
if(records<1000) throw new Error(`Direction manifest unexpectedly small: ${records}`);
if(!albertSource) throw new Error('Packaged ascent--albert source is missing.');
for(const fact of ['Exit 198','1.2 miles','Route 114','Lease Road']) {
  if(!String(albertSource.r||'').includes(fact)) throw new Error(`Packaged Albert rewrite missing source-grounding fact ${fact}.`);
}
if(!/go on 114/i.test(String(albertSource.s||''))||!/Sits right along 114/i.test(String(albertSource.s||''))) throw new Error('Albert original saved source no longer supports OH-114 recovery.');

console.log(JSON.stringify({version:'17.3.23',packagedDirectionRecords:records,globalPostExitSameHighwayGuard:'pass',albert:albertText},null,2));
console.log('V17.3.23 exit-road truth audit passed.');
