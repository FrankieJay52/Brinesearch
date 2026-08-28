import { isInsideCoordinateServiceArea } from "./coordinates";
import type { DriverNamedApproach, DriverOwnerVerifiedAccessRoute, DriverRouteGeometry, DriverRouteStep } from "./types";

const maxWaypoints = 3;
const maxUrlLength = 2048;
const pointKinds = new Set(["junction", "shared_entry", "shared_exit", "shape", "pad_destination"]);

export const ownerVerifiedAccessLabel = "Owner-verified lease access — not ODOT road geometry";

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

export interface ReleasedGoogleHandoffPlan extends GoogleRoutePlan {
  handoffDigest: string;
  publishedAt: string;
}

export interface CoreDestinationReleasePlan {
  padId: string;
  recordRevision: string;
  routeRevision: number;
  dependencyDigest: string;
  releaseDigest: string;
  publishedAt: string;
  singleUrl: string;
}

const namedApproachKeys = [
  "approachKey", "approachLabel", "routeGroup", "variantIndex",
  "releaseVersion", "routeRevision", "steps", "geometry", "ingress",
  "coreEnd", "destination", "finalLegMode", "handoff", "lastVerifiedAt",
  "statusRevision", "releaseDigest", "publishedAt",
];
const namedStepKinds = new Set<DriverRouteStep["kind"]>(["turn", "continue", "name_change", "shared_begin", "shared_end"]);
const namedRevisionPattern = /^[0-9a-f]{32,64}$/;
const namedApproachKeyPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ownerAccessReleaseKeys = [
  "releaseId", "releaseVersion", "routeRevision", "publicCoreStepCount",
  "steps", "geometry", "ingress", "privateAccessStart", "destination",
  "finalLegMode", "handoff", "lastVerifiedAt", "statusRevision",
  "releaseDigest", "publishedAt",
];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

type RouteCoordinate = [number, number];

function routeCoordinate(value: unknown, field: string): RouteCoordinate {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`Core-destination ${field} is not an exact coordinate`);
  const longitude = Number(coordinateValue(value[0], -180, 180, `${field} longitude`));
  const latitude = Number(coordinateValue(value[1], -90, 90, `${field} latitude`));
  if (!isInsideCoordinateServiceArea(latitude, longitude)) throw new Error(`Core-destination ${field} is outside the BrineSearch service area`);
  return [longitude, latitude];
}

function pointCoordinate(value: UnknownRecord): RouteCoordinate {
  return [
    Number(coordinateValue(value.longitude, -180, 180, "longitude")),
    Number(coordinateValue(value.latitude, -90, 90, "latitude")),
  ];
}

function sameRouteCoordinate(left: RouteCoordinate, right: RouteCoordinate) {
  // Public GeoJSON is intentionally rounded to seven decimal places. This
  // tolerance is below a foot in the V18 service area and only permits that
  // serialization difference; it is never used to select a road.
  return Math.abs(left[0] - right[0]) <= 0.000001
    && Math.abs(left[1] - right[1]) <= 0.000001;
}

function sameExactRouteCoordinate(left: RouteCoordinate, right: RouteCoordinate) {
  return left[0] === right[0] && left[1] === right[1];
}

function namedTimestamp(value: unknown, field: string) {
  const result = String(value ?? "").trim();
  if (!result || Number.isNaN(Date.parse(result))) throw new Error(`Named approach ${field} is invalid`);
  return result;
}

function namedRevision(value: unknown, field: string) {
  const result = String(value ?? "").trim().toLowerCase();
  if (!namedRevisionPattern.test(result)) throw new Error(`Named approach ${field} is invalid`);
  return result;
}

function namedReleaseDigest(value: unknown) {
  const result = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(result)) throw new Error("Named approach release digest is invalid");
  return result;
}

function namedLabel(value: unknown, field: string) {
  const result = String(value ?? "").trim();
  if (!result || result.length > 100) throw new Error(`Named approach ${field} is invalid`);
  return result;
}

function namedSteps(value: unknown): DriverRouteStep[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) {
    throw new Error("Named approach approved steps are missing");
  }
  return value.map((rawStep, index) => {
    const step = record(rawStep, `Named approach step ${index + 1} is invalid`);
    if (!onlyKeys(step, ["order", "kind", "displayName", "verifiedDesignations", "instruction", "distanceMiles"])) {
      throw new Error("Named approach step exposes unsupported data");
    }
    const order = step.order;
    const kind = String(step.kind || "") as DriverRouteStep["kind"];
    if (typeof step.displayName !== "string" || typeof step.instruction !== "string") {
      throw new Error("Named approach step labels must be exact public strings");
    }
    const displayName = namedLabel(step.displayName, `step ${index + 1} road name`);
    const instruction = namedLabel(step.instruction, `step ${index + 1} instruction`);
    const designations = step.verifiedDesignations;
    const normalizedDesignations = Array.isArray(designations)
      ? designations.map((designation) => typeof designation === "string" ? designation.trim() : "")
      : [];
    const rawMiles = step.distanceMiles;
    const distanceMiles = rawMiles === null ? null : rawMiles;
    if (!Number.isInteger(order) || order !== index + 1 || !namedStepKinds.has(kind)
        || !Array.isArray(designations)
        || designations.some((designation) => typeof designation !== "string" || !designation.trim())
        || new Set(normalizedDesignations).size !== normalizedDesignations.length
        || distanceMiles !== null && (typeof distanceMiles !== "number" || !Number.isFinite(distanceMiles) || distanceMiles < 0)) {
      throw new Error("Named approach steps are not an exact ordered public projection");
    }
    return {
      order: order as number,
      kind,
      displayName,
      verifiedDesignations: normalizedDesignations,
      instruction,
      distanceMiles: distanceMiles as number | null,
    };
  });
}

interface NamedGeometryProjection {
  geometry: DriverRouteGeometry;
  milestones: RouteCoordinate[];
  vertices: RouteCoordinate[];
}

function namedGeometry(value: unknown, steps: DriverRouteStep[]): NamedGeometryProjection {
  const collection = record(value, "Named approach geometry is invalid");
  if (!onlyKeys(collection, ["type", "features"])
      || collection.type !== "FeatureCollection"
      || !Array.isArray(collection.features)
      || collection.features.length !== steps.length) {
    throw new Error("Named approach geometry is not aligned with its approved steps");
  }
  const features: DriverRouteGeometry["features"] = [];
  const milestones: RouteCoordinate[] = [];
  const vertices: RouteCoordinate[] = [];
  let priorEnd: RouteCoordinate | null = null;
  for (const [featureIndex, rawFeature] of collection.features.entries()) {
    const feature = record(rawFeature, `Named approach feature ${featureIndex + 1} is invalid`);
    const properties = record(feature.properties, `Named approach feature ${featureIndex + 1} properties are invalid`);
    const geometry = record(feature.geometry, `Named approach feature ${featureIndex + 1} geometry is invalid`);
    if (!onlyKeys(feature, ["type", "properties", "geometry"])
        || feature.type !== "Feature"
        || !onlyKeys(properties, ["stepOrder"])
        || !Number.isInteger(properties.stepOrder) || properties.stepOrder !== featureIndex + 1
        || (geometry.type !== "LineString" && geometry.type !== "MultiLineString")) {
      throw new Error("Named approach geometry is not an exact ordered public projection");
    }
    const rawLines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
    if (!Array.isArray(rawLines) || !rawLines.length) throw new Error("Named approach geometry contains an empty road line");
    const lines: RouteCoordinate[][] = [];
    let featurePriorEnd: RouteCoordinate | null = null;
    for (const [lineIndex, rawLine] of rawLines.entries()) {
      if (!Array.isArray(rawLine) || rawLine.length < 2 || rawLine.length > 20_000) {
        throw new Error("Named approach geometry contains an invalid road line");
      }
      const line = rawLine.map((point, pointIndex) => {
        if (!Array.isArray(point) || point.some((coordinatePart) => typeof coordinatePart !== "number")) {
          throw new Error("Named approach geometry coordinates must be exact JSON numbers");
        }
        return routeCoordinate(point, `feature ${featureIndex + 1} line ${lineIndex + 1} point ${pointIndex + 1}`);
      });
      if (featurePriorEnd && !sameRouteCoordinate(featurePriorEnd, line[0])) {
        throw new Error("Named approach multipart geometry is not continuous");
      }
      featurePriorEnd = line.at(-1)!;
      lines.push(line);
    }
    const featureStart = lines[0][0];
    const featureEnd = lines.at(-1)!.at(-1)!;
    if (priorEnd && !sameRouteCoordinate(priorEnd, featureStart)) {
      throw new Error("Named approach approved geometry is not continuous");
    }
    if (!milestones.length) milestones.push(featureStart);
    milestones.push(featureEnd);
    for (const line of lines) {
      for (const point of line) {
        if (!vertices.length || !sameRouteCoordinate(vertices.at(-1)!, point)) vertices.push(point);
      }
    }
    priorEnd = featureEnd;
    features.push({
      type: "Feature",
      properties: { stepOrder: featureIndex + 1 },
      geometry: geometry.type === "LineString"
        ? { type: "LineString", coordinates: lines[0] }
        : { type: "MultiLineString", coordinates: lines },
    });
  }
  if (vertices.length > 50_000) throw new Error("Named approach geometry exceeds the public point limit");
  return { geometry: { type: "FeatureCollection", features }, milestones, vertices };
}

interface OwnerAccessGeometryProjection {
  geometry: DriverRouteGeometry;
  milestones: RouteCoordinate[];
  publicCoreVertices: RouteCoordinate[];
}

function ownerAccessGeometry(value: unknown, steps: DriverRouteStep[]): OwnerAccessGeometryProjection {
  const collection = record(value, "Owner-verified access geometry is invalid");
  if (!onlyKeys(collection, ["type", "features"])
      || collection.type !== "FeatureCollection"
      || !Array.isArray(collection.features)
      || collection.features.length !== 7
      || steps.length !== 7) {
    throw new Error("Owner-verified access geometry must contain exactly seven ordered features and steps");
  }

  const features: DriverRouteGeometry["features"] = [];
  const milestones: RouteCoordinate[] = [];
  const publicCoreVertices: RouteCoordinate[] = [];
  let priorEnd: RouteCoordinate | null = null;
  let pointCount = 0;
  for (const [featureIndex, rawFeature] of collection.features.entries()) {
    const feature = record(rawFeature, `Owner-verified access feature ${featureIndex + 1} is invalid`);
    const properties = record(feature.properties, `Owner-verified access feature ${featureIndex + 1} properties are invalid`);
    const geometry = record(feature.geometry, `Owner-verified access feature ${featureIndex + 1} geometry is invalid`);
    const authority = featureIndex < 6 ? "exact_graph" : "owner_verified_access";
    if (!onlyKeys(feature, ["type", "properties", "geometry"])
        || feature.type !== "Feature"
        || !onlyKeys(properties, ["stepOrder", "authority", "label"])
        || properties.stepOrder !== featureIndex + 1
        || properties.authority !== authority
        || typeof properties.label !== "string"
        || !properties.label.trim()
        || properties.label.length > 100
        || featureIndex === 6 && properties.label !== ownerVerifiedAccessLabel
        || (geometry.type !== "LineString" && geometry.type !== "MultiLineString")) {
      throw new Error("Owner-verified access feature authority or label is invalid");
    }

    const rawLines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
    if (!Array.isArray(rawLines) || !rawLines.length) throw new Error("Owner-verified access geometry contains an empty line");
    const lines: RouteCoordinate[][] = [];
    let featurePriorEnd: RouteCoordinate | null = null;
    for (const [lineIndex, rawLine] of rawLines.entries()) {
      if (!Array.isArray(rawLine) || rawLine.length < 2 || rawLine.length > 20_000) {
        throw new Error("Owner-verified access geometry contains an invalid line");
      }
      const line = rawLine.map((point, pointIndex) => {
        if (!Array.isArray(point) || point.some((coordinatePart) => typeof coordinatePart !== "number")) {
          throw new Error("Owner-verified access coordinates must be exact JSON numbers");
        }
        return routeCoordinate(point, `owner feature ${featureIndex + 1} line ${lineIndex + 1} point ${pointIndex + 1}`);
      });
      pointCount += line.length;
      if (pointCount > 50_000) throw new Error("Owner-verified access geometry exceeds the public point limit");
      if (featurePriorEnd && !sameExactRouteCoordinate(featurePriorEnd, line[0])) {
        throw new Error("Owner-verified access multipart geometry is not exactly continuous");
      }
      featurePriorEnd = line.at(-1)!;
      lines.push(line);
    }

    const featureStart = lines[0][0];
    const featureEnd = lines.at(-1)!.at(-1)!;
    if (priorEnd && !sameExactRouteCoordinate(priorEnd, featureStart)) {
      throw new Error("Owner-verified access geometry is not exactly continuous");
    }
    if (!milestones.length) milestones.push(featureStart);
    milestones.push(featureEnd);
    if (featureIndex < 6) {
      for (const line of lines) {
        for (const point of line) {
          if (!publicCoreVertices.length || !sameExactRouteCoordinate(publicCoreVertices.at(-1)!, point)) {
            publicCoreVertices.push(point);
          }
        }
      }
    }
    priorEnd = featureEnd;
    features.push({
      type: "Feature",
      properties: {
        stepOrder: featureIndex + 1,
        authority,
        label: properties.label,
      },
      geometry: geometry.type === "LineString"
        ? { type: "LineString", coordinates: lines[0] }
        : { type: "MultiLineString", coordinates: lines },
    });
  }
  return { geometry: { type: "FeatureCollection", features }, milestones, publicCoreVertices };
}

function exactCoreRouteLines(value: unknown, steps: unknown[], releaseVersion: string) {
  const collection = record(value, "Core-destination route geometry is invalid");
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error("Core-destination route geometry must be a feature collection");
  }
  const featureCount = collection.features.length;
  if (releaseVersion === "v18-core-destination-v1" && (featureCount !== 2 || steps.length !== 2)) {
    throw new Error("Core-destination v1 requires exactly two approved road features and two steps");
  }
  if (releaseVersion === "v18-core-destination-v2" && (featureCount !== 1 || steps.length !== 1)) {
    throw new Error("Core-destination v2 requires exactly one approved road feature and one step");
  }
  return collection.features.map((rawFeature, index) => {
    const feature = record(rawFeature, `Core-destination route feature ${index + 1} is invalid`);
    const properties = record(feature.properties, `Core-destination route feature ${index + 1} properties are invalid`);
    const geometry = record(feature.geometry, `Core-destination route feature ${index + 1} geometry is invalid`);
    const step = record(steps[index], `Core-destination route step ${index + 1} is invalid`);
    if (feature.type !== "Feature" || Number(properties.stepOrder) !== index + 1
        || Number(step.order) !== index + 1 || geometry.type !== "LineString"
        || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
      throw new Error("Core-destination route geometry is not ordered with its approved steps");
    }
    return (geometry.coordinates as unknown[]).map((point, pointIndex) => routeCoordinate(
      point,
      `feature ${index + 1} point ${pointIndex + 1}`,
    ));
  });
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

export function buildReleasedGoogleHandoffPlan(value: unknown): ReleasedGoogleHandoffPlan {
  const row = record(value, "Released Google handoff is invalid");
  if (!onlyKeys(row, [
    "padId", "routeRevision", "sourceManifestDigest", "sourceDependencyDigest",
    "handoffVersion", "handoff", "handoffDigest", "publishedAt",
  ])) throw new Error("Released Google handoff exposes unsupported data");

  const padId = identifier(row.padId, "released handoff pad ID");
  const routeRevision = revision(row.routeRevision, "released handoff route revision");
  const manifestDigest = digest(row.sourceManifestDigest, "released handoff manifest digest");
  const dependencyDigest = digest(row.sourceDependencyDigest, "released handoff dependency digest");
  const handoffDigest = digest(row.handoffDigest, "released handoff digest");
  const publishedAt = String(row.publishedAt || "");
  if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) throw new Error("Released Google handoff publication time is invalid");
  if (row.handoffVersion !== "v18-google-mobile-v1") throw new Error("Released Google handoff version is unsupported");

  const handoff = record(row.handoff, "Released Google handoff package is invalid");
  if (!onlyKeys(handoff, [
    "handoff_version", "pad_id", "route_revision", "source_manifest_digest",
    "source_dependency_digest", "origin_mode", "mobile_waypoint_limit",
    "waypoints", "destination",
  ])) throw new Error("Released Google handoff package exposes unsupported data");
  if (handoff.handoff_version !== row.handoffVersion
      || identifier(handoff.pad_id, "released package pad ID") !== padId
      || revision(handoff.route_revision, "released package route revision") !== routeRevision
      || digest(handoff.source_manifest_digest, "released package manifest digest") !== manifestDigest
      || digest(handoff.source_dependency_digest, "released package dependency digest") !== dependencyDigest
      || handoff.origin_mode !== "current_location_until_route_ingress"
      || handoff.mobile_waypoint_limit !== maxWaypoints) {
    throw new Error("Released Google handoff package is not bound to its reviewed receipt");
  }

  const rawWaypoints = Array.isArray(handoff.waypoints) ? handoff.waypoints : [];
  if (rawWaypoints.length < 1 || rawWaypoints.length > maxWaypoints) throw new Error("Released Google handoff must contain one to three reviewed waypoints");
  let previousSequence = 0;
  const waypoints = rawWaypoints.map((value, index) => {
    const waypoint = record(value, `Released Google handoff waypoint ${index + 1} is invalid`);
    if (!onlyKeys(waypoint, ["sequence", "latitude", "longitude"])) throw new Error("Released Google handoff waypoint exposes unsupported data");
    const sequence = compactSequence(waypoint.sequence, "released waypoint sequence");
    if (sequence <= previousSequence || index === 0 && sequence !== 1) throw new Error("Released Google handoff waypoint order is invalid");
    previousSequence = sequence;
    return coordinate(waypoint);
  });

  const destinationValue = record(handoff.destination, "Released Google handoff destination is invalid");
  if (!onlyKeys(destinationValue, ["sequence", "latitude", "longitude", "pad_id"])) throw new Error("Released Google handoff destination exposes unsupported data");
  const destinationSequence = compactSequence(destinationValue.sequence, "released destination sequence");
  if (destinationSequence <= previousSequence || identifier(destinationValue.pad_id, "released destination pad ID") !== padId) {
    throw new Error("Released Google handoff destination is not bound to its pad");
  }
  const destination = coordinate(destinationValue);

  return {
    padId,
    routeRevision,
    manifestDigest,
    dependencyDigest,
    pointCount: destinationSequence,
    handoffMode: "verified_compact",
    singleUrl: routeUrl(destination, waypoints),
    handoffDigest,
    publishedAt,
  };
}

/**
 * Validate the deliberately separate exact-road-core + saved-GPS contract.
 * The final GPS is a destination, never an inferred road occurrence or an
 * assertion that the approved geometry reaches the pad.
 */
export function buildCoreDestinationReleasePlan(value: unknown): CoreDestinationReleasePlan {
  const row = record(value, "Core-destination release is invalid");
  if (!onlyKeys(row, [
    "padId", "recordRevision", "routeRevision", "releaseVersion",
    "routeSteps", "routeGeometry", "graphCounty", "graphLastVerifiedAt",
    "destination", "handoff", "dependencyDigest", "releaseDigest",
    "publishedAt",
  ])) throw new Error("Core-destination release exposes unsupported data");

  const padId = identifier(row.padId, "core-destination pad ID");
  const recordRevision = identifier(row.recordRevision, "core-destination record revision");
  const routeRevision = revision(row.routeRevision, "core-destination route revision");
  const dependencyDigest = digest(row.dependencyDigest, "core-destination dependency digest");
  const releaseDigest = digest(row.releaseDigest, "core-destination release digest");
  const publishedAt = String(row.publishedAt || "");
  const releaseVersion = String(row.releaseVersion || "");
  if (releaseVersion !== "v18-core-destination-v1" && releaseVersion !== "v18-core-destination-v2") {
    throw new Error("Core-destination release version is unsupported");
  }
  if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) throw new Error("Core-destination publication time is invalid");
  identifier(row.graphCounty, "core-destination graph county");
  const graphLastVerifiedAt = String(row.graphLastVerifiedAt || "");
  if (!graphLastVerifiedAt || Number.isNaN(Date.parse(graphLastVerifiedAt))) throw new Error("Core-destination graph verification time is invalid");
  if (!Array.isArray(row.routeSteps) || !row.routeSteps.length) throw new Error("Core-destination route steps are missing");
  const routeLines = exactCoreRouteLines(row.routeGeometry, row.routeSteps, releaseVersion);

  const destinationValue = record(row.destination, "Core-destination GPS is invalid");
  if (!onlyKeys(destinationValue, ["available", "role", "latitude", "longitude"])
      || destinationValue.available !== true
      || destinationValue.role !== "saved_pad_destination") {
    throw new Error("Core-destination GPS is not a destination-only coordinate");
  }
  const destination = coordinate(destinationValue);

  const handoff = record(row.handoff, "Core-destination handoff is invalid");
  if (!onlyKeys(handoff, [
    "handoff_version", "pad_id", "route_revision", "source_dependency_digest",
    "origin_mode", "waypoints", "core_end", "destination", "final_leg_mode",
  ])) throw new Error("Core-destination handoff exposes unsupported data");
  if (handoff.handoff_version !== row.releaseVersion
      || identifier(handoff.pad_id, "core-destination handoff pad ID") !== padId
      || revision(handoff.route_revision, "core-destination handoff route revision") !== routeRevision
      || digest(handoff.source_dependency_digest, "core-destination handoff dependency digest") !== dependencyDigest
      || handoff.origin_mode !== "current_location_until_route_ingress"
      || handoff.final_leg_mode !== "google_to_saved_gps_unapproved") {
    throw new Error("Core-destination handoff is not bound to its reviewed release");
  }

  const rawWaypoints = Array.isArray(handoff.waypoints) ? handoff.waypoints : [];
  if (rawWaypoints.length < 1 || rawWaypoints.length > maxWaypoints) throw new Error("Core-destination handoff must contain one to three reviewed core waypoints");
  if (rawWaypoints.length !== routeLines.length + 1) {
    throw new Error("Core-destination waypoints must contain every ordered approved geometry endpoint");
  }
  const waypoints = rawWaypoints.map((value, index) => {
    const waypoint = record(value, `Core-destination waypoint ${index + 1} is invalid`);
    if (!onlyKeys(waypoint, ["sequence", "latitude", "longitude"])
        || compactSequence(waypoint.sequence, "core waypoint sequence") !== index + 1) {
      throw new Error("Core-destination waypoint order is not contiguous");
    }
    return coordinate(waypoint);
  });

  const waypointCoordinates = rawWaypoints.map((value) => pointCoordinate(record(value, "Core-destination waypoint is invalid")));
  for (let index = 0; index < routeLines.length; index += 1) {
    if (!sameRouteCoordinate(routeLines[index][0], waypointCoordinates[index])
        || !sameRouteCoordinate(routeLines[index].at(-1)!, waypointCoordinates[index + 1])) {
      throw new Error("Core-destination waypoints are not the ordered endpoints of the approved geometry");
    }
  }

  const coreEnd = record(handoff.core_end, "Core-destination road handoff is invalid");
  if (!onlyKeys(coreEnd, ["sequence", "role", "latitude", "longitude"])
      || compactSequence(coreEnd.sequence, "core end sequence") !== rawWaypoints.length
      || coreEnd.role !== "exact_public_road_handoff"
      || coordinate(coreEnd) !== waypoints.at(-1)) {
    throw new Error("Core-destination approved geometry does not end at its exact handoff");
  }

  const handoffDestination = record(handoff.destination, "Core-destination handoff GPS is invalid");
  if (!onlyKeys(handoffDestination, ["sequence", "pad_id", "role", "latitude", "longitude"])
      || compactSequence(handoffDestination.sequence, "core destination sequence") !== rawWaypoints.length + 1
      || identifier(handoffDestination.pad_id, "core destination pad ID") !== padId
      || handoffDestination.role !== "saved_pad_destination"
      || coordinate(handoffDestination) !== destination) {
    throw new Error("Core-destination saved GPS is not bound to the selected pad");
  }
  if (sameRouteCoordinate(pointCoordinate(coreEnd), pointCoordinate(handoffDestination))) {
    throw new Error("Core-destination contract must preserve the separate GPS leg");
  }

  return {
    padId,
    recordRevision,
    routeRevision,
    dependencyDigest,
    releaseDigest,
    publishedAt,
    singleUrl: routeUrl(destination, waypoints),
  };
}

interface NamedPointProjection {
  role: string;
  label: string;
  latitude: number;
  longitude: number;
  coordinate: RouteCoordinate;
  coordinateText: string;
}

function namedPoint(
  value: unknown,
  field: string,
  roles: readonly string[],
): NamedPointProjection {
  const point = record(value, `Named approach ${field} is invalid`);
  if (!onlyKeys(point, ["role", "label", "latitude", "longitude"])
      || !roles.includes(String(point.role || ""))
      || typeof point.role !== "string" || typeof point.label !== "string"
      || typeof point.latitude !== "number" || typeof point.longitude !== "number") {
    throw new Error(`Named approach ${field} has an unsupported authority role`);
  }
  const coordinateText = coordinate(point);
  const coordinatePair = pointCoordinate(point);
  return {
    role: String(point.role),
    label: namedLabel(point.label, `${field} label`),
    latitude: coordinatePair[1],
    longitude: coordinatePair[0],
    coordinate: coordinatePair,
    coordinateText,
  };
}

function namedHandoffWaypoints(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxWaypoints) {
    throw new Error("Named approach handoff must contain one to three reviewed controls");
  }
  return value.map((rawWaypoint, index) => {
    const waypoint = record(rawWaypoint, `Named approach waypoint ${index + 1} is invalid`);
    if (!onlyKeys(waypoint, ["latitude", "longitude"])
        || typeof waypoint.latitude !== "number" || typeof waypoint.longitude !== "number") {
      throw new Error("Named approach waypoint exposes unsupported data");
    }
    return {
      latitude: pointCoordinate(waypoint)[1],
      longitude: pointCoordinate(waypoint)[0],
      coordinate: pointCoordinate(waypoint),
      coordinateText: coordinate(waypoint),
    };
  });
}

function ownerAccessPoint(
  value: unknown,
  field: string,
  role: DriverOwnerVerifiedAccessRoute["ingress"]["role"]
    | DriverOwnerVerifiedAccessRoute["privateAccessStart"]["role"]
    | DriverOwnerVerifiedAccessRoute["destination"]["role"],
) {
  const point = record(value, `Owner-verified access ${field} is invalid`);
  if (!onlyKeys(point, ["role", "label", "latitude", "longitude"])
      || point.role !== role
      || typeof point.label !== "string"
      || typeof point.latitude !== "number"
      || typeof point.longitude !== "number") {
    throw new Error(`Owner-verified access ${field} has an unsupported authority shape`);
  }
  const coordinateText = coordinate(point);
  const exactCoordinate = pointCoordinate(point);
  return {
    role,
    label: namedLabel(point.label, `owner access ${field} label`),
    latitude: exactCoordinate[1],
    longitude: exactCoordinate[0],
    coordinate: exactCoordinate,
    coordinateText,
  };
}

function ownerAccessWaypoints(value: unknown) {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error("Owner-verified Google handoff must contain exactly four frozen controls");
  }
  return value.map((rawWaypoint, index) => {
    const waypoint = record(rawWaypoint, `Owner-verified access waypoint ${index + 1} is invalid`);
    if (!onlyKeys(waypoint, ["latitude", "longitude"])
        || typeof waypoint.latitude !== "number"
        || typeof waypoint.longitude !== "number") {
      throw new Error("Owner-verified access waypoint exposes unsupported data");
    }
    const coordinateText = coordinate(waypoint);
    const exactCoordinate = pointCoordinate(waypoint);
    return {
      latitude: exactCoordinate[1],
      longitude: exactCoordinate[0],
      coordinate: exactCoordinate,
      coordinateText,
    };
  });
}

/**
 * Validate the immutable public-road core plus owner-verified private-access
 * release. The four controls are kept intact and the saved pad remains a
 * separate destination; Google receives no fixed origin, so navigation begins
 * at the driver's current location.
 */
export function buildOwnerVerifiedAccessRoute(value: unknown): DriverOwnerVerifiedAccessRoute {
  const release = record(value, "Owner-verified access release is invalid");
  if (!onlyKeys(release, ownerAccessReleaseKeys)) {
    throw new Error("Owner-verified access release exposes unsupported data");
  }
  if (typeof release.releaseId !== "string"
      || typeof release.routeRevision !== "number"
      || typeof release.publicCoreStepCount !== "number"
      || typeof release.statusRevision !== "string"
      || typeof release.releaseDigest !== "string"
      || typeof release.lastVerifiedAt !== "string"
      || typeof release.publishedAt !== "string") {
    throw new Error("Owner-verified access scalar fields must use the exact public types");
  }
  const releaseId = release.releaseId.trim();
  if (!uuidPattern.test(releaseId)
      || release.releaseVersion !== "v18-owner-access-route-v1"
      || release.publicCoreStepCount !== 6
      || release.finalLegMode !== "owner_verified_private_access_to_saved_pad") {
    throw new Error("Owner-verified access release identity is invalid");
  }
  const routeRevision = revision(release.routeRevision, "owner-verified route revision");
  const steps = namedSteps(release.steps);
  if (steps.length !== 7) throw new Error("Owner-verified access release must contain seven ordered step cards");
  const projection = ownerAccessGeometry(release.geometry, steps);
  const ingress = ownerAccessPoint(release.ingress, "ingress", "exact_public_route_ingress");
  const privateAccessStart = ownerAccessPoint(
    release.privateAccessStart,
    "private-access start",
    "owner_verified_private_access_start",
  );
  const destination = ownerAccessPoint(release.destination, "destination", "saved_pad_destination");
  if (!sameExactRouteCoordinate(ingress.coordinate, projection.milestones[0])
      || !sameExactRouteCoordinate(privateAccessStart.coordinate, projection.milestones[6])
      || !sameExactRouteCoordinate(destination.coordinate, projection.milestones[7])) {
    throw new Error("Owner-verified authority points do not exactly match the combined geometry");
  }

  const handoff = record(release.handoff, "Owner-verified access handoff is invalid");
  if (!onlyKeys(handoff, ["originMode", "handoffMode", "waypoints"])
      || handoff.originMode !== "current_location_to_route_ingress"
      || handoff.handoffMode !== "owner_verified_controls_v1") {
    throw new Error("Owner-verified access handoff mode is invalid");
  }
  const waypoints = ownerAccessWaypoints(handoff.waypoints);
  if (!sameExactRouteCoordinate(waypoints[0].coordinate, ingress.coordinate)
      || !sameExactRouteCoordinate(waypoints[3].coordinate, privateAccessStart.coordinate)) {
    throw new Error("Owner-verified Google controls must begin at ingress and end at private access");
  }
  const uniqueControls = new Set(waypoints.map((waypoint) => `${waypoint.longitude},${waypoint.latitude}`));
  if (uniqueControls.size !== 4
      || waypoints.some((waypoint) => sameExactRouteCoordinate(waypoint.coordinate, destination.coordinate))) {
    throw new Error("Owner-verified Google controls must remain four unique controls before the destination");
  }
  let nextVertexIndex = 0;
  for (const waypoint of waypoints) {
    const vertexIndex = projection.publicCoreVertices.findIndex((vertex, index) => (
      index >= nextVertexIndex && sameExactRouteCoordinate(vertex, waypoint.coordinate)
    ));
    if (vertexIndex < 0) throw new Error("Owner-verified Google controls are not ordered on the exact public core");
    nextVertexIndex = vertexIndex + 1;
  }

  const statusRevision = namedRevision(release.statusRevision, "owner access status revision");
  const releaseDigest = namedReleaseDigest(release.releaseDigest);
  const lastVerifiedAt = namedTimestamp(release.lastVerifiedAt, "owner access verification time");
  const publishedAt = namedTimestamp(release.publishedAt, "owner access publication time");
  const navigationUrl = routeUrl(
    destination.coordinateText,
    waypoints.map((waypoint) => waypoint.coordinateText),
  );

  return {
    releaseId,
    releaseVersion: "v18-owner-access-route-v1",
    routeRevision,
    publicCoreStepCount: 6,
    steps,
    geometry: projection.geometry,
    ingress: {
      role: "exact_public_route_ingress",
      label: ingress.label,
      latitude: ingress.latitude,
      longitude: ingress.longitude,
    },
    privateAccessStart: {
      role: "owner_verified_private_access_start",
      label: privateAccessStart.label,
      latitude: privateAccessStart.latitude,
      longitude: privateAccessStart.longitude,
    },
    destination: {
      role: "saved_pad_destination",
      label: destination.label,
      latitude: destination.latitude,
      longitude: destination.longitude,
    },
    finalLegMode: "owner_verified_private_access_to_saved_pad",
    handoff: {
      originMode: "current_location_to_route_ingress",
      handoffMode: "owner_verified_controls_v1",
      waypoints: waypoints.map(({ latitude, longitude }) => ({ latitude, longitude })),
    },
    lastVerifiedAt,
    statusRevision,
    releaseDigest,
    publishedAt,
    navigationUrl,
  };
}

function validateNamedWaypointOrder(
  waypoints: ReturnType<typeof namedHandoffWaypoints>,
  projection: NamedGeometryProjection,
  handoffMode: "full_geometry_endpoints" | "verified_compact",
  finalLegMode: "full_approved_route" | "google_to_saved_gps_unapproved",
  destination: RouteCoordinate,
) {
  for (let index = 1; index < waypoints.length; index += 1) {
    if (sameRouteCoordinate(waypoints[index - 1].coordinate, waypoints[index].coordinate)) {
      throw new Error("Named approach handoff contains duplicate consecutive controls");
    }
  }
  if (!sameRouteCoordinate(waypoints[0].coordinate, projection.milestones[0])) {
    throw new Error("Named approach handoff must begin at its exact named ingress");
  }
  const expectedFullControls = finalLegMode === "google_to_saved_gps_unapproved"
    ? projection.milestones
    : projection.milestones.slice(0, -1);
  if (handoffMode === "full_geometry_endpoints") {
    if (waypoints.length !== expectedFullControls.length
        || waypoints.some((waypoint, index) => !sameRouteCoordinate(waypoint.coordinate, expectedFullControls[index]))) {
      throw new Error("Named approach full handoff does not contain the ordered approved geometry controls");
    }
    return;
  }

  let nextVertexIndex = 0;
  for (const waypoint of waypoints) {
    const foundIndex = projection.vertices.findIndex((vertex, index) => (
      index >= nextVertexIndex && sameRouteCoordinate(vertex, waypoint.coordinate)
    ));
    if (foundIndex < 0) throw new Error("Named approach compact handoff is not ordered on its exact geometry");
    nextVertexIndex = foundIndex + 1;
  }
  if (finalLegMode === "google_to_saved_gps_unapproved"
      && !sameRouteCoordinate(waypoints.at(-1)!.coordinate, projection.milestones.at(-1)!)) {
    throw new Error("Named approach GPS handoff must preserve its exact approved core end");
  }
  if (finalLegMode === "full_approved_route"
      && waypoints.some((waypoint) => sameRouteCoordinate(waypoint.coordinate, destination))) {
    throw new Error("Named approach full-route handoff duplicates its final destination");
  }
}

/**
 * Validate an atomic set of separately reviewed named approaches. Google is
 * given no fixed origin: the phone routes to the selected named ingress, then
 * follows only that release's ordered controls. The selected steps, geometry,
 * and generated URL are returned as one indivisible client object.
 */
export function buildNamedApproachReleaseSet(
  value: unknown,
): DriverNamedApproach[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) throw new Error("Named approach release set is invalid");
  if (!value.length) return [];
  const approaches = value.map((rawApproach, index): DriverNamedApproach => {
    const approach = record(rawApproach, `Named approach ${index + 1} is invalid`);
    if (!onlyKeys(approach, namedApproachKeys)) throw new Error("Named approach release exposes unsupported data");

    if (typeof approach.approachKey !== "string" || typeof approach.approachLabel !== "string"
        || typeof approach.routeGroup !== "string" || typeof approach.statusRevision !== "string"
        || typeof approach.releaseDigest !== "string" || typeof approach.lastVerifiedAt !== "string"
        || typeof approach.publishedAt !== "string") {
      throw new Error("Named approach scalar fields must use the exact public types");
    }
    const approachKey = approach.approachKey.trim();
    const approachLabel = namedLabel(approach.approachLabel, "label");
    const routeGroup = approach.routeGroup;
    const variantIndex = approach.variantIndex;
    if (typeof approach.routeRevision !== "number") throw new Error("Named approach route revision must be a JSON number");
    const routeRevision = revision(approach.routeRevision, "named approach route revision");
    const statusRevision = namedRevision(approach.statusRevision, "status revision");
    const releaseDigest = namedReleaseDigest(approach.releaseDigest);
    if (!namedApproachKeyPattern.test(approachKey)
        || !/^Via\s+\S/u.test(approachLabel)
        || (routeGroup !== "primary" && routeGroup !== "alternate")
        || !Number.isInteger(variantIndex) || (variantIndex as number) < 1 || (variantIndex as number) > 8
        || approach.releaseVersion !== "v18-named-approach-v1") {
      throw new Error("Named approach identity is invalid");
    }

    const steps = namedSteps(approach.steps);
    const projection = namedGeometry(approach.geometry, steps);
    const ingress = namedPoint(approach.ingress, "ingress", ["exact_approved_ingress"]);
    const coreEnd = namedPoint(approach.coreEnd, "core end", ["exact_approved_handoff"]);
    const destination = namedPoint(approach.destination, "destination", ["driver_entrance", "saved_pad_destination"]);
    if (!sameRouteCoordinate(ingress.coordinate, projection.milestones[0])
        || !sameRouteCoordinate(coreEnd.coordinate, projection.milestones.at(-1)!)) {
      throw new Error("Named approach authority points do not match its exact approved geometry");
    }

    const finalLegMode = String(approach.finalLegMode || "");
    if (finalLegMode !== "full_approved_route" && finalLegMode !== "google_to_saved_gps_unapproved") {
      throw new Error("Named approach final-leg mode is unsupported");
    }
    if (finalLegMode === "full_approved_route"
      ? destination.role !== "driver_entrance" || !sameRouteCoordinate(coreEnd.coordinate, destination.coordinate)
      : destination.role !== "saved_pad_destination" || sameRouteCoordinate(coreEnd.coordinate, destination.coordinate)) {
      throw new Error("Named approach destination does not preserve its approved/unapproved boundary");
    }

    const handoff = record(approach.handoff, "Named approach handoff is invalid");
    if (!onlyKeys(handoff, ["originMode", "handoffMode", "waypoints"])
        || handoff.originMode !== "current_location_to_named_ingress"
        || (handoff.handoffMode !== "full_geometry_endpoints" && handoff.handoffMode !== "verified_compact")) {
      throw new Error("Named approach handoff is not bound to current-location ingress routing");
    }
    if (finalLegMode === "full_approved_route"
      ? handoff.handoffMode !== "full_geometry_endpoints"
      : handoff.handoffMode !== "verified_compact") {
      throw new Error("Named approach handoff mode does not preserve its final-leg authority boundary");
    }
    const waypoints = namedHandoffWaypoints(handoff.waypoints);
    validateNamedWaypointOrder(
      waypoints,
      projection,
      handoff.handoffMode,
      finalLegMode,
      destination.coordinate,
    );
    const navigationUrl = routeUrl(destination.coordinateText, waypoints.map((waypoint) => waypoint.coordinateText));

    return {
      approachKey,
      approachLabel,
      routeGroup,
      variantIndex: variantIndex as number,
      releaseVersion: "v18-named-approach-v1",
      routeRevision,
      steps,
      geometry: projection.geometry,
      ingress: {
        role: "exact_approved_ingress",
        label: ingress.label,
        latitude: ingress.latitude,
        longitude: ingress.longitude,
      },
      coreEnd: {
        role: "exact_approved_handoff",
        label: coreEnd.label,
        latitude: coreEnd.latitude,
        longitude: coreEnd.longitude,
      },
      destination: {
        role: destination.role as DriverNamedApproach["destination"]["role"],
        label: destination.label,
        latitude: destination.latitude,
        longitude: destination.longitude,
      },
      finalLegMode,
      handoff: {
        originMode: "current_location_to_named_ingress",
        handoffMode: handoff.handoffMode,
        waypoints: waypoints.map(({ latitude, longitude }) => ({ latitude, longitude })),
      },
      lastVerifiedAt: namedTimestamp(approach.lastVerifiedAt, "verification time"),
      statusRevision,
      releaseDigest,
      publishedAt: namedTimestamp(approach.publishedAt, "publication time"),
      navigationUrl,
    };
  });

  approaches.sort((left, right) => left.variantIndex - right.variantIndex || left.approachKey.localeCompare(right.approachKey));
  const keys = new Set(approaches.map((approach) => approach.approachKey));
  const labels = new Set(approaches.map((approach) => approach.approachLabel.toLocaleLowerCase()));
  const variants = new Set(approaches.map((approach) => approach.variantIndex));
  if (keys.size !== approaches.length || labels.size !== approaches.length || variants.size !== approaches.length
      || approaches.some((approach, index) => approach.variantIndex !== index + 1)
      || approaches[0].routeGroup !== "primary"
      || approaches.slice(1).some((approach) => approach.routeGroup !== "alternate")) {
    throw new Error("Named approach choices are not a unique primary-first release set");
  }
  return approaches;
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
