import fallbackData from "./pad-fallback-data.json";
import { parseCoordinatePair } from "./coordinates";
import type { PadCoordinate, PadSummary } from "./types";

type RawFallbackPad = {
  legacyId?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

function isSafeMapCoordinate(coordinate: PadCoordinate | null | undefined) {
  if (!coordinate) return false;
  return Number.isFinite(coordinate.latitude)
    && Number.isFinite(coordinate.longitude)
    && coordinate.latitude >= -90
    && coordinate.latitude <= 90
    && coordinate.longitude >= -180
    && coordinate.longitude <= 180
    && !(coordinate.latitude === 0 && coordinate.longitude === 0);
}

const packagedReferenceCoordinates = (() => {
  const coordinates = new Map<string, PadCoordinate | null>();
  const pads = Array.isArray((fallbackData as { pads?: unknown }).pads)
    ? (fallbackData as { pads: RawFallbackPad[] }).pads
    : [];
  for (const pad of pads) {
    const legacyId = typeof pad.legacyId === "string" ? pad.legacyId.trim() : "";
    const parsed = parseCoordinatePair(pad.latitude, pad.longitude, "legacy_saved");
    if (!legacyId || !parsed.ok) continue;
    // A duplicate identity is ambiguous and therefore cannot provide a safe
    // display point. Keep it unavailable instead of choosing either record.
    if (coordinates.has(legacyId)) coordinates.set(legacyId, null);
    else coordinates.set(legacyId, parsed.value);
  }
  return coordinates;
})();

/**
 * Returns a map-display coordinate without changing the live directory row.
 * Verified live entrances always win. The packaged point is an exact-legacy-ID
 * reference only and must never flow into driver status or Google navigation.
 */
export function mapDisplayCoordinate(row: PadSummary): PadCoordinate | null {
  if (isSafeMapCoordinate(row.coordinate)) return row.coordinate;
  if (!row.legacyId) return null;
  return packagedReferenceCoordinates.get(row.legacyId) || null;
}

export function hasMapDisplayCoordinate(row: PadSummary) {
  return Boolean(mapDisplayCoordinate(row));
}
