import { access, cp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findPrivateCredentialMarker } from "./private-publish-audit.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const v17Output = path.join(projectRoot, "dist-v17");
const v18Output = path.join(projectRoot, "dist-v18");
const v18Target = path.join(v17Output, "v18");

function assertBoundedTarget() {
  const expectedPrefix = `${path.resolve(v17Output)}${path.sep}`;
  if (!path.resolve(v18Target).startsWith(expectedPrefix) || path.basename(v18Target) !== "v18") {
    throw new Error(`Refusing to replace unexpected production target: ${v18Target}`);
  }
}

async function requireFile(relativePath) {
  const filePath = path.join(v17Output, relativePath);
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

assertBoundedTarget();
await access(path.join(v17Output, "index.html"));
await access(path.join(v18Output, "index.html"));
await rm(v18Target, { recursive: true, force: true });
await cp(v18Output, v18Target, {
  recursive: true,
  filter: (source) => !source.endsWith(".map"),
});

const requiredFiles = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "v18/index.html",
  "v18/manifest.webmanifest",
  "v18/sw.js",
  "v18/maplibre/maplibre-gl-worker.mjs",
  "v18/maplibre/maplibre-gl-shared.mjs",
];
await Promise.all(requiredFiles.map(requireFile));

const [v18Index, v17Worker, v18Worker, v17ManifestText, v18ManifestText] = await Promise.all([
  readFile(path.join(v18Target, "index.html"), "utf8"),
  readFile(path.join(v17Output, "sw.js"), "utf8"),
  readFile(path.join(v18Target, "sw.js"), "utf8"),
  readFile(path.join(v17Output, "manifest.webmanifest"), "utf8"),
  readFile(path.join(v18Target, "manifest.webmanifest"), "utf8"),
]);
if (!v18Index.includes("/v18/assets/")) throw new Error("V18 assets were not built for the /v18/ production base.");
if (!v17Worker.includes("url.pathname.startsWith('/v18/')")) throw new Error("V17 service worker does not bypass the V18 scope.");
if (!v17Worker.includes("url.pathname !== '/index.html'")) throw new Error("V17 service worker must only handle its explicit index navigation.");
if (!v18Worker.includes('createHandlerBoundToURL("/v18/index.html")')) throw new Error("V18 service worker navigation fallback escaped the /v18/ scope.");

const v17Manifest = JSON.parse(v17ManifestText);
const v18Manifest = JSON.parse(v18ManifestText);
if (v17Manifest.id !== "/index.html" || v17Manifest.start_url !== "/index.html#/") throw new Error("V17 manifest must open the explicit legacy dashboard URL.");
if (v18Manifest.id !== "/v18/" || v18Manifest.start_url !== "/v18/#/") throw new Error("V18 manifest must stay isolated under /v18/.");

async function verifyManifestIcons(manifest, manifestPath) {
  if (!Array.isArray(manifest.icons) || !manifest.icons.length) throw new Error(`${manifestPath} has no install icons.`);
  for (const icon of manifest.icons) {
    const pathname = new URL(icon.src, `https://brinesearch.com/${manifestPath}`).pathname;
    await access(path.join(v17Output, pathname.replace(/^\/+/, "")));
  }
}
await verifyManifestIcons(v17Manifest, "manifest.webmanifest");
await verifyManifestIcons(v18Manifest, "v18/manifest.webmanifest");

const precacheUrls = [...v18Worker.matchAll(/\{url:"([^"]+)"/g)].map((match) => match[1]);
if (!precacheUrls.length) throw new Error("V18 service worker has no verifiable precache entries.");
await Promise.all(precacheUrls.map((relativePath) => access(path.join(v18Target, relativePath))));

const publishedFiles = await listFiles(v17Output);
const forbiddenFiles = publishedFiles.filter((file) => file.endsWith(".map") || /(^|[\\/])\.env(?:\.|$)/i.test(file));
if (forbiddenFiles.length) throw new Error(`Private build files must not be published: ${forbiddenFiles.join(", ")}`);

async function verifyLocalReference(reference, sourcePath) {
  if (!reference || /^(?:data:|blob:|https?:|mailto:|tel:|javascript:|#)/i.test(reference)) return;
  const sourceUrl = new URL(sourcePath.replaceAll("\\", "/"), "https://brinesearch.com/");
  const targetUrl = new URL(reference, sourceUrl);
  if (targetUrl.origin !== "https://brinesearch.com") return;
  const targetPath = decodeURIComponent(targetUrl.pathname).replace(/^\/+/, "");
  if (!targetPath) return;
  await access(path.join(v17Output, targetPath));
}

for (const relativePath of publishedFiles.filter((file) => /\.(?:html|js|mjs|json|webmanifest)$/i.test(file))) {
  const contents = await readFile(path.join(v17Output, relativePath), "utf8");
  const privateCredentialMarker = findPrivateCredentialMarker(contents);
  if (privateCredentialMarker) {
    throw new Error(`Private server credential marker (${privateCredentialMarker}) found in publish output: ${relativePath}`);
  }
  for (const match of contents.matchAll(/brand-kit\/[A-Za-z0-9._-]+/g)) {
    await access(path.join(v17Output, match[0]));
  }
  if (relativePath.endsWith(".html")) {
    for (const match of contents.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
      await verifyLocalReference(match[1], relativePath);
    }
  }
}

for (const relativePath of publishedFiles.filter((file) => file.endsWith(".css"))) {
  const contents = await readFile(path.join(v17Output, relativePath), "utf8");
  for (const match of contents.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    await verifyLocalReference(match[1], relativePath);
  }
}

console.log(`Assembled verified production bundle: ${publishedFiles.length} files, V18 at /v18/, V17 operational tools retained at /index.html#/.`);
