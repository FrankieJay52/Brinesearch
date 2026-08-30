import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS,
  ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION,
  applyAscentPadGraphEvidence,
  computeGraphEvidenceReceiptKeySha256,
  computeGraphEvidenceReceiptSha256,
} from "./lib/ascent-pad-graph-evidence.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const v18Directory = resolve(scriptDirectory, "..");
const defaultFixturePath = resolve(
  scriptDirectory,
  "fixtures/ascent-pad-approach-source-20260829.json",
);
const defaultOutputPath = resolve(
  v18Directory,
  "src/features/map/ascentPadApproaches.batch2.json",
);
const defaultGraphEvidenceFixturePath = resolve(
  scriptDirectory,
  "fixtures/ascent-pad-graph-runs-20260829.json",
);
const batch1Path = resolve(
  v18Directory,
  "src/features/map/ascentPadRoadDisplays.batch1.json",
);
const defaultOsrmBaseUrl = "https://router.project-osrm.org/route/v1/driving";
const expectedSnapshotId = "ascent-batch0-remaining-approach-source-20260829";
const batch2Scope = "last-exact-highway-identity-bounded-start-to-frozen-pad-gps";
const metersPerMile = 1609.344;
const geometrySimplificationToleranceMeters = 2;
const nontrivialGpsTetherMeters = 1;
const maximumExactIntersectionSnapMeters = 25;
const maximumCandidateHighwaySnapMeters = 100;
const maximumStartToDestinationAirMiles = 25;
const expectedGraphEvidenceReceiptCount = 95;
// Immutable receipt provenance. These bind the read-only 95-route extraction
// baseline, not the mutable schema-3 output, so a second generation pass can
// deterministically validate and rewrite the same artifact.
const frozenGraphEvidenceRouteArtifactSha256 = "c01f249d697497563bdf04b81836632000846f808f9cf0847c07ad2db220851b";
const frozenGraphEvidenceSourceFixtureSha256 = "50ab5a9cffb4d896b505bddcf56b1eb467509346f314e149750038debd951e2f";
const frozenGraphEvidencePadIdSetSha256 = "4e86d4f043a796fcd13a31855c1595fa4db4d1f1071cdbbf32368685dab6be48";
const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const evidenceDigestPattern = /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/u;

function fail(message) {
  throw new Error(`Ascent batch-2 approach generation failed: ${message}`);
}

function digestText(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalTextDigest(value) {
  return digestText(value.replace(/\r\n/gu, "\n"));
}

function digest(value) {
  return digestText(JSON.stringify(value));
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function coordinate(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90;
}

function sameCoordinate(left, right) {
  return coordinate(left)
    && coordinate(right)
    && left[0] === right[0]
    && left[1] === right[1];
}

function roundedCoordinate(point) {
  return point.map((value) => Number(value.toFixed(6)));
}

function haversineMeters(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const leftLatitude = radians(left[1]);
  const rightLatitude = radians(right[1]);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function milesFromMeters(meters) {
  return Number((meters / metersPerMile).toFixed(6));
}

function normalizedRoadIdentity(value) {
  const suffixes = new Map([
    ["ROAD", "RD"],
    ["RD", "RD"],
    ["LANE", "LN"],
    ["LN", "LN"],
    ["DRIVE", "DR"],
    ["DR", "DR"],
    ["STREET", "ST"],
    ["ST", "ST"],
    ["HIGHWAY", "HWY"],
    ["HWY", "HWY"],
  ]);
  return String(value || "")
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ")
    .split(" ")
    .map((token) => suffixes.get(token) || token)
    .join(" ");
}

function identityParts(value) {
  return String(value || "")
    .split(";")
    .map(normalizedRoadIdentity)
    .filter(Boolean);
}

function acceptedIdentitiesForSourceStep(step) {
  return [...new Set([
    step.rawText,
    step.normalizedText,
    step.canonicalName,
    ...(Array.isArray(step.aliases) ? step.aliases : []),
  ].map(normalizedRoadIdentity).filter(Boolean))].sort();
}

function stepMatchesIdentityGroup(step, group) {
  const actual = new Set([
    ...identityParts(step.name),
    ...identityParts(step.ref),
  ]);
  return group.acceptedIdentities.some((identity) => actual.has(identity));
}

function exactPrefixPolicy(record) {
  const prep = record.routePrep;
  if (!prep || prep.highway?.matchStatus !== "exact_master") return null;
  const highwayOrder = Number(prep.highway_order);
  if (!Number.isInteger(highwayOrder) || highwayOrder < 1) return null;
  const ordered = [...(prep.steps || [])]
    .filter((step) => Number.isInteger(Number(step.stepOrder)))
    .sort((left, right) => Number(left.stepOrder) - Number(right.stepOrder));
  const highway = ordered.find((step) => Number(step.stepOrder) === highwayOrder);
  if (!highway
    || highway.matchStatus !== "exact_master"
    || !["interstate", "us_route", "state_route"].includes(highway.stepKind)) {
    return null;
  }

  const groups = [];
  let blocker = null;
  for (const step of ordered.filter((candidate) => Number(candidate.stepOrder) >= highwayOrder)) {
    if (step.matchStatus === "route_note" || step.stepKind === "exit_note") continue;
    if (step.matchStatus !== "exact_master") {
      blocker = {
        stepOrder: Number(step.stepOrder),
        reason: step.matchStatus === "private_segment"
          ? "private_or_unnamed_source_step"
          : "source_step_lacks_exact_master_identity",
        sourceStatus: step.matchStatus || "unknown",
      };
      break;
    }
    const acceptedIdentities = acceptedIdentitiesForSourceStep(step);
    if (!acceptedIdentities.length || !step.canonicalName || !step.roadId) {
      blocker = {
        stepOrder: Number(step.stepOrder),
        reason: "exact_master_step_has_incomplete_identity",
        sourceStatus: step.matchStatus || "unknown",
      };
      break;
    }
    groups.push({
      stepOrder: Number(step.stepOrder),
      roadId: step.roadId,
      displayRoad: step.canonicalName,
      roadType: step.roadType || step.stepKind || null,
      acceptedIdentities,
    });
  }
  if (!groups.length) return null;
  return { highwayOrder, groups, blocker };
}

function pointCoordinates(geometry) {
  if (geometry?.type === "Point" && coordinate(geometry.coordinates)) {
    return [[...geometry.coordinates]];
  }
  if (geometry?.type === "MultiPoint" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.filter(coordinate).map((point) => [...point]);
  }
  return [];
}

function compareCoordinates(left, right) {
  return left[0] - right[0] || left[1] - right[1];
}

function uniqueSortedCoordinates(points) {
  const seen = new Set();
  const output = [];
  for (const point of points.filter(coordinate).sort(compareCoordinates)) {
    const key = `${point[0]},${point[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      output.push(point);
    }
  }
  return output;
}

function exactMasterHighwayAnchor(record, policy) {
  const prep = record.routePrep;
  const highway = prep?.highway;
  const highwayStep = (prep?.steps || []).find((step) => (
    Number(step.stepOrder) === policy?.highwayOrder
  ));
  if (!policy
    || !highway?.roadId
    || highway.matchStatus !== "exact_master"
    || highway.hasGeometry !== true
    || highway.geometryStatus !== "official_centerline_loaded"
    || Number(highway.stepOrder) !== policy.highwayOrder
    || highway.roadId !== policy.groups[0]?.roadId
    || highwayStep?.matchStatus !== "exact_master"
    || highwayStep?.roadId !== highway.roadId) {
    return null;
  }
  return {
    roadId: highway.roadId,
    sourceStepOrder: policy.highwayOrder,
  };
}

function resolveRouteCandidates(record, policy) {
  if (!policy) return { candidates: [], rejectionReason: null, rejectionDiagnostics: {} };
  const anchor = exactMasterHighwayAnchor(record, policy);
  if (!anchor) {
    return {
      candidates: [],
      rejectionReason: "candidate_start_lacks_exact_master_last_highway_road_id_anchor",
      rejectionDiagnostics: {
        rejectedCandidateCount: 0,
        maximumStartToDestinationAirMiles,
      },
    };
  }

  const intersections = uniqueSortedCoordinates(pointCoordinates(
    record.routePrep?.point_intersections,
  ));
  const nextStep = record.routePrep?.next_step;
  const exactIntersectionEvidence = intersections.length
    && nextStep?.matchStatus === "exact_master"
    && Boolean(nextStep.roadId)
    && nextStep.hasGeometry === true
    && nextStep.geometryStatus === "official_centerline_loaded"
    && Number(nextStep.stepOrder) === policy.highwayOrder + 1;
  let rawCandidates;
  if (exactIntersectionEvidence) {
    rawCandidates = intersections.map((requestedCoordinate, index) => ({
      id: `exact-intersection-${index + 1}`,
      authority: "exact_highway_next_road_intersection",
      candidateOnly: false,
      anchorSource: "exact_master_highway_next_road_intersection",
      anchoredRoadId: anchor.roadId,
      requestedCoordinate,
    }));
  } else {
    const nearest = pointCoordinates(record.routePrep?.nearest_highway_point)[0];
    rawCandidates = nearest ? [{
      id: "candidate-nearest-highway-point",
      authority: "candidate_nearest_highway_point",
      candidateOnly: true,
      anchorSource: "exact_master_highway_centerline_nearest_point",
      anchoredRoadId: anchor.roadId,
      requestedCoordinate: nearest,
    }] : [];
  }
  if (!rawCandidates.length) {
    return { candidates: [], rejectionReason: null, rejectionDiagnostics: {} };
  }

  const measured = rawCandidates.map((candidate) => {
    const rawAirMiles = haversineMeters(candidate.requestedCoordinate, record.destination)
      / metersPerMile;
    return {
      ...candidate,
      startToDestinationAirMiles: Number(rawAirMiles.toFixed(6)),
      withinDestinationBound: rawAirMiles <= maximumStartToDestinationAirMiles,
    };
  });
  const candidates = measured
    .filter((candidate) => candidate.withinDestinationBound)
    .map(({ withinDestinationBound: _withinDestinationBound, ...candidate }) => candidate);
  const rejected = measured.filter((candidate) => !candidate.withinDestinationBound);
  return {
    candidates,
    rejectionReason: candidates.length || !rejected.length
      ? null
      : "candidate_start_exceeds_25_air_miles_from_destination",
    rejectionDiagnostics: rejected.length ? {
      rejectedCandidateCount: rejected.length,
      anchoredRoadId: anchor.roadId,
      maximumStartToDestinationAirMiles,
      rejectedCandidateEvidenceSha256: digest(rejected.map((candidate) => ({
        authority: candidate.authority,
        anchoredRoadId: candidate.anchoredRoadId,
        requestedCoordinate: candidate.requestedCoordinate,
        startToDestinationAirMiles: candidate.startToDestinationAirMiles,
      }))),
    } : {},
  };
}

function routeCandidates(record, policy) {
  return resolveRouteCandidates(record, policy).candidates;
}

function perpendicularDistanceMeters(point, start, end) {
  const meanLatitude = ((start[1] + end[1] + point[1]) / 3) * Math.PI / 180;
  const project = ([longitude, latitude]) => [
    longitude * 111320 * Math.cos(meanLatitude),
    latitude * 110574,
  ];
  const [px, py] = project(point);
  const [sx, sy] = project(start);
  const [ex, ey] = project(end);
  const dx = ex - sx;
  const dy = ey - sy;
  if (dx === 0 && dy === 0) return Math.hypot(px - sx, py - sy);
  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (sx + t * dx), py - (sy + t * dy));
}

function simplifyCoordinates(coordinates, toleranceMeters = geometrySimplificationToleranceMeters) {
  if (coordinates.length <= 2) return coordinates.map(roundedCoordinate);
  const keep = new Uint8Array(coordinates.length);
  keep[0] = 1;
  keep[coordinates.length - 1] = 1;
  const stack = [[0, coordinates.length - 1]];
  while (stack.length) {
    const [startIndex, endIndex] = stack.pop();
    let farthestIndex = -1;
    let farthestDistance = toleranceMeters;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = perpendicularDistanceMeters(
        coordinates[index],
        coordinates[startIndex],
        coordinates[endIndex],
      );
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestIndex >= 0) {
      keep[farthestIndex] = 1;
      stack.push([startIndex, farthestIndex], [farthestIndex, endIndex]);
    }
  }
  const simplified = [];
  for (let index = 0; index < coordinates.length; index += 1) {
    if (!keep[index]) continue;
    const point = roundedCoordinate(coordinates[index]);
    if (!sameCoordinate(simplified.at(-1), point)) simplified.push(point);
  }
  if (simplified.length === 1 && coordinates.length > 1) {
    simplified.push(roundedCoordinate(coordinates.at(-1)));
  }
  return simplified;
}

function appendCoordinates(output, coordinates) {
  for (const point of coordinates) {
    if (!sameCoordinate(output.at(-1), point)) output.push(point);
  }
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
        || !Number.isFinite(step.distance)) {
        return null;
      }
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
        headers: { "User-Agent": "BrineSearch-local-batch2-artifact-generator/1.0" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return { ok: true, payload: await response.json() };
      lastReason = `http_${response.status}`;
      if (response.status !== 429 && response.status < 500) break;
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      await delay(Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : 500 * (2 ** (attempt - 1)));
    } catch (error) {
      lastReason = error instanceof Error ? error.name : "network_error";
      if (attempt < attempts) await delay(500 * (2 ** (attempt - 1)));
    }
  }
  return { ok: false, reason: `${label}:${lastReason}` };
}

async function fetchOsrmCandidate(specification, osrmBaseUrl) {
  const { record, candidate } = specification;
  const destination = record.destination;
  if (!coordinate(candidate.requestedCoordinate) || !coordinate(destination)) {
    return { ok: false, reason: "invalid_candidate_or_destination" };
  }
  const startToDestinationAirMiles = haversineMeters(candidate.requestedCoordinate, destination)
    / metersPerMile;
  if (candidate.anchoredRoadId !== record.routePrep?.highway?.roadId
    || record.routePrep?.highway?.matchStatus !== "exact_master"
    || record.routePrep?.highway?.hasGeometry !== true
    || record.routePrep?.highway?.geometryStatus !== "official_centerline_loaded") {
    return { ok: false, reason: "candidate_start_lacks_exact_master_last_highway_road_id_anchor" };
  }
  if (startToDestinationAirMiles > maximumStartToDestinationAirMiles) {
    return { ok: false, reason: "candidate_start_exceeds_25_air_miles_from_destination" };
  }
  const coordinateText = [candidate.requestedCoordinate, destination]
    .map((point) => `${point[0]},${point[1]}`)
    .join(";");
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
  if (payload?.code !== "Ok"
    || !orderedSteps
    || route?.legs?.length !== 1
    || !coordinate(snappedStart)
    || !coordinate(snappedEndpoint)
    || !Array.isArray(waypointDistances)
    || waypointDistances.length !== 2
    || waypointDistances.some((distance) => !Number.isFinite(distance))
    || !Number.isFinite(route.distance)
    || !Number.isFinite(route.duration)) {
    return { ok: false, reason: `osrm_${payload?.code || "incomplete_response"}` };
  }
  const maximumStartSnapMeters = candidate.candidateOnly
    ? maximumCandidateHighwaySnapMeters
    : maximumExactIntersectionSnapMeters;
  if (waypointDistances[0] > maximumStartSnapMeters) {
    return {
      ok: false,
      reason: candidate.candidateOnly
        ? "candidate_highway_start_snap_exceeds_100_meters"
        : "exact_intersection_start_snap_exceeds_25_meters",
    };
  }
  const firstStepPoint = orderedSteps[0]?.coordinates?.[0];
  const lastStepPoint = orderedSteps.at(-1)?.coordinates?.at(-1);
  if (!coordinate(firstStepPoint)
    || !coordinate(lastStepPoint)
    || haversineMeters(firstStepPoint, snappedStart) > 2
    || haversineMeters(lastStepPoint, snappedEndpoint) > 2) {
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

async function routeOsrmBatch(specifications, osrmBaseUrl, concurrency = 4) {
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
    { length: Math.min(concurrency, specifications.length) },
    () => worker(),
  ));
  return output;
}

function matchRouteSteps(orderedSteps, policy) {
  let currentGroupIndex = -1;
  let stopped = false;
  let solidDistanceMeters = 0;
  let unapprovedDistanceMeters = 0;
  let matchedStepCount = 0;
  const matchedGroupIndexes = new Set();
  const classified = [];
  for (const step of orderedSteps) {
    const hasIdentity = Boolean(step.ref || step.name);
    const nontrivial = step.distanceMeters > 0.05;
    let matchState;
    let group = null;
    // OSRM arrive/depart markers can repeat a road identity at zero distance.
    // They carry no measured road section and must never create a turn.
    if (!nontrivial) {
      matchState = "structural_zero_distance";
    } else if (stopped) {
      matchState = "unapproved_after_first_mismatch";
    } else if (!hasIdentity) {
      stopped = true;
      matchState = "unapproved_unnamed";
    } else {
      let matchedGroupIndex = -1;
      const firstCandidate = currentGroupIndex < 0 ? 0 : currentGroupIndex;
      const lastCandidate = Math.min(
        policy.groups.length - 1,
        currentGroupIndex < 0 ? 1 : currentGroupIndex + 1,
      );
      for (let index = firstCandidate; index <= lastCandidate; index += 1) {
        if (stepMatchesIdentityGroup(step, policy.groups[index])) {
          matchedGroupIndex = index;
          break;
        }
      }
      if (matchedGroupIndex < 0) {
        stopped = true;
        matchState = "unapproved_identity_mismatch";
      } else {
        currentGroupIndex = matchedGroupIndex;
        group = policy.groups[matchedGroupIndex];
        matchState = "matched_exact_master";
        solidDistanceMeters += step.distanceMeters;
        matchedStepCount += 1;
        matchedGroupIndexes.add(matchedGroupIndex);
      }
    }
    if (matchState.startsWith("unapproved")) unapprovedDistanceMeters += step.distanceMeters;
    classified.push({ ...step, matchState, group });
  }
  return {
    classified,
    solidDistanceMeters,
    unapprovedDistanceMeters,
    matchedStepCount,
    matchedGroupCount: matchedGroupIndexes.size,
    stoppedAtFirstMismatch: stopped,
  };
}

function routerReportedUnverifiedLabel(step) {
  const identities = [step?.name, step?.ref]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .filter((value, index, values) => values.indexOf(value) === index);
  return identities.length
    ? `${identities.join(" / ")} · router-reported / graph-unverified`
    : null;
}

function unapprovedPresentation(matchState, routerReportedLabel = null) {
  if (routerReportedLabel) {
    return {
      displayName: routerReportedLabel,
      instruction: `Continue on ${routerReportedLabel}`,
    };
  }
  return matchState === "unapproved_unnamed"
    ? {
      displayName: "Unnamed / unapproved access",
      instruction: "Continue on unnamed/unapproved access",
    }
    : {
      displayName: "Unverified / unapproved access",
      instruction: "Continue on unverified/unapproved access",
    };
}

function driverInstruction(step, matchedExact) {
  if (step.matchState === "structural_zero_distance") return "No measured road movement";
  if (!matchedExact) {
    return unapprovedPresentation(
      step.matchState,
      routerReportedUnverifiedLabel(step),
    ).instruction;
  }
  const road = step.group.displayRoad;
  const modifier = step.maneuver.modifier;
  if (step.maneuver.type === "depart") return `Start on ${road}`;
  if (modifier === "left") return `Turn left onto ${road}`;
  if (modifier === "right") return `Turn right onto ${road}`;
  if (modifier === "slight left") return `Bear left onto ${road}`;
  if (modifier === "slight right") return `Bear right onto ${road}`;
  if (modifier === "sharp left") return `Make a sharp left onto ${road}`;
  if (modifier === "sharp right") return `Make a sharp right onto ${road}`;
  if (modifier === "uturn") return `Make a U-turn onto ${road}`;
  return `Continue on ${road}`;
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

function compareCandidateScores(left, right) {
  for (let index = 0; index < left.score.length - 1; index += 1) {
    if (left.score[index] !== right.score[index]) return right.score[index] - left.score[index];
  }
  return String(left.score.at(-1)).localeCompare(String(right.score.at(-1)));
}

function compactRouteGeometry(matched) {
  const roadCoordinates = [];
  const sections = [];
  for (const [index, step] of matched.classified.entries()) {
    const simplified = simplifyCoordinates(step.coordinates);
    if (roadCoordinates.length
      && simplified.length
      && haversineMeters(roadCoordinates.at(-1), simplified[0]) > 2) {
      fail(`routed section ${index + 1} is not continuous with its predecessor`);
    }
    const startIndex = roadCoordinates.length
      ? roadCoordinates.length - (sameCoordinate(roadCoordinates.at(-1), simplified[0]) ? 1 : 0)
      : 0;
    appendCoordinates(roadCoordinates, simplified);
    const endIndex = Math.max(startIndex, roadCoordinates.length - 1);
    const matchedExact = step.matchState === "matched_exact_master";
    const structural = step.matchState === "structural_zero_distance";
    const routerReportedLabel = !matchedExact && !structural
      ? routerReportedUnverifiedLabel(step)
      : null;
    sections.push({
      sectionOrder: index + 1,
      coordinateStartIndex: startIndex,
      coordinateEndIndex: endIndex,
      distanceMeters: step.distanceMeters,
      distanceMiles: milesFromMeters(step.distanceMeters),
      durationSeconds: step.durationSeconds,
      maneuver: step.maneuver,
      matchState: step.matchState,
      lineStyle: structural ? "none" : "solid",
      colorRole: structural ? "none" : matchedExact ? "teal" : "unapproved",
      authority: structural
        ? "osrm_structural_step"
        : matchedExact
          ? "exact_master_identity_match"
          : "unapproved_routed_remainder",
      sourceStepOrder: matchedExact ? step.group.stepOrder : null,
      sourceRoadId: matchedExact ? step.group.roadId : null,
      sourceDisplayRoad: matchedExact ? step.group.displayRoad : null,
      routerReportedUnverifiedLabel: routerReportedLabel,
      instruction: driverInstruction(step, matchedExact),
      matchedIdentitySha256: matchedExact
        ? digest({ ref: step.ref || null, name: step.name || null })
        : null,
    });
  }
  return { roadCoordinates, sections };
}

function sourceDirections(record, policy) {
  if (!record.routePrep || !Number.isInteger(Number(record.routePrep.highway_order))) return [];
  const highwayOrder = Number(record.routePrep.highway_order);
  const groupByOrder = new Map((policy?.groups || []).map((group) => [group.stepOrder, group]));
  return [...(record.routePrep.steps || [])]
    .filter((step) => Number(step.stepOrder) >= highwayOrder)
    .sort((left, right) => Number(left.stepOrder) - Number(right.stepOrder))
    .map((step, index) => {
      const group = groupByOrder.get(Number(step.stepOrder));
      return {
        directionOrder: index + 1,
        sourceStepOrder: Number(step.stepOrder),
        sourceDisplayRoad: group?.displayRoad || null,
        instructionRole: group ? "named_public_road" : "generic_unapproved_access",
        instruction: group
          ? `Continue on ${group.displayRoad}`
          : "Continue on unnamed/unapproved access",
        sourceDistanceMiles: Number.isFinite(step.distanceMiles) ? step.distanceMiles : null,
        sourceTurnDirection: group && step.turnDirection ? step.turnDirection : null,
      };
    });
}

function baseRecord(record, policy) {
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
    destination: {
      coordinates: record.destination,
      gpsSource: record.destinationGpsSource,
      directoryCoordinateRole: record.directoryCoordinateRole,
    },
    lastHighway: policy ? {
      sourceStepOrder: policy.highwayOrder,
      roadId: policy.groups[0].roadId,
      displayRoad: policy.groups[0].displayRoad,
      roadType: policy.groups[0].roadType,
    } : null,
    sourceDirections: sourceDirections(record, policy),
  };
}

function pinOnlyRecord(
  record,
  policy,
  reason,
  attemptedCandidateCount = 0,
  rejectionDiagnostics = {},
) {
  return {
    ...baseRecord(record, policy),
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
    diagnostics: {
      attemptedCandidateCount,
      matchedExactSectionCount: 0,
      ...rejectionDiagnostics,
      productionWrites: 0,
    },
  };
}

function routedRecord(record, policy, selected, candidateCount) {
  const { result, matched } = selected;
  const { roadCoordinates, sections } = compactRouteGeometry(matched);
  const sectionRoadMeters = sections.reduce((sum, section) => sum + section.distanceMeters, 0);
  if (Math.abs(sectionRoadMeters - result.routeDistanceMeters) > 2) {
    fail(`${record.padName} OSRM step distances do not reconcile to the route distance`);
  }
  const destination = record.destination;
  const networkDisplayEndpoint = roadCoordinates.at(-1);
  if (!coordinate(networkDisplayEndpoint)) {
    fail(`${record.padName} compact route has no terminal network coordinate`);
  }
  const tetherDistanceMeters = haversineMeters(networkDisplayEndpoint, destination);
  const nontrivialTether = tetherDistanceMeters > nontrivialGpsTetherMeters;
  const totalToGpsMeters = nontrivialTether ? null : sectionRoadMeters;
  return {
    ...baseRecord(record, policy),
    status: "ROUTED_DISPLAY",
    reason: matched.matchedStepCount === 0
      ? "router_reported_graph_unverified_route"
      : matched.stoppedAtFirstMismatch
      ? "exact_named_prefix_then_unapproved_remainder"
      : "exact_named_route_reaches_network_snap",
    start: {
      authority: result.candidate.authority,
      candidateOnly: result.candidate.candidateOnly,
      anchorSource: result.candidate.anchorSource,
      anchoredRoadId: result.candidate.anchoredRoadId,
      startToDestinationAirMiles: result.candidate.startToDestinationAirMiles,
      requestedCoordinate: result.candidate.requestedCoordinate,
      snappedCoordinate: roundedCoordinate(result.snappedStart),
      snapDistanceMeters: result.startSnapMeters,
    },
    roadCoordinates,
    sections,
    gpsTether: {
      type: "LineString",
      lineStyle: "solid",
      colorRole: "gps",
      authority: "unapproved_straight_network_snap_to_saved_gps",
      navigationGeometry: false,
      distanceMeters: tetherDistanceMeters,
      distanceMiles: milesFromMeters(tetherDistanceMeters),
      nontrivial: nontrivialTether,
      coordinates: [networkDisplayEndpoint, roundedCoordinate(destination)],
    },
    mileage: {
      roadDistanceMeters: sectionRoadMeters,
      roadDistanceMiles: milesFromMeters(sectionRoadMeters),
      totalToGpsMeters,
      totalToGpsMiles: totalToGpsMeters === null ? null : milesFromMeters(totalToGpsMeters),
      gpsTetherExcluded: true,
    },
    diagnostics: {
      attemptedCandidateCount: candidateCount,
      selectedCandidateId: result.candidate.id,
      osrmRouteDistanceMeters: result.routeDistanceMeters,
      osrmRouteDurationSeconds: result.routeDurationSeconds,
      destinationSnapMeters: result.destinationSnapMeters,
      matchedExactSectionCount: matched.matchedStepCount,
      matchedExactGroupCount: matched.matchedGroupCount,
      exactGroupCount: policy.groups.length,
      solidDistanceMeters: matched.solidDistanceMeters,
      unapprovedDistanceMeters: matched.unapprovedDistanceMeters,
      solidStopsPermanentlyAtFirstMismatch: true,
      sourceBlocker: policy.blocker,
      routedIdentitySha256: digest(result.orderedSteps.map((step) => ({
        ref: step.ref,
        name: step.name,
      }))),
      unsimplifiedStepGeometrySha256: digest(result.orderedSteps.map((step) => step.coordinates)),
      simplifiedGeometrySha256: digest(roadCoordinates),
      candidateRouteEvidenceRetained: true,
      routerReportedGraphUnverified: matched.matchedStepCount === 0,
      productionWrites: 0,
    },
  };
}

function orderedSourceRoadsForPolicy(policy) {
  return (policy?.groups || []).map((group) => ({
    sourceStepOrder: group.stepOrder,
    roadId: group.roadId,
  }));
}

function hasExactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
}

function receiptSummary(fixture) {
  const runs = fixture.records.flatMap((receipt) => (
    Array.isArray(receipt?.runs) ? receipt.runs : []
  ));
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

function validateGraphEvidenceFixture(
  fixture,
  expectedReceiptCount = expectedGraphEvidenceReceiptCount,
) {
  const topLevelKeys = [
    "fixtureId",
    "junctions",
    "measureBasis",
    "policy",
    "records",
    "schemaVersion",
    "source",
    "summary",
  ];
  if (!fixture
    || typeof fixture !== "object"
    || Array.isArray(fixture)
    || !hasExactKeys(fixture, topLevelKeys)
    || fixture.schemaVersion !== ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION
    || fixture.measureBasis !== ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS
    || typeof fixture.fixtureId !== "string"
    || !fixture.fixtureId.trim()
    || !fixture.source
    || typeof fixture.source !== "object"
    || Array.isArray(fixture.source)
    || !fixture.policy
    || typeof fixture.policy !== "object"
    || Array.isArray(fixture.policy)
    || !fixture.junctions
    || typeof fixture.junctions !== "object"
    || Array.isArray(fixture.junctions)
    || !Array.isArray(fixture.records)
    || !fixture.records.length
    || fixture.records.length !== expectedReceiptCount
    || !fixture.summary
    || typeof fixture.summary !== "object"
    || Array.isArray(fixture.summary)) {
    fail("graph-evidence fixture schema drifted from the sealed v1 contract");
  }

  const sourceKeys = [
    "extractionDate",
    "extractionMethod",
    "frozenSourceFixturePath",
    "frozenSourceFixtureSha256",
    "odotDatasetId",
    "routeArtifactPath",
    "routeArtifactSha256",
  ];
  const policyKeys = [
    "ambiguityRadiusMeters",
    "candidateRadiusMeters",
    "exactMaximumDistanceMeters",
    "exactMinimumRunnerUpSeparationMeters",
    "productionWrites",
    "sampleIntervalMeters",
    "unresolvedNoMatchReason",
  ];
  if (!hasExactKeys(fixture.source, sourceKeys)
    || fixture.source.routeArtifactPath
      !== "v18/src/features/map/ascentPadApproaches.batch2.json"
    || !sha256Pattern.test(fixture.source.routeArtifactSha256)
    || fixture.source.frozenSourceFixturePath
      !== "v18/scripts/fixtures/ascent-pad-approach-source-20260829.json"
    || !sha256Pattern.test(fixture.source.frozenSourceFixtureSha256)
    || !canonicalUuidPattern.test(fixture.source.odotDatasetId)
    || fixture.source.extractionDate !== "2026-08-29"
    || fixture.source.extractionMethod !== "read_only_spatial_indexed_sql"
    || !hasExactKeys(fixture.policy, policyKeys)
    || fixture.policy.sampleIntervalMeters !== 5
    || fixture.policy.candidateRadiusMeters !== 30
    || fixture.policy.ambiguityRadiusMeters !== 20
    || fixture.policy.exactMaximumDistanceMeters !== 10
    || fixture.policy.exactMinimumRunnerUpSeparationMeters !== 5
    || fixture.policy.unresolvedNoMatchReason !== "no_authoritative_graph_match"
    || fixture.policy.productionWrites !== 0) {
    fail("graph-evidence fixture source or extraction policy drifted");
  }

  const junctionKeys = new Set();
  for (const [junctionDigest, junction] of Object.entries(fixture.junctions)) {
    if (!evidenceDigestPattern.test(junctionDigest)
      || !hasExactKeys(junction, ["buildDigest", "buildId", "junctionId"])
      || !canonicalUuidPattern.test(junction.junctionId)
      || !canonicalUuidPattern.test(junction.buildId)
      || !evidenceDigestPattern.test(junction.buildDigest)) {
      fail(`graph-evidence fixture junction ${junctionDigest} drifted from its strict schema`);
    }
    junctionKeys.add(junctionDigest);
  }

  const summary = receiptSummary(fixture);
  if (Object.keys(fixture.summary).sort().join("\n")
      !== Object.keys(summary).sort().join("\n")
    || Object.entries(summary).some(([key, value]) => fixture.summary[key] !== value)) {
    fail("graph-evidence fixture summary does not reconcile to its receipts");
  }

  const receiptByPadId = new Map();
  const receiptKeys = new Set();
  const referencedJunctionKeys = new Set();
  for (const receipt of fixture.records) {
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
      fail("graph-evidence fixture contains a non-object receipt");
    }
    let computedKey;
    let computedReceipt;
    try {
      computedKey = computeGraphEvidenceReceiptKeySha256(receipt);
      computedReceipt = computeGraphEvidenceReceiptSha256(receipt);
    } catch (error) {
      fail(`graph-evidence receipt key is invalid: ${error instanceof Error ? error.message : error}`);
    }
    if (receipt.schemaVersion !== ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION
      || receipt.measureBasis !== ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS
      || receipt.receiptKeySha256 !== computedKey
      || receipt.receiptSha256 !== computedReceipt) {
      fail(`${receipt.padId || "unknown pad"} graph-evidence receipt digest or schema drifted`);
    }
    if (receiptByPadId.has(receipt.padId) || receiptKeys.has(receipt.receiptKeySha256)) {
      fail(`${receipt.padId} graph-evidence receipt is duplicated`);
    }
    receiptByPadId.set(receipt.padId, receipt);
    receiptKeys.add(receipt.receiptKeySha256);
    for (const run of Array.isArray(receipt.runs) ? receipt.runs : []) {
      if (typeof run?.junctionDigest === "string") {
        referencedJunctionKeys.add(run.junctionDigest);
      }
    }
  }
  if ([...junctionKeys].sort().join("\n") !== [...referencedJunctionKeys].sort().join("\n")) {
    fail("graph-evidence fixture junction index has a missing or stale receipt binding");
  }
  return receiptByPadId;
}

async function loadOptionalGraphEvidenceFixture(path, required = false) {
  if (!path) return null;
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (!required && error && typeof error === "object" && error.code === "ENOENT") return null;
    fail(`could not read graph-evidence fixture ${path}`);
  }
  let fixture;
  try {
    fixture = JSON.parse(text);
  } catch {
    fail("graph-evidence fixture is not valid JSON");
  }
  return {
    fixture,
    fixtureText: text,
    receiptByPadId: validateGraphEvidenceFixture(fixture),
  };
}

function validateGraphEvidenceFixtureScope(
  graphEvidence,
  frozenSourceFixtureText,
  expectedScope = {},
) {
  if (!graphEvidence) return;
  const fixture = graphEvidence.fixture;
  const expectedReceiptCount = expectedScope.receiptCount
    ?? expectedGraphEvidenceReceiptCount;
  const expectedRouteArtifactSha256 = expectedScope.routeArtifactSha256
    ?? frozenGraphEvidenceRouteArtifactSha256;
  const expectedSourceFixtureSha256 = expectedScope.sourceFixtureSha256
    ?? frozenGraphEvidenceSourceFixtureSha256;
  const expectedPadIdSetSha256 = expectedScope.padIdSetSha256
    ?? frozenGraphEvidencePadIdSetSha256;
  if (fixture.source.routeArtifactSha256 !== expectedRouteArtifactSha256
    || fixture.source.frozenSourceFixtureSha256 !== expectedSourceFixtureSha256
    || canonicalTextDigest(frozenSourceFixtureText) !== expectedSourceFixtureSha256) {
    fail("graph-evidence fixture source artifact digest drifted");
  }
  const receiptPadIds = [...graphEvidence.receiptByPadId.keys()].sort();
  if (receiptPadIds.length !== expectedReceiptCount
    || digest(receiptPadIds) !== expectedPadIdSetSha256) {
    fail(`graph-evidence fixture pad scope drifted from the frozen ${expectedReceiptCount} routed records`);
  }
}

function schema3SectionFields(section, roadCoordinates) {
  const coordinates = Array.isArray(section.coordinates)
    ? section.coordinates
    : roadCoordinates.slice(section.coordinateStartIndex, section.coordinateEndIndex + 1);
  return {
    ...section,
    parentSectionOrder: section.parentSectionOrder ?? section.sectionOrder,
    graphEvidenceRunOrder: section.graphEvidenceRunOrder ?? null,
    coordinates,
    sourceIdentityId: section.sourceIdentityId ?? null,
    routeSystem: section.routeSystem ?? null,
    routeNumber: section.routeNumber ?? null,
    county: section.county ?? null,
    sourceMatch: section.sourceMatch ?? null,
    matchedSourceRoadId: section.matchedSourceRoadId ?? null,
    graphEvidence: section.graphEvidence ?? null,
  };
}

function neutralizeRoutedRecordWithoutReceipt(routed, schemaVersion = 2) {
  let neutralStarted = false;
  const sections = routed.sections.map((section) => {
    if (section.matchState === "structural_zero_distance") {
      return schemaVersion >= 3
        ? schema3SectionFields(section, routed.roadCoordinates)
        : section;
    }
    const routerReportedUnverifiedLabel = section.routerReportedUnverifiedLabel
      || (section.sourceDisplayRoad
        ? `${section.sourceDisplayRoad} · source/router match / graph-unverified`
        : null);
    const neutral = {
      ...section,
      matchState: schemaVersion >= 3
        ? "unverified_graph_receipt_missing"
        : neutralStarted
          ? "unapproved_after_first_mismatch"
          : "unapproved_identity_mismatch",
      lineStyle: "solid",
      colorRole: schemaVersion >= 3 ? "unverified" : "unapproved",
      authority: schemaVersion >= 3
        ? "graph_evidence_receipt_missing"
        : "unapproved_routed_remainder",
      sourceStepOrder: null,
      sourceRoadId: null,
      sourceDisplayRoad: null,
      routerReportedUnverifiedLabel,
      instruction: routerReportedUnverifiedLabel
        ? `Continue on ${routerReportedUnverifiedLabel}`
        : "Continue on unverified route",
      matchedIdentitySha256: null,
    };
    neutralStarted = true;
    return schemaVersion >= 3
      ? schema3SectionFields(neutral, routed.roadCoordinates)
      : neutral;
  });
  const unapprovedDistanceMeters = sections
    .filter((section) => section.lineStyle !== "none")
    .reduce((sum, section) => sum + section.distanceMeters, 0);
  return {
    ...routed,
    reason: "graph_evidence_receipt_missing_route_retained",
    sections,
    diagnostics: {
      ...routed.diagnostics,
      matchedExactSectionCount: 0,
      solidDistanceMeters: 0,
      unapprovedDistanceMeters,
      routerReportedGraphUnverified: true,
      graphEvidenceReceiptApplied: false,
      graphEvidenceStatus: "missing_route_retained_solid_neutral",
    },
  };
}

function applyGraphEvidenceToRoutedRecord(routed, policy, receipt) {
  const originalRoadCoordinates = routed.roadCoordinates;
  const originalSections = routed.sections;
  let applied;
  try {
    applied = applyAscentPadGraphEvidence({
      padId: routed.padId,
      recordRevision: routed.recordRevision,
      routedIdentitySha256: routed.diagnostics.routedIdentitySha256,
      roadCoordinates: originalRoadCoordinates,
      sections: originalSections,
      orderedSourceRoads: orderedSourceRoadsForPolicy(policy),
      receipt,
    });
  } catch (error) {
    fail(`${routed.padName} graph-evidence receipt was rejected: ${error instanceof Error ? error.message : error}`);
  }
  if (applied.roadCoordinates !== originalRoadCoordinates
    || applied.baseSections !== originalSections) {
    fail(`${routed.padName} graph evidence replaced frozen route geometry or base sections`);
  }
  const sections = applied.sectionRuns.map((section) => {
    const graphExact = typeof section.sourceIdentityId === "string";
    return schema3SectionFields({
      ...section,
      routerReportedUnverifiedLabel: graphExact
        ? null
        : section.routerReportedUnverifiedLabel ?? null,
      matchedIdentitySha256: graphExact
        ? digest({
          identityId: section.sourceIdentityId,
          roadId: section.sourceRoadId,
          sourceDigest: section.graphEvidence.sourceDigest,
          geometryDigest: section.graphEvidence.geometryDigest,
        })
        : null,
    }, originalRoadCoordinates);
  });
  const roadDistanceMeters = sections.reduce((sum, section) => sum + section.distanceMeters, 0);
  if (Math.abs(roadDistanceMeters - routed.mileage.roadDistanceMeters) > 1e-6
    || digest(originalRoadCoordinates) !== routed.diagnostics.simplifiedGeometrySha256) {
    fail(`${routed.padName} graph evidence changed route geometry or measured road mileage`);
  }
  const tealSections = sections.filter((section) => section.colorRole === "teal");
  const neutralSections = sections.filter((section) => section.colorRole === "unverified");
  const graphNamedSections = sections.filter((section) => section.sourceIdentityId !== null);
  return {
    ...routed,
    reason: neutralSections.length
      ? "graph_receipt_ordered_prefix_then_solid_neutral_remainder"
      : "graph_receipt_ordered_named_route_reaches_network_snap",
    sections,
    diagnostics: {
      ...routed.diagnostics,
      matchedExactSectionCount: tealSections.length,
      solidDistanceMeters: tealSections.reduce((sum, section) => sum + section.distanceMeters, 0),
      unapprovedDistanceMeters: neutralSections.reduce(
        (sum, section) => sum + section.distanceMeters,
        0,
      ),
      routerReportedGraphUnverified: sections.some((section) => (
        section.sourceIdentityId === null
        && Boolean(section.routerReportedUnverifiedLabel)
      )),
      graphEvidenceReceiptApplied: true,
      graphEvidenceStatus: "sealed_receipt_applied",
      graphEvidenceReceiptKeySha256: applied.receiptKeySha256,
      graphEvidenceReceiptSha256: applied.receiptSha256,
      graphEvidenceRouteCoordinateSha256: applied.routeCoordinateSha256,
      graphEvidenceBaseSectionCount: originalSections.length,
      graphEvidenceSectionRunCount: sections.filter((section) => (
        section.graphEvidenceRunOrder !== null
      )).length,
      graphEvidenceNamedRunCount: graphNamedSections.length,
      graphEvidenceOrderedExactRunCount: graphNamedSections.filter((section) => (
        section.sourceMatch === "ordered_exact"
      )).length,
      graphEvidenceNamedNeutralRunCount: graphNamedSections.filter((section) => (
        section.colorRole === "unverified"
      )).length,
      graphEvidenceUnresolvedRunCount: sections.filter((section) => (
        section.graphEvidence?.state === "unresolved"
      )).length,
      firstUnresolvedGraphEvidenceRunOrder: applied.firstUnresolvedRunOrder,
      firstNonOrderedGraphEvidenceRunOrder: applied.firstNonOrderedRunOrder,
    },
  };
}

function assertNoUnusedGraphEvidenceReceipts(graphEvidence, appliedPadIds) {
  if (!graphEvidence) return;
  const unusedReceiptPadIds = [...graphEvidence.receiptByPadId.keys()]
    .filter((padId) => !appliedPadIds.has(padId))
    .sort();
  if (unusedReceiptPadIds.length) {
    fail(`graph-evidence fixture contains ${unusedReceiptPadIds.length} stale or unrouted receipts`);
  }
}

function validateGeneratedRoutePresentation(records, schemaVersion) {
  for (const record of records) {
    if (record.status !== "ROUTED_DISPLAY") continue;
    const measuredSections = record.sections.filter((section) => section.lineStyle !== "none");
    if (!record.roadCoordinates.length
      || !measuredSections.length
      || measuredSections.some((section) => section.lineStyle !== "solid")
      || record.sections.some((section) => section.lineStyle === "dashed")
      || record.gpsTether?.lineStyle !== "solid") {
      fail(`${record.padName} generated a missing or non-solid route line`);
    }
    let neutralStarted = false;
    for (const section of measuredSections) {
      if (section.colorRole !== "teal") neutralStarted = true;
      else if (neutralStarted) {
        fail(`${record.padName} teal resumed after the first neutral graph section`);
      }
      if (schemaVersion >= 3 && section.colorRole === "teal"
        && (section.graphEvidence?.state !== "exact"
          || section.graphEvidence?.sourceMatch !== "ordered_exact"
          || section.sourceMatch !== "ordered_exact"
          || section.sourceRoadId !== section.matchedSourceRoadId)) {
        fail(`${record.padName} teal lacks an uninterrupted exact ordered graph binding`);
      }
    }
    const measuredMeters = record.sections.reduce(
      (sum, section) => sum + section.distanceMeters,
      0,
    );
    if (Math.abs(measuredMeters - record.mileage.roadDistanceMeters) > 1e-6) {
      fail(`${record.padName} generated sections do not preserve measured road mileage`);
    }
    if (schemaVersion >= 3 && record.sections.some((section) => (
      !Array.isArray(section.coordinates)
      || (section.lineStyle === "solid" && section.coordinates.length < 2)
      || section.parentSectionOrder === undefined
      || section.graphEvidenceRunOrder === undefined
      || section.sourceIdentityId === undefined
      || section.routeSystem === undefined
      || section.routeNumber === undefined
      || section.county === undefined
      || section.sourceMatch === undefined
      || section.matchedSourceRoadId === undefined
      || section.graphEvidence === undefined
    ))) {
      fail(`${record.padName} schema-3 child route fields are incomplete`);
    }
  }
}

function validateFixture(fixture) {
  if (fixture?.schemaVersion !== 1
    || fixture?.snapshotId !== expectedSnapshotId
    || fixture?.scope !== batch2Scope
    || fixture?.rules?.primaryRouteOnly !== true
    || fixture?.rules?.exactHighwayStepRequired !== true
    || fixture?.rules?.exactMasterRoadIdsOnly !== true
    || fixture?.rules?.noFuzzyOrNearestRoadIdentityMatching !== true
    || fixture?.rules?.nearestHighwayCoordinateIsCandidateOnly !== true
    || fixture?.rules?.productionWrites !== 0
    || !Array.isArray(fixture.records)
    || fixture.records.length !== 192) {
    fail("the source fixture is no longer the exact 192-pad read-only snapshot");
  }
  const ids = new Set();
  for (const record of fixture.records) {
    if (!record.padId
      || record.canonicalId !== record.padId
      || ids.has(record.padId)
      || record.company !== "Ascent"
      || !coordinate(record.destination)
      || !coordinate(record.directoryCoordinate)
      || record.routePrep?.pad_id !== record.padId) {
      fail(`${record.padName || record.padId || "unknown pad"} has an invalid frozen binding`);
    }
    ids.add(record.padId);
  }
}

function parseArguments(argv) {
  const options = {
    fixturePath: defaultFixturePath,
    outputPath: defaultOutputPath,
    graphEvidenceFixturePath: defaultGraphEvidenceFixturePath,
    osrmBaseUrl: process.env.BRINESEARCH_OSRM_BASE_URL || defaultOsrmBaseUrl,
    concurrency: Number(process.env.BRINESEARCH_OSRM_CONCURRENCY || 4),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--fixture") options.fixturePath = resolve(argv[++index]);
    else if (argument === "--output") options.outputPath = resolve(argv[++index]);
    else if (argument === "--graph-evidence-fixture") {
      options.graphEvidenceFixturePath = resolve(argv[++index]);
    } else if (argument === "--no-graph-evidence") {
      options.graphEvidenceFixturePath = null;
    }
    else if (argument === "--osrm-base-url") options.osrmBaseUrl = argv[++index];
    else if (argument === "--concurrency") options.concurrency = Number(argv[++index]);
    else fail(`unknown argument ${argument}`);
  }
  if (!options.osrmBaseUrl || !Number.isInteger(options.concurrency)
    || options.concurrency < 1 || options.concurrency > 12) {
    fail("OSRM base URL or concurrency is invalid");
  }
  options.osrmBaseUrl = options.osrmBaseUrl.replace(/\/+$/u, "");
  return options;
}

export async function generateBatch2(options = {}) {
  const fixturePath = options.fixturePath || defaultFixturePath;
  const outputPath = options.outputPath || defaultOutputPath;
  let graphEvidenceFixturePath = defaultGraphEvidenceFixturePath;
  if (Object.prototype.hasOwnProperty.call(options, "graphEvidenceFixturePath")) {
    if (options.graphEvidenceFixturePath === null) graphEvidenceFixturePath = null;
    else if (typeof options.graphEvidenceFixturePath === "string"
      && options.graphEvidenceFixturePath.trim()) {
      graphEvidenceFixturePath = resolve(options.graphEvidenceFixturePath);
    } else {
      fail("graphEvidenceFixturePath must be a file path or explicit null opt-out");
    }
  }
  const osrmBaseUrl = (options.osrmBaseUrl || defaultOsrmBaseUrl).replace(/\/+$/u, "");
  const concurrency = options.concurrency || 4;
  const [fixtureText, batch1Text, graphEvidence] = await Promise.all([
    readFile(fixturePath, "utf8"),
    readFile(batch1Path, "utf8"),
    loadOptionalGraphEvidenceFixture(
      graphEvidenceFixturePath,
      graphEvidenceFixturePath !== null,
    ),
  ]);
  const fixture = JSON.parse(fixtureText);
  validateFixture(fixture);
  validateGraphEvidenceFixtureScope(graphEvidence, fixtureText);
  const records = [...fixture.records].sort((left, right) => (
    left.padName.localeCompare(right.padName) || left.padId.localeCompare(right.padId)
  ));
  const policyByPadId = new Map(records.map((record) => [record.padId, exactPrefixPolicy(record)]));
  const candidateResolutionByPadId = new Map(records.map((record) => [
    record.padId,
    resolveRouteCandidates(record, policyByPadId.get(record.padId)),
  ]));
  const candidateByPadId = new Map(records.map((record) => [
    record.padId,
    candidateResolutionByPadId.get(record.padId).candidates,
  ]));
  const specifications = records.flatMap((record) => (
    candidateByPadId.get(record.padId).map((candidate) => ({ record, candidate }))
  ));
  const results = await routeOsrmBatch(specifications, osrmBaseUrl, concurrency);
  const resultByPadId = new Map(records.map((record) => [record.padId, []]));
  for (let index = 0; index < specifications.length; index += 1) {
    resultByPadId.get(specifications[index].record.padId).push(results[index]);
  }

  const graphEvidenceSchemaVersion = graphEvidence ? 3 : 2;
  const appliedGraphEvidencePadIds = new Set();
  const outputRecords = records.map((record) => {
    const policy = policyByPadId.get(record.padId);
    if (!policy) {
      return pinOnlyRecord(record, null, "no_exact_last_interstate_us_or_state_highway");
    }
    const candidates = candidateByPadId.get(record.padId);
    if (!candidates.length) {
      const resolution = candidateResolutionByPadId.get(record.padId);
      return pinOnlyRecord(
        record,
        policy,
        resolution.rejectionReason || "no_exact_intersection_or_candidate_highway_start",
        0,
        resolution.rejectionDiagnostics,
      );
    }
    const successes = resultByPadId.get(record.padId).filter((result) => result.ok);
    if (!successes.length) {
      return pinOnlyRecord(record, policy, "all_osrm_candidates_failed", candidates.length);
    }
    const scored = successes.map((result) => candidateScore(result, policy));
    scored.sort(compareCandidateScores);
    const routed = routedRecord(record, policy, scored[0], candidates.length);
    const receipt = graphEvidence?.receiptByPadId.get(record.padId) || null;
    if (!receipt) {
      return neutralizeRoutedRecordWithoutReceipt(routed, graphEvidenceSchemaVersion);
    }
    const output = applyGraphEvidenceToRoutedRecord(routed, policy, receipt);
    appliedGraphEvidencePadIds.add(record.padId);
    return output;
  });

  assertNoUnusedGraphEvidenceReceipts(graphEvidence, appliedGraphEvidencePadIds);
  validateGeneratedRoutePresentation(outputRecords, graphEvidenceSchemaVersion);

  const summary = {
    sourcePadCount: records.length,
    outputPadCount: outputRecords.length,
    routedDisplayCount: outputRecords.filter((record) => record.status === "ROUTED_DISPLAY").length,
    routedFailClosedCount: outputRecords.filter((record) => record.status === "ROUTED_FAIL_CLOSED").length,
    pinOnlyCount: outputRecords.filter((record) => record.status === "PIN_ONLY").length,
    retainedRouterUnverifiedRouteCount: outputRecords.filter((record) => (
      record.status === "ROUTED_DISPLAY"
      && record.diagnostics.graphEvidenceReceiptApplied === false
    )).length,
    graphEvidenceReceiptCount: graphEvidence?.fixture.records.length || 0,
    appliedGraphEvidenceReceiptCount: appliedGraphEvidencePadIds.size,
    graphEvidenceNamedRunCount: outputRecords.reduce((sum, record) => (
      sum + (record.diagnostics.graphEvidenceNamedRunCount || 0)
    ), 0),
    graphEvidenceOrderedExactRunCount: outputRecords.reduce((sum, record) => (
      sum + (record.diagnostics.graphEvidenceOrderedExactRunCount || 0)
    ), 0),
    graphEvidenceNamedNeutralRunCount: outputRecords.reduce((sum, record) => (
      sum + (record.diagnostics.graphEvidenceNamedNeutralRunCount || 0)
    ), 0),
    graphEvidenceUnresolvedRunCount: outputRecords.reduce((sum, record) => (
      sum + (record.diagnostics.graphEvidenceUnresolvedRunCount || 0)
    ), 0),
    remoteStartRejectedPinOnlyCount: outputRecords.filter((record) => (
      record.status === "PIN_ONLY"
      && record.reason === "candidate_start_exceeds_25_air_miles_from_destination"
    )).length,
    exactIntersectionStartCount: outputRecords.filter((record) => (
      record.start?.authority === "exact_highway_next_road_intersection"
    )).length,
    candidateNearestHighwayStartCount: outputRecords.filter((record) => (
      record.start?.authority === "candidate_nearest_highway_point"
    )).length,
    osrmCandidateRequestCount: specifications.length,
    solidSectionCount: outputRecords.flatMap((record) => record.sections)
      .filter((section) => section.lineStyle === "solid").length,
    solidUnapprovedSectionCount: outputRecords.flatMap((record) => record.sections)
      .filter((section) => ["unapproved", "unverified"].includes(section.colorRole)).length,
    nontrivialGpsTetherCount: outputRecords.filter((record) => record.gpsTether?.nontrivial).length,
    totalToGpsWithheldCount: outputRecords.filter((record) => (
      record.gpsTether?.nontrivial && record.mileage.totalToGpsMiles === null
    )).length,
    maximumDisplayedStartToDestinationAirMiles: Math.max(
      0,
      ...outputRecords
        .filter((record) => record.status === "ROUTED_DISPLAY")
        .map((record) => record.start.startToDestinationAirMiles),
    ),
    productionWrites: 0,
    googleUrlChanges: 0,
    redGeometryCount: 0,
  };
  if (summary.outputPadCount !== 192
    || new Set(outputRecords.map((record) => record.padId)).size !== 192
    || summary.routedDisplayCount + summary.routedFailClosedCount + summary.pinOnlyCount !== 192
    || summary.remoteStartRejectedPinOnlyCount !== 5
    || summary.maximumDisplayedStartToDestinationAirMiles > maximumStartToDestinationAirMiles
    || summary.graphEvidenceReceiptCount !== summary.appliedGraphEvidenceReceiptCount
    || specifications.some((specification) => (
      specification.candidate.startToDestinationAirMiles > maximumStartToDestinationAirMiles
      || specification.candidate.anchoredRoadId
        !== specification.record.routePrep?.highway?.roadId
    ))
    || summary.totalToGpsWithheldCount !== summary.nontrivialGpsTetherCount) {
    fail("the generated 192-pad accounting is inconsistent");
  }
  const artifact = {
    schemaVersion: graphEvidenceSchemaVersion,
    batchId: "ascent-last-highway-to-pad-approaches-20260829-batch2",
    scope: fixture.scope,
    authority: graphEvidence
      ? "Field display only. Only an uninterrupted ordered source-road binding in a sealed exact graph receipt is solid teal. Graph-named-only, unresolved, and unreceipted sections remain visible as solid neutral/unapproved geometry."
      : "Field display only. No sealed graph-evidence fixture was loaded, so every successful routed line remains visible as solid neutral/unapproved geometry; retained router identities are explicitly graph-unverified.",
    rules: {
      batch1ArtifactRemainsByteStable: true,
      explicitBuildTimeOsrmOnly: true,
      exactIntersectionStartsPreferred: true,
      nearestHighwayStartIsCandidateOnly: true,
      maximumExactIntersectionSnapMeters,
      maximumCandidateHighwaySnapMeters,
      candidateStartRequiresExactMasterLastHighwayRoadIdAnchor: true,
      noFuzzyOrUnanchoredNameOnlyCandidateStartMatching: true,
      maxStartToDestinationAirMiles: maximumStartToDestinationAirMiles,
      exactNormalizedAliasesOnly: true,
      noFuzzyNearestOrNameOnlyRoadIdentityMatching: true,
      solidStopsPermanentlyAtFirstMismatch: true,
      unmatchedPrivateAndUnnamedRoadsStayVisibleAsSolidUnapproved: true,
      unapprovedLabelsReflectMatchState: true,
      successfulOsrmCandidateGeometryIsNeverDiscarded: true,
      routerLabelsAreExplicitlyGraphUnverified: true,
      graphEvidenceReceiptsFailClosedOnSchemaKeyHashOrCoverageDrift: true,
      onlyUninterruptedOrderedExactGraphRunsCanBeTeal: true,
      graphNamedOnlyAndUnresolvedRunsPermanentlyStopTeal: true,
      graphNamedRunsRetainExactIdentityWhenNeutral: true,
      routesWithoutGraphEvidenceStayVisibleAsSolidNeutral: true,
      baseRoadCoordinatesAndMeasuredRoadMileageArePreserved: true,
      gpsTetherIsSeparateStraightSolidUnapprovedGeometry: true,
      gpsTetherExcludedFromRoadMileage: true,
      nontrivialGpsTetherMakesTotalToGpsNull: true,
      geometrySimplificationToleranceMeters,
      noProductionWrites: true,
      noGoogleUrlChanges: true,
      noRedGeometry: true,
    },
    source: {
      fixture: "v18/scripts/fixtures/ascent-pad-approach-source-20260829.json",
      snapshotId: fixture.snapshotId,
      fixtureSha256: canonicalTextDigest(fixtureText),
      preservedBatch1: "v18/src/features/map/ascentPadRoadDisplays.batch1.json",
      preservedBatch1Sha256: canonicalTextDigest(batch1Text),
      osrmProfile: "driving",
      graphEvidenceFixture: graphEvidence
        ? resolve(graphEvidenceFixturePath) === defaultGraphEvidenceFixturePath
          ? "v18/scripts/fixtures/ascent-pad-graph-runs-20260829.json"
          : "explicit-custom-graph-evidence-fixture"
        : null,
      graphEvidenceFixtureId: graphEvidence?.fixture.fixtureId || null,
      graphEvidenceFixtureSha256: graphEvidence
        ? canonicalTextDigest(graphEvidence.fixtureText)
        : null,
    },
    summary,
    records: outputRecords,
  };
  if (JSON.stringify(artifact).includes('"lineStyle":"dashed"')) {
    fail("the generated artifact contains a forbidden dashed route or tether");
  }
  // This artifact is loaded on the map's hot path. Keep one compact coordinate
  // array per pad and write minified JSON; source fixtures and the generator
  // remain the human-readable audit trail.
  await writeFile(outputPath, `${JSON.stringify(artifact)}\n`, "utf8");
  const output = await stat(outputPath);
  return {
    artifact,
    report: {
      outputPath,
      artifactBytes: output.size,
      artifactSha256: digest(artifact),
      ...summary,
    },
  };
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const options = parseArguments(process.argv.slice(2));
  const { report } = await generateBatch2(options);
  console.log(JSON.stringify(report, null, 2));
}

export {
  applyGraphEvidenceToRoutedRecord,
  assertNoUnusedGraphEvidenceReceipts,
  batch2Scope,
  exactPrefixPolicy,
  loadOptionalGraphEvidenceFixture,
  matchRouteSteps,
  maximumStartToDestinationAirMiles,
  neutralizeRoutedRecordWithoutReceipt,
  normalizedRoadIdentity,
  orderedSourceRoadsForPolicy,
  resolveRouteCandidates,
  routeCandidates,
  routedRecord,
  routerReportedUnverifiedLabel,
  simplifyCoordinates,
  stepMatchesIdentityGroup,
  unapprovedPresentation,
  validateGeneratedRoutePresentation,
  validateGraphEvidenceFixture,
  validateGraphEvidenceFixtureScope,
};
