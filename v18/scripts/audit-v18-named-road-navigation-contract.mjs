import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");
const errors = [];

const pad = read("v18/src/features/pad/PadPage.tsx");
const map = read("v18/src/features/map/MapPage.tsx");
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
requireText(contract, "defaults to **All approved routes**", "all/company approved-road scope");
requireText(contract, "one exact company", "single-company approved-road scope");
requireText(contract, "does not recolor a basemap road class", "no generic basemap-road promotion");
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
requireText(map, 'companyRoads.selection === null', "default all without overriding a selected company");
requireText(map, 'aria-label="Separate approved routes by company or show all routes"', "all/company approved-road selector");
requireText(map, '<option value="all">All approved routes</option>', "all approved routes option");
requireText(map, "selectedGpsNavigationUrl && selectedGpsDestination", "map GPS-only fallback");
requireText(preview, "never replaced with prose, waypoints, straight lines, or nearest-road guesses", "preview no-inference rule");
requireText(preview, "for (const line of lines)", "preview renders every supplied named-road line");
requireText(status, "displayProjection", "display geometry normalized separately from authority");
requireText(status, "State-1 and public-route authority remain held. Reviewed named-road geometry is display only.", "held geometry remains display-only");
requireText(reviewed, "byte-stable unless wrong-road evidence", "record-bound URL stability comment");
requireText(reviewed, "intentionally carry no line geometry", "static candidate geometry boundary");

forbid(`${pad}\n${map}`, /higherPriorityNavigationCheckState|navigationFallbackAfterHigherPriorityCheck|Live route check unavailable · no fallback opened/u, "runtime still contains State-1 fallback suppression");
forbid(`${pad}\n${map}\n${preview}`, /selectedReviewedNavigation(?:Candidate)?\.geometry|nearest_road|fuzzy_name/u, "runtime can infer display geometry from an unverified candidate");
forbid(map, /isolateSelectedRoute|rgba\(240, 180, 93, \.9\)|<option value="">Roads off|line-opacity", roadMode &&/u, "approved-road network is not persistently teal");
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
