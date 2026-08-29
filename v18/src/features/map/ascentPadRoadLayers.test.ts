import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import type { AscentPadApproachMapDisplay } from "./ascentPadApproaches";
import type { AscentPadRoadDisplay } from "./ascentPadRoadDisplays";
import {
  ascentPadRoadCollection,
  ascentPadRoadGpsCasingLayerId,
  ascentPadRoadGpsLineLayerId,
  ascentPadRoadLayerIdsInPaintOrder,
  ascentPadRoadRedCasingLayerId,
  ascentPadRoadRedLineLayerId,
  ascentPadRoadSelectedCasingLayerId,
  ascentPadRoadSelectedLineLayerId,
  ascentPadRoadSourceId,
  ascentPadRoadTealCasingLayerId,
  ascentPadRoadTealLineLayerId,
  ascentPadRoadUnverifiedCasingLayerId,
  ascentPadRoadUnverifiedLineLayerId,
  syncAscentPadRoadLayers,
} from "./ascentPadRoadLayers";

const display: AscentPadRoadDisplay = {
  padId: "pad-1",
  canonicalId: "pad-1",
  legacyId: "ascent--pad-one",
  recordRevision: "1",
  padName: "PAD ONE",
  company: "Ascent",
  state: "Ohio",
  county: "Belmont",
  structuredRoadSequence: "OH-9 → CR-1",
  directoryCoordinate: [-80.89, 40.2],
  displayScope: "persistent-main-map-all-and-ascent",
  displayAuthority: "display only",
  savedPin: [-80.89, 40.2],
  reviewedRoadSequence: "OH-9 → CR-1 → saved GPS",
  arrival: {
    type: "LineString",
    colorRole: "teal",
    lineRole: "reviewed_network_arrival",
    pattern: "solid",
    approvedRoad: false,
    visibility: "main-map-all-and-ascent",
    label: "arrival",
    coordinates: [[-81, 40.1], [-80.9, 40.2]],
  },
  gpsLeg: {
    type: "LineString",
    colorRole: "gps",
    lineRole: "unapproved_gps_tether",
    pattern: "solid",
    lineStyle: "solid",
    authority: "unapproved_gps_tether",
    approvedRoad: false,
    navigationGeometry: false,
    visibility: "main-map-all-and-ascent",
    label: "GPS tether",
    coordinates: [[-80.9, 40.2], [-80.89, 40.2]],
  },
  redContinuation: null,
  redDecision: { state: "not_drawn", reason: "No proof" },
};

function mapHarness() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Map<string, unknown>();
  const addSource = vi.fn((sourceId: string) => {
    sources.set(sourceId, { setData: vi.fn() });
  });
  const removeSource = vi.fn((sourceId: string) => sources.delete(sourceId));
  const addLayer = vi.fn((layer: { id: string }) => layers.set(layer.id, layer));
  const removeLayer = vi.fn((layerId: string) => layers.delete(layerId));
  const setFilter = vi.fn();
  const setLayoutProperty = vi.fn();
  const map = {
    addLayer,
    addSource,
    getLayer: (layerId: string) => layers.get(layerId),
    getSource: (sourceId: string) => sources.get(sourceId),
    getStyle: () => ({
      version: 8,
      sources: {},
      layers: [{ id: "labels", type: "symbol" }],
    }),
    removeLayer,
    removeSource,
    setFilter,
    setLayoutProperty,
  } as unknown as MapLibreMap;
  return { addLayer, addSource, layers, map, removeLayer, removeSource, setFilter, setLayoutProperty, sources };
}

describe("Ascent native road-line layers", () => {
  it("creates separate solid arrival and unapproved GPS-tether features", () => {
    expect(ascentPadRoadCollection([display])).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            padId: "pad-1",
            company: "Ascent",
            colorRole: "teal",
            label: "arrival",
          },
          geometry: {
            type: "LineString",
            coordinates: [[-81, 40.1], [-80.9, 40.2]],
          },
        },
        {
          type: "Feature",
          properties: {
            padId: "pad-1",
            company: "Ascent",
            colorRole: "gps",
            label: "GPS tether",
          },
          geometry: {
            type: "LineString",
            coordinates: [[-80.9, 40.2], [-80.89, 40.2]],
          },
        },
      ],
    });
  });

  it("adds batch2 solid teal and neutral runs to the same native source", () => {
    const approach: AscentPadApproachMapDisplay = {
      kind: "batch2-approach",
      padId: "pad-2",
      company: "Ascent",
      lines: [
        { type: "LineString", colorRole: "teal", label: "OH-78", coordinates: [[-81.1, 40.1], [-81.11, 40.11]] },
        { type: "LineString", colorRole: "unverified", label: "Unverified / unapproved access", coordinates: [[-81.11, 40.11], [-81.12, 40.12]] },
      ],
    };
    const collection = ascentPadRoadCollection([display, approach]);
    expect(collection.features).toHaveLength(4);
    expect(collection.features.filter((feature) => feature.properties.padId === "pad-2")).toEqual([
      expect.objectContaining({ properties: expect.objectContaining({ colorRole: "teal", label: "OH-78" }) }),
      expect.objectContaining({ properties: expect.objectContaining({ colorRole: "unverified", label: "Unverified / unapproved access" }) }),
    ]);
  });

  it("keeps red, GPS, unverified, teal, and selected pairs in required paint order", () => {
    expect(ascentPadRoadLayerIdsInPaintOrder).toEqual([
      ascentPadRoadRedCasingLayerId,
      ascentPadRoadRedLineLayerId,
      ascentPadRoadGpsCasingLayerId,
      ascentPadRoadGpsLineLayerId,
      ascentPadRoadUnverifiedCasingLayerId,
      ascentPadRoadUnverifiedLineLayerId,
      ascentPadRoadTealCasingLayerId,
      ascentPadRoadTealLineLayerId,
      ascentPadRoadSelectedCasingLayerId,
      ascentPadRoadSelectedLineLayerId,
    ]);
  });

  it("draws GPS tethers as zoom-scaled thin solid neutral lines", () => {
    const harness = mapHarness();
    expect(syncAscentPadRoadLayers(harness.map, [display], null)).toBe(true);
    const gpsLine = harness.layers.get(ascentPadRoadGpsLineLayerId) as {
      filter: unknown;
      paint: Record<string, unknown>;
    };
    expect(JSON.stringify(gpsLine.filter)).toContain("gps");
    expect(gpsLine.paint["line-color"]).toBe("#94a3b8");
    expect(gpsLine.paint).not.toHaveProperty("line-dasharray");
    expect(gpsLine.paint["line-width"]).toEqual(expect.arrayContaining(["interpolate"]));
  });

  it("draws unresolved approach sections as wider solid neutral lines", () => {
    const harness = mapHarness();
    const approach: AscentPadApproachMapDisplay = {
      kind: "batch2-approach",
      padId: "pad-2",
      company: "Ascent",
      lines: [{
        type: "LineString",
        colorRole: "unverified",
        label: "Unverified / unapproved access",
        coordinates: [[-81.11, 40.11], [-81.12, 40.12]],
      }],
    };
    expect(syncAscentPadRoadLayers(harness.map, [approach], null)).toBe(true);
    const unverifiedLine = harness.layers.get(ascentPadRoadUnverifiedLineLayerId) as {
      filter: unknown;
      paint: Record<string, unknown>;
    };
    expect(JSON.stringify(unverifiedLine.filter)).toContain("unverified");
    expect(unverifiedLine.paint["line-color"]).toBe("#94a3b8");
    expect(unverifiedLine.paint).not.toHaveProperty("line-dasharray");
    expect(unverifiedLine.paint["line-width"]).toEqual(expect.arrayContaining(["interpolate"]));
  });

  it("updates a complete native source in place instead of rebuilding its layers", () => {
    const harness = mapHarness();
    expect(syncAscentPadRoadLayers(harness.map, [display], null)).toBe(true);
    expect(harness.addSource).toHaveBeenCalledTimes(1);
    expect(harness.addLayer).toHaveBeenCalledTimes(ascentPadRoadLayerIdsInPaintOrder.length);

    const source = harness.sources.get(ascentPadRoadSourceId);
    expect(source).toBeDefined();
    expect(syncAscentPadRoadLayers(harness.map, [display], display.padId)).toBe(true);
    expect(source?.setData).toHaveBeenCalledTimes(1);
    expect(harness.addSource).toHaveBeenCalledTimes(1);
    expect(harness.addLayer).toHaveBeenCalledTimes(ascentPadRoadLayerIdsInPaintOrder.length);
    expect(harness.removeSource).not.toHaveBeenCalled();
    expect(harness.removeLayer).not.toHaveBeenCalled();
    expect(harness.setFilter.mock.calls.some((call) => JSON.stringify(call).includes(display.padId))).toBe(true);
  });

  it("hides and empties an existing source without removing it", () => {
    const harness = mapHarness();
    expect(syncAscentPadRoadLayers(harness.map, [display], null)).toBe(true);
    const source = harness.sources.get(ascentPadRoadSourceId);

    expect(syncAscentPadRoadLayers(harness.map, [], null)).toBe(true);
    expect(source?.setData).toHaveBeenCalledWith({ type: "FeatureCollection", features: [] });
    expect(harness.setLayoutProperty).toHaveBeenCalledWith(
      ascentPadRoadLayerIdsInPaintOrder[0],
      "visibility",
      "none",
    );
    expect(harness.removeSource).not.toHaveBeenCalled();
    expect(harness.removeLayer).not.toHaveBeenCalled();
  });
});
