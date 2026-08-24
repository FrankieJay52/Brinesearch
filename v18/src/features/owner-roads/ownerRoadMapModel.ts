import { ownerRoadStatuses, type OwnerPadOption, type OwnerRoadBounds, type OwnerRoadFeature, type OwnerRoadStatus, type OwnerRoadViewportRequest } from "@/data/ownerRoads";
import type { PadSummary } from "@/data/types";

export const ownerRoadStatusLabels: Record<OwnerRoadStatus, string> = {
  approved_by_policy: "Approved by policy",
  explicitly_approved: "Explicitly approved",
  candidate: "Candidate",
  held: "Held",
  restricted: "Restricted",
  reference_only: "Reference only",
};

export const ownerRoadStatusColors: Record<OwnerRoadStatus, string> = {
  approved_by_policy: "#45e693",
  explicitly_approved: "#22c9b0",
  candidate: "#f1bd58",
  held: "#9a83d8",
  restricted: "#f06b52",
  reference_only: "#8f9aa5",
};

export function ownerRoadCoverage(features: readonly OwnerRoadFeature[]) {
  const statusCounts = Object.fromEntries(ownerRoadStatuses.map((status) => [status, 0])) as Record<OwnerRoadStatus, number>;
  let occurrenceCount = 0;
  let endpointCount = 0;
  for (const feature of features) {
    occurrenceCount += feature.properties.occurrenceCount;
    statusCounts[feature.properties.approvalStatus] += 1;
    if (feature.properties.displayBoundary === "pad_endpoint_projection") endpointCount += 1;
  }
  return {
    identityCount: features.length,
    occurrenceCount,
    endpointCount,
    statusCounts,
  };
}

export function ownerRoadFeatureLimit(width: number) {
  if (width < 620) return 160;
  if (width < 1_100) return 440;
  return 700;
}

export function ownerRoadViewportRequestKey(request: OwnerRoadViewportRequest) {
  const coordinate = (value: number) => Number(value.toFixed(6));
  return JSON.stringify({
    ...request,
    west: coordinate(request.west),
    south: coordinate(request.south),
    east: coordinate(request.east),
    north: coordinate(request.north),
    roadClasses: [...request.roadClasses].sort(),
    routeSystems: request.routeSystems ? [...request.routeSystems].sort() : null,
    statuses: [...request.statuses].sort(),
  });
}

export function ownerRoadJurisdiction(road: OwnerRoadFeature["properties"]) {
  return [...new Set([road.stateCode, road.countyName || road.countyCode, road.township, road.municipality].filter(Boolean))].join(" · ") || "Jurisdiction unavailable";
}

export function ownerRoadRouteLabel(road: OwnerRoadFeature["properties"]) {
  const roadClass = road.roadClass.replaceAll("_", " ");
  return [...new Set([road.routeDesignation, roadClass].filter(Boolean))].join(" · ");
}

export function ownerRoadFeatureBounds(feature: OwnerRoadFeature) {
  const lines = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
  for (const line of lines) for (const [longitude, latitude] of line) {
    west = Math.min(west, longitude); south = Math.min(south, latitude);
    east = Math.max(east, longitude); north = Math.max(north, latitude);
  }
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

export function ownerRoadFeaturesBounds(features: OwnerRoadFeature[]): OwnerRoadBounds | null {
  let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
  for (const feature of features) {
    const bounds = ownerRoadFeatureBounds(feature);
    if (!bounds) continue;
    west = Math.min(west, bounds.west); south = Math.min(south, bounds.south);
    east = Math.max(east, bounds.east); north = Math.max(north, bounds.north);
  }
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

export function ownerRoadStateCode(value: string): "OH" | "WV" | "PA" | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === "OH" || normalized === "OHIO") return "OH";
  if (normalized === "WV" || normalized === "WEST VIRGINIA") return "WV";
  if (normalized === "PA" || normalized === "PENNSYLVANIA") return "PA";
  return null;
}

export function ownerRoadPadOptions(directoryRows: readonly PadSummary[], protectedOptions: readonly OwnerPadOption[]) {
  const protectedById = new Map(protectedOptions.map((pad) => [pad.padId, pad]));
  const merged = new Map<string, OwnerPadOption>();
  for (const row of directoryRows) {
    if (!row.canonicalId) continue;
    const protectedPad = protectedById.get(row.canonicalId);
    merged.set(row.canonicalId, {
      padId: row.canonicalId,
      padName: row.padName,
      company: row.company,
      state: protectedPad?.state || ownerRoadStateCode(row.state) || row.state,
      latitude: protectedPad?.latitude ?? row.coordinate?.latitude ?? null,
      longitude: protectedPad?.longitude ?? row.coordinate?.longitude ?? null,
    });
  }
  for (const pad of protectedOptions) if (!merged.has(pad.padId)) merged.set(pad.padId, pad);
  return [...merged.values()].sort((left, right) => left.company.localeCompare(right.company)
    || left.padName.localeCompare(right.padName) || left.padId.localeCompare(right.padId));
}

export function ownerRoadCompanyOptions(pads: readonly OwnerPadOption[]) {
  return [...new Set(pads.map((pad) => pad.company.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export function ownerRoadPadSearchResults(
  pads: readonly OwnerPadOption[],
  company: string,
  query: string,
  limit = 12,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 12));
  return pads
    .filter((pad) => (!company || pad.company === company)
      && (!normalizedQuery || pad.padName.toLocaleLowerCase().includes(normalizedQuery)))
    .sort((left, right) => {
      const leftStarts = normalizedQuery && left.padName.toLocaleLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      const rightStarts = normalizedQuery && right.padName.toLocaleLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      return leftStarts - rightStarts || left.padName.localeCompare(right.padName)
        || left.company.localeCompare(right.company) || left.padId.localeCompare(right.padId);
    })
    .slice(0, boundedLimit);
}

export function ownerRoadSelection(features: OwnerRoadFeature[], currentIdentityId: string | null) {
  if (currentIdentityId && features.some((feature) => feature.properties.identityId === currentIdentityId)) {
    return currentIdentityId;
  }
  return null;
}

export function ownerRoadCollection(features: OwnerRoadFeature[], padFocused = false) {
  return {
    type: "FeatureCollection" as const,
    features: features.map((feature) => ({
      type: "Feature" as const,
      geometry: feature.geometry,
      properties: {
        identityId: feature.properties.identityId,
        displayName: feature.properties.displayName,
        approvalStatus: feature.properties.approvalStatus,
        padFocused,
      },
    })),
  };
}
