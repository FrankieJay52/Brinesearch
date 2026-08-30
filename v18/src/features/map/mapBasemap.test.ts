import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  clearMainMapSatelliteBasemap,
  mainMapBasemapModeFromParam,
  mainMapBasemapSearchParams,
  mainMapSatelliteLayerId,
  mainMapSatelliteSource,
  mainMapSatelliteSourceId,
  mainMapSatelliteTileUrl,
  syncMainMapBasemap,
} from "./mapBasemap";

function fakeMap(options: { rejectLayer?: boolean } = {}) {
  const sources = new Map<string, unknown>();
  const layers = new Map<string, unknown>();
  let insertedBefore: string | undefined;
  const map = {
    getLayer: (id: string) => layers.get(id),
    removeLayer: (id: string) => { layers.delete(id); },
    getSource: (id: string) => sources.get(id),
    removeSource: (id: string) => { sources.delete(id); },
    addSource: (id: string, source: unknown) => { sources.set(id, source); },
    addLayer: (layer: { id: string }, before?: string) => {
      if (options.rejectLayer) throw new Error("rejected");
      insertedBefore = before;
      layers.set(layer.id, layer);
    },
    getStyle: () => ({
      version: 8 as const,
      sources: {},
      layers: [
        { id: "background", type: "background" as const },
        { id: "road-lines", type: "line" as const, source: "liberty" },
        { id: "place-labels", type: "symbol" as const, source: "liberty" },
      ],
    }),
  };
  return {
    map: map as unknown as MapLibreMap,
    sources,
    layers,
    insertedBefore: () => insertedBefore,
  };
}

describe("main driver map basemap", () => {
  it("keeps streets as the default and accepts only the explicit satellite value", () => {
    expect(mainMapBasemapModeFromParam(null)).toBe("street");
    expect(mainMapBasemapModeFromParam("street")).toBe("street");
    expect(mainMapBasemapModeFromParam("SATELLITE")).toBe("street");
    expect(mainMapBasemapModeFromParam("satellite")).toBe("satellite");
  });

  it("persists satellite without disturbing other map query state and removes it for streets", () => {
    const satellite = mainMapBasemapSearchParams(new URLSearchParams("view=roads&company=Ascent"), "satellite");
    expect(satellite.toString()).toBe("view=roads&company=Ascent&basemap=satellite");
    const streets = mainMapBasemapSearchParams(satellite, "street");
    expect(streets.toString()).toBe("view=roads&company=Ascent");
  });

  it("uses the public USGS imagery endpoint with USGS and USDA attribution", () => {
    expect(mainMapSatelliteTileUrl).toBe("https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}");
    expect(mainMapSatelliteSource).toMatchObject({
      type: "raster",
      tiles: [mainMapSatelliteTileUrl],
      tileSize: 256,
      maxzoom: 16,
    });
    expect(mainMapSatelliteSource.attribution).toContain("U.S. Geological Survey");
    expect(mainMapSatelliteSource.attribution).toContain("USDA NAIP");
  });

  it("places imagery below Liberty labels and removes it cleanly for streets", () => {
    const fixture = fakeMap();
    expect(syncMainMapBasemap(fixture.map, "satellite")).toBe(true);
    expect(fixture.sources.has(mainMapSatelliteSourceId)).toBe(true);
    expect(fixture.layers.has(mainMapSatelliteLayerId)).toBe(true);
    expect(fixture.insertedBefore()).toBe("place-labels");

    expect(syncMainMapBasemap(fixture.map, "street")).toBe(true);
    expect(fixture.sources.has(mainMapSatelliteSourceId)).toBe(false);
    expect(fixture.layers.has(mainMapSatelliteLayerId)).toBe(false);
  });

  it("does not create duplicate sources or layers when satellite is resynchronized", () => {
    const fixture = fakeMap();
    expect(syncMainMapBasemap(fixture.map, "satellite")).toBe(true);
    expect(syncMainMapBasemap(fixture.map, "satellite")).toBe(true);
    expect([...fixture.sources.keys()]).toEqual([mainMapSatelliteSourceId]);
    expect([...fixture.layers.keys()]).toEqual([mainMapSatelliteLayerId]);
  });

  it("fails closed to the underlying street map when the raster layer is rejected", () => {
    const fixture = fakeMap({ rejectLayer: true });
    expect(syncMainMapBasemap(fixture.map, "satellite")).toBe(false);
    expect(fixture.sources.has(mainMapSatelliteSourceId)).toBe(false);
    expect(fixture.layers.has(mainMapSatelliteLayerId)).toBe(false);
    expect(() => clearMainMapSatelliteBasemap(fixture.map)).not.toThrow();
  });
});
