import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("V18 More bridge routing", () => {
  const morePage = source("./MorePage.tsx");
  const fieldUpdatesPage = source("./FieldUpdatesPage.tsx");
  const controlCenterPage = source("../control-center/ControlCenterPage.tsx");
  const ownerRoadMapPage = source("../owner-roads/OwnerApprovedRoutesPage.tsx");
  const app = source("../../app/App.tsx");

  it("routes More through the V18 bridge pages", () => {
    expect(morePage).toContain('to="/field-updates" icon="feed" title="Field Updates"');
    expect(morePage).toContain('to="/control-center" icon="control" title="Control Center"');
    expect(morePage).not.toContain("legacyBrineSearchPaths.fieldUpdates");
    expect(morePage).not.toContain("legacyBrineSearchPaths.controlCenter");
  });

  it("keeps the legacy launches inside the bridge pages", () => {
    expect(fieldUpdatesPage).toContain("href={legacyBrineSearchPaths.fieldUpdates}");
    expect(controlCenterPage).toContain("href={legacyBrineSearchPaths.controlCenter}");
  });

  it("keeps Road Manager navigation in V18 unless legacy editing is explicitly opened separately", () => {
    expect(controlCenterPage).toContain('<Link to="/settings/approved-routes" className="button-primary">');
    expect(controlCenterPage).not.toContain('{access.state === "owner" && <Link to="/settings/approved-routes"');
    expect(controlCenterPage).not.toContain("Open the operational Control Center");

    const legacyLaunches = [controlCenterPage, ownerRoadMapPage].flatMap((page) =>
      page.match(/<a\b[^>]*href=\{legacyBrineSearchPaths\.controlCenter\}[^>]*>/g) ?? [],
    );
    expect(legacyLaunches).toHaveLength(3);
    expect(legacyLaunches.every((launch) => launch.includes('target="_blank"'))).toBe(true);
    expect(legacyLaunches.every((launch) => launch.includes('rel="noopener noreferrer"'))).toBe(true);
  });

  it("keeps both bridge routes registered by the V18 app", () => {
    expect(app).toContain('path="/field-updates" element={<FieldUpdatesPage/>}');
    expect(app).toContain('path="/control-center" element={<ControlCenterPage/>}');
  });
});
