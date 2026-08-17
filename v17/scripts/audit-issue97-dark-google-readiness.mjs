import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8")
  .replace(/\r\n?/g, "\n");

const migration = read(
  "supabase/migrations/20260817010000_issue97_dark_google_readiness_stage_semantics.sql"
);
const regression = read(
  "supabase/tests/issue97_dark_google_readiness_stage_semantics.sql"
);

const functionBody = name => {
  const start = migration.toLowerCase().indexOf(`create or replace function ${name}`.toLowerCase());
  assert.ok(start >= 0, `Issue #97 function missing: ${name}`);
  const next = migration.toLowerCase().indexOf("create or replace function ", start + 30);
  return migration.slice(start, next < 0 ? migration.length : next);
};

const dependency = functionBody(
  "private_verification.brinesearch_issue97_transition_google_dependency("
);
const darkHold = functionBody(
  "private_verification.brinesearch_issue97_hold_google_route_dark("
);
const dark = functionBody(
  "private_verification.brinesearch_issue97_refresh_google_route_transition_dark("
);
const darkCurrent = functionBody(
  "private_verification.brinesearch_issue97_transition_google_dark_current("
);
const projection = functionBody(
  "private_verification.brinesearch_issue97_refresh_google_route_transition("
);
const publicCurrent = functionBody(
  "private_verification.brinesearch_issue97_transition_google_current("
);
const darkBatch = functionBody(
  "private_verification.brinesearch_issue97_refresh_google_routes_dark("
);
const pipeline = functionBody(
  "public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core("
);
const routeReceipt = functionBody(
  "private_verification.brinesearch_issue97_refresh_route_receipt("
);

for (const token of [
  "brinesearch_issue97_current_verified_run_id",
  "brinesearch_issue97_ingest_run_verified",
  "brinesearch_issue97_dataset_scope_current",
  "brinesearch_issue97_authoritative_identity_geometry_digest",
  "brinesearch_issue97_graph_build_release_current_contextual",
  "brinesearch_issue97_mapping_fingerprint",
  "brinesearch_issue97_pad_safety_facts",
  "brinesearch_issue97_route_data_blocked",
]) assert.ok(dependency.includes(token), `Issue #97 exact dependency missing: ${token}`);
for (const forbidden of ["geometry_kind", "g.miles", "graph_build_sources_current("]) {
  assert.ok(!dependency.includes(forbidden), `Issue #97 dependency retained obsolete/weaker token: ${forbidden}`);
}

for (const token of [
  "publication_mode','private_dark'",
  "public_projected',false",
  "source_dependency_digest",
  "graph_dependency_digest",
  "mapping_dependency_digest",
  "safety_digest",
  "brinesearch_authoritative_segment_identity_assignments",
  "brinesearch_authoritative_external_road_segments",
  "source_distance_m<=1",
  "saved_pad_gps",
  "name_only_resolution',false",
  "nearest_road_resolution',false",
  "fuzzy_resolution',false",
]) assert.ok(dark.includes(token), `Issue #97 dark manifest contract missing: ${token}`);

for (const forbidden of [
  "brinesearch_issue97_cutover_active",
  "brinesearch_driver_google_routes_public",
  "update public.pads",
  "brinesearch_issue97_hold_google_route(",
]) assert.ok(!dark.includes(forbidden), `Issue #97 dark generator can publish/mutate public state: ${forbidden}`);
assert.ok(!darkHold.includes("brinesearch_driver_google_routes_public"));
assert.ok(!darkHold.includes("update public.pads"));
assert.ok(!darkHold.includes("queue_google_route_refresh"));

for (const token of [
  "transition_google_dependency(p_pad_id)",
  "manifest-'manifest_digest'",
  "source_dependency_digest",
  "graph_dependency_digest",
  "mapping_dependency_digest",
  "publication_mode",
  "private_dark",
  "public_projected",
  "no_guess",
]) assert.ok(darkCurrent.includes(token), `Issue #97 dark currentness missing: ${token}`);
assert.ok(!darkCurrent.includes("brinesearch_issue97_cutover_active"));
assert.ok(!darkCurrent.includes("brinesearch_driver_google_routes_public"));

for (const token of [
  "brinesearch_issue97_cutover_active",
  "transition_google_dark_current(p_pad_id)",
  "v_receipt.manifest",
  "brinesearch_driver_google_routes_public",
  "brinesearch_google_route_status_issue97='ready'",
]) assert.ok(projection.includes(token), `Issue #97 public projection gate missing: ${token}`);
for (const forbidden of [
  "tmp_issue97_transition_google_",
  "st_closestpoint",
  "brinesearch_authoritative_road_identities",
  "generate_series",
]) assert.ok(!projection.includes(forbidden), `Issue #97 public projection reconstructs route evidence: ${forbidden}`);
assert.ok(publicCurrent.includes("transition_google_dark_current(p_pad_id)"));
assert.ok(publicCurrent.includes("brinesearch_issue97_cutover_active"));

assert.ok(darkBatch.includes("refresh_google_route_transition_dark"));
assert.ok(!darkBatch.includes("refresh_google_route_transition("));
assert.ok(pipeline.includes("brinesearch_issue97_refresh_google_routes_dark"));
assert.ok(!pipeline.includes("brinesearch_issue97_refresh_google_routes("));

const zeroGate = routeReceipt.indexOf("if v_occurrences=0");
const stageGate = routeReceipt.indexOf("if v_occurrences=0", zeroGate + 1);
const canonicalGate = routeReceipt.indexOf("elsif v_canonical<>v_occurrences");
const geometryGate = routeReceipt.indexOf("elsif v_geometry<>v_occurrences");
const googleGate = routeReceipt.indexOf("elsif not v_dark_current");
assert.ok(zeroGate >= 0 && stageGate > zeroGate && canonicalGate > stageGate
  && geometryGate > canonicalGate && googleGate > geometryGate,
"Issue #97 route-stage ordering is not upstream -> identity -> mapping -> geometry -> dark Google");
for (const token of [
  "route_prep_",
  "no_saved_road_occurrences",
  "authoritative_occurrence_identity_incomplete",
  "canonical_road_mapping_missing_for_resolved_identity",
  "exact_occurrence_geometry_incomplete",
  "google_route_manifest_not_ready",
  "transition_google_dark_current",
  "public_google_projection_required_separately",
]) assert.ok(routeReceipt.includes(token), `Issue #97 stage receipt missing: ${token}`);

for (const token of [
  "\\set ON_ERROR_STOP on",
  "begin;",
  "set local statement_timeout='20min'",
  "set local lock_timeout='2min'",
  "\\ir ../migrations/20260817010000_issue97_dark_google_readiness_stage_semantics.sql",
  "issue97_dark_google_acl_assertions",
  "has_function_privilege",
  "ascent--cologie",
  "ascent--bakos",
  "ascent--liggett",
  "eog--west",
  "gulfport--gehrig",
  "eqt--walking-tall",
  "active_primary_route_prep_missing",
  "multiple_active_primary_route_preps",
  "issue97_stale_graph",
  "issue97_stale_source",
  "issue97_stale_mapping",
  "issue97_stale_geometry",
  "identity_reconciliation",
  "canonical_mapping",
  "exact_geometry",
  "google_manifest",
  "rollback;",
]) assert.ok(regression.includes(token), `Issue #97 executable regression missing: ${token}`);
assert.equal((regression.match(/\brollback;\s*$/gim) || []).length, 1,
  "Issue #97 executable regression must have one terminal outer ROLLBACK");
assert.ok(!/\bcommit\s*;/i.test(regression), "Issue #97 regression must never commit");
assert.ok(!migration.includes("activate_graph_build"));
assert.ok(!migration.includes("activate_cutover_without_google_routes"));
assert.ok(!migration.includes("refresh_saved_road_reconciliation"));
assert.ok(!migration.includes("rebuild_county_graph"));

console.log("Issue #97 private/dark Google separation + fail-closed stage-order audit passed.");
