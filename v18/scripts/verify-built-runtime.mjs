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
assert.match(appJavascript, /Selected pad exact approved route/, "Built V18 app is missing the selected-pad exact-route highlight legend");
assert.match(appJavascript, /Exact route terminates at verified entrance/, "Built V18 app is missing the verified-entrance termination proof");
assert.match(appJavascript, /Selected pad held · no teal route/, "Built V18 app is missing the held-pad fail-closed legend");
assert.match(appJavascript, /Ends at selected pad road projection/, "Built V18 app is missing the per-pad endpoint boundary label");
assert.match(appJavascript, /Gold inspection road/, "Built V18 app is missing the selected-road inspection legend");
assert.match(appJavascript, /Reviewed field directions/, "Built V18 app is missing reviewed directions in the owner map");
assert.match(appJavascript, /Named roads to saved pin/, "Built V18 app is missing the single fixed named-road action");
assert.match(appJavascript, /reviewed named-road controls/, "Built V18 app does not label the named-road handoff");
assert.match(appJavascript, /One reviewed named-road handoff is bound to this exact pad and destination/, "Built V18 app does not disclose the reviewed named-road binding");
assert.match(appJavascript, /Use the BrineSearch map and named-road steps; no single Google Maps handoff is available/, "Built V18 app is missing the in-app-only named-road fallback");
assert.match(appJavascript, /GPS destination only/, "Built V18 app is missing the always-present destination-pin navigation fallback");
assert.match(appJavascript, /destination pin only, no reviewed named-road sequence/, "Built V18 app is missing clickable GPS coordinates with the named-road boundary");
assert.match(appJavascript, /GPS destination only · named roads not yet reviewed/, "Built V18 app is missing the compact GPS named-road boundary");
assert.match(appJavascript, /Named roads then unnamed access/, "Built V18 app is missing the named-road handoff boundary");
assert.match(appJavascript, /No reviewed named-road display geometry · no teal line inferred/, "Built V18 app can no longer prove that missing display geometry produces no fake teal");
assert.match(appJavascript, /teal is display, not new authority/, "Built V18 app is missing the named-road display authority boundary");
assert.match(appJavascript, /All pads \+ all approved roads/, "Built V18 app is missing the unified all-pads/all-approved-roads scope");
assert.match(appJavascript, /Filter pads and approved roads by company/, "Built V18 app is missing the unified company selector");
assert.match(appJavascript, /Pad-county Interstate \/ U\.S\. \/ state reference · thin teal/, "Built V18 app is missing the pad-county highway-reference legend");
assert.match(appJavascript, /Exact approved route road · stronger teal/, "Built V18 app is missing the stronger approved-road legend");
assert.match(appJavascript, /Selected-pad route color appears only after choosing a pad/, "Built V18 app is missing the selected-pad-only route-color disclosure");
assert.match(appJavascript, /Selected pad route · bright teal/, "Built V18 app is missing the selection-only pad-route key");
assert.doesNotMatch(appJavascript, /Checking for the highest-priority reviewed route|Live route check unavailable · no fallback opened/, "Built V18 app still withholds Navigate while optional State-1 checks settle");
assert.doesNotMatch(appJavascript, /Approved road core · GPS destination/, "Built V18 app retained the superseded state-2 label");
assert.doesNotMatch(appJavascript, /Approved roads to handoff · GPS-only final leg/, "Built V18 app retained the superseded named state-2 label");
assert.match(appJavascript, /No trusted GPS destination/, "Built V18 app is missing the disabled navigation state");
assert.match(appJavascript, /ODNR official pad GPS · not an entrance/, "Built V18 app is missing the official-pad destination source label");
assert.match(appJavascript, /ODNR official wellhead GPS · not an entrance/, "Built V18 app is missing the official-wellhead destination source label");
assert.match(appJavascript, /Saved pad GPS/, "Built V18 app is missing the saved-pad destination source label");
assert.match(appJavascript, /7 closest pads/, "Built V18 app is missing nearest-pad quick search");
assert.match(appJavascript, /Closest matching pads/, "Built V18 app is missing nearest-first matching search");
assert.match(appJavascript, /Pad-name matches/, "Built V18 app is missing honest no-GPS search labeling");
assert.match(appJavascript, /from phone GPS/, "Built V18 app is missing phone-relative distance labeling");
assert.match(appJavascript, /Using this phone's current GPS/, "Built V18 app is missing phone-location search disclosure");
assert.match(appJavascript, /Expand pad map/, "Built V18 app is missing the compact expandable pad map");
assert.doesNotMatch(appJavascript, /Current public Google route|Open route \d+ of|route-chunk-list/, "Built V18 app exposes a multipart or generic public-Google driver action");
assert.doesNotMatch(appJavascript, /brinesearch\.editorSession\.v1|https?:\/\/brinesearch\.com\/index\.html#|private_review_notes|service[_-]?role/i, "Built V18 app contains an old-app bridge, private review fields, or privileged key material");

console.log("Verified V18 built runtime: named-road Navigate and teal display are available without optional State-1 gating, while GPS-only pads get no inferred line and no privileged material is bundled.");
