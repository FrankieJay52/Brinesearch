import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const v18Root = fileURLToPath(new URL("..", import.meta.url));
const outputRoot = path.resolve(v18Root, "..", "dist-v18");
const workerPath = path.join(outputRoot, "maplibre", "maplibre-gl-worker.mjs");
const sharedPath = path.join(outputRoot, "maplibre", "maplibre-gl-shared.mjs");

await Promise.all([access(workerPath), access(sharedPath)]);
const [worker, shared, serviceWorker, assetNames] = await Promise.all([
  readFile(workerPath, "utf8"),
  readFile(sharedPath, "utf8"),
  readFile(path.join(outputRoot, "sw.js"), "utf8"),
  readdir(path.join(outputRoot, "assets")),
]);
const appJavascript = (await Promise.all(assetNames.filter((name) => name.endsWith(".js")).map((name) => readFile(path.join(outputRoot, "assets", name), "utf8")))).join("\n");

assert.match(worker, /maplibre-gl-shared\.mjs/, "MapLibre worker must import its pinned shared module");
assert.ok(shared.length > 100_000, "MapLibre shared worker module is unexpectedly small");
assert.match(serviceWorker, /maplibre\/maplibre-gl-worker\.mjs/, "PWA precache is missing the MapLibre worker");
assert.match(serviceWorker, /maplibre\/maplibre-gl-shared\.mjs/, "PWA precache is missing the MapLibre shared module");
assert.match(appJavascript, /owner_approved_routes_map_viewport/, "Built V18 app is missing the owner road viewport adapter");
assert.match(appJavascript, /\/settings\/approved-routes/, "Built V18 app is missing the Owner Settings map route");
assert.match(appJavascript, /brinesearch\.editorSession\.v1/, "Built V18 app is missing the same-origin owner session bridge");
assert.match(appJavascript, /Selected exact road/, "Built V18 app is missing the selected-road highlight legend");
assert.doesNotMatch(appJavascript, /private_review_notes|service[_-]?role/i, "Built V18 app contains private review fields or privileged key material");

console.log("Verified V18 built runtime: MapLibre worker pair is precached and the owner-only exact-road map/highlight route is present without private or privileged fields.");
