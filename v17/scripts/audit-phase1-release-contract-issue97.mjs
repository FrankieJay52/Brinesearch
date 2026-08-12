import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const hardening = read("v17/src/parts/05a-authoritative-route-fallback-issue97.js");
const partOrder = JSON.parse(read("v17/src/parts/part-order.json"));
const branding = read("v17/src/parts/02-pad-location-branding.js");
const legacyRouting = read("v17/src/parts/05-company-search-routing.js");
const padPage = read("v17/src/parts/11-pad-page.js");
const assistant = read("v17/src/parts/17-assistant-answers.js");
const migration = read("supabase/migrations/20260812044400_issue97_phase1_release_gate.sql");
const sr331 = read("supabase/migrations/20260812044500_issue97_oh_sr331_canonical_adoption.sql");

assert.ok(
  partOrder.parts.includes("05a-authoritative-route-fallback-issue97.js"),
  "Issue #97 authoritative route fallback hardening is not assembled"
);
assert.ok(
  partOrder.parts.indexOf("05a-authoritative-route-fallback-issue97.js") >
    partOrder.parts.indexOf("05-company-search-routing.js"),
  "Issue #97 fallback override must load after the legacy route helper"
);

const context = {
  googleMapsRouteChunks: pad => pad?.authoritative ? [{ url: "https://example.invalid/authoritative" }] : [],
  routeDirectionsUrl: () => "https://example.invalid/legacy-fallback"
};
vm.runInNewContext(hardening, context, { filename: "05a-authoritative-route-fallback-issue97.js" });
assert.equal(
  context.routeDirectionsUrl([], { authoritative: true }),
  "https://example.invalid/authoritative",
  "routeDirectionsUrl must use the authoritative #97 URL when present"
);
assert.equal(
  context.routeDirectionsUrl([], { authoritative: false }),
  "",
  "routeDirectionsUrl must fail closed instead of falling through to unverified Google driving directions"
);

// Exhaustive current-source audit of Google navigation constructors/callers.
// A future direct Maps route helper or unlabeled legacy fallback must make the
// full build fail instead of silently bypassing the #97 route-ready contract.
const partsDir = path.join(root, "v17/src/parts");
const partFiles = fs.readdirSync(partsDir)
  .filter(name => name.endsWith(".js"))
  .sort();
const partSources = new Map(partFiles.map(name => [name, fs.readFileSync(path.join(partsDir, name), "utf8")]));
const filesContaining = token => [...partSources.entries()]
  .filter(([, source]) => source.includes(token))
  .map(([name]) => name)
  .sort();

assert.deepEqual(
  filesContaining("https://www.google.com/maps/dir/?"),
  ["00ab-google-route-plan-issue97.js", "02-pad-location-branding.js"],
  "Only the authoritative #97 planner and explicitly non-route pad-pin helper may construct Google driving URLs"
);
assert.deepEqual(
  filesContaining("googleMapsUrl("),
  ["02-pad-location-branding.js", "05-company-search-routing.js", "11-pad-page.js", "17-assistant-answers.js"],
  "A new googleMapsUrl caller was added without an explicit authoritative/non-authoritative review"
);
assert.ok(
  branding.includes('return exactPad ? { kind: "gps", href: exactPad, external: true } : null'),
  "Quick navigation must classify the destination-only fallback as GPS, never as an authoritative route"
);
assert.ok(
  branding.includes('if (chunks.length === 1)') && branding.includes('kind: "route"') &&
    branding.includes('if (chunks.length > 1)') && branding.includes('kind: "route_plan"'),
  "Quick navigation must preserve single-route and multi-chunk authoritative handling"
);
assert.ok(
  legacyRouting.includes("function routeDirectionsUrl(route, p)") &&
    legacyRouting.includes("return authoritative.length ? authoritative[0].url : googleMapsUrl(p);"),
  "Legacy helper shape changed; re-review the #97 override load-order contract"
);
assert.ok(
  !hardening.includes("googleMapsUrl("),
  "Authoritative route fallback hardening must never call the legacy Google route helper"
);
assert.ok(
  padPage.includes("Exact pad pin only — route not yet verified"),
  "The pad page non-authoritative fallback must remain explicitly labelled as not route-verified"
);
assert.ok(
  assistant.includes("Open exact pad GPS (route not verified)"),
  "Assistant navigation must label destination-only Google links as non-verified routes"
);
assert.ok(
  assistant.includes("Open authoritative Google Maps route") && assistant.includes("googleMapsRouteChunks"),
  "Assistant authoritative navigation must still consume #97 route chunks"
);

for (const token of [
  "coalesce(pr.geometry_version,0)<1",
  "published_route_contains_draft_or_stale_geometry",
  "brinesearch_issue97_phase1_release_gate()",
  "brinesearch_issue97_assert_phase1_release_gate()",
  "missing_occurrence_receipts",
  "resolved_missing_canonical",
  "exact_geometry_count_mismatch",
  "held_or_stale_public_rows",
  "public_rows_not_current"
]) {
  assert.ok(migration.includes(token), `Issue #97 Phase 1 database contract missing: ${token}`);
}

assert.ok(
  migration.includes("g.identity_id=o.identity_id") && migration.includes("g.road_id=o.canonical_road_id"),
  "The Phase 1 gate must recompute exact geometry only from the same authoritative identity and canonical road"
);
assert.ok(
  migration.includes("t.receipt_digest=g.start_transition_digest") &&
    migration.includes("t.receipt_digest=g.end_transition_digest"),
  "The Phase 1 gate must bind geometry to current transition receipts instead of merely counting geometry rows"
);

for (const token of [
  "route_number='331'",
  "exact_route_designation",
  "name_matching_used',false",
  "fuzzy_matching_used',false",
  "nearest_road_used',false",
  "v_identity_count<>2"
]) {
  assert.ok(sr331.includes(token), `Issue #97 SR-331 exact adoption contract missing: ${token}`);
}

console.log("Issue #97 Phase 1 release contract + Google navigation surface audit passed.");
