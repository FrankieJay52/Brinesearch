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
const googleDependency = read("supabase/migrations/20260812037300_issue97_verified_run_provenance_hardening.sql");
const googleRefresh = read("supabase/migrations/20260812037400_issue97_transition_google_current_schema.sql");
const overlap = read("supabase/migrations/20260814163050_issue97_odot_authoritative_overlap_shared_pavement.sql");
const finalRehearsalPath = path.join(root, "ops/issue97-computer-rollout/issue97-release-rehearsal-final.sh");
const finalRehearsal = fs.readFileSync(finalRehearsalPath, "utf8");
execFileSync("bash", ["-n", finalRehearsalPath], { stdio: "pipe" });

for (const token of [
  "ebcacb4b049483fdc48cfcf04dc97dad",
  "800fbdc0a51daec11c1f1bd1ddb512b0",
  "16118",
  "420725ad5d8c93a60f13c5ddb3b4f1c1",
  "4133362a5205c8c4e36621ce8d2d486d",
  "gulfport--harvey",
  "current_production_change_set",
  "direction_intelligence_refresh",
  "measured_road_refresh",
  "resulting_measured_count',76",
  "net_occurrence_delta',2",
]) need(baseline, token, `reviewed route-semantic-v2 current generation ${token}`);
forbid(baseline, "'source_digest','cb49d2f5912019abfefe553337860b61'", "stale pre-Harvey semantic-v2 digest as active baseline");
forbid(baseline, "expected_occurrence_count=16111", "stale pre-Harvey 16,111 active baseline");
forbid(baseline, "expected_inventory_digest='4825b5291ea682af7f659130cd735838'", "stale pre-Harvey inventory digest");

for (const token of [
  "927896ee5fd992bfe18eb21774559101",
  "1b002ec1a7efc112b437db7331cd1117",
  "a271e00fe0128830bf0959611f1aa22d",
  "issue97_saved_road_semantic_source_v3_gps_bound",
  "route-semantic-v3-gps-bound",
  "pg_catalog.round(p.latitude::numeric,7)",
  "pg_catalog.round(p.longitude::numeric,7)",
  "pad_destination_gps_precision_decimals",
  "prior_route_semantic_v2_digest",
  "expected_occurrence_count<>16118",
  "expected_inventory_digest<>'420725ad5d8c93a60f13c5ddb3b4f1c1'",
  "source_digest_function_md5",
  "v_effective_owner is distinct from v_owner",
  "v_effective_acl is distinct from v_acl",
  "v_effective_security_definer is distinct from v_security_definer",
  "v_effective_volatility is distinct from v_volatility",
  "v_effective_config is distinct from v_config",
  "private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)",
  "v_google_refresh not like '%saved_pad_gps%'",
  "alternate_locations is not a navigation destination",
  "gulfport--harvey",
  "eog--harvey",
  "p.structured_route_steps::text,p.driver_safety_context::text))",
  "%p.driver_safety_context::text,p.updated_at::text%",
]) need(gps, token, `GPS-bound currentness ${token}`);

// 160000 already removes updated_at before this migration runs. 160050 must use
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
forbid(gps, "pg_catalog.round(p.latitude::numeric, 7)", "whitespace-sensitive saved-source latitude verification");
forbid(gps, "pg_catalog.round(p.longitude::numeric, 7)", "whitespace-sensitive saved-source longitude verification");
forbid(gps, "pg_catalog.round(v_pad.latitude::numeric, 7)::text", "whitespace-sensitive Google latitude verification");
forbid(gps, "pg_catalog.round(v_pad.longitude::numeric, 7)::text", "whitespace-sensitive Google longitude verification");

for (const token of [
  "pg_catalog.round(v_pad.latitude::numeric,7)::text",
  "pg_catalog.round(v_pad.longitude::numeric,7)::text",
  "extensions.st_makepoint(v_pad.longitude,v_pad.latitude)",
]) need(googleDependency, token, `current Google dependency GPS binding ${token}`);

for (const token of [
  "'kind','pad_destination'",
  "'source_kind','saved_pad_gps'",
]) need(googleRefresh, token, `current Google refresh destination GPS binding ${token}`);

for (const token of [
  "e0528f257f3c1b6d40341b735f284f1d",
  "ODOT overlap generated builder hash changed before install",
  "PRIMARY_OVERLAP_ID",
  "OVERLAP_INVERSE_IND",
  "odot_authoritative_overlap_pairs",
  "issue97_persistent_secondary_geometry_unchanged",
]) need(overlap, token, `exact ODOT builder contract ${token}`);
forbid(overlap, "builder_definition_md5='793ed8985252b00d52f46da497484029'", "stale active ODOT builder generation hash");

for (const token of [
  "CANONICAL FINAL #97 RELEASE REHEARSAL",
  "expected exactly 22 final release migrations",
  "20260814160000_issue97_saved_road_release_baseline_current.sql",
  "20260814160050_issue97_saved_road_pad_gps_binding.sql",
  "GPS binding must immediately follow the 16,118 baseline",
  "927896ee5fd992bfe18eb21774559101",
  "1b002ec1a7efc112b437db7331cd1117",
  "a271e00fe0128830bf0959611f1aa22d",
  "420725ad5d8c93a60f13c5ddb3b4f1c1",
  "16118",
  "e0528f257f3c1b6d40341b735f284f1d",
  "c5d54a4d839df79eff99f4dfd4b0b780",
  "d3c545529f508f5f4ee8876ee1807ce4",
  "v_definition not like '%pg_catalog.round(p.latitude::numeric,7)%'",
  "v_definition not like '%pg_catalog.round(p.longitude::numeric,7)%'",
  "v_definition not like '%pg_catalog.round(v_pad.latitude::numeric,7)::text%'",
  "v_definition not like '%pg_catalog.round(v_pad.longitude::numeric,7)::text%'",
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

assert.match(
  finalRehearsal,
  /pg_get_functiondef\(\s*'private_verification\.brinesearch_issue97_refresh_google_route_transition\(uuid\)'::pg_catalog\.regprocedure\s*\);\s*if v_definition not like '%saved_pad_gps%'/s,
  "Issue #97 final rehearsal must verify saved_pad_gps on the Google refresh function",
);
const dependencyCheckStart = finalRehearsal.indexOf(
  "'private_verification.brinesearch_issue97_transition_google_dependency(uuid)'::pg_catalog.regprocedure",
  finalRehearsal.indexOf('in_transaction_verify="$(cat'),
);
const refreshCheckStart = finalRehearsal.indexOf(
  "'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)'::pg_catalog.regprocedure",
  dependencyCheckStart,
);
assert.ok(
  dependencyCheckStart >= 0 && refreshCheckStart > dependencyCheckStart,
  "Issue #97 final rehearsal Google dependency/refresh checks must remain ordered and identifiable",
);
forbid(
  finalRehearsal.slice(dependencyCheckStart, refreshCheckStart),
  "saved_pad_gps",
  "saved-pad provenance marker on the dependency digest function instead of the refresh function",
);

forbid(
  finalRehearsal,
  "public.brinesearch_pad_google_routes",
  "stale nonexistent Google snapshot relation",
);
forbid(finalRehearsal, "2ad7b559ddd3394265643abd8a5a01a7", "stale pre-Harvey GPS-bound digest");
forbid(finalRehearsal, "4825b5291ea682af7f659130cd735838", "stale pre-Harvey inventory digest");
forbid(finalRehearsal, "793ed8985252b00d52f46da497484029", "stale pre-reconstruction ODOT builder hash in canonical final rehearsal");

// Keep byte-for-byte equality limited to durable release state. pg_stat_activity
// is intentionally checked only by preflight because session presence can change
// without any durable database write between the before and after snapshots.
const snapshotStart = finalRehearsal.indexOf('snapshot_sql="$(cat <<SQL');
const preflightStart = finalRehearsal.indexOf('preflight_sql="$(cat <<SQL');
const verifyStart = finalRehearsal.indexOf('in_transaction_verify="$(cat <<\'SQL\'');
assert.ok(
  snapshotStart >= 0 && preflightStart > snapshotStart && verifyStart > preflightStart,
  "Issue #97 final rehearsal snapshot/preflight blocks must remain structurally identifiable",
);
const snapshotBlock = finalRehearsal.slice(snapshotStart, preflightStart);
const preflightBlock = finalRehearsal.slice(preflightStart, verifyStart);
forbid(
  snapshotBlock,
  "pg_catalog.pg_stat_activity",
  "nondeterministic pg_stat_activity in before/after snapshot equality material",
);
forbid(
  snapshotBlock,
  "'builder_sessions'",
  "nondeterministic builder_sessions key in before/after snapshot equality material",
);
need(
  preflightBlock,
  "from pg_catalog.pg_stat_activity activity",
  "preflight concurrent-builder activity source",
);
need(
  preflightBlock,
  "activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'",
  "preflight concurrent-builder rejection predicate",
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
  "GPS-bound migration must execute immediately after the reviewed 16,118 baseline and before later release migrations",
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

console.log("Issue #97 saved-road route-semantic-v3 GPS currentness + canonical 22-migration rollback rehearsal audit passed: the independently reviewed 16,118 inventory includes Gulfport HARVEY as distinct from the older Carroll EOG HARVEY, the exact ODOT overlap builder is pinned to its reconstructed e0528f definition, pad destination latitude/longitude are bound at 7 decimals, updated_at metadata remains excluded from the pad token outside the explicit rejection guard, the Google dependency uses the same saved pad GPS, the snapshot uses only durable release state, pg_stat_activity remains preflight-only, and the superseding final PC lane includes the GPS migration before all later release migrations.");
