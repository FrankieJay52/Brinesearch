import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260812045700_issue97_graph_point_membership_name_materialization.sql"),
  "utf8"
);

for (const token of [
  "tmp_issue97_point_membership_names",
  "membership_names.candidate_key=v.candidate_key",
  "membership_names.identity_id=v.identity_id",
  "coalesce(membership_names.primary_name,i.display_name)",
  "coalesce(membership_names.aliases,'{}'::text[])",
  "when 'official' then 0",
  "when 'signed' then 1",
  "when 'local' then 2",
  "when '911' then 3",
  "n.valid_from is null or n.valid_from<=now()",
  "n.valid_to is null or n.valid_to>now()",
  "n.source_segment_key=v.chosen_segment_key",
  "least(n.from_measure,n.to_measure)<=v.source_measure",
  "greatest(n.from_measure,n.to_measure)>=v.source_measure",
  "array_agg(distinct n.road_name order by n.road_name)",
  "v_name_block_count<>2",
  "v_select_count<>2",
]) {
  assert.ok(migration.includes(token), `missing required point-membership contract token: ${token}`);
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

assert.match(
  migration,
  /v_definition := pg_catalog\.substr\(v_definition,1,v_pos-1\)[\s\S]*\|\|v_new_names[\s\S]*v_pos\+pg_catalog\.length\(v_old_names\)/,
  "point membership patch must replace only the first exact name/alias lateral block"
);
assert.match(
  migration,
  /v_definition := pg_catalog\.substr\(v_definition,1,v_pos-1\)[\s\S]*\|\|v_new_select[\s\S]*v_pos\+pg_catalog\.length\(v_old_select\)/,
  "point membership patch must replace only the first exact SELECT-list name references"
);

console.log("Issue #97 point-membership name materialization audit passed.");
