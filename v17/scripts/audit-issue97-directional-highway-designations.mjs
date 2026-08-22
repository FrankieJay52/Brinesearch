import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const migration = read(
  "supabase/migrations/20260817030000_issue97_exact_directional_highway_designation_candidates.sql",
);
const regression = read(
  "supabase/tests/issue97_exact_directional_highway_designation_candidates.sql",
);
const pkg = JSON.parse(read("package.json"));

for (const token of [
  "72c16f75efdb356dc2b6d15c691e944c",
  "exact directional highway system/class/number candidate",
  "travel direction is retained evidence; graph topology remains required",
  "^(i|ir|us|oh|sr)[[:space:]]+0*([0-9]+)([nsew])$",
  "i.road_class=v_step.step_kind",
  "i.route_system=case",
  "brinesearch_issue97_dataset_scope_current_cached",
  "exact_authoritative_designation_candidate",
]) assert.ok(migration.includes(token), `Directional migration missing ${token}`);

const implementation = migration.split(
  "do $issue97_directional_designation_postflight$",
)[0];
assert.ok(!/pad\.(latitude|longitude)|similarity\s*\(|<->|st_dwithin|st_distance/i.test(implementation),
  "Directional candidates must not use GPS, fuzzy names, or nearest geometry");
assert.ok(!migration.includes("strong_proof,true"),
  "Directional designation must remain candidate-only evidence");
assert.match(migration,
  /revoke all on function private_verification\.brinesearch_issue97_refresh_occurrence_candidate\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Directional candidate function must remain private");

for (const token of [
  "\\set ON_ERROR_STOP on",
  "begin;",
  "statement_timeout='15min'",
  "lock_timeout='2min'",
  "e3527d5eef906ec822400212ad98e79f",
  "6709f40e85e47d5683774f3a4316beb8",
  "ascent--cesario",
  "gulfport--duvall",
  "gulfport--schumacher",
  "eog--peckens",
  "OH-1",
  "US-800",
  "I-79",
  "SR-22",
  "brinesearch_issue97_resolve_route_identity_path",
  "brinesearch_issue97_refresh_route_receipt",
  "public.brinesearch_driver_google_routes_public",
  "public.brinesearch_issue97_cutover_active()",
  "rollback;",
]) assert.ok(regression.includes(token), `Directional regression missing ${token}`);

assert.equal((regression.match(/^begin;$/gm) ?? []).length, 1,
  "Directional regression must have one outer transaction");
assert.equal((regression.match(/^rollback;$/gm) ?? []).length, 1,
  "Directional regression must have one outer rollback");
assert.equal((regression.match(/^commit;$/gm) ?? []).length, 0,
  "Directional regression must never commit");
assert.ok(!regression.includes("run_all_pad_routing_pipeline"),
  "Directional regression must not run the 940-pad pipeline");
assert.ok(!regression.includes("refresh_google_route_transition"),
  "Directional regression must not generate or project Google routes");

assert.ok(pkg.scripts["verify:route-corpus-reconciliation"].includes(
  "audit-issue97-directional-highway-designations.mjs",
), "Directional audit must be wired into route-corpus verification");

console.log("Issue #97 exact directional highway designation audit passed.");
