import type { PadSummary, SearchFilters } from "./types";
import { mapDisplayCoordinate } from "./mapDisplayCoordinates";

export interface SearchOrigin {
  latitude: number;
  longitude: number;
}

export function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compact(value: unknown) {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, "");
}

function exactAny(query: string, values: string[]) {
  return values.some((value) => normalizeSearchText(value) === query || compact(value) === compact(query));
}

function searchTier(pad: PadSummary, query: string, tokens: string[]) {
  const padName = normalizeSearchText(pad.padName);
  const company = normalizeSearchText(pad.company);
  const high = [pad.padName, pad.company, ...pad.aliases, ...pad.wellNames, ...pad.apiNumbers, ...pad.propertyNumbers];
  const location = [pad.state, pad.county, pad.township, pad.address, ...pad.safeRoadTerms];
  const highText = normalizeSearchText(high.join(" "));
  const locationText = normalizeSearchText(location.join(" "));

  if (compact(query) === compact(pad.canonicalId) && pad.canonicalId) return 0;
  if (compact(query) === compact(pad.legacyId) && pad.legacyId) return 1;
  if (exactAny(query, pad.apiNumbers)) return 2;
  if (exactAny(query, pad.propertyNumbers)) return 3;
  if (exactAny(query, [...pad.aliases, ...pad.wellNames])) return 4;
  if (padName === query || `${company} ${padName}` === query) return 5;
  if (tokens.every((token) => highText.split(" ").some((word) => word === token || word.startsWith(token)))) return 6;
  if (tokens.every((token) => highText.includes(token))) return 7;
  if (tokens.every((token) => locationText.includes(token))) return 8;
  return Number.POSITIVE_INFINITY;
}

export function searchDirectory(rows: PadSummary[], rawQuery: string, filters: SearchFilters, limit = 100) {
  const query = normalizeSearchText(rawQuery);
  const hadInput = String(rawQuery ?? "").trim().length > 0;
  const tokens = query.split(" ").filter(Boolean);
  if (!query && (filters.type === "road" || filters.type === "company")) return [];
  const filtered = rows.filter((row) => {
    if (filters.type === "pad" && row.recordType !== "pad") return false;
    if (filters.type === "disposal" && row.recordType !== "disposal") return false;
    if (filters.type === "company" && query && !normalizeSearchText(row.company).includes(query)) return false;
    if (filters.type === "road" && query && !normalizeSearchText(row.safeRoadTerms.join(" ")).includes(query)) return false;
    return true;
  });
  if (!query && hadInput) return [];
  if (!query) {
    return filtered
      .slice()
      .sort((a, b) => a.padName.localeCompare(b.padName) || a.company.localeCompare(b.company) || a.padId.localeCompare(b.padId))
      .slice(0, limit);
  }
  if (compact(query).length < 2) return [];

  return filtered
    .map((row) => ({ row, tier: searchTier(row, query, tokens) }))
    .filter((item) => Number.isFinite(item.tier))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.row.padName.localeCompare(b.row.padName) ||
        a.row.company.localeCompare(b.row.company) ||
        a.row.state.localeCompare(b.row.state) ||
        a.row.county.localeCompare(b.row.county) ||
        a.row.padId.localeCompare(b.row.padId),
    )
    .slice(0, limit)
    .map((item) => item.row);
}

export function isValidSearchOrigin(origin: SearchOrigin | null): origin is SearchOrigin {
  return Boolean(origin)
    && Number.isFinite(origin?.latitude)
    && Number.isFinite(origin?.longitude)
    && origin!.latitude >= -90
    && origin!.latitude <= 90
    && origin!.longitude >= -180
    && origin!.longitude <= 180;
}

export function distanceMilesBetween(left: SearchOrigin, right: SearchOrigin) {
  const radians = Math.PI / 180;
  const latitudeDelta = (right.latitude - left.latitude) * radians;
  const longitudeDelta = (right.longitude - left.longitude) * radians;
  const leftLatitude = left.latitude * radians;
  const rightLatitude = right.latitude * radians;
  const chord = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const boundedChord = Math.min(1, Math.max(0, chord));
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(boundedChord), Math.sqrt(1 - boundedChord));
}

function deterministicPadOrder(left: PadSummary, right: PadSummary) {
  return left.padName.localeCompare(right.padName)
    || left.company.localeCompare(right.company)
    || left.state.localeCompare(right.state)
    || left.county.localeCompare(right.county)
    || left.padId.localeCompare(right.padId);
}

/**
 * Ranks literal pad-name matches for display only. Coordinates never establish
 * road or route authority; they only order already-known directory pads.
 */
export function closestPadSearchResults(
  rows: PadSummary[],
  rawQuery: string,
  origin: SearchOrigin | null,
  limit = 7,
) {
  const query = normalizeSearchText(rawQuery);
  const hadInput = String(rawQuery ?? "").trim().length > 0;
  if ((!query && hadInput) || limit <= 0) return [];

  const pads = rows.filter((row) => row.recordType === "pad"
    && (!query || normalizeSearchText(row.padName).includes(query)));

  if (!isValidSearchOrigin(origin)) {
    if (!query) return [];
    return pads.slice().sort(deterministicPadOrder).slice(0, limit);
  }

  return pads
    .map((pad) => {
      const coordinate = mapDisplayCoordinate(pad);
      return {
        pad,
        distance: coordinate
          ? distanceMilesBetween(origin, { latitude: coordinate.latitude, longitude: coordinate.longitude })
          : null,
      };
    })
    .filter((result) => query || result.distance !== null)
    .sort((left, right) => {
      if (left.distance !== null && right.distance !== null) {
        return left.distance - right.distance
          || deterministicPadOrder(left.pad, right.pad);
      }
      if (left.distance !== null) return -1;
      if (right.distance !== null) return 1;
      return deterministicPadOrder(left.pad, right.pad);
    })
    .slice(0, limit)
    .map((result) => result.pad);
}

export function distanceMilesFromPad(pad: PadSummary, origin: SearchOrigin | null) {
  if (!isValidSearchOrigin(origin)) return null;
  const coordinate = mapDisplayCoordinate(pad);
  return coordinate
    ? distanceMilesBetween(origin, { latitude: coordinate.latitude, longitude: coordinate.longitude })
    : null;
}

export function nearbyDistanceLabel(distance: number | null) {
  if (distance === null || !Number.isFinite(distance) || distance < 0) return null;
  if (distance < 0.1) return "<0.1 mi from phone GPS";
  if (distance < 10) return `~${distance.toFixed(1)} mi from phone GPS`;
  return `~${Math.round(distance).toLocaleString()} mi from phone GPS`;
}

export function nearbyPadResultsHeading(rawQuery: string, origin: SearchOrigin | null) {
  const hasQuery = normalizeSearchText(rawQuery).length > 0;
  if (hasQuery) return isValidSearchOrigin(origin) ? "Closest matching pads" : "Pad-name matches";
  return isValidSearchOrigin(origin) ? "7 closest pads" : "Nearby pads";
}
