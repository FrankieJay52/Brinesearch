import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("V18 map search dropdown", () => {
  const app = source("../../app/App.tsx");
  const mapPage = source("../map/MapPage.tsx");
  const overlay = source("./SearchOverlay.tsx");

  it("keeps /search map-backed while the main map also supports direct pad focus", () => {
    expect(app).toContain('path="/search" element={<SearchOverlayRoute/>}');
    expect(app).toContain('function SearchOverlayRoute()');
    expect(app).toContain('<><MapPage/><SearchOverlay/></>');
    expect(app).not.toContain('path="/search" element={<SearchPage/>}');
    expect(mapPage).toContain('mapPadSearchResults(snapshot?.rows || [], mapSearch)');
    expect(mapPage).toContain('placeholder="Search pad name on this map"');
    expect(mapPage).toContain('focusPad(searchResults[0])');
  });

  it("preserves the complete Search page at a secondary route", () => {
    expect(app).toContain('path="/search/all" element={<SearchPage/>}');
    expect(app).toContain('item.to === "/search" && location.pathname.startsWith("/search/")');
    expect(overlay).toContain('Open full search');
    expect(overlay).toContain('/search/all');
  });

  it("uses the existing deterministic directory search contract", () => {
    expect(overlay).toContain('import { searchDirectory } from "@/data/search"');
    expect(overlay).toContain('searchDirectory(snapshot?.rows || [], normalizedQuery, { type, route: "all" }, 8)');
    expect(overlay).toContain('role="dialog"');
    expect(overlay).toContain('role="listbox"');
    expect(overlay).toContain('navigate(`/pad/${encodeURIComponent(pad.padId)}`)');
  });
});
