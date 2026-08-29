const EXPECTED_EOG_PAD_COUNT = 301;
const EOG_SOURCE_SCOPE = "eog-ohio-last-exact-highway-to-pad-source-issue200";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const digestPattern = /^[0-9a-f]{64}$/u;
const allowedMatchStates = new Set([
  "exact_master",
  "needs_review",
  "private_segment",
  "route_note",
  "unmatched",
  "held",
]);
const exactHighwayKinds = new Set(["interstate", "us_route", "state_route"]);
const forbiddenIdentityMethods = /(?:fuzzy|nearest[_ -]?road|name[_ -]?only|distance[_ -]?only)/iu;

function fail(message) {
  throw new Error(`EOG approach source contract failed: ${message}`);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function nonemptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizedCompany(value) {
  return String(value || "").trim().toUpperCase();
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

function nullableCoordinate(value) {
  return value === null || coordinate(value);
}

function validPointGeometry(value) {
  if (value === null) return true;
  const geometry = object(value);
  if (geometry.type === "Point") return coordinate(geometry.coordinates);
  if (geometry.type === "MultiPoint") {
    return Array.isArray(geometry.coordinates)
      && geometry.coordinates.length > 0
      && geometry.coordinates.every(coordinate);
  }
  return false;
}

function validateExactStep(step, label) {
  if (!uuidPattern.test(String(step.roadId || ""))) fail(`${label} exact step lacks a UUID roadId`);
  if (!nonemptyText(step.canonicalName)) fail(`${label} exact step lacks canonicalName`);
  if (!Array.isArray(step.aliases) || step.aliases.some((alias) => !nonemptyText(alias))) {
    fail(`${label} exact step aliases are invalid`);
  }
  if (forbiddenIdentityMethods.test(String(step.matchMethod || ""))) {
    fail(`${label} exact step uses forbidden identity method ${step.matchMethod}`);
  }
}

function validateRoutePrep(record) {
  const prep = record.routePrep;
  if (prep === null) return {
    hasRoutePrep: false,
    exactHighway: false,
    exactIntersectionStart: false,
    candidateHighwayStart: false,
  };
  if (!prep || typeof prep !== "object" || Array.isArray(prep)) {
    fail(`${record.padName} routePrep must be an object or null`);
  }
  if (prep.pad_id !== record.padId) fail(`${record.padName} routePrep pad binding drifted`);
  if (!(prep.route_prep_id === null || uuidPattern.test(String(prep.route_prep_id)))) {
    fail(`${record.padName} routePrep ID is invalid`);
  }
  if (!(prep.steps === null || Array.isArray(prep.steps))) fail(`${record.padName} routePrep steps are invalid`);

  const orders = new Set();
  for (const [index, rawStep] of (prep.steps || []).entries()) {
    const step = object(rawStep);
    const order = Number(step.stepOrder);
    const label = `${record.padName} step ${index + 1}`;
    if (!Number.isInteger(order) || order < 1 || orders.has(order)) fail(`${label} has an invalid or duplicate order`);
    orders.add(order);
    if (!allowedMatchStates.has(String(step.matchStatus || ""))) fail(`${label} has unsupported matchStatus`);
    if (step.matchStatus === "exact_master") validateExactStep(step, label);
    if (step.matchStatus !== "exact_master" && step.roadId !== null && step.roadId !== undefined) {
      fail(`${label} carries a roadId without exact_master authority`);
    }
    if (forbiddenIdentityMethods.test(String(step.matchMethod || ""))) {
      fail(`${label} uses forbidden identity method ${step.matchMethod}`);
    }
  }

  const highway = prep.highway;
  if (highway === null) {
    if (prep.nearest_highway_point !== null || prep.point_intersections !== null) {
      fail(`${record.padName} has start geometry without an exact highway`);
    }
    return {
      hasRoutePrep: true,
      exactHighway: false,
      exactIntersectionStart: false,
      candidateHighwayStart: false,
    };
  }
  const highwayObject = object(highway);
  if (highwayObject.matchStatus !== "exact_master"
    || !exactHighwayKinds.has(String(highwayObject.stepKind || ""))
    || !Number.isInteger(Number(highwayObject.stepOrder))
    || Number(highwayObject.stepOrder) < 1) {
    fail(`${record.padName} highway is not an exact Interstate/U.S./state-road step`);
  }
  validateExactStep(highwayObject, `${record.padName} highway`);
  if (highwayObject.hasGeometry !== true || highwayObject.geometryStatus !== "official_centerline_loaded") {
    if (prep.nearest_highway_point !== null || prep.point_intersections !== null) {
      fail(`${record.padName} has candidate start geometry without loaded exact highway geometry`);
    }
    return {
      hasRoutePrep: true,
      exactHighway: true,
      exactIntersectionStart: false,
      candidateHighwayStart: false,
    };
  }

  if (!validPointGeometry(prep.point_intersections) || !validPointGeometry(prep.nearest_highway_point)) {
    fail(`${record.padName} highway start geometry is malformed`);
  }
  const nextStep = prep.next_step === null ? null : object(prep.next_step);
  const hasExactIntersections = prep.point_intersections !== null;
  if (hasExactIntersections) {
    if (!nextStep
      || nextStep.matchStatus !== "exact_master"
      || !uuidPattern.test(String(nextStep.roadId || ""))
      || Number(nextStep.stepOrder) !== Number(highwayObject.stepOrder) + 1
      || nextStep.hasGeometry !== true
      || nextStep.geometryStatus !== "official_centerline_loaded") {
      fail(`${record.padName} exact intersection start lacks an exact loaded next road`);
    }
    validateExactStep(nextStep, `${record.padName} next step`);
  }
  const hasCandidate = prep.nearest_highway_point !== null;
  if (hasCandidate && prep.highway.roadId !== highwayObject.roadId) {
    fail(`${record.padName} candidate point is not anchored to its exact highway roadId`);
  }
  return {
    hasRoutePrep: true,
    exactHighway: true,
    exactIntersectionStart: hasExactIntersections,
    candidateHighwayStart: !hasExactIntersections && hasCandidate,
  };
}

function validateEogApproachSource(fixture) {
  const value = object(fixture);
  const rules = object(value.rules);
  const baseline = object(value.baseline);
  if (value.schemaVersion !== 1
    || value.snapshotId !== "eog-ohio-approach-source-issue200"
    || value.scope !== EOG_SOURCE_SCOPE
    || !uuidPattern.test(String(value.directorySnapshotId || ""))
    || !/^[1-9][0-9]*$/u.test(String(value.sourceRevision || ""))
    || !digestPattern.test(String(value.directoryContentSha256 || ""))
    || rules.primaryRouteOnly !== true
    || rules.exactHighwayStepRequiredForRouting !== true
    || rules.exactMasterRoadIdsOnly !== true
    || rules.noFuzzyNearestOrNameOnlyRoadIdentityMatching !== true
    || rules.nearestHighwayCoordinateIsCandidateOnly !== true
    || rules.firstMismatchStopsTealPermanently !== true
    || rules.gpsTetherIsUnapprovedAndExcludedFromMileage !== true
    || rules.productionWrites !== 0
    || baseline.productionPadCount !== EXPECTED_EOG_PAD_COUNT
    || baseline.savedGpsCount !== 214
    || baseline.structuredSequenceCount !== 286
    || baseline.writtenDirectionsCount !== 296
    || !Array.isArray(value.records)
    || value.records.length !== EXPECTED_EOG_PAD_COUNT) {
    fail("header or exact 301-pad scope is invalid");
  }

  const ids = new Set();
  const legacyIds = new Set();
  let exactDestinationCount = 0;
  let routePrepCount = 0;
  let exactHighwayCount = 0;
  let exactIntersectionEligibleCount = 0;
  let candidateHighwayEligibleCount = 0;
  let pinOnlyInputCount = 0;

  for (const [index, rawRecord] of value.records.entries()) {
    const record = object(rawRecord);
    const label = record.padName || record.padId || `record ${index + 1}`;
    if (!uuidPattern.test(String(record.padId || ""))
      || record.canonicalId !== record.padId
      || ids.has(record.padId)
      || !nonemptyText(record.legacyId)
      || !String(record.legacyId).startsWith("eog--")
      || legacyIds.has(record.legacyId)
      || !/^[1-9][0-9]*$/u.test(String(record.recordRevision || ""))
      || !nonemptyText(record.padName)
      || normalizedCompany(record.company) !== "EOG"
      || record.state !== "Ohio"
      || typeof record.structuredRoadSequence !== "string") {
      fail(`${label} has an invalid exact directory binding`);
    }
    ids.add(record.padId);
    legacyIds.add(record.legacyId);

    if (!nullableCoordinate(record.destination) || !nullableCoordinate(record.directoryCoordinate)) {
      fail(`${label} has an invalid Ohio coordinate`);
    }
    const hasDestination = coordinate(record.destination);
    if (hasDestination) {
      if (!nonemptyText(record.destinationGpsSource) || !nonemptyText(record.directoryCoordinateRole)) {
        fail(`${label} destination lacks explicit source provenance`);
      }
      exactDestinationCount += 1;
    } else if (record.destinationGpsSource !== null || record.directoryCoordinateRole !== null) {
      fail(`${label} has destination provenance without a destination`);
    }

    const route = validateRoutePrep(record);
    if (route.hasRoutePrep) routePrepCount += 1;
    if (route.exactHighway) exactHighwayCount += 1;
    if (route.exactIntersectionStart) exactIntersectionEligibleCount += 1;
    if (route.candidateHighwayStart) candidateHighwayEligibleCount += 1;
    if (!hasDestination || !nonemptyText(record.structuredRoadSequence) || !route.exactHighway
      || (!route.exactIntersectionStart && !route.candidateHighwayStart)) pinOnlyInputCount += 1;
  }

  return {
    sourcePadCount: value.records.length,
    exactDestinationCount,
    routePrepCount,
    exactHighwayCount,
    exactIntersectionEligibleCount,
    candidateHighwayEligibleCount,
    pinOnlyInputCount,
    productionWrites: 0,
  };
}

export {
  EOG_SOURCE_SCOPE,
  EXPECTED_EOG_PAD_COUNT,
  validateEogApproachSource,
};
