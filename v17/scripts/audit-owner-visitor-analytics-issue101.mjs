import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const load = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = load('supabase/migrations/20260813174841_owner_visitor_analytics_issue_101.sql');
const edge = load('supabase/functions/public-visit-beacon/index.ts');
const client = load('v17/src/parts/17b-owner-visitor-analytics-issue101.js');
const css = load('v17/src/styles/45-owner-visitor-analytics-issue101.css');
const parts = JSON.parse(load('v17/src/parts/part-order.json')).parts;
const styles = JSON.parse(load('v17/src/styles/style-order.json')).styles;
const pkg = JSON.parse(load('package.json'));

function ok(value, message) { if (!value) throw new Error(`Issue #101 audit failed: ${message}`); }
function all(source, needles, label) { for (const needle of needles) ok(source.includes(needle), `${label}: ${needle}`); }

all(migration, [
  'private_verification.owner_visitor_events_issue101',
  'enable row level security', 'force row level security',
  'from public, anon, authenticated, service_role',
  'network_hmac text not null', 'network_prefix text not null', 'visitor_code text not null',
  'unique (session_id, network_hmac, route, bucket_start)',
  "set search_path = ''", "v_jwt_role is distinct from 'service_role'",
  'pg_advisory_xact_lock', "interval '5 minutes'", '>= 300', '>= 2000',
  "interval '90 days'", 'limit 500', 'to service_role;',
  'v_uid := auth.uid();', 'public.is_brinesearch_owner(v_uid) is false',
  'v_end_date - 89', 'least(coalesce(p_limit, 50), 100)', 'least(coalesce(p_offset, 0), 5000)',
  "'new_sessions'", "'returning_sessions'", "'top_routes'", "'top_referrers'", "'recent'",
  'to authenticated;'
], 'database');
ok(!/\b(raw_ip|ip_address|full_ip|user_agent|referrer_url|email|account_id|user_id|latitude|longitude)\s+(text|uuid|varchar|jsonb|inet)/i.test(migration), 'sensitive storage column present');
ok(!migration.includes("'network_hmac', x.network_hmac"), 'dashboard emits full network HMAC');

all(edge, [
  'const MAX_BODY_BYTES = 768;', 'cf-connecting-ip', 'cf-ipcountry',
  'https://brinesearch.com', 'https://www.brinesearch.com', 'https://brinesearch.netlify.app',
  'new Set(["session_id", "route", "referrer_origin"])',
  'keys.some((key) => !ALLOWED_FIELDS.has(key))', 'UUID_V4.test(row.session_id)', 'SAFE_ROUTE.test(row.route)',
  'if (req.method !== "POST")', 'mode !== "production"', 'privacySignalEnabled(req)',
  'verifiedHeader !== TRUSTED_GATEWAY_HEADER', 'HMAC", hash: "SHA-256',
  '`network:${network.maskedPrefix}`', '.0/24`', '::/48`',
  'coarseFamilies(req.headers.get("user-agent") || "")',
  'createClient(supabaseUrl, serviceRoleJwt', 'serviceClient.rpc("record_visitor_event_issue101"',
  'AbortSignal.timeout(1500)', 'return response(origin, 202, true);'
], 'edge');
ok(!/x-forwarded-for|x-real-ip|x-nf-client-connection-ip/i.test(edge), 'unverified IP fallback header present');
ok(!/console\.(log|info|warn|error|debug)/.test(edge), 'visitor logging present');
ok(!/google-analytics|googletagmanager|mixpanel|segment\.com|ipinfo|ipapi|ipstack/i.test(edge), 'third-party analytics/IP service present');

all(client, [
  'sessionStorage.getItem(ISSUE101_SESSION_KEY)', 'crypto.randomUUID()',
  'navigator.globalPrivacyControl === true', 'navigator.doNotTrack',
  'if (editorSession?.access_token) return;', 'issue101SanitizedRoute()', 'issue101ReferrerOrigin()',
  'keepalive: true', 'credentials: "omit"', '.catch(() => {})',
  'requireOwnerSettingsPage("Visitor Analytics")', 'settingsRoleInfo().isOwner',
  'Visits today', 'Visits · 7 days', 'Visits · 30 days', 'Selected range',
  'Est. unique networks', 'New sessions', 'Returning sessions', 'Daily visit trend',
  'Top pages / routes', 'Top referrer origins', 'Recent visits', 'Visitor Analytics Privacy',
  '90-day retention window', 'raw IP addresses', 'full user-agent strings', 'full referrer URLs',
  'account IDs', 'GPS coordinates', 'carrier NAT', 'VPNs', 'bots'
], 'client');
ok(!/\bp_(?:ip|network_hmac|network_prefix|visitor_code)\b/.test(client), 'browser submits network identity fields');
ok(client.includes('if (root === "pad") return "/pad";') && client.includes('if (root === "company") return "/company";'), 'dynamic route identifiers are not collapsed');

all(css, ['.va-summary-grid', '.va-trend', '.va-recent-row', '@media (max-width: 900px)', '@media (max-width: 720px)', 'min-height: 44px', 'overflow-x: auto'], 'css');
const jsName = '17b-owner-visitor-analytics-issue101.js';
const jsIndex = parts.indexOf(jsName);
ok(jsIndex >= 0 && jsIndex === parts.indexOf('18-account-theme-startup.js') - 1, 'analytics JS must load immediately before startup');
ok(parts.indexOf('16-router-assistant-shell.js') < jsIndex, 'analytics JS must load after router/settings');
ok(styles.includes('45-owner-visitor-analytics-issue101.css'), 'analytics stylesheet missing from manifest');
ok(pkg.version === '17.3.31', 'draft must not preemptively change release version');
ok(pkg.scripts['verify:visitor-analytics'] === 'node v17/scripts/audit-owner-visitor-analytics-issue101.mjs', 'dedicated audit script missing');
ok(pkg.scripts.build.includes('npm run verify:visitor-analytics'), 'full build does not run Issue #101 audit');

console.log('Issue #101 owner visitor analytics audit passed.');