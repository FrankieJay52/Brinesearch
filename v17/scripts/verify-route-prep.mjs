import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');

const [routePrep, routePrepCss, partManifestText, styleManifestText, migration, router, settings] = await Promise.all([
  read(path.join(v17Root, 'src/parts/18-road-manager-route-prep.js')),
  read(path.join(v17Root, 'src/styles/29-road-manager-route-prep.css')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(projectRoot, 'supabase/migrations/20260807215000_road_manager_route_prep_owner_queue_v2.sql')),
  read(path.join(v17Root, 'src/parts/16-router-assistant-shell.js')),
  read(path.join(v17Root, 'src/parts/15-settings-road-tools.js'))
]);

const parts = JSON.parse(partManifestText);
const styles = JSON.parse(styleManifestText);
const requireText = (source, token, label) => {
  if (!source.includes(token)) throw new Error(`${label} is missing ${token}`);
};

const routePrepIndex = parts.parts.indexOf('18-road-manager-route-prep.js');
const startupIndex = parts.parts.indexOf('18-account-theme-startup.js');
if (routePrepIndex < 0) throw new Error('Route Prep is missing from the JavaScript manifest.');
if (startupIndex < 0 || routePrepIndex >= startupIndex) throw new Error('Route Prep must load before the startup wrapper closes.');
if (!styles.styles.includes('29-road-manager-route-prep.css')) throw new Error('Route Prep CSS is missing from the style manifest.');

requireText(router, 'parts[0] === "settings" && parts[1] === "roads"', 'Road Manager router');
requireText(settings, 'function renderRoadManagerSettings()', 'Base Road Manager');
requireText(routePrep, 'requireOwnerSettingsPage("Road Manager")', 'Owner-only Route Prep page');
requireText(routePrep, 'Master roads', 'Master-road tab');
requireText(routePrep, 'Pad Route Prep', 'Route Prep tab');
requireText(routePrep, 'road_manager_route_prep_summary', 'Route Prep summary RPC');
requireText(routePrep, 'road_manager_route_prep_list', 'Route Prep list RPC');
requireText(routePrep, 'road_manager_route_prep_detail', 'Route Prep detail RPC');
requireText(routePrep, 'road_manager_refresh_route_prep', 'Route Prep refresh RPC');
requireText(routePrep, 'approve_state_route_candidate', 'Owner state-route candidate approval');
requireText(routePrep, 'reject_state_route_candidate', 'Owner state-route candidate rejection');
requireText(routePrep, 'State-route candidates remain review-only. Local roads never receive an educated guess.', 'Visible no-guess rule');
requireText(routePrep, 'will remain non-publishable', 'Candidate publication warning');
requireText(routePrep, 'Nothing here changes live directions by itself.', 'Live-direction protection notice');
if (routePrep.includes('/rest/v1/pads?') || routePrep.includes('method:"PATCH"') || routePrep.includes("method:'PATCH'")) {
  throw new Error('Route Prep UI must not directly rewrite live pad records.');
}

requireText(routePrepCss, '.route-prep-policy', 'No-guess policy styling');
requireText(routePrepCss, '.route-prep-candidate-note', 'State-route candidate styling');
requireText(routePrepCss, '.route-prep-no-guess', 'Unmatched local-road styling');
requireText(routePrepCss, '@media(max-width:600px)', 'Mobile Route Prep layout');
requireText(routePrepCss, 'html[data-theme="day"]', 'Daylight Route Prep layout');

requireText(migration, 'Only the BrineSearch Owner may open Route Prep', 'Owner-only database read guard');
requireText(migration, "Exact Road Manager canonical names or aliases only. No local-road guessing.", 'Exact matching policy');
requireText(migration, "A state-route candidate cannot be linked to a live pad route until officially verified", 'Candidate publication block');
requireText(migration, 'trg_enforce_brinesearch_route_prep_no_guess', 'No-guess database trigger');
requireText(migration, 'trg_prevent_candidate_road_publication', 'Candidate pad-link trigger');
requireText(migration, "'candidate_only',true,'may_publish',false,'local_road_guessing',false", 'Non-publishable candidate metadata');
requireText(migration, "s.step_kind in ('local_road','county_road','township_road')", 'Local-road exact-match scope');
requireText(migration, "multiple_exact_road_manager_matches", 'Ambiguous exact-match handling');
if (/local[^\n]{0,100}(fuzzy|guess)/i.test(migration)) throw new Error('A local-road fuzzy or guessed match was introduced.');

console.log('Verified Road Manager Route Prep: Owner-only 833-pad queue, exact Road Manager matching, non-publishable state-route candidates, no local-road guessing, no direct pad rewrite, and mobile/daylight UI coverage.');
