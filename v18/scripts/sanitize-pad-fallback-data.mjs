import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const v18Root = resolve(dirname(scriptPath), "..");
const projectRoot = resolve(v18Root, "..");

export const rawFallbackPath = join(projectRoot, "pad-fallback-data.json");
export const sanitizedFallbackPath = join(v18Root, "src", "data", "pad-fallback-data.json");

const expectedRawCounts = Object.freeze({
  locations: 1264,
  pads: 1219,
  disposals: 45,
});

export const expectedCounts = Object.freeze({
  locations: 1262,
  pads: 1217,
  disposals: 45,
  mapped: 951,
});

const nonphysicalTombstoneContracts = Object.freeze({
  // V17.3.12 removed these workbook/search headings from public.pads. Hash the
  // complete raw objects so no changed source row can remain silently hidden.
  "expand--expand-in-west-virginia": Object.freeze({
    recordNumber: 1034,
    sourceSha256: "fa92cc1812bf3ab33873378abb7919bef08b56d8e1397f5c55b060fb6db055ee",
  }),
  "expand--west-virginia": Object.freeze({
    recordNumber: 1106,
    sourceSha256: "ba934af59ea0c2422e23d66bb70fe5909a535f01869bebea6c78729a09b30c7c",
  }),
});

const expectedSourceCoordinateCounts = Object.freeze({
  valid: 951,
  missing: 259,
  partial: 54,
});

const expectedQuarantineSummary = Object.freeze({
  issueCount: 157,
  recordCount: 153,
  fieldCounts: {
    county: 131,
    propertyNumbers: 7,
    township: 16,
    wellNames: 3,
  },
  manifestSha256: "383701dbefa43bbbdca396b30ca43fb47b988e372612b2fd50d84dcecf8151f3",
});

export const sanitizedRowKeys = Object.freeze([
  "ordinal",
  "legacyId",
  "recordType",
  "company",
  "padName",
  "state",
  "county",
  "township",
  "address",
  "latitude",
  "longitude",
  "aliases",
  "wellNames",
  "apis",
  "propertyNumbers",
  "structured_road_sequence",
  "verificationStatus",
  "operatingStatus",
]);

const metadataKeys = Object.freeze(["contentSha256"]);
const topLevelKeys = Object.freeze(["metadata", "pads"]);
const listKeys = Object.freeze(["aliases", "wellNames", "apis", "propertyNumbers"]);
const textKeys = Object.freeze([
  "legacyId",
  "recordType",
  "company",
  "padName",
  "state",
  "county",
  "township",
  "address",
  "structured_road_sequence",
  "verificationStatus",
  "operatingStatus",
]);

// These source-only fields must never be copied into the browser artifact.
export const forbiddenKeys = Object.freeze([
  "Number_of_Road_Steps",
  "alternateLocations",
  "auditSource",
  "auditVerified",
  "importSource",
  "importStatus",
  "lastUpdatedBy",
  "lastUpdatedDate",
  "listOnly",
  "researchDate",
  "researchMethod",
  "researchNote",
  "researchNotes",
  "researchSources",
  "researchStatus",
  "roadSequenceFinalCleanupDate",
  "roadSequenceReviewedDate",
  "roadSequenceStatus",
  "sourceWorkbookRows",
  "writtenDirections",
  "written_directions",
]);

const forbiddenKeySet = new Set(forbiddenKeys);
const coordinateServiceArea = Object.freeze({
  latitudeMin: 37,
  latitudeMax: 43,
  longitudeMin: -84,
  longitudeMax: -74,
});
const publicStates = new Set(["Ohio", "Pennsylvania", "West Virginia"]);
const publicLabelPattern = /^[\p{L}\p{N} .,'’&()/#-]+$/u;
const publicIdentifierPattern = /^[\p{L}\p{N} .,'’&()/#_—-]+$/u;
const legacyIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*$/;
const placeholderPattern = /^(?:unknown|idk|n\/?a|none|null|undefined|[?.]+|y{3,})$/i;
const directionProsePattern = /\b(?:approximately|continue|head|left|miles?|onto|outside|right|road|turn)\b/i;
const identifierAnnotationPattern = /\b(?:correct(?:ed)?|note|updated?|verified)\b/i;
const unsafeControlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const unsafeSingleLineControlPattern = /[\u0000-\u001f\u007f]/;
const apiPattern = /^\d{2}-\d{3}-(?:\d-\d{4}-\d{2}-\d{2}|\d{5})$/;

const textPolicies = Object.freeze({
  company: { minLength: 1, maxLength: 64, pattern: publicLabelPattern },
  padName: { minLength: 1, maxLength: 128, pattern: publicLabelPattern },
  county: { minLength: 3, maxLength: 64, pattern: publicLabelPattern },
  township: { minLength: 3, maxLength: 64, pattern: publicLabelPattern },
  address: { minLength: 3, maxLength: 256 },
  structured_road_sequence: { minLength: 3, maxLength: 512 },
  verificationStatus: { minLength: 3, maxLength: 128 },
  operatingStatus: { minLength: 3, maxLength: 128 },
});

const listPolicies = Object.freeze({
  wellNames: {
    maxItems: 32,
    maxLength: 64,
    rejectAnnotation: true,
    rejectDirectionProse: true,
    pattern: publicIdentifierPattern,
  },
  apis: { maxItems: 32, maxLength: 32, pattern: apiPattern },
  propertyNumbers: {
    maxItems: 32,
    maxLength: 64,
    rejectAnnotation: true,
    rejectDirectionProse: true,
    pattern: publicIdentifierPattern,
  },
});

function fail(message) {
  throw new Error(`Sanitized fallback audit failed: ${message}`);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function unique(values) {
  return [...new Set(values)];
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function valueDescription(value) {
  let serialized;
  try {
    serialized = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    serialized = String(value);
  }
  serialized ??= String(value);
  return { sourceLength: serialized.length, sourceSha256: sha256(serialized) };
}

function quarantine(issues, legacyId, field, reason, value) {
  issues.push({ legacyId, field, reason, ...valueDescription(value) });
}

function textFailure(value, policy) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return "invalid_type";
  const cleaned = text(value);
  if (!cleaned) return null;
  if (cleaned.length < policy.minLength) return "too_short";
  if (cleaned.length > policy.maxLength) return "too_long";
  const controlPattern = policy.allowMultiline ? unsafeControlPattern : unsafeSingleLineControlPattern;
  if (controlPattern.test(cleaned)) return "unsafe_control";
  if (placeholderPattern.test(cleaned)) return "placeholder";
  if (policy.rejectAnnotation && identifierAnnotationPattern.test(cleaned)) return "annotation";
  if (policy.pattern && !policy.pattern.test(cleaned)) return "invalid_shape";
  if (policy.rejectDirectionProse && directionProsePattern.test(cleaned)) return "direction_prose";
  return null;
}

function requiredText(value, field, legacyId) {
  const policy = textPolicies[field];
  const cleaned = text(value);
  const reason = textFailure(value, policy);
  if (!cleaned || reason) fail(`raw row ${legacyId} has unsafe required ${field}${reason ? ` (${reason})` : ""}`);
  return cleaned;
}

function optionalText(value, field, legacyId, issues) {
  const cleaned = text(value);
  if (!cleaned) return "";
  const reason = textFailure(value, textPolicies[field]);
  if (!reason) return cleaned;
  quarantine(issues, legacyId, field, reason, value);
  return "";
}

function rawList(value) {
  if (value === null || value === undefined || value === "") return [];
  return Array.isArray(value) ? value : typeof value === "string" || typeof value === "number" ? text(value).split(/\s*\|\s*/) : null;
}

function optionalList(value, field, legacyId, issues) {
  const policy = listPolicies[field];
  const entries = rawList(value);
  if (!entries) {
    quarantine(issues, legacyId, field, "invalid_type", value);
    return [];
  }
  if (entries.length > policy.maxItems) {
    quarantine(issues, legacyId, field, "too_many_items", value);
    return [];
  }

  const safe = [];
  for (const entry of entries) {
    const cleaned = text(entry);
    if (!cleaned) continue;
    const reason = textFailure(entry, { minLength: 1, ...policy });
    if (reason) quarantine(issues, legacyId, field, `item_${reason}`, entry);
    else safe.push(cleaned);
  }
  return unique(safe);
}

function isMissingCoordinate(value) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function coordinateState(latitudeRaw, longitudeRaw) {
  const latitudeMissing = isMissingCoordinate(latitudeRaw);
  const longitudeMissing = isMissingCoordinate(longitudeRaw);
  if (latitudeMissing && longitudeMissing) return "missing";
  if (latitudeMissing || longitudeMissing) return "partial";
  if ([latitudeRaw, longitudeRaw].some((value) => typeof value === "boolean" || typeof value === "object")) {
    return "malformed";
  }

  const latitude = Number(latitudeRaw);
  const longitude = Number(longitudeRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "malformed";
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return "out_of_range";
  if (latitude === 0 && longitude === 0) return "zero_origin";
  if (
    latitude < coordinateServiceArea.latitudeMin ||
    latitude > coordinateServiceArea.latitudeMax ||
    longitude < coordinateServiceArea.longitudeMin ||
    longitude > coordinateServiceArea.longitudeMax
  ) {
    return "outside_service_area";
  }
  return "valid";
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value);
  const extras = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !actual.includes(key));
  if (extras.length) fail(`${label} has extra keys: ${extras.join(", ")}`);
  if (missing.length) fail(`${label} is missing keys: ${missing.join(", ")}`);
}

function assertNoForbiddenKeys(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenKeySet.has(key)) fail(`forbidden key ${JSON.stringify(key)} at ${path}`);
    assertNoForbiddenKeys(entry, `${path}.${key}`);
  }
}

function countRecordTypes(rows) {
  return {
    pads: rows.filter((row) => row.recordType === "pad").length,
    disposals: rows.filter((row) => row.recordType === "disposal").length,
  };
}

function validateRawSource(rawSource) {
  if (!isObject(rawSource) || !Array.isArray(rawSource.pads)) fail("raw source must contain a pads array");
  const rows = rawSource.pads;
  if (rows.length !== expectedRawCounts.locations) {
    fail(`raw source location count is ${rows.length}; expected ${expectedRawCounts.locations}`);
  }

  const identities = new Set();
  const sourceCoordinateCounts = { valid: 0, missing: 0, partial: 0 };
  const typeCounts = { pads: 0, disposals: 0 };

  rows.forEach((row, index) => {
    if (!isObject(row)) fail(`raw row ${index + 1} must be an object`);
    const ordinal = Number(row._recordNumber);
    const legacyId = text(row._id);
    const recordType = text(row.recordType).toLowerCase();
    if (ordinal !== index + 1) fail(`raw row ${index + 1} has non-contiguous ordinal ${String(row._recordNumber)}`);
    if (typeof row._id !== "string" || !legacyIdPattern.test(legacyId) || legacyId.length > 128) {
      fail(`raw row ${index + 1} has an unsafe identity`);
    }
    if (identities.has(legacyId)) fail(`raw source has duplicate identity ${legacyId}`);
    identities.add(legacyId);
    requiredText(row.company, "company", legacyId);
    requiredText(row.padName, "padName", legacyId);
    if (typeof row.state !== "string" || !publicStates.has(text(row.state))) {
      fail(`raw row ${legacyId} has an unexpected state`);
    }
    if (recordType === "pad") typeCounts.pads += 1;
    else if (recordType === "disposal") typeCounts.disposals += 1;
    else fail(`raw row ${legacyId} has unsupported record type ${JSON.stringify(recordType)}`);

    const state = coordinateState(row.latitude, row.longitude);
    if (!(state in sourceCoordinateCounts)) fail(`raw row ${legacyId} has unsafe coordinates (${state})`);
    sourceCoordinateCounts[state] += 1;
  });

  if (typeCounts.pads !== expectedRawCounts.pads || typeCounts.disposals !== expectedRawCounts.disposals) {
    fail(`raw type counts are ${JSON.stringify(typeCounts)}; expected ${JSON.stringify(expectedRawCounts)}`);
  }
  if (!isDeepStrictEqual(sourceCoordinateCounts, expectedSourceCoordinateCounts)) {
    fail(
      `raw coordinate populations are ${JSON.stringify(sourceCoordinateCounts)}; expected ${JSON.stringify(expectedSourceCoordinateCounts)}`,
    );
  }
}

function validatedNonphysicalTombstoneIds(rows) {
  const tombstoneIds = new Set();
  for (const [legacyId, contract] of Object.entries(nonphysicalTombstoneContracts)) {
    const matches = rows.filter((row) => isObject(row) && row._id === legacyId);
    if (matches.length !== 1) {
      fail(`nonphysical tombstone ${legacyId} must appear exactly once; found ${matches.length}`);
    }
    const row = matches[0];
    if (
      row._recordNumber !== contract.recordNumber ||
      sha256(JSON.stringify(row)) !== contract.sourceSha256
    ) {
      fail(`nonphysical tombstone ${legacyId} raw shape changed; review it before changing the exclusion`);
    }
    tombstoneIds.add(legacyId);
  }
  return tombstoneIds;
}

function sanitizeRow(row, issues) {
  const coordinate = coordinateState(row.latitude, row.longitude);
  const hasSafeCoordinate = coordinate === "valid";
  const legacyId = text(row._id);
  return {
    ordinal: Number(row._recordNumber),
    legacyId,
    recordType: text(row.recordType).toLowerCase(),
    company: requiredText(row.company, "company", legacyId),
    padName: requiredText(row.padName, "padName", legacyId),
    state: text(row.state),
    county: optionalText(row.county, "county", legacyId, issues),
    township: optionalText(row.township, "township", legacyId, issues),
    address: optionalText(row.address, "address", legacyId, issues),
    latitude: hasSafeCoordinate ? Number(row.latitude) : null,
    longitude: hasSafeCoordinate ? Number(row.longitude) : null,
    aliases: [legacyId],
    wellNames: optionalList(row.wellName, "wellNames", legacyId, issues),
    apis: optionalList(row.api, "apis", legacyId, issues),
    propertyNumbers: optionalList(row.property, "propertyNumbers", legacyId, issues),
    structured_road_sequence: optionalText(
      row.Structured_Road_Sequence,
      "structured_road_sequence",
      legacyId,
      issues,
    ),
    verificationStatus: optionalText(row.verificationStatus, "verificationStatus", legacyId, issues),
    operatingStatus: optionalText(row.operatingStatus, "operatingStatus", legacyId, issues),
  };
}

function contentHash(rows) {
  return sha256(JSON.stringify(rows));
}

function summarizeQuarantine(issues) {
  const fieldCounts = {};
  for (const issue of issues) fieldCounts[issue.field] = (fieldCounts[issue.field] || 0) + 1;
  return {
    issueCount: issues.length,
    recordCount: new Set(issues.map((issue) => issue.legacyId)).size,
    fieldCounts: Object.fromEntries(Object.entries(fieldCounts).sort(([left], [right]) => left.localeCompare(right))),
    manifestSha256: sha256(JSON.stringify(issues)),
  };
}

function projectSanitizedFallback(rawSource) {
  validateRawSource(rawSource);
  const tombstoneIds = validatedNonphysicalTombstoneIds(rawSource.pads);
  const issues = [];
  const pads = rawSource.pads
    .map((row) => sanitizeRow(row, issues))
    .filter((row) => !tombstoneIds.has(row.legacyId))
    .map((row, index) => ({ ...row, ordinal: index + 1 }));
  const artifact = {
    metadata: { contentSha256: contentHash(pads) },
    pads,
  };
  const summary = summarizeQuarantine(issues);
  if (!isDeepStrictEqual(summary, expectedQuarantineSummary)) {
    fail(
      `optional-field quarantine manifest changed from ${JSON.stringify(expectedQuarantineSummary)} to ` +
        `${JSON.stringify(summary)}; review the source changes before updating the baseline`,
    );
  }
  return { artifact, issues, summary };
}

export function getSanitizationReport(rawSource) {
  const { issues, summary } = projectSanitizedFallback(rawSource);
  return { ...summary, issues };
}

export function buildSanitizedFallback(rawSource) {
  return projectSanitizedFallback(rawSource).artifact;
}

function auditSanitizedRows(rows) {
  if (!Array.isArray(rows)) fail("pads must be an array");
  if (rows.length !== expectedCounts.locations) {
    fail(`sanitized location count is ${rows.length}; expected ${expectedCounts.locations}`);
  }

  const identities = new Set();
  let mapped = 0;
  rows.forEach((row, index) => {
    exactKeys(row, sanitizedRowKeys, `pads[${index}]`);
    if (!Number.isInteger(row.ordinal) || row.ordinal !== index + 1) {
      fail(`pads[${index}] has non-contiguous ordinal ${String(row.ordinal)}`);
    }
    for (const key of textKeys) {
      if (typeof row[key] !== "string") fail(`pads[${index}].${key} must be a string`);
    }
    if (!row.legacyId || !row.company || !row.padName) fail(`pads[${index}] has an empty public identity field`);
    if (!legacyIdPattern.test(row.legacyId) || row.legacyId.length > 128) fail(`pads[${index}].legacyId is unsafe`);
    for (const key of ["company", "padName"]) {
      const reason = textFailure(row[key], textPolicies[key]);
      if (reason) fail(`pads[${index}].${key} is unsafe (${reason})`);
    }
    if (!publicStates.has(row.state)) fail(`pads[${index}].state is unsupported`);
    for (const key of [
      "county",
      "township",
      "address",
      "structured_road_sequence",
      "verificationStatus",
      "operatingStatus",
    ]) {
      if (!row[key]) continue;
      const reason = textFailure(row[key], textPolicies[key]);
      if (reason) fail(`pads[${index}].${key} is unsafe (${reason})`);
    }
    if (identities.has(row.legacyId)) fail(`sanitized fallback has duplicate identity ${row.legacyId}`);
    identities.add(row.legacyId);
    if (!new Set(["pad", "disposal"]).has(row.recordType)) {
      fail(`pads[${index}].recordType is unsupported`);
    }
    for (const key of listKeys) {
      if (!Array.isArray(row[key]) || row[key].some((entry) => typeof entry !== "string" || !entry.trim())) {
        fail(`pads[${index}].${key} must contain only non-empty strings`);
      }
      if (new Set(row[key]).size !== row[key].length) fail(`pads[${index}].${key} contains duplicates`);
    }
    if (!isDeepStrictEqual(row.aliases, [row.legacyId])) {
      fail(`pads[${index}].aliases must contain only its public legacy identity`);
    }
    for (const key of ["wellNames", "apis", "propertyNumbers"]) {
      const policy = listPolicies[key];
      if (row[key].length > policy.maxItems) fail(`pads[${index}].${key} contains too many items`);
      for (const entry of row[key]) {
        const reason = textFailure(entry, { minLength: 1, ...policy });
        if (reason) fail(`pads[${index}].${key} contains an unsafe item (${reason})`);
      }
    }
    if (row.latitude !== null && typeof row.latitude !== "number") fail(`pads[${index}].latitude must be a number or null`);
    if (row.longitude !== null && typeof row.longitude !== "number") fail(`pads[${index}].longitude must be a number or null`);
    const state = coordinateState(row.latitude, row.longitude);
    if (state === "valid") mapped += 1;
    else if (state !== "missing") fail(`pads[${index}] has unsafe sanitized coordinates (${state})`);
  });

  const typeCounts = countRecordTypes(rows);
  if (typeCounts.pads !== expectedCounts.pads || typeCounts.disposals !== expectedCounts.disposals) {
    fail(`sanitized type counts are ${JSON.stringify(typeCounts)}; expected ${JSON.stringify(expectedCounts)}`);
  }
  if (mapped !== expectedCounts.mapped) fail(`sanitized mapped count is ${mapped}; expected ${expectedCounts.mapped}`);
}

export function auditSanitizedFallback(artifact, rawSource) {
  assertNoForbiddenKeys(artifact);
  exactKeys(artifact, topLevelKeys, "root");
  exactKeys(artifact.metadata, metadataKeys, "metadata");
  if (!/^[a-f0-9]{64}$/.test(artifact.metadata.contentSha256)) fail("metadata.contentSha256 is not SHA-256 hex");
  auditSanitizedRows(artifact.pads);
  const actualHash = contentHash(artifact.pads);
  if (artifact.metadata.contentSha256 !== actualHash) fail("metadata.contentSha256 does not match the sanitized rows");

  const expected = buildSanitizedFallback(rawSource);
  if (!isDeepStrictEqual(artifact, expected)) fail("artifact does not match the deterministic allowlisted projection of its source");
  return { ...expectedCounts, contentSha256: actualHash };
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const [mode = "--check", ...extraArguments] = process.argv.slice(2);
  if (extraArguments.length || !new Set(["--check", "--report", "--write"]).has(mode)) {
    throw new Error("Usage: node v18/scripts/sanitize-pad-fallback-data.mjs [--check|--report|--write]");
  }

  const rawSource = await readJson(rawFallbackPath);
  const projection = projectSanitizedFallback(rawSource);
  const expected = projection.artifact;
  const expectedText = serialize(expected);

  if (mode === "--write") {
    auditSanitizedFallback(expected, rawSource);
    await writeFile(sanitizedFallbackPath, expectedText, "utf8");
  } else {
    const actualText = await readFile(sanitizedFallbackPath, "utf8");
    const actual = JSON.parse(actualText);
    auditSanitizedFallback(actual, rawSource);
    if (actualText !== expectedText) fail("artifact bytes are not in deterministic generated form; run with --write");
  }

  if (mode === "--report") {
    console.log(JSON.stringify({ ...projection.summary, issues: projection.issues }, null, 2));
    return;
  }

  const verb = mode === "--write" ? "wrote" : "verified";
  console.log(
    `${verb} ${sanitizedFallbackPath}: ${expectedCounts.locations} locations (${expectedCounts.pads} pads, ` +
      `${expectedCounts.disposals} disposals), ${expectedCounts.mapped} safe legacy coordinate pairs, sha256 ` +
      `${expected.metadata.contentSha256}; quarantined ${projection.summary.issueCount} optional values across ` +
      `${projection.summary.recordCount} records`,
  );
}

if (resolve(process.argv[1] || "") === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
