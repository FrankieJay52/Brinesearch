import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8")
  .replace(/\r\n?/g, "\n");
const migration = read("supabase/migrations/20260817144432_issue97_harrison_har_has_wrong_geometry_repair.sql");
const regression = read("supabase/tests/issue97_harrison_har_has_wrong_geometry_repair.sql");
const lowerMigration = migration.toLowerCase();
const lowerRegression = regression.toLowerCase();

const roadIds = [
  "639b05f2-5dc6-4678-86bf-e7a0a775663b",
  "8da26948-222c-46ef-ac79-9d07ccd08c31",
  "8382d2bf-d427-4a91-9afa-641885c71533",
  "f0db4fa8-3900-4350-a31e-3d61128006f8",
  "ebb77f8d-ed1b-4612-ae33-a0c0e64c0ae3",
  "7fe5f642-bfdc-4d5f-9f54-85f9b15af741",
  "f9ee9c0b-290f-4ffe-a62b-a4d9a4b52965",
  "ed00b321-3e61-4e84-bbcb-7497a1ae4b90",
  "1a1988a9-b0d5-4414-8abf-ebeda1ac1f32",
  "c1eefe49-fe29-44fa-84b7-2cfe29180761",
];
const targetSources = [
  "CHASCR00014**C|route:CR:14", "CHASCR00020**C|route:CR:20",
  "CHASCR00030**C|route:CR:30", "CHASCR00044**C|route:CR:44",
  "CHASCR00045**C|route:CR:45", "CHASCR00060**C|route:CR:60",
  "CHASCR00502**C|route:CR:502", "THASTR00225**C|route:TR:225",
  "THASTR00338**C|street:jones",
];
const identityIds = [
  "82d4acf0-4592-3c60-732f-ef07cb42796a",
  "b0ec2efd-e511-2e2d-c481-eaf896757bbb",
  "83906bd8-9c10-e948-60e6-ed78a1ca34de",
  "100e158e-9b85-f169-ae1e-cbb88b9f18fa",
  "dd89cc57-386f-5f4a-cd54-79c862bda433",
  "1a09df0d-e31b-52a9-1d1d-6434e02546f5",
  "d2f9004d-3a70-a61c-30b1-6aca9b4b46d0",
  "dbcc9da8-07cb-f054-68ca-debe2f8640fc",
  "40a0eda3-2dd3-6166-37cf-d4e1e1ac7040",
];

for (const token of [...roadIds, ...targetSources, ...identityIds]) {
  assert.ok(migration.includes(token), `Harrison repair missing exact frozen token: ${token}`);
}
assert.equal((migration.match(/'repair_mapped'\)/g) ?? []).length, 7,
  "Harrison repair must preserve exactly seven existing mappings");
for (const token of [
  "issue97_harrison_hardin_contamination_quarantine",
  "semantic_class_change_requires_separate_review",
  "no_exact_current_harrison_identity",
  "held_unmapped_graph_membership_guard",
  "authoritative_identity_geometry",
  "dataset_scope_current",
  "target source-record or generated identity-key collision",
  "mapping_status='verified'",
  "candidate_only=true",
  "centerline_geojson=null",
]) assert.ok(lowerMigration.includes(token.toLowerCase()), `Harrison fail-closed contract missing: ${token}`);

assert.ok(!lowerMigration.includes("brinesearch_oh_county_code"),
  "Harrison repair must not use the stale Ohio county helper");
assert.ok(!/\bset\s+road_identity_key\s*=/.test(lowerMigration),
  "Generated road_identity_key must not be assigned");
assert.ok(!/insert\s+into\s+public\.brinesearch_road_identity_mappings/.test(lowerMigration),
  "Harrison checkpoint must not create a TR-225 or Jones mapping");
for (const token of [
  "5ee5f97b-447f-41d3-946a-68a8b28d8367",
  "542c35d5-a9ba-4b43-8a64-63a66f6b29e2",
  "e9f4ed56bb2b1308b8b9913a751c78f5",
  "1d8f6a52d2541e313932906f944b2f92",
  "a2a49ac4f11baa703f05a493cf331c35",
  "211361b9586652be5188687de7ee9af9",
  "e50ef5799abf04d16c2ecb79d4db0651",
  "7d0561a0f32e7432880d4ad39e5e7109",
  "2026-08-16T11:08:18.355674+00:00",
  "junction_digest", "membership_digest", "anchor_digest",
  "all-pad-routing-pipeline", "saved-road-reconciliation", "for update of road",
  "order by scope.dataset_id,scope.state_code,scope.county_code",
  "source_run_vector_unchanged", "topology_changed',false",
  "graph_build_release_current", "member_count=19",
]) assert.ok(migration.includes(token), `Harrison graph restamp guard missing: ${token}`);

const frozenRouteBlock = regression.slice(
  regression.indexOf("insert into tmp_issue97_harrison_frozen_routes values"),
  regression.indexOf("create temporary table tmp_issue97_harrison_bad_roads")
);
assert.equal((frozenRouteBlock.match(/\('[0-9a-f-]{36}'\)/g) ?? []).length, 50,
  "Harrison regression must freeze exactly fifty route UUID rows");
for (const token of [
  "c59df56888cb97022dea67b7f0460d3c", "=33", "='primary')=33", "='alternate')=17",
  "ascent--cologie", "ascent--bakos", "refresh_occurrence_candidate",
  "resolve_route_identity_path", "refresh_transition_receipts", "refresh_route_geometry",
  "refresh_route_receipt", "refresh_google_route_transition_dark",
  "non_target_roads", "non_target_candidates", "non_target_occurrences",
  "non_target_routes", "non_target_transitions", "non_target_geometry",
  "non_target_private_google", "non_target_graphs", "issue97_forbid_protected_dml",
  "issue97_harrison_no_source_identity_dml", "issue97_harrison_no_source_segment_dml",
  "issue97_harrison_no_junction_dml", "issue97_harrison_no_membership_dml",
  "issue97_harrison_no_anchor_dml",
  "public_google", "global_reconciliation", "nearest_road", "fuzzy_name",
]) assert.ok(regression.includes(token), `Harrison executable regression missing: ${token}`);

assert.equal((lowerRegression.match(/^begin;$/gm) ?? []).length, 1,
  "Harrison regression must have one outer transaction");
assert.equal((lowerRegression.match(/^rollback;$/gm) ?? []).length, 1,
  "Harrison regression must end in one rollback");
assert.equal((lowerRegression.match(/^commit;$/gm) ?? []).length, 0,
  "Harrison regression must never commit");
for (const forbidden of [
  "brinesearch_issue97_cutover_at", "driver_google_routes_public(",
  "brinesearch_issue97_activate", "rebuild_county_graph(",
  "brinesearch_oh_county_code", "\\set issue97_", ":issue97_",
]) assert.ok(!lowerRegression.includes(forbidden), `Harrison regression has forbidden/widenable behavior: ${forbidden}`);

console.log("Issue #97 Harrison HAR->HAS wrong-geometry repair audit passed.");
