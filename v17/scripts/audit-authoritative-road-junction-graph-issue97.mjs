import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const migrationPath = "supabase/migrations/20260811190000_issue97_authoritative_road_junction_graph.sql";
const uiPath = "v17/src/parts/21n-road-manager-connections-issue97.js";
const cssPath = "v17/src/styles/45-road-manager-connections-issue97.css";
const syntheticPath = "supabase/tests/issue97_road_junction_graph_synthetic.sql";
const livePath = "supabase/tests/issue97_required_live_cases.sql";

const migration = read(migrationPath);
const ui = read(uiPath);
const css = read(cssPath);
const synthetic = read(syntheticPath);
const live = read(livePath);
const partOrder = JSON.parse(read("v17/src/parts/part-order.json"));
const styleOrder = JSON.parse(read("v17/src/styles/style-order.json"));
const pkg = JSON.parse(read("package.json"));

const need = (source, token, message = token) => assert.ok(source.includes(token), `Issue #97 missing ${message}`);
const forbid = (source, token, message = token) => assert.ok(!source.includes(token), `Issue #97 forbids ${message}`);

const countyBlock = migration.slice(
  migration.indexOf("insert into public.brinesearch_road_graph_counties"),
  migration.indexOf("create table public.brinesearch_road_source_datasets")
);
const countyRows = countyBlock.match(/\('(OH|WV|PA)','[A-Z]{3}',/g) || [];
assert.equal(countyRows.length, 39, "Issue #97 must register all 39 confirmed pad counties");
assert.equal(countyRows.filter(row => row.startsWith("('OH'")).length, 19, "Issue #97 Ohio county count changed");
assert.equal(countyRows.filter(row => row.startsWith("('WV'")).length, 10, "Issue #97 West Virginia county count changed");
assert.equal(countyRows.filter(row => row.startsWith("('PA'")).length, 10, "Issue #97 Pennsylvania county count changed");

for (const token of [
  "brinesearch_authoritative_road_identities",
  "brinesearch_authoritative_road_names",
  "brinesearch_authoritative_external_road_segments",
  "brinesearch_authoritative_road_nodes",
  "brinesearch_road_identity_mappings",
  "brinesearch_road_graph_builds",
  "logical_junction_id uuid not null",
  "brinesearch_road_junction_anchors",
  "brinesearch_road_junction_memberships",
  "unique(build_id,stable_junction_key)",
  "brinesearch_junction_memberships_identity_order_idx"
]) need(migration, token);

const sourceScopeBlock = migration.slice(
  migration.indexOf("create table public.brinesearch_road_source_dataset_counties"),
  migration.indexOf("alter table public.brinesearch_odot_road_catalog")
);
assert.match(sourceScopeBlock, /select d\.id,c\.state_code,c\.county_code,false,false,[\s\S]*where d\.source_key='oh_ogrip_lbrs_centerlines'/,
  "Issue #97 OGRIP must remain non-blocking until exact mapped-or-held reconciliation is proven");
assert.match(sourceScopeBlock, /select d\.id,'PA',scope\.county_code,false,false,/,
  "Issue #97 PA supplemental feeds must remain non-blocking until exact mapped-or-held reconciliation is proven");
for (const token of [
  "brinesearch_road_source_datasets_https_check",
  "'brinesearch_road_source_dataset_counties'",
  "'brinesearch_authoritative_supplemental_centerlines'",
  "'brinesearch_supplemental_centerline_identity_mappings'",
  "revoke all on public.brinesearch_road_graph_builds from service_role",
  "County filter requires an explicit state",
  "Two-character official-road search requires a county filter"
]) need(migration, token);

for (const token of [
  "brinesearch_issue97_begin_ingest",
  "brinesearch_issue97_finalize_ingest",
  "coverage_complete",
  "incomplete source coverage; stale rows were not retired",
  "orderByFields=OBJECTID",
  "exceededTransferLimit",
  "source_active=false",
  "ordered active source-segment digest",
  "Complete authoritative ingest runs are required before rebuild",
  "returnM=true&returnZ=true",
  "v_from_measure,v_to_measure",
  "/5280.0"
]) need(migration, token);

const effectiveOhStart = migration.lastIndexOf(
  "create or replace function public.brinesearch_issue97_refresh_oh_identities"
);
const effectiveOhEnd = migration.indexOf(
  "create or replace view public.brinesearch_authoritative_road_segments",
  effectiveOhStart
);
assert.ok(effectiveOhStart > 0 && effectiveOhEnd > effectiveOhStart,
  "Issue #97 effective Ohio identity refresh is missing");
const effectiveOh = migration.slice(effectiveOhStart, effectiveOhEnd);
for (const token of [
  "coalesce(a.jurisdiction_code,'?')=coalesce(b.jurisdiction_code,'?')",
  "coalesce(a.route_type,'?')=coalesce(b.route_type,'?')",
  "when s.jurisdiction_code='P' then 'private'",
  "matching CTL endpoints within 0.75m",
  "exact endpoints within 0.03m when measures are absent"
]) need(effectiveOh, token, `effective Ohio identity invariant: ${token}`);

for (const token of [
  "case when s.jurisdiction_code='P' then 'private'",
  "when 'RA' then 'ramp'",
  "when 'BK' then 'trail'",
  "v_supp in ('21','23','24','51','99')",
  "'internal_route_field','T_RT_NO'",
  "'signed_fields',jsonb_build_array(",
  "'TRAF_RT_NO','TRAF_RT__1','TRAF_RT__2',",
  "'TRAF_RT__6','TRAF_RT__7','TRAF_RT__8'"
]) need(migration, token);

const v2Start = migration.indexOf("-- v2 supersedes");
const v2End = migration.indexOf("revoke all on function public.brinesearch_issue97_rebuild_county_graph", v2Start);
assert.ok(v2Start > 0 && v2End > v2Start, "Issue #97 v2 graph definition is missing");
const v2 = migration.slice(v2Start, v2End);
for (const token of [
  "issue97-authoritative-topology-v2",
  "exact_authoritative_source_vertex",
  "penndot_at_grade_node_projection",
  "extensions.st_intersection(",
  "different_vertexization_supported",
  "grade_conflict",
  "'continuation'",
  "'name_change'",
  "'shared_segment'",
  "historical_rows_retained",
  "aliases_are_location_valid",
  "source_measure",
  "distance_along_road_m",
  "s.public_access_status in ('public','private','access')",
  "s.drivable_status in ('drivable','non_drivable')"
]) need(v2, token);
forbid(v2, "delete from public.brinesearch_road_junctions", "destructive active-graph replacement in v2");
forbid(v2, "name_only", "name-only topology");
forbid(v2, "nearest_road", "nearest-road topology");

for (const token of [
  "brinesearch_authoritative_road_search",
  "brinesearch_authoritative_road_detail",
  "brinesearch_authoritative_road_connections(",
  "brinesearch_authoritative_road_connections_for_canonical",
  "brinesearch_authoritative_road_connection_pair",
  "brinesearch_authoritative_identities_for_road",
  "Road Manager editor access is required",
  "grant execute on function public.brinesearch_authoritative_road_search"
]) need(migration, token);

for (const token of [
  "brinesearch_route_step_boundary_candidates",
  "authoritative_junction_anchor",
  "entry_junction_anchor_id",
  "junction_build_id",
  "junction_digest",
  "brinesearch_publish_structured_route_issue69_legacy",
  "Every different-road boundary requires an active verified graph anchor"
]) need(migration, token);

for (const token of [
  "All official roads",
  "brinesearch_authoritative_road_search",
  "brinesearch_authoritative_road_detail",
  "brinesearch_authoritative_road_connections",
  "brinesearch_authoritative_road_connections_for_canonical",
  "Connections / Intersections",
  "data-road-official-copy",
  "data-road-official-focus",
  "entryJunctionAnchorId",
  "brinesearch_route_step_boundary_candidates",
  "choose an authoritative road junction before publishing",
  "Source-only; not selectable for structured routes"
]) need(ui, token);
for (const token of [
  "roadOfficialSafeSourceUrlIssue97",
  "roadOfficialSearchGenerationIssue97",
  "Choose a county for a two-character search",
  "data-road-canonical-more",
  "candidate only · not route-usable"
]) need(ui, token);
forbid(ui, "fetchRoads =", "replacement of canonical fetchRoads");
forbid(ui, "roadManagerRows.push", "source identity leakage into canonical rows");
forbid(ui, "findCanonicalRoadV173", "name-based source adoption");

assert.ok(css.length > 4000, "Issue #97 Road Manager UI styles are unexpectedly incomplete");
need(css, ".road-official-connections-list-issue97");
need(css, "@media (max-width: 720px)");
const partIndex = partOrder.parts.indexOf("21n-road-manager-connections-issue97.js");
assert.ok(partIndex > partOrder.parts.indexOf("21m-road-manager-runtime-hardening-issue69.js"), "Issue #97 UI must load after final #69 runtime guards");
assert.equal(styleOrder.styles.at(-1), "45-road-manager-connections-issue97.css", "Issue #97 CSS must be the late Road Manager layer");

for (const token of [
  "source-endpoint overpass",
  "same road pair at two locations",
  "multiway regression",
  "different-vertexization shared section",
  "cross-county continuation",
  "private/public physical membership",
  "same route number in different townships",
  "unrelated same-name roads",
  "graph rebuild accepted an unbound legacy complete status",
  "graph digest is not deterministic",
  "immutable build activation/retirement",
  "brinesearch_issue97_activate_graph_build(v_build)",
  "brinesearch_issue97_activate_graph_build(v_second_build)",
  "ISSUE97_ODOT_PRIVATE",
  "mixed-jurisdiction ODOT NLF",
  "canonical publication accepted a private ODOT identity"
]) need(synthetic, token);

for (const token of [
  "WV:WVDOT:ROUTE_ID:3500895000000",
  "OH:ODOT:NLF:MBELMR00093**C",
  "OH:ODOT:NLF:TNOBTR00003**C",
  "OH:ODOT:NLF:CJEFCR00026**C",
  "PA:PENNDOT:LOCAL:62:2049:110961:EJM9",
  "PA:PENNDOT:STATE:62:NLF:9888",
  "PA:PENNDOT:AT_GRADE",
  "1267.0/5280.0",
  "Possom/Possum exact two-member continuation",
  "private-jurisdiction identity was projected as non-private",
  "begin transaction read only"
]) need(live, token);

assert.equal(pkg.scripts["verify:road-junction-graph"], "node v17/scripts/audit-authoritative-road-junction-graph-issue97.mjs", "Issue #97 package verifier is not wired");
need(pkg.scripts.build, "npm run verify:road-junction-graph");

execFileSync(process.execPath, ["--check", path.join(root, uiPath)], { stdio: "pipe" });
console.log("Issue #97 authoritative road/junction graph audit passed.");
