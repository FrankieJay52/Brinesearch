import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260826091500_issue97_stuart_tappan_scio_exact_driver_name.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8").replace(/\r\n?/g, "\n");
const compact = sql.replace(/\s+/g, " ").trim().toLowerCase();
const failures = [];

const requireText = (value, label) => {
  if (!compact.includes(value.replace(/\s+/g, " ").trim().toLowerCase())) {
    failures.push(`missing ${label}`);
  }
};

requireText("3ef517c7-c783-490c-878f-2a82ebc0c2cf", "exact STUART pad UUID");
requireText("0415cc7e-fcff-4768-a280-b55476b073d3", "exact primary route UUID");
requireText("f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca", "exact OH-646 step UUID");
requireText("99898ae8-b80a-06d3-71c3-7d3901867bcd", "exact OH-646 identity");
requireText("9b980c79-5542-4b60-a9f9-c4639ddc2cc2", "unchanged canonical road");
requireText("OH:ODOT:NLF:SHASSR00646**C", "exact source identity key");
requireText("OH:ODOT:SEGMENT:2025_000000000302354", "exact Tappan Scio segment");
requireText("TAPPAN SCIO RD", "source-segment-bound driver name");
requireText("ANNAPOLIS RD", "identity-wide fallback separation");
requireText("owner_reviewed_exact_source_segment", "authoritative name receipt");
requireText("issue97_owner_reviewed_exact_source_identity", "explicit step receipt method");
requireText("covered_source_segment_keys", "six covered source-segment keys");
requireText("exact_authoritative_intersection", "exact geometry/name overlap receipt");
requireText("v_overlap_count<>6", "six-segment occurrence proof");
requireText("v_overlap_m<2856 or v_overlap_m>2858", "bounded exact overlap proof");
requireText("explicit_authoritative_source_receipt", "refreshed exact occurrence receipt");
requireText("brinesearch_issue97_refresh_transition_receipts", "transition refresh");
requireText("brinesearch_issue97_refresh_route_geometry", "geometry refresh");
requireText("brinesearch_issue97_refresh_route_receipt", "route receipt refresh");
requireText("verified_pad_gps_not_on_final_authoritative_geometry", "final endpoint hold");
requireText("exact_occurrence_geometry_incomplete", "unchanged route blocker");
requireText("v_status->'route'->'steps' is distinct from '[]'::jsonb", "empty public steps");
requireText("v_status->'route'->'geometry' is distinct from 'null'::jsonb", "null public geometry");
requireText("v_status->'route'->>'state' is distinct from 'held'", "held route after current-build receipt refresh");
requireText("v_status->'graph'->>'state' is distinct from 'active_current'", "current Harrison graph projection");
requireText("v_status->'google'->>'publicState' is distinct from 'held'", "held public Google projection");
requireText("public_route_or_graph_authority_held", "fail-closed public Google reason");
requireText("non_target_step_digest", "non-target step zero delta");
requireText("non_target_occurrence_digest", "non-target occurrence zero delta");
requireText("non_target_geometry_digest", "non-target geometry zero delta");
requireText("'start_transition_digest'-'end_transition_digest'", "derived transition digests excluded from geometry semantic comparison");
requireText("'end_transition_digest'-'evidence'", "non-authority geometry evidence excluded from core comparison");
requireText("non_target_transition_digest", "non-target transition zero delta");
requireText("'receipt_digest'-'dependency_digest'-'evidence'", "non-authority receipt evidence excluded from core comparison");
requireText("stable_junction_key", "stable transition topology comparison");
requireText("0870470a-11f8-4f33-8af3-08d6849d5f34", "retired STUART transition build checkpoint");
requireText("f4e4d43f-e86c-499c-893f-73f2eef3dc29", "current Harrison transition build");
requireText("28a37aa0-8ef8-ff45-21a6-1fd4e20c0b17", "current first stable junction");
requireText("c9fb2e5c-307c-95ea-a032-f665d2b83530", "current second stable junction");
requireText("transitions did not refresh onto the exact current graph", "current graph transition gate");
requireText("private_google_digest", "private Google zero delta");
requireText("public_google_digest", "public Google zero delta");
requireText("overlay was not safely withdrawn", "overlay withdrawal gate");
requireText("route_authority_upgrade',false", "no route authority upgrade");
requireText("public_google_publication',false", "no Google publication");
requireText("name_matching_used',false", "no name matching");
requireText("fuzzy_matching_used',false", "no fuzzy matching");
requireText("nearest_road_used',false", "no nearest-road matching");
requireText("refreshed receipts used forbidden inference", "refreshed receipt no-inference gate");

if (/pg_catalog\.(?:coalesce|nullif|greatest|least|extract|jsonb_object_length)\s*\(/i.test(sql)) {
  failures.push("PostgreSQL special syntax is incorrectly schema-qualified");
}
if (/\b(insert\s+into|update|delete\s+from)\s+public\.brinesearch_(?:road_graph|road_identity_mappings|road_junction)/i.test(sql)) {
  failures.push("migration must not mutate graph, mapping, or junction authority");
}
if (/\b(insert\s+into|update|delete\s+from)\s+public\.brinesearch_driver_google_routes_public/i.test(sql)) {
  failures.push("migration must not mutate public Google publication");
}
if (/\b(update|insert\s+into|delete\s+from)\s+public\.brinesearch_issue97_release_state/i.test(sql)) {
  failures.push("migration must not mutate cutover state");
}
if (/\b(?:st_closestpoint|st_shortestline|st_snap|similarity)\s*\(/i.test(sql)) {
  failures.push("migration must not infer route authority from proximity or fuzzy geometry");
}
if (!/update\s+public\.brinesearch_route_prep_steps/i.test(sql)) {
  failures.push("migration must contain the one scoped route-step receipt update");
}
if (/update\s+public\.brinesearch_route_prep\b/i.test(sql)) {
  failures.push("migration must not change route prep authority");
}
if (/update\s+public\.pads\b/i.test(sql)) {
  failures.push("migration must not change pad data");
}

if (failures.length) {
  console.error("STUART Tappan Scio driver-name audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "STUART contract passed: exact OH-646 occurrence displays Tappan Scio, final Henderson geometry remains held, and graph/Google/cutover authority is unchanged.",
);
