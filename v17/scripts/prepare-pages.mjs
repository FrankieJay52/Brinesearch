import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceDir = path.resolve(projectRoot, process.env.PAGES_SOURCE_DIR || 'dist-v17');
const outputDir = path.resolve(projectRoot, process.env.PAGES_OUTPUT_DIR || 'dist-pages');
const repositoryName = (process.env.GITHUB_REPOSITORY || 'FrankieJay52/Brinesearch').split('/').pop();
const requestedBasePath = process.env.PAGES_BASE_PATH ?? `/${repositoryName}`;
const normalized = `/${String(requestedBasePath || '').replace(/^\/+|\/+$/g, '')}`;
const basePath = normalized === '/' ? '' : normalized;

if (sourceDir === outputDir) throw new Error('Pages source and output directories must be different.');
await fs.access(path.join(sourceDir, 'index.html'));
await fs.rm(outputDir, { recursive: true, force: true });
await fs.cp(sourceDir, outputDir, { recursive: true, force: true });

const rootAssets = [
  'app/',
  'styles/',
  'icons/',
  'data/',
  'brand-kit/',
  'road-database.js',
  'road-manager.js',
  'front-sign-scanner.js',
  'manifest.webmanifest',
  'pad-fallback-data.json',
  'road-database.schema.json',
  'road_name_review.csv',
  'sw.js'
];
const textExtensions = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.txt', '.xml', '.svg']);
let fileCount = 0;
let changedFileCount = 0;

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    fileCount += 1;
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    let content = await fs.readFile(fullPath, 'utf8');
    const original = content;
    if (basePath) {
      for (const asset of rootAssets) {
        content = content
          .replaceAll(`"/${asset}`, `"${basePath}/${asset}`)
          .replaceAll(`'/${asset}`, `'${basePath}/${asset}`)
          .replaceAll(`url(/${asset}`, `url(${basePath}/${asset}`);
      }
    }
    if (content !== original) {
      await fs.writeFile(fullPath, content);
      changedFileCount += 1;
    }
  }
}

await walk(outputDir);
await fs.writeFile(path.join(outputDir, '.nojekyll'), '');
await fs.copyFile(path.join(outputDir, 'index.html'), path.join(outputDir, '404.html'));

const index = await fs.readFile(path.join(outputDir, 'index.html'), 'utf8');
for (const required of [`${basePath}/styles/app.css`, `${basePath}/app/brinesearch-app.js`, `${basePath}/front-sign-scanner.js`]) {
  if (!index.includes(required)) throw new Error(`GitHub Pages index is missing ${required}.`);
}

const leftovers = [];
async function verify(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await verify(fullPath);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const content = await fs.readFile(fullPath, 'utf8');
    for (const asset of rootAssets) {
      if (content.includes(`"/${asset}`) || content.includes(`'/${asset}`) || content.includes(`url(/${asset}`)) {
        leftovers.push(`${path.relative(outputDir, fullPath)} -> /${asset}`);
      }
    }
  }
}
await verify(outputDir);
if (leftovers.length) throw new Error(`Unprefixed root assets remain:\n${leftovers.join('\n')}`);

const report = {
  version: '17.2.0',
  target: 'github-pages',
  basePath: basePath || '/',
  fileCount,
  changedFileCount,
  generatedAt: new Date().toISOString()
};
await fs.writeFile(path.join(outputDir, 'pages-deployment.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Prepared BrineSearch V17.2 for GitHub Pages at ${report.basePath} (${fileCount} files, ${changedFileCount} rewritten).`);
