import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '../..');
const migrationDir = path.join(projectRoot, 'supabase/migrations');
const partsDir = path.join(projectRoot, 'v17/src/parts');

const stage1Path = path.join(migrationDir, '20260810213933_editor_revision_boundary_issue_74.sql');
const stage1FixPath = path.join(migrationDir, '20260810214239_editor_revision_boundary_issue_74_runtime_fix.sql');
const stage2Path = path.join(migrationDir, '20260810215305_editor_revision_lockdown_issue_74.sql');
const bridgePath = path.join(partsDir, '11aa-editor-revision-security-issue74.js');
const orderPath = path.join(partsDir, 'part-order.json');
const packagePath = path.join(projectRoot, 'package.json');
const legacyEditorPath = path.join(partsDir, '11-pad-page.js');
const issue69Path = path.join(migrationDir, '20260811002000_issue69_route_geometry_draft_helpers.sql');

const [stage1, stage1Fix, stage2, bridge, orderRaw, packageRaw, legacyEditor, issue69Migration] = await Promise.all([
  fs.readFile(stage1Path, 'utf8'),
  fs.readFile(stage1FixPath, 'utf8'),
  fs.readFile(stage2Path, 'utf8'),
  fs.readFile(bridgePath, 'utf8'),
  fs.readFile(orderPath, 'utf8'),
  fs.readFile(packagePath, 'utf8'),
  fs.readFile(legacyEditorPath, 'utf8'),
  fs.readFile(issue69Path, 'utf8')
]);
const order = JSON.parse(orderRaw);
const pkg = JSON.parse(packageRaw);

// Preserve the exact production migration chain. Stage 1 exposed a runtime-only
// NULLIF qualification mistake during rollback testing; the immediately
// following production migration replaces the function before client rollout.
assert.ok(stage1.includes('pg_catalog.nullif'), 'Historical stage-1 runtime witness changed unexpectedly.');
assert.ok(!stage1Fix.includes('pg_catalog.nullif'), 'The production runtime correction must not schema-qualify NULLIF.');

for (const token of [
  'create or replace function public.editor_update_pad',
  'p_expected_updated_at timestamptz',
  'p_patch jsonb',
  'public.is_brinesearch_editor(v_user)',
  'for update',
  'stale_revision',
  "errcode = '40001'",
  'invalid_editor_patch_fields',
  'invalid_well_entry_fields',
  'coordinate_pair_required',
  'return pg_catalog.to_jsonb(v_row)',
  'grant execute on function public.editor_update_pad'
]) {
  assert.ok(stage1Fix.toLowerCase().includes(token.toLowerCase()), `Issue #74 corrected RPC missing ${token}.`);
}

const allowedBlock = stage1Fix.match(/v_allowed_keys constant text\[\] := array\[([\s\S]*?)\]::text\[];/)?.[1] || '';
for (const key of [
  'pad_name','company','state','county','township','address','latitude','longitude',
  'well_name','api','property_number','well_entries','structured_road_sequence',
  'written_directions','directions_clear'
]) {
  assert.ok(allowedBlock.includes(`'${key}'`), `Safe editor allow-list dropped ${key}.`);
}
for (const key of [
  'created_by','updated_by','created_at','updated_at','extra_data','structured_route_steps',
  'verification_status','import_source','import_status','research_note','research_notes',
  'research_sources','record_number','legacy_id','road_sequence_status','audit_source','audit_verified'
]) {
  assert.ok(!allowedBlock.includes(`'${key}'`), `Unsafe editor allow-list includes protected field ${key}.`);
}
assert.ok(!allowedBlock.includes("'directions_clear_method'"), 'Client must not control directions_clear_method provenance.');
assert.ok(stage1Fix.includes("'BrineSearch smart rewrite reviewed by editor'"), 'Server must derive clearer-direction provenance.');

for (const preDeploy of [stage1, stage1Fix]) {
  assert.ok(!/revoke\s+insert\s*,\s*update\s+on\s+table\s+public\.pads/i.test(preDeploy), 'Pre-deploy migrations must not revoke the legacy browser path.');
}
for (const token of [
  'revoke insert, update on table public.pads from authenticated',
  'drop policy if exists "Editors can insert pads" on public.pads',
  'drop policy if exists "Editors can update pads" on public.pads',
  "has_table_privilege('authenticated', 'public.pads', 'UPDATE')",
  "has_table_privilege('authenticated', 'public.pads', 'INSERT')"
]) {
  assert.ok(stage2.includes(token), `Issue #74 lockdown missing ${token}.`);
}

for (const token of [
  'security definer',
  "set search_path=''",
  'public.is_brinesearch_owner(v_actor)',
  'Expected route revision is required',
  'structured_route_revision',
  'brinesearch_guard_structured_pad_route_fields_issue69',
  'Structured route fields are managed only by brinesearch_publish_structured_route',
  'and geometry_version=0'
]) {
  assert.ok(issue69Migration.includes(token), `#69/#74 structured publisher boundary missing ${token}.`);
}
const exactPolicyStart = issue69Migration.indexOf('drop policy if exists pad_roads_editor_insert');
const exactPolicyEnd = issue69Migration.indexOf(
  'create or replace function private_verification.brinesearch_guard_exact_route_road_geometry_issue69',
  exactPolicyStart
);
const exactPolicyBlock = issue69Migration.slice(exactPolicyStart, exactPolicyEnd);
assert.ok(exactPolicyStart >= 0 && exactPolicyEnd > exactPolicyStart,
  'Could not isolate the #69 exact-row direct-DML policies.');
assert.ok(!/geometry_version\s*=\s*1/i.test(exactPolicyBlock),
  '#69 reopened authenticated direct writes to exact version-1 route rows.');

for (const token of [
  'editorRequestRevisionBaseIssue74',
  '/rest/v1/rpc/editor_update_pad',
  'p_expected_updated_at: expectedUpdatedAt',
  'p_patch: patch',
  'delete patch.directions_clear_method',
  'stale_revision',
  'newer work is not overwritten'
]) {
  assert.ok(bridge.includes(token), `Issue #74 browser bridge missing ${token}.`);
}
assert.ok(/method\s*!==\s*"PATCH"/.test(bridge), 'Issue #74 bridge must only replace the legacy PATCH path.');
assert.ok(legacyEditor.includes('method: "PATCH"'), 'Historical direct PATCH witness changed unexpectedly.');
assert.ok(legacyEditor.includes('/rest/v1/pads?id=eq.'), 'Historical id-only update witness changed unexpectedly.');

const legacyIndex = order.parts.indexOf('11-pad-page.js');
const bridgeIndex = order.parts.indexOf('11aa-editor-revision-security-issue74.js');
assert.ok(legacyIndex >= 0 && bridgeIndex === legacyIndex + 1, 'Issue #74 bridge must load immediately after the legacy save function is defined.');

assert.equal(pkg.scripts?.['verify:editor-revision-security'], 'node v17/scripts/audit-editor-revision-boundary-issue74.mjs');
assert.ok(pkg.scripts?.build?.includes('verify:editor-revision-security'), 'Full production build must run the issue #74 regression audit.');

// Independent invariant model: hidden fields are rejected, stale writes conflict,
// and a fresh UI patch changes only the explicit public/editor fields supplied.
const allowed = new Set((allowedBlock.match(/'([^']+)'/g) || []).map(value => value.slice(1, -1)));
const validatePatch = (currentRevision, expectedRevision, patch) => {
  if (currentRevision !== expectedRevision) return { ok:false, reason:'stale_revision' };
  const invalid = Object.keys(patch).filter(key => !allowed.has(key));
  if (invalid.length) return { ok:false, reason:'invalid_fields', invalid };
  return { ok:true, patch };
};
assert.deepEqual(validatePatch('r2','r1',{ pad_name:'Older' }), { ok:false, reason:'stale_revision' });
assert.deepEqual(validatePatch('r1','r1',{ extra_data:{ poisoned:true } }), { ok:false, reason:'invalid_fields', invalid:['extra_data'] });
assert.deepEqual(validatePatch('r1','r1',{ structured_route_steps:[{ road_id:'fake' }] }), { ok:false, reason:'invalid_fields', invalid:['structured_route_steps'] });
assert.deepEqual(validatePatch('r1','r1',{ created_by:'forged' }), { ok:false, reason:'invalid_fields', invalid:['created_by'] });
assert.deepEqual(validatePatch('r1','r1',{ pad_name:'Fresh', county:'Belmont' }), { ok:true, patch:{ pad_name:'Fresh', county:'Belmont' } });

console.log(JSON.stringify({
  issue: 74,
  browserWrite: 'legacy PATCH redirected to editor_update_pad RPC',
  authorization: 'approved editor required server-side',
  fieldBoundary: 'explicit allow-list; hidden/revision/route-snapshot fields rejected',
  concurrency: 'updated_at optimistic revision under row lock',
  productionRPC: 'stage-1 function live-tested after immediate runtime correction',
  deployment: 'RPC migrations before browser deploy; raw table-write lockdown after live verification'
}, null, 2));
console.log('GitHub #74 editor revision boundary audit passed.');
