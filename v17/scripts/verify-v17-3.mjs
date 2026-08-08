import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');

const [dashboard, feed, router, polish, finalFixes, roadLiveFixes, roadLiveStyles, packageJson, partManifest, styleManifest, sw, liveDirections, directionPolish] = await Promise.all([
  read(path.join(v17Root, 'src/parts/04-dashboard-favorites-offline.js')),
  read(path.join(v17Root, 'src/parts/14-field-feed-profile.js')),
  read(path.join(v17Root, 'src/parts/16-router-assistant-shell.js')),
  read(path.join(v17Root, 'src/styles/27-v17-3-product-polish.css')),
  read(path.join(v17Root, 'src/styles/28-v17-3-icon-and-layout-fixes.css')),
  read(path.join(v17Root, 'src/parts/21-road-manager-live-fixes.js')),
  read(path.join(v17Root, 'src/styles/31-road-manager-live-fixes.css')),
  read(path.join(projectRoot, 'package.json')),
  read(path.join(v17Root, 'src/parts/part-order.json')),
  read(path.join(v17Root, 'src/styles/style-order.json')),
  read(path.join(v17Root, 'src/offline/sw.js')),
  read(path.join(v17Root, 'src/parts/00a-live-clear-directions-precedence.js')),
  read(path.join(v17Root, 'src/parts/22a-direction-clear-polish.js'))
]);

const iconNames = [
  'fm-legal.svg','fm-profile-inactive.svg','fm-notifications-inactive.svg','fm-settings-inactive.svg',
  'fm-weather-inactive.svg','fm-offline-inactive.svg','fm-warning.svg','fm-role-owner.svg',
  'fm-road-inactive.svg','fm-pad-inactive.svg','fm-wells.svg','fm-companies.svg','fm-like-inactive.svg'
];
const iconBuffers = await Promise.all(iconNames.map(name => fs.readFile(path.join(v17Root, 'public', 'icons', name))));
const iconHashes = iconBuffers.map(buffer => crypto.createHash('sha256').update(buffer).digest('hex'));
if (new Set(iconHashes).size !== iconHashes.length) {
  const duplicates = iconNames.filter((name, index) => iconHashes.indexOf(iconHashes[index]) !== index);
  throw new Error(`V17.3 key icons still contain placeholder duplicates: ${duplicates.join(', ')}`);
}

function requireText(source, token, label) {
  if (!source.includes(token)) throw new Error(`${label} is missing ${token}`);
}

requireText(dashboard, 'function renderFavorites()', 'Favorites route implementation');
requireText(dashboard, 'dashboard-overview-grid', 'Dashboard information hierarchy');
requireText(dashboard, 'dashboard-mini-stats', 'Dashboard compact database totals');
requireText(router, 'parts[0] === "favorites"', 'Favorites router');
requireText(router, '.feed-login-overlay', 'Route overlay cleanup');
requireText(router, 'BrineSearch V 17.3', 'Settings version');
requireText(feed, 'feed-guest-banner', 'Inline public Feed prompt');
requireText(feed, 'fieldUploadAvatar', 'Profile photo Storage upload');
requireText(feed, '/storage/v1/object/field-feed-images/', 'Profile photo Storage path');
if (/\n\s*fieldMaybeShowLoginPrompt\(\);/.test(feed)) throw new Error('The blocking Field Feed login prompt is still called.');
requireText(polish, '.v173-dashboard', 'V17.3 dashboard visual layer');
requireText(finalFixes, 'grid-template-columns:repeat(3,minmax(0,1fr))', 'Dashboard stat layout');
requireText(finalFixes, '#feedNotificationsBtn', 'Distinct Feed action icon treatment');
requireText(polish, '.favorites-page', 'Favorites visual layer');
requireText(polish, '.feed-guest-banner', 'Feed guest visual layer');
requireText(polish, '.field-pad-page', 'Pad-page visual layer');
requireText(polish, 'html[data-theme="day"]', 'Daylight theme polish');
requireText(roadLiveFixes, 'Interstates and U.S. highways', 'Grouped Road Manager highways');
requireText(roadLiveFixes, 'Local / named roads', 'Grouped regular-road section');
requireText(roadLiveFixes, 'routePrepCompany', 'Ascent Route Prep filter');
requireText(roadLiveStyles, '.road-row-grouped .road-status{pointer-events:none}', 'Whole-road-row click behavior');
requireText(styleManifest, '27-v17-3-product-polish.css', 'Style manifest');
requireText(styleManifest, '28-v17-3-icon-and-layout-fixes.css', 'Final layout-fix stylesheet');
requireText(styleManifest, '31-road-manager-live-fixes.css', 'Road Manager live stylesheet');
requireText(partManifest, '21-road-manager-live-fixes.js', 'Road Manager live JavaScript');
requireText(partManifest, '22a-direction-clear-polish.js', 'Final direction-card polish');
requireText(partManifest, '"version": "17.3.2"', 'Part manifest version');
requireText(styleManifest, '"version": "17.3.2"', 'Style manifest version');
requireText(packageJson, '"version": "17.3.2"', 'Package version');
requireText(sw, 'brinesearch-v17-3-2', 'Service-worker cache version');
requireText(sw, 'networkFirstAppAsset', 'Service-worker live asset update strategy');
requireText(liveDirections, '/rest/v1/public_pad_detail', 'Authoritative public Clear Directions view');
requireText(liveDirections, '__brineLiveClearDirectionsAuthoritative', 'Live Clear Directions precedence marker');
requireText(directionPolish, 'directionClearNoteOnlyV1732', 'Direction note-card merger');
requireText(directionPolish, 'directionClearDistanceOnlyV1732', 'Direction distance-card merger');
const iconEncoded = (await Promise.all([0, 1, 2, 3].map(part => read(path.join(v17Root, 'src/icons', `field-mark-icons.${part}.b64`))))).join('').replace(/\s+/g, '');
const iconManifest = JSON.parse(gunzipSync(Buffer.from(iconEncoded, 'base64')).toString('utf8'));
if (iconManifest.version !== '17.3.0' || Object.keys(iconManifest.icons || {}).length < 90) throw new Error('The V17.3 Field Mark icon source manifest is incomplete.');

console.log('Verified BrineSearch V17.3.2 product layer: authoritative live Clear Directions, compact driver cards, V17.3 interface, grouped and fully clickable Road Manager, Ascent-focused Route Prep, automatic installed-app asset updates, distinct Field Mark icons, and current cache/version markers.');
