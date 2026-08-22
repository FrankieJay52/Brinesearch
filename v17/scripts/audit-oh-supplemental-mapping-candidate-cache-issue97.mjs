import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8")
  .replace(/\r\n?/g, "\n");
const sql = read("supabase/migrations/20260812032000_issue97_oh_supplemental_mapping_candidate_cache.sql");
const idOnly = read("supabase/migrations/20260812037200_issue97_oh_bbox_candidate_id_cache.sql");

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

for (const token of [
  "keep Ohio OGRIP bbox candidates ID-only to bound temporary disk",
  "select c.centerline_id,o.identity_id,o.source_segment_key",
  "c.nlf_id is not null and o.nlf_id=c.nlf_id",
  "c.nlf_id is null",
  "tmp_issue97_oh_map_bbox_segment_idx",
  "join tmp_issue97_oh_map_source c on c.centerline_id=b.centerline_id",
  "join tmp_issue97_oh_map_odot o",
  "extensions.st_dwithin(c.geom::extensions.geography,o.geom::extensions.geography,0.25)",
  "Name/nearest-road mapping remains prohibited"
]) assert.ok(idOnly.includes(token), `Issue #97 ID-only Ohio candidate hardening missing: ${token}`);

// The migration intentionally contains the old geometry-heavy SQL as the guarded
// find/replace target. Inspect only the $new$ replacement body when asserting the
// effective temporary-table shape; otherwise the audit would reject its own patch
// target rather than the code that actually gets installed.
const newReplacementStart = idOnly.indexOf("v_new text:=$new$");
const newReplacementEnd = idOnly.indexOf("$new$;", newReplacementStart + 1);
assert.ok(newReplacementStart >= 0 && newReplacementEnd > newReplacementStart,
  "Issue #97 ID-only migration is missing its effective replacement block");
const effectiveNew = idOnly.slice(newReplacementStart, newReplacementEnd);
const newTableAt = effectiveNew.indexOf("create temporary table tmp_issue97_oh_map_bbox_candidates");
const newInsertAt = effectiveNew.indexOf("insert into public.brinesearch_supplemental_centerline_identity_mappings", newTableAt);
assert.ok(newTableAt >= 0 && newInsertAt > newTableAt,
  "ID-only bbox cache must be created before mapping insertion in the effective replacement");
const tableBlock = effectiveNew.slice(newTableAt, newInsertAt);
for (const forbidden of ["source_geom_3857", "target_segment_geom_3857", "c.geom as source_geom", "o.geom as target_segment_geom"]) {
  assert.ok(!tableBlock.includes(forbidden), `ID-only bbox cache must not persist repeated geometry payload: ${forbidden}`);
}
assert.ok(tableBlock.includes("select c.centerline_id,o.identity_id,o.source_segment_key"),
  "Effective bbox cache must store only source/identity/segment identifiers");
assert.match(effectiveNew,
  /with candidate_segments as \([\s\S]*from tmp_issue97_oh_map_bbox_candidates b[\s\S]*join tmp_issue97_oh_map_source c[\s\S]*join tmp_issue97_oh_map_odot o[\s\S]*st_dwithin\(c\.geom::extensions\.geography,o\.geom::extensions\.geography,0\.25\)/,
  "Exact geometry must be joined back only after the ID-only bbox cache is materialized");
assert.match(idOnly,
  /revoke all on function public\.brinesearch_issue97_refresh_supplemental_aliases_oh\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "ID-only candidate implementation helper must remain non-callable");

console.log("Issue #97 Ohio OGRIP indexed bbox candidate-cache + ID-only temp footprint + exact 0.25 m geodesic mapping regression passed.");
