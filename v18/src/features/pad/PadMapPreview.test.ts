import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DriverRouteGeometry } from "@/data/types";
import { collapseCompactAttribution, padMapFrameOptions, padMapFramePoints, routePoints } from "./PadMapPreview";

const previewSource = readFileSync(new URL("./PadMapPreview.tsx", import.meta.url), "utf8");

const geometry: DriverRouteGeometry = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { stepOrder: 1 },
      geometry: { type: "LineString", coordinates: [[-80.99, 40.2], [-80.95, 40.23]] },
    },
    {
      type: "Feature",
      properties: { stepOrder: 2 },
      geometry: { type: "MultiLineString", coordinates: [[[-80.94, 40.24], [-80.93, 40.25]], [[-80.92, 40.25], [-80.91, 40.254]]] },
    },
  ],
};

describe("V18 compact pad map framing", () => {
  it("flattens exact LineString and MultiLineString geometry without inventing points", () => {
    expect(routePoints(geometry)).toEqual([
      [-80.99, 40.2], [-80.95, 40.23],
      [-80.94, 40.24], [-80.93, 40.25],
      [-80.92, 40.25], [-80.91, 40.254],
    ]);
  });

  it("includes the selected verified marker even when it sits outside route bounds", () => {
    const marker: [number, number] = [-80.913577, 40.25403];
    const points = padMapFramePoints(geometry, marker);
    expect(points).toHaveLength(7);
    expect(points.at(-1)).toEqual(marker);
    expect(padMapFramePoints(null, marker)).toEqual([marker]);
    expect(padMapFramePoints(null, null)).toEqual([]);
  });

  it("uses compact padding that leaves useful map area and larger expanded padding", () => {
    expect(padMapFrameOptions(false)).toMatchObject({
      padding: { top: 14, right: 14, bottom: 24, left: 14 },
      maxZoom: 14.5,
      duration: 0,
    });
    expect(padMapFrameOptions(true)).toMatchObject({
      padding: { top: 58, right: 58, bottom: 58, left: 58 },
      maxZoom: 15,
      duration: 0,
    });
  });

  it("collapses the initially open compact credit without removing its control", () => {
    const removeAttribute = vi.fn();
    const remove = vi.fn();
    const attribution = { removeAttribute, classList: { remove } };
    const host = { querySelector: vi.fn().mockReturnValue(attribution) } as unknown as ParentNode;

    collapseCompactAttribution(host);

    expect(host.querySelector).toHaveBeenCalledWith(".maplibregl-ctrl-attrib");
    expect(removeAttribute).toHaveBeenCalledWith("open");
    expect(remove).toHaveBeenCalledWith("maplibregl-compact-show");
  });

  it("draws only supplied named-road geometry and never invents teal", () => {
    expect(previewSource).toContain("drawNamedRoadOverlay(map, routeOverlay.current, routeGeometry)");
    expect(previewSource).toContain("Missing geometry is");
    expect(previewSource).toContain("never replaced with prose, waypoints, straight lines, or nearest-road guesses.");
    expect(previewSource).toContain("Named-road detail could not be drawn. No substitute line was inferred.");
    expect(previewSource).toContain("GPS destination only; no named-road display geometry was supplied.");
    expect(previewSource).not.toContain("drawApprovedRouteOverlay");
  });
});
