import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812043800_issue97_oh_route_used_canonical_adoption.sql"), "utf8");

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
  "CMOECR00061**C",
  "THASTR00207**C",
  "canonical-road:'||v_local.source_identity_key",
  "identity-mapping:'||i.id::text||':'||v_road_id::text",
  "mapping-refresh",
  "name_matching_used',false",
  "fuzzy_matching_used',false",
  "nearest_road_used',false",
  "migration','issue97_oh_route_used_canonical_adoption'",
  "$issue97_verify_oh_route_used_canonical_adoption$"
]) {
  assert.ok(sql.includes(token), `Issue #97 Ohio canonical adoption missing: ${token}`);
}

for (const family of [
  "('us_route'::text,'22'::text",
  "('state_route','43','OH'",
  "('state_route','145','OH'",
  "('state_route','151','OH'",
  "('state_route','164','OH'"
]) {
  assert.ok(sql.includes(family), `Issue #97 Ohio family adoption missing ${family}`);
}

assert.match(sql,
  /select count\(\*\)::integer,min\(r\.id\)[\s\S]*if v_row_count<>1[\s\S]*expected one % % Road Manager family row/,
  "Each Ohio highway family adoption must require one existing semantic placeholder");
assert.match(sql,
  /i\.state_code='OH' and i\.active[\s\S]*i\.road_class=v_family\.road_class[\s\S]*i\.route_number=v_family\.route_number[\s\S]*i\.public_access_status='public'[\s\S]*i\.drivable_status='drivable'/,
  "Ohio family mappings must be selected from exact active public/drivable Ohio identities only");
assert.match(sql,
  /m\.mapping_status='verified'[\s\S]*m\.road_id<>v_road_id[\s\S]*raise exception 'Issue #97 Ohio canonical adoption found % conflicting verified mappings/,
  "Ohio family adoption must fail closed on conflicting verified canonical mappings");
assert.match(sql,
  /v_identity\.source_identity_key[\s\S]*exact_source_record_id[\s\S]*v_source_record_id/,
  "Jurisdiction-scoped Ohio roads must map by exact source record identity");
assert.ok(!sql.includes("public.brinesearch_issue97_refresh_exact_mappings()"),
  "Ohio-only adoption must not invoke the global exact-mapping refresher");
assert.ok(!sql.includes("similarity("),
  "Ohio canonical adoption must not use fuzzy similarity");
assert.ok(!sql.includes("<->"),
  "Ohio canonical adoption must not use nearest geometry");
assert.ok(!sql.includes("mapping_method='name_only'"),
  "Ohio canonical adoption must not create name-only mappings");
assert.ok(!/state_code\s*(?:<>|!=)\s*'OH'[^\n]*insert/i.test(sql),
  "Ohio canonical adoption must not write non-Ohio identities");

console.log("Issue #97 Ohio-only route-used canonical adoption audit passed.");
