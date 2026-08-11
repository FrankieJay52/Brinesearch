import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811240000_issue97_route_transition_receipts.sql"), "utf8");

for (const token of [
  "private_verification.brinesearch_route_transition_receipts_issue97",
  "private_verification.brinesearch_route_transition_history_issue97",
  "status in ('resolved','held','stale')",
  "adjacent_same_road_split_requires_explicit_source_boundary",
  "canonical_geometry_missing_or_not_publishable",
  "canonical_geometry_invalid",
  "no_current_authoritative_transition_anchor",
  "multiple_current_authoritative_transition_anchors",
  "shared_segment_requires_sequence_context",
  "shared_segment_sequence_context",
  "selection_uses_route_sequence",
  "selection_uses_name_similarity',false",
  "selection_uses_nearest_road',false",
  "brinesearch_issue97_graph_build_sources_current",
  "brinesearch_issue97_dataset_scope_current",
  "extensions.st_dwithin(a.geom::extensions.geography,v_left_geom::extensions.geography,1)",
  "extensions.st_dwithin(a.geom::extensions.geography,v_right_geom::extensions.geography,1)",
  "v_component_count<>1",
  "public.brinesearch_issue97_run_all_pad_routing_pipeline(",
  "public.brinesearch_issue97_transition_exception_queue(",
  "manual_map_editor_role','review_exception_qa_only'"
]) {
  assert.ok(sql.includes(token), `Issue #97 transition safety contract missing: ${token}`);
}

for (const forbidden of [
  "'name_only'",
  "'fuzzy_name'",
  "'nearest_road'",
  "'route_number_only'",
  "'closest_anchor'"
]) {
  assert.ok(sql.includes(forbidden), `Issue #97 transition no-guess constraint missing forbidden method: ${forbidden}`);
}

assert.match(sql, /constraint brinesearch_route_transition_no_guess_issue97_check[\s\S]*coalesce\(resolution_method,''\) not in \([\s\S]*'name_only'[\s\S]*'fuzzy_name'[\s\S]*'nearest_road'[\s\S]*'route_number_only'[\s\S]*'closest_anchor'/,
  "Issue #97 transition receipts must enforce no-guess methods at the database constraint layer");
assert.match(sql, /status<>'resolved' or \([\s\S]*junction_id is not null and anchor_id is not null[\s\S]*coordinate is not null[\s\S]*graph_build_id is not null[\s\S]*source_revision_digest is not null[\s\S]*anchor_digest is not null/,
  "Issue #97 resolved transitions must carry exact graph/source/anchor evidence");
assert.match(sql, /v_candidate_count=1[\s\S]*ml\.identity_id=v_left\.identity_id[\s\S]*ml\.road_id=v_left\.canonical_road_id[\s\S]*mr\.identity_id=v_right\.identity_id[\s\S]*mr\.road_id=v_right\.canonical_road_id/,
  "Issue #97 unique transition selection must bind both exact authoritative identities to their canonical road ids");
assert.match(sql, /j\.verification_status='verified'[\s\S]*b\.status='active'[\s\S]*brinesearch_issue97_graph_build_sources_current\(b\.id\)/,
  "Issue #97 transition selection must use only verified junctions on active source-current graph builds");
assert.match(sql, /v_left\.identity_id=v_right\.identity_id or v_left\.canonical_road_id=v_right\.canonical_road_id[\s\S]*adjacent_same_road_split_requires_explicit_source_boundary/,
  "Issue #97 must never invent an adjacent same-road split boundary");
assert.match(sql, /A->B->A[\s\S]*selection_uses_route_sequence',true/,
  "Issue #97 shared-segment transition resolution must be sequence-aware");
assert.match(sql, /v_previous is null or v_next is null then continue/,
  "Issue #97 shared-segment resolution must require surrounding exact boundaries");
assert.match(sql, /revoke all on function public\.brinesearch_issue97_run_all_pad_routing_pipeline\(uuid\)[\s\S]*from public,anon,authenticated;[\s\S]*grant execute[\s\S]*to service_role;/,
  "Issue #97 all-route transition pipeline must remain service-only");
assert.match(sql, /create or replace function public\.brinesearch_issue97_transition_metrics\(\)[\s\S]*is_brinesearch_editor\(auth\.uid\(\)\)/,
  "Issue #97 transition metrics must require Road Manager editor authorization");
assert.match(sql, /create or replace function public\.brinesearch_issue97_transition_exception_queue\([\s\S]*is_brinesearch_editor\(auth\.uid\(\)\)/,
  "Issue #97 transition exception queue must require Road Manager editor authorization");
assert.ok(!/grant execute on function public\.brinesearch_issue97_run_all_pad_routing_pipeline\(uuid\)[\s\S]{0,100}to (?:anon|authenticated)/.test(sql),
  "Issue #97 all-route transition pipeline must never be browser callable");

console.log("Issue #97 exact route-transition receipt/no-guess audit passed.");
