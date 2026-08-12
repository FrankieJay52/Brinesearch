import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812033000_issue97_compact_scope_content_digest.sql"), "utf8");

for (const token of [
  "compact state/county content-digest hardening",
  "verified page_set_digest covering",
  "p_details->>'page_set_digest'",
  "v_run.details->>'page_set_digest'",
  "verified page_set_digest is required for content receipt",
  "c.source_digest as digest",
  "s.source_digest",
  "n.source_digest",
  "m.centerline_id::text||':'||m.identity_id::text||':'||m.mapping_status||':'||m.source_segment_keys::text",
  "d.centerline_id::text||':'||d.disposition||':'||d.candidate_count::text||':'||d.verified_mapping_count::text",
  "n.identity_id::text||':'||n.source_record_id||':'||n.name_type||':'||n.road_name",
  "m.state_code=v_run.state_code",
  "m.county_code=v_run.county_code",
  "i.state_code=v_run.state_code and i.county_code=v_run.county_code and i.active",
  "No identity/name/geometry matching semantics change here"
]) assert.ok(sql.includes(token), `Issue #97 compact scope digest missing: ${token}`);

const replacementAt = sql.indexOf("v_replacement text:=$replacement$");
const beginAt = sql.indexOf("begin\n  select pg_catalog.pg_get_functiondef", replacementAt);
assert.ok(replacementAt >= 0 && beginAt > replacementAt,
  "Compact scope content-digest replacement block is missing");
const effective = sql.slice(replacementAt, beginAt);
for (const forbidden of [
  "st_asewkb",
  "attributes::text",
  "evidence::text",
  "provenance::text"
]) assert.ok(!effective.includes(forbidden),
  `Compact content receipt must not re-hash bulky derived/source payloads: ${forbidden}`);
assert.ok(effective.includes("page_set_digest"),
  "Compact content receipt must be anchored to the verified page-set digest");
assert.match(sql,
  /revoke all on function public\.brinesearch_issue97_finalize_ingest\(uuid,integer,integer,integer,jsonb\)[\s\S]*grant execute[\s\S]*to service_role;/,
  "Compact content-digest finalizer must remain service-only");

console.log("Issue #97 verified-page-set + compact derived state/county content-digest regression passed.");
