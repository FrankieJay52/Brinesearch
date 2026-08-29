import assert from "node:assert/strict";
import test from "node:test";
import {
  EOG_SOURCE_SCOPE,
  EXPECTED_EOG_PAD_COUNT,
  validateEogApproachSource,
} from "./eog-pad-approach-source-contract.mjs";

function uuid(index, family = "4") {
  return `00000000-0000-${family}000-8000-${String(index).padStart(12, "0")}`;
}

function record(index) {
  const padId = uuid(index + 1);
  const roadId = uuid(index + 1, "5");
  return {
    padId,
    canonicalId: padId,
    legacyId: `eog--test-${String(index + 1).padStart(3, "0")}`,
    recordRevision: String(1800000000000000 + index),
    padName: `EOG TEST ${String(index + 1).padStart(3, "0")}`,
    company: "EOG",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "OH-9 → Lease Road",
    directoryCoordinateRole: "saved pad reference",
    directoryCoordinate: [-81.1, 40.1],
    destinationGpsSource: "saved",
    destination: [-81.1, 40.1],
    routePrep: {
      pad_id: padId,
      route_prep_id: uuid(index + 1, "3"),
      highway_order: 1,
      point_intersections: null,
      nearest_highway_point: { type: "Point", coordinates: [-81.11, 40.11] },
      next_step: null,
      highway: {
        roadId,
        aliases: ["State Route 9"],
        rawText: "OH-9",
        roadType: "state_route",
        stepKind: "state_route",
        stepOrder: 1,
        hasGeometry: true,
        matchMethod: "official_odot_exact_route_number",
        matchStatus: "exact_master",
        routeNumber: "9",
        canonicalName: "OH-9",
        geometryStatus: "official_centerline_loaded",
        normalizedText: "OH-9",
      },
      steps: [{
        roadId,
        aliases: ["State Route 9"],
        rawText: "OH-9",
        roadType: "state_route",
        stepKind: "state_route",
        stepOrder: 1,
        matchMethod: "official_odot_exact_route_number",
        matchStatus: "exact_master",
        routeNumber: "9",
        canonicalName: "OH-9",
        distanceMiles: null,
        turnDirection: null,
        normalizedText: "OH-9",
        roadGeometryStatus: "official_centerline_loaded",
        stepGeometryStatus: "ready",
      }],
    },
  };
}

function fixture() {
  return {
    schemaVersion: 1,
    snapshotId: "eog-ohio-approach-source-issue200",
    directorySnapshotId: "68f1d076-fe03-4519-a5cd-c68f8a28b06c",
    sourceRevision: "8",
    directoryContentSha256: "1".repeat(64),
    scope: EOG_SOURCE_SCOPE,
    authority: "Read-only exact source evidence; no route or approval is created.",
    baseline: {
      productionPadCount: 301,
      savedGpsCount: 214,
      structuredSequenceCount: 286,
      writtenDirectionsCount: 296,
    },
    rules: {
      primaryRouteOnly: true,
      exactHighwayStepRequiredForRouting: true,
      exactMasterRoadIdsOnly: true,
      noFuzzyNearestOrNameOnlyRoadIdentityMatching: true,
      nearestHighwayCoordinateIsCandidateOnly: true,
      firstMismatchStopsTealPermanently: true,
      gpsTetherIsUnapprovedAndExcludedFromMileage: true,
      productionWrites: 0,
    },
    records: Array.from({ length: EXPECTED_EOG_PAD_COUNT }, (_, index) => record(index)),
  };
}

function rejects(mutator, pattern) {
  const value = structuredClone(fixture());
  mutator(value);
  assert.throws(() => validateEogApproachSource(value), pattern);
}

test("accepts exactly 301 uniquely bound EOG Ohio records", () => {
  const result = validateEogApproachSource(fixture());
  assert.deepEqual(result, {
    sourcePadCount: 301,
    exactDestinationCount: 301,
    routePrepCount: 301,
    exactHighwayCount: 301,
    exactIntersectionEligibleCount: 0,
    candidateHighwayEligibleCount: 301,
    pinOnlyInputCount: 0,
    productionWrites: 0,
  });
});

test("rejects a stale denominator", () => rejects(
  (value) => value.records.pop(),
  /exact 301-pad scope/u,
));

test("rejects duplicate pad identity", () => rejects(
  (value) => { value.records[1].padId = value.records[0].padId; value.records[1].canonicalId = value.records[0].padId; },
  /invalid exact directory binding/u,
));

test("rejects company cross-binding", () => rejects(
  (value) => { value.records[0].company = "Ascent"; },
  /invalid exact directory binding/u,
));

test("rejects destination provenance without coordinates", () => rejects(
  (value) => { value.records[0].destination = null; },
  /destination provenance without a destination/u,
));

test("rejects an exact road without a UUID roadId", () => rejects(
  (value) => { value.records[0].routePrep.highway.roadId = null; },
  /exact step lacks a UUID roadId/u,
));

test("rejects fuzzy or nearest-road identity selection", () => rejects(
  (value) => { value.records[0].routePrep.highway.matchMethod = "nearest_road_name_only"; },
  /forbidden identity method/u,
));

test("rejects candidate geometry unless the exact highway geometry is loaded", () => rejects(
  (value) => { value.records[0].routePrep.highway.geometryStatus = "not_loaded"; },
  /candidate start geometry without loaded exact highway geometry/u,
));

test("rejects an exact intersection without an exact loaded next road", () => rejects(
  (value) => {
    value.records[0].routePrep.point_intersections = { type: "Point", coordinates: [-81.11, 40.11] };
    value.records[0].routePrep.nearest_highway_point = null;
  },
  /exact intersection start lacks an exact loaded next road/u,
));

test("allows a missing structured sequence only as pin-only input", () => {
  const value = fixture();
  value.records[0].structuredRoadSequence = "";
  value.records[0].routePrep = null;
  const result = validateEogApproachSource(value);
  assert.equal(result.pinOnlyInputCount, 1);
});

test("allows a pin-only record but never invents route eligibility", () => {
  const value = fixture();
  value.records[0].destination = null;
  value.records[0].directoryCoordinate = null;
  value.records[0].destinationGpsSource = null;
  value.records[0].directoryCoordinateRole = null;
  value.records[0].routePrep = null;
  const result = validateEogApproachSource(value);
  assert.equal(result.pinOnlyInputCount, 1);
  assert.equal(result.exactDestinationCount, 300);
  assert.equal(result.routePrepCount, 300);
});
