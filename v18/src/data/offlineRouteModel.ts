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
} from "./types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const revisionPattern = /^[1-9][0-9]*$/;
const cacheVersion = 1;
const maxCachedSteps = 500;
const maxRoadNameLength = 256;
const maxInstructionLength = 2_048;
const maxDesignationLength = 128;
const maxDesignationsPerStep = 32;
const unsafeControlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const writtenRouteStates = new Set<RouteState>(["written_only", "held", "stale"]);
const writtenRouteSources = new Set<RouteSource>(["legacy_written", "reviewed_written"]);
const stepKinds = new Set<DriverRouteStep["kind"]>(["turn", "continue", "name_change", "shared_begin", "shared_end"]);
const graphStates = new Set<GraphState>(["active_current", "stale", "held", "unavailable"]);

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
  schemaVersion: 1;
  padId: string;
  recordRevision: string;
  savedAt: string;
  routeSource: RouteSource;
  routeState: RouteState;
  routeSafeReason: string | null;
  routeLastVerifiedAt: string | null;
  writtenDirections: string | null;
  graphState: GraphState;
  graphCounty: string | null;
  graphPublicSource: string | null;
  graphLastVerifiedAt: string | null;
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
  if (status.route.state !== "ready" || status.route.source !== "exact_graph" || status.graph.state !== "active_current") return false;
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

function writtenDirectionsAreCacheable(status: DriverPadStatus) {
  return writtenRouteStates.has(status.route.state)
    && writtenRouteSources.has(status.route.source)
    && isSafePublicText(status.route.writtenDirections, "writtenDirections");
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
  const cacheWritten = writtenDirectionsAreCacheable(status);
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
      graphState: status.graph.state,
      graphCounty: status.graph.county,
      graphPublicSource: status.graph.publicSource,
      graphLastVerifiedAt: nullableDate(status.graph.lastVerifiedAt),
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
  if (!writtenRouteSources.has(contract.routeSource) && contract.routeSource !== "exact_graph") return false;
  if (!writtenRouteStates.has(contract.routeState) && contract.routeState !== "ready") return false;
  if (contract.routeSafeReason !== null && !safeBoundedText(contract.routeSafeReason, 1_024)) return false;
  if (contract.routeLastVerifiedAt !== null && !validDate(contract.routeLastVerifiedAt)) return false;
  if (contract.writtenDirections !== null && !isSafePublicText(contract.writtenDirections, "writtenDirections")) return false;
  if (!graphStates.has(contract.graphState)) return false;
  if (contract.graphCounty !== null && !isSafePublicText(contract.graphCounty, "county")) return false;
  if (contract.graphPublicSource !== null && !safeBoundedText(contract.graphPublicSource, 256)) return false;
  if (contract.graphLastVerifiedAt !== null && !validDate(contract.graphLastVerifiedAt)) return false;
  if (!Array.isArray(contract.stepMeta) || contract.stepMeta.length > maxCachedSteps) return false;
  if (!contract.stepMeta.every((metadata, index) => metadata
    && metadata.stepIndex === index + 1
    && stepKinds.has(metadata.kind)
    && Array.isArray(metadata.verifiedDesignations)
    && metadata.verifiedDesignations.length <= maxDesignationsPerStep
    && new Set(metadata.verifiedDesignations).size === metadata.verifiedDesignations.length
    && metadata.verifiedDesignations.every((value) => safeBoundedText(value, maxDesignationLength)))) return false;
  if (contract.routeSource === "exact_graph") {
    return contract.routeState === "ready"
      && contract.graphState === "active_current"
      && contract.writtenDirections === null
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

  const exact = record.contract.routeSource === "exact_graph" && record.contract.routeState === "ready";
  const written = writtenRouteSources.has(record.contract.routeSource)
    && writtenRouteStates.has(record.contract.routeState)
    && record.contract.writtenDirections !== null;
  const routeSteps = exact ? restoreSteps(record) : [];
  if (exact && !routeSteps || !exact && record.steps.length > 0 || !exact && !written) return null;

  return {
    padId: pad.padId,
    recordRevision: pad.recordRevision,
    dataState: "cached",
    route: {
      state: exact ? "stale" : record.contract.routeState,
      source: record.contract.routeSource,
      geometry: null,
      safeReason: exact
        ? `Last known approved directions saved ${new Date(record.contract.savedAt).toLocaleString()}. Current graph status is not checked offline.`
        : record.contract.routeSafeReason || "Last known reviewed written directions saved on this device.",
      lastVerifiedAt: record.contract.routeLastVerifiedAt,
      writtenDirections: record.contract.writtenDirections,
    },
    graph: {
      state: exact ? "stale" : record.contract.graphState === "unavailable" ? "unavailable" : "held",
      county: record.contract.graphCounty || pad.county || null,
      publicSource: record.contract.graphPublicSource,
      lastVerifiedAt: record.contract.graphLastVerifiedAt,
    },
    google: {
      publicState: "not_published",
      routeUrl: null,
      safeReason: "Offline device storage does not create a Google handoff.",
    },
    destination: {
      available: false,
      latitude: pad.coordinate?.latitude ?? null,
      longitude: pad.coordinate?.longitude ?? null,
    },
    routeSteps: routeSteps || [],
  };
}

export function offlineRouteMetaKey(padId: string) {
  return `route-contract:${padId}`;
}
