import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS,
  ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION,
  computeGraphEvidenceReceiptKeySha256,
  computeGraphEvidenceReceiptSha256,
  computeRouteCoordinateSha256,
} from "./lib/ascent-pad-graph-evidence.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const v18Root = path.resolve(here, "..");
const artifactRelativePath = "src/features/map/ascentPadApproaches.batch2.json";
const fixtureRelativePath = "scripts/fixtures/ascent-pad-approach-source-20260829.json";
const graphFixtureRelativePath = "scripts/fixtures/ascent-pad-graph-runs-20260829.json";
const batch1RelativePath = "src/features/map/ascentPadRoadDisplays.batch1.json";
const runtimeRelativePath = "src/features/map/ascentPadApproaches.ts";
const generatorRelativePath = "scripts/generate-ascent-pad-approaches-batch2.mjs";
const expectedBatch1Sha256 = "b28ee66042326ff16ccc3433f22434008d9cd2db5655bbdc041a94d4a0ece4cd";
const expectedSourceFixtureSha256 = "50ab5a9cffb4d896b505bddcf56b1eb467509346f314e149750038debd951e2f";
const expectedFrozenRouteArtifactSha256 = "c01f249d697497563bdf04b81836632000846f808f9cf0847c07ad2db220851b";
const expectedGraphFixtureSha256 = "d49322c8ee331dce7e3a113933b3f66ad70084873a9102af03ad5b75b26763f0";
const metresPerMile = 1609.344;
const maximumDisplayStartToGpsAirMiles = 25;
const epsilon = 0.000001;
const digestPattern = /^[0-9a-f]{64}$/u;
const evidenceDigestPattern = /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const remoteStartPinOnlyNames = new Set(["CENA", "NOELLE", "ROXY", "SPORT", "TANNER"]);

const expectedArtifactSummary = {
  sourcePadCount: 192,
  outputPadCount: 192,
  routedDisplayCount: 111,
  routedFailClosedCount: 0,
  pinOnlyCount: 81,
  retainedRouterUnverifiedRouteCount: 16,
  graphEvidenceReceiptCount: 95,
  appliedGraphEvidenceReceiptCount: 95,
  graphEvidenceNamedRunCount: 565,
  graphEvidenceOrderedExactRunCount: 203,
  graphEvidenceNamedNeutralRunCount: 495,
  graphEvidenceUnresolvedRunCount: 802,
  remoteStartRejectedPinOnlyCount: 5,
  exactIntersectionStartCount: 32,
  candidateNearestHighwayStartCount: 79,
  osrmCandidateRequestCount: 119,
  solidSectionCount: 1514,
  solidUnapprovedSectionCount: 1444,
  nontrivialGpsTetherCount: 96,
  totalToGpsWithheldCount: 96,
  maximumDisplayedStartToDestinationAirMiles: 14.306095,
  productionWrites: 0,
  googleUrlChanges: 0,
  redGeometryCount: 0,
};

const expectedGraphSummary = {
  recordCount: 95,
  exactRunCount: 565,
  orderedExactRunCount: 203,
  graphNamedOnlyRunCount: 362,
  unresolvedRunCount: 802,
  ambiguousRunCount: 683,
  noMatchRunCount: 119,
  verifiedJunctionCount: 105,
  productionWrites: 0,
};

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

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
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

function graphFixtureSummary(fixture) {
  const runs = fixture.records.flatMap((receipt) => receipt.runs);
  return {
    recordCount: fixture.records.length,
    exactRunCount: runs.filter((run) => run.state === "exact").length,
    orderedExactRunCount: runs.filter((run) => (
      run.state === "exact" && run.sourceMatch === "ordered_exact"
    )).length,
    graphNamedOnlyRunCount: runs.filter((run) => (
      run.state === "exact" && run.sourceMatch === "graph_named_only"
    )).length,
    unresolvedRunCount: runs.filter((run) => run.state === "unresolved").length,
    ambiguousRunCount: runs.filter((run) => (
      run.state === "unresolved" && run.unresolvedReason === "ambiguous_graph_overlap"
    )).length,
    noMatchRunCount: runs.filter((run) => (
      run.state === "unresolved" && run.unresolvedReason !== "ambiguous_graph_overlap"
    )).length,
    verifiedJunctionCount: Object.keys(fixture.junctions).length,
    productionWrites: 0,
  };
}

function validateGraphFixture(fixture, fixtureText, sourceFixtureText) {
  const errors = [];
  const topLevelKeys = [
    "fixtureId", "junctions", "measureBasis", "policy", "records",
    "schemaVersion", "source", "summary",
  ];
  if (!exactKeys(fixture, topLevelKeys)
    || fixture.fixtureId !== "ascent-pad-graph-runs-20260829"
    || fixture.schemaVersion !== ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION
    || fixture.measureBasis !== ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS
    || !Array.isArray(fixture.records)
    || fixture.records.length !== 95
    || !fixture.junctions
    || typeof fixture.junctions !== "object"
    || Array.isArray(fixture.junctions)) {
    return { errors: ["graph-evidence fixture envelope drifted"], receiptByPadId: new Map() };
  }
  if (sha256Text(fixtureText) !== expectedGraphFixtureSha256) {
    errors.push("the sealed graph-evidence fixture SHA-256 changed");
  }
  const source = object(fixture.source);
  if (!exactKeys(source, [
    "routeArtifactPath", "routeArtifactSha256", "frozenSourceFixturePath",
    "frozenSourceFixtureSha256", "odotDatasetId", "extractionDate", "extractionMethod",
  ])
    || source.routeArtifactPath !== "v18/src/features/map/ascentPadApproaches.batch2.json"
    || source.routeArtifactSha256 !== expectedFrozenRouteArtifactSha256
    || source.frozenSourceFixturePath !== "v18/scripts/fixtures/ascent-pad-approach-source-20260829.json"
    || source.frozenSourceFixtureSha256 !== expectedSourceFixtureSha256
    || sha256Text(sourceFixtureText) !== expectedSourceFixtureSha256
    || !uuidPattern.test(source.odotDatasetId || "")
    || source.extractionDate !== "2026-08-29"
    || source.extractionMethod !== "read_only_spatial_indexed_sql") {
    errors.push("graph-evidence source provenance is not sealed to the frozen read-only extraction");
  }
  const policy = object(fixture.policy);
  if (!exactKeys(policy, [
    "sampleIntervalMeters", "candidateRadiusMeters", "ambiguityRadiusMeters",
    "exactMaximumDistanceMeters", "exactMinimumRunnerUpSeparationMeters",
    "unresolvedNoMatchReason", "productionWrites",
  ])
    || policy.sampleIntervalMeters !== 5
    || policy.candidateRadiusMeters !== 30
    || policy.ambiguityRadiusMeters !== 20
    || policy.exactMaximumDistanceMeters !== 10
    || policy.exactMinimumRunnerUpSeparationMeters !== 5
    || policy.unresolvedNoMatchReason !== "no_authoritative_graph_match"
    || policy.productionWrites !== 0) {
    errors.push("graph-evidence extraction policy drifted");
  }

  const junctionDigests = new Set();
  for (const [junctionDigest, junction] of Object.entries(object(fixture.junctions))) {
    if (!evidenceDigestPattern.test(junctionDigest)
      || !exactKeys(junction, ["buildDigest", "buildId", "junctionId"])
      || !uuidPattern.test(junction.junctionId || "")
      || !uuidPattern.test(junction.buildId || "")
      || !evidenceDigestPattern.test(junction.buildDigest || "")) {
      errors.push(`graph-evidence junction ${junctionDigest} is malformed`);
    }
    junctionDigests.add(junctionDigest);
  }

  const receiptKeys = new Set();
  const referencedJunctions = new Set();
  const receiptByPadId = new Map();
  for (const receipt of fixture.records) {
    let expectedKey = null;
    let expectedReceipt = null;
    try {
      expectedKey = computeGraphEvidenceReceiptKeySha256(receipt);
      expectedReceipt = computeGraphEvidenceReceiptSha256(receipt);
    } catch (error) {
      errors.push(`graph-evidence receipt is malformed: ${String(error)}`);
      continue;
    }
    if (!exactKeys(receipt, [
      "schemaVersion", "padId", "recordRevision", "routedIdentitySha256",
      "routeCoordinateSha256", "measureBasis", "runs", "receiptKeySha256",
      "receiptSha256",
    ])
      || receipt.schemaVersion !== ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION
      || receipt.measureBasis !== ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS
      || receipt.receiptKeySha256 !== expectedKey
      || receipt.receiptSha256 !== expectedReceipt
      || !Array.isArray(receipt.runs)
      || receipt.runs.length === 0
      || receiptByPadId.has(receipt.padId)
      || receiptKeys.has(receipt.receiptKeySha256)) {
      errors.push(`${receipt.padId || "unknown pad"} graph-evidence receipt digest or identity drifted`);
      continue;
    }
    receiptByPadId.set(receipt.padId, receipt);
    receiptKeys.add(receipt.receiptKeySha256);
    for (const run of receipt.runs) {
      if (typeof run.junctionDigest === "string") referencedJunctions.add(run.junctionDigest);
    }
  }
  if ([...junctionDigests].sort().join("\n") !== [...referencedJunctions].sort().join("\n")) {
    errors.push("graph-evidence junction index has a missing or stale run binding");
  }
  const computedSummary = graphFixtureSummary(fixture);
  if (!isDeepStrictEqual(computedSummary, expectedGraphSummary)
    || !isDeepStrictEqual(fixture.summary, expectedGraphSummary)) {
    errors.push("graph-evidence fixture summary does not reconcile to the final sealed runs");
  }
  return { errors, receiptByPadId };
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
    errors.push("pin-only record contains route geometry, route mileage, or mutable evidence");
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
    || !digestPattern.test(record.diagnostics?.rejectedCandidateEvidenceSha256 || "")) {
    errors.push("remote exact-master candidate did not remain GPS-pin-only with bounded diagnostics");
  }
  return errors;
}

function includesCoordinatesInOrder(haystack, needles) {
  let cursor = 0;
  for (const needle of needles) {
    while (cursor < haystack.length && !sameCoordinate(haystack[cursor], needle)) cursor += 1;
    if (cursor === haystack.length) return false;
    cursor += 1;
  }
  return true;
}

function validateChildCoordinateUnion(record, errors) {
  const groups = [];
  for (const section of record.sections) {
    let group = groups.at(-1);
    if (!group || group.parentSectionOrder !== section.parentSectionOrder) {
      group = { parentSectionOrder: section.parentSectionOrder, sections: [] };
      groups.push(group);
    }
    group.sections.push(section);
  }
  if (!groups.length
    || groups.some((group, index) => group.parentSectionOrder !== index + 1)
    || (record.diagnostics.graphEvidenceReceiptApplied === true
      && groups.length !== record.diagnostics.graphEvidenceBaseSectionCount)) {
    errors.push("schema-3 child sections do not retain contiguous parent-section ordering");
    return;
  }
  let priorEndIndex = 0;
  for (const [groupIndex, group] of groups.entries()) {
    const first = group.sections[0];
    const last = group.sections.at(-1);
    if (group.sections.some((section) => (
      section.coordinateStartIndex !== first.coordinateStartIndex
      || section.coordinateEndIndex !== first.coordinateEndIndex
    ))
      || first.coordinateStartIndex !== (groupIndex === 0 ? 0 : priorEndIndex)
      || last.coordinateEndIndex >= record.roadCoordinates.length) {
      errors.push(`parent section ${group.parentSectionOrder} lost its base coordinate indexes`);
      continue;
    }
    priorEndIndex = last.coordinateEndIndex;
    const baseCoordinates = record.roadCoordinates.slice(
      first.coordinateStartIndex,
      first.coordinateEndIndex + 1,
    );
    const measured = group.sections.filter((section) => section.lineStyle === "solid");
    if (!measured.length) {
      if (group.sections.length !== 1
        || group.sections[0].lineStyle !== "none"
        || group.sections[0].distanceMeters !== 0
        || !Array.isArray(group.sections[0].coordinates)
        || !includesCoordinatesInOrder(group.sections[0].coordinates, baseCoordinates)) {
        errors.push(`parent section ${group.parentSectionOrder} has invalid structural geometry`);
      }
      continue;
    }
    const merged = [...measured[0].coordinates];
    for (let index = 1; index < measured.length; index += 1) {
      if (!sameCoordinate(measured[index - 1].coordinates.at(-1), measured[index].coordinates[0])) {
        errors.push(`parent section ${group.parentSectionOrder} child endpoints are not shared exactly`);
      }
      merged.push(...measured[index].coordinates.slice(1));
    }
    if (!sameCoordinate(merged[0], baseCoordinates[0])
      || !sameCoordinate(merged.at(-1), baseCoordinates.at(-1))
      || !includesCoordinatesInOrder(merged, baseCoordinates)) {
      errors.push(`parent section ${group.parentSectionOrder} child coordinates do not preserve the base line union`);
    }
    if (record.diagnostics.graphEvidenceReceiptApplied === true) {
      let priorFraction = 0;
      let priorMeasure = 0;
      for (const child of measured) {
        if (!approximately(child.startFraction, priorFraction, 1e-12)
          || !approximately(child.startMeasureMeters, priorMeasure, 1e-6)
          || !(child.endFraction > child.startFraction)
          || !(child.endMeasureMeters > child.startMeasureMeters)) {
          errors.push(`parent section ${group.parentSectionOrder} graph measures have a gap or overlap`);
          break;
        }
        priorFraction = child.endFraction;
        priorMeasure = child.endMeasureMeters;
      }
      const childMeters = measured.reduce((sum, section) => sum + section.distanceMeters, 0);
      if (!approximately(priorFraction, 1, 1e-12)
        || !approximately(childMeters, priorMeasure, 1e-6)) {
        errors.push(`parent section ${group.parentSectionOrder} child mileage does not preserve its base section`);
      }
    }
  }
  if (priorEndIndex !== record.roadCoordinates.length - 1) {
    errors.push("schema-3 parent sections do not cover the full base road coordinate array");
  }
}

function validateReceiptProjection(record, receipt, errors) {
  const diagnostics = object(record.diagnostics);
  let routeCoordinateSha256 = null;
  try {
    routeCoordinateSha256 = computeRouteCoordinateSha256(record.roadCoordinates);
  } catch (error) {
    errors.push(`route-coordinate hash cannot be calculated: ${String(error)}`);
    return;
  }
  if (receipt.padId !== record.padId
    || receipt.recordRevision !== record.recordRevision
    || receipt.routedIdentitySha256 !== diagnostics.routedIdentitySha256
    || receipt.routeCoordinateSha256 !== routeCoordinateSha256
    || diagnostics.simplifiedGeometrySha256 !== routeCoordinateSha256
    || diagnostics.graphEvidenceReceiptApplied !== true
    || diagnostics.graphEvidenceStatus !== "sealed_receipt_applied"
    || diagnostics.graphEvidenceReceiptKeySha256 !== receipt.receiptKeySha256
    || diagnostics.graphEvidenceReceiptSha256 !== receipt.receiptSha256
    || diagnostics.graphEvidenceRouteCoordinateSha256 !== receipt.routeCoordinateSha256) {
    errors.push("sealed graph receipt is not bound to the routed revision, identity, and base coordinates");
  }
  const projected = record.sections.filter((section) => section.graphEvidenceRunOrder !== null);
  if (projected.length !== receipt.runs.length
    || projected.length !== diagnostics.graphEvidenceSectionRunCount) {
    errors.push("artifact child-run count does not match its sealed receipt");
    return;
  }
  let stopped = false;
  let tealCount = 0;
  let namedCount = 0;
  let orderedExactCount = 0;
  let namedNeutralCount = 0;
  let unresolvedCount = 0;
  let firstUnresolved = null;
  let firstNonOrdered = null;
  let tealMeters = 0;
  let neutralMeters = 0;
  for (const [index, run] of receipt.runs.entries()) {
    const section = projected[index];
    const firstChildOfParent = run.startFraction === 0;
    const baseInstruction = firstChildOfParent && section.maneuver?.type === "depart"
      ? `Start on ${run.displayName}`
      : firstChildOfParent
          && section.maneuver?.type === "turn"
          && ["left", "right"].includes(section.maneuver?.modifier)
        ? `Turn ${section.maneuver.modifier} onto ${run.displayName}`
        : `Continue on ${run.displayName}`;
    const orderedExact = run.state === "exact" && run.sourceMatch === "ordered_exact";
    const expectedTeal = orderedExact && !stopped;
    if (!expectedTeal) {
      if (!stopped) firstNonOrdered = run.runOrder;
      stopped = true;
    }
    if (run.state === "unresolved" && firstUnresolved === null) firstUnresolved = run.runOrder;
    if (!isDeepStrictEqual(section.graphEvidence, run)
      || section.graphEvidenceRunOrder !== run.runOrder
      || section.parentSectionOrder !== run.sectionOrder
      || section.startMeasureMeters !== run.startMeasureMeters
      || section.endMeasureMeters !== run.endMeasureMeters
      || section.startFraction !== run.startFraction
      || section.endFraction !== run.endFraction
      || section.lineStyle !== "solid"
      || section.colorRole !== (expectedTeal ? "teal" : "unverified")) {
      errors.push(`graph run ${run.runOrder} projection drifted from its sealed receipt or permanent teal stop`);
      continue;
    }
    if (run.state === "exact") {
      namedCount += 1;
      if (orderedExact) orderedExactCount += 1;
      if (!expectedTeal) namedNeutralCount += 1;
      if (section.sourceIdentityId !== run.identityId
        || section.sourceRoadId !== (run.roadId ?? null)
        || section.sourceDisplayRoad !== run.displayName
        || section.routeSystem !== run.routeSystem
        || section.routeNumber !== run.routeNumber
        || section.county !== run.county
        || section.sourceMatch !== run.sourceMatch
        || section.sourceStepOrder !== (orderedExact ? run.matchedSourceStepOrder : null)
        || section.matchedSourceRoadId !== (orderedExact ? run.matchedSourceRoadId : null)
        || !digestPattern.test(section.matchedIdentitySha256 || "")) {
        errors.push(`exact graph run ${run.runOrder} lost its graph name, identity, or ordered road binding`);
      }
      if (!expectedTeal && (
        section.authority !== "exact_graph_identity_unapproved_for_ordered_source_route"
        || section.instruction !== `${baseInstruction} · graph-identified / unapproved`
      )) {
        errors.push(`neutral exact graph run ${run.runOrder} lost its truthful named presentation`);
      }
    } else {
      unresolvedCount += 1;
      if (section.sourceIdentityId !== null
        || section.sourceRoadId !== null
        || section.sourceDisplayRoad !== null
        || section.routeSystem !== null
        || section.routeNumber !== null
        || section.county !== null
        || section.sourceMatch !== null
        || section.matchedSourceRoadId !== null
        || section.matchedIdentitySha256 !== null
        || section.instruction !== "Continue on unverified route") {
        errors.push(`unresolved graph run ${run.runOrder} invented a road identity or name`);
      }
    }
    if (expectedTeal) {
      tealCount += 1;
      tealMeters += section.distanceMeters;
      if (section.authority !== "immutable_graph_evidence_receipt"
        || section.matchState !== "matched_ordered_source_and_exact_graph_receipt"
        || section.sourceRoadId !== section.matchedSourceRoadId) {
        errors.push(`teal graph run ${run.runOrder} lacks an exact ordered source-road binding`);
      }
    } else {
      neutralMeters += section.distanceMeters;
    }
  }
  if (diagnostics.matchedExactSectionCount !== tealCount
    || diagnostics.solidDistanceMeters !== tealMeters
    || diagnostics.unapprovedDistanceMeters !== neutralMeters
    || diagnostics.graphEvidenceNamedRunCount !== namedCount
    || diagnostics.graphEvidenceOrderedExactRunCount !== orderedExactCount
    || diagnostics.graphEvidenceNamedNeutralRunCount !== namedNeutralCount
    || diagnostics.graphEvidenceUnresolvedRunCount !== unresolvedCount
    || diagnostics.firstUnresolvedGraphEvidenceRunOrder !== firstUnresolved
    || diagnostics.firstNonOrderedGraphEvidenceRunOrder !== firstNonOrdered) {
    errors.push("graph-evidence receipt diagnostics do not reconcile to projected child runs");
  }
}

function validateUnreceiptedProjection(record, errors) {
  const diagnostics = object(record.diagnostics);
  const measured = record.sections.filter((section) => section.lineStyle !== "none");
  let routeCoordinateSha256 = null;
  try {
    routeCoordinateSha256 = computeRouteCoordinateSha256(record.roadCoordinates);
  } catch (error) {
    errors.push(`route-coordinate hash cannot be calculated: ${String(error)}`);
  }
  if (record.reason !== "graph_evidence_receipt_missing_route_retained"
    || diagnostics.graphEvidenceReceiptApplied !== false
    || diagnostics.graphEvidenceStatus !== "missing_route_retained_solid_neutral"
    || diagnostics.simplifiedGeometrySha256 !== routeCoordinateSha256
    || measured.some((section) => (
      section.lineStyle !== "solid"
      || section.colorRole !== "unverified"
      || section.authority !== "graph_evidence_receipt_missing"
      || section.matchState !== "unverified_graph_receipt_missing"
      || section.graphEvidenceRunOrder !== null
      || section.graphEvidence !== null
      || section.sourceIdentityId !== null
      || section.sourceRoadId !== null
      || section.sourceDisplayRoad !== null
      || section.sourceMatch !== null
      || section.matchedSourceRoadId !== null
    ))) {
    errors.push("successful unreceipted route was erased, dashed, teal, or given an invented graph identity");
  }
}

function validateRouted(record, source, receipt) {
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
    errors.push("routed record has an invalid bounded start or base road geometry");
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
    errors.push("routed start is not bound to its exact stored intersection or bounded highway candidate");
  }

  for (const [index, section] of sections.entries()) {
    if (section.sectionOrder !== index + 1
      || !Number.isInteger(section.parentSectionOrder)
      || section.parentSectionOrder < 1
      || !Number.isInteger(section.coordinateStartIndex)
      || !Number.isInteger(section.coordinateEndIndex)
      || section.coordinateStartIndex < 0
      || section.coordinateEndIndex < section.coordinateStartIndex
      || section.coordinateEndIndex >= coordinates.length
      || !finiteNonnegative(section.distanceMeters)
      || !approximately(section.distanceMiles, section.distanceMeters / metresPerMile)
      || !finiteNonnegative(section.durationSeconds)
      || !text(section.maneuver?.type)
      || !text(section.instruction)
      || !Array.isArray(section.coordinates)
      || !section.coordinates.every(coordinate)
      || section.lineStyle === "dashed"
      || !["solid", "none"].includes(section.lineStyle)
      || (section.lineStyle === "solid" && section.coordinates.length < 2)) {
      errors.push(`section ${index + 1} has invalid schema-3 ordering, geometry, mileage, or style`);
    }
  }
  validateChildCoordinateUnion(record, errors);
  const measuredMeters = sections.reduce((sum, section) => sum + section.distanceMeters, 0);
  if (!approximately(record.mileage?.roadDistanceMeters, measuredMeters, 1e-6)
    || !approximately(record.mileage?.roadDistanceMiles, measuredMeters / metresPerMile)
    || record.mileage?.gpsTetherExcluded !== true
    || record.diagnostics?.solidStopsPermanentlyAtFirstMismatch !== true
    || record.diagnostics?.productionWrites !== 0) {
    errors.push("schema-3 child mileage or immutable route diagnostics do not reconcile");
  }

  if (receipt) validateReceiptProjection(record, receipt, errors);
  else validateUnreceiptedProjection(record, errors);

  const tether = record.gpsTether;
  if (tether?.type !== "LineString"
    || tether?.lineStyle !== "solid"
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
    errors.push("GPS tether is not separate solid unapproved destination context");
  }
  if (tether?.nontrivial) {
    if (record.mileage?.totalToGpsMeters !== null || record.mileage?.totalToGpsMiles !== null) {
      errors.push("nontrivial straight GPS tether leaked into total approach mileage");
    }
  } else if (!approximately(record.mileage?.totalToGpsMeters, measuredMeters, 0.01)
    || !approximately(record.mileage?.totalToGpsMiles, measuredMeters / metresPerMile)) {
    errors.push("trivial straight GPS tether changed routed-section mileage");
  }
  return errors;
}

function validateSourceDirections(record, source) {
  const errors = [];
  const exactSourceSteps = Array.isArray(source.routePrep?.steps)
    ? source.routePrep.steps.filter((step) => step.matchStatus === "exact_master")
    : [];
  if (!Array.isArray(record.sourceDirections)
    || record.sourceDirections.some((direction, index) => (
      direction.directionOrder !== index + 1
      || !["named_public_road", "generic_unapproved_access"].includes(direction.instructionRole)
      || (direction.sourceDistanceMiles !== null && !finiteNonnegative(direction.sourceDistanceMiles))
      || (direction.instructionRole === "named_public_road" && !exactSourceSteps.some((step) => (
        step.stepOrder === direction.sourceStepOrder
        && step.canonicalName === direction.sourceDisplayRoad
      )))
      || (direction.instructionRole === "generic_unapproved_access" && (
        direction.sourceDisplayRoad !== null
        || direction.instruction !== "Continue on unnamed/unapproved access"
      ))
    ))) {
    errors.push("bounded source directions are invalid");
    return errors;
  }
  let priorSourceStepOrder = 0;
  let genericSourceStarted = false;
  for (const direction of record.sourceDirections) {
    if (!Number.isInteger(direction.sourceStepOrder)
      || direction.sourceStepOrder <= priorSourceStepOrder
      || (genericSourceStarted && direction.instructionRole === "named_public_road")) {
      errors.push("bounded source directions reorder or resume after their source blocker");
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
    errors.push("bounded source directions do not begin at the exact last-highway identity");
  }
  return errors;
}

export function auditAscentPadApproachesBatch2() {
  const errors = [];
  let artifact;
  let sourceFixture;
  let graphFixture;
  let batch1;
  let artifactText;
  let sourceFixtureText;
  let graphFixtureText;
  let batch1Text;
  let runtimeText;
  let generatorText;
  try {
    artifactText = read(artifactRelativePath);
    sourceFixtureText = read(fixtureRelativePath);
    graphFixtureText = read(graphFixtureRelativePath);
    batch1Text = read(batch1RelativePath);
    runtimeText = read(runtimeRelativePath);
    generatorText = read(generatorRelativePath);
    artifact = JSON.parse(artifactText);
    sourceFixture = JSON.parse(sourceFixtureText);
    graphFixture = JSON.parse(graphFixtureText);
    batch1 = JSON.parse(batch1Text);
  } catch (error) {
    return [`Batch-2 approach inputs cannot be read: ${String(error)}`];
  }

  if (sha256Text(batch1Text) !== expectedBatch1Sha256) {
    errors.push("the frozen batch-1 artifact content SHA-256 changed");
  }
  const graphValidation = validateGraphFixture(graphFixture, graphFixtureText, sourceFixtureText);
  errors.push(...graphValidation.errors);
  const receiptByPadId = graphValidation.receiptByPadId;

  const rules = object(artifact.rules);
  if (artifact.schemaVersion !== 3
    || artifact.batchId !== "ascent-last-highway-to-pad-approaches-20260829-batch2"
    || artifact.scope !== "last-exact-highway-identity-bounded-start-to-frozen-pad-gps"
    || rules.batch1ArtifactRemainsByteStable !== true
    || rules.explicitBuildTimeOsrmOnly !== true
    || rules.candidateStartRequiresExactMasterLastHighwayRoadIdAnchor !== true
    || rules.noFuzzyOrUnanchoredNameOnlyCandidateStartMatching !== true
    || rules.maxStartToDestinationAirMiles !== maximumDisplayStartToGpsAirMiles
    || rules.noFuzzyNearestOrNameOnlyRoadIdentityMatching !== true
    || rules.solidStopsPermanentlyAtFirstMismatch !== true
    || rules.unmatchedPrivateAndUnnamedRoadsStayVisibleAsSolidUnapproved !== true
    || rules.successfulOsrmCandidateGeometryIsNeverDiscarded !== true
    || rules.graphEvidenceReceiptsFailClosedOnSchemaKeyHashOrCoverageDrift !== true
    || rules.onlyUninterruptedOrderedExactGraphRunsCanBeTeal !== true
    || rules.graphNamedOnlyAndUnresolvedRunsPermanentlyStopTeal !== true
    || rules.graphNamedRunsRetainExactIdentityWhenNeutral !== true
    || rules.routesWithoutGraphEvidenceStayVisibleAsSolidNeutral !== true
    || rules.baseRoadCoordinatesAndMeasuredRoadMileageArePreserved !== true
    || rules.gpsTetherIsSeparateStraightSolidUnapprovedGeometry !== true
    || rules.gpsTetherExcludedFromRoadMileage !== true
    || rules.nontrivialGpsTetherMakesTotalToGpsNull !== true
    || rules.noProductionWrites !== true
    || rules.noGoogleUrlChanges !== true
    || rules.noRedGeometry !== true
    || "unmatchedPrivateAndUnnamedRoadsAreGenericDashed" in rules) {
    errors.push("schema-3 batch header or solid graph-evidence presentation rules changed");
  }
  if (artifact.source?.fixture !== "v18/scripts/fixtures/ascent-pad-approach-source-20260829.json"
    || artifact.source?.fixtureSha256 !== expectedSourceFixtureSha256
    || artifact.source?.fixtureSha256 !== sha256Text(sourceFixtureText)
    || artifact.source?.preservedBatch1 !== "v18/src/features/map/ascentPadRoadDisplays.batch1.json"
    || artifact.source?.preservedBatch1Sha256 !== expectedBatch1Sha256
    || artifact.source?.graphEvidenceFixture !== "v18/scripts/fixtures/ascent-pad-graph-runs-20260829.json"
    || artifact.source?.graphEvidenceFixtureId !== graphFixture.fixtureId
    || artifact.source?.graphEvidenceFixtureSha256 !== sha256Text(graphFixtureText)
    || artifact.source?.graphEvidenceFixtureSha256 !== expectedGraphFixtureSha256) {
    errors.push("schema-3 sources do not bind Batch1, the frozen source, and the sealed graph fixture");
  }
  if (!isDeepStrictEqual(artifact.summary, expectedArtifactSummary)) {
    errors.push("schema-3 artifact summary drifted from the generated 111/0/81 accounting");
  }

  const records = Array.isArray(artifact.records) ? artifact.records : [];
  const sourceRecords = Array.isArray(sourceFixture.records) ? sourceFixture.records : [];
  const batch1Ids = new Set((Array.isArray(batch1.routes) ? batch1.routes : []).map((record) => record.padId));
  const sourceById = new Map(sourceRecords.map((record) => [record.padId, record]));
  const ids = new Set();
  const appliedReceiptPadIds = new Set();
  const counted = {
    routedDisplayCount: 0,
    routedFailClosedCount: 0,
    pinOnlyCount: 0,
    retainedRouterUnverifiedRouteCount: 0,
    appliedGraphEvidenceReceiptCount: 0,
    graphEvidenceNamedRunCount: 0,
    graphEvidenceOrderedExactRunCount: 0,
    graphEvidenceNamedNeutralRunCount: 0,
    graphEvidenceUnresolvedRunCount: 0,
    remoteStartRejectedPinOnlyCount: 0,
    exactIntersectionStartCount: 0,
    candidateNearestHighwayStartCount: 0,
    solidSectionCount: 0,
    solidUnapprovedSectionCount: 0,
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
      || !["ROUTED_DISPLAY", "PIN_ONLY"].includes(record.status)) {
      errors.push(`${record.padName || record.padId || "unknown pad"} has a duplicate, overlapping, stale, or malformed binding`);
      continue;
    }
    ids.add(record.padId);
    for (const error of validateSourceDirections(record, source)) errors.push(`${record.padName}: ${error}`);
    if (record.status === "PIN_ONLY") {
      counted.pinOnlyCount += 1;
      for (const error of validatePinEquivalent(record)) errors.push(`${record.padName}: ${error}`);
      if (record.reason === "candidate_start_exceeds_25_air_miles_from_destination") {
        counted.remoteStartRejectedPinOnlyCount += 1;
        for (const error of validateRemoteStartPinOnly(record, source)) errors.push(`${record.padName}: ${error}`);
      }
      if (receiptByPadId.has(record.padId)) {
        errors.push(`${record.padName}: a sealed routed receipt was stranded on a pin-only record`);
      }
      continue;
    }

    counted.routedDisplayCount += 1;
    const receipt = receiptByPadId.get(record.padId) || null;
    if (receipt) {
      appliedReceiptPadIds.add(record.padId);
      counted.appliedGraphEvidenceReceiptCount += 1;
      counted.graphEvidenceNamedRunCount += record.diagnostics.graphEvidenceNamedRunCount;
      counted.graphEvidenceOrderedExactRunCount += record.diagnostics.graphEvidenceOrderedExactRunCount;
      counted.graphEvidenceNamedNeutralRunCount += record.diagnostics.graphEvidenceNamedNeutralRunCount;
      counted.graphEvidenceUnresolvedRunCount += record.diagnostics.graphEvidenceUnresolvedRunCount;
    } else {
      counted.retainedRouterUnverifiedRouteCount += 1;
    }
    if (record.start?.authority === "exact_highway_next_road_intersection") counted.exactIntersectionStartCount += 1;
    if (record.start?.authority === "candidate_nearest_highway_point") counted.candidateNearestHighwayStartCount += 1;
    counted.solidSectionCount += record.sections.filter((section) => section.lineStyle === "solid").length;
    counted.solidUnapprovedSectionCount += record.sections.filter((section) => (
      section.lineStyle === "solid" && section.colorRole === "unverified"
    )).length;
    if (record.gpsTether?.nontrivial) counted.nontrivialGpsTetherCount += 1;
    if (record.gpsTether?.nontrivial && record.mileage?.totalToGpsMiles === null) counted.totalToGpsWithheldCount += 1;
    counted.maximumDisplayedStartToDestinationAirMiles = Math.max(
      counted.maximumDisplayedStartToDestinationAirMiles,
      record.start?.startToDestinationAirMiles || 0,
    );
    for (const error of validateRouted(record, source, receipt)) errors.push(`${record.padName}: ${error}`);
  }

  for (const padName of remoteStartPinOnlyNames) {
    const record = records.find((entry) => entry.padName === padName);
    if (!record) errors.push(`${padName} is missing from the spatial-relevance pin-only proof set`);
    else for (const error of validateRemoteStartPinOnly(record, sourceById.get(record.padId))) {
      errors.push(`${padName}: ${error}`);
    }
  }
  if ([...receiptByPadId.keys()].sort().join("\n") !== [...appliedReceiptPadIds].sort().join("\n")) {
    errors.push("not all 95 sealed graph receipts were applied exactly once to routed records");
  }
  if (ids.size !== 192
    || counted.routedDisplayCount !== expectedArtifactSummary.routedDisplayCount
    || counted.routedFailClosedCount !== expectedArtifactSummary.routedFailClosedCount
    || counted.pinOnlyCount !== expectedArtifactSummary.pinOnlyCount
    || Object.entries(counted).some(([key, value]) => expectedArtifactSummary[key] !== value)) {
    errors.push("independent record accounting does not reconcile to 111 routed / 0 rejected / 81 pin-only");
  }

  const alabaster = records.find((record) => record.padName === "ALABASTER");
  const alabasterMeasured = alabaster?.sections?.filter((section) => section.lineStyle === "solid") || [];
  const alabasterFirstNeutral = alabasterMeasured.findIndex((section) => section.colorRole !== "teal");
  const alabasterDownstreamNames = new Set(alabasterMeasured
    .slice(Math.max(0, alabasterFirstNeutral))
    .filter((section) => section.sourceIdentityId)
    .map((section) => section.sourceDisplayRoad));
  if (alabaster?.mileage?.roadDistanceMiles !== 4.674016
    || alabasterFirstNeutral !== 2
    || alabasterMeasured[0]?.sourceDisplayRoad !== "MCCONNELSVILLE RD"
    || alabasterMeasured[1]?.sourceDisplayRoad !== "BEAN RIDGE RD"
    || alabasterMeasured[2]?.sourceMatch !== "graph_named_only"
    || alabasterMeasured[2]?.sourceDisplayRoad !== "BEAN RIDGE RD"
    || alabasterMeasured.slice(2).some((section) => section.colorRole !== "unverified")
    || !["TR 33", "CURTIS RIDGE RD", "BUCKINGHAM RD"].every((name) => (
      alabasterDownstreamNames.has(name)
    ))) {
    errors.push("ALABASTER lost its two-run teal prefix, permanent neutral stop, mileage, or downstream graph names");
  }

  if (artifactText.includes('"lineStyle":"dashed"')
    || graphFixtureText.includes('"productionWrites":1')) {
    errors.push("schema-3 evidence contains a dashed line or a production write");
  }
  const trackedEvidence = `${artifactText}\n${sourceFixtureText}\n${graphFixtureText}\n${generatorText}`;
  if (/AIza[0-9A-Za-z_-]{25,}|sb_(?:secret|publishable)_[0-9A-Za-z_-]+|service[_-]?role|supabase\.co|google\.com\/maps\/dir|[?&](?:key|origin)=/iu.test(trackedEvidence)) {
    errors.push("batch-2 tracked evidence contains a key, privileged material, or mutable Google route URL");
  }
  if (/from\s+['"]@supabase|supabase\s*\.\s*from\s*\(|\b(?:insert\s+into|update\s+[^;\n]+\s+set|delete\s+from)\b/iu.test(generatorText)) {
    errors.push("batch-2 generator contains a production database write path");
  }
  for (const [needle, label] of [
    ["const graphEvidenceArtifact = artifact.schemaVersion === 3", "schema-3 runtime gate"],
    ["rules.graphEvidenceReceiptsFailClosedOnSchemaKeyHashOrCoverageDrift === true", "sealed receipt runtime rule"],
    ["rules.onlyUninterruptedOrderedExactGraphRunsCanBeTeal === true", "ordered exact teal runtime rule"],
    ["rules.graphNamedOnlyAndUnresolvedRunsPermanentlyStopTeal === true", "permanent neutral-stop runtime rule"],
    ['export type AscentPadApproachLineStyle = "solid" | "none"', "solid-only runtime line type"],
    ['lineStyle: "solid"', "solid route runtime projection"],
    ["graphEvidenceReceiptApplied === false", "unreceipted neutral runtime handling"],
    ["graphEvidenceReceiptApplied !== true", "sealed receipt diagnostic runtime handling"],
    ['if (record.status !== "ROUTED_DISPLAY") return null', "pin-only map-line guard"],
  ]) {
    if (!runtimeText.includes(needle)) errors.push(`batch-2 runtime is missing its ${label}`);
  }
  if (/router\.project-osrm\.org|\/route\/v1\/driving|AIza[0-9A-Za-z_-]{25,}|service[_-]?role/iu.test(runtimeText)) {
    errors.push("batch-2 browser runtime contains a routing-service or privileged material");
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
  process.stdout.write("Ascent batch-2 approach audit passed: 192 frozen records reconcile to 111 routed displays, 0 rejected routes, and 81 pin-only pads; 95 sealed graph receipts preserve the base coordinate/mileage union, 16 unreceipted successes remain solid neutral, graph names survive the permanent teal stop, all route/tether lines are solid, Batch1 is byte-stable, and production writes remain zero.\n");
}
