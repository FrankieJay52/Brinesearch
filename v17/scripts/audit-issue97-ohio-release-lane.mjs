import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const need = (source, token, label = token) =>
  assert.ok(source.includes(token), `Issue #97 Ohio release audit missing ${label}`);
const forbid = (source, token, label = token) =>
  assert.ok(!source.includes(token), `Issue #97 Ohio release audit forbids ${label}`);
const count = (source, token) => source.split(token).length - 1;

const shellPath = path.join(root, "ops/issue97-computer-rollout/issue97-release-rollout.sh");
const rehearsalPath = path.join(root, "ops/issue97-computer-rollout/issue97-release-rehearsal.sh");
for (const scriptPath of [shellPath,rehearsalPath]) {
  execFileSync("bash", ["-n", scriptPath], { stdio: "pipe" });
}

const shell = fs.readFileSync(shellPath, "utf8");
const rehearsal = fs.readFileSync(rehearsalPath, "utf8");
const overlap = read("supabase/migrations/20260814163050_issue97_odot_authoritative_overlap_shared_pavement.sql");
const sharedRoute = read("supabase/migrations/20260814163250_issue97_shared_route_right_continuation_context.sql");
const fixtureReceipts = read("supabase/migrations/20260814164250_issue97_database_bound_fixture_receipts.sql");
const plan = read("ops/issue97-computer-rollout/sql/24-ohio-release-dark-plan.sql");
const gate = read("ops/issue97-computer-rollout/sql/25-ohio-canary-complete-gate.sql");
const belCanary = read("ops/issue97-computer-rollout/sql/26-verify-bel-concurrency-release.sql");
const starkCanary = read("ops/issue97-computer-rollout/sql/27-verify-stark-scale-release.sql");

for (const token of [
  "ohio-canary",
  "plan-ohio-dark",
  "build-pending-ohio-dark",
  "Ohio canary 1/3: OH NOB semantic topology canary",
  "Ohio canary 2/3: OH BEL authoritative concurrency canary",
  "Ohio canary 3/3: OH STA scale canary",
  "21-verify-nob-leonard-release.sql",
  "26-verify-bel-concurrency-release.sql",
  "27-verify-stark-scale-release.sql",
  "25-ohio-canary-complete-gate.sql",
  "24-ohio-release-dark-plan.sql",
  "grep -E '^OH\\|[A-Z]{3}$'",
  "non-Ohio scope leaked into Ohio batch",
  "Ohio canary ${county} unexpectedly remained in post-canary Ohio plan",
  "more than 16 counties",
  "No WV/PA build, activation, cutover, route publication or retry occurred.",
  "whole-Ohio independent read-only audit",
  "mixed-state release command disabled during Ohio-first phase",
  "PA WAS Possum/performance canary is deferred",
]) need(shell, token, `Ohio-first shell ${token}`);

for (const forbidden of [
  "build_release_scope PA WAS",
  "build_release_scope WV ",
  "activate_graph_build",
  "activate_cutover",
  "refresh_google_routes",
  "xargs -P",
  "parallel ",
  "| tee ",
]) forbid(shell, forbidden, `Ohio-first shell expansion ${forbidden}`);

for (const source of [plan,gate,belCanary,starkCanary]) {
  need(source, "begin read only", "read-only transaction");
  need(source, "set local statement_timeout='2min'", "bounded read-only timeout");
  for (const forbidden of [
    "insert into public.",
    "update public.",
    "delete from public.",
    "brinesearch_issue97_activate_graph_build",
    "brinesearch_issue97_activate_cutover",
    "brinesearch_issue97_refresh_google_routes",
  ]) forbid(source.toLowerCase(), forbidden, `Ohio release SQL mutation ${forbidden}`);
}

for (const token of [
  "state_code='OH'",
  "v_oh_count<>19",
  "v_scope_count<>38",
  "brinesearch_issue97_dataset_scope_current",
  "brinesearch_issue97_graph_build_release_current",
  "case when c.county_code='NOB' then 0 else 1 end",
]) need(plan, token, `Ohio plan ${token}`);
for (const forbidden of ["state_code='WV'","state_code='PA'"]) forbid(plan, forbidden, `non-Ohio plan token ${forbidden}`);

for (const token of [
  "state_code='OH' and b.county_code='NOB'",
  "state_code='OH' and b.county_code='BEL'",
  "state_code='OH' and b.county_code='STA'",
  "b.status='validated'",
  "b.activated_at is null",
  "brinesearch_issue97_graph_build_release_current",
  "v_nob<>1 or v_bel<>1 or v_sta<>1",
]) need(gate, token, `three-canary gate ${token}`);

for (const token of [
  "OH:ODOT:NLF:SBELUS00040**C",
  "OH:ODOT:NLF:SBELIR00070**C",
  "v_expected<>10",
  "2025_000000000270433",
  "2025_000000000269543",
  "odot_authoritative_overlap_pairs",
  "persistent_secondary_geometry_unchanged",
]) need(belCanary, token, `Belmont US-40/I-70 canary ${token}`);
for (const token of [
  "v_expected<>623",
  "state_code='OH' and b.county_code='STA'",
  "brinesearch_issue97_graph_build_release_current",
  "623 eligible ODOT overlap pairs",
]) need(starkCanary, token, `Stark scale canary ${token}`);

for (const token of [
  "expected exactly 20 final release migrations",
  "20260814074500_issue97_graph_builder_temp_geography_index.sql",
  "20260814163050_issue97_odot_authoritative_overlap_shared_pavement.sql",
  "20260814163250_issue97_shared_route_right_continuation_context.sql",
  "20260814164250_issue97_database_bound_fixture_receipts.sql",
  "set local statement_timeout='15min'",
  "set local lock_timeout='2min'",
  "begin;",
  "rollback;",
  "FINAL RELEASE MIGRATION CHAIN COMPILED AND VERIFIED INSIDE TRANSACTION",
  "production snapshot changed across rollback rehearsal",
  "all 20 final #97 release migrations compiled/verified in one transaction",
  "793ed8985252b00d52f46da497484029",
  "odot_authoritative_overlap_pairs",
  "shared_segment_right_continuation_context",
  "right_context_outside_shared_interval",
  "brinesearch_issue97_current_pinned_fixture_receipts",
  "caller-supplied fixture/report trust path remains",
  "brinesearch_issue97_graph_release_generation_immutable",
  "has_function_privilege",
  "OH'",
  "v_required<>38 or v_current<>38",
]) need(rehearsal, token, `rollback rehearsal ${token}`);

for (const token of [
  "PRIMARY_OVERLAP_ID",
  "OVERLAP_INVERSE_IND",
  "issue97_topology_geometry_source",
  "odot_authoritative_overlap_pairs",
  "persistent_secondary_geometry_unchanged",
  "793ed8985252b00d52f46da497484029",
]) need(overlap, token, `ODOT shared-pavement contract ${token}`);

const overlapWithoutNoGuessGuards = overlap
  .replaceAll("v_patched like '%similarity(%'", "")
  .replaceAll("v_definition like '%similarity(%'", "")
  .replaceAll("v_patched like '%<->%'", "")
  .replaceAll("v_definition like '%<->%'", "");
for (const forbidden of ["similarity(","<->","nearest_road"]) {
  forbid(overlapWithoutNoGuessGuards, forbidden, `ODOT shared-pavement guess ${forbidden}`);
}
need(overlap, "v_patched like '%similarity(%'", "ODOT no-fuzzy generated-builder guard");
need(overlap, "v_patched like '%<->%'", "ODOT no-nearest generated-builder guard");

for (const token of [
  "8b37717bede32c6f20dc3dff347cabdb",
  "726a3f20e3da280b59c311f3cdb6b254",
  "shared_segment_right_continuation_context",
  "right_context_kind",
  "right_context_outside_shared_interval",
  "selection_uses_exact_right_identity",
  "selection_uses_route_sequence",
  "selection_uses_name_similarity',false",
  "selection_uses_nearest_road',false",
  "selection_uses_route_number_alone',false",
  "for v_i in reverse v_count-1..1 loop",
  "case when v_i=v_count-1 then 50 else 1 end",
]) need(sharedRoute, token, `generic A-to-B shared-route contract ${token}`);
for (const forbidden of ["similarity(","<->","closest_anchor'"]) {
  forbid(sharedRoute, forbidden, `generic shared-route guessed selector ${forbidden}`);
}

for (const token of [
  "brinesearch_issue97_current_pinned_fixture_receipts",
  "issue97-database-bound-fixtures-v1",
  "jsonb_object_length(v_fixture_results->'database_bound')<>8",
  "caller fixture results were supplied",
  "manifest.git_sha<>p_git_sha",
  "WALKING TALL",
  "shared_segment_right_continuation_context",
  "ascent--cologie",
  "OH:ODOT:NLF:CJEFCR00026**C",
  "OH:ODOT:NLF:TNOBTR00055**C",
  "WV:WVDOT:ROUTE_ID:3500895000000",
  "exact_git_sha",
  "long_chunk",
  "parallel_shortcut",
  "CI requirements are verified outside PostgreSQL",
]) need(fixtureReceipts, token, `database-bound fixture receipt ${token}`);
for (const forbidden of [
  "p_pinned_fixture_results->>key",
  "v_required_fixture_keys",
]) forbid(fixtureReceipts, forbidden, `caller fixture boolean trust ${forbidden}`);

assert.equal(
  count(rehearsal, "supabase/migrations/20260814"),
  20,
  "rollback rehearsal must list exactly the 20 final release migration paths"
);
for (const forbidden of [
  "supabase db push",
  "supabase migration up",
  "apply_migration",
  "commit;",
  "PGPASSWORD=",
  "DATABASE_URL=",
]) forbid(rehearsal, forbidden, `rollback rehearsal unsafe action ${forbidden}`);

console.log("Issue #97 Ohio-first NOB semantic + BEL concurrency + STA scale canaries, authoritative ODOT shared-pavement, generic fail-closed A-to-B shared-route context, database-bound release fixture receipts, unattended serial fail-stop batch, and exact rollback rehearsal audit passed.");
