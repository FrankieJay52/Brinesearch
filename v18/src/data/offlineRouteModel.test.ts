import { describe, expect, it } from "vitest";
import { buildOfflineRouteRecord, offlineRouteSchema, restoreOfflinePadStatus } from "./offlineRouteModel";
import type { DriverPadStatus, PadSummary } from "./types";
import { buildOwnerVerifiedAccessRoute } from "./googleRoute";
import { ownerVerifiedAccessFixture } from "./ownerVerifiedAccessFixture";

const padId = "11111111-1111-4111-8111-111111111111";

function pad(): PadSummary {
  return {
    padId,
    canonicalId: padId,
    legacyId: "ascent--offline-test",
    aliases: [],
    recordNumber: 1,
    recordRevision: "1787700000000000",
    recordType: "pad",
    company: "Ascent",
    padName: "OFFLINE TEST",
    state: "Ohio",
    county: "Belmont",
    township: "Union",
    address: "100 Test Road",
    coordinate: { latitude: 40.1, longitude: -80.9, role: "driver_entrance" },
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: "OH-7 → CR-10 → Lease Road",
    writtenDirections: "",
    verificationStatus: "reviewed",
    operatingStatus: "ACTIVE",
    updatedAt: "2026-08-25T12:00:00.000Z",
  };
}

function exactStatus(): DriverPadStatus {
  return {
    padId,
    recordRevision: "1787700000000000",
    dataState: "live",
    route: {
      state: "ready",
      source: "exact_graph",
      geometry: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: { stepOrder: 1 },
          geometry: { type: "LineString", coordinates: [[-80.9, 40.1], [-80.89, 40.11]] },
        }],
      },
      safeReason: null,
      lastVerifiedAt: "2026-08-25T12:01:00.000Z",
      writtenDirections: null,
    },
    graph: {
      state: "active_current",
      county: "Belmont",
      publicSource: "Ohio exact graph",
      lastVerifiedAt: "2026-08-25T12:01:00.000Z",
    },
    google: { publicState: "not_published", routeUrl: null, safeReason: "Not published." },
    destination: { available: true, role: "driver_entrance", latitude: 40.1, longitude: -80.9 },
    routeSteps: [{
      order: 1,
      kind: "continue",
      displayName: "CR-10",
      verifiedDesignations: ["CR-10"],
      instruction: "Continue on CR-10",
      distanceMiles: 1.2,
    }],
  };
}

function immutableHandoffStatus(): DriverPadStatus {
  const status = exactStatus();
  status.route.source = "exact_graph_handoff";
  status.graph.state = "verified_release";
  status.graph.publicSource = "BrineSearch immutable approved release";
  status.google = {
    publicState: "ready",
    routeUrl: "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.12%2C-80.88&waypoints=40.1%2C-80.9%7C40.11%2C-80.89",
    safeReason: "Frozen reviewed handoff.",
  };
  status.destination = {
    available: true,
    role: "saved_pad_destination",
    latitude: 40.12,
    longitude: -80.88,
  };
  return status;
}

function ownerAccessStatus(): DriverPadStatus {
  const release = buildOwnerVerifiedAccessRoute(ownerVerifiedAccessFixture());
  const status = exactStatus();
  status.route = {
    ...status.route,
    source: "owner_verified_access",
    geometry: release.geometry,
    safeReason: "Public-road core is exact ODOT graph geometry; final dashed leg is owner-verified private lease access.",
    lastVerifiedAt: release.lastVerifiedAt,
  };
  status.graph.state = "verified_release";
  status.routeSteps = release.steps;
  status.destination = {
    available: true,
    role: "saved_pad_destination",
    latitude: release.destination.latitude,
    longitude: release.destination.longitude,
  };
  status.google = {
    publicState: "ready",
    routeUrl: release.navigationUrl,
    safeReason: "Four frozen controls.",
  };
  return status;
}

function copyRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("V18 offline route SQLite model", () => {
  it("defines the requested tables and lookup indexes", () => {
    const schema = offlineRouteSchema.join("\n");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS pads");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS routes");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS route_steps");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS meta");
    expect(schema).toContain("ON pads(name)");
    expect(schema).toContain("ON routes(pad_id)");
    expect(schema).toContain("ON route_steps(route_id, step_index)");
  });

  it("fails closed offline instead of misclassifying owner access as exact graph authority", () => {
    expect(buildOfflineRouteRecord(pad(), ownerAccessStatus(), "2026-08-28T20:06:00.000Z")).toBeNull();
  });

  it("stores only the reviewed exact step and exact API geometry endpoints", () => {
    const record = buildOfflineRouteRecord(pad(), exactStatus(), "2026-08-25T12:02:00.000Z");
    expect(record).not.toBeNull();
    expect(record?.steps).toEqual([expect.objectContaining({
      step_index: 1,
      road_name: "CR-10",
      road_id: null,
      instruction: "Continue on CR-10",
      miles: 1.2,
      start_lat: 40.1,
      start_lon: -80.9,
      end_lat: 40.11,
      end_lon: -80.89,
    })]);
  });

  it("restores exact steps as last-known while withholding current geometry and Google", () => {
    const sourcePad = pad();
    const record = buildOfflineRouteRecord(sourcePad, exactStatus(), "2026-08-25T12:02:00.000Z");
    const status = restoreOfflinePadStatus(sourcePad, record);
    expect(status).toMatchObject({
      dataState: "cached",
      route: { state: "stale", source: "exact_graph", geometry: null },
      graph: { state: "stale" },
      google: { publicState: "not_published", routeUrl: null },
      destination: { available: false },
    });
    expect(status?.routeSteps).toEqual(exactStatus().routeSteps);
  });

  it("restores a validated frozen core handoff without claiming an offline revocation check", () => {
    const sourcePad = pad();
    const status = immutableHandoffStatus();
    const record = buildOfflineRouteRecord(sourcePad, status, "2026-08-25T12:02:00.000Z");
    expect(record).not.toBeNull();
    const restored = restoreOfflinePadStatus(sourcePad, record);
    expect(restored).toMatchObject({
      dataState: "cached",
      loadProvenance: "device_cache",
      route: { state: "ready", source: "exact_graph_handoff", geometry: null },
      graph: { state: "verified_release" },
      google: { publicState: "ready", routeUrl: status.google.routeUrl },
      destination: { available: true, role: "saved_pad_destination", latitude: 40.12, longitude: -80.88 },
    });
    expect(restored?.route.safeReason).toMatch(/last-known frozen approved release/i);
    expect(restored?.route.safeReason).toMatch(/revocation cannot be checked/i);
  });

  it.each([
    ["script URL", "javascript:alert(1)"],
    ["wrong host", "https://example.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.12%2C-80.88&waypoints=40.1%2C-80.9%7C40.11%2C-80.89"],
    ["changed approved waypoint", "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.12%2C-80.88&waypoints=40.2%2C-80.9%7C40.11%2C-80.89"],
    ["out-of-area waypoint", "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.12%2C-80.88&waypoints=40.1%2C-100%7C40.11%2C-80.89"],
    ["changed destination", "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.13%2C-80.88&waypoints=40.1%2C-80.9%7C40.11%2C-80.89"],
    ["origin injection", "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&origin=40.2%2C-80.9&destination=40.12%2C-80.88&waypoints=40.1%2C-80.9%7C40.11%2C-80.89"],
    ["extra parameter", "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.12%2C-80.88&waypoints=40.1%2C-80.9%7C40.11%2C-80.89&avoid=tolls"],
  ])("rejects a locally tampered immutable handoff: %s", (_label, routeUrl) => {
    const sourcePad = pad();
    const record = buildOfflineRouteRecord(sourcePad, immutableHandoffStatus(), "2026-08-25T12:02:00.000Z")!;
    const tampered = copyRecord(record);
    tampered.contract.immutableNavigationUrl = routeUrl;
    const restored = restoreOfflinePadStatus(sourcePad, tampered);
    expect(restored?.google.routeUrl ?? null).toBeNull();
    expect(restored?.google.publicState ?? "unavailable").not.toBe("ready");
    expect(restored?.route.state ?? "unavailable").not.toBe("ready");
  });

  it("preserves reviewed written directions without manufacturing structured steps", () => {
    const written = exactStatus();
    written.route = {
      state: "held",
      source: "legacy_written",
      geometry: null,
      safeReason: "Exact graph approval remains held.",
      lastVerifiedAt: "2026-08-25T12:01:00.000Z",
      writtenDirections: "Road sequence reference:\\n1. Continue on CR-10.",
    };
    written.graph.state = "held";
    written.routeSteps = [];
    const sourcePad = pad();
    const record = buildOfflineRouteRecord(sourcePad, written, "2026-08-25T12:02:00.000Z");
    expect(record?.steps).toEqual([]);
    const status = restoreOfflinePadStatus(sourcePad, record);
    expect(status?.route).toMatchObject({ state: "held", source: "legacy_written" });
    expect(status?.route.writtenDirections).toBe("Road sequence reference:\\n1. Continue on CR-10.");
    expect(status?.routeSteps).toEqual([]);
  });

  it("rejects non-current graph responses, revision drift, and injected road identities", () => {
    const heldGraph = exactStatus();
    heldGraph.graph.state = "held";
    expect(buildOfflineRouteRecord(pad(), heldGraph)).toBeNull();

    const sourcePad = pad();
    const record = buildOfflineRouteRecord(sourcePad, exactStatus(), "2026-08-25T12:02:00.000Z")!;
    expect(restoreOfflinePadStatus({ ...sourcePad, recordRevision: "1787700000000001" }, record)).toBeNull();
    record.steps[0]!.road_id = "invented-road-id";
    expect(restoreOfflinePadStatus(sourcePad, record)).toBeNull();
  });
});
