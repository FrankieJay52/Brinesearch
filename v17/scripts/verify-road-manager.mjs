import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');

const read = file => fs.readFile(file, 'utf8');
const [padEditor, roadTools, ownerGuard, builtGuard, migration] = await Promise.all([
  read(path.join(v17Root, 'src/parts/07-pad-editor-core.js')),
  read(path.join(v17Root, 'src/parts/15-settings-road-tools.js')),
  read(path.join(v17Root, 'src/runtime/front-sign-hidden.js')),
  read(path.join(v17Root, 'public/app/front-sign-hidden.js')),
  read(path.join(projectRoot, 'supabase/migrations/20260807074500_owner_only_shared_road_manager.sql'))
]);

function requireText(source, token, label) {
  if (!source.includes(token)) throw new Error(`${label} is missing ${token}`);
}

requireText(padEditor, 'editorIsOwner()?`<div style="margin-top:10px"', 'Pad Editor owner-only Road Manager shortcut');
requireText(roadTools, '/rest/v1/brinesearch_roads', 'Supabase-backed Road Manager');
requireText(ownerGuard, '#brinesearch-road-manager-settings-launch,#brm-settings-launch', 'Legacy duplicate suppression');
requireText(ownerGuard, 'brinesearch-owner-road-manager-entry', 'Owner controls Road Manager entry');
requireText(ownerGuard, '/rest/v1/editor_accounts?', 'Owner access check');
requireText(ownerGuard, "root.location.hash = '#/settings/roads'", 'Road Manager route guard');
requireText(ownerGuard, "dataset.brinesearchRoadManager = 'central-owner-only'", 'Central Road Manager marker');
requireText(builtGuard, 'brinesearch-owner-road-manager-entry', 'Built owner-only Road Manager guard');
requireText(migration, 'roads_owner_insert', 'Owner-only INSERT policy');
requireText(migration, 'roads_owner_update', 'Owner-only UPDATE policy');
requireText(migration, 'is_brinesearch_owner(auth.uid())', 'Owner policy predicate');
if (migration.includes('is_brinesearch_editor(auth.uid())')) throw new Error('Road master migration still grants editor write access.');

console.log('Verified owner-only central Road Manager: one Owner controls entry, legacy duplicates suppressed, direct-route access guarded, owner-only database writes documented, and the Pad Editor shortcut hidden from non-owners.');
