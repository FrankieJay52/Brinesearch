import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const pkg = JSON.parse(read("package.json"));

const corpus = read("supabase/migrations/20260811234700_issue97_route_corpus_reconciliation.sql");
const freshness = read("supabase/migrations/20260812035000_issue97_route_scope_freshness_cache.sql");
const ohio = read("supabase/migrations/20260812043500_issue97_route_occurrence_indexed_exact_candidate_lookup.sql");
const wvPaBase = read("supabase/migrations/20260812044600_issue97_wv_pa_exact_name_candidate_performance.sql");
const wvPaHits = read("supabase/migrations/20260812045000_issue97_wv_pa_indexed_exact_name_candidates.sql");
const graphPrep = read("supabase/migrations/20260812045100_issue97_route_reconciliation_graph_current_cache.sql");
const graphFailClosed = read("supabase/migrations/20260812045200_issue97_graph_current_cache_fail_closed.sql");
const phase1Scope = read("supabase/migrations/20260812045300_issue97_phase1_gate_road_occurrence_scope.sql");

const includesAll = (source, tokens, label) => {
  for (const token of tokens) assert.ok(source.includes(token), `${label} missing: ${token}`);
};

includesAll(corpus, [
  "brinesearch_route_occurrence_candidates_issue97",
  "brinesearch_route_occurrence_receipts_issue97",
  "brinesearch_route_occurrence_receipt_history_issue97",
  "brinesearch_route_reconciliation_receipts_issue97",
  "brinesearch_route_reconciliation_history_issue97",
  "brinesearch_issue97_reconcile_route_corpus",
  "brinesearch_issue97_route_exception_queue",
  "brinesearch_issue97_route_corpus_metrics",
  "route_graph_unique_identity_path",
  "explicit_authoritative_source_receipt",
  "requires_unique_authoritative_route_graph_path",
  "saved_sequence_has_no_exact_authoritative_graph_path",
  "authoritative_route_identity_path_ambiguous",
  "candidate evidence only; not occurrence proof",
  "exact name equality is candidate evidence only",
  "route designation is candidate evidence only",
  "manual_map_editor_role",
  "review_exception_qa_only",
  "pg_advisory_xact_lock",
  "zero_forbidden_resolutions",
  "coalesce(resolution_method,'') not in ('name_only','fuzzy_name','nearest_road','route_number_only')",
  "p_left_identity=p_right_identity or exists(",
  "brinesearch_road_junction_memberships",
  "brinesearch_issue97_graph_build_sources_current",
  "private_verification.brinesearch_issue97_dataset_scope_current",
  "Raw source identities are never bulk-promoted",
  "route_variant_structured_publication_not_generated",
  "v_route.route_group='primary' and v_route.variant_index=1",
  "pr.route_group='primary' and pr.route_variant_index=0"
], "Issue #97 corpus contract");
assert.ok(!corpus.includes("insert into public.brinesearch_roads"), "Corpus reconciliation must never bulk-promote raw source identities");
assert.ok(!corpus.includes("similarity("), "Corpus reconciliation must not select by fuzzy similarity");
assert.ok(!corpus.includes("<->"), "Corpus reconciliation must not select by nearest geometry");

includesAll(freshness, [
  "brinesearch_issue97_prepare_scope_current_cache",
  "brinesearch_issue97_dataset_scope_current_cached",
  "tmp_issue97_scope_current_cache",
  "pg_advisory_xact_lock_shared",
  "brinesearch:issue97:ingest:",
  "scope.active and scope.ingest_enabled",
  "perform private_verification.brinesearch_issue97_prepare_scope_current_cache(v_state)",
  "Fails closed when the locked route-transaction cache is absent"
], "Issue #97 source-freshness cache");
assert.match(freshness, /revoke all on function private_verification\.brinesearch_issue97_refresh_occurrence_candidate\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Occurrence candidate resolver must remain internal");
assert.ok(!/similarity\(|<->|nearest_road_used_for_mapping'\s*,\s*true/.test(freshness),
  "Freshness cache must not introduce fuzzy/nearest resolution");

includesAll(ohio, [
  "brinesearch_authoritative_names_exact_issue97_idx",
  "brinesearch_authoritative_identities_oh_route_number_issue97_idx",
  "normalized_name=v_token",
  "exact_authoritative_name_candidate'',false",
  "exact_authoritative_designation_candidate'',false",
  "brinesearch_issue97_dataset_scope_current_cached",
  "Issue #97 Ohio indexed candidate lookup contract did not install cleanly"
], "Issue #97 Ohio indexed candidate contract");
assert.ok(!ohio.includes("strong_proof'',true"), "Ohio exact-name/designation candidates must remain non-authoritative");
assert.ok(!ohio.includes("similarity("), "Ohio candidate path must not use fuzzy similarity");
assert.ok(!ohio.includes("<->"), "Ohio candidate path must not use nearest geometry");
assert.equal((ohio.match(/nearest_road_used'',true/g) ?? []).length, 1,
  "Ohio nearest-road=true may appear only in the runtime rejection sentinel");

includesAll(wvPaBase, [
  "Issue #97 WV/PA normalized-name drift is not trim-only",
  "brinesearch_authoritative_identities_state_exact_name_issue97_idx",
  "i.normalized_name=v_token",
  "n.normalized_name=v_token",
  "candidate evidence",
  "Issue #97 WV/PA indexed exact-name candidate lookup did not install cleanly",
  "Issue #97 WV/PA performance patch weakened no-guess candidate semantics"
], "Issue #97 WV/PA materialized exact-name contract");
assert.equal((wvPaBase.match(/similarity\(/g) ?? []).length, 1,
  "WV/PA base migration may mention fuzzy similarity only in its runtime rejection sentinel");
assert.equal((wvPaBase.match(/<->/g) ?? []).length, 1,
  "WV/PA base migration may mention nearest geometry only in its runtime rejection sentinel");
assert.equal((wvPaBase.match(/exact_authoritative_name_candidate'',true/g) ?? []).length, 1,
  "WV/PA exact-name=true may appear only in the runtime rejection sentinel");
assert.ok(wvPaBase.includes("v_definition like '%exact_authoritative_name_candidate'',true%'"),
  "WV/PA base migration must reject any composed runtime that promotes exact-name candidate evidence");
assert.match(wvPaBase, /revoke all on function private_verification\.brinesearch_issue97_refresh_occurrence_candidate\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "WV/PA candidate resolver must remain internal");

includesAll(wvPaHits, [
  "where i.state_code=v_state and i.active and i.normalized_name=v_token",
  "where n.active and n.normalized_name=v_token",
  ") hit",
  "on i.id=hit.identity_id and i.state_code=v_state and i.active",
  "strong_proof remains false",
  "No fuzzy/name-only/nearest",
  "v_definition like '%similarity(%'",
  "v_definition like '%nearest_road_used'',true%'"
], "Issue #97 WV/PA indexed-hit-first contract");
assert.equal((wvPaHits.match(/similarity\(/g) ?? []).length, 1,
  "WV/PA indexed-hit migration may mention fuzzy similarity only in its runtime rejection sentinel");
assert.equal((wvPaHits.match(/nearest_road_used'',true/g) ?? []).length, 1,
  "WV/PA indexed-hit migration may mention nearest-road=true only in its runtime rejection sentinel");
assert.ok(!wvPaHits.includes("<->"), "WV/PA indexed-hit-first path must not use nearest geometry operator");

includesAll(graphPrep, [
  "brinesearch_issue97_prepare_graph_current_cache",
  "brinesearch_issue97_reconcile_route_corpus",
  "No topology or",
  "resolution semantics change"
], "Issue #97 graph-cache preparation contract");
includesAll(graphFailClosed, [
  "tmp_issue97_graph_current_cache",
  "return false",
  "brinesearch_issue97_graph_build_sources_current(p_build_id)",
  "fail-closed"
], "Issue #97 graph-cache fail-closed contract");
includesAll(phase1Scope, [
  "s.step_kind in",
  "interstate",
  "us_route",
  "state_route",
  "county_road",
  "township_road",
  "local_road",
  "private_segment",
  "non-road instruction/destination"
], "Issue #97 Phase 1 road-occurrence scope");

assert.equal(pkg.scripts["verify:route-corpus-reconciliation"],
  "node v17/scripts/audit-route-corpus-reconciliation-issue97.mjs && node v17/scripts/audit-oh-structured-route-candidates-issue97.mjs && node v17/scripts/audit-issue97-terminal-private-access.mjs && node v17/scripts/audit-issue97-directional-highway-designations.mjs && node v17/scripts/audit-issue97-harrison-har-has-repair.mjs && node v17/scripts/audit-issue97-harrison-install-renderer.mjs",
  "Issue #97 route corpus audit scripts are not wired");
assert.ok(pkg.scripts.build.includes("npm run verify:route-corpus-reconciliation"),
  "Issue #97 route corpus audit must run in the full build");

console.log("Issue #97 corpus reconciliation, no-guess candidate performance, graph-cache, and exact road-occurrence gate audit passed.");
