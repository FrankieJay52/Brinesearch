#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { parseSavedDirectionReference } from "../src/data/savedDirectionReference.ts";

export const ASCENT_OHIO_COUNTIES = Object.freeze([
  "Belmont",
  "Guernsey",
  "Harrison",
  "Jefferson",
  "Monroe",
  "Noble",
]);

export const CLASSIFICATIONS = Object.freeze([
  "EXACT_SOURCE_PRESERVED",
  "SOURCE_PRESENT_PREP_MISSING",
  "SOURCE_STEP_DROPPED",
  "PREP_STEP_NOT_IN_SAVED_SOURCE",
  "ROAD_IDENTITY_PENDING",
  "GENERIC_OR_AMBIGUOUS",
  "PRIVATE_ACCESS_PENDING",
  "SOURCE_ONLY_UNSTRUCTURED",
]);

const FORBIDDEN_MATCH_METHODS = new Set([
  "NAME_ONLY",
  "FUZZY_NAME",
  "NEAREST_ROAD",
  "SPATIAL_NEAREST",
  "NEAREST_POINT",
  "ROUTE_NUMBER_ONLY",
  "CLOSEST_ANCHOR",
  "SEMANTIC_SIMILARITY",
]);

// Exact status is not sufficient by itself. These are the explicit, currently
// stored exact methods observed in the six-county source contract. A new or
// blank method stays unresolved until it is reviewed and added deliberately.
const PROVEN_EXACT_MATCH_METHODS = new Set([
  "EXACT_ROAD_MANAGER_NAME_OR_ALIAS",
  "EXPLICIT_HIGHWAY_MASTER_RECORD",
  "ISSUE70_EXACT_CR12_IDENTITY_SPLIT",
  "ISSUE97_EXACT_SOURCE_BOUNDARY_CONTINUATION",
  "ISSUE97_OWNER_REVIEWED_EXACT_SOURCE_IDENTITY",
  "OFFICIAL_LBRS_EXACT_CATALOG_GAP_ISSUE70",
  "OFFICIAL_LBRS_SOURCE_CONFLICT_CORRECTION_ISSUE70",
  "OFFICIAL_ODOT_CENTERLINE",
  "OFFICIAL_ODOT_EXACT_NAME_OR_ROUTE_NUMBER",
  "OFFICIAL_ODOT_EXACT_NAME_SPATIAL_CONTEXT",
  "OFFICIAL_ODOT_EXACT_SPACING_ALIAS",
  "OFFICIAL_ODOT_EXACT_SUFFIX_ISSUE70",
  "OFFICIAL_ODOT_ISSUE70_STRICT_CONTEXT",
  "OFFICIAL_ODOT_ISSUE70_UNIQUE_EXACT",
  "ROAD_MANAGER_EXACT_CURRENT_ALIAS_ISSUE70",
  "ROAD_MANAGER_EXACT_EXISTING_ALIAS_ISSUE70",
  "SAVED_CLEAR_EXPLICIT_ALIAS_ISSUE70",
  "V17312_EVIDENCE_BACKED_GENERIC_ROUTE_RESOLUTION",
]);

// This query is intentionally export-only. It opens a read-only transaction,
// selects the exact original six-county Ascent scope, and rolls back. The audit
// never contains a database mutation or a production credential.
export const READ_ONLY_EXPORT_SQL = String.raw`BEGIN READ ONLY;
SELECT jsonb_build_object(
  'pads',
  coalesce(jsonb_agg(row_to_json(source_row) ORDER BY source_row.county, source_row.pad_name, source_row.pad_id), '[]'::jsonb)
)
FROM (
  SELECT
    p.id::text AS pad_id,
    p.legacy_id,
    p.pad_name,
    p.company,
    p.state,
    p.county,
    p.written_directions,
    p.directions_clear,
    p.structured_road_sequence,
    prep.active_primary_prep_count,
    prep.active_primary_prep
  FROM public.pads p
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS active_primary_prep_count,
      (array_agg(jsonb_build_object(
        'id', route.id::text,
        'source_sequence', route.source_sequence,
        'steps', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'step_order', step.step_order,
            'raw_text', step.raw_text,
            'normalized_text', step.normalized_text,
            'step_kind', step.step_kind,
            'road_id', step.road_id::text,
            'match_status', step.match_status,
            'match_method', step.match_method,
            'source_details', step.source_details
          ) ORDER BY step.step_order, step.id)
          FROM public.brinesearch_route_prep_steps step
          WHERE step.route_prep_id = route.id AND step.active
        ), '[]'::jsonb)
      ) ORDER BY route.id))[1] AS active_primary_prep
    FROM public.brinesearch_route_prep route
    WHERE route.pad_id = p.id
      AND route.active
      AND route.route_group = 'primary'
      AND route.variant_index = 1
  ) prep ON true
  WHERE upper(p.company) = 'ASCENT'
    AND upper(p.state) IN ('OH', 'OHIO')
    AND p.county = ANY (ARRAY['Belmont','Guernsey','Harrison','Jefferson','Monroe','Noble']::text[])
) source_row;
ROLLBACK;`;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Deliberately narrow normalization: Unicode form, case, and whitespace only.
// Punctuation, route numbers, suffixes, and words remain significant, so
// Maynard and Maynard Road never become equal by this audit.
export function normalizeExplicitSourceToken(value) {
  return text(value).normalize("NFKC").replace(/\s+/gu, " ").toLocaleUpperCase("en-US");
}

export function splitExplicitSequence(value) {
  const source = text(value).replace(/\\r\\n|\\n|\\r/gu, "\n");
  if (!source) return [];
  return source
    .split(/\s*(?:→|->)\s*/u)
    .map((token) => text(token))
    .filter(Boolean);
}

function exactOrderedDifferences(left, right) {
  const a = left.map(normalizeExplicitSourceToken);
  const b = right.map(normalizeExplicitSourceToken);
  const lengths = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let leftIndex = a.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = b.length - 1; rightIndex >= 0; rightIndex -= 1) {
      lengths[leftIndex][rightIndex] = a[leftIndex] === b[rightIndex]
        ? lengths[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(lengths[leftIndex + 1][rightIndex], lengths[leftIndex][rightIndex + 1]);
    }
  }
  const matchedLeft = new Set();
  const matchedRight = new Set();
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < a.length && rightIndex < b.length) {
    if (a[leftIndex] === b[rightIndex]) {
      matchedLeft.add(leftIndex);
      matchedRight.add(rightIndex);
      leftIndex += 1;
      rightIndex += 1;
    } else if (lengths[leftIndex + 1][rightIndex] >= lengths[leftIndex][rightIndex + 1]) {
      // Stable tie break: keep the right/source-of-support cursor fixed.
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }
  return {
    leftOnly: left.filter((_, index) => !matchedLeft.has(index)),
    rightOnly: right.filter((_, index) => !matchedRight.has(index)),
  };
}

function arraysExactlyMatch(left, right) {
  return left.length === right.length
    && left.every((value, index) => normalizeExplicitSourceToken(value) === normalizeExplicitSourceToken(right[index]));
}

function prepSteps(prep) {
  return Array.isArray(prep?.steps)
    ? prep.steps.slice().sort((left, right) => Number(left.step_order ?? 0) - Number(right.step_order ?? 0)
      || text(left.raw_text).localeCompare(text(right.raw_text)))
    : [];
}

function isPrivateOrLeaseStep(step) {
  const kind = normalizeExplicitSourceToken(step?.step_kind).replaceAll(" ", "_");
  if (["PRIVATE", "PRIVATE_ROAD", "PRIVATE_SEGMENT", "LEASE", "LEASE_ROAD", "ACCESS", "ACCESS_ROAD", "PAD", "GATE"].includes(kind)) return true;
  return ["LEASE ROAD", "ACCESS ROAD", "PAD", "GATE"].includes(
    normalizeExplicitSourceToken(step?.raw_text || step?.normalized_text),
  );
}

function isGenericOrAmbiguousStep(step) {
  const kind = normalizeExplicitSourceToken(step?.step_kind).replaceAll(" ", "_");
  const status = normalizeExplicitSourceToken(step?.match_status).replaceAll(" ", "_");
  return ["GENERIC", "UNKNOWN", "AMBIGUOUS", "UNRESOLVED", "NEEDS_REVIEW"].includes(kind)
    || ["AMBIGUOUS", "GENERIC", "HELD_SOURCE_CONFLICT"].includes(status);
}

function usesForbiddenMatchMethod(step) {
  return FORBIDDEN_MATCH_METHODS.has(
    normalizeExplicitSourceToken(step?.match_method).replaceAll(" ", "_"),
  );
}

function hasExactMatchStatus(step) {
  return ["EXACT", "EXACT_MASTER", "MATCHED", "VERIFIED"].includes(
    normalizeExplicitSourceToken(step?.match_status).replaceAll(" ", "_"),
  );
}

function usesUnresolvedExactMatchMethod(step) {
  if (!hasExactMatchStatus(step) || usesForbiddenMatchMethod(step)) return false;
  return !PROVEN_EXACT_MATCH_METHODS.has(
    normalizeExplicitSourceToken(step?.match_method).replaceAll(" ", "_"),
  );
}

function hasExactRoadManagerIdentity(step) {
  return Boolean(text(step?.road_id))
    && hasExactMatchStatus(step)
    && !usesUnresolvedExactMatchMethod(step)
    && !usesForbiddenMatchMethod(step)
    && !isPrivateOrLeaseStep(step)
    && !isGenericOrAmbiguousStep(step);
}

function needsOfficialIdentity(step) {
  if (isPrivateOrLeaseStep(step)) return false;
  const kind = normalizeExplicitSourceToken(step?.step_kind).replaceAll(" ", "_");
  const isPublicRoadStep = [
    "INTERSTATE", "US_HIGHWAY", "US_ROUTE", "STATE_HIGHWAY", "STATE_ROUTE",
    "COUNTY_ROAD", "TOWNSHIP_ROAD", "LOCAL_ROAD", "PUBLIC_ROAD", "HIGHWAY",
  ].includes(kind);
  return isPublicRoadStep && !hasExactRoadManagerIdentity(step);
}

function sourceStepTexts(reference) {
  return reference?.orderedSteps?.map((step) => step.instruction) ?? [];
}

function prepStepTexts(steps) {
  return steps.map((step) => step?.source_details && typeof step.source_details === "object"
    ? text(step.source_details.matched_from_saved_text)
    : "").filter(Boolean);
}

function primaryClassification({ reference, prep, sequenceExactMatch, missing, unsupported, identityPending, generic, privateSteps, forbiddenMatchMethods, unresolvedExactMatchMethods, savedSequenceConflict, reconciliationEvidencePending, contradictions, duplicatePrimary }) {
  if (!reference) return "SOURCE_ONLY_UNSTRUCTURED";
  if (!reference.roadSequenceReference && reference.orderedSteps.length === 0) return "SOURCE_ONLY_UNSTRUCTURED";
  if (!prep) return "SOURCE_PRESENT_PREP_MISSING";
  if (duplicatePrimary) return "ROAD_IDENTITY_PENDING";
  if (missing.length > 0) return "SOURCE_STEP_DROPPED";
  if (unsupported.length > 0) return "PREP_STEP_NOT_IN_SAVED_SOURCE";
  if (savedSequenceConflict) return "GENERIC_OR_AMBIGUOUS";
  if (forbiddenMatchMethods.length > 0) return "GENERIC_OR_AMBIGUOUS";
  if (unresolvedExactMatchMethods.length > 0) return "GENERIC_OR_AMBIGUOUS";
  if (generic.length > 0) return "GENERIC_OR_AMBIGUOUS";
  if (contradictions.length > 0) return "ROAD_IDENTITY_PENDING";
  if (identityPending.length > 0) return "ROAD_IDENTITY_PENDING";
  if (reconciliationEvidencePending) return "ROAD_IDENTITY_PENDING";
  if (privateSteps.length > 0) return "PRIVATE_ACCESS_PENDING";
  return sequenceExactMatch ? "EXACT_SOURCE_PRESERVED" : "ROAD_IDENTITY_PENDING";
}

export function reconcileSavedDirectionRow(input) {
  const reference = parseSavedDirectionReference({
    directionsClear: input.directions_clear,
    writtenDirections: input.written_directions,
  });
  const prep = input.active_primary_prep && typeof input.active_primary_prep === "object"
    ? input.active_primary_prep
    : null;
  const activePrimaryPrepCount = Number(input.active_primary_prep_count ?? (prep ? 1 : 0));
  const steps = prepSteps(prep);
  const clearSequence = reference?.source === "directions_clear"
    ? reference.roadSequenceReference
    : null;
  const structuredSequence = text(input.structured_road_sequence) || null;
  const savedSequenceConflict = clearSequence && structuredSequence
    && !arraysExactlyMatch(
      splitExplicitSequence(clearSequence),
      splitExplicitSequence(structuredSequence),
    )
    ? {
      directions_clear: clearSequence,
      structured_road_sequence: structuredSequence,
    }
    : null;
  const savedSequence = reference?.roadSequenceReference || structuredSequence || null;
  const prepSequence = text(prep?.source_sequence) || null;
  const savedSequenceTokens = splitExplicitSequence(savedSequence);
  const prepSequenceTokens = splitExplicitSequence(prepSequence);
  const savedInstructions = sourceStepTexts(reference);
  const prepInstructions = prepStepTexts(steps);
  const sequenceExactMatch = savedSequenceTokens.length > 0
    && arraysExactlyMatch(savedSequenceTokens, prepSequenceTokens);

  const sequenceDifferences = exactOrderedDifferences(savedSequenceTokens, prepSequenceTokens);
  // Numbered field instructions and route-prep road tokens have different
  // granularity. Compare instructions only when route prep explicitly stores
  // the original saved text it matched; raw road names are not semantic proof.
  const stepDifferences = prepInstructions.length > 0
    ? exactOrderedDifferences(savedInstructions, prepInstructions)
    : { leftOnly: [], rightOnly: [] };
  const missing = [
    ...sequenceDifferences.leftOnly.map((value) => `sequence: ${value}`),
    ...stepDifferences.leftOnly.map((value) => `step: ${value}`),
  ];
  const unsupported = [
    ...sequenceDifferences.rightOnly.map((value) => `sequence: ${value}`),
    ...stepDifferences.rightOnly.map((value) => `step: ${value}`),
  ];
  const roadIds = [...new Set(steps.filter(hasExactRoadManagerIdentity).map((step) => text(step.road_id)))].sort();
  const identityPending = steps.filter(needsOfficialIdentity).map((step) => ({
    step_order: Number(step.step_order ?? 0),
    text: text(step.raw_text) || text(step.normalized_text),
  }));
  const generic = steps.filter(isGenericOrAmbiguousStep).map((step) => ({
    step_order: Number(step.step_order ?? 0),
    text: text(step.raw_text) || text(step.normalized_text),
  }));
  const privateSteps = steps.filter(isPrivateOrLeaseStep).map((step) => ({
    step_order: Number(step.step_order ?? 0),
    text: text(step.raw_text) || text(step.normalized_text),
  }));
  const forbiddenMatchMethods = steps.filter(usesForbiddenMatchMethod).map((step) => ({
    step_order: Number(step.step_order ?? 0),
    text: text(step.raw_text) || text(step.normalized_text),
    match_method: text(step.match_method),
  }));
  const unresolvedExactMatchMethods = steps.filter(usesUnresolvedExactMatchMethod).map((step) => ({
    step_order: Number(step.step_order ?? 0),
    text: text(step.raw_text) || text(step.normalized_text),
    match_method: text(step.match_method) || null,
  }));
  const blockers = [];
  if (activePrimaryPrepCount > 1) blockers.push("duplicate active primary route prep records");
  if (!reference) blockers.push("saved direction source absent");
  if (!prep) blockers.push("active primary route prep absent");
  if (missing.length) blockers.push("saved source element missing from route prep");
  if (unsupported.length) blockers.push("route-prep element lacks exact saved-source support");
  if (identityPending.length) blockers.push("official Road Manager identity pending");
  if (generic.length) blockers.push("generic or ambiguous route-prep step");
  if (privateSteps.length) blockers.push("private/lease/access step remains non-identity source text");
  if (savedSequenceConflict) blockers.push("directions_clear and structured_road_sequence disagree");
  if (forbiddenMatchMethods.length) blockers.push("forbidden fuzzy/name-only/nearest/semantic match method");
  if (unresolvedExactMatchMethods.length) blockers.push("exact-status match method is unreviewed or missing");
  const reconciliationEvidencePending = Boolean(prep && savedInstructions.length > 0 && prepInstructions.length === 0);
  if (reconciliationEvidencePending) {
    blockers.push("saved numbered steps lack explicit route-prep reconciliation evidence");
  }
  const contradictions = steps.filter((step) => {
    const status = normalizeExplicitSourceToken(step.match_status).replaceAll(" ", "_");
    return (Boolean(text(step.road_id)) && ["NEEDS_OFFICIAL_MATCH", "AMBIGUOUS", "GENERIC", "HELD_SOURCE_CONFLICT"].includes(status))
      || (!text(step.road_id) && ["EXACT", "EXACT_MASTER", "MATCHED", "VERIFIED"].includes(status) && !isPrivateOrLeaseStep(step));
  }).map((step) => `step ${Number(step.step_order ?? 0)} road_id/match_status contradiction`);
  blockers.push(...contradictions);

  return {
    pad_id: text(input.pad_id),
    legacy_id: text(input.legacy_id),
    pad_name: text(input.pad_name),
    county: text(input.county),
    has_written_directions: Boolean(text(input.written_directions)),
    has_directions_clear: Boolean(text(input.directions_clear)),
    has_structured_road_sequence: Boolean(text(input.structured_road_sequence)),
    parsed_saved_step_count: reference?.orderedSteps.length ?? 0,
    active_primary_prep_id: text(prep?.id) || null,
    active_primary_prep_count: activePrimaryPrepCount,
    route_prep_step_count: steps.length,
    saved_sequence: savedSequence,
    prep_source_sequence: prepSequence,
    sequence_exact_match: sequenceExactMatch,
    saved_roads_or_steps_missing_from_prep: missing,
    prep_roads_or_steps_not_supported_by_saved_source: unsupported,
    exact_road_manager_road_ids_already_attached: roadIds,
    steps_needing_official_identity_match: identityPending,
    generic_or_ambiguous_steps: generic,
    private_or_lease_steps: privateSteps,
    saved_sequence_source_conflict: savedSequenceConflict,
    forbidden_match_method_steps: forbiddenMatchMethods,
    unresolved_exact_match_method_steps: unresolvedExactMatchMethods,
    road_id_match_status_contradictions: contradictions,
    exact_blocker: blockers.length ? blockers.join("; ") : null,
    classification: primaryClassification({
      reference,
      prep,
      sequenceExactMatch,
      missing,
      unsupported,
      identityPending,
      generic,
      privateSteps,
      forbiddenMatchMethods,
      unresolvedExactMatchMethods,
      savedSequenceConflict,
      reconciliationEvidencePending,
      contradictions,
      duplicatePrimary: activePrimaryPrepCount > 1,
    }),
  };
}

export function reconcileSavedDirections(input) {
  const pads = Array.isArray(input) ? input : Array.isArray(input?.pads) ? input.pads : [];
  return pads
    .filter((pad) => normalizeExplicitSourceToken(pad.company) === "ASCENT"
      && ["OH", "OHIO"].includes(normalizeExplicitSourceToken(pad.state))
      && ASCENT_OHIO_COUNTIES.includes(text(pad.county)))
    .map(reconcileSavedDirectionRow)
    .sort((left, right) => left.county.localeCompare(right.county)
      || left.pad_name.localeCompare(right.pad_name)
      || left.pad_id.localeCompare(right.pad_id));
}

function parseArgs(argv) {
  const args = { input: null, output: null, printSql: false, summary: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--input") args.input = argv[++index] || null;
    else if (argv[index] === "--output") args.output = argv[++index] || null;
    else if (argv[index] === "--print-read-only-sql") args.printSql = true;
    else if (argv[index] === "--summary") args.summary = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return args;
}

async function readAuditInput(path) {
  if (path !== "-") return readFile(path, "utf8");
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) return line;
  }
  throw new Error("No JSON audit input was received on stdin.");
}

export function summarizeReconciliationRows(rows) {
  const classifications = Object.fromEntries(CLASSIFICATIONS.map((classification) => [classification, 0]));
  for (const row of rows) classifications[row.classification] += 1;
  return {
    row_count: rows.length,
    classifications,
    pads_without_active_primary_prep: rows.filter((row) => row.active_primary_prep_id === null).length,
    pads_with_duplicate_active_primary_prep: rows.filter((row) => row.active_primary_prep_count > 1).length,
    steps_needing_official_identity_match: rows.reduce((sum, row) => sum + row.steps_needing_official_identity_match.length, 0),
    generic_or_ambiguous_steps: rows.reduce((sum, row) => sum + row.generic_or_ambiguous_steps.length, 0),
    private_or_lease_steps: rows.reduce((sum, row) => sum + row.private_or_lease_steps.length, 0),
    pads_with_saved_sequence_source_conflict: rows.filter((row) => row.saved_sequence_source_conflict !== null).length,
    forbidden_match_method_steps: rows.reduce((sum, row) => sum + row.forbidden_match_method_steps.length, 0),
    unresolved_exact_match_method_steps: rows.reduce((sum, row) => sum + row.unresolved_exact_match_method_steps.length, 0),
    road_id_match_status_contradictions: rows.reduce((sum, row) => sum + row.road_id_match_status_contradictions.length, 0),
  };
}

export async function runAudit(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.printSql) {
    process.stdout.write(`${READ_ONLY_EXPORT_SQL}\n`);
    return [];
  }
  if (!args.input) throw new Error("Provide a read-only export with --input <json>, or use --print-read-only-sql.");
  const input = JSON.parse(await readAuditInput(args.input));
  const rows = reconcileSavedDirections(input);
  const result = args.summary ? summarizeReconciliationRows(rows) : { row_count: rows.length, rows };
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (args.output) await writeFile(args.output, output, "utf8");
  else process.stdout.write(output);
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAudit().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
