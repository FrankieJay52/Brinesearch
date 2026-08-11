import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'v17');
const partsDir = path.join(root, 'src', 'parts');
const order = JSON.parse(fs.readFileSync(path.join(partsDir, 'part-order.json'), 'utf8'));
const reconnectName = '10a-live-pad-editor-reconnect-issue89.js';
const reconnect = fs.readFileSync(path.join(partsDir, reconnectName), 'utf8');
const securityBoot = fs.readFileSync(path.join(partsDir, '00-security-boot.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`Issue #89 audit failed: ${message}`);
}

const editorIndex = order.parts.indexOf('10-live-pad-editor.js');
const reconnectIndex = order.parts.indexOf(reconnectName);
const padPageIndex = order.parts.indexOf('11-pad-page.js');
assert(editorIndex >= 0 && reconnectIndex === editorIndex + 1, 'reconnect layer must load immediately after the live editor');
assert(padPageIndex > reconnectIndex, 'pad-page click handlers must see the wrapped editor');
assert(order.parts.indexOf('00-security-boot.js') < order.parts.indexOf('00-core-data.js'), 'security boot must still precede directory loading');

assert(reconnect.includes('/rest/v1/public_pad_detail'), 'selected-pad reconnect must use the safe public detail projection');
assert(!reconnect.includes('/rest/v1/pads'), 'selected-pad reconnect must not restore anonymous direct pads-table reads');
assert(reconnect.includes('requireEditorAccess()'), 'reconnect must retain editor authorization checks');
assert(reconnect.includes('apikey: SUPABASE_PUBLISHABLE_KEY'), 'public detail lookup must use the publishable client key');
assert(!reconnect.includes('service_role') && !reconnect.includes('SUPABASE_SERVICE'), 'browser reconnect must never contain service-role credentials');
assert(reconnect.includes('_dbId') && reconnect.includes('mapSupabasePad(row)'), 'live row ID must be restored through the canonical pad mapper');
assert(reconnect.includes('const sourceLabel = DATA_SOURCE_LABEL') && reconnect.includes('DATA_SOURCE_LABEL = sourceLabel'), 'directory source label must be restored after the legacy editor guard');
assert(reconnect.includes('8000'), 'manual reconnect must allow a longer bounded mobile timeout than startup');
assert(securityBoot.includes('/functions/v1') && securityBoot.includes('public-pad-directory'), 'existing least-privilege public directory boundary must remain in place');

console.log('Issue #89 live pad editor reconnect audit passed.');
