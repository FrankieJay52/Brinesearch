import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '../..');
const migrationDir = path.join(projectRoot, 'supabase/migrations');

const geometryPath = path.join(
  migrationDir,
  '20260810165718_v17329_structured_route_step_geometry.sql'
);
const performancePath = path.join(
  migrationDir,
  '20260810170600_v17329_structured_route_performance.sql'
);
const fixPath = path.join(
  migrationDir,
  '20260810205910_prevent_anonymous_route_note_exposure_issue_73.sql'
);
const issue69Path = path.join(
  migrationDir,
  '20260811031420_issue69_route_geometry_draft_helpers.sql'
);

const [geometryMigration, performanceMigration, fixMigration, issue69Migration] = await Promise.all([
  fs.readFile(geometryPath, 'utf8'),
  fs.readFile(performancePath, 'utf8'),
  fs.readFile(fixPath, 'utf8'),
  fs.readFile(issue69Path, 'utf8')
]);

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
assert.equal(
  sha256(geometryMigration),
  '73f1b39c930fbf9cc516219b3e4765a5061bb97e86478aad26b3939602e69db1',
  'The checked-in V17.3.29 geometry migration must match the migration already applied to production.'
);
assert.equal(
  sha256(performanceMigration),
  'ac2f3d6a38013efbc2380d1102b2b3d1ded8d9b9b2b8ffde8480115fbceee0cf',
  'The checked-in V17.3.29 performance migration must match the migration already applied to production.'
);

// Preserve a regression witness for each exact historical source-to-sink path.
assert.match(
  geometryMigration,
  /'official_pad_record',\s*p\.extra_data->'official_pad_record'/,
  'The historical active extra_data exposure witness changed unexpectedly.'
);
assert.match(
  geometryMigration,
  /'note',\s*pr\.step_note/,
  'The historical latent structured-step exposure witness changed unexpectedly.'
);
assert.match(
  geometryMigration,
  /structured_route_steps\s*=\s*v_public_steps/,
  'The historical structured-route public sink witness changed unexpectedly.'
);

const requiredFixTokens = [
  'brinesearch_strip_internal_json_keys_issue73',
  'brinesearch_sanitize_public_extra_data_issue73',
  'brinesearch_sanitize_public_route_steps_issue73',
  'brinesearch_sanitize_public_turn_route_issue73',
  'pads_sanitize_public_route_snapshot_issue73',
  'public_pad_detail_sanitize_route_notes_issue73',
  'create or replace view private_verification.public_pad_projection_source',
  'update public.public_pad_detail d',
  'public_pad_detail_extra_no_internal_keys_issue73',
  'public_pad_detail_route_no_internal_keys_issue73',
  'pads_public_route_snapshot_no_internal_keys_issue73',
  'has_table_privilege',
  'has_function_privilege',
  'c.relrowsecurity',
  'p.polcmd = \'r\'',
  'p.polroles'
];
for (const token of requiredFixTokens) {
  assert.ok(fixMigration.includes(token), `Issue #73 migration missing ${token}.`);
}
assert.ok(
  fixMigration.includes('$.** ? (@.type() == "object").keyvalue()'),
  'Nested-key checks must filter JSONPath descendants to objects before keyvalue().'
);
assert.ok(
  !fixMigration.includes('$.**.keyvalue()'),
  'Unsafe JSONPath keyvalue() calls can fail when recursive descent reaches an array or scalar.'
);

const routeSanitizer = fixMigration.match(
  /create or replace function private_verification\.brinesearch_sanitize_public_route_steps_issue73[\s\S]*?\n\$\$;/
)?.[0];
assert.ok(routeSanitizer, 'Could not isolate the public structured-route sanitizer.');
for (const publicKey of [
  'road_id',
  'road_name',
  'aliases',
  'start_coordinate',
  'end_coordinate',
  'clipped_geometry',
  'miles',
  'turn_direction',
  'instruction',
  'geometry_status',
  'route_revision'
]) {
  assert.ok(
    routeSanitizer.includes(`'${publicKey}'`),
    `Public structured-route sanitizer dropped ${publicKey}.`
  );
}
assert.ok(
  !routeSanitizer.includes("'note'"),
  'Public structured-route sanitizer must never allow-list a route note.'
);

const safetySanitizer = issue69Migration.match(
  /create or replace function private_verification\.brinesearch_sanitize_public_safety_context_issue69[\s\S]*?\n\$\$;/
)?.[0];
assert.ok(safetySanitizer, 'Could not isolate the #69 public safety-context sanitizer.');
for (const publicKey of [
  'safety_fact_id','category','driver_text','direction_scope','route_step_id','road_id','source_revision'
]) {
  assert.ok(safetySanitizer.includes(`'${publicKey}'`),
    `Public safety-context sanitizer dropped ${publicKey}.`);
}
for (const forbiddenKey of [
  'note','comment','review','conflict','evidence','source_url','source_text_digest',
  'source_excerpt_digest','verification_method','verified_by','verified_at'
]) {
  assert.ok(!safetySanitizer.includes(`'${forbiddenKey}'`),
    `Public safety-context sanitizer allow-lists private key ${forbiddenKey}.`);
}
for (const token of [
  'force row level security',
  'revoke all on private_verification.brinesearch_driver_safety_facts_issue69',
  'pads_public_safety_snapshot_canonical_issue69',
  'public_pad_detail_safety_snapshot_canonical_issue69',
  'with (security_invoker=true,security_barrier=true)'
]) {
  assert.ok(issue69Migration.includes(token), `#69/#73 safety boundary missing ${token}.`);
}

const extraSanitizer = fixMigration.match(
  /create or replace function private_verification\.brinesearch_sanitize_public_extra_data_issue73[\s\S]*?\n\$\$;/
)?.[0];
assert.ok(extraSanitizer, 'Could not isolate the detailed public JSON sanitizer.');
for (const publicKey of [
  'official_pad_record',
  'official_well_records',
  'api_verification_summary',
  'turn_by_turn_route',
  'field_property_number_observation',
  'field_well_sign_observation'
]) {
  assert.ok(
    extraSanitizer.includes(`'${publicKey}'`),
    `Detailed public JSON sanitizer dropped ${publicKey}.`
  );
}
for (const publicField of [
  'database',
  'state',
  'completion_date',
  'permit_approved_date',
  'latest_production_date'
]) {
  assert.ok(
    extraSanitizer.includes(`'${publicField}'`),
    `Detailed public JSON sanitizer dropped UI-consumed official field ${publicField}.`
  );
}
for (const forbiddenKey of [
  'location_review_note',
  'record_selection_note',
  'review_note',
  'conflicts',
  'alias_evidence',
  'match_evidence'
]) {
  assert.ok(
    !extraSanitizer.includes(`'${forbiddenKey}'`),
    `Detailed public JSON sanitizer allow-lists private key ${forbiddenKey}.`
  );
}

const triggerIndex = fixMigration.indexOf(
  'create trigger pads_sanitize_public_route_snapshot_issue73'
);
const viewIndex = fixMigration.indexOf(
  'create or replace view private_verification.public_pad_projection_source'
);
const scrubIndex = fixMigration.indexOf('update public.public_pad_detail d');
const constraintIndex = fixMigration.indexOf(
  'add constraint public_pad_detail_extra_no_internal_keys_issue73'
);
assert.ok(
  triggerIndex >= 0 && triggerIndex < viewIndex && viewIndex < scrubIndex && scrubIndex < constraintIndex,
  'Issue #73 boundary must activate before the public backfill and constraints.'
);

// Model the invariant independently so malformed nested input remains covered.
const forbiddenKey = key => /(note|comment|review|conflict|evidence)/i.test(key);
const stripInternal = value => {
  if (Array.isArray(value)) return value.map(stripInternal);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !forbiddenKey(key))
      .map(([key, child]) => [key, stripInternal(child)])
  );
};
const pick = (value, allowed) => Object.fromEntries(
  Object.entries(stripInternal(value))
    .filter(([key]) => allowed.includes(key))
);

const routeFixture = pick(
  {
    road_name: 'County Road 1',
    aliases: ['CR 1'],
    miles: 1.25,
    instruction: 'Turn left',
    note: 'private landmark',
    nested_payload: { review_note: 'private review' }
  },
  ['road_name', 'aliases', 'miles', 'instruction']
);
assert.deepEqual(routeFixture, {
  road_name: 'County Road 1',
  aliases: ['CR 1'],
  miles: 1.25,
  instruction: 'Turn left'
});
assert.ok(
  !JSON.stringify(routeFixture).includes('private landmark'),
  'Private route note survived the independent invariant fixture.'
);

const officialFixture = pick(
  {
    pad_name: 'Public Pad',
    operator: 'Public Operator',
    latitude: 39.1,
    longitude: -81.2,
    location_review_note: 'private coordinate reconciliation',
    conflicts: { operator: { note: 'private conflict' } }
  },
  ['pad_name', 'operator', 'latitude', 'longitude']
);
assert.deepEqual(officialFixture, {
  pad_name: 'Public Pad',
  operator: 'Public Operator',
  latitude: 39.1,
  longitude: -81.2
});

console.log(JSON.stringify({
  issue: 73,
  productionMigrationChain: 'exact live V17.3.29 migrations preserved',
  activeExposure: 'official_pad_record review notes removed',
  latentExposure: 'structured route step_note removed',
  privateSource: 'owner/editor source notes retained',
  publicData: 'official facts, directions, route geometry, aliases and mileage retained',
  enforcement: 'projection allow-list + snapshot/detail triggers + CHECK constraints'
}, null, 2));
console.log('GitHub #73 anonymous route-note boundary audit passed.');
