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
const padPage = read("v17/src/parts/11-pad-page.js");
const migration = read("supabase/migrations/20260812044400_issue97_phase1_release_gate.sql");
const sr331 = read("supabase/migrations/20260812044500_issue97_oh_sr331_canonical_adoption.sql");

assert.ok(
  partOrder.parts.includes("05a-authoritative-route-fallback-issue97.js"),
  "Issue #97 authoritative route fallback hardening is not assembled"
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

assert.ok(
  padPage.includes("Exact pad pin only — route not yet verified"),
  "The non-authoritative pad-pin fallback must remain explicitly labelled as not route-verified"
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
assert.ok(
  !hardening.includes("googleMapsUrl("),
  "Authoritative route fallback hardening must never call the legacy Google route helper"
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

console.log("Issue #97 Phase 1 release contract audit passed.");
