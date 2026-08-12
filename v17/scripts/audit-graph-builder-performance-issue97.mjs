import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811250000_issue97_graph_builder_internal_segment_performance.sql"), "utf8");
const targetGeogSql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811252000_issue97_graph_builder_target_geography_index.sql"), "utf8");
const endpointTJunctionSql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812036000_issue97_endpoint_on_interior_t_junctions.sql"), "utf8");

for (const token of [
  "brinesearch_odot_catalog_geog_issue97_idx",
  "brinesearch_external_segments_geog_issue97_idx",
  "private_verification.brinesearch_issue97_authoritative_road_segments_internal",
  "pg_catalog.pg_get_viewdef('public.brinesearch_authoritative_road_segments'",
  "revoke all on private_verification.brinesearch_issue97_authoritative_road_segments_internal",
  "from public,anon,authenticated,service_role",
  "pg_catalog.replace(",
  "'public.brinesearch_authoritative_road_segments'",
  "'private_verification.brinesearch_issue97_authoritative_road_segments_internal'",
  "v_new_count<>v_old_count",
  "revoke all on function public.brinesearch_issue97_rebuild_county_graph(text,text)",
  "grant execute on function public.brinesearch_issue97_rebuild_county_graph(text,text)",
  "to service_role"
]) assert.ok(migration.includes(token), `Issue #97 graph-builder performance hardening missing: ${token}`);

assert.match(migration,
  /using gist \(\(geom::extensions\.geography\)\)[\s\S]*where geom is not null and source_active;/,
  "ODOT boundary-neighbor discovery must have an active-row geography GiST path");
assert.match(migration,
  /using gist \(\(geom::extensions\.geography\)\)[\s\S]*where geom is not null and active;/,
  "WV/PA boundary-neighbor discovery must have an active-row geography GiST path");
assert.ok(!/grant\s+(?:select|all)[\s\S]{0,180}brinesearch_issue97_authoritative_road_segments_internal[\s\S]{0,100}service_role/i.test(migration),
  "The private normalized builder view must not become a general service-role read API");
assert.match(migration,
  /if coalesce\(v_old_count,0\)<2[\s\S]*raise exception/,
  "Graph-builder rewrite must fail closed if the expected source-view references are not present");
assert.match(migration,
  /if v_new_count<>v_old_count[\s\S]*raise exception/,
  "Graph-builder rewrite must prove that every expected source-view reference was replaced");

for (const token of [
  "tmp_issue97_target_segments_geog_idx",
  "using gist((geom::extensions.geography))",
  "analyze tmp_issue97_target_segments",
  "v_count<>1",
  "revoke all on function public.brinesearch_issue97_rebuild_county_graph(text,text)",
  "grant execute on function public.brinesearch_issue97_rebuild_county_graph(text,text)",
  "to service_role"
]) assert.ok(targetGeogSql.includes(token), `Issue #97 target-geography hardening missing: ${token}`);

assert.match(targetGeogSql,
  /create index tmp_issue97_target_segments_geom_idx[\s\S]*create index tmp_issue97_target_segments_geog_idx[\s\S]*analyze tmp_issue97_target_segments;/,
  "The builder must add/analyze its temporary geography index immediately after the existing geometry index and before boundary discovery");

for (const token of [
  "exact authoritative endpoint-on-interior T-junction recovery",
  "exact_authoritative_endpoint_on_interior",
  "extensions.st_intersects(ep.geom,b.geom)",
  "extensions.st_touches(a.geom,b.geom)",
  "not extensions.st_dwithin(",
  "extensions.st_boundary(b.geom)::extensions.geography",
  "p.source_method='exact_authoritative_endpoint_on_interior'",
  "count(distinct i.identity_id) filter(where i.is_identity_terminus)>=1",
  "count(distinct i.identity_id) filter(where i.has_interior_touch)>=1",
  "e.identity_ids @> p.identity_ids",
  "p.identity_ids @> e.identity_ids",
  "Strong endpoint-on-interior proof replaces only the identical weaker raw-vertex identity set",
  "Interior/interior crossings",
  "nearest-road matching never prove a junction"
]) assert.ok(endpointTJunctionSql.includes(token), `Issue #97 endpoint-on-interior T-junction hardening missing: ${token}`);
assert.ok(!/st_crosses\(/i.test(endpointTJunctionSql),
  "Endpoint T-junction recovery must not convert generic interior/interior crossings into junction proof");
assert.match(endpointTJunctionSql,
  /join tmp_issue97_segments b[\s\S]*ep\.geom OPERATOR\(extensions\.&&\) b\.geom[\s\S]*st_intersects\(ep\.geom,b\.geom\)[\s\S]*st_touches\(a\.geom,b\.geom\)/,
  "Endpoint-on-interior recovery must require an exact authoritative endpoint contact before topology support");
assert.match(endpointTJunctionSql,
  /from exact_points p[\s\S]*not exists\([\s\S]*from endpoint_points e[\s\S]*e\.identity_ids @> p\.identity_ids[\s\S]*p\.identity_ids @> e\.identity_ids[\s\S]*union all[\s\S]*from endpoint_points p/,
  "An identical weak raw-vertex candidate must yield to the stronger endpoint-on-interior proof, while non-identical broader candidates remain separate");
assert.match(endpointTJunctionSql,
  /revoke all on function public\.brinesearch_issue97_rebuild_county_graph\(text,text\)[\s\S]*grant execute[\s\S]*to service_role;/,
  "Hardened graph builder must remain service-only");

console.log("Issue #97 graph-builder performance + strong exact endpoint-on-interior T-junction/no-overpass regression passed.");
