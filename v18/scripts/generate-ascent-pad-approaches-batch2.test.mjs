import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  batch2Scope,
  exactPrefixPolicy,
  matchRouteSteps,
  maximumStartToDestinationAirMiles,
  normalizedRoadIdentity,
  resolveRouteCandidates,
  routedRecord,
} from "./generate-ascent-pad-approaches-batch2.mjs";

const fixtureUrl = new URL("./fixtures/ascent-pad-approach-source-20260829.json", import.meta.url);
const artifactUrl = new URL("../src/features/map/ascentPadApproaches.batch2.json", import.meta.url);

function airMiles(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const leftLatitude = radians(left[1]);
  const rightLatitude = radians(right[1]);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const meters = 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return meters / 1609.344;
}

test("scope names exact highway identity without claiming an exact start", () => {
  assert.equal(
    batch2Scope,
    "last-exact-highway-identity-bounded-start-to-frozen-pad-gps",
  );
  assert.equal(batch2Scope.includes("exact-intersection"), false);
  assert.equal(batch2Scope.includes("exact-highway-identity"), true);
  assert.equal(batch2Scope.includes("bounded-start"), true);
});

test("remote Route 26 starts fail closed before OSRM and displayed starts stay bounded", async () => {
  const [fixture, artifact] = await Promise.all([
    readFile(fixtureUrl, "utf8").then(JSON.parse),
    readFile(artifactUrl, "utf8").then(JSON.parse),
  ]);
  const remoteNames = ["CENA", "NOELLE", "ROXY", "SPORT", "TANNER"];
  for (const padName of remoteNames) {
    const source = fixture.records.find((record) => record.padName === padName);
    const policy = exactPrefixPolicy(source);
    const resolution = resolveRouteCandidates(source, policy);
    assert.deepEqual(resolution.candidates, [], `${padName} retained a remote candidate`);
    assert.equal(
      resolution.rejectionReason,
      "candidate_start_exceeds_25_air_miles_from_destination",
    );
    const output = artifact.records.find((record) => record.padName === padName);
    assert.equal(output.status, "PIN_ONLY");
    assert.equal(output.reason, "candidate_start_exceeds_25_air_miles_from_destination");
    assert.equal(output.start, null);
    assert.deepEqual(output.roadCoordinates, []);
    assert.deepEqual(output.sections, []);
    assert.equal(output.gpsTether, null);
    assert.equal(output.mileage.roadDistanceMiles, null);
  }

  const displayed = artifact.records.filter((record) => record.status === "ROUTED_DISPLAY");
  assert.equal(displayed.length, 95);
  for (const record of displayed) {
    const independentlyMeasured = airMiles(
      record.start.requestedCoordinate,
      record.destination.coordinates,
    );
    assert.ok(independentlyMeasured <= maximumStartToDestinationAirMiles);
    assert.ok(record.start.startToDestinationAirMiles <= maximumStartToDestinationAirMiles);
    assert.equal(record.start.anchoredRoadId, record.lastHighway.roadId);
  }
  assert.equal(artifact.summary.remoteStartRejectedPinOnlyCount, 5);
  assert.ok(
    artifact.summary.maximumDisplayedStartToDestinationAirMiles
      <= maximumStartToDestinationAirMiles,
  );
  assert.equal(
    artifact.rules.candidateStartRequiresExactMasterLastHighwayRoadIdAnchor,
    true,
  );
  assert.equal(artifact.rules.noFuzzyOrUnanchoredNameOnlyCandidateStartMatching, true);
  assert.equal(artifact.rules.maxStartToDestinationAirMiles, 25);

  const source = structuredClone(fixture.records.find((record) => record.padName === "ALABASTER"));
  const policy = exactPrefixPolicy(source);
  source.routePrep.highway.roadId = "name-only-not-the-exact-master-road-id";
  const unanchored = resolveRouteCandidates(source, policy);
  assert.deepEqual(unanchored.candidates, []);
  assert.equal(
    unanchored.rejectionReason,
    "candidate_start_lacks_exact_master_last_highway_road_id_anchor",
  );
});

function group(stepOrder, displayRoad, acceptedIdentities) {
  return {
    stepOrder,
    roadId: `road-${stepOrder}`,
    displayRoad,
    roadType: stepOrder === 1 ? "state_route" : "county",
    acceptedIdentities: acceptedIdentities.map(normalizedRoadIdentity),
  };
}

function routedStep({
  name,
  distanceMeters = 100,
  coordinates = [[-81, 40], [-81, 40.001]],
  type = "continue",
  modifier = "straight",
}) {
  return {
    legIndex: 0,
    stepIndex: 0,
    ref: null,
    name,
    distanceMeters,
    durationSeconds: 10,
    maneuver: { type, modifier, exit: null },
    coordinates,
  };
}

test("normalization accepts only documented punctuation and suffix equivalence", () => {
  assert.equal(
    normalizedRoadIdentity("Airport Road"),
    normalizedRoadIdentity("airport rd."),
  );
  assert.equal(
    normalizedRoadIdentity("Lafferty Lane"),
    normalizedRoadIdentity("LAFFERTY LN"),
  );
  assert.notEqual(
    normalizedRoadIdentity("Airport Road"),
    normalizedRoadIdentity("Airport Lane"),
  );
});

test("ordered matching cannot skip arbitrary source groups and never resumes", () => {
  const policy = {
    groups: [
      group(1, "OH-149", ["OH-149"]),
      group(2, "Airport Rd", ["Airport Rd"]),
      group(3, "Local Ln", ["Local Ln"]),
    ],
  };
  const skipped = matchRouteSteps([routedStep({ name: "Local Lane" })], policy);
  assert.equal(skipped.classified[0].matchState, "unapproved_identity_mismatch");
  assert.equal(skipped.matchedGroupCount, 0);

  const regression = matchRouteSteps([
    routedStep({ name: "Airport Road" }),
    routedStep({ name: "OH-149" }),
    routedStep({ name: "Local Lane" }),
  ], policy);
  assert.deepEqual(
    regression.classified.map((step) => step.matchState),
    [
      "matched_exact_master",
      "unapproved_identity_mismatch",
      "unapproved_after_first_mismatch",
    ],
  );
  assert.equal(regression.matchedGroupCount, 1);
});

test("zero-distance named OSRM markers are structural, not driver turns", () => {
  const policy = { groups: [group(1, "Airport Rd", ["Airport Rd"])] };
  const matched = matchRouteSteps([
    routedStep({
      name: "Airport Road",
      distanceMeters: 0,
      coordinates: [[-81, 40]],
      type: "arrive",
      modifier: "left",
    }),
  ], policy);
  assert.equal(matched.classified[0].matchState, "structural_zero_distance");
  assert.equal(matched.matchedStepCount, 0);
  assert.equal(matched.solidDistanceMeters, 0);
});

test("GPS tether starts at the compact road endpoint and stays out of mileage", () => {
  const policy = {
    highwayOrder: 1,
    groups: [group(1, "OH-149", ["OH-149"])],
    blocker: null,
  };
  const record = {
    padId: "pad-1",
    canonicalId: "pad-1",
    legacyId: "ascent--test",
    recordRevision: "1",
    padName: "TEST",
    company: "Ascent",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "OH-149 → saved GPS",
    destination: [-81, 40.002],
    destinationGpsSource: "saved",
    directoryCoordinateRole: "saved pad reference",
    routePrep: {
      highway_order: 1,
      steps: [{
        stepOrder: 1,
        distanceMiles: null,
        turnDirection: null,
      }],
    },
  };
  const orderedSteps = [routedStep({
    name: "OH-149",
    distanceMeters: 100,
    coordinates: [[-81, 40], [-81, 40.001]],
    type: "depart",
    modifier: null,
  })];
  const matched = matchRouteSteps(orderedSteps, policy);
  const output = routedRecord(record, policy, {
    result: {
      candidate: {
        id: "candidate-nearest-highway-point",
        authority: "candidate_nearest_highway_point",
        candidateOnly: true,
        anchorSource: "exact_master_highway_centerline_nearest_point",
        anchoredRoadId: "road-1",
        startToDestinationAirMiles: 0.1,
        requestedCoordinate: [-81, 40],
      },
      orderedSteps,
      snappedStart: [-81, 40],
      snappedEndpoint: [-81, 40.00101],
      startSnapMeters: 0,
      destinationSnapMeters: 110,
      routeDistanceMeters: 100,
      routeDurationSeconds: 10,
    },
    matched,
  }, 1);

  assert.deepEqual(output.gpsTether.coordinates[0], output.roadCoordinates.at(-1));
  assert.equal(output.mileage.roadDistanceMeters, 100);
  assert.equal(output.mileage.totalToGpsMeters, null);
  assert.equal(output.mileage.totalToGpsMiles, null);
  assert.equal(output.gpsTether.nontrivial, true);
});

test("a routed candidate with no exact prefix presents exactly like pin-only", () => {
  const policy = {
    highwayOrder: 1,
    groups: [group(1, "OH-149", ["OH-149"])],
    blocker: null,
  };
  const record = {
    padId: "pad-fail-closed",
    canonicalId: "pad-fail-closed",
    legacyId: "ascent--fail-closed",
    recordRevision: "1",
    padName: "FAIL CLOSED",
    company: "Ascent",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "OH-149 → saved GPS",
    destination: [-81, 40.002],
    destinationGpsSource: "saved",
    directoryCoordinateRole: "saved pad reference",
    routePrep: {
      highway_order: 1,
      steps: [{
        stepOrder: 1,
        distanceMiles: null,
        turnDirection: null,
      }],
    },
  };
  const orderedSteps = [routedStep({
    name: "Different Road",
    distanceMeters: 100,
    coordinates: [[-81, 40], [-81, 40.001]],
    type: "depart",
    modifier: null,
  })];
  const matched = matchRouteSteps(orderedSteps, policy);
  const output = routedRecord(record, policy, {
    result: {
      candidate: {
        id: "candidate-nearest-highway-point",
        authority: "candidate_nearest_highway_point",
        candidateOnly: true,
        anchorSource: "exact_master_highway_centerline_nearest_point",
        anchoredRoadId: "road-1",
        startToDestinationAirMiles: 0.1,
        requestedCoordinate: [-81, 40],
      },
      orderedSteps,
      snappedStart: [-81, 40],
      snappedEndpoint: [-81, 40.001],
      startSnapMeters: 0,
      destinationSnapMeters: 110,
      routeDistanceMeters: 100,
      routeDurationSeconds: 10,
    },
    matched,
  }, 1);

  assert.equal(output.status, "ROUTED_FAIL_CLOSED");
  assert.equal(output.reason, "no_routed_section_matches_ordered_exact_master_roads");
  assert.equal(output.start, null);
  assert.deepEqual(output.roadCoordinates, []);
  assert.deepEqual(output.sections, []);
  assert.equal(output.gpsTether, null);
  assert.deepEqual(output.mileage, {
    roadDistanceMeters: null,
    roadDistanceMiles: null,
    totalToGpsMeters: null,
    totalToGpsMiles: null,
    gpsTetherExcluded: true,
  });
  assert.equal(output.diagnostics.matchedExactSectionCount, 0);
  assert.equal(output.diagnostics.candidateRouteEvidenceStripped, true);
  assert.match(output.diagnostics.routedIdentitySha256, /^[a-f0-9]{64}$/u);
  assert.match(output.diagnostics.candidateGeometrySha256, /^[a-f0-9]{64}$/u);
  assert.equal("osrmRouteDistanceMeters" in output.diagnostics, false);
  assert.equal(output.diagnostics.productionWrites, 0);
});
