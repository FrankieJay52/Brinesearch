import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811242000_issue97_transition_google_manifests.sql"), "utf8");

for (const token of [
  "brinesearch_issue97_refresh_google_route_published_core",
  "brinesearch_issue97_google_route_current_published_core",
  "brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core",
  "brinesearch_issue97_transition_google_dependency",
  "brinesearch_issue97_refresh_google_route_transition",
  "manifest_mode','transition_geometry'",
  "origin_mode','current_location_until_route_ingress'",
  "shape_role','route_ingress'",
  "authoritative_junction_anchor",
  "authoritative_clipped_geometry",
  "driver_road_sequence",
  "final_exact_road_does_not_reach_saved_pad_gps",
  "transition_route_dependencies_not_current_or_exact",
  "canonical_occurrence_not_covered_by_current_authoritative_source",
  "same-identity current authoritative source segments within one meter",
  "name_only_resolution',false",
  "nearest_road_resolution',false",
  "fuzzy_resolution',false",
  "pipeline_complete_through_google_manifest",
  "review_exception_qa_only"
]) {
  assert.ok(sql.includes(token), `Issue #97 transition Google manifest contract missing: ${token}`);
}

assert.match(sql, /v_dependency:=private_verification\.brinesearch_issue97_transition_google_dependency\(p_pad_id\);/,
  "transition Google builder/current checker must share one dependency function");
assert.match(sql, /extensions\.st_dwithin\([\s\S]*g\.end_coordinate::extensions\.geography[\s\S]*st_makepoint\(v_pad\.longitude,v_pad\.latitude\)[\s\S]*\n\s*1\n/,
  "transition Google route must require final exact occurrence to reach saved pad GPS within one metre");
assert.match(sql, /source_geom::extensions\.geography[\s\S]*st_startpoint\(src\.step_geometry\)[\s\S]*0\.25[\s\S]*0\.50[\s\S]*0\.75[\s\S]*st_endpoint\(src\.step_geometry\)/,
  "transition Google shaping provenance must verify multiple checkpoints along each exact occurrence");
assert.match(sql, /generate_series\([\s\S]*500::numeric[\s\S]*p\.length_m-100[\s\S]*500::numeric/,
  "transition Google manifests must add regular shaping points on longer exact occurrences");
assert.match(sql, /st_closestpoint\([\s\S]*src\.source_geom[\s\S]*candidate_point\.candidate[\s\S]*source_distance_m<=1/,
  "shaping points must snap only to the same resolved authoritative source geometry within one metre");
assert.match(sql, /t\.status='resolved'[\s\S]*t\.junction_id[\s\S]*t\.anchor_id[\s\S]*graph_build_id[\s\S]*anchor_digest/,
  "transition controls must retain exact verified junction/anchor/graph evidence");
assert.match(sql, /coalesce\(v_pad\.structured_route_revision,0\)>=1[\s\S]*road_sequence_status='owner_verified'[\s\S]*brinesearch_issue97_refresh_google_route_published_core/,
  "fully #69-published routes must keep the stricter existing Google builder");
assert.match(sql, /v_core:=public\.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core\(p_pad_id\);[\s\S]*v_google:=public\.brinesearch_issue97_refresh_google_routes\(p_pad_id\);/,
  "all-pad pipeline must continue through exact geometry and Google ready/held accounting");
assert.match(sql, /revoke all on function private_verification\.brinesearch_issue97_refresh_google_route_transition\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "private transition Google builder must not be browser/service directly callable");
assert.match(sql, /revoke all on function public\.brinesearch_issue97_run_all_pad_routing_pipeline\(uuid\)[\s\S]*from public,anon,authenticated;[\s\S]*grant execute[\s\S]*to service_role;/,
  "all-pad write pipeline must remain service-only");

for (const forbidden of [
  "selection_uses_name_similarity',true",
  "selection_uses_nearest_road',true",
  "fuzzy_resolution',true"
]) {
  assert.ok(!sql.includes(forbidden), `Issue #97 transition Google migration enables forbidden heuristic: ${forbidden}`);
}

console.log("Issue #97 transition-derived Google manifest/no-guess audit passed.");
