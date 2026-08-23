import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const padPage = readFileSync(new URL("./PadPage.tsx", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../../styles/app.css", import.meta.url), "utf8");

describe("V18 pad legacy route fallback", () => {
  it("shows saved BrineSearch route data when structured route steps are absent", () => {
    expect(padPage).toContain('const hasSavedRouteFallback = status.routeSteps.length === 0 && Boolean(pad.structuredRoadSequence || status.route.writtenDirections);');
    expect(padPage).toContain('hasSavedRouteFallback ? "Saved BrineSearch route" : "No structured route"');
    expect(padPage).toContain("Legacy saved directions");
    expect(padPage).toContain("{pad.structuredRoadSequence && <p>{pad.structuredRoadSequence}</p>}");
  });

  it("keeps the fallback explicitly unverified and held behind route approval", () => {
    expect(padPage).toContain("This is not a verified structured route, and Google route launch stays disabled until approval is complete.");
    expect(padPage).toContain("<StatusBadge status={status.route.state}/>");
    expect(padPage).toContain('status.google.publicState === "ready" && status.google.routeUrl');
  });

  it("keeps saved written field directions visible below the fallback", () => {
    expect(padPage).toContain('{status.route.writtenDirections && <details className="detail-card" open>');
    expect(padPage).toContain("{status.route.writtenDirections}</p></details>");
    expect(appCss).toMatch(/\.written-directions\s*\{[^}]*white-space:\s*pre-wrap;/s);
    expect(appCss).toMatch(/\.written-directions\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  });

  it("uses synchronized reviewed well rows instead of matching sorted lists by position", () => {
    expect(padPage).toContain("loadPadWellRows(pad, snapshot?.sourceState)");
    expect(padPage).toContain("Reviewed well, API, and property pairings");
    expect(padPage).toContain("Each row preserves the reviewed production well, API, and property relationship.");
    expect(padPage).toContain("identifiers remain grouped by type and are not paired.");
  });
});
