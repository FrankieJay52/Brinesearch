import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811235000_issue97_refresh_source_scope.sql"), "utf8");

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
  "Issue #97 source-scope runner must persist a failed receipt instead of leaking partial success");
assert.match(sql, /revoke all on function public\.brinesearch_issue97_refresh_source_scope\(text,text,integer\)[\s\S]*from public,anon,authenticated;[\s\S]*grant execute[\s\S]*to service_role;/,
  "Issue #97 source-scope runner must remain service-only");
assert.ok(!/grant execute[\s\S]{0,180}to (?:anon|authenticated)/.test(sql),
  "Issue #97 source-scope runner must never be browser callable");

console.log("Issue #97 restartable source-scope ingestion runner regression passed.");
