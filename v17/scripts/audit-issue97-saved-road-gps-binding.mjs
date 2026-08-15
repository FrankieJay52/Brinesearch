import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const need = (source, token, label = token) =>
  assert.ok(source.includes(token), `Issue #97 GPS-bound saved-road audit missing ${label}`);
const forbid = (source, token, label = token) =>
  assert.ok(!source.includes(token), `Issue #97 GPS-bound saved-road audit forbids ${label}`);
const count = (source, token) => source.split(token).length - 1;

const baseline = read("supabase/migrations/20260814160000_issue97_saved_road_release_baseline_current.sql");
const gps = read("supabase/migrations/20260814160050_issue97_saved_road_pad_gps_binding.sql");
const google = read("supabase/migrations/20260811242000_issue97_transition_google_manifests.sql");
const finalRehearsalPath = path.join(root, "ops/issue97-computer-rollout/issue97-release-rehearsal-final.sh");
const finalRehearsal = fs.readFileSync(finalRehearsalPath, "utf8");
execFileSync("bash", ["-n", finalRehearsalPath], { stdio: "pipe" });

for (const token of [
  "ebcacb4b049483fdc48cfcf04dc97dad",
  "cb49d2f5912019abfefe553337860b61",
  "16111",
  "4825b5291ea682af7f659130cd735838",
]) need(baseline, token, `reviewed route-semantic-v2 predecessor ${token}`);

for (const token of [
  "927896ee5fd992bfe18eb21774559101",
  "2ad7b559ddd3394265643abd8a5a01a7",
  "6cb07ec60d0e84fbc3f443721eefa242",
  "issue97_saved_road_semantic_source_v3_gps_bound",
  "route-semantic-v3-gps-bound",
  "pg_catalog.round(p.latitude::numeric,7)",
  "pg_catalog.round(p.longitude::numeric,7)",
  "pad_destination_gps_precision_decimals",
  "prior_route_semantic_v2_digest",
  "expected_occurrence_count<>16111",
  "expected_inventory_digest<>'4825b5291ea682af7f659130cd735838'",
  "source_digest_function_md5",
  "v_effective_owner is distinct from v_owner",
  "v_effective_acl is distinct from v_acl",
  "v_effective_security_definer is distinct from v_security_definer",
  "v_effective_volatility is distinct from v_volatility",
  "v_effective_config is distinct from v_config",
  "alternate_locations is not a navigation destination",
  "p.structured_route_steps::text,p.driver_safety_context::text))",
  "%p.driver_safety_context::text,p.updated_at::text%",
]) need(gps, token, `GPS-bound currentness ${token}`);

// 16000 already removed updated_at before this migration runs. 160050 must use
// that exact route-semantic-v2 function as its predecessor and explicitly reject
// any effective generated definition that somehow restores updated_at. Strip the
// rejection guard text before proving the migration does not otherwise contain a
// timestamp-bearing generated pad token.
const gpsWithoutUpdatedAtGuard = gps.replaceAll(
  "%p.driver_safety_context::text,p.updated_at::text%",
  "",
);
forbid(gpsWithoutUpdatedAtGuard, "p.updated_at::text", "timestamp metadata outside the explicit rejection guard");
forbid(gps, "similarity(", "fuzzy matching");
forbid(gps, "<->", "nearest-road matching");

for (const token of [
  "pg_catalog.round(v_pad.latitude::numeric,7)::text",
  "pg_catalog.round(v_pad.longitude::numeric,7)::text",
  "extensions.st_makepoint(v_pad.longitude,v_pad.latitude)",
  "'kind','pad_destination'",
  "'source_kind','saved_pad_gps'",
]) need(google, token, `existing Google destination GPS binding ${token}`);

for (const token of [
  "CANONICAL FINAL #97 RELEASE REHEARSAL",
  "expected exactly 22 final release migrations",
  "20260814160000_issue97_saved_road_release_baseline_current.sql",
  "20260814160050_issue97_saved_road_pad_gps_binding.sql",
  "GPS binding must immediately follow the 16,111 baseline",
  "927896ee5fd992bfe18eb21774559101",
  "2ad7b559ddd3394265643abd8a5a01a7",
  "6cb07ec60d0e84fbc3f443721eefa242",
  "4825b5291ea682af7f659130cd735838",
  "c5d54a4d839df79eff99f4dfd4b0b780",
  "d3c545529f508f5f4ee8876ee1807ce4",
  "private_verification.brinesearch_google_route_receipts_issue97",
  "public.brinesearch_driver_google_routes_public",
  "'google_receipt_count'",
  "'public_google_count'",
  "set local statement_timeout='15min'",
  "set local lock_timeout='2min'",
  "sed 's/\\r$//'",
  "FINAL 22-MIGRATION RELEASE CHAIN COMPILED AND VERIFIED INSIDE TRANSACTION",
  "printf 'rollback;\\n'",
  "fresh production after-snapshot is byte-for-byte unchanged",
  "The older issue97-release-rehearsal.sh is retained only as historical evidence",
  "Do not use it for the final release gate",
]) need(finalRehearsal, token, `canonical final rehearsal ${token}`);

forbid(
  finalRehearsal,
  "public.brinesearch_pad_google_routes",
  "stale nonexistent Google snapshot relation",
);

assert.equal(
  count(finalRehearsal, '"supabase/migrations/20260814'),
  22,
  "canonical final rehearsal must list exactly 22 final migration paths",
);
assert.ok(
  finalRehearsal.indexOf("20260814160000_issue97_saved_road_release_baseline_current.sql") <
    finalRehearsal.indexOf("20260814160050_issue97_saved_road_pad_gps_binding.sql") &&
  finalRehearsal.indexOf("20260814160050_issue97_saved_road_pad_gps_binding.sql") <
    finalRehearsal.indexOf("20260814161000_issue97_possum_reviewed_subsegment_bridge_registry.sql"),
  "GPS-bound migration must execute immediately after the reviewed 16,111 baseline and before later release migrations",
);
for (const forbidden of [
  "supabase db push",
  "supabase migration up",
  "apply_migration",
  "commit;",
  "PGPASSWORD=",
  "DATABASE_URL=",
  "activate_graph_build(",
  "activate_cutover(",
  "refresh_google_routes(",
]) forbid(finalRehearsal, forbidden, `canonical final rehearsal unsafe action ${forbidden}`);

console.log("Issue #97 saved-road route-semantic-v3 GPS currentness + canonical 22-migration rollback rehearsal audit passed: 16,111 inventory remains independently pinned, pad destination latitude/longitude are bound at 7 decimals, updated_at metadata remains excluded outside the explicit rejection guard, the Google dependency uses the same saved pad GPS, the snapshot uses only real Google receipt/public relations, and the superseding final PC lane includes the GPS migration before all later release migrations.");
