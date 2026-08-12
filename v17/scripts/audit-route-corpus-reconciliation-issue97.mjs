import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260811234700_issue97_route_corpus_reconciliation.sql"),
  "utf8"
);
const freshnessCacheSql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260812035000_issue97_route_scope_freshness_cache.sql"),
  "utf8"
);
const ohioIndexedCandidatesSql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260812043500_issue97_route_occurrence_indexed_exact_candidate_lookup.sql"),
  "utf8"
);
const wvPaIndexedCandidatesSql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260812044600_issue97_wv_pa_exact_name_candidate_performance.sql"),
  "utf8"
);
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const need = (token, message = token) => assert.ok(migration.includes(token), `Issue #97 batch pipeline missing ${message}`);
const forbid = (token, message = token) => assert.ok(!migration.includes(token), `Issue #97 batch pipeline forbids ${message}`);

for (const token of [
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
  "zero_forbidden_resolutions"
]) need(token);

need("coalesce(resolution_method,'') not in ('name_only','fuzzy_name','nearest_road','route_number_only')",
  "database no-guess receipt constraint");
need("p_left_identity=p_right_identity or exists(", "same-identity/repeated occurrence support");
need("brinesearch_road_junction_memberships", "physical junction path selection");
need("brinesearch_issue97_graph_build_sources_current", "current graph dependency gate");
need("private_verification.brinesearch_issue97_dataset_scope_current", "current source receipt gate");
need("Raw source identities are never bulk-promoted", "no raw-source bulk promotion contract");
forbid("insert into public.brinesearch_roads", "raw authoritative source promotion");
forbid("similarity(", "fuzzy similarity selection");
forbid("<->", "nearest-geometry selection");

for (const token of [
  "brinesearch_issue97_prepare_scope_current_cache",
  "brinesearch_issue97_dataset_scope_current_cached",
  "tmp_issue97_scope_current_cache",
  "pg_advisory_xact_lock_shared",
  "brinesearch:issue97:ingest:",
  "brinesearch_issue97_dataset_scope_current(",
  "scope.active and scope.ingest_enabled",
  "perform private_verification.brinesearch_issue97_prepare_scope_current_cache(v_state)",
  "v_call_count<>5",
  "v_definition:=pg_catalog.replace(v_definition,v_old,v_new)",
  "Fails closed when the locked route-transaction cache is absent"
]) assert.ok(freshnessCacheSql.includes(token), `Issue #97 route freshness cache missing: ${token}`);
assert.match(freshnessCacheSql,
  /revoke all on function private_verification\.brinesearch_issue97_prepare_scope_current_cache\(text\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Route freshness cache builder must remain internal");
assert.match(freshnessCacheSql,
  /revoke all on function private_verification\.brinesearch_issue97_dataset_scope_current_cached\(uuid,text,text\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Cached route freshness lookup must remain internal");
assert.match(freshnessCacheSql,
  /revoke all on function private_verification\.brinesearch_issue97_refresh_occurrence_candidate\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Occurrence candidate resolver must remain internal");
assert.ok(!/similarity\(|<->|name_only|nearest_road_used_for_mapping'\s*,\s*true/.test(freshnessCacheSql),
  "Freshness performance hardening must not introduce fuzzy/name-only/nearest-road resolution");

// Ohio-specific performance hardening has its own executable migration self-check.
for (const token of [
  "brinesearch_authoritative_names_exact_issue97_idx",
  "brinesearch_authoritative_identities_oh_route_number_issue97_idx",
  "brinesearch_issue97_normalize_route_token(i.display_name)",
  "brinesearch_issue97_normalize_route_token(n.road_name)",
  "normalized_name=v_token",
  "pg_catalog.lower(i.route_number)",
  "v_token=any(array[",
  "exact_authoritative_name_candidate'',false",
  "exact_authoritative_designation_candidate'',false",
  "brinesearch_issue97_dataset_scope_current_cached",
  "v_legacy_body",
  "$issue97_verify_oh_indexed_candidate_lookup$",
  "Issue #97 Ohio indexed candidate lookup contract did not install cleanly"
]) assert.ok(ohioIndexedCandidatesSql.includes(token), `Issue #97 Ohio performance contract missing: ${token}`);
assert.ok(!ohioIndexedCandidatesSql.includes("similarity("),
  "Ohio candidate performance patch must not use fuzzy similarity");
assert.ok(!ohioIndexedCandidatesSql.includes("<->"),
  "Ohio candidate performance patch must not use nearest-geometry selection");
assert.ok(!ohioIndexedCandidatesSql.includes("strong_proof'',true"),
  "Ohio exact name/designation candidates must remain non-authoritative evidence");
const nearestTrueSentinels = ohioIndexedCandidatesSql.match(/nearest_road_used'',true/g) ?? [];
assert.equal(nearestTrueSentinels.length, 1,
  "Ohio candidate migration may mention nearest-road=true only in its runtime rejection sentinel");
assert.ok(ohioIndexedCandidatesSql.includes("v_definition like '%nearest_road_used'',true%'"),
  "Ohio candidate migration must reject any composed runtime that authorizes nearest-road resolution");

// WV/PA previously normalized every source row at runtime, making full corpus
// reconciliation time out. The fix may use indexed materialized exact tokens only
// after proving any existing token drift is trim-only and restoring exact equality.
for (const token of [
  "Issue #97 WV/PA normalized-name drift is not trim-only",
  "brinesearch_issue97_normalize_route_token(i.display_name)",
  "brinesearch_issue97_normalize_route_token(n.road_name)",
  "brinesearch_authoritative_identities_state_exact_name_issue97_idx",
  "i.normalized_name=v_token",
  "n.normalized_name=v_token",
  "v_identity_count<>1",
  "v_name_count<>1",
  "exact name equality",
  "candidate evidence only",
  "Issue #97 WV/PA indexed exact-name candidate lookup did not install cleanly",
  "Issue #97 WV/PA performance patch weakened no-guess candidate semantics"
]) assert.ok(wvPaIndexedCandidatesSql.includes(token), `Issue #97 WV/PA performance contract missing: ${token}`);
assert.ok(!wvPaIndexedCandidatesSql.includes("similarity("),
  "WV/PA exact-name performance patch must not use fuzzy similarity");
assert.ok(!wvPaIndexedCandidatesSql.includes("<->"),
  "WV/PA exact-name performance patch must not use nearest-geometry selection");
assert.ok(!wvPaIndexedCandidatesSql.includes("exact_authoritative_name_candidate'',true"),
  "WV/PA exact-name candidates must remain non-authoritative evidence");
assert.match(wvPaIndexedCandidatesSql,
  /revoke all on function private_verification\.brinesearch_issue97_refresh_occurrence_candidate\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "WV/PA performance patch must preserve the internal resolver boundary");

assert.equal(pkg.scripts["verify:route-corpus-reconciliation"],
  "node v17/scripts/audit-route-corpus-reconciliation-issue97.mjs && node v17/scripts/audit-oh-structured-route-candidates-issue97.mjs",
  "Issue #97 route corpus audit scripts are not wired");
assert.ok(pkg.scripts.build.includes("npm run verify:route-corpus-reconciliation"),
  "Issue #97 route corpus audit is not in the full production build");
need("route_variant_structured_publication_not_generated",
  "alternate route variants must be explicit exceptions until route-keyed publication is complete");
need("v_route.route_group='primary' and v_route.variant_index=1",
  "Route Prep primary variant must be identified explicitly");
need("pr.route_group='primary' and pr.route_variant_index=0",
  "published primary structured route must use the existing zero-based variant key");

console.log("Issue #97 automatic route-corpus reconciliation + indexed OH/WV/PA exact-candidate audits passed.");
