import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const need = (source, token, label = token) =>
  assert.ok(source.includes(token), `Issue #97 Ohio completion audit missing ${label}`);
const forbid = (source, token, label = token) =>
  assert.ok(!source.includes(token), `Issue #97 Ohio completion audit forbids ${label}`);
const count = (source, token) => source.split(token).length - 1;

const bash = process.env.BRINESEARCH_BASH ?? "bash";
const shellPath = path.join(root, "ops/issue97-computer-rollout/issue97-ohio-release.sh");
execFileSync(bash, ["-n", shellPath], { stdio: "pipe" });

const shell = fs.readFileSync(shellPath, "utf8");
const complete = read("ops/issue97-computer-rollout/sql/28-verify-ohio-release-complete.sql");
const persist = read("ops/issue97-computer-rollout/sql/29-persist-ohio-state-manifest.sql");
const activate = read("ops/issue97-computer-rollout/sql/30-activate-ohio-state-manifest.sql");
const verifyActive = read("ops/issue97-computer-rollout/sql/31-verify-ohio-state-activation.sql");
const reconcile = read("ops/issue97-computer-rollout/sql/32-ohio-directions-dark-batch.sql");
const report = read("ops/issue97-computer-rollout/sql/33-ohio-directions-report.sql");
const status = read("ops/issue97-computer-rollout/sql/34-ohio-release-status.sql");
const manifestCache = read(
  "supabase/migrations/20260816160000_issue97_manifest_bound_release_current_cache.sql",
);
const manifestCacheRegression = read(
  "supabase/tests/issue97_manifest_bound_cache_context.sql",
);
const packageJson = read("package.json");

for (const token of [
  'expected_service="brinesearch_issue97_prod"',
  '[[ $# -eq 0 ]] || die "${command_name} accepts no arguments"',
  "verify-candidate)",
  "persist-manifest)",
  "activate)",
  "verify-activation)",
  "reconcile-dark)",
  "report)",
  "status)",
  "28-verify-ohio-release-complete.sql",
  "29-persist-ohio-state-manifest.sql",
  "30-activate-ohio-state-manifest.sql",
  "31-verify-ohio-state-activation.sql",
  "32-ohio-directions-dark-batch.sql",
  "33-ohio-directions-report.sql",
  "34-ohio-release-status.sql",
  '--set="issue97_git_sha=${repo_head}"',
  "inspecting current server state exactly once. No retry.",
]) need(shell, token, `fixed wrapper ${token}`);
for (const token of ["eval ", "bash -c", "--command", "DATABASE_URL=", "PGPASSWORD="]) {
  forbid(shell, token, `wrapper expansion ${token}`);
}

for (const source of [complete, verifyActive, report, status]) {
  need(source, "begin isolation level repeatable read read only", "fixed read-only transaction");
  for (const token of [
    "insert into public.", "update public.", "delete from public.",
    "brinesearch_issue97_activate_graph_build(",
    "brinesearch_issue97_activate_cutover(",
    "brinesearch_issue97_refresh_google_routes(",
    "brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(",
  ]) forbid(source.toLowerCase(), token, `read-only lane mutation ${token}`);
}

for (const token of [
  "17-release-preflight.sql",
  "registry_counties=19",
  "selected_count=19",
  "missing_counties=0",
  "multi_current_counties=0",
  "required_scopes=38",
  "current_scopes=38",
  "06705f5b35a6d37151bb2c0dc5ade9bd",
  "issue97-release-20260815-r2",
  "20260816090000",
  "brinesearch_supp_vin_start_geog_issue97_idx",
  "brinesearch_supp_vin_end_geog_issue97_idx",
  "reconciliation_runs=0",
  "public_google_routes=0",
  "non_oh_r2_builds=0",
  "activation_impact_count=0",
  "21-verify-nob-leonard-release.sql",
  "26-verify-bel-concurrency-release.sql",
  "27-verify-stark-scale-release.sql",
  "sum(expected)=2923",
  "sum(observed)=2923",
  "sum(missing)=0",
  "sum(extra)=0",
  "9867f2352ac1b7276d057a83edd95d5f",
]) need(complete, token, `completion gate ${token}`);
assert.equal(count(complete, "('CAR','5ee5f97b-447f-41d3-946a-68a8b28d8367'::uuid"), 2,
  "completion gate must pin the exact new CAR build in currentness and ODOT passes");

for (const token of [
  "28-verify-ohio-release-complete.sql",
  "issue97-ohio-r2-final-candidate",
  "brinesearch_issue97_persist_state_candidate_manifest(",
  "candidate_count',19",
  "authoritative_odot_expected',2923",
  "activation_impact_count',0",
  "non_ohio_graph_digest",
  "non_ohio_route_digest",
  "global_cutover_authorized',false",
  "name_only_or_nearest_resolution_authorized',false",
  "not exists((select * from expected except select * from actual)",
]) need(persist, token, `manifest persistence ${token}`);
for (const token of [
  "brinesearch_issue97_activate_graph_build(",
  "brinesearch_issue97_activate_cutover(",
  "brinesearch_issue97_refresh_google_routes(",
  "brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(",
]) forbid(persist, token, `manifest persistence cross-phase action ${token}`);

for (const token of [
  "issue97_ohio_activation_pins",
  "issue97_ohio_activation_locks",
  "'brinesearch:issue97:graph:OH:'||lock_row.county_code",
  "'brinesearch:issue97:ingest:'||lock_row.dataset_id||':'||lock_row.county_code",
  "hashtext('brinesearch:issue97:mapping-refresh')",
  "issue97-ohio-r2-final-candidate",
  "brinesearch_issue97_state_candidate_manifest_current",
  "candidate_manifest_digest",
  "v_impact_count<>0",
  "for v_pin in select * from issue97_ohio_activation_pins order by ordinal loop",
  "manifest.git_sha='e59f8580787bfa05a9f5c05bd3584197ac84444d'",
  "'candidate_manifest_git_sha',v_manifest.git_sha",
  "'operator_git_sha',current_setting('issue97.git_sha',true)",
  "issue97_ohio_authorizer_original",
  "f6763925461111b2069bde0f60007dd4",
  "issue97_ohio_activation_precheck",
  "current_setting('issue97.state_manifest_digest',true)=p_manifest_digest",
  "issue97_ohio_restore_authorizer",
  "activation authorizer was not restored exactly",
  "brinesearch_issue97_activate_graph_build(",
  "coalesce((v_result->>'impact_count')::integer,-1)<>0",
  "non_ohio_graph_digest",
  "non_ohio_route_digest",
  "brinesearch_driver_google_routes_public)=0",
  "saved_road_reconciliation_runs)=0",
  "commit;",
]) need(activate, token, `activation lane ${token}`);
need(status, "set local statement_timeout='15min'",
  "post-manifest recovery must retain a finite bound long enough for canonical currentness");
assert.equal(count(activate, "v_result:=public.brinesearch_issue97_activate_graph_build("), 1,
  "activation lane must have one serial manifest-bound call site");
assert.equal(count(activate, "insert into issue97_ohio_activation_pins values"), 1,
  "activation pins must be populated once");
assert.equal(count(activate,
  "create or replace function private_verification.brinesearch_issue97_candidate_manifest_authorizes_build("), 1,
  "activation may install exactly one transaction-local manifest authorizer replacement");
for (const token of [
  "brinesearch_issue97_activate_cutover(",
  "brinesearch_issue97_refresh_google_routes(",
  "brinesearch_issue97_refresh_saved_road_reconciliation(",
  "brinesearch_issue97_rebuild_county_graph(",
]) forbid(activate, token, `activation lane cross-phase action ${token}`);

for (const token of [
  "issue97-ohio-r2-final-candidate",
  "member_count=19",
  "status='active'",
  "required=38 and current=38",
  "non_ohio_graph_digest",
  "non_ohio_route_digest",
  "saved_road_reconciliation_runs)=0",
  "brinesearch_driver_google_routes_public)=0",
]) need(verifyActive, token, `activation verifier ${token}`);
need(verifyActive, "set local statement_timeout='15min'",
  "post-activation verifier must retain a finite bound above the observed five-minute runtime");

for (const token of [
  "brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest",
  "brinesearch_issue97_assert_expected_state_manifest_cache_context",
  "brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest",
  "brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest",
  "brinesearch_issue97_state_candidate_manifest_integrity",
  "brinesearch_issue97_active_graph_release_generation",
  "brinesearch_issue97_dataset_scope_current",
  "member.member_value->>'build_id'",
  "build.graph_digest=member.member_value->>'graph_digest'",
  "build.source_revision_digest=member.member_value->>'source_revision_digest'",
  "build.status='active'",
  "v_expected_count,'exact_state_manifest','fail_closed'",
  "manifest_member_digest",
  "cache_member_digest",
  "full_predicate_evaluation_count",
  "jsonb_build_object('reused',true)",
  "jsonb_build_object('reused',false)",
  "expected transaction state-manifest context is partial",
  "state-manifest cache/context pair is partial or missing",
  "state-manifest cache context differs from expected context",
  "brinesearch_issue97_ensure_graph_release_current_cache",
  "brinesearch_issue97_graph_build_release_current_contextual",
  "cbfcec5e9f814399f1ec69ee4974cb4b",
  "e9e0b2d7000c21595ef102fb99f4cb6c",
  "9e381ce3e36b4c05483992d11e642b01",
  "v_matches<>7",
  "from public,anon,authenticated,service_role",
]) need(manifestCache, token, `manifest-bound cache migration ${token}`);
const statePrepareStart = manifestCache.indexOf(
  "create or replace function private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(",
);
const statePrepareEnd = manifestCache.indexOf(
  "-- Once an exact transaction snapshot exists",
  statePrepareStart,
);
assert.ok(statePrepareStart >= 0 && statePrepareEnd > statePrepareStart,
  "manifest-bound state prepare definition must be statically isolatable");
const statePrepare = manifestCache.slice(statePrepareStart, statePrepareEnd);
for (const token of [
  "brinesearch_issue97_assert_expected_state_manifest_cache_context(",
  "brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(",
  "jsonb_build_object('reused',true)",
  "jsonb_build_object('reused',false)",
  "brinesearch_issue97_graph_build_release_current(",
  "where member.manifest_id=p_manifest_id",
]) need(statePrepare, token, `strict state prepare ${token}`);
for (const token of [
  "drop table",
  "status in ('active','validated')",
  "brinesearch_issue97_prepare_graph_release_current_cache();",
]) forbid(statePrepare, token, `strict state prepare forbidden fallback ${token}`);

const strictEnsureStart = manifestCache.indexOf(
  "create or replace function private_verification.brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(",
);
const strictEnsureEnd = manifestCache.indexOf(
  "-- Patched corpus/solver callers",
  strictEnsureStart,
);
const strictEnsure = manifestCache.slice(strictEnsureStart, strictEnsureEnd);
need(strictEnsure, "brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(",
  "strict state ensure validates exact context and set");
forbid(strictEnsure, "brinesearch_issue97_prepare_graph_release_current_cache();",
  "strict state ensure global fallback");

const compatibilityEnsureStart = manifestCache.indexOf(
  "create or replace function private_verification.brinesearch_issue97_ensure_graph_release_current_cache()\n",
);
const compatibilityEnsureEnd = manifestCache.indexOf(
  "-- A declared or present state cache",
  compatibilityEnsureStart,
);
const compatibilityEnsure = manifestCache.slice(
  compatibilityEnsureStart,
  compatibilityEnsureEnd,
);
need(compatibilityEnsure,
  "brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(",
  "compatibility ensure strict state route");
need(compatibilityEnsure, "if v_context_values=5 then",
  "compatibility ensure complete state context gate");
need(compatibilityEnsure, "if v_context_values not in (0,5) then",
  "compatibility ensure partial context failure");
need(compatibilityEnsure, "brinesearch_issue97_prepare_graph_release_current_cache();",
  "separate legacy generic diagnostic fallback");
for (const token of [
  "set local statement_timeout='91min'",
  "set local statement_timeout='120min'",
]) forbid(manifestCache, token, `manifest-cache timeout workaround ${token}`);

for (const token of [
  "\\set ON_ERROR_STOP on",
  "begin;",
  "set local statement_timeout='15min'",
  "set local lock_timeout='2min'",
  "\\ir ../migrations/20260816160000_issue97_manifest_bound_release_current_cache.sql",
  "tmp_issue97_manifest_cache_test_baseline",
  "historical/nonmember cache exclusion failed",
  "reused=false",
  "reused=true",
  "cache_relfilenode",
  "preparation_token",
  "full predicate was recomputed",
  "savepoint issue97_no_recompute",
  "11111111-1111-4111-8111-111111111111",
  "expected transaction state-manifest context is partial",
  "drop table pg_temp.tmp_issue97_graph_release_current_cache_context",
  "drop table pg_temp.tmp_issue97_graph_release_current_cache",
  "set manifest_digest='00000000000000000000000000000000'",
  "set member_count=18",
  "set current=false",
  "cache context requires exactly one row",
  "generic contextual full-live predicate compatibility failed",
  "rollback;",
]) need(manifestCacheRegression, token, `manifest cache executable regression ${token}`);
assert.equal(count(manifestCacheRegression, "rollback;"), 1,
  "manifest cache executable regression must finish with one outer rollback");
need(packageJson,
  '"verify:issue97-ohio-completion": "node v17/scripts/audit-issue97-ohio-completion-lane.mjs"',
  "manifest cache regression must be wired through the required Ohio audit/build path");

for (const token of [
  "c41f5320-1273-470c-a316-28b42211d697",
  "issue97-ohio-r2-final-candidate",
  "brinesearch_issue97_state_candidate_manifest_current",
  "9867f2352ac1b7276d057a83edd95d5f",
  "hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)",
  "hashtextextended('brinesearch:issue97:route-corpus',97)",
  "hashtext('brinesearch:issue97:saved-road-reconciliation')",
  "brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core",
  "non_ohio_graph_unchanged",
  "non_ohio_routes_unchanged",
  "global_reconciliation_dark",
  "public_google_dark",
  "9763dc5bb626da71881b7381ed28a436",
  "brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest",
  "tmp_issue97_graph_release_current_cache_context",
  "tmp_issue97_graph_release_current_cache",
  "cache_scope",
  "exact_state_manifest",
  "cache_miss_policy",
  "fail_closed",
  "release_current_count",
  "brinesearch.issue97_expected_state_manifest_id",
  "brinesearch.issue97_expected_state_manifest_digest",
  "brinesearch.issue97_expected_state_code",
  "brinesearch.issue97_expected_generation_key",
  "brinesearch.issue97_expected_member_count",
  "v_manifest.id,v_manifest.manifest_digest,v_manifest.state_code",
  "v_manifest.generation_key,v_manifest.member_count",
  "v_cache->>'reused'<>'false'",
]) need(reconcile, token, `dark reconciliation ${token}`);
assert.equal(count(reconcile, "c41f5320-1273-470c-a316-28b42211d697"), 4,
  "every one of the four Ohio manifest lookups must pin the exact manifest UUID");
assert.equal(count(reconcile, "issue97-ohio-r2-final-candidate"), 4,
  "every one of the four Ohio manifest lookups must retain the exact key pin");
need(reconcile, "set local statement_timeout='15min'",
  "dark reconciliation preflight must retain a finite bound above the observed five-minute runtime");
need(reconcile, "set local statement_timeout='90min'",
  "dark reconciliation write must retain the reviewed finite 90-minute bound");
assert.equal(
  count(
    reconcile,
    "private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(",
  ),
  1,
  "Ohio dark reconciliation must prepare the exact state-manifest cache once",
);
assert.ok(
  reconcile.indexOf(
    "private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(",
  ) < reconcile.indexOf("for pad_row in"),
  "Ohio exact manifest cache must be prepared before the 940-pad loop",
);
assert.equal(
  count(reconcile, "private_verification.brinesearch_issue97_prepare_graph_release_current_cache();"),
  0,
  "Ohio dark reconciliation must never invoke the global all-build cache",
);
assert.equal(count(reconcile.toLowerCase(), "commit;"), 1,
  "Ohio dark reconciliation must commit exactly once after all postchecks");
assert.ok(reconcile.indexOf("non_ohio_graph_unchanged") < reconcile.toLowerCase().lastIndexOf("commit;"),
  "Ohio dark reconciliation isolation checks must run before commit");
assert.ok(
  reconcile.indexOf("hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)") <
    reconcile.indexOf("hashtextextended('brinesearch:issue97:route-corpus',97)"),
  "Ohio dark reconciliation must preserve installed all-pad -> route-corpus lock order",
);
for (const token of [
  "brinesearch_issue97_activate_graph_build(",
  "brinesearch_issue97_activate_cutover(",
  "brinesearch_issue97_refresh_google_routes(",
  "brinesearch_issue97_refresh_saved_road_reconciliation(",
]) forbid(reconcile, token, `dark reconciliation forbidden action ${token}`);

for (const token of [
  "issue97-ohio-r2-final-candidate",
  "non_list_only_pads",
  "pads_without_active_primary_route",
  "'route_ready'",
  "'held'",
  "'unresolved'",
  "transition_holds_by_reason",
  "occurrence_holds_by_reason",
  "geometry_holds_by_reason",
  "repeated_road_routes",
  "shared_segment_sequence_transitions",
  "no_guess_proof",
  "google_readiness_state",
  "ascent--cologie",
  "WALKING TALL",
  "no_active_primary_route",
]) need(report, token, `Ohio readiness report ${token}`);
need(report, "join primary_routes route on route.id=receipt.route_prep_id", "Ohio readiness report current active-primary receipt scope");
assert(!/\blimit\s+\d+\s*;/i.test(report), "Ohio readiness report must emit the complete exception queue without a row cap");

console.log("Issue #97 fixed whole-Ohio 19/19 completion gate, immutable exact state manifest, one-time fail-closed manifest-bound release-current snapshot, zero-impact serial manifest activation, pre-commit Ohio-only dark reconciliation isolation, durable recovery status, and readiness/fixture reporting audit passed.");
