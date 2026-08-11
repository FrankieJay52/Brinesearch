import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const preview = process.env.V17_PREVIEW_URL || "http://127.0.0.1:4173";
const canonicalId = "97000000-0000-4000-8000-000000000001";
const selectedIdentityId = "97000000-0000-4000-8000-000000000002";
const connectedIdentityId = "97000000-0000-4000-8000-000000000003";
const junctionId = "97000000-0000-4000-8000-000000000004";
const heldJunctionId = "97000000-0000-4000-8000-000000000005";

const registry = {
  dataset_count: 15,
  counties: [
    { state_code: "OH", county_code: "WAS", county_name: "Washington" },
    { state_code: "PA", county_code: "WAS", county_name: "Washington" },
    { state_code: "WV", county_code: "OHI", county_name: "Ohio" }
  ]
};
const result = {
  identity_id: selectedIdentityId,
  source_identity_key: "WV:WVDOT:ROUTE_ID:3500895000000",
  display_name: "Thrush Avenue",
  normalized_name: "thrush avenue",
  state_code: "WV", county_code: "OHI", county_name: "Ohio",
  road_class: "local", public_access_status: "public", drivable_status: "drivable",
  identity_kind: "source_only", names: [{ name: "Thrush Ave", type: "official" }],
  source: { agency: "WVDOT", dataset: "SAMS", layer: "118" }
};
const detail = {
  ...result,
  route_system: "SAMS", route_number: "3500895000000",
  source: { ...result.source, version: "current", url: "https://gis.transportation.wv.gov/arcgis/rest/services/Roads_And_Highways/Publication_LRS/FeatureServer/118" },
  canonical_mappings: [],
  names: [{ name: "Thrush Ave", type: "official" }],
  name_event_count: 251,
  name_events_truncated: true,
  segment_summary: { count: 2, source_record_count: 101, source_records_truncated: true }
};
const memberships = [
  {
    identity_id: selectedIdentityId, source_identity_key: result.source_identity_key,
    display_name: "Thrush Avenue", road_class: "local", membership_role: "through",
    identity_kind: "source_only", public_access_status: "public", aliases: ["Thrush Ave"],
    source: { agency: "WVDOT", dataset: "SAMS", layer: "118", version: "current" }
  },
  {
    identity_id: connectedIdentityId, source_identity_key: "WV:WVDOT:ROUTE_ID:3500272000000",
    canonical_road_id: canonicalId, display_name: "E Cardinal Avenue", road_class: "local",
    membership_role: "terminus", identity_kind: "canonical", public_access_status: "public",
    aliases: ["E Cardinal Ave"], source: { agency: "WVDOT", dataset: "SAMS", layer: "118", version: "current" }
  }
];
const connectionPayload = {
  order_status: "authoritative_measure", has_more: false, next_cursor: null,
  connections: [
    {
      junction_id: junctionId, junction_key: "wv-oak-shared", display_id: "WV-OHI-SHARED-1",
      junction_type: "shared_segment", membership_role: "through", distance_along_road_m: 10,
      county_name: "Ohio", source_method: "authoritative_shared_section",
      verification_status: "verified", confidence: "authoritative",
      anchors: [
        { anchor_role: "shared_start", coordinate: [-80.7132, 40.0841] },
        { anchor_role: "shared_end", coordinate: [-80.7130, 40.0843] }
      ],
      shared_geometry: { type: "LineString", coordinates: [[-80.7132, 40.0841], [-80.7130, 40.0843]] },
      memberships, build: { algorithm_version: "issue97-authoritative-topology-v2", source_revision_digest: "a".repeat(32) }
    },
    {
      junction_id: heldJunctionId, junction_key: "wv-held-overpass", display_id: "WV-OHI-HELD-1",
      junction_type: "intersection", distance_along_road_m: 20,
      county_name: "Ohio", source_method: "grade_conflict", verification_status: "held",
      confidence: "held", anchors: [{ anchor_role: "point", coordinate: [-80.7129, 40.0855] }],
      memberships, build: { algorithm_version: "issue97-authoritative-topology-v2", source_revision_digest: "b".repeat(32) }
    }
  ]
};
const canonicalRoad = {
  id: canonicalId, canonical_name: "Connected Canonical Road", normalized_name: "connected canonical road",
  road_type: "local", state: "WV", county: "Ohio", aliases: [], verification_status: "verified",
  source_url: "https://gis.transportation.wv.gov/", source_record_id: "3500272000000",
  geometry_status: "official_centerline_loaded"
};

function response(route, value, status = 200, contentType = "application/json") {
  return route.fulfill({ status, contentType, body: contentType === "application/json" ? JSON.stringify(value) : value });
}

async function installMocks(context, role, requestLog, tileCounter, mappingStatus = "verified") {
  const permissions = role === "owner" ? ["owner", "administrator", "editor"] : ["editor"];
  const profile = { user_id: `issue97-${role}`, email: `${role}@example.invalid`, display_name: `Issue 97 ${role}`, role, permissions };
  await context.addInitScript(({ profile: savedProfile }) => {
    localStorage.setItem("brinesearch.editorSession.v1", JSON.stringify({
      access_token: "issue97-mocked-token", refresh_token: "issue97-mocked-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: savedProfile.user_id, email: savedProfile.email, user_metadata: { display_name: savedProfile.display_name } }
    }));
  }, { profile });
  await context.route("https://tile.openstreetmap.org/**", route => {
    tileCounter.count += 1;
    return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
  });
  await context.route("https://wvxzqtoiwhrgovzddtvz.supabase.co/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    let body = {};
    try { body = request.postDataJSON() || {}; } catch {}
    requestLog.push({ pathname: url.pathname, search: url.search, body });
    if (url.pathname.endsWith("/rpc/my_editor_status")) return response(route, [profile]);
    if (url.pathname.endsWith("/editor_accounts")) return response(route, [profile]);
    if (url.pathname.endsWith("/rpc/brinesearch_authoritative_road_registry")) {
      await new Promise(resolve => setTimeout(resolve, 80));
      return response(route, registry);
    }
    if (url.pathname.endsWith("/rpc/brinesearch_authoritative_road_search")) return response(route, { results: [result], has_more: false, next_cursor: null });
    if (url.pathname.endsWith("/rpc/brinesearch_authoritative_road_detail")) return response(route, detail);
    if (url.pathname.endsWith("/rpc/brinesearch_authoritative_road_connections")) return response(route, connectionPayload);
    if (url.pathname.endsWith("/rpc/brinesearch_authoritative_road_connections_for_canonical")) return response(route, connectionPayload);
    if (url.pathname.endsWith("/rpc/brinesearch_authoritative_identities_for_road")) return response(route, {
      road_id: canonicalId,
      identities: [{ identity_id: connectedIdentityId, mapping_status: mappingStatus }]
    });
    if (url.pathname.endsWith("/brinesearch_roads") && url.searchParams.get("id") === `eq.${canonicalId}`) return response(route, [canonicalRoad]);
    if (url.pathname.endsWith("/brinesearch_roads")) return response(route, []);
    if (url.pathname.includes("/rpc/")) return response(route, {});
    return response(route, []);
  });
}

async function openOfficial(page) {
  await page.goto(`${preview}/#/settings/roads`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-road-manager-tab="official"]').waitFor();
  await page.locator('[data-road-manager-tab="official"]').click();
  await page.locator("#roadOfficialSearchIssue97").waitFor();
  await page.getByText("15 authoritative datasets").waitFor();
}

async function openThrushAndConnections(page) {
  await openOfficial(page);
  await page.locator("#roadOfficialStateIssue97").selectOption("");
  await page.locator("#roadOfficialCountyIssue97").selectOption("PA|WAS");
  await page.locator("#roadOfficialCountyIssue97").dispatchEvent("change");
  await page.locator("#roadOfficialSearchIssue97").fill("T");
  await page.waitForTimeout(260);
  await page.getByText("Enter at least two characters").waitFor();
  await page.locator("#roadOfficialSearchIssue97").fill("Thrush");
  await page.waitForTimeout(280);
  await page.getByText("Thrush Avenue", { exact: true }).click();
  await page.getByText("Shared section", { exact: true }).waitFor();
  await page.getByText("Held — not route-selectable", { exact: true }).waitFor();
}

const browser = await chromium.launch({ headless: true });
try {
  // Stale SPA-render regression gets its own authenticated context. It must not
  // contaminate the actual Owner Road Manager scenario that follows.
  {
    const context = await browser.newContext({ viewport: { width: 1180, height: 850 } });
    const requests = [];
    const tiles = { count: 0 };
    await installMocks(context, "owner", requests, tiles);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.stack || error.message));
    await page.goto(`${preview}/#/settings/roads`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-road-manager-tab="official"]').waitFor();
    await page.locator('[data-road-manager-tab="official"]').click();
    await page.evaluate(() => { location.hash = "#/settings"; });
    await page.waitForTimeout(150);
    assert.equal(pageErrors.length, 0, `stale registry render threw after tab navigation: ${pageErrors.join("\n")}`);
    await context.close();
  }

  // Normal Owner and Editor flows each start from a single fresh authenticated
  // app document. This verifies the real product path, not hash-router cleanup
  // from another scenario.
  for (const role of ["owner", "editor"]) {
    const context = await browser.newContext({ viewport: { width: 1180, height: 850 } });
    const requests = [];
    const tiles = { count: 0 };
    await installMocks(context, role, requests, tiles);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.stack || error.message));

    await openThrushAndConnections(page);
    const countyRequest = [...requests].reverse().find(item => item.pathname.endsWith("brinesearch_authoritative_road_search"));
    assert.equal(countyRequest?.body?.p_state_code, "PA", "duplicate WAS county filter lost its state");
    assert.equal(countyRequest?.body?.p_county_code, "WAS", "duplicate WAS county filter lost its county code");
    await page.getByText(/more source name or segment provenance records/).waitFor();
    assert.equal(await page.locator("text=0.0000000, 0.0000000").count(), 0, "invalid [0,0] was rendered as exact GPS");
    await page.locator('[data-road-official-copy="40.0841000, -80.7132000"]').waitFor();
    await page.waitForTimeout(100);
    assert.ok(tiles.count > 0, "authoritative junction map did not request the allowed OSM tile origin");

    const connected = page.locator(`[data-road-official-open-connected="${connectedIdentityId}"]`).first();
    await connected.click();
    if (role === "owner") {
      const nameInput = page.locator('#roadManagerEditor input[name="canonical_name"]');
      await nameInput.waitFor();
      assert.equal(await nameInput.inputValue(), "Connected Canonical Road", "owner did not open the exact canonical Road Manager editor");
      assert.equal(await page.locator('#roadManagerEditor input[name="id"]').inputValue(), canonicalId,
        "owner canonical editor opened a different Road Manager UUID");
      assert.ok(requests.some(item => item.pathname.endsWith("/rpc/brinesearch_authoritative_identities_for_road")
        && item.body?.p_road_id === canonicalId),
        "canonical handoff did not revalidate the current exact authoritative mapping");
      assert.ok(requests.some(item => item.pathname.endsWith("/brinesearch_roads") && item.search.includes(`id=eq.${canonicalId}`)),
        "canonical connected-road cache miss did not fetch the exact Road Manager row");
    } else {
      await page.getByText("Thrush Avenue", { exact: true }).waitFor();
      assert.equal(await page.locator("#roadManagerEditor").count(), 0, "read-only editor reached canonical Road Manager edit UI");
      assert.equal(requests.some(item => item.pathname.endsWith("/rpc/brinesearch_authoritative_identities_for_road")), false,
        "read-only editor should not request canonical edit-mapping verification");
    }
    assert.equal(pageErrors.length, 0, `${role} official-roads browser errors:\n${pageErrors.join("\n")}`);
    await context.close();
  }

  // Historical graph membership is not enough for editable canonical mode.
  // A stale/candidate current mapping must stay on the source identity even for Owner.
  {
    const context = await browser.newContext({ viewport: { width: 1180, height: 850 } });
    const requests = [];
    const tiles = { count: 0 };
    await installMocks(context, "owner", requests, tiles, "candidate");
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.stack || error.message));
    await openThrushAndConnections(page);
    await page.locator(`[data-road-official-open-connected="${connectedIdentityId}"]`).first().click();
    await page.getByText("E Cardinal Avenue", { exact: true }).waitFor();
    assert.equal(await page.locator('#roadManagerEditor input[name="canonical_name"]').count(), 0,
      "stale/candidate canonical mapping incorrectly reached editable Road Manager UI");
    assert.equal(requests.some(item => item.pathname.endsWith("/brinesearch_roads") && item.search.includes(`id=eq.${canonicalId}`)), false,
      "stale/candidate canonical mapping incorrectly fetched editable canonical road row");
    assert.equal(pageErrors.length, 0, `stale-mapping owner browser errors:\n${pageErrors.join("\n")}`);
    await context.close();
  }

  const csp = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
  assert.match(csp, /img-src[^\n]*https:\/\/tile\.openstreetmap\.org/,
    "Netlify CSP does not allow the authoritative junction map tile origin");
  console.log("Issue #97 authenticated Road Manager browser audit passed (isolated stale render + verified owner handoff + read-only editor + stale-mapping fail-closed).");
} finally {
  await browser.close();
}
