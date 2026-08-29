import { hasMapDisplayCoordinate, mapDisplayCoordinate } from "@/data/mapDisplayCoordinates";
import type { DriverPadStatus, PadCoordinate, PadSummary } from "@/data/types";
import { searchDirectory } from "@/data/search";

export { mapDisplayCoordinate } from "@/data/mapDisplayCoordinates";

export type MapViewerMode = "standard" | "fullscreen" | "roads";

export function mapMarkerVisualStyle(zoom: number, selected: boolean) {
  if (selected) return { radius: 8, opacity: 1, strokeWidth: 3, stackOffset: 3 };
  // Keep every pad present and tappable, but stop regional views from becoming
  // a wall of large outlined dots. The continuous scale avoids visible marker
  // popping as the driver zooms.
  const scale = Math.min(1, Math.max(0, (zoom - 7.25) / 4.25));
  const radius = 2.75 + 2.75 * scale;
  return {
    radius,
    opacity: 0.6 + 0.4 * scale,
    strokeWidth: 1 + scale,
    stackOffset: Math.max(1.5, radius * 0.55),
  };
}

export function selectedMapRouteIsPrimary(
  namedApproachRouteGroup: "primary" | "alternate" | null,
  routeChoiceGroup: "primary" | "alternate" | null,
) {
  return namedApproachRouteGroup
    ? namedApproachRouteGroup === "primary"
    : routeChoiceGroup !== "alternate";
}

export function mapViewerModeFromParam(value: string | null | undefined): MapViewerMode {
  if (value === "roads") return "roads";
  if (value === "map") return "fullscreen";
  return "standard";
}

export function mapPadSearchResults(rows: PadSummary[], query: string, limit = 8) {
  if (!query.trim()) return [];
  return searchDirectory(rows, query, { type: "pad", route: "all" }, Math.max(100, limit * 10))
    .filter(hasSafeCoordinate)
    .slice(0, limit);
}

export function hasSafeCoordinate(row: PadSummary) {
  return hasMapDisplayCoordinate(row);
}

export type MapOverlayMarkerState = "empty" | "offscreen" | "visible";

export function mapOverlayMarkerState(inputCount: number, renderedCount: number): MapOverlayMarkerState {
  if (inputCount <= 0) return "empty";
  return renderedCount > 0 ? "visible" : "offscreen";
}

export interface MapRowsCoordinateExtent {
  coordinateCount: number;
  northEast: [number, number];
  southWest: [number, number];
}

export function mapRowsCoordinateExtent(rows: PadSummary[]): MapRowsCoordinateExtent | null {
  const coordinates = rows.flatMap((row) => {
    const coordinate = mapDisplayCoordinate(row);
    return coordinate ? [coordinate] : [];
  });
  if (!coordinates.length) return null;

  let west = coordinates[0].longitude;
  let east = west;
  let south = coordinates[0].latitude;
  let north = south;
  for (const coordinate of coordinates.slice(1)) {
    west = Math.min(west, coordinate.longitude);
    east = Math.max(east, coordinate.longitude);
    south = Math.min(south, coordinate.latitude);
    north = Math.max(north, coordinate.latitude);
  }
  return {
    coordinateCount: coordinates.length,
    northEast: [east, north],
    southWest: [west, south],
  };
}

export function coincidentLocationsNeedChooser(rows: PadSummary[]) {
  if (rows.length < 2) return false;
  const first = mapDisplayCoordinate(rows[0]);
  return Boolean(first && rows.every((row) => {
    const coordinate = mapDisplayCoordinate(row);
    return coordinate?.latitude === first.latitude && coordinate.longitude === first.longitude;
  }));
}

export function filterMapRows(rows: PadSummary[], typeFilter: "all" | "pad" | "disposal", selectedCompany: string | null) {
  return rows.filter((row) => (!selectedCompany || row.company === selectedCompany) && (typeFilter === "all" || row.recordType === typeFilter));
}

export function mapCompanyOptions(rows: PadSummary[]) {
  return [...new Set(rows.map((row) => row.company.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

export function mapRoadSelectionForCompany(
  companyFilter: "all" | string,
  approvedRoadCompanies: string[],
  approvedRoadsReady: boolean,
): "all" | string | null {
  if (!approvedRoadsReady) return null;
  return companyFilter === "all" || approvedRoadCompanies.includes(companyFilter)
    ? companyFilter
    : null;
}

export function emptyMapCoordinateNotice(visibleLocationCount: number) {
  return visibleLocationCount > 0
    ? `${visibleLocationCount.toLocaleString()} directory ${visibleLocationCount === 1 ? "location does" : "locations do"} not have a verified map coordinate yet. Use Search to open the directory record.`
    : "No locations match this map filter.";
}

export function mapGoogleHandoffState(
  statusState: DriverPadStatus["google"]["publicState"],
  hasReleasedNavigation: boolean,
  selectedRouteIsPrimary: boolean,
): DriverPadStatus["google"]["publicState"] {
  if (!selectedRouteIsPrimary) return "unavailable";
  return hasReleasedNavigation ? "ready" : statusState;
}

export interface ProjectedPad {
  row: PadSummary;
  coordinate: PadCoordinate;
  x: number;
  y: number;
}

export interface ProjectedPadGroup {
  rows: PadSummary[];
  points: ProjectedPad[];
  x: number;
  y: number;
}

export function groupCoincidentProjectedPads(points: ProjectedPad[]): ProjectedPadGroup[] {
  const locations = new Map<string, ProjectedPad[]>();
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const coordinate = point.coordinate;
    // Group only records that genuinely share the exact stored coordinate.
    // Screen-space cells caused numbered clusters to regroup and jump while
    // the user panned. Distinct locations now always keep their own marker.
    const key = `${coordinate.longitude}:${coordinate.latitude}`;
    const location = locations.get(key);
    if (location) location.push(point);
    else locations.set(key, [point]);
  }
  return [...locations.values()].map((location) => ({
    rows: location.map((point) => point.row),
    points: location,
    x: location.reduce((sum, point) => sum + point.x, 0) / location.length,
    y: location.reduce((sum, point) => sum + point.y, 0) / location.length,
  }));
}

export function padFeatureCollection(rows: PadSummary[]) {
  return {
    type: "FeatureCollection" as const,
    features: rows.flatMap((row) => {
      const coordinate = mapDisplayCoordinate(row);
      if (!coordinate) return [];
      return [{
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [coordinate.longitude, coordinate.latitude],
      },
      properties: {
        id: row.padId,
        name: row.padName,
        company: row.company,
        type: row.recordType,
        verifiedEntrance: coordinate.role === "driver_entrance",
      },
      }];
    }),
  };
}
