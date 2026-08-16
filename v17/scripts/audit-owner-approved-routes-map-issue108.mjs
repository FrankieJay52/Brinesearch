import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const migration = path.join(root, "supabase/migrations/20260816170000_owner_approved_routes_map.sql");
const viewportFix = path.join(root, "supabase/migrations/20260816170100_owner_approved_routes_map_viewport_fix.sql");
const viewportPerf = path.join(root, "supabase/migrations/20260816170200_owner_approved_routes_map_viewport_performance.sql");
const moduleFile = path.join(root, "v17/src/parts/21p-owner-approved-routes-map-issue108.js");
const styleFile = path.join(root, "v17/src/styles/46-owner-approved-routes-map-issue108.css");
for (const file of [migration,viewportFix,viewportPerf,moduleFile,styleFile]) if (!fs.existsSync(file)) throw new Error(`Missing ${path.relative(root,file)}`);
const sql=fs.readFileSync(migration,"utf8");
const fixSql=fs.readFileSync(viewportFix,"utf8");
const perfSql=fs.readFileSync(viewportPerf,"utf8");
const js=fs.readFileSync(moduleFile,"utf8");

function requireMatch(text,re,label){ if(!re.test(text)) throw new Error(`Issue #108 audit failed: ${label}`); }
function forbid(text,re,label){ if(re.test(text)) throw new Error(`Issue #108 audit failed: ${label}`); }

requireMatch(sql,/security definer/gi,"RPCs must be SECURITY DEFINER");
if ((sql.match(/security definer/gi)||[]).length !== 3) throw new Error("Issue #108 audit failed: expected exactly three owner RPCs");
if ((sql.match(/is_brinesearch_owner\(auth\.uid\(\)\)/g)||[]).length !== 3) throw new Error("Issue #108 audit failed: every RPC must verify owner auth");
requireMatch(sql,/set search_path = ''/g,"SECURITY DEFINER functions need fixed empty search_path");
requireMatch(sql,/revoke all on function[\s\S]+from public, anon;/i,"RPC execution must be revoked from PUBLIC and anon");
requireMatch(sql,/grant execute on function[\s\S]+to authenticated;/i,"authenticated role must call RPCs only after in-function owner check");
requireMatch(sql,/operator\(extensions\.&&\)/i,"viewport must use indexed bounding-box prefilter");
requireMatch(sql,/least\(coalesce\(p_limit,800\),800\)/i,"viewport payload must be capped");
requireMatch(sql,/road_class in \('interstate','us_route','state_route'\)/i,"policy approval must be exact road-class based");
requireMatch(sql,/truck_status='official_truck_route'/i,"explicit local approval must require exact official truck-route evidence");
requireMatch(sql,/public_access_status[\s\S]+private/i,"private/nonpublic evidence must override approval");
requireMatch(sql,/drivable_status[\s\S]+non_drivable/i,"non-drivable evidence must override approval");
requireMatch(sql,/occurrence_count,0\)>0 then 'candidate'/i,"route-use evidence may only produce candidate status");
requireMatch(sql,/graph_build_release_current/i,"junctions must use release-current graph builds only");
forbid(sql,/insert\s+into\s+public\.|update\s+public\.|delete\s+from\s+public\./i,"first release must not write road/route production data");
forbid(sql,/brinesearch_issue97_rebuild_county_graph|activate_.*graph|global.*cutover/i,"Issue #108 must not execute Issue #97 build/activation/cutover work");
requireMatch(fixSql,/p\.latitude.*p\.longitude/s,"viewport correction must use production pad coordinates");
requireMatch(fixSql,/operator\(extensions\.&&\)/,"viewport correction must preserve spatial index prefilter");
forbid(fixSql,/\.lat\b|\.lng\b/,"viewport correction must not use nonexistent pad lat/lng columns");
requireMatch(perfSql,/brinesearch_odot_road_catalog/,"performance path must use indexed ODOT geometry store");
requireMatch(perfSql,/brinesearch_authoritative_external_road_segments/,"performance path must use indexed external geometry store");
requireMatch(perfSql,/scopes as materialized[\s\S]+dataset_scope_current/,"currentness checks must be scope-batched");
forbid(perfSql,/from public\.brinesearch_authoritative_road_segments s/i,"routine viewport must not expand global authoritative segment union view");

requireMatch(js,/editorIsOwner\(\)/,"UI must enforce owner access");
requireMatch(js,/owner_approved_routes_map_viewport/,"map must use owner-only bounded viewport RPC");
requireMatch(js,/owner_approved_routes_map_road_detail/,"road details must use owner-only RPC");
requireMatch(js,/owner_approved_routes_map_pad_options/,"pad selector must use owner-only RPC");
requireMatch(js,/tile\.openstreetmap\.org/,"feature must reuse existing OSM raster slippy-map approach");
requireMatch(js,/Reference-only roads are not approved\./,"legend must explicitly state reference roads are not approved");
forbid(js,/service_role|SUPABASE_SERVICE|database password|connection string/i,"frontend must not contain privileged credentials");
forbid(js,/method:\s*["'](?:PUT|PATCH|DELETE)["']/i,"read-only map module must not issue mutations");
forbid(js,/\/rest\/v1\/(?:pads|brinesearch_roads|brinesearch_authoritative|editor_accounts)/i,"feature must not query underlying tables directly");

console.log("Issue #108 static owner-map audit passed.");
