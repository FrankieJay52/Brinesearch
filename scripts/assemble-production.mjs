import { access, cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findPrivateCredentialMarker } from "./private-publish-audit.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const v18Output = path.join(projectRoot, "dist-v18");
const productionOutput = path.join(projectRoot, "dist-production");
const v18Target = path.join(productionOutput, "v18");
const retirementWorkerSource = path.join(projectRoot, "scripts", "retire-legacy-service-worker.js");

function assertBoundedTargets() {
  if (path.resolve(productionOutput) !== path.join(projectRoot, "dist-production")) {
    throw new Error(`Refusing to replace unexpected production target: ${productionOutput}`);
  }
  const expectedPrefix = `${path.resolve(productionOutput)}${path.sep}`;
  if (!path.resolve(v18Target).startsWith(expectedPrefix) || path.basename(v18Target) !== "v18") {
    throw new Error(`Refusing to stage V18 at unexpected target: ${v18Target}`);
  }
}

async function requireFile(relativePath) {
  const filePath = path.join(productionOutput, relativePath);
  await access(filePath);
  return filePath;
}

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

assertBoundedTargets();
await Promise.all([
  access(path.join(v18Output, "index.html")),
  access(retirementWorkerSource),
]);
await rm(productionOutput, { recursive: true, force: true });
await mkdir(productionOutput, { recursive: true });
await cp(v18Output, v18Target, {
  recursive: true,
  filter: (source) => !source.endsWith(".map"),
});
await cp(retirementWorkerSource, path.join(productionOutput, "sw.js"));

const requiredFiles = [
  "sw.js",
  "v18/index.html",
  "v18/manifest.webmanifest",
  "v18/sw.js",
  "v18/maplibre/maplibre-gl-worker.mjs",
  "v18/maplibre/maplibre-gl-shared.mjs",
];
await Promise.all(requiredFiles.map(requireFile));

const [v18Index, v18Worker, v18ManifestText, retirementWorker] = await Promise.all([
  readFile(path.join(v18Target, "index.html"), "utf8"),
  readFile(path.join(v18Target, "sw.js"), "utf8"),
  readFile(path.join(v18Target, "manifest.webmanifest"), "utf8"),
  readFile(path.join(productionOutput, "sw.js"), "utf8"),
]);
if (!v18Index.includes("/v18/assets/")) throw new Error("V18 assets were not built for the /v18/ production base.");
if (!v18Worker.includes('createHandlerBoundToURL("/v18/index.html")')) throw new Error("V18 service worker navigation fallback escaped the /v18/ scope.");
if (!retirementWorker.includes('const V18_ENTRY = "/v18/#/"')) throw new Error("Root service worker does not retire legacy pages into V18.");
if (!retirementWorker.includes('url.pathname.startsWith(V18_PATH)')) throw new Error("Root retirement worker does not leave the V18 scope untouched.");

const v18Manifest = JSON.parse(v18ManifestText);
if (v18Manifest.id !== "/v18/" || v18Manifest.start_url !== "/v18/#/" || v18Manifest.scope !== "/v18/") {
  throw new Error("V18 manifest must remain isolated under /v18/.");
}

async function verifyManifestIcons(manifest, manifestPath) {
  if (!Array.isArray(manifest.icons) || !manifest.icons.length) throw new Error(`${manifestPath} has no install icons.`);
  for (const icon of manifest.icons) {
    const pathname = new URL(icon.src, `https://brinesearch.com/${manifestPath}`).pathname;
    await access(path.join(productionOutput, pathname.replace(/^\/+/, "")));
  }
}
await verifyManifestIcons(v18Manifest, "v18/manifest.webmanifest");

const precacheUrls = [...v18Worker.matchAll(/\{url:"([^"]+)"/g)].map((match) => match[1]);
if (!precacheUrls.length) throw new Error("V18 service worker has no verifiable precache entries.");
await Promise.all(precacheUrls.map((relativePath) => access(path.join(v18Target, relativePath))));

const publishedFiles = await listFiles(productionOutput);
const forbiddenFiles = publishedFiles.filter((file) => file.endsWith(".map") || /(^|[\\/])\.env(?:\.|$)/i.test(file));
if (forbiddenFiles.length) throw new Error(`Private build files must not be published: ${forbiddenFiles.join(", ")}`);

const unexpectedRootFiles = publishedFiles.filter((file) => file !== "sw.js" && !file.startsWith(`v18${path.sep}`));
if (unexpectedRootFiles.length) throw new Error(`Only the V18 app and retirement worker may be published: ${unexpectedRootFiles.join(", ")}`);
for (const removedLegacyPath of ["index.html", "manifest.webmanifest", "road-manager.js", "road-database.js", "front-sign-scanner.js", "pad-fallback-data.json"]) {
  if (publishedFiles.includes(removedLegacyPath)) throw new Error(`Legacy production file is still published: ${removedLegacyPath}`);
}

async function verifyLocalReference(reference, sourcePath) {
  if (!reference || /^(?:data:|blob:|https?:|mailto:|tel:|javascript:|#)/i.test(reference)) return;
  const sourceUrl = new URL(sourcePath.replaceAll("\\", "/"), "https://brinesearch.com/");
  const targetUrl = new URL(reference, sourceUrl);
  if (targetUrl.origin !== "https://brinesearch.com") return;
  const targetPath = decodeURIComponent(targetUrl.pathname).replace(/^\/+/, "");
  if (!targetPath) return;
  await access(path.join(productionOutput, targetPath));
}

for (const relativePath of publishedFiles.filter((file) => /\.(?:html|js|mjs|json|webmanifest)$/i.test(file))) {
  const contents = await readFile(path.join(productionOutput, relativePath), "utf8");
  const privateCredentialMarker = findPrivateCredentialMarker(contents);
  if (privateCredentialMarker) {
    throw new Error(`Private server credential marker (${privateCredentialMarker}) found in publish output: ${relativePath}`);
  }
  if (/BrineSearch V17|V17\.3|brinesearch-app\.js|road-manager\.js|brinesearch\.editorSession\.v1|\/index\.html#\//i.test(contents)) {
    throw new Error(`Legacy page/runtime marker found in V18-only publish output: ${relativePath}`);
  }
  if (relativePath.endsWith(".html")) {
    for (const match of contents.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
      await verifyLocalReference(match[1], relativePath);
    }
  }
}

for (const relativePath of publishedFiles.filter((file) => file.endsWith(".css"))) {
  const contents = await readFile(path.join(productionOutput, relativePath), "utf8");
  for (const match of contents.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    await verifyLocalReference(match[1], relativePath);
  }
}

console.log(`Assembled verified V18-only production bundle: ${publishedFiles.length} files at /v18/; every V17 page and runtime asset is absent.`);
