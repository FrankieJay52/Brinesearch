import { ownerRpc } from "./ownerSession";

type JsonObject = Record<string, unknown>;
export type OwnerRoadStatus = "approved_by_policy" | "explicitly_approved" | "candidate" | "held" | "restricted" | "reference_only";
export type OwnerRoadClass = "interstate" | "us_route" | "state_route" | "county" | "township" | "municipal" | "local" | "ramp" | "other";
export type OwnerRoadGeometry =
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "MultiLineString"; coordinates: [number, number][][] };

export type OwnerRoadFeature = {
  type: "Feature";
  geometry: OwnerRoadGeometry;
  properties: {
    identityId: string;
    canonicalRoadId: string | null;
    displayName: string;
    canonicalName: string | null;
    routeSystem: string | null;
    routeNumber: string | null;
    routeDesignation: string | null;
    roadClass: OwnerRoadClass;
    stateCode: "OH" | "WV" | "PA";
    countyCode: string | null;
    countyName: string | null;
    township: string | null;
    municipality: string | null;
    approvalStatus: OwnerRoadStatus;
    sourceCurrent: boolean;
    mappingConflict: boolean;
    occurrenceCount: number;
    padCount: number;
    sourceIdentityKey: string;
    sourceAgency: string;
    sourceDataset: string;
    sourceVersion: string;
  };
};

export type OwnerPadOption = {
  padId: string;
  padName: string;
  company: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
};

export type OwnerRoadViewport = {
  type: "FeatureCollection";
  features: OwnerRoadFeature[];
  pads: OwnerPadOption[];
  truncated: boolean;
  limit: number;
  zoom: number;
  zoomRequired: number | null;
};

export type OwnerRoadBounds = { west: number; south: number; east: number; north: number };

export type OwnerRoadDetail = OwnerRoadFeature["properties"] & {
  aliases: string[];
  sourceRecordIds: string[];
  approvalBasis: string;
  publicAccessStatus: string;
  drivableStatus: string;
  truckStatus: string | null;
  restrictionSummary: string | null;
  holdSummary: string | null;
  geometryStatus: string;
  geometrySegmentCount: number;
  bounds: OwnerRoadBounds | null;
  pads: Array<{ padId: string; padName: string; company: string; occurrenceCount: number }>;
  knownPhysicalJunctions: number;
  junctionsTruncated: boolean;
  junctions: Array<{
    junctionId: string;
    displayId: string;
    latitude: number;
    longitude: number;
    connectedRoads: Array<{
      identityId: string;
      displayName: string;
      roadNameAtJunction: string | null;
      routeSystem: string | null;
      routeNumber: string | null;
      roadClass: string;
      stateCode: string;
      countyCode: string | null;
      countyName: string | null;
      township: string | null;
      municipality: string | null;
      sourceIdentityKey: string;
    }>;
  }>;
  graphSummary: string | null;
  verificationDate: string | null;
};

export type OwnerRoadViewportRequest = OwnerRoadBounds & {
  zoom: number;
  state: "OH" | "WV" | "PA" | null;
  county: string | null;
  roadClasses: OwnerRoadClass[];
  routeSystems: string[] | null;
  statuses: OwnerRoadStatus[];
  search: string | null;
  padId: string | null;
  limit: number;
};

export const ownerRoadStatuses: OwnerRoadStatus[] = ["approved_by_policy", "explicitly_approved", "candidate", "held", "restricted", "reference_only"];
export const ownerRoadClasses: OwnerRoadClass[] = ["interstate", "us_route", "state_route", "county", "township", "municipal", "local", "ramp", "other"];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statusSet = new Set(ownerRoadStatuses);
const roadClassSet = new Set(ownerRoadClasses);

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function singleton(value: unknown) {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function text(value: unknown, max = 500): string | null {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return null;
  return value;
}

function nullableText(value: unknown, max = 500): string | null | undefined {
  if (value === null) return null;
  return text(value, max) ?? undefined;
}

function requiredText(value: unknown, max = 500) {
  const parsed = text(value, max);
  return parsed && parsed.trim() ? parsed : null;
}

function integer(value: unknown, min = 0, max = 1_000_000) {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
}

function coordinate(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function uuid(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

function nullableUuid(value: unknown): string | null | undefined {
  if (value === null) return null;
  return uuid(value) ?? undefined;
}

function line(value: unknown): value is [number, number][] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 50_000 && value.every((point) => Array.isArray(point)
    && point.length === 2
    && coordinate(point[0], -84.5, -73.5) !== null
    && coordinate(point[1], 36.5, 43.5) !== null);
}

function geometry(value: unknown): OwnerRoadGeometry | null {
  const row = object(value);
  if (row.type === "LineString" && line(row.coordinates)) return { type: "LineString", coordinates: row.coordinates };
  if (row.type === "MultiLineString" && Array.isArray(row.coordinates) && row.coordinates.length > 0 && row.coordinates.length <= 5_000 && row.coordinates.every(line)) {
    const pointCount = row.coordinates.reduce((count, part) => count + part.length, 0);
    if (pointCount <= 100_000) return { type: "MultiLineString", coordinates: row.coordinates };
  }
  return null;
}

function roadProperties(value: unknown): OwnerRoadFeature["properties"] | null {
  const row = object(value);
  const identityId = uuid(row.identity_id);
  const canonicalRoadId = nullableUuid(row.canonical_road_id);
  const displayName = requiredText(row.display_name, 300);
  const canonicalName = nullableText(row.canonical_name, 300);
  const routeSystem = nullableText(row.route_system, 80);
  const routeNumber = nullableText(row.route_number, 80);
  const routeDesignation = nullableText(row.route_designation, 180);
  const roadClass = roadClassSet.has(row.road_class as OwnerRoadClass) ? row.road_class as OwnerRoadClass : null;
  const stateCode = new Set(["OH", "WV", "PA"]).has(row.state_code as string) ? row.state_code as "OH" | "WV" | "PA" : null;
  const countyCode = nullableText(row.county_code, 100);
  const countyName = nullableText(row.county_name, 180);
  const township = nullableText(row.township, 180);
  const municipality = nullableText(row.municipality, 180);
  const approvalStatus = statusSet.has(row.approval_status as OwnerRoadStatus) ? row.approval_status as OwnerRoadStatus : null;
  const occurrenceCount = integer(row.occurrence_count);
  const padCount = integer(row.pad_count);
  const sourceIdentityKey = requiredText(row.source_identity_key, 500);
  const sourceAgency = requiredText(row.source_agency, 200);
  const sourceDataset = requiredText(row.source_dataset, 300);
  const sourceVersion = requiredText(row.source_version, 200);
  if (!identityId || canonicalRoadId === undefined || !displayName || canonicalName === undefined || routeSystem === undefined
    || routeNumber === undefined || routeDesignation === undefined || !roadClass || !stateCode || countyCode === undefined
    || countyName === undefined || township === undefined || municipality === undefined || !approvalStatus
    || typeof row.source_current !== "boolean" || typeof row.mapping_conflict !== "boolean"
    || occurrenceCount === null || padCount === null || !sourceIdentityKey || !sourceAgency || !sourceDataset || !sourceVersion) return null;
  return {
    identityId, canonicalRoadId, displayName, canonicalName, routeSystem, routeNumber, routeDesignation, roadClass,
    stateCode, countyCode, countyName, township, municipality, approvalStatus,
    sourceCurrent: row.source_current, mappingConflict: row.mapping_conflict, occurrenceCount, padCount,
    sourceIdentityKey, sourceAgency, sourceDataset, sourceVersion,
  };
}

function pad(value: unknown): OwnerPadOption | null {
  const row = object(value);
  const padId = uuid(row.pad_id);
  const padName = requiredText(row.pad_name, 300);
  const company = nullableText(row.company, 300);
  // The pad-options RPC includes state, while the bounded viewport marker
  // intentionally returns only identity/name/company/coordinates. Treat an
  // omitted state as unavailable without weakening validation of a supplied
  // state value.
  const state = row.state === undefined ? "" : nullableText(row.state, 100);
  const latitude = row.lat === null ? null : coordinate(Number(row.lat), 36.5, 43.5);
  const longitude = row.lng === null ? null : coordinate(Number(row.lng), -84.5, -73.5);
  if (!padId || !padName || company === undefined || state === undefined || latitude === null && row.lat !== null || longitude === null && row.lng !== null) return null;
  return { padId, padName, company: company ?? "", state: state ?? "", latitude, longitude };
}

export function validateOwnerRoadViewport(value: unknown): OwnerRoadViewport | null {
  const row = object(singleton(value));
  if (row.type !== "FeatureCollection" || !Array.isArray(row.features) || row.features.length > 800 || !Array.isArray(row.pads) || row.pads.length > 1) return null;
  let pointCount = 0;
  const features: OwnerRoadFeature[] = [];
  for (const rawFeature of row.features) {
    const feature = object(rawFeature);
    const parsedGeometry = geometry(feature.geometry);
    const properties = roadProperties(feature.properties);
    if (feature.type !== "Feature" || !parsedGeometry || !properties) return null;
    pointCount += parsedGeometry.type === "LineString" ? parsedGeometry.coordinates.length : parsedGeometry.coordinates.reduce((count, part) => count + part.length, 0);
    if (pointCount > 250_000) return null;
    features.push({ type: "Feature", geometry: parsedGeometry, properties });
  }
  const pads = row.pads.map(pad);
  const limit = integer(row.limit, 25, 800);
  const zoom = integer(row.zoom, 0, 19);
  const zoomRequired = row.zoom_required === undefined || row.zoom_required === null ? null : integer(row.zoom_required, 8, 19);
  if (pads.some((entry) => entry === null) || typeof row.truncated !== "boolean" || limit === null || zoom === null || zoomRequired === null && row.zoom_required !== undefined && row.zoom_required !== null) return null;
  return { type: "FeatureCollection", features, pads: pads as OwnerPadOption[], truncated: row.truncated, limit, zoom, zoomRequired };
}

function stringList(value: unknown, maxItems = 100, maxLength = 500) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const rows = value.map((entry) => text(entry, maxLength));
  return rows.some((entry) => entry === null) ? null : rows as string[];
}

function bounds(value: unknown): OwnerRoadBounds | null {
  if (value === null) return null;
  const row = object(value);
  const west = coordinate(Number(row.west), -84.5, -73.5);
  const south = coordinate(Number(row.south), 36.5, 43.5);
  const east = coordinate(Number(row.east), -84.5, -73.5);
  const north = coordinate(Number(row.north), 36.5, 43.5);
  return west !== null && south !== null && east !== null && north !== null && west <= east && south <= north ? { west, south, east, north } : null;
}

export function validateOwnerRoadDetail(value: unknown): OwnerRoadDetail | null {
  const raw = object(singleton(value));
  const properties = roadProperties({
    ...raw,
    occurrence_count: Array.isArray(raw.pads) ? raw.pads.reduce((count, entry) => count + (integer(object(entry).occurrence_count) || 0), 0) : 0,
    pad_count: Array.isArray(raw.pads) ? raw.pads.length : 0,
  });
  const aliases = stringList(raw.aliases, 200, 300);
  const sourceRecord = nullableText(raw.source_record_ids, 500);
  const sourceRecordIds = Array.isArray(raw.source_record_ids)
    ? stringList(raw.source_record_ids, 200, 500)
    : sourceRecord === undefined ? null : sourceRecord === null ? [] : [sourceRecord];
  const approvalBasis = requiredText(raw.approval_basis, 1_000);
  const publicAccessStatus = requiredText(raw.public_access_status, 100);
  const drivableStatus = requiredText(raw.drivable_status, 100);
  const truckStatus = nullableText(raw.truck_status, 100);
  const restrictionSummary = nullableText(raw.restriction_summary, 1_000);
  const holdSummary = nullableText(raw.hold_summary, 1_000);
  const geometryStatus = requiredText(raw.geometry_status, 300);
  const geometrySegmentCount = integer(raw.geometry_segment_count);
  const parsedBounds = bounds(raw.bounds);
  const knownPhysicalJunctions = integer(raw.known_physical_junctions);
  const graphSummary = nullableText(raw.graph_summary, 500);
  const verificationDate = nullableText(raw.verification_date, 100);
  if (!properties || !aliases || !sourceRecordIds || !approvalBasis || !publicAccessStatus || !drivableStatus || truckStatus === undefined
    || restrictionSummary === undefined || holdSummary === undefined || !geometryStatus || geometrySegmentCount === null
    || parsedBounds === null && raw.bounds !== null || knownPhysicalJunctions === null || typeof raw.junctions_truncated !== "boolean"
    || graphSummary === undefined || verificationDate === undefined || !Array.isArray(raw.pads) || !Array.isArray(raw.junctions)) return null;
  const pads = raw.pads.map((entry) => {
    const row = object(entry); const padId = uuid(row.pad_id); const padName = requiredText(row.pad_name, 300); const company = nullableText(row.company, 300); const occurrenceCount = integer(row.occurrence_count);
    return padId && padName && company !== undefined && occurrenceCount !== null ? { padId, padName, company: company ?? "", occurrenceCount } : null;
  });
  const junctions = raw.junctions.slice(0, 100).map((entry) => {
    const row = object(entry); const junctionId = uuid(row.junction_id); const displayId = requiredText(row.display_id, 300);
    const latitude = coordinate(Number(row.lat), 36.5, 43.5); const longitude = coordinate(Number(row.lng), -84.5, -73.5);
    if (!junctionId || !displayId || latitude === null || longitude === null || !Array.isArray(row.connected_roads)) return null;
    const connectedRoads = row.connected_roads.map((connected) => {
      const road = object(connected); const identityId = uuid(road.identity_id); const displayName = requiredText(road.display_name, 300);
      const roadNameAtJunction = nullableText(road.road_name_at_junction, 300); const routeSystem = nullableText(road.route_system, 80); const routeNumber = nullableText(road.route_number, 80);
      const roadClass = requiredText(road.road_class, 100); const stateCode = requiredText(road.state_code, 10); const countyCode = nullableText(road.county_code, 100);
      const countyName = nullableText(road.county_name, 180); const township = nullableText(road.township, 180); const municipality = nullableText(road.municipality, 180);
      const sourceIdentityKey = requiredText(road.source_identity_key, 500);
      return identityId && displayName && roadNameAtJunction !== undefined && routeSystem !== undefined && routeNumber !== undefined && roadClass && stateCode
        && countyCode !== undefined && countyName !== undefined && township !== undefined && municipality !== undefined && sourceIdentityKey
        ? { identityId, displayName, roadNameAtJunction, routeSystem, routeNumber, roadClass, stateCode, countyCode, countyName, township, municipality, sourceIdentityKey }
        : null;
    });
    return connectedRoads.some((road) => road === null) ? null : { junctionId, displayId, latitude, longitude, connectedRoads: connectedRoads as OwnerRoadDetail["junctions"][number]["connectedRoads"] };
  });
  if (pads.some((entry) => entry === null) || junctions.some((entry) => entry === null)) return null;
  return {
    ...properties, aliases, sourceRecordIds, approvalBasis, publicAccessStatus, drivableStatus, truckStatus,
    restrictionSummary, holdSummary, geometryStatus, geometrySegmentCount, bounds: parsedBounds,
    pads: pads as OwnerRoadDetail["pads"], knownPhysicalJunctions, junctionsTruncated: raw.junctions_truncated,
    junctions: junctions as OwnerRoadDetail["junctions"], graphSummary, verificationDate,
  };
}

export function validateOwnerPadOptions(value: unknown) {
  const rows = Array.isArray(value) && value.length === 1 && Array.isArray(value[0]) ? value[0] : value;
  if (!Array.isArray(rows) || rows.length > 5_000) return null;
  const parsed = rows.map(pad);
  return parsed.some((entry) => entry === null) ? null : parsed as OwnerPadOption[];
}

export async function loadOwnerRoadViewport(request: OwnerRoadViewportRequest, signal?: AbortSignal) {
  const payload = await ownerRpc("owner_approved_routes_map_viewport", {
    p_west: request.west, p_south: request.south, p_east: request.east, p_north: request.north,
    p_zoom: request.zoom, p_state: request.state, p_county: request.county,
    p_road_classes: request.roadClasses, p_route_systems: request.routeSystems,
    p_statuses: request.statuses, p_search: request.search, p_pad_id: request.padId, p_limit: request.limit,
  }, signal);
  const parsed = validateOwnerRoadViewport(payload);
  if (!parsed) throw new Error("Owner road viewport failed the safe response contract.");
  return parsed;
}

export async function loadOwnerRoadDetail(identityId: string, signal?: AbortSignal) {
  if (!uuid(identityId)) throw new Error("Exact road identity is invalid.");
  const payload = await ownerRpc("owner_approved_routes_map_road_detail", { p_identity_id: identityId }, signal);
  const parsed = validateOwnerRoadDetail(payload);
  if (!parsed) throw new Error("Owner road detail failed the safe response contract.");
  return parsed;
}

export async function loadOwnerPadOptions(signal?: AbortSignal) {
  const payload = await ownerRpc("owner_approved_routes_map_pad_options", {}, signal);
  const parsed = validateOwnerPadOptions(payload);
  if (!parsed) throw new Error("Owner pad options failed the safe response contract.");
  return parsed;
}
