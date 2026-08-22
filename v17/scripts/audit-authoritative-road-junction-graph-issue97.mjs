import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const migrationPath = "supabase/migrations/20260811190000_issue97_authoritative_road_junction_graph.sql";
const googleMigrationPath = "supabase/migrations/20260811233500_issue97_automatic_google_routes.sql";
const uiPath = "v17/src/parts/21n-road-manager-connections-issue97.js";
const routeMapperPath = "v17/src/parts/21a-road-manager-route-mapper-v17324.js";
const routeRuntimePath = "v17/src/parts/21m-road-manager-runtime-hardening-issue69.js";
const googlePlannerPath = "v17/src/parts/00ab-google-route-plan-issue97.js";
const googleLoaderPath = "v17/src/parts/00ac-authoritative-google-routes-issue97.js";
const googleTestPath = "v17/scripts/verify-google-route-plan-issue97.mjs";
const browserTestPath = "v17/scripts/browser-road-junction-issue97.mjs";
const cssPath = "v17/src/styles/45-road-manager-connections-issue97.css";
const syntheticPath = "supabase/tests/issue97_road_junction_graph_synthetic.sql";
const livePath = "supabase/tests/issue97_required_live_cases.sql";
const schemaSecurityPath = "supabase/tests/issue97_schema_security.sql";

const migration = read(migrationPath);
const googleMigration = read(googleMigrationPath);
const ui = read(uiPath);
const routeMapper = read(routeMapperPath);
const routeRuntime = read(routeRuntimePath);
const googlePlanner = read(googlePlannerPath);
const googleLoader = read(googleLoaderPath);
const googleTest = read(googleTestPath);
const browserTest = read(browserTestPath);
const css = read(cssPath);
const synthetic = read(syntheticPath);
const live = read(livePath);
const schemaSecurity = read(schemaSecurityPath);
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
const exactCountyManifest = [
  "('OH','ATH','Athens','39009','ATH'", "('OH','BEL','Belmont','39013','BEL'",
  "('OH','CAR','Carroll','39019','CAR'", "('OH','COL','Columbiana','39029','COL'",
  "('OH','COS','Coshocton','39031','COS'", "('OH','GUE','Guernsey','39059','GUE'",
  "('OH','HAS','Harrison','39067','HAS'", "('OH','HOL','Holmes','39075','HOL'",
  "('OH','JEF','Jefferson','39081','JEF'", "('OH','LIC','Licking','39089','LIC'",
  "('OH','MAH','Mahoning','39099','MAH'", "('OH','MOE','Monroe','39111','MOE'",
  "('OH','MUS','Muskingum','39119','MUS'", "('OH','NOB','Noble','39121','NOB'",
  "('OH','POR','Portage','39133','POR'", "('OH','STA','Stark','39151','STA'",
  "('OH','TRU','Trumbull','39155','TRU'", "('OH','TUS','Tuscarawas','39157','TUS'",
  "('OH','WAS','Washington','39167','WAS'",
  "('WV','BRO','Brooke','54009','05'", "('WV','DOD','Doddridge','54017','09'",
  "('WV','HAR','Harrison','54033','17'", "('WV','MAR','Marion','54049','25'",
  "('WV','MSH','Marshall','54051','26'", "('WV','MON','Monongalia','54061','31'",
  "('WV','OHI','Ohio','54069','35'", "('WV','RIT','Ritchie','54085','43'",
  "('WV','TYL','Tyler','54095','48'", "('WV','WET','Wetzel','54103','52'",
  "('PA','ALL','Allegheny','42003','02'", "('PA','ARM','Armstrong','42005','03'",
  "('PA','BEA','Beaver','42007','04'", "('PA','BRA','Bradford','42015','08'",
  "('PA','BUT','Butler','42019','10'", "('PA','FAY','Fayette','42051','26'",
  "('PA','GRE','Greene','42059','30'", "('PA','IND','Indiana','42063','32'",
  "('PA','WAS','Washington','42125','62'", "('PA','WES','Westmoreland','42129','64'"
];
for (const row of exactCountyManifest) need(countyBlock, row, `exact county registry row ${row}`);
forbid(countyBlock, "('OH','HAR','Harrison'", "Hardin HAR mislabeled as Ohio Harrison");

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
assert.match(sourceScopeBlock, /select d\.id,c\.state_code,c\.county_code,true,true,[\s\S]*where d\.source_key='oh_ogrip_lbrs_centerlines'/,
  "Issue #97 must ingest and reconcile every confirmed-county OGRIP LBRS scope");
assert.match(sourceScopeBlock, /select d\.id,'PA',scope\.county_code,true,true,/,
  "Issue #97 must ingest and reconcile all six available PA county/NG911 feeds");
need(sourceScopeBlock, "check(not required_for_graph or ingest_enabled)",
  "required source scopes must also be ingest-enabled");
need(migration, "v_required_scope_count<>114",
  "cutover must require 89 core/name/node and 25 official supplemental scopes");
need(migration, "All 114 authoritative county/dataset scopes must be current before cutover",
  "cutover error must describe the complete 114-scope contract");
need(migration, "v_occurrences<>16109",
  "saved-road reconciliation must use the independently recounted 16,109-occurrence manifest");
need(migration, "expected_occurrence_count<>16109",
  "cutover must require the reviewed 16,109-key inventory baseline");
need(migration, "9b4e608fc8ec32042a06b5fcba1b34d8",
  "independently reviewed current-production occurrence-key digest");
need(migration, "ffaf172e5e331a2a8e3e97240c2b12bf",
  "independent delimited-key digest cross-check");
need(migration, "'source_kind_counts'",
  "saved-road reconciliation source-kind metrics");
forbid(migration, "v_occurrences<>5167", "obsolete partial saved-road inventory count");
forbid(migration, "v_required_scope_count<>89", "stale registry-only 89-scope cutover contract");
for (const token of [
  "brinesearch_road_source_datasets_https_check",
  "'brinesearch_road_source_dataset_counties'",
  "'brinesearch_authoritative_supplemental_centerlines'",
  "'brinesearch_supplemental_centerline_identity_mappings'",
  "'brinesearch_supplemental_centerline_dispositions'",
  "brinesearch_issue97_ingest_supplemental_page",
  "brinesearch_issue97_refresh_supplemental_aliases",
  "Every supplemental centerline must receive a mapped-or-held disposition",
  "brinesearch_issue97_refresh_saved_road_reconciliation",
  "brinesearch_issue97_activate_cutover",
  "zero critical holds and zero fuzzy/name-only/nearest resolution",
  "revoke all on public.brinesearch_road_graph_builds from service_role",
  "County filter requires an explicit state",
  "Two-character official-road search requires a county filter"
]) need(migration, token);

for (const token of [
  "private_verification.brinesearch_google_route_receipts_issue97",
  "public.brinesearch_driver_google_routes_public",
  "brinesearch_issue97_refresh_google_route",
  "authoritative_occurrence_identity_not_unique",
  "shared_segment_traversal_order_not_unique",
  "authoritative_clipped_geometry",
  "saved_pad_gps",
  "maximum_mobile_waypoints',3",
  "maximum_url_length',2048",
  "chunk_continuity','previous_destination_equals_next_origin'",
  "manual_map_editor_role','review_exception_qa_only'",
  "brinesearch_issue97_google_route_graph_stale",
  "brinesearch_issue97_google_route_mapping_stale",
  "brinesearch_publish_structured_route_issue97_without_google"
]) need(googleMigration, token, `automatic Google route contract: ${token}`);
for (const token of [
  "GOOGLE_ROUTE_MAX_WAYPOINTS_ISSUE97 = 3",
  "GOOGLE_ROUTE_MAX_URL_LENGTH_ISSUE97 = 2048",
  '"shared_entry"',
  '"shared_exit"',
  '"shape"',
  '"pad_destination"',
  "previousDestination",
  "params.set(\"travelmode\", \"driving\")",
  "params.set(\"dir_action\", \"navigate\")"
]) need(googlePlanner, token, `Google route planner: ${token}`);
need(googleLoader, "brinesearch_driver_google_routes_public",
  "public Google route manifest loader");
need(googleLoader, "BrinesearchGoogleRouteIssue97.buildPublicPlan",
  "fail-closed public manifest validation");
for (const token of [
  "springdale-occurrence-one",
  "springdale-occurrence-two",
  "shared_entry",
  "parallel-road-occurrence",
  "chunking must preserve every manifest point exactly once",
  "Google route URLs may contain only numeric coordinate controls"
]) need(googleTest, token, `Google route regression: ${token}`);
assert.ok(partOrder.parts.includes("00ab-google-route-plan-issue97.js"),
  "Issue #97 Google route planner is not assembled");
assert.ok(partOrder.parts.includes("00ac-authoritative-google-routes-issue97.js"),
  "Issue #97 Google route loader is not assembled");
assert.equal(pkg.scripts["verify:google-route-plan"],
  "node v17/scripts/verify-google-route-plan-issue97.mjs",
  "Issue #97 Google route regression script is not wired");
need(pkg.scripts.build, "npm run verify:google-route-plan",
  "Google route regression in the full build");
need(synthetic, "$issue97_google_route$", "database Google route regression");
need(synthetic, "road_identity_mapping_changed", "manifest dependency invalidation regression");

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
  "const clipped = await routeIssue69ClipStepGuarded(value, generation)",
  "if (!clipped) return false"
]) need(routeRuntime, token, `atomic boundary reclip: ${token}`);
for (const token of [
  "routeIssue97CloneBoundaryState(routeMapperSegmentsV17324)",
  "routeIssue97DraftMutationGeneration",
  "routeIssue97BoundaryRollbackSignature",
  "guard.padId !== routeIssue69CurrentPadId()",
  "guard.topologyGeneration !== routeIssue69TopologyGeneration",
  "guard.mutationGeneration !== routeIssue97DraftMutationGeneration",
  "guard.signature !== routeIssue97BoundaryRollbackSignature()",
  "routeMapperSegmentsV17324 = routeIssue97CloneBoundaryState(snapshot)",
  "routeIssue97RestoreBoundaryState(snapshot, rollbackGuard)",
  "if (!reclipped) throw new Error",
  "current.turn = \"\"",
  "previous.inboundTurn = \"\"",
  "current.inboundTurn = \"\"",
  "next.turn = \"\""
]) need(ui, token, `atomic boundary edit: ${token}`);

const boundaryRollbackSignatureBlock = ui.slice(
  ui.indexOf("function routeIssue97BoundaryRollbackSignature()"),
  ui.indexOf("routeIssue69ApplyBoundaryGuarded = async function routeIssue69ApplyBoundaryGuardedIssue97")
);
for (const token of [
  "routeStepId: segment?.routeStepId || null",
  "roadId: segment?.roadId || null",
  "entryJunctionAnchorId: segment?.entryJunctionAnchorId || null",
  "turn: segment?.turn || \"\"",
  "inboundTurn: segment?.inboundTurn || \"\""
]) need(boundaryRollbackSignatureBlock, token, `boundary rollback edit signature: ${token}`);

const boundaryRollbackAllowed = (guard, state) => guard.padId === state.padId
  && guard.topologyGeneration === state.topologyGeneration
  && guard.mutationGeneration === state.mutationGeneration
  && guard.signature === state.signature;
const boundaryRollbackGuard = {
  padId: "pad-1", topologyGeneration: 7, mutationGeneration: 11, signature: "route-a"
};
assert.equal(boundaryRollbackAllowed(boundaryRollbackGuard, { ...boundaryRollbackGuard }), true,
  "An ordinary failed boundary clip must remain rollback-eligible");
assert.equal(boundaryRollbackAllowed(boundaryRollbackGuard, { ...boundaryRollbackGuard, topologyGeneration: 8 }), false,
  "A newer reorder or replacement must make the old boundary snapshot ineligible");
assert.equal(boundaryRollbackAllowed(boundaryRollbackGuard, { ...boundaryRollbackGuard, mutationGeneration: 12 }), false,
  "A newer saved turn edit must make the old boundary snapshot ineligible");
assert.equal(boundaryRollbackAllowed(boundaryRollbackGuard, { ...boundaryRollbackGuard, signature: "route-b" }), false,
  "A newer in-memory route edit must make the old boundary snapshot ineligible");
for (const token of [
  "Route QA &amp; Exceptions",
  "Route QA",
  "Open pad GPS for QA",
  "Exception review",
  "Automatic route generation remains the product path"
]) need(routeMapper, token, `review/exception-only map editor: ${token}`);
for (const token of [
  "roadOfficialSafeSourceUrlIssue97",
  "roadOfficialSearchGenerationIssue97",
  "Choose a county for a two-character search",
  "data-road-canonical-more",
  "candidate only · not route-usable"
]) need(ui, token);
for (const token of [
  "roadOfficialRenderGenerationIssue97",
  "Held — not route-selectable",
  "name_events_truncated",
  "segment_summary?.source_records_truncated",
  "brinesearch_roads?select=*&id=eq.",
  "window.routeIssue69ValidateStructuredPayload = routeIssue69ValidateStructuredPayload"
]) need(ui, token, `Road Manager race/read-only contract: ${token}`);
for (const token of [
  "entryJunctionId: row.entry_junction_id",
  "entryJunctionAnchorId: row.entry_junction_anchor_id",
  "junctionBuildId: row.junction_build_id",
  "junctionDigest: row.junction_digest"
]) need(routeRuntime, token, `legacy review graph provenance: ${token}`);
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
  "off-grid/component-scoped shared provenance failed",
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
  "OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428134",
  "OH:ODOT:NLF:CBELCR00034**C:COMP:2025_000000000003599",
  "OH:ODOT:NLF:TJEFTR00184**C:COMP:2025_000000000402167",
  "OH:ODOT:NLF:CJEFCR00026**C",
  "PA:PENNDOT:LOCAL:62:2049:110961:EJM9",
  "PA:PENNDOT:STATE:62:NLF:9888",
  "PA:PENNDOT:AT_GRADE",
  "PA:PENNDOT:AT_GRADE:OCCURRENCE:146521:SCOPE:PA:WAS",
  "RCL22649@co.washington.pa.us",
  "RCL39851@co.washington.pa.us",
  "2025_000000000067340",
  "1267.0/5280.0",
  "Possom/Possum exact two-member continuation",
  "private-jurisdiction identity was projected as non-private"
]) need(live, token);

for (const token of [
  "begin transaction read only",
  "FORCE RLS is missing",
  "SECURITY DEFINER function lacks fixed empty search_path",
  "authenticated bounded RPC grant is missing",
  "service-only function ACL failed",
  "expected 114 required source scopes"
]) need(schemaSecurity, token, `post-migration schema security: ${token}`);

assert.equal(pkg.scripts["verify:road-junction-graph"], "node v17/scripts/audit-authoritative-road-junction-graph-issue97.mjs", "Issue #97 package verifier is not wired");
assert.equal(pkg.scripts["verify:road-junction-browser"], "node v17/scripts/browser-road-junction-issue97.mjs",
  "Issue #97 authenticated browser verifier is not wired");
for (const token of [
  "Issue #97 authenticated Road Manager browser audit passed",
  "Held — not route-selectable",
  "PA|WAS",
  "read-only editor reached canonical Road Manager edit UI",
  "tile.openstreetmap.org"
]) need(browserTest, token, `authenticated browser regression: ${token}`);
need(pkg.scripts.build, "npm run verify:road-junction-graph");

execFileSync(process.execPath, ["--check", path.join(root, uiPath)], { stdio: "pipe" });
console.log("Issue #97 authoritative road/junction graph audit passed.");
