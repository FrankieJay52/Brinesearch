import { isInsideCoordinateServiceArea } from "./coordinates";

const maxWaypoints = 3;
const maxUrlLength = 2048;
const pointKinds = new Set(["junction", "shared_entry", "shared_exit", "shape", "pad_destination"]);

type UnknownRecord = Record<string, unknown>;

export interface GoogleRoutePlan {
  padId: string;
  routeRevision: number;
  manifestDigest: string;
  dependencyDigest: string;
  pointCount: number;
  handoffMode: "full_manifest" | "verified_compact" | "none";
  singleUrl: string | null;
}

function record(value: unknown, message: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as UnknownRecord;
}

function identifier(value: unknown, field: string) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`Google route ${field} is missing`);
  return result;
}

function revision(value: unknown, field: string) {
  const text = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(text)) throw new Error(`Google route ${field} must be a positive integer`);
  const result = Number(text);
  if (!Number.isSafeInteger(result)) throw new Error(`Google route ${field} exceeds the safe integer range`);
  return result;
}

function digest(value: unknown, field: string) {
  const result = String(value ?? "").trim().toLowerCase();
  if (!/^(?:[0-9a-f]{32}|[0-9a-f]{64})$/.test(result)) throw new Error(`Google route ${field} is missing its authoritative digest`);
  return result;
}

function coordinateValue(value: unknown, minimum: number, maximum: number, field: string) {
  const text = String(value ?? "").trim();
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(text)) throw new Error(`Google route ${field} must be a decimal coordinate`);
  const number = Number(text);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`Google route ${field} is outside the valid coordinate range`);
  return Object.is(number, -0) ? "0" : text;
}

function coordinate(point: UnknownRecord) {
  const latitude = coordinateValue(point.latitude, -90, 90, "latitude");
  const longitude = coordinateValue(point.longitude, -180, 180, "longitude");
  if (Number(latitude) === 0 && Number(longitude) === 0) throw new Error("Google route coordinate cannot use the zero origin");
  if (!isInsideCoordinateServiceArea(Number(latitude), Number(longitude))) throw new Error("Google route coordinate is outside the BrineSearch service area");
  return `${latitude},${longitude}`;
}

function validatePoint(value: unknown, index: number, total: number) {
  const point = record(value, `Google route point ${index + 1} is invalid`);
  const sequence = Number(point.sequence);
  if (!Number.isInteger(sequence) || sequence !== index + 1) throw new Error("Google route point order is not contiguous");
  const kind = String(point.kind || "");
  if (!pointKinds.has(kind)) throw new Error(`Google route point ${sequence} has an unsupported role`);
  coordinate(point);

  if (kind === "pad_destination") {
    if (index !== total - 1 || point.source_kind !== "saved_pad_gps" || !point.pad_id) throw new Error("Google route must end at the exact saved pad GPS receipt");
  } else if (index === total - 1) {
    throw new Error("Google route is missing its final pad destination");
  }
  if (["junction", "shared_entry", "shared_exit"].includes(kind)) {
    if (point.source_kind !== "authoritative_junction_anchor" || !point.anchor_id || !point.junction_id || !point.graph_build_id) {
      throw new Error(`Google route ${kind} point is missing graph provenance`);
    }
    digest(point.graph_digest, "graph digest");
    digest(point.anchor_digest, "anchor digest");
  }
  if (kind === "shape") {
    const keys = point.source_segment_keys;
    if (point.source_kind !== "authoritative_clipped_geometry" || !point.occurrence_id || !Array.isArray(keys) || !keys.length || keys.some((key) => typeof key !== "string" || !key.trim()) || new Set(keys).size !== keys.length) {
      throw new Error("Google route shape point is not tied to clipped authoritative geometry");
    }
    digest(point.source_digest, "shape source digest");
  }
  return point;
}

export function validateGoogleRouteManifest(value: unknown) {
  const manifest = record(value, "Google route manifest is invalid");
  if (manifest.route_ready !== true || manifest.status !== "ready") throw new Error("Google route manifest is not route-ready");
  if (String(manifest.manifest_version || "") !== "issue97-google-v1") throw new Error("Google route manifest version is unsupported");
  const padId = identifier(manifest.pad_id, "manifest pad ID");
  revision(manifest.route_revision, "manifest route revision");
  digest(manifest.manifest_digest, "manifest digest");
  digest(manifest.dependency_digest, "dependency digest");
  const rawPoints = Array.isArray(manifest.points) ? manifest.points : [];
  if (rawPoints.length < 2) throw new Error("Google route manifest requires a source-proven route ingress and pad destination");
  const points = rawPoints.map((point, index) => validatePoint(point, index, rawPoints.length));
  const ingress = points[0];
  if (ingress.kind !== "shape" || ingress.shape_role !== "route_ingress") throw new Error("Google route must start with a source-proven route ingress");
  if (points.slice(1).some((point) => point.shape_role === "route_ingress")) throw new Error("Google route may contain only one route ingress at the first control point");
  if (identifier(points.at(-1)?.pad_id, "destination pad ID") !== padId) throw new Error("Google route destination pad does not match its manifest");

  let openSharedJunction: unknown = null;
  for (const point of points) {
    if (point.kind === "shared_entry") {
      if (openSharedJunction) throw new Error("Google route shared segment entry is nested");
      openSharedJunction = point.junction_id;
    } else if (point.kind === "shared_exit") {
      if (!openSharedJunction || openSharedJunction !== point.junction_id) throw new Error("Google route shared exit is missing its ordered entry anchor");
      openSharedJunction = null;
    } else if (openSharedJunction && point.kind !== "shape") {
      throw new Error("Google route shared section may contain only source-derived shaping points");
    }
  }
  if (openSharedJunction) throw new Error("Google route shared segment is missing its exit anchor");
  return { manifest, points, padId };
}

function onlyKeys(value: UnknownRecord, keys: string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value);
}

function compactSequence(value: unknown, field: string) {
  return revision(value, `handoff ${field}`);
}

function validateVerifiedCompactHandoff(value: unknown, manifest: UnknownRecord, points: UnknownRecord[], padId: string) {
  const row = record(value, "Google handoff public row is invalid");
  const handoff = record(row.handoff, "Google handoff package is invalid");
  const routeRevision = revision(manifest.route_revision, "manifest route revision");
  const manifestDigest = digest(manifest.manifest_digest, "manifest digest");
  const dependencyDigest = digest(manifest.dependency_digest, "dependency digest");

  if (identifier(row.pad_id, "handoff row pad ID") !== padId) throw new Error("Google handoff row pad does not match its manifest");
  if (revision(row.route_revision, "handoff row route revision") !== routeRevision) throw new Error("Google handoff row revision does not match its manifest");
  if (digest(row.source_manifest_digest, "handoff source manifest digest") !== manifestDigest) throw new Error("Google handoff row manifest digest does not match its route");
  if (digest(row.source_dependency_digest, "handoff source dependency digest") !== dependencyDigest) throw new Error("Google handoff row dependency digest does not match its route");
  if (String(row.handoff_version || "") !== "v18-google-mobile-v1") throw new Error("Google handoff version is unsupported");
  digest(row.handoff_digest, "handoff digest");

  if (!onlyKeys(handoff, [
    "handoff_version", "pad_id", "route_revision", "source_manifest_digest",
    "source_dependency_digest", "origin_mode", "mobile_waypoint_limit",
    "waypoints", "destination",
  ])) throw new Error("Google handoff package contains an unsupported field");
  if (handoff.handoff_version !== row.handoff_version
      || identifier(handoff.pad_id, "handoff pad ID") !== padId
      || revision(handoff.route_revision, "handoff route revision") !== routeRevision
      || digest(handoff.source_manifest_digest, "handoff manifest digest") !== manifestDigest
      || digest(handoff.source_dependency_digest, "handoff dependency digest") !== dependencyDigest
      || handoff.origin_mode !== "current_location_until_route_ingress"
      || handoff.mobile_waypoint_limit !== maxWaypoints) {
    throw new Error("Google handoff package is not bound to the exact public route");
  }

  const rawWaypoints = Array.isArray(handoff.waypoints) ? handoff.waypoints : [];
  if (rawWaypoints.length < 1 || rawWaypoints.length > maxWaypoints) throw new Error("Google handoff must contain one to three reviewed waypoints");
  let previousSequence = 0;
  const waypoints = rawWaypoints.map((value, index) => {
    const waypoint = record(value, `Google handoff waypoint ${index + 1} is invalid`);
    if (!onlyKeys(waypoint, ["sequence", "latitude", "longitude"])) throw new Error("Google handoff waypoint exposes unsupported data");
    const sequence = compactSequence(waypoint.sequence, "waypoint sequence");
    if (sequence <= previousSequence || sequence >= points.length) throw new Error("Google handoff waypoint order is invalid");
    const sourcePoint = points[sequence - 1];
    if (!sourcePoint || Number(sourcePoint.sequence) !== sequence || coordinate(waypoint) !== coordinate(sourcePoint)) {
      throw new Error("Google handoff waypoint is not copied from the exact manifest");
    }
    if (index === 0 && (sequence !== 1 || sourcePoint.kind !== "shape" || sourcePoint.shape_role !== "route_ingress")) {
      throw new Error("Google handoff must begin at the exact route ingress");
    }
    previousSequence = sequence;
    return coordinate(sourcePoint);
  });

  const rawDestination = record(handoff.destination, "Google handoff destination is invalid");
  if (!onlyKeys(rawDestination, ["sequence", "latitude", "longitude", "pad_id"])) throw new Error("Google handoff destination exposes unsupported data");
  const destinationSequence = compactSequence(rawDestination.sequence, "destination sequence");
  const sourceDestination = points.at(-1)!;
  if (destinationSequence !== points.length
      || destinationSequence <= previousSequence
      || sourceDestination.kind !== "pad_destination"
      || identifier(rawDestination.pad_id, "handoff destination pad ID") !== padId
      || coordinate(rawDestination) !== coordinate(sourceDestination)) {
    throw new Error("Google handoff destination is not the exact saved pad destination");
  }
  return { waypoints, destination: coordinate(sourceDestination) };
}

export function validateGoogleRoutePublicRow(value: unknown) {
  const row = record(value, "Google route public row is invalid");
  const validated = validateGoogleRouteManifest(row.manifest);
  const rowPadId = identifier(row.pad_id, "public row pad ID");
  if (rowPadId !== validated.padId) throw new Error("Google route public row pad does not match its manifest");
  if (revision(row.route_revision, "public row route revision") !== revision(validated.manifest.route_revision, "manifest route revision")) {
    throw new Error("Google route public row revision does not match its manifest");
  }
  return validated.manifest;
}

function routeUrl(destination: string, waypoints: string[]) {
  const parameters = new URLSearchParams({ api: "1", travelmode: "driving", dir_action: "navigate" });
  parameters.set("destination", destination);
  if (waypoints.length) parameters.set("waypoints", waypoints.join("|"));
  const url = `https://www.google.com/maps/dir/?${parameters.toString()}`;
  if (url.length > maxUrlLength) throw new Error("Google route exceeds the 2,048-character Maps URL limit");
  return url;
}

export function buildGoogleRoutePublicPlan(value: unknown, handoffValue: unknown = null): GoogleRoutePlan {
  const manifest = validateGoogleRoutePublicRow(value);
  const { points, padId } = validateGoogleRouteManifest(manifest);
  const mobileSafe = points.length <= maxWaypoints + 1;
  const manifestDigest = digest(manifest.manifest_digest, "manifest digest");
  const dependencyDigest = digest(manifest.dependency_digest, "dependency digest");
  const compact = !mobileSafe && handoffValue
    ? validateVerifiedCompactHandoff(handoffValue, manifest, points, padId)
    : null;
  const destination = compact?.destination ?? coordinate(points.at(-1)!);
  const waypoints = compact?.waypoints ?? points.slice(0, -1).map(coordinate);
  return {
    padId,
    routeRevision: revision(manifest.route_revision, "manifest route revision"),
    manifestDigest,
    dependencyDigest,
    pointCount: points.length,
    handoffMode: mobileSafe ? "full_manifest" : compact ? "verified_compact" : "none",
    singleUrl: mobileSafe || compact ? routeUrl(destination, waypoints) : null,
  };
}
