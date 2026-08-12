import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812040000_issue97_pa_source_geometry_holds_and_nlf_sentinel.sql"), "utf8");
const nodeHoldMigration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812041000_issue97_pa_at_grade_source_node_holds.sql"), "utf8");
const supplementalFastpath = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812042000_issue97_pa_supplemental_external_segment_fastpath.sql"), "utf8");
const supplementalIdentityAccounting = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812043000_issue97_supplemental_feature_identity_accounting.sql"), "utf8");

for (const token of [
  "create or replace function private_verification.brinesearch_issue97_pa_geometry_hold_reason(",
  "missing_source_geometry",
  "empty_source_geometry",
  "invalid_source_geometry",
  "unsupported_source_geometry",
  "non_simple_source_geometry_topology_unproven",
  "create or replace function public.brinesearch_issue97_ingest_pa_page(",
  "nullif(nullif(nullif(pg_catalog.btrim(v_props->>'NLF_ID'),''),'-1'),'0')",
  "when nullif(nullif(nullif(pg_catalog.btrim(v_props->>'GPID'),''),'-1'),'0') is not null then 'GPID'",
  "v_identity_key_kind",
  "hold_without_graph_segment",
  "nlf_sentinel_ignored",
  "'name_used_for_resolution',false",
  "'nearest_road_used',false",
  "'source_vertex_invented',false",
  "v_held_rows:=v_held_rows+1",
  "'held_rows',v_held_rows",
  "continue;",
  "to service_role"
]) {
  assert.ok(migration.includes(token), `Issue #97 PA ingest hardening missing: ${token}`);
}

assert.match(migration,
  /v_hold_reason:=private_verification\.brinesearch_issue97_pa_geometry_hold_reason\(v_geometry_json\)[\s\S]*v_geometry_hold:=v_hold_reason is not null/,
  "PA state/local rows must be classified through the explicit geometry-hold helper before topology insertion");
assert.match(migration,
  /if v_geometry_hold then[\s\S]*insert into private_verification\.brinesearch_issue97_source_geometry_holds[\s\S]*v_held_rows:=v_held_rows\+1;[\s\S]*v_rows:=v_rows\+1;[\s\S]*continue;/,
  "Held PennDOT source rows must count as accounted source rows and exit before segment insertion");
assert.match(migration,
  /v_identity_key:='PA:PENNDOT:STATE:'\|\|v_source_county\|\|':'\|\|v_identity_key_kind\|\|':'\|\|v_internal_id/,
  "PennDOT state identity keys must encode whether NLF, GPID, or OBJECTID supplied the exact source identity");
assert.match(migration,
  /if v_source='pa_penndot_at_grade_intersections' then[\s\S]*geometrytype\(v_geom\)<>'POINT'[\s\S]*continue;/,
  "The base PA loader must not route non-point at-grade evidence through road geometry");
assert.match(migration,
  /v_empty:=private_verification\.brinesearch_issue97_pa_geometry_hold_reason[\s\S]*"coordinates":\[\][\s\S]*empty_source_geometry/,
  "The migration must execute a regression proving empty PennDOT LineStrings become explicit holds");
assert.match(migration,
  /v_bowtie:=private_verification\.brinesearch_issue97_pa_geometry_hold_reason[\s\S]*non_simple_source_geometry_topology_unproven/,
  "The migration must execute a regression proving ambiguous non-simple PennDOT geometry is held rather than noded");

for (const token of [
  "create table if not exists private_verification.brinesearch_issue97_source_node_holds",
  "create or replace function private_verification.brinesearch_issue97_pa_node_hold_reason(",
  "empty_source_geometry",
  "hold_without_graph_node",
  "'source_coordinate_invented',false",
  "v_held_rows:=v_held_rows+1",
  "v_rows:=v_rows+1",
  "brinesearch_issue97_source_node_holds",
  "h.last_seen_at<v_run.started_at",
  "union all select nh.source_digest from private_verification.brinesearch_issue97_source_node_holds",
  "Issue #97 PA at-grade source-node hold contract did not install cleanly"
]) {
  assert.ok(nodeHoldMigration.includes(token),
    `Issue #97 PA at-grade source-node hold hardening missing: ${token}`);
}
assert.match(nodeHoldMigration,
  /v_hold_reason:=private_verification\.brinesearch_issue97_pa_node_hold_reason\(v_geometry_json\)[\s\S]*if v_hold_reason is not null then[\s\S]*insert into private_verification\.brinesearch_issue97_source_node_holds[\s\S]*v_held_rows:=v_held_rows\+1;[\s\S]*v_rows:=v_rows\+1;[\s\S]*continue;/,
  "Unusable PennDOT at-grade point rows must be explicitly held, counted as source coverage, and exit before node insertion");
assert.match(nodeHoldMigration,
  /"type":"Point","coordinates":\[\][\s\S]*empty_source_geometry/,
  "The at-grade migration must execute a regression proving empty PennDOT Points become source-node holds");
assert.match(nodeHoldMigration,
  /if v_role='at_grade_nodes' and v_run\.state_code='PA' then[\s\S]*source_node_holds[\s\S]*last_seen_at<v_run\.started_at/,
  "Stale at-grade source-node holds must automatically retire when a later source generation no longer presents the held row");

for (const token of [
  "Pennsylvania supplemental alias materialization fast path",
  "v_old_join constant text:='public.brinesearch_authoritative_road_segments s'",
  "v_new_join constant text:='public.brinesearch_authoritative_external_road_segments s'",
  "expected 3 broad-view joins",
  "PA supplemental implementation helper received non-PA run",
  "v_expected_target_runs:=2",
  "revoke all on function public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)",
  "from public,anon,authenticated,service_role",
  "v_external_join_count<>3",
  "brinesearch_issue97_refresh_supplemental_aliases_oh",
  "road-name and nearest-road identity matching remain prohibited"
]) {
  assert.ok(supplementalFastpath.includes(token),
    `Issue #97 PA supplemental external-segment fast path missing: ${token}`);
}
assert.match(supplementalFastpath,
  /v_join_count:=\(pg_catalog\.length\(v_core\)-pg_catalog\.length\(pg_catalog\.replace\(v_core,v_old_join,''\)\)\)[\s\S]*if v_join_count<>3/,
  "The PA supplemental migration must prove the exact expected number of broad-view joins before patching them");
assert.match(supplementalFastpath,
  /v_core:=pg_catalog\.replace\(v_core,v_old_join,v_new_join\)[\s\S]*v_core like '%'\|\|v_old_join\|\|'%'/,
  "The PA supplemental migration must replace every broad authoritative-road view join and fail if any remain");
assert.match(supplementalFastpath,
  /v_dispatch not like '%if v_state=''OH'' then return public\.brinesearch_issue97_refresh_supplemental_aliases_oh%'/,
  "The runtime regression must prove Ohio still dispatches to the dedicated Ohio implementation");
assert.match(supplementalFastpath,
  /v_dispatch not like '%return public\.brinesearch_issue97_refresh_supplemental_aliases_issue97_core%'/,
  "The runtime regression must prove Pennsylvania still dispatches through the hardened PA core");

for (const token of [
  "supplemental source-feature identity + full materialization accounting",
  "create or replace function private_verification.brinesearch_issue97_supplemental_native_feature_key(",
  "pg_catalog.regexp_replace(coalesce(p_native_id,''),'^[[:space:]]+|[[:space:]]+$','','g')",
  "return coalesce(v_native,v_version||':'||v_record)",
  "v_blank_101<>'2025-Q4:101'",
  "v_blank_101=v_blank_102",
  "v_padded<>'NG-ABC-123'",
  "RCL_NGUID patch expected 4 targets",
  "Allegheny FEATURE_KE patch expected 1 target",
  "v_record_id:=pg_catalog.btrim(v_record_id)",
  "v_materialized_supplemental_features integer:=0",
  "v_role=''supplemental_aliases''",
  "c.last_ingest_run_id=p_run_id",
  "supplemental source feature identity/materialization count mismatch",
  "materialized_supplemental_feature_count",
  "source_feature_accounting_verified",
  "v_helper_calls<>5"
]) {
  assert.ok(supplementalIdentityAccounting.includes(token),
    `Issue #97 supplemental source-feature accounting missing: ${token}`);
}
assert.match(supplementalIdentityAccounting,
  /v_blank_101:=private_verification\.brinesearch_issue97_supplemental_native_feature_key[\s\S]*'101',' '[\s\S]*v_blank_102:=private_verification\.brinesearch_issue97_supplemental_native_feature_key[\s\S]*'102',E'\\t  '[\s\S]*v_blank_101=v_blank_102/,
  "Whitespace native IDs must fall back to distinct source-version + OBJECTID feature identities");
assert.match(supplementalIdentityAccounting,
  /v_old:='coalesce\(nullif\(v_props->>''RCL_NGUID'',''''\),v_run\.source_version\|\|'':''\|\|v_record_id\)'[\s\S]*if v_count<>4/,
  "All four RCL_NGUID NG911 loaders must be patched together");
assert.match(supplementalIdentityAccounting,
  /if v_role=''supplemental_aliases'' then[\s\S]*count\(\*\)::integer into v_materialized_supplemental_features[\s\S]*last_ingest_run_id=p_run_id[\s\S]*v_materialized_supplemental_features<>coalesce\(p_ingested_row_count,-1\)[\s\S]*status=''failed''/,
  "Supplemental finalization must fail before alias materialization when distinct current-run stored features do not equal verified ingested features");
assert.match(supplementalIdentityAccounting,
  /v_finalizer not like '%materialized_supplemental_feature_count%'[\s\S]*v_finalizer not like '%c\.last_ingest_run_id=p_run_id%'[\s\S]*v_finalizer not like '%source_feature_accounting_verified%'/,
  "The migration must execute a composed-runtime regression proving the finalizer feature-count gate installed");

for (const text of [migration, nodeHoldMigration, supplementalFastpath, supplementalIdentityAccounting]) {
  assert.ok(!text.includes("st_node("),
    "PA source hardening must not node ambiguous source geometry");
  assert.ok(!text.includes("st_makevalid("),
    "PA source hardening must not rewrite authoritative source geometry");
  assert.ok(!text.includes("nearest" + "_road_used',true"),
    "PA source hardening must never authorize nearest-road identity or topology proof");
}

console.log("Issue #97 Pennsylvania road/node holds + exact supplemental mapping + source-feature accounting audit passed.");
