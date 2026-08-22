import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812037100_issue97_saved_turn_geometry_ambiguity.sql"), "utf8");

for (const token of [
  "saved turn fallback only for an exact-but-ambiguous geometry angle",
  "v_turn_json->>'reason'='turn_angle_ambiguous' and v_saved_turn is not null",
  "saved_direction_exact_geometry_angle_ambiguous",
  "geometry_turn_conflicts_saved_direction",
  "geometry_'||coalesce(v_turn_json->>'reason','turn_unresolved')",
  "missing geometry never falls back to text"
]) assert.ok(sql.includes(token), `Issue #97 saved-turn ambiguity safety missing: ${token}`);

assert.match(sql,
  /if not coalesce\(\(v_turn_json->>'resolved'\)::boolean,false\) then[\s\S]*v_turn_json->>'reason'='turn_angle_ambiguous' and v_saved_turn is not null[\s\S]*v_turn:=v_saved_turn[\s\S]*else[\s\S]*v_hold:='geometry_'/,
  "Saved turns may resolve only the explicit turn-angle ambiguity branch; other geometry failures must remain held");
assert.match(sql,
  /else[\s\S]*v_turn:=v_turn_json->>'turn'[\s\S]*v_turn_source:='exact_adjacent_step_geometry'[\s\S]*v_saved_turn is not null and v_saved_turn<>v_turn[\s\S]*geometry_turn_conflicts_saved_direction/,
  "A clear geometry-derived turn must remain authoritative and saved conflicts must still fail closed");
assert.ok(!/missing_adjacent_traveled_geometry[^\n]*v_saved_turn|meaningful_turn_segment_unavailable[^\n]*v_saved_turn/.test(sql),
  "Missing or insufficient geometry must never use the saved-turn ambiguity fallback");

console.log("Issue #97 exact-geometry ambiguous-angle saved-turn fallback regression passed.");
