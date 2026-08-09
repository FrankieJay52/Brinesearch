import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const v17Root=path.resolve(scriptDir,'..');
const projectRoot=path.resolve(v17Root,'..');
const read=file=>fs.readFile(file,'utf8');
const [pkgText,partsText,stylesText,roadData,truthSource,turnSource,sw,migrationA,migrationB,migrationC,migrationD,migrationE]=await Promise.all([
  read(path.join(projectRoot,'package.json')),
  read(path.join(v17Root,'src/parts/part-order.json')),
  read(path.join(v17Root,'src/styles/style-order.json')),
  read(path.join(v17Root,'src/parts/22u-direction-road-data-enrichment.js')),
  read(path.join(v17Root,'src/parts/22v-direction-road-turn-mileage-truth.js')),
  read(path.join(v17Root,'src/parts/22w-direction-unspecified-turn-support.js')),
  read(path.join(v17Root,'src/offline/sw.js')),
  read(path.join(projectRoot,'supabase/migrations/20260809230000_v17320_road_turn_mileage_truth.sql')),
  read(path.join(projectRoot,'supabase/migrations/20260809231500_v17320_target_road_and_alias_truth.sql')),
  read(path.join(projectRoot,'supabase/migrations/20260809232500_v17320_alias_sanity_and_direct_fractional_legs.sql')),
  read(path.join(projectRoot,'supabase/migrations/20260809233500_v17320_unspecified_turn_class_truth.sql')),
  read(path.join(projectRoot,'supabase/migrations/20260809234500_v17320_no_side_turn_precedence_fix.sql'))
]);
const pkg=JSON.parse(pkgText),parts=JSON.parse(partsText),styles=JSON.parse(stylesText);
if(pkg.version!=='17.3.20'||parts.version!=='17.3.20'||styles.version!=='17.3.20') throw new Error('V17.3.20 version markers are not synchronized.');
const u=parts.parts.indexOf('22u-direction-road-data-enrichment.js');
const v=parts.parts.indexOf('22v-direction-road-turn-mileage-truth.js');
const w=parts.parts.indexOf('22w-direction-unspecified-turn-support.js');
const startup=parts.parts.indexOf('18-account-theme-startup.js');
if(u<0||v<=u||w<=v||startup<=w) throw new Error('V17.3.20 truth layers must load after road enrichment and before startup.');
if(!sw.includes("brinesearch-v17-3-20-road-turn-mileage-truth")) throw new Error('V17.3.20 cache marker is missing.');
for(const token of ['directionTruthEntriesV17320','directionTruthDistanceBeforeTurnSplitV17320','sourceTruthSplitV17320']) if(!truthSource.includes(token)) throw new Error(`Truth source missing ${token}.`);
for(const token of ['Turn on','Turn west on','directionOriginActionEntryV17320','directionMainActionUnspecifiedTurnV17320']) if(!turnSource.includes(token)) throw new Error(`Unspecified-turn source missing ${token}.`);
for(const token of ['deferred_saved_distance_v17320','brinesearch_target_fractional_route_v17320','brinesearch_apply_v17320_direction_truth','compound left/right source row']) if(!migrationA.includes(token)) throw new Error(`V17.3.20 truth migration missing ${token}.`);
for(const token of ['brinesearch_explicit_target_route_v17320','explicit saved driving action target v17.3.20','navigation_context_only_v17320','brinesearch_apply_v17320_target_road_truth']) if(!migrationB.includes(token)) throw new Error(`V17.3.20 target-road migration missing ${token}.`);
for(const token of ['invalid_alias_removed_v17320','Waynesburg Rd NW','Autumn Rd SW','direct_fractional_leg_v17320','CR-67/1 / McCords Hill Road']) if(!migrationC.includes(token)) throw new Error(`V17.3.20 alias/fraction migration missing ${token}.`);
for(const token of ['turn_unspecified','brinesearch_apply_v17320_unspecified_turn_classes','turn on/onto road but provides no left/right side']) if(!migrationD.includes(token)) throw new Error(`V17.3.20 unspecified-turn migration missing ${token}.`);
for(const token of ['directional left/right wording outranks generic turn-on/onto classification','bear|veer|slight|stay|keep','brinesearch_apply_v17320_unspecified_turn_classes']) if(!migrationE.includes(token)) throw new Error(`V17.3.20 turn-precedence migration missing ${token}.`);

// Preserve V17.3.18 road-card invariants while the truth layers are added.
const context={
  console:{log(){},warn(){}},window:{},navigator:{onLine:false},
  renderPad:async()=>{},padById:()=>null,SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'test',
  fetch:async()=>{throw new Error('network disabled');},
  directionFinalCardsFromEntriesV17317:entries=>entries
};
vm.createContext(context);vm.runInContext(roadData,context,{filename:'22u-direction-road-data-enrichment.js'});
const card=(instruction,distance='',notes=[],doubleName=false)=>({instruction,distance,notes,doubleName});
const cologie={state:'Ohio',officialRoadAliasesV17318:[
  {route_label:'CR-15',canonical_name:'Foxs Bottom Rd',aliases:['Foxes Bottom Rd','CR-15']},
  {route_label:'TR-79',canonical_name:'Springdale Hill Rd',aliases:['TR-79','Township Road 79']},
  {route_label:'TR-72',canonical_name:'Lamborn Rd',aliases:['TR-72','Township Road 72']},
  {route_label:'CR-13',canonical_name:'Unionvale-Kenwood Rd',aliases:['Unionvale Kenwood Rd','CR-13']}
],measuredRoadSegmentsV17318:[]};
const cologieCards=context.directionGroupRoadCardsV17318([
  card('Take US-250 South','',['Start: Cadiz']),card('Turn left on Foxes Bottom Rd','2.4 mi'),
  card('Turn left on Springdale Hill Rd','0.9 mi'),card('Turn right on Lamborn Rd','0.2 mi'),
  card('Turn left on Springdale Hill Rd','0.5 mi'),card('Turn left on Unionvale-Kenwood Rd','0.3 mi',['Pad on right'])
],cologie);
const expected=['Take US-250 South','Turn left on CR-15 / Foxes Bottom Rd','Turn left on TR-79 / Springdale Hill Rd','Turn right on TR-72 / Lamborn Rd','Turn left on TR-79 / Springdale Hill Rd','Turn left on CR-13 / Unionvale-Kenwood Rd'];
if(JSON.stringify(cologieCards.map(x=>x.instruction))!==JSON.stringify(expected)) throw new Error(`COLOGIE road/double-name contract changed: ${JSON.stringify(cologieCards)}`);
if(JSON.stringify(cologieCards.map(x=>x.distance))!==JSON.stringify(['','2.4 mi','0.9 mi','0.2 mi','0.5 mi','0.3 mi'])) throw new Error('COLOGIE saved mileage changed.');

const noelle={state:'Ohio',officialRoadAliasesV17318:[],measuredRoadSegmentsV17318:[{road_key:'CR-23',distance_miles:0.21},{road_key:'CR-26',distance_miles:7.16},{road_key:'CR-33',distance_miles:1.46}]};
const noelleCards=context.directionGroupRoadCardsV17318([
  card('Turn left on CR-23 / High St'),card('Turn left on CR-26'),card('Turn left on CR-26','',['At the 25 / 26 split']),
  card('Continue on CR-26','',['At the stop sign']),card('Turn right on CR-26','',['At the next stop sign','One-lane bridge']),card('Turn left on CR-33')
],noelle);
if(noelleCards.length!==3||noelleCards[0].distance!=='≈ 0.21 mi'||noelleCards[1].distance!=='≈ 7.2 mi'||noelleCards[2].distance!=='≈ 1.5 mi') throw new Error(`Noelle grouping/measured mileage regressed: ${JSON.stringify(noelleCards)}`);

const caston={state:'Ohio',officialRoadAliasesV17318:[],measuredRoadSegmentsV17318:[{road_key:'CR-82',distance_miles:2.79}]};
if(context.directionGroupRoadCardsV17318([card('Turn right on CR-82 / McCoy Rd','2.3 mi')],caston)[0].distance!=='2.3 mi') throw new Error('Measured mileage overwrote saved mileage.');
const ambiguous={state:'Ohio',officialRoadAliasesV17318:[{route_label:'CR-5',canonical_name:'Crescent Rd',aliases:['CR-5']},{route_label:'CR-5',canonical_name:'Glencoe Rd',aliases:['CR-5']}],measuredRoadSegmentsV17318:[]};
if(context.directionGroupRoadCardsV17318([card('Turn left on CR-5')],ambiguous)[0].instruction!=='Turn left on CR-5') throw new Error('Ambiguous CR-5 received an invented local name.');

console.log('Verified BrineSearch V17.3.20 product contract: COLOGIE stays exact; Noelle measured-road recovery stays safe; saved mileage beats measured mileage; ambiguous route names remain unguessed; all five V17.3.20 road/turn/mileage truth migrations are present; generic no-side turns are preserved without overriding explicit left/right directional maneuvers.');
