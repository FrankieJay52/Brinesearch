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

const [packageText, partText, styleText, prototypeSource, app, sw] = await Promise.all([
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'src/parts/22i-lee-written-step-prototype.js')),
  read(path.join(v17Root, 'public/app/brinesearch-app.js')),
  read(path.join(v17Root, 'public/sw.js'))
]);

const packageJson = JSON.parse(packageText);
const parts = JSON.parse(partText);
const styles = JSON.parse(styleText);
if (packageJson.version !== '17.3.14') throw new Error(`Package version is ${packageJson.version}, expected 17.3.14.`);
if (parts.version !== '17.3.14') throw new Error(`Part manifest version is ${parts.version}, expected 17.3.14.`);
if (styles.version !== '17.3.14') throw new Error(`Style manifest version is ${styles.version}, expected 17.3.14.`);
if (!parts.parts.includes('22i-lee-written-step-prototype.js')) throw new Error('LEE written-step prototype is not assembled.');

for (const token of [
  'directionLeeWrittenPrototypeV17314',
  'directionLeeWrittenSentenceV17314',
  'directionLeeWrittenStepsV17314',
  'ascent--lee',
  'direction-written-step-prototype'
]) requireText(prototypeSource, token, 'V17.3.14 LEE prototype');

for (const token of [
  'directionReassembleStepEntriesV17313',
  'directionLeeWrittenPrototypeV17314',
  'directionLeeWrittenSentenceV17314',
  'brinesearch_driver_route_reference',
  'fieldWellCardsV17311'
]) requireText(app, token, 'Assembled BrineSearch app');

requireText(sw, 'networkFirstAppAsset', 'Service-worker live asset strategy');
new vm.Script(app, { filename:'brinesearch-app.js' });
new vm.Script(sw, { filename:'sw.js' });

const context = {
  normalize: value => String(value ?? '').trim(),
  directionClearSectionsV1732: value => value,
  directionClearPrimaryHtmlV1732: () => 'old-primary',
  directionClearDisplayHtmlV1732: () => 'old-display',
  esc: value => String(value ?? '')
};
vm.createContext(context);
vm.runInContext(prototypeSource, context, { filename:'22i-lee-written-step-prototype.js' });

if (!context.directionLeeWrittenPrototypeV17314({ _id:'ascent--lee' })) throw new Error('LEE is not selected by the prototype guard.');
if (context.directionLeeWrittenPrototypeV17314({ _id:'ascent--noelle' })) throw new Error('Prototype guard leaked to a non-LEE pad.');

const fixture = {
  reference:'US-250 S → Lansing Cheermont Rd / CR-18 → Blaine Cheermont Rd / CR-20 → Access Road',
  steps:[
    'From Colerain, head south on US-250. Continue 1.1 miles.',
    'Turn right onto Lansing Cheermont Rd / CR-18. Continue 1.6 miles.',
    'Veer right onto Blaine Cheermont Rd / CR-20. Continue 0.15 mile.',
    'The access road is on the right.'
  ]
};
const cleaned = context.directionLeeWrittenStepsV17314(fixture);
const expected = [
  'Head south on US-250 for 1.1 mi.',
  'Turn right on Lansing Cheermont Rd for 1.6 mi.',
  'Veer right on Blaine Cheermont Rd for 0.15 mi.',
  'Access road is on the right.'
];
if (JSON.stringify(cleaned) !== JSON.stringify(expected)) {
  throw new Error(`LEE written-step fixture mismatch: ${JSON.stringify(cleaned)}`);
}

console.log('Verified BrineSearch V17.3.14 prototype: only Ascent LEE uses four simple written direction cards, signs/alternate structured rendering are suppressed on LEE only, and all other pads retain the existing renderer.');
