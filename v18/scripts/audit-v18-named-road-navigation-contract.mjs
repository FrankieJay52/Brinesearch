import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");
const errors = [];
const sha256Text = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const sha256Json = (value) => sha256Text(JSON.stringify(value));

const pad = read("v18/src/features/pad/PadPage.tsx");
const map = read("v18/src/features/map/MapPage.tsx");
const fieldDirection = read("v18/src/features/map/selectedPadFieldDirectionDisplay.ts");
const bannockRoadDisplay = JSON.parse(read("v18/src/features/map/bannockRoadDisplay.json"));
const ascentPadRoadDisplays = read("v18/src/features/map/ascentPadRoadDisplays.ts");
const ascentPadRoadLayers = read("v18/src/features/map/ascentPadRoadLayers.ts");
const artifactImport = ascentPadRoadDisplays.match(/import artifactJson from "\.\/([^"\n]+\.json)";/u)?.[1];
let ascentPadRoadArtifact = null;
if (!artifactImport) errors.push("Ascent display runtime does not declare one static JSON catalog");
else {
  try {
    ascentPadRoadArtifact = JSON.parse(read(`v18/src/features/map/${artifactImport}`));
  } catch (error) {
    errors.push(`Ascent display catalog cannot be read: ${String(error)}`);
  }
}
const highwayReference = read("v18/src/features/map/highwayReference.ts");
const preview = read("v18/src/features/pad/PadMapPreview.tsx");
const reviewed = read("v18/src/data/reviewedNavigationCandidates.ts");
const status = read("v18/src/data/status.ts");
const contract = read("docs/V18_NAMED_ROAD_NAVIGATION_CONTRACT.md");
const packageJson = JSON.parse(read("v18/package.json"));

function requireText(source, needle, label = needle) {
  if (!source.includes(needle)) errors.push(`missing ${label}`);
}

function forbid(source, pattern, label) {
  if (pattern.test(source)) errors.push(label);
}

requireText(contract, "Working is done.", "universal working-is-done rule");
requireText(contract, "Cologie is the first working example, not a higher grade", "Cologie parity rule");
requireText(contract, "The origin is the phone's current location", "phone-current-location origin");
requireText(contract, "The destination is the pad's saved GPS", "saved GPS destination");
requireText(contract, "Every supplied, separately reviewed named-road geometry feature is highlighted", "all supplied named roads are teal");
requireText(contract, "**55 pads**: **46 immutable reviewed\nGoogle handoffs** plus **9 existing database releases**", "exact 55 / 46 / 9 Ascent composition");
requireText(contract, "One build-time display\ncatalog covers that whole set", "one build-time Ascent catalog");
requireText(contract, "offline routed reconstruction through the frozen action\ndestination and ordered controls", "frozen-control offline reconstruction");
requireText(contract, "`unapproved_gps_tether`", "unapproved GPS tether authority");
requireText(contract, "thin neutral dashed segment", "neutral dashed GPS tether display");
requireText(contract, "All 55 catalog entries remain visible", "persistent all-55 Ascent display");
requireText(contract, "Another company filter or disposal-only view hides\nthe Ascent catalog", "Ascent company/disposal filter boundary");
requireText(contract, "makes no route-service call,\nperforms no coordinate hashing", "no browser routing or hashing");
requireText(contract, "updates the existing source data and selection filter instead", "no ordinary layer rebuild");
requireText(contract, "are always teal and are never red", "Interstate, U.S., and state roads never red");
requireText(contract, "DUKE remains teal because CRICKET is farther", "DUKE downstream-pad red hold");
requireText(contract, "the only red\ncontinuation in this 55-pad catalog", "BANNOCK-only red continuation");
requireText(contract, "exact released approved-road overlay remains teal", "persistent approved-road teal");
requireText(contract, "defaults to **All pads + all\napproved roads**", "unified all-pads/all-approved-roads scope");
requireText(contract, "one exact company", "single-company approved-road scope");
requireText(contract, "thinner teal Interstate, U.S., and state highway reference", "structured highway-reference scope");
requireText(contract, "clipped to the 39", "pad-county highway-reference scope");
requireText(contract, "does not match road names", "no highway name matching");
requireText(contract, "Solid teal shows the routable arrival from OH-331 along Lafferty-Bannock", "BANNOCK teal arrival rule");
requireText(contract, "Red is not a\nrestriction or closure", "BANNOCK red exit-not-closure rule");
requireText(contract, "Both the teal OH-331 arrival and red\nOH-149 exit remain visible on the main **All pads + all approved roads** map", "BANNOCK persistent main-map teal/red roads");
requireText(contract, "shared reviewed-Ascent catalog owns both BANNOCK's teal arrival and proved\nred continuation", "BANNOCK shared all-55 source");
requireText(contract, "byte-stable Google Navigate link", "BANNOCK working URL remains stable");
requireText(contract, "PROMOTE <PAD NAME> TO STATE 1", "explicit promotion trigger");

requireText(pad, "Everyday driver navigation does not wait for State-1 receipt checks", "immediate everyday Navigate");
requireText(pad, "A later\n  // State-1 release does not outrank or silently replace it", "working URL precedence");
requireText(pad, 'googleHandoff.mode !== "named_approach"', "record-bound handoff eligibility");
requireText(pad, "if (googleRouteAction && view.mode === \"named_approach\") return googleRouteAction", "selected named approach priority");
requireText(pad, "if (view.selectedRouteIsPrimary && reviewedCandidate)", "working reviewed handoff priority");
requireText(pad, "if (googleRouteAction) return googleRouteAction", "existing promoted-route fallback");
requireText(pad, "padDestinationNavigationUrl(pad)", "GPS-only fallback");
if ((pad.match(/<FixedNavigateAction\b/g) || []).length !== 1) errors.push("pad page does not render exactly one driver Navigate action");

requireText(map, "const selectedReviewedNavigation = eligibleReviewedNavigation", "immediate map reviewed handoff");
requireText(map, "(!selectedReviewedNavigation ? promotedNavigationUrl : null)", "working URL preserved above promotion metadata");
requireText(map, "? selectedNamedApproach.geometry", "named-approach display geometry");
requireText(map, "working static Google handoff never\n  // suppresses separately supplied pad-bound geometry", "static handoff does not suppress supplied geometry");
requireText(map, "geometry, draw no teal", "map no-fake-teal boundary");
requireText(map, '"line-color": "#14b8a6"', "persistent approved-road teal source layer");
requireText(map, 'map.setPaintProperty(companyRoadLineLayerId, "line-color", "#14b8a6")', "persistent approved-road teal after style changes");
requireText(map, "fallbackApplied ? companyRoadRowsRef.current : []", "approved-road teal on basemap fallback");
requireText(map, "const mapLibreRoadRows = fallbackApplied ? [] : companyRoadRowsRef.current", "single approved-network renderer");
requireText(map, "drawRoute(context, map, selectedId ? geometry : null)", "partial selected-pad display geometry");
requireText(map, "ascentPadRoadDisplaysForDirectory(snapshot?.rows || [])", "exact-record Ascent line binding");
requireText(map, 'companyFilter === "all" || companyFilter === "Ascent"', "Ascent All/company persistent scope");
requireText(map, "syncAscentPadRoadLayers(", "persistent Ascent native line lifecycle");
requireText(map, "syncAscentPadRoadSelection(mapRef.current, selectedId)", "selected Ascent line emphasis");
requireText(map, "Highway reference + {visibleAscentPadRoadDisplays.length} reviewed Ascent routes", "dynamic reviewed Ascent route count");
requireText(map, "Reviewed Ascent route lines shown:", "accessible reviewed Ascent catalog description");
requireText(map, "visibleAscentPadRoadDisplays.map((display) => display.padName)", "accessible exact Ascent names");
requireText(map, "Count: {visibleAscentPadRoadDisplays.length}", "accessible exact Ascent dynamic count");
requireText(map, "Reviewed Ascent named roads · solid teal", "solid teal reviewed-network legend");
requireText(map, "GPS-only tether · thin dashed · never approved road", "neutral dashed GPS tether legend");
requireText(map, "A thin dashed GPS-only tether is unapproved and never an approved road.", "GPS tether authority disclosure");
requireText(map, "No red continuation is drawn:", "truthful missing-red explanation");
requireText(map, "State and U.S. routes remain teal.", "selected-card state road color rule");
requireText(map, "selected ? selectedPadFieldDirectionDisplayForPad(selected) : null", "exact selected BANNOCK field display guard");
requireText(map, 'drawSelectedPadFieldDirectionLine(context, map, display.inbound, "#52e4bd", 5)', "BANNOCK teal arrival stroke");
requireText(map, 'drawSelectedPadFieldDirectionLine(context, map, display.outbound, "#ef4444", 5)', "BANNOCK selected red exit stroke");
requireText(map, "Red is not a restriction or closure.", "BANNOCK red legend authority boundary");
requireText(map, "BANNOCK's proven outbound reference is the one red feature, by Black Oak Road to OH-149.", "BANNOCK shared-source red scope");
requireText(map, "BANNOCK via Black Oak Road to OH-149 · red", "BANNOCK persistent red legend");
requireText(map, "part of the same shared Ascent route layer", "BANNOCK shared teal/red accessible disclosure");
requireText(fieldDirection, 'padId: "333598ca-37b3-4b44-9411-a490cc3da672"', "exact BANNOCK field display identity");
requireText(fieldDirection, 'legacyId: "ascent--bannock"', "BANNOCK legacy identity");
requireText(fieldDirection, 'recordRevision: "1786744183028038"', "BANNOCK field display revision");
requireText(fieldDirection, 'pad.coordinate.role !== "driver_entrance"', "BANNOCK exact entrance role");
requireText(fieldDirection, "matches.length === 1 ? matches[0] : null", "BANNOCK unique directory binding");
requireText(map, 'const [companyFilter, setCompanyFilter] = useState<"all" | string>("all")', "unified default company scope");
requireText(map, 'aria-label="Filter pads and approved roads by company"', "unified pads/roads company selector");
requireText(map, '<option value="all">All pads + all approved roads</option>', "unified all pads and roads option");
requireText(map, "syncHighwayReferenceLayers(map)", "highway-reference presentation lifecycle");
requireText(map, "Pad-county Interstate / U.S. / state reference · thin teal", "pad-county highway-reference legend");
requireText(highwayReference, '["within", highwayReferencePadCountyScope]', "pad-county highway-reference clip");
requireText(map, "Exact approved route road · stronger teal", "approved-road stronger-teal legend");
requireText(highwayReference, '["get", "network"]', "structured highway network filter");
for (const network of ["us-interstate", "us-highway", "us-state"]) requireText(highwayReference, `"${network}"`, `${network} highway identity`);
requireText(highwayReference, 'sourceLayer: connected[0]["source-layer"]', "Liberty connected-road source-layer reuse");
requireText(map, "selectedGpsNavigationUrl && selectedGpsDestination", "map GPS-only fallback");
requireText(preview, "never replaced with prose, waypoints, straight lines, or nearest-road guesses", "preview no-inference rule");
requireText(preview, "for (const line of lines)", "preview renders every supplied named-road line");
requireText(status, "displayProjection", "display geometry normalized separately from authority");
requireText(status, "State-1 and public-route authority remain held. Reviewed named-road geometry is display only.", "held geometry remains display-only");
requireText(reviewed, "byte-stable unless wrong-road evidence", "record-bound URL stability comment");
requireText(reviewed, "contracts themselves remain geometry-free", "static candidate geometry boundary");
requireText(reviewed, "build-time catalog may reconstruct display-only routable lines", "separate build-time display catalog");
requireText(reviewed, "The browser never routes or rewrites", "no browser routing or navigation mutation");

if (bannockRoadDisplay.inbound?.pointCount !== 95 || bannockRoadDisplay.inbound?.coordinates?.length !== 95) errors.push("BANNOCK inbound field geometry is not the frozen 95-point line");
if (bannockRoadDisplay.outbound?.pointCount !== 239 || bannockRoadDisplay.outbound?.coordinates?.length !== 239) errors.push("BANNOCK outbound field geometry is not the frozen 239-point line");
if (bannockRoadDisplay.displayScope !== "persistent-main-map-teal-arrival-and-red-exit" || bannockRoadDisplay.inbound?.visibility !== "main-map-all-and-ascent" || bannockRoadDisplay.outbound?.visibility !== "main-map-all-and-ascent") errors.push("BANNOCK teal/red visibility scope is not frozen to persistent All/Ascent road colors");
if (JSON.stringify(bannockRoadDisplay.inbound?.coordinates?.at(-1)) !== JSON.stringify(bannockRoadDisplay.outbound?.coordinates?.[0])) errors.push("BANNOCK teal/red field geometry no longer shares one exact road seam");
if (bannockRoadDisplay.noConnectorToGps !== true || bannockRoadDisplay.continuity?.gpsConnectorIncluded !== false) errors.push("BANNOCK field display includes or permits an invented GPS connector");

requireText(ascentPadRoadDisplays, 'authority: "unapproved_gps_tether"', "Ascent GPS tether authority type");
requireText(ascentPadRoadDisplays, 'lineStyle: "dashed"', "Ascent GPS tether dashed style type");
requireText(ascentPadRoadDisplays, "route.gpsLeg", "separate Ascent GPS tether validation");
requireText(ascentPadRoadDisplays, "pad.structuredRoadSequence === display.structuredRoadSequence", "exact directory road-sequence binding");
requireText(ascentPadRoadDisplays, "const directoryCoordinate = mapDisplayCoordinate(pad)", "exact directory coordinate selection");
requireText(ascentPadRoadDisplays, "directoryCoordinate?.longitude === display.directoryCoordinate[0]", "exact directory coordinate binding");
requireText(ascentPadRoadDisplays, "sameCoordinate(candidate.coordinates[0], expectedArrivalEndpoint)", "BANNOCK red starts at the reviewed road seam");
requireText(ascentPadRoadDisplays, "sameCoordinate(proof.lastPadSavedGps, expectedSavedPin)", "BANNOCK red proof binds the frozen GPS");
requireText(ascentPadRoadDisplays, "proof.redGeometrySha256 === candidate.geometrySha256", "BANNOCK red proof binds exact geometry");
requireText(ascentPadRoadDisplays, 'nextHighway.roadClass === "interstate" || nextHighway.roadClass === "us" || nextHighway.roadClass === "state"', "red must end at an Interstate, U.S., or state junction");
requireText(ascentPadRoadLayers, 'const tealFilter: FilterSpecification = ["==", ["get", "colorRole"], "teal"]', "Ascent teal role-only layer filter");
requireText(ascentPadRoadLayers, 'const gpsFilter: FilterSpecification = ["==", ["get", "colorRole"], "gps"]', "Ascent neutral GPS role-only layer filter");
requireText(ascentPadRoadLayers, 'paint: { "line-color": "#2dd4bf"', "Ascent teal arrival paint");
requireText(ascentPadRoadLayers, "[display.arrival, display.gpsLeg, display.redContinuation]", "one shared all-55 teal/GPS/red source");
requireText(ascentPadRoadLayers, '"line-dasharray"', "Ascent GPS tether dashed paint");
requireText(ascentPadRoadLayers, "geoJsonSource.setData(data)", "Ascent catalog reuses its native source");
requireText(ascentPadRoadLayers, "syncAscentPadRoadSelection(map, selectedPadId)", "Ascent selection updates existing layers");

forbid(ascentPadRoadDisplays, /sha256|createHash|crypto\.subtle|TextEncoder/u, "Ascent browser runtime performs coordinate hashing");
forbid(`${map}\n${ascentPadRoadDisplays}\n${ascentPadRoadLayers}`, /router\.project-osrm\.org|\/route\/v1\/driving/u, "Ascent browser runtime contains a route-service call");
forbid(ascentPadRoadLayers, /export function syncAscentPadRoadLayers[\s\S]{0,300}\{[\s\S]{0,120}clearAscentPadRoadLayers\(map\);/u, "Ascent catalog unconditionally rebuilds its layer family");

function validCoordinate(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function sameCoordinate(left, right) {
  return validCoordinate(left) && validCoordinate(right)
    && left[0] === right[0] && left[1] === right[1];
}

const routes = Array.isArray(ascentPadRoadArtifact?.routes) ? ascentPadRoadArtifact.routes : [];
const routeIds = new Set(routes.map((route) => route.padId));
const expectedSummary = {
  reviewedRouteCount: 55,
  reviewedContractCount: 46,
  atomicPrimaryCoreCount: 9,
  exactPublicGraphCount: 1,
  exactAtomicReviewedCoreCount: 8,
  existingFrozenBannockCount: 1,
  osrmReviewedArrivalRecordCount: 45,
  osrmSolidArrivalCount: 44,
  staticMatchedThroughNetworkEndpointCount: 31,
  staticPostNamedTailSplitCount: 13,
  staticFailClosedAnchorCount: 1,
  staticDashedCandidateRouteCount: 14,
  osrmUnapprovedGpsTailCount: 8,
  osrmRequestCount: 53,
  osrmRoutableCount: 53,
  osrmFailureCount: 0,
  gpsLegCount: 54,
  redContinuationCount: 1,
  strictNameOrderMatchedCount: 48,
  strictNameOrderDivergedCount: 7,
  productionWrites: 0,
};

if (ascentPadRoadArtifact?.schemaVersion !== 2
  || ascentPadRoadArtifact?.batchId !== "ascent-gps-road-lines-20260829-all55"
  || ascentPadRoadArtifact?.displayScope !== "persistent-main-map-all-and-ascent"
  || Object.entries(expectedSummary).some(([key, value]) => ascentPadRoadArtifact?.summary?.[key] !== value)
  || ascentPadRoadArtifact?.rules?.exactFrozenDestinationBinding !== true
  || ascentPadRoadArtifact?.rules?.frozenGoogleUrlsAndControlsRemainUnchanged !== true
  || ascentPadRoadArtifact?.rules?.arrivalContainsNetworkGeometryOnly !== true
  || ascentPadRoadArtifact?.rules?.staticSolidGeometryUsesOrderedExactIdentityAllowlist !== true
  || ascentPadRoadArtifact?.rules?.staticSolidGeometryStopsAtFirstUnreviewedStep !== true
  || ascentPadRoadArtifact?.rules?.divergentStaticRouteFailsClosed !== true
  || ascentPadRoadArtifact?.rules?.gpsLegIsSeparateDashedUnapprovedTether !== true
  || ascentPadRoadArtifact?.rules?.noSyntheticRoadConnector !== true
  || ascentPadRoadArtifact?.rules?.redContinuationRequiresExactNoDownstreamPadProof !== true
  || ascentPadRoadArtifact?.rules?.interstateUsAndStateRoutesNeverRed !== true
  || routes.length !== 55
  || routeIds.size !== 55) {
  errors.push("Ascent all-55 catalog schema, accounting, or fail-closed rules changed");
}

const allowedArrivalRoles = new Set([
  "reviewed_named_road_arrival",
  "fail_closed_reviewed_network_anchor",
  "exact_reviewed_core_arrival",
  "exact_public_graph_arrival",
  "existing_frozen_reviewed_arrival",
]);
for (const route of routes) {
  const destination = [route.destination?.longitude, route.destination?.latitude];
  const directoryCoordinate = [route.directoryCoordinate?.longitude, route.directoryCoordinate?.latitude];
  const arrival = route.arrival;
  const arrivalCoordinates = arrival?.coordinates;
  if (route.company !== "Ascent"
    || !validCoordinate(destination)
    || !validCoordinate(directoryCoordinate)
    || typeof route.structuredRoadSequence !== "string"
    || !route.structuredRoadSequence
    || route.structuredRoadSequenceSha256 !== sha256Json(route.structuredRoadSequence)
    || arrival?.type !== "LineString"
    || arrival?.colorRole !== "teal"
    || typeof arrival?.approvedRoad !== "boolean"
    || arrival.approvedRoad !== (arrival.lineRole === "exact_public_graph_arrival")
    || arrival?.pattern !== "solid"
    || arrival?.visibility !== "main-map-all-and-ascent"
    || !allowedArrivalRoles.has(arrival?.lineRole)
    || !Array.isArray(arrivalCoordinates)
    || arrivalCoordinates.length < 2
    || arrival?.pointCount !== arrivalCoordinates.length
    || !arrivalCoordinates.every(validCoordinate)) {
    errors.push(`${route.padName || route.padId} has an invalid solid reviewed-network arrival`);
    continue;
  }

  const gpsLeg = route.gpsLeg;
  if (gpsLeg === null) {
    if (!sameCoordinate(arrivalCoordinates.at(-1), destination)) {
      errors.push(`${route.padName || route.padId} has neither an exact-GPS arrival nor a GPS tether`);
    }
  } else if (gpsLeg?.type !== "LineString"
    || gpsLeg?.colorRole !== "gps"
    || gpsLeg?.lineRole !== "unapproved_gps_tether"
    || gpsLeg?.pattern !== "dashed"
    || gpsLeg?.lineStyle !== "dashed"
    || gpsLeg?.authority !== "unapproved_gps_tether"
    || gpsLeg?.approvedRoad !== false
    || gpsLeg?.navigationGeometry !== false
    || gpsLeg?.visibility !== "main-map-all-and-ascent"
    || !Array.isArray(gpsLeg?.coordinates)
    || gpsLeg.coordinates.length < 2
    || gpsLeg.pointCount !== gpsLeg.coordinates.length
    || !gpsLeg.coordinates.every(validCoordinate)
    || !sameCoordinate(gpsLeg.coordinates[0], arrivalCoordinates.at(-1))
    || !sameCoordinate(gpsLeg.coordinates.at(-1), destination)) {
    errors.push(`${route.padName || route.padId} has an invalid unapproved GPS tether`);
  }

  const red = route.redContinuation;
  if (red !== null && (route.padName !== "BANNOCK"
    || red?.type !== "LineString"
    || red?.colorRole !== "red"
    || red?.approvedRoad !== false
    || red?.visibility !== "main-map-all-and-ascent"
    || red?.roadClass !== "county"
    || typeof red?.exactRoadIdentity !== "string"
    || !red.exactRoadIdentity
    || !Array.isArray(red?.coordinates)
    || red.coordinates.length !== 239
    || red.pointCount !== red.coordinates.length
    || !red.coordinates.every(validCoordinate)
    || !sameCoordinate(red.coordinates[0], arrivalCoordinates.at(-1))
    || !sameCoordinate(red.coordinates.at(-1), red.nextHighway?.junction)
    || red.nextHighway?.roadClass !== "state"
    || red.noDownstreamPadsProof?.lastPadId !== route.padId
    || !sameCoordinate(red.noDownstreamPadsProof?.lastPadSavedGps, destination)
    || red.noDownstreamPadsProof?.exactRoadIdentity !== red.exactRoadIdentity
    || red.noDownstreamPadsProof?.redGeometrySha256 !== red.geometrySha256
    || red.geometrySha256 !== sha256Json(red.coordinates))) {
    errors.push(`${route.padName || route.padId} has red geometry without BANNOCK's exact frozen proof`);
  }
}
if (routes.filter((route) => route.gpsLeg).length !== 54) errors.push("Ascent catalog does not contain exactly 54 separate GPS tethers");
if (!String(routes.find((route) => route.padName === "DUKE")?.redDecision?.reason || "").includes("CRICKET")) errors.push("DUKE red hold no longer identifies downstream CRICKET");
if (routes.filter((route) => route.redContinuation !== null).length !== 1
  || routes.find((route) => route.padName === "BANNOCK")?.redContinuation === null) {
  errors.push("BANNOCK's separately proved exit is no longer the sole red feature in the shared catalog");
}

// Load the receipt-bound contracts through Vite so the audit compares the
// catalog with the real 46 immutable URLs and ordered controls. No pad-name list
// or copied URL fixture can silently drift away from the navigation source.
let viteServer;
try {
  const { createServer } = await import("vite");
  viteServer = await createServer({
    root: path.join(root, "v18"),
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
  });
  const navigationModule = await viteServer.ssrLoadModule("/src/data/reviewedNavigationCandidates.ts");
  const receiptRows = navigationModule.ownerApprovalReceiptRowsForAudit();
  const receiptIds = new Set(receiptRows.map((row) => row.padId));
  if (receiptRows.length !== 46 || receiptIds.size !== 46 || receiptRows.some((row) => !row.matchesCurrentContent)) {
    errors.push("The 46 immutable reviewed navigation receipts are incomplete or have content drift");
  }
  for (const row of receiptRows) {
    const contractInput = navigationModule.ownerApprovalReceiptInputForAudit(row.padId);
    const route = routes.find((candidate) => candidate.padId === row.padId);
    if (!contractInput
      || !navigationModule.ownerApprovalPresentationForReceipt(contractInput)
      || !navigationModule.reviewedNavigationUrlMatchesContract(
        contractInput.routeUrl,
        contractInput.routeDestination,
        contractInput.waypoints,
      )
      || !route
      || route.directoryCoordinate?.latitude !== contractInput.trustedDestination.latitude
      || route.directoryCoordinate?.longitude !== contractInput.trustedDestination.longitude
      || route.destination?.latitude !== contractInput.routeDestination.latitude
      || route.destination?.longitude !== contractInput.routeDestination.longitude
      || JSON.stringify(route.source?.requestedControls) !== JSON.stringify(contractInput.waypoints)
      || route.source?.requestedControlSha256 !== sha256Json(contractInput.waypoints)
      || route.source?.navigationUrlSha256 !== sha256Text(contractInput.routeUrl)) {
      errors.push(`${contractInput?.padName || row.padId} no longer has a byte-stable URL/control binding in the display catalog`);
    }
  }
  if (routes.filter((route) => receiptIds.has(route.padId)).length !== 46
    || routes.filter((route) => !receiptIds.has(route.padId)).length !== 9) {
    errors.push("Ascent catalog is not exactly 46 immutable handoffs plus 9 existing database releases");
  }
} catch (error) {
  errors.push(`The reviewed navigation receipts could not be audited: ${String(error)}`);
} finally {
  if (viteServer) await viteServer.close();
}

const expectedSourceKinds = {
  reviewed_contract_osrm_reconstruction: 45,
  atomic_exact_reviewed_core: 8,
  public_exact_graph: 1,
  existing_frozen_bannock_inbound: 1,
};
for (const [kind, expectedCount] of Object.entries(expectedSourceKinds)) {
  if (routes.filter((route) => route.source?.kind === kind).length !== expectedCount) {
    errors.push(`Ascent catalog source count changed for ${kind}`);
  }
}
for (const route of routes) {
  if (route.source?.requestedControlSha256 !== sha256Json(route.source?.requestedControls)
    || route.source?.networkGeometrySha256 !== sha256Json(route.arrival?.coordinates)) {
    errors.push(`${route.padName || route.padId} build-time catalog hashes no longer match their frozen inputs`);
  }
}

forbid(`${pad}\n${map}`, /higherPriorityNavigationCheckState|navigationFallbackAfterHigherPriorityCheck|Live route check unavailable · no fallback opened/u, "runtime still contains State-1 fallback suppression");
forbid(`${pad}\n${map}\n${preview}`, /selectedReviewedNavigation(?:Candidate)?\.geometry|nearest_road|fuzzy_name/u, "runtime can infer display geometry from an unverified candidate");
forbid(map, /isolateSelectedRoute|rgba\(240, 180, 93, \.9\)|<option value="">Roads off|line-opacity", roadMode &&/u, "approved-road network is not persistently teal");
forbid(map, /setPaintProperty\((?:companyRoadLineLayerId|highwayReferenceLineLayerId),\s*"line-color",\s*"#ef4444"/u, "BANNOCK exit red was applied to a generic road layer");
forbid(map, /className="map-(?:data-note|bannock-exit-note)"|safe map points/u, "removed top map badges returned");
forbid(highwayReference, /\["get",\s*"(?:name|ref)"\]/u, "highway reference uses road-name or ref matching");
forbid(`${pad}\n${map}\n${preview}\n${reviewed}`, /AIza[0-9A-Za-z_-]{25,}/u, "Google API key-shaped literal appears in tracked everyday navigation code");

const scripts = packageJson.scripts || {};
if (scripts["verify:data-status"] !== "node scripts/audit-v18-named-road-navigation-contract.mjs") {
  errors.push("default data-status verification is not the everyday named-road audit");
}
for (const promotionAudit of [
  "audit-v18-driver-directory-status-contract.mjs",
  "audit-v18-cologie-public-google-release.mjs",
  "audit-v18-cologie-mobile-google-handoff.mjs",
]) {
  if (!String(scripts["verify:state1-promotion"] || "").includes(promotionAudit)) {
    errors.push(`State-1 promotion command is missing ${promotionAudit}`);
  }
}
if (String(scripts.verify || "").includes("verify:state1-promotion")) {
  errors.push("default verification still invokes State-1 promotion gates");
}

if (errors.length) {
  process.stderr.write(`V18 named-road navigation audit failed:\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}

process.stdout.write("V18 named-road navigation audit passed: 55 reviewed Ascent displays are build-time static, 46 immutable handoffs remain byte-stable, GPS tethers stay unapproved, and State-1 gates are parked.\n");
