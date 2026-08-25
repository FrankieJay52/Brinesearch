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
      status: "ready",
      route_ready: true,
      pad_id: padId,
      route_revision: 7,
      points,
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
    expect(plan.singleUrl).toBeNull();
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
