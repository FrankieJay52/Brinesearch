import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { auditAscentPadApproachesBatch2 } from "./audit-ascent-pad-approaches-batch2.mjs";

const v18Root = fileURLToPath(new URL("..", import.meta.url));
const outputRoot = path.resolve(v18Root, "..", "dist-v18");
const workerPath = path.join(outputRoot, "maplibre", "maplibre-gl-worker.mjs");
const sharedPath = path.join(outputRoot, "maplibre", "maplibre-gl-shared.mjs");
const ascentCatalogPath = path.join(v18Root, "src", "features", "map", "ascentPadRoadDisplays.batch1.json");
const ascentApproachCatalogPath = path.join(v18Root, "src", "features", "map", "ascentPadApproaches.batch2.json");

await Promise.all([access(workerPath), access(sharedPath)]);
const [worker, shared, serviceWorker, assetNames, ascentCatalogJson, ascentApproachCatalogJson] = await Promise.all([
  readFile(workerPath, "utf8"),
  readFile(sharedPath, "utf8"),
  readFile(path.join(outputRoot, "sw.js"), "utf8"),
  readdir(path.join(outputRoot, "assets")),
  readFile(ascentCatalogPath, "utf8"),
  readFile(ascentApproachCatalogPath, "utf8"),
]);
const javascriptAssets = await Promise.all(assetNames.filter((name) => name.endsWith(".js")).map(async (name) => ({
  name,
  content: await readFile(path.join(outputRoot, "assets", name), "utf8"),
})));
const appJavascript = javascriptAssets.map(({ content }) => content).join("\n");
const ascentRuntimeJavascript = javascriptAssets
  .filter(({ content }) => content.includes("brinesearch-ascent-pad-road-lines"))
  .map(({ content }) => content)
  .join("\n");
const ascentCatalog = JSON.parse(ascentCatalogJson);
const ascentApproachCatalog = JSON.parse(ascentApproachCatalogJson);
const ascentApproachRuntimeJavascript = javascriptAssets
  .filter(({ content }) => content.includes("ascent-last-highway-to-pad-approaches-20260829-batch2"))
  .map(({ content }) => content)
  .join("\n");
const ascentApproachDataJavascript = javascriptAssets
  .filter(({ name }) => name.startsWith("ascentPadApproaches.batch2-"))
  .map(({ content }) => content)
  .join("\n");

assert.equal(ascentCatalog.schemaVersion, 2, "Source Ascent catalog has the wrong schema");
assert.equal(ascentCatalog.batchId, "ascent-gps-road-lines-20260829-all55", "Source Ascent catalog has the wrong batch ID");
assert.equal(ascentCatalog.summary?.reviewedRouteCount, 55, "Source Ascent catalog does not declare exactly 55 reviewed routes");
assert.equal(ascentCatalog.routes?.length, 55, "Source Ascent catalog does not contain exactly 55 reviewed routes");
assert.ok(ascentRuntimeJavascript, "Built V18 app is missing the shared Ascent map runtime");
for (const route of ascentCatalog.routes) {
  const compiledIdentityPrefix = JSON.stringify({
    padId: route.padId,
    canonicalId: route.canonicalId,
    legacyId: route.legacyId,
    recordRevision: route.recordRevision,
    padName: route.padName,
  }).slice(0, -1);
  assert.ok(
    appJavascript.includes(compiledIdentityPrefix)
      && appJavascript.includes(route.structuredRoadSequenceSha256),
    `Built V18 app is missing reviewed Ascent route ${route.padName}`,
  );
}

assert.deepEqual(
  auditAscentPadApproachesBatch2(),
  [],
  "Source Ascent batch-2 highway-to-pad catalog failed its independent contract audit",
);
assert.equal(ascentApproachCatalog.schemaVersion, 3, "Source Ascent batch-2 catalog has the wrong schema");
assert.equal(
  ascentApproachCatalog.batchId,
  "ascent-last-highway-to-pad-approaches-20260829-batch2",
  "Source Ascent batch-2 catalog has the wrong batch ID",
);
assert.equal(
  ascentApproachCatalog.scope,
  "last-exact-highway-identity-bounded-start-to-frozen-pad-gps",
  "Source Ascent batch-2 catalog conflates exact road identity with start-coordinate authority",
);
assert.equal(ascentApproachCatalog.rules?.candidateStartRequiresExactMasterLastHighwayRoadIdAnchor, true, "Source Ascent batch-2 catalog does not require exact-master roadId start anchoring");
assert.equal(ascentApproachCatalog.rules?.noFuzzyOrUnanchoredNameOnlyCandidateStartMatching, true, "Source Ascent batch-2 catalog permits fuzzy or unanchored name-only candidate starts");
assert.equal(ascentApproachCatalog.rules?.maxStartToDestinationAirMiles, 25, "Source Ascent batch-2 catalog has the wrong spatial relevance boundary");
assert.equal(ascentApproachCatalog.summary?.sourcePadCount, 192, "Source Ascent batch-2 catalog does not bind 192 source pads");
assert.equal(ascentApproachCatalog.summary?.outputPadCount, 192, "Source Ascent batch-2 catalog does not contain 192 outcomes");
assert.equal(ascentApproachCatalog.summary?.routedDisplayCount, 111, "Source Ascent batch-2 routed-display count changed");
assert.equal(ascentApproachCatalog.summary?.routedFailClosedCount, 0, "Source Ascent batch-2 routed fail-closed count changed");
assert.equal(ascentApproachCatalog.summary?.pinOnlyCount, 81, "Source Ascent batch-2 pin-only count changed");
assert.equal(ascentApproachCatalog.summary?.retainedRouterUnverifiedRouteCount, 16, "Source Ascent batch-2 retained no-receipt route count changed");
assert.equal(ascentApproachCatalog.summary?.graphEvidenceReceiptCount, 95, "Source Ascent batch-2 graph receipt count changed");
assert.equal(ascentApproachCatalog.summary?.appliedGraphEvidenceReceiptCount, 95, "Source Ascent batch-2 applied graph receipt count changed");
assert.equal(ascentApproachCatalog.summary?.graphEvidenceNamedRunCount, 565, "Source Ascent batch-2 graph-named run count changed");
assert.equal(ascentApproachCatalog.summary?.graphEvidenceOrderedExactRunCount, 203, "Source Ascent batch-2 ordered exact run count changed");
assert.equal(ascentApproachCatalog.summary?.graphEvidenceNamedNeutralRunCount, 495, "Source Ascent batch-2 graph-named neutral run count changed");
assert.equal(ascentApproachCatalog.summary?.graphEvidenceUnresolvedRunCount, 802, "Source Ascent batch-2 unresolved graph run count changed");
assert.equal(ascentApproachCatalog.summary?.remoteStartRejectedPinOnlyCount, 5, "Source Ascent batch-2 remote-start rejection count changed");
assert.equal(ascentApproachCatalog.summary?.exactIntersectionStartCount, 32, "Source Ascent batch-2 exact-intersection start count changed");
assert.equal(ascentApproachCatalog.summary?.candidateNearestHighwayStartCount, 79, "Source Ascent batch-2 bounded candidate-start count changed");
assert.equal(ascentApproachCatalog.summary?.osrmCandidateRequestCount, 119, "Source Ascent batch-2 build-time route-request count changed");
assert.equal(ascentApproachCatalog.summary?.solidSectionCount, 1514, "Source Ascent batch-2 solid-section count changed");
assert.equal(ascentApproachCatalog.summary?.solidUnapprovedSectionCount, 1444, "Source Ascent batch-2 solid-neutral section count changed");
assert.equal(Object.hasOwn(ascentApproachCatalog.summary || {}, "dashedSectionCount"), false, "Source Ascent batch-2 summary still contains dashed sections");
assert.equal(ascentApproachCatalog.summary?.nontrivialGpsTetherCount, 96, "Source Ascent batch-2 GPS-tether count changed");
assert.equal(ascentApproachCatalog.summary?.totalToGpsWithheldCount, 96, "Source Ascent batch-2 withheld-total count changed");
assert.equal(ascentApproachCatalog.summary?.maximumDisplayedStartToDestinationAirMiles, 14.306095, "Source Ascent batch-2 maximum displayed-start distance changed");
assert.equal(ascentApproachCatalog.summary?.productionWrites, 0, "Source Ascent batch-2 catalog declares a production write");
assert.equal(ascentApproachCatalog.summary?.googleUrlChanges, 0, "Source Ascent batch-2 catalog declares a Google URL change");
assert.equal(ascentApproachCatalog.summary?.redGeometryCount, 0, "Source Ascent batch-2 catalog contains red geometry");
assert.equal(ascentApproachCatalog.records?.length, 192, "Source Ascent batch-2 catalog does not contain exactly 192 records");
assert.ok(ascentApproachRuntimeJavascript, "Built V18 app is missing the separate Ascent batch-2 approach runtime");
assert.ok(ascentApproachDataJavascript, "Built V18 app is missing the lazy Ascent batch-2 data chunk");
for (const record of ascentApproachCatalog.records) {
  const compiledIdentityPrefix = JSON.stringify({
    padId: record.padId,
    canonicalId: record.canonicalId,
    legacyId: record.legacyId,
    recordRevision: record.recordRevision,
    padName: record.padName,
  }).slice(0, -1);
  assert.ok(
    ascentApproachDataJavascript.includes(compiledIdentityPrefix),
    `Built V18 app is missing Ascent batch-2 approach ${record.padName}`,
  );
  if (record.status !== "ROUTED_DISPLAY") {
    assert.equal(record.start, null, `Non-display batch-2 record ${record.padName} retained a candidate start`);
    assert.deepEqual(record.roadCoordinates, [], `Non-display batch-2 record ${record.padName} retained route geometry`);
    assert.deepEqual(record.sections, [], `Non-display batch-2 record ${record.padName} retained measured sections`);
    assert.equal(record.gpsTether, null, `Non-display batch-2 record ${record.padName} retained a GPS tether`);
    assert.equal(record.mileage?.roadDistanceMeters, null, `Non-display batch-2 record ${record.padName} retained road mileage`);
    assert.equal(record.mileage?.totalToGpsMeters, null, `Non-display batch-2 record ${record.padName} retained total mileage`);
  } else {
    assert.equal(record.start?.anchoredRoadId, record.lastHighway?.roadId, `Displayed batch-2 record ${record.padName} is not bound to its exact master highway roadId`);
    assert.ok(record.start?.startToDestinationAirMiles <= 25, `Displayed batch-2 record ${record.padName} starts more than 25 air miles from its GPS`);
    assert.ok(record.sections.every((section) => section.lineStyle === "solid" || section.lineStyle === "none"), `Displayed batch-2 record ${record.padName} contains a dotted or dashed section`);
    assert.ok(record.gpsTether === null || record.gpsTether.lineStyle === "solid", `Displayed batch-2 record ${record.padName} contains a dotted or dashed GPS tether`);
  }
}
for (const padName of ["CENA", "NOELLE", "ROXY", "SPORT", "TANNER"]) {
  const record = ascentApproachCatalog.records.find((entry) => entry.padName === padName);
  assert.equal(record?.status, "PIN_ONLY", `${padName} is not pin-only after the spatial relevance gate`);
  assert.equal(record?.reason, "candidate_start_exceeds_25_air_miles_from_destination", `${padName} has the wrong remote-start hold reason`);
}

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
assert.match(appJavascript, /Reviewed Ascent route lines shown:/, "Built V18 app is missing the accessible all-55 Ascent route disclosure");
assert.match(appJavascript, /Reviewed Ascent named roads · solid teal/, "Built V18 app is missing the solid reviewed-network key");
assert.match(appJavascript, /GPS-only tether · thin solid neutral · not road geometry/, "Built V18 app is missing the solid neutral unapproved-GPS-tether key");
assert.match(appJavascript, /Measured last-highway approach/, "Built V18 app is missing measured highway-to-pad directions");
assert.match(appJavascript, /Exact highway-road intersection start/, "Built V18 app is missing the exact-intersection start label");
assert.match(appJavascript, /Bounded candidate point on the last named highway · not an approved handoff/, "Built V18 app presents a bounded candidate as an exact handoff");
assert.match(appJavascript, /Exact identity match · solid teal/, "Built V18 app is missing the exact batch-2 step authority");
assert.match(appJavascript, /Unnamed \/ unapproved · solid neutral/, "Built V18 app is missing the truthful unnamed batch-2 step authority");
assert.match(appJavascript, /Unverified \/ unapproved · solid neutral/, "Built V18 app is missing the truthful unverified batch-2 step authority");
assert.match(appJavascript, /Measured road sections:/, "Built V18 app is missing the batch-2 routed-section mileage total");
assert.match(appJavascript, /No total-to-GPS mileage is shown/, "Built V18 app is missing the withheld GPS-total disclosure");
assert.match(appJavascript, /No candidate line, turn mileage, or route total is shown/, "Built V18 app exposes rejected batch-2 candidate evidence");
assert.match(appJavascript, /No exact last Interstate, U\.S\., or state highway road identity is on file/, "Built V18 app misstates missing road identity as an exact handoff");
assert.match(appJavascript, /No bounded highway start passed the identity and distance checks/, "Built V18 app misstates the bounded-start gate");
assert.match(appJavascript, /The exact last-highway anchor was more than 25 air miles from the saved GPS/, "Built V18 app is missing the remote-start pin-only disclosure");
assert.match(appJavascript, /Fail-closed and pin-only records add no line/, "Built V18 app is missing the batch-2 pin-only map boundary");
assert.match(appJavascript, /No approach line or measured mileage is shown because this record failed closed/, "Built V18 app is missing selected batch-2 fail-closed disclosure");
assert.match(appJavascript, /Straight GPS tether · not road geometry/, "Built V18 app is missing the separate batch-2 GPS tether label");
assert.match(appJavascript, /unapproved_gps_tether/, "Built V18 app is missing the explicit GPS tether authority");
assert.match(appJavascript, /brinesearch-ascent-pad-road-lines/, "Built V18 app is missing the shared all-55 native source");
assert.match(appJavascript, /No red continuation is drawn:/, "Built V18 app is missing the evidence-gated red-tail disclosure");
assert.match(appJavascript, /State and U\.S\. routes remain teal/, "Built V18 app no longer guarantees highway routes stay teal");
assert.match(appJavascript, /Selected pad route · bright teal/, "Built V18 app is missing the selection-only partial-route key");
assert.match(appJavascript, /Teal arrival/, "Built V18 app is missing BANNOCK's selected teal arrival key");
assert.match(appJavascript, /OH-331 → Lafferty-Bannock Road \/ CR-10 → BANNOCK/, "Built V18 app is missing BANNOCK's teal arrival sequence");
assert.match(appJavascript, /Red exit reference/, "Built V18 app is missing BANNOCK's red exit key");
assert.match(appJavascript, /Black Oak Road → OH-149/, "Built V18 app is missing BANNOCK's red exit sequence");
assert.match(appJavascript, /Red is not a restriction or closure/, "Built V18 app does not distinguish BANNOCK exit red from a closure");
assert.match(appJavascript, /Any separate thin solid neutral road-to-GPS tether is unapproved and is not road geometry/, "Built V18 app is missing BANNOCK's GPS tether boundary");
assert.match(appJavascript, /Google Navigate link and road authority are unchanged/, "Built V18 app is missing BANNOCK's navigation-authority boundary");
assert.match(appJavascript, /BANNOCK via Black Oak Road to OH-149 · red/, "Built V18 app is missing BANNOCK's persistent main-map red legend");
assert.match(appJavascript, /BANNOCK's proven outbound reference is the one red feature, by Black Oak Road to OH-149/, "Built V18 app is missing BANNOCK's only-red road-mode explanation");
assert.match(appJavascript, /part of the same shared Ascent route layer/, "Built V18 app is missing BANNOCK's shared teal/red accessible description");
assert.match(appJavascript, /Collapse map controls to the left/, "Built V18 app is missing the compact map-control action");
assert.match(appJavascript, /Show map controls/, "Built V18 app is missing the map-control restore action");
assert.doesNotMatch(appJavascript, /safe map points|Red exitBANNOCK/, "Built V18 app retained a removed top map badge");
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
assert.doesNotMatch(ascentRuntimeJavascript, /router\.project-osrm\.org|\/route\/v1\/driving/, "Built V18 Ascent map runtime contains a browser route-service endpoint");
assert.doesNotMatch(ascentApproachRuntimeJavascript, /router\.project-osrm\.org|\/route\/v1\/driving/, "Built V18 Ascent batch-2 runtime contains a browser route-service endpoint");
assert.doesNotMatch(ascentApproachDataJavascript, /AIza[0-9A-Za-z_-]{25,}|sb_(?:secret|publishable)_[0-9A-Za-z_-]+|service[_-]?role|supabase\.co/i, "Built V18 Ascent batch-2 data contains a key or database material");
assert.doesNotMatch(ascentApproachRuntimeJavascript, /AIza[0-9A-Za-z_-]{25,}|sb_secret_[0-9A-Za-z_-]+|service[_-]?role/i, "Built V18 Ascent batch-2 runtime contains a Google key or privileged database material");
assert.doesNotMatch(appJavascript, /Measured total to saved GPS/, "Built V18 app incorrectly includes a straight GPS tether in approach mileage");
assert.doesNotMatch(appJavascript, /brinesearch-bannock-road-reference/, "Built V18 app retained BANNOCK's duplicate standalone road source");
assert.doesNotMatch(appJavascript, /brinesearch\.editorSession\.v1|https?:\/\/brinesearch\.com\/index\.html#|private_review_notes|service[_-]?role/i, "Built V18 app contains an old-app bridge, private review fields, or privileged key material");

console.log("Verified V18 built runtime: the frozen all-55 catalog and separate 192-record last-highway-to-pad catalog are static and independently validated; exact solid teal prefixes, solid neutral unresolved remainders, and thin solid neutral GPS tethers remain distinct; BANNOCK is the only red exit; and no browser routing or privileged material is bundled.");
