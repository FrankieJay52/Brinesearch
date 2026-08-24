import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
const compact = (value) => value.replace(/\s+/g, " ").trim().toLowerCase();

function runtimeSource(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).map((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return runtimeSource(target);
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? fs.readFileSync(target, "utf8") : "";
  }).join("\n");
}

const initialMigration = read("supabase/migrations/20260816170000_owner_approved_routes_map.sql");
const viewportFix = read("supabase/migrations/20260816170100_owner_approved_routes_map_viewport_fix.sql");
const performanceMigration = read("supabase/migrations/20260816170200_owner_approved_routes_map_viewport_performance.sql");
const primaryFocusMigration = read("supabase/migrations/20260823203500_v18_owner_map_primary_route_focus.sql");
const session = read("v18/src/data/ownerSession.ts");
const supabaseClient = read("v18/src/data/supabaseClient.ts");
const access = read("v18/src/data/OwnerAccessContext.tsx");
const fieldUpdates = read("v18/src/data/fieldUpdates.ts");
const adapter = read("v18/src/data/ownerRoads.ts");
const adapterTest = read("v18/src/data/ownerRoads.test.ts");
const mapModel = read("v18/src/features/owner-roads/ownerRoadMapModel.ts");
const map = read("v18/src/features/owner-roads/OwnerApprovedRoutesPage.tsx");
const app = read("v18/src/app/App.tsx");
const settings = read("v18/src/features/settings/SettingsPage.tsx");
const controlCenter = read("v18/src/features/control-center/ControlCenterPage.tsx");
const signIn = read("v18/src/features/auth/OwnerSignInPage.tsx");
const runtime = runtimeSource(path.join(root, "v18/src"));
const errors = [];

function requireText(source, needle, label = needle) {
  if (!compact(source).includes(compact(needle))) errors.push(`missing ${label}`);
}

function forbid(source, pattern, label) {
  if (pattern.test(source)) errors.push(label);
}

forbid(initialMigration + viewportFix + performanceMigration + primaryFocusMigration, />\s*case\s+when\s+v_zoom/i, "viewport limit CASE expression is not parenthesized for PL/pgSQL parsing");

for (const [name, source] of [["initial migration", initialMigration], ["performance migration", performanceMigration], ["primary-focus migration", primaryFocusMigration]]) {
  requireText(source, "security definer", `${name} SECURITY DEFINER`);
  requireText(source, "set search_path = ''", `${name} fixed empty search_path`);
  requireText(source, "public.is_brinesearch_owner(auth.uid())", `${name} inner owner gate`);
}
requireText(initialMigration, "revoke all on function public.owner_approved_routes_map_viewport", "viewport PUBLIC/anon revoke");
requireText(initialMigration, "revoke all on function public.owner_approved_routes_map_road_detail", "detail PUBLIC/anon revoke");
requireText(initialMigration, "revoke all on function public.owner_approved_routes_map_pad_options", "pad options PUBLIC/anon revoke");
requireText(initialMigration, "grant execute on function public.owner_approved_routes_map_road_detail(uuid) to authenticated", "authenticated detail execute grant");
requireText(performanceMigration, "grant execute on function public.owner_approved_routes_map_viewport", "authenticated final viewport execute grant");
forbid(initialMigration + performanceMigration, /grant\s+execute[\s\S]{0,250}\bto\s+(?:public|anon)\b/i, "owner-map RPC execution is granted to PUBLIC/anon");

requireText(viewportFix, "p.latitude", "production pad latitude correction");
requireText(viewportFix, "p.longitude", "production pad longitude correction");
requireText(performanceMigration, "c.geom operator(extensions.&&) v_bbox", "indexed ODOT bounding-box filter");
requireText(performanceMigration, "s.geom operator(extensions.&&) v_bbox", "indexed external-road bounding-box filter");
requireText(performanceMigration, "limit v_limit+1", "bounded viewport truncation probe");
requireText(performanceMigration, "limit v_limit", "bounded viewport payload");
requireText(performanceMigration, "p_route_systems text[]", "exact route-system filter");
requireText(performanceMigration, "extensions.st_collectionextract", "line-only clipped geometry output");
requireText(primaryFocusMigration, "rp.pad_id=p_pad_id", "selected-location exact pad filter");
requireText(primaryFocusMigration, "and rp.route_group='primary'", "selected-location primary route gate");
requireText(primaryFocusMigration, "and rp.variant_index=1", "selected-location primary variant gate");
requireText(primaryFocusMigration, "pg_catalog.strpos(", "valid schema-qualified primary-route assertion");
forbid(primaryFocusMigration, /pg_catalog\.position\s*\(/i, "primary-route migration schema-qualifies PostgreSQL POSITION special syntax");
forbid(primaryFocusMigration, /(?:route_group\s*=\s*'alternate'|variant_index\s*=\s*2)/i, "selected-location focus includes an alternate route variant");

const finalSql = compact(primaryFocusMigration);
const precedence = [
  "then 'restricted'",
  "when not b.current_scope then 'held'",
  "then 'approved_by_policy'",
  "then 'explicitly_approved'",
  "then 'candidate'",
  "else 'reference_only'",
].map((needle) => finalSql.indexOf(needle));
if (precedence.some((index) => index < 0) || precedence.some((index, position) => position > 0 && index <= precedence[position - 1])) {
  errors.push("fail-closed road classification precedence changed");
}
requireText(initialMigration, "private_verification.brinesearch_issue97_graph_build_release_current", "release-current junction gate");
requireText(initialMigration, "j.junction_type<>'shared_segment'", "shared-segment geometry exclusion from physical junction coordinates");
requireText(initialMigration, "extensions.st_geometrytype(j.geom)='ST_Point'", "exact point-only junction coordinate gate");
requireText(initialMigration, "greatest(c.last_seen_at,c.dataset_fetched_at,c.dataset_source_timestamp)", "current production identity verification timestamp");
forbid(initialMigration, /greatest\(c\.updated_at\s*,/i, "road detail references the nonexistent authoritative identity updated_at column");

requireText(supabaseClient, '"brinesearch.v18AuthSession.v1"', "V18-only persisted auth namespace");
requireText(session, "signInWithPassword", "native V18 password sign-in");
requireText(session, 'signOut({ scope: "local" })', "local-device V18 sign-out");
requireText(session, '"owner_approved_routes_map_viewport"', "owner RPC allowlist viewport");
requireText(session, '"owner_approved_routes_map_road_detail"', "owner RPC allowlist detail");
requireText(session, '"owner_approved_routes_map_pad_options"', "owner RPC allowlist pad options");
requireText(session, "my_editor_status", "server-returned UI owner role check");
requireText(session, "Authorization: `Bearer ${session.access_token}`", "authenticated owner RPC transport");
forbid(runtime, /legacyBrineSearchPaths|https?:\/\/brinesearch\.com\/index\.html#|brinesearch\.editorSession\.v1/i, "reachable V18 runtime still contains an old-app bridge or session contract");
forbid(session + adapter + map, /service[_-]?role/i, "privileged service-role material appears in V18 owner feature");
forbid(session + adapter + map, /method:\s*["'](?:PUT|PATCH|DELETE)["']/i, "owner feature contains a write HTTP method");

requireText(adapterTest, "private_review_notes", "private-field injection regression coverage marker");
forbid(adapter, /private_review_notes|owner_notes|review_notes|evidence_payload/i, "private review fields appear in the V18 data adapter");
requireText(adapter, "validateOwnerRoadViewport", "safe viewport response validator");
requireText(adapter, "validateOwnerRoadDetail", "safe detail response validator");
requireText(adapter, "p_route_systems", "route-system request mapping");
requireText(adapter, 'row.state === undefined ? ""', "minimal selected-pad viewport marker contract");

requireText(map, "selectedHaloLayerId", "selected-road halo layer");
requireText(map, "selectedPadLayerId", "selected-location graph-road highlight layer");
requireText(map, "syncSelectedRoad", "selected-road source/filter synchronization");
requireText(map, "ownerRoadSelection", "deterministic visible-road selection");
requireText(map, "ownerRoadPadOptions", "complete directory-to-owner selector connection");
requireText(mapModel, "for (const row of directoryRows)", "all-directory-location selector merge");
requireText(map, "loadPadStatus(selectedDirectoryPad", "reviewed public direction status connection");
requireText(map, "Reviewed field directions", "reviewed direction display");
requireText(map, "setStatuses(new Set(ownerRoadStatuses))", "all exact selected-location status classes included");
requireText(map, "mapReadyRef.current", "style-ready viewport request gate");
requireText(map, "viewportInFlightKeyRef.current === requestKey", "duplicate in-flight viewport request guard");
requireText(map, "viewportRequestTimeout", "bounded viewport request lifetime");
requireText(map, "scheduleViewportLoad", "debounced move viewport reload");
requireText(map, "queryRenderedFeatures", "interactive road hit testing");
requireText(map, "Location and road selection change display focus only", "selection authority legend");
requireText(map, "missing gaps remain unplotted", "pad route unresolved-gap disclosure");
requireText(map, "does not approve it, create route steps or geometry, change the graph", "route/graph authority disclosure");

requireText(access, "checkOwnerAccess", "shared UI owner access provider");
requireText(app, '<Route path="/settings/approved-routes" element={<OwnerApprovedRoutesPage/>}/>', "Owner Settings route");
requireText(app, '<Route path="/sign-in" element={<OwnerSignInPage/>}/>', "native V18 owner sign-in route");
requireText(app, "<OwnerAccessProvider>", "V18 owner access provider wiring");
requireText(settings, 'access.state === "owner"', "owner-only Settings navigation guard");
requireText(settings, 'to="/settings/approved-routes"', "Settings to owner map connection");
requireText(controlCenter, '<Link to="/settings/approved-routes" className="button-primary">', "Road Manager control center primary V18 map connection");
requireText(controlCenter, 'to="/sign-in?next=/settings/approved-routes"', "Control Center native V18 sign-in connection");
requireText(signIn, "signIn(email, password)", "native V18 owner form submission");
requireText(fieldUpdates, "/rest/v1/rpc/field_feed_list?select=", "public-field-selected V18 Field Updates RPC");
forbid(fieldUpdates, /author_id|real_name|image_urls/i, "nonessential Field Feed identity or image field appears in the V18 adapter");
forbid(controlCenter, /\{access\.state\s*===\s*["']owner["']\s*&&\s*<Link\s+to=["']\/settings\/approved-routes["']/, "V18 map launch is hidden behind the client-side owner check");

forbid(initialMigration + viewportFix + performanceMigration + primaryFocusMigration, /\b(?:insert\s+into|update\s+public\.|delete\s+from|truncate\s+table)\b/i, "Issue #108 migrations mutate road/route/graph data");
forbid(initialMigration + viewportFix + performanceMigration + primaryFocusMigration, /(?:activate|reconcile|publish).*\(/i, "Issue #108 migration invokes an authority-changing function");

if (errors.length) throw new Error(`V18 owner approved-routes map audit failed:\n- ${errors.join("\n- ")}`);
console.log("V18 owner approved-routes map audit passed: owner-only RPCs, all-location reviewed directions, bounded exact graph geometry, fail-closed classifications, and selected-location highlights are intact.");
