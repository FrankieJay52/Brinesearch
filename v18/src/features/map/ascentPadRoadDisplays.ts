import type { PadSummary } from "@/data/types";
import { mapDisplayCoordinate } from "@/data/mapDisplayCoordinates";
import artifactJson from "./ascentPadRoadDisplays.batch1.json";

export type AscentPadRoadCoordinate = [number, number];
export type AscentPadRoadColorRole = "teal" | "gps" | "red";
export type RedContinuationRoadClass = "county" | "township" | "local";

export interface AscentPadRoadLineString<ColorRole extends AscentPadRoadColorRole = AscentPadRoadColorRole> {
  type: "LineString";
  colorRole: ColorRole;
  visibility: "main-map-all-and-ascent";
  label: string;
  coordinates: readonly AscentPadRoadCoordinate[];
}

export interface AscentPadRoadArrival extends AscentPadRoadLineString<"teal"> {
  pattern: "solid";
  lineRole: string;
  approvedRoad: boolean;
}

export interface AscentPadGpsLeg extends AscentPadRoadLineString<"gps"> {
  pattern: "solid";
  lineStyle: "solid";
  lineRole: "unapproved_gps_tether";
  authority: "unapproved_gps_tether";
  approvedRoad: false;
  navigationGeometry: false;
}

export interface AscentPadRedContinuation extends AscentPadRoadLineString<"red"> {
  approvedRoad: false;
  roadClass: RedContinuationRoadClass;
  exactRoadIdentity: string;
  geometrySha256: string;
  noDownstreamPadsProof: {
    directorySnapshotId: string;
    sourceRevision: string;
    lastPadId: string;
    lastPadSavedGps: AscentPadRoadCoordinate;
    exactRoadIdentity: string;
    redGeometrySha256: string;
  };
  nextHighway: {
    roadClass: "interstate" | "us" | "state";
    designation: string;
    junction: AscentPadRoadCoordinate;
  };
}

export interface AscentPadRoadDisplay {
  padId: string;
  canonicalId: string;
  legacyId: string;
  recordRevision: string;
  padName: string;
  company: "Ascent";
  state: string;
  county: string;
  structuredRoadSequence: string;
  directoryCoordinate: AscentPadRoadCoordinate;
  displayScope: "persistent-main-map-all-and-ascent";
  displayAuthority: string;
  /** Frozen route destination; intentionally different from the directory coordinate for BILINOVICH. */
  savedPin: AscentPadRoadCoordinate;
  reviewedRoadSequence: string;
  arrival: AscentPadRoadArrival;
  gpsLeg: AscentPadGpsLeg | null;
  redContinuation: AscentPadRedContinuation | null;
  redDecision: { state: string; reason: string };
}

interface BatchArtifact {
  schemaVersion: number;
  batchId: string;
  displayScope: string;
  displayAuthority: string;
  rules?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  routes?: unknown;
}

const artifact = artifactJson as unknown as BatchArtifact;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonemptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function coordinate(value: unknown): value is AscentPadRoadCoordinate {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && value[0] >= -83
    && value[0] <= -79
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
    && value[1] >= 38
    && value[1] <= 42;
}

function coordinateFromObject(value: unknown): AscentPadRoadCoordinate | null {
  const candidate = object(value);
  const result = [candidate.longitude, candidate.latitude];
  return coordinate(result) ? result : null;
}

function sameCoordinate(left: readonly number[], right: readonly number[]) {
  return left[0] === right[0] && left[1] === right[1];
}

function coordinateLine(value: unknown, pointCount: unknown): value is AscentPadRoadCoordinate[] {
  return Number.isInteger(pointCount)
    && Number(pointCount) >= 2
    && Array.isArray(value)
    && value.length === pointCount
    && value.every(coordinate);
}

export function ascentRedContinuationIsEligible(
  value: unknown,
  expectedPadId: string,
  expectedArrivalEndpoint: AscentPadRoadCoordinate,
  expectedSavedPin: AscentPadRoadCoordinate,
): value is AscentPadRedContinuation {
  const candidate = object(value);
  const proof = object(candidate.noDownstreamPadsProof);
  const nextHighway = object(candidate.nextHighway);
  const roadClass = candidate.roadClass;
  return candidate.type === "LineString"
    && candidate.colorRole === "red"
    && candidate.approvedRoad === false
    && candidate.visibility === "main-map-all-and-ascent"
    && nonemptyText(candidate.label)
    && (roadClass === "county" || roadClass === "township" || roadClass === "local")
    && nonemptyText(candidate.exactRoadIdentity)
    && typeof candidate.geometrySha256 === "string"
    && /^[0-9a-f]{64}$/.test(candidate.geometrySha256)
    && nonemptyText(proof.directorySnapshotId)
    && nonemptyText(proof.sourceRevision)
    && proof.lastPadId === expectedPadId
    && coordinate(proof.lastPadSavedGps)
    && sameCoordinate(proof.lastPadSavedGps, expectedSavedPin)
    && proof.exactRoadIdentity === candidate.exactRoadIdentity
    && proof.redGeometrySha256 === candidate.geometrySha256
    && (nextHighway.roadClass === "interstate" || nextHighway.roadClass === "us" || nextHighway.roadClass === "state")
    && nonemptyText(nextHighway.designation)
    && coordinate(nextHighway.junction)
    && Array.isArray(candidate.coordinates)
    && candidate.coordinates.length >= 2
    && candidate.coordinates.every(coordinate)
    && sameCoordinate(candidate.coordinates[0], expectedArrivalEndpoint)
    && sameCoordinate(candidate.coordinates.at(-1) as AscentPadRoadCoordinate, nextHighway.junction);
}

function batchHeaderIsValid() {
  const rules = object(artifact.rules);
  const summary = object(artifact.summary);
  const presentationRulesAreValid = artifact.schemaVersion === 2
    ? rules.gpsLegIsSeparateDashedUnapprovedTether === true
    : artifact.schemaVersion === 3
      && rules.gpsLegIsSeparateSolidNeutralUnapprovedTether === true;
  return (artifact.schemaVersion === 2 || artifact.schemaVersion === 3)
    && artifact.batchId === "ascent-gps-road-lines-20260829-all55"
    && artifact.displayScope === "persistent-main-map-all-and-ascent"
    && nonemptyText(artifact.displayAuthority)
    && rules.exactFrozenDestinationBinding === true
    && rules.arrivalContainsNetworkGeometryOnly === true
    && rules.staticSolidGeometryUsesOrderedExactIdentityAllowlist === true
    && rules.staticSolidGeometryStopsAtFirstUnreviewedStep === true
    && rules.divergentStaticRouteFailsClosed === true
    && presentationRulesAreValid
    && rules.noSyntheticRoadConnector === true
    && rules.redContinuationRequiresExactNoDownstreamPadProof === true
    && rules.interstateUsAndStateRoutesNeverRed === true
    && summary.reviewedRouteCount === 55
    && summary.osrmReviewedArrivalRecordCount === 45
    && summary.osrmSolidArrivalCount === 44
    && summary.staticMatchedThroughNetworkEndpointCount === 31
    && summary.staticPostNamedTailSplitCount === 13
    && summary.staticFailClosedAnchorCount === 1
    && summary.staticDashedCandidateRouteCount === 14
    && summary.gpsLegCount === 54
    && summary.redContinuationCount === 1
    && summary.productionWrites === 0
    && Array.isArray(artifact.routes);
}

function validArrival(value: unknown): AscentPadRoadArrival | null {
  const line = object(value);
  if (line.type !== "LineString"
    || line.colorRole !== "teal"
    || line.pattern !== "solid"
    || typeof line.approvedRoad !== "boolean"
    || line.approvedRoad !== (line.lineRole === "exact_public_graph_arrival")
    || line.visibility !== "main-map-all-and-ascent"
    || !nonemptyText(line.lineRole)
    || !nonemptyText(line.label)
    || !coordinateLine(line.coordinates, line.pointCount)) return null;
  return {
    type: "LineString",
    colorRole: "teal",
    lineRole: line.lineRole,
    pattern: "solid",
    approvedRoad: line.approvedRoad,
    visibility: "main-map-all-and-ascent",
    label: line.label,
    coordinates: line.coordinates,
  };
}

function validGpsLeg(
  value: unknown,
  arrivalEndpoint: AscentPadRoadCoordinate,
  destination: AscentPadRoadCoordinate,
): AscentPadGpsLeg | null {
  const line = object(value);
  const artifactLineStyle = artifact.schemaVersion === 2 ? "dashed" : "solid";
  if (line.type !== "LineString"
    || line.colorRole !== "gps"
    || line.lineRole !== "unapproved_gps_tether"
    || line.pattern !== artifactLineStyle
    || line.lineStyle !== artifactLineStyle
    || line.authority !== "unapproved_gps_tether"
    || line.approvedRoad !== false
    || line.navigationGeometry !== false
    || line.visibility !== "main-map-all-and-ascent"
    || !nonemptyText(line.label)
    || !coordinateLine(line.coordinates, line.pointCount)
    || !sameCoordinate(line.coordinates[0], arrivalEndpoint)
    || !sameCoordinate(line.coordinates.at(-1) as AscentPadRoadCoordinate, destination)) return null;
  return {
    type: "LineString",
    colorRole: "gps",
    lineRole: "unapproved_gps_tether",
    // The frozen schema-2 artifact used a dashed tether. Keep its exact
    // coordinates and non-road authority while projecting a solid neutral
    // presentation at runtime.
    pattern: "solid",
    lineStyle: "solid",
    authority: "unapproved_gps_tether",
    approvedRoad: false,
    navigationGeometry: false,
    visibility: "main-map-all-and-ascent",
    label: line.label,
    coordinates: line.coordinates,
  };
}

function buildDisplay(value: unknown): AscentPadRoadDisplay | null {
  const route = object(value);
  const destination = coordinateFromObject(route.destination);
  const directoryCoordinate = coordinateFromObject(route.directoryCoordinate);
  const destinationMetadata = object(route.destination);
  const directoryMetadata = object(route.directoryCoordinate);
  const arrival = validArrival(route.arrival);
  const redDecision = object(route.redDecision);
  if (!nonemptyText(route.padId)
    || !nonemptyText(route.canonicalId)
    || !nonemptyText(route.legacyId)
    || !nonemptyText(route.recordRevision)
    || !nonemptyText(route.padName)
    || route.company !== "Ascent"
    || !nonemptyText(route.state)
    || !nonemptyText(route.county)
    || typeof route.structuredRoadSequence !== "string"
    || typeof route.structuredRoadSequenceSha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(route.structuredRoadSequenceSha256)
    || !destination
    || !directoryCoordinate
    || !nonemptyText(destinationMetadata.role)
    || !nonemptyText(directoryMetadata.role)
    || !nonemptyText(route.reviewedRoadSequence)
    || !nonemptyText(route.displayVariant)
    || !arrival
    || !nonemptyText(redDecision.state)
    || !nonemptyText(redDecision.reason)
    || !Object.keys(object(route.source)).length
    || !Object.keys(object(route.diagnostics)).length) return null;

  const arrivalEndpoint = arrival.coordinates.at(-1) as AscentPadRoadCoordinate;
  const gpsLeg = route.gpsLeg === null
    ? null
    : validGpsLeg(route.gpsLeg, arrivalEndpoint, destination);
  if (route.gpsLeg !== null && !gpsLeg) return null;
  if (!gpsLeg && !sameCoordinate(arrivalEndpoint, destination)) return null;

  const redContinuation = route.redContinuation === null
    ? null
    : ascentRedContinuationIsEligible(route.redContinuation, route.padId, arrivalEndpoint, destination)
      ? route.redContinuation
      : null;
  if (route.redContinuation !== null && !redContinuation) return null;

  return {
    padId: route.padId,
    canonicalId: route.canonicalId,
    legacyId: route.legacyId,
    recordRevision: route.recordRevision,
    padName: route.padName,
    company: "Ascent",
    state: route.state,
    county: route.county,
    structuredRoadSequence: route.structuredRoadSequence,
    directoryCoordinate,
    displayScope: "persistent-main-map-all-and-ascent",
    displayAuthority: artifact.displayAuthority,
    savedPin: destination,
    reviewedRoadSequence: route.reviewedRoadSequence,
    arrival,
    gpsLeg,
    redContinuation,
    redDecision: { state: redDecision.state, reason: redDecision.reason },
  };
}

function indexedDisplays() {
  const displays = new Map<string, AscentPadRoadDisplay>();
  const duplicates = new Set<string>();
  if (!batchHeaderIsValid() || !Array.isArray(artifact.routes)) return displays;
  for (const route of artifact.routes) {
    const padId = object(route).padId;
    if (!nonemptyText(padId)) continue;
    if (displays.has(padId) || duplicates.has(padId)) {
      duplicates.add(padId);
      displays.delete(padId);
      continue;
    }
    const display = buildDisplay(route);
    if (display) displays.set(padId, display);
  }
  for (const padId of duplicates) displays.delete(padId);
  return displays;
}

const frozenDisplayByPadId = indexedDisplays();

function exactDirectoryBinding(pad: PadSummary, display: AscentPadRoadDisplay) {
  const directoryCoordinate = mapDisplayCoordinate(pad);
  return pad.padId === display.padId
    && pad.canonicalId === display.canonicalId
    && pad.legacyId === display.legacyId
    && pad.recordRevision === display.recordRevision
    && pad.padName === display.padName
    && pad.company === display.company
    && pad.state === display.state
    && pad.county === display.county
    && pad.structuredRoadSequence === display.structuredRoadSequence
    && directoryCoordinate?.longitude === display.directoryCoordinate[0]
    && directoryCoordinate.latitude === display.directoryCoordinate[1];
}

/** Returns a reviewed display only for its exact frozen directory record. */
export function ascentPadRoadDisplayForPad(pad: PadSummary): AscentPadRoadDisplay | null {
  const display = frozenDisplayByPadId.get(pad.padId);
  return display && exactDirectoryBinding(pad, display) ? display : null;
}

/** Missing, stale, malformed, and duplicate records fail closed independently. */
export function ascentPadRoadDisplaysForDirectory(pads: readonly PadSummary[]) {
  const padById = new Map<string, PadSummary>();
  const duplicates = new Set<string>();
  for (const pad of pads) {
    if (!frozenDisplayByPadId.has(pad.padId)) continue;
    if (padById.has(pad.padId)) duplicates.add(pad.padId);
    else padById.set(pad.padId, pad);
  }
  for (const padId of duplicates) padById.delete(padId);

  return [...frozenDisplayByPadId.values()].filter((display) => {
    const pad = padById.get(display.padId);
    return Boolean(pad && exactDirectoryBinding(pad, display));
  });
}
