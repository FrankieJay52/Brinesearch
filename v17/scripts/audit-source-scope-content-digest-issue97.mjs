import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811257000_issue97_scope_bound_content_digest.sql"), "utf8");

for (const token of [
  "scope-bound source content-digest hardening",
  "s.state_code=v_run.state_code",
  "s.county_code=v_run.county_code",
  "n.state_code=v_run.state_code",
  "n.county_code=v_run.county_code",
  "c.state_code=v_run.state_code",
  "c.county_code=v_run.county_code",
  "m.state_code=v_run.state_code",
  "m.county_code=v_run.county_code",
  "d.state_code=v_run.state_code",
  "d.county_code=v_run.county_code",
  "c.county_code=v_source_county and c.source_active",
  "join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id",
  "i.state_code=v_run.state_code and i.county_code=v_run.county_code and i.active",
  "with latest_scope as",
  "select distinct on(r.state_code,r.county_code)",
  "r.details->>'content_digest' as digest",
  "union all\n        select v_run.state_code,v_run.county_code,v_content_digest",
  "state_code||':'||county_code||':'||digest",
  "latest complete scope digests",
  "No identity or geometry matching semantics change here",
  "v_start:=pg_catalog.strpos(",
  "update public.brinesearch_road_source_ingest_runs set",
  "v_definition:=pg_catalog.substr(v_definition,1,v_start-1)"
]) assert.ok(sql.includes(token), `Issue #97 scope-bound content digest hardening missing: ${token}`);

const replacementAt = sql.indexOf("v_replacement text:=$replacement$");
const beginAt = sql.indexOf("begin\n  select pg_catalog.pg_get_functiondef", replacementAt);
assert.ok(replacementAt >= 0 && beginAt > replacementAt,
  "Issue #97 scope-bound content digest replacement block is missing");
const effectiveDigest = sql.slice(replacementAt, beginAt);
assert.ok(!effectiveDigest.includes("where s.dataset_id=v_run.dataset_id and s.active"),
  "Effective external-segment digest must not scan every county in the dataset");
assert.ok(!effectiveDigest.includes("where c.dataset_id=v_run.dataset_id and c.active"),
  "Effective supplemental digest must not scan every county in the dataset");
assert.ok(!effectiveDigest.includes("where v_source='oh_odot_tims_road_inventory' and c.source_active"),
  "Effective ODOT digest must be county-scoped");
assert.ok(effectiveDigest.includes("update public.brinesearch_road_source_datasets"),
  "Scope-bound replacement must also update the registry-level aggregate digest");

assert.match(sql,
  /revoke all on function public\.brinesearch_issue97_finalize_ingest\(uuid,integer,integer,integer,jsonb\)[\s\S]*grant execute[\s\S]*to service_role;/,
  "Scope-bound finalizer must remain service-only");
assert.match(sql,
  /v_start:=pg_catalog\.strpos\([\s\S]*string_agg\(x\.digest[\s\S]*v_finish:=pg_catalog\.strpos\([\s\S]*update public\.brinesearch_road_source_ingest_runs set[\s\S]*v_definition:=pg_catalog\.substr\(v_definition,1,v_start-1\)[\s\S]*v_replacement/,
  "Scope-bound migration must replace only the digest/registry section between stable finalizer markers");

console.log("Issue #97 state/county-scoped ingest content digest + aggregate dataset digest regression passed.");
