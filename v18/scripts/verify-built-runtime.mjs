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
assert.match(appJavascript, /brinesearch\.v18AuthSession\.v1/, "Built V18 app is missing its V18-only owner session");
assert.match(appJavascript, /\/sign-in/, "Built V18 app is missing native owner sign-in");
assert.match(appJavascript, /field_feed_list\?select=/, "Built V18 app is missing native public Field Updates");
assert.match(appJavascript, /Selected location exact road evidence/, "Built V18 app is missing the selected-location exact-road highlight legend");
assert.match(appJavascript, /Ends at selected pad road projection/, "Built V18 app is missing the per-pad endpoint boundary label");
assert.match(appJavascript, /Gold inspection road/, "Built V18 app is missing the selected-road inspection legend");
assert.match(appJavascript, /Reviewed field directions/, "Built V18 app is missing reviewed directions in the owner map");
assert.doesNotMatch(appJavascript, /brinesearch\.editorSession\.v1|https?:\/\/brinesearch\.com\/index\.html#|private_review_notes|service[_-]?role/i, "Built V18 app contains an old-app bridge, private review fields, or privileged key material");

console.log("Verified V18 built runtime: native sign-in, public Field Updates, reviewed directions, and owner-only exact-road highlights with per-pad endpoint boundaries are present without old-app bridges, private fields, or privileged material.");
