import type { DirectorySourceState, DriverPadStatus, DriverRouteGeometry, DriverRouteStep, PadSummary } from "./types";
import { buildGoogleRoutePublicPlan } from "./googleRoute";
import { parseCoordinatePair } from "./coordinates";
import { deviceIsOnline, readPadDirectionsOffline, savePadDirectionsOffline } from "./offlineRoutes";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvxzqtoiwhrgovzddtvz.supabase.co";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd";

const routeStates = new Set<DriverPadStatus["route"]["state"]>(["ready", "written_only", "held", "stale", "unavailable"]);
const routeSources = new Set<DriverPadStatus["route"]["source"]>(["exact_graph", "reviewed_written", "legacy_written", "destination_only", "none"]);
const graphStates = new Set<DriverPadStatus["graph"]["state"]>(["active_current", "stale", "held", "unavailable"]);
const googleStates = new Set<DriverPadStatus["google"]["publicState"]>(["ready", "held", "not_published", "stale", "unavailable"]);
const maxPublicRouteSteps = 500;
const maxPublicRouteLinePoints = 20_000;
const maxPublicRoutePoints = 50_000;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === "string" && allowed.has(value as T) ? (value as T) : fallback;
}

function statusDataState(sourceState: DirectorySourceState | undefined, canonical: boolean): DriverPadStatus["dataState"] {
  if (sourceState === "cached_live") return "cached";
  if (sourceState === "cached_stale") return "stale";
  if (sourceState === "live_stale") return "stale";
  if (sourceState === "packaged_fallback") return "fallback";
  if (sourceState === "unavailable") return "stale";
  return canonical ? "live" : "fallback";
}

function fallbackStatus(pad: PadSummary, sourceState?: DirectorySourceState): DriverPadStatus {
  return {
    padId: pad.padId,
    recordRevision: pad.recordRevision,
    dataState: statusDataState(sourceState, Boolean(pad.canonicalId)),
    route: {
      state: "unavailable",
      source: pad.coordinate ? "destination_only" : "none",
      geometry: null,
      safeReason: "No current public route status is available.",
      lastVerifiedAt: null,
      writtenDirections: null,
    },
    graph: { state: "unavailable", county: pad.county || null, publicSource: null, lastVerifiedAt: null },
    google: { publicState: "not_published", routeUrl: null, safeReason: "No current public Google route is published." },
    destination: {
      available: false,
      latitude: pad.coordinate?.latitude ?? null,
      longitude: pad.coordinate?.longitude ?? null,
    },
    googleRouteChunks: [],
    routeSteps: [],
  };
}

export function buildPendingPadStatus(pad: PadSummary, sourceState?: DirectorySourceState): DriverPadStatus {
  const status = fallbackStatus(pad, sourceState);
  return {
    ...status,
    dataState: "fallback",
    route: {
      ...status.route,
      safeReason: "Checking current public route status. No route authority has been assumed.",
    },
  };
}

function offlineCacheMissStatus(pad: PadSummary, sourceState?: DirectorySourceState): DriverPadStatus {
  const status = fallbackStatus(pad, sourceState);
  return {
    ...status,
    dataState: "fallback",
    route: {
      ...status.route,
      safeReason: "Directions for this pad are not cached on this device.",
    },
    google: {
      publicState: "not_published",
      routeUrl: null,
      safeReason: "Offline device storage never launches or republishes a Google route.",
    },
  };
}

function coordinatePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const longitude = finiteNumber(value[0]);
  const latitude = finiteNumber(value[1]);
  if (longitude === null || latitude === null) return null;
  const parsed = parseCoordinatePair(latitude, longitude, "reference");
  return parsed.ok ? [parsed.value.longitude, parsed.value.latitude] : null;
}

function lineCoordinates(value: unknown): [number, number][] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > maxPublicRouteLinePoints) return null;
  const coordinates = value.map(coordinatePair);
  return coordinates.every((point): point is [number, number] => point !== null) ? coordinates : null;
}

function normalizeRouteGeometry(value: unknown): DriverRouteGeometry | null {
  const collection = object(value);
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features) || !collection.features.length || collection.features.length > maxPublicRouteSteps) return null;
  const seenOrders = new Set<number>();
  const features: DriverRouteGeometry["features"] = [];
  let pointCount = 0;
  for (const rawFeature of collection.features) {
    const feature = object(rawFeature);
    const properties = object(feature.properties);
    const geometry = object(feature.geometry);
    const stepOrder = Number(properties.stepOrder ?? properties.step_order);
    if (feature.type !== "Feature" || !Number.isInteger(stepOrder) || stepOrder < 1 || seenOrders.has(stepOrder)) return null;
    seenOrders.add(stepOrder);
    if (geometry.type === "LineString") {
      const coordinates = lineCoordinates(geometry.coordinates);
      if (!coordinates) return null;
      pointCount += coordinates.length;
      if (pointCount > maxPublicRoutePoints) return null;
      features.push({ type: "Feature", properties: { stepOrder }, geometry: { type: "LineString", coordinates } });
      continue;
    }
    if (geometry.type === "MultiLineString") {
      if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) return null;
      const coordinates = geometry.coordinates.map(lineCoordinates);
      if (!coordinates.every((line): line is [number, number][] => line !== null)) return null;
      pointCount += coordinates.reduce((count, line) => count + line.length, 0);
      if (pointCount > maxPublicRoutePoints) return null;
      features.push({ type: "Feature", properties: { stepOrder }, geometry: { type: "MultiLineString", coordinates } });
      continue;
    }
    return null;
  }
  features.sort((left, right) => left.properties.stepOrder - right.properties.stepOrder);
  return { type: "FeatureCollection", features };
}

function geometryMatchesSteps(steps: DriverRouteStep[], geometry: DriverRouteGeometry) {
  return steps.length === geometry.features.length
    && steps.every((step, index) => geometry.features[index]?.properties.stepOrder === step.order);
}

export function normalizeDriverRouteProjection(stepsValue: unknown, geometryValue: unknown) {
  const steps = Array.isArray(stepsValue) ? normalizePublicRouteSteps(stepsValue) : null;
  const geometry = normalizeRouteGeometry(geometryValue);
  return steps && geometry && geometryMatchesSteps(steps, geometry) ? { steps, geometry } : null;
}

function normalizeStatus(row: Record<string, unknown>, pad: PadSummary, sourceState?: DirectorySourceState): DriverPadStatus {
  const base = fallbackStatus(pad, sourceState);
  const route = object(row.route);
  const graph = object(row.graph);
  const google = object(row.google);
  const destination = object(row.destination);
  const rawSteps = row.routeSteps ?? row.route_steps ?? route.publicSteps ?? route.steps;
  const routeUrl = nullableText(google.routeUrl ?? row.public_google_route_url);
  const routeState = route.state ?? row.route_state;
  const routeSource = route.source ?? row.route_source;
  const graphState = graph.state ?? row.graph_state;
  const googleState = google.publicState ?? row.public_google_state;
  const destinationAvailable = destination.available ?? row.destination_available;
  const destinationRole = nullableText(destination.role ?? row.destination_role);
  const parsedDestination = destinationAvailable === true && destinationRole === "driver_entrance"
    ? parseCoordinatePair(destination.latitude ?? row.destination_latitude, destination.longitude ?? row.destination_longitude, "driver_entrance")
    : null;
  const claimedRouteState = safeEnum(routeState, routeStates, base.route.state);
  const safeRouteSource = safeEnum(routeSource, routeSources, base.route.source);
  const safeGraphState = safeEnum(graphState, graphStates, base.graph.state);
  const exactProjection = claimedRouteState === "ready" && safeRouteSource === "exact_graph" && safeGraphState === "active_current"
    ? normalizeDriverRouteProjection(rawSteps, route.geometry ?? row.route_geometry)
    : null;
  const exactResponseReady = claimedRouteState === "ready"
    && safeRouteSource === "exact_graph"
    && safeGraphState === "active_current"
    && exactProjection !== null;
  const safeRouteState = claimedRouteState === "ready" && !exactResponseReady ? "held" : claimedRouteState;
  const routeSafeReason = claimedRouteState === "ready" && !exactResponseReady
    ? "The approved route response failed exact public validation and cannot be used."
    : nullableText(route.safeReason ?? row.route_safe_reason);
  const steps = exactResponseReady ? exactProjection!.steps : [];
  const claimedGoogleState = safeEnum(googleState, googleStates, base.google.publicState);
  const safeGoogleState = claimedGoogleState === "ready" && !exactResponseReady ? "stale" : claimedGoogleState;
  return {
    ...base,
    recordRevision: String(row.recordRevision ?? row.record_revision ?? base.recordRevision),
    route: {
      state: safeRouteState,
      source: safeRouteSource,
      geometry: exactResponseReady ? exactProjection!.geometry : null,
      safeReason: routeSafeReason,
      lastVerifiedAt: nullableText(route.lastVerifiedAt ?? row.route_last_verified_at),
      writtenDirections: nullableText(route.writtenDirections ?? row.written_directions) ?? base.route.writtenDirections,
    },
    graph: {
      state: safeGraphState,
      county: nullableText(graph.county ?? row.graph_county) ?? (pad.county || null),
      publicSource: nullableText(graph.publicSource ?? row.graph_public_source),
      lastVerifiedAt: nullableText(graph.lastVerifiedAt ?? row.graph_last_verified_at),
    },
    google: {
      publicState: safeGoogleState,
      routeUrl: safeGoogleState === "ready" ? routeUrl : null,
      safeReason: claimedGoogleState === "ready" && !exactResponseReady
        ? "The approved route response failed validation, so Google launch is disabled."
        : nullableText(google.safeReason ?? row.public_google_safe_reason),
    },
    destination: {
      available: parsedDestination?.ok === true,
      latitude: parsedDestination?.ok === true ? parsedDestination.value.latitude : null,
      longitude: parsedDestination?.ok === true ? parsedDestination.value.longitude : null,
    },
    googleRouteChunks: [],
    routeSteps: steps,
  };
}

function normalizePublicRouteSteps(values: unknown[]): DriverRouteStep[] | null {
  const kinds = new Set<DriverRouteStep["kind"]>(["turn", "continue", "name_change", "shared_begin", "shared_end"]);
  if (values.length < 1 || values.length > maxPublicRouteSteps) return null;
  const steps: DriverRouteStep[] = [];
  for (const [index, value] of values.entries()) {
    const step = object(value);
    const displayName = nullableText(step.displayName ?? step.road_name);
    if (!displayName) return null;
    const rawKind = nullableText(step.kind);
    if (!rawKind || !kinds.has(rawKind as DriverRouteStep["kind"])) return null;
    const order = step.order;
    if (!Number.isInteger(order) || order !== index + 1) return null;
    if (!Array.isArray(step.verifiedDesignations) || !step.verifiedDesignations.every((item) => typeof item === "string" && Boolean(item.trim()))) return null;
    const verifiedDesignations = step.verifiedDesignations.map((item) => (item as string).trim());
    if (new Set(verifiedDesignations).size !== verifiedDesignations.length) return null;
    const instruction = nullableText(step.instruction);
    if (!instruction) return null;
    const distanceValue = step.distanceMiles;
    const miles = distanceValue === null ? null : finiteNumber(distanceValue);
    if (distanceValue !== null && (miles === null || miles < 0)) return null;
    steps.push({
      order,
      kind: rawKind as DriverRouteStep["kind"],
      displayName,
      verifiedDesignations,
      instruction,
      distanceMiles: miles,
    });
  }
  return steps;
}

async function loadPublicGoogleRouteChunks(padId: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/brinesearch_driver_google_routes_public`);
  url.searchParams.set("select", "pad_id,route_revision,source_revision,manifest");
  url.searchParams.set("pad_id", `eq.${padId}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: { apikey: publishableKey, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Public Google route request failed (${response.status})`);
  const payload = await response.json() as unknown;
  const row = Array.isArray(payload) ? payload[0] : null;
  const plan = buildGoogleRoutePublicPlan(row);
  if (plan.padId !== padId || !plan.chunks.length) throw new Error("Public Google route did not match the selected pad");
  return plan.chunks.map(({ chunk, url }) => ({ chunk, url }));
}

const liveStatusRequests = new Map<string, Promise<DriverPadStatus | null>>();

async function fetchLivePadStatus(pad: PadSummary, sourceState?: DirectorySourceState): Promise<DriverPadStatus | null> {
  if (!pad.canonicalId) return null;
  try {
    const url = `${supabaseUrl}/rest/v1/rpc/brinesearch_v18_driver_pad_status`;
    const response = await fetch(url, {
      method: "POST",
      headers: { apikey: publishableKey, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ p_pad_id: pad.canonicalId }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as unknown;
    const row = Array.isArray(payload) ? object(payload[0]) : object(payload);
    const returnedPadId = nullableText(row.padId ?? row.pad_id);
    if (returnedPadId !== pad.canonicalId) return null;
    const returnedRecordRevision = nullableText(row.recordRevision ?? row.record_revision);
    if (returnedRecordRevision !== pad.recordRevision) return null;
    const status = Object.keys(row).length ? normalizeStatus(row, pad, sourceState) : null;
    if (!status) return null;
    if (status.google.publicState !== "ready") return status;
    try {
      const googleRouteChunks = await loadPublicGoogleRouteChunks(pad.canonicalId);
      return {
        ...status,
        google: { ...status.google, routeUrl: googleRouteChunks[0]?.url || null },
        googleRouteChunks,
      };
    } catch {
      return {
        ...status,
        google: {
          publicState: "stale",
          routeUrl: null,
          safeReason: "The public route failed its exact manifest validation and cannot be launched.",
        },
        googleRouteChunks: [],
      };
    }
  } catch {
    return null;
  }
}

function loadLivePadStatus(pad: PadSummary, sourceState?: DirectorySourceState) {
  const key = `${pad.padId}:${pad.recordRevision}:${sourceState || "live_current"}`;
  const existing = liveStatusRequests.get(key);
  if (existing) return existing;
  const request = fetchLivePadStatus(pad, sourceState).finally(() => liveStatusRequests.delete(key));
  liveStatusRequests.set(key, request);
  return request;
}

export async function loadPadStatus(pad: PadSummary, sourceState?: DirectorySourceState): Promise<DriverPadStatus> {
  if (!pad.canonicalId) return fallbackStatus(pad, sourceState);
  if (!deviceIsOnline()) {
    return await readPadDirectionsOffline(pad) || offlineCacheMissStatus(pad, sourceState);
  }

  const live = await loadLivePadStatus(pad, sourceState);
  if (live) {
    void savePadDirectionsOffline(pad, live);
    return live;
  }
  return await readPadDirectionsOffline(pad) || fallbackStatus(pad, sourceState);
}
