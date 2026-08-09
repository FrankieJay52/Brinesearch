import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
execFileSync(process.execPath, [path.join(scriptDir, 'assemble.mjs')], { stdio: 'inherit' });
const app = await fs.readFile(path.join(v17Root, 'public/app/brinesearch-app.js'), 'utf8');
const css = await fs.readFile(path.join(v17Root, 'public/styles/app.css'), 'utf8');
const fieldMarkCss = await fs.readFile(path.join(v17Root, 'public/styles/field-mark-icons.css'), 'utf8');
const structuredScanner = await fs.readFile(path.join(v17Root, 'public/app/front-sign-structured.js'), 'utf8');
const parts = JSON.parse(await fs.readFile(path.join(v17Root, 'src/parts/part-order.json'), 'utf8'));
const styles = JSON.parse(await fs.readFile(path.join(v17Root, 'src/styles/style-order.json'), 'utf8'));
const sourceParts = await Promise.all(parts.parts.map(name => fs.readFile(path.join(v17Root, 'src/parts', name), 'utf8')));
const expectedApp = `${parts.wrapperStart}\n${sourceParts.join('\n')}\n${parts.wrapperEnd}\n`;
const sourceStyles = await Promise.all(styles.styles.map(name => fs.readFile(path.join(v17Root, 'src/styles', name), 'utf8')));
const expectedCss = sourceStyles.map(value => value.trimEnd()).join('\n\n') + '\n';
new vm.Script(app, { filename: 'brinesearch-app.js' });
new vm.Script(structuredScanner, { filename: 'front-sign-structured.js' });
const appSha256 = sha256(app);
const cssSha256 = sha256(css);
if (app !== expectedApp) throw new Error(`Assembled application differs from the ordered source parts. Generated ${appSha256}.`);
if (css !== expectedCss) throw new Error(`Assembled CSS differs from the ordered source styles. Generated ${cssSha256}.`);
if (fieldMarkCss.includes("url('./icons/")) throw new Error('Field Mark override still contains stylesheet-relative icon URLs.');
for (const requiredIcon of ['/icons/fm-search-inactive.svg','/icons/fm-home-inactive.svg','/icons/fm-feed-inactive.svg','/icons/fm-favorites-inactive.svg','/icons/fm-add-inactive.svg','/icons/fm-offline-inactive.svg']) {
  if (!fieldMarkCss.includes(`url('${requiredIcon}')`)) throw new Error(`Missing absolute Field Mark icon ${requiredIcon}.`);
}
for (const requiredScannerToken of ['Read Database Fields', 'findSignBounds', 'panelRects', 'formatApi14', 'digits.slice(5,6)', 'digits.slice(6,10)']) {
  if (!structuredScanner.includes(requiredScannerToken)) throw new Error(`Structured scanner is missing ${requiredScannerToken}.`);
}
for (const file of ['theme-boot.js','weather-feature.js','root-scroll-guard.js','field-mark-runtime.js']) {
  new vm.Script(await fs.readFile(path.join(v17Root, 'public/app', file), 'utf8'), { filename: file });
}
for (const requiredStartupToken of ['Live database startup deadline exceeded', 'setTimeout(() => resolve(local), 500)', 'V17.3.12 — startup + saved-mileage resilience', 'directionRewriteAddsMileageV17312', 'directionSavedMileageSourceV17312', 'Rejected direction rewrite because saved mileage could not be preserved']) {
  if (!app.includes(requiredStartupToken)) throw new Error(`V17.3.12 startup/mileage resilience is missing ${requiredStartupToken}.`);
}
for (const requiredDirectionToken of ['public_pad_detail', '__brineLiveClearDirectionsAuthoritative', 'directionClearPolishedStepsV1732', 'directionClearNoteOnlyV1732', 'directionSanitizeInstructionV1738', 'directionDriverSafeClearTextV1738', 'brinesearch_direction_step_intelligence', 'same_road_continuation', 'shared_road_consensus', 'sourceStepOrder', 'savedDistance', 'directionClearRoadTextTargetV17310', 'directionNormalizeTargetRoadV17310', 'directionCompoundDistanceCountV17310', 'compoundSource', 'directionGenericRouteLabelV17312', 'directionSplitDriverStepV17312', 'directionRoadIntelRoadRebuiltV17312', 'directionSequenceSummaryRebuiltV17312', 'directionGlobalWrittenEntriesV17315', 'directionWrittenStrongSharedAliasV17315', 'directionCoalesceEntriesV17316', 'directionHydrateSelectedLiveClearV17316', '__brineLiveClearDirectionsReadyV17316']) {
  if (!app.includes(requiredDirectionToken)) throw new Error(`V17.3 direction hardening is missing ${requiredDirectionToken}.`);
}
for (const requiredPublicDataToken of ['public-pad-data-card', 'Current Pad Snapshot', 'Official pad name', 'Official location', 'Pad permit', 'Saved API check', 'Official match basis', 'Public Data / Well Details', 'official_well_records', 'saved driver/navigation point is unchanged', 'await publicDataPadCardBaseV1736(id)']) {
  if (!app.includes(requiredPublicDataToken)) throw new Error(`V17.3.6 public data pad card is missing ${requiredPublicDataToken}.`);
}
for (const requiredRouteReferenceToken of ['brinesearch_driver_route_reference', 'driver-route-reference-card', 'Known Approach Road', 'ROAD TYPE', 'DISTANCE MEANS', 'is_stale', 'not proven a usable truck connection', 'MEASURED APPROX. MILEAGE', 'pad_specific_official_centerline_measurement']) {
  if (!app.includes(requiredRouteReferenceToken)) throw new Error(`V17.3.10 driver route intelligence is missing ${requiredRouteReferenceToken}.`);
}
for (const requiredVerificationToken of ['Pad checks','Checked automatically or previously','Confirm all manually','padVerificationEvidenceFor']) {
  if (!app.includes(requiredVerificationToken)) throw new Error(`V17.3.7 pad verification cleanup is missing ${requiredVerificationToken}.`);
}
for (const requiredWellToken of ['fieldWellCardsV17311','Name needs review','This saved API does not have a confirmed official well name yet.']) {
  if (!app.includes(requiredWellToken)) throw new Error(`V17.3.11 well-list safety is missing ${requiredWellToken}.`);
}
if (!css.includes('.public-pad-data-context')) throw new Error('V17.3.6 official pad context grid is missing.');
if (!css.includes('.pad-check-reviewed-row')) throw new Error('V17.3.7 pad verification cleanup styles are missing.');
if (!css.includes('.direction-clear-road-alias')) throw new Error('V17.3.9 dual road-name styles are missing.');
if (!css.includes('.direction-compound-source')) throw new Error('V17.3.10 compound route safety styles are missing.');
if (!css.includes('.field-official-source-card .field-source-link')) throw new Error('V17.3.11 centered official-source button style is missing.');
if (!css.includes('.well-name-review-placeholder')) throw new Error('V17.3.11 unresolved-well placeholder style is missing.');
const directionManifest = JSON.parse(await fs.readFile(path.join(v17Root, 'public/data/directions/index.json'), 'utf8'));
let rewriteCount = 0;
for (const file of directionManifest.files) rewriteCount += Object.keys(JSON.parse(await fs.readFile(path.join(v17Root, 'public/data/directions', file), 'utf8'))).length;
if (rewriteCount !== directionManifest.recordCount || rewriteCount < 100) throw new Error('Direction rewrite data did not assemble correctly.');
const serviceWorker = await fs.readFile(path.join(v17Root, 'public/sw.js'), 'utf8');
new vm.Script(serviceWorker, { filename: 'sw.js' });
if (!serviceWorker.includes("brinesearch-v17-3-16-direction-source-priority")) throw new Error('V17.3.16 service-worker cache marker is missing.');
if (!serviceWorker.includes('networkFirstAppAsset')) throw new Error('V17.3 service worker is missing live app-asset refresh logic.');
if (!serviceWorker.includes('./app/front-sign-structured.js')) throw new Error('Structured scanner is missing from the offline shell.');
if (serviceWorker.includes('./v16-25-hotfix.js')) throw new Error('Legacy V16.25 OCR hotfix is still in the V17.3 offline shell.');
const index = await fs.readFile(path.join(v17Root, 'index.html'), 'utf8');
for (const required of ['/styles/app.css','/app/brinesearch-app.js','/app/theme-boot.js']) if (!index.includes(required)) throw new Error(`Missing ${required} from V17 index.`);
if (/<style(?:\s|>)/i.test(index)) throw new Error('Inline style blocks remain in V17 index.');
if (/<script(?![^>]+src=)/i.test(index)) throw new Error('Inline script blocks remain in V17 index.');
console.log(`Verified V${parts.version}: ${parts.parts.length} JS parts, ${styles.styles.length} CSS parts, bounded startup dependencies, live Clear Direction source priority, packaged fragment coalescing, saved-mileage safety, conservative double-road naming, synchronized well rows, and live-updating service worker. Build hashes: ${appSha256.slice(0,12)} / ${cssSha256.slice(0,12)}.`);
