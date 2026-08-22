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
const publicLoader = read("v17/src/parts/00ac-authoritative-google-routes-issue97.js");
const publicPolicy = read(
  "supabase/migrations/20260813174828_issue97_google_route_dispatcher_policy_readiness.sql"
);
const originalGoogleSchema = read(
  "supabase/migrations/20260811233500_issue97_automatic_google_routes.sql"
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
const currentVerifiedRun = functionBody(
  "private_verification.brinesearch_issue97_current_verified_run_id("
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
  "brinesearch_issue97_dataset_scope_current(",
  "brinesearch_issue97_ingest_run_verified(r.id)",
  "r.dataset_id=p_dataset_id",
  "r.state_code=p_state_code",
  "r.county_code=p_county_code",
  "order by r.started_at desc,r.id desc",
  "else null",
]) assert.ok(currentVerifiedRun.includes(token),
  `Issue #97 newest-verified exact-scope helper missing: ${token}`);
assert.ok(!migration.includes("last_success_run_id"),
  "Issue #97 migration must not revive the nonexistent last_success_run_id contract");
assert.ok(currentVerifiedRun.indexOf("brinesearch_issue97_dataset_scope_current(") <
  currentVerifiedRun.indexOf("brinesearch_issue97_ingest_run_verified(r.id)"),
  "Issue #97 source helper must gate newest-verified selection on current scope");

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
  "private_dark_google_manifest_route_not_current",
  "source_revision,manifest",
  "v_route.updated_at,v_receipt.manifest",
]) assert.ok(projection.includes(token), `Issue #97 public projection gate missing: ${token}`);
for (const forbidden of [
  "tmp_issue97_transition_google_",
  "st_closestpoint",
  "brinesearch_authoritative_road_identities",
  "generate_series",
]) assert.ok(!projection.includes(forbidden), `Issue #97 public projection reconstructs route evidence: ${forbidden}`);
assert.ok(!projection.includes("into strict v_route"),
  "Issue #97 one stale route reference must not abort the whole projection batch");
assert.ok(publicCurrent.includes("transition_google_dark_current(p_pad_id)"));
assert.ok(publicCurrent.includes("brinesearch_issue97_cutover_active"));
assert.match(originalGoogleSchema, /source_revision\s+timestamptz\s+not null/i,
  "Issue #97 public source_revision must remain timestamptz");

// route_ready is private exact/dark readiness. Driver UI consumes only the RLS-
// gated public projection, whose policy invokes complete cutover/currentness.
assert.ok(publicLoader.includes("brinesearch_driver_google_routes_public"));
assert.ok(!publicLoader.includes("brinesearch_route_reconciliation_receipts_issue97"));
assert.ok(publicPolicy.includes("public.brinesearch_issue97_google_route_current(pad_id)"));
assert.ok(routeReceipt.includes("public_google_projection_required_separately"));

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
  "tmp_issue97_active_source_run_semantics",
  "graph_run_id=newest_verified_run_id",
  "helper_run_id=newest_verified_run_id",
  "verified_run_count>1",
  "issue97_source_scope_not_current",
  "brinesearch_issue97_current_verified_run_id(",
  "last_success_run_id",
  "issue97_no_external_side_effects",
  "pg_notify",
  "extensions[.]http",
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
  "issue97_projection_cutover_on",
  "update public.brinesearch_issue97_release_state set",
  "tmp_issue97_projection_insert_result",
  "tmp_issue97_projection_update_result",
  "issue97_projection_stale_private",
  "issue97_assert_projection_route_hold",
  "'missing','00000000-0000-0000-0000-000000000097'::uuid",
  "'inactive'",
  "'wrong_pad'",
  "'non_primary'",
  "issue97_public_current_private_manifest_digest",
  "issue97_public_current_dependency_digest",
  "issue97_public_current_route_revision",
  "issue97_public_current_manifest",
  "issue97_public_current_private_dependency",
  "CUTOVER_ON_COLOGIE_PROJECTION",
  "identity_reconciliation",
  "canonical_mapping",
  "exact_geometry",
  "google_manifest",
  "rollback;",
]) assert.ok(regression.includes(token), `Issue #97 executable regression missing: ${token}`);
assert.ok(regression.includes("pub.manifest=receipt.manifest"));
assert.ok(regression.includes("pub.source_revision=route.updated_at"));
assert.ok(regression.includes("public.brinesearch_issue97_google_route_current(p.id)"));
assert.ok(regression.includes("rollback to savepoint issue97_projection_cutover_on"));
assert.equal((regression.match(/\brollback;\s*$/gim) || []).length, 1,
  "Issue #97 executable regression must have one terminal outer ROLLBACK");
assert.ok(!/\bcommit\s*;/i.test(regression), "Issue #97 regression must never commit");
for (const unsafe of [
  /pg_notify/i,
  /\bnotify\b/i,
  /pg_net/i,
  /net\.http/i,
  /extensions\.http/i,
  /http_(get|post)/i,
  /webhook/i,
  /dblink/i,
  /lo_export/i,
]) assert.ok(!unsafe.test(migration),
  `Issue #97 proposed migration contains an external side-effect marker: ${unsafe}`);
assert.ok(!migration.includes("activate_graph_build"));
assert.ok(!migration.includes("activate_cutover_without_google_routes"));
assert.ok(!migration.includes("refresh_saved_road_reconciliation"));
assert.ok(!migration.includes("rebuild_county_graph"));

console.log("Issue #97 private/dark Google separation + fail-closed stage-order audit passed.");
