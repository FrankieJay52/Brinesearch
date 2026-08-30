import { parseCoordinatePair } from "./coordinates";
import { isSafePublicText } from "./publicFields";
import type {
  DriverPadStatus,
  DriverRouteGeometry,
  DriverRouteStep,
  GraphState,
  PadSummary,
  RouteSource,
  RouteState,
  WrittenDirectionsSource,
} from "./types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const revisionPattern = /^[1-9][0-9]*$/;
const cacheVersion = 2;
const maxCachedSteps = 500;
const maxRoadNameLength = 256;
const maxInstructionLength = 2_048;
const maxDesignationLength = 128;
const maxDesignationsPerStep = 32;
const unsafeControlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const writtenRouteStates = new Set<RouteState>(["written_only", "held", "stale"]);
const writtenRouteSources = new Set<RouteSource>(["legacy_written", "reviewed_written"]);
const writtenDirectionsSources = new Set<WrittenDirectionsSource>(["directions_clear", "written_directions"]);
const stepKinds = new Set<DriverRouteStep["kind"]>(["turn", "continue", "name_change", "shared_begin", "shared_end"]);
const graphStates = new Set<GraphState>(["active_current", "verified_release", "stale", "held", "unavailable"]);

export const offlineRouteSchema = [
  "PRAGMA foreign_keys = ON",
  `CREATE TABLE IF NOT EXISTS pads(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    operator TEXT NOT NULL,
    county TEXT NOT NULL,
    state TEXT NOT NULL,
    lat REAL,
    lon REAL,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS routes(
    id TEXT PRIMARY KEY,
    pad_id TEXT NOT NULL REFERENCES pads(id) ON DELETE CASCADE,
    route_group TEXT NOT NULL,
    status TEXT NOT NULL,
    revised_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS route_steps(
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL,
    road_name TEXT NOT NULL,
    road_id TEXT,
    instruction TEXT NOT NULL,
    miles REAL,
    start_lat REAL,
    start_lon REAL,
    end_lat REAL,
    end_lon REAL
  )`,
  "CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS pads_name_idx ON pads(name)",
  "CREATE INDEX IF NOT EXISTS routes_pad_id_idx ON routes(pad_id)",
  "CREATE INDEX IF NOT EXISTS route_steps_route_order_idx ON route_steps(route_id, step_index)",
] as const;

export interface OfflinePadRow {
  id: string;
  name: string;
  operator: string;
  county: string;
  state: string;
  lat: number | null;
  lon: number | null;
  updated_at: string | null;
}

export interface OfflineRouteRow {
  id: string;
  pad_id: string;
  route_group: string;
  status: RouteState;
  revised_at: string | null;
}

export interface OfflineRouteStepRow {
  id: string;
  route_id: string;
  step_index: number;
  road_name: string;
  road_id: string | null;
  instruction: string;
  miles: number | null;
  start_lat: number | null;
  start_lon: number | null;
  end_lat: number | null;
  end_lon: number | null;
}

interface OfflineStepMeta {
  stepIndex: number;
  kind: DriverRouteStep["kind"];
  verifiedDesignations: string[];
}

export interface OfflineRouteContract {
  schemaVersion: 2;
  padId: string;
  recordRevision: string;
  savedAt: string;
  routeSource: RouteSource;
  routeState: RouteState;
  routeSafeReason: string | null;
  routeLastVerifiedAt: string | null;
  writtenDirections: string | null;
  writtenDirectionsSource?: WrittenDirectionsSource | null;
  writtenDirectionsSourceRevision?: string | null;
  graphState: GraphState;
  graphCounty: string | null;
  graphPublicSource: string | null;
  graphLastVerifiedAt: string | null;
  immutableNavigationUrl: string | null;
  destinationRole: "saved_pad_destination" | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  stepMeta: OfflineStepMeta[];
}

export interface OfflineRouteRecord {
  pad: OfflinePadRow;
  route: OfflineRouteRow;
  steps: OfflineRouteStepRow[];
  contract: OfflineRouteContract;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Boolean(value) && !Number.isNaN(Date.parse(value));
}

function nullableDate(value: unknown): string | null {
  return validDate(value) ? value : null;
}

function safeBoundedText(value: unknown, maxLength: number, optional = false): value is string | null {
  if (optional && value === null) return true;
  return typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= maxLength
    && !unsafeControlPattern.test(value);
}

function finiteNullable(value: unknown): value is number | null {
  return value === null || typeof value === "number" && Number.isFinite(value);
}

function geometryEndpoints(geometry: DriverRouteGeometry, stepOrder: number) {
  const feature = geometry.features.find((candidate) => candidate.properties.stepOrder === stepOrder);
  if (!feature) return null;
  const lines = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const first = lines[0]?.[0];
  const lastLine = lines.at(-1);
  const last = lastLine?.at(-1);
  if (!first || !last) return null;
  const start = parseCoordinatePair(first[1], first[0], "reference");
  const end = parseCoordinatePair(last[1], last[0], "reference");
  if (!start.ok || !end.ok) return null;
  return {
    startLat: start.value.latitude,
    startLon: start.value.longitude,
    endLat: end.value.latitude,
    endLon: end.value.longitude,
  };
}

function exactDirectionsAreCacheable(status: DriverPadStatus) {
  if (status.route.state !== "ready"
      || status.route.source !== "exact_graph" && status.route.source !== "exact_graph_handoff"
      || status.route.source === "exact_graph" && status.graph.state !== "active_current"
      || status.route.source === "exact_graph_handoff" && status.graph.state !== "verified_release") return false;
  if (!status.route.geometry || status.routeSteps.length < 1 || status.routeSteps.length > maxCachedSteps) return false;
  if (status.route.geometry.features.length !== status.routeSteps.length) return false;
  return status.routeSteps.every((step, index) => step.order === index + 1
    && stepKinds.has(step.kind)
    && safeBoundedText(step.displayName, maxRoadNameLength)
    && safeBoundedText(step.instruction, maxInstructionLength)
    && finiteNullable(step.distanceMiles)
    && (step.distanceMiles === null || step.distanceMiles >= 0)
    && Array.isArray(step.verifiedDesignations)
    && step.verifiedDesignations.length <= maxDesignationsPerStep
    && new Set(step.verifiedDesignations).size === step.verifiedDesignations.length
    && step.verifiedDesignations.every((value) => safeBoundedText(value, maxDesignationLength))
    && geometryEndpoints(status.route.geometry!, step.order) !== null);
}

function urlCoordinate(value: string) {
  const parts = value.split(",");
  if (parts.length !== 2) return null;
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  const parsed = parseCoordinatePair(latitude, longitude, "reference");
  if (!parsed.ok) return null;
  // Google handoffs generated by this app use the canonical numeric form.
  // Reject alternate encodings so a locally modified cache cannot smuggle a
  // second interpretation through URL parsing.
  if (value !== `${parsed.value.latitude},${parsed.value.longitude}`) return null;
  return parsed.value;
}

type ValidatedNavigationUrl = {
  url: string;
  destination: { latitude: number; longitude: number };
  waypoints: Array<{ latitude: number; longitude: number }>;
};

function validatedNavigationUrl(
  value: unknown,
  destinationLatitude: number,
  destinationLongitude: number,
): ValidatedNavigationUrl | null {
  if (typeof value !== "string" || !safeBoundedText(value, 2_048)) return null;
  try {
    const url = new URL(value);
    const allowed = new Set(["api", "travelmode", "dir_action", "destination", "waypoints"]);
    const keys = [...url.searchParams.keys()];
    if (url.origin !== "https://www.google.com"
        || url.pathname !== "/maps/dir/" || url.username || url.password || url.hash
        || keys.length !== allowed.size
        || new Set(keys).size !== allowed.size
        || keys.some((key) => !allowed.has(key))
        || url.searchParams.get("api") !== "1"
        || url.searchParams.get("travelmode") !== "driving"
        || url.searchParams.get("dir_action") !== "navigate"
        || url.searchParams.has("origin")) return null;
    const destination = urlCoordinate(url.searchParams.get("destination") || "");
    const waypointValues = (url.searchParams.get("waypoints") || "").split("|");
    const waypoints = waypointValues.map(urlCoordinate);
    if (!destination || waypointValues.some((point) => !point) || waypoints.length < 1 || waypoints.length > 3
        || waypoints.some((point) => point === null)
        || Math.abs(destination.latitude - destinationLatitude) > 0.0000001
        || Math.abs(destination.longitude - destinationLongitude) > 0.0000001) return null;
    return { url: value, destination, waypoints: waypoints as ValidatedNavigationUrl["waypoints"] };
  } catch {
    return null;
  }
}

function sameCoordinate(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
) {
  return Math.abs(left.latitude - right.latitude) <= 0.0000001
    && Math.abs(left.longitude - right.longitude) <= 0.0000001;
}

function navigationWaypointsMatchGeometry(
  waypoints: ValidatedNavigationUrl["waypoints"],
  geometry: DriverRouteGeometry,
  steps: readonly DriverRouteStep[],
) {
  if (waypoints.length !== steps.length + 1) return false;
  const endpoints = steps.map((step) => geometryEndpoints(geometry, step.order));
  if (endpoints.some((value) => value === null)) return false;
  return endpoints.every((value, index) => value !== null
    && sameCoordinate(waypoints[index], { latitude: value.startLat, longitude: value.startLon })
    && sameCoordinate(waypoints[index + 1], { latitude: value.endLat, longitude: value.endLon }));
}

function navigationWaypointsMatchRows(
  waypoints: ValidatedNavigationUrl["waypoints"],
  rows: readonly OfflineRouteStepRow[],
) {
  if (waypoints.length !== rows.length + 1) return false;
  return rows.every((row, index) => row.start_lat !== null && row.start_lon !== null
    && row.end_lat !== null && row.end_lon !== null
    && sameCoordinate(waypoints[index], { latitude: row.start_lat, longitude: row.start_lon })
    && sameCoordinate(waypoints[index + 1], { latitude: row.end_lat, longitude: row.end_lon }));
}

function immutableNavigationUrl(status: DriverPadStatus) {
  if (status.route.source !== "exact_graph_handoff"
      || status.route.state !== "ready"
      || status.graph.state !== "verified_release"
      || status.google.publicState !== "ready"
      || !status.google.routeUrl
      || !status.route.geometry
      || status.destination.role !== "saved_pad_destination"
      || !status.destination.available
      || status.destination.latitude === null
      || status.destination.longitude === null) return null;
  const parsed = validatedNavigationUrl(
    status.google.routeUrl,
    status.destination.latitude,
    status.destination.longitude,
  );
  return parsed && navigationWaypointsMatchGeometry(parsed.waypoints, status.route.geometry, status.routeSteps)
    ? parsed.url
    : null;
}

function writtenDirectionsAreCacheable(status: DriverPadStatus, exactCacheable: boolean) {
  return isSafePublicText(status.route.writtenDirections, "writtenDirections")
    && (exactCacheable
      ? writtenDirectionsSources.has(status.route.writtenDirectionsSource as WrittenDirectionsSource)
        && validDate(status.route.writtenDirectionsSourceRevision)
      : writtenRouteStates.has(status.route.state)
        && writtenRouteSources.has(status.route.source));
}

export function buildOfflineRouteRecord(
  pad: PadSummary,
  status: DriverPadStatus,
  savedAt = new Date().toISOString(),
): OfflineRouteRecord | null {
  if (!pad.canonicalId || pad.canonicalId !== pad.padId || !uuidPattern.test(pad.padId)) return null;
  if (status.padId !== pad.padId || status.recordRevision !== pad.recordRevision || !revisionPattern.test(status.recordRevision)) return null;
  if (status.dataState !== "live" || !validDate(savedAt)) return null;
  const cacheExact = exactDirectionsAreCacheable(status);
  const cacheWritten = writtenDirectionsAreCacheable(status, cacheExact);
  if (cacheExact && status.route.writtenDirections !== null && !cacheWritten) return null;
  if (!cacheExact && !cacheWritten) return null;

  const routeId = `${pad.padId}:active`;
  const steps: OfflineRouteStepRow[] = cacheExact ? status.routeSteps.map((step) => {
    const endpoints = geometryEndpoints(status.route.geometry!, step.order)!;
    return {
      id: `${routeId}:${step.order}`,
      route_id: routeId,
      step_index: step.order,
      road_name: step.displayName,
      road_id: null,
      instruction: step.instruction,
      miles: step.distanceMiles,
      start_lat: endpoints.startLat,
      start_lon: endpoints.startLon,
      end_lat: endpoints.endLat,
      end_lon: endpoints.endLon,
    };
  }) : [];

  const revisedAt = nullableDate(status.route.lastVerifiedAt) || nullableDate(pad.updatedAt) || savedAt;
  const cachedNavigationUrl = immutableNavigationUrl(status);
  const record: OfflineRouteRecord = {
    pad: {
      id: pad.padId,
      name: pad.padName,
      operator: pad.company,
      county: pad.county,
      state: pad.state,
      lat: pad.coordinate?.latitude ?? null,
      lon: pad.coordinate?.longitude ?? null,
      updated_at: nullableDate(pad.updatedAt),
    },
    route: {
      id: routeId,
      pad_id: pad.padId,
      route_group: "active",
      status: status.route.state,
      revised_at: revisedAt,
    },
    steps,
    contract: {
      schemaVersion: cacheVersion,
      padId: pad.padId,
      recordRevision: status.recordRevision,
      savedAt,
      routeSource: status.route.source,
      routeState: status.route.state,
      routeSafeReason: status.route.safeReason,
      routeLastVerifiedAt: nullableDate(status.route.lastVerifiedAt),
      writtenDirections: cacheWritten ? status.route.writtenDirections : null,
      writtenDirectionsSource: cacheWritten
        && writtenDirectionsSources.has(status.route.writtenDirectionsSource as WrittenDirectionsSource)
        ? status.route.writtenDirectionsSource as WrittenDirectionsSource
        : null,
      writtenDirectionsSourceRevision: cacheWritten
        ? nullableDate(status.route.writtenDirectionsSourceRevision)
        : null,
      graphState: status.graph.state,
      graphCounty: status.graph.county,
      graphPublicSource: status.graph.publicSource,
      graphLastVerifiedAt: nullableDate(status.graph.lastVerifiedAt),
      immutableNavigationUrl: cachedNavigationUrl,
      destinationRole: cachedNavigationUrl ? "saved_pad_destination" : null,
      destinationLatitude: cachedNavigationUrl ? status.destination.latitude : null,
      destinationLongitude: cachedNavigationUrl ? status.destination.longitude : null,
      stepMeta: cacheExact ? status.routeSteps.map((step) => ({
        stepIndex: step.order,
        kind: step.kind,
        verifiedDesignations: [...step.verifiedDesignations],
      })) : [],
    },
  };
  return validPadRow(record.pad, pad) && validContract(record.contract, pad) ? record : null;
}

function validPadRow(row: OfflinePadRow, pad: PadSummary) {
  if (row.id !== pad.padId || !uuidPattern.test(row.id)) return false;
  if (!isSafePublicText(row.name, "padName") || !isSafePublicText(row.operator, "company")) return false;
  if (!isSafePublicText(row.county, "county", true) || !isSafePublicText(row.state, "state", true)) return false;
  if (!finiteNullable(row.lat) || !finiteNullable(row.lon)) return false;
  if ((row.lat === null) !== (row.lon === null)) return false;
  if (row.lat !== null && row.lon !== null && !parseCoordinatePair(row.lat, row.lon, "reference").ok) return false;
  return row.updated_at === null || validDate(row.updated_at);
}

function validContract(contract: OfflineRouteContract, pad: PadSummary) {
  if (contract.schemaVersion !== cacheVersion || contract.padId !== pad.padId || contract.recordRevision !== pad.recordRevision) return false;
  if (!validDate(contract.savedAt) || !revisionPattern.test(contract.recordRevision)) return false;
  if (!writtenRouteSources.has(contract.routeSource)
      && contract.routeSource !== "exact_graph"
      && contract.routeSource !== "exact_graph_handoff") return false;
  if (!writtenRouteStates.has(contract.routeState) && contract.routeState !== "ready") return false;
  if (contract.routeSafeReason !== null && !safeBoundedText(contract.routeSafeReason, 1_024)) return false;
  if (contract.routeLastVerifiedAt !== null && !validDate(contract.routeLastVerifiedAt)) return false;
  if (contract.writtenDirections !== null && !isSafePublicText(contract.writtenDirections, "writtenDirections")) return false;
  const writtenDirectionsSource = contract.writtenDirectionsSource ?? null;
  const writtenDirectionsSourceRevision = contract.writtenDirectionsSourceRevision ?? null;
  if (writtenDirectionsSource !== null && !writtenDirectionsSources.has(writtenDirectionsSource)) return false;
  if (writtenDirectionsSourceRevision !== null && !validDate(writtenDirectionsSourceRevision)) return false;
  if (contract.writtenDirections === null
      && (writtenDirectionsSource !== null || writtenDirectionsSourceRevision !== null)) return false;
  if ((contract.routeSource === "exact_graph" || contract.routeSource === "exact_graph_handoff")
      && contract.writtenDirections !== null
      && (writtenDirectionsSource === null || writtenDirectionsSourceRevision === null)) return false;
  if (!graphStates.has(contract.graphState)) return false;
  if (contract.graphCounty !== null && !isSafePublicText(contract.graphCounty, "county")) return false;
  if (contract.graphPublicSource !== null && !safeBoundedText(contract.graphPublicSource, 256)) return false;
  if (contract.graphLastVerifiedAt !== null && !validDate(contract.graphLastVerifiedAt)) return false;
  if (contract.immutableNavigationUrl !== null
      && (contract.destinationLatitude === null || contract.destinationLongitude === null
        || !validatedNavigationUrl(contract.immutableNavigationUrl, contract.destinationLatitude, contract.destinationLongitude))) return false;
  if (contract.destinationRole !== null && contract.destinationRole !== "saved_pad_destination") return false;
  if (!finiteNullable(contract.destinationLatitude) || !finiteNullable(contract.destinationLongitude)) return false;
  if ((contract.destinationLatitude === null) !== (contract.destinationLongitude === null)) return false;
  if (!Array.isArray(contract.stepMeta) || contract.stepMeta.length > maxCachedSteps) return false;
  if (!contract.stepMeta.every((metadata, index) => metadata
    && metadata.stepIndex === index + 1
    && stepKinds.has(metadata.kind)
    && Array.isArray(metadata.verifiedDesignations)
    && metadata.verifiedDesignations.length <= maxDesignationsPerStep
    && new Set(metadata.verifiedDesignations).size === metadata.verifiedDesignations.length
    && metadata.verifiedDesignations.every((value) => safeBoundedText(value, maxDesignationLength)))) return false;
  if (contract.routeSource === "exact_graph" || contract.routeSource === "exact_graph_handoff") {
    const exactGraph = contract.routeSource === "exact_graph"
      && contract.graphState === "active_current"
      && contract.immutableNavigationUrl === null
      && contract.destinationRole === null
      && contract.destinationLatitude === null
      && contract.destinationLongitude === null;
    const immutableCore = contract.routeSource === "exact_graph_handoff"
      && contract.graphState === "verified_release"
      && contract.immutableNavigationUrl !== null
      && contract.destinationRole === "saved_pad_destination"
      && contract.destinationLatitude !== null
      && contract.destinationLongitude !== null;
    return contract.routeState === "ready"
      && (exactGraph || immutableCore)
      && contract.stepMeta.length > 0;
  }
  return writtenRouteSources.has(contract.routeSource)
    && writtenRouteStates.has(contract.routeState)
    && contract.writtenDirections !== null
    && contract.stepMeta.length === 0;
}

function restoreSteps(record: OfflineRouteRecord): DriverRouteStep[] | null {
  if (record.steps.length < 1 || record.steps.length > maxCachedSteps || record.contract.stepMeta.length !== record.steps.length) return null;
  const steps: DriverRouteStep[] = [];
  for (const [index, row] of record.steps.entries()) {
    const expectedIndex = index + 1;
    const metadata = record.contract.stepMeta[index];
    if (row.id !== `${record.route.id}:${expectedIndex}` || row.route_id !== record.route.id || row.step_index !== expectedIndex) return null;
    if (row.road_id !== null || !safeBoundedText(row.road_name, maxRoadNameLength) || !safeBoundedText(row.instruction, maxInstructionLength)) return null;
    if (!finiteNullable(row.miles) || row.miles !== null && row.miles < 0) return null;
    if (![row.start_lat, row.start_lon, row.end_lat, row.end_lon].every((value) => finiteNullable(value))) return null;
    if ([row.start_lat, row.start_lon, row.end_lat, row.end_lon].some((value) => value === null)) return null;
    if (!parseCoordinatePair(row.start_lat!, row.start_lon!, "reference").ok || !parseCoordinatePair(row.end_lat!, row.end_lon!, "reference").ok) return null;
    if (!metadata || metadata.stepIndex !== expectedIndex || !stepKinds.has(metadata.kind)) return null;
    if (!Array.isArray(metadata.verifiedDesignations) || metadata.verifiedDesignations.length > maxDesignationsPerStep) return null;
    if (new Set(metadata.verifiedDesignations).size !== metadata.verifiedDesignations.length) return null;
    if (!metadata.verifiedDesignations.every((value) => safeBoundedText(value, maxDesignationLength))) return null;
    steps.push({
      order: expectedIndex,
      kind: metadata.kind,
      displayName: row.road_name,
      verifiedDesignations: [...metadata.verifiedDesignations],
      instruction: row.instruction,
      distanceMiles: row.miles,
    });
  }
  return steps;
}

export function restoreOfflinePadStatus(pad: PadSummary, value: unknown): DriverPadStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as OfflineRouteRecord;
  if (!record.pad || !record.route || !Array.isArray(record.steps) || !record.contract) return null;
  if (!validPadRow(record.pad, pad) || !validContract(record.contract, pad)) return null;
  if (record.route.id !== `${pad.padId}:active` || record.route.pad_id !== pad.padId || record.route.route_group !== "active") return null;
  if (record.route.status !== record.contract.routeState || record.route.revised_at !== null && !validDate(record.route.revised_at)) return null;

  const exact = (record.contract.routeSource === "exact_graph" || record.contract.routeSource === "exact_graph_handoff")
    && record.contract.routeState === "ready";
  const validatedCachedNavigation = record.contract.destinationLatitude !== null
    && record.contract.destinationLongitude !== null
    ? validatedNavigationUrl(
      record.contract.immutableNavigationUrl,
      record.contract.destinationLatitude,
      record.contract.destinationLongitude,
    )
    : null;
  const immutableCore = exact
    && record.contract.routeSource === "exact_graph_handoff"
    && record.contract.graphState === "verified_release"
    && record.contract.immutableNavigationUrl !== null
    && record.contract.destinationRole === "saved_pad_destination"
    && record.contract.destinationLatitude !== null
    && record.contract.destinationLongitude !== null
    && validatedCachedNavigation !== null
    && navigationWaypointsMatchRows(validatedCachedNavigation.waypoints, record.steps);
  const written = writtenRouteSources.has(record.contract.routeSource)
    && writtenRouteStates.has(record.contract.routeState)
    && record.contract.writtenDirections !== null;
  const routeSteps = exact ? restoreSteps(record) : [];
  if (exact && !routeSteps || !exact && record.steps.length > 0 || !exact && !written) return null;

  return {
    padId: pad.padId,
    recordRevision: pad.recordRevision,
    dataState: "cached",
    loadProvenance: "device_cache",
    route: {
      state: immutableCore ? "ready" : exact ? "stale" : record.contract.routeState,
      source: record.contract.routeSource,
      geometry: null,
      safeReason: immutableCore
        ? `Last-known frozen approved release saved on ${new Date(record.contract.savedAt).toLocaleString()}. Revocation cannot be checked while offline.`
        : exact
        ? `Saved reviewed route directions from ${new Date(record.contract.savedAt).toLocaleString()}. Current graph status is not checked offline.`
        : record.contract.routeSafeReason || "Saved reviewed written directions are available on this device.",
      lastVerifiedAt: record.contract.routeLastVerifiedAt,
      writtenDirections: record.contract.writtenDirections,
      writtenDirectionsSource: record.contract.writtenDirectionsSource ?? null,
      writtenDirectionsSourceRevision: record.contract.writtenDirectionsSourceRevision ?? null,
    },
    graph: {
      state: immutableCore ? "verified_release" : exact ? "stale" : record.contract.graphState === "unavailable" ? "unavailable" : "held",
      county: record.contract.graphCounty || pad.county || null,
      publicSource: record.contract.graphPublicSource,
      lastVerifiedAt: record.contract.graphLastVerifiedAt,
    },
    google: {
      publicState: immutableCore ? "ready" : "not_published",
      routeUrl: immutableCore ? validatedCachedNavigation.url : null,
      safeReason: immutableCore
        ? "This device holds the validated immutable route handoff. Google Maps still needs a connection to load navigation."
        : "Offline device storage does not create a Google handoff.",
    },
    destination: {
      available: immutableCore,
      role: immutableCore ? "saved_pad_destination" : null,
      latitude: immutableCore ? record.contract.destinationLatitude : pad.coordinate?.latitude ?? null,
      longitude: immutableCore ? record.contract.destinationLongitude : pad.coordinate?.longitude ?? null,
    },
    routeSteps: routeSteps || [],
  };
}

export function offlineRouteMetaKey(padId: string) {
  return `route-contract:${padId}`;
}
