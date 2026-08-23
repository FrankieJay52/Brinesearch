import type { PadSummary } from "@/data/types";

export function hasSafeCoordinate(row: PadSummary) {
  const coordinate = row.coordinate;
  if (!coordinate) return false;
  return Number.isFinite(coordinate.latitude)
    && Number.isFinite(coordinate.longitude)
    && coordinate.latitude >= -90
    && coordinate.latitude <= 90
    && coordinate.longitude >= -180
    && coordinate.longitude <= 180
    && !(coordinate.latitude === 0 && coordinate.longitude === 0);
}

export function clusterNeedsChooser(rows: PadSummary[], zoom: number, maximumExpansionZoom = 14) {
  if (rows.length < 2) return false;
  if (zoom >= maximumExpansionZoom) return true;
  const first = rows[0].coordinate;
  return Boolean(first && rows.every((row) => row.coordinate?.latitude === first.latitude && row.coordinate?.longitude === first.longitude));
}

export function filterMapRows(rows: PadSummary[], typeFilter: "all" | "pad" | "disposal", selectedCompany: string | null) {
  return rows.filter((row) => (!selectedCompany || row.company === selectedCompany) && (typeFilter === "all" || row.recordType === typeFilter));
}

export function emptyMapCoordinateNotice(visibleLocationCount: number) {
  return visibleLocationCount > 0
    ? `${visibleLocationCount.toLocaleString()} directory ${visibleLocationCount === 1 ? "location does" : "locations do"} not have a verified map coordinate yet. Use Search to open the directory record.`
    : "No locations match this map filter.";
}

export interface ProjectedPad {
  row: PadSummary;
  x: number;
  y: number;
}

export interface ProjectedPadGroup {
  rows: PadSummary[];
  x: number;
  y: number;
}

export function groupProjectedPads(points: ProjectedPad[], cellSize: number): ProjectedPadGroup[] {
  const safeCellSize = Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 48;
  const cells = new Map<string, ProjectedPad[]>();
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const key = `${Math.floor(point.x / safeCellSize)}:${Math.floor(point.y / safeCellSize)}`;
    const cell = cells.get(key);
    if (cell) cell.push(point);
    else cells.set(key, [point]);
  }
  return [...cells.values()].map((cell) => ({
    rows: cell.map((point) => point.row),
    x: cell.reduce((sum, point) => sum + point.x, 0) / cell.length,
    y: cell.reduce((sum, point) => sum + point.y, 0) / cell.length,
  }));
}

export function padFeatureCollection(rows: PadSummary[]) {
  return {
    type: "FeatureCollection" as const,
    features: rows.filter(hasSafeCoordinate).map((row) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [row.coordinate!.longitude, row.coordinate!.latitude],
      },
      properties: {
        id: row.padId,
        name: row.padName,
        company: row.company,
        type: row.recordType,
        verifiedEntrance: row.coordinate?.role === "driver_entrance",
      },
    })),
  };
}
