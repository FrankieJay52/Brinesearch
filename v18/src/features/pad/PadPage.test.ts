import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DriverNamedApproach, DriverPadStatus, DriverRouteChoice, PadSummary } from "@/data/types";
import { BILINOVICH_REVIEWED_GOOGLE_URL, reviewedNavigationCandidateForPad, reviewedNavigationSafetyHoldForPad } from "@/data/reviewedNavigationCandidates";
import { buildFixedNavigationAction, buildGoogleHandoffView, currentStatusForPad, destinationPinUrl, displayedRouteForChoice, FixedNavigateAction, PadGpsActions, padRouteConnectionState, ReviewedWrittenDirections } from "./PadPage";

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
    destination: { available: true, role: "driver_entrance", latitude: 40.25403, longitude: -80.913577 },
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

function bilinovichPad(): PadSummary {
  return {
    ...mappedPad(),
    padId: "59061829-1122-4aae-872d-cf5024310373",
    canonicalId: "59061829-1122-4aae-872d-cf5024310373",
    legacyId: "ascent--bilinovich",
    recordRevision: "1787794115232844",
    padName: "BILINOVICH",
    county: "Guernsey",
    structuredRoadSequence: "I-70 W → Exit 193 → OH-513 N → US-22 E → McCoy Rd → Blaze Rd → Logan Rd → Turkle Rd / lease access → BILINOVICH",
  };
}

function correctedBilinovichPad(): PadSummary {
  return {
    ...bilinovichPad(),
    recordRevision: "1787802711836476",
    structuredRoadSequence: "US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH",
    coordinate: { latitude: 40.08738445, longitude: -81.3028262, role: "saved_pad_destination" },
  };
}

function namedApproach(): DriverNamedApproach {
  const steps = [{ order: 1, kind: "continue" as const, displayName: "US-250", verifiedDesignations: ["US-250"], instruction: "Continue on US-250", distanceMiles: 2 }];
  const geometry: DriverNamedApproach["geometry"] = { type: "FeatureCollection", features: [{ type: "Feature", properties: { stepOrder: 1 }, geometry: { type: "LineString", coordinates: [[-81.2, 40.2], [-81.1, 40.25]] } }] };
  return {
    approachKey: "via-freeport",
    approachLabel: "Via Freeport",
    routeGroup: "primary",
    variantIndex: 1,
    releaseVersion: "v18-named-approach-v1",
    routeRevision: 9,
    steps,
    geometry,
    ingress: { role: "exact_approved_ingress", label: "Via Freeport", latitude: 40.2, longitude: -81.2 },
    coreEnd: { role: "exact_approved_handoff", label: "Approved road handoff", latitude: 40.25, longitude: -81.1 },
    destination: { role: "saved_pad_destination", label: "Saved pad GPS", latitude: 40.26, longitude: -81.09 },
    finalLegMode: "google_to_saved_gps_unapproved",
    handoff: { originMode: "current_location_to_named_ingress", handoffMode: "verified_compact", waypoints: [{ latitude: 40.2, longitude: -81.2 }, { latitude: 40.25, longitude: -81.1 }] },
    lastVerifiedAt: "2026-08-26T20:00:00Z",
    statusRevision: "1".repeat(32),
    releaseDigest: "2".repeat(64),
    publishedAt: "2026-08-26T20:05:00Z",
    navigationUrl: "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.26%2C-81.09&waypoints=40.2%2C-81.2%7C40.25%2C-81.1",
  };
}

describe("V18 pad legacy route fallback", () => {
  it("shows saved BrineSearch route data when structured route steps are absent", () => {
    expect(padPage).toContain('const hasSavedRouteFallback = !reviewedNavigationSafetyHold && displayedRouteSteps.length === 0 && Boolean(pad.structuredRoadSequence || status.route.writtenDirections);');
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
    expect(padPage).toContain("They are not verified structured geometry; GPS-only navigation may use Google-selected roads and is not an approved route.");
    expect(padPage).toContain("<StatusBadge status={status.route.state}/>");
    expect(padPage).toContain('status.google.publicState === "ready"');
    expect(padPage).toContain("Boolean(status.google.routeUrl)");
  });

  it("offers one exact approved-route action and never exposes route chunks as choices", () => {
    expect(padPage).toContain("<FixedNavigateAction view={googleHandoff} pad={pad}/>");
    expect(padPage).toContain('<span><strong>{action.title}</strong><small>{action.detail}</small></span>');
    expect(padPage).toContain('"Approved road core · GPS destination" : "Reviewed approved route"');
    expect(padPage).toContain("Approval begins at its verified ingress.");
    expect(padPage).not.toContain("Current public Google route");
    expect(padPage).not.toContain("status.google.safeReason ||");
    expect(padPage).not.toMatch(/Open route .* of/);
    expect(padPage).not.toContain("route-chunk-list");
    expect(padPage).not.toContain("DriverActionPanel");
  });

  it("requires an explicit named approach choice and keeps its steps, geometry, and URL together", () => {
    const status = statusWithGoogle(null);
    const approach = namedApproach();
    const unselected = buildGoogleHandoffView(status, false, false, null, true, null, true);
    const unselectedAction = buildFixedNavigationAction(unselected, mappedPad());
    const hiddenRoute = displayedRouteForChoice(status, null, null, true);

    expect(unselected).toMatchObject({ available: false, selectionRequired: true, routeUrl: null });
    expect(unselectedAction).toMatchObject({ kind: "unavailable", title: "Choose an approach", href: null });
    expect(hiddenRoute).toMatchObject({ steps: [], geometry: null });

    const selectedRoute = displayedRouteForChoice(status, null, approach, false);
    const selected = buildGoogleHandoffView(status, true, true, null, true, approach, false);
    const selectedAction = buildFixedNavigationAction(selected, mappedPad());
    expect(selectedRoute.steps).toBe(approach.steps);
    expect(selectedRoute.geometry).toBe(approach.geometry);
    expect(padPage).toContain("const displayedMapStatus = selectedNamedApproach ?");
    expect(padPage).toContain("status={displayedMapStatus} routeGeometry={displayedRouteGeometry}");
    expect(padPage).toContain('`Approved road core · ${selectedNamedApproach.approachLabel}`');
    expect(padPage).toContain('`Approved route · ${selectedNamedApproach.approachLabel}`');
    expect(selected).toMatchObject({ available: true, mode: "named_approach", approachLabel: "Via Freeport", routeUrl: approach.navigationUrl });
    expect(selectedAction).toMatchObject({
      kind: "approved_route",
      title: "Navigate Via Freeport",
      detail: "Approved roads to handoff · GPS-only final leg · not approved",
      href: approach.navigationUrl,
    });
    const html = renderToStaticMarkup(createElement(FixedNavigateAction, { view: selected, pad: mappedPad() }));
    expect(html).toContain("Navigate Via Freeport");
    expect(html).toContain("GPS-only final leg · not approved");
  });

  it("prioritizes the exact approved route and otherwise navigates to the explicitly sourced GPS only", () => {
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
    expect(missingHtml).toContain("GPS destination only · Verified driver entrance · not an approved route");
    expect(missingHtml).toContain("google.com/maps/dir");
    expect(missingHtml).toContain("destination=40.25403%2C-80.913577");
  });

  it("withdraws the unsafe BILINOVICH Blaze route and falls back to GPS destination only", () => {
    const pad = bilinovichPad();
    const heldView = buildGoogleHandoffView(statusWithGoogle(null), false, true);
    const action = buildFixedNavigationAction(heldView, pad);
    const html = renderToStaticMarkup(createElement(FixedNavigateAction, { view: heldView, pad }));

    expect(action).toMatchObject({
      kind: "destination_pin",
      title: "Navigate",
      detail: expect.stringContaining("GPS destination only"),
    });
    expect(html).toContain('data-navigation-kind="destination_pin"');
    expect(html).toContain("GPS destination only");
    expect(reviewedNavigationSafetyHoldForPad(pad)).toMatchObject({ detail: "Do not use Blaze Road · corrected route pending" });
    expect(padPage).toContain("reviewedNavigationSafetyHoldForPad(pad)");
    expect(padPage).toContain("BILINOVICH navigation is GPS destination only");
    expect(padPage).toContain("!reviewedNavigationSafetyHold && status.route.writtenDirections");

    const approvedView = buildGoogleHandoffView(statusWithGoogle("https://www.google.com/maps/dir/?api=1&destination=40.1%2C-81.1"), true, true);
    expect(buildFixedNavigationAction(approvedView, pad)).toMatchObject({ kind: "approved_route" });

    const selectionView = buildGoogleHandoffView(statusWithGoogle(null), false, false, null, true, null, true);
    expect(buildFixedNavigationAction(selectionView, pad)).toMatchObject({ kind: "unavailable", title: "Choose an approach" });
  });

  it("shows one reviewed no-Blaze BILINOVICH link while route and graph authority remain held", () => {
    const pad = correctedBilinovichPad();
    const heldStatus = statusWithGoogle(null);
    heldStatus.route.state = "held";
    heldStatus.route.source = "legacy_written";
    heldStatus.graph.state = "held";
    heldStatus.google.publicState = "held";
    const heldView = buildGoogleHandoffView(heldStatus, false, true);
    const action = buildFixedNavigationAction(heldView, pad);
    const html = renderToStaticMarkup(createElement(FixedNavigateAction, { view: heldView, pad }));

    expect(action).toMatchObject({
      kind: "reviewed_route",
      href: BILINOVICH_REVIEWED_GOOGLE_URL,
      title: "Navigate reviewed route",
      detail: "McCoy → Merry → Penrose → Logan → Turkle → pad GPS",
    });
    expect(reviewedNavigationCandidateForPad(pad)).not.toBeNull();
    expect(reviewedNavigationSafetyHoldForPad(pad)).toBeNull();
    expect(html).toContain('data-navigation-kind="reviewed_route"');
    expect(html).toContain("Navigate reviewed route");
    expect(html).toContain("McCoy → Merry → Penrose → Logan → Turkle → pad GPS");
    expect(html).not.toContain("GPS destination only");
    expect(html).not.toContain("approved route");
  });

  it("formats reviewed prose legibly without creating structured route steps", () => {
    const directions = "Road sequence reference:\nUS-22 E → McCoy Rd → Blaze Rd → Logan Rd → Pad\n\nStep-by-step directions:\n1. Turn onto McCoy Road.\n2. Turn right onto Blaze Road.\n3. Continue onto Logan Road.";
    const html = renderToStaticMarkup(createElement(ReviewedWrittenDirections, { value: directions }));

    expect(html).toContain("ROAD SEQUENCE");
    expect(html).toContain("US-22 E → McCoy Rd → Blaze Rd → Logan Rd → Pad");
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).toContain("Turn right onto Blaze Road.");
    expect(padPage).toContain("<ReviewedWrittenDirections value={status.route.writtenDirections}/>");
    expect(padPage).not.toContain('<details className="detail-card" open><summary><span><strong>Written field directions</strong>');
  });

  it("labels a handoff route as an approved road core plus a separate GPS destination", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&destination=40.240883%2C-80.913963";
    const status = statusWithGoogle(routeUrl);
    status.route.source = "exact_graph_handoff";
    status.graph.state = "verified_release";
    status.destination = { available: true, role: "saved_pad_destination", latitude: 40.240883, longitude: -80.913963 };
    const view = buildGoogleHandoffView(status, true, true);
    const action = buildFixedNavigationAction(view, mappedPad());

    expect(view.mode).toBe("exact_core_destination");
    expect(action).toMatchObject({
      kind: "approved_route",
      detail: "Approved road core · GPS destination",
    });
  });

  it("shows a strictly restored frozen handoff immediately while the online refresh runs", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.240883%2C-80.913963&waypoints=40.2%2C-80.95";
    const status = statusWithGoogle(routeUrl);
    status.dataState = "cached";
    status.loadProvenance = "device_cache";
    status.route.source = "exact_graph_handoff";
    status.graph.state = "verified_release";
    status.routeSteps = [{ order: 1, kind: "continue", displayName: "US-250", verifiedDesignations: ["US-250"], instruction: "Continue", distanceMiles: 1 }];
    status.destination = { available: true, role: "saved_pad_destination", latitude: 40.240883, longitude: -80.913963 };

    expect(buildGoogleHandoffView(status, false, true, null, true)).toMatchObject({
      available: true,
      state: "ready",
      routeUrl,
      mode: "exact_core_destination",
    });
    expect(buildGoogleHandoffView(status, false, true, null, false)).toMatchObject({
      available: false,
      state: "unavailable",
      routeUrl: null,
    });
  });

  it("allows an exact ODNR pad reference as GPS destination-only without calling it an entrance", () => {
    const referencePad = { ...mappedPad(), coordinate: null, mapReference: { latitude: 40.25, longitude: -80.91, role: "reference" as const, kind: "official_pad_reference" as const } };
    const view = buildGoogleHandoffView(statusWithGoogle(null), false, true);
    const action = buildFixedNavigationAction(view, referencePad);
    const html = renderToStaticMarkup(createElement(FixedNavigateAction, { view, pad: referencePad }));

    expect(action).toMatchObject({ kind: "destination_pin", href: expect.stringContaining("/maps/dir/") });
    expect(html).toContain("GPS destination only · ODNR official pad GPS · not an entrance · not an approved route");
    expect(html).toContain("ODNR official pad GPS · not an entrance".toLowerCase());
    expect(html).not.toContain("disabled");
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
    expect(buildFixedNavigationAction(offlineView, mappedPad())).toMatchObject({ kind: "destination_pin", href: expect.stringContaining("/maps/dir/") });
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
    expect(buildFixedNavigationAction(alternateView, mappedPad())).toMatchObject({ kind: "destination_pin", href: expect.stringContaining("/maps/dir/") });
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
    expect(html).toContain("GPS destination only · not an approved route");
    expect(html).toContain("destination pin only, not an approved route");
    expect(html).not.toContain("Reviewed approved route");
    expect(html).not.toContain("/maps/dir/");
  });

  it("keeps an ODNR pad coordinate explicitly labelled while allowing destination-only navigation", () => {
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

    expect(destinationPinUrl(referencePad)).toBe("https://www.google.com/maps/search/?api=1&query=40.25%2C-80.91");
    expect(html).toContain(">COPY</span>");
    expect(html).toContain('class="pad-gps-copy-pill"');
    expect(html).toContain('class="pad-gps-copy-status" role="status" aria-live="polite"');
    expect(html).toContain("ODNR official pad GPS · not an entrance");
    expect(html).toContain("GPS destination only · not an approved route");
    expect(html).toContain("pad-gps-coordinate-link");
    expect(html).toContain("google.com/maps/search");
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
    expect(padMapPreview).toContain('attribution?.addEventListener("click", preserveAttributionChoice)');
    expect(padMapPreview).toContain('if (!attributionChoiceMade) collapseCompactAttribution(attributionHost.current)');
    expect(padMapPreview).toContain('map.off("sourcedata", settleAutomaticAttribution)');
    expect(padMapPreview).toContain('map.off("styledata", settleAutomaticAttribution)');
    expect(padMapPreview).toContain('target.closest(".maplibregl-ctrl")');
    expect(padMapPreview).toContain('className="pad-map-route-overlay"');
    expect(padMapPreview).toContain("drawApprovedRouteOverlay(map, routeOverlay.current, routeGeometry)");
    expect(padMapPreview).toContain("GPS destination only; Google chooses the roads. Not a BrineSearch-approved route.");
    expect(padMapPreview).not.toContain("Display only; it cannot launch navigation.");
    expect(padLayoutCss).toMatch(/\.pad-page \.pad-map-shell\.is-compact \.pad-map-preview\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3;/s);
    expect(padLayoutCss).toMatch(/\.pad-page \.pad-map-shell\.is-compact \.pad-map-warning\[role="note"\]\s*\{[^}]*display:\s*none;/s);
    expect(padLayoutCss).toMatch(/\.pad-page \.pad-map-shell\.is-compact \.pad-map-size-toggle\s*\{[^}]*min-width:\s*86px;[^}]*height:\s*44px;/s);
    expect(padMapPreview).toContain('className="pad-map-attribution-host" ref={attributionHost}');
    expect(padLayoutCss).toMatch(/\.pad-page \.pad-map-shell\.is-expanded\s*\{[^}]*position:\s*fixed;/s);
  });

  it("labels exact numbered road instructions as one approved route", () => {
    expect(padPage).toContain('status.route.source === "exact_graph_handoff" ? "Approved road sequence" : "Approved route"');
    expect(padPage).toContain("The remaining lease access to the saved pad GPS is shown as a separate destination");
    expect(padPage).toContain("The remaining GPS-only final leg is a destination handoff, not approved road geometry.");
    expect(padPage).not.toContain('`${selectedRouteChoice ? `${selectedRouteChoice.label} · ` : ""}${displayedRouteSteps.length} route steps`');
  });

  it("keeps reviewed written directions below the fallback without opening the long text by default", () => {
    expect(padPage).toContain('{!reviewedNavigationSafetyHold && status.route.writtenDirections && <details className="detail-card">');
    expect(padPage).toContain("<ReviewedWrittenDirections value={status.route.writtenDirections}/></details>");
    expect(padPage).toContain("Reviewed written directions");
    expect(padLayoutCss).toMatch(/\.reviewed-written-directions\s*\{/);
    expect(padLayoutCss).toMatch(/\.reviewed-written-directions li p\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
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
