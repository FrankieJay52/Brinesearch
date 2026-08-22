import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812045400_issue97_source_finalize_scope_identity_indexes.sql"), "utf8");

for (const token of [
  "brinesearch_external_segments_scope_identity_active_issue97_idx",
  "brinesearch_authoritative_external_road_segments",
  "(dataset_id,state_code,county_code,identity_id)",
  "where active",
  "brinesearch_source_geometry_holds_scope_identity_active_issue97_idx",
  "brinesearch_issue97_source_geometry_holds",
  "performance-only",
  "no mapping semantics"
]) assert.ok(migration.includes(token), `Issue #97 source-finalize performance migration missing: ${token}`);

for (const forbidden of [
  "insert into public.brinesearch_roads",
  "similarity(",
  "<->",
  "nearest_road",
  "update public.brinesearch_authoritative_road_identities",
  "delete from public.brinesearch_authoritative_road_identities"
]) assert.ok(!migration.includes(forbidden), `Issue #97 performance-only migration must not change resolution semantics: ${forbidden}`);

assert.equal((migration.match(/create index if not exists/g) ?? []).length, 2,
  "Issue #97 source-finalize performance migration must install exactly two targeted indexes");

console.log("Issue #97 source-finalization scope+identity performance-index audit passed.");
