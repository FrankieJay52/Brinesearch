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

for (const text of [migration, nodeHoldMigration]) {
  assert.ok(!text.includes("st_node("),
    "PA source hardening must not node ambiguous source geometry");
  assert.ok(!text.includes("st_makevalid("),
    "PA source hardening must not rewrite authoritative source geometry");
  assert.ok(!text.includes("nearest" + "_road_used',true"),
    "PA source hardening must never authorize nearest-road identity or topology proof");
}

console.log("Issue #97 Pennsylvania road + at-grade source-hold audit passed.");
