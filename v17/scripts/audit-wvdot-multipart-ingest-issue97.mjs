import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811243000_issue97_wvdot_multipart_ingest_hardening.sql"), "utf8");
const endpointLoopMigration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812038000_issue97_wvdot_endpoint_loop_source_split.sql"), "utf8");
const sourceHoldMigration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812039000_issue97_wvdot_non_simple_source_geometry_holds.sql"), "utf8");

for (const token of [
  "create or replace function public.brinesearch_issue97_ingest_wv_network_page(",
  "v_source_path_count:=pg_catalog.jsonb_array_length(v_feature->'geometry'->'paths')",
  "extensions.st_issimple(q.path_geom)",
  "((q.path_from is null and q.path_to is null)",
  "or (q.path_from is not null and q.path_to is not null))",
  "v_measured_path_count",
  "v_path_count<>v_source_path_count",
  "v_valid_path_count<>v_path_count",
  "v_base_segment_key||':PATH:'||v_path.path_number::text",
  "'source_path_number',v_path.path_number",
  "'source_path_count',v_path_count",
  "'source_path_measured',v_path.path_from is not null and v_path.path_to is not null",
  "'source_unmeasured_path_count',v_path_count-v_measured_path_count",
  "'multipart_paths_preserved',v_path_count>1",
  "case when v_path_count=1 then v_base_segment_key else null end",
  "create or replace function public.brinesearch_issue97_refresh_source_scope(",
  "v_begin:=public.brinesearch_issue97_begin_ingest(",
  "perform public.brinesearch_issue97_fail_ingest(",
  "'pages_completed',v_pages",
  "to service_role"
]) {
  assert.ok(migration.includes(token), `Issue #97 WVDOT ingest hardening missing: ${token}`);
}

assert.ok(!migration.includes("st_collect(q.path_geom)"),
  "WVDOT hardening must not recombine original ArcGIS paths into one non-simple multipart segment");
assert.match(migration,
  /v_source_path_count:=pg_catalog\.jsonb_array_length[\s\S]*v_path_count<>v_source_path_count[\s\S]*v_valid_path_count<>v_path_count/,
  "Every WVDOT source path must be present and independently valid/simple before the original hardening counts the feature as ingested");
assert.match(migration,
  /case when count\(\*\) filter\(where q\.path_from is not null and q\.path_to is not null\)=count\(\*\)[\s\S]*array_agg\(q\.path_from[\s\S]*case when count\(\*\) filter\(where q\.path_from is not null and q\.path_to is not null\)=count\(\*\)[\s\S]*array_agg\(q\.path_to/,
  "A feature-level name measure range must be emitted only when every original path is measured");
assert.match(migration,
  /v_begin:=public\.brinesearch_issue97_begin_ingest\([\s\S]*?v_run_id:=\(v_begin->>'run_id'\)::uuid;[\s\S]*?begin\s+loop[\s\S]*?exception when others then[\s\S]*?brinesearch_issue97_fail_ingest\(/,
  "begin_ingest must occur outside the inner page/finalizer exception block so a failed receipt survives rollback of partial source writes");
assert.match(migration,
  /revoke all on function public\.brinesearch_issue97_refresh_source_scope\(text,text,integer\)[\s\S]*from public,anon,authenticated;[\s\S]*grant execute[\s\S]*to service_role;/,
  "Source-scope orchestration must remain service-only");
assert.match(migration,
  /revoke all on function public\.brinesearch_issue97_ingest_wv_network_page\(text,integer,integer\)[\s\S]*from public,anon,authenticated;[\s\S]*grant execute[\s\S]*to service_role;/,
  "WVDOT loader must remain service-only");

for (const token of [
  "create or replace function private_verification.brinesearch_issue97_wv_endpoint_loop_safe(",
  "create or replace function private_verification.brinesearch_issue97_wv_path_components(",
  "coalesce(pg_catalog.cardinality(v_start_hits),0)",
  "coalesce(pg_catalog.cardinality(v_end_hits),0)<>1",
  "extensions.st_intersection(v_part1,v_part2)",
  "extensions.st_geometrytype(v_intersection)='ST_Point'",
  "extensions.st_equals(v_intersection,v_split_point)",
  "not extensions.st_issimple(v_part1)",
  "not extensions.st_issimple(v_part2)",
  "split_method:='source_endpoint_loop'",
  "''source_path_component_number'',v_path.component_number",
  "''source_path_component_count'',v_path.component_count",
  "''source_path_split_method'',v_path.split_method",
  "'':PART:''||v_path.component_number::text",
  "Issue #97 WVDOT interior-crossing regression failed",
  "brinesearch_issue97_wv_endpoint_loop_safe(q.path_geom)",
  "brinesearch_issue97_wv_path_components(path.path_value)"
]) {
  assert.ok(endpointLoopMigration.includes(token),
    `Issue #97 WVDOT endpoint-loop preservation missing: ${token}`);
}

assert.match(endpointLoopMigration,
  /cardinality\(v_start_hits\)[\s\S]*cardinality\(v_end_hits\)[\s\S]*<>1/,
  "Endpoint-loop preservation must allow exactly one repeated endpoint/interior source vertex");
assert.match(endpointLoopMigration,
  /st_intersection\(v_part1,v_part2\)[\s\S]*st_geometrytype\(v_intersection\)='ST_Point'[\s\S]*st_equals\(v_intersection,v_split_point\)/,
  "Split components must meet only at the exact repeated source vertex");
assert.match(endpointLoopMigration,
  /\[\[0,0,0,0\],\[1,1,0,1\],\[0,1,0,2\],\[1,0,0,3\]\][\s\S]*v_bowtie<>0/,
  "Synthetic interior bow-tie crossings must remain rejected by the routable component helper");
assert.ok(!endpointLoopMigration.includes("st_node(v_full)"),
  "WVDOT endpoint-loop preservation must split only at the exact source vertex, not node arbitrary source crossings");
assert.ok(!endpointLoopMigration.includes("st_makevalid(v_full)"),
  "WVDOT endpoint-loop preservation must not rewrite source geometry with ST_MakeValid");

for (const token of [
  "create table if not exists private_verification.brinesearch_issue97_source_geometry_holds",
  "create or replace function private_verification.brinesearch_issue97_wv_path_holdable(",
  "non_simple_source_geometry_topology_unproven",
  "not private_verification.brinesearch_issue97_wv_endpoint_loop_safe(v_geom)",
  "hold_without_graph_segment",
  "''source_vertex_invented'',false",
  "v_held_rows:=v_held_rows+1",
  "active_source_geometry_holds",
  "retired_source_geometry_holds",
  "source_geometry_hold_active",
  "ordered active source-segment + held-source digest",
  "create or replace function public.brinesearch_issue97_source_geometry_hold_metrics()",
  "create or replace function public.brinesearch_issue97_source_geometry_hold_queue(",
  "from public,anon;",
  "to authenticated,service_role;"
]) {
  assert.ok(sourceHoldMigration.includes(token),
    `Issue #97 WVDOT source-hold contract missing: ${token}`);
}

assert.match(sourceHoldMigration,
  /not extensions\.st_issimple\(v_geom\)[\s\S]*not private_verification\.brinesearch_issue97_wv_endpoint_loop_safe\(v_geom\)/,
  "Only valid non-simple paths not already safely segmentable may enter the hold lane");
assert.match(sourceHoldMigration,
  /v_bowtie:=private_verification\.brinesearch_issue97_wv_path_holdable\([\s\S]*\[\[0,0,0,0\],\[1,1,0,1\],\[0,1,0,2\],\[1,0,0,3\]\][\s\S]*coalesce\(v_bowtie,false\) is not true/,
  "Synthetic interior bow-tie geometry must be recognized by the hold lane while the routable component regression above proves it emits zero components");
assert.match(sourceHoldMigration,
  /if v_geometry_hold then[\s\S]*insert into private_verification\.brinesearch_issue97_source_geometry_holds[\s\S]*v_held_rows:=v_held_rows\+1/,
  "A holdable authoritative source row must create an explicit durable hold receipt instead of being silently rejected");
assert.match(sourceHoldMigration,
  /v_loader not ilike '%brinesearch_issue97_wv_path_holdable%'[\s\S]*v_loader not ilike '%brinesearch_issue97_source_geometry_holds%'[\s\S]*v_loader not ilike '%hold_without_graph_segment%'/,
  "The migration's executable post-install contract must verify the composed runtime loader contains the hold classifier and no-graph-segment receipt path");
assert.match(sourceHoldMigration,
  /not exists\([\s\S]*brinesearch_issue97_source_geometry_holds h[\s\S]*h\.identity_id=i\.id[\s\S]*h\.active/,
  "Held-only identities must not be retired while a current source hold exists");
assert.match(sourceHoldMigration,
  /case when coalesce\(h\.hold_count,0\)>0 then ''held''[\s\S]*resolved_drivable/,
  "Any current source hold must force the whole authoritative identity to held regardless of source record order");
assert.match(sourceHoldMigration,
  /union all select h\.source_digest from private_verification\.brinesearch_issue97_source_geometry_holds h/,
  "Held authoritative source rows must participate in the source content digest");
assert.ok(!sourceHoldMigration.includes("st_node("),
  "Source holds must not node ambiguous interior crossings");
assert.ok(!sourceHoldMigration.includes("st_makevalid("),
  "Source holds must not rewrite authoritative geometry");
assert.ok(!sourceHoldMigration.includes("nearest" + "_road_used'',true"),
  "Source holds must never authorize nearest-road proof");

console.log("Issue #97 WVDOT multipart + endpoint-loop + ambiguous-source-hold audit passed.");
