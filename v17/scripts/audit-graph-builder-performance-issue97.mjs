import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811250000_issue97_graph_builder_internal_segment_performance.sql"), "utf8");

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

console.log("Issue #97 graph-builder private normalized view + geography-index regression passed.");
