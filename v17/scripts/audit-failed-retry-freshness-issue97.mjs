import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812036100_issue97_failed_retry_freshness_hardening.sql"), "utf8");

for (const token of [
  "failed retry must not poison an unchanged verified source scope",
  "brinesearch_issue97_source_snapshot_fingerprint",
  "source_revision_token",
  "object_id_set_digest",
  "expected_source_rows",
  "latest_verified",
  "latest_attempt",
  "when a.status='failed'",
  "a.snapshot_fingerprint=v.snapshot_fingerprint",
  "latest_target.status='failed'",
  "brinesearch_issue97_ingest_run_verified(target.id)",
  "Loading attempts or changed/missing fingerprints remain fail-closed"
]) assert.ok(sql.includes(token), `Issue #97 failed-retry freshness hardening missing: ${token}`);

assert.match(sql,
  /latest_verified[\s\S]*brinesearch_issue97_ingest_run_verified\(r\.id\)[\s\S]*order by r\.started_at desc,r\.id desc limit 1/,
  "Scope currentness must select the newest fully verified successful run");
assert.match(sql,
  /when a\.status='failed'[\s\S]*a\.snapshot_fingerprint is not null[\s\S]*a\.snapshot_fingerprint=v\.snapshot_fingerprint then true[\s\S]*else false/,
  "Only an unchanged failed retry may be ignored");
assert.ok(!/when a\.status='loading'[\s\S]*then true/.test(sql),
  "A loading retry must never be treated as compatible/current");
assert.match(sql,
  /revoke all on function private_verification\.brinesearch_issue97_source_snapshot_fingerprint\(jsonb\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Snapshot-fingerprint helper must remain internal");
assert.match(sql,
  /revoke all on function private_verification\.brinesearch_issue97_dataset_scope_current\(uuid,text,text\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Scope-current predicate must remain internal");

console.log("Issue #97 unchanged-failed-retry source freshness regression passed.");
