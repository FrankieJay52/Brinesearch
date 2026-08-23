import type { CoordinateRole, PadCoordinate } from "./types";

export type CoordinateFailure = "missing" | "partial" | "malformed" | "out_of_range" | "zero_origin" | "outside_service_area";
export type CoordinateResult = { ok: true; value: PadCoordinate } | { ok: false; reason: CoordinateFailure };

export const coordinateServiceArea = Object.freeze({
  latitudeMin: 37,
  latitudeMax: 43,
  longitudeMin: -84,
  longitudeMax: -74,
});

export function isInsideCoordinateServiceArea(latitude: number, longitude: number) {
  return latitude >= coordinateServiceArea.latitudeMin
    && latitude <= coordinateServiceArea.latitudeMax
    && longitude >= coordinateServiceArea.longitudeMin
    && longitude <= coordinateServiceArea.longitudeMax;
}

function isMissing(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

export function parseCoordinatePair(
  latitudeRaw: unknown,
  longitudeRaw: unknown,
  role: CoordinateRole = "legacy_saved",
): CoordinateResult {
  const latitudeMissing = isMissing(latitudeRaw);
  const longitudeMissing = isMissing(longitudeRaw);
  if (latitudeMissing && longitudeMissing) return { ok: false, reason: "missing" };
  if (latitudeMissing || longitudeMissing) return { ok: false, reason: "partial" };
  if ([latitudeRaw, longitudeRaw].some((value) => typeof value === "boolean" || typeof value === "object")) {
    return { ok: false, reason: "malformed" };
  }

  const latitude = Number(latitudeRaw);
  const longitude = Number(longitudeRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ok: false, reason: "malformed" };
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { ok: false, reason: "out_of_range" };
  }
  if (latitude === 0 && longitude === 0) return { ok: false, reason: "zero_origin" };
  if (!isInsideCoordinateServiceArea(latitude, longitude)) return { ok: false, reason: "outside_service_area" };
  return { ok: true, value: { latitude, longitude, role } };
}
