import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPadStatus } from "./status";
import type { DriverRouteStep, PadSummary } from "./types";

function pad(overrides: Partial<PadSummary> = {}): PadSummary {
  return {
    padId: "test-pad",
    canonicalId: "11111111-1111-4111-8111-111111111111",
    legacyId: "test--pad",
    aliases: ["test--pad"],
    recordNumber: 1,
    recordRevision: "fixture-r1",
    recordType: "pad",
    company: "Test",
    padName: "TEST PAD",
    state: "Ohio",
    county: "Belmont",
    township: "",
    address: "",
    coordinate: { latitude: 40.1, longitude: -80.9, role: "driver_entrance" },
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: "",
    writtenDirections: "",
    verificationStatus: "",
    operatingStatus: "",
    updatedAt: null,
    ...overrides,
  };
}

function publicResponse(row: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ padId: "11111111-1111-4111-8111-111111111111", recordRevision: "fixture-r1", ...row }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

function exactGeometry(stepCount = 2) {
  return {
    type: "FeatureCollection",
    features: Array.from({ length: stepCount }, (_, index) => ({
      type: "Feature",
      properties: { stepOrder: index + 1, privateRoadId: "must-not-leak" },
      geometry: {
        type: "LineString",
        coordinates: [[-80.9 + index * 0.01, 40.1 + index * 0.01], [-80.895 + index * 0.01, 40.105 + index * 0.01]],
      },
    })),
  };
}

function exactSteps(): DriverRouteStep[] {
  return [
    { order: 1, kind: "continue", displayName: "OH-7", verifiedDesignations: [], instruction: "Continue on OH-7", distanceMiles: null },
    { order: 2, kind: "turn", displayName: "CR-10", verifiedDesignations: [], instruction: "Turn right onto CR-10", distanceMiles: 1.2 },
  ];
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function publicGooglePoint(sequence: number, latitude: number, longitude: number, shapeRole?: string) {
  return {
    sequence,
    kind: "shape",
    shape_role: shapeRole,
    latitude,
    longitude,
    source_kind: "authoritative_clipped_geometry",
    occurrence_id: `occurrence-${sequence}`,
    source_segment_keys: [`segment-${sequence}`],
    source_digest: "a".repeat(32),
  };
}

function publicGoogleRow(points: Record<string, unknown>[]) {
  const canonicalId = "11111111-1111-4111-8111-111111111111";
  return {
    pad_id: canonicalId,
    route_revision: 7,
    source_revision: "fixture-r1",
    manifest: {
      manifest_version: "issue97-google-v1",
      manifest_digest: "b".repeat(32),
      status: "ready",
      route_ready: true,
      pad_id: canonicalId,
      route_revision: 7,
      points,
    },
  };
}

function exactReadyStatusRow() {
  return {
    padId: "11111111-1111-4111-8111-111111111111",
    recordRevision: "fixture-r1",
    route: { state: "ready", source: "exact_graph", steps: exactSteps(), geometry: exactGeometry() },
    graph: { state: "active_current", county: "Belmont" },
    google: { publicState: "ready", safeReason: "Exact package released." },
    destination: { available: true, role: "driver_entrance", latitude: 40.1, longitude: -80.9 },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public driver status boundary", () => {
  it("launches one approved route only when the entire exact manifest has one mobile-safe URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(exactReadyStatusRow()))
      .mockResolvedValueOnce(jsonResponse([publicGoogleRow([
        publicGooglePoint(1, 40.2, -80.9, "route_ingress"),
        { sequence: 2, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: "11111111-1111-4111-8111-111111111111" },
      ])]));
    vi.stubGlobal("fetch", fetchMock);

    const status = await loadPadStatus(pad());

    expect(status.google.publicState).toBe("ready");
    expect(status.google.routeUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a valid multi-section manifest in-app instead of exposing its first section as a route", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(exactReadyStatusRow()))
      .mockResolvedValueOnce(jsonResponse([publicGoogleRow([
        publicGooglePoint(1, 40.2, -80.9, "route_ingress"),
        publicGooglePoint(2, 40.21, -80.91),
        publicGooglePoint(3, 40.22, -80.92),
        publicGooglePoint(4, 40.23, -80.93),
        { sequence: 5, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: "11111111-1111-4111-8111-111111111111" },
      ])]));
    vi.stubGlobal("fetch", fetchMock);

    const status = await loadPadStatus(pad());

    expect(status.route).toMatchObject({ state: "ready", source: "exact_graph" });
    expect(status.routeSteps).toEqual(exactSteps());
    expect(status.route.geometry?.features).toHaveLength(2);
    expect(JSON.stringify(status.route.geometry)).not.toContain("privateRoadId");
    expect(status.google).toEqual({
      publicState: "unavailable",
      routeUrl: null,
      safeReason: "No single exact Google handoff is available. Use the BrineSearch map and approved steps.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not reveal private Google readiness in a split state", async () => {
    publicResponse({
      pad_id: "11111111-1111-4111-8111-111111111111",
      record_revision: "split-r1",
      route_state: "written_only",
      route_source: "reviewed_written",
      route_safe_reason: "The reviewed route is not publicly published.",
      graph_state: "active_current",
      graph_county: "Belmont",
      public_google_state: "not_published",
      public_google_route_url: null,
      public_google_safe_reason: "No current public Google route is published.",
      destination_available: false,
      route_steps: [],
      private_google_state: "ready",
      private_google_route_url: "https://private.example/must-not-leak",
      private_google_candidate_id: "secret-candidate",
    });

    const status = await loadPadStatus(pad());
    const serialized = JSON.stringify(status);

    expect(status.google).toEqual({
      publicState: "not_published",
      routeUrl: null,
      safeReason: "No current public Google route is published.",
    });
    expect(serialized).not.toContain("private");
    expect(serialized).not.toContain("secret-candidate");
    expect(serialized).not.toContain("must-not-leak");
  });

  it("keeps legacy coordinates destination-ineligible when public status is unavailable", async () => {
    const status = await loadPadStatus(
      pad({
        canonicalId: null,
        legacyId: "ascent--lorraine",
        coordinate: { latitude: 40.09955, longitude: -80.840213, role: "legacy_saved" },
        structuredRoadSequence: "",
        writtenDirections: "",
      }),
    );

    expect(status.route).toMatchObject({ state: "unavailable", source: "destination_only" });
    expect(status.destination).toEqual({ available: false, latitude: 40.09955, longitude: -80.840213 });
    expect(status.google.routeUrl).toBeNull();
  });

  it("keeps a held route closed even when the pad has a driver-entrance coordinate", async () => {
    publicResponse({
      route_state: "held",
      route_source: "none",
      route_safe_reason: "Identity reconciliation is incomplete.",
      graph_state: "held",
      public_google_state: "held",
      public_google_route_url: null,
      public_google_safe_reason: "No approved public route is available.",
      destination_available: false,
      route_steps: [],
    });

    const status = await loadPadStatus(pad({ legacyId: "ascent--cooper" }));

    expect(status.route.state).toBe("held");
    expect(status.destination.available).toBe(false);
    expect(status.google.routeUrl).toBeNull();
    expect(status.routeSteps).toEqual([]);
  });

  it("rejects a mismatched selected-pad response and malformed navigation coordinates", async () => {
    publicResponse({
      padId: "22222222-2222-4222-8222-222222222222",
      route: { state: "ready", source: "exact_graph" },
      graph: { state: "active_current" },
      google: { publicState: "not_published" },
      destination: { available: true, role: "driver_entrance", latitude: 40.2, longitude: -80.8 },
    });
    const mismatched = await loadPadStatus(pad());
    expect(mismatched.route.state).not.toBe("ready");
    expect(mismatched.destination.available).toBe(false);

    publicResponse({
      route: { state: "ready", source: "exact_graph" },
      graph: { state: "active_current" },
      google: { publicState: "not_published" },
      destination: { available: true, role: "driver_entrance", latitude: 0, longitude: 0 },
    });
    const zeroOrigin = await loadPadStatus(pad());
    expect(zeroOrigin.destination).toEqual({ available: false, latitude: null, longitude: null });

    publicResponse({
      route: { state: "ready", source: "exact_graph" },
      graph: { state: "active_current" },
      google: { publicState: "not_published" },
      destination: { available: true, role: "reference", latitude: 40.2, longitude: -80.8 },
    });
    const wrongRole = await loadPadStatus(pad());
    expect(wrongRole.destination.available).toBe(false);
  });

  it("rejects status for a different directory record revision", async () => {
    publicResponse({
      recordRevision: "fixture-r2",
      route: { state: "ready", source: "exact_graph", steps: exactSteps(), geometry: exactGeometry() },
      graph: { state: "active_current" },
      google: { publicState: "not_published" },
      destination: { available: true, role: "driver_entrance", latitude: 40.1, longitude: -80.9 },
    });

    const status = await loadPadStatus(pad(), "live_current");

    expect(status.recordRevision).toBe("fixture-r1");
    expect(status.route.state).not.toBe("ready");
    expect(status.route.geometry).toBeNull();
    expect(status.destination.available).toBe(false);
  });

  it("accepts only sanitized exact geometry for a ready route on the active graph", async () => {
    publicResponse({
      route: {
        state: "ready",
        source: "exact_graph",
        steps: exactSteps(),
        geometry: exactGeometry(),
      },
      graph: { state: "active_current" },
      google: { publicState: "not_published" },
      destination: { available: true, role: "driver_entrance", latitude: 40.1, longitude: -80.9 },
    });

    const status = await loadPadStatus(pad(), "live_current");

    expect(status.route.geometry).toEqual({
      type: "FeatureCollection",
      features: exactGeometry().features.map(({ properties: { stepOrder }, geometry }) => ({
        type: "Feature",
        properties: { stepOrder },
        geometry,
      })),
    });
    expect(JSON.stringify(status)).not.toContain("privateRoadId");
  });

  it("accepts one exact traveled step when its one geometry feature matches", async () => {
    const steps = [exactSteps()[0]!];
    publicResponse({
      route: { state: "ready", source: "exact_graph", steps, geometry: exactGeometry(1) },
      graph: { state: "active_current" },
      google: { publicState: "not_published" },
      destination: { available: true, role: "driver_entrance", latitude: 40.1, longitude: -80.9 },
    });

    const status = await loadPadStatus(pad(), "live_current");

    expect(status.route).toMatchObject({ state: "ready", source: "exact_graph" });
    expect(status.routeSteps).toEqual(steps);
    expect(status.route.geometry?.features).toHaveLength(1);
  });

  it("downgrades a claimed ready route when exact steps or geometry are missing or malformed", async () => {
    publicResponse({
      route: { state: "ready", source: "exact_graph", steps: [], geometry: exactGeometry() },
      graph: { state: "active_current" },
      google: { publicState: "ready", routeUrl: "https://example.invalid/must-not-open" },
      destination: { available: false },
    });
    const missingSteps = await loadPadStatus(pad());
    expect(missingSteps.route).toMatchObject({ state: "held", geometry: null });
    expect(missingSteps.routeSteps).toEqual([]);
    expect(missingSteps.google).toMatchObject({ publicState: "stale", routeUrl: null });

    const malformed = exactSteps();
    malformed[1] = { ...malformed[1]!, order: 3 };
    publicResponse({
      route: { state: "ready", source: "exact_graph", steps: malformed, geometry: exactGeometry() },
      graph: { state: "active_current" },
      google: { publicState: "not_published" },
      destination: { available: false },
    });
    const badOrder = await loadPadStatus(pad());
    expect(badOrder.route.state).toBe("held");
    expect(badOrder.routeSteps).toEqual([]);
  });

  it("requires a one-to-one ordered binding between route steps and geometry", async () => {
    const extraGeometry = exactGeometry(3);
    publicResponse({
      route: { state: "ready", source: "exact_graph", steps: exactSteps(), geometry: extraGeometry },
      graph: { state: "active_current" },
      google: { publicState: "ready", routeUrl: "https://example.invalid/must-not-open" },
      destination: { available: false },
    });
    const extra = await loadPadStatus(pad());
    expect(extra.route).toMatchObject({ state: "held", geometry: null });
    expect(extra.routeSteps).toEqual([]);
    expect(extra.google).toMatchObject({ publicState: "stale", routeUrl: null });

    const missingOrder = exactGeometry();
    missingOrder.features[1]!.properties.stepOrder = 3;
    publicResponse({
      route: { state: "ready", source: "exact_graph", steps: exactSteps(), geometry: missingOrder },
      graph: { state: "active_current" },
      google: { publicState: "not_published" },
      destination: { available: false },
    });
    const mismatchedOrder = await loadPadStatus(pad());
    expect(mismatchedOrder.route).toMatchObject({ state: "held", geometry: null });
    expect(mismatchedOrder.routeSteps).toEqual([]);
  });

  it("rejects exact geometry outside the supported field service area", async () => {
    const outside = exactGeometry();
    outside.features[0]!.geometry.coordinates = [[-100, 40.1], [-99.9, 40.2]];
    publicResponse({
      route: { state: "ready", source: "exact_graph", steps: exactSteps(), geometry: outside },
      graph: { state: "active_current" },
      google: { publicState: "not_published" },
      destination: { available: false },
    });

    const status = await loadPadStatus(pad());
    expect(status.route).toMatchObject({ state: "held", geometry: null });
    expect(status.routeSteps).toEqual([]);
  });

  it("rejects a route response that exceeds the bounded public step contract", async () => {
    const steps: DriverRouteStep[] = Array.from({ length: 501 }, (_, index) => ({
      order: index + 1,
      kind: "continue",
      displayName: `Road ${index + 1}`,
      verifiedDesignations: [],
      instruction: `Continue on Road ${index + 1}`,
      distanceMiles: null,
    }));
    const geometry = {
      type: "FeatureCollection",
      features: steps.map((step) => ({
        type: "Feature",
        properties: { stepOrder: step.order },
        geometry: { type: "LineString", coordinates: [[-80.9, 40.1], [-80.899, 40.101]] },
      })),
    };
    publicResponse({
      route: { state: "ready", source: "exact_graph", steps, geometry },
      graph: { state: "active_current" },
      google: { publicState: "ready", routeUrl: "https://example.invalid/must-not-open" },
      destination: { available: false },
    });

    const status = await loadPadStatus(pad());

    expect(status.route).toMatchObject({ state: "held", geometry: null });
    expect(status.routeSteps).toEqual([]);
    expect(status.google).toMatchObject({ publicState: "stale", routeUrl: null });
  });

  it("discards supplied route geometry unless route and graph authority are both current", async () => {
    publicResponse({
      route: {
        state: "held",
        source: "none",
        geometry: {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: { stepOrder: 1 },
            geometry: { type: "LineString", coordinates: [[-80.9, 40.1], [-80.89, 40.11]] },
          }],
        },
      },
      graph: { state: "active_current" },
      google: { publicState: "held" },
      destination: { available: false },
    });

    const status = await loadPadStatus(pad());

    expect(status.route.geometry).toBeNull();
  });

  it("labels a verified cached directory record as cached rather than live", async () => {
    const status = await loadPadStatus(pad({ canonicalId: null }), "cached_live");
    expect(status.dataState).toBe("cached");
  });

  it("keeps a packaged structured road sequence non-actionable when no written directions exist", async () => {
    const status = await loadPadStatus(pad({
      canonicalId: null,
      structuredRoadSequence: "OH-7 → CR-10 → Lease Road",
      writtenDirections: "",
    }), "packaged_fallback");

    expect(status.route).toMatchObject({
      state: "unavailable",
      source: "destination_only",
      geometry: null,
      writtenDirections: null,
    });
    expect(status.routeSteps).toEqual([]);
    expect(status.destination).toEqual({ available: false, latitude: 40.1, longitude: -80.9 });
  });

  it("does not revive legacy route prose or steps after the current status RPC fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const status = await loadPadStatus(pad({
      structuredRoadSequence: "OH-7 → CR-10 → Lease Road",
      writtenDirections: "Turn right onto an unverified lease road.",
    }), "live_current");

    expect(status.route).toMatchObject({
      state: "unavailable",
      source: "destination_only",
      geometry: null,
      lastVerifiedAt: null,
      writtenDirections: null,
    });
    expect(status.routeSteps).toEqual([]);
    expect(status.destination).toEqual({ available: false, latitude: 40.1, longitude: -80.9 });
    expect(status.google.routeUrl).toBeNull();
  });
});

describe("road-sharing and alias fixtures", () => {
  it("preserves the verified Walking Tall shared-pavement instruction without inventing a turn", async () => {
    const walkingTallSteps: DriverRouteStep[] = [
      {
        order: 1,
        kind: "continue",
        displayName: "SR-149",
        verifiedDesignations: ["SR-149"],
        instruction: "Continue on SR-149",
        distanceMiles: null,
      },
      {
        order: 2,
        kind: "shared_begin",
        displayName: "Water Tower Rd",
        verifiedDesignations: ["TR-202"],
        instruction: "Continue on shared pavement as Water Tower Rd / TR-202",
        distanceMiles: null,
      },
    ];
    publicResponse({
      route: { state: "ready", source: "exact_graph", steps: walkingTallSteps, geometry: exactGeometry() },
      graph: { state: "active_current" },
      public_google_state: "ready",
      public_google_route_url: "https://maps.example/walking-tall",
      destination_available: true,
      destination_role: "driver_entrance",
      destination_latitude: 40.023676,
      destination_longitude: -81.024993,
    });

    const status = await loadPadStatus(
      pad({
        padId: "eqt--walking-tall",
        legacyId: "eqt--walking-tall",
        company: "Eqt",
        padName: "WALKING TALL",
        coordinate: { latitude: 40.023676, longitude: -81.024993, role: "driver_entrance" },
        structuredRoadSequence: "SR-149 → Water Tower Rd",
      }),
    );

    expect(status.routeSteps).toEqual(walkingTallSteps);
    expect(status.routeSteps[1]).toMatchObject({
      kind: "shared_begin",
      displayName: "Water Tower Rd",
      verifiedDesignations: ["TR-202"],
    });
    expect(status.routeSteps[1]?.instruction).not.toMatch(/\bturn\b/i);
  });

  it("keeps the conflicting Shepherdstown aliases held and makes no shared-pavement claim", async () => {
    publicResponse({
      route_state: "held",
      route_source: "none",
      route_safe_reason: "Shepherdstown / Shepardstown / Shepherstown requires source verification.",
      graph_state: "held",
      public_google_state: "not_published",
      public_google_route_url: null,
      public_google_safe_reason: "No current public Google route is published.",
      destination_available: false,
      route_steps: [],
    });

    const status = await loadPadStatus(
      pad({
        padId: "ascent--cravat-north",
        legacyId: "ascent--cravat-north",
        company: "Ascent",
        padName: "CRAVAT NORTH",
        structuredRoadSequence: "I-70 → Exit 216 → OH-9 → Shepherstown Rd → CR-36",
      }),
    );

    expect(status.route).toMatchObject({ state: "held", source: "none" });
    expect(status.route.safeReason).toMatch(/requires source verification/i);
    expect(status.routeSteps).toEqual([]);
    expect(status.routeSteps.some((step) => step.kind === "shared_begin" || step.kind === "shared_end")).toBe(false);
    expect(status.google.routeUrl).toBeNull();
  });
});
