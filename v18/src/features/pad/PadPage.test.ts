import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const padPage = readFileSync(new URL("./PadPage.tsx", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../../styles/app.css", import.meta.url), "utf8");

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
    expect(padPage).toContain("Approved route");
    expect(padPage).toContain("Open in Google Maps · BrineSearch exact-approved path");
    expect(padPage).toContain("Approved route shown in BrineSearch");
    expect(padPage).toContain("Use the exact map and steps below. No single verified Google handoff is available.");
    expect(padPage).not.toContain("Current public Google route");
    expect(padPage).not.toContain("status.google.safeReason ||");
    expect(padPage).not.toMatch(/Open route .* of/);
    expect(padPage).not.toContain("route-chunk-list");
    expect(padPage).not.toContain("Open destination pin");
    expect(padPage).not.toContain("google.com/maps/search");
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
