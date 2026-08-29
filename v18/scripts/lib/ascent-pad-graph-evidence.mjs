import { createHash } from "node:crypto";

export const ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION = 1;
export const ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS = "parent_section_distance_meters";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const EVIDENCE_DIGEST_PATTERN = /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/;
// Source-system deterministic IDs are UUID-shaped but are not guaranteed to
// carry RFC version/variant bits (for example, an identity can contain
// "-af84-2728-"). Preserve and validate their canonical text exactly.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FRACTION_EPSILON = 1e-12;
const MEASURE_EPSILON_METERS = 1e-6;

const RECEIPT_KEYS = new Set([
  "schemaVersion",
  "padId",
  "recordRevision",
  "routedIdentitySha256",
  "routeCoordinateSha256",
  "measureBasis",
  "runs",
  "receiptKeySha256",
  "receiptSha256",
]);

const RUN_KEYS = new Set([
  "runOrder",
  "sectionOrder",
  "state",
  "startMeasureMeters",
  "endMeasureMeters",
  "startFraction",
  "endFraction",
  "identityId",
  "roadId",
  "displayName",
  "routeSystem",
  "routeNumber",
  "county",
  "sourceDigest",
  "geometryDigest",
  "buildDigest",
  "junctionDigest",
  "sourceMatch",
  "matchedSourceStepOrder",
  "matchedSourceRoadId",
  "unresolvedReason",
  "candidateIdentityIds",
]);

const EXACT_ONLY_KEYS = [
  "identityId",
  "roadId",
  "displayName",
  "routeSystem",
  "routeNumber",
  "county",
  "sourceDigest",
  "geometryDigest",
  "buildDigest",
  "junctionDigest",
  "sourceMatch",
  "matchedSourceStepOrder",
  "matchedSourceRoadId",
];

export class AscentPadGraphEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "AscentPadGraphEvidenceError";
  }
}

function fail(message) {
  throw new AscentPadGraphEvidenceError(message);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalJson(value, path = "value") {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${path} must contain only finite JSON numbers`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => canonicalJson(item, `${path}[${index}]`)).join(",")}]`;
  }
  if (!isPlainObject(value)) fail(`${path} must contain only JSON-compatible plain objects`);

  const encoded = [];
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) fail(`${path}.${key} must not be undefined`);
    encoded.push(`${JSON.stringify(key)}:${canonicalJson(value[key], `${path}.${key}`)}`);
  }
  return `{${encoded.join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertKnownKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}.${key} is not part of graph-evidence schema v1`);
  }
}

function assertNonemptyString(value, path) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    fail(`${path} must be a nonempty, already-trimmed string`);
  }
}

function assertUuid(value, path) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fail(`${path} must be a canonical lowercase UUID`);
  }
}

function assertSha256(value, path) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(`${path} must be a lowercase SHA-256 digest`);
  }
}

function assertEvidenceDigest(value, path) {
  if (typeof value !== "string" || !EVIDENCE_DIGEST_PATTERN.test(value)) {
    fail(`${path} must be a lowercase 32- or 64-hex evidence digest`);
  }
}

function assertFiniteNonnegative(value, path) {
  if (!Number.isFinite(value) || value < 0) fail(`${path} must be a finite nonnegative number`);
}

function nearlyEqual(left, right, epsilon) {
  return Math.abs(left - right) <= epsilon;
}

function validateCoordinates(roadCoordinates) {
  if (!Array.isArray(roadCoordinates) || roadCoordinates.length === 0) {
    fail("roadCoordinates must be a nonempty coordinate array");
  }
  for (const [index, point] of roadCoordinates.entries()) {
    if (!Array.isArray(point) || point.length !== 2) {
      fail(`roadCoordinates[${index}] must be an exact [longitude, latitude] pair`);
    }
    const [longitude, latitude] = point;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      fail(`roadCoordinates[${index}][0] must be a finite longitude`);
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      fail(`roadCoordinates[${index}][1] must be a finite latitude`);
    }
  }
}

export function computeRouteCoordinateSha256(roadCoordinates) {
  validateCoordinates(roadCoordinates);
  return sha256(canonicalJson(roadCoordinates, "roadCoordinates"));
}

function graphEvidenceKeyValue(value) {
  if (!isPlainObject(value)) fail("graph-evidence key input must be an object");
  assertUuid(value.padId, "padId");
  assertNonemptyString(value.recordRevision, "recordRevision");
  assertSha256(value.routedIdentitySha256, "routedIdentitySha256");
  assertSha256(value.routeCoordinateSha256, "routeCoordinateSha256");
  return {
    padId: value.padId,
    recordRevision: value.recordRevision,
    routedIdentitySha256: value.routedIdentitySha256,
    routeCoordinateSha256: value.routeCoordinateSha256,
  };
}

export function computeGraphEvidenceReceiptKeySha256(value) {
  return sha256(canonicalJson(graphEvidenceKeyValue(value), "graphEvidenceKey"));
}

export function computeGraphEvidenceReceiptSha256(receipt) {
  if (!isPlainObject(receipt)) fail("receipt must be an object");
  const payload = {};
  for (const [key, value] of Object.entries(receipt)) {
    if (key !== "receiptSha256") payload[key] = value;
  }
  return sha256(canonicalJson(payload, "receipt"));
}

function validateSections(sections, roadCoordinates) {
  if (!Array.isArray(sections) || sections.length === 0) {
    fail("sections must be a nonempty section array");
  }

  const byOrder = new Map();
  for (const [index, section] of sections.entries()) {
    const path = `sections[${index}]`;
    if (!isPlainObject(section)) fail(`${path} must be an object`);
    if (section.sectionOrder !== index + 1) {
      fail(`${path}.sectionOrder must be the contiguous value ${index + 1}`);
    }
    if (!Number.isInteger(section.coordinateStartIndex)
      || !Number.isInteger(section.coordinateEndIndex)
      || section.coordinateStartIndex < 0
      || section.coordinateEndIndex < section.coordinateStartIndex
      || section.coordinateEndIndex >= roadCoordinates.length) {
      fail(`${path} must reference a valid ordered range in roadCoordinates`);
    }
    assertFiniteNonnegative(section.distanceMeters, `${path}.distanceMeters`);
    for (const field of ["distanceMiles", "durationSeconds"]) {
      if (section[field] !== undefined && section[field] !== null) {
        assertFiniteNonnegative(section[field], `${path}.${field}`);
      }
    }
    byOrder.set(section.sectionOrder, section);
  }
  return byOrder;
}

function validateOrderedSourceRoads(orderedSourceRoads) {
  if (!Array.isArray(orderedSourceRoads)) fail("orderedSourceRoads must be an array");
  const byStepOrder = new Map();
  let priorStepOrder = 0;
  for (const [index, source] of orderedSourceRoads.entries()) {
    const path = `orderedSourceRoads[${index}]`;
    if (!isPlainObject(source)) fail(`${path} must be an object`);
    if (!Number.isInteger(source.sourceStepOrder) || source.sourceStepOrder <= priorStepOrder) {
      fail(`${path}.sourceStepOrder must be positive and strictly increasing`);
    }
    assertUuid(source.roadId, `${path}.roadId`);
    priorStepOrder = source.sourceStepOrder;
    byStepOrder.set(source.sourceStepOrder, source.roadId);
  }
  return byStepOrder;
}

function validateExactRun(run, path, orderedSourceByStep) {
  assertUuid(run.identityId, `${path}.identityId`);
  if (run.roadId !== undefined && run.roadId !== null) assertUuid(run.roadId, `${path}.roadId`);
  assertNonemptyString(run.displayName, `${path}.displayName`);
  assertNonemptyString(run.routeSystem, `${path}.routeSystem`);
  if (!/^[A-Z][A-Z0-9-]{0,15}$/.test(run.routeSystem)) {
    fail(`${path}.routeSystem must be an uppercase exact route system`);
  }
  assertNonemptyString(run.routeNumber, `${path}.routeNumber`);
  assertNonemptyString(run.county, `${path}.county`);
  assertEvidenceDigest(run.sourceDigest, `${path}.sourceDigest`);
  assertEvidenceDigest(run.geometryDigest, `${path}.geometryDigest`);
  assertEvidenceDigest(run.buildDigest, `${path}.buildDigest`);
  if (!("junctionDigest" in run)) fail(`${path}.junctionDigest must be present (null is allowed)`);
  if (run.junctionDigest !== null) assertEvidenceDigest(run.junctionDigest, `${path}.junctionDigest`);
  if (run.sourceMatch !== "ordered_exact" && run.sourceMatch !== "graph_named_only") {
    fail(`${path}.sourceMatch must be ordered_exact or graph_named_only`);
  }
  if (run.sourceMatch === "ordered_exact") {
    if (!Number.isInteger(run.matchedSourceStepOrder) || run.matchedSourceStepOrder <= 0) {
      fail(`${path}.matchedSourceStepOrder must bind an ordered source step`);
    }
    assertUuid(run.matchedSourceRoadId, `${path}.matchedSourceRoadId`);
    if (run.roadId === undefined || run.roadId === null || run.roadId !== run.matchedSourceRoadId) {
      fail(`${path}.roadId must exactly equal matchedSourceRoadId for ordered_exact`);
    }
    if (orderedSourceByStep.get(run.matchedSourceStepOrder) !== run.matchedSourceRoadId) {
      fail(`${path} ordered_exact binding is absent from orderedSourceRoads`);
    }
  } else if ("matchedSourceStepOrder" in run || "matchedSourceRoadId" in run) {
    fail(`${path} graph_named_only must not claim an ordered source binding`);
  }
  if ("unresolvedReason" in run || "candidateIdentityIds" in run) {
    fail(`${path} exact runs must not carry unresolved candidates or reasons`);
  }
}

function validateUnresolvedRun(run, path) {
  assertNonemptyString(run.unresolvedReason, `${path}.unresolvedReason`);
  for (const key of EXACT_ONLY_KEYS) {
    if (key in run) fail(`${path}.${key} is forbidden on an unresolved run`);
  }

  if (run.candidateIdentityIds !== undefined) {
    if (!Array.isArray(run.candidateIdentityIds) || run.candidateIdentityIds.length === 0) {
      fail(`${path}.candidateIdentityIds must be a nonempty array when present`);
    }
    for (const [index, identityId] of run.candidateIdentityIds.entries()) {
      assertUuid(identityId, `${path}.candidateIdentityIds[${index}]`);
      if (index > 0 && identityId <= run.candidateIdentityIds[index - 1]) {
        fail(`${path}.candidateIdentityIds must be unique and sorted`);
      }
    }
  }

  if (run.unresolvedReason === "ambiguous_graph_overlap"
    && (!Array.isArray(run.candidateIdentityIds) || run.candidateIdentityIds.length < 2)) {
    fail(`${path} ambiguous_graph_overlap requires at least two candidateIdentityIds`);
  }
}

function validateRun(run, index, sectionByOrder, orderedSourceByStep) {
  const path = `receipt.runs[${index}]`;
  if (!isPlainObject(run)) fail(`${path} must be an object`);
  assertKnownKeys(run, RUN_KEYS, path);
  if (run.runOrder !== index + 1) fail(`${path}.runOrder must be the contiguous value ${index + 1}`);
  if (!Number.isInteger(run.sectionOrder) || !sectionByOrder.has(run.sectionOrder)) {
    fail(`${path}.sectionOrder must reference a base section`);
  }
  if (run.state !== "exact" && run.state !== "unresolved") {
    fail(`${path}.state must be exact or unresolved`);
  }

  for (const field of ["startMeasureMeters", "endMeasureMeters", "startFraction", "endFraction"]) {
    if (!Number.isFinite(run[field])) fail(`${path}.${field} must be finite`);
  }
  if (run.startMeasureMeters < 0 || run.endMeasureMeters <= run.startMeasureMeters) {
    fail(`${path} must have increasing nonnegative measure bounds`);
  }
  if (run.startFraction < 0 || run.endFraction > 1 || run.endFraction <= run.startFraction) {
    fail(`${path} must have increasing fraction bounds within [0, 1]`);
  }

  const section = sectionByOrder.get(run.sectionOrder);
  if (section.distanceMeters === 0) fail(`${path} cannot target a zero-distance structural section`);
  const expectedStart = section.distanceMeters * run.startFraction;
  const expectedEnd = section.distanceMeters * run.endFraction;
  if (!nearlyEqual(run.startMeasureMeters, expectedStart, MEASURE_EPSILON_METERS)
    || !nearlyEqual(run.endMeasureMeters, expectedEnd, MEASURE_EPSILON_METERS)) {
    fail(`${path} measure and fraction bounds disagree with the parent section distance`);
  }

  if (run.state === "exact") validateExactRun(run, path, orderedSourceByStep);
  else validateUnresolvedRun(run, path);
}

function validateCoverage(receipt, sections) {
  const runsBySection = new Map();
  let priorSectionOrder = 0;

  for (const run of receipt.runs) {
    if (run.sectionOrder < priorSectionOrder) {
      fail("receipt.runs must remain ordered by base section");
    }
    priorSectionOrder = run.sectionOrder;
    const runs = runsBySection.get(run.sectionOrder) || [];
    runs.push(run);
    runsBySection.set(run.sectionOrder, runs);
  }

  for (const section of sections) {
    const runs = runsBySection.get(section.sectionOrder) || [];
    if (section.distanceMeters === 0) {
      if (runs.length) fail(`zero-distance section ${section.sectionOrder} must not have evidence runs`);
      continue;
    }
    if (!runs.length) {
      fail(`section ${section.sectionOrder} has no graph-evidence coverage; use an explicit unresolved run`);
    }
    if (!nearlyEqual(runs[0].startFraction, 0, FRACTION_EPSILON)
      || !nearlyEqual(runs[0].startMeasureMeters, 0, MEASURE_EPSILON_METERS)) {
      fail(`section ${section.sectionOrder} graph-evidence coverage must start at zero`);
    }
    for (let index = 1; index < runs.length; index += 1) {
      if (!nearlyEqual(runs[index].startFraction, runs[index - 1].endFraction, FRACTION_EPSILON)
        || !nearlyEqual(runs[index].startMeasureMeters, runs[index - 1].endMeasureMeters, MEASURE_EPSILON_METERS)) {
        fail(`section ${section.sectionOrder} has an overlap or unrepresented graph-evidence gap`);
      }
    }
    const last = runs.at(-1);
    if (!nearlyEqual(last.endFraction, 1, FRACTION_EPSILON)
      || !nearlyEqual(last.endMeasureMeters, section.distanceMeters, MEASURE_EPSILON_METERS)) {
      fail(`section ${section.sectionOrder} graph-evidence coverage must end at its full distance`);
    }
  }
}

function validateTopology(receipt) {
  let priorMatchedSourceStepOrder = 0;
  for (let index = 1; index < receipt.runs.length; index += 1) {
    const prior = receipt.runs[index - 1];
    const current = receipt.runs[index];
    if (prior.state === "exact"
      && current.state === "exact"
      && prior.identityId !== current.identityId
      && current.junctionDigest === null) {
      fail(`receipt.runs[${index}].junctionDigest is required for an adjacent exact identity transition`);
    }
  }
  for (const [index, run] of receipt.runs.entries()) {
    if (run.state !== "exact" || run.sourceMatch !== "ordered_exact") continue;
    if (run.matchedSourceStepOrder < priorMatchedSourceStepOrder) {
      fail(`receipt.runs[${index}].matchedSourceStepOrder moves backward in the ordered source route`);
    }
    priorMatchedSourceStepOrder = run.matchedSourceStepOrder;
  }
}

function validateReceipt(receipt, context, routeCoordinateSha256, sectionByOrder, orderedSourceByStep) {
  if (!isPlainObject(receipt)) fail("receipt must be an object");
  assertKnownKeys(receipt, RECEIPT_KEYS, "receipt");
  if (receipt.schemaVersion !== ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION) {
    fail(`receipt.schemaVersion must be ${ASCENT_PAD_GRAPH_EVIDENCE_SCHEMA_VERSION}`);
  }
  if (receipt.measureBasis !== ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS) {
    fail(`receipt.measureBasis must be ${ASCENT_PAD_GRAPH_EVIDENCE_MEASURE_BASIS}`);
  }
  assertSha256(receipt.receiptKeySha256, "receipt.receiptKeySha256");
  assertSha256(receipt.receiptSha256, "receipt.receiptSha256");

  const computedReceiptSha256 = computeGraphEvidenceReceiptSha256(receipt);
  if (computedReceiptSha256 !== receipt.receiptSha256) {
    fail("receipt content digest drifted from receipt.receiptSha256");
  }

  const key = graphEvidenceKeyValue(receipt);
  const computedKeySha256 = computeGraphEvidenceReceiptKeySha256(key);
  if (computedKeySha256 !== receipt.receiptKeySha256) {
    fail("receipt key fields drifted from receipt.receiptKeySha256");
  }
  if (receipt.padId !== context.padId) fail("receipt padId does not match the routed pad");
  if (receipt.recordRevision !== context.recordRevision) {
    fail("receipt recordRevision does not match the routed record revision");
  }
  if (receipt.routedIdentitySha256 !== context.routedIdentitySha256) {
    fail("receipt routedIdentitySha256 does not match the routed identity snapshot");
  }
  if (receipt.routeCoordinateSha256 !== routeCoordinateSha256) {
    fail("receipt routeCoordinateSha256 does not match roadCoordinates");
  }
  if (!Array.isArray(receipt.runs)) fail("receipt.runs must be an array");

  for (const [index, run] of receipt.runs.entries()) {
    validateRun(run, index, sectionByOrder, orderedSourceByStep);
  }
  validateCoverage(receipt, context.sections);
  validateTopology(receipt);
}

function allocateProportionally(total, runs) {
  if (!Number.isFinite(total)) return null;
  const values = [];
  let allocated = 0;
  for (const [index, run] of runs.entries()) {
    const value = index === runs.length - 1
      ? total - allocated
      : total * (run.endFraction - run.startFraction);
    values.push(Object.is(value, -0) ? 0 : value);
    allocated += value;
  }
  return values;
}

const EARTH_RADIUS_METERS = 6_371_008.8;

function radians(value) {
  return value * Math.PI / 180;
}

function haversineMeters(left, right) {
  const latitude1 = radians(left[1]);
  const latitude2 = radians(right[1]);
  const latitudeDelta = latitude2 - latitude1;
  const longitudeDelta = radians(right[0] - left[0]);
  const sineLatitude = Math.sin(latitudeDelta / 2);
  const sineLongitude = Math.sin(longitudeDelta / 2);
  const a = sineLatitude * sineLatitude
    + Math.cos(latitude1) * Math.cos(latitude2) * sineLongitude * sineLongitude;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

function sameCoordinate(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}

function sectionChildCoordinates(roadCoordinates, section, runs) {
  const parent = roadCoordinates.slice(section.coordinateStartIndex, section.coordinateEndIndex + 1);
  if (parent.length < 2) {
    fail(`positive-distance section ${section.sectionOrder} must contain at least two coordinates`);
  }

  const cumulative = [0];
  for (let index = 1; index < parent.length; index += 1) {
    cumulative.push(cumulative[index - 1] + haversineMeters(parent[index - 1], parent[index]));
  }
  const total = cumulative.at(-1);
  if (!(total > 0)) fail(`positive-distance section ${section.sectionOrder} has zero-length geometry`);

  function pointAtFraction(fraction) {
    if (nearlyEqual(fraction, 0, FRACTION_EPSILON)) return parent[0];
    if (nearlyEqual(fraction, 1, FRACTION_EPSILON)) return parent.at(-1);
    const target = total * fraction;
    for (let index = 1; index < cumulative.length; index += 1) {
      if (target > cumulative[index] + MEASURE_EPSILON_METERS) continue;
      if (nearlyEqual(target, cumulative[index - 1], MEASURE_EPSILON_METERS)) return parent[index - 1];
      if (nearlyEqual(target, cumulative[index], MEASURE_EPSILON_METERS)) return parent[index];
      const segmentLength = cumulative[index] - cumulative[index - 1];
      if (!(segmentLength > 0)) continue;
      const ratio = (target - cumulative[index - 1]) / segmentLength;
      return [
        parent[index - 1][0] + (parent[index][0] - parent[index - 1][0]) * ratio,
        parent[index - 1][1] + (parent[index][1] - parent[index - 1][1]) * ratio,
      ];
    }
    return parent.at(-1);
  }

  const children = [];
  let sharedStart = parent[0];
  for (const [runIndex, run] of runs.entries()) {
    const sharedEnd = runIndex === runs.length - 1 ? parent.at(-1) : pointAtFraction(run.endFraction);
    const geometryStart = total * run.startFraction;
    const geometryEnd = total * run.endFraction;
    const coordinates = [sharedStart];
    for (let pointIndex = 1; pointIndex < parent.length - 1; pointIndex += 1) {
      if (cumulative[pointIndex] > geometryStart + MEASURE_EPSILON_METERS
        && cumulative[pointIndex] < geometryEnd - MEASURE_EPSILON_METERS) {
        coordinates.push(parent[pointIndex]);
      }
    }
    if (!sameCoordinate(coordinates.at(-1), sharedEnd)) coordinates.push(sharedEnd);
    if (coordinates.length < 2) coordinates.push(sharedEnd);
    children.push(coordinates);
    sharedStart = sharedEnd;
  }
  return children;
}

function exactInstruction(section, displayName) {
  if (section.maneuver?.type === "depart") return `Start on ${displayName}`;
  const modifier = section.maneuver?.modifier;
  if (section.maneuver?.type === "turn" && (modifier === "left" || modifier === "right")) {
    return `Turn ${modifier} onto ${displayName}`;
  }
  return `Continue on ${displayName}`;
}

function presentationForRun(run, stopped) {
  if (run.state === "exact" && run.sourceMatch === "ordered_exact" && !stopped) {
    return {
      stopped,
      matchState: "matched_ordered_source_and_exact_graph_receipt",
      colorRole: "teal",
      authority: "immutable_graph_evidence_receipt",
      proven: true,
      graphIdentified: true,
    };
  }
  const firstGap = !stopped;
  const graphIdentified = run.state === "exact";
  return {
    stopped: true,
    matchState: graphIdentified
      ? firstGap
        ? "graph_identified_unapproved_source_gap"
        : "graph_identified_after_first_source_gap"
      : firstGap
        ? "unverified_graph_gap"
        : "unverified_after_first_source_gap",
    colorRole: "unverified",
    authority: graphIdentified
      ? "exact_graph_identity_unapproved_for_ordered_source_route"
      : firstGap
        ? "unverified_graph_evidence"
        : "permanent_stop_after_source_or_graph_gap",
    proven: false,
    graphIdentified,
  };
}

function buildSectionRuns(roadCoordinates, sections, receipt) {
  const receiptRunsBySection = new Map();
  for (const run of receipt.runs) {
    const runs = receiptRunsBySection.get(run.sectionOrder) || [];
    runs.push(run);
    receiptRunsBySection.set(run.sectionOrder, runs);
  }

  const output = [];
  let stopped = false;
  let firstUnresolvedRunOrder = null;
  let firstNonOrderedRunOrder = null;

  for (const section of sections) {
    if (section.distanceMeters === 0) {
      output.push({
        ...section,
        sectionOrder: output.length + 1,
        parentSectionOrder: section.sectionOrder,
        graphEvidenceRunOrder: null,
        lineStyle: "none",
        colorRole: "none",
        authority: "osrm_structural_step",
      });
      continue;
    }

    const runs = receiptRunsBySection.get(section.sectionOrder);
    const distanceMeters = allocateProportionally(section.distanceMeters, runs);
    const distanceMiles = allocateProportionally(section.distanceMiles, runs);
    const durationSeconds = allocateProportionally(section.durationSeconds, runs);
    const childCoordinates = sectionChildCoordinates(roadCoordinates, section, runs);

    for (const [index, run] of runs.entries()) {
      const presentation = presentationForRun(run, stopped);
      // A parent OSRM maneuver belongs only to its first graph child. Further
      // metadata splits on that same road continue from the shared endpoint;
      // repeating the parent's turn would create false step-by-step wording.
      const baseInstruction = index === 0
        ? exactInstruction(section, run.displayName)
        : `Continue on ${run.displayName}`;
      if (run.state === "unresolved" && firstUnresolvedRunOrder === null) {
        firstUnresolvedRunOrder = run.runOrder;
      }
      if (presentation.stopped && !stopped && firstNonOrderedRunOrder === null) {
        firstNonOrderedRunOrder = run.runOrder;
      }
      stopped = presentation.stopped;

      const sectionRun = {
        ...section,
        sectionOrder: output.length + 1,
        parentSectionOrder: section.sectionOrder,
        graphEvidenceRunOrder: run.runOrder,
        coordinateStartIndex: section.coordinateStartIndex,
        coordinateEndIndex: section.coordinateEndIndex,
        coordinates: childCoordinates[index],
        startMeasureMeters: run.startMeasureMeters,
        endMeasureMeters: run.endMeasureMeters,
        startFraction: run.startFraction,
        endFraction: run.endFraction,
        distanceMeters: distanceMeters[index],
        matchState: presentation.matchState,
        lineStyle: "solid",
        colorRole: presentation.colorRole,
        authority: presentation.authority,
        sourceStepOrder: presentation.graphIdentified && run.sourceMatch === "ordered_exact"
          ? run.matchedSourceStepOrder
          : null,
        sourceRoadId: presentation.graphIdentified ? (run.roadId ?? null) : null,
        sourceIdentityId: presentation.graphIdentified ? run.identityId : null,
        sourceDisplayRoad: presentation.graphIdentified ? run.displayName : null,
        routeSystem: presentation.graphIdentified ? run.routeSystem : null,
        routeNumber: presentation.graphIdentified ? run.routeNumber : null,
        county: presentation.graphIdentified ? run.county : null,
        sourceMatch: presentation.graphIdentified ? run.sourceMatch : null,
        matchedSourceRoadId: presentation.graphIdentified && run.sourceMatch === "ordered_exact"
          ? run.matchedSourceRoadId
          : null,
        instruction: presentation.proven
          ? baseInstruction
          : presentation.graphIdentified
            ? `${baseInstruction} · graph-identified / unapproved`
            : "Continue on unverified route",
        graphEvidence: { ...run },
      };
      if (distanceMiles) sectionRun.distanceMiles = distanceMiles[index];
      if (durationSeconds) sectionRun.durationSeconds = durationSeconds[index];
      output.push(sectionRun);
    }
  }

  return { sectionRuns: output, firstUnresolvedRunOrder, firstNonOrderedRunOrder };
}

export function applyAscentPadGraphEvidence({
  padId,
  recordRevision,
  routedIdentitySha256,
  roadCoordinates,
  sections,
  orderedSourceRoads,
  receipt,
}) {
  const context = { padId, recordRevision, routedIdentitySha256, sections };
  graphEvidenceKeyValue({
    padId,
    recordRevision,
    routedIdentitySha256,
    routeCoordinateSha256: "0".repeat(64),
  });
  validateCoordinates(roadCoordinates);
  const routeCoordinateSha256 = computeRouteCoordinateSha256(roadCoordinates);
  const sectionByOrder = validateSections(sections, roadCoordinates);
  const orderedSourceByStep = validateOrderedSourceRoads(orderedSourceRoads);
  validateReceipt(receipt, context, routeCoordinateSha256, sectionByOrder, orderedSourceByStep);

  const { sectionRuns, firstUnresolvedRunOrder, firstNonOrderedRunOrder } = buildSectionRuns(
    roadCoordinates,
    sections,
    receipt,
  );
  return {
    roadCoordinates,
    baseSections: sections,
    sectionRuns,
    receiptKeySha256: receipt.receiptKeySha256,
    receiptSha256: receipt.receiptSha256,
    routeCoordinateSha256,
    firstUnresolvedRunOrder,
    firstNonOrderedRunOrder,
    solidStopsPermanentlyAtFirstMismatch: true,
  };
}
