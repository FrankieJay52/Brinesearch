import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812043400_issue97_supplemental_source_occurrence_keys.sql"), "utf8");

for (const token of [
  "supplemental source occurrence identity",
  "create or replace function private_verification.brinesearch_issue97_supplemental_occurrence_feature_key(",
  "':SCOPE:'||v_state||':'||v_county||':RECORD:'||v_record",
  "NGUID:RCL11946@fcema.org",
  "RECORD:11802",
  "RECORD:14051",
  "supplemental held occurrence-key patch expected 1 target",
  "supplemental centerline occurrence-key patch expected 1 target",
  "v_calls<>2",
  "source_native_feature_key"
]) {
  assert.ok(migration.includes(token), `Issue #97 supplemental occurrence-key hardening missing: ${token}`);
}

assert.match(migration,
  /v_11802:=private_verification\.brinesearch_issue97_supplemental_occurrence_feature_key[\s\S]*'11802'[\s\S]*v_14051:=private_verification\.brinesearch_issue97_supplemental_occurrence_feature_key[\s\S]*'14051'[\s\S]*v_11802=v_14051/,
  "The Fayette repeated-NGUID regression must prove distinct official source records remain distinct occurrences");
assert.match(migration,
  /v_hold_feature_key:=private_verification\.brinesearch_issue97_supplemental_occurrence_feature_key[\s\S]*v_hold_record_id/,
  "Supplemental source holds must use the same exact source-record occurrence identity");
assert.match(migration,
  /v_feature_key:=private_verification\.brinesearch_issue97_supplemental_occurrence_feature_key[\s\S]*v_record_id/,
  "Valid supplemental centerlines must use exact source-record occurrence identity");
assert.ok(!migration.includes("nearest" + "_road_used'',true"),
  "Occurrence identity must never authorize nearest-road matching");
assert.ok(!migration.includes("st_node("),
  "Occurrence identity must not node source geometry");
assert.ok(!migration.includes("st_makevalid("),
  "Occurrence identity must not rewrite source geometry");

console.log("Issue #97 supplemental native provenance + exact source-record occurrence identity audit passed.");
