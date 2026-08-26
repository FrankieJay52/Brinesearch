import { describe, expect, it } from "vitest";
import { buildCoreDestinationReleasePlan, buildGoogleRoutePublicPlan, buildReleasedGoogleHandoffPlan } from "./googleRoute";

const padId = "e2b32e85-9e93-4388-8215-9d8167cbbeb8";
const shape = (sequence: number, latitude: number, longitude: number, role?: string) => ({
  sequence,
  kind: "shape",
  shape_role: role,
  latitude,
  longitude,
  source_kind: "authoritative_clipped_geometry",
  occurrence_id: `occurrence-${sequence}`,
  source_segment_keys: [`segment-${sequence}`],
  source_digest: "a".repeat(32),
});

function row(points: Record<string, unknown>[]) {
  return {
    pad_id: padId,
    route_revision: 7,
    manifest: {
      manifest_version: "issue97-google-v1",
      manifest_digest: "b".repeat(32),
      dependency_digest: "c".repeat(32),
      status: "ready",
      route_ready: true,
      pad_id: padId,
      route_revision: 7,
      points,
    },
  };
}

function handoffRow(value: ReturnType<typeof row>, sequences = [1, 13, 15]) {
  const points = value.manifest.points;
  const destination = points.at(-1)!;
  return {
    pad_id: padId,
    route_revision: 7,
    source_manifest_digest: "b".repeat(32),
    source_dependency_digest: "c".repeat(32),
    handoff_version: "v18-google-mobile-v1",
    handoff_digest: "d".repeat(32),
    published_at: "2026-08-25T22:10:00Z",
    handoff: {
      handoff_version: "v18-google-mobile-v1",
      pad_id: padId,
      route_revision: 7,
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
        pad_id: padId,
      },
    },
  };
}

function releasedRow(value: ReturnType<typeof row>, sequences = [1, 13, 15]) {
  const reviewed = handoffRow(value, sequences);
  return {
    padId: reviewed.pad_id,
    routeRevision: reviewed.route_revision,
    sourceManifestDigest: reviewed.source_manifest_digest,
    sourceDependencyDigest: reviewed.source_dependency_digest,
    handoffVersion: reviewed.handoff_version,
    handoff: reviewed.handoff,
    handoffDigest: reviewed.handoff_digest,
    publishedAt: reviewed.published_at,
  };
}

function coreDestinationRow() {
  const waypoints = [
    { sequence: 1, latitude: 40.25, longitude: -80.95 },
    { sequence: 2, latitude: 40.24, longitude: -80.92 },
    { sequence: 3, latitude: 40.241093947, longitude: -80.915437726 },
  ];
  const destination = { sequence: 4, pad_id: padId, role: "saved_pad_destination", latitude: 40.240883, longitude: -80.913963 };
  return {
    padId,
    recordRevision: "1787459253071652",
    routeRevision: 1,
    releaseVersion: "v18-core-destination-v1",
    routeSteps: [{ order: 1 }, { order: 2 }],
    routeGeometry: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { stepOrder: 1 },
          geometry: { type: "LineString", coordinates: [[-80.95, 40.25], [-80.92, 40.24]] },
        },
        {
          type: "Feature",
          properties: { stepOrder: 2 },
          geometry: { type: "LineString", coordinates: [[-80.92, 40.24], [-80.915437726, 40.241093947]] },
        },
      ],
    },
    graphCounty: "Harrison",
    graphLastVerifiedAt: "2026-08-24T23:53:01.785257Z",
    destination: { available: true, role: "saved_pad_destination", latitude: destination.latitude, longitude: destination.longitude },
    handoff: {
      handoff_version: "v18-core-destination-v1",
      pad_id: padId,
      route_revision: 1,
      source_dependency_digest: "e".repeat(32),
      origin_mode: "current_location_until_route_ingress",
      waypoints,
      core_end: { ...waypoints[2], role: "exact_public_road_handoff" },
      destination,
      final_leg_mode: "google_to_saved_gps_unapproved",
    },
    dependencyDigest: "e".repeat(32),
    releaseDigest: "f".repeat(32),
    publishedAt: "2026-08-26T16:45:38Z",
  };
}

function coreDestinationRowV2() {
  const value = coreDestinationRow();
  const waypoints = value.handoff.waypoints.slice(0, 2);
  return {
    ...value,
    releaseVersion: "v18-core-destination-v2",
    routeSteps: value.routeSteps.slice(0, 1),
    routeGeometry: {
      ...value.routeGeometry,
      features: value.routeGeometry.features.slice(0, 1),
    },
    handoff: {
      ...value.handoff,
      handoff_version: "v18-core-destination-v2",
      waypoints,
      core_end: { ...waypoints[1], role: "exact_public_road_handoff" },
      destination: { ...value.handoff.destination, sequence: 3 },
    },
  };
}

describe("public Google route manifest", () => {
  it("builds one current-location URL from an exact road core and separate saved GPS", () => {
    const value = coreDestinationRow();
    const plan = buildCoreDestinationReleasePlan(value);
    const url = new URL(plan.singleUrl);

    expect(plan).toMatchObject({ padId, recordRevision: "1787459253071652", routeRevision: 1 });
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("waypoints")).toBe(value.handoff.waypoints
      .map((point) => `${point.latitude},${point.longitude}`).join("|"));
    expect(url.searchParams.get("destination")).toBe("40.240883,-80.913963");
  });

  it("builds a v2 handoff from one exact road line without weakening the frozen v1 contract", () => {
    const value = coreDestinationRowV2();
    const plan = buildCoreDestinationReleasePlan(value);
    const url = new URL(plan.singleUrl);

    expect(plan).toMatchObject({ padId, recordRevision: "1787459253071652", routeRevision: 1 });
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("waypoints")).toBe(value.handoff.waypoints
      .map((point) => `${point.latitude},${point.longitude}`).join("|"));
    expect(url.searchParams.get("destination")).toBe("40.240883,-80.913963");

    const v1WithOneLine = {
      ...value,
      releaseVersion: "v18-core-destination-v1",
      handoff: { ...value.handoff, handoff_version: "v18-core-destination-v1" },
    };
    expect(() => buildCoreDestinationReleasePlan(v1WithOneLine)).toThrow(/v1 requires exactly two/i);
  });

  it("rejects a two-line package relabeled as the one-line v2 contract", () => {
    const value = coreDestinationRow();
    expect(() => buildCoreDestinationReleasePlan({
      ...value,
      releaseVersion: "v18-core-destination-v2",
      handoff: { ...value.handoff, handoff_version: "v18-core-destination-v2" },
    })).toThrow(/v2 requires exactly one/i);
  });

  it("fails closed when a v2 waypoint is not an exact approved-line endpoint", () => {
    const value = coreDestinationRowV2();
    expect(() => buildCoreDestinationReleasePlan({
      ...value,
      handoff: {
        ...value.handoff,
        waypoints: value.handoff.waypoints.map((point, index) => index === 1
          ? { ...point, longitude: -80.91 }
          : point),
        core_end: { ...value.handoff.core_end, longitude: -80.91 },
      },
    })).toThrow(/ordered endpoints/i);
  });

  it("rejects a saved GPS that is numerically the core endpoint with different formatting", () => {
    const value = coreDestinationRowV2();
    const endpoint = value.handoff.core_end;
    expect(() => buildCoreDestinationReleasePlan({
      ...value,
      destination: {
        ...value.destination,
        latitude: String(endpoint.latitude).concat("0"),
        longitude: String(endpoint.longitude).concat("0"),
      },
      handoff: {
        ...value.handoff,
        destination: {
          ...value.handoff.destination,
          latitude: String(endpoint.latitude).concat("0"),
          longitude: String(endpoint.longitude).concat("0"),
        },
      },
    })).toThrow(/separate GPS leg/i);
  });

  it("fails closed when a core-destination package blurs the public-road and GPS boundary", () => {
    const value = coreDestinationRow();
    expect(() => buildCoreDestinationReleasePlan({ ...value, privateEvidence: true })).toThrow(/unsupported data/i);
    expect(() => buildCoreDestinationReleasePlan({
      ...value,
      destination: { ...value.destination, role: "driver_entrance" },
    })).toThrow(/destination-only/i);
    expect(() => buildCoreDestinationReleasePlan({
      ...value,
      handoff: { ...value.handoff, final_leg_mode: "approved_lease_road" },
    })).toThrow(/not bound/i);
    expect(() => buildCoreDestinationReleasePlan({
      ...value,
      handoff: { ...value.handoff, core_end: { ...value.handoff.core_end, longitude: -80.91 } },
    })).toThrow(/exact handoff/i);
    expect(() => buildCoreDestinationReleasePlan({
      ...value,
      handoff: { ...value.handoff, destination: { ...value.handoff.destination, pad_id: "different-pad" } },
    })).toThrow(/selected pad/i);
    expect(() => buildCoreDestinationReleasePlan({
      ...value,
      routeGeometry: {
        ...value.routeGeometry,
        features: value.routeGeometry.features.map((feature, index) => index === 1 ? {
          ...feature,
          geometry: { ...feature.geometry, coordinates: [[-80.919, 40.239], ...feature.geometry.coordinates.slice(1)] },
        } : feature),
      },
    })).toThrow(/ordered endpoints/i);
  });

  it("builds only from a matching public exact manifest", () => {
    const plan = buildGoogleRoutePublicPlan(row([
      shape(1, 40.2, -80.9, "route_ingress"),
      shape(2, 40.21, -80.91),
      shape(3, 40.22, -80.92),
      { sequence: 4, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: padId },
    ]));
    expect(plan.padId).toBe(padId);
    expect(plan.pointCount).toBe(4);
    expect(plan.singleUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/);
    expect(plan.singleUrl).toContain("dir_action=navigate");
    expect(plan.singleUrl!.length).toBeLessThanOrEqual(2048);
    const url = new URL(plan.singleUrl!);
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("waypoints")).toBe("40.2,-80.9|40.21,-80.91|40.22,-80.92");
    expect(url.searchParams.get("destination")).toBe("40.25403,-80.913577");
  });

  it("fails closed instead of splitting an exact route across multiple links", () => {
    const plan = buildGoogleRoutePublicPlan(row([
      shape(1, 40.2, -80.9, "route_ingress"),
      shape(2, 40.21, -80.91),
      shape(3, 40.22, -80.92),
      shape(4, 40.23, -80.93),
      { sequence: 5, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: padId },
    ]));
    expect(plan.pointCount).toBe(5);
    expect(plan.singleUrl).toBeNull();
  });

  it("keeps a sixteen-point exact package in BrineSearch without thinning it into a Google action", () => {
    const plan = buildGoogleRoutePublicPlan(row([
      ...Array.from({ length: 15 }, (_, index) => shape(index + 1, 40.2 + index * 0.001, -80.9 - index * 0.001, index === 0 ? "route_ingress" : undefined)),
      { sequence: 16, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: padId },
    ]));
    expect(plan.pointCount).toBe(16);
    expect(plan.handoffMode).toBe("none");
    expect(plan.singleUrl).toBeNull();
  });

  it("uses one separately reviewed compact handoff without changing the full manifest", () => {
    const value = row([
      ...Array.from({ length: 15 }, (_, index) => shape(index + 1, 40.2 + index * 0.001, -80.9 - index * 0.001, index === 0 ? "route_ingress" : undefined)),
      { sequence: 16, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: padId },
    ]);
    const plan = buildGoogleRoutePublicPlan(value, handoffRow(value));

    expect(plan.pointCount).toBe(16);
    expect(plan.manifestDigest).toBe("b".repeat(32));
    expect(plan.dependencyDigest).toBe("c".repeat(32));
    expect(plan.handoffMode).toBe("verified_compact");
    const url = new URL(plan.singleUrl!);
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("waypoints")).toBe([value.manifest.points[0], value.manifest.points[12], value.manifest.points[14]]
      .map((point) => `${point.latitude},${point.longitude}`).join("|"));
    expect(url.searchParams.get("destination")).toBe("40.25403,-80.913577");
  });

  it("builds one current-location Google URL from an immutable reviewed release", () => {
    const value = row([
      ...Array.from({ length: 15 }, (_, index) => shape(index + 1, 40.2 + index * 0.001, -80.9 - index * 0.001, index === 0 ? "route_ingress" : undefined)),
      { sequence: 16, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: padId },
    ]);
    const plan = buildReleasedGoogleHandoffPlan(releasedRow(value));
    const url = new URL(plan.singleUrl!);

    expect(plan.padId).toBe(padId);
    expect(plan.routeRevision).toBe(7);
    expect(plan.handoffDigest).toBe("d".repeat(32));
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(url.searchParams.get("waypoints")).toBe([value.manifest.points[0], value.manifest.points[12], value.manifest.points[14]]
      .map((point) => `${point.latitude},${point.longitude}`).join("|"));
    expect(url.searchParams.get("destination")).toBe("40.25403,-80.913577");
  });

  it("fails closed on released package drift or unsupported fields", () => {
    const value = row([
      ...Array.from({ length: 15 }, (_, index) => shape(index + 1, 40.2 + index * 0.001, -80.9 - index * 0.001, index === 0 ? "route_ingress" : undefined)),
      { sequence: 16, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: padId },
    ]);
    const released = releasedRow(value);
    expect(() => buildReleasedGoogleHandoffPlan({ ...released, padId: "different-pad" })).toThrow(/bound to its reviewed receipt/i);
    expect(() => buildReleasedGoogleHandoffPlan({ ...released, privateEvidence: "must not leak" })).toThrow(/unsupported data/i);
    expect(() => buildReleasedGoogleHandoffPlan({ ...released, handoff: { ...released.handoff, origin_mode: "fixed_origin" } })).toThrow(/bound to its reviewed receipt/i);
    expect(() => buildReleasedGoogleHandoffPlan({ ...released, handoff: { ...released.handoff, waypoints: [...released.handoff.waypoints].reverse() } })).toThrow(/order is invalid/i);
    expect(() => buildReleasedGoogleHandoffPlan({ ...released, handoff: { ...released.handoff, destination: { ...released.handoff.destination, pad_id: "different-pad" } } })).toThrow(/destination is not bound/i);
  });

  it("rejects a compact handoff that drifts from the exact manifest binding", () => {
    const value = row([
      ...Array.from({ length: 15 }, (_, index) => shape(index + 1, 40.2 + index * 0.001, -80.9 - index * 0.001, index === 0 ? "route_ingress" : undefined)),
      { sequence: 16, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: padId },
    ]);
    expect(() => buildGoogleRoutePublicPlan(value, {
      ...handoffRow(value),
      source_manifest_digest: "e".repeat(32),
    })).toThrow(/manifest digest does not match/i);
    expect(() => buildGoogleRoutePublicPlan(value, handoffRow(value, [1, 15, 13]))).toThrow(/order is invalid/i);
    const changed = handoffRow(value);
    changed.handoff.destination.latitude = 40.25;
    expect(() => buildGoogleRoutePublicPlan(value, changed)).toThrow(/exact saved pad destination/i);
  });

  it("fails closed when row, manifest, revision, or destination identity differs", () => {
    const value = row([
      shape(1, 40.2, -80.9, "route_ingress"),
      { sequence: 2, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: padId },
    ]);
    expect(() => buildGoogleRoutePublicPlan({ ...value, pad_id: "wrong-pad" })).toThrow(/does not match/i);
    expect(() => buildGoogleRoutePublicPlan({ ...value, route_revision: 8 })).toThrow(/revision does not match/i);
    expect(() => buildGoogleRoutePublicPlan({ ...value, manifest: { ...value.manifest, manifest_digest: null } })).toThrow(/digest/i);
  });

  it("rejects the null-island coordinate instead of opening Google at 0,0", () => {
    expect(() => buildGoogleRoutePublicPlan(row([
      shape(1, 0, 0, "route_ingress"),
      { sequence: 2, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: padId },
    ]))).toThrow(/zero origin/i);
  });

  it("rejects globally valid coordinates outside the declared service area", () => {
    expect(() => buildGoogleRoutePublicPlan(row([
      shape(1, -80, 40, "route_ingress"),
      { sequence: 2, kind: "pad_destination", latitude: 40.25403, longitude: -80.913577, source_kind: "saved_pad_gps", pad_id: padId },
    ]))).toThrow(/service area/i);
  });
});
