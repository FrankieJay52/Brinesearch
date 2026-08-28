import type { DriverOwnerVerifiedAccessRoute, DriverRouteGeometry, DriverRouteStep } from "./types";
import { ownerVerifiedAccessLabel } from "./googleRoute";

export const ownerAccessFixturePoints = {
  ingress: [-81.1447655, 40.3244839] as [number, number],
  road1: [-81.15, 40.45] as [number, number],
  controlB: [-81.1622541, 40.6897462] as [number, number],
  road3: [-81.156, 40.695] as [number, number],
  controlC: [-81.1490346, 40.6987115] as [number, number],
  road5: [-81.1486, 40.6984] as [number, number],
  privateStart: [-81.1482753, 40.6980889] as [number, number],
  destination: [-81.146851, 40.692699] as [number, number],
};

export function ownerVerifiedAccessFixture(): Omit<DriverOwnerVerifiedAccessRoute, "navigationUrl"> {
  const points = ownerAccessFixturePoints;
  const segments = [
    [points.ingress, points.road1],
    [points.road1, points.controlB],
    [points.controlB, points.road3],
    [points.road3, points.controlC],
    [points.controlC, points.road5],
    [points.road5, points.privateStart],
    [points.privateStart, points.destination],
  ];
  const names = ["US-250", "OH-43", "OH-183", "OH-183", "Licking Road NW", "Licking Road NW", "Lease access"];
  const steps: DriverRouteStep[] = names.map((displayName, index) => ({
    order: index + 1,
    kind: index === 0 ? "continue" : "turn",
    displayName,
    verifiedDesignations: index < 6 ? [displayName] : [],
    instruction: index < 6 ? `Continue on ${displayName}` : "Continue on the owner-verified lease access to the saved pad",
    distanceMiles: null,
  }));
  const geometry: DriverRouteGeometry = {
    type: "FeatureCollection",
    features: segments.map((coordinates, index) => ({
      type: "Feature",
      properties: {
        stepOrder: index + 1,
        authority: index < 6 ? "exact_graph" : "owner_verified_access",
        label: index < 6 ? names[index] : ownerVerifiedAccessLabel,
      },
      geometry: { type: "LineString", coordinates },
    })),
  };
  return {
    releaseId: "22222222-2222-4222-8222-222222222222",
    releaseVersion: "v18-owner-access-route-v1",
    routeRevision: 1,
    publicCoreStepCount: 6,
    steps,
    geometry,
    ingress: {
      role: "exact_public_route_ingress",
      label: "US-250 / OH-646",
      latitude: points.ingress[1],
      longitude: points.ingress[0],
    },
    privateAccessStart: {
      role: "owner_verified_private_access_start",
      label: "Licking Road NW / verified lease road",
      latitude: points.privateStart[1],
      longitude: points.privateStart[0],
    },
    destination: {
      role: "saved_pad_destination",
      label: "Timberwolf pad",
      latitude: points.destination[1],
      longitude: points.destination[0],
    },
    finalLegMode: "owner_verified_private_access_to_saved_pad",
    handoff: {
      originMode: "current_location_to_route_ingress",
      handoffMode: "owner_verified_controls_v1",
      waypoints: [points.ingress, points.controlB, points.controlC, points.privateStart].map(([longitude, latitude]) => ({
        latitude,
        longitude,
      })),
    },
    lastVerifiedAt: "2026-08-28T20:00:00.000Z",
    statusRevision: "a".repeat(64),
    releaseDigest: "b".repeat(64),
    publishedAt: "2026-08-28T20:05:00.000Z",
  };
}
