import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260812046100_issue97_graph_point_values_set_based.sql"
  ),
  "utf8"
);

for (const token of [
  "tmp_issue97_identity_segment_counts",
  "issue97_point_values_base",
  "tmp_issue97_point_values",
  "i.source_segment_keys",
  "i.is_identity_terminus",
  "left join chosen c",
  "OPERATOR(extensions.&&)",
  "0.03",
  "has_at_grade then 1",
  "st_dwithin",
  "st_linemerge",
  "st_closestpoint",
  "st_linelocatepoint",
  "from_measure nulls last",
  "source_segment_key",
  "1609.344",
  "authoritative_linear_measure",
  "single_source_feature_geometry",
  "ambiguous",
  "geometrytype(",
  "fail-closed",
]) {
  assert.ok(migration.includes(token), `missing required contract token: ${token}`);
}

assert.ok(
  /from\s+tmp_issue97_point_nodes\s+p[\s\S]*join\s+tmp_issue97_point_identity\s+i/i.test(migration),
  "base population must remain point_nodes joined to point_identity"
);
assert.ok(
  /left\s+join\s+chosen\s+c/i.test(migration),
  "chosen segment must be LEFT JOINed back to the complete base"
);
assert.ok(
  migration.includes("b.source_segment_keys") && migration.includes("b.is_identity_terminus"),
  "identity-derived source_segment_keys and terminus flag must flow to final output"
);

for (const forbidden of ["similarity(", "nearest_road", "fuzzy_name", "name_only"]) {
  assert.ok(!migration.toLowerCase().includes(forbidden), `must not introduce: ${forbidden}`);
}

console.log("Issue #97 point-values set-based V2 audit passed.");
