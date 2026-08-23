import { isInsideCoordinateServiceArea } from "./coordinates";

const maxWaypoints = 3;
const maxUrlLength = 2048;
const pointKinds = new Set(["junction", "shared_entry", "shared_exit", "shape", "pad_destination"]);

type UnknownRecord = Record<string, unknown>;

export interface GoogleRouteChunk {
  chunk: number;
  origin: string | null;
  destination: string;
  waypoints: string[];
  pointSequences: number[];
  url: string;
}

export interface GoogleRoutePlan {
  padId: string;
  routeRevision: number;
  manifestDigest: string;
  chunks: GoogleRouteChunk[];
  firstUrl: string;
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

function chunkUrl(origin: string | null, destination: string, waypoints: string[]) {
  const parameters = new URLSearchParams({ api: "1", travelmode: "driving", dir_action: "navigate" });
  if (origin) parameters.set("origin", origin);
  parameters.set("destination", destination);
  if (waypoints.length) parameters.set("waypoints", waypoints.join("|"));
  const url = `https://www.google.com/maps/dir/?${parameters.toString()}`;
  if (url.length > maxUrlLength) throw new Error("Google route chunk exceeds the 2,048-character Maps URL limit");
  return url;
}

export function buildGoogleRoutePublicPlan(value: unknown): GoogleRoutePlan {
  const manifest = validateGoogleRoutePublicRow(value);
  const { points, padId } = validateGoogleRouteManifest(manifest);
  const chunks: GoogleRouteChunk[] = [];
  let consumed = 0;
  let previousDestination: UnknownRecord | null = null;
  while (consumed < points.length) {
    const selected = points.slice(consumed, consumed + maxWaypoints + 1);
    const destinationPoint = selected.at(-1)!;
    const origin = previousDestination ? coordinate(previousDestination) : null;
    const destination = coordinate(destinationPoint);
    const waypoints = selected.slice(0, -1).map(coordinate);
    chunks.push({
      chunk: chunks.length + 1,
      origin,
      destination,
      waypoints,
      pointSequences: selected.map((point) => Number(point.sequence)),
      url: chunkUrl(origin, destination, waypoints),
    });
    previousDestination = destinationPoint;
    consumed += selected.length;
  }
  return {
    padId,
    routeRevision: revision(manifest.route_revision, "manifest route revision"),
    manifestDigest: digest(manifest.manifest_digest, "manifest digest"),
    chunks,
    firstUrl: chunks[0]?.url || "",
  };
}
