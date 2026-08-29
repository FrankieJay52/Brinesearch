import { mapDisplayCoordinate } from "@/data/mapDisplayCoordinates";
import type { PadSummary } from "@/data/types";

export type AscentPadApproachCoordinate = [number, number];
export type AscentPadApproachStatus = "ROUTED_DISPLAY" | "ROUTED_FAIL_CLOSED" | "PIN_ONLY";
export type AscentPadApproachLineStyle = "solid" | "none";
export type AscentPadApproachMatchState =
  | "structural_zero_distance"
  | "matched_exact_master"
  | "matched_ordered_source_and_exact_graph_receipt"
  | "graph_identified_unapproved_source_gap"
  | "graph_identified_after_first_source_gap"
  | "unverified_graph_gap"
  | "unverified_after_first_source_gap"
  | "unverified_graph_receipt_missing"
  | "unapproved_unnamed"
  | "unapproved_identity_mismatch"
  | "unapproved_after_first_mismatch";
export type AscentPadApproachSectionAuthority =
  | "osrm_structural_step"
  | "exact_master_identity_match"
  | "unapproved_routed_remainder"
  | "immutable_graph_evidence_receipt"
  | "exact_graph_identity_unapproved_for_ordered_source_route"
  | "unverified_graph_evidence"
  | "permanent_stop_after_source_or_graph_gap"
  | "graph_evidence_receipt_missing";

export interface AscentPadApproachDirection {
  directionOrder: number;
  displayName: string;
  instruction: string;
  distanceMiles: number | null;
  authority:
    | "named_public_road"
    | "graph_identified_unapproved"
    | "generic_unapproved_access";
  measurement: "measured_route_section" | "saved_source_mileage";
  matchState: Exclude<AscentPadApproachMatchState, "structural_zero_distance"> | null;
}

export interface AscentPadApproachSection {
  sectionOrder: number;
  parentSectionOrder: number;
  graphEvidenceRunOrder: number | null;
  coordinateStartIndex: number;
  coordinateEndIndex: number;
  coordinates: AscentPadApproachCoordinate[];
  distanceMeters: number;
  distanceMiles: number;
  durationSeconds: number;
  maneuver: {
    type: string;
    modifier: string | null;
    exit: number | null;
  };
  instruction: string;
  matchState: AscentPadApproachMatchState;
  lineStyle: AscentPadApproachLineStyle;
  colorRole: "teal" | "unapproved" | "unverified" | "none";
  authority: AscentPadApproachSectionAuthority;
  sourceStepOrder: number | null;
  sourceRoadId: string | null;
  sourceIdentityId: string | null;
  sourceDisplayRoad: string | null;
  routeSystem: string | null;
  routeNumber: string | null;
  county: string | null;
  sourceMatch: "ordered_exact" | "graph_named_only" | null;
  matchedSourceRoadId: string | null;
  routerReportedUnverifiedLabel: string | null;
  matchedIdentitySha256: string | null;
  graphEvidence: Record<string, unknown> | null;
}

export interface AscentPadApproachGpsTether {
  type: "LineString";
  lineStyle: "solid";
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
  graphEvidence: {
    receiptApplied: boolean;
    receiptKeySha256: string | null;
    receiptSha256: string | null;
    routeCoordinateSha256: string | null;
  } | null;
}

export interface AscentPadApproachMapLine {
  type: "LineString";
  colorRole: "teal" | "unverified" | "gps";
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

type UnapprovedMatchState = Extract<AscentPadApproachMatchState, `unapproved_${string}`>;

function unapprovedPresentation(
  matchState: UnapprovedMatchState,
  routerReportedUnverifiedLabel: string | null = null,
) {
  if (routerReportedUnverifiedLabel) {
    return {
      displayName: routerReportedUnverifiedLabel,
      instruction: `Continue on ${routerReportedUnverifiedLabel}`,
      authorityLabel: "Router-reported / graph-unverified · solid neutral",
    };
  }
  return matchState === "unapproved_unnamed"
    ? {
      displayName: "Unnamed / unapproved access",
      instruction: "Continue on unnamed/unapproved access",
      authorityLabel: "Unnamed / unapproved · solid neutral",
    }
    : {
      displayName: "Unverified / unapproved access",
      instruction: "Continue on unverified/unapproved access",
      authorityLabel: "Unverified / unapproved · solid neutral",
    };
}

export function ascentPadApproachDirectionAuthorityLabel(direction: AscentPadApproachDirection) {
  if (direction.authority === "named_public_road") return "Exact identity match · solid teal";
  if (direction.authority === "graph_identified_unapproved") {
    return "Graph-identified / unapproved · solid neutral";
  }
  return direction.matchState && direction.matchState.startsWith("unapproved_")
    ? unapprovedPresentation(direction.matchState as UnapprovedMatchState).authorityLabel
    : "Unverified / unapproved · solid neutral";
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validRouterReportedUnverifiedLabel(value: unknown): value is string | null {
  return value === null || (
    nonemptyText(value)
    && value.endsWith(" · router-reported / graph-unverified")
  );
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

function evidenceDigest(value: unknown): value is string {
  return typeof value === "string" && /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/.test(value);
}

function uuidText(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

function validGraphEvidenceRun(
  value: unknown,
  parentSectionOrder: number,
  runOrder: number,
  exact: boolean,
) {
  const run = object(value);
  if (run.runOrder !== runOrder
    || run.sectionOrder !== parentSectionOrder
    || (run.state !== "exact" && run.state !== "unresolved")
    || !finiteNonnegative(run.startMeasureMeters)
    || !finiteNonnegative(run.endMeasureMeters)
    || Number(run.endMeasureMeters) <= Number(run.startMeasureMeters)
    || !finiteNonnegative(run.startFraction)
    || !finiteNonnegative(run.endFraction)
    || Number(run.endFraction) <= Number(run.startFraction)
    || Number(run.endFraction) > 1) return null;
  if (exact !== (run.state === "exact")) return null;
  if (!exact) {
    if (!nonemptyText(run.unresolvedReason)) return null;
    return run;
  }
  if (!uuidText(run.identityId)
    || !(run.roadId === null || run.roadId === undefined || uuidText(run.roadId))
    || !nonemptyText(run.displayName)
    || !nonemptyText(run.routeSystem)
    || !/^[A-Z][A-Z0-9-]{0,15}$/.test(run.routeSystem)
    || !nonemptyText(run.routeNumber)
    || !nonemptyText(run.county)
    || !evidenceDigest(run.sourceDigest)
    || !evidenceDigest(run.geometryDigest)
    || !evidenceDigest(run.buildDigest)
    || !(run.junctionDigest === null || evidenceDigest(run.junctionDigest))
    || (run.sourceMatch !== "ordered_exact" && run.sourceMatch !== "graph_named_only")) return null;
  if (run.sourceMatch === "ordered_exact") {
    if (!Number.isInteger(run.matchedSourceStepOrder)
      || Number(run.matchedSourceStepOrder) < 1
      || !uuidText(run.matchedSourceRoadId)
      || run.roadId !== run.matchedSourceRoadId) return null;
  } else if (run.matchedSourceStepOrder !== undefined || run.matchedSourceRoadId !== undefined) {
    return null;
  }
  return run;
}

function batchHeaderIsValid(value: unknown) {
  const artifact = object(value);
  const rules = object(artifact.rules);
  const summary = object(artifact.summary);
  const legacyDashedArtifact = artifact.schemaVersion === 1;
  const solidNeutralArtifact = artifact.schemaVersion === 2;
  const graphEvidenceArtifact = artifact.schemaVersion === 3;
  const versionedSummaryIsValid = legacyDashedArtifact
    ? summary.routedDisplayCount === 95
      && summary.routedFailClosedCount === 16
      && summary.pinOnlyCount === 81
      && summary.exactIntersectionStartCount === 28
      && summary.candidateNearestHighwayStartCount === 67
      && summary.nontrivialGpsTetherCount === 82
      && summary.totalToGpsWithheldCount === 82
    : (solidNeutralArtifact || graphEvidenceArtifact)
      && summary.routedDisplayCount === 111
      && summary.routedFailClosedCount === 0
      && summary.pinOnlyCount === 81
      && finiteNonnegative(summary.retainedRouterUnverifiedRouteCount)
      && Number(summary.retainedRouterUnverifiedRouteCount) <= 16
      && Number(summary.exactIntersectionStartCount)
        + Number(summary.candidateNearestHighwayStartCount) === 111
      && finiteNonnegative(summary.nontrivialGpsTetherCount)
      && summary.totalToGpsWithheldCount === summary.nontrivialGpsTetherCount
      && (!graphEvidenceArtifact || (
        finiteNonnegative(summary.graphEvidenceReceiptCount)
        && Number(summary.graphEvidenceReceiptCount) > 0
        && summary.appliedGraphEvidenceReceiptCount === summary.graphEvidenceReceiptCount
        && finiteNonnegative(summary.graphEvidenceNamedRunCount)
        && finiteNonnegative(summary.graphEvidenceOrderedExactRunCount)
        && finiteNonnegative(summary.graphEvidenceNamedNeutralRunCount)
        && finiteNonnegative(summary.graphEvidenceUnresolvedRunCount)
      ));
  const versionedPresentationIsValid = legacyDashedArtifact
    ? rules.unmatchedPrivateAndUnnamedRoadsAreGenericDashed === true
      && rules.gpsTetherIsSeparateStraightUnapprovedGeometry === true
      && summary.solidSectionCount === 163
      && summary.dashedSectionCount === 333
    : (solidNeutralArtifact || graphEvidenceArtifact)
      && rules.unmatchedPrivateAndUnnamedRoadsStayVisibleAsSolidUnapproved === true
      && rules.unapprovedLabelsReflectMatchState === true
      && rules.successfulOsrmCandidateGeometryIsNeverDiscarded === true
      && rules.routerLabelsAreExplicitlyGraphUnverified === true
      && rules.gpsTetherIsSeparateStraightSolidUnapprovedGeometry === true
      && finiteNonnegative(summary.solidSectionCount)
      && finiteNonnegative(summary.solidUnapprovedSectionCount)
      && Number(summary.solidUnapprovedSectionCount) <= Number(summary.solidSectionCount)
      && (!graphEvidenceArtifact || (
        rules.graphEvidenceReceiptsFailClosedOnSchemaKeyHashOrCoverageDrift === true
        && rules.onlyUninterruptedOrderedExactGraphRunsCanBeTeal === true
        && rules.graphNamedOnlyAndUnresolvedRunsPermanentlyStopTeal === true
        && rules.graphNamedRunsRetainExactIdentityWhenNeutral === true
        && rules.routesWithoutGraphEvidenceStayVisibleAsSolidNeutral === true
        && rules.baseRoadCoordinatesAndMeasuredRoadMileageArePreserved === true
      ));
  return (legacyDashedArtifact || solidNeutralArtifact || graphEvidenceArtifact)
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
    && versionedPresentationIsValid
    && versionedSummaryIsValid
    && rules.gpsTetherExcludedFromRoadMileage === true
    && rules.nontrivialGpsTetherMakesTotalToGpsNull === true
    && rules.noProductionWrites === true
    && rules.noGoogleUrlChanges === true
    && rules.noRedGeometry === true
    && summary.sourcePadCount === 192
    && summary.outputPadCount === 192
    && summary.remoteStartRejectedPinOnlyCount === 5
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

function validSections(
  value: unknown,
  roadCoordinates: AscentPadApproachCoordinate[],
  schemaVersion: number,
) {
  if (!Array.isArray(value)) return null;
  const legacyDashedArtifact = schemaVersion === 1;
  const graphEvidenceArtifact = schemaVersion === 3;
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
    const legacyExact = matchState === "matched_exact_master";
    const graphOrderedExact = matchState === "matched_ordered_source_and_exact_graph_receipt";
    const graphNamedNeutral = matchState === "graph_identified_unapproved_source_gap"
      || matchState === "graph_identified_after_first_source_gap";
    const graphUnresolved = matchState === "unverified_graph_gap"
      || matchState === "unverified_after_first_source_gap"
      || matchState === "unverified_graph_receipt_missing";
    const routerReportedLabel = schemaVersion === 1
      ? null
      : section.routerReportedUnverifiedLabel;
    const legacyUnapproved = matchState === "unapproved_unnamed"
      || matchState === "unapproved_identity_mismatch"
      || matchState === "unapproved_after_first_mismatch";
    const parentSectionOrder = graphEvidenceArtifact
      ? section.parentSectionOrder
      : section.sectionOrder;
    const graphEvidenceRunOrder = graphEvidenceArtifact
      ? section.graphEvidenceRunOrder
      : null;
    const sectionCoordinates = graphEvidenceArtifact
      ? section.coordinates
      : roadCoordinates.slice(
        Number(section.coordinateStartIndex),
        Number(section.coordinateEndIndex) + 1,
      );
    if (!Number.isInteger(section.sectionOrder)
      || section.sectionOrder !== index + 1
      || !Number.isInteger(parentSectionOrder)
      || Number(parentSectionOrder) < 1
      || !(graphEvidenceRunOrder === null
        || (Number.isInteger(graphEvidenceRunOrder) && Number(graphEvidenceRunOrder) > 0))
      || !Number.isInteger(section.coordinateStartIndex)
      || !Number.isInteger(section.coordinateEndIndex)
      || Number(section.coordinateStartIndex) < 0
      || Number(section.coordinateEndIndex) < Number(section.coordinateStartIndex)
      || Number(section.coordinateEndIndex) >= roadCoordinates.length
      || (!graphEvidenceArtifact
        && index > 0
        && Number(section.coordinateStartIndex) !== sections[index - 1].coordinateEndIndex)
      || !Array.isArray(sectionCoordinates)
      || !sectionCoordinates.every(coordinate)
      || (!structural && sectionCoordinates.length < 2)
      || !finiteNonnegative(section.distanceMeters)
      || !finiteNonnegative(section.distanceMiles)
      || !milesReconcile(section.distanceMeters, section.distanceMiles)
      || !finiteNonnegative(section.durationSeconds)
      || !maneuver
      || !nonemptyText(section.instruction)
      || !validRouterReportedUnverifiedLabel(routerReportedLabel)
      || (!structural
        && !legacyExact
        && !graphOrderedExact
        && !graphNamedNeutral
        && !graphUnresolved
        && !legacyUnapproved)) return null;

    if (structural) {
      if (lineStyle !== "none"
        || colorRole !== "none"
        || authority !== "osrm_structural_step"
        || routerReportedLabel !== null
        || (graphEvidenceArtifact
          && (graphEvidenceRunOrder !== null || section.graphEvidence !== null))) return null;
    } else if (legacyExact) {
      if (unapprovedStarted
        || graphEvidenceArtifact
        || lineStyle !== "solid"
        || colorRole !== "teal"
        || authority !== "exact_master_identity_match"
        || !Number.isInteger(section.sourceStepOrder)
        || Number(section.sourceStepOrder) < 1
        || Number(section.sourceStepOrder) < lastExactSourceStepOrder
        || !nonemptyText(section.sourceRoadId)
        || !nonemptyText(section.sourceDisplayRoad)
        || routerReportedLabel !== null
        || !section.instruction.includes(section.sourceDisplayRoad)
        || !exactDigest(section.matchedIdentitySha256)
        || Number(section.coordinateEndIndex) <= Number(section.coordinateStartIndex)) return null;
      lastExactSourceStepOrder = Number(section.sourceStepOrder);
    } else if (graphOrderedExact) {
      const evidence = validGraphEvidenceRun(
        section.graphEvidence,
        Number(parentSectionOrder),
        Number(graphEvidenceRunOrder),
        true,
      );
      if (!graphEvidenceArtifact
        || unapprovedStarted
        || lineStyle !== "solid"
        || colorRole !== "teal"
        || authority !== "immutable_graph_evidence_receipt"
        || !Number.isInteger(section.sourceStepOrder)
        || Number(section.sourceStepOrder) < 1
        || Number(section.sourceStepOrder) < lastExactSourceStepOrder
        || !uuidText(section.sourceRoadId)
        || !uuidText(section.sourceIdentityId)
        || !nonemptyText(section.sourceDisplayRoad)
        || !nonemptyText(section.routeSystem)
        || !nonemptyText(section.routeNumber)
        || !nonemptyText(section.county)
        || section.sourceMatch !== "ordered_exact"
        || section.matchedSourceRoadId !== section.sourceRoadId
        || !exactDigest(section.matchedIdentitySha256)
        || !evidence
        || evidence.identityId !== section.sourceIdentityId
        || evidence.roadId !== section.sourceRoadId
        || evidence.displayName !== section.sourceDisplayRoad
        || evidence.matchedSourceStepOrder !== section.sourceStepOrder
        || evidence.matchedSourceRoadId !== section.matchedSourceRoadId
        || !section.instruction.includes(section.sourceDisplayRoad)) return null;
      lastExactSourceStepOrder = Number(section.sourceStepOrder);
    } else if (graphNamedNeutral) {
      const evidence = validGraphEvidenceRun(
        section.graphEvidence,
        Number(parentSectionOrder),
        Number(graphEvidenceRunOrder),
        true,
      );
      unapprovedStarted = true;
      if (!graphEvidenceArtifact
        || lineStyle !== "solid"
        || colorRole !== "unverified"
        || authority !== "exact_graph_identity_unapproved_for_ordered_source_route"
        || !uuidText(section.sourceIdentityId)
        || !(section.sourceRoadId === null || uuidText(section.sourceRoadId))
        || !nonemptyText(section.sourceDisplayRoad)
        || !nonemptyText(section.routeSystem)
        || !nonemptyText(section.routeNumber)
        || !nonemptyText(section.county)
        || (section.sourceMatch !== "ordered_exact" && section.sourceMatch !== "graph_named_only")
        || (section.sourceMatch === "ordered_exact"
          ? !Number.isInteger(section.sourceStepOrder)
            || Number(section.sourceStepOrder) < 1
            || section.matchedSourceRoadId !== section.sourceRoadId
          : section.sourceStepOrder !== null || section.matchedSourceRoadId !== null)
        || routerReportedLabel !== null
        || !exactDigest(section.matchedIdentitySha256)
        || !evidence
        || evidence.identityId !== section.sourceIdentityId
        || (evidence.roadId ?? null) !== section.sourceRoadId
        || evidence.displayName !== section.sourceDisplayRoad
        || evidence.sourceMatch !== section.sourceMatch
        || !section.instruction.includes(section.sourceDisplayRoad)) return null;
    } else if (graphUnresolved) {
      unapprovedStarted = true;
      const receiptMissing = matchState === "unverified_graph_receipt_missing";
      const evidence = receiptMissing
        ? null
        : validGraphEvidenceRun(
          section.graphEvidence,
          Number(parentSectionOrder),
          Number(graphEvidenceRunOrder),
          false,
        );
      if (!graphEvidenceArtifact
        || lineStyle !== "solid"
        || colorRole !== "unverified"
        || (receiptMissing
          ? authority !== "graph_evidence_receipt_missing" || section.graphEvidence !== null
          : (authority !== "unverified_graph_evidence"
              && authority !== "permanent_stop_after_source_or_graph_gap")
            || !evidence)
        || section.sourceStepOrder !== null
        || section.sourceRoadId !== null
        || section.sourceIdentityId !== null
        || section.sourceDisplayRoad !== null
        || section.routeSystem !== null
        || section.routeNumber !== null
        || section.county !== null
        || section.sourceMatch !== null
        || section.matchedSourceRoadId !== null
        || section.matchedIdentitySha256 !== null) return null;
    } else {
      unapprovedStarted = true;
      const presentation = unapprovedPresentation(
        matchState as UnapprovedMatchState,
        routerReportedLabel,
      );
      if (lineStyle !== (legacyDashedArtifact ? "dashed" : "solid")
        || colorRole !== "unapproved"
        || authority !== "unapproved_routed_remainder"
        || section.instruction !== (legacyDashedArtifact
          ? "Continue on unnamed/unapproved access"
          : presentation.instruction)
        || section.sourceStepOrder !== null
        || section.sourceRoadId !== null
        || section.sourceDisplayRoad !== null
        || section.matchedIdentitySha256 !== null
        || Number(section.coordinateEndIndex) <= Number(section.coordinateStartIndex)) return null;
    }
    sections.push({
      sectionOrder: section.sectionOrder as number,
      parentSectionOrder: Number(parentSectionOrder),
      graphEvidenceRunOrder: graphEvidenceRunOrder as number | null,
      coordinateStartIndex: section.coordinateStartIndex as number,
      coordinateEndIndex: section.coordinateEndIndex as number,
      coordinates: sectionCoordinates as AscentPadApproachCoordinate[],
      distanceMeters: section.distanceMeters,
      distanceMiles: section.distanceMiles,
      durationSeconds: section.durationSeconds,
      maneuver,
      instruction: legacyUnapproved
        ? unapprovedPresentation(
          matchState as UnapprovedMatchState,
          routerReportedLabel,
        ).instruction
        : section.instruction,
      matchState: matchState as AscentPadApproachSection["matchState"],
      // Schema 1 encoded unapproved visibility as dashed. Preserve every
      // coordinate while projecting that frozen artifact into the current
      // solid-neutral presentation contract.
      lineStyle: structural ? "none" : "solid",
      colorRole: colorRole as AscentPadApproachSection["colorRole"],
      authority: authority as AscentPadApproachSectionAuthority,
      sourceStepOrder: section.sourceStepOrder as number | null,
      sourceRoadId: section.sourceRoadId as string | null,
      sourceIdentityId: graphEvidenceArtifact ? section.sourceIdentityId as string | null : null,
      sourceDisplayRoad: section.sourceDisplayRoad as string | null,
      routeSystem: graphEvidenceArtifact ? section.routeSystem as string | null : null,
      routeNumber: graphEvidenceArtifact ? section.routeNumber as string | null : null,
      county: graphEvidenceArtifact ? section.county as string | null : null,
      sourceMatch: graphEvidenceArtifact
        ? section.sourceMatch as "ordered_exact" | "graph_named_only" | null
        : null,
      matchedSourceRoadId: graphEvidenceArtifact
        ? section.matchedSourceRoadId as string | null
        : null,
      routerReportedUnverifiedLabel: routerReportedLabel,
      matchedIdentitySha256: section.matchedIdentitySha256 as string | null,
      graphEvidence: graphEvidenceArtifact
        ? section.graphEvidence as Record<string, unknown> | null
        : null,
    });
  }
  if (graphEvidenceArtifact) {
    const painted = sections.filter((section) => section.lineStyle !== "none");
    if (painted.length) {
      if (!sameCoordinate(painted[0].coordinates[0], roadCoordinates[0])
        || !sameCoordinate(
          painted.at(-1)!.coordinates.at(-1)!,
          roadCoordinates.at(-1)!,
        )) return null;
      for (let index = 1; index < painted.length; index += 1) {
        if (!sameCoordinate(
          painted[index - 1].coordinates.at(-1)!,
          painted[index].coordinates[0],
        )) return null;
      }
      const merged = painted.flatMap((section, index) => (
        index === 0 ? section.coordinates : section.coordinates.slice(1)
      ));
      let mergedIndex = 0;
      for (const baseCoordinate of roadCoordinates) {
        while (mergedIndex < merged.length && !sameCoordinate(merged[mergedIndex], baseCoordinate)) {
          mergedIndex += 1;
        }
        if (mergedIndex >= merged.length) return null;
        mergedIndex += 1;
      }
    }
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
      matchState: null,
    });
  }
  return directions;
}

function graphRoadDisplayName(section: AscentPadApproachSection) {
  const name = section.sourceDisplayRoad as string;
  if (!section.routeSystem || !section.routeNumber) return name;
  const designation = section.routeSystem === "SR"
    ? `OH-${section.routeNumber}`
    : `${section.routeSystem}-${section.routeNumber}`;
  const normalizedName = name.toUpperCase().replace(/[^A-Z0-9]/gu, "");
  const normalizedDesignation = designation.toUpperCase().replace(/[^A-Z0-9]/gu, "");
  const normalizedOhioStateDesignation = section.routeSystem === "SR"
    ? `SR${section.routeNumber}`.toUpperCase().replace(/[^A-Z0-9]/gu, "")
    : null;
  if (normalizedName === normalizedDesignation
    || (normalizedOhioStateDesignation !== null && normalizedName === normalizedOhioStateDesignation)) {
    return designation;
  }
  return section.routeSystem === "CR" || section.routeSystem === "TR"
    ? `${name} / ${designation}`
    : `${designation} · ${name}`;
}

function measuredDirections(sections: AscentPadApproachSection[]): AscentPadApproachDirection[] {
  return sections
    .filter((section) => section.lineStyle !== "none")
    .map((section, index) => {
      const approved = section.colorRole === "teal";
      const graphNamedNeutral = section.colorRole === "unverified"
        && section.sourceIdentityId !== null
        && section.sourceDisplayRoad !== null;
      const graphDisplayName = section.sourceIdentityId && section.sourceDisplayRoad
        ? graphRoadDisplayName(section)
        : null;
      const presentation = approved || graphNamedNeutral
        ? null
        : unapprovedPresentation(
          section.matchState.startsWith("unapproved_")
            ? section.matchState as UnapprovedMatchState
            : "unapproved_identity_mismatch",
          section.routerReportedUnverifiedLabel,
        );
      return {
        directionOrder: index + 1,
        displayName: approved || graphNamedNeutral
          ? graphDisplayName || section.sourceDisplayRoad as string
          : presentation!.displayName,
        instruction: approved || graphNamedNeutral
          ? graphDisplayName && section.sourceDisplayRoad
            ? section.instruction.replace(section.sourceDisplayRoad, graphDisplayName)
            : section.instruction
          : presentation!.instruction,
        distanceMiles: section.distanceMiles,
        authority: approved
          ? "named_public_road" as const
          : graphNamedNeutral
            ? "graph_identified_unapproved" as const
          : "generic_unapproved_access" as const,
        measurement: "measured_route_section" as const,
        matchState: section.matchState as Exclude<AscentPadApproachMatchState, "structural_zero_distance">,
      };
    });
}

function validGpsTether(
  value: unknown,
  roadCoordinates: AscentPadApproachCoordinate[],
  destination: AscentPadApproachCoordinate,
  schemaVersion: number,
): AscentPadApproachGpsTether | null | undefined {
  if (value === null) return null;
  const tether = object(value);
  if (tether.type !== "LineString"
    || tether.lineStyle !== (schemaVersion === 1 ? "dashed" : "solid")
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
    lineStyle: "solid",
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

function validRecordGraphEvidence(
  value: unknown,
  schemaVersion: number,
  status: unknown,
): AscentPadApproachRecord["graphEvidence"] | undefined {
  if (schemaVersion !== 3) return null;
  if (status !== "ROUTED_DISPLAY") return null;
  const diagnostics = object(value);
  if (diagnostics.graphEvidenceReceiptApplied === false) {
    if (diagnostics.graphEvidenceStatus !== "missing_route_retained_solid_neutral") return undefined;
    return {
      receiptApplied: false,
      receiptKeySha256: null,
      receiptSha256: null,
      routeCoordinateSha256: null,
    };
  }
  if (diagnostics.graphEvidenceReceiptApplied !== true
    || diagnostics.graphEvidenceStatus !== "sealed_receipt_applied"
    || !exactDigest(diagnostics.graphEvidenceReceiptKeySha256)
    || !exactDigest(diagnostics.graphEvidenceReceiptSha256)
    || !exactDigest(diagnostics.graphEvidenceRouteCoordinateSha256)
    || !Number.isInteger(diagnostics.graphEvidenceBaseSectionCount)
    || Number(diagnostics.graphEvidenceBaseSectionCount) < 1
    || !Number.isInteger(diagnostics.graphEvidenceSectionRunCount)
    || Number(diagnostics.graphEvidenceSectionRunCount) < 1
    || !finiteNonnegative(diagnostics.graphEvidenceNamedRunCount)
    || !finiteNonnegative(diagnostics.graphEvidenceOrderedExactRunCount)
    || !finiteNonnegative(diagnostics.graphEvidenceNamedNeutralRunCount)
    || !finiteNonnegative(diagnostics.graphEvidenceUnresolvedRunCount)) return undefined;
  return {
    receiptApplied: true,
    receiptKeySha256: diagnostics.graphEvidenceReceiptKeySha256,
    receiptSha256: diagnostics.graphEvidenceReceiptSha256,
    routeCoordinateSha256: diagnostics.graphEvidenceRouteCoordinateSha256,
  };
}

function buildRecord(value: unknown, schemaVersion: number): AscentPadApproachRecord | null {
  const record = object(value);
  const destination = object(record.destination);
  const lastHighway = validLastHighway(record.lastHighway);
  const start = validStart(record.start);
  const sourceDirections = validSourceDirections(record.sourceDirections);
  const status = record.status;
  const graphEvidence = validRecordGraphEvidence(record.diagnostics, schemaVersion, status);
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
    || graphEvidence === undefined
    || !sourceDirections
    || (status !== "ROUTED_DISPLAY" && status !== "ROUTED_FAIL_CLOSED" && status !== "PIN_ONLY")
    || !nonemptyText(record.reason)
    || !roadCoordinates) return null;
  const sections = validSections(record.sections, roadCoordinates, schemaVersion);
  if (!sections) return null;
  const gpsTether = validGpsTether(
    record.gpsTether,
    roadCoordinates,
    destination.coordinates,
    schemaVersion,
  );
  if (gpsTether === undefined) return null;
  const mileage = validMileage(record.mileage, sections, gpsTether);
  if (!mileage) return null;
  const exactCount = sections.filter((section) => section.colorRole === "teal").length;
  const validReason = status === "ROUTED_DISPLAY"
    ? record.reason === "exact_named_prefix_then_unapproved_remainder"
      || record.reason === "exact_named_route_reaches_network_snap"
      || record.reason === "router_reported_graph_unverified_route"
      || (schemaVersion === 3 && (
        record.reason === "graph_receipt_ordered_prefix_then_solid_neutral_remainder"
        || record.reason === "graph_receipt_ordered_named_route_reaches_network_snap"
        || record.reason === "graph_evidence_receipt_missing_route_retained"
      ))
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
    if (schemaVersion === 3) {
      if (graphEvidence?.receiptApplied === false
        && (exactCount !== 0 || sections.some((section) => (
          section.lineStyle !== "none" && section.colorRole !== "unverified"
        )))) return null;
    } else {
      const retainedRouterUnverified = record.reason === "router_reported_graph_unverified_route";
      if (retainedRouterUnverified
        ? exactCount !== 0 || sections.some((section) => (
          section.lineStyle !== "none" && section.colorRole !== "unapproved"
        ))
        : exactCount < 1) return null;
    }
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
    // Legacy ROUTED_FAIL_CLOSED artifacts remain presentation-equivalent to
    // pin-only. New successful OSRM candidates use ROUTED_DISPLAY even when
    // they have no exact prefix, retaining every measured section as solid
    // neutral/unapproved geometry with no teal or approval authority.
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
    graphEvidence,
  };
}

/** Parses the static build artifact. Invalid and duplicate records fail closed independently. */
export function parseAscentPadApproachArtifact(value: unknown): ParsedCatalog {
  if (!batchHeaderIsValid(value)) return emptyCatalog();
  const artifact = object(value);
  const rawRecords = artifact.records as unknown[];
  const schemaVersion = Number(artifact.schemaVersion);
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
    const record = buildRecord(rawRecord, schemaVersion);
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
  // Only successfully generated routed displays paint. Routes without an
  // exact graph prefix are still visible, but every section remains neutral
  // and explicitly unapproved rather than becoming teal.
  if (record.status !== "ROUTED_DISPLAY") return null;
  const sectionLines = record.sections.flatMap((section): AscentPadApproachMapLine[] => {
    if (section.lineStyle === "none") return [];
    const coordinates = section.coordinates;
    if (coordinates.length < 2) return [];
    const exact = section.colorRole === "teal";
    const graphNamedNeutral = section.colorRole === "unverified"
      && section.sourceIdentityId !== null
      && section.sourceDisplayRoad !== null;
    return [{
      type: "LineString",
      colorRole: exact ? "teal" : "unverified",
      label: exact
        ? graphRoadDisplayName(section)
        : graphNamedNeutral
          ? graphRoadDisplayName(section)
        : unapprovedPresentation(
          section.matchState.startsWith("unapproved_")
            ? section.matchState as UnapprovedMatchState
            : "unapproved_identity_mismatch",
          section.routerReportedUnverifiedLabel,
        ).displayName,
      coordinates: [...coordinates],
    }];
  });
  const lines = mergeMapLines(sectionLines);
  if (record.gpsTether) {
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
