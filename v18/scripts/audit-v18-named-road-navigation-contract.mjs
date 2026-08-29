import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");
const errors = [];

const pad = read("v18/src/features/pad/PadPage.tsx");
const map = read("v18/src/features/map/MapPage.tsx");
const fieldDirection = read("v18/src/features/map/selectedPadFieldDirectionDisplay.ts");
const bannockRoadDisplay = JSON.parse(read("v18/src/features/map/bannockRoadDisplay.json"));
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
requireText(contract, "draws no substitute teal line", "no fake teal rule");
requireText(contract, "Every supplied, separately reviewed named-road geometry feature is highlighted", "all supplied named roads are teal");
requireText(contract, "pad-bound highlight is drawn only while that exact pad is selected", "selected-pad-only route color");
requireText(contract, "exact released approved-road overlay remains teal", "persistent approved-road teal");
requireText(contract, "defaults to **All pads + all\napproved roads**", "unified all-pads/all-approved-roads scope");
requireText(contract, "one exact company", "single-company approved-road scope");
requireText(contract, "thinner teal Interstate, U.S., and state highway reference", "structured highway-reference scope");
requireText(contract, "clipped to the 39", "pad-county highway-reference scope");
requireText(contract, "does not match road names", "no highway name matching");
requireText(contract, "Teal shows the arrival from OH-331 along Lafferty-Bannock", "BANNOCK teal arrival rule");
requireText(contract, "Red is not a\nrestriction or closure", "BANNOCK red exit-not-closure rule");
requireText(contract, "no road-to-pin connector is inferred", "BANNOCK no invented connector rule");
requireText(contract, "Both the teal OH-331 arrival and red\nOH-149 exit remain visible on the main **All pads + all approved roads** map", "BANNOCK persistent main-map teal/red roads");
requireText(contract, "one dedicated smooth-moving native map source with data-bound color\nroles", "BANNOCK native color-role layer boundary");
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
requireText(map, "drawRoute(context, map, selectedId ? geometry : null)", "selected-pad-only display geometry");
requireText(map, "selectedId === fieldDirectionDisplay?.padId ? fieldDirectionDisplay : null", "exact selected BANNOCK field display guard");
requireText(map, 'drawSelectedPadFieldDirectionLine(context, map, display.inbound, "#52e4bd", 5)', "BANNOCK teal arrival stroke");
requireText(map, 'drawSelectedPadFieldDirectionLine(context, map, display.outbound, "#ef4444", 5)', "BANNOCK selected red exit stroke");
requireText(map, "Red is not a restriction or closure.", "BANNOCK red legend authority boundary");
requireText(map, "no road-to-pin connector is inferred", "BANNOCK no-connector disclosure");
requireText(map, "bannockFieldDirectionDisplayForDirectory(snapshot?.rows || [])", "BANNOCK exact directory-bound persistent road colors");
requireText(map, 'companyFilter === "all" || companyFilter === bannockFieldDirectionDisplay.company', "BANNOCK all/Ascent teal/red scope");
requireText(map, "features: [display.inbound, display.outbound].map", "BANNOCK persistent inbound/outbound source features");
requireText(map, 'role: line.colorRole === "teal" ? "inbound-road-reference" : "outbound-road-reference"', "BANNOCK persistent feature roles");
requireText(map, "syncBannockRoadReferenceLayers(map, bannockRoadReferenceRef.current)", "BANNOCK native persistent teal/red lifecycle");
requireText(map, '["match", ["get", "colorRole"], "teal", "#52e4bd", "red", "#ef4444", "#52e4bd"]', "BANNOCK persistent data-bound teal/red paint");
requireText(map, "OH-331 to BANNOCK · teal", "BANNOCK persistent teal legend");
requireText(map, "BANNOCK via Black Oak Road to OH-149 · red", "BANNOCK persistent red legend");
requireText(map, "BANNOCK road colors: teal from OH-331 to BANNOCK; red from BANNOCK by Black Oak Road to OH-149.", "BANNOCK accessible road-color description");
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
requireText(reviewed, "intentionally carry no line geometry", "static candidate geometry boundary");

if (bannockRoadDisplay.inbound?.pointCount !== 95 || bannockRoadDisplay.inbound?.coordinates?.length !== 95) errors.push("BANNOCK inbound field geometry is not the frozen 95-point line");
if (bannockRoadDisplay.outbound?.pointCount !== 239 || bannockRoadDisplay.outbound?.coordinates?.length !== 239) errors.push("BANNOCK outbound field geometry is not the frozen 239-point line");
if (bannockRoadDisplay.displayScope !== "persistent-main-map-teal-arrival-and-red-exit" || bannockRoadDisplay.inbound?.visibility !== "main-map-all-and-ascent" || bannockRoadDisplay.outbound?.visibility !== "main-map-all-and-ascent") errors.push("BANNOCK teal/red visibility scope is not frozen to persistent All/Ascent road colors");
if (JSON.stringify(bannockRoadDisplay.inbound?.coordinates?.at(-1)) !== JSON.stringify(bannockRoadDisplay.outbound?.coordinates?.[0])) errors.push("BANNOCK teal/red field geometry no longer shares one exact road seam");
if (bannockRoadDisplay.noConnectorToGps !== true || bannockRoadDisplay.continuity?.gpsConnectorIncluded !== false) errors.push("BANNOCK field display includes or permits an invented GPS connector");

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

process.stdout.write("V18 named-road navigation audit passed: working handoffs and GPS-only actions are immediate; State-1 gates are parked.\n");
