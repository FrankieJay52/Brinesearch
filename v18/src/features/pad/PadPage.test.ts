import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DriverPadStatus, DriverRouteChoice, PadSummary } from "@/data/types";
import { buildFixedNavigationAction, buildGoogleHandoffView, currentStatusForPad, destinationPinUrl, displayedRouteForChoice, FixedNavigateAction, PadGpsActions, padRouteConnectionState } from "./PadPage";

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
    expect(padPage).toContain("<FixedNavigateAction view={googleHandoff} pad={pad}/>");
    expect(padPage).toContain('<span><strong>Navigate</strong><small>{action.detail}</small></span>');
    expect(padPage).toContain('detail: "Reviewed approved route"');
    expect(padPage).toContain("Approval begins at its verified ingress.");
    expect(padPage).not.toContain("Current public Google route");
    expect(padPage).not.toContain("status.google.safeReason ||");
    expect(padPage).not.toMatch(/Open route .* of/);
    expect(padPage).not.toContain("route-chunk-list");
    expect(padPage).not.toContain("DriverActionPanel");
  });

  it("prioritizes the exact approved route and otherwise keeps Navigate on the verified GPS pin", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&destination=40.25403%2C-80.913577";
    const pad = mappedPad();
    const availableView = buildGoogleHandoffView(statusWithGoogle(routeUrl), true, true);
    const availableHtml = renderToStaticMarkup(createElement(FixedNavigateAction, { view: availableView, pad }));

    expect(availableHtml.match(/<a\b/g)).toHaveLength(1);
    expect(availableHtml).toContain(`href="${routeUrl.replaceAll("&", "&amp;")}"`);
    expect(availableHtml).toContain(">Navigate<");
    expect(availableHtml).toContain("Reviewed approved route");
    expect(availableHtml).toContain('data-navigation-kind="approved_route"');
    expect(availableHtml).toContain('class="pad-fixed-navigation"');
    expect(availableHtml).not.toMatch(/route [1-9] of/i);

    const missingView = buildGoogleHandoffView(statusWithGoogle(null), true, true);
    const missingHtml = renderToStaticMarkup(createElement(FixedNavigateAction, { view: missingView, pad }));
    expect(missingView.state).toBe("unavailable");
    expect(missingHtml).toContain('data-navigation-kind="destination_pin"');
    expect(missingHtml).toContain("GPS destination only · not an approved route");
    expect(missingHtml).toContain("google.com/maps/search");
    expect(missingHtml).not.toContain("/maps/dir/");
  });

  it("always renders a disabled Navigate control when there is no verified driver entrance", () => {
    const referencePad = { ...mappedPad(), coordinate: null, mapReference: { latitude: 40.25, longitude: -80.91, role: "reference" as const, kind: "official_pad_reference" as const } };
    const view = buildGoogleHandoffView(statusWithGoogle(null), false, true);
    const action = buildFixedNavigationAction(view, referencePad);
    const html = renderToStaticMarkup(createElement(FixedNavigateAction, { view, pad: referencePad }));

    expect(action).toMatchObject({ kind: "unavailable", href: null });
    expect(html).toContain("<button");
    expect(html).toContain("disabled");
    expect(html).toContain("No verified driver entrance");
    expect(html).not.toContain("href=");
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
    const offlineView = buildGoogleHandoffView(atomicStatus, true, true, null, false);
    expect(offlineView).toMatchObject({ available: false, state: "unavailable", routeUrl: null });
    expect(buildGoogleHandoffView(atomicStatus, true, true, routeUrl, false)).toMatchObject({ available: false, state: "unavailable", routeUrl: null });
    expect(buildFixedNavigationAction(offlineView, mappedPad())).toMatchObject({ kind: "destination_pin", href: expect.stringContaining("/maps/search/") });
    expect(padPage).toContain("currentReleasedHandoffPlan?.singleUrl || null,");
    expect(padPage).toContain("    online,");
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
    const alternateView = buildGoogleHandoffView(status, true, alternateDisplay.selectedRouteIsPrimary);
    expect(alternateView.available).toBe(false);
    expect(buildFixedNavigationAction(alternateView, mappedPad())).toMatchObject({ kind: "destination_pin", href: expect.stringContaining("/maps/search/") });
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
    expect(html).toContain(">COPY</span>");
    expect(html).toContain('class="pad-gps-copy-pill"');
    expect(html).toContain('class="pad-gps-copy-status" role="status" aria-live="polite"');
    expect(html).toContain('class="pad-gps-coordinate-link mono"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain("Pin only · not an approved route");
    expect(html).toContain("destination pin only, not an approved route");
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
    expect(html).toContain(">COPY</span>");
    expect(html).toContain('class="pad-gps-copy-pill"');
    expect(html).toContain('class="pad-gps-copy-status" role="status" aria-live="polite"');
    expect(html).toContain("Display only · no navigation");
    expect(html).not.toContain("pad-gps-coordinate-link");
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

  it("places the compact map beside the pad name and keeps operating status in data-source details", () => {
    const headerStart = padPage.indexOf('className="pad-header-primary"');
    const heroStart = padPage.indexOf('className="pad-hero"', headerStart);
    const mapStart = padPage.indexOf('className="pad-header-map-slot"', headerStart);
    const gpsStart = padPage.indexOf('<PadGpsActions pad={pad}/>', headerStart);
    const companyStart = padPage.indexOf('className="pad-company"', heroStart);
    const actionsStart = padPage.indexOf('className="pad-header-actions"', heroStart);
    const wellStart = padPage.indexOf('className="detail-card pad-well-card" open');
    const routeStart = padPage.indexOf('className="route-steps-card"', wellStart);
    const administrativeLocationStart = padPage.indexOf('<small>County / township / state</small>', wellStart);
    const freshnessStart = padPage.indexOf("Data source and freshness", routeStart);
    const statusStart = padPage.indexOf('<small>Operating status</small>', freshnessStart);

    expect([headerStart, heroStart, mapStart, gpsStart, companyStart, actionsStart, wellStart, routeStart, administrativeLocationStart, freshnessStart, statusStart].every((index) => index >= 0)).toBe(true);
    expect(heroStart).toBeLessThan(mapStart);
    expect(companyStart).toBeLessThan(gpsStart);
    expect(gpsStart).toBeLessThan(actionsStart);
    expect(actionsStart).toBeLessThan(mapStart);
    expect(administrativeLocationStart).toBeLessThan(routeStart);
    expect(freshnessStart).toBeLessThan(statusStart);
    expect(padPage.slice(wellStart, routeStart)).not.toContain('<small>Operating status</small>');
    expect(padPage.slice(heroStart, mapStart)).not.toContain('className="pad-location"');
    expect(padPage).toMatch(/<p className="pad-company">\{pad\.company\}<\/p><PadGpsActions pad=\{pad\}\/?>[\s\S]*?className="pad-header-actions"[\s\S]*?<div className="pad-header-map-slot">/);
    expect(padPage.slice(mapStart, wellStart)).not.toContain("<PadGpsActions");
    expect(padLayoutCss).toMatch(/\.pad-header-primary\s*\{[^}]*grid-template-columns:/s);
    expect(padLayoutCss).toMatch(/\.pad-header-map-slot\s*>\s*\.pad-map-shell\s*\{[^}]*margin:\s*0 0 0 auto;/s);
    expect(padLayoutCss).toMatch(/\.pad-header-map-slot\s*>\s*\.pad-map-empty\s*\{[^}]*min-height:\s*0;[^}]*aspect-ratio:\s*4\s*\/\s*3;/s);
    expect(padLayoutCss).toMatch(/\.pad-gps-actions\s*\{[^}]*width:\s*min\(100%,\s*13\.5rem\);[^}]*border:\s*0;/s);
    expect(padLayoutCss).toMatch(/\.pad-gps-inline\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*6px;/s);
    expect(padLayoutCss).toMatch(/\.pad-gps-copy-pill\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*border:\s*0;/s);
    expect(padLayoutCss).toMatch(/\.pad-gps-copy-pill\s*>\s*span\s*\{[^}]*min-height:\s*24px;[^}]*border-radius:\s*999px;/s);
    expect(padLayoutCss).not.toContain(".pad-gps-buttons");
  });

  it("groups Save and Share below the company so the top-right map can use their former space", () => {
    const topbarStart = padPage.indexOf('className="pad-topbar"');
    const headerStart = padPage.indexOf('className="pad-header-primary"');
    const actionsStart = padPage.indexOf('className="pad-header-actions"', headerStart);
    const mapStart = padPage.indexOf('className="pad-header-map-slot"', headerStart);

    expect(padPage.slice(topbarStart, headerStart)).toContain('className="pad-topbar-spacer"');
    expect(padPage.slice(topbarStart, headerStart)).not.toContain('aria-label={favorite ? "Remove favorite" : "Save favorite"}');
    expect(actionsStart).toBeGreaterThan(headerStart);
    expect(actionsStart).toBeLessThan(mapStart);
    const actionSource = padPage.slice(actionsStart, mapStart);
    expect(actionSource).toContain('role="group" aria-label="Pad actions"');
    expect(actionSource).toContain('aria-label={favorite ? `Remove ${pad.padName} from saved locations` : `Save ${pad.padName}`}');
    expect(actionSource).toContain('aria-pressed={favorite}');
    expect(actionSource).toContain('onClick={() => toggleFavorite(pad.padId)}');
    expect(actionSource).toContain('{favorite ? "Saved" : "Save"}');
    expect(actionSource).toContain('aria-label={`Share ${pad.padName}`}');
    expect(actionSource).toContain('navigator.share?.({ title: `${pad.padName} · BrineSearch`, url: location.href })');
    expect(padLayoutCss).toMatch(/\.pad-header-primary\s*\{[^}]*grid-template-columns:[^;]*14\.5rem/s);
    expect(padLayoutCss).toMatch(/\.pad-header-action\s*\{[^}]*min-height:\s*44px;/s);
  });

  it("uses a compact header map that can expand and shrink without rebuilding route authority", () => {
    expect(padMapPreview).toContain("const [expanded, setExpanded] = useState(false)");
    expect(padMapPreview).toContain('expanded ? "is-expanded" : "is-compact"');
    expect(padMapPreview).toContain('aria-label={expanded ? "Shrink pad map" : "Expand pad map"}');
    expect(padMapPreview).toContain('map.on("click", toggleMapSize)');
    expect(padMapPreview).toContain("map.resize()");
    expect(padMapPreview).toContain("padMapFramePoints(routeGeometry, destination)");
    expect(padMapPreview).toContain("collapseCompactAttribution(attributionHost.current)");
    expect(padMapPreview).toContain('target.closest(".maplibregl-ctrl")');
    expect(padMapPreview).toContain('className="pad-map-route-overlay"');
    expect(padMapPreview).toContain("drawApprovedRouteOverlay(map, routeOverlay.current, routeGeometry)");
    expect(padLayoutCss).toMatch(/\.pad-page \.pad-map-shell\.is-compact \.pad-map-preview\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3;/s);
    expect(padLayoutCss).toMatch(/\.pad-page \.pad-map-shell\.is-compact \.pad-map-warning\[role="note"\]\s*\{[^}]*display:\s*none;/s);
    expect(padLayoutCss).toMatch(/\.pad-page \.pad-map-shell\.is-compact \.pad-map-size-toggle\s*\{[^}]*min-width:\s*86px;[^}]*height:\s*44px;/s);
    expect(padMapPreview).toContain('className="pad-map-attribution-host" ref={attributionHost}');
    expect(padLayoutCss).toMatch(/\.pad-page \.pad-map-shell\.is-expanded\s*\{[^}]*position:\s*fixed;/s);
  });

  it("labels exact numbered road instructions as one approved route", () => {
    expect(padPage).toContain('displayedRouteSteps.length ? "Approved route"');
    expect(padPage).not.toContain('`${selectedRouteChoice ? `${selectedRouteChoice.label} · ` : ""}${displayedRouteSteps.length} route steps`');
  });

  it("keeps saved written field directions visible below the fallback", () => {
    expect(padPage).toContain('{status.route.writtenDirections && <details className="detail-card" open>');
    expect(padPage).toContain("{displayWrittenDirections(status.route.writtenDirections)}</p></details>");
    expect(appCss).toMatch(/\.written-directions\s*\{[^}]*white-space:\s*pre-wrap;/s);
    expect(appCss).toMatch(/\.written-directions\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  });

  it("renders immediately and labels route provenance without deriving Live from directory state", () => {
    expect(padPage).toContain("buildPendingPadStatus(pad, snapshot?.sourceState)");
    expect(padPage).toContain('connectionState === "offline" ? "Offline"');
    expect(padPage).toContain('connectionState === "live" ? "Live"');
    expect(padPage).toContain('connectionState === "saved-reviewed" ? "Saved reviewed"');
    expect(padPage).toContain('<strong>Route status</strong>');
    expect(padPage).not.toContain("What is safe to use");
    expect(padPage).toContain("Open this pad once while online to save reviewed directions on this device.");

    const base = statusWithGoogle(null);
    expect(padRouteConnectionState({ ...base, loadProvenance: "live_response" }, true)).toBe("live");
    expect(padRouteConnectionState({ ...base, loadProvenance: "session_cache" }, true)).toBe("session-checked");
    expect(padRouteConnectionState({ ...base, loadProvenance: "device_cache" }, true)).toBe("saved-reviewed");
    expect(padRouteConnectionState({ ...base, loadProvenance: "fallback", dataState: "live" }, true)).toBe("unavailable");
    expect(padRouteConnectionState({ ...base, loadProvenance: "live_response" }, false)).toBe("offline");
    expect(padRouteConnectionState(null, true)).toBe("checking");
    expect(padPage).toContain('connectionState === "session-checked" ? "Ready"');
    expect(padPage).toContain("Completed route check reused for this pad revision");
  });

  it("moves route connection state into the collapsed Route status panel", () => {
    const headerStart = padPage.indexOf('className="pad-header-block"');
    const wellStart = padPage.indexOf('className="detail-card pad-well-card" open');
    const readinessStart = padPage.indexOf('className="detail-card pad-readiness-details"');
    const freshnessStart = padPage.indexOf("Data source and freshness");

    expect([headerStart, wellStart, readinessStart, freshnessStart].every((index) => index >= 0)).toBe(true);
    expect(padPage.slice(headerStart, wellStart)).not.toContain("pad-connection-badge");
    expect(padPage.slice(headerStart, wellStart)).not.toContain("stale-banner");
    expect(padPage.slice(readinessStart, freshnessStart)).toContain("pad-connection-badge");
    expect(padPage.slice(readinessStart, freshnessStart)).toContain("stale-banner");
    expect(padPage.slice(readinessStart, freshnessStart)).toContain('aria-hidden="true">⌄');
    expect(padPage.slice(readinessStart, freshnessStart)).toContain('aria-live="polite" aria-atomic="true"');
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
