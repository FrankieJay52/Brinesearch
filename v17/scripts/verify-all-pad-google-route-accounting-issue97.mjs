import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811234500_issue97_all_pad_google_route_accounting.sql"), "utf8");

for (const token of [
  "create or replace function public.brinesearch_issue97_refresh_google_routes(",
  "coalesce(p.list_only,false)=false",
  "all-pad Google route accounting drift",
  "'all_current_pads_accounted'",
  "create or replace function public.brinesearch_issue97_google_route_readiness_report()",
  "'pads_with_saved_structured_sequence'",
  "'pads_without_saved_structured_sequence'",
  "'unaccounted_current_pads'",
  "'ready_manifest_invariant'",
  "'held_by_reason'",
  "'fuzzy_name_or_nearest_resolution',false",
  "to service_role"
]) {
  assert.ok(sql.includes(token), `Issue #97 all-pad Google accounting missing: ${token}`);
}

assert.ok(!/p_pad_id is null or exists\([\s\S]{0,300}brinesearch_pad_roads/.test(sql),
  "Issue #97 effective Google backfill still silently restricts bulk scope to already-published pad roads");
assert.match(sql, /v_processed<>v_total_current/,
  "Issue #97 bulk Google backfill must fail closed if a current pad is skipped");
assert.match(sql, /receipt\.status in \('held','stale'\)/,
  "Issue #97 readiness report must group explicit held/stale exception reasons");
assert.match(sql, /public\.brinesearch_issue97_google_route_current\(route\.pad_id\)/,
  "Issue #97 readiness report must validate live route dependencies, not trust a materialized ready flag");
assert.match(sql, /revoke all on function public\.brinesearch_issue97_google_route_readiness_report\(\)[\s\S]*from public,anon,authenticated;[\s\S]*grant execute[\s\S]*to service_role;/,
  "Issue #97 readiness exception report must remain service-only");

console.log("Issue #97 all-current-pad Google route accounting regression passed.");
