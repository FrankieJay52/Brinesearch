import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
const errors = [];

const component = read("v18/src/features/owner-google-verify/OwnerGoogleVerifyMapPage.tsx");
const model = read("v18/src/features/owner-google-verify/ownerGoogleVerifyModel.ts");
const router = read("v18/src/features/owner-google-verify/freeRoutePreview.ts");
const drafts = read("v18/src/data/ownerGoogleVerifyDrafts.ts");
const app = read("v18/src/app/App.tsx");
const pad = read("v18/src/features/pad/PadPage.tsx");
const settings = read("v18/src/features/settings/SettingsPage.tsx");
const map = read("v18/src/features/map/MapPage.tsx");
const featureRuntime = [component, model, router, drafts].join("\n");

function requireText(source, needle, label = needle) {
  if (!source.includes(needle)) errors.push(`missing ${label}`);
}

function forbid(source, pattern, label) {
  if (pattern.test(source)) errors.push(label);
}

requireText(app, 'path="/settings/verify-route/:padId"', "owner verifier route");
requireText(component, 'access.state !== "owner"', "owner gate before verifier render");
requireText(component, "map = new MapLibreMap({", "owner-only free MapLibre renderer");
requireText(component, 'style: ownerRoadBasemapStyle("road")', "free OpenFreeMap road style");
requireText(router, 'freeRoutePreviewEndpoint = "https://router.project-osrm.org/route/v1/driving"', "free OpenStreetMap route endpoint");
requireText(component, "requestFreeRoutePreview(anchor, turnPins, destination, controller.signal)", "starting anchor, ordered owner controls, and locked saved destination");
requireText(router, 'alternatives: "3"', "multiple free-road alternatives request");
requireText(router, "candidate.distanceMeters < current.distanceMeters", "shortest returned road alternative selection");
requireText(router, "leavesControlPoints || makesLargeLoop ? directUnmappedLeg(start, end) : shortest", "unmapped lease-road loop rejection");
requireText(component, 'section.mark?.state === "lease_or_unnamed"', "owner lease-road direct pin-line control");
requireText(component, 'routingMode: useDirectPinLine ? "direct_unmapped" : "road"', "gray direct lease-road rendering mode");
requireText(component, 'draggable: Boolean(item.control)', "movable anchor and turn-pin controls");
requireText(model, "maximumOwnerGoogleVerifyTurnPins = 5", "five-turn-pin maximum");
requireText(model, 'pad.coordinate.role === "saved_pad_destination"', "saved destination coordinate gate");
requireText(model, 'pad.coordinate.role === "driver_entrance"', "verified driver-entrance coordinate gate");
requireText(model, 'pad.mapReference.kind === "saved_pad_reference"', "record-bound saved reference gate");
requireText(component, "Draft only — driver Navigate unchanged.", "draft-only banner");
requireText(drafts, 'authority: "draft_only"', "draft-only export authority");
requireText(drafts, "driverNavigateChanged: false", "driver Navigate unchanged export marker");
requireText(component, '"approved_named_road", "#14b8a6"', "teal approved section rendering");
requireText(component, '"lease_or_unnamed", "#94a3b8"', "gray lease or unnamed section rendering");
requireText(component, 'companyRoads.selectRoads("all")', "all exact approved roads selection");
requireText(component, '"line-color": "#14b8a6"', "all-approved-road teal overlay");
requireText(component, 'ownerGoogleVerifyNamedRoadRoutes(status)', "selected-pad named-road display geometry");
requireText(component, '"line-color": "#2dd4bf"', "selected-pad named-road display highlight");
requireText(component, 'Teal is display only; State-1 graph/public-Google authority is separate.', "display geometry authority boundary");
requireText(component, 'No reviewed named-road display geometry is available for this pad; no line was inferred.', "no inferred named-road geometry");
requireText(component, "candidateEntrance: parsedCandidateEntrance.point", "draft-only candidate entrance capture");
requireText(component, "Candidate entrance coordinates", "candidate entrance owner form");
requireText(component, "requestFreeRoutePreview(anchor, turnPins, destination, controller.signal)", "candidate entrance cannot replace route destination");
requireText(model, 'label: "Wrong road"', "wrong-road badge outcome");
requireText(pad, "Verify route on free map", "pad owner verifier button");
requireText(settings, "Last pad verified:", "Settings last-pad summary");
requireText(settings, "Verify on free map", "Settings verifier button");
requireText(map, 'viewerModeRef.current === "roads"', "Approved Roads pin direct-open gate");
if ((pad.match(/<FixedNavigateAction\b/g) || []).length !== 1) errors.push("Pad page no longer renders exactly one driver Navigate action");

forbid(featureRuntime, /\b(?:ownerRpc|supabase|service[_-]?role)\b/i, "owner verifier gained server or privileged mutation wiring");
forbid(featureRuntime, /\b(?:releasedGoogleHandoff|reviewedNavigationCandidates|googleRoute)\b/, "owner verifier imports reviewed/public route authority");
forbid(featureRuntime, /\bgeocod(?:e|ing)\b|optimizeWaypointOrder:\s*true/i, "owner verifier contains geocoding or waypoint optimization");
forbid(component, /navigator\.geolocation|getCurrentPosition|Use phone GPS|setOrigin\(/, "owner verifier uses phone GPS instead of the anchor as its starting point");
forbid(component, /origin:\s*(?:["'`].*Cadiz|\{[^}]*Cadiz)/i, "owner verifier uses Cadiz as a route origin");
forbid(featureRuntime, /console\.(?:log|info|warn|error|debug)/, "owner verifier logs runtime data");
forbid(featureRuntime, /AIza[0-9A-Za-z_-]{25,}/, "Google API key-shaped literal appears in tracked verifier code");
forbid(featureRuntime, /VITE_GOOGLE_MAPS_API_KEY|maps\.googleapis\.com|routes\.googleapis\.com/, "owner verifier still loads paid Google map services");
forbid(router, /api[_-]?key|access[_-]?token|bearer/i, "free route preview contains a credential source");
forbid(drafts, /\b(?:apiKey|accessToken|sessionToken|routeLegs|routePath|routeUrl|instructions)\s*:/, "draft schema persists forbidden Google/auth content");

if (errors.length) {
  process.stderr.write(`V18 owner free-map verifier audit failed:\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}

process.stdout.write("V18 owner free-map verifier audit passed.\n");
