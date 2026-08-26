import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260826071409_issue97_una_west_grove_exact_occurrence.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8").replace(/\r\n?/g, "\n");
const compact = sql.replace(/\s+/g, " ").trim().toLowerCase();
const failures = [];

const requireText = (value, label) => {
  if (!compact.includes(value.replace(/\s+/g, " ").trim().toLowerCase())) {
    failures.push(`missing ${label}`);
  }
};

requireText("ascent--una", "exact UNA legacy identity");
requireText("0b675c3f-2c04-4901-955d-8629e7dba05e", "exact UNA pad UUID");
requireText("OH:ODOT:NLF:SHASUS00250**C", "exact US-250 source identity");
requireText(
  "highway.provenance->>'source_identity_key'= 'OH:ODOT:NLF:SHASUS00250**C'",
  "real-schema junction source identity proof",
);
requireText("OH:ODOT:NLF:THASTR00078**C", "exact TR-78 source identity");
requireText(
  "OH:ODOT:SEGMENT:2025_000000000395678",
  "exact West Grove source segment",
);
requireText(
  "US-250 → WEST GROVE RD → LEASE ROUTE",
  "driver-facing route sequence",
);
requireText("highway_anchor_status='explicit'", "valid explicit highway-anchor status");
requireText("UNA LEASE ROUTE", "pad-bound lease destination label");
requireText(
  "owner_reviewed_pad_bound_lease_endpoint",
  "explicit owner-reviewed terminal receipt",
);
requireText("pad_gps_is_public_road_identity',false", "pad-GPS identity prohibition");
requireText(
  "stored_coordinate_role','pad_or_lease_destination_unverified",
  "explicit unverified pad/lease coordinate role",
);
requireText(
  "verified_public_road_entrance_present',false",
  "no invented verified entrance",
);
requireText("authority_effect','held_only", "held-only lease authority");
requireText("satellite_context_only',true", "satellite-context-only receipt");
requireText(
  "terminal_private_access_destination_requires_authoritative_geometry",
  "missing private geometry hold",
);
requireText("croskey_portion_included',false", "Croskey exclusion");
requireText("no_approved_continuation_beyond_endpoint',true", "endpoint clip");
requireText("no_public_road_continuation_to_croskey',true", "Croskey continuation prohibition");
requireText("route_geometry_created',false", "no manufactured lease geometry");
requireText("v_status->'route'->>'source' is distinct from 'legacy_written'", "held source proof");
requireText("v_status->'route'->>'state' is distinct from 'held'", "held state proof");
requireText("v_status->'route'->'steps' is distinct from '[]'::jsonb", "empty public steps proof");
requireText("v_status->'route'->'geometry' is distinct from 'null'::jsonb", "null geometry proof");
requireText("v_directory_coordinate_state is distinct from 'held'", "coordinate-role preservation");
requireText("graph_digest", "graph zero-delta proof");
requireText("non_target_pad_digest", "non-target pad zero-delta proof");
requireText("non_target_route_digest", "non-target route zero-delta proof");
requireText("non_target_occurrence_digest", "non-target occurrence zero-delta proof");
requireText("public_google_digest", "public Google zero-delta proof");
requireText("cutover_at", "cutover zero-delta proof");
requireText("v_old:=E'private_verification.brinesearch_issue97_identity_driver_name(", "newline-safe projection patch");

if (/pg_catalog\.(?:coalesce|nullif|greatest|least|extract|jsonb_object_length)\s*\(/i.test(sql)) {
  failures.push("PostgreSQL special syntax is incorrectly schema-qualified");
}
if (/\b(insert\s+into|update|delete\s+from)\s+public\.brinesearch_road_(?:graph|identity_mappings|junction)/i.test(sql)) {
  failures.push("migration must not mutate graph, mapping, or junction authority");
}
if (/\b(insert\s+into|update|delete\s+from)\s+public\.brinesearch_driver_google_routes_public/i.test(sql)) {
  failures.push("migration must not mutate public Google publication");
}
if (/\b(update|insert\s+into|delete\s+from)\s+public\.brinesearch_issue97_release_state/i.test(sql)) {
  failures.push("migration must not mutate cutover state");
}
if (/\b(?:st_closestpoint|st_shortestline|st_snap|similarity)\s*\(/i.test(sql)) {
  failures.push("migration must not infer the route from proximity or fuzzy geometry");
}
if (/route_geometry_created'\s*,\s*true/i.test(sql)) {
  failures.push("lease endpoint must not manufacture route geometry");
}
if (/highway\.source_identity_key/i.test(sql)) {
  failures.push("junction membership must not reference a nonexistent source_identity_key column");
}
if (/highway_anchor_status\s*=\s*'exact'/i.test(sql)) {
  failures.push("route prep must use the schema-valid explicit highway-anchor status");
}

if (failures.length) {
  console.error("UNA West Grove / lease-endpoint audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "UNA contract passed: exact US-250/West Grove occurrences, pad-bound held lease endpoint, Croskey excluded, and no graph/Google/cutover authority change.",
);
