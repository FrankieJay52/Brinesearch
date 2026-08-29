import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyGraphEvidenceToRoutedRecord,
  assertNoUnusedGraphEvidenceReceipts,
  batch2Scope,
  exactPrefixPolicy,
  matchRouteSteps,
  maximumStartToDestinationAirMiles,
  neutralizeRoutedRecordWithoutReceipt,
  normalizedRoadIdentity,
  resolveRouteCandidates,
  routedRecord,
  routerReportedUnverifiedLabel,
  unapprovedPresentation,
  validateGraphEvidenceFixture,
  validateGraphEvidenceFixtureScope,
} from "./generate-ascent-pad-approaches-batch2.mjs";
import {
  ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS,
  ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION,
  computeGraphEvidenceReceiptKeySha256,
  computeGraphEvidenceReceiptSha256,
  computeRouteCoordinateSha256,
} from "./lib/ascent-pad-graph-evidence.mjs";

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
  assert.equal(displayed.length, artifact.summary.routedDisplayCount);
  assert.equal(displayed.length, 111);
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

test("unapproved labels distinguish genuinely unnamed geometry from unverified identity", () => {
  assert.deepEqual(unapprovedPresentation("unapproved_unnamed"), {
    displayName: "Unnamed / unapproved access",
    instruction: "Continue on unnamed/unapproved access",
  });
  for (const matchState of [
    "unapproved_identity_mismatch",
    "unapproved_after_first_mismatch",
  ]) {
    assert.deepEqual(unapprovedPresentation(matchState), {
      displayName: "Unverified / unapproved access",
      instruction: "Continue on unverified/unapproved access",
    });
  }
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
  assert.equal(output.gpsTether.lineStyle, "solid");
  assert.equal(output.sections[0].lineStyle, "solid");
});

test("a routed candidate with no exact prefix retains every measured line as neutral unapproved", () => {
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

  assert.equal(output.status, "ROUTED_DISPLAY");
  assert.equal(output.reason, "router_reported_graph_unverified_route");
  assert.equal(output.start.anchoredRoadId, "road-1");
  assert.deepEqual(output.roadCoordinates, [[-81, 40], [-81, 40.001]]);
  assert.equal(output.sections.length, 1);
  assert.equal(output.sections[0].lineStyle, "solid");
  assert.equal(output.sections[0].colorRole, "unapproved");
  assert.equal(output.sections[0].authority, "unapproved_routed_remainder");
  assert.equal(output.sections[0].matchState, "unapproved_identity_mismatch");
  assert.equal(
    output.sections[0].routerReportedUnverifiedLabel,
    "Different Road · router-reported / graph-unverified",
  );
  assert.equal(
    output.sections[0].instruction,
    "Continue on Different Road · router-reported / graph-unverified",
  );
  assert.equal(output.gpsTether.lineStyle, "solid");
  assert.deepEqual(output.gpsTether.coordinates, [[-81, 40.001], [-81, 40.002]]);
  assert.deepEqual(output.mileage, {
    roadDistanceMeters: 100,
    roadDistanceMiles: 0.062137,
    totalToGpsMeters: null,
    totalToGpsMiles: null,
    gpsTetherExcluded: true,
  });
  assert.equal(output.diagnostics.matchedExactSectionCount, 0);
  assert.equal(output.diagnostics.candidateRouteEvidenceRetained, true);
  assert.equal(output.diagnostics.routerReportedGraphUnverified, true);
  assert.match(output.diagnostics.routedIdentitySha256, /^[a-f0-9]{64}$/u);
  assert.match(output.diagnostics.unsimplifiedStepGeometrySha256, /^[a-f0-9]{64}$/u);
  assert.equal(output.diagnostics.osrmRouteDistanceMeters, 100);
  assert.equal(output.diagnostics.productionWrites, 0);
});

test("router identities are visible only with an explicit graph-unverified qualifier", () => {
  assert.equal(routerReportedUnverifiedLabel({ name: "Town Highway 233", ref: "TR 233" }),
    "Town Highway 233 / TR 233 · router-reported / graph-unverified");
  assert.equal(routerReportedUnverifiedLabel({ name: "Town Highway 233", ref: "Town Highway 233" }),
    "Town Highway 233 · router-reported / graph-unverified");
  assert.equal(routerReportedUnverifiedLabel({ name: "", ref: "" }), null);
});

const GRAPH_TEST_PAD_ID = "11111111-1111-1111-1111-111111111111";
const GRAPH_TEST_ROAD_1 = "22222222-2222-2222-2222-222222222222";
const GRAPH_TEST_ROAD_2 = "33333333-3333-3333-3333-333333333333";

function graphIntegrationRoute() {
  const policy = {
    highwayOrder: 1,
    groups: [
      {
        ...group(1, "OH-149", ["OH-149"]),
        roadId: GRAPH_TEST_ROAD_1,
      },
      {
        ...group(2, "Named Tail Rd", ["Named Tail Rd"]),
        roadId: GRAPH_TEST_ROAD_2,
      },
    ],
    blocker: null,
  };
  const source = {
    padId: GRAPH_TEST_PAD_ID,
    canonicalId: GRAPH_TEST_PAD_ID,
    legacyId: "ascent--graph-test",
    recordRevision: "123456789",
    padName: "GRAPH TEST",
    company: "Ascent",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "OH-149 → Named Tail Rd → saved GPS",
    destination: [-81, 40.00305],
    destinationGpsSource: "saved",
    directoryCoordinateRole: "saved pad reference",
    routePrep: {
      highway_order: 1,
      steps: [
        { stepOrder: 1, distanceMiles: null, turnDirection: null },
        { stepOrder: 2, distanceMiles: null, turnDirection: "right" },
      ],
    },
  };
  const orderedSteps = [
    routedStep({
      name: "OH-149",
      coordinates: [[-81, 40], [-81, 40.001]],
      type: "depart",
      modifier: null,
    }),
    routedStep({
      name: "Graph Connector",
      coordinates: [[-81, 40.001], [-81, 40.002]],
      type: "turn",
      modifier: "right",
    }),
    routedStep({
      name: "Named Tail Road",
      coordinates: [[-81, 40.002], [-81, 40.003]],
      type: "continue",
      modifier: "straight",
    }),
  ];
  const matched = matchRouteSteps(orderedSteps, policy);
  const routed = routedRecord(source, policy, {
    result: {
      candidate: {
        id: "candidate-nearest-highway-point",
        authority: "candidate_nearest_highway_point",
        candidateOnly: true,
        anchorSource: "exact_master_highway_centerline_nearest_point",
        anchoredRoadId: GRAPH_TEST_ROAD_1,
        startToDestinationAirMiles: 0.2,
        requestedCoordinate: [-81, 40],
      },
      orderedSteps,
      snappedStart: [-81, 40],
      snappedEndpoint: [-81, 40.003],
      startSnapMeters: 0,
      destinationSnapMeters: 5,
      routeDistanceMeters: 300,
      routeDurationSeconds: 30,
    },
    matched,
  }, 1);
  return { policy, routed };
}

function graphExactRun({
  runOrder,
  sectionOrder,
  identityId,
  roadId = null,
  displayName,
  routeSystem,
  routeNumber,
  sourceMatch,
  matchedSourceStepOrder,
  matchedSourceRoadId,
  junctionDigest = null,
  startFraction = 0,
  endFraction = 1,
}) {
  const run = {
    runOrder,
    sectionOrder,
    state: "exact",
    startMeasureMeters: 100 * startFraction,
    endMeasureMeters: 100 * endFraction,
    startFraction,
    endFraction,
    identityId,
    roadId,
    displayName,
    routeSystem,
    routeNumber,
    county: "Belmont",
    sourceDigest: `${runOrder}`.repeat(32),
    geometryDigest: `${runOrder + 3}`.repeat(32),
    buildDigest: "a".repeat(32),
    junctionDigest,
    sourceMatch,
  };
  if (sourceMatch === "ordered_exact") {
    run.matchedSourceStepOrder = matchedSourceStepOrder;
    run.matchedSourceRoadId = matchedSourceRoadId;
  }
  return run;
}

function graphIntegrationReceipt(routed) {
  const receipt = {
    schemaVersion: ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION,
    padId: routed.padId,
    recordRevision: routed.recordRevision,
    routedIdentitySha256: routed.diagnostics.routedIdentitySha256,
    routeCoordinateSha256: computeRouteCoordinateSha256(routed.roadCoordinates),
    measureBasis: ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS,
    runs: [
      graphExactRun({
        runOrder: 1,
        sectionOrder: 1,
        identityId: "44444444-4444-4444-4444-444444444444",
        roadId: GRAPH_TEST_ROAD_1,
        displayName: "OH-149",
        routeSystem: "SR",
        routeNumber: "149",
        sourceMatch: "ordered_exact",
        matchedSourceStepOrder: 1,
        matchedSourceRoadId: GRAPH_TEST_ROAD_1,
      }),
      graphExactRun({
        runOrder: 2,
        sectionOrder: 2,
        identityId: "55555555-5555-5555-5555-555555555555",
        displayName: "Graph Connector Rd",
        routeSystem: "CR",
        routeNumber: "77",
        sourceMatch: "graph_named_only",
        junctionDigest: "b".repeat(32),
      }),
      graphExactRun({
        runOrder: 3,
        sectionOrder: 3,
        identityId: "66666666-6666-6666-6666-666666666666",
        roadId: GRAPH_TEST_ROAD_2,
        displayName: "Named Tail Rd",
        routeSystem: "TR",
        routeNumber: "12",
        sourceMatch: "ordered_exact",
        matchedSourceStepOrder: 2,
        matchedSourceRoadId: GRAPH_TEST_ROAD_2,
        junctionDigest: "c".repeat(32),
      }),
    ],
  };
  receipt.receiptKeySha256 = computeGraphEvidenceReceiptKeySha256(receipt);
  receipt.receiptSha256 = computeGraphEvidenceReceiptSha256(receipt);
  return receipt;
}

function resealGraphIntegrationReceipt(receipt) {
  receipt.receiptKeySha256 = computeGraphEvidenceReceiptKeySha256(receipt);
  receipt.receiptSha256 = computeGraphEvidenceReceiptSha256(receipt);
  return receipt;
}

test("generator applies sealed graph runs without changing route geometry or mileage", () => {
  const { policy, routed } = graphIntegrationRoute();
  const receipt = graphIntegrationReceipt(routed);
  const roadCoordinates = routed.roadCoordinates;
  const roadCoordinatesBefore = JSON.stringify(roadCoordinates);
  const mileageBefore = structuredClone(routed.mileage);

  const output = applyGraphEvidenceToRoutedRecord(routed, policy, receipt);

  assert.strictEqual(output.roadCoordinates, roadCoordinates);
  assert.equal(JSON.stringify(output.roadCoordinates), roadCoordinatesBefore);
  assert.deepEqual(output.mileage, mileageBefore);
  assert.equal(output.sections.reduce((sum, section) => sum + section.distanceMeters, 0), 300);
  assert.deepEqual(output.sections.map((section) => section.colorRole), [
    "teal",
    "unverified",
    "unverified",
  ]);
  assert.ok(output.sections.every((section) => section.lineStyle === "solid"));
  assert.deepEqual(output.sections.map((section) => section.sourceDisplayRoad), [
    "OH-149",
    "Graph Connector Rd",
    "Named Tail Rd",
  ]);
  assert.deepEqual(output.sections.map((section) => section.sourceIdentityId), [
    "44444444-4444-4444-4444-444444444444",
    "55555555-5555-5555-5555-555555555555",
    "66666666-6666-6666-6666-666666666666",
  ]);
  assert.equal(output.sections[2].sourceMatch, "ordered_exact");
  assert.equal(output.sections[2].colorRole, "unverified");
  assert.equal(
    output.sections[1].instruction,
    "Turn right onto Graph Connector Rd · graph-identified / unapproved",
  );
  assert.equal(
    output.sections[2].instruction,
    "Continue on Named Tail Rd · graph-identified / unapproved",
  );
  assert.deepEqual(output.sections[0].coordinates, [[-81, 40], [-81, 40.001]]);
  assert.equal(output.diagnostics.graphEvidenceReceiptApplied, true);
  assert.equal(output.diagnostics.graphEvidenceNamedNeutralRunCount, 2);
  assert.equal(output.diagnostics.graphEvidenceReceiptSha256, receipt.receiptSha256);
});

test("graph projection is byte-deterministic across a second generation pass", () => {
  const firstInput = graphIntegrationRoute();
  const firstReceipt = graphIntegrationReceipt(firstInput.routed);
  const first = applyGraphEvidenceToRoutedRecord(
    firstInput.routed,
    firstInput.policy,
    firstReceipt,
  );
  const secondInput = graphIntegrationRoute();
  const secondReceipt = graphIntegrationReceipt(secondInput.routed);
  const second = applyGraphEvidenceToRoutedRecord(
    secondInput.routed,
    secondInput.policy,
    secondReceipt,
  );

  assert.equal(JSON.stringify(second), JSON.stringify(first));
  assert.equal(JSON.stringify(secondReceipt), JSON.stringify(firstReceipt));
});

test("generator preserves fractional child-line union when graph evidence splits one router section", () => {
  const { policy, routed } = graphIntegrationRoute();
  const original = graphIntegrationReceipt(routed);
  const first = original.runs[0];
  const receipt = {
    ...original,
    runs: [
      {
        ...first,
        runOrder: 1,
        startMeasureMeters: 0,
        endMeasureMeters: 40,
        startFraction: 0,
        endFraction: 0.4,
      },
      {
        ...first,
        runOrder: 2,
        startMeasureMeters: 40,
        endMeasureMeters: 100,
        startFraction: 0.4,
        endFraction: 1,
      },
      { ...original.runs[1], runOrder: 3 },
      { ...original.runs[2], runOrder: 4 },
    ],
  };
  receipt.receiptKeySha256 = computeGraphEvidenceReceiptKeySha256(receipt);
  receipt.receiptSha256 = computeGraphEvidenceReceiptSha256(receipt);

  const output = applyGraphEvidenceToRoutedRecord(routed, policy, receipt);
  const [left, right] = output.sections;

  assert.equal(left.parentSectionOrder, 1);
  assert.equal(right.parentSectionOrder, 1);
  assert.strictEqual(left.coordinates[0], routed.roadCoordinates[0]);
  assert.strictEqual(right.coordinates.at(-1), routed.roadCoordinates[1]);
  assert.strictEqual(left.coordinates.at(-1), right.coordinates[0]);
  assert.equal(left.distanceMeters, 40);
  assert.equal(right.distanceMeters, 60);
  assert.equal(left.distanceMeters + right.distanceMeters, routed.sections[0].distanceMeters);
  assert.equal(
    output.sections.reduce((sum, section) => sum + section.distanceMeters, 0),
    routed.mileage.roadDistanceMeters,
  );
  for (const coordinate of routed.roadCoordinates) {
    assert.ok(output.sections.some((section) => section.coordinates.includes(coordinate)));
  }
  assert.ok(output.sections.every((section) => section.lineStyle === "solid"));
});

test("generator rejects receipt hash drift before any graph identity is projected", () => {
  const { policy, routed } = graphIntegrationRoute();
  const receipt = graphIntegrationReceipt(routed);
  receipt.runs[1].displayName = "Tampered Connector";

  assert.throws(
    () => applyGraphEvidenceToRoutedRecord(routed, policy, receipt),
    /graph-evidence receipt was rejected: receipt content digest drifted/,
  );
});

test("generator fails closed on every routed receipt binding and coverage drift", () => {
  const { policy, routed } = graphIntegrationRoute();
  const cases = [
    {
      label: "padId",
      mutate: (receipt) => { receipt.padId = "cccccccc-cccc-cccc-cccc-cccccccccccc"; },
      expected: /receipt padId does not match the routed pad/,
    },
    {
      label: "recordRevision",
      mutate: (receipt) => { receipt.recordRevision = "different-revision"; },
      expected: /recordRevision does not match/,
    },
    {
      label: "routedIdentitySha256",
      mutate: (receipt) => { receipt.routedIdentitySha256 = "0".repeat(64); },
      expected: /routedIdentitySha256 does not match/,
    },
    {
      label: "routeCoordinateSha256",
      mutate: (receipt) => { receipt.routeCoordinateSha256 = "0".repeat(64); },
      expected: /routeCoordinateSha256 does not match/,
    },
    {
      label: "measureBasis",
      mutate: (receipt) => { receipt.measureBasis = "drifted-measure-basis"; },
      expected: /measureBasis must be parent_section_distance_meters/,
    },
    {
      label: "section coverage",
      mutate: (receipt) => { receipt.runs = receipt.runs.slice(0, 2); },
      expected: /section 3 has no graph-evidence coverage/,
    },
  ];

  for (const scenario of cases) {
    const receipt = graphIntegrationReceipt(routed);
    scenario.mutate(receipt);
    resealGraphIntegrationReceipt(receipt);
    assert.throws(
      () => applyGraphEvidenceToRoutedRecord(routed, policy, receipt),
      scenario.expected,
      scenario.label,
    );
  }
});

test("generator rejects every sealed receipt that was not applied to its routed pad", () => {
  const { routed } = graphIntegrationRoute();
  const receipt = graphIntegrationReceipt(routed);
  const graphEvidence = { receiptByPadId: new Map([[routed.padId, receipt]]) };
  assert.throws(
    () => assertNoUnusedGraphEvidenceReceipts(graphEvidence, new Set()),
    /1 stale or unrouted receipts/,
  );
  assert.doesNotThrow(() => assertNoUnusedGraphEvidenceReceipts(
    graphEvidence,
    new Set([routed.padId]),
  ));
});

test("fixture scope is sealed to the exact frozen routed pad set and source digests", () => {
  const { routed } = graphIntegrationRoute();
  const receipt = graphIntegrationReceipt(routed);
  const frozenRouteArtifactText = `${JSON.stringify({ records: [routed] })}\n`;
  const frozenSourceFixtureText = "frozen-source-fixture\n";
  const sha256 = (text) => createHash("sha256").update(text).digest("hex");
  const expectedScope = {
    receiptCount: 1,
    routeArtifactSha256: sha256(frozenRouteArtifactText),
    sourceFixtureSha256: sha256(frozenSourceFixtureText),
    padIdSetSha256: sha256(JSON.stringify([routed.padId])),
  };
  const graphEvidence = {
    fixture: {
      source: {
        routeArtifactSha256: expectedScope.routeArtifactSha256,
        frozenSourceFixtureSha256: expectedScope.sourceFixtureSha256,
      },
    },
    receiptByPadId: new Map([[routed.padId, receipt]]),
  };

  assert.doesNotThrow(() => validateGraphEvidenceFixtureScope(
    graphEvidence,
    frozenSourceFixtureText,
    expectedScope,
  ));
  // A second validation is identical even if the mutable generated artifact
  // has already been replaced; it is deliberately not an input to the seal.
  assert.doesNotThrow(() => validateGraphEvidenceFixtureScope(
    graphEvidence,
    frozenSourceFixtureText,
    expectedScope,
  ));

  const missingPad = {
    ...graphEvidence,
    receiptByPadId: new Map(),
  };
  assert.throws(
    () => validateGraphEvidenceFixtureScope(
      missingPad,
      frozenSourceFixtureText,
      expectedScope,
    ),
    /pad scope drifted from the frozen 1 routed records/,
  );
  assert.throws(
    () => validateGraphEvidenceFixtureScope(
      graphEvidence,
      `${frozenSourceFixtureText} `,
      expectedScope,
    ),
    /source artifact digest drifted/,
  );
});

test("a successful route without a receipt keeps every line and mile as solid neutral", () => {
  const { routed } = graphIntegrationRoute();
  const roadCoordinates = routed.roadCoordinates;
  const output = neutralizeRoutedRecordWithoutReceipt(routed, 3);

  assert.strictEqual(output.roadCoordinates, roadCoordinates);
  assert.deepEqual(output.mileage, routed.mileage);
  assert.ok(output.sections.every((section) => section.lineStyle === "solid"));
  assert.ok(output.sections.every((section) => section.colorRole === "unverified"));
  assert.ok(output.sections.every((section) => Array.isArray(section.coordinates)));
  assert.ok(output.sections.every((section) => section.graphEvidence === null));
  assert.equal(output.diagnostics.graphEvidenceReceiptApplied, false);
  assert.equal(output.diagnostics.unapprovedDistanceMeters, 300);
});

test("fixture loader validates every receipt digest and reconciles its strict summary", () => {
  const { routed } = graphIntegrationRoute();
  const receipt = graphIntegrationReceipt(routed);
  const fixture = {
    schemaVersion: 1,
    fixtureId: "graph-integration-test",
    measureBasis: ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS,
    source: {
      routeArtifactPath: "v18/src/features/map/ascentPadApproaches.batch2.json",
      routeArtifactSha256: "d".repeat(64),
      frozenSourceFixturePath: "v18/scripts/fixtures/ascent-pad-approach-source-20260829.json",
      frozenSourceFixtureSha256: "e".repeat(64),
      odotDatasetId: "77777777-7777-7777-7777-777777777777",
      extractionDate: "2026-08-29",
      extractionMethod: "read_only_spatial_indexed_sql",
    },
    policy: {
      sampleIntervalMeters: 5,
      candidateRadiusMeters: 30,
      ambiguityRadiusMeters: 20,
      exactMaximumDistanceMeters: 10,
      exactMinimumRunnerUpSeparationMeters: 5,
      unresolvedNoMatchReason: "no_authoritative_graph_match",
      productionWrites: 0,
    },
    summary: {
      recordCount: 1,
      exactRunCount: 3,
      orderedExactRunCount: 2,
      graphNamedOnlyRunCount: 1,
      unresolvedRunCount: 0,
      ambiguousRunCount: 0,
      noMatchRunCount: 0,
      verifiedJunctionCount: 2,
      productionWrites: 0,
    },
    junctions: {
      ["b".repeat(32)]: {
        junctionId: "88888888-8888-8888-8888-888888888888",
        buildId: "99999999-9999-9999-9999-999999999999",
        buildDigest: "a".repeat(32),
      },
      ["c".repeat(32)]: {
        junctionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        buildId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        buildDigest: "a".repeat(32),
      },
    },
    records: [receipt],
  };

  const receipts = validateGraphEvidenceFixture(fixture, 1);
  assert.strictEqual(receipts.get(routed.padId), receipt);

  const drifted = structuredClone(fixture);
  drifted.records[0].runs[0].displayName = "Drifted";
  assert.throws(
    () => validateGraphEvidenceFixture(drifted, 1),
    /receipt digest or schema drifted/,
  );

  const missingJunction = structuredClone(fixture);
  delete missingJunction.junctions["b".repeat(32)];
  missingJunction.summary.verifiedJunctionCount = 1;
  assert.throws(
    () => validateGraphEvidenceFixture(missingJunction, 1),
    /junction index has a missing or stale receipt binding/,
  );
});
