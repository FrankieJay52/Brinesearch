import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migration = await readFile(path.join(root, "supabase/migrations/20260825225341_v18_cologie_verified_mobile_google_handoff.sql"), "utf8");
const performanceMigration = await readFile(path.join(root, "supabase/migrations/20260825234943_v18_cologie_atomic_google_handoff_performance.sql"), "utf8");
const googleRoute = await readFile(path.join(root, "v18/src/data/googleRoute.ts"), "utf8");
const status = await readFile(path.join(root, "v18/src/data/status.ts"), "utf8");

for (const fragment of [
  "private_verification.brinesearch_v18_google_handoff_receipts",
  "public.brinesearch_driver_google_handoffs_public",
  "private_verification.brinesearch_v18_google_handoff_receipt_current",
  "public.brinesearch_v18_google_handoff_current",
  "public.brinesearch_v18_driver_pad_status_with_google_handoff",
  "enable row level security",
  "force row level security",
  "to anon,authenticated",
  "using(public.brinesearch_v18_google_handoff_current(pad_id))",
  "08ec28f968ef6425f10a8170ec9fa36c",
  "dba36e417e59b1746c2e3f09ae6d6980",
  "v18-google-mobile-v1",
  "current_location_until_route_ingress",
  "'sequence',1",
  "'sequence',13",
  "'sequence',15",
  "'sequence',16",
  "read_only_google_maps_directions_details",
]) assert.ok(migration.includes(fragment), `Mobile handoff migration is missing ${fragment}`);

for (const table of [
  "public.pads",
  "public.brinesearch_route_prep",
  "public.brinesearch_driver_google_routes_public",
]) {
  const escaped = table.replaceAll(".", "\\.");
  assert.doesNotMatch(
    migration,
    new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+${escaped}`, "i"),
    `Mobile handoff migration must not mutate ${table}`,
  );
}
assert.doesNotMatch(migration, /brinesearch_issue97_set_cutover|cutover[^;]*:=\s*true/i, "Mobile handoff migration must not enable cutover");
assert.match(migration, /mobile_waypoint_limit',3/, "Mobile handoff must stay within Google's three-waypoint mobile limit");
assert.match(migration, /v_release\.handoff_digest\s+is distinct from\s+pg_catalog\.md5\(v_release\.handoff::text\)/i, "Private handoff must verify its package digest with null-safe equality");
assert.match(migration, /v_route\.manifest\s+is distinct from\s+v_source\.manifest/i, "Handoff currentness must retain full private/public manifest identity");
assert.match(migration, /v_release\.handoff\s+\?&\s+v_handoff_keys/, "Private handoff must require every expected package key");
assert.match(migration, /v_release\.evidence\s+\?&\s+v_evidence_keys/, "Private handoff must require every expected evidence key");
assert.match(migration, /security invoker[\s\S]*?publicGoogleRoute[\s\S]*?publicGoogleHandoff/i, "The V18 client envelope must read status and public handoff data in one invoker snapshot");
assert.match(migration, /\(v_bundle->'status'\)\s*-\s*array\['checkedAt','statusRevision'\]::text\[\]/, "Atomic envelope verification must parenthesize JSON extraction before key subtraction");

const correctedWrapper = performanceMigration.match(
  /create or replace function\s+public\.brinesearch_v18_driver_pad_status_with_google_handoff[\s\S]*?\$function\$;/i,
)?.[0] ?? "";
assert.ok(correctedWrapper, "Performance migration must replace the atomic handoff wrapper");
assert.match(correctedWrapper, /stable\s+security definer/i, "Corrected wrapper must bypass duplicate FORCE-RLS evaluation as a stable definer");
assert.match(correctedWrapper, /set search_path=''[\s\S]*?set statement_timeout='20s'[\s\S]*?set lock_timeout='500ms'/i, "Corrected wrapper must retain a fixed search path and bounded execution settings");
assert.match(correctedWrapper, /public\.brinesearch_issue97_google_route_current\(route\.pad_id\)/i, "Corrected wrapper must retain the exact public Google route currentness predicate");
assert.match(correctedWrapper, /public\.brinesearch_v18_google_handoff_current\(handoff\.pad_id\)/i, "Corrected wrapper must retain the reviewed handoff currentness predicate");
assert.doesNotMatch(correctedWrapper, /private_verification\.|execute\s+/i, "Corrected public wrapper must not read private objects or execute dynamic SQL");
assert.match(performanceMigration, /from public,anon,authenticated,service_role;[\s\S]*?to anon,authenticated,service_role;/i, "Corrected wrapper must keep its exact execute grants");
assert.match(performanceMigration, /owner\.rolbypassrls/i, "Performance proof must require a trusted BYPASSRLS owner");
assert.match(performanceMigration, /v_held_bundle[\s\S]*?publicGoogleRoute[\s\S]*?publicGoogleHandoff/i, "Performance migration must prove held pads remain fail-closed");
assert.match(performanceMigration, /pg_stat_xact_user_tables[\s\S]*?performed production user-table DML/i, "Performance migration must prove it performs no production authority DML");

assert.match(googleRoute, /validateVerifiedCompactHandoff/, "V18 must validate the separate compact handoff");
assert.match(googleRoute, /waypoint is not copied from the exact manifest/, "V18 must bind every compact waypoint to the exact manifest");
assert.match(googleRoute, /Google handoff must begin at the exact route ingress/, "V18 must start the handoff at the exact route ingress");
assert.match(googleRoute, /destination is not the exact saved pad destination/, "V18 must retain the exact saved destination");
assert.doesNotMatch(googleRoute, /origin["']?\s*,/, "V18 must leave the Google origin to the driver's current location");
assert.match(status, /brinesearch_v18_driver_pad_status_with_google_handoff/, "V18 must use the one-snapshot public status/handoff envelope");

console.log("V18 Cologie reviewed mobile Google handoff audit passed.");
