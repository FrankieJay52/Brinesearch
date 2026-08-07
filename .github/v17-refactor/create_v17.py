from pathlib import Path
import re, json, hashlib, shutil, collections

ROOT = Path(__file__).resolve().parents[2]
V17 = ROOT / 'v17'
INDEX = ROOT / 'index.html'
VERSION = '17.0.0'

if not INDEX.exists():
    raise SystemExit('index.html was not found at repository root')

html = INDEX.read_text(encoding='utf-8')
if V17.exists():
    shutil.rmtree(V17)
for folder in [
    'src/parts', 'src/styles', 'src/runtime', 'src/offline',
    'src/data/directions', 'scripts'
]:
    (V17 / folder).mkdir(parents=True, exist_ok=True)

# ----- Extract scripts without changing their order -----
script_matches = list(re.finditer(r'<script(?:\s+id="([^"]+)")?[^>]*>([\s\S]*?)</script>', html, re.I))
if len(script_matches) != 5:
    raise SystemExit(f'Expected 5 inline scripts, found {len(script_matches)}')

theme, main_js, weather, scroll_guard, field_runtime = [match.group(2) for match in script_matches]
main_lines = main_js.split('\n')
while main_lines and not main_lines[0].strip():
    main_lines.pop(0)
while main_lines and not main_lines[-1].strip():
    main_lines.pop()
if not main_lines[0].strip().startswith('(async () => {') or main_lines[-1].strip() != '});':
    raise SystemExit('The main application wrapper was not recognized')
body = main_lines[1:-1]

splits = [0,343,709,1053,1390,1768,2101,2440,2800,3149,3473,3838,4200,4553,4855,5255,5595,5971,6289,6530]
part_names = [
    '00-core-data.js', '01-add-pad-wizard.js', '02-pad-location-branding.js',
    '03-global-search.js', '04-dashboard-favorites-offline.js',
    '05-company-search-routing.js', '06-directions-navigation.js',
    '07-pad-editor-core.js', '08-editor-auth-account.js',
    '09-editor-dashboard-rewrite.js', '10-live-pad-editor.js',
    '11-pad-page.js', '12-verification-queue.js', '13-verification-detail.js',
    '14-field-feed-profile.js', '15-settings-road-tools.js',
    '16-router-assistant-shell.js', '17-assistant-answers.js',
    '18-account-theme-startup.js'
]
if len(body) != splits[-1]:
    raise SystemExit(f'Main application changed: expected {splits[-1]} body lines, found {len(body)}')

parts = []
for name, start, end in zip(part_names, splits, splits[1:]):
    content = '\n'.join(body[start:end]).rstrip() + '\n'
    parts.append([name, content])

# Move the enormous direction rewrite object out of executable code.
core_lines = parts[0][1].splitlines()
rewrite_index = next((i for i, line in enumerate(core_lines) if line.strip().startswith('const VERIFIED_DIRECTION_REWRITES = ')), None)
if rewrite_index is None:
    raise SystemExit('VERIFIED_DIRECTION_REWRITES was not found')
rewrite_line = core_lines[rewrite_index].strip()
raw_rewrites = rewrite_line[len('const VERIFIED_DIRECTION_REWRITES = '):-1]
rewrites = json.loads(raw_rewrites)

loader = '''    const VERIFIED_DIRECTION_REWRITES = await fetch("./data/directions/index.json", { cache: "no-store" })
      .then(async response => response.ok ? response.json() : { files: [] })
      .then(async manifest => Object.assign({}, ...(await Promise.all((manifest.files || []).map(async file => {
        try {
          const response = await fetch(`./data/directions/${file}`, { cache: "no-store" });
          return response.ok ? response.json() : {};
        } catch {
          return {};
        }
      })))))
      .catch(() => ({}));'''
core_lines[rewrite_index:rewrite_index + 1] = loader.splitlines()
parts[0][1] = '\n'.join(core_lines).rstrip() + '\n'

# Split direction data into files kept under roughly 80 KB each.
grouped = collections.defaultdict(list)
for key, value in sorted(rewrites.items()):
    grouped[key.split('--', 1)[0]].append((key, value))
direction_files = []
for operator, records in sorted(grouped.items()):
    chunks, current, current_size = [], {}, 2
    for key, value in records:
        entry_size = len(json.dumps({key: value}, separators=(',', ':'), ensure_ascii=False).encode())
        if current and current_size + entry_size > 80000:
            chunks.append(current)
            current, current_size = {}, 2
        current[key] = value
        current_size += entry_size
    if current:
        chunks.append(current)
    for number, chunk in enumerate(chunks, 1):
        name = f'{operator}.json' if len(chunks) == 1 else f'{operator}-{number}.json'
        (V17 / 'src/data/directions' / name).write_text(
            json.dumps(chunk, indent=2, ensure_ascii=False) + '\n', encoding='utf-8'
        )
        direction_files.append(name)
(V17 / 'src/data/directions/index.json').write_text(json.dumps({
    'version': VERSION,
    'files': direction_files,
    'recordCount': len(rewrites)
}, indent=2) + '\n', encoding='utf-8')

for name, content in parts:
    (V17 / 'src/parts' / name).write_text(content, encoding='utf-8')

# ----- Extract and group CSS -----
style_matches = list(re.finditer(r'<style(?:\s+id="([^"]+)")?[^>]*>([\s\S]*?)</style>', html, re.I))
if len(style_matches) != 27:
    raise SystemExit(f'Expected 27 inline style blocks, found {len(style_matches)}')
styles = [(match.group(1) or f'anonymous-{i + 1}', match.group(2)) for i, match in enumerate(style_matches)]

# Split the largest base block at its existing feature comments.
base_lines = (f'/* Source style block: {styles[0][0]} */\n{styles[0][1].strip()}\n').splitlines()
base_starts = [1,2006,2042,2602,3260,3468,3494,3615,3628,3648,3660,3710,3734]
base_names = [
    '00-base-foundation.css','01-well-property.css','02-field-interface.css',
    '03-legacy-routes.css','04-add-pad.css','05-branding-search.css','06-az-rail.css',
    '07-guided-wizard.css','08-feed-menu.css','09-field-mark-icons.css',
    '10-field-mark-ui.css','11-large-actions.css','12-road-intelligence.css'
]
style_order = []
for i, (name, start) in enumerate(zip(base_names, base_starts)):
    end = base_starts[i + 1] - 1 if i + 1 < len(base_starts) else len(base_lines)
    (V17 / 'src/styles' / name).write_text('\n'.join(base_lines[start - 1:end]).rstrip() + '\n', encoding='utf-8')
    style_order.append(name)

style_groups = [
    ('20-components.css', [1]),
    ('21-search.css', [2]),
    ('22-mobile-layout.css', [3,5,6,17,18,19,20,22,23,24,26]),
    ('23-driver-pad.css', [4]),
    ('24-weather-feed.css', [7,8,9]),
    ('25-sharing-directions-brand.css', [10,11,12,13,14,15]),
    ('26-verification-editor-install.css', [16,21,25])
]
for filename, indexes in style_groups:
    blocks = []
    for index in indexes:
        ident, content = styles[index]
        blocks.append(f'/* Source style block: {ident} */\n{content.strip()}\n')
    (V17 / 'src/styles' / filename).write_text('\n'.join(blocks), encoding='utf-8')
    style_order.append(filename)

# Runtime scripts that were separate in the original document.
for filename, content in {
    'theme-boot.js': theme,
    'weather-feature.js': weather,
    'root-scroll-guard.js': scroll_guard,
    'field-mark-runtime.js': field_runtime
}.items():
    (V17 / 'src/runtime' / filename).write_text(content.strip() + '\n', encoding='utf-8')

# ----- Clean V17 HTML shell -----
clean = re.sub(r'<style(?:\s+id="[^"]+")?[^>]*>[\s\S]*?</style>', '', html, flags=re.I)
clean = re.sub(r'<script(?:\s+id="[^"]+")?[^>]*>[\s\S]*?</script>', '', clean, flags=re.I)
clean = re.sub(r'</head>', '''
  <script src="/app/theme-boot.js?v=17.0.0"></script>
  <link rel="stylesheet" href="/styles/app.css?v=17.0.0">
</head>''', clean, count=1, flags=re.I)
clean = re.sub(r'</body>', '''
  <script src="/app/brinesearch-app.js?v=17.0.0"></script>
  <script src="/road-database.js?v=17.0.0"></script>
  <script src="/road-manager.js?v=17.0.0"></script>
  <script src="/front-sign-scanner.js?v=17.0.0"></script>
  <script src="/v16-25-hotfix.js?v=17.0.0"></script>
  <script src="/app/weather-feature.js?v=17.0.0"></script>
  <script src="/app/root-scroll-guard.js?v=17.0.0"></script>
  <script src="/app/field-mark-runtime.js?v=17.0.0"></script>
</body>''', clean, count=1, flags=re.I)
clean = clean.replace('<title>BrineSearch', '<title>BrineSearch V17 Preview —')
(V17 / 'index.html').write_text(clean, encoding='utf-8')

# ----- Ordered source manifests -----
def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()

assembled_app = '(async () => {\n' + '\n'.join(content for _, content in parts) + '\n})();\n'
assembled_css = '\n\n'.join((V17 / 'src/styles' / name).read_text(encoding='utf-8').rstrip() for name in style_order) + '\n'
(V17 / 'src/parts/part-order.json').write_text(json.dumps({
    'version': VERSION,
    'wrapperStart': '(async () => {',
    'wrapperEnd': '})();',
    'parts': part_names,
    'assembledSha256': sha256(assembled_app)
}, indent=2) + '\n', encoding='utf-8')
(V17 / 'src/styles/style-order.json').write_text(json.dumps({
    'version': VERSION,
    'styles': style_order,
    'assembledSha256': sha256(assembled_css)
}, indent=2) + '\n', encoding='utf-8')

# ----- Clean V17 service worker template -----
(V17 / 'src/offline/sw.js').write_text(r'''const CACHE_VERSION = 'brinesearch-v17-0-0';
const DIRECTION_DATA_FILES = __DIRECTION_DATA_FILES__;
const APP_SHELL = [
  './', './index.html', './styles/app.css', './app/theme-boot.js',
  './app/brinesearch-app.js', './app/weather-feature.js',
  './app/root-scroll-guard.js', './app/field-mark-runtime.js',
  './manifest.webmanifest', './pad-fallback-data.json',
  './road-database.js', './road-manager.js', './front-sign-scanner.js',
  './v16-25-hotfix.js', './road-database.schema.json', './road_name_review.csv'
].concat(DIRECTION_DATA_FILES);
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE_VERSION);
  await Promise.allSettled(APP_SHELL.map(async asset => {
    const response = await fetch(asset, { cache: 'reload' });
    if (response.ok) await cache.put(asset, response);
  }));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('brinesearch-') && key !== CACHE_VERSION).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin && event.request.destination !== 'image') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(async response => {
      if (response.ok) (await caches.open(CACHE_VERSION)).put('./index.html', response.clone());
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(async response => {
    if (response.ok && url.origin === self.location.origin) (await caches.open(CACHE_VERSION)).put(event.request, response.clone());
    return response;
  })));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
''', encoding='utf-8')

# ----- Build and verification scripts -----
(V17 / 'scripts/assemble.mjs').write_text(r'''import fs from 'node:fs/promises';
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
for (const file of ['theme-boot.js', 'weather-feature.js', 'root-scroll-guard.js', 'field-mark-runtime.js']) {
  await fs.copyFile(path.join(srcRoot, 'runtime', file), path.join(appRoot, file));
}
const directionManifest = await readJson(path.join(srcRoot, 'data', 'directions', 'index.json'));
await copyIfPresent(path.join(srcRoot, 'data'), path.join(publicRoot, 'data'));
const swTemplate = await fs.readFile(path.join(srcRoot, 'offline', 'sw.js'), 'utf8');
const directionAssets = ['./data/directions/index.json', ...directionManifest.files.map(file => `./data/directions/${file}`)];
await fs.writeFile(path.join(publicRoot, 'sw.js'), swTemplate.replace('__DIRECTION_DATA_FILES__', JSON.stringify(directionAssets, null, 2)));
const inheritedFiles = [
  'manifest.webmanifest', 'pad-fallback-data.json', 'road-database.js', 'road-manager.js',
  'front-sign-scanner.js', 'v16-25-hotfix.js', 'road-database.schema.json', 'road_name_review.csv'
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
  appSha256: sha256(assembledApp),
  cssSha256: sha256(assembledCss)
};
await fs.writeFile(path.join(publicRoot, 'v17-build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`BrineSearch V${report.version}: ${report.partCount} JS parts, ${report.styleCount} CSS parts, and ${report.directionDataFiles} data files assembled.`);
''', encoding='utf-8')

(V17 / 'scripts/verify.mjs').write_text(r'''import fs from 'node:fs/promises';
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
const parts = JSON.parse(await fs.readFile(path.join(v17Root, 'src/parts/part-order.json'), 'utf8'));
const styles = JSON.parse(await fs.readFile(path.join(v17Root, 'src/styles/style-order.json'), 'utf8'));
new vm.Script(app, { filename: 'brinesearch-app.js' });
if (sha256(app) !== parts.assembledSha256) throw new Error('Assembled application differs from the ordered source parts.');
if (sha256(css) !== styles.assembledSha256) throw new Error('Assembled CSS differs from the ordered source parts.');
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
console.log(`Verified V${parts.version}: ${parts.parts.length} JS parts, ${styles.styles.length} CSS parts, ${directionManifest.files.length} direction-data files, clean index, and valid service worker.`);
''', encoding='utf-8')

(V17 / 'vite.config.js').write_text(r'''import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: 'public',
  build: { outDir: '../dist-v17', emptyOutDir: true, target: 'es2020' },
  server: { host: true, port: 4173 }
});
''', encoding='utf-8')

(ROOT / 'package.json').write_text(json.dumps({
    'name': 'brinesearch',
    'private': True,
    'version': '17.0.0-alpha.1',
    'type': 'module',
    'scripts': {
        'prepare:v17': 'node v17/scripts/assemble.mjs',
        'verify:v17': 'node v17/scripts/verify.mjs',
        'dev': 'npm run prepare:v17 && vite --config v17/vite.config.js',
        'build': 'npm run verify:v17 && vite build --config v17/vite.config.js',
        'preview': 'vite preview --config v17/vite.config.js'
    },
    'devDependencies': {'vite': '^7.1.0'}
}, indent=2) + '\n', encoding='utf-8')
(ROOT / 'netlify.toml').write_text('[build]\n  command = "npm run build"\n  publish = "dist-v17"\n\n[build.environment]\n  NODE_VERSION = "22"\n', encoding='utf-8')
(ROOT / '.gitignore').write_text('node_modules/\ndist-v17/\nv17/public/\n', encoding='utf-8')
(ROOT / 'V17_REFACTOR.md').write_text('''# BrineSearch V17 modular rebuild

The live `main` branch remains on V16.25. This branch contains the behavior-preserving first stage of V17.

- 19 ordered JavaScript feature files
- 20 CSS source files grouped by responsibility
- 27 direction-data files instead of one enormous embedded object
- Separate runtime scripts
- Clean V17 service worker
- Vite development and production configuration
- Automated assembly and verification

Run `npm run verify:v17`, `npm run dev`, or `npm run build`.

The ordered source parts still assemble inside one shared application closure so existing behavior and shared state remain intact. Individual features can now be converted to true ES modules one at a time without another all-at-once rewrite.
''', encoding='utf-8')

print(f'Created BrineSearch V17 source: {len(part_names)} JS parts, {len(style_order)} CSS parts, {len(direction_files)} direction files.')
