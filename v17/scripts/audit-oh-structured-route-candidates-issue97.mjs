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
const us40 = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812044000_issue97_oh_us40_canonical_adoption.sql"), "utf8");
const countyRefresh = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812044100_issue97_oh_county_scoped_mapping_refresh.sql"), "utf8");
const stableRefresh = fs.readFileSync(path.join(root,
  "supabase/migrations/20260813101140_issue97_oh_exact_adoption_refresh_stability.sql"), "utf8");

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
  "mapping-refresh",
  "pg_advisory_xact_lock",
  "perform private_verification.brinesearch_issue97_refresh_exact_mappings_oh();",
  "else",
  "perform public.brinesearch_issue97_refresh_exact_mappings();",
  "convergent",
  "$issue97_verify_oh_graph_mapping_refresh$"
]) {
  assert.ok(graphRefresh.includes(token), `Issue #97 Ohio graph mapping refresh missing: ${token}`);
}
assert.match(graphRefresh,
  /begin[\s\S]*pg_advisory_xact_lock\([\s\S]*brinesearch:issue97:mapping-refresh/,
  "Ohio exact refresh must serialize on the permanent issue #97 mapping-refresh advisory lock");
assert.match(graphRefresh,
  /update public\.brinesearch_road_identity_mappings m set[\s\S]*exists\([\s\S]*i\.id=m\.identity_id and i\.state_code='OH'/,
  "Ohio exact refresh may retire machine-owned mappings only for Ohio identities");
assert.match(graphRefresh,
  /where i\.active and i\.state_code='OH'[\s\S]*road_class in \('interstate','us_route','state_route','county','township'\)/,
  "Ohio exact designation candidates must be sourced only from active Ohio identities");
assert.match(graphRefresh,
  /if v_state=''OH'' then[\s\S]*refresh_oh_identities\(v_county\)[\s\S]*refresh_exact_mappings_oh\(\)[\s\S]*else[\s\S]*refresh_exact_mappings\(\)/,
  "The first OH-only migration must preserve the original global non-Ohio branch");
assert.ok(!graphRefresh.includes("similarity("),
  "Ohio exact mapping refresh must not use fuzzy similarity");
assert.ok(!graphRefresh.includes("<->"),
  "Ohio exact mapping refresh must not use nearest geometry");

for (const token of [
  "Ohio-only exact US-40 canonical adoption",
  "i.state_code='OH' and i.active",
  "i.road_class='us_route' and i.route_number='40'",
  "issue97_oh_exact_route_family",
  "exact_route_designation",
  "migration','issue97_oh_us40_canonical_adoption'",
  "name_matching_used',false",
  "fuzzy_matching_used',false",
  "nearest_road_used',false",
  "$issue97_verify_oh_us40_canonical_adoption$"
]) {
  assert.ok(us40.includes(token), `Issue #97 Ohio US-40 adoption missing: ${token}`);
}
assert.match(us40,
  /select count\(\*\)::integer,min\(r\.id::text\)::uuid[\s\S]*road_type='us_route' and r\.route_number='40' and r\.state is null[\s\S]*v_row_count<>1/,
  "Ohio US-40 adoption must upgrade exactly one existing family row");
assert.match(us40,
  /v_mapped<>9/,
  "Ohio US-40 installation proof must require all nine current Ohio source identities to map");
assert.ok(!us40.includes("similarity("),
  "Ohio US-40 adoption must not use fuzzy similarity");
assert.ok(!us40.includes("<->"),
  "Ohio US-40 adoption must not use nearest geometry");
assert.ok(!us40.includes("public.brinesearch_issue97_refresh_exact_mappings()"),
  "Ohio US-40 adoption must not invoke the global mapping refresher");

for (const token of [
  "make Ohio graph mapping refresh county-scoped",
  "brinesearch_issue97_refresh_exact_mappings_oh(\n  p_county_code text",
  "i.state_code='OH' and i.county_code=v_county",
  "refresh_scope','OH:'||v_county",
  "nlf_base_counts",
  "perform private_verification.brinesearch_issue97_refresh_exact_mappings_oh(v_county);",
  "v_definition like '%perform private_verification.brinesearch_issue97_refresh_exact_mappings_oh(v_county);%'",
  "$issue97_verify_oh_county_mapping_refresh$"
]) {
  assert.ok(countyRefresh.includes(token), `Issue #97 Ohio county mapping refresh missing: ${token}`);
}
assert.match(countyRefresh,
  /update public\.brinesearch_road_identity_mappings m set[\s\S]*i\.state_code='OH' and i\.county_code=v_county/,
  "County-scoped Ohio refresh may retire exact mappings only for the target Ohio county");
assert.match(countyRefresh,
  /scope_identities as \([\s\S]*i\.active and i\.state_code='OH' and i\.county_code=v_county/,
  "County-scoped Ohio candidates must originate only from target-county identities");
assert.match(countyRefresh,
  /v_old text:='perform private_verification\.brinesearch_issue97_refresh_exact_mappings_oh\(\);'[\s\S]*v_new text:='perform private_verification\.brinesearch_issue97_refresh_exact_mappings_oh\(v_county\);'/,
  "Ohio graph builder must switch from broad OH refresh to target-county refresh");
assert.ok(!countyRefresh.includes("similarity("),
  "County-scoped Ohio refresh must not use fuzzy similarity");
assert.ok(!countyRefresh.includes("<->"),
  "County-scoped Ohio refresh must not use nearest geometry");

for (const token of [
  "tmp_issue97_oh_prior_exact_mappings",
  "drop table if exists pg_temp.tmp_issue97_oh_prior_exact_mappings",
  "retained_adoption_candidates",
  "prior.mapping_status=''verified''",
  "prior.mapping_method=''exact_route_designation''",
  "i.public_access_status=''public'' and i.drivable_status=''drivable''",
  "brinesearch_issue97_dataset_scope_current(",
  "r.verification_status=''verified'' and not r.candidate_only",
  "issue97_oh_route_used_canonical_adoption",
  "issue97_oh_us40_canonical_adoption",
  "issue97_oh_sr331_canonical_adoption",
  "prior.evidence->>''source_identity_key''=i.source_identity_key",
  "prior.evidence->>''source_digest''=i.source_digest",
  "prior.evidence->>''source_current''=''true''",
  "prior.evidence->>''exact_designation''=''true''",
  "prior.evidence->>''name_matching_used''=''false''",
  "prior.evidence->>''fuzzy_matching_used''=''false''",
  "prior.evidence->>''nearest_road_used''=''false''",
  "not (prior.evidence ? ''retired_by_refresh'')",
  "prior.evidence->>''uses_name_only''",
  "prior.evidence->>''uses_fuzzy_name''",
  "prior.evidence->>''uses_nearest_road''",
  "(i.road_class,i.route_number) in (",
  "select retained.identity_id,retained.road_id,retained.priority",
  "from retained_adoption_candidates retained",
  "case when e.priority=-1 and e.candidate_count=1 then e.evidence",
]) {
  assert.ok(stableRefresh.includes(token), `Issue #97 stable Ohio adoption refresh missing: ${token}`);
}
assert.equal((stableRefresh.match(/similarity\(/g) || []).length, 1,
  "Stable Ohio adoption refresh may mention fuzzy similarity only in its rejection sentinel");
assert.equal((stableRefresh.match(/<->/g) || []).length, 1,
  "Stable Ohio adoption refresh may mention nearest geometry only in its rejection sentinel");
assert.ok(stableRefresh.includes("v_normalized like '%similarity(%'"),
  "Stable Ohio adoption refresh must reject fuzzy similarity in the installed function");
assert.ok(stableRefresh.includes("v_normalized like '%<->%'"),
  "Stable Ohio adoption refresh must reject nearest geometry in the installed function");
assert.ok(!stableRefresh.includes("brinesearch_issue97_activate_graph_build"),
  "Stable Ohio adoption refresh must not activate a graph");
assert.ok(!stableRefresh.includes("brinesearch_issue97_activate_cutover"),
  "Stable Ohio adoption refresh must not activate cutover");

console.log("Issue #97 Ohio candidates + canonical adoption + scoped graph refresh + US-40 audit passed.");
