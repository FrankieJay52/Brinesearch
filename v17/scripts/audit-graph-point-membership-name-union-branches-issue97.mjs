import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260812045800_issue97_graph_point_membership_name_union_branches.sql"),
  "utf8"
);

for (const token of [
  "issue97_point_name_exact_segment",
  "issue97_point_name_unscoped",
  "union all",
  "0::integer as segment_rank",
  "1::integer as segment_rank",
  "when 'official' then 0",
  "when 'signed' then 1",
  "when 'local' then 2",
  "when '911' then 3",
  "n.valid_from is null or n.valid_from<=now()",
  "n.valid_to is null or n.valid_to>now()",
  "n.source_segment_key=c.chosen_segment_key",
  "n.source_segment_key is null",
  "least(n.from_measure,n.to_measure)<=c.source_measure",
  "greatest(n.from_measure,n.to_measure)>=c.source_measure",
  "array_agg(distinct v.road_name order by v.road_name)",
  "v.segment_rank,v.type_rank,v.road_name,v.name_id",
  "v_count<>1",
  "coalesce(primary_name.road_name,i.display_name)",
]) {
  assert.ok(migration.includes(token), `missing required UNION-branch contract token: ${token}`);
}

for (const forbidden of [
  "name_type='primary'",
  "name_type = 'primary'",
  "similarity(",
  "nearest_road",
  "fuzzy_name",
  "name_only",
]) {
  assert.ok(!migration.includes(forbidden), `must not introduce: ${forbidden}`);
}

assert.equal(
  (migration.match(/issue97_point_name_exact_segment as \(/g) || []).length,
  1,
  "must define exactly one exact-segment evidence branch"
);
assert.equal(
  (migration.match(/issue97_point_name_unscoped as \(/g) || []).length,
  1,
  "must define exactly one unscoped evidence branch"
);

console.log("Issue #97 point-membership name UNION-branch audit passed.");
