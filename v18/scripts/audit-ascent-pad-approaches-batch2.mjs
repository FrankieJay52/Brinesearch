import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const v18Root = path.resolve(here, "..");
const artifactRelativePath = "src/features/map/ascentPadApproaches.batch2.json";
const fixtureRelativePath = "scripts/fixtures/ascent-pad-approach-source-20260829.json";
const batch1RelativePath = "src/features/map/ascentPadRoadDisplays.batch1.json";
const runtimeRelativePath = "src/features/map/ascentPadApproaches.ts";
const expectedBatch1Sha256 = "942b0242ffd26f6c8c00d674368f8bc50831f7fc798c4ff375578ed05f582ad6";
const expectedBatch2JsonSha256 = "c150c88d4f6aad7b5ba2d2e3d4da3be6dd499c15af7a609bfb8afa63a1c20f6d";
const metresPerMile = 1609.344;
const maximumDisplayStartToGpsAirMiles = 25;
const epsilon = 0.000001;
const remoteStartPinOnlyNames = new Set(["CENA", "NOELLE", "ROXY", "SPORT", "TANNER"]);

const normalizedText = (value) => value.replace(/\r\n?/gu, "\n");
const sha256Text = (value) => createHash("sha256").update(normalizedText(value), "utf8").digest("hex");
const read = (relative) => fs.readFileSync(path.join(v18Root, relative), "utf8");

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function coordinate(value) {
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

function sameCoordinate(left, right) {
  return coordinate(left) && coordinate(right)
    && left[0] === right[0]
    && left[1] === right[1];
}

function coordinateDistanceMeters(left, right) {
  if (!coordinate(left) || !coordinate(right)) return Number.POSITIVE_INFINITY;
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const leftLatitude = radians(left[1]);
  const rightLatitude = radians(right[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function approximately(left, right, tolerance = epsilon) {
  return finiteNonnegative(left)
    && finiteNonnegative(right)
    && Math.abs(left - right) <= tolerance;
}

function exactFixtureBinding(record, source) {
  return record.padId === source.padId
    && record.canonicalId === source.canonicalId
    && record.legacyId === source.legacyId
    && record.recordRevision === source.recordRevision
    && record.padName === source.padName
    && record.company === source.company
    && record.state === source.state
    && record.county === source.county
    && record.structuredRoadSequence === source.structuredRoadSequence
    && record.destination?.gpsSource === source.destinationGpsSource
    && record.destination?.directoryCoordinateRole === source.directoryCoordinateRole
    && sameCoordinate(record.destination?.coordinates, source.destination);
}

function exactLastHighwayBinding(record, source) {
  const sourceSteps = Array.isArray(source.routePrep?.steps) ? source.routePrep.steps : [];
  const expected = sourceSteps.filter((step) => (
    step.matchStatus === "exact_master"
    && ["interstate", "us_route", "state_route"].includes(step.roadType)
    && text(step.roadId)
  )).at(-1) || null;
  if (!expected) return record.lastHighway === null;
  return record.lastHighway?.sourceStepOrder === expected.stepOrder
    && record.lastHighway?.roadId === expected.roadId
    && record.lastHighway?.displayRoad === expected.canonicalName
    && record.lastHighway?.roadType === expected.roadType;
}

function validateSection(section, index, coordinates, exactSourceSteps, state) {
  const order = index + 1;
  const startIndex = section.coordinateStartIndex;
  const endIndex = section.coordinateEndIndex;
  const maneuver = object(section.maneuver);
  if (section.sectionOrder !== order
    || !Number.isInteger(startIndex)
    || !Number.isInteger(endIndex)
    || startIndex < 0
    || endIndex < startIndex
    || endIndex >= coordinates.length
    || !finiteNonnegative(section.distanceMeters)
    || !approximately(section.distanceMiles, section.distanceMeters / metresPerMile)
    || !finiteNonnegative(section.durationSeconds)
    || !text(maneuver.type)
    || !text(section.instruction)) {
    state.errors.push(`section ${order} has invalid ordering, geometry indexes, maneuver, or raw metre mileage`);
    return;
  }

  if (index > 0 && startIndex !== state.previousEndIndex) {
    state.errors.push(`section ${order} is not contiguous with its predecessor`);
  }
  state.previousEndIndex = endIndex;
  state.distanceMeters += section.distanceMeters;

  if (section.lineStyle === "solid") {
    state.solidCount += 1;
    if (state.sawDashed
      || section.colorRole !== "teal"
      || section.authority !== "exact_master_identity_match"
      || section.matchState !== "matched_exact_master"
      || !Number.isInteger(section.sourceStepOrder)
      || !text(section.sourceRoadId)
      || !text(section.sourceDisplayRoad)
      || !text(section.matchedIdentitySha256)
      || !exactSourceSteps.some((step) => (
        Number(step.stepOrder) === section.sourceStepOrder
        && step.roadId === section.sourceRoadId
        && step.matchStatus === "exact_master"
      ))) {
      state.errors.push(`section ${order} is not a valid exact-identity solid prefix section`);
    }
    return;
  }

  if (section.lineStyle === "dashed") {
    state.sawDashed = true;
    state.dashedCount += 1;
    if (section.colorRole !== "unapproved"
      || section.authority !== "unapproved_routed_remainder"
      || !String(section.matchState || "").startsWith("unapproved")
      || section.sourceStepOrder !== null
      || section.sourceRoadId !== null
      || section.sourceDisplayRoad !== null
      || section.matchedIdentitySha256 !== null) {
      state.errors.push(`section ${order} exposes authority or a road name after the first mismatch`);
    }
    return;
  }

  if (section.lineStyle !== "none"
    || section.colorRole !== "none"
    || section.authority !== "osrm_structural_step"
    || section.matchState !== "structural_zero_distance") {
    state.errors.push(`section ${order} has an unsupported line classification`);
  }
}

function validatePinEquivalent(record) {
  const errors = [];
  if (record.start !== null
    || !Array.isArray(record.roadCoordinates)
    || record.roadCoordinates.length !== 0
    || !Array.isArray(record.sections)
    || record.sections.length !== 0
    || record.gpsTether !== null
    || record.mileage?.roadDistanceMeters !== null
    || record.mileage?.roadDistanceMiles !== null
    || record.mileage?.totalToGpsMeters !== null
    || record.mileage?.totalToGpsMiles !== null
    || record.mileage?.gpsTetherExcluded !== true
    || record.diagnostics?.matchedExactSectionCount !== 0
    || record.diagnostics?.productionWrites !== 0) {
    errors.push("pin-equivalent record contains route geometry, route mileage, or mutable evidence");
  }
  return errors;
}

function validateRejectedCandidate(record) {
  const errors = validatePinEquivalent(record);
  if (record.reason !== "no_routed_section_matches_ordered_exact_master_roads"
    || !Number.isInteger(record.diagnostics?.attemptedCandidateCount)
    || record.diagnostics.attemptedCandidateCount < 1
    || record.diagnostics?.candidateRouteEvidenceStripped !== true
    || !text(record.diagnostics?.routedIdentitySha256)
    || !text(record.diagnostics?.candidateGeometrySha256)) {
    errors.push("rejected routing evidence is not explicitly stripped to pin-only presentation data");
  }
  return errors;
}

function validateRemoteStartPinOnly(record, source) {
  const errors = validatePinEquivalent(record);
  const rejectedCoordinate = source?.routePrep?.nearest_highway_point?.coordinates;
  if (record.status !== "PIN_ONLY"
    || record.reason !== "candidate_start_exceeds_25_air_miles_from_destination"
    || record.diagnostics?.rejectedCandidateCount !== 1
    || record.diagnostics?.anchoredRoadId !== record.lastHighway?.roadId
    || record.diagnostics?.maximumStartToDestinationAirMiles !== maximumDisplayStartToGpsAirMiles
    || !coordinate(rejectedCoordinate)
    || coordinateDistanceMeters(rejectedCoordinate, record.destination?.coordinates)
      <= maximumDisplayStartToGpsAirMiles * metresPerMile
    || !text(record.diagnostics?.rejectedCandidateEvidenceSha256)) {
    errors.push("remote exact-master candidate did not fail closed to its GPS pin with bounded diagnostics");
  }
  return errors;
}

function validateRouted(record, source) {
  const errors = [];
  const coordinates = record.roadCoordinates;
  const sections = record.sections;
  if (!Array.isArray(coordinates)
    || coordinates.length < 2
    || !coordinates.every(coordinate)
    || !Array.isArray(sections)
    || sections.length === 0
    || !coordinate(record.start?.requestedCoordinate)
    || !coordinate(record.start?.snappedCoordinate)
    || !record.lastHighway
    || !text(record.lastHighway.roadId)
    || !finiteNonnegative(record.start?.snapDistanceMeters)
    || record.start?.anchoredRoadId !== record.lastHighway.roadId
    || record.start?.anchorSource !== (
      record.start?.authority === "exact_highway_next_road_intersection"
        ? "exact_master_highway_next_road_intersection"
        : "exact_master_highway_centerline_nearest_point"
    )
    || !finiteNonnegative(record.start?.startToDestinationAirMiles)
    || record.start.startToDestinationAirMiles > maximumDisplayStartToGpsAirMiles
    || !["exact_highway_next_road_intersection", "candidate_nearest_highway_point"].includes(record.start?.authority)
    || record.start.snapDistanceMeters > (
      record.start.authority === "exact_highway_next_road_intersection" ? 25 : 100
    )
    || record.start?.candidateOnly !== (record.start?.authority === "candidate_nearest_highway_point")
    || coordinateDistanceMeters(record.start?.snappedCoordinate, coordinates[0]) > 2
    || coordinateDistanceMeters(record.start?.requestedCoordinate, record.destination?.coordinates)
      > maximumDisplayStartToGpsAirMiles * metresPerMile
    || coordinateDistanceMeters(record.start?.snappedCoordinate, record.destination?.coordinates)
      > maximumDisplayStartToGpsAirMiles * metresPerMile) {
    errors.push("routed record has an invalid start or compact road geometry");
    return errors;
  }
  const independentlyMeasuredStartMiles = coordinateDistanceMeters(
    record.start.requestedCoordinate,
    record.destination.coordinates,
  ) / metresPerMile;
  if (Math.abs(record.start.startToDestinationAirMiles - independentlyMeasuredStartMiles) > 0.01) {
    errors.push("stored start-to-destination air miles do not reconcile to the exact bound coordinates");
  }

  const pointIntersections = source.routePrep?.point_intersections;
  const exactStartCoordinates = pointIntersections?.type === "MultiPoint" && Array.isArray(pointIntersections.coordinates)
    ? pointIntersections.coordinates
    : pointIntersections?.type === "Point" && coordinate(pointIntersections.coordinates)
      ? [pointIntersections.coordinates]
      : [];
  const nearestHighwayCoordinate = source.routePrep?.nearest_highway_point?.coordinates;
  if (record.start.authority === "exact_highway_next_road_intersection"
    ? !exactStartCoordinates.some((entry) => sameCoordinate(entry, record.start.requestedCoordinate))
    : !sameCoordinate(nearestHighwayCoordinate, record.start.requestedCoordinate)) {
    errors.push("routed start is not bound to its exact stored intersection or bounded nearest-highway candidate");
  }

  const exactSourceSteps = Array.isArray(source.routePrep?.steps)
    ? source.routePrep.steps.filter((step) => step.stepOrder >= record.lastHighway.sourceStepOrder)
    : [];
  const state = {
    errors,
    previousEndIndex: 0,
    distanceMeters: 0,
    sawDashed: false,
    solidCount: 0,
    dashedCount: 0,
  };
  sections.forEach((section, index) => validateSection(
    object(section),
    index,
    coordinates,
    exactSourceSteps,
    state,
  ));
  if (sections[0]?.coordinateStartIndex !== 0
    || sections.at(-1)?.coordinateEndIndex !== coordinates.length - 1) {
    errors.push("compact section indexes do not cover the routed road geometry from first to last point");
  }

  if (record.status === "ROUTED_DISPLAY" && state.solidCount === 0) {
    errors.push("ROUTED_DISPLAY has no exact solid prefix");
  }
  if (record.status === "ROUTED_FAIL_CLOSED" && state.solidCount !== 0) {
    errors.push("ROUTED_FAIL_CLOSED contains solid teal");
  }
  if (!approximately(record.mileage?.roadDistanceMeters, state.distanceMeters, 0.01)
    || !approximately(record.mileage?.roadDistanceMiles, state.distanceMeters / metresPerMile)
    || record.mileage?.gpsTetherExcluded !== true
    || record.diagnostics?.matchedExactSectionCount !== state.solidCount
    || record.diagnostics?.solidStopsPermanentlyAtFirstMismatch !== true
    || record.diagnostics?.productionWrites !== 0) {
    errors.push("routed record mileage or fail-closed diagnostics do not reconcile to raw sections");
  }

  const tether = record.gpsTether;
  if (tether?.type !== "LineString"
    || tether?.lineStyle !== "dashed"
    || tether?.colorRole !== "gps"
    || tether?.authority !== "unapproved_straight_network_snap_to_saved_gps"
    || tether?.navigationGeometry !== false
    || !finiteNonnegative(tether?.distanceMeters)
    || !approximately(tether?.distanceMiles, tether.distanceMeters / metresPerMile)
    || tether?.nontrivial !== (tether.distanceMeters > 1)
    || !Array.isArray(tether?.coordinates)
    || tether.coordinates.length !== 2
    || !sameCoordinate(tether.coordinates[0], coordinates.at(-1))
    || !sameCoordinate(tether.coordinates[1], record.destination.coordinates)) {
    errors.push("GPS tether is not separate straight dashed unapproved destination context");
  }

  if (tether?.nontrivial) {
    if (record.mileage?.totalToGpsMeters !== null || record.mileage?.totalToGpsMiles !== null) {
      errors.push("nontrivial straight GPS tether leaked into total approach mileage");
    }
  } else if (!approximately(record.mileage?.totalToGpsMeters, state.distanceMeters, 0.01)
    || !approximately(record.mileage?.totalToGpsMiles, state.distanceMeters / metresPerMile)) {
    errors.push("trivial straight GPS tether was added to routed-section mileage");
  }

  return errors;
}

export function auditAscentPadApproachesBatch2() {
  const errors = [];
  let artifact;
  let fixture;
  let batch1;
  let artifactText;
  let fixtureText;
  let batch1Text;
  let runtimeText;
  try {
    artifactText = read(artifactRelativePath);
    fixtureText = read(fixtureRelativePath);
    batch1Text = read(batch1RelativePath);
    runtimeText = read(runtimeRelativePath);
    artifact = JSON.parse(artifactText);
    fixture = JSON.parse(fixtureText);
    batch1 = JSON.parse(batch1Text);
  } catch (error) {
    return [`Batch-2 approach inputs cannot be read: ${String(error)}`];
  }

  if (sha256Text(batch1Text) !== expectedBatch1Sha256) {
    errors.push("the frozen batch-1 artifact content SHA-256 changed");
  }
  if (sha256Text(JSON.stringify(artifact)) !== expectedBatch2JsonSha256) {
    errors.push("the tested batch-2 artifact JSON SHA-256 changed");
  }

  const rules = object(artifact.rules);
  const summary = object(artifact.summary);
  if (artifact.schemaVersion !== 1
    || artifact.batchId !== "ascent-last-highway-to-pad-approaches-20260829-batch2"
    || artifact.scope !== "last-exact-highway-identity-bounded-start-to-frozen-pad-gps"
    || rules.batch1ArtifactRemainsByteStable !== true
    || rules.explicitBuildTimeOsrmOnly !== true
    || rules.exactIntersectionStartsPreferred !== true
    || rules.nearestHighwayStartIsCandidateOnly !== true
    || rules.maximumExactIntersectionSnapMeters !== 25
    || rules.maximumCandidateHighwaySnapMeters !== 100
    || rules.candidateStartRequiresExactMasterLastHighwayRoadIdAnchor !== true
    || rules.noFuzzyOrUnanchoredNameOnlyCandidateStartMatching !== true
    || rules.maxStartToDestinationAirMiles !== maximumDisplayStartToGpsAirMiles
    || rules.exactNormalizedAliasesOnly !== true
    || rules.noFuzzyNearestOrNameOnlyRoadIdentityMatching !== true
    || rules.solidStopsPermanentlyAtFirstMismatch !== true
    || rules.unmatchedPrivateAndUnnamedRoadsAreGenericDashed !== true
    || rules.gpsTetherIsSeparateStraightUnapprovedGeometry !== true
    || rules.gpsTetherExcludedFromRoadMileage !== true
    || rules.nontrivialGpsTetherMakesTotalToGpsNull !== true
    || rules.noProductionWrites !== true
    || rules.noGoogleUrlChanges !== true
    || rules.noRedGeometry !== true) {
    errors.push("batch-2 header or fail-closed rules changed");
  }
  if (artifact.source?.preservedBatch1 !== "v18/src/features/map/ascentPadRoadDisplays.batch1.json"
    || artifact.source?.preservedBatch1Sha256 !== expectedBatch1Sha256
    || artifact.source?.fixture !== "v18/scripts/fixtures/ascent-pad-approach-source-20260829.json"
    || artifact.source?.fixtureSha256 !== sha256Text(fixtureText)) {
    errors.push("batch-2 source hashes do not bind the frozen batch-1 catalog and source fixture");
  }

  const records = Array.isArray(artifact.records) ? artifact.records : [];
  const sourceRecords = Array.isArray(fixture.records) ? fixture.records : [];
  const batch1Ids = new Set((Array.isArray(batch1.routes) ? batch1.routes : []).map((record) => record.padId));
  const sourceById = new Map(sourceRecords.map((record) => [record.padId, record]));
  const ids = new Set();
  const counted = {
    routedDisplayCount: 0,
    routedFailClosedCount: 0,
    pinOnlyCount: 0,
    remoteStartRejectedPinOnlyCount: 0,
    exactIntersectionStartCount: 0,
    candidateNearestHighwayStartCount: 0,
    solidSectionCount: 0,
    dashedSectionCount: 0,
    nontrivialGpsTetherCount: 0,
    totalToGpsWithheldCount: 0,
    maximumDisplayedStartToDestinationAirMiles: 0,
  };

  if (records.length !== 192 || sourceRecords.length !== 192 || sourceById.size !== 192) {
    errors.push("batch-2 is not bound to exactly 192 unique source records");
  }
  for (const record of records) {
    const source = sourceById.get(record.padId);
    if (!source
      || ids.has(record.padId)
      || batch1Ids.has(record.padId)
      || !text(record.reason)
      || !exactFixtureBinding(record, source)
      || !exactLastHighwayBinding(record, source)
      || !["ROUTED_DISPLAY", "ROUTED_FAIL_CLOSED", "PIN_ONLY"].includes(record.status)) {
      errors.push(`${record.padName || record.padId || "unknown pad"} has a duplicate, overlapping, stale, or malformed binding`);
      continue;
    }
    ids.add(record.padId);
    const exactSourceSteps = Array.isArray(source.routePrep?.steps)
      ? source.routePrep.steps.filter((step) => step.matchStatus === "exact_master")
      : [];
    if (!Array.isArray(record.sourceDirections)
      || record.sourceDirections.some((direction, index) => (
        direction.directionOrder !== index + 1
        || !["named_public_road", "generic_unapproved_access"].includes(direction.instructionRole)
        || direction.sourceDistanceMiles !== null && !finiteNonnegative(direction.sourceDistanceMiles)
        || direction.instructionRole === "named_public_road" && !exactSourceSteps.some((step) => (
          step.stepOrder === direction.sourceStepOrder
          && step.canonicalName === direction.sourceDisplayRoad
        ))
        || direction.instructionRole === "generic_unapproved_access" && (
          direction.sourceDisplayRoad !== null
          || direction.instruction !== "Continue on unnamed/unapproved access"
        )
      ))) {
      errors.push(`${record.padName} has invalid bounded source directions`);
    }
    let priorSourceStepOrder = 0;
    let genericSourceStarted = false;
    for (const direction of record.sourceDirections) {
      if (!Number.isInteger(direction.sourceStepOrder)
        || direction.sourceStepOrder <= priorSourceStepOrder
        || genericSourceStarted && direction.instructionRole === "named_public_road") {
        errors.push(`${record.padName} has a reordered or resumed named source direction`);
        break;
      }
      priorSourceStepOrder = direction.sourceStepOrder;
      if (direction.instructionRole === "generic_unapproved_access") genericSourceStarted = true;
    }
    if (record.lastHighway && (
      record.sourceDirections[0]?.instructionRole !== "named_public_road"
      || record.sourceDirections[0]?.sourceStepOrder !== record.lastHighway.sourceStepOrder
      || record.sourceDirections[0]?.sourceDisplayRoad !== record.lastHighway.displayRoad
    )) {
      errors.push(`${record.padName} does not begin its bounded source directions at the exact last-highway identity`);
    }

    if (record.status === "PIN_ONLY") {
      counted.pinOnlyCount += 1;
      for (const error of validatePinEquivalent(record)) errors.push(`${record.padName}: ${error}`);
      if (record.reason === "candidate_start_exceeds_25_air_miles_from_destination") {
        counted.remoteStartRejectedPinOnlyCount += 1;
        for (const error of validateRemoteStartPinOnly(record, source)) errors.push(`${record.padName}: ${error}`);
      }
    } else if (record.status === "ROUTED_FAIL_CLOSED") {
      counted.routedFailClosedCount += 1;
      for (const error of validateRejectedCandidate(record)) errors.push(`${record.padName}: ${error}`);
    } else {
      counted.routedDisplayCount += 1;
      if (record.start?.authority === "exact_highway_next_road_intersection") counted.exactIntersectionStartCount += 1;
      if (record.start?.authority === "candidate_nearest_highway_point") counted.candidateNearestHighwayStartCount += 1;
      counted.solidSectionCount += record.sections.filter((section) => section.lineStyle === "solid").length;
      counted.dashedSectionCount += record.sections.filter((section) => section.lineStyle === "dashed").length;
      if (record.gpsTether?.nontrivial) counted.nontrivialGpsTetherCount += 1;
      if (record.gpsTether?.nontrivial && record.mileage?.totalToGpsMiles === null) counted.totalToGpsWithheldCount += 1;
      counted.maximumDisplayedStartToDestinationAirMiles = Math.max(
        counted.maximumDisplayedStartToDestinationAirMiles,
        record.start?.startToDestinationAirMiles || 0,
      );
      for (const error of validateRouted(record, source)) errors.push(`${record.padName}: ${error}`);
    }
  }

  for (const padName of remoteStartPinOnlyNames) {
    const record = records.find((entry) => entry.padName === padName);
    if (!record) errors.push(`${padName} is missing from the spatial-relevance pin-only proof set`);
    else for (const error of validateRemoteStartPinOnly(record, sourceById.get(record.padId))) errors.push(`${padName}: ${error}`);
  }

  if (ids.size !== 192
    || summary.sourcePadCount !== 192
    || summary.outputPadCount !== 192
    || summary.routedDisplayCount !== 95
    || summary.routedFailClosedCount !== 16
    || summary.pinOnlyCount !== 81
    || summary.remoteStartRejectedPinOnlyCount !== 5
    || summary.exactIntersectionStartCount !== 28
    || summary.candidateNearestHighwayStartCount !== 67
    || summary.osrmCandidateRequestCount !== 119
    || summary.solidSectionCount !== 163
    || summary.dashedSectionCount !== 333
    || summary.nontrivialGpsTetherCount !== 82
    || summary.maximumDisplayedStartToDestinationAirMiles !== 13.079406
    || summary.maximumDisplayedStartToDestinationAirMiles > maximumDisplayStartToGpsAirMiles
    || summary.exactIntersectionStartCount + summary.candidateNearestHighwayStartCount !== summary.routedDisplayCount
    || summary.routedDisplayCount + summary.routedFailClosedCount + summary.pinOnlyCount !== 192
    || Object.entries(counted).some(([key, value]) => summary[key] !== value)
    || summary.totalToGpsWithheldCount !== summary.nontrivialGpsTetherCount
    || summary.productionWrites !== 0
    || summary.googleUrlChanges !== 0
    || summary.redGeometryCount !== 0) {
    errors.push("batch-2 summary does not reconcile to its 192 independently validated records");
  }

  const trackedEvidence = `${artifactText}\n${fixtureText}`;
  if (/AIza[0-9A-Za-z_-]{25,}|sb_(?:secret|publishable)_[0-9A-Za-z_-]+|service[_-]?role|supabase\.co|google\.com\/maps\/dir|[?&](?:key|origin)=/iu.test(trackedEvidence)) {
    errors.push("batch-2 tracked evidence contains a key, privileged material, or mutable Google route URL");
  }
  for (const [needle, label] of [
    ["const maximumStartToDestinationAirMiles = 25", "25-air-mile runtime boundary"],
    ["rules.candidateStartRequiresExactMasterLastHighwayRoadIdAnchor === true", "exact-master anchor header gate"],
    ["rules.noFuzzyOrUnanchoredNameOnlyCandidateStartMatching === true", "unanchored name-only header gate"],
    ["start.anchoredRoadId !== lastHighway.roadId", "exact master roadId runtime binding"],
    ["measuredStartToDestinationAirMiles > maximumStartToDestinationAirMiles", "independent runtime spatial-relevance measurement"],
    ["Name-only or remote starts fail closed before any geometry is exposed", "remote-start fail-close boundary"],
    ['const presentationFailedClosed = status !== "ROUTED_DISPLAY"', "presentation fail-close decision"],
    ["roadCoordinates: presentationFailedClosed ? [] : roadCoordinates", "rejected geometry scrub"],
    ["sections: presentationFailedClosed ? [] : sections", "rejected measured-section scrub"],
    ["gpsTether: presentationFailedClosed ? null : gpsTether", "rejected tether scrub"],
    ["directions: presentationFailedClosed ? [] : measuredDirections(sections)", "rejected direction scrub"],
    ['if (record.status !== "ROUTED_DISPLAY") return null', "rejected map-line guard"],
  ]) {
    if (!runtimeText.includes(needle)) errors.push(`batch-2 runtime is missing its ${label}`);
  }
  if (/router\.project-osrm\.org|\/route\/v1\/driving|AIza[0-9A-Za-z_-]{25,}|service[_-]?role/iu.test(runtimeText)) {
    errors.push("batch-2 browser runtime contains routing-service or privileged material");
  }
  return errors;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const errors = auditAscentPadApproachesBatch2();
  if (errors.length) {
    process.stderr.write(`Ascent batch-2 approach audit failed:\n- ${errors.join("\n- ")}\n`);
    process.exit(1);
  }
  process.stdout.write("Ascent batch-2 approach audit passed: 192 last-highway-to-pad records are independently bound, 95 routed displays reconcile raw metres and remain within 25 air miles, 97 pin-equivalent results expose no candidate route evidence, the five remote starts fail closed, exact teal stops at the first mismatch, GPS tethers remain unapproved and excluded, and batch 1 is byte-stable.\n");
}
