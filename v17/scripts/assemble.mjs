import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const srcRoot = path.join(v17Root, 'src');
const publicRoot = path.join(v17Root, 'public');
const appRoot = path.join(publicRoot, 'app');
const stylesRoot = path.join(publicRoot, 'styles');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }
async function copyIfPresent(source, destination) {
  try {
    const stat = await fs.stat(source);
    await ensureDir(path.dirname(destination));
    if (stat.isDirectory()) await fs.cp(source, destination, { recursive: true, force: true });
    else await fs.copyFile(source, destination);
    return true;
  } catch { return false; }
}
await fs.rm(publicRoot, { recursive: true, force: true });
await ensureDir(appRoot);
await ensureDir(stylesRoot);
const partManifest = await readJson(path.join(srcRoot, 'parts', 'part-order.json'));
const parts = await Promise.all(partManifest.parts.map(name => fs.readFile(path.join(srcRoot, 'parts', name), 'utf8')));
const assembledApp = `${partManifest.wrapperStart}\n${parts.join('\n')}\n${partManifest.wrapperEnd}\n`;
await fs.writeFile(path.join(appRoot, 'brinesearch-app.js'), assembledApp);
const styleManifest = await readJson(path.join(srcRoot, 'styles', 'style-order.json'));
const styles = await Promise.all(styleManifest.styles.map(name => fs.readFile(path.join(srcRoot, 'styles', name), 'utf8')));
const assembledCss = styles.map(value => value.trimEnd()).join('\n\n') + '\n';
await fs.writeFile(path.join(stylesRoot, 'app.css'), assembledCss);

// Field Mark definitions were originally written while CSS lived at the site root.
// V17 serves app.css from /styles, so ./icons incorrectly becomes /styles/icons.
// Keep the hashed source CSS untouched and generate a small post-build override with
// absolute icon URLs. This preserves source-integrity hashes while fixing real browsers.
const fieldMarkSource = await fs.readFile(path.join(srcRoot, 'styles', '09-field-mark-icons.css'), 'utf8');
const fieldMarkAbsolute = fieldMarkSource.replaceAll("url('./icons/", "url('/icons/");
await fs.writeFile(path.join(stylesRoot, 'field-mark-icons.css'), fieldMarkAbsolute);

for (const file of ['theme-boot.js', 'weather-feature.js', 'root-scroll-guard.js', 'field-mark-runtime.js', 'front-sign-structured.js']) {
  await fs.copyFile(path.join(srcRoot, 'runtime', file), path.join(appRoot, file));
}
const directionManifest = await readJson(path.join(srcRoot, 'data', 'directions', 'index.json'));
await copyIfPresent(path.join(srcRoot, 'data'), path.join(publicRoot, 'data'));
const swTemplate = await fs.readFile(path.join(srcRoot, 'offline', 'sw.js'), 'utf8');
const directionAssets = ['./data/directions/index.json', ...directionManifest.files.map(file => `./data/directions/${file}`)];
await fs.writeFile(path.join(publicRoot, 'sw.js'), swTemplate.replace('__DIRECTION_DATA_FILES__', JSON.stringify(directionAssets, null, 2)));
const inheritedFiles = [
  'manifest.webmanifest', 'pad-fallback-data.json', 'road-database.js', 'road-manager.js',
  'front-sign-scanner.js', 'road-database.schema.json', 'road_name_review.csv'
];
for (const file of inheritedFiles) await copyIfPresent(path.join(projectRoot, file), path.join(publicRoot, file));
for (const dir of ['icons', 'brand-kit']) await copyIfPresent(path.join(projectRoot, dir), path.join(publicRoot, dir));
const report = {
  version: partManifest.version,
  generatedAt: new Date().toISOString(),
  partCount: partManifest.parts.length,
  styleCount: styleManifest.styles.length,
  directionDataFiles: directionManifest.files.length,
  appBytes: Buffer.byteLength(assembledApp),
  cssBytes: Buffer.byteLength(assembledCss),
  fieldMarkCssBytes: Buffer.byteLength(fieldMarkAbsolute),
  appSha256: sha256(assembledApp),
  cssSha256: sha256(assembledCss)
};
await fs.writeFile(path.join(publicRoot, 'v17-build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`BrineSearch V${report.version}: ${report.partCount} JS parts, ${report.styleCount} CSS parts, and ${report.directionDataFiles} data files assembled.`);
