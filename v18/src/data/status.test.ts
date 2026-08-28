import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCompletedPadStatusCache, completedPadStatusIsReusable, hasCompletedReadyPadStatus, loadPadStatus, statusProjectionHasRequiredShape } from "./status";
import type { DriverRouteStep, PadSummary } from "./types";
import { ownerVerifiedAccessFixture } from "./ownerVerifiedAccessFixture";

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
      dependency_digest: "c".repeat(32),
      status: "ready",
      route_ready: true,
      pad_id: canonicalId,
      route_revision: 7,
      points,
    },
  };
}

function publicGoogleHandoffRow(value: ReturnType<typeof publicGoogleRow>, sequences = [1, 13, 15]) {
  const points = value.manifest.points;
  const destination = points.at(-1)!;
  return {
    pad_id: value.pad_id,
    route_revision: value.route_revision,
    source_manifest_digest: "b".repeat(32),
    source_dependency_digest: "c".repeat(32),
    handoff_version: "v18-google-mobile-v1",
    handoff_digest: "d".repeat(32),
    published_at: "2026-08-25T22:10:00Z",
    handoff: {
      handoff_version: "v18-google-mobile-v1",
      pad_id: value.pad_id,
      route_revision: value.route_revision,
      source_manifest_digest: "b".repeat(32),
      source_dependency_digest: "c".repeat(32),
      origin_mode: "current_location_until_route_ingress",
      mobile_waypoint_limit: 3,
      waypoints: sequences.map((sequence) => ({
        sequence,
        latitude: points[sequence - 1]?.latitude,
        longitude: points[sequence - 1]?.longitude,
      })),
      destination: {
        sequence: points.length,
        latitude: destination.latitude,
        longitude: destination.longitude,
        pad_id: value.pad_id,
      },
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

function atomicStatusEnvelope(
  status: Record<string, unknown>,
  publicGoogleRoute: Record<string, unknown> | null = null,
  publicGoogleHandoff: Record<string, unknown> | null = null,
  coreDestinationRelease: Record<string, unknown> | null = null,
  namedApproaches: Record<string, unknown>[] = [],
) {
  return { status, publicGoogleRoute, publicGoogleHandoff, coreDestinationRelease, namedApproaches };
}

function namedApproachRow(
  approachKey = "via-freeport",
  approachLabel = "Via Freeport",
  routeGroup: "primary" | "alternate" = "primary",
  variantIndex = 1,
  longitudeOffset = 0,
) {
  const start = { latitude: 40.15, longitude: -80.95 + longitudeOffset };
  const middle = { latitude: 40.12, longitude: -80.92 + longitudeOffset };
  const coreEnd = { latitude: 40.105, longitude: -80.905 + longitudeOffset };
  const destination = { latitude: 40.1, longitude: -80.9 };
  return {
    approachKey,
    approachLabel,
    routeGroup,
    variantIndex,
    releaseVersion: "v18-named-approach-v1",
    routeRevision: 9,
    steps: exactSteps(),
    geometry: {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { stepOrder: 1 }, geometry: { type: "LineString", coordinates: [[start.longitude, start.latitude], [middle.longitude, middle.latitude]] } },
        { type: "Feature", properties: { stepOrder: 2 }, geometry: { type: "LineString", coordinates: [[middle.longitude, middle.latitude], [coreEnd.longitude, coreEnd.latitude]] } },
      ],
    },
    ingress: { role: "exact_approved_ingress", label: approachLabel, ...start },
    coreEnd: { role: "exact_approved_handoff", label: "Approved road handoff", ...coreEnd },
    destination: { role: "saved_pad_destination", label: "Saved pad GPS", ...destination },
    finalLegMode: "google_to_saved_gps_unapproved",
    handoff: {
      originMode: "current_location_to_named_ingress",
      handoffMode: "verified_compact",
      waypoints: [start, middle, coreEnd],
    },
    lastVerifiedAt: "2026-08-26T20:00:00Z",
    statusRevision: "1".repeat(32),
    releaseDigest: variantIndex.toString(16).repeat(64),
    publishedAt: "2026-08-26T20:05:00Z",
  };
}

function coreDestinationReleaseRow() {
  const canonicalId = "11111111-1111-4111-8111-111111111111";
  const waypoints = [
    { sequence: 1, latitude: 40.15, longitude: -80.95 },
    { sequence: 2, latitude: 40.12, longitude: -80.92 },
    { sequence: 3, latitude: 40.105, longitude: -80.905 },
  ];
  return {
    padId: canonicalId,
    recordRevision: "fixture-r1",
    routeRevision: 1,
    releaseVersion: "v18-core-destination-v1",
    routeSteps: exactSteps(),
    routeGeometry: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { stepOrder: 1 },
          geometry: { type: "LineString", coordinates: [[-80.95, 40.15], [-80.92, 40.12]] },
        },
        {
          type: "Feature",
          properties: { stepOrder: 2 },
          geometry: { type: "LineString", coordinates: [[-80.92, 40.12], [-80.905, 40.105]] },
        },
      ],
    },
    graphCounty: "Belmont",
    graphLastVerifiedAt: "2026-08-24T23:53:01Z",
    destination: { available: true, role: "saved_pad_destination", latitude: 40.1, longitude: -80.9 },
    handoff: {
      handoff_version: "v18-core-destination-v1",
      pad_id: canonicalId,
      route_revision: 1,
      source_dependency_digest: "e".repeat(32),
      origin_mode: "current_location_until_route_ingress",
      waypoints,
      core_end: { ...waypoints[2], role: "exact_public_road_handoff" },
      destination: { sequence: 4, pad_id: canonicalId, role: "saved_pad_destination", latitude: 40.1, longitude: -80.9 },
      final_leg_mode: "google_to_saved_gps_unapproved",
    },
    dependencyDigest: "e".repeat(32),
    releaseDigest: "f".repeat(32),
    publishedAt: "2026-08-26T16:45:38Z",
  };
}

afterEach(() => {
  clearCompletedPadStatusCache();
  vi.unstubAllGlobals();
});

describe("public driver status boundary", () => {
  it("does not session-cache a partial 200 response and retries the next exact request", async () => {
    expect(statusProjectionHasRequiredShape({ padId: "11111111-1111-4111-8111-111111111111", recordRevision: "fixture-r1" })).toBe(false);
    expect(statusProjectionHasRequiredShape(exactReadyStatusRow())).toBe(true);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope({
        padId: "11111111-1111-4111-8111-111111111111",
        recordRevision: "fixture-r1",
      })))
      .mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope({
        ...exactReadyStatusRow(),
        google: { publicState: "not_published" },
      })));
    vi.stubGlobal("fetch", fetchMock);

    const partial = await loadPadStatus(pad());
    const recovered = await loadPadStatus(pad());

    expect(partial.loadProvenance).toBe("fallback");
    expect(recovered.loadProvenance).toBe("live_response");
    expect(recovered.route.state).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires valid status discriminators and complete available destinations", () => {
    const nestedHeld = {
      route: { state: "held", source: "legacy_written" },
      graph: { state: "held" },
      google: { publicState: "not_published" },
      destination: { available: false },
    };
    const flatWritten = {
      route_state: "written_only",
      route_source: "reviewed_written",
      graph_state: "active_current",
      public_google_state: "not_published",
      destination_available: false,
    };
    expect(statusProjectionHasRequiredShape(nestedHeld)).toBe(true);
    expect(statusProjectionHasRequiredShape(flatWritten)).toBe(true);

    const invalidMutations = [
      { ...nestedHeld, route: { ...nestedHeld.route, state: "unknown" } },
      { ...nestedHeld, route: { ...nestedHeld.route, source: null } },
      { ...nestedHeld, graph: { state: "unknown" } },
      { ...nestedHeld, google: { publicState: "unknown" } },
      { ...nestedHeld, destination: { available: true } },
      { ...nestedHeld, destination: { available: true, role: "reference", latitude: 40.1, longitude: -80.9 } },
      { ...nestedHeld, destination: { available: true, role: "driver_entrance", latitude: 40.1 } },
      { ...nestedHeld, destination: { available: true, role: "saved_pad_destination", longitude: -80.9 } },
      { ...nestedHeld, destination: { available: true, role: "driver_entrance", latitude: 0, longitude: 0 } },
      { ...nestedHeld, destination: { available: true, role: "driver_entrance", latitude: 39, longitude: -100 } },
    ];
    for (const mutation of invalidMutations) expect(statusProjectionHasRequiredShape(mutation)).toBe(false);

    expect(statusProjectionHasRequiredShape({
      ...nestedHeld,
      destination: { available: true, role: "driver_entrance", latitude: 40.1, longitude: -80.9 },
    })).toBe(true);
    expect(statusProjectionHasRequiredShape({
      ...nestedHeld,
      destination: { available: true, role: "saved_pad_destination", latitude: 40.1, longitude: -80.9 },
    })).toBe(true);
  });

  it("does not cache an invalid enum or an incomplete claimed-ready route", async () => {
    const valid = {
      ...exactReadyStatusRow(),
      google: { publicState: "not_published" },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope({
        ...valid,
        route: { ...valid.route, state: "unknown" },
      })))
      .mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(valid)))
      .mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope({
        ...valid,
        route: { state: "ready", source: "exact_graph", steps: [], geometry: exactGeometry() },
      })))
      .mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(valid)));
    vi.stubGlobal("fetch", fetchMock);

    expect((await loadPadStatus(pad())).loadProvenance).toBe("fallback");
    expect((await loadPadStatus(pad())).loadProvenance).toBe("live_response");
    clearCompletedPadStatusCache();
    expect((await loadPadStatus(pad())).loadProvenance).toBe("fallback");
    expect((await loadPadStatus(pad())).loadProvenance).toBe("live_response");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("loads named approaches atomically without changing the public Google state", async () => {
    const freeport = namedApproachRow();
    const cadiz = namedApproachRow("via-cadiz", "Via Cadiz", "alternate", 2, 0.02);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(
      {
        ...exactReadyStatusRow(),
        statusRevision: "1".repeat(32),
        route: { state: "held", source: "legacy_written", safeReason: "Base route remains held." },
        graph: { state: "held", county: "Belmont", lastVerifiedAt: "2026-08-26T20:00:00Z" },
        google: { publicState: "not_published", safeReason: "Public Google remains off." },
        destination: { available: false, role: null, latitude: null, longitude: null },
      },
      null,
      null,
      null,
      [freeport, cadiz],
    ))));

    const legacyPad = pad({
      coordinate: null,
      mapReference: { role: "reference", kind: "saved_pad_reference", latitude: 40.1, longitude: -80.9 },
    });
    const status = await loadPadStatus(legacyPad);
    const cached = await loadPadStatus(legacyPad);
    expect(status.route).toMatchObject({ state: "held", source: "legacy_written" });
    expect(status.google).toMatchObject({ publicState: "not_published", routeUrl: null });
    expect(status.namedApproaches?.map((approach) => approach.approachLabel)).toEqual(["Via Freeport", "Via Cadiz"]);
    expect(new URL(status.namedApproaches![0].navigationUrl).searchParams.get("waypoints"))
      .toBe("40.15,-80.95|40.12,-80.92|40.105,-80.905");
    expect(cached.loadProvenance).toBe("session_cache");
  });

  it("uses the immutable atomic named receipt while the directory GPS reference is still loading", async () => {
    const freeport = namedApproachRow();
    const cadiz = namedApproachRow("via-cadiz", "Via Cadiz", "alternate", 2, 0.02);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(
      {
        ...exactReadyStatusRow(),
        statusRevision: "1".repeat(32),
        route: { state: "held", source: "legacy_written", safeReason: "Base route remains held." },
        graph: { state: "held", county: "Belmont" },
        google: { publicState: "not_published", safeReason: "Public Google remains off." },
        destination: { available: false, role: null, latitude: null, longitude: null },
      },
      null,
      null,
      null,
      [freeport, cadiz],
    ))));

    const status = await loadPadStatus(pad({ coordinate: null, mapReference: null }));
    expect(status.namedApproaches?.map((approach) => approach.approachLabel)).toEqual(["Via Freeport", "Via Cadiz"]);
  });

  it("fails named receipts closed when their valid revision does not equal the atomic status revision", async () => {
    const freeport = namedApproachRow();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(
      {
        ...exactReadyStatusRow(),
        statusRevision: "2".repeat(32),
        route: { state: "held", source: "legacy_written", safeReason: "Base route remains held." },
        graph: { state: "held", county: "Belmont" },
        google: { publicState: "not_published", safeReason: "Public Google remains off." },
        destination: { available: false, role: null, latitude: null, longitude: null },
      },
      null,
      null,
      null,
      [freeport],
    ))));

    const status = await loadPadStatus(pad({ coordinate: null, mapReference: null }));
    expect(status.namedApproaches).toEqual([]);
  });

  it("fails the complete named choice set closed when one release drifts", async () => {
    const freeport = namedApproachRow();
    const cadiz = { ...namedApproachRow("via-cadiz", "Via Cadiz", "alternate", 2, 0.02), statusRevision: "not-a-digest" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(
      {
        ...exactReadyStatusRow(),
        statusRevision: "9".repeat(32),
        route: { state: "held", source: "legacy_written", safeReason: "Base route remains held." },
        graph: { state: "held", county: "Belmont" },
        google: { publicState: "not_published", safeReason: "Public Google remains off." },
        destination: { available: false, role: null, latitude: null, longitude: null },
      },
      null,
      null,
      null,
      [freeport, cadiz],
    ))));

    const status = await loadPadStatus(pad({
      coordinate: null,
      mapReference: { role: "reference", kind: "saved_pad_reference", latitude: 40.1, longitude: -80.9 },
    }));
    expect(status.route.state).toBe("held");
    expect(status.namedApproaches).toEqual([]);
    expect(status.google.publicState).toBe("not_published");
  });

  it("rejects a named GPS final leg that does not match the current trusted pad reference", async () => {
    const freeport = namedApproachRow();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(
      {
        ...exactReadyStatusRow(),
        route: { state: "held", source: "legacy_written", safeReason: "Base route remains held." },
        graph: { state: "held", county: "Belmont" },
        google: { publicState: "not_published", safeReason: "Public Google remains off." },
        destination: { available: false, role: null, latitude: null, longitude: null },
      },
      null,
      null,
      null,
      [freeport],
    ))));

    const status = await loadPadStatus(pad({
      coordinate: null,
      mapReference: { role: "reference", kind: "saved_pad_reference", latitude: 40.11, longitude: -80.91 },
    }));
    expect(status.route.state).toBe("held");
    expect(status.namedApproaches).toEqual([]);
  });

  it("reuses a completed revision-locked route for repeat opens until Settings clears the session check", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(atomicStatusEnvelope({
      ...exactReadyStatusRow(),
      google: { publicState: "not_published", safeReason: "Not published." },
    }))));
    vi.stubGlobal("fetch", fetchMock);

    expect(hasCompletedReadyPadStatus(pad())).toBe(false);
    const first = await loadPadStatus(pad());
    const second = await loadPadStatus(pad());
    expect(completedPadStatusIsReusable(first)).toBe(true);
    expect(first.loadProvenance).toBe("live_response");
    expect(second.loadProvenance).toBe("session_cache");
    expect(second.route).toEqual(first.route);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hasCompletedReadyPadStatus(pad())).toBe(true);
    expect(hasCompletedReadyPadStatus(pad({ recordRevision: "fixture-r2" }))).toBe(false);
    expect(hasCompletedReadyPadStatus(pad(), "cached_live")).toBe(false);

    clearCompletedPadStatusCache();
    expect(hasCompletedReadyPadStatus(pad())).toBe(false);
    const refreshed = await loadPadStatus(pad());
    expect(completedPadStatusIsReusable(refreshed)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never carries a completed check across a directory source-state transition", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(atomicStatusEnvelope({
      ...exactReadyStatusRow(),
      google: { publicState: "not_published", safeReason: "Not published." },
    }))));
    vi.stubGlobal("fetch", fetchMock);

    const current = await loadPadStatus(pad(), "live_current");
    const currentAgain = await loadPadStatus(pad(), "live_current");
    const cachedDirectory = await loadPadStatus(pad(), "cached_live");
    const staleDirectory = await loadPadStatus(pad(), "live_stale");

    expect(current.loadProvenance).toBe("live_response");
    expect(currentAgain.loadProvenance).toBe("session_cache");
    expect(cachedDirectory.loadProvenance).toBe("live_response");
    expect(staleDirectory.loadProvenance).toBe("live_response");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never labels an online session check Ready after the phone goes offline", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(atomicStatusEnvelope({
      ...exactReadyStatusRow(),
      google: { publicState: "not_published", safeReason: "Not published." },
    }))));
    vi.stubGlobal("fetch", fetchMock);

    await loadPadStatus(pad());
    expect(hasCompletedReadyPadStatus(pad())).toBe(true);

    vi.stubGlobal("navigator", { onLine: false });
    expect(hasCompletedReadyPadStatus(pad())).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.stubGlobal("navigator", { onLine: true });
    expect(hasCompletedReadyPadStatus(pad())).toBe(true);
  });

  it("reuses an honest held response for the exact revision without treating it as ready", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(atomicStatusEnvelope({
      ...exactReadyStatusRow(),
      route: { state: "held", source: "exact_graph", safeReason: "Route receipt held." },
      graph: { state: "active_current", county: "Belmont" },
      google: { publicState: "held", safeReason: "Route held." },
    }))));
    vi.stubGlobal("fetch", fetchMock);

    const first = await loadPadStatus(pad());
    const second = await loadPadStatus(pad());
    expect(first.route.state).toBe("held");
    expect(second.route.state).toBe("held");
    expect(second.loadProvenance).toBe("session_cache");
    expect(completedPadStatusIsReusable(first)).toBe(true);
    expect(hasCompletedReadyPadStatus(pad())).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks a failed online route request unavailable instead of Live", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    const status = await loadPadStatus(pad(), "live_current");

    expect(status.loadProvenance).toBe("fallback");
    expect(status.dataState).toBe("fallback");
    expect(completedPadStatusIsReusable(status)).toBe(false);
  });

  it("launches one approved route only when the entire exact manifest has one mobile-safe URL", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(
      exactReadyStatusRow(),
      publicGoogleRow([
        publicGooglePoint(1, 40.2, -80.9, "route_ingress"),
        { sequence: 2, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: "11111111-1111-4111-8111-111111111111" },
      ]),
    )));
    vi.stubGlobal("fetch", fetchMock);

    const status = await loadPadStatus(pad());

    expect(status.google.publicState).toBe("ready");
    expect(status.google.routeUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("brinesearch_v18_driver_pad_status_with_owner_access");
  });

  it("launches one reviewed exact road core with a separately labelled saved GPS destination", async () => {
    const release = coreDestinationReleaseRow();
    const statusRow = {
      ...exactReadyStatusRow(),
      statusRevision: "f".repeat(32),
      route: { state: "ready", source: "exact_graph_handoff", steps: exactSteps(), geometry: release.routeGeometry },
      graph: { state: "verified_release", county: "Belmont", publicSource: "BrineSearch immutable approved release", lastVerifiedAt: "2026-08-24T23:53:01Z" },
      destination: { available: true, role: "saved_pad_destination", latitude: 40.1, longitude: -80.9 },
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(
      statusRow,
      null,
      null,
      release,
    )));
    vi.stubGlobal("fetch", fetchMock);

    const status = await loadPadStatus(pad());
    const url = new URL(status.google.routeUrl!);

    expect(status.route).toMatchObject({ state: "ready", source: "exact_graph_handoff" });
    expect(status.destination).toMatchObject({ available: true, role: "saved_pad_destination" });
    expect(status.google.publicState).toBe("ready");
    expect(status.google.safeReason).toMatch(/approved road core/i);
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("waypoints")).toBe("40.15,-80.95|40.12,-80.92|40.105,-80.905");
    expect(url.searchParams.get("destination")).toBe("40.1,-80.9");
  });

  it("removes navigation when a core-destination release drifts from the selected pad", async () => {
    const release = coreDestinationReleaseRow();
    release.handoff.destination.pad_id = "22222222-2222-4222-8222-222222222222";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(
      {
        ...exactReadyStatusRow(),
        statusRevision: "f".repeat(32),
        route: { state: "ready", source: "exact_graph_handoff", steps: exactSteps(), geometry: release.routeGeometry },
        graph: { state: "verified_release", county: "Belmont", publicSource: "BrineSearch immutable approved release", lastVerifiedAt: "2026-08-24T23:53:01Z" },
        destination: { available: true, role: "saved_pad_destination", latitude: 40.1, longitude: -80.9 },
      },
      null,
      null,
      release,
    ))));

    const status = await loadPadStatus(pad());
    expect(status.route.state).toBe("ready");
    expect(status.google).toMatchObject({ publicState: "stale", routeUrl: null });
  });

  it("removes navigation when the immutable release digest does not match the status receipt", async () => {
    const release = coreDestinationReleaseRow();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(
      {
        ...exactReadyStatusRow(),
        statusRevision: "0".repeat(32),
        route: { state: "ready", source: "exact_graph_handoff", steps: exactSteps(), geometry: release.routeGeometry },
        graph: { state: "verified_release", county: "Belmont", publicSource: "BrineSearch immutable approved release", lastVerifiedAt: "2026-08-24T23:53:01Z" },
        destination: { available: true, role: "saved_pad_destination", latitude: 40.1, longitude: -80.9 },
      },
      null,
      null,
      release,
    ))));

    const status = await loadPadStatus(pad());
    expect(status.google).toMatchObject({ publicState: "stale", routeUrl: null });
  });

  it("keeps a valid multi-section manifest in-app instead of exposing its first section as a route", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(
      exactReadyStatusRow(),
      publicGoogleRow([
        publicGooglePoint(1, 40.2, -80.9, "route_ingress"),
        publicGooglePoint(2, 40.21, -80.91),
        publicGooglePoint(3, 40.22, -80.92),
        publicGooglePoint(4, 40.23, -80.93),
        { sequence: 5, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: "11111111-1111-4111-8111-111111111111" },
      ]),
    )));
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("launches one Cologie-style reviewed compact handoff bound to a sixteen-point exact manifest", async () => {
    const points = [
      ...Array.from({ length: 15 }, (_, index) => publicGooglePoint(index + 1, 40.2 + index * 0.001, -80.9 - index * 0.001, index === 0 ? "route_ingress" : undefined)),
      { sequence: 16, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: "11111111-1111-4111-8111-111111111111" },
    ];
    const routeRow = publicGoogleRow(points);
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(
      exactReadyStatusRow(),
      routeRow,
      publicGoogleHandoffRow(routeRow),
    )));
    vi.stubGlobal("fetch", fetchMock);

    const status = await loadPadStatus(pad());

    expect(status.route).toMatchObject({ state: "ready", source: "exact_graph" });
    expect(status.google.publicState).toBe("ready");
    expect(status.google.safeReason).toMatch(/reviewed mobile controls/i);
    const url = new URL(status.google.routeUrl!);
    expect(url.searchParams.get("waypoints")).toBe([points[0], points[12], points[14]]
      .map((point) => `${point.latitude},${point.longitude}`).join("|"));
    expect(url.searchParams.get("destination")).toBe("40.25403,-80.913577");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a compact handoff no longer matches its exact manifest", async () => {
    const points = [
      ...Array.from({ length: 15 }, (_, index) => publicGooglePoint(index + 1, 40.2 + index * 0.001, -80.9 - index * 0.001, index === 0 ? "route_ingress" : undefined)),
      { sequence: 16, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: "11111111-1111-4111-8111-111111111111" },
    ];
    const routeRow = publicGoogleRow(points);
    const handoff = publicGoogleHandoffRow(routeRow);
    handoff.source_dependency_digest = "e".repeat(32);
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(atomicStatusEnvelope(
      exactReadyStatusRow(),
      routeRow,
      handoff,
    )));
    vi.stubGlobal("fetch", fetchMock);

    const status = await loadPadStatus(pad());

    expect(status.route).toMatchObject({ state: "ready", source: "exact_graph" });
    expect(status.google).toMatchObject({ publicState: "stale", routeUrl: null });
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
    expect(status.destination).toEqual({ available: false, role: null, latitude: 40.09955, longitude: -80.840213 });
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
    expect(zeroOrigin.destination).toEqual({ available: false, role: null, latitude: 40.1, longitude: -80.9 });
    expect(zeroOrigin.loadProvenance).toBe("fallback");

    clearCompletedPadStatusCache();
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

    clearCompletedPadStatusCache();
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

    clearCompletedPadStatusCache();
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
    expect(status.destination).toEqual({ available: false, role: null, latitude: 40.1, longitude: -80.9 });
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
    expect(status.destination).toEqual({ available: false, role: null, latitude: 40.1, longitude: -80.9 });
    expect(status.google.routeUrl).toBeNull();
  });
});

describe("owner-verified access status projection", () => {
  const safeReason = "Public-road core is exact ODOT graph geometry; final dashed leg is owner-verified private lease access.";

  function ownerEnvelope() {
    const release = ownerVerifiedAccessFixture();
    return {
      release,
      envelope: {
        status: {
          padId: "11111111-1111-4111-8111-111111111111",
          recordRevision: "fixture-r1",
          statusRevision: release.statusRevision,
          route: {
            state: "ready",
            source: "owner_verified_access",
            steps: release.steps,
            geometry: release.geometry,
            safeReason,
            lastVerifiedAt: release.lastVerifiedAt,
            writtenDirections: null,
          },
          graph: {
            state: "verified_release",
            county: "Harrison",
            publicSource: "Exact ODOT graph + owner-verified lease receipt",
            lastVerifiedAt: release.lastVerifiedAt,
          },
          google: { publicState: "ready", routeUrl: null, safeReason: "Client-generated frozen handoff." },
          destination: {
            available: true,
            role: "saved_pad_destination",
            latitude: release.destination.latitude,
            longitude: release.destination.longitude,
          },
        },
        ownerVerifiedAccessRoute: release,
        publicGoogleRoute: null,
        publicGoogleHandoff: null,
        coreDestinationRelease: null,
        namedApproaches: [],
      },
    };
  }

  function ownerPad() {
    return pad({
      coordinate: null,
      mapReference: {
        role: "reference",
        kind: "official_pad_reference",
        latitude: 40.692916,
        longitude: -81.146801,
      },
      padName: "TIMBERWOLF",
      county: "Harrison",
    });
  }

  it("accepts the atomic seven-feature projection and builds a four-control current-location URL", async () => {
    const { envelope, release } = ownerEnvelope();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([envelope])));

    const status = await loadPadStatus(ownerPad());
    const url = new URL(status.google.routeUrl!);

    expect(status.route).toMatchObject({ state: "ready", source: "owner_verified_access", safeReason });
    expect(status.graph.state).toBe("verified_release");
    expect(status.destination).toMatchObject({
      role: "saved_pad_destination",
      latitude: release.destination.latitude,
      longitude: release.destination.longitude,
    });
    expect(status.routeSteps).toHaveLength(7);
    expect(status.route.geometry?.features).toHaveLength(7);
    expect(status.route.geometry?.features[6].properties.authority).toBe("owner_verified_access");
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("waypoints")?.split("|")).toHaveLength(4);
    expect(url.searchParams.get("destination")).toBe(`${release.destination.latitude},${release.destination.longitude}`);
  });

  it("does not let a different ODNR reference override the owner-receipted destination", async () => {
    const { envelope, release } = ownerEnvelope();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([envelope])));

    const status = await loadPadStatus(ownerPad());

    expect(status.route.state).toBe("ready");
    expect(status.destination.latitude).toBe(release.destination.latitude);
    expect(status.destination.longitude).toBe(release.destination.longitude);
    expect(status.destination.latitude).not.toBe(40.692916);
  });

  it("fails closed when the release is missing or differs from the promoted status", async () => {
    const missing = ownerEnvelope();
    missing.envelope.ownerVerifiedAccessRoute = null as never;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse([missing.envelope])));
    const missingStatus = await loadPadStatus(ownerPad());
    expect(missingStatus.route).toMatchObject({ state: "held", source: "owner_verified_access", geometry: null });
    expect(missingStatus.routeSteps).toEqual([]);
    expect(missingStatus.google.routeUrl).toBeNull();

    clearCompletedPadStatusCache();
    const drifted = ownerEnvelope();
    drifted.envelope.status.route.geometry = structuredClone(drifted.envelope.status.route.geometry);
    drifted.envelope.status.route.geometry.features[6].properties.label = "Lease road";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse([drifted.envelope])));
    const driftedStatus = await loadPadStatus(ownerPad());
    expect(driftedStatus.route).toMatchObject({ state: "held", source: "owner_verified_access", geometry: null });
    expect(driftedStatus.google).toMatchObject({ publicState: "stale", routeUrl: null });
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
