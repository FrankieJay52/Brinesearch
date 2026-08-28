import type { DirectorySourceState, DriverOwnerVerifiedAccessRoute, DriverPadStatus, DriverRouteGeometry, DriverRouteStep, PadSummary } from "./types";
import { buildCoreDestinationReleasePlan, buildGoogleRoutePublicPlan, buildNamedApproachReleaseSet, buildOwnerVerifiedAccessRoute } from "./googleRoute";
import { parseCoordinatePair } from "./coordinates";
import { trustedPadDestination } from "./googleDestination";
import { deviceIsOnline, readPadDirectionsOffline, savePadDirectionsOffline } from "./offlineRoutes";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvxzqtoiwhrgovzddtvz.supabase.co";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd";

const routeStates = new Set<DriverPadStatus["route"]["state"]>(["ready", "written_only", "held", "stale", "unavailable"]);
const routeSources = new Set<DriverPadStatus["route"]["source"]>(["exact_graph", "exact_graph_handoff", "owner_verified_access", "reviewed_written", "legacy_written", "destination_only", "none"]);
const graphStates = new Set<DriverPadStatus["graph"]["state"]>(["active_current", "verified_release", "stale", "held", "unavailable"]);
const googleStates = new Set<DriverPadStatus["google"]["publicState"]>(["ready", "held", "not_published", "stale", "unavailable"]);
const maxPublicRouteSteps = 500;
const maxPublicRouteLinePoints = 20_000;
const maxPublicRoutePoints = 50_000;
const ownerAccessSafeReason = "Public-road core is exact ODOT graph geometry; final dashed leg is owner-verified private lease access.";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * A successful HTTP response is not enough to make a status reusable. Require
 * the complete public decision surface before normalization, so a partial 200
 * cannot become a session-long held/unavailable answer and hide a later valid
 * route response.
 */
export function statusProjectionHasRequiredShape(value: unknown) {
  const row = object(value);
  const route = object(row.route);
  const graph = object(row.graph);
  const google = object(row.google);
  const destination = object(row.destination);
  const routeState = route.state ?? row.route_state;
  const routeSource = route.source ?? row.route_source;
  const graphState = graph.state ?? row.graph_state;
  const googleState = google.publicState ?? row.public_google_state;
  const destinationAvailable = destination.available ?? row.destination_available;

  if (!isEnumValue(routeState, routeStates)
      || !isEnumValue(routeSource, routeSources)
      || !isEnumValue(graphState, graphStates)
      || !isEnumValue(googleState, googleStates)
      || typeof destinationAvailable !== "boolean") {
    return false;
  }

  const destinationRole = nullableText(destination.role ?? row.destination_role);
  const parsedDestination = destinationAvailable
    && (destinationRole === "driver_entrance" || destinationRole === "saved_pad_destination")
    ? parseCoordinatePair(
      destination.latitude ?? row.destination_latitude,
      destination.longitude ?? row.destination_longitude,
      destinationRole,
    )
    : null;
  if (destinationAvailable && parsedDestination?.ok !== true) return false;

  if (routeState === "ready") {
    if ((routeSource !== "exact_graph" && routeSource !== "exact_graph_handoff" && routeSource !== "owner_verified_access")
        || !graphStateSupportsRoute(routeSource, graphState)) {
      return false;
    }
    if ((routeSource === "exact_graph_handoff" || routeSource === "owner_verified_access")
        && (parsedDestination?.ok !== true || parsedDestination.value.role !== "saved_pad_destination")) {
      return false;
    }
  }

  return googleState !== "ready" || routeState === "ready";
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

function isEnumValue<T extends string>(value: unknown, allowed: Set<T>): value is T {
  return typeof value === "string" && allowed.has(value as T);
}

function trustedNamedSavedDestination(pad: PadSummary) {
  if (pad.coordinate?.role === "saved_pad_destination") {
    const parsed = parseCoordinatePair(pad.coordinate.latitude, pad.coordinate.longitude, "saved_pad_destination");
    if (parsed.ok) return { latitude: parsed.value.latitude, longitude: parsed.value.longitude };
  }
  const trusted = trustedPadDestination(pad);
  return trusted && trusted.source !== "verified_driver_entrance"
    ? { latitude: trusted.latitude, longitude: trusted.longitude }
    : null;
}

export function graphStateSupportsRoute(
  source: DriverPadStatus["route"]["source"],
  state: DriverPadStatus["graph"]["state"],
) {
  return source === "exact_graph" && state === "active_current"
    || (source === "exact_graph_handoff" || source === "owner_verified_access") && state === "verified_release";
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
    loadProvenance: "fallback",
    route: {
      state: "unavailable",
      source: pad.coordinate ? "destination_only" : "none",
      geometry: null,
      safeReason: "No current public route status is available.",
      lastVerifiedAt: null,
      writtenDirections: null,
    },
    graph: { state: "unavailable", county: pad.county || null, publicSource: null, lastVerifiedAt: null },
    google: { publicState: "not_published", routeUrl: null, safeReason: "No exact Google handoff is available." },
    destination: {
      available: false,
      role: null,
      latitude: pad.coordinate?.latitude ?? null,
      longitude: pad.coordinate?.longitude ?? null,
    },
    routeSteps: [],
    namedApproaches: [],
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
      safeReason: "Offline device storage does not create a Google handoff.",
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

function normalizeStatus(
  row: Record<string, unknown>,
  pad: PadSummary,
  sourceState?: DirectorySourceState,
  ownerAccessRoute: DriverOwnerVerifiedAccessRoute | null = null,
): DriverPadStatus {
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
  const parsedDestination = destinationAvailable === true
    && (destinationRole === "driver_entrance" || destinationRole === "saved_pad_destination")
    ? parseCoordinatePair(
      destination.latitude ?? row.destination_latitude,
      destination.longitude ?? row.destination_longitude,
      destinationRole,
    )
    : null;
  const claimedRouteState = safeEnum(routeState, routeStates, base.route.state);
  const safeRouteSource = safeEnum(routeSource, routeSources, base.route.source);
  const safeGraphState = safeEnum(graphState, graphStates, base.graph.state);
  const graphAuthorityReady = graphStateSupportsRoute(safeRouteSource, safeGraphState);
  const exactProjection = claimedRouteState === "ready"
    && (safeRouteSource === "exact_graph" || safeRouteSource === "exact_graph_handoff")
    && graphAuthorityReady
    ? normalizeDriverRouteProjection(rawSteps, route.geometry ?? row.route_geometry)
    : claimedRouteState === "ready"
      && safeRouteSource === "owner_verified_access"
      && graphAuthorityReady
      && ownerAccessRoute
      ? { steps: ownerAccessRoute.steps, geometry: ownerAccessRoute.geometry }
    : null;
  const handoffDestinationReady = safeRouteSource !== "exact_graph_handoff" && safeRouteSource !== "owner_verified_access"
    || parsedDestination?.ok === true && parsedDestination.value.role === "saved_pad_destination";
  const exactResponseReady = claimedRouteState === "ready"
    && (safeRouteSource === "exact_graph" || safeRouteSource === "exact_graph_handoff" || safeRouteSource === "owner_verified_access")
    && graphAuthorityReady
    && exactProjection !== null
    && handoffDestinationReady;
  const safeRouteState = claimedRouteState === "ready" && !exactResponseReady ? "held" : claimedRouteState;
  const routeSafeReason = claimedRouteState === "ready" && !exactResponseReady
    ? "The approved route response failed exact public validation and cannot be used."
    : nullableText(route.safeReason ?? row.route_safe_reason);
  const steps = exactResponseReady ? exactProjection!.steps : [];
  const claimedGoogleState = safeEnum(googleState, googleStates, base.google.publicState);
  const safeGoogleState = claimedGoogleState === "ready" && !exactResponseReady ? "stale" : claimedGoogleState;
  return {
    ...base,
    dataState: "live",
    // Preserve the fail-closed held rendering for a claimed-ready response
    // whose steps/geometry do not validate, but do not let that malformed
    // decision become a completed authority check or enter either cache.
    loadProvenance: claimedRouteState === "ready" && !exactResponseReady ? "fallback" : "live_response",
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
      role: parsedDestination?.ok === true
        ? parsedDestination.value.role === "saved_pad_destination" ? "saved_pad_destination" : "driver_entrance"
        : null,
      latitude: parsedDestination?.ok === true ? parsedDestination.value.latitude : null,
      longitude: parsedDestination?.ok === true ? parsedDestination.value.longitude : null,
    },
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

const liveStatusRequests = new Map<string, Promise<DriverPadStatus | null>>();
const completedLiveStatusCache = new Map<string, DriverPadStatus>();
let completedLiveStatusCacheGeneration = 0;

type LiveStatusPadKey = Pick<PadSummary, "padId" | "recordRevision" | "coordinate" | "mapReference">;

function liveStatusKey(pad: LiveStatusPadKey, sourceState?: DirectorySourceState) {
  const destination = trustedNamedSavedDestination(pad as PadSummary);
  const destinationKey = destination
    ? `${destination.latitude},${destination.longitude}`
    : "destination-pending";
  return `${pad.padId}:${pad.recordRevision}:${sourceState || "unknown"}:${destinationKey}`;
}

export function completedPadStatusIsReusable(status: DriverPadStatus) {
  // A normalized live response is a completed check for this exact directory
  // revision even when its honest answer is held or not published. Settings
  // clears this session cache when the owner requests a fresh authority check.
  return status.loadProvenance === "live_response";
}

function completedPadStatusProvesReady(status: DriverPadStatus) {
  return Boolean(status.namedApproaches?.length)
    || status.route.state === "ready"
      && (status.route.source === "exact_graph" || status.route.source === "exact_graph_handoff" || status.route.source === "owner_verified_access")
      && graphStateSupportsRoute(status.route.source, status.graph.state)
      && status.routeSteps.length > 0
      && status.route.geometry !== null;
}

/**
 * A cache-only readiness hint for lightweight lists. A miss is deliberately
 * unknown, never held: only the full status boundary may prove a held state.
 */
export function hasCompletedReadyPadStatus(
  pad: LiveStatusPadKey,
  sourceState?: DirectorySourceState,
) {
  if (!deviceIsOnline()) return false;
  const status = completedLiveStatusCache.get(liveStatusKey(pad, sourceState));
  return Boolean(status && completedPadStatusIsReusable(status) && completedPadStatusProvesReady(status));
}

export function clearCompletedPadStatusCache() {
  completedLiveStatusCacheGeneration += 1;
  completedLiveStatusCache.clear();
  liveStatusRequests.clear();
}

function ownerAccessReleaseMatchesAtomicStatus(
  release: DriverOwnerVerifiedAccessRoute,
  rawRelease: Record<string, unknown>,
  row: Record<string, unknown>,
  pad: PadSummary,
) {
  const route = object(row.route);
  const graph = object(row.graph);
  const google = object(row.google);
  const destination = object(row.destination);
  const explicitSavedDestination = pad.coordinate?.role === "saved_pad_destination"
    ? parseCoordinatePair(pad.coordinate.latitude, pad.coordinate.longitude, "saved_pad_destination")
    : null;
  const statusRevision = nullableText(row.statusRevision ?? row.status_revision);
  const rawRouteSteps = route.steps ?? row.route_steps;
  const rawRouteGeometry = route.geometry ?? row.route_geometry;
  const rawReleaseDestination = object(rawRelease.destination);
  const destinationLatitude = finiteNumber(destination.latitude ?? row.destination_latitude);
  const destinationLongitude = finiteNumber(destination.longitude ?? row.destination_longitude);

  return route.state === "ready"
    && route.source === "owner_verified_access"
    && graph.state === "verified_release"
    && google.publicState === "ready"
    && nullableText(google.routeUrl ?? row.public_google_route_url) === null
    && nullableText(route.safeReason ?? row.route_safe_reason) === ownerAccessSafeReason
    && nullableText(route.lastVerifiedAt ?? row.route_last_verified_at) === release.lastVerifiedAt
    && statusRevision === release.statusRevision
    && destination.available === true
    && destination.role === "saved_pad_destination"
    && destinationLatitude === release.destination.latitude
    && destinationLongitude === release.destination.longitude
    && finiteNumber(rawReleaseDestination.latitude) === destinationLatitude
    && finiteNumber(rawReleaseDestination.longitude) === destinationLongitude
    && JSON.stringify(rawRelease.steps) === JSON.stringify(rawRouteSteps)
    && JSON.stringify(rawRelease.geometry) === JSON.stringify(rawRouteGeometry)
    // ODNR pad/wellhead references are deliberately different authority
    // roles. Only an explicit saved-pad destination may constrain this
    // owner-receipted destination.
    && (explicitSavedDestination?.ok !== true
      || explicitSavedDestination.value.latitude === release.destination.latitude
        && explicitSavedDestination.value.longitude === release.destination.longitude);
}

async function fetchLivePadStatus(pad: PadSummary, sourceState?: DirectorySourceState): Promise<DriverPadStatus | null> {
  if (!pad.canonicalId) return null;
  try {
    const url = `${supabaseUrl}/rest/v1/rpc/brinesearch_v18_driver_pad_status_with_owner_access`;
    const response = await fetch(url, {
      method: "POST",
      headers: { apikey: publishableKey, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ p_pad_id: pad.canonicalId }),
      cache: "no-store",
      // The atomic status + reviewed handoff RPC has a verified 20-second
      // database ceiling. Keep the browser deadline beyond that ceiling so
      // the client does not discard a valid response while Postgres is still
      // inside its bounded execution window.
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as unknown;
    const envelope = Array.isArray(payload) ? object(payload[0]) : object(payload);
    const atomicStatus = object(envelope.status);
    const row = Object.keys(atomicStatus).length ? atomicStatus : envelope;
    const returnedPadId = nullableText(row.padId ?? row.pad_id);
    if (returnedPadId !== pad.canonicalId) return null;
    const returnedRecordRevision = nullableText(row.recordRevision ?? row.record_revision);
    if (returnedRecordRevision !== pad.recordRevision) return null;
    if (!statusProjectionHasRequiredShape(row)) return null;
    const rawRoute = object(row.route);
    const rawOwnerAccess = envelope.ownerVerifiedAccessRoute ?? envelope.owner_verified_access_route;
    let ownerAccessRoute: DriverOwnerVerifiedAccessRoute | null = null;
    if (rawRoute.source === "owner_verified_access") {
      try {
        ownerAccessRoute = buildOwnerVerifiedAccessRoute(rawOwnerAccess);
        if (!ownerAccessReleaseMatchesAtomicStatus(ownerAccessRoute, object(rawOwnerAccess), row, pad)) {
          throw new Error("Owner-verified access release does not match the atomic status projection");
        }
      } catch {
        return normalizeStatus(row, pad, sourceState);
      }
    } else if (rawOwnerAccess !== null && rawOwnerAccess !== undefined) {
      return null;
    }
    let status = Object.keys(row).length ? normalizeStatus(row, pad, sourceState, ownerAccessRoute) : null;
    if (!status) return null;
    if (ownerAccessRoute) {
      if (status.route.state !== "ready" || status.google.publicState !== "ready") {
        return normalizeStatus(row, pad, sourceState);
      }
      return {
        ...status,
        namedApproaches: [],
        google: {
          publicState: "ready",
          routeUrl: ownerAccessRoute.navigationUrl,
          safeReason: "Current-location navigation uses all four frozen controls before the saved pad destination.",
        },
      };
    }
    try {
      const rawNamedApproaches = envelope.namedApproaches ?? envelope.named_approaches ?? [];
      const namedApproaches = buildNamedApproachReleaseSet(rawNamedApproaches);
      const trustedSavedDestination = trustedNamedSavedDestination(pad);
      const atomicStatusRevision = nullableText(row.statusRevision ?? row.status_revision);
      for (const approach of namedApproaches) {
        if (!atomicStatusRevision || approach.statusRevision !== atomicStatusRevision) {
          throw new Error("Named approach release does not match the atomic status revision");
        }
        if (approach.finalLegMode === "google_to_saved_gps_unapproved") {
          // The atomic server wrapper already binds every release to this
          // exact p_pad_id and status revision. Directory pad references load
          // asynchronously, so their absence must not discard that immutable
          // reviewed receipt. When a current reference is available, retain
          // the extra client-side equality check and key the request/cache by
          // that coordinate so enrichment cannot reuse a pre-reference result.
          if (trustedSavedDestination
              && (approach.destination.latitude !== trustedSavedDestination.latitude
              || approach.destination.longitude !== trustedSavedDestination.longitude)) {
            throw new Error("Named approach GPS destination does not match the current trusted pad reference");
          }
        } else if (status.destination.available !== true
            || status.destination.role !== "driver_entrance"
            || approach.destination.latitude !== status.destination.latitude
            || approach.destination.longitude !== status.destination.longitude) {
          throw new Error("Named full route does not end at the atomic verified driver entrance");
        }
      }
      status = { ...status, namedApproaches };
    } catch {
      status = { ...status, namedApproaches: [] };
    }
    if (status.google.publicState !== "ready") return status;
    try {
      const coreReleaseRow = envelope.coreDestinationRelease ?? envelope.core_destination_release;
      if (coreReleaseRow) {
        const plan = buildCoreDestinationReleasePlan(coreReleaseRow);
        const release = object(coreReleaseRow);
        const releaseDestination = object(release.destination);
        const statusRoute = object(row.route);
        const statusRevision = nullableText(row.statusRevision ?? row.status_revision);
        if (plan.padId !== pad.canonicalId || plan.recordRevision !== pad.recordRevision
            || plan.releaseDigest !== statusRevision
            || status.route.source !== "exact_graph_handoff"
            || status.destination.role !== "saved_pad_destination"
            || status.destination.latitude !== finiteNumber(releaseDestination.latitude)
            || status.destination.longitude !== finiteNumber(releaseDestination.longitude)
            || JSON.stringify(release.routeSteps) !== JSON.stringify(statusRoute.steps ?? row.route_steps)
            || JSON.stringify(release.routeGeometry) !== JSON.stringify(statusRoute.geometry ?? row.route_geometry)) {
          throw new Error("Core-destination release did not match the selected pad");
        }
        return {
          ...status,
          google: {
            ...status.google,
            routeUrl: plan.singleUrl,
            safeReason: "Reviewed navigation follows the exact approved road core, then uses the saved GPS as a destination-only final leg.",
          },
        };
      }
      const routeRow = envelope.publicGoogleRoute ?? envelope.public_google_route;
      const handoffRow = envelope.publicGoogleHandoff ?? envelope.public_google_handoff;
      const approvedRoutePlan = buildGoogleRoutePublicPlan(routeRow, handoffRow);
      if (approvedRoutePlan.padId !== pad.canonicalId) {
        throw new Error("Public Google handoff did not match the selected pad");
      }
      if (!approvedRoutePlan.singleUrl) {
        return {
          ...status,
          google: {
            publicState: "unavailable",
            routeUrl: null,
            safeReason: "No single exact Google handoff is available. Use the BrineSearch map and approved steps.",
          },
        };
      }
      return {
        ...status,
        google: {
          ...status.google,
          routeUrl: approvedRoutePlan.singleUrl,
          safeReason: approvedRoutePlan.handoffMode === "verified_compact"
            ? "Reviewed mobile controls are bound to this unchanged exact BrineSearch route."
            : status.google.safeReason,
        },
      };
    } catch {
      return {
        ...status,
        google: {
          publicState: "stale",
          routeUrl: null,
          safeReason: "The public route failed its exact manifest validation and cannot be launched.",
        },
      };
    }
  } catch {
    return null;
  }
}

function loadLivePadStatus(pad: PadSummary, sourceState?: DirectorySourceState) {
  const key = liveStatusKey(pad, sourceState);
  const existing = liveStatusRequests.get(key);
  if (existing) return existing;
  const request = fetchLivePadStatus(pad, sourceState).finally(() => {
    if (liveStatusRequests.get(key) === request) liveStatusRequests.delete(key);
  });
  liveStatusRequests.set(key, request);
  return request;
}

export async function loadPadStatus(pad: PadSummary, sourceState?: DirectorySourceState): Promise<DriverPadStatus> {
  if (!pad.canonicalId) return fallbackStatus(pad, sourceState);
  if (!deviceIsOnline()) {
    return await readPadDirectionsOffline(pad) || offlineCacheMissStatus(pad, sourceState);
  }

  const key = liveStatusKey(pad, sourceState);
  const completed = completedLiveStatusCache.get(key);
  if (completed) return { ...completed, loadProvenance: "session_cache" };
  const cacheGeneration = completedLiveStatusCacheGeneration;
  const live = await loadLivePadStatus(pad, sourceState);
  if (live) {
    const reusable = completedPadStatusIsReusable(live);
    if (cacheGeneration === completedLiveStatusCacheGeneration && reusable) {
      completedLiveStatusCache.set(key, live);
    }
    if (reusable) void savePadDirectionsOffline(pad, live);
    return live;
  }
  return await readPadDirectionsOffline(pad) || {
    ...fallbackStatus(pad, sourceState),
    dataState: "fallback",
    loadProvenance: "fallback",
  };
}
