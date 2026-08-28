import type { DriverRouteGeometry } from "./types";

export type RouteMapPoint = [number, number];

export interface RouteLineGroups {
  exact: RouteMapPoint[][];
  ownerVerifiedAccess: RouteMapPoint[][];
}

/**
 * Keep exact public-road geometry visually unchanged while isolating the
 * explicitly marked owner-verified private leg for a dashed treatment.
 */
export function routeLineGroups(geometry: DriverRouteGeometry | null): RouteLineGroups {
  const groups: RouteLineGroups = { exact: [], ownerVerifiedAccess: [] };
  if (!geometry) return groups;
  for (const feature of geometry.features) {
    const target = feature.properties.authority === "owner_verified_access"
      ? groups.ownerVerifiedAccess
      : groups.exact;
    if (feature.geometry.type === "LineString") target.push(feature.geometry.coordinates);
    else target.push(...feature.geometry.coordinates);
  }
  return groups;
}
