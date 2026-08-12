import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812043600_issue97_oh_structured_route_candidate_cleanup.sql"), "utf8");
const adoption = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812043800_issue97_oh_route_used_canonical_adoption.sql"), "utf8");
const graphRefresh = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812043900_issue97_oh_exact_mapping_refresh_for_graphs.sql"), "utf8");

for (const token of [
  "This migration adds candidate evidence only. Neither lane is strong proof.",
  "Generic/untyped Route <number> steps remain held.",
  "structured maneuver prefix removed before exact authoritative equality",
  "saved typed route family + exact route number",
  "exact_authoritative_name_candidate'',false",
  "exact_authoritative_designation_candidate'',false",
  "v_step.step_kind in (''local_road'',''county_road'',''township_road'')",
  "v_step.step_kind in (''interstate'',''us_route'',''state_route'')",
  "r.road_type=v_step.step_kind",
  "i.road_class=v_step.step_kind",
  "candidate evidence only; graph path still required",
  "$issue97_verify_oh_structured_candidate_cleanup$",
  "Issue #97 Ohio structured candidate cleanup did not install cleanly"
]) {
  assert.ok(migration.includes(token), `Issue #97 Ohio structured route candidate contract missing: ${token}`);
}
assert.ok(!migration.includes("alter table private_verification.brinesearch_route_occurrence_candidates_issue97"),
  "Ohio structured candidate cleanup must not widen the existing candidate basis schema");
const similaritySentinels = migration.match(/similarity\(/g) ?? [];
assert.equal(similaritySentinels.length, 1,
  "Ohio structured candidate migration may mention similarity() only in its runtime rejection sentinel");
assert.ok(migration.includes("v_definition like '%similarity(%'"),
  "Ohio structured candidate migration must reject any composed runtime using fuzzy similarity");
const nearestGeomSentinels = migration.match(/<->/g) ?? [];
assert.equal(nearestGeomSentinels.length, 1,
  "Ohio structured candidate migration may mention <-> only in its runtime rejection sentinel");
assert.ok(migration.includes("v_definition like '%<->%'"),
  "Ohio structured candidate migration must reject any composed runtime using nearest geometry");
const nearestRoadSentinels = migration.match(/nearest_road_used'',true/g) ?? [];
assert.equal(nearestRoadSentinels.length, 1,
  "Ohio structured candidate migration may mention nearest-road=true only in its runtime rejection sentinel");
assert.ok(!migration.includes("strong_proof'',true"),
  "Ohio structured candidates must remain non-authoritative evidence");

for (const token of [
  "Scope is intentionally limited to Ohio",
  "i.state_code='OH' and i.active",
  "private_verification.brinesearch_issue97_dataset_scope_current(",
  "issue97_oh_exact_route_family",
  "issue97_oh_exact_source_identity",
  "exact_route_designation",
  "exact_source_record_id",
  "OH:ODOT:NLF:CMOECR00061**C",
  "OH:ODOT:NLF:THASTR00207**C",
  "canonical-road:'||v_local.source_identity_key",
  "convergent/idempotent",
  "mapping-refresh",
  "name_matching_used',false",
  "fuzzy_matching_used',false",
  "nearest_road_used',false",
  "migration','issue97_oh_route_used_canonical_adoption'",
  "$issue97_verify_oh_route_used_canonical_adoption$"
]) {
  assert.ok(adoption.includes(token), `Issue #97 Ohio canonical adoption missing: ${token}`);
}
for (const family of [
  "('us_route'::text,'22'::text",
  "('state_route','43','OH'",
  "('state_route','145','OH'",
  "('state_route','151','OH'",
  "('state_route','164','OH'"
]) {
  assert.ok(adoption.includes(family), `Issue #97 Ohio family adoption missing ${family}`);
}
assert.match(adoption,
  /select count\(\*\)::integer,min\(r\.id::text\)::uuid[\s\S]*if v_row_count<>1[\s\S]*expected one % % Road Manager family row/,
  "Each Ohio highway family adoption must require one existing semantic placeholder");
assert.match(adoption,
  /i\.state_code='OH' and i\.active[\s\S]*i\.road_class=v_family\.road_class[\s\S]*i\.route_number=v_family\.route_number[\s\S]*i\.public_access_status='public'[\s\S]*i\.drivable_status='drivable'/,
  "Ohio family mappings must come from exact active public/drivable Ohio identities only");
assert.match(adoption,
  /m\.mapping_status='verified'[\s\S]*m\.road_id<>v_road_id[\s\S]*conflicting verified mappings/,
  "Ohio family adoption must fail closed on conflicting verified canonical mappings");
assert.match(adoption,
  /v_road_id:=private_verification\.brinesearch_issue97_uuid\([\s\S]*canonical-road:'\|\|v_local\.source_identity_key[\s\S]*m\.identity_id=v_identity\.id and m\.mapping_status='verified'[\s\S]*m\.road_id<>v_road_id/,
  "Ohio local adoption must converge on one deterministic road ID and reject only different verified mappings");
assert.match(adoption,
  /r\.route_number=v_local\.route_number[\s\S]*r\.id<>v_road_id[\s\S]*conflicting semantic Road Manager row/,
  "Ohio local adoption must reject a second semantic county/township road without rejecting its own deterministic rerun row");
const localRoadUpserts = adoption.match(/on conflict\(id\) do update set/g) ?? [];
assert.equal(localRoadUpserts.length, 1,
  "Ohio local canonical adoption must upsert exactly one deterministic Road Manager row path for idempotence");
const mappingUpserts = adoption.match(/on conflict\(identity_id,road_id\) do update set/g) ?? [];
assert.equal(mappingUpserts.length, 2,
  "Ohio family and local exact mappings must both converge idempotently");
assert.ok(!adoption.includes("public.brinesearch_issue97_refresh_exact_mappings()"),
  "Ohio-only adoption must not invoke the global exact-mapping refresher");
assert.ok(!adoption.includes("similarity("),
  "Ohio canonical adoption must not use fuzzy similarity");
assert.ok(!adoption.includes("<->"),
  "Ohio canonical adoption must not use nearest geometry");
assert.ok(!adoption.includes("mapping_method='name_only'"),
  "Ohio canonical adoption must not create name-only mappings");

for (const token of [
  "private_verification.brinesearch_issue97_refresh_exact_mappings_oh()",
  "i.state_code='OH'",
  "refresh_scope','OH'",
  "m.mapping_method in ('exact_source_record_id','exact_route_designation')",
  "reviewed/manual mappings are never displaced",
  "perform private_verification.brinesearch_issue97_refresh_exact_mappings_oh();",
  "else",
  "perform public.brinesearch_issue97_refresh_exact_mappings();",
  "$issue97_verify_oh_graph_mapping_refresh$"
]) {
  assert.ok(graphRefresh.includes(token), `Issue #97 Ohio graph mapping refresh missing: ${token}`);
}
assert.match(graphRefresh,
  /update public\.brinesearch_road_identity_mappings m set[\s\S]*exists\([\s\S]*i\.id=m\.identity_id and i\.state_code='OH'/,
  "Ohio exact refresh may retire machine-owned mappings only for Ohio identities");
assert.match(graphRefresh,
  /where i\.active and i\.state_code='OH'[\s\S]*road_class in \('interstate','us_route','state_route','county','township'\)/,
  "Ohio exact designation candidates must be sourced only from active Ohio identities");
assert.match(graphRefresh,
  /if v_state=''OH'' then[\s\S]*refresh_oh_identities\(v_county\)[\s\S]*refresh_exact_mappings_oh\(\)[\s\S]*else[\s\S]*refresh_exact_mappings\(\)/,
  "Only Ohio graph rebuilds may use the Ohio-scoped exact mapping refresh");
assert.ok(!graphRefresh.includes("similarity("),
  "Ohio exact mapping refresh must not use fuzzy similarity");
assert.ok(!graphRefresh.includes("<->"),
  "Ohio exact mapping refresh must not use nearest geometry");

console.log("Issue #97 Ohio structured candidates + canonical adoption + Ohio-only graph mapping refresh audit passed.");
