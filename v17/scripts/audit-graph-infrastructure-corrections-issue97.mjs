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
const synthetic = read("supabase/tests/issue97_road_junction_graph_synthetic.sql");
const live = read("supabase/tests/issue97_required_live_cases.sql");
const security = read("supabase/tests/issue97_schema_security.sql");
const pkg = JSON.parse(read("package.json"));

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
]) need(synthetic, token);
for (const token of [
  "Thrush exact connected-identity set changed",
  "Thrush connected alias missing",
  "Mt Wood temporal source rows were not collapsed",
  "W Cardinal endpoint precision was not normalized with raw provenance",
  "Thrush upper endpoint alias/provenance precision regression failed",
  "WV:WVDOT:SEGMENT:1774131",
  "WV:WVDOT:SEGMENT:1861464",
]) need(live, token);
for (const signature of [
  "brinesearch_issue97_graph_mapping_fingerprint_v2(uuid)",
  "brinesearch_issue97_refresh_exact_mappings_non_oh(text,text)",
  "brinesearch_issue97_normalize_wvdot_membership_measure(text,numeric)",
  "brinesearch_issue97_wvdot_name_measure_contains(text,numeric,numeric,numeric)",
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
