import { describe, expect, it } from "vitest";
import {
  ownerRoadBasemapLabels,
  ownerRoadBasemapStyle,
  ownerRoadMapStyle,
  ownerRoadSatelliteStyle,
} from "./ownerRoadBasemap";

describe("owner approved-road basemaps", () => {
  it("keeps the existing road style as the default", () => {
    expect(ownerRoadBasemapStyle("road")).toBe(ownerRoadMapStyle);
    expect(ownerRoadBasemapLabels.road).toBe("Road map");
  });

  it("uses public-domain USGS imagery only as a display background", () => {
    expect(ownerRoadBasemapStyle("satellite")).toBe(ownerRoadSatelliteStyle);
    expect(ownerRoadBasemapLabels.satellite).toBe("Satellite imagery");
    const source = ownerRoadSatelliteStyle.sources["brinesearch-usgs-imagery"];
    expect(source).toMatchObject({
      type: "raster",
      tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
    });
    expect("attribution" in source ? source.attribution : "").toContain("U.S. Geological Survey");
    expect(ownerRoadSatelliteStyle.layers.map((layer) => layer.id)).toEqual([
      "brinesearch-owner-satellite-background",
      "brinesearch-owner-satellite-imagery",
    ]);
  });
});
