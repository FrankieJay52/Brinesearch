import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DriverPadStatus, DriverRouteChoice } from "@/data/types";
import { buildGoogleHandoffView, currentStatusForPad, displayedRouteForChoice, DriverActionPanel } from "./PadPage";

const padPage = readFileSync(new URL("./PadPage.tsx", import.meta.url), "utf8");
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
    expect(padPage).toContain("Navigate approved route");
    expect(padPage).toContain("Open Google Maps through reviewed BrineSearch controls");
    expect(padPage).toContain("BrineSearch approval begins at the verified route ingress.");
    expect(padPage).toContain("Approved route shown in BrineSearch");
    expect(padPage).toContain("Use the exact map and steps below. No single verified Google handoff is available.");
    expect(padPage).not.toContain("Current public Google route");
    expect(padPage).not.toContain("status.google.safeReason ||");
    expect(padPage).not.toMatch(/Open route .* of/);
    expect(padPage).not.toContain("route-chunk-list");
    expect(padPage).not.toContain("Open destination pin");
    expect(padPage).not.toContain("google.com/maps/search");
  });

  it("renders exactly one Google link only for a validated primary exact-route handoff", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&destination=40.25403%2C-80.913577";
    const availableView = buildGoogleHandoffView(statusWithGoogle(routeUrl), true, true);
    const availableHtml = renderToStaticMarkup(createElement(DriverActionPanel, {
      view: availableView,
      exactRouteDisplayed: true,
      hasWrittenDirections: false,
    }));

    expect(availableHtml.match(/<a\b/g)).toHaveLength(1);
    expect(availableHtml).toContain(`href="${routeUrl.replaceAll("&", "&amp;")}"`);
    expect(availableHtml).toContain("Navigate approved route");
    expect(availableHtml).toContain("Google chooses the approach from your current location");
    expect(availableHtml).not.toMatch(/route [1-9] of/i);

    const missingView = buildGoogleHandoffView(statusWithGoogle(null), true, true);
    const missingHtml = renderToStaticMarkup(createElement(DriverActionPanel, {
      view: missingView,
      exactRouteDisplayed: true,
      hasWrittenDirections: false,
    }));
    expect(missingView.state).toBe("unavailable");
    expect(missingHtml).not.toContain("<a");
    expect(missingHtml).toContain("Approved route shown in BrineSearch");
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
});
