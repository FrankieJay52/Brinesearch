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

const [packageText, partText, styleText, fragmentSource, app, sw] = await Promise.all([
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'src/parts/22h-direction-fragment-reassembly.js')),
  read(path.join(v17Root, 'public/app/brinesearch-app.js')),
  read(path.join(v17Root, 'public/sw.js'))
]);

const packageJson = JSON.parse(packageText);
const parts = JSON.parse(partText);
const styles = JSON.parse(styleText);
if (packageJson.version !== '17.3.13') throw new Error(`Package version is ${packageJson.version}, expected 17.3.13.`);
if (parts.version !== '17.3.13') throw new Error(`Part manifest version is ${parts.version}, expected 17.3.13.`);
if (styles.version !== '17.3.13') throw new Error(`Style manifest version is ${styles.version}, expected 17.3.13.`);
if (!parts.parts.includes('22h-direction-fragment-reassembly.js')) throw new Error('V17.3.13 fragment reassembly part is not assembled.');

for (const token of [
  'directionReassembleStepEntriesV17313',
  'directionContextOnlyV17313',
  'directionFragmentNeedsTargetV17313',
  'directionFalseRoadTargetV17313',
  'fragmentReassembled:true',
  'disableRoadIntel:true'
]) requireText(fragmentSource, token, 'V17.3.13 direction fragment cleanup');

for (const token of [
  'directionRewriteAddsMileageV17312',
  'directionSavedMileageSourceV17312',
  '__brineLiveClearDirectionsAuthoritative',
  'directionClearPolishedStepsV1732',
  'directionGenericRouteLabelV17312',
  'directionInlineDualRoadV17312',
  'directionReassembleStepEntriesV17313',
  'directionFalseRoadTargetV17313',
  'brinesearch_driver_route_reference',
  'fieldWellCardsV17311'
]) requireText(app, token, 'Assembled BrineSearch app');

requireText(sw, 'networkFirstAppAsset', 'Service-worker live asset strategy');
new vm.Script(app, { filename:'brinesearch-app.js' });
new vm.Script(sw, { filename:'sw.js' });

const context = {
  console,
  directionClearDistanceV1732: () => '',
  directionClearPolishedStepsV1732: value => value,
  directionClearRoadTextV1732: instruction => /Adams/i.test(String(instruction || ''))
    ? { kind:'road', text:'to Adams Rd' }
    : { kind:'road', text:'to stop sign in Deersville' },
  directionActionableRoadV17312: value => /\b(?:Rd|Road|St|Street|Ave|Avenue|Ln|Lane|Dr|Drive|Pike|Hwy|Highway)\b/i.test(String(value || '')),
  normalizeRoadName: value => ({ text:String(value || '').replace(/\s{2,}/g, ' ').trim() })
};
vm.createContext(context);
vm.runInContext(fragmentSource, context, { filename:'22h-direction-fragment-reassembly.js' });

const fixture = [
  { instruction:'From US-250 take Deersville Rd', notes:[], sourceStepOrder:1 },
  { instruction:'Follow to stop sign in Deersville', notes:[], sourceStepOrder:2 },
  { instruction:'As you leave Deersville', notes:[], sourceStepOrder:3 },
  { instruction:'turn', notes:[], sourceStepOrder:4 },
  { instruction:'Turn left Adams Rd', notes:[], sourceStepOrder:5 },
  { instruction:'Follow to stop sign', notes:[], sourceStepOrder:6 },
  { instruction:'Follow to', notes:[], sourceStepOrder:7 },
  { instruction:'Access Road', notes:[], sourceStepOrder:8 }
];
const cleaned = context.directionReassembleStepEntriesV17313(fixture);
if (cleaned.length !== 5) throw new Error(`Direction fragment fixture produced ${cleaned.length} cards instead of 5.`);
if (cleaned.some(step => /^(?:turn|As you leave Deersville)$/i.test(step.instruction))) throw new Error('Standalone direction fragments survived reassembly.');
if (cleaned[2]?.instruction !== 'Turn left Adams Rd') throw new Error(`Turn step was not preserved correctly: ${cleaned[2]?.instruction}`);
if (!(cleaned[2]?.notes || []).includes('As you leave Deersville')) throw new Error('Deersville context was not attached to the turn step.');
if (cleaned[4]?.instruction !== 'Follow to Access Road') throw new Error(`Access fragments were not reassembled: ${cleaned[4]?.instruction}`);
if (!cleaned[4]?.fragmentReassembled || !cleaned[4]?.disableRoadIntel) throw new Error('Reassembled cross-step direction is missing its safety flags.');

const falseRoad = context.directionClearRoadTextV1732('Follow to stop sign in Deersville', {});
if (falseRoad?.text) throw new Error(`Stop-sign destination still renders as a road: ${falseRoad.text}`);
const realRoad = context.directionClearRoadTextV1732('Follow to Adams Rd', {});
if (realRoad?.text !== 'Adams Rd') throw new Error(`Real target road was not normalized correctly: ${realRoad?.text}`);

console.log('Verified BrineSearch V17.3.13 product layer: direction fragments reassemble into driver-sized cards, stop-sign destinations cannot render as roads, real road targets remain signs, and existing mileage/road/well safety layers are still assembled.');
