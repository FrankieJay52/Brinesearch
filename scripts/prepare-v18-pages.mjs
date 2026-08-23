import { access, cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findPrivateCredentialMarker } from "./private-publish-audit.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(projectRoot, "dist-v18");
const outputDir = path.join(projectRoot, "dist-pages");
const requestedBasePath = process.env.PAGES_BASE_PATH ?? "/Brinesearch";
const normalizedBasePath = `/${String(requestedBasePath).replace(/^\/+|\/+$/g, "")}`;
const basePath = normalizedBasePath === "/" ? "" : normalizedBasePath;

if (path.resolve(outputDir) !== path.join(projectRoot, "dist-pages") || sourceDir === outputDir) {
  throw new Error(`Refusing to replace unexpected GitHub Pages target: ${outputDir}`);
}
await access(path.join(sourceDir, "index.html"));
await rm(outputDir, { recursive: true, force: true });
await cp(sourceDir, outputDir, {
  recursive: true,
  filter: (source) => !source.endsWith(".map"),
});
await cp(path.join(outputDir, "index.html"), path.join(outputDir, "404.html"));
await writeFile(path.join(outputDir, ".nojekyll"), "");

async function listFiles(directory, relativeRoot = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath, relativePath));
    else files.push(relativePath);
  }
  return files;
}

const files = await listFiles(outputDir);
const forbiddenFiles = files.filter((file) => file.endsWith(".map") || /(^|[\\/])\.env(?:\.|$)/i.test(file));
if (forbiddenFiles.length) throw new Error(`Private build files must not be published: ${forbiddenFiles.join(", ")}`);
for (const removedLegacyPath of ["road-manager.js", "road-database.js", "front-sign-scanner.js", "pad-fallback-data.json"]) {
  if (files.includes(removedLegacyPath)) throw new Error(`Legacy GitHub Pages file is still published: ${removedLegacyPath}`);
}

const [index, worker, manifestText] = await Promise.all([
  readFile(path.join(outputDir, "index.html"), "utf8"),
  readFile(path.join(outputDir, "sw.js"), "utf8"),
  readFile(path.join(outputDir, "manifest.webmanifest"), "utf8"),
]);
if (!index.includes(`${basePath}/assets/`)) throw new Error(`V18 GitHub Pages index is missing base path ${basePath || "/"}.`);
if (!worker.includes(`createHandlerBoundToURL("${basePath}/index.html")`)) throw new Error("V18 GitHub Pages worker has the wrong navigation scope.");
const manifest = JSON.parse(manifestText);
if (manifest.id !== `${basePath}/` || manifest.start_url !== `${basePath}/#/` || manifest.scope !== `${basePath}/`) {
  throw new Error("V18 GitHub Pages manifest has the wrong app identity, start URL, or scope.");
}

for (const relativePath of files.filter((file) => /\.(?:html|js|mjs|json|webmanifest)$/i.test(file))) {
  const contents = await readFile(path.join(outputDir, relativePath), "utf8");
  const privateCredentialMarker = findPrivateCredentialMarker(contents);
  if (privateCredentialMarker) {
    throw new Error(`Private server credential marker (${privateCredentialMarker}) found in GitHub Pages output: ${relativePath}`);
  }
  if (/BrineSearch V17|V17\.3|brinesearch-app\.js|road-manager\.js|brinesearch\.editorSession\.v1|\/index\.html#\//i.test(contents)) {
    throw new Error(`Legacy page/runtime marker found in V18 GitHub Pages output: ${relativePath}`);
  }
}

const report = {
  version: "18.0.0",
  target: "github-pages",
  basePath: `${basePath}/`,
  fileCount: files.length + 1,
  generatedAt: new Date().toISOString(),
};
await writeFile(path.join(outputDir, "pages-deployment.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Prepared V18-only GitHub Pages site at ${report.basePath} (${report.fileCount} files).`);
