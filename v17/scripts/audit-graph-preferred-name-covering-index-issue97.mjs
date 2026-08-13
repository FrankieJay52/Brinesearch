import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260812046300_issue97_graph_preferred_name_covering_index.sql"
  ),
  "utf8"
);

for (const token of [
  "brinesearch_authoritative_names_preferred_cover_issue97_idx",
  "identity_id, source_segment_key",
  "normalized_name",
  "include (",
  "name_type",
  "road_name",
  "valid_from",
  "valid_to",
  "where active and source_segment_key is not null",
  "performance-only",
  "analyze public.brinesearch_authoritative_road_names",
]) {
  assert.ok(migration.includes(token), `missing required token: ${token}`);
}

for (const forbidden of [
  "similarity(",
  "nearest_road",
  "fuzzy_name",
  "name_only",
  "tmp_issue97_segment_name_keys",
  "distinct on",
]) {
  assert.ok(!migration.includes(forbidden), `must not introduce/reinstall: ${forbidden}`);
}

console.log(
  "Issue #97 preferred-name covering index audit passed."
);
