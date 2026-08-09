import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const projectRoot=path.resolve(v17Root,'..');
const read=file=>fs.readFile(file,'utf8');
const [pkgText,partsText,stylesText,source,sw,migrationA,migrationB]=await Promise.all([
  read(path.join(projectRoot,'package.json')),
  read(path.join(v17Root,'src/parts/part-order.json')),
  read(path.join(v17Root,'src/styles/style-order.json')),
  read(path.join(v17Root,'src/parts/22u-direction-road-data-enrichment.js')),
  read(path.join(v17Root,'src/offline/sw.js')),
  read(path.join(projectRoot,'supabase/migrations/20260809214000_v17318_preserve_measured_road_segments.sql')),
  read(path.join(projectRoot,'supabase/migrations/20260809215000_v17318_pad_official_road_alias_rpc.sql'))
]);
const pkg=JSON.parse(pkgText),parts=JSON.parse(partsText),styles=JSON.parse(stylesText);
if(pkg.version!=='17.3.18'||parts.version!=='17.3.18'||styles.version!=='17.3.18') throw new Error('V17.3.18 version markers are not synchronized.');
const u=parts.parts.indexOf('22u-direction-road-data-enrichment.js');
const t=parts.parts.indexOf('22t-known-source-cleanups.js');
const startup=parts.parts.indexOf('18-account-theme-startup.js');
if(u<=t||startup<=u) throw new Error('V17.3.18 road data layer must load after V17.3.17 cleanup and before startup.');
for(const token of ['brinesearch_pad_measured_road_segments','brinesearch_pad_official_road_aliases','directionGroupRoadCardsV17318','directionRoadDataHydrateV17318']) if(!source.includes(token)) throw new Error(`Road data source is missing ${token}.`);
if(!sw.includes('brinesearch-v17-3-18-road-mileage-recovery')) throw new Error('V17.3.18 cache marker is missing.');
for(const token of ['usable boolean','rejection_reason','brinesearch_sync_pad_measured_road_segments','measurement withheld by prior mileage audit']) if(!migrationA.includes(token)) throw new Error(`Measured-road migration missing ${token}.`);
for(const token of ['verification_status=\'verified\'','brinesearch_pad_official_road_aliases','canonical_name','aliases']) if(!migrationB.includes(token)) throw new Error(`Official-road RPC migration missing ${token}.`);

const context={
  console:{log(){},warn(){}},window:{},navigator:{onLine:false},
  renderPad:async()=>{},padById:()=>null,SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'test',
  fetch:async()=>{throw new Error('network disabled');},
  directionFinalCardsFromEntriesV17317:entries=>entries
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'22u-direction-road-data-enrichment.js'});

const card=(instruction,distance='',notes=[],doubleName=false)=>({instruction,distance,notes,doubleName});
const cologie={
  state:'Ohio',
  officialRoadAliasesV17318:[
    {route_label:'CR-15',canonical_name:'Foxs Bottom Rd',aliases:['Foxes Bottom Rd','CR-15']},
    {route_label:'TR-79',canonical_name:'Springdale Hill Rd',aliases:['TR-79','Township Road 79']},
    {route_label:'TR-72',canonical_name:'Lamborn Rd',aliases:['TR-72','Township Road 72']},
    {route_label:'CR-13',canonical_name:'Unionvale-Kenwood Rd',aliases:['Unionvale Kenwood Rd','CR-13']}
  ],
  measuredRoadSegmentsV17318:[]
};
const cologieCards=context.directionGroupRoadCardsV17318([
  card('Take US-250 South','',['Start: Cadiz']),
  card('Turn left on Foxes Bottom Rd','2.4 mi'),
  card('Turn left on Springdale Hill Rd','0.9 mi'),
  card('Turn right on Lamborn Rd','0.2 mi'),
  card('Turn left on Springdale Hill Rd','0.5 mi'),
  card('Turn left on Unionvale-Kenwood Rd','0.3 mi',['Pad on right'])
],cologie);
const cologieExpected=[
  'Take US-250 South',
  'Turn left on CR-15 / Foxes Bottom Rd',
  'Turn left on TR-79 / Springdale Hill Rd',
  'Turn right on TR-72 / Lamborn Rd',
  'Turn left on TR-79 / Springdale Hill Rd',
  'Turn left on CR-13 / Unionvale-Kenwood Rd'
];
if(JSON.stringify(cologieCards.map(x=>x.instruction))!==JSON.stringify(cologieExpected)) throw new Error(`COLOGIE official double-name enrichment failed: ${JSON.stringify(cologieCards)}`);
if(JSON.stringify(cologieCards.map(x=>x.distance))!==JSON.stringify(['','2.4 mi','0.9 mi','0.2 mi','0.5 mi','0.3 mi'])) throw new Error('COLOGIE saved mileage changed.');
if(cologieCards.length!==6||!cologieCards[5].notes.includes('Pad on right')) throw new Error('COLOGIE card structure changed.');

const noelle={state:'Ohio',officialRoadAliasesV17318:[],measuredRoadSegmentsV17318:[
  {road_key:'CR-23',distance_miles:0.21},{road_key:'CR-26',distance_miles:7.16},{road_key:'CR-33',distance_miles:1.46}
]};
const noelleCards=context.directionGroupRoadCardsV17318([
  card('Turn left on CR-23 / High St'),
  card('Turn left on CR-26'),
  card('Turn left on CR-26','',['At the 25 / 26 split']),
  card('Continue on CR-26','',['At the stop sign']),
  card('Turn right on CR-26','',['At the next stop sign','One-lane bridge']),
  card('Turn left on CR-33')
],noelle);
if(noelleCards.length!==3) throw new Error(`Noelle same-road grouping failed: ${JSON.stringify(noelleCards)}`);
if(noelleCards[0].distance!=='≈ 0.21 mi'||noelleCards[1].distance!=='≈ 7.2 mi'||noelleCards[2].distance!=='≈ 1.5 mi') throw new Error(`Noelle recovered measured mileage failed: ${JSON.stringify(noelleCards)}`);
if(!noelleCards[1].notes.some(x=>/25 \/ 26 split/i.test(x))||!noelleCards[1].notes.some(x=>/stay on CR-26/i.test(x))) throw new Error('Noelle decision notes were lost while grouping CR-26.');

const caston={state:'Ohio',officialRoadAliasesV17318:[],measuredRoadSegmentsV17318:[{road_key:'CR-82',distance_miles:2.79}]};
const savedWins=context.directionGroupRoadCardsV17318([card('Turn right on CR-82 / McCoy Rd','2.3 mi')],caston);
if(savedWins[0].distance!=='2.3 mi') throw new Error('Accepted measured mileage overwrote a saved driver mileage.');

const ambiguous={state:'Ohio',officialRoadAliasesV17318:[
  {route_label:'CR-5',canonical_name:'Crescent Rd',aliases:['CR-5']},
  {route_label:'CR-5',canonical_name:'Glencoe Rd',aliases:['CR-5']}
],measuredRoadSegmentsV17318:[]};
const routeOnly=context.directionGroupRoadCardsV17318([card('Turn left on CR-5')],ambiguous);
if(routeOnly[0].instruction!=='Turn left on CR-5') throw new Error('Route-only card was assigned an unproven local road name.');
const renamedSegments=context.directionGroupRoadCardsV17318([card('Turn left on CR-5 / Crescent Rd'),card('Continue on CR-5 / Glencoe Rd')],ambiguous);
if(renamedSegments.length!==2) throw new Error('Different named segments of the same county route were incorrectly collapsed.');

if(source.includes('street-sign-board')||source.includes('direction-highway-badge')) throw new Error('V17.3.18 road cards must remain signless.');
console.log('Verified BrineSearch V17.3.18: COLOGIE keeps saved miles and gains exact official CR/TR double names; accepted backward-measured road segments safely fill missing mileage; repeated same-road instructions collapse into notes; saved mileage wins over measurements; ambiguous route-only names stay unguessed; and differently named segments of one route remain separate.');
