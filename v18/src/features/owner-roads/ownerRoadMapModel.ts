import type { OwnerRoadFeature, OwnerRoadStatus } from "@/data/ownerRoads";

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

export function ownerRoadSelection(features: OwnerRoadFeature[], currentIdentityId: string | null) {
  if (currentIdentityId && features.some((feature) => feature.properties.identityId === currentIdentityId)) {
    return currentIdentityId;
  }
  return features[0]?.properties.identityId ?? null;
}

export function ownerRoadCollection(features: OwnerRoadFeature[]) {
  return {
    type: "FeatureCollection" as const,
    features: features.map((feature) => ({
      type: "Feature" as const,
      geometry: feature.geometry,
      properties: {
        identityId: feature.properties.identityId,
        displayName: feature.properties.displayName,
        approvalStatus: feature.properties.approvalStatus,
      },
    })),
  };
}
