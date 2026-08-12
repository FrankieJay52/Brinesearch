import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812037000_issue97_authoritative_occurrence_geometry.sql"), "utf8");
const routeReceiptSql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812043700_issue97_route_receipt_authoritative_geometry.sql"), "utf8");

for (const token of [
  "authoritative occurrence geometry instead of legacy canonical centerline dependency",
  "private_verification.brinesearch_issue97_authoritative_identity_geometry(",
  "private_verification.brinesearch_issue97_authoritative_road_segments_internal",
  "brinesearch_issue97_dataset_scope_current(",
  "brinesearch_issue97_identity_route_usable(",
  "private_verification.brinesearch_issue97_clip_exact_authoritative_occurrence(",
  "verified_identity_to_canonical_mapping_missing",
  "boundaries_not_on_one_authoritative_component",
  "ambiguous_authoritative_components",
  "authoritative_identity_component_issue97",
  "selection_uses_name_similarity',false",
  "selection_uses_nearest_road',false",
  "brinesearch_issue97_authoritative_identity_geometry(v_left.identity_id)",
  "brinesearch_issue97_authoritative_identity_geometry(v_right.identity_id)",
  "verified_pad_gps_not_on_final_authoritative_geometry",
  "brinesearch_issue97_clip_exact_authoritative_occurrence(v_occ.identity_id,v_occ.canonical_road_id,v_start,v_end)"
]) assert.ok(sql.includes(token), `Issue #97 authoritative occurrence geometry missing: ${token}`);

assert.match(sql,
  /select count\(\*\) into v_component_count[\s\S]*st_dwithin\(parts\.geom::extensions\.geography,p_start::extensions\.geography,1\)[\s\S]*st_dwithin\(parts\.geom::extensions\.geography,p_end::extensions\.geography,1\)/,
  "Exact occurrence clipping must choose a component only from both exact boundaries");
assert.match(sql,
  /if v_component_count=0[\s\S]*boundaries_not_on_one_authoritative_component[\s\S]*if v_component_count>1[\s\S]*ambiguous_authoritative_components/,
  "Authoritative clipping must fail closed on missing or multiple continuous components");
assert.match(sql,
  /brinesearch_road_identity_mappings m[\s\S]*m\.identity_id=p_identity_id[\s\S]*m\.road_id=p_road_id[\s\S]*m\.mapping_status='verified'/,
  "Authoritative geometry must remain bound to the verified canonical Road Manager mapping");
assert.ok(!/road_name\s*=|normalized_name\s*=|similarity\(|levenshtein\(|st_distance\([^\n]*order by/i.test(sql),
  "Authoritative occurrence component selection must not use road-name/fuzzy/nearest-road proof");
assert.match(sql,
  /v_old_gate[\s\S]*canonical_geometry_missing_or_not_publishable[\s\S]*v_new_gate[\s\S]*else/,
  "Transition override must explicitly remove the legacy canonical-centerline readiness gate");
assert.match(sql,
  /v_old_clip[\s\S]*brinesearch_issue97_clip_exact_road_occurrence[\s\S]*v_new_clip[\s\S]*brinesearch_issue97_clip_exact_authoritative_occurrence/,
  "Occurrence geometry must replace the legacy canonical-centerline clipper with the authoritative component clipper");
assert.match(sql,
  /revoke all on function private_verification\.brinesearch_issue97_clip_exact_authoritative_occurrence[\s\S]*from public,anon,authenticated,service_role/,
  "Authoritative occurrence clip helper must remain internal-only");

for (const token of [
  "route-level readiness must follow current #97 occurrence geometry",
  "brinesearch_route_occurrence_geometry_receipts_issue97 g",
  "g.status='resolved' and rr.resolution_status='resolved'",
  "g.identity_id=rr.identity_id and g.road_id=rr.canonical_road_id",
  "g.occurrence_role='origin_anchor'",
  "g.occurrence_role='traveled'",
  "t.receipt_digest=g.start_transition_digest",
  "t.receipt_digest=g.end_transition_digest",
  "string_agg(receipt_digest,',' order by boundary_index)",
  "string_agg(receipt_digest,',' order by occurrence_index)",
  "v_definition like '%join public.brinesearch_pad_roads pr%'",
  "$issue97_verify_route_receipt_authoritative_geometry$"
]) assert.ok(routeReceiptSql.includes(token), `Issue #97 route receipt authoritative geometry missing: ${token}`);

assert.match(routeReceiptSql,
  /join private_verification\.brinesearch_route_occurrence_receipts_issue97 rr[\s\S]*g\.identity_id=rr\.identity_id and g\.road_id=rr\.canonical_road_id/,
  "Route receipt geometry count must remain bound to the same resolved identity and canonical road");
assert.match(routeReceiptSql,
  /g\.occurrence_index>1[\s\S]*g\.step_geometry is not null[\s\S]*g\.geometry_miles>0[\s\S]*boundary_index=g\.occurrence_index-1[\s\S]*t\.receipt_digest=g\.start_transition_digest/,
  "Traveled route geometry must begin on the exact preceding transition receipt");
assert.match(routeReceiptSql,
  /g\.occurrence_index=v_occurrences or exists\([\s\S]*boundary_index=g\.occurrence_index[\s\S]*t\.receipt_digest=g\.end_transition_digest/,
  "Non-final route geometry must end on the exact following transition receipt");
assert.ok(!routeReceiptSql.includes("similarity("),
  "Route receipt readiness must not introduce fuzzy geometry proof");
assert.ok(!routeReceiptSql.includes("<->"),
  "Route receipt readiness must not introduce nearest-geometry proof");

console.log("Issue #97 authoritative identity-component geometry + route-receipt readiness regression passed.");
