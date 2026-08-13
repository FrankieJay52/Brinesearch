import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260812046500_issue97_graph_name_change_candidate_temp_table.sql"
  ),
  "utf8"
);

for (const token of [
  "tmp_issue97_name_change_candidates",
  "tmp_issue97_name_change_candidates_left_idx",
  "tmp_issue97_name_change_candidates_right_idx",
  "analyze tmp_issue97_name_change_candidates",
  "from tmp_issue97_name_change_candidates p",
  "tmp_issue97_segment_preferred_names na",
  "tmp_issue97_segment_preferred_names nb",
  "0.03",
  "st_dwithin",
  "st_intersection",
  "st_boundary",
  "normalized_name<>",
  "st_asewkb",
  "geometrytype(",
  "0.001",
  "array_agg(distinct",
  "source_segment_keys",
  "name_event_ids",
]) {
  assert.ok(migration.includes(token), `missing: ${token}`);
}

for (const forbidden of ["similarity(", "nearest_road", "fuzzy_name", "name_only"]) {
  assert.ok(!migration.includes(forbidden), `forbidden: ${forbidden}`);
}

assert.ok(
  migration.includes("from tmp_issue97_name_change_candidates p"),
  "name joins must start from the real candidate temp table"
);

// Production authoritative-road-name event IDs are bigint. Do not regress to
// UUID/text coercion in the name_event_ids array contract.
assert.ok(!migration.includes("'{}'::uuid[]"), "name_event_ids must not be coerced to uuid[]");
assert.ok(!migration.includes("string_agg"), "name_event_ids/source keys must remain arrays");

console.log("Issue #97 name-change candidate temp table audit passed.");
