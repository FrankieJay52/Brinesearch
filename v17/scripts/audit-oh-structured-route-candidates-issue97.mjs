import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812043600_issue97_oh_structured_route_candidate_cleanup.sql"), "utf8");

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
assert.ok(!migration.includes("similarity("),
  "Ohio structured candidate cleanup must not use fuzzy similarity");
assert.ok(!migration.includes("<->"),
  "Ohio structured candidate cleanup must not use nearest-geometry selection");
assert.ok(!migration.includes("strong_proof'',true"),
  "Ohio structured candidates must remain non-authoritative evidence");

console.log("Issue #97 Ohio structured maneuver + typed-route candidate audit passed.");
