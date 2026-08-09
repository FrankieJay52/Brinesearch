import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');
const requireText = (source, token, label) => {
  if (!source.includes(token)) throw new Error(`${label} is missing ${token}`);
};

const [packageText, partText, styleText, sourcePriority, contextCoalescing, app, sw] = await Promise.all([
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'src/parts/22m-direction-source-priority-and-coalescer.js')),
  read(path.join(v17Root, 'src/parts/22n-direction-context-coalescing.js')),
  read(path.join(v17Root, 'public/app/brinesearch-app.js')),
  read(path.join(v17Root, 'public/sw.js'))
]);

const packageJson = JSON.parse(packageText);
const parts = JSON.parse(partText);
const styles = JSON.parse(styleText);
if (packageJson.version !== '17.3.16') throw new Error(`Package version is ${packageJson.version}, expected 17.3.16.`);
if (parts.version !== '17.3.16') throw new Error(`Part manifest version is ${parts.version}, expected 17.3.16.`);
if (styles.version !== '17.3.16') throw new Error(`Style manifest version is ${styles.version}, expected 17.3.16.`);

const sourceIndex = parts.parts.indexOf('22m-direction-source-priority-and-coalescer.js');
const contextIndex = parts.parts.indexOf('22n-direction-context-coalescing.js');
const roadManagerIndex = parts.parts.indexOf('21-road-manager-live-fixes.js');
const startupIndex = parts.parts.indexOf('18-account-theme-startup.js');
if (sourceIndex < 0) throw new Error('V17.3.16 source-priority part is not assembled.');
if (contextIndex < 0) throw new Error('V17.3.16 context coalescer is not assembled.');
if (sourceIndex <= roadManagerIndex) throw new Error('V17.3.16 render wrapper must load after later renderPad wrappers.');
if (contextIndex <= sourceIndex) throw new Error('V17.3.16 context coalescer must load after the base coalescer.');
if (startupIndex < 0 || contextIndex >= startupIndex) throw new Error('V17.3.16 direction layers must load before startup/router binding.');

for (const token of [
  'directionCoalesceEntriesV17316',
  'directionStepHardFragmentV17316',
  'directionStepShortOriginV17316',
  'directionHydrateSelectedLiveClearV17316',
  'directionRefreshAllLiveClearV17316',
  '__brineLiveClearDirectionsReadyV17316',
  'public_pad_detail',
  'DATA_SOURCE_LABEL being "Live database"'
]) requireText(sourcePriority, token, 'V17.3.16 source-priority layer');
for (const token of [
  'directionApproachContextV17316',
  'directionArrivalSentenceV17316',
  'directionTransientContinuationV17316',
  'directionCoalesceEntriesContextV17316'
]) requireText(contextCoalescing, token, 'V17.3.16 context coalescer');

for (const token of [
  'directionGlobalWrittenEntriesV17315',
  'directionWrittenHasExplicitReverseAliasV17315',
  'directionWrittenDropStartContextRouteFixV17315',
  'directionCoalesceEntriesV17316',
  'directionCoalesceEntriesContextV17316',
  'directionHydrateSelectedLiveClearV17316',
  'brinesearch_driver_route_reference',
  'fieldWellCardsV17311'
]) requireText(app, token, 'Assembled BrineSearch app');

requireText(sw, 'brinesearch-v17-3-16-direction-source-priority', 'V17.3.16 service worker cache');
requireText(sw, 'networkFirstAppAsset', 'Service-worker live asset strategy');
new vm.Script(app, { filename:'brinesearch-app.js' });
new vm.Script(sw, { filename:'sw.js' });

const context = {
  console:{ log(){}, warn(){} },
  directionGlobalWrittenEntriesV17315:value => value,
  directionWrittenSentenceV17315:value => String(value || '').trim(),
  navigator:{ onLine:false },
  window:{},
  renderPad:async () => {},
  padById:() => null,
  pads:[],
  SUPABASE_URL:'https://example.invalid',
  SUPABASE_PUBLISHABLE_KEY:'test',
  fetch:async () => { throw new Error('network disabled in product test'); },
  URL,
  AbortController,
  setTimeout,
  clearTimeout
};
vm.createContext(context);
vm.runInContext(sourcePriority, context, { filename:'22m-direction-source-priority-and-coalescer.js' });
vm.runInContext(contextCoalescing, context, { filename:'22n-direction-context-coalescing.js' });

const orphan = value => context.directionStepHardFragmentV17316(value)
  || context.directionStepShortOriginV17316(value)
  || /^Exit\.?$/i.test(String(value || '').trim())
  || context.directionStepArrivalTokenV17316(value);

const noelleFixture = [
  'From 22, Take Bloomingdale.',
  'Exit.',
  'Go into Bloomingdale.',
  'Turn left on county Road 23/high street Then.',
  'Turn left on county Road 26.',
  'Follow cty Road 26 to the 25/26 split.',
  'Turn left and.',
  'Continue on 26.',
  'Follow 26 through fernwood forest, to the stop sign.',
  'Turn left continue on county Road 26.',
  'Pass fernwood forest HQ/Ranger station down the hill to one lane bridge At stop sign.',
  'Turn right continue on 26 At the top of the next hill.',
  'Turn left on county road 33.',
  'Continue on passed Jefferson county air park.',
  'Lease road enterance on left.'
].map((instruction, index) => ({ instruction, notes:[], sourceStepOrder:index + 1 }));
const noelle = context.directionCoalesceEntriesV17316(noelleFixture);
if (noelle.length > 9) throw new Error(`Noelle screenshot fixture still produces ${noelle.length} cards: ${JSON.stringify(noelle.map(entry => entry.instruction))}`);
if (noelle.some(entry => orphan(entry.instruction))) throw new Error(`Noelle screenshot fixture still contains a fragment: ${JSON.stringify(noelle)}`);
if (!/\bexit\b/i.test(noelle[0]?.instruction || '')) throw new Error(`Noelle exit fragments were not reassembled: ${noelle[0]?.instruction}`);
if (noelle.some(entry => /^Go into Bloomingdale\.?$/i.test(entry.instruction))) throw new Error('Noelle still renders Go into Bloomingdale as its own card.');
if (noelle.some(entry => /Jefferson county air park/i.test(entry.instruction))) throw new Error('Noelle still renders the air-park landmark as its own card.');
if (!noelle.some(entry => /lease road enterance on left/i.test(entry.instruction))) throw new Error('Noelle arrival was lost during context coalescing.');

const turnPieces = context.directionCoalesceEntriesV17316([
  { instruction:'Turn', notes:[], sourceStepOrder:1 },
  { instruction:'right onto CR-10A and', notes:[], sourceStepOrder:2 },
  { instruction:'continue 1.2 miles', notes:[], sourceStepOrder:3 }
]);
if (turnPieces.length !== 1 || !/^Turn right onto CR-10A and continue 1\.2 miles/i.test(turnPieces[0]?.instruction || '')) {
  throw new Error(`Three-piece turn did not coalesce safely: ${JSON.stringify(turnPieces)}`);
}

const origin = context.directionCoalesceEntriesV17316([
  { instruction:'From I-70', notes:[], sourceStepOrder:1 },
  { instruction:'Take exit 216 for OH-9', notes:[], sourceStepOrder:2 }
]);
if (origin.length !== 1 || !/^Take exit 216/i.test(origin[0]?.instruction || '')) throw new Error(`Short origin remained a fake card: ${JSON.stringify(origin)}`);

const arrival = context.directionCoalesceEntriesV17316([
  { instruction:'Follow signs to', notes:[], sourceStepOrder:1 },
  { instruction:'pad', notes:[], sourceStepOrder:2 }
]);
if (arrival.length !== 1 || !/pad/i.test(arrival[0]?.instruction || '') || arrival.some(entry => /^Pad\.?$/i.test(entry.instruction))) {
  throw new Error(`Bare pad arrival was not repaired: ${JSON.stringify(arrival)}`);
}

const approach = context.directionCoalesceEntriesV17316([
  { instruction:'Follow CR-26 to the 25/26 split.', notes:[], sourceStepOrder:1 },
  { instruction:'Turn left and continue on CR-26.', notes:[], sourceStepOrder:2 }
]);
if (approach.length !== 1 || !/split, then turn left/i.test(approach[0]?.instruction || '')) throw new Error(`Approach-to-turn context stayed split: ${JSON.stringify(approach)}`);

const landmarkArrival = context.directionCoalesceEntriesV17316([
  { instruction:'Continue on passed Jefferson county air park.', notes:[], sourceStepOrder:1 },
  { instruction:'Lease road entrance on left.', notes:[], sourceStepOrder:2 }
]);
if (landmarkArrival.length !== 1 || /air park/i.test(landmarkArrival[0]?.instruction || '') || !/lease road entrance on left/i.test(landmarkArrival[0]?.instruction || '')) {
  throw new Error(`Transient landmark did not collapse into arrival: ${JSON.stringify(landmarkArrival)}`);
}

const doubleNames = context.directionCoalesceEntriesV17316([
  { instruction:'Turn right on OH-151 / Mill St for 0.2 mi.', notes:[], sourceStepOrder:1 },
  { instruction:'Turn left on Fernwood-Bloomingdale Rd / CR-26.', notes:[], sourceStepOrder:2 },
  { instruction:'Turn right on Township Hwy 141 / TR-141 for 0.7 mi.', notes:[], sourceStepOrder:3 }
]);
if (!doubleNames[0]?.instruction.includes('OH-151 / Mill St')) throw new Error('State-route double name was damaged.');
if (!doubleNames[1]?.instruction.includes('Fernwood-Bloomingdale Rd / CR-26')) throw new Error('County-road reverse double name was damaged.');
if (!doubleNames[2]?.instruction.includes('Township Hwy 141 / TR-141')) throw new Error('Township-road double name was damaged.');

console.log(`Verified BrineSearch V17.3.16: source-priority wrapper is ordered before startup, selected pads hydrate live Clear Directions independently of the startup fallback, the complete Noelle fragment pattern collapses to nine-or-fewer driver cards, approach/arrival context does not create fake extra steps, obvious orphan fragments are suppressed, and state/county/township double names remain intact.`);