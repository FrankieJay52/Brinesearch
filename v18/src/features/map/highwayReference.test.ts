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

  it("uses structured U.S. route networks and stays weaker than exact approved routes", () => {
    const encodedFilter = JSON.stringify(highwayReferenceFilter);
    expect(encodedFilter).toContain('"network"');
    expect(encodedFilter).toContain('"us-interstate"');
    expect(encodedFilter).toContain('"us-highway"');
    expect(encodedFilter).toContain('"us-state"');
    expect(encodedFilter).not.toContain('"name"');
    expect(encodedFilter).not.toContain('"ref"');
    expect(highwayReferenceFilter).toContainEqual(["within", highwayReferencePadCountyScope]);
    expect(highwayReferencePadCountyScope.type).toBe("MultiPolygon");
    expect(highwayReferencePadCountyScope.coordinates).toHaveLength(39);

    const [casing, line] = highwayReferenceLayerSpecifications({ source: "openmaptiles", sourceLayer: "transportation" });
    expect([casing.id, line.id]).toEqual([highwayReferenceCasingLayerId, highwayReferenceLineLayerId]);
    expect(line.paint?.["line-color"]).toBe("#159d91");
    expect(line.paint?.["line-opacity"]).toBe(0.62);
    expect(line.paint?.["line-width"]).toEqual(["interpolate", ["linear"], ["zoom"], 5.5, 1.35, 9, 2.1, 13, 3]);
  });

  it("inserts overlays after every basemap line while preserving labels above them", () => {
    const style = libertyRoadStyle();
    style.layers.splice(1, 0, { id: "early-one-way-arrow", type: "symbol", source: "openmaptiles", "source-layer": "transportation" });
    style.layers.push({ id: "place-label", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name" });
    expect(firstSymbolLayerAfterLines(style)).toBe("highway-shield-us-interstate");
  });
});
