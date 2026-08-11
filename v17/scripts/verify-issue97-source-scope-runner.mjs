import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migrationsDir = path.join(root, "supabase/migrations");
const sql = fs.readFileSync(path.join(migrationsDir,
  "20260811235000_issue97_refresh_source_scope.sql"), "utf8");

for (const token of [
  "create or replace function public.brinesearch_issue97_refresh_source_scope(",
  "scope.active and scope.ingest_enabled",
  "county.active",
  "brinesearch_issue97_source_snapshot(v_source,v_county)",
  "brinesearch_issue97_begin_ingest(",
  "brinesearch_issue97_ingest_page(v_run_id,v_offset,v_limit)",
  "brinesearch_issue97_finalize_ingest(",
  "brinesearch_issue97_fail_ingest(",
  "greatest(1,least(coalesce(p_page_size,1000),2000))",
  "v_offset:=v_offset+v_limit",
  "page count exceeded source snapshot expectation",
  "source-scope orchestrator error",
  "coverage_complete",
  "page_set_digest",
  "content_digest",
  "to service_role"
]) {
  assert.ok(sql.includes(token), `Issue #97 source-scope runner missing: ${token}`);
}

const snapshotAt = sql.indexOf("brinesearch_issue97_source_snapshot(v_source,v_county)");
const beginAt = sql.indexOf("brinesearch_issue97_begin_ingest(", snapshotAt);
const pageAt = sql.indexOf("brinesearch_issue97_ingest_page(v_run_id,v_offset,v_limit)", beginAt);
const finalizeAt = sql.indexOf("brinesearch_issue97_finalize_ingest(", pageAt);
assert.ok(snapshotAt >= 0 && beginAt > snapshotAt && pageAt > beginAt && finalizeAt > pageAt,
  "Issue #97 source-scope runner must preserve snapshot -> bound run -> contiguous pages -> receipt finalization order");

assert.match(sql, /v_expected_pages:=greatest\(1,pg_catalog\.ceil\(v_expected::numeric\/v_limit\)::integer\);/,
  "Issue #97 source-scope runner must bound pages to the source snapshot count");
assert.match(sql, /exit when coalesce\(\(v_page->>'has_more'\)::boolean,false\) is false;[\s\S]*v_offset:=v_offset\+v_limit;/,
  "Issue #97 source-scope runner must advance only after a nonterminal page");
assert.match(sql, /exception when others then[\s\S]*brinesearch_issue97_fail_ingest\([\s\S]*return pg_catalog\.jsonb_build_object\([\s\S]*'status','failed'/,
  "Issue #97 source-scope runner must explicitly fail instead of leaking partial success");
assert.match(sql, /revoke all on function public\.brinesearch_issue97_refresh_source_scope\(text,text,integer\)[\s\S]*from public,anon,authenticated;[\s\S]*grant execute[\s\S]*to service_role;/,
  "Issue #97 source-scope runner must remain service-only");
assert.ok(!/grant execute[\s\S]{0,180}to (?:anon|authenticated)/.test(sql),
  "Issue #97 source-scope runner must never be browser callable");

const issue97Migrations = fs.readdirSync(migrationsDir)
  .filter(name => /^\d{14}_issue97_.*\.sql$/.test(name))
  .sort();
const versions = issue97Migrations.map(name => name.slice(0, 14));
assert.equal(new Set(versions).size, versions.length,
  `Issue #97 migration versions must be unique: ${issue97Migrations.join(", ")}`);
for (const required of [
  "20260811190000_issue97_authoritative_road_junction_graph.sql",
  "20260811200000_issue97_confirmed_pad_county_scope.sql",
  "20260811233500_issue97_automatic_google_routes.sql",
  "20260811234600_issue97_all_pad_google_route_accounting.sql",
  "20260811234700_issue97_route_corpus_reconciliation.sql",
  "20260811235000_issue97_refresh_source_scope.sql",
  "20260811240000_issue97_route_transition_receipts.sql",
  "20260811240100_issue97_transition_runtime_hardening.sql",
  "20260811241000_issue97_occurrence_geometry_receipts.sql",
  "20260811241100_issue97_turn_normalization_hardening.sql",
  "20260811241200_issue97_turn_segment_hardening.sql",
  "20260811242000_issue97_transition_google_manifests.sql",
  "20260811243000_issue97_wvdot_multipart_ingest_hardening.sql"
]) assert.ok(issue97Migrations.includes(required), `Issue #97 migration chain missing: ${required}`);

console.log("Issue #97 restartable source-scope ingestion + complete unique migration chain regression passed.");
