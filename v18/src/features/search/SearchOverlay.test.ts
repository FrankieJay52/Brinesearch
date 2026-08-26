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
    expect(mapPage).toContain('closestPadSearchResults(snapshot?.rows || [], mapSearch, mapSearchOrigin, 7)');
    expect(mapPage).toContain('placeholder="Search pads"');
    expect(mapPage).toContain('focusPad(searchResults[0])');
    expect(mapPage).toContain('mapSearchOpen && <div id="map-nearest-pad-results"');
  });

  it("preserves the complete Search page at a secondary route", () => {
    expect(app).toContain('path="/search/all" element={<SearchPage/>}');
    expect(app).toContain('item.to === "/search" && location.pathname.startsWith("/search/")');
    expect(overlay).toContain('Open full search');
    expect(overlay).toContain('/search/all');
  });

  it("uses the existing deterministic directory search contract", () => {
    expect(overlay).toContain('closestPadSearchResults(snapshot?.rows || [], query, origin, 7)');
    expect(overlay).toContain('role="dialog"');
    expect(overlay).toContain('role="region"');
    expect(overlay).not.toContain('role="listbox"');
    expect(overlay).not.toContain('role="combobox"');
    expect(overlay).not.toContain('role="option"');
    expect(overlay).toContain('navigate(`/pad/${encodeURIComponent(pad.padId)}`)');
  });

  it("uses retryable phone GPS and keeps denied-location name search available", () => {
    expect(overlay).toContain("usePadSearchLocation()");
    expect(overlay).toContain("retryLocation");
    expect(overlay).toContain("nearbyPadResultsHeading(query, origin)");
    expect(overlay).toContain("Use phone GPS");
    expect(overlay).toContain("Exact name search remains available.");
    expect(mapPage).toContain("Using this phone's current GPS to find nearby pads");
    expect(mapPage).toContain("Use phone GPS");
  });

  it("keeps the modal above app chrome and keyboard-safe with an always-visible close action", () => {
    const css = source("./search-overlay.css");
    expect(app).toContain('location.pathname === "/search"');
    expect(overlay).toContain("window.visualViewport");
    expect(overlay).toContain('className="search-overlay-inline-close"');
    expect(css).toContain("--search-visible-height");
    expect(css).toContain("z-index: 80");
    expect(css).toContain(".search-overlay-panel.is-compact .search-overlay-footer");
  });
});
