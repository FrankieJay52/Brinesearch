import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812032000_issue97_oh_supplemental_mapping_candidate_cache.sql"), "utf8");

for (const token of [
  "Ohio OGRIP exact-mapping candidate cache hardening",
  "tmp_issue97_oh_map_source",
  "tmp_issue97_oh_map_odot",
  "tmp_issue97_oh_map_bbox_candidates",
  "tmp_issue97_oh_map_source_geom_idx",
  "tmp_issue97_oh_map_odot_geom_idx",
  "tmp_issue97_oh_map_source_nlf_idx",
  "tmp_issue97_oh_map_odot_nlf_idx",
  "o.geom OPERATOR(extensions.&&) extensions.st_expand(c.geom,0.00001)",
  "extensions.st_dwithin(\n      source_geom::extensions.geography",
  "target_segment_geom::extensions.geography",
  "0.25",
  "candidate_source','indexed source/ODOT bbox cache + exact 0.25 m geodesic proof'",
  "name_used_for_mapping',false",
  "nearest_road_used_for_mapping',false",
  "Names and nearest-road matching remain prohibited"
]) assert.ok(sql.includes(token), `Issue #97 Ohio mapping candidate cache missing: ${token}`);

const cacheAt = sql.indexOf("create temporary table tmp_issue97_oh_map_bbox_candidates");
const mappingAt = sql.indexOf("insert into public.brinesearch_supplemental_centerline_identity_mappings", cacheAt);
assert.ok(cacheAt >= 0 && mappingAt > cacheAt,
  "Ohio OGRIP mapping must materialize indexed bbox candidates before exact identity insertion");
const mappingSql = sql.slice(mappingAt, sql.indexOf("$replacement$;", mappingAt));
assert.ok(mappingSql.includes("from tmp_issue97_oh_map_bbox_candidates"),
  "Exact mapping must consume the bounded candidate cache rather than rescan OGRIP/ODOT base tables");
assert.ok(!mappingSql.includes("join public.brinesearch_odot_road_catalog"),
  "Effective exact mapping insert must not perform the original broad base-table ODOT spatial join");
assert.ok(!mappingSql.includes("road_name"),
  "Road names must remain excluded from Ohio OGRIP identity mapping");
assert.ok(mappingSql.includes("nearest_road_used_for_mapping',false"),
  "Exact mapping evidence must explicitly record that nearest-road matching was not used");
assert.ok(!mappingSql.includes("nearest_road_used_for_mapping',true"),
  "Nearest-road matching must remain disabled in Ohio OGRIP identity mapping");
assert.match(sql,
  /revoke all on function public\.brinesearch_issue97_refresh_supplemental_aliases_oh\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Candidate-cache implementation helper must remain non-callable outside the trusted dispatcher");

console.log("Issue #97 Ohio OGRIP indexed bbox candidate-cache + exact 0.25 m geodesic mapping regression passed.");
