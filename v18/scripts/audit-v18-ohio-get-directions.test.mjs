import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { buildCoverageReport, inspectGoogleDirectionsUrl, validateDestinationOnlyAction } from "./audit-v18-ohio-get-directions.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const v18Root = path.resolve(here, "..");
let server;
let destination;
let candidates;
let padPage;

function pad(overrides = {}) {
  return {
    padId: "333598ca-37b3-4b44-9411-a490cc3da672",
    canonicalId: "333598ca-37b3-4b44-9411-a490cc3da672",
    legacyId: "ascent--example",
    aliases: [],
    recordNumber: 1,
    recordRevision: "1",
    recordType: "pad",
    company: "Ascent",
    padName: "EXAMPLE",
    state: "Ohio",
    county: "Harrison",
    township: "Green",
    address: "",
    coordinate: { latitude: 40.25403, longitude: -80.913577, role: "driver_entrance" },
    mapReference: null,
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: "",
    writtenDirections: "",
    verificationStatus: "",
    operatingStatus: "",
    updatedAt: null,
    ...overrides,
  };
}

function status(routeUrl = null) {
  return {
    padId: "333598ca-37b3-4b44-9411-a490cc3da672",
    recordRevision: "1",
    dataState: "live",
    route: { state: "ready", source: "exact_graph", geometry: null, safeReason: null, lastVerifiedAt: null, writtenDirections: null },
    graph: { state: "active_current", county: "Harrison", publicSource: "BrineSearch Authoritative Graph", lastVerifiedAt: null },
    google: { publicState: routeUrl ? "ready" : "not_published", routeUrl, safeReason: null },
    destination: { available: true, role: "driver_entrance", latitude: 40.25403, longitude: -80.913577 },
    routeSteps: [],
  };
}

function lawson(overrides = {}) {
  return pad({
    padId: "143f5268-33e4-4598-8101-40220b5cfdc4",
    canonicalId: "143f5268-33e4-4598-8101-40220b5cfdc4",
    legacyId: "ascent--lawson",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "LAWSON",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → US-250 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → I-70 → Exit 193 → OH-513 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd",
    ...overrides,
  });
}

function bilinovich(overrides = {}) {
  return pad({
    padId: "59061829-1122-4aae-872d-cf5024310373",
    canonicalId: "59061829-1122-4aae-872d-cf5024310373",
    legacyId: "ascent--bilinovich",
    recordRevision: "1787802711836476",
    company: "Ascent",
    padName: "BILINOVICH",
    county: "Guernsey",
    structuredRoadSequence: "US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH",
    coordinate: null,
    mapReference: { latitude: 40.08738445, longitude: -81.3028262, role: "reference", kind: "saved_pad_reference" },
    ...overrides,
  });
}

const unavailableView = {
  available: false,
  state: "unavailable",
  routeUrl: null,
  reason: "No exact approved route is available for a Google handoff.",
  mode: null,
  approachLabel: null,
  finalLegMode: null,
  selectionRequired: false,
};

before(async () => {
  server = await createServer({
    root: v18Root,
    configFile: path.join(v18Root, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
  });
  destination = await server.ssrLoadModule("/src/data/googleDestination.ts");
  candidates = await server.ssrLoadModule("/src/data/reviewedNavigationCandidates.ts");
  padPage = await server.ssrLoadModule("/src/features/pad/PadPage.tsx");
});

after(async () => {
  await server?.close();
});

describe("Ohio-wide Get Directions precedence and trusted coordinates", () => {
  it("1. released/approved route wins over every fallback", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.1%2C-81.1";
    const view = padPage.buildGoogleHandoffView(status(routeUrl), true, true);
    const action = padPage.buildFixedNavigationAction(view, lawson(), candidates.reviewedNavigationCandidateForPad(lawson()));
    assert.equal(action.kind, "approved_route");
    assert.equal(action.href, routeUrl);
    assert.equal(action.title, "GET DIRECTIONS");
  });

  it("2. exact owner-reviewed route wins over trusted GPS", () => {
    const action = padPage.buildFixedNavigationAction(unavailableView, lawson());
    assert.equal(action.kind, "reviewed_route");
    assert.equal(action.href, candidates.LAWSON_REVIEWED_GOOGLE_URL);
    assert.equal(action.detail, "Owner-reviewed route in Google Maps");
  });

  it("3. saved pad GPS produces a current-location Google URL", () => {
    const value = pad({ coordinate: null, mapReference: { latitude: 40.2, longitude: -80.8, role: "reference", kind: "saved_pad_reference" } });
    const action = padPage.buildFixedNavigationAction(unavailableView, value, null);
    assert.deepEqual(validateDestinationOnlyAction(action, destination.trustedPadDestination(value)), []);
    assert.equal(new URL(action.href).searchParams.get("origin"), null);
  });

  it("4. verified driver entrance produces a current-location Google URL", () => {
    const value = pad();
    const trusted = destination.trustedPadDestination(value);
    assert.equal(trusted.source, "verified_driver_entrance");
    assert.deepEqual(validateDestinationOnlyAction(padPage.buildFixedNavigationAction(unavailableView, value, null), trusted), []);
  });

  it("5. official pad reference retains the truthful not-an-entrance boundary", () => {
    const value = pad({ coordinate: null, mapReference: { latitude: 40.2, longitude: -80.8, role: "reference", kind: "official_pad_reference" } });
    const action = padPage.buildFixedNavigationAction(unavailableView, value, null);
    assert.match(action.detail, /ODNR official pad GPS · not an entrance/);
    assert.deepEqual(validateDestinationOnlyAction(action, destination.trustedPadDestination(value)), []);
  });

  it("6. official wellhead reference retains the truthful not-an-entrance boundary", () => {
    const value = pad({ coordinate: null, mapReference: { latitude: 40.2, longitude: -80.8, role: "reference", kind: "official_wellhead_reference" } });
    const action = padPage.buildFixedNavigationAction(unavailableView, value, null);
    assert.match(action.detail, /ODNR official wellhead GPS · not an entrance/);
    assert.deepEqual(validateDestinationOnlyAction(action, destination.trustedPadDestination(value)), []);
  });

  it("7-10. missing, partial, and invalid coordinates stay disabled", () => {
    const values = [
      pad({ coordinate: null, mapReference: null }),
      pad({ coordinate: { latitude: 40.2, longitude: undefined, role: "driver_entrance" }, mapReference: null }),
      pad({ coordinate: { latitude: undefined, longitude: -80.8, role: "driver_entrance" }, mapReference: null }),
      pad({ coordinate: { latitude: 91, longitude: -80.8, role: "driver_entrance" }, mapReference: null }),
    ];
    for (const value of values) {
      assert.equal(destination.trustedPadDestination(value), null);
      assert.deepEqual(padPage.buildFixedNavigationAction(unavailableView, value, null), {
        kind: "unavailable",
        href: null,
        title: "GET DIRECTIONS",
        detail: "No trusted GPS destination",
        ariaLabel: "Navigation unavailable because this pad has no explicitly sourced GPS destination",
      });
    }
  });

  it("11-13. same-name and stale records never cross-bind reviewed routes", () => {
    assert.equal(candidates.reviewedNavigationCandidateForPad(lawson({ padId: "other", canonicalId: "other", company: "Other" })), null);
    assert.equal(candidates.reviewedNavigationCandidateForPad(lawson({ padId: "other-county", canonicalId: "other-county", county: "Belmont" })), null);
    assert.equal(candidates.reviewedNavigationCandidateForPad(lawson({ recordRevision: "stale" })), null);
  });

  it("14-15. destination-only URL omits origin and preserves exact destination and required controls", () => {
    const value = pad();
    const href = destination.padDestinationNavigationUrl(value);
    const inspected = inspectGoogleDirectionsUrl(href);
    assert.deepEqual(inspected.failures, []);
    assert.equal(inspected.url.searchParams.get("origin"), null);
    assert.equal(inspected.url.searchParams.get("destination"), "40.25403,-80.913577");
    assert.equal(inspected.url.searchParams.get("waypoints"), null);
  });

  it("16. BILINOVICH reviewed no-Blaze route remains exact", () => {
    const value = bilinovich();
    const reviewed = candidates.reviewedNavigationCandidateForPad(value);
    assert.equal(reviewed.routeUrl, candidates.BILINOVICH_REVIEWED_GOOGLE_URL);
    assert.doesNotMatch(value.structuredRoadSequence, /Blaze/i);
    assert.match(value.structuredRoadSequence, /McCoy.*Merry.*Penrose.*Logan.*Turkle/i);
  });

  it("17. LAWSON reviewed route remains exact", () => {
    assert.equal(candidates.reviewedNavigationCandidateForPad(lawson()).routeUrl, candidates.LAWSON_REVIEWED_GOOGLE_URL);
  });

  it("18. offline status cannot expose an unconfirmed approved link and exact GPS fallback remains fail-closed", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.1%2C-81.1";
    const offline = padPage.buildGoogleHandoffView(status(routeUrl), true, true, routeUrl, false);
    assert.equal(offline.available, false);
    assert.equal(offline.routeUrl, null);
    const action = padPage.buildFixedNavigationAction(offline, pad(), null);
    assert.equal(action.kind, "destination_pin");
    assert.deepEqual(validateDestinationOnlyAction(action, destination.trustedPadDestination(pad())), []);
  });

  it("19. multiple named approaches still require explicit selection", () => {
    const selection = padPage.buildGoogleHandoffView(status(null), false, false, null, true, null, true);
    const action = padPage.buildFixedNavigationAction(selection, pad(), null);
    assert.equal(action.kind, "unavailable");
    assert.equal(action.href, null);
    assert.equal(action.title, "GET DIRECTIONS");
    assert.match(action.detail, /Choose one reviewed approach/);
  });

  it("20. every pad page source contains exactly one fixed navigation action", async () => {
    const source = await readFile(path.join(v18Root, "src/features/pad/PadPage.tsx"), "utf8");
    assert.equal((source.match(/<FixedNavigateAction\b/g) || []).length, 1);
    assert.equal((source.match(/className="pad-fixed-navigation"/g) || []).length, 1);
  });
});

describe("required negative mutations are rejected", () => {
  it("rejects a fixed origin", () => {
    const href = `${destination.padDestinationNavigationUrl(pad())}&origin=Cadiz%2C%20OH`;
    assert.ok(inspectGoogleDirectionsUrl(href).failures.includes("fixed_origin"));
  });

  it("rejects a non-Google HTTPS endpoint", () => {
    const href = destination.padDestinationNavigationUrl(pad()).replace("https://www.google.com/maps/dir/", "https://example.invalid/maps/dir/");
    assert.ok(inspectGoogleDirectionsUrl(href).failures.includes("unexpected_google_endpoint"));
  });

  it("fails the complete coverage report for a non-Google HTTPS endpoint", async () => {
    const padPageSource = await readFile(path.join(v18Root, "src/features/pad/PadPage.tsx"), "utf8");
    const runtime = {
      trustedPadDestination: destination.trustedPadDestination,
      padDestinationNavigationUrl: destination.padDestinationNavigationUrl,
      reviewedNavigationCandidateForPad: candidates.reviewedNavigationCandidateForPad,
      reviewedPadIds: new Set([
        "143f5268-33e4-4598-8101-40220b5cfdc4",
        "59061829-1122-4aae-872d-cf5024310373",
      ]),
      unavailableView,
      buildFixedNavigationAction(view, value, reviewed) {
        const action = padPage.buildFixedNavigationAction(view, value, reviewed);
        return action.href
          ? { ...action, href: action.href.replace("https://www.google.com/maps/dir/", "https://example.invalid/maps/dir/") }
          : action;
      },
    };
    const report = await buildCoverageReport({
      rows: [pad(), lawson(), bilinovich()],
      snapshotId: "test-snapshot",
      sourceRevision: "test-revision",
      sourceState: "live_current",
      generatedAt: "2026-08-27T00:00:00.000Z",
    }, {
      rowCount: 0,
      contentSha256: "test-reference-digest",
    }, runtime, padPageSource);

    assert.equal(report.urlValidation.unexpectedGoogleEndpoints.length, 3);
    assert.ok(report.violations.includes("unexpected Google endpoints: 3"));
  });

  it("rejects a swapped destination", () => {
    const action = padPage.buildFixedNavigationAction(unavailableView, pad(), null);
    assert.ok(validateDestinationOnlyAction(action, { latitude: 40.1, longitude: -81.1 }).includes("destination_mismatch"));
  });

  it("rejects latitude-only and longitude-only", () => {
    assert.equal(destination.trustedPadDestination(pad({ coordinate: { latitude: 40.2, longitude: undefined, role: "driver_entrance" } })), null);
    assert.equal(destination.trustedPadDestination(pad({ coordinate: { latitude: undefined, longitude: -80.8, role: "driver_entrance" } })), null);
  });

  it("rejects name-only reviewed binding", () => {
    assert.equal(candidates.reviewedNavigationCandidateForPad(lawson({ padId: "wrong", canonicalId: "wrong", legacyId: "wrong" })), null);
  });

  it("rejects reviewed binding without the exact record revision", () => {
    assert.equal(candidates.reviewedNavigationCandidateForPad(lawson({ recordRevision: "" })), null);
  });

  it("rejects destination fallback outranking a reviewed route", () => {
    assert.equal(padPage.buildFixedNavigationAction(unavailableView, lawson()).kind, "reviewed_route");
  });

  it("rejects a fabricated link for missing GPS", () => {
    const action = padPage.buildFixedNavigationAction(unavailableView, pad({ coordinate: null, mapReference: null }), null);
    assert.equal(action.href, null);
    assert.equal(action.kind, "unavailable");
  });

  it("rejects rendering two fixed actions", async () => {
    const source = await readFile(path.join(v18Root, "src/features/pad/PadPage.tsx"), "utf8");
    const mutated = `${source}\n<FixedNavigateAction view={googleHandoff} pad={pad}/>`;
    assert.equal((source.match(/<FixedNavigateAction\b/g) || []).length, 1);
    assert.equal((mutated.match(/<FixedNavigateAction\b/g) || []).length, 2);
  });

  it("rejects changing BILINOVICH back to Blaze Road", () => {
    const mutated = bilinovich({ structuredRoadSequence: bilinovich().structuredRoadSequence.replace("Merry Rd / TR-967 → Penrose Rd / CR-694", "Blaze Rd") });
    assert.equal(candidates.reviewedNavigationCandidateForPad(mutated), null);
  });

  it("rejects removing the GPS-only non-approved warning", () => {
    const action = padPage.buildFixedNavigationAction(unavailableView, pad(), null);
    const mutated = { ...action, detail: "Open Google Maps" };
    assert.ok(validateDestinationOnlyAction(mutated, destination.trustedPadDestination(pad())).includes("missing_gps_only_warning"));
  });
});
