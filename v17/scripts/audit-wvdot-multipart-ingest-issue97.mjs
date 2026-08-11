import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811243000_issue97_wvdot_multipart_ingest_hardening.sql"), "utf8");

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
  "Every WVDOT source path must be present and independently valid/simple before the feature counts as ingested");
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

console.log("Issue #97 WVDOT multipart/unmeasured-path + durable failed-ingest hardening audit passed.");
