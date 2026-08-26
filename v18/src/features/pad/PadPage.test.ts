import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DriverPadStatus, DriverRouteChoice, PadSummary } from "@/data/types";
import { buildGoogleHandoffView, currentStatusForPad, destinationPinUrl, displayedRouteForChoice, FixedNavigateAction, PadGpsActions } from "./PadPage";

const padPage = readFileSync(new URL("./PadPage.tsx", import.meta.url), "utf8");
const padMapPreview = readFileSync(new URL("./PadMapPreview.tsx", import.meta.url), "utf8");
const padLayoutCss = readFileSync(new URL("./PadPageLayout.css", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../../styles/app.css", import.meta.url), "utf8");

function statusWithGoogle(routeUrl: string | null): DriverPadStatus {
  return {
    padId: "cologie-pad",
    recordRevision: "cologie-r1",
    dataState: "live",
    route: { state: "ready", source: "exact_graph", geometry: null, safeReason: null, lastVerifiedAt: null, writtenDirections: null },
    graph: { state: "active_current", county: "Harrison", publicSource: "BrineSearch Authoritative Graph", lastVerifiedAt: null },
    google: { publicState: "ready", routeUrl, safeReason: null },
    destination: { available: true, latitude: 40.25403, longitude: -80.913577 },
    routeSteps: [],
  };
}

function mappedPad(): PadSummary {
  return {
    padId: "cologie-pad",
    canonicalId: "cologie-pad",
    legacyId: "ascent--cologie",
    aliases: [],
    recordNumber: 1,
    recordRevision: "cologie-r1",
    recordType: "pad",
    company: "Ascent",
    padName: "COLOGIE",
    state: "Ohio",
    county: "Harrison",
    township: "",
    address: "",
    coordinate: { latitude: 40.25403, longitude: -80.913577, role: "driver_entrance" },
    mapReference: null,
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: "",
    writtenDirections: "",
    verificationStatus: "verified",
    operatingStatus: "active",
    updatedAt: null,
  };
}

describe("V18 pad legacy route fallback", () => {
  it("shows saved BrineSearch route data when structured route steps are absent", () => {
    expect(padPage).toContain('const hasSavedRouteFallback = displayedRouteSteps.length === 0 && Boolean(pad.structuredRoadSequence || status.route.writtenDirections);');
    expect(padPage).toContain('hasSavedRouteFallback ? "Saved BrineSearch route" : "No structured route"');
    expect(padPage).toContain("Legacy saved directions");
    expect(padPage).toContain("{pad.structuredRoadSequence && <p>{pad.structuredRoadSequence}</p>}");
  });

  it("lets the driver choose only independently approved exact route variants", () => {
    expect(padPage).toContain("loadDriverRouteChoices(pad)");
    expect(padPage).toContain("Choose the route you want to view");
    expect(padPage).toContain("Every option shown here independently passed the exact route, current graph, verified destination, and public projection gates.");
    expect(padPage).toContain("setSelectedRouteKey(choice.routeKey)");
    expect(padPage).toContain("Google publication remains a separate safety gate.");
  });

  it("keeps the fallback explicitly unverified and held behind route approval", () => {
    expect(padPage).toContain("This is not a verified structured route, and the Google Maps handoff stays disabled until approval is complete.");
    expect(padPage).toContain("<StatusBadge status={status.route.state}/>");
    expect(padPage).toContain('status.google.publicState === "ready"');
    expect(padPage).toContain("Boolean(status.google.routeUrl)");
  });

  it("offers one exact approved-route action and never exposes route chunks as choices", () => {
    expect(padPage).toContain("<FixedNavigateAction view={googleHandoff}/>");
    expect(padPage).toContain("<strong>Navigate</strong><small>Reviewed approved route</small>");
    expect(padPage).toContain("Approval begins at its verified ingress.");
    expect(padPage).not.toContain("Current public Google route");
    expect(padPage).not.toContain("status.google.safeReason ||");
    expect(padPage).not.toMatch(/Open route .* of/);
    expect(padPage).not.toContain("route-chunk-list");
    expect(padPage).not.toContain("DriverActionPanel");
  });

  it("renders exactly one fixed Navigate action only for a validated primary exact-route handoff", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&destination=40.25403%2C-80.913577";
    const availableView = buildGoogleHandoffView(statusWithGoogle(routeUrl), true, true);
    const availableHtml = renderToStaticMarkup(createElement(FixedNavigateAction, { view: availableView }));

    expect(availableHtml.match(/<a\b/g)).toHaveLength(1);
    expect(availableHtml).toContain(`href="${routeUrl.replaceAll("&", "&amp;")}"`);
    expect(availableHtml).toContain(">Navigate<");
    expect(availableHtml).toContain("Reviewed approved route");
    expect(availableHtml).toContain('class="pad-fixed-navigation"');
    expect(availableHtml).not.toMatch(/route [1-9] of/i);

    const missingView = buildGoogleHandoffView(statusWithGoogle(null), true, true);
    const missingHtml = renderToStaticMarkup(createElement(FixedNavigateAction, { view: missingView }));
    expect(missingView.state).toBe("unavailable");
    expect(missingHtml).toBe("");
  });

  it("shows the immutable reviewed release without waiting for the full status proof", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&destination=40.25403%2C-80.913577";
    const pending = statusWithGoogle(null);
    pending.google.publicState = "not_published";
    pending.route.state = "held";
    pending.graph.state = "held";

    const released = buildGoogleHandoffView(pending, false, true, routeUrl);
    expect(released).toMatchObject({ available: true, state: "ready", routeUrl });
    expect(buildGoogleHandoffView(pending, false, false, routeUrl).available).toBe(false);
  });

  it("removes both the fast release and atomic-status route links immediately when offline", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&destination=40.25403%2C-80.913577";
    const atomicStatus = statusWithGoogle(routeUrl);
    expect(buildGoogleHandoffView(atomicStatus, true, true, null, false)).toMatchObject({ available: false, state: "unavailable", routeUrl: null });
    expect(buildGoogleHandoffView(atomicStatus, true, true, routeUrl, false)).toMatchObject({ available: false, state: "unavailable", routeUrl: null });
    expect(padPage).toContain("currentReleasedHandoffPlan?.singleUrl || null,\n    online,");
  });

  it("keeps the atomic status route bound to the primary handoff and disables alternates", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&destination=40.25403%2C-80.913577";
    const status = statusWithGoogle(routeUrl);
    status.routeSteps = [{ order: 1, kind: "continue", displayName: "ATOMIC ROAD", verifiedDesignations: [], instruction: "Continue", distanceMiles: 1 }];
    status.route.geometry = { type: "FeatureCollection", features: [{ type: "Feature", properties: { stepOrder: 1 }, geometry: { type: "LineString", coordinates: [[-80.9, 40.1], [-80.8, 40.2]] } }] };
    const primary: DriverRouteChoice = {
      routeKey: "separately-fetched-primary",
      routeGroup: "primary",
      variantIndex: 1,
      label: "Route 1",
      steps: [{ order: 1, kind: "continue", displayName: "MUST NOT REPLACE ATOMIC ROAD", verifiedDesignations: [], instruction: "Continue", distanceMiles: 2 }],
      geometry: { type: "FeatureCollection", features: [{ type: "Feature", properties: { stepOrder: 1 }, geometry: { type: "LineString", coordinates: [[-81, 40], [-80.7, 40.3]] } }] },
      lastVerifiedAt: "2026-08-25T22:10:00Z",
      statusRevision: "choice-r1",
    };
    const alternate = { ...primary, routeKey: "alternate", routeGroup: "alternate" as const, label: "Route 2" };

    const primaryDisplay = displayedRouteForChoice(status, primary);
    expect(primaryDisplay.steps[0]?.displayName).toBe("ATOMIC ROAD");
    expect(primaryDisplay.geometry).toBe(status.route.geometry);
    expect(buildGoogleHandoffView(status, true, primaryDisplay.selectedRouteIsPrimary).available).toBe(true);

    const alternateDisplay = displayedRouteForChoice(status, alternate);
    expect(alternateDisplay.steps[0]?.displayName).toBe("MUST NOT REPLACE ATOMIC ROAD");
    expect(alternateDisplay.geometry).toBe(alternate.geometry);
    expect(buildGoogleHandoffView(status, true, alternateDisplay.selectedRouteIsPrimary).available).toBe(false);
  });

  it("never carries a previous pad status or Google link across a route-parameter change", () => {
    const previous = statusWithGoogle("https://www.google.com/maps/dir/?api=1&destination=40.25403%2C-80.913577");
    expect(currentStatusForPad(previous, { padId: "different-pad", recordRevision: previous.recordRevision })).toBeNull();
    expect(currentStatusForPad(previous, { padId: previous.padId, recordRevision: "different-revision" })).toBeNull();
    expect(currentStatusForPad(previous, { padId: previous.padId, recordRevision: previous.recordRevision })).toBe(previous);
  });

  it("never carries reviewed well rows across a pad or record-revision change", () => {
    expect(padPage).toContain('const recordKey = `${pad.padId}:${pad.recordRevision}`;');
    expect(padPage).toContain("setLoadedWellRows({ recordKey, rows })");
    expect(padPage).toContain('const padRecordKey = `${pad.padId}:${pad.recordRevision}`;');
    expect(padPage).toContain("loadedWellRows?.recordKey === padRecordKey ? loadedWellRows.rows : undefined");
    expect(padPage).not.toContain("setWellRows(next)");
  });

  it("keeps GPS utilities separate from the reviewed Navigate action", () => {
    const pad = mappedPad();
    const pinUrl = destinationPinUrl(pad);
    const html = renderToStaticMarkup(createElement(PadGpsActions, { pad }));

    expect(pinUrl).toBe("https://www.google.com/maps/search/?api=1&query=40.25403%2C-80.913577");
    expect(html).toContain("Copy GPS");
    expect(html).toContain("Open destination pin only");
    expect(html).toContain("Pin only — not an approved route.");
    expect(html).toContain("this is not an approved route");
    expect(html).not.toContain("Reviewed approved route");
    expect(html).not.toContain("/maps/dir/");
  });

  it("never turns a display-only reference coordinate into a Google pin action", () => {
    const referencePad = {
      ...mappedPad(),
      coordinate: null,
      mapReference: {
        latitude: 40.25,
        longitude: -80.91,
        role: "reference" as const,
        kind: "official_pad_reference" as const,
      },
    };
    const html = renderToStaticMarkup(createElement(PadGpsActions, { pad: referencePad }));

    expect(destinationPinUrl(referencePad)).toBeNull();
    expect(html).toContain("Copy GPS");
    expect(html).toContain("Pin link requires a verified driver entrance");
    expect(html).not.toContain("google.com/maps/search");
  });

  it("orders the pad content as header with compact map, wells, route, collapsed readiness, then freshness", () => {
    const sections = [
      padPage.indexOf('className="pad-header-block"'),
      padPage.indexOf("<PadMapPreview pad={pad}"),
      padPage.indexOf('className="detail-card pad-well-card" open'),
      padPage.indexOf('className="route-steps-card"'),
      padPage.indexOf('className="detail-card pad-readiness-details"'),
      padPage.indexOf("Data source and freshness"),
    ];
    expect(sections.every((index) => index >= 0)).toBe(true);
    expect(sections).toEqual([...sections].sort((left, right) => left - right));
    expect(padPage).toContain('<details className="detail-card pad-readiness-details"><summary>');
    expect(padPage).not.toContain('<details className="detail-card pad-readiness-details" open>');
    expect(padPage).toContain('<details className="detail-card"><summary><span><strong>Data source and freshness</strong>');
  });

  it("places the compact map beside the pad name and moves the administrative location under operating status", () => {
    const headerStart = padPage.indexOf('className="pad-header-primary"');
    const heroStart = padPage.indexOf('className="pad-hero"', headerStart);
    const mapStart = padPage.indexOf('className="pad-header-map-slot"', headerStart);
    const gpsStart = padPage.indexOf('<PadGpsActions pad={pad}/>', headerStart);
    const wellStart = padPage.indexOf('className="detail-card pad-well-card" open');
    const statusStart = padPage.indexOf('<small>Operating status</small>', wellStart);
    const administrativeLocationStart = padPage.indexOf('<small>County / township / state</small>', statusStart);

    expect([headerStart, heroStart, mapStart, gpsStart, wellStart, statusStart, administrativeLocationStart].every((index) => index >= 0)).toBe(true);
    expect(heroStart).toBeLessThan(mapStart);
    expect(mapStart).toBeLessThan(gpsStart);
    expect(statusStart).toBeLessThan(administrativeLocationStart);
    expect(padPage.slice(heroStart, mapStart)).not.toContain('className="pad-location"');
    expect(padPage).toMatch(/<div className="pad-header-primary">[\s\S]*?<div className="pad-header-map-slot">\s*<PadMapPreview pad=\{pad\} status=\{status\} routeGeometry=\{displayedRouteGeometry\}\/?>\s*<\/div>\s*<\/div>\s*<PadGpsActions pad=\{pad\}\/>/);
    expect(padLayoutCss).toMatch(/\.pad-header-primary\s*\{[^}]*grid-template-columns:/s);
    expect(padLayoutCss).toMatch(/\.pad-header-map-slot\s*>\s*\.pad-map-shell\s*\{[^}]*margin:\s*0 0 0 auto;/s);
  });

  it("uses a compact square map that can expand and shrink without rebuilding route authority", () => {
    expect(padMapPreview).toContain("const [expanded, setExpanded] = useState(false)");
    expect(padMapPreview).toContain('expanded ? "is-expanded" : "is-compact"');
    expect(padMapPreview).toContain('aria-label={expanded ? "Shrink pad map" : "Expand pad map"}');
    expect(padMapPreview).toContain('map.on("click", toggleMapSize)');
    expect(padMapPreview).toContain("map.resize()");
    expect(padLayoutCss).toMatch(/\.pad-page \.pad-map-shell\.is-compact\s*\{[^}]*aspect-ratio:\s*1;/s);
    expect(padLayoutCss).toMatch(/\.pad-page \.pad-map-shell\.is-expanded\s*\{[^}]*position:\s*fixed;/s);
  });

  it("keeps saved written field directions visible below the fallback", () => {
    expect(padPage).toContain('{status.route.writtenDirections && <details className="detail-card" open>');
    expect(padPage).toContain("{displayWrittenDirections(status.route.writtenDirections)}</p></details>");
    expect(appCss).toMatch(/\.written-directions\s*\{[^}]*white-space:\s*pre-wrap;/s);
    expect(appCss).toMatch(/\.written-directions\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  });

  it("renders the pad immediately and labels live, last-known, and offline states", () => {
    expect(padPage).toContain("buildPendingPadStatus(pad, snapshot?.sourceState)");
    expect(padPage).toContain('connectionState === "offline" ? "Offline"');
    expect(padPage).toContain('connectionState === "live" ? "Live"');
    expect(padPage).toContain('connectionState === "last-known" ? "Last known"');
    expect(padPage).toContain("Open this pad once while online to save reviewed directions on this device.");
  });

  it("uses synchronized reviewed well rows instead of matching sorted lists by position", () => {
    expect(padPage).toContain("loadPadWellRows(pad, snapshot?.sourceState)");
    expect(padPage).toContain("Reviewed well, API, and property pairings");
    expect(padPage).toContain("Each row preserves the reviewed production well, API, and property relationship.");
    expect(padPage).toContain("identifiers remain grouped by type and are not paired.");
  });

  it("keeps the global More navigation off pad routes and settings in the fixed top header", () => {
    const appSource = readFileSync(new URL("../../app/App.tsx", import.meta.url), "utf8");
    expect(appSource).toContain('location.pathname.startsWith("/pad/")');
    expect(appSource).toContain('<NavLink to="/settings" className="icon-button" aria-label="Settings">');
  });
});
