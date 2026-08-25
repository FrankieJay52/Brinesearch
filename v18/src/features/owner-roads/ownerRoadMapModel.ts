import { ownerRoadStatuses, type OwnerPadOption, type OwnerRoadBounds, type OwnerRoadFeature, type OwnerRoadStatus, type OwnerRoadViewportRequest } from "@/data/ownerRoads";
import { mapDisplayCoordinate } from "@/data/mapDisplayCoordinates";
import type { DriverPadStatus, PadSummary } from "@/data/types";

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

export type OwnerPadOverlayStatus = "ready" | "candidate" | "held" | "restricted";

export type OwnerPadOverlayMarker = {
  padId: string;
  padName: string;
  company: string;
  state: string;
  county: string;
  latitude: number;
  longitude: number;
  status: OwnerPadOverlayStatus;
  blockReason: string;
  statusChecked: boolean;
};

export const ownerPadOverlayStatusLabels: Record<OwnerPadOverlayStatus, string> = {
  ready: "Ready",
  candidate: "Candidate",
  held: "Held",
  restricted: "Restricted",
};

export const ownerPadOverlayStatusColors: Record<OwnerPadOverlayStatus, string> = {
  ready: ownerRoadStatusColors.approved_by_policy,
  candidate: ownerRoadStatusColors.candidate,
  held: ownerRoadStatusColors.held,
  restricted: ownerRoadStatusColors.restricted,
};

function padStatusReasonText(status: DriverPadStatus | null) {
  return [status?.route.safeReason, status?.google.safeReason].filter(Boolean).join(" ").toLocaleLowerCase().replace(/[_-]+/g, " ");
}

export function ownerPadOverlayStatus(status: DriverPadStatus | null): OwnerPadOverlayStatus {
  const reason = padStatusReasonText(status);
  if (/\brestrict(?:ed|ion)?\b|\broad[_ -]?closed\b|\bclosed[_ -]?to[_ -]?truck/.test(reason)) return "restricted";
  if (status?.dataState !== "live") return "held";
  if (status?.route.state === "ready" && status.route.source === "exact_graph" && status.graph.state === "active_current") return "ready";
  if (status?.route.state === "written_only") return "candidate";
  return "held";
}

export function ownerPadOverlayBlockReason(status: DriverPadStatus | null, hasActiveRoutePrep: boolean | null) {
  const overlayStatus = ownerPadOverlayStatus(status);
  const reason = padStatusReasonText(status);
  if (overlayStatus === "ready") return "Approved route ready";
  if (overlayStatus === "candidate") return "Reviewed directions only";
  if (overlayStatus === "restricted") return "Road restriction";
  if (hasActiveRoutePrep === false) return "No exact route match";
  if (!status) return "Checking route status";
  if (status.dataState !== "live") return "Status not current";
  if (/\bname[_ -]?only\b/.test(reason)) return "Name-only match";
  if (/\bfield[_ -]?check\b/.test(reason)) return "Field check";
  if (/\bno[_ -]?gps\b|\bmissing[_ -]?(?:gps|coordinate)\b/.test(reason)) return "No GPS";
  if (/\bno[_ -]?match\b|\bexact[_ -]?route[_ -]?not[_ -]?ready\b/.test(reason)) return "No exact route match";
  if (status.route.state === "stale" || status.graph.state === "stale") return "Route evidence stale";
  if (status.route.state === "held" && (status.graph.state === "held" || status.graph.state === "unavailable")) return "Route not reconciled";
  if (status.graph.state !== "active_current") return "Graph not current";
  return "Route held";
}

export function ownerPadOverlayMarker(
  pad: OwnerPadOption,
  directoryPad: PadSummary | null,
  status: DriverPadStatus | null,
  hasActiveRoutePrep: boolean | null,
): OwnerPadOverlayMarker | null {
  if (pad.latitude === null || pad.longitude === null) return null;
  return {
    padId: pad.padId,
    padName: pad.padName,
    company: pad.company,
    state: ownerRoadStateCode(pad.state || directoryPad?.state || "") || pad.state || directoryPad?.state || "",
    county: directoryPad?.county || "",
    latitude: pad.latitude,
    longitude: pad.longitude,
    status: ownerPadOverlayStatus(status),
    blockReason: ownerPadOverlayBlockReason(status, hasActiveRoutePrep),
    statusChecked: Boolean(status) || hasActiveRoutePrep === false,
  };
}

export function filterOwnerPadOverlayMarkers(
  markers: readonly OwnerPadOverlayMarker[],
  filters: {
    state: "OH" | "WV" | "PA" | "";
    county: string;
    selectedCompany: string;
    companyScope: "selected" | "all";
    includeHeld: boolean;
  },
) {
  const county = filters.county.trim().toLocaleLowerCase();
  return markers.filter((marker) => (!filters.state || ownerRoadStateCode(marker.state) === filters.state)
    && (!county || marker.county.trim().toLocaleLowerCase() === county)
    && (filters.companyScope === "all" || !filters.selectedCompany || marker.company === filters.selectedCompany)
    && (filters.includeHeld || marker.status !== "held"));
}

export function ownerPadOverlayCollection(markers: readonly OwnerPadOverlayMarker[], selectedPadId: string | null, inspectedPadId: string | null) {
  return {
    type: "FeatureCollection" as const,
    features: markers.map((marker) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [marker.longitude, marker.latitude] },
      properties: {
        padId: marker.padId,
        padName: marker.padName,
        company: marker.company,
        overlayStatus: marker.status,
        blockReason: marker.blockReason,
        selected: marker.padId === selectedPadId,
        inspected: marker.padId === inspectedPadId,
      },
    })),
  };
}

export function ownerPadOverlayBounds(markers: readonly OwnerPadOverlayMarker[]): OwnerRoadBounds | null {
  if (!markers.length) return null;
  return markers.reduce<OwnerRoadBounds>((bounds, marker) => ({
    west: Math.min(bounds.west, marker.longitude),
    south: Math.min(bounds.south, marker.latitude),
    east: Math.max(bounds.east, marker.longitude),
    north: Math.max(bounds.north, marker.latitude),
  }), { west: markers[0].longitude, south: markers[0].latitude, east: markers[0].longitude, north: markers[0].latitude });
}

export function ownerBoundsUnion(...values: Array<OwnerRoadBounds | null>) {
  const bounds = values.filter((value): value is OwnerRoadBounds => value !== null);
  if (!bounds.length) return null;
  return bounds.reduce<OwnerRoadBounds>((combined, value) => ({
    west: Math.min(combined.west, value.west),
    south: Math.min(combined.south, value.south),
    east: Math.max(combined.east, value.east),
    north: Math.max(combined.north, value.north),
  }), bounds[0]);
}

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
    const protectedCoordinate = protectedPad?.latitude !== null && protectedPad?.latitude !== undefined
      && protectedPad.longitude !== null && protectedPad.longitude !== undefined
      ? { latitude: protectedPad.latitude, longitude: protectedPad.longitude }
      : null;
    const displayCoordinate = mapDisplayCoordinate(row);
    merged.set(row.canonicalId, {
      padId: row.canonicalId,
      padName: row.padName,
      company: row.company,
      state: protectedPad?.state || ownerRoadStateCode(row.state) || row.state,
      latitude: protectedCoordinate?.latitude ?? displayCoordinate?.latitude ?? null,
      longitude: protectedCoordinate?.longitude ?? displayCoordinate?.longitude ?? null,
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
