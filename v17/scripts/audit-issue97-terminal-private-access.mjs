import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read(
  "supabase/migrations/20260817020000_issue97_terminal_private_access_path_isolation.sql",
);
const regression = read(
  "supabase/tests/issue97_terminal_private_access_path_isolation.sql",
);
const pkg = JSON.parse(read("package.json"));

const includesAll = (source, tokens, label) => {
  for (const token of tokens) {
    assert.ok(source.includes(token), `${label} missing: ${token}`);
  }
};

includesAll(migration, [
  "brinesearch_issue97_terminal_private_access_destination",
  "step.step_kind='private_segment'",
  "in ('pad','lease road')",
  "step.road_id is null",
  "brinesearch_issue97_explicit_occurrence_source_key",
  "later.step_order>step.step_order",
  "if not v_terminal_private_access then",
  "terminal_private_access_destination_requires_authoritative_geometry",
  "participates_in_authoritative_road_path'',false",
  "retained_route_evidence'',true",
  "pad_gps_selects_road_identity'',false",
  "requires_authoritative_private_or_access_geometry'',true",
  "v_path_occurrences:=v_occurrences-v_terminal_private_access",
  "brinesearch_issue97_ensure_graph_release_current_cache",
  "brinesearch_issue97_identities_connected",
  "terminal_private_access_destinations_excluded",
  "saved_sequence_has_no_exact_authoritative_graph_path",
  "authoritative_route_identity_path_ambiguous",
  "selection_uses_name_similarity',false",
  "selection_uses_nearest_road',false",
  "selection_uses_route_number_alone',false",
], "Issue #97 terminal private-access migration");

assert.equal((migration.match(/create or replace function private_verification\.brinesearch_issue97_terminal_private_access_destination/g) ?? []).length, 1,
  "Terminal classifier must have one definition");
assert.equal((migration.match(/create or replace function private_verification\.brinesearch_issue97_resolve_route_identity_path/g) ?? []).length, 1,
  "Terminal migration must replace the path solver once");
assert.ok(!migration.includes("'access road'"),
  "Generic Access Road must not be silently treated as Pad/Lease terminal evidence");
const migrationWithoutSelfAuditPatterns = migration.replace(/^.*v_(?:classifier|candidate|resolver) ~\*.*$/gm, "");
assert.ok(!/similarity\s*\(|<->/.test(migrationWithoutSelfAuditPatterns),
  "Terminal model must not introduce fuzzy or nearest-geometry resolution");
assert.ok(!migration.includes("selection_uses_nearest_road',true") &&
  !migration.includes("selection_uses_name_similarity',true") &&
  !migration.includes("selection_uses_route_number_alone',true"),
"Terminal solver must record every forbidden selection method as false");
assert.ok(!/pad\.(latitude|longitude)/.test(migration),
  "Terminal road-identity classification must not depend on pad GPS");
assert.match(migration,
  /revoke all on function private_verification\.brinesearch_issue97_terminal_private_access_destination\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Terminal classifier must remain private");
assert.match(migration,
  /revoke all on function private_verification\.brinesearch_issue97_refresh_occurrence_candidate\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Occurrence candidate resolver must remain private");
assert.match(migration,
  /revoke all on function private_verification\.brinesearch_issue97_resolve_route_identity_path\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Graph-path resolver must remain private");

includesAll(regression, [
  "\\set ON_ERROR_STOP on",
  "begin;",
  "statement_timeout='15min'",
  "lock_timeout='2min'",
  "brinesearch:issue97:ohio-state-release",
  "brinesearch:issue97:all-pad-routing-pipeline",
  "brinesearch:issue97:route-corpus",
  "brinesearch:issue97:saved-road-reconciliation",
  "brinesearch:issue97:mapping-refresh",
  "c41f5320-1273-470c-a316-28b42211d697",
  "9763dc5bb626da71881b7381ed28a436",
  "issue97-release-20260815-r2",
  "brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest",
  "ascent--sadler",
  "swn--holliday-unit",
  "Smith Lease Road",
  "eog--woodland",
  "ascent--coleman",
  "named_private_negative",
  "bound_private_negative",
  "gps_identity_selection",
  "genuine_public_ambiguity_preserved",
  "public.brinesearch_issue97_reconcile_route_corpus(fixture.pad_id)",
  "public.brinesearch_driver_google_routes_public",
  "public.brinesearch_issue97_cutover_active()",
  "rollback;",
], "Issue #97 terminal private-access executable regression");

assert.equal((regression.match(/^begin;$/gm) ?? []).length, 1,
  "Terminal regression must have exactly one outer transaction");
assert.equal((regression.match(/^rollback;$/gm) ?? []).length, 1,
  "Terminal regression must end in exactly one outer rollback");
assert.equal((regression.match(/^commit;$/gm) ?? []).length, 0,
  "Terminal regression must never commit");
assert.ok(!regression.includes("run_all_pad_routing_pipeline"),
  "Terminal regression must not run the full pad pipeline");
assert.ok(!regression.includes("refresh_google_route_transition_dark"),
  "Terminal regression must not generate private Google manifests");
assert.ok(!regression.includes("refresh_google_route_transition("),
  "Terminal regression must not invoke public projection");
assert.ok(!/similarity\s*\(|<->/.test(regression),
  "Terminal regression must not use fuzzy or nearest-geometry resolution");

assert.ok(pkg.scripts["verify:route-corpus-reconciliation"].includes(
  "audit-issue97-terminal-private-access.mjs",
), "Terminal audit is not wired into the route-corpus verification lane");
assert.ok(pkg.scripts.build.includes("npm run verify:route-corpus-reconciliation"),
  "Terminal audit must run in the full build");

console.log("Issue #97 terminal Pad/Lease destination isolation audit passed.");
