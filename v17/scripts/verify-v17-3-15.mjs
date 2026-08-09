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

const [packageText, partText, styleText, globalSource, aliasSafetySource, app, sw] = await Promise.all([
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'src/parts/22j-global-written-directions.js')),
  read(path.join(v17Root, 'src/parts/22k-global-written-alias-safety.js')),
  read(path.join(v17Root, 'public/app/brinesearch-app.js')),
  read(path.join(v17Root, 'public/sw.js'))
]);

const packageJson = JSON.parse(packageText);
const parts = JSON.parse(partText);
const styles = JSON.parse(styleText);
if (packageJson.version !== '17.3.15') throw new Error(`Package version is ${packageJson.version}, expected 17.3.15.`);
if (parts.version !== '17.3.15') throw new Error(`Part manifest version is ${parts.version}, expected 17.3.15.`);
if (styles.version !== '17.3.15') throw new Error(`Style manifest version is ${styles.version}, expected 17.3.15.`);
const prototypeIndex = parts.parts.indexOf('22i-lee-written-step-prototype.js');
const globalIndex = parts.parts.indexOf('22j-global-written-directions.js');
const aliasSafetyIndex = parts.parts.indexOf('22k-global-written-alias-safety.js');
if (globalIndex < 0) throw new Error('Global written direction renderer is not assembled.');
if (aliasSafetyIndex < 0) throw new Error('Global reverse-order alias safety is not assembled.');
if (globalIndex <= prototypeIndex) throw new Error('Global renderer must load after the approved LEE prototype.');
if (aliasSafetyIndex <= globalIndex) throw new Error('Reverse-order alias safety must load after the global renderer.');

for (const token of [
  'directionGlobalWrittenEntriesV17315',
  'directionGlobalWrittenPrimaryHtmlV17315',
  'directionWrittenSentenceV17315',
  'directionWrittenStrongSharedAliasV17315',
  'direction-written-global',
  'ROUTE SEQUENCE ONLY',
  'Turn-by-turn directions are not verified for this pad yet.'
]) requireText(globalSource, token, 'V17.3.15 global written directions');
for (const token of [
  'directionWrittenHasExplicitReverseAliasV17315',
  'directionWrittenStrongSharedAliasReverseSafeV17315',
  'Fernwood-Bloomingdale Rd / CR-26'
]) requireText(aliasSafetySource, token, 'V17.3.15 reverse dual-name safety');

if (globalSource.includes('directionClearSignForRoadV1733(') || globalSource.includes('direction-highway-badge') || globalSource.includes('street-sign-board')) {
  throw new Error('V17.3.15 global written renderer must not create road/highway sign graphics.');
}

for (const token of [
  'directionRewriteAddsMileageV17312',
  'directionSavedMileageSourceV17312',
  '__brineLiveClearDirectionsAuthoritative',
  'directionSanitizeInstructionV1738',
  'directionReassembleStepEntriesV17313',
  'directionInlineDualRoadV17312',
  'directionGlobalWrittenEntriesV17315',
  'directionWrittenStrongSharedAliasV17315',
  'directionWrittenHasExplicitReverseAliasV17315',
  'brinesearch_driver_route_reference',
  'fieldWellCardsV17311'
]) requireText(app, token, 'Assembled BrineSearch app');

requireText(sw, 'brinesearch-v17-3-15-global-written-directions', 'V17.3.15 service worker cache');
requireText(sw, 'networkFirstAppAsset', 'Service-worker live asset strategy');
new vm.Script(app, { filename:'brinesearch-app.js' });
new vm.Script(sw, { filename:'sw.js' });

const context = {
  console,
  directionClearNoteOnlyV1732: value => /^(?:Warning|Note|Gate code)/i.test(String(value || '')),
  directionSanitizeInstructionV1738: value => String(value || '').replace(/\s{2,}/g, ' ').trim(),
  directionSanitizeReferenceV1738: value => String(value || '').trim(),
  directionClearSectionsV1732: value => value,
  directionReassembleStepEntriesV17313: entries => entries,
  directionClearDistanceOnlyV1732: () => false,
  directionClearPrimaryHtmlV1732: () => 'old-primary',
  directionClearDisplayHtmlV1732: () => 'old-display',
  fieldRoadStepsHtml: () => 'old-road-steps',
  directionSequenceSummary: value => String(value || ''),
  esc: value => String(value ?? '')
};
vm.createContext(context);
vm.runInContext(globalSource, context, { filename:'22j-global-written-directions.js' });
vm.runInContext(aliasSafetySource, context, { filename:'22k-global-written-alias-safety.js' });

const lee = [
  'From Colerain, head south on US-250. Continue 1.1 miles.',
  'Turn right onto Lansing Cheermont Rd / CR-18. Continue 1.6 miles.',
  'Veer right onto Blaine Cheermont Rd / CR-20. Continue 0.15 mile.',
  'The access road is on the right.'
].map((step, index) => context.directionWrittenSentenceV17315(step, { directionRoadIntelligence:[] }, index + 1));
const expectedLee = [
  'Head south on US-250 for 1.1 mi.',
  'Turn right on Lansing Cheermont Rd / CR-18 for 1.6 mi.',
  'Veer right on Blaine Cheermont Rd / CR-20 for 0.15 mi.',
  'Access road is on the right.'
];
if (JSON.stringify(lee) !== JSON.stringify(expectedLee)) throw new Error(`LEE global written fixture mismatch: ${JSON.stringify(lee)}`);

const stateAlias = context.directionWrittenSentenceV17315('Turn right onto OH-151 / Mill St. Continue 0.2 mile.', { directionRoadIntelligence:[] }, 1);
if (stateAlias !== 'Turn right on OH-151 / Mill St for 0.2 mi.') throw new Error(`State-route/local-name pair was not preserved: ${stateAlias}`);
const countyAlias = context.directionWrittenSentenceV17315('Turn right onto CR-24 / Cow Path Rd. Continue about 0.3 mile.', { directionRoadIntelligence:[] }, 1);
if (countyAlias !== 'Turn right on CR-24 / Cow Path Rd for about 0.3 mi.') throw new Error(`County-road/local-name pair was not preserved: ${countyAlias}`);
const concurrency = context.directionWrittenSentenceV17315('Turn right onto OH-147 / OH-149. Continue 0.2 mile.', { directionRoadIntelligence:[] }, 1);
if (concurrency !== 'Turn right on OH-147 / OH-149 for 0.2 mi.') throw new Error(`State-route concurrency was not preserved: ${concurrency}`);
const reverseStateAlias = context.directionWrittenSentenceV17315('Turn right onto Mill St / OH-151. Continue 0.2 mile.', { directionRoadIntelligence:[] }, 1);
if (reverseStateAlias !== 'Turn right on Mill St / OH-151 for 0.2 mi.') throw new Error(`Reverse state-route/local-name pair was not preserved: ${reverseStateAlias}`);

const strongSharedPad = { directionRoadIntelligence:[{
  step_order:1,
  primary_road:'CR-59',
  local_road_name:'Bacon Ridge Rd',
  evidence:{ dual_name_source:'shared_saved_directions', dual_name_support:2 }
}] };
const sharedAlias = context.directionWrittenSentenceV17315('Turn right onto CR-59. Continue 3.3 miles.', strongSharedPad, 1);
if (sharedAlias !== 'Turn right on CR-59 / Bacon Ridge Rd for 3.3 mi.') throw new Error(`Strong bounded shared alias was not added: ${sharedAlias}`);

const odotOnlyPad = { directionRoadIntelligence:[{
  step_order:1,
  primary_road:'CR-26',
  local_road_name:'Lincoln Ave',
  evidence:{ dual_name_source:'ODOT official road catalog' }
}] };
const odotOnly = context.directionWrittenSentenceV17315('Turn left onto CR-26. Continue 2.3 miles.', odotOnlyPad, 1);
if (odotOnly !== 'Turn left on CR-26 for 2.3 mi.') throw new Error(`Ambiguous catalog-only alias leaked into written step: ${odotOnly}`);

const explicitWinsPad = { directionRoadIntelligence:[{
  step_order:1,
  primary_road:'CR-26',
  local_road_name:'Lincoln Ave',
  evidence:{ dual_name_source:'shared_saved_directions', dual_name_support:5 }
}] };
const explicitWins = context.directionWrittenSentenceV17315('Turn left onto Fernwood-Bloomingdale Rd / CR-26. Continue 2.2 miles.', explicitWinsPad, 1);
if (!explicitWins.includes('Fernwood-Bloomingdale Rd / CR-26') || explicitWins.includes('Lincoln Ave')) throw new Error(`Saved explicit dual name did not win over inferred alias: ${explicitWins}`);

console.log('Verified BrineSearch V17.3.15: every Clear Direction can render as a numbered written sentence with no sign graphics; forward and reverse state/county/township dual names and route concurrencies are preserved; only strongly supported shared aliases may be added; ambiguous catalog-only aliases stay suppressed.');
