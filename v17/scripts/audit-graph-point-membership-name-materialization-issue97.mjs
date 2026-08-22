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
  "create temporary table tmp_issue97_point_values on commit drop as",
  "create temporary table tmp_issue97_shared_values on commit drop as",
  "shared-section and name-change membership paths are left untouched",
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
  /v_point_values_pos[\s\S]*v_point_insert_pos[\s\S]*v_shared_values_pos/,
  "point membership patch must locate the point insert structurally between point-values and shared-values"
);
assert.match(
  migration,
  /v_definition := pg_catalog\.substr\(v_definition,1,v_point_insert_pos-1\)[\s\S]*\|\|v_new_block[\s\S]*\|\|pg_catalog\.substr\(v_definition,v_shared_values_pos\)/,
  "point membership patch must replace only the structurally bounded point-membership region"
);
assert.ok(
  migration.includes("v_shared_lateral_pos") && migration.includes("coalesce(primary_name.road_name,i.display_name)"),
  "verification must prove the shared-membership name lateral remains after the point-only rewrite"
);

console.log("Issue #97 point-membership name materialization audit passed.");
