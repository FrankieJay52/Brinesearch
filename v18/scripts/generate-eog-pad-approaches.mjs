import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  exactPrefixPolicy,
  matchRouteSteps,
  resolveRouteCandidates,
  routedRecord,
} from "./generate-ascent-pad-approaches-batch2.mjs";
import {
  EXPECTED_EOG_PAD_COUNT,
  validateEogApproachSource,
} from "./eog-pad-approach-source-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const v18 = resolve(here, "..");
const defaultFixturePath = resolve(here, "fixtures/eog-pad-approach-source-issue200.json");
const defaultOutputPath = resolve(v18, "src/features/map/eogPadApproaches.issue200.json");
const ascentBatch1Path = resolve(v18, "src/features/map/ascentPadRoadDisplays.batch1.json");
const ascentBatch2Path = resolve(v18, "src/features/map/ascentPadApproaches.batch2.json");
const defaultOsrmBaseUrl = "https://router.project-osrm.org/route/v1/driving";
const maximumStartToDestinationAirMiles = 25;
const maximumExactIntersectionSnapMeters = 25;
const maximumCandidateHighwaySnapMeters = 100;

function fail(message) {
  throw new Error(`EOG approach generation failed: ${message}`);
}

function digestText(value) {
  return createHash("sha256").update(value.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function coordinate(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function haversineMeters(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const leftLatitude = radians(left[1]);
  const rightLatitude = radians(right[1]);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function orderedStepsForRoute(route) {
  const output = [];
  for (const [legIndex, leg] of (route.legs || []).entries()) {
    for (const [stepIndex, step] of (leg.steps || []).entries()) {
      const coordinates = step.geometry?.coordinates;
      if (step.geometry?.type !== "LineString"
        || !Array.isArray(coordinates)
        || !coordinates.length
        || !coordinates.every(coordinate)
        || !Number.isFinite(step.distance)) return null;
      output.push({
        legIndex,
        stepIndex,
        ref: step.ref || null,
        name: step.name || null,
        distanceMeters: step.distance,
        durationSeconds: Number.isFinite(step.duration) ? step.duration : null,
        maneuver: {
          type: step.maneuver?.type || null,
          modifier: step.maneuver?.modifier || null,
          exit: Number.isInteger(step.maneuver?.exit) ? step.maneuver.exit : null,
        },
        coordinates,
      });
    }
  }
  return output.length ? output : null;
}

async function fetchJsonWithRetry(url, label, attempts = 4) {
  let lastReason = "unknown_error";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "BrineSearch-EOG-issue200-generator/1.0" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return { ok: true, payload: await response.json() };
      lastReason = `http_${response.status}`;
      if (response.status !== 429 && response.status < 500) break;
      const retryAfter = Number(response.headers.get("retry-after"));
      await delay(Number.isFinite(retryAfter) ? retryAfter * 1_000 : 500 * (2 ** (attempt - 1)));
    } catch (error) {
      lastReason = error instanceof Error ? error.name : "network_error";
      if (attempt < attempts) await delay(500 * (2 ** (attempt - 1)));
    }
  }
  return { ok: false, reason: `${label}:${lastReason}` };
}

async function fetchOsrmCandidate(specification, osrmBaseUrl) {
  const { record, candidate } = specification;
  if (!coordinate(record.destination) || !coordinate(candidate.requestedCoordinate)) {
    return { ok: false, reason: "invalid_candidate_or_destination" };
  }
  if (candidate.anchoredRoadId !== record.routePrep?.highway?.roadId
    || record.routePrep?.highway?.matchStatus !== "exact_master"
    || record.routePrep?.highway?.hasGeometry !== true
    || record.routePrep?.highway?.geometryStatus !== "official_centerline_loaded"
    || candidate.startToDestinationAirMiles > maximumStartToDestinationAirMiles) {
    return { ok: false, reason: "candidate_start_lacks_exact_loaded_highway_anchor" };
  }
  const coordinateText = [candidate.requestedCoordinate, record.destination]
    .map((point) => `${point[0]},${point[1]}`).join(";");
  const url = `${osrmBaseUrl}/${coordinateText}`
    + "?alternatives=false&steps=true&geometries=geojson&overview=false&continue_straight=true";
  const fetched = await fetchJsonWithRetry(url, `${record.padName}:${candidate.id}`);
  if (!fetched.ok) return fetched;
  const payload = fetched.payload;
  const route = payload?.routes?.[0];
  const orderedSteps = orderedStepsForRoute(route || {});
  const snappedStart = payload?.waypoints?.[0]?.location;
  const snappedEndpoint = payload?.waypoints?.at(-1)?.location;
  const waypointDistances = payload?.waypoints?.map((waypoint) => waypoint.distance);
  if (payload?.code !== "Ok" || !orderedSteps || route?.legs?.length !== 1
    || !coordinate(snappedStart) || !coordinate(snappedEndpoint)
    || !Array.isArray(waypointDistances) || waypointDistances.length !== 2
    || waypointDistances.some((distance) => !Number.isFinite(distance))
    || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
    return { ok: false, reason: `osrm_${payload?.code || "incomplete_response"}` };
  }
  const maximumSnap = candidate.candidateOnly
    ? maximumCandidateHighwaySnapMeters : maximumExactIntersectionSnapMeters;
  if (waypointDistances[0] > maximumSnap) {
    return { ok: false, reason: candidate.candidateOnly
      ? "candidate_highway_start_snap_exceeds_100_meters"
      : "exact_intersection_start_snap_exceeds_25_meters" };
  }
  if (haversineMeters(orderedSteps[0].coordinates[0], snappedStart) > 2
    || haversineMeters(orderedSteps.at(-1).coordinates.at(-1), snappedEndpoint) > 2) {
    return { ok: false, reason: "osrm_step_geometry_snap_mismatch" };
  }
  return {
    ok: true,
    candidate,
    orderedSteps,
    snappedStart,
    snappedEndpoint,
    startSnapMeters: waypointDistances[0],
    destinationSnapMeters: waypointDistances[1],
    routeDistanceMeters: route.distance,
    routeDurationSeconds: route.duration,
  };
}

async function routeBatch(specifications, osrmBaseUrl, concurrency) {
  const output = new Array(specifications.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < specifications.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await fetchOsrmCandidate(specifications[index], osrmBaseUrl);
      await delay(100);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(concurrency, Math.max(1, specifications.length)) },
    () => worker(),
  ));
  return output;
}

function sourceDirections(record, policy) {
  if (!policy) return [];
  const groups = new Map(policy.groups.map((group) => [group.stepOrder, group]));
  return [...(record.routePrep?.steps || [])]
    .filter((step) => Number(step.stepOrder) >= policy.highwayOrder)
    .sort((left, right) => Number(left.stepOrder) - Number(right.stepOrder))
    .map((step, index) => {
      const group = groups.get(Number(step.stepOrder));
      return {
        directionOrder: index + 1,
        sourceStepOrder: Number(step.stepOrder),
        sourceDisplayRoad: group?.displayRoad || null,
        instructionRole: group ? "named_public_road" : "generic_unapproved_access",
        instruction: group ? `Continue on ${group.displayRoad}` : "Continue on unnamed/unapproved access",
        sourceDistanceMiles: Number.isFinite(step.distanceMiles) ? step.distanceMiles : null,
        sourceTurnDirection: group && step.turnDirection ? step.turnDirection : null,
      };
    });
}

function pinOnlyRecord(record, policy, reason, attemptedCandidateCount = 0, diagnostics = {}) {
  return {
    padId: record.padId,
    canonicalId: record.canonicalId,
    legacyId: record.legacyId,
    recordRevision: record.recordRevision,
    padName: record.padName,
    company: record.company,
    state: record.state,
    county: record.county,
    structuredRoadSequence: record.structuredRoadSequence,
    destination: coordinate(record.destination) ? {
      coordinates: record.destination,
      gpsSource: record.destinationGpsSource,
      directoryCoordinateRole: record.directoryCoordinateRole,
    } : null,
    lastHighway: policy ? {
      sourceStepOrder: policy.highwayOrder,
      roadId: policy.groups[0].roadId,
      displayRoad: policy.groups[0].displayRoad,
      roadType: policy.groups[0].roadType,
    } : null,
    sourceDirections: sourceDirections(record, policy),
    status: "PIN_ONLY",
    reason,
    start: null,
    roadCoordinates: [],
    sections: [],
    gpsTether: null,
    mileage: {
      roadDistanceMeters: null,
      roadDistanceMiles: null,
      totalToGpsMeters: null,
      totalToGpsMiles: null,
      gpsTetherExcluded: true,
    },
    diagnostics: { attemptedCandidateCount, ...diagnostics, productionWrites: 0 },
  };
}

function candidateScore(result, policy) {
  const matched = matchRouteSteps(result.orderedSteps, policy);
  return {
    result,
    matched,
    score: [
      matched.matchedStepCount > 0 ? 1 : 0,
      matched.matchedGroupCount,
      matched.solidDistanceMeters,
      -result.startSnapMeters,
      -result.routeDistanceMeters,
      result.candidate.id,
    ],
  };
}

function compareScores(left, right) {
  for (let index = 0; index < left.score.length - 1; index += 1) {
    if (left.score[index] !== right.score[index]) return right.score[index] - left.score[index];
  }
  return String(left.score.at(-1)).localeCompare(String(right.score.at(-1)));
}

function parseArguments(argv) {
  const options = {
    fixturePath: defaultFixturePath,
    outputPath: defaultOutputPath,
    osrmBaseUrl: process.env.BRINESEARCH_OSRM_BASE_URL || defaultOsrmBaseUrl,
    concurrency: Number(process.env.BRINESEARCH_OSRM_CONCURRENCY || 4),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--fixture") options.fixturePath = resolve(argv[++index]);
    else if (argument === "--output") options.outputPath = resolve(argv[++index]);
    else if (argument === "--osrm-base-url") options.osrmBaseUrl = argv[++index];
    else if (argument === "--concurrency") options.concurrency = Number(argv[++index]);
    else fail(`unknown argument ${argument}`);
  }
  if (!options.osrmBaseUrl || !Number.isInteger(options.concurrency)
    || options.concurrency < 1 || options.concurrency > 12) fail("OSRM base URL or concurrency is invalid");
  options.osrmBaseUrl = options.osrmBaseUrl.replace(/\/+$/u, "");
  return options;
}

async function generateEogApproaches(options = {}) {
  const fixturePath = options.fixturePath || defaultFixturePath;
  const outputPath = options.outputPath || defaultOutputPath;
  const osrmBaseUrl = (options.osrmBaseUrl || defaultOsrmBaseUrl).replace(/\/+$/u, "");
  const concurrency = options.concurrency || 4;
  const [fixtureText, ascentBatch1Text, ascentBatch2Text] = await Promise.all([
    readFile(fixturePath, "utf8"),
    readFile(ascentBatch1Path, "utf8"),
    readFile(ascentBatch2Path, "utf8"),
  ]);
  const fixture = JSON.parse(fixtureText);
  const sourceSummary = validateEogApproachSource(fixture);
  const records = [...fixture.records].sort((left, right) => (
    left.padName.localeCompare(right.padName) || left.padId.localeCompare(right.padId)
  ));

  const policyByPadId = new Map(records.map((record) => [
    record.padId,
    coordinate(record.destination) ? exactPrefixPolicy(record) : null,
  ]));
  const resolutionByPadId = new Map(records.map((record) => [
    record.padId,
    coordinate(record.destination) && policyByPadId.get(record.padId)
      ? resolveRouteCandidates(record, policyByPadId.get(record.padId))
      : { candidates: [], rejectionReason: null, rejectionDiagnostics: {} },
  ]));
  const specifications = records.flatMap((record) => (
    resolutionByPadId.get(record.padId).candidates.map((candidate) => ({ record, candidate }))
  ));
  const results = await routeBatch(specifications, osrmBaseUrl, concurrency);
  const resultsByPadId = new Map(records.map((record) => [record.padId, []]));
  for (let index = 0; index < specifications.length; index += 1) {
    resultsByPadId.get(specifications[index].record.padId).push(results[index]);
  }

  const outputRecords = records.map((record) => {
    const policy = policyByPadId.get(record.padId);
    if (!coordinate(record.destination)) return pinOnlyRecord(record, policy, "no_trusted_destination");
    if (!record.structuredRoadSequence.trim()) return pinOnlyRecord(record, null, "no_structured_road_sequence");
    if (!policy) return pinOnlyRecord(record, null, "no_exact_last_interstate_us_or_state_highway");
    const resolution = resolutionByPadId.get(record.padId);
    if (!resolution.candidates.length) {
      return pinOnlyRecord(
        record,
        policy,
        resolution.rejectionReason || "no_exact_intersection_or_candidate_highway_start",
        0,
        resolution.rejectionDiagnostics,
      );
    }
    const successes = resultsByPadId.get(record.padId).filter((result) => result.ok);
    if (!successes.length) return pinOnlyRecord(record, policy, "all_osrm_candidates_failed", resolution.candidates.length);
    const scored = successes.map((result) => candidateScore(result, policy));
    scored.sort(compareScores);
    return routedRecord(record, policy, scored[0], resolution.candidates.length);
  });

  const summary = {
    ...sourceSummary,
    outputPadCount: outputRecords.length,
    routedDisplayCount: outputRecords.filter((record) => record.status === "ROUTED_DISPLAY").length,
    routedFailClosedCount: outputRecords.filter((record) => record.status === "ROUTED_FAIL_CLOSED").length,
    pinOnlyCount: outputRecords.filter((record) => record.status === "PIN_ONLY").length,
    exactIntersectionStartCount: outputRecords.filter((record) => record.start?.authority === "exact_highway_next_road_intersection").length,
    candidateNearestHighwayStartCount: outputRecords.filter((record) => record.start?.authority === "candidate_nearest_highway_point").length,
    osrmCandidateRequestCount: specifications.length,
    solidSectionCount: outputRecords.flatMap((record) => record.sections).filter((section) => section.lineStyle === "solid").length,
    dashedSectionCount: outputRecords.flatMap((record) => record.sections).filter((section) => section.lineStyle === "dashed").length,
    nontrivialGpsTetherCount: outputRecords.filter((record) => record.gpsTether?.nontrivial).length,
    totalToGpsWithheldCount: outputRecords.filter((record) => record.gpsTether?.nontrivial && record.mileage.totalToGpsMiles === null).length,
    productionWrites: 0,
    googleUrlChanges: 0,
    redGeometryCount: 0,
  };
  if (summary.outputPadCount !== EXPECTED_EOG_PAD_COUNT
    || new Set(outputRecords.map((record) => record.padId)).size !== EXPECTED_EOG_PAD_COUNT
    || summary.routedDisplayCount + summary.routedFailClosedCount + summary.pinOnlyCount !== EXPECTED_EOG_PAD_COUNT
    || summary.totalToGpsWithheldCount !== summary.nontrivialGpsTetherCount
    || specifications.some((specification) => (
      specification.candidate.startToDestinationAirMiles > maximumStartToDestinationAirMiles
      || specification.candidate.anchoredRoadId !== specification.record.routePrep?.highway?.roadId
    ))) fail("generated 301-pad accounting is inconsistent");

  const artifact = {
    schemaVersion: 1,
    batchId: "eog-ohio-last-highway-to-pad-approaches-issue200",
    scope: fixture.scope,
    authority: "Field display only. Exact source identities may produce solid teal; the first mismatch and everything after it remain generic dashed/unapproved.",
    rules: {
      explicitBuildTimeOsrmOnly: true,
      exactIntersectionStartsPreferred: true,
      nearestHighwayStartIsCandidateOnly: true,
      maximumExactIntersectionSnapMeters,
      maximumCandidateHighwaySnapMeters,
      maxStartToDestinationAirMiles: maximumStartToDestinationAirMiles,
      exactNormalizedAliasesOnly: true,
      noFuzzyNearestOrNameOnlyRoadIdentityMatching: true,
      solidStopsPermanentlyAtFirstMismatch: true,
      unmatchedPrivateAndUnnamedRoadsAreGenericDashed: true,
      gpsTetherIsSeparateStraightUnapprovedGeometry: true,
      gpsTetherExcludedFromRoadMileage: true,
      noProductionWrites: true,
      noGoogleUrlChanges: true,
      noRedGeometry: true,
    },
    source: {
      fixture: "v18/scripts/fixtures/eog-pad-approach-source-issue200.json",
      directorySnapshotId: fixture.directorySnapshotId,
      sourceRevision: fixture.sourceRevision,
      directoryContentSha256: fixture.directoryContentSha256,
      fixtureSha256: digestText(fixtureText),
      preservedAscentBatch1Sha256: digestText(ascentBatch1Text),
      preservedAscentBatch2Sha256: digestText(ascentBatch2Text),
      osrmProfile: "driving",
    },
    summary,
    records: outputRecords,
  };
  await writeFile(outputPath, `${JSON.stringify(artifact)}\n`, "utf8");
  const output = await stat(outputPath);
  return {
    artifact,
    report: { outputPath, artifactBytes: output.size, artifactSha256: digest(artifact), ...summary },
  };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const { report } = await generateEogApproaches(parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
}

export { generateEogApproaches };
