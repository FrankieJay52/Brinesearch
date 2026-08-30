import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { auditAscentPadApproachesBatch2 } from "./audit-ascent-pad-approaches-batch2.mjs";

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
const ascentPadApproaches = read("v18/src/features/map/ascentPadApproaches.ts");
const ascentPadApproachArtifact = JSON.parse(read("v18/src/features/map/ascentPadApproaches.batch2.json"));
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
const ownerPresentation = read("docs/issue97-owner-approved-directions-presentation-20260828.md");
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
requireText(contract, "**59 pads**: **50 exact-record\nreviewed Google handoffs** plus **9 existing database releases**", "exact 59 / 50 / 9 Ascent navigation composition");
requireText(contract, "frozen build-time display catalog remains exactly **55 entries**", "frozen 55-entry Ascent display catalog");
requireText(contract, "unchanged **46 owner-approved handoffs**", "unchanged 46 owner-approved handoffs");
requireText(contract, "HELLER, JENNINGS, KEMPER, and\nRED-HILL-FARM", "four additional highway-direct handoffs");
requireText(contract, "**59\nnavigable** and **188 GPS-only** Ascent pads", "59 navigable / 188 GPS-only accounting");
requireText(contract, "offline routed reconstruction\nthrough the frozen action destination and ordered controls", "frozen-control offline reconstruction");
requireText(contract, "`unapproved_gps_tether`", "unapproved GPS tether authority");
requireText(contract, "thin solid neutral segment", "solid neutral GPS tether display");
requireText(contract, "All 55 catalog entries remain visible", "persistent all-55 Ascent display");
requireText(contract, "Another company filter or disposal-only view hides\nthe Ascent catalog", "Ascent company/disposal filter boundary");
requireText(contract, "makes no route-service call,\nperforms no coordinate hashing", "no browser routing or hashing");
requireText(contract, "updates the existing source data and selection filter instead", "no ordinary layer rebuild");
requireText(contract, "separate batch-2 catalog still contains **192 Ascent approach records**", "unchanged 192-record batch-2 catalog");
requireText(contract, "other **188 remain GPS-only for navigation**", "batch-2 188 GPS-only navigation remainder");
requireText(contract, "last Interstate, U.S., or\nstate highway whose **road identity** is exactly supported", "exact last-highway identity boundary");
requireText(contract, "32 start at a stored exact highway-to-next-road intersection and 79\nstart at a build-time nearest-highway candidate", "exact-versus-candidate approach starts");
requireText(contract, "passed the bounded\n100-metre snap gate", "candidate highway-start distance gate");
requireText(contract, "does\nnot assert or approve an intersection, handoff, road identity, or public route", "candidate start has no junction authority");
requireText(contract, "exact\nmaster `roadId` of that record's last highway", "exact master highway roadId start binding");
requireText(contract, "no more than\n25 air miles from the frozen pad GPS", "25-air-mile spatial relevance gate");
requireText(contract, "Fuzzy, nearest-road, name-only, or\nunanchored master-road matching fails closed", "no fuzzy or unanchored identity matching");
requireText(contract, "does not select a road by proximity", "candidate start cannot choose road identity");
requireText(contract, "Every routed section stores its raw distance in metres", "raw routed-section metres");
requireText(contract, "stored road identity or one of its exact aliases", "exact-alias teal boundary");
requireText(contract, "At the first name mismatch", "first-mismatch permanent teal stop");
requireText(contract, "remaining routed movement stays visible as a solid neutral,\nunapproved access line", "solid neutral unapproved remainder");
requireText(contract, "`Unnamed / unapproved access`", "truthful unnamed remainder label");
requireText(contract, "`Unverified / unapproved access`", "truthful unverified remainder label");
requireText(contract, "excluded from all routed-section and\napproach mileage", "straight GPS tether mileage exclusion");
requireText(contract, "or routing fails, the record fails closed to the frozen destination pin", "pin-only fail-closed result");
requireText(contract, "111 routed displays, zero internally rejected\nsuccessful routes, and 81 direct pin-only results", "batch-2 frozen result accounting");
requireText(contract, "CENA, NOELLE,\nROXY, SPORT, and TANNER", "five remote starts named as pin-only");
requireText(contract, "farthest displayed start is\n14.306095 air miles", "maximum retained display start distance");
requireText(contract, "other 16 successful routes are retained as\nsolid neutral with no teal authority", "successful no-receipt routes remain visible without approval");
requireText(contract, "All 111 successful routed results keep\ntheir road geometry, measured sections, and mileage", "successful route geometry and mileage are preserved");
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

requireText(ownerPresentation, "exact frozen 55-entry Ascent display catalog", "owner presentation frozen 55-entry catalog");
requireText(ownerPresentation, "current navigation count to\n**59**, with **188 pads still GPS-only**", "owner presentation 59 / 188 navigation accounting");
requireText(ownerPresentation, "Those four do not inherit an\nowner-approval receipt", "four handoffs remain outside owner approval");
requireText(ownerPresentation, "no row was\nadded to the 46 owner-approval receipts and no row was added to the frozen\n55-entry static display catalog", "four handoffs preserve receipts and static catalog");
requireText(ownerPresentation, "still covers 192\nAscent records", "owner presentation unchanged batch-2 count");
requireText(ownerPresentation, "other **188 remain GPS-only for\nnavigation**", "owner presentation 188 GPS-only remainder");
requireText(ownerPresentation, "32 start at a stored exact\nhighway-to-next-road intersection", "owner presentation exact-intersection count");
requireText(ownerPresentation, "other 79 use a build-time\nnearest-highway candidate", "owner presentation candidate-start count");
requireText(ownerPresentation, "not an approved or exact intersection", "owner presentation candidate authority boundary");
requireText(ownerPresentation, "exact master `roadId` for the\nrecord's last highway", "owner presentation exact master roadId binding");
requireText(ownerPresentation, "within 25 air miles of that pad's frozen GPS", "owner presentation spatial relevance gate");
requireText(ownerPresentation, "Fuzzy, nearest-road, name-only, and unanchored master-road matching are rejected", "owner presentation rejects name-only spatially unanchored matching");
requireText(ownerPresentation, "proximity cannot choose or create the road\nidentity", "owner presentation candidate proximity boundary");
requireText(ownerPresentation, "Each routed section retains its raw distance in\nmetres", "owner presentation raw section metres");
requireText(ownerPresentation, "exact road-identity or exact-alias-matched prefix may be solid teal", "owner presentation exact-alias teal prefix");
requireText(ownerPresentation, "rest of the routed approach remains visible as solid neutral", "owner presentation solid neutral suffix");
requireText(ownerPresentation, "named identity mismatches\nand later unverified sections are labeled `Unverified / unapproved access`", "owner presentation truthful mismatch label");
requireText(ownerPresentation, "excluded from the section and total\napproach mileage", "owner presentation straight-tether mileage exclusion");
requireText(ownerPresentation, "stale record binding fails that record closed to its frozen pin", "owner presentation pin-only fail close");
requireText(ownerPresentation, "111 routed displays, zero internally rejected\nsuccessful routes", "owner presentation batch-2 accounting");
requireText(ownerPresentation, "CENA, NOELLE, ROXY, SPORT, and TANNER", "owner presentation five remote pin-only records");
requireText(ownerPresentation, "farthest retained display start is 14.306095 air miles", "owner presentation maximum retained start distance");
requireText(ownerPresentation, "16 successful no-receipt routes remain visible as solid\nneutral", "owner presentation retains no-receipt route geometry");
requireText(ownerPresentation, "All 111 successful routed results retain their candidate start, road geometry", "owner presentation preserves successful route evidence");

for (const error of auditAscentPadApproachesBatch2()) {
  errors.push(`Batch-2 approach: ${error}`);
}

requireText(pad, "Everyday driver navigation does not wait for State-1 receipt checks", "immediate everyday Navigate");
requireText(pad, "A later\n  // State-1 release does not outrank or silently replace it", "working URL precedence");
requireText(pad, 'googleHandoff.mode !== "named_approach"', "record-bound handoff eligibility");
requireText(pad, "if (googleRouteAction && view.mode === \"named_approach\") return googleRouteAction", "selected named approach priority");
requireText(pad, "if (view.selectedRouteIsPrimary && reviewedCandidate)", "working reviewed handoff priority");
requireText(pad, "if (googleRouteAction) return googleRouteAction", "existing promoted-route fallback");
requireText(pad, "padDestinationNavigationUrl(pad)", "GPS-only fallback");
requireText(pad, "loadAscentPadApproachForPad(pad)", "selected-pad lazy batch-2 approach load");
requireText(pad, 'if (approach.status !== "ROUTED_DISPLAY")', "batch-2 fail-closed pad presentation guard");
requireText(pad, "No candidate line, turn mileage, or route total is shown.", "batch-2 rejected evidence stays out of driver directions");
requireText(pad, "No exact last Interstate, U.S., or state highway road identity is on file.", "missing highway identity is not called a missing exact handoff");
requireText(pad, "No bounded highway start passed the identity and distance checks.", "bounded start hold does not claim an exact handoff");
requireText(pad, "The exact last-highway anchor was more than 25 air miles from the saved GPS.", "remote exact-master start fails closed on the pad page");
requireText(pad, 'aria-label="Measured last-highway approach"', "measured last-highway step presentation");
requireText(pad, "Exact highway-road intersection start", "exact-intersection start label");
requireText(pad, "Bounded candidate point on the last named highway · not an approved handoff", "candidate start is not presented as an exact handoff");
requireText(pad, "ascentPadApproachDirectionAuthorityLabel(direction)", "match-state batch-2 authority label projection");
requireText(pad, "solid neutral, unapproved line", "solid neutral batch-2 presentation");
requireText(pad, "Measured road sections:", "batch-2 routed-section mileage total");
requireText(pad, "No total-to-GPS mileage is shown.", "batch-2 withheld GPS total");
requireText(pad, "straight GPS tether", "batch-2 tether disclosure");
requireText(pad, "is not road geometry and is excluded", "batch-2 tether mileage exclusion disclosure");
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
requireText(map, "Highway reference + {visibleAscentPadRoadDisplays.length} reviewed Ascent routes + {visibleAscentPadApproachDisplays.length} measured approaches", "independent batch-1 and batch-2 map counts");
requireText(map, "Reviewed Ascent route lines shown:", "accessible reviewed Ascent catalog description");
requireText(map, "visibleAscentPadRoadDisplays.map((display) => display.padName)", "accessible exact Ascent names");
requireText(map, "Count: {visibleAscentPadRoadDisplays.length}", "accessible exact Ascent dynamic count");
requireText(map, "loadAscentPadApproachesForDirectory(snapshot.rows)", "lazy remaining-192 directory load");
requireText(map, "ascentPadApproachMapDisplays(ascentPadApproaches)", "batch-2 approach map-display resolver");
requireText(map, "[...visibleAscentPadRoadDisplays, ...visibleAscentPadApproachDisplays]", "shared batch-1 and batch-2 native layer source");
requireText(map, "exact matched sections are solid teal and unresolved access stays visible as solid neutral/unapproved geometry", "batch-2 map color boundary");
requireText(map, "Fail-closed and pin-only records add no line", "batch-2 map pin-only fail close");
requireText(map, "Measured last-highway approach lines shown:", "accessible batch-2 approach count");
requireText(map, "No approach line or measured mileage is shown because this record failed closed", "selected batch-2 fail-closed disclosure");
requireText(map, "No exact last Interstate, U.S., or state highway road identity is on file.", "map missing-highway identity hold wording");
requireText(map, "No bounded highway start passed the identity and distance checks.", "map bounded-start hold wording");
requireText(map, "The exact last-highway anchor was more than 25 air miles from the saved GPS.", "remote exact-master start fails closed on the map");
requireText(map, "Reviewed Ascent named roads · solid teal", "solid teal reviewed-network legend");
requireText(map, "Exact measured approach sections · solid teal", "solid teal measured exact-network legend");
requireText(map, "GPS-only tether · thin solid neutral · not road geometry", "solid neutral GPS tether legend");
requireText(map, "Solid neutral approach/access lines are unresolved and unapproved", "unresolved-access authority disclosure");
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
requireText(ascentPadRoadDisplays, 'lineStyle: "solid"', "Ascent GPS tether solid style type");
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
requireText(ascentPadRoadLayers, 'const unverifiedFilter: FilterSpecification = ["==", ["get", "colorRole"], "unverified"]', "Ascent neutral unresolved-road role-only layer filter");
requireText(ascentPadRoadLayers, 'paint: { "line-color": "#2dd4bf"', "Ascent teal arrival paint");
requireText(ascentPadRoadLayers, "[display.arrival, display.gpsLeg, display.redContinuation]", "one shared all-55 teal/GPS/red source");
forbid(ascentPadRoadLayers, /"line-dasharray"/u, "Ascent feature still paints a dotted or dashed line");
requireText(ascentPadRoadLayers, "geoJsonSource.setData(data)", "Ascent catalog reuses its native source");
requireText(ascentPadRoadLayers, "syncAscentPadRoadSelection(map, selectedPadId)", "Ascent selection updates existing layers");

requireText(ascentPadApproaches, 'import("./ascentPadApproaches.batch2.json")', "lazy static batch-2 JSON import");
requireText(ascentPadApproaches, 'artifact.batchId === "ascent-last-highway-to-pad-approaches-20260829-batch2"', "batch-2 runtime header gate");
requireText(ascentPadApproaches, 'artifact.scope === "last-exact-highway-identity-bounded-start-to-frozen-pad-gps"', "batch-2 exact-identity/bounded-start scope gate");
requireText(ascentPadApproaches, "const maximumStartToDestinationAirMiles = 25", "batch-2 loader spatial relevance limit");
requireText(ascentPadApproaches, "rules.candidateStartRequiresExactMasterLastHighwayRoadIdAnchor === true", "batch-2 loader exact master anchor rule");
requireText(ascentPadApproaches, "rules.noFuzzyOrUnanchoredNameOnlyCandidateStartMatching === true", "batch-2 loader rejects fuzzy/unanchored candidate identity");
requireText(ascentPadApproaches, "start.anchoredRoadId !== lastHighway.roadId", "batch-2 loader exact master roadId binding");
requireText(ascentPadApproaches, "measuredStartToDestinationAirMiles > maximumStartToDestinationAirMiles", "batch-2 loader independently enforces 25-air-mile boundary");
requireText(ascentPadApproaches, "Name-only or remote starts fail closed before any geometry is exposed", "batch-2 loader remote-start fail close");
requireText(ascentPadApproaches, "pad.structuredRoadSequence === record.structuredRoadSequence", "batch-2 exact road-sequence binding");
requireText(ascentPadApproaches, "directoryCoordinate?.longitude === record.destination.coordinates[0]", "batch-2 exact destination binding");
requireText(ascentPadApproaches, 'const presentationFailedClosed = status !== "ROUTED_DISPLAY"', "batch-2 rejected runtime scrub decision");
requireText(ascentPadApproaches, "roadCoordinates: presentationFailedClosed ? [] : roadCoordinates", "batch-2 rejected geometry scrub");
requireText(ascentPadApproaches, "sections: presentationFailedClosed ? [] : sections", "batch-2 rejected sections scrub");
requireText(ascentPadApproaches, "gpsTether: presentationFailedClosed ? null : gpsTether", "batch-2 rejected tether scrub");
requireText(ascentPadApproaches, "directions: presentationFailedClosed ? [] : measuredDirections(sections)", "batch-2 rejected directions scrub");
requireText(ascentPadApproaches, 'if (record.status !== "ROUTED_DISPLAY") return null', "batch-2 rejected map-line guard");
requireText(ascentPadApproaches, 'colorRole: exact ? "teal" : "unverified"', "batch-2 exact teal and unresolved neutral map split");
requireText(ascentPadApproaches, 'displayName: "Unverified / unapproved access"', "batch-2 truthful unverified label");
requireText(ascentPadApproaches, 'displayName: "Unnamed / unapproved access"', "batch-2 truthful unnamed label");
requireText(ascentPadApproaches, 'label: "Straight GPS tether · not road geometry"', "batch-2 straight tether map label");

forbid(ascentPadRoadDisplays, /sha256|createHash|crypto\.subtle|TextEncoder/u, "Ascent browser runtime performs coordinate hashing");
forbid(`${map}\n${pad}\n${ascentPadRoadDisplays}\n${ascentPadRoadLayers}\n${ascentPadApproaches}`, /router\.project-osrm\.org|\/route\/v1\/driving/u, "Ascent browser runtime contains a route-service call");
forbid(`${map}\n${pad}\n${ascentPadApproaches}`, /AIza[0-9A-Za-z_-]{25,}|sb_(?:secret|publishable)_[0-9A-Za-z_-]+|service[_-]?role/iu, "batch-2 browser runtime contains key or privileged database material");
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

// Load all 50 exact-record contracts through Vite. The 46 receipt-bound rows
// must still match the frozen 55-entry catalog, while the four additional
// reviewed handoffs must cross-bind the existing batch-2 evidence instead.
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
  const contractRows = navigationModule.reviewedNavigationContractRowsForAudit();
  const contractIds = new Set(contractRows.map((row) => row.padId));
  const receiptRows = navigationModule.ownerApprovalReceiptRowsForAudit();
  const receiptIds = new Set(receiptRows.map((row) => row.padId));
  if (contractRows.length !== 50 || contractIds.size !== 50) {
    errors.push("The reviewed navigation source is not exactly 50 unique exact-record handoffs");
  }
  if (receiptRows.length !== 46 || receiptIds.size !== 46 || receiptRows.some((row) => !row.matchesCurrentContent)) {
    errors.push("The 46 immutable reviewed navigation receipts are incomplete or have content drift");
  }
  if (contractRows.filter((row) => receiptIds.has(row.padId))
    .some((row) => row.preserveMeasuredApproach !== false)) {
    errors.push("An owner-receipted reviewed handoff unexpectedly enables the separate batch-2 measured approach");
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

  const additionalHandoffs = contractRows.filter((row) => !receiptIds.has(row.padId));
  const expectedAdditionalNames = new Set(["HELLER", "JENNINGS", "KEMPER", "RED-HILL-FARM"]);
  const approachRecords = Array.isArray(ascentPadApproachArtifact?.records)
    ? ascentPadApproachArtifact.records
    : [];
  if (additionalHandoffs.length !== 4
    || additionalHandoffs.some((row) => !expectedAdditionalNames.has(row.padName))
    || new Set(additionalHandoffs.map((row) => row.padName)).size !== 4
    || approachRecords.length !== 192
    || contractRows.length + 9 !== 59
    || approachRecords.length - additionalHandoffs.length !== 188) {
    errors.push("Ascent navigation accounting is not exactly 59 navigable, 55 static displays, and 188 GPS-only");
  }

  for (const handoff of additionalHandoffs) {
    const approach = approachRecords.find((record) => record.padId === handoff.padId);
    const waypoint = handoff.waypoints?.[0];
    const exactSections = approach?.sections?.filter((section) => section.matchState !== "structural_zero_distance") || [];
    if (handoff.ownerApproval !== null
      || handoff.preserveMeasuredApproach !== true
      || receiptIds.has(handoff.padId)
      || routes.some((route) => route.padId === handoff.padId)
      || !navigationModule.reviewedNavigationUrlMatchesContract(
        handoff.routeUrl,
        handoff.routeDestination,
        handoff.waypoints,
      )
      || handoff.waypoints?.length !== 1
      || !approach
      || approach.padId !== handoff.padId
      || approach.canonicalId !== handoff.canonicalId
      || approach.legacyId !== handoff.legacyId
      || approach.recordRevision !== handoff.recordRevision
      || approach.company !== handoff.company
      || approach.padName !== handoff.padName
      || approach.state !== handoff.state
      || approach.county !== handoff.county
      || approach.structuredRoadSequence !== handoff.structuredRoadSequence
      || approach.destination?.gpsSource !== "saved"
      || approach.destination?.directoryCoordinateRole !== "saved pad reference"
      || approach.destination?.coordinates?.[0] !== handoff.trustedDestination.longitude
      || approach.destination?.coordinates?.[1] !== handoff.trustedDestination.latitude
      || handoff.trustedDestination.source !== "saved_pad_gps"
      || handoff.routeDestination.longitude !== handoff.trustedDestination.longitude
      || handoff.routeDestination.latitude !== handoff.trustedDestination.latitude
      || approach.status !== "ROUTED_DISPLAY"
      || approach.reason !== "graph_receipt_ordered_named_route_reaches_network_snap"
      || typeof approach.lastHighway?.roadId !== "string"
      || !approach.lastHighway.roadId
      || typeof approach.lastHighway?.displayRoad !== "string"
      || !approach.lastHighway.displayRoad
      || approach.start?.authority !== "candidate_nearest_highway_point"
      || approach.start?.candidateOnly !== true
      || approach.start?.anchorSource !== "exact_master_highway_centerline_nearest_point"
      || approach.start?.anchoredRoadId !== approach.lastHighway?.roadId
      || waypoint?.longitude !== approach.start?.snappedCoordinate?.[0]
      || waypoint?.latitude !== approach.start?.snappedCoordinate?.[1]
      || JSON.stringify(handoff.selectedTerminalPublicRoadSequence)
        !== JSON.stringify([approach.lastHighway?.displayRoad])
      || exactSections.length < 1
      || exactSections.some((section) => section.matchState !== "matched_ordered_source_and_exact_graph_receipt"
        || section.lineStyle !== "solid"
        || section.colorRole !== "teal"
        || section.authority !== "immutable_graph_evidence_receipt"
        || section.sourceRoadId !== approach.lastHighway?.roadId
        || section.matchedSourceRoadId !== approach.lastHighway?.roadId
        || section.graphEvidence?.roadId !== approach.lastHighway?.roadId
        || section.graphEvidence?.sourceMatch !== "ordered_exact")
      || approach.diagnostics?.graphEvidenceReceiptApplied !== true
      || approach.diagnostics?.graphEvidenceStatus !== "sealed_receipt_applied"
      || approach.diagnostics?.graphEvidenceRouteCoordinateSha256 !== sha256Json(approach.roadCoordinates)
      || approach.gpsTether?.lineStyle !== "solid"
      || approach.gpsTether?.colorRole !== "gps"
      || approach.gpsTether?.authority !== "unapproved_straight_network_snap_to_saved_gps"
      || approach.gpsTether?.navigationGeometry !== false
      || approach.mileage?.gpsTetherExcluded !== true
      || approach.mileage?.totalToGpsMeters !== null
      || approach.mileage?.totalToGpsMiles !== null) {
      errors.push(`${handoff.padName} no longer cross-binds its reviewed handoff to the sealed batch-2 terminal-highway approach`);
    }
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
const defaultVerify = String(scripts.verify || "");
const generatorVerifyIndex = defaultVerify.indexOf("npm run verify:ascent-approach-generator");
const batch2VerifyIndex = defaultVerify.indexOf("npm run verify:ascent-batch2");
const companyRoadVerifyIndex = defaultVerify.indexOf("npm run verify:company-roads");
if (scripts["verify:ascent-batch2"] !== "node scripts/audit-ascent-pad-approaches-batch2.mjs"
  || batch2VerifyIndex < 0
  || batch2VerifyIndex <= generatorVerifyIndex
  || companyRoadVerifyIndex <= batch2VerifyIndex) {
  errors.push("default V18 verification does not run the compact batch-2 audit after its generator regression");
}
if (scripts["verify:ascent-approach-generator"] !== "node --test scripts/generate-ascent-pad-approaches-batch2.test.mjs"
  || generatorVerifyIndex < 0) {
  errors.push("default V18 verification does not run the focused batch-2 generator regression");
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

process.stdout.write("V18 named-road navigation audit passed: 59 Ascent pads are navigable, 188 remain GPS-only, the frozen 55 static displays and 192 batch-2 approaches remain unchanged, 46 owner-approved receipts remain byte-stable, four additional reviewed handoffs cross-bind sealed terminal-highway evidence, GPS tethers stay unapproved and excluded from mileage, and State-1 gates are parked.\n");
