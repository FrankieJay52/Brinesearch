import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260812045600_issue97_graph_membership_name_lookup_indexes.sql"),
  "utf8"
);

for (const token of [
  "brinesearch_authoritative_names_identity_segment_active_issue97_idx",
  "brinesearch_authoritative_names_identity_unscoped_measure_issue97_idx",
  "identity_id, source_segment_key",
  "identity_id, from_measure, to_measure",
  "include (name_type, road_name, from_measure, to_measure, valid_from, valid_to)",
  "where active",
  "source_segment_key is null",
  "semantics-neutral",
]) {
  assert.ok(migration.includes(token), `missing required token: ${token}`);
}

for (const forbidden of [
  "similarity(",
  "nearest_road",
  "<->",
  "st_distance(",
  "update public.brinesearch_road_junction_memberships",
  "create or replace function public.brinesearch_issue97_rebuild_county_graph",
]) {
  assert.ok(!migration.toLowerCase().includes(forbidden.toLowerCase()),
    `index-only performance patch must not introduce: ${forbidden}`);
}

console.log("Issue #97 graph membership authoritative-name lookup index audit passed.");
