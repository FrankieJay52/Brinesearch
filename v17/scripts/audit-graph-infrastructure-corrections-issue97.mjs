import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const semantic = read(
  "supabase/migrations/20260812046600_issue97_graph_mapping_semantic_fingerprint.sql"
);
const scoped = read(
  "supabase/migrations/20260812046700_issue97_non_oh_county_scoped_mapping_refresh.sql"
);
const wvdot = read(
  "supabase/migrations/20260812046800_issue97_wvdot_endpoint_measure_precision.sql"
);
const wvdotRuntime = read(
  "supabase/migrations/20260813203050_issue97_wvdot_measure_runtime_dispatch.sql"
);
const wvdotProvenance = read(
  "supabase/migrations/20260813213500_issue97_wvdot_measure_provenance_type_stability.sql"
);
const noble = read(
  "supabase/migrations/20260813101230_issue97_noble_graph_mapping_semantic_upgrade.sql"
);
const synthetic = read("supabase/tests/issue97_road_junction_graph_synthetic.sql");
const live = read("supabase/tests/issue97_required_live_cases.sql");
const security = read("supabase/tests/issue97_schema_security.sql");
const pkg = JSON.parse(read("package.json"));
const wvdotProvenanceBuilderPatch = wvdotProvenance.slice(
  wvdotProvenance.indexOf("do $issue97_patch_wvdot_graph_provenance$"),
  wvdotProvenance.indexOf("do $issue97_reject_audited_ohi_generation$")
);

const need = (source, token, message = token) =>
  assert.ok(source.includes(token), `Issue #97 infrastructure audit missing ${message}`);
const forbid = (source, token, message = token) =>
  assert.ok(!source.includes(token), `Issue #97 infrastructure audit forbids ${message}`);

for (const token of [
  "brinesearch_issue97_graph_mapping_evidence",
  "brinesearch_issue97_graph_mapping_fingerprint_v2",
  "mapping_snapshot_version",
  "issue97-graph-mapping-v2",
  "mapping_snapshot_legacy_digest",
  "ignored_post_build_boundary_refresh_rows",
  "membership_current_mapping_mismatch_count",
  "v_membership_mapping_mismatches<>0",
  "v_ignored_boundary_rows<>4",
  "topology_changed',false",
  "private_verification.brinesearch_issue97_mapping_fingerprint(",
]) need(semantic, token);
need(
  semantic,
  "p_mapping_method in ('exact_source_record_id','exact_route_designation')",
  "machine-method-only refresh_scope normalization"
);
need(semantic, "then p_evidence-'refresh_scope'", "refresh_scope-only normalization");
need(semantic, "v_reconstructed_legacy is distinct from", "guarded legacy reconstruction");
need(semantic, "else null", "unknown mapping snapshot version fail-closed");
forbid(semantic, "update public.brinesearch_road_junctions", "topology mutation");
forbid(semantic, "update public.brinesearch_road_junction_memberships", "membership mutation");

const scopedBody = scoped.slice(
  scoped.indexOf("create or replace function private_verification.brinesearch_issue97_refresh_exact_mappings_non_oh"),
  scoped.indexOf("revoke all on function private_verification.brinesearch_issue97_refresh_exact_mappings_non_oh")
);
for (const token of [
  "v_state not in ('WV','PA')",
  "scope_identities as materialized",
  "i.state_code=v_state and i.county_code=v_county",
  "n.name_type='signed'",
  "^(I|US|PA)[- ][0-9]",
  "explicit_penndot_signed_event",
  "WV:WVDOT:ROUTE_ID:",
  "i.source_identity_key like 'WV:WVDOT:ROUTE_ID:%'",
  "ambiguity_held",
  "refresh_scope",
  "brinesearch_issue97_refresh_exact_mappings_non_oh(v_state,v_county)",
]) need(scoped, token);
for (const token of ["similarity(", "<->", "st_dwithin(", "update public.brinesearch_roads"])
  forbid(scopedBody.toLowerCase(), token.toLowerCase(), `scoped helper strategy ${token}`);
assert.doesNotMatch(
  scopedBody,
  /mapping_method\s*=\s*'name_only'|mapping_method\s+in\s*\([^)]*name_only/i,
  "Issue #97 scoped helper may not resolve by name_only"
);

for (const token of [
  "brinesearch_issue97_normalize_wvdot_membership_measure",
  "brinesearch_issue97_wvdot_name_measure_contains",
  "WV:WVDOT:SEGMENT:%",
  "p_raw_measure>=(-0.0000001)::numeric",
  "raw_source_measure",
  "source_measure_normalized",
  "endpoint_measure_normalization_bound_miles",
  "c.chosen_segment_key,c.raw_source_measure,n.from_measure,n.to_measure",
  "v.chosen_segment_key,v.raw_source_measure,n.from_measure,n.to_measure",
  "n.source_segment_keys[1],n.source_measure",
  "case when v.chosen_segment_key like 'WV:WVDOT:SEGMENT:%' then",
  "case when n.source_segment_keys[1] like 'WV:WVDOT:SEGMENT:%' then",
  "WVDOT point-name candidate target changed",
  "WVDOT point-name containment target changed",
  "WVDOT point provenance target changed",
  "WVDOT shared-name containment targets changed",
  "WVDOT shared provenance target changed",
  "WVDOT name-change measure target changed",
]) need(wvdot, token);
forbid(wvdot, "pg_catalog.least(", "invalid schema-qualified LEAST construct");
forbid(wvdot, "pg_catalog.greatest(", "invalid schema-qualified GREATEST construct");
forbid(wvdot, "update public.brinesearch_authoritative_road", "authoritative source mutation");
forbid(wvdot, "insert into public.brinesearch_road_junctions", "junction topology creation");

for (const token of [
  "brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)",
  "brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)",
  "p_raw_measure::numeric",
  "p_source_measure::numeric",
  "pg_typeof(",
  "'double precision'::pg_catalog.regtype",
  "v_normalize_call_count<>7",
  "v_contains_call_count<>3",
  "zero OHI builds, and zero staging builds",
  "pg_advisory_xact_lock(",
  "proc.provolatile='i'",
  "not proc.prosecdef",
  "proc.proconfig @> array['search_path=\"\"']",
  "has_function_privilege(v_role,v_signature,'EXECUTE')",
  "v_builder_definition_after is distinct from",
  "Issue #97 runtime-dispatch repair changed builder, graph, staging, or cutover state",
]) need(wvdotRuntime, token);
for (const token of [
  "insert into public.",
  "update public.",
  "delete from public.",
  "create or replace function public.brinesearch_issue97_rebuild_county_graph",
  "brinesearch_issue97_activate_graph_build",
  "brinesearch_issue97_activate_cutover",
]) forbid(wvdotRuntime.toLowerCase(), token.toLowerCase(), `runtime-dispatch repair ${token}`);
assert.match(
  wvdotRuntime,
  /revoke all on function private_verification\.brinesearch_issue97_normalize_wvdot_membership_measure\(text,double precision\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Issue #97 float8 normalizer overload must remain private"
);

for (const token of [
  "v.raw_source_measure::numeric is distinct from v.source_measure",
  "n.source_measure::numeric is distinct from",
  "WVDOT raw comparison anchors changed",
  "WVDOT name comparison anchor changed",
  "Freeze every registered county build lane",
  "tmp_issue97_shared_segment_coverage",
  "tmp_issue97_shared_segment_coverage_key_idx",
  "extensions.st_snaptogrid(seg.geom,0.0000001)",
  "extensions.st_coveredby(",
  "choice_rank",
  "source_segment_keys_by_identity",
  "exact_canonical_grid_line_intersection",
  "shared source coverage does not span a final card",
  "shared provenance map, choice, or hold contract failed",
  "join tmp_issue97_shared_values expected",
  "membership.source_measure is distinct from expected.source_measure",
  "expected.source_measure_conflict",
  "WVDOT normalization flag disagrees with persisted measures",
  "source_measure_conflict_bound_miles",
  "39ca43fc16878fa7d6c2b70f4c6a48d3",
  "6573d51a-700a-458c-9d6e-c0d22c0e4201",
  "status='rejected'",
  "replacement_required",
  "Issue #97 provenance repair changed builder metadata or ACL",
  "Issue #97 provenance repair changed graph data/cutover beyond guarded rejection",
  "'double precision'::pg_catalog.regtype",
  "(-0.000000027168425731360912)::double precision",
]) need(wvdotProvenance, token);
for (const token of [
  "WV:TEST:SEG:SHARED_A_CONFLICT",
  "fixture.measure_conflict",
  "membership.source_measure is not null",
  "membership.distance_along_road_m is not null",
]) need(synthetic, token, `shared conflict fixture ${token}`);
assert.equal(
  wvdotProvenance.split("update public.brinesearch_road_graph_builds").length - 1,
  1,
  "Issue #97 provenance migration may reject only one guarded graph build"
);
assert.equal(
  wvdotProvenance.split("update public.brinesearch_road_junctions junction set").length - 1,
  1,
  "Issue #97 builder text must materialize shared conflict state exactly once"
);
for (const token of [
  "update public.brinesearch_road_junction_memberships",
  "brinesearch_issue97_activate_graph_build",
  "brinesearch_issue97_activate_cutover",
]) forbid(wvdotProvenance.toLowerCase(), token.toLowerCase(), `provenance repair ${token}`);
for (const token of [
  "c.fraction::numeric",
  "choice.fraction::numeric",
]) forbid(wvdotProvenanceBuilderPatch, token, `provenance builder patch ${token}`);
forbid(
  wvdotProvenance,
  "wvdot_raw_endpoint_precision_loss",
  "unsupported raw endpoint rejection reason"
);
assert.match(
  wvdotRuntime,
  /revoke all on function private_verification\.brinesearch_issue97_wvdot_name_measure_contains\(text,double precision,numeric,numeric\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Issue #97 float8 containment overload must remain private"
);

for (const token of [
  "brinesearch:issue97:graph:OH:NOB",
  "pre_washington_refresh_scope_guard",
  "v_build.source_revision_digest is distinct from '89af7128d56bbc4ef3733436d0813823'",
  "v_build.graph_digest is distinct from '83e3e777c8ec9732f43e513832560ad8'",
  "'2308bdcba13fea269b578acb152dd240'",
  "'ee7692fde47360caa2203b3436ca099b'",
  "brinesearch_issue97_graph_mapping_fingerprint_v2(",
  "v_membership_mapping_mismatches<>0",
  "v_was_boundary_identity_count<>32",
  "v_was_machine_mapping_count<>3",
  "v_was_machine_missing_refresh_scope<>3",
  "OH:ODOT:NLF:SWASIR00077**C",
  "OH:ODOT:NLF:SWASIR00077**N",
  "OH:ODOT:NLF:SWASSR00145**C",
  "interstate::77",
  "state_route:OH:145",
  "'mapping_method','exact_route_designation'",
  "issue97_oh_route_used_canonical_adoption",
  "issue97_oh_exact_route_family",
  "'adoption','exact_route_family'",
  "v_was_candidate_rows",
  "'candidate_count',1",
  "casewhene.priority=-1ande.candidate_count=1thene.evidence",
  "v_bad_anchor_count<>0",
  "topology_changed',false",
]) need(noble, token);
for (const token of [
  "update public.brinesearch_road_junctions",
  "update public.brinesearch_road_junction_memberships",
  "update public.brinesearch_road_junction_anchors",
  "update public.brinesearch_road_identity_mappings",
  "update public.brinesearch_authoritative_road_identities",
  "brinesearch_issue97_activate_graph_build",
  "brinesearch_issue97_activate_cutover",
]) forbid(noble, token, `Noble metadata upgrade ${token}`);

for (const token of [
  "issue97_out_of_scope_mapping_snapshot",
  "county-scoped WV refresh changed an out-of-scope mapping or road",
  "conflicting exact WV evidence was not held as two candidates",
  "machine refresh_scope bookkeeping staled a v2 boundary graph",
  "manual mapping refresh_scope was incorrectly ignored",
  "unknown mapping snapshot version did not fail currentness closed",
  "WVDOT Lower Endpoint Alias",
  "WVDOT Upper Endpoint Alias",
  "WVDOT Outside Bound Alias",
  "WVDOT Stacked Bound Alias",
  "raw_source_measure",
  "issue97_typed_runtime_measure",
  "#97 typed WVDOT runtime dispatch did not normalize the builder expression",
  "#97 typed WVDOT runtime containment escaped its source/bound",
  "#97 WVDOT normalization provenance flag disagrees with persisted measures",
  "WV:TEST:SEG:SHARED_A_2",
  "WV:TEST:SEG:SHARED_B_2",
  "39.90000001",
  "39.90500001",
  "#97 off-grid/component-scoped shared provenance failed",
  "source_segment_keys_by_identity",
  "chosen_source_segment_key",
]) need(synthetic, token);
for (const token of [
  "Thrush exact connected-identity set changed",
  "Thrush connected alias missing",
  "Mt Wood temporal source rows were not collapsed",
  "W Cardinal endpoint precision was not normalized with raw provenance",
  "Thrush upper endpoint alias/provenance precision regression failed",
  "WV:WVDOT:SEGMENT:1774131",
  "WV:WVDOT:SEGMENT:1861464",
  "#97 active WVDOT normalization flag disagrees with persisted measures",
  "#97 active shared exact-coverage provenance is incomplete",
]) need(live, token);
for (const signature of [
  "brinesearch_issue97_graph_mapping_fingerprint_v2(uuid)",
  "brinesearch_issue97_refresh_exact_mappings_non_oh(text,text)",
  "brinesearch_issue97_normalize_wvdot_membership_measure(text,numeric)",
  "brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)",
  "brinesearch_issue97_wvdot_name_measure_contains(text,numeric,numeric,numeric)",
  "brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)",
  "#97 WVDOT runtime overload metadata changed",
]) need(security, signature);

assert.equal(
  pkg.scripts["verify:graph-infrastructure-corrections"],
  "node v17/scripts/audit-graph-infrastructure-corrections-issue97.mjs",
  "Issue #97 graph infrastructure audit is not wired"
);
need(
  pkg.scripts.build,
  "npm run verify:graph-infrastructure-corrections",
  "graph infrastructure audit in full build"
);

console.log("Issue #97 graph infrastructure corrections audit passed.");
