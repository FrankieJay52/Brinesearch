import { mapDisplayCoordinate } from "@/data/mapDisplayCoordinates";
import type { PadSummary } from "@/data/types";

export type AscentPadApproachCoordinate = [number, number];
export type AscentPadApproachStatus = "ROUTED_DISPLAY" | "ROUTED_FAIL_CLOSED" | "PIN_ONLY";
export type AscentPadApproachLineStyle = "solid" | "dashed" | "none";
export type AscentPadApproachSectionAuthority =
  | "osrm_structural_step"
  | "exact_master_identity_match"
  | "unapproved_routed_remainder";

export interface AscentPadApproachDirection {
  directionOrder: number;
  displayName: string;
  instruction: string;
  distanceMiles: number | null;
  authority: "named_public_road" | "generic_unapproved_access";
  measurement: "measured_route_section" | "saved_source_mileage";
}

export interface AscentPadApproachSection {
  sectionOrder: number;
  coordinateStartIndex: number;
  coordinateEndIndex: number;
  distanceMeters: number;
  distanceMiles: number;
  durationSeconds: number;
  maneuver: {
    type: string;
    modifier: string | null;
    exit: number | null;
  };
  instruction: string;
  matchState:
    | "structural_zero_distance"
    | "matched_exact_master"
    | "unapproved_unnamed"
    | "unapproved_identity_mismatch"
    | "unapproved_after_first_mismatch";
  lineStyle: AscentPadApproachLineStyle;
  colorRole: "teal" | "unapproved" | "none";
  authority: AscentPadApproachSectionAuthority;
  sourceStepOrder: number | null;
  sourceRoadId: string | null;
  sourceDisplayRoad: string | null;
  matchedIdentitySha256: string | null;
}

export interface AscentPadApproachGpsTether {
  type: "LineString";
  lineStyle: "dashed";
  colorRole: "gps";
  authority: "unapproved_straight_network_snap_to_saved_gps";
  navigationGeometry: false;
  distanceMeters: number;
  distanceMiles: number;
  nontrivial: boolean;
  coordinates: AscentPadApproachCoordinate[];
}

export interface AscentPadApproachRecord {
  padId: string;
  canonicalId: string | null;
  legacyId: string | null;
  recordRevision: string;
  padName: string;
  company: "Ascent";
  state: string;
  county: string;
  structuredRoadSequence: string;
  destination: {
    coordinates: AscentPadApproachCoordinate;
    gpsSource: string;
    directoryCoordinateRole: string;
  };
  lastHighway: {
    sourceStepOrder: number;
    roadId: string;
    displayRoad: string;
    roadType: "interstate" | "us_route" | "state_route";
  } | null;
  status: AscentPadApproachStatus;
  reason: string;
  start: {
    authority: "exact_highway_next_road_intersection" | "candidate_nearest_highway_point";
    candidateOnly: boolean;
    anchorSource:
      | "exact_master_highway_next_road_intersection"
      | "exact_master_highway_centerline_nearest_point";
    anchoredRoadId: string;
    startToDestinationAirMiles: number;
    requestedCoordinate: AscentPadApproachCoordinate;
    snappedCoordinate: AscentPadApproachCoordinate;
    snapDistanceMeters: number;
  } | null;
  roadCoordinates: AscentPadApproachCoordinate[];
  sections: AscentPadApproachSection[];
  gpsTether: AscentPadApproachGpsTether | null;
  mileage: {
    roadDistanceMeters: number | null;
    roadDistanceMiles: number | null;
    totalToGpsMeters: number | null;
    totalToGpsMiles: number | null;
    gpsTetherExcluded: true;
  };
  directions: AscentPadApproachDirection[];
}

export interface AscentPadApproachMapLine {
  type: "LineString";
  colorRole: "teal" | "gps";
  label: string;
  coordinates: AscentPadApproachCoordinate[];
}

export interface AscentPadApproachMapDisplay {
  kind: "batch2-approach";
  padId: string;
  company: "Ascent";
  lines: AscentPadApproachMapLine[];
}

interface ParsedCatalog {
  records: AscentPadApproachRecord[];
  byPadId: Map<string, AscentPadApproachRecord>;
}

const emptyCatalog = (): ParsedCatalog => ({ records: [], byPadId: new Map() });

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonemptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableText(value: unknown): value is string | null {
  return value === null || nonemptyText(value);
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nullableFiniteNonnegative(value: unknown): value is number | null {
  return value === null || finiteNonnegative(value);
}

function coordinate(value: unknown): value is AscentPadApproachCoordinate {
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

function sameCoordinate(left: readonly number[], right: readonly number[]) {
  return left[0] === right[0] && left[1] === right[1];
}

function coordinateDistanceMeters(left: readonly number[], right: readonly number[]) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const leftLatitude = radians(left[1]);
  const rightLatitude = radians(right[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function milesReconcile(meters: number, miles: number) {
  return Math.abs(miles - meters / 1_609.344) <= .002;
}

const maximumStartToDestinationAirMiles = 25;
const metersPerMile = 1_609.344;

function exactDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function batchHeaderIsValid(value: unknown) {
  const artifact = object(value);
  const rules = object(artifact.rules);
  const summary = object(artifact.summary);
  return artifact.schemaVersion === 1
    && artifact.batchId === "ascent-last-highway-to-pad-approaches-20260829-batch2"
    && artifact.scope === "last-exact-highway-identity-bounded-start-to-frozen-pad-gps"
    && nonemptyText(artifact.authority)
    && rules.batch1ArtifactRemainsByteStable === true
    && rules.explicitBuildTimeOsrmOnly === true
    && rules.maximumExactIntersectionSnapMeters === 25
    && rules.maximumCandidateHighwaySnapMeters === 100
    && rules.candidateStartRequiresExactMasterLastHighwayRoadIdAnchor === true
    && rules.noFuzzyOrUnanchoredNameOnlyCandidateStartMatching === true
    && rules.maxStartToDestinationAirMiles === maximumStartToDestinationAirMiles
    && rules.exactNormalizedAliasesOnly === true
    && rules.noFuzzyNearestOrNameOnlyRoadIdentityMatching === true
    && rules.solidStopsPermanentlyAtFirstMismatch === true
    && rules.unmatchedPrivateAndUnnamedRoadsAreGenericDashed === true
    && rules.gpsTetherIsSeparateStraightUnapprovedGeometry === true
    && rules.gpsTetherExcludedFromRoadMileage === true
    && rules.nontrivialGpsTetherMakesTotalToGpsNull === true
    && rules.noProductionWrites === true
    && rules.noGoogleUrlChanges === true
    && rules.noRedGeometry === true
    && summary.sourcePadCount === 192
    && summary.outputPadCount === 192
    && summary.routedDisplayCount === 95
    && summary.routedFailClosedCount === 16
    && summary.pinOnlyCount === 81
    && summary.remoteStartRejectedPinOnlyCount === 5
    && summary.exactIntersectionStartCount === 28
    && summary.candidateNearestHighwayStartCount === 67
    && summary.solidSectionCount === 163
    && summary.dashedSectionCount === 333
    && summary.nontrivialGpsTetherCount === 82
    && summary.totalToGpsWithheldCount === 82
    && finiteNonnegative(summary.maximumDisplayedStartToDestinationAirMiles)
    && summary.maximumDisplayedStartToDestinationAirMiles <= maximumStartToDestinationAirMiles
    && summary.productionWrites === 0
    && summary.googleUrlChanges === 0
    && summary.redGeometryCount === 0
    && Array.isArray(artifact.records)
    && artifact.records.length === 192;
}

function validLastHighway(value: unknown): AscentPadApproachRecord["lastHighway"] | undefined {
  if (value === null) return null;
  const highway = object(value);
  if (!Number.isInteger(highway.sourceStepOrder)
    || Number(highway.sourceStepOrder) < 1
    || !nonemptyText(highway.roadId)
    || !nonemptyText(highway.displayRoad)
    || (highway.roadType !== "interstate" && highway.roadType !== "us_route" && highway.roadType !== "state_route")) return undefined;
  return {
    sourceStepOrder: highway.sourceStepOrder as number,
    roadId: highway.roadId,
    displayRoad: highway.displayRoad,
    roadType: highway.roadType,
  };
}

function validStart(value: unknown): AscentPadApproachRecord["start"] | undefined {
  if (value === null) return null;
  const start = object(value);
  const expectedAnchorSource = start.authority === "exact_highway_next_road_intersection"
    ? "exact_master_highway_next_road_intersection"
    : "exact_master_highway_centerline_nearest_point";
  if ((start.authority !== "exact_highway_next_road_intersection"
      && start.authority !== "candidate_nearest_highway_point")
    || typeof start.candidateOnly !== "boolean"
    || start.candidateOnly !== (start.authority === "candidate_nearest_highway_point")
    || start.anchorSource !== expectedAnchorSource
    || !nonemptyText(start.anchoredRoadId)
    || !finiteNonnegative(start.startToDestinationAirMiles)
    || start.startToDestinationAirMiles > maximumStartToDestinationAirMiles
    || !coordinate(start.requestedCoordinate)
    || !coordinate(start.snappedCoordinate)
    || !finiteNonnegative(start.snapDistanceMeters)
    || (start.authority === "exact_highway_next_road_intersection" && start.snapDistanceMeters > 25)
    || (start.authority === "candidate_nearest_highway_point" && start.snapDistanceMeters > 100)) return undefined;
  return {
    authority: start.authority,
    candidateOnly: start.candidateOnly,
    anchorSource: expectedAnchorSource,
    anchoredRoadId: start.anchoredRoadId,
    startToDestinationAirMiles: start.startToDestinationAirMiles,
    requestedCoordinate: start.requestedCoordinate,
    snappedCoordinate: start.snappedCoordinate,
    snapDistanceMeters: start.snapDistanceMeters,
  };
}

function validManeuver(value: unknown): AscentPadApproachSection["maneuver"] | null {
  const maneuver = object(value);
  if (!nonemptyText(maneuver.type)
    || !(maneuver.modifier === null || typeof maneuver.modifier === "string")
    || !(maneuver.exit === null || (Number.isInteger(maneuver.exit) && Number(maneuver.exit) >= 0))) return null;
  return {
    type: maneuver.type,
    modifier: maneuver.modifier as string | null,
    exit: maneuver.exit as number | null,
  };
}

function validSections(value: unknown, roadCoordinates: AscentPadApproachCoordinate[]) {
  if (!Array.isArray(value)) return null;
  const sections: AscentPadApproachSection[] = [];
  let unapprovedStarted = false;
  let lastExactSourceStepOrder = 0;
  for (const [index, raw] of value.entries()) {
    const section = object(raw);
    const maneuver = validManeuver(section.maneuver);
    const matchState = section.matchState;
    const lineStyle = section.lineStyle;
    const colorRole = section.colorRole;
    const authority = section.authority;
    const structural = matchState === "structural_zero_distance";
    const exact = matchState === "matched_exact_master";
    const unapproved = matchState === "unapproved_unnamed"
      || matchState === "unapproved_identity_mismatch"
      || matchState === "unapproved_after_first_mismatch";
    if (!Number.isInteger(section.sectionOrder)
      || section.sectionOrder !== index + 1
      || !Number.isInteger(section.coordinateStartIndex)
      || !Number.isInteger(section.coordinateEndIndex)
      || Number(section.coordinateStartIndex) < 0
      || Number(section.coordinateEndIndex) < Number(section.coordinateStartIndex)
      || Number(section.coordinateEndIndex) >= roadCoordinates.length
      || (index > 0 && Number(section.coordinateStartIndex) !== sections[index - 1].coordinateEndIndex)
      || !finiteNonnegative(section.distanceMeters)
      || !finiteNonnegative(section.distanceMiles)
      || !milesReconcile(section.distanceMeters, section.distanceMiles)
      || !finiteNonnegative(section.durationSeconds)
      || !maneuver
      || !nonemptyText(section.instruction)
      || (!structural && !exact && !unapproved)) return null;

    if (structural) {
      if (lineStyle !== "none" || colorRole !== "none" || authority !== "osrm_structural_step") return null;
    } else if (exact) {
      if (unapprovedStarted
        || lineStyle !== "solid"
        || colorRole !== "teal"
        || authority !== "exact_master_identity_match"
        || !Number.isInteger(section.sourceStepOrder)
        || Number(section.sourceStepOrder) < 1
        || Number(section.sourceStepOrder) < lastExactSourceStepOrder
        || !nonemptyText(section.sourceRoadId)
        || !nonemptyText(section.sourceDisplayRoad)
        || !section.instruction.includes(section.sourceDisplayRoad)
        || !exactDigest(section.matchedIdentitySha256)
        || Number(section.coordinateEndIndex) <= Number(section.coordinateStartIndex)) return null;
      lastExactSourceStepOrder = Number(section.sourceStepOrder);
    } else {
      unapprovedStarted = true;
      if (lineStyle !== "dashed"
        || colorRole !== "unapproved"
        || authority !== "unapproved_routed_remainder"
        || section.instruction !== "Continue on unnamed/unapproved access"
        || section.sourceStepOrder !== null
        || section.sourceRoadId !== null
        || section.sourceDisplayRoad !== null
        || section.matchedIdentitySha256 !== null
        || Number(section.coordinateEndIndex) <= Number(section.coordinateStartIndex)) return null;
    }
    sections.push({
      sectionOrder: section.sectionOrder as number,
      coordinateStartIndex: section.coordinateStartIndex as number,
      coordinateEndIndex: section.coordinateEndIndex as number,
      distanceMeters: section.distanceMeters,
      distanceMiles: section.distanceMiles,
      durationSeconds: section.durationSeconds,
      maneuver,
      instruction: section.instruction,
      matchState: matchState as AscentPadApproachSection["matchState"],
      lineStyle: lineStyle as AscentPadApproachLineStyle,
      colorRole: colorRole as AscentPadApproachSection["colorRole"],
      authority: authority as AscentPadApproachSectionAuthority,
      sourceStepOrder: section.sourceStepOrder as number | null,
      sourceRoadId: section.sourceRoadId as string | null,
      sourceDisplayRoad: section.sourceDisplayRoad as string | null,
      matchedIdentitySha256: section.matchedIdentitySha256 as string | null,
    });
  }
  return sections;
}

function validSourceDirections(value: unknown): AscentPadApproachDirection[] | null {
  if (!Array.isArray(value)) return null;
  const directions: AscentPadApproachDirection[] = [];
  let genericStarted = false;
  for (const [index, raw] of value.entries()) {
    const direction = object(raw);
    const named = direction.instructionRole === "named_public_road";
    const generic = direction.instructionRole === "generic_unapproved_access";
    if (!Number.isInteger(direction.directionOrder)
      || direction.directionOrder !== index + 1
      || !Number.isInteger(direction.sourceStepOrder)
      || Number(direction.sourceStepOrder) < 1
      || (!named && !generic)
      || !nullableFiniteNonnegative(direction.sourceDistanceMiles)
      || !(direction.sourceTurnDirection === null || typeof direction.sourceTurnDirection === "string")
      || !nonemptyText(direction.instruction)) return null;
    if (named) {
      if (genericStarted || !nonemptyText(direction.sourceDisplayRoad)) return null;
    } else {
      genericStarted = true;
      if (direction.sourceDisplayRoad !== null
        || direction.sourceTurnDirection !== null
        || direction.instruction !== "Continue on unnamed/unapproved access") return null;
    }
    directions.push({
      directionOrder: index + 1,
      displayName: named ? direction.sourceDisplayRoad as string : "Unnamed / unapproved access",
      instruction: named ? direction.instruction : "Continue on unnamed/unapproved access",
      distanceMiles: direction.sourceDistanceMiles,
      authority: named ? "named_public_road" : "generic_unapproved_access",
      measurement: "saved_source_mileage",
    });
  }
  return directions;
}

function measuredDirections(sections: AscentPadApproachSection[]): AscentPadApproachDirection[] {
  return sections
    .filter((section) => section.lineStyle !== "none")
    .map((section, index) => ({
      directionOrder: index + 1,
      displayName: section.lineStyle === "solid"
        ? section.sourceDisplayRoad as string
        : "Unnamed / unapproved access",
      instruction: section.lineStyle === "solid"
        ? section.instruction
        : "Continue on unnamed/unapproved access",
      distanceMiles: section.distanceMiles,
      authority: section.lineStyle === "solid"
        ? "named_public_road" as const
        : "generic_unapproved_access" as const,
      measurement: "measured_route_section" as const,
    }));
}

function validGpsTether(
  value: unknown,
  roadCoordinates: AscentPadApproachCoordinate[],
  destination: AscentPadApproachCoordinate,
): AscentPadApproachGpsTether | null | undefined {
  if (value === null) return null;
  const tether = object(value);
  if (tether.type !== "LineString"
    || tether.lineStyle !== "dashed"
    || tether.colorRole !== "gps"
    || tether.authority !== "unapproved_straight_network_snap_to_saved_gps"
    || tether.navigationGeometry !== false
    || !finiteNonnegative(tether.distanceMeters)
    || !finiteNonnegative(tether.distanceMiles)
    || !milesReconcile(tether.distanceMeters, tether.distanceMiles)
    || typeof tether.nontrivial !== "boolean"
    || !Array.isArray(tether.coordinates)
    || tether.coordinates.length !== 2
    || !tether.coordinates.every(coordinate)
    || !roadCoordinates.length
    || !sameCoordinate(tether.coordinates[0], roadCoordinates.at(-1) as AscentPadApproachCoordinate)
    || !sameCoordinate(tether.coordinates[1], destination)) return undefined;
  return {
    type: "LineString",
    lineStyle: "dashed",
    colorRole: "gps",
    authority: "unapproved_straight_network_snap_to_saved_gps",
    navigationGeometry: false,
    distanceMeters: tether.distanceMeters,
    distanceMiles: tether.distanceMiles,
    nontrivial: tether.nontrivial,
    coordinates: tether.coordinates,
  };
}

function validMileage(value: unknown, sections: AscentPadApproachSection[], tether: AscentPadApproachGpsTether | null) {
  const mileage = object(value);
  if (!nullableFiniteNonnegative(mileage.roadDistanceMeters)
    || !nullableFiniteNonnegative(mileage.roadDistanceMiles)
    || !nullableFiniteNonnegative(mileage.totalToGpsMeters)
    || !nullableFiniteNonnegative(mileage.totalToGpsMiles)
    || mileage.gpsTetherExcluded !== true) return null;
  if (mileage.roadDistanceMeters === null || mileage.roadDistanceMiles === null) {
    if (sections.length || mileage.roadDistanceMeters !== null || mileage.roadDistanceMiles !== null) return null;
  } else {
    const sectionMeters = sections.reduce((sum, section) => sum + section.distanceMeters, 0);
    if (Math.abs(sectionMeters - mileage.roadDistanceMeters) > 2
      || !milesReconcile(mileage.roadDistanceMeters, mileage.roadDistanceMiles)) return null;
  }
  if (mileage.totalToGpsMeters === null || mileage.totalToGpsMiles === null) {
    if (mileage.totalToGpsMeters !== null || mileage.totalToGpsMiles !== null) return null;
  } else if (!milesReconcile(mileage.totalToGpsMeters, mileage.totalToGpsMiles)
    || tether?.nontrivial
    || mileage.roadDistanceMeters === null
    || Math.abs(mileage.totalToGpsMeters - mileage.roadDistanceMeters) > 2) return null;
  if (tether?.nontrivial && (mileage.totalToGpsMeters !== null || mileage.totalToGpsMiles !== null)) return null;
  return {
    roadDistanceMeters: mileage.roadDistanceMeters,
    roadDistanceMiles: mileage.roadDistanceMiles,
    totalToGpsMeters: mileage.totalToGpsMeters,
    totalToGpsMiles: mileage.totalToGpsMiles,
    gpsTetherExcluded: true as const,
  };
}

function buildRecord(value: unknown): AscentPadApproachRecord | null {
  const record = object(value);
  const destination = object(record.destination);
  const lastHighway = validLastHighway(record.lastHighway);
  const start = validStart(record.start);
  const sourceDirections = validSourceDirections(record.sourceDirections);
  const status = record.status;
  const roadCoordinates = Array.isArray(record.roadCoordinates) && record.roadCoordinates.every(coordinate)
    ? record.roadCoordinates as AscentPadApproachCoordinate[]
    : null;
  if (!nonemptyText(record.padId)
    || !nullableText(record.canonicalId)
    || !nullableText(record.legacyId)
    || (!record.canonicalId && !record.legacyId)
    || !nonemptyText(record.recordRevision)
    || !nonemptyText(record.padName)
    || record.company !== "Ascent"
    || !nonemptyText(record.state)
    || !nonemptyText(record.county)
    || typeof record.structuredRoadSequence !== "string"
    || !coordinate(destination.coordinates)
    || !nonemptyText(destination.gpsSource)
    || !nonemptyText(destination.directoryCoordinateRole)
    || lastHighway === undefined
    || start === undefined
    || !sourceDirections
    || (status !== "ROUTED_DISPLAY" && status !== "ROUTED_FAIL_CLOSED" && status !== "PIN_ONLY")
    || !nonemptyText(record.reason)
    || !roadCoordinates) return null;
  const sections = validSections(record.sections, roadCoordinates);
  if (!sections) return null;
  const gpsTether = validGpsTether(record.gpsTether, roadCoordinates, destination.coordinates);
  if (gpsTether === undefined) return null;
  const mileage = validMileage(record.mileage, sections, gpsTether);
  if (!mileage) return null;
  const solidCount = sections.filter((section) => section.lineStyle === "solid").length;
  const validReason = status === "ROUTED_DISPLAY"
    ? record.reason === "exact_named_prefix_then_unapproved_remainder"
      || record.reason === "exact_named_route_reaches_network_snap"
    : status === "ROUTED_FAIL_CLOSED"
      ? record.reason === "no_routed_section_matches_ordered_exact_master_roads"
      : record.reason === "no_exact_last_interstate_us_or_state_highway"
        || record.reason === "no_exact_intersection_or_candidate_highway_start"
        || record.reason === "all_osrm_candidates_failed"
        || record.reason === "candidate_start_lacks_exact_master_last_highway_road_id_anchor"
        || record.reason === "candidate_start_exceeds_25_air_miles_from_destination";
  if (!validReason) return null;
  if (status !== "ROUTED_DISPLAY") {
    if (start !== null || roadCoordinates.length || sections.length || gpsTether !== null
      || mileage.roadDistanceMeters !== null || mileage.totalToGpsMeters !== null) return null;
  } else {
    if (!lastHighway || !start || roadCoordinates.length < 2 || !sections.length || !gpsTether
      || coordinateDistanceMeters(start.snappedCoordinate, roadCoordinates[0]) > 2) return null;
    const measuredStartToDestinationAirMiles = coordinateDistanceMeters(
      start.requestedCoordinate,
      destination.coordinates,
    ) / metersPerMile;
    // A displayable route start must be anchored to the exact master identity
    // of this record's last highway and remain spatially relevant to this pad.
    // Name-only or remote starts fail closed before any geometry is exposed.
    if (start.anchoredRoadId !== lastHighway.roadId
      || measuredStartToDestinationAirMiles > maximumStartToDestinationAirMiles
      || Math.abs(measuredStartToDestinationAirMiles - start.startToDestinationAirMiles) > .002) return null;
    if (solidCount < 1) return null;
  }
  const presentationFailedClosed = status !== "ROUTED_DISPLAY";
  return {
    padId: record.padId,
    canonicalId: record.canonicalId,
    legacyId: record.legacyId,
    recordRevision: record.recordRevision,
    padName: record.padName,
    company: "Ascent",
    state: record.state,
    county: record.county,
    structuredRoadSequence: record.structuredRoadSequence,
    destination: {
      coordinates: destination.coordinates,
      gpsSource: destination.gpsSource,
      directoryCoordinateRole: destination.directoryCoordinateRole,
    },
    lastHighway,
    status,
    reason: record.reason,
    // The generated artifact and this runtime projection both keep a route
    // with no exact named prefix presentation-equivalent to pin-only. No
    // candidate geometry, directions, tether, or mileage crosses this boundary.
    start: presentationFailedClosed ? null : start,
    roadCoordinates: presentationFailedClosed ? [] : roadCoordinates,
    sections: presentationFailedClosed ? [] : sections,
    gpsTether: presentationFailedClosed ? null : gpsTether,
    mileage: presentationFailedClosed ? {
      roadDistanceMeters: null,
      roadDistanceMiles: null,
      totalToGpsMeters: null,
      totalToGpsMiles: null,
      gpsTetherExcluded: true,
    } : mileage,
    directions: presentationFailedClosed ? [] : measuredDirections(sections),
  };
}

/** Parses the static build artifact. Invalid and duplicate records fail closed independently. */
export function parseAscentPadApproachArtifact(value: unknown): ParsedCatalog {
  if (!batchHeaderIsValid(value)) return emptyCatalog();
  const rawRecords = object(value).records as unknown[];
  const byPadId = new Map<string, AscentPadApproachRecord>();
  const duplicates = new Set<string>();
  for (const rawRecord of rawRecords) {
    const padId = object(rawRecord).padId;
    if (!nonemptyText(padId)) continue;
    if (byPadId.has(padId) || duplicates.has(padId)) {
      byPadId.delete(padId);
      duplicates.add(padId);
      continue;
    }
    const record = buildRecord(rawRecord);
    if (record) byPadId.set(padId, record);
  }
  for (const padId of duplicates) byPadId.delete(padId);
  return { records: [...byPadId.values()], byPadId };
}

let catalogPromise: Promise<ParsedCatalog> | null = null;

/** The large 192-pad artifact is split from the initial bundle and parsed once. */
export function loadAscentPadApproachCatalog() {
  if (!catalogPromise) {
    catalogPromise = import("./ascentPadApproaches.batch2.json")
      .then((module) => parseAscentPadApproachArtifact(module.default))
      .catch(() => emptyCatalog());
  }
  return catalogPromise;
}

function exactDirectoryBinding(pad: PadSummary, record: AscentPadApproachRecord) {
  const directoryCoordinate = mapDisplayCoordinate(pad);
  return pad.padId === record.padId
    && pad.canonicalId === record.canonicalId
    && pad.legacyId === record.legacyId
    && pad.recordRevision === record.recordRevision
    && pad.padName === record.padName
    && pad.company === record.company
    && pad.state === record.state
    && pad.county === record.county
    && pad.structuredRoadSequence === record.structuredRoadSequence
    && directoryCoordinate?.longitude === record.destination.coordinates[0]
    && directoryCoordinate.latitude === record.destination.coordinates[1];
}

export async function loadAscentPadApproachForPad(pad: PadSummary) {
  const catalog = await loadAscentPadApproachCatalog();
  const record = catalog.byPadId.get(pad.padId);
  return record && exactDirectoryBinding(pad, record) ? record : null;
}

export async function loadAscentPadApproachesForDirectory(pads: readonly PadSummary[]) {
  const catalog = await loadAscentPadApproachCatalog();
  const padById = new Map<string, PadSummary>();
  const duplicates = new Set<string>();
  for (const pad of pads) {
    if (!catalog.byPadId.has(pad.padId)) continue;
    if (padById.has(pad.padId)) duplicates.add(pad.padId);
    else padById.set(pad.padId, pad);
  }
  for (const padId of duplicates) padById.delete(padId);
  return catalog.records.filter((record) => {
    const pad = padById.get(record.padId);
    return Boolean(pad && exactDirectoryBinding(pad, record));
  });
}

function mergeMapLines(lines: AscentPadApproachMapLine[]) {
  const merged: AscentPadApproachMapLine[] = [];
  for (const line of lines) {
    const prior = merged.at(-1);
    if (prior
      && prior.colorRole === line.colorRole
      && sameCoordinate(prior.coordinates.at(-1) as AscentPadApproachCoordinate, line.coordinates[0])) {
      prior.coordinates.push(...line.coordinates.slice(1));
      if (line.label !== prior.label && !prior.label.includes(line.label)) prior.label += ` → ${line.label}`;
    } else {
      merged.push({ ...line, coordinates: [...line.coordinates] });
    }
  }
  return merged;
}

export function ascentPadApproachMapDisplay(record: AscentPadApproachRecord): AscentPadApproachMapDisplay | null {
  // A route with no exact matched prefix is diagnostic evidence only. Its
  // generic OSRM path is never painted as if it were a usable field approach.
  if (record.status !== "ROUTED_DISPLAY") return null;
  const sectionLines = record.sections.flatMap((section): AscentPadApproachMapLine[] => {
    if (section.lineStyle === "none") return [];
    const coordinates = record.roadCoordinates.slice(
      section.coordinateStartIndex,
      section.coordinateEndIndex + 1,
    );
    if (coordinates.length < 2) return [];
    return [{
      type: "LineString",
      colorRole: section.lineStyle === "solid" ? "teal" : "gps",
      label: section.lineStyle === "solid"
        ? section.sourceDisplayRoad as string
        : "Unnamed / unapproved access",
      coordinates,
    }];
  });
  const lines = mergeMapLines(sectionLines);
  if (record.gpsTether?.nontrivial) {
    lines.push({
      type: "LineString",
      colorRole: "gps",
      label: "Straight GPS tether · not road geometry",
      coordinates: [...record.gpsTether.coordinates],
    });
  }
  return lines.length ? { kind: "batch2-approach", padId: record.padId, company: "Ascent", lines } : null;
}

export function ascentPadApproachMapDisplays(records: readonly AscentPadApproachRecord[]) {
  return records.flatMap((record) => {
    const display = ascentPadApproachMapDisplay(record);
    return display ? [display] : [];
  });
}
