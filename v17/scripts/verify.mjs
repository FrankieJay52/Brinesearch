import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
execFileSync(process.execPath, [path.join(scriptDir, 'assemble.mjs')], { stdio: 'inherit' });
const app = await fs.readFile(path.join(v17Root, 'public/app/brinesearch-app.js'), 'utf8');
const css = await fs.readFile(path.join(v17Root, 'public/styles/app.css'), 'utf8');
const fieldMarkCss = await fs.readFile(path.join(v17Root, 'public/styles/field-mark-icons.css'), 'utf8');
const parts = JSON.parse(await fs.readFile(path.join(v17Root, 'src/parts/part-order.json'), 'utf8'));
const styles = JSON.parse(await fs.readFile(path.join(v17Root, 'src/styles/style-order.json'), 'utf8'));
new vm.Script(app, { filename: 'brinesearch-app.js' });
if (sha256(app) !== parts.assembledSha256) throw new Error('Assembled application differs from the ordered source parts.');
if (sha256(css) !== styles.assembledSha256) throw new Error('Assembled CSS differs from the ordered source parts.');
if (fieldMarkCss.includes("url('./icons/")) throw new Error('Field Mark override still contains stylesheet-relative icon URLs.');
for (const requiredIcon of ['/icons/fm-search-inactive.svg','/icons/fm-home-inactive.svg','/icons/fm-feed-inactive.svg','/icons/fm-favorites-inactive.svg','/icons/fm-add-inactive.svg','/icons/fm-offline-inactive.svg']) {
  if (!fieldMarkCss.includes(`url('${requiredIcon}')`)) throw new Error(`Missing absolute Field Mark icon ${requiredIcon}.`);
}
for (const file of ['theme-boot.js','weather-feature.js','root-scroll-guard.js','field-mark-runtime.js']) {
  new vm.Script(await fs.readFile(path.join(v17Root, 'public/app', file), 'utf8'), { filename: file });
}
const directionManifest = JSON.parse(await fs.readFile(path.join(v17Root, 'public/data/directions/index.json'), 'utf8'));
let rewriteCount = 0;
for (const file of directionManifest.files) {
  rewriteCount += Object.keys(JSON.parse(await fs.readFile(path.join(v17Root, 'public/data/directions', file), 'utf8'))).length;
}
if (rewriteCount !== directionManifest.recordCount || rewriteCount < 100) throw new Error('Direction rewrite data did not assemble correctly.');
new vm.Script(await fs.readFile(path.join(v17Root, 'public/sw.js'), 'utf8'), { filename: 'sw.js' });
const index = await fs.readFile(path.join(v17Root, 'index.html'), 'utf8');
for (const required of ['/styles/app.css','/app/brinesearch-app.js','/app/theme-boot.js']) {
  if (!index.includes(required)) throw new Error(`Missing ${required} from V17 index.`);
}
if (/<style(?:\s|>)/i.test(index)) throw new Error('Inline style blocks remain in V17 index.');
if (/<script(?![^>]+src=)/i.test(index)) throw new Error('Inline script blocks remain in V17 index.');
console.log(`Verified V${parts.version}: ${parts.parts.length} JS parts, ${styles.styles.length} CSS parts, ${directionManifest.files.length} direction-data files, absolute Field Mark icons, clean index, and valid service worker.`);
