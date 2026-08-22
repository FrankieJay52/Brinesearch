import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');

const read = file => fs.readFile(file, 'utf8');
const [padEditor, roadTools, roadGuard, builtGuard, migration, issue97Connections] = await Promise.all([
  read(path.join(v17Root, 'src/parts/07-pad-editor-core.js')),
  read(path.join(v17Root, 'src/parts/15-settings-road-tools.js')),
  read(path.join(v17Root, 'src/runtime/front-sign-hidden.js')),
  read(path.join(v17Root, 'public/app/front-sign-hidden.js')),
  read(path.join(projectRoot, 'supabase/migrations/20260807074500_owner_only_shared_road_manager.sql')),
  read(path.join(v17Root, 'src/parts/21n-road-manager-connections-issue97.js'))
]);

function requireText(source, token, label) {
  if (!source.includes(token)) throw new Error(`${label} is missing ${token}`);
}

requireText(padEditor, 'editorIsOwner()?`<div style="margin-top:10px"', 'Pad Editor owner-only Road Manager shortcut');
requireText(roadTools, '/rest/v1/brinesearch_roads', 'Supabase-backed Road Manager');
requireText(roadGuard, '#brinesearch-road-manager-settings-launch,#brm-settings-launch', 'Legacy duplicate suppression');
requireText(roadGuard, 'brinesearch-owner-road-manager-entry', 'Owner controls Road Manager entry');
requireText(roadGuard, '/rest/v1/editor_accounts?', 'Road Manager access check');
requireText(roadGuard, "permissions.includes('administrator')", 'Administrator read-only Road Manager access');
requireText(roadGuard, "permissions.includes('editor')", 'Editor read-only Road Manager access');
requireText(roadGuard, "return 'readonly'", 'Non-owner approved read-only access level');
requireText(roadGuard, "root.location.hash = '#/settings/roads'", 'Road Manager route guard');
requireText(roadGuard, "dataset.brinesearchRoadManager = 'central-owner-only'", 'Owner-write Road Manager marker');
requireText(builtGuard, "permissions.includes('editor')", 'Built Editor read-only Road Manager guard');
requireText(issue97Connections, 'Read-only official OH/WV/PA road identities and physical connections.', 'Issue #97 read-only official-road UI');
requireText(issue97Connections, 'if (!editorIsOwner())', 'Issue #97 non-owner mutation boundary');
requireText(migration, 'roads_owner_insert', 'Owner-only INSERT policy');
requireText(migration, 'roads_owner_update', 'Owner-only UPDATE policy');
requireText(migration, 'is_brinesearch_owner(auth.uid())', 'Owner policy predicate');
if (migration.includes('is_brinesearch_editor(auth.uid())')) throw new Error('Road master migration still grants editor write access.');

console.log('Verified central Road Manager access: Owner retains master-road writes; approved Editors/Administrators can inspect #97 official roads read-only; legacy duplicates remain suppressed; non-editors remain direct-route denied.');
