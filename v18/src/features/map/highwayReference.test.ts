import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import {
  highwayReferenceCasingLayerId,
  highwayReferenceFilter,
  highwayReferenceLayerSpecifications,
  highwayReferenceLineLayerId,
  highwayReferencePadCountyScope,
  firstSymbolLayerAfterLines,
  libertyHighwayReferenceSource,
} from "./highwayReference";

function libertyRoadStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    },
    layers: [
      { id: "road_motorway", type: "line", source: "openmaptiles", "source-layer": "transportation" },
      { id: "road_trunk_primary", type: "line", source: "openmaptiles", "source-layer": "transportation" },
      { id: "road_secondary_tertiary", type: "line", source: "openmaptiles", "source-layer": "transportation" },
      { id: "highway-shield-us-interstate", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name" },
      { id: "road_shield_us", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name" },
    ],
  };
}

describe("Liberty highway reference", () => {
  it("reuses Liberty's connected road source only when its highway identity layers agree", () => {
    expect(libertyHighwayReferenceSource(libertyRoadStyle())).toEqual({
      source: "openmaptiles",
      sourceLayer: "transportation",
    });
  });

  it("fails closed when a required Liberty layer is absent or uses another source", () => {
    const missing = libertyRoadStyle();
    missing.layers = missing.layers.filter((layer) => layer.id !== "road_shield_us");
    expect(libertyHighwayReferenceSource(missing)).toBeNull();

    const mismatched = libertyRoadStyle();
    mismatched.sources.other = { type: "vector", url: "https://example.invalid/tiles" };
    const stateShield = mismatched.layers.find((layer) => layer.id === "road_shield_us");
    if (stateShield && "source" in stateShield) stateShield.source = "other";
    expect(libertyHighwayReferenceSource(mismatched)).toBeNull();
  });

  it("uses structured U.S. route networks and the dissolved pad-county scope", () => {
    const encodedFilter = JSON.stringify(highwayReferenceFilter);
    expect(encodedFilter).toContain('"network"');
    expect(encodedFilter).toContain('"us-interstate"');
    expect(encodedFilter).toContain('"us-highway"');
    expect(encodedFilter).toContain('"us-state"');
    expect(encodedFilter).not.toContain('"name"');
    expect(encodedFilter).not.toContain('"ref"');
    expect(highwayReferenceFilter).toContainEqual(["within", highwayReferencePadCountyScope]);
    expect(highwayReferencePadCountyScope.type).toBe("MultiPolygon");
    // The 39 county polygons are dissolved into two continuous regional
    // components so routes stay connected across adjoining pad counties.
    expect(highwayReferencePadCountyScope.coordinates).toHaveLength(2);
    expect(highwayReferencePadCountyScope.coordinates.every((component) => component.length > 0)).toBe(true);
  });

  it("keeps the shared highway reference visible at zoom 7-13 but below exact and selected routes", () => {
    const [casing, line] = highwayReferenceLayerSpecifications({ source: "openmaptiles", sourceLayer: "transportation" });
    expect([casing.id, line.id]).toEqual([highwayReferenceCasingLayerId, highwayReferenceLineLayerId]);
    expect(casing.paint?.["line-opacity"]).toBe(0.62);
    expect(casing.paint?.["line-width"]).toEqual(["interpolate", ["linear"], ["zoom"], 5.5, 3, 7, 4, 9, 5, 13, 6]);
    expect(line.paint?.["line-color"]).toBe("#1aa99b");
    expect(line.paint?.["line-opacity"]).toBe(0.78);
    expect(line.paint?.["line-width"]).toEqual(["interpolate", ["linear"], ["zoom"], 5.5, 1.2, 7, 1.8, 9, 2.35, 13, 3.1]);

    // Exact released roads are 4px/.86 and the selected route is 5px/1.
    // Lock the reference beneath both hierarchy levels at its strongest stop.
    expect(line.paint?.["line-opacity"]).toBeLessThan(0.86);
    expect((line.paint?.["line-width"] as unknown[]).at(-1)).toBeLessThan(4);
    expect((casing.paint?.["line-width"] as unknown[]).at(-1)).toBeLessThan(7);
  });

  it("inserts overlays after every basemap line while preserving labels above them", () => {
    const style = libertyRoadStyle();
    style.layers.splice(1, 0, { id: "early-one-way-arrow", type: "symbol", source: "openmaptiles", "source-layer": "transportation" });
    style.layers.push({ id: "place-label", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name" });
    expect(firstSymbolLayerAfterLines(style)).toBe("highway-shield-us-interstate");
  });
});
