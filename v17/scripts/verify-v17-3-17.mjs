import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');
const required = (source, token, label) => {
  if (!source.includes(token)) throw new Error(`${label} is missing ${token}`);
};

const [packageText, partText, styleText, mileageSource, conciseSource, pairSafetySource, css, app, sw] = await Promise.all([
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'src/parts/22o-direction-mileage-badges-double-name.js')),
  read(path.join(v17Root, 'src/parts/22p-direction-concise-driver-cards.js')),
  read(path.join(v17Root, 'src/parts/22q-direction-road-pair-safety.js')),
  read(path.join(v17Root, 'public/styles/app.css')),
  read(path.join(v17Root, 'public/app/brinesearch-app.js')),
  read(path.join(v17Root, 'public/sw.js'))
]);

const pkg = JSON.parse(packageText);
const parts = JSON.parse(partText);
const styles = JSON.parse(styleText);
if (pkg.version !== '17.3.17') throw new Error(`Package version ${pkg.version} is not 17.3.17.`);
if (parts.version !== '17.3.17') throw new Error(`Part manifest version ${parts.version} is not 17.3.17.`);
if (styles.version !== '17.3.17') throw new Error(`Style manifest version ${styles.version} is not 17.3.17.`);

const o = parts.parts.indexOf('22o-direction-mileage-badges-double-name.js');
const p = parts.parts.indexOf('22p-direction-concise-driver-cards.js');
const q = parts.parts.indexOf('22q-direction-road-pair-safety.js');
const startup = parts.parts.indexOf('18-account-theme-startup.js');
if (o < 0 || p <= o || q <= p || startup <= q) throw new Error('V17.3.17 direction layers are not ordered correctly before startup.');

for (const token of ['directionDistanceBadgeFromSentenceV17317','directionSavedDistanceFromIntelV17317','directionExplicitDoubleNameV17317']) required(mileageSource, token, 'Mileage layer');
for (const token of ['directionConciseMetaV17317','directionSplitLeadingContextV17317','directionContextNoteV17317','direction-written-distance-v17317']) required(conciseSource, token, 'Concise-card layer');
for (const token of ['directionNormalizeRoadPairSafeV17317','route concurrency']) required(pairSafetySource, token, 'Route-pair safety layer');
required(css, '.direction-written-row-v17317', 'V17.3.17 CSS');
required(css, '.direction-written-distance-v17317', 'V17.3.17 CSS');
required(sw, 'brinesearch-v17-3-17-concise-mileage-cards', 'V17.3.17 cache');
for (const token of ['directionConciseMetaV17317','directionNormalizeRoadPairSafeV17317']) required(app, token, 'Assembled app');
if (conciseSource.includes('street-sign-board') || conciseSource.includes('direction-highway-badge')) throw new Error('Concise cards must not create sign graphics.');
if (conciseSource.includes('DOUBLE NAME') || mileageSource.includes('>DOUBLE NAME<')) throw new Error('Double-name roads must be shown inline, not with a separate label.');
new vm.Script(app, { filename:'brinesearch-app.js' });
new vm.Script(sw, { filename:'sw.js' });

const compactSentence = value => String(value || '')
  .replace(/\bonto\b/gi, 'on')
  .replace(/\.\s*Continue\s+(about\s+|approximately\s+|approx\.?\s+|roughly\s+)?(\d+(?:\.\d+)?|\.\d+)\s*(miles?|mile|mi)\b/ig, (_, qualifier, amount) => ` for ${qualifier ? 'about ' : ''}${amount} mi`)
  .replace(/\s{2,}/g, ' ')
  .trim();

const context = {
  console:{ log(){}, warn(){} },
  window:{},
  esc:value => String(value ?? ''),
  directionWrittenCleanV17315:value => String(value || '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim(),
  directionStepCleanV17316:value => String(value || '').replace(/\s{2,}/g, ' ').trim(),
  directionWrittenSentenceV17315:compactSentence,
  directionGlobalWrittenEntriesV17315:value => value,
  directionGlobalWrittenPrimaryHtmlV17315:() => '',
};
vm.createContext(context);
vm.runInContext(mileageSource, context, { filename:'22o-direction-mileage-badges-double-name.js' });
vm.runInContext(conciseSource, context, { filename:'22p-direction-concise-driver-cards.js' });
vm.runInContext(pairSafetySource, context, { filename:'22q-direction-road-pair-safety.js' });

const pad = rows => ({ directionRoadIntelligence:rows });
const intel = (step_order, maneuver_class, primary_road, local_road_name, distance_label, instruction, extra={}) => ({
  step_order, maneuver_class, primary_road, local_road_name, display_road:local_road_name ? `${primary_road} / ${local_road_name}` : primary_road,
  distance_label:distance_label || null,
  distance_source:distance_label ? 'saved_direction' : null,
  distance_confidence:distance_label ? 1 : null,
  suspicious_distance:false,
  evidence:{ instruction, ...extra }
});
const entry = (sourceStepOrder, instruction, notes=[]) => ({ sourceStepOrder, instruction, notes });

const cologiePad = pad([
  intel(1,'continue','US-250',null,null,'From Cadiz, take US-250 south.'),
  intel(2,'turn_left',null,null,'2.4 mi','Turn left onto Foxes Bottom Rd. Continue 2.4 miles.'),
  intel(3,'turn_left',null,null,'0.9 mi','Turn left onto Springdale Hill Rd. Continue 0.9 miles.'),
  intel(4,'turn_right',null,null,'0.2 mi','Turn right onto Lamborn Rd. Continue 0.2 miles.'),
  intel(5,'turn_left',null,null,'0.5 mi','Turn left onto Springdale Hill Rd. Continue 0.5 miles.'),
  intel(6,'turn_left',null,null,'0.3 mi','Turn left onto Unionvale-Kenwood Rd. Continue 0.3 miles; the pad is on the right.')
]);
const cologie = [
  entry(1,'From Cadiz, take US-250 south.'),
  entry(2,'Turn left onto Foxes Bottom Rd. Continue 2.4 miles.'),
  entry(3,'Turn left onto Springdale Hill Rd. Continue 0.9 miles.'),
  entry(4,'Turn right onto Lamborn Rd. Continue 0.2 miles.'),
  entry(5,'Turn left onto Springdale Hill Rd. Continue 0.5 miles.'),
  entry(6,'Turn left onto Unionvale-Kenwood Rd. Continue 0.3 miles; the pad is on the right.')
].map(row => context.directionConciseMetaV17317(row, cologiePad));

const expectedMain = [
  'Take US-250 South',
  'Turn left on Foxes Bottom Rd',
  'Turn left on Springdale Hill Rd',
  'Turn right on Lamborn Rd',
  'Turn left on Springdale Hill Rd',
  'Turn left on Unionvale-Kenwood Rd'
];
const expectedDistance = ['', '2.4 mi', '0.9 mi', '0.2 mi', '0.5 mi', '0.3 mi'];
if (JSON.stringify(cologie.map(row => row.instruction)) !== JSON.stringify(expectedMain)) throw new Error(`COLOGIE main-line fixture mismatch: ${JSON.stringify(cologie)}`);
if (JSON.stringify(cologie.map(row => row.distance)) !== JSON.stringify(expectedDistance)) throw new Error(`COLOGIE mileage fixture mismatch: ${JSON.stringify(cologie)}`);
if (!cologie[0].notes.some(note => /Start: Cadiz/i.test(note))) throw new Error('COLOGIE start location did not move to a note.');
if (!cologie[5].notes.some(note => /Pad on right/i.test(note))) throw new Error('COLOGIE arrival side did not move to a note.');

const noellePad = pad([
  intel(2,'turn_left','CR-23','High St',null,'Turn left onto CR-23 / High St.'),
  intel(3,'turn_left','CR-26','Lincoln Ave',null,'Turn left onto CR-26.',{ dual_name_source:'ODOT official road catalog' }),
  intel(4,'turn_left','CR-26','Lincoln Ave',null,'At the 25 / 26 split, turn left and continue on CR-26.',{ dual_name_source:'ODOT official road catalog' })
]);
const noelleDouble = context.directionConciseMetaV17317(entry(2,'Turn left onto CR-23 / High St.'), noellePad);
if (noelleDouble.instruction !== 'Turn left on CR-23 / High St' || !noelleDouble.doubleName) throw new Error(`Explicit county-road double name was not preserved: ${JSON.stringify(noelleDouble)}`);
const noelleCatalogOnly = context.directionConciseMetaV17317(entry(3,'Turn left onto CR-26.'), noellePad);
if (noelleCatalogOnly.instruction !== 'Turn left on CR-26' || /Lincoln Ave/i.test(noelleCatalogOnly.instruction)) throw new Error(`Catalog-only alias leaked into Noelle: ${JSON.stringify(noelleCatalogOnly)}`);
const split = context.directionConciseMetaV17317(entry(4,'At the 25 / 26 split, turn left and continue on CR-26.'), noellePad);
if (split.instruction !== 'Turn left on CR-26' || !split.notes.some(note => /25 \/ 26 split/i.test(note))) throw new Error(`Decision context did not move under the main line: ${JSON.stringify(split)}`);

const concurrencyPad = pad([intel(1,'turn_right','OH-147','',null,'Turn right onto OH-147 / OH-149.')]);
const concurrency = context.directionConciseMetaV17317(entry(1,'Turn right onto OH-147 / OH-149.'), concurrencyPad);
if (concurrency.instruction !== 'Turn right on OH-147 / OH-149' || concurrency.doubleName) throw new Error(`Route concurrency was mistaken for a double name: ${JSON.stringify(concurrency)}`);

const sharedPad = pad([intel(1,'turn_right','CR-59','Bacon Ridge Rd','3.3 mi','Turn right onto CR-59 / Bacon Ridge Rd. Continue 3.3 miles.',{ dual_name_source:'shared_saved_directions', dual_name_support:2 })]);
const shared = context.directionConciseMetaV17317(entry(1,'Turn right onto CR-59 / Bacon Ridge Rd. Continue 3.3 miles.'), sharedPad);
if (shared.instruction !== 'Turn right on CR-59 / Bacon Ridge Rd' || shared.distance !== '3.3 mi' || !shared.doubleName) throw new Error(`Strong saved double-name fixture failed: ${JSON.stringify(shared)}`);

console.log('Verified BrineSearch V17.3.17: every tested card uses maneuver + road as the main line, saved mileage is a right-side badge, extra context moves below as notes, explicit road/CR-TR-state double names stay inline, route concurrencies are preserved without being called double names, and no road-sign graphics are created.');
