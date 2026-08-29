import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { generateEogApproaches } from "./generate-eog-pad-approaches.mjs";

function uuid(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function sourceFixture() {
  return {
    schemaVersion: 1,
    snapshotId: "eog-ohio-approach-source-issue200",
    directorySnapshotId: "68f1d076-fe03-4519-a5cd-c68f8a28b06c",
    sourceRevision: "8",
    directoryContentSha256: "1".repeat(64),
    scope: "eog-ohio-last-exact-highway-to-pad-source-issue200",
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
    records: Array.from({ length: 301 }, (_, index) => ({
      padId: uuid(index + 1),
      canonicalId: uuid(index + 1),
      legacyId: `eog--pin-${String(index + 1).padStart(3, "0")}`,
      recordRevision: String(1800000000000000 + index),
      padName: `EOG PIN ${String(index + 1).padStart(3, "0")}`,
      company: "EOG",
      state: "Ohio",
      county: "Harrison",
      structuredRoadSequence: index < 286 ? "Unknown local road → Lease Road" : "",
      writtenDirectionsPresent: index < 296,
      directoryCoordinateRole: index < 214 ? "saved pad reference" : "official pad reference",
      directoryCoordinate: [-81.1, 40.1],
      destinationGpsSource: index < 214 ? "saved" : "ODNR pad",
      destination: [-81.1, 40.1],
      routePrep: null,
    })),
  };
}

test("generates a complete 301-record pin-only artifact without calling a router", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brinesearch-eog-"));
  const fixturePath = path.join(directory, "source.json");
  const outputPath = path.join(directory, "artifact.json");
  await writeFile(fixturePath, `${JSON.stringify(sourceFixture())}\n`, "utf8");
  const { artifact, report } = await generateEogApproaches({
    fixturePath,
    outputPath,
    osrmBaseUrl: "http://127.0.0.1:1/route/v1/driving",
    concurrency: 1,
  });
  assert.equal(report.outputPadCount, 301);
  assert.equal(report.routedDisplayCount, 0);
  assert.equal(report.routedFailClosedCount, 0);
  assert.equal(report.pinOnlyCount, 301);
  assert.equal(report.osrmCandidateRequestCount, 0);
  assert.equal(report.productionWrites, 0);
  assert.equal(artifact.records.length, 301);
  assert.ok(artifact.records.every((record) => (
    record.status === "PIN_ONLY"
    && record.roadCoordinates.length === 0
    && record.sections.length === 0
    && record.gpsTether === null
    && record.mileage.roadDistanceMiles === null
  )));
  assert.equal(artifact.source.directorySnapshotId, "68f1d076-fe03-4519-a5cd-c68f8a28b06c");
  assert.match(artifact.source.preservedAscentBatch1Sha256, /^[0-9a-f]{64}$/u);
  assert.match(artifact.source.preservedAscentBatch2Sha256, /^[0-9a-f]{64}$/u);
  const persisted = JSON.parse(await readFile(outputPath, "utf8"));
  assert.deepEqual(persisted, artifact);
});

test("keeps only the exact prefix teal and never resumes teal after the first mismatch", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brinesearch-eog-routed-"));
  const fixturePath = path.join(directory, "source.json");
  const outputPath = path.join(directory, "artifact.json");
  const fixture = sourceFixture();
  const record = fixture.records[0];
  const roadId = "00000000-0000-5000-8000-000000000001";
  record.structuredRoadSequence = "OH-9 → Lease Road";
  record.routePrep = {
    pad_id: record.padId,
    route_prep_id: "00000000-0000-3000-8000-000000000001",
    highway_order: 1,
    point_intersections: null,
    nearest_highway_point: { type: "Point", coordinates: [-81.2, 40.2] },
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
    }, {
      roadId: null,
      aliases: [],
      rawText: "Lease Road",
      roadType: null,
      stepKind: "private_segment",
      stepOrder: 2,
      matchMethod: "unmatched_saved_road_name",
      matchStatus: "private_segment",
      routeNumber: null,
      canonicalName: null,
      distanceMiles: null,
      turnDirection: null,
      normalizedText: "Lease Road",
      roadGeometryStatus: null,
      stepGeometryStatus: "not_started",
    }],
  };
  await writeFile(fixturePath, `${JSON.stringify(fixture)}\n`, "utf8");

  const response = {
    code: "Ok",
    waypoints: [
      { location: [-81.2, 40.2], distance: 0 },
      { location: [-81.1, 40.1], distance: 0 },
    ],
    routes: [{
      distance: 1800,
      duration: 180,
      legs: [{
        steps: [{
          name: "OH-9",
          ref: "OH 9",
          distance: 1000,
          duration: 100,
          maneuver: { type: "depart", modifier: null },
          geometry: { type: "LineString", coordinates: [[-81.2, 40.2], [-81.195, 40.195]] },
        }, {
          name: "Unknown Access",
          ref: null,
          distance: 500,
          duration: 50,
          maneuver: { type: "turn", modifier: "right" },
          geometry: { type: "LineString", coordinates: [[-81.195, 40.195], [-81.19, 40.19]] },
        }, {
          name: "OH-9",
          ref: "OH 9",
          distance: 300,
          duration: 30,
          maneuver: { type: "arrive", modifier: null },
          geometry: { type: "LineString", coordinates: [[-81.19, 40.19], [-81.1, 40.1]] },
        }],
      }],
    }],
  };
  const server = http.createServer((_request, reply) => {
    reply.writeHead(200, { "content-type": "application/json" });
    reply.end(JSON.stringify(response));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const { artifact, report } = await generateEogApproaches({
      fixturePath,
      outputPath,
      osrmBaseUrl: `http://127.0.0.1:${address.port}/route/v1/driving`,
      concurrency: 1,
    });
    assert.equal(report.routedDisplayCount, 1);
    assert.equal(report.pinOnlyCount, 300);
    assert.equal(report.osrmCandidateRequestCount, 1);
    const routed = artifact.records.find((entry) => entry.padId === record.padId);
    assert.equal(routed.status, "ROUTED_DISPLAY");
    assert.deepEqual(routed.sections.map((section) => section.lineStyle), ["solid", "dashed", "dashed"]);
    assert.deepEqual(routed.sections.map((section) => section.matchState), [
      "matched_exact_master",
      "unapproved_identity_mismatch",
      "unapproved_after_first_mismatch",
    ]);
    assert.equal(routed.sections[0].sourceRoadId, roadId);
    assert.equal(routed.sections[1].sourceRoadId, null);
    assert.equal(routed.sections[2].sourceRoadId, null);
    assert.equal(routed.mileage.roadDistanceMeters, 1800);
    assert.equal(routed.mileage.gpsTetherExcluded, true);
  } finally {
    await new Promise((resolveClose, rejectClose) => server.close((error) => (
      error ? rejectClose(error) : resolveClose()
    )));
  }
});
