import { describe, expect, it } from "vitest";
import { buildGoogleRoutePublicPlan } from "./googleRoute";

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

describe("public Google route manifest", () => {
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
