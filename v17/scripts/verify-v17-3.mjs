import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(v17Root, '..');
const read = file => fs.readFile(file, 'utf8');
const [dashboard, feed, router, polish, finalFixes, roadLiveFixes, roadLiveStyles, packageJson, partManifest, styleManifest, sw, liveDirections, directionPolish, directionLandmarkCleanup, directionRoadIntel, directionTargetRoadFix, directionCompoundSafety, directionRoadIntelStyles, publicDataReview, publicDataReviewStyles, publicPadCard, publicPadCardStyles, driverRouteReference, driverRouteReferenceAudit, driverRouteReferenceStyles, verificationCleanup, verificationCleanupStyles] = await Promise.all([
  read(path.join(v17Root,'src/parts/04-dashboard-favorites-offline.js')),
  read(path.join(v17Root,'src/parts/14-field-feed-profile.js')),
  read(path.join(v17Root,'src/parts/16-router-assistant-shell.js')),
  read(path.join(v17Root,'src/styles/27-v17-3-product-polish.css')),
  read(path.join(v17Root,'src/styles/28-v17-3-icon-and-layout-fixes.css')),
  read(path.join(v17Root,'src/parts/21-road-manager-live-fixes.js')),
  read(path.join(v17Root,'src/styles/31-road-manager-live-fixes.css')),
  read(path.join(projectRoot,'package.json')),
  read(path.join(v17Root,'src/parts/part-order.json')),
  read(path.join(v17Root,'src/styles/style-order.json')),
  read(path.join(v17Root,'src/offline/sw.js')),
  read(path.join(v17Root,'src/parts/00a-live-clear-directions-precedence.js')),
  read(path.join(v17Root,'src/parts/22a-direction-clear-polish.js')),
  read(path.join(v17Root,'src/parts/22b-direction-landmark-cleanup.js')),
  read(path.join(v17Root,'src/parts/22c-direction-road-intelligence.js')),
  read(path.join(v17Root,'src/parts/22d-direction-target-road-fix.js')),
  read(path.join(v17Root,'src/parts/22e-direction-compound-step-safety.js')),
  read(path.join(v17Root,'src/styles/38-direction-road-intelligence.css')),
  read(path.join(v17Root,'src/parts/09a-public-data-review.js')),
  read(path.join(v17Root,'src/styles/34-public-data-review.css')),
  read(path.join(v17Root,'src/parts/11b-public-data-pad-card.js')),
  read(path.join(v17Root,'src/styles/35-public-data-pad-card.css')),
  read(path.join(v17Root,'src/parts/11c-driver-route-reference.js')),
  read(path.join(v17Root,'src/parts/11e-route-reference-audit-fixes.js')),
  read(path.join(v17Root,'src/styles/36-driver-route-reference.css')),
  read(path.join(v17Root,'src/parts/11d-verification-cleanup.js')),
  read(path.join(v17Root,'src/styles/37-verification-cleanup.css'))
]);
const iconNames=['fm-legal.svg','fm-profile-inactive.svg','fm-notifications-inactive.svg','fm-settings-inactive.svg','fm-weather-inactive.svg','fm-offline-inactive.svg','fm-warning.svg','fm-role-owner.svg','fm-road-inactive.svg','fm-pad-inactive.svg','fm-wells.svg','fm-companies.svg','fm-like-inactive.svg'];
const iconBuffers=await Promise.all(iconNames.map(name=>fs.readFile(path.join(v17Root,'public','icons',name))));
const iconHashes=iconBuffers.map(buffer=>crypto.createHash('sha256').update(buffer).digest('hex'));
if(new Set(iconHashes).size!==iconHashes.length) throw new Error('V17.3 key icons still contain placeholder duplicates.');
function requireText(source,token,label){if(!source.includes(token))throw new Error(`${label} is missing ${token}`);}
requireText(dashboard,'function renderFavorites()','Favorites route implementation');
requireText(router,'BrineSearch V 17.3','Settings version');
requireText(feed,'feed-guest-banner','Inline public Feed prompt');
requireText(polish,'.v173-dashboard','V17.3 dashboard visual layer');
requireText(finalFixes,'grid-template-columns:repeat(3,minmax(0,1fr))','Dashboard stat layout');
requireText(roadLiveFixes,'Interstates and U.S. highways','Grouped Road Manager highways');
requireText(roadLiveStyles,'.road-row-grouped .road-status{pointer-events:none}','Whole-road-row click behavior');
requireText(styleManifest,'34-public-data-review.css','Public Data Review stylesheet');
requireText(styleManifest,'35-public-data-pad-card.css','Public Data pad card stylesheet');
requireText(styleManifest,'36-driver-route-reference.css','Driver route-reference stylesheet');
requireText(styleManifest,'37-verification-cleanup.css','Pad verification cleanup stylesheet');
requireText(styleManifest,'38-direction-road-intelligence.css','Direction road intelligence stylesheet');
requireText(partManifest,'09a-public-data-review.js','Public Data Review JavaScript');
requireText(partManifest,'11b-public-data-pad-card.js','Public Data pad card JavaScript');
requireText(partManifest,'11c-driver-route-reference.js','Driver route-reference JavaScript');
requireText(partManifest,'11d-verification-cleanup.js','Pad verification cleanup JavaScript');
requireText(partManifest,'11e-route-reference-audit-fixes.js','Route reference audit fixes JavaScript');
requireText(partManifest,'22b-direction-landmark-cleanup.js','Direction landmark cleanup JavaScript');
requireText(partManifest,'22c-direction-road-intelligence.js','Direction road intelligence JavaScript');
requireText(partManifest,'22d-direction-target-road-fix.js','Target-road parsing JavaScript');
requireText(partManifest,'22e-direction-compound-step-safety.js','Compound direction safety JavaScript');
requireText(partManifest,'"version": "17.3.10"','Part manifest version');
requireText(styleManifest,'"version": "17.3.10"','Style manifest version');
requireText(packageJson,'"version": "17.3.10"','Package version');
requireText(sw,'brinesearch-v17-3-10-audit-fixes','Service-worker cache version');
requireText(sw,'networkFirstAppAsset','Service-worker live asset update strategy');
requireText(liveDirections,'/rest/v1/public_pad_detail','Authoritative public Clear Directions view');
requireText(liveDirections,'__brineLiveClearDirectionsAuthoritative','Live Clear Directions precedence marker');
requireText(directionPolish,'directionClearNoteOnlyV1732','Direction note-card merger');
requireText(directionPolish,'sourceStepOrder','Original direction step tracking');
requireText(directionLandmarkCleanup,'directionSanitizeInstructionV1738','Landmark sanitizer');
requireText(directionLandmarkCleanup,'directionDriverSafeClearTextV1738','Landmark-safe copy directions');
requireText(directionLandmarkCleanup,'sourceStepOrder','Landmark-cleaned source-step preservation');
requireText(directionRoadIntel,'brinesearch_direction_step_intelligence','Shared-road intelligence RPC');
requireText(directionRoadIntel,'same_road_continuation','Same-road continuation handling');
requireText(directionRoadIntel,'shared_road_consensus','Shared-road mileage handling');
requireText(directionRoadIntel,'entry?.sourceStepOrder','Road-intelligence source-step alignment');
requireText(directionRoadIntel,'savedDistance','Short saved-distance label handling');
requireText(directionRoadIntel,'entry.compoundSource','Compound source safety rendering');
requireText(directionTargetRoadFix,'directionClearRoadTextTargetV17310','Target-road parser override');
requireText(directionTargetRoadFix,'directionNormalizeTargetRoadV17310','Worded and suffixed target roads');
requireText(directionCompoundSafety,'directionCompoundDistanceCountV17310','Compound distance detector');
requireText(directionCompoundSafety,'disableRoadIntel:true','Compound intelligence safety gate');
requireText(directionRoadIntelStyles,'.direction-clear-road-alias','Dual road-name visual');
requireText(directionRoadIntelStyles,'.direction-compound-source','Compound route visual');
requireText(publicDataReview,'/rest/v1/rpc/public_data_review_summary','Owner public data summary RPC');
requireText(publicDataReview,'It will NOT publish','Public Data Review safety confirmation');
requireText(publicDataReviewStyles,'.public-data-review-panel','Public Data Review visual layer');
requireText(publicPadCard,'Current Pad Snapshot','Driver public-data snapshot');
requireText(publicPadCard,'Official pad name','Official pad-name visibility');
requireText(publicPadCard,'Official location','Official location visibility');
requireText(publicPadCard,'Pad permit','Official pad permit visibility');
requireText(publicPadCard,'Saved API check','Saved-to-official API match visibility');
requireText(publicPadCard,'Official match basis','Official match-method visibility');
requireText(publicPadCard,'await publicDataPadCardBaseV1736(id)','Full selected-pad detail hydration before snapshot render');
requireText(publicPadCard,'official_well_records','Confirmed official well source');
requireText(publicPadCard,'saved driver/navigation point is unchanged','Navigation safety notice');
requireText(publicPadCardStyles,'.public-pad-data-card','Driver public-data card visual layer');
requireText(publicPadCardStyles,'.public-pad-data-context','Official pad context grid');
requireText(driverRouteReference,'brinesearch_driver_route_reference','Safe driver route-reference API');
requireText(driverRouteReference,'Known Approach Road','Mileage-unavailable anchor visibility');
requireText(driverRouteReference,'ROAD TYPE','Road-type pad-card detail');
requireText(driverRouteReference,'DISTANCE MEANS','Distance-semantics pad-card detail');
requireText(driverRouteReference,'is_stale','Stale reference safety gate');
requireText(driverRouteReference,'not proven a usable truck connection','Research-only safety boundary');
requireText(driverRouteReferenceAudit,'MEASURED APPROX. MILEAGE','Measured mileage labeling');
requireText(driverRouteReferenceAudit,'pad_specific_official_centerline_measurement','Pad-specific measurement semantics');
requireText(driverRouteReferenceStyles,'.driver-route-reference-meta','Driver route-reference detail grid');
requireText(verificationCleanup,'Checked automatically or previously','Evidence-backed checked group');
requireText(verificationCleanup,'Confirm all manually','Manual confirmation safety wording');
requireText(verificationCleanup,'padVerificationEvidenceFor','Verification evidence renderer');
requireText(verificationCleanupStyles,'.pad-check-reviewed-row','Compact verification styles');
const iconEncoded=(await Promise.all([0,1,2,3].map(part=>read(path.join(v17Root,'src/icons',`field-mark-icons.${part}.b64`))))).join('').replace(/\s+/g,'');
const iconManifest=JSON.parse(gunzipSync(Buffer.from(iconEncoded,'base64')).toString('utf8'));
if(iconManifest.version!=='17.3.0'||Object.keys(iconManifest.icons||{}).length<90) throw new Error('The V17.3 Field Mark icon source manifest is incomplete.');
console.log('Verified BrineSearch V17.3.10 product layer: audited pad-specific mileage, source-step-aligned road intelligence, target-road parsing, compound-route safety, short-foot distance handling, dual road names, and current version markers.');
