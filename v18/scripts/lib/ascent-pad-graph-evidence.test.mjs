import assert from "node:assert/strict";
import test from "node:test";

import {
  ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS,
  ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION,
  AscentPadGraphEvidenceError,
  applyAscentPadGraphEvidence,
  computeGraphEvidenceReceiptKeySha256,
  computeGraphEvidenceReceiptSha256,
  computeRouteCoordinateSha256,
} from "./ascent-pad-graph-evidence.mjs";

const ALABASTER_PAD_ID = "0f848006-4c09-4c7f-b9f2-4743d5ccd37f";
const ALABASTER_RECORD_REVISION = "1786258360881449";
const ALABASTER_ROUTED_IDENTITY_SHA256 = "24d9b1368e5f9dabd4358a52852cd1490bf4f94d144cb4b8cc99334326e1fd3a";

const CR82_EAST_IDENTITY_ID = "a9fc4a06-0fd2-af84-2728-57850e1b2294";
const CR82_WEST_IDENTITY_ID = "424330e6-0749-472c-8329-5227bf2367ce";
const TR33_IDENTITY_ID = "ab2d68a5-18cf-f81f-863d-bd0ca894ed32";
const CURTIS_IDENTITY_ID = "b67bbc69-dd10-6ba2-dd74-fde27c9f79dd";
const BUCKINGHAM_IDENTITY_ID = "a48d67d8-a307-7a11-ec63-8652609283fc";
const CURTIS_ROAD_ID = "3fe4f86c-4adb-43c7-b84d-e6193d3ebe2a";
const BUCKINGHAM_ROAD_ID = "5238f58b-4466-489f-b4eb-d4029928d50f";

const MONROE_BUILD_DIGEST = "fafd62f37b76e57859164010d1be967b";
const NOBLE_BUILD_DIGEST = "576c5e1b1012fcb8020fa637fb272082";

const ALABASTER_COORDINATES = [
  [-81.328179, 39.784163],
  [-81.328248, 39.783713],
  [-81.327527, 39.783174],
  [-81.326482, 39.782155],
  [-81.316257, 39.766235],
  [-81.317294, 39.765912],
  [-81.318187, 39.765387],
  [-81.321815, 39.763485],
  [-81.324889, 39.763152],
  [-81.330039, 39.761812],
  [-81.333307, 39.759918],
  [-81.340865, 39.753997],
];

const ALABASTER_SECTIONS = [
  {
    sectionOrder: 1,
    coordinateStartIndex: 0,
    coordinateEndIndex: 3,
    distanceMeters: 800,
    distanceMiles: 0.497097,
    durationSeconds: 80,
    maneuver: { type: "turn", modifier: "left" },
    routerName: "Bean Ridge Road",
    routerRef: "CR 82",
    lineStyle: "dashed",
  },
  {
    sectionOrder: 2,
    coordinateStartIndex: 3,
    coordinateEndIndex: 5,
    distanceMeters: 100,
    distanceMiles: 0.062137,
    durationSeconds: 14,
    maneuver: { type: "turn", modifier: "right" },
    routerName: "Township Highway 233",
    routerRef: null,
    lineStyle: "dashed",
  },
  {
    sectionOrder: 3,
    coordinateStartIndex: 5,
    coordinateEndIndex: 8,
    distanceMeters: 755.9,
    distanceMiles: 0.469694,
    durationSeconds: 108.9,
    maneuver: { type: "new name", modifier: "straight" },
    routerName: "Town Highway 233",
    routerRef: null,
    lineStyle: "dashed",
  },
  {
    sectionOrder: 4,
    coordinateStartIndex: 8,
    coordinateEndIndex: 11,
    distanceMeters: 1948.9,
    distanceMiles: 1.21099,
    durationSeconds: 281.1,
    maneuver: { type: "fork", modifier: "slight right" },
    routerName: "Buckingham Road",
    // This is the observed bad router ref. It is deliberately not evidence.
    routerRef: "TR 233",
    lineStyle: "dashed",
  },
  {
    sectionOrder: 5,
    coordinateStartIndex: 11,
    coordinateEndIndex: 11,
    distanceMeters: 0,
    distanceMiles: 0,
    durationSeconds: 0,
    maneuver: { type: "arrive", modifier: "left" },
    lineStyle: "none",
  },
];

const ALABASTER_ORDERED_SOURCE_ROADS = [
  { sourceStepOrder: 5, roadId: CURTIS_ROAD_ID },
  { sourceStepOrder: 6, roadId: BUCKINGHAM_ROAD_ID },
];

function exactRun({
  runOrder,
  sectionOrder,
  distanceMeters,
  identityId,
  roadId = null,
  displayName,
  routeSystem,
  routeNumber,
  county,
  sourceDigest,
  geometryDigest,
  buildDigest,
  junctionDigest = null,
  sourceMatch = "graph_named_only",
  matchedSourceStepOrder,
  matchedSourceRoadId,
  startFraction = 0,
  endFraction = 1,
}) {
  const run = {
    runOrder,
    sectionOrder,
    state: "exact",
    startMeasureMeters: distanceMeters * startFraction,
    endMeasureMeters: distanceMeters * endFraction,
    startFraction,
    endFraction,
    identityId,
    roadId,
    displayName,
    routeSystem,
    routeNumber,
    county,
    sourceDigest,
    geometryDigest,
    buildDigest,
    junctionDigest,
    sourceMatch,
  };
  if (sourceMatch === "ordered_exact") {
    run.matchedSourceStepOrder = matchedSourceStepOrder;
    run.matchedSourceRoadId = matchedSourceRoadId;
  }
  return run;
}

function unresolvedRun({
  runOrder,
  sectionOrder,
  distanceMeters,
  unresolvedReason,
  candidateIdentityIds,
  startFraction = 0,
  endFraction = 1,
}) {
  const run = {
    runOrder,
    sectionOrder,
    state: "unresolved",
    startMeasureMeters: distanceMeters * startFraction,
    endMeasureMeters: distanceMeters * endFraction,
    startFraction,
    endFraction,
    unresolvedReason,
  };
  if (candidateIdentityIds) run.candidateIdentityIds = candidateIdentityIds;
  return run;
}

function sealReceipt({
  roadCoordinates,
  runs,
  padId = ALABASTER_PAD_ID,
  recordRevision = ALABASTER_RECORD_REVISION,
  routedIdentitySha256 = ALABASTER_ROUTED_IDENTITY_SHA256,
}) {
  const receipt = {
    schemaVersion: ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION,
    padId,
    recordRevision,
    routedIdentitySha256,
    routeCoordinateSha256: computeRouteCoordinateSha256(roadCoordinates),
    measureBasis: ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS,
    runs,
  };
  receipt.receiptKeySha256 = computeGraphEvidenceReceiptKeySha256(receipt);
  receipt.receiptSha256 = computeGraphEvidenceReceiptSha256(receipt);
  return receipt;
}

function apply({
  roadCoordinates = ALABASTER_COORDINATES,
  sections = ALABASTER_SECTIONS,
  orderedSourceRoads = ALABASTER_ORDERED_SOURCE_ROADS,
  receipt,
}) {
  return applyAscentPadGraphEvidence({
    padId: ALABASTER_PAD_ID,
    recordRevision: ALABASTER_RECORD_REVISION,
    routedIdentitySha256: ALABASTER_ROUTED_IDENTITY_SHA256,
    roadCoordinates,
    sections,
    orderedSourceRoads,
    receipt,
  });
}

function alabasterExactRuns() {
  return [
    exactRun({
      runOrder: 1,
      sectionOrder: 1,
      distanceMeters: 800,
      identityId: CR82_EAST_IDENTITY_ID,
      displayName: "Bean Ridge Rd",
      routeSystem: "CR",
      routeNumber: "82",
      county: "Monroe",
      sourceDigest: "33148e72f279b2aaf501839715affe9b",
      geometryDigest: "634f67577c7f850f94884aec063bbc3a",
      buildDigest: MONROE_BUILD_DIGEST,
      sourceMatch: "graph_named_only",
    }),
    exactRun({
      runOrder: 2,
      sectionOrder: 2,
      distanceMeters: 100,
      identityId: TR33_IDENTITY_ID,
      displayName: "TR 33",
      routeSystem: "TR",
      routeNumber: "33",
      county: "Monroe",
      sourceDigest: "bc9355cdbe35960e79a6745bafc44818",
      geometryDigest: "3d22dba09e81277ca3e2406fc9639a92",
      buildDigest: MONROE_BUILD_DIGEST,
      junctionDigest: "2e0ec7a0d5c9bb80a4b8c706c634b689",
      sourceMatch: "graph_named_only",
    }),
    exactRun({
      runOrder: 3,
      sectionOrder: 3,
      distanceMeters: 755.9,
      identityId: CURTIS_IDENTITY_ID,
      roadId: CURTIS_ROAD_ID,
      displayName: "Curtis Ridge Rd",
      routeSystem: "TR",
      routeNumber: "233",
      county: "Noble",
      sourceDigest: "a72dbc7b3bc7699fe246896afd0a6d08",
      geometryDigest: "5c8509d19b7af4b08f687db7ccaecd13",
      buildDigest: NOBLE_BUILD_DIGEST,
      junctionDigest: "ca98cd007f8a8d5638f357ed2feeefe9",
      sourceMatch: "ordered_exact",
      matchedSourceStepOrder: 5,
      matchedSourceRoadId: CURTIS_ROAD_ID,
    }),
    exactRun({
      runOrder: 4,
      sectionOrder: 4,
      distanceMeters: 1948.9,
      identityId: BUCKINGHAM_IDENTITY_ID,
      roadId: BUCKINGHAM_ROAD_ID,
      displayName: "Buckingham Rd",
      routeSystem: "TR",
      routeNumber: "232",
      county: "Noble",
      sourceDigest: "db22ae939113d96ee75de324e6717ba0",
      geometryDigest: "2d9006b49a88addfc0232cf873e3d43f",
      buildDigest: NOBLE_BUILD_DIGEST,
      junctionDigest: "c5e44ef2d9a4304fc1f43eea9cc73e5c",
      sourceMatch: "ordered_exact",
      matchedSourceStepOrder: 6,
      matchedSourceRoadId: BUCKINGHAM_ROAD_ID,
    }),
  ];
}

test("ALABASTER graph-only CR-82/TR-33 trigger the permanent stop without losing exact downstream names", () => {
  const receipt = sealReceipt({
    roadCoordinates: ALABASTER_COORDINATES,
    runs: alabasterExactRuns(),
  });
  const coordinatesBefore = JSON.stringify(ALABASTER_COORDINATES);
  const sectionsBefore = JSON.stringify(ALABASTER_SECTIONS);
  const receiptBefore = JSON.stringify(receipt);

  const result = apply({ receipt });

  assert.strictEqual(result.roadCoordinates, ALABASTER_COORDINATES);
  assert.strictEqual(result.baseSections, ALABASTER_SECTIONS);
  assert.equal(JSON.stringify(ALABASTER_COORDINATES), coordinatesBefore);
  assert.equal(JSON.stringify(ALABASTER_SECTIONS), sectionsBefore);
  assert.equal(JSON.stringify(receipt), receiptBefore);
  assert.equal(result.firstNonOrderedRunOrder, 1);
  assert.equal(result.firstUnresolvedRunOrder, null);

  const nonstructural = result.sectionRuns.filter((section) => section.lineStyle !== "none");
  assert.deepEqual(nonstructural.map((section) => section.colorRole), [
    "unverified",
    "unverified",
    "unverified",
    "unverified",
  ]);
  assert.ok(nonstructural.every((section) => section.lineStyle === "solid"));
  assert.ok(result.sectionRuns.every((section) => section.lineStyle !== "dashed"));
  assert.deepEqual(nonstructural.map((section) => section.sourceDisplayRoad), [
    "Bean Ridge Rd",
    "TR 33",
    "Curtis Ridge Rd",
    "Buckingham Rd",
  ]);
  assert.deepEqual(nonstructural.map((section) => section.sourceIdentityId), [
    CR82_EAST_IDENTITY_ID,
    TR33_IDENTITY_ID,
    CURTIS_IDENTITY_ID,
    BUCKINGHAM_IDENTITY_ID,
  ]);
  assert.equal(
    nonstructural[0].instruction,
    "Turn left onto Bean Ridge Rd · graph-identified / unapproved",
  );
  assert.equal(nonstructural[3].routeNumber, "232");
  assert.equal(nonstructural[3].graphEvidence.routeNumber, "232");
  assert.equal(nonstructural[3].routerRef, "TR 233");
  assert.equal(
    nonstructural[3].instruction,
    "Continue on Buckingham Rd · graph-identified / unapproved",
  );
  assert.equal(nonstructural[2].sourceStepOrder, 5);
  assert.equal(nonstructural[2].matchedSourceRoadId, CURTIS_ROAD_ID);
});

test("ordered exact Curtis and Buckingham runs are teal only while the source prefix remains intact", () => {
  const roadCoordinates = ALABASTER_COORDINATES.slice(5);
  const sections = [
    { ...ALABASTER_SECTIONS[2], sectionOrder: 1, coordinateStartIndex: 0, coordinateEndIndex: 3 },
    { ...ALABASTER_SECTIONS[3], sectionOrder: 2, coordinateStartIndex: 3, coordinateEndIndex: 6 },
  ];
  const runs = alabasterExactRuns().slice(2).map((run, index) => ({
    ...run,
    runOrder: index + 1,
    sectionOrder: index + 1,
    junctionDigest: index === 0 ? null : run.junctionDigest,
  }));
  const receipt = sealReceipt({ roadCoordinates, runs });

  const result = apply({ roadCoordinates, sections, receipt });

  assert.deepEqual(result.sectionRuns.map((section) => section.colorRole), ["teal", "teal"]);
  assert.deepEqual(result.sectionRuns.map((section) => section.sourceDisplayRoad), [
    "Curtis Ridge Rd",
    "Buckingham Rd",
  ]);
  assert.equal(result.firstNonOrderedRunOrder, null);
  assert.ok(result.sectionRuns.every((section) => section.lineStyle === "solid"));
});

test("metadata sub-splitting derives child line substrings with shared endpoints and exact distance sums", () => {
  const roadCoordinates = [
    [-81.03, 40],
    [-81.02, 40],
    [-81.01, 40],
    [-81, 40],
  ];
  const sections = [{
    sectionOrder: 1,
    coordinateStartIndex: 0,
    coordinateEndIndex: 3,
    distanceMeters: 101,
    distanceMiles: 0.062758,
    durationSeconds: 31,
    maneuver: { type: "depart", modifier: null },
    lineStyle: "dashed",
  }];
  const base = {
    sectionOrder: 1,
    distanceMeters: 101,
    identityId: CURTIS_IDENTITY_ID,
    roadId: CURTIS_ROAD_ID,
    displayName: "Curtis Ridge Rd",
    routeSystem: "TR",
    routeNumber: "233",
    county: "Noble",
    sourceDigest: "a72dbc7b3bc7699fe246896afd0a6d08",
    geometryDigest: "5c8509d19b7af4b08f687db7ccaecd13",
    buildDigest: NOBLE_BUILD_DIGEST,
    sourceMatch: "ordered_exact",
    matchedSourceStepOrder: 5,
    matchedSourceRoadId: CURTIS_ROAD_ID,
  };
  const runs = [
    exactRun({ ...base, runOrder: 1, startFraction: 0, endFraction: 0.4 }),
    exactRun({ ...base, runOrder: 2, startFraction: 0.4, endFraction: 1 }),
  ];
  const receipt = sealReceipt({ roadCoordinates, runs });
  const coordinatesBefore = JSON.stringify(roadCoordinates);

  const result = apply({ roadCoordinates, sections, receipt });
  const [left, right] = result.sectionRuns;

  assert.equal(result.roadCoordinates, roadCoordinates);
  assert.equal(JSON.stringify(roadCoordinates), coordinatesBefore);
  assert.notDeepEqual(left.coordinates, roadCoordinates);
  assert.notDeepEqual(right.coordinates, roadCoordinates);
  assert.strictEqual(left.coordinates.at(-1), right.coordinates[0]);
  assert.strictEqual(left.coordinates[0], roadCoordinates[0]);
  assert.strictEqual(right.coordinates.at(-1), roadCoordinates.at(-1));
  for (const coordinate of roadCoordinates) {
    assert.ok(
      left.coordinates.includes(coordinate) || right.coordinates.includes(coordinate),
      `base coordinate ${coordinate.join(",")} must remain in a child substring`,
    );
  }
  assert.equal(left.distanceMeters + right.distanceMeters, sections[0].distanceMeters);
  assert.equal(left.distanceMiles + right.distanceMiles, sections[0].distanceMiles);
  assert.equal(left.durationSeconds + right.durationSeconds, sections[0].durationSeconds);
  assert.ok(result.sectionRuns.every((section) => section.lineStyle === "solid"));
  assert.equal(left.instruction, "Start on Curtis Ridge Rd");
  assert.equal(right.instruction, "Continue on Curtis Ridge Rd");
});

test("route-coordinate drift rejects a receipt before graph names can be applied", () => {
  const receipt = sealReceipt({
    roadCoordinates: ALABASTER_COORDINATES,
    runs: alabasterExactRuns(),
  });
  const changedCoordinates = structuredClone(ALABASTER_COORDINATES);
  changedCoordinates[5][0] += 0.000001;

  assert.throws(
    () => apply({ roadCoordinates: changedCoordinates, receipt }),
    (error) => error instanceof AscentPadGraphEvidenceError
      && /routeCoordinateSha256 does not match roadCoordinates/.test(error.message),
  );
});

test("receipt digest drift rejects changed graph geometry evidence", () => {
  const receipt = sealReceipt({
    roadCoordinates: ALABASTER_COORDINATES,
    runs: alabasterExactRuns(),
  });
  receipt.runs[2].geometryDigest = "0".repeat(32);

  assert.throws(
    () => apply({ receipt }),
    (error) => error instanceof AscentPadGraphEvidenceError
      && /content digest drifted/.test(error.message),
  );
});

test("graph identity cannot claim teal without an exact stored source-step roadId binding", () => {
  const runs = alabasterExactRuns();
  runs[0] = {
    ...runs[0],
    sourceMatch: "ordered_exact",
    matchedSourceStepOrder: 5,
    matchedSourceRoadId: CURTIS_ROAD_ID,
  };
  const receipt = sealReceipt({ roadCoordinates: ALABASTER_COORDINATES, runs });

  assert.throws(
    () => apply({ receipt }),
    (error) => error instanceof AscentPadGraphEvidenceError
      && /roadId must exactly equal matchedSourceRoadId/.test(error.message),
  );

  const absentBindingRuns = alabasterExactRuns();
  absentBindingRuns[0] = {
    ...absentBindingRuns[0],
    roadId: CURTIS_ROAD_ID,
    sourceMatch: "ordered_exact",
    matchedSourceStepOrder: 4,
    matchedSourceRoadId: CURTIS_ROAD_ID,
  };
  const absentBindingReceipt = sealReceipt({
    roadCoordinates: ALABASTER_COORDINATES,
    runs: absentBindingRuns,
  });
  assert.throws(
    () => apply({ receipt: absentBindingReceipt }),
    /ordered_exact binding is absent from orderedSourceRoads/,
  );
});

test("missing or drifted orderedSourceRoads fail closed for otherwise valid ordered_exact evidence", () => {
  const roadCoordinates = ALABASTER_COORDINATES.slice(5);
  const sections = [
    { ...ALABASTER_SECTIONS[2], sectionOrder: 1, coordinateStartIndex: 0, coordinateEndIndex: 3 },
    { ...ALABASTER_SECTIONS[3], sectionOrder: 2, coordinateStartIndex: 3, coordinateEndIndex: 6 },
  ];
  const runs = alabasterExactRuns().slice(2).map((run, index) => ({
    ...run,
    runOrder: index + 1,
    sectionOrder: index + 1,
    junctionDigest: index === 0 ? null : run.junctionDigest,
  }));
  const receipt = sealReceipt({ roadCoordinates, runs });

  assert.throws(
    () => apply({ roadCoordinates, sections, orderedSourceRoads: null, receipt }),
    /orderedSourceRoads must be an array/,
  );
  assert.throws(
    () => apply({
      roadCoordinates,
      sections,
      orderedSourceRoads: [
        { sourceStepOrder: 5, roadId: BUCKINGHAM_ROAD_ID },
        { sourceStepOrder: 6, roadId: BUCKINGHAM_ROAD_ID },
      ],
      receipt,
    }),
    /ordered_exact binding is absent from orderedSourceRoads/,
  );
});

test("an explicit ambiguous connector stays neutral and permanently neutralizes later named graph runs", () => {
  const roadCoordinates = ALABASTER_COORDINATES.slice(3);
  const sections = [
    { ...ALABASTER_SECTIONS[2], sectionOrder: 1, coordinateStartIndex: 0, coordinateEndIndex: 3 },
    {
      ...ALABASTER_SECTIONS[1],
      sectionOrder: 2,
      coordinateStartIndex: 3,
      coordinateEndIndex: 5,
      distanceMeters: 97.1,
      distanceMiles: 0.060335,
    },
    { ...ALABASTER_SECTIONS[3], sectionOrder: 3, coordinateStartIndex: 5, coordinateEndIndex: 8 },
  ];
  const candidateIdentityIds = [CR82_WEST_IDENTITY_ID, TR33_IDENTITY_ID].sort();
  const runs = [
    exactRun({
      ...alabasterExactRuns()[2],
      runOrder: 1,
      sectionOrder: 1,
      distanceMeters: 755.9,
      junctionDigest: null,
    }),
    unresolvedRun({
      runOrder: 2,
      sectionOrder: 2,
      distanceMeters: 97.1,
      unresolvedReason: "ambiguous_graph_overlap",
      candidateIdentityIds,
    }),
    exactRun({
      ...alabasterExactRuns()[3],
      runOrder: 3,
      sectionOrder: 3,
      distanceMeters: 1948.9,
      junctionDigest: null,
    }),
  ];
  const receipt = sealReceipt({ roadCoordinates, runs });

  const result = apply({ roadCoordinates, sections, receipt });

  assert.deepEqual(result.sectionRuns.map((section) => section.colorRole), [
    "teal",
    "unverified",
    "unverified",
  ]);
  assert.equal(result.sectionRuns[1].sourceDisplayRoad, null);
  assert.equal(result.sectionRuns[2].sourceDisplayRoad, "Buckingham Rd");
  assert.equal(
    result.sectionRuns[2].instruction,
    "Continue on Buckingham Rd · graph-identified / unapproved",
  );
  assert.equal(result.firstUnresolvedRunOrder, 2);
  assert.equal(result.firstNonOrderedRunOrder, 2);
  assert.ok(result.sectionRuns.every((section) => section.lineStyle === "solid"));
});

test("a geometric gap omitted from receipt coverage is rejected instead of being bridged", () => {
  const roadCoordinates = [
    [-81.03, 40],
    [-81.02, 40],
    [-81.01, 40],
  ];
  const sections = [{
    sectionOrder: 1,
    coordinateStartIndex: 0,
    coordinateEndIndex: 2,
    distanceMeters: 100,
  }];
  const base = {
    sectionOrder: 1,
    distanceMeters: 100,
    identityId: CURTIS_IDENTITY_ID,
    roadId: CURTIS_ROAD_ID,
    displayName: "Curtis Ridge Rd",
    routeSystem: "TR",
    routeNumber: "233",
    county: "Noble",
    sourceDigest: "a72dbc7b3bc7699fe246896afd0a6d08",
    geometryDigest: "5c8509d19b7af4b08f687db7ccaecd13",
    buildDigest: NOBLE_BUILD_DIGEST,
    sourceMatch: "ordered_exact",
    matchedSourceStepOrder: 5,
    matchedSourceRoadId: CURTIS_ROAD_ID,
  };
  const runs = [
    exactRun({ ...base, runOrder: 1, startFraction: 0, endFraction: 0.4 }),
    exactRun({ ...base, runOrder: 2, startFraction: 0.6, endFraction: 1 }),
  ];
  const receipt = sealReceipt({ roadCoordinates, runs });

  assert.throws(
    () => apply({ roadCoordinates, sections, receipt }),
    /overlap or unrepresented graph-evidence gap/,
  );
});
