import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811249000_issue97_oh_supplemental_overlap_projection_cache.sql"), "utf8");
const sourceKeyIndexSql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811251000_issue97_odot_source_segment_key_index.sql"), "utf8");
const pkJoinSql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811254000_issue97_oh_supplemental_odot_pk_join.sql"), "utf8");
const supplementalPreservationSql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811255000_issue97_supplemental_valid_nonsimple_source_preservation.sql"), "utf8");
const endpointProjectionSql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811256000_issue97_oh_supplemental_overlap_endpoint_projection.sql"), "utf8");

for (const token of [
  "drop table if exists pg_temp.tmp_issue97_oh_supp_centerline_proj",
  "drop table if exists pg_temp.tmp_issue97_oh_supp_odot_proj",
  "drop table if exists pg_temp.tmp_issue97_oh_supp_overlap",
  "create temporary table tmp_issue97_oh_supp_centerline_proj on commit drop as",
  "extensions.st_buffer(extensions.st_transform(c.geom,3857),0.25) as buffer_3857",
  "analyze tmp_issue97_oh_supp_centerline_proj",
  "create temporary table tmp_issue97_oh_supp_odot_proj on commit drop as",
  "extensions.st_transform(o.geom,3857) as geom_3857",
  "analyze tmp_issue97_oh_supp_odot_proj",
  "create temporary table tmp_issue97_oh_supp_overlap on commit drop as",
  "extensions.st_intersection(o.geom_3857,c.buffer_3857)",
  "extensions.st_linelocatepoint(o.geom_3857",
  "analyze tmp_issue97_oh_supp_overlap",
  "cross join lateral pg_catalog.jsonb_array_elements(o.name_events) event",
  "o.ctl_begin+(o.ctl_end-o.ctl_begin)*least(o.start_fraction,o.end_fraction)",
  "o.ctl_begin+(o.ctl_end-o.ctl_begin)*greatest(o.start_fraction,o.end_fraction)",
  "'projected_centerline_cached',true",
  "'projected_odot_segment_cached',true",
  "'overlap_precomputed_once_per_segment',true",
  "'name_overlap_materializer','cached_projected_centerline_and_odot_segments'",
  "'name_matching_used',false",
  "'nearest_road_matching_used',false"
]) assert.ok(migration.includes(token), `Issue #97 Ohio supplemental projection-cache hardening missing: ${token}`);

const centerlineCacheAt = migration.indexOf("create temporary table tmp_issue97_oh_supp_centerline_proj on commit drop as");
const odotCacheAt = migration.indexOf("create temporary table tmp_issue97_oh_supp_odot_proj on commit drop as");
const overlapAt = migration.indexOf("create temporary table tmp_issue97_oh_supp_overlap on commit drop as");
const nameExpandAt = migration.indexOf("cross join lateral pg_catalog.jsonb_array_elements(o.name_events) event", overlapAt);
assert.ok(centerlineCacheAt >= 0 && odotCacheAt > centerlineCacheAt && overlapAt > odotCacheAt && nameExpandAt > overlapAt,
  "Ohio supplemental processing must cache projected centerlines, then projected ODOT segments, then overlap receipts before expanding names");

const overlapBlock = migration.slice(overlapAt, nameExpandAt);
assert.equal((overlapBlock.match(/extensions\.st_intersection\(/g) || []).length, 1,
  "Original Ohio name-event overlap cache should compute one geometry intersection expression per verified centerline/source-segment receipt");
assert.ok(!/jsonb_array_elements\([^)]*name_events/.test(overlapBlock),
  "Name events must not multiply geometry work before the overlap cache is complete");
assert.match(migration,
  /revoke all on function public\.brinesearch_issue97_refresh_supplemental_aliases_oh\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Ohio supplemental implementation helper must remain non-callable outside the trusted dispatcher");

for (const token of [
  "create index if not exists brinesearch_odot_catalog_source_segment_key_issue97_idx",
  "(('OH:ODOT:SEGMENT:'||roadway_inventory_id))",
  "where source_active",
  "exact source_segment_key lookup index",
  "identity matching remains exact and name-independent"
]) assert.ok(sourceKeyIndexSql.includes(token), `Issue #97 exact ODOT source-segment key index missing: ${token}`);

assert.ok(migration.includes("on segment_key='OH:ODOT:SEGMENT:'||o.roadway_inventory_id"),
  "The original cached overlap stage must preserve the deterministic source-segment key contract before the later PK-join optimization");

for (const token of [
  "drop table if exists pg_temp.tmp_issue97_oh_supp_odot_keys",
  "create temporary table tmp_issue97_oh_supp_odot_keys on commit drop as",
  "pg_catalog.substr(k.segment_key,17) as roadway_inventory_id",
  "tmp_issue97_oh_supp_odot_keys_roadway_idx",
  "on o.roadway_inventory_id=k.roadway_inventory_id",
  "exact/source-ID based",
  "road names and nearest-road matching remain prohibited"
]) assert.ok(pkJoinSql.includes(token), `Issue #97 Ohio supplemental ODOT PK-join hardening missing: ${token}`);

assert.ok(!pkJoinSql.includes("on segment_key='OH:ODOT:SEGMENT:'||o.roadway_inventory_id"),
  "The effective projected ODOT cache patch must replace the concatenated catalog join with a direct roadway_inventory_id lookup");
assert.match(pkJoinSql,
  /create temporary table tmp_issue97_oh_supp_odot_keys[\s\S]*analyze tmp_issue97_oh_supp_odot_keys;[\s\S]*create temporary table tmp_issue97_oh_supp_odot_proj[\s\S]*on o\.roadway_inventory_id=k\.roadway_inventory_id/,
  "Ohio OGRIP name materialization must normalize deterministic segment keys before projecting ODOT geometries");

for (const token of [
  "preserve valid non-simple supplemental authoritative centerlines",
  "drop constraint brinesearch_supplemental_centerlines_geometry_check",
  "add constraint brinesearch_supplemental_centerlines_geometry_check check(",
  "not extensions.st_isvalid(v_geom) then continue",
  "and extensions.st_issimple(c.geom)",
  "source-evidence geometry guard",
  "valid non-simple OGRIP rows remain preserved source evidence with explicit held dispositions"
]) assert.ok(supplementalPreservationSql.includes(token), `Issue #97 supplemental non-simple preservation missing: ${token}`);
assert.ok(supplementalPreservationSql.includes("v_ingest:=pg_catalog.replace(v_ingest,v_old_ingest,v_new_ingest)"),
  "Supplemental ingest patch must replace the old simple-only source guard with the valid-1D source guard");
const constraintAt = supplementalPreservationSql.indexOf("add constraint brinesearch_supplemental_centerlines_geometry_check check(");
const patchAt = supplementalPreservationSql.indexOf("do $issue97_patch_supplemental_nonsimple$", constraintAt);
assert.ok(constraintAt >= 0 && patchAt > constraintAt, "Supplemental geometry preservation constraint block is missing");
assert.ok(!supplementalPreservationSql.slice(constraintAt, patchAt).includes("st_issimple"),
  "Supplemental source-evidence table constraint must not reject valid non-simple 1-D centerlines");
assert.match(supplementalPreservationSql,
  /revoke all on function public\.brinesearch_issue97_ingest_supplemental_page\(uuid,integer,integer\)[\s\S]*grant execute[\s\S]*to service_role;/,
  "Supplemental source-page ingest must remain service-only");
assert.match(supplementalPreservationSql,
  /revoke all on function public\.brinesearch_issue97_refresh_supplemental_aliases_oh\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Ohio supplemental implementation helper must remain non-callable after non-simple preservation hardening");

for (const token of [
  "Ohio OGRIP name-overlap endpoint projection hardening",
  "public.brinesearch_supplemental_centerline_identity_mappings m",
  "m.active and m.mapping_status='verified'",
  "o.segment_key=any(m.source_segment_keys)",
  "extensions.st_dwithin(e.source_start,e.target_line,0.25)",
  "extensions.st_dwithin(e.target_start,e.source_line,0.25)",
  "extensions.st_linelocatepoint(e.target_line",
  "extensions.st_closestpoint(e.target_line,e.source_start)",
  "extensions.st_linesubstring(f.target_line",
  "No road names or nearest-road search enter the mapping decision"
]) assert.ok(endpointProjectionSql.includes(token), `Issue #97 endpoint-projected overlap hardening missing: ${token}`);
const endpointReplacementAt = endpointProjectionSql.indexOf("v_replacement text:=$replacement$");
const endpointReplacementEnd = endpointProjectionSql.indexOf("$replacement$;", endpointReplacementAt + 1);
assert.ok(endpointReplacementAt >= 0 && endpointReplacementEnd > endpointReplacementAt,
  "Endpoint-projected overlap replacement block is missing");
const effectiveEndpointSql = endpointProjectionSql.slice(endpointReplacementAt, endpointReplacementEnd);
assert.ok(!effectiveEndpointSql.includes("st_intersection("),
  "Effective Belmont-scale overlap materialization must not perform buffered geometry intersections");
assert.ok(!effectiveEndpointSql.includes("jsonb_array_elements"),
  "Endpoint interval calculation must finish before name-event expansion");
assert.match(endpointProjectionSql,
  /revoke all on function public\.brinesearch_issue97_refresh_supplemental_aliases_oh\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Endpoint-projected Ohio helper must remain non-callable outside the trusted dispatcher");

console.log("Issue #97 Ohio OGRIP cached-projection + exact source-key/ODOT-PK joins + non-simple source preservation + endpoint-projected target intervals + fractional-LRS regression passed.");
