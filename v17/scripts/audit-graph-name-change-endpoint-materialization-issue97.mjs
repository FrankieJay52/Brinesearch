import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260812045900_issue97_graph_name_change_endpoint_materialization.sql"
  ),
  "utf8"
);
const keysetMigration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260812046000_issue97_graph_name_change_preferred_name_keyset.sql"
  ),
  "utf8"
);

for (const token of [
  "tmp_issue97_segment_endpoints",
  "tmp_issue97_segment_preferred_names",
  "issue97_name_change_endpoint_candidates",
  "from tmp_issue97_segment_endpoints le",
  "tmp_issue97_segment_preferred_names na",
  "tmp_issue97_segment_preferred_names nb",
  "segment_id::text<",
  "OPERATOR(extensions.&&)",
  "0.03",
  "st_dwithin",
  "st_intersection",
  "st_boundary",
  "na.normalized_name<>nb.normalized_name",
  "array_agg(distinct left_segment_key order by left_segment_key)||",
  "array_agg(distinct left_name_event_id order by left_name_event_id)||",
  "array_agg(raw_geom order by extensions.st_asewkb(raw_geom)::text)",
  "geometrytype(extensions.st_linemerge(p.left_geom))='LINESTRING'",
  "st_linelocatepoint",
  "st_closestpoint",
  "from_measure",
  "to_measure",
  "official",
  "signed",
  "valid_from",
  "valid_to",
  "round(extensions.st_x(raw_geom)::numeric,7)",
  "abs(g.left_measure-g.right_measure)<=0.001",
  "source_segment_keys",
  "name_event_ids",
  "raw_geom",
  "source_measure",
]) {
  assert.ok(migration.includes(token), `missing required contract token: ${token}`);
}

for (const token of [
  "tmp_issue97_segment_name_keys",
  "select distinct identity_id,source_segment_key",
  "join public.brinesearch_authoritative_road_names n",
  "n.identity_id=k.identity_id",
  "n.source_segment_key=k.source_segment_key",
  "when 'official' then 0 when 'signed' then 1 else 2 end",
  "n.valid_from is null or n.valid_from<=now()",
  "n.valid_to is null or n.valid_to>now()",
]) {
  assert.ok(keysetMigration.includes(token), `missing preferred-name keyset token: ${token}`);
}

for (const source of [migration, keysetMigration]) {
  for (const forbidden of [
    "similarity(",
    "nearest_road",
    "fuzzy_name",
    "name_only",
  ]) {
    assert.ok(!source.toLowerCase().includes(forbidden), `must not introduce: ${forbidden}`);
  }
}

assert.ok(
  !migration.toLowerCase().includes("is distinct from nb.normalized_name"),
  "normalized-name comparison must preserve <> NULL behavior"
);
assert.ok(
  !migration.toLowerCase().includes("string_agg(distinct left_segment_key"),
  "source_segment_keys must remain arrays"
);
assert.ok(
  !migration.toLowerCase().includes("string_agg(distinct left_name_event_id"),
  "name_event_ids must remain arrays"
);
assert.ok(
  migration.includes("st_dump(\n    extensions.st_collectionextract(extensions.st_boundary(s.geom),1)"),
  "endpoint materialization must preserve all boundary points, including multipart-safe boundary evidence"
);
assert.ok(
  migration.includes("cross join lateral extensions.st_dump(extensions.st_collectionextract(\n      extensions.st_intersection("),
  "exact boundary intersection must still emit every exact point"
);

console.log("Issue #97 name-change endpoint/name materialization audits passed.");
