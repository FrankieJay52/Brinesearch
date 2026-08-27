import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const v18Root = path.resolve(here, "..");
const repositoryRoot = path.resolve(v18Root, "..");
const reportPath = path.join(repositoryRoot, "docs/v18-ohio-get-directions-coverage.json");

const releasedApprovedContracts = [
  { padId: "e2b32e85-9e93-4388-8215-9d8167cbbeb8", legacyId: "ascent--cologie", recordRevision: "1787615581785257", company: "Ascent", padName: "COLOGIE", county: "Harrison" },
  { padId: "518659d9-bca2-47b0-b294-3141ba679fc4", legacyId: "ascent--lasso", recordRevision: "1787459253071652", company: "Ascent", padName: "LASSO", county: "Harrison" },
];

const namedReviewedContracts = [
  { padId: "b7526e45-0b33-4988-ae1c-0a4140971f8e", legacyId: "ascent--banjo", recordRevision: "1787615581785257", company: "Ascent", padName: "BANJO", county: "Harrison", approaches: 1 },
  { padId: "185d9eb6-58af-4009-bf53-fdd23113a572", legacyId: "ascent--cardinal", recordRevision: "1787459253071652", company: "Ascent", padName: "CARDINAL", county: "Harrison", approaches: 2 },
  { padId: "95dcbd15-afd0-4357-a521-e23bcd6b4118", legacyId: "ascent--conotton", recordRevision: "1786258360881449", company: "Ascent", padName: "CONOTTON", county: "Harrison", approaches: 2 },
  { padId: "61e21e3c-360b-40b0-8153-209b4fb3d5eb", legacyId: "ascent--ellen", recordRevision: "1787459253071652", company: "Ascent", padName: "ELLEN", county: "Harrison", approaches: 2 },
  { padId: "b9a8e55c-3583-4019-85fc-54a03d420ace", legacyId: "ascent--hamilton", recordRevision: "1786258360881449", company: "Ascent", padName: "HAMILTON", county: "Harrison", approaches: 2 },
  { padId: "655a97d5-ffdf-4b13-bf66-3d22022239b4", legacyId: "ascent--pettay", recordRevision: "1787459253071652", company: "Ascent", padName: "PETTAY", county: "Harrison", approaches: 2 },
  { padId: "f5a82acf-d7c0-4ce3-ad4e-0de810551450", legacyId: "ascent--sproull", recordRevision: "1786258360881449", company: "Ascent", padName: "SPROULL", county: "Harrison", approaches: 2 },
];

export const exactActionContracts = {
  releasedApproved: releasedApprovedContracts,
  namedReviewed: namedReviewedContracts,
};

function text(value) {
  return typeof value === "string" ? value : "";
}

function normalizedName(value) {
  return text(value).trim().toLocaleUpperCase("en-US").replace(/\s+/g, " ");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function matchesExactContract(pad, contract) {
  return pad.padId === contract.padId
    && pad.canonicalId === contract.padId
    && pad.legacyId === contract.legacyId
    && pad.recordRevision === contract.recordRevision
    && pad.company === contract.company
    && pad.padName === contract.padName
    && pad.state === "Ohio"
    && pad.county === contract.county;
}

export function inspectGoogleDirectionsUrl(href) {
  const failures = [];
  let url;
  try {
    url = new URL(href);
  } catch {
    return { failures: ["invalid_url"], url: null };
  }
  if (url.protocol !== "https:") failures.push("non_https");
  if (url.hostname !== "www.google.com" || url.pathname !== "/maps/dir/") failures.push("unexpected_google_endpoint");
  if (url.searchParams.get("api") !== "1") failures.push("missing_api_1");
  if (url.searchParams.get("travelmode") !== "driving") failures.push("missing_driving_mode");
  if (url.searchParams.get("dir_action") !== "navigate") failures.push("missing_navigate_action");
  if (url.searchParams.has("origin")) failures.push("fixed_origin");
  if (!url.searchParams.get("destination")) failures.push("missing_destination");
  return { failures, url };
}

export function validateDestinationOnlyAction(action, destination) {
  const failures = [];
  if (!action || action.kind !== "destination_pin" || !action.href) return ["missing_destination_action"];
  const inspected = inspectGoogleDirectionsUrl(action.href);
  failures.push(...inspected.failures);
  if (inspected.url) {
    const expected = `${destination.latitude},${destination.longitude}`;
    if (inspected.url.searchParams.get("destination") !== expected) failures.push("destination_mismatch");
    if (inspected.url.searchParams.has("waypoints")) failures.push("invented_waypoints");
  }
  if (!action.detail.includes("GPS destination only") || !action.detail.includes("Google chooses the route")) {
    failures.push("missing_gps_only_warning");
  }
  return [...new Set(failures)];
}

function exactContractForPad(pad, contracts) {
  const contract = contracts.find((candidate) => candidate.padId === pad.padId);
  return contract && matchesExactContract(pad, contract) ? contract : null;
}

export function resolveAuditAction(pad, runtime) {
  const released = exactContractForPad(pad, releasedApprovedContracts);
  if (released) return {
    category: "released_approved_route",
    kind: "approved_route",
    clickable: true,
    selectionRequired: false,
    actionCount: 1,
    source: "exact_current_release_contract",
  };

  const named = exactContractForPad(pad, namedReviewedContracts);
  if (named) return {
    category: "owner_reviewed_route",
    kind: named.approaches > 1 ? "unavailable" : "approved_route",
    clickable: named.approaches === 1,
    selectionRequired: named.approaches > 1,
    actionCount: 1,
    source: "exact_current_named_approach_contract",
  };

  const reviewedCandidate = runtime.reviewedNavigationCandidateForPad(pad);
  if (reviewedCandidate) {
    const action = runtime.buildFixedNavigationAction(runtime.unavailableView, pad, reviewedCandidate);
    return {
      category: "owner_reviewed_route",
      kind: action.kind,
      clickable: Boolean(action.href),
      selectionRequired: false,
      actionCount: 1,
      source: "exact_repository_reviewed_candidate",
      action,
    };
  }

  const action = runtime.buildFixedNavigationAction(runtime.unavailableView, pad, null);
  return {
    category: action.kind === "destination_pin" ? "trusted_gps_destination_only" : "unavailable",
    kind: action.kind,
    clickable: Boolean(action.href),
    selectionRequired: false,
    actionCount: 1,
    source: action.kind === "destination_pin" ? "trustedPadDestination" : "no_trusted_destination",
    action,
  };
}

function coordinateShape(pad) {
  const candidates = [pad.coordinate, pad.mapReference].filter(Boolean);
  if (!candidates.length) return "missing";
  if (candidates.some((candidate) => candidate.latitude === undefined || candidate.longitude === undefined || candidate.latitude === null || candidate.longitude === null)) return "incomplete";
  return "complete";
}

function compactPad(pad, reason) {
  return {
    padId: pad.padId,
    legacyId: pad.legacyId,
    recordRevision: pad.recordRevision,
    company: pad.company,
    padName: pad.padName,
    county: pad.county,
    reason,
  };
}

export async function buildCoverageReport(snapshot, referenceMetadata, runtime, padPageSource) {
  const ohioPads = snapshot.rows
    .filter((row) => row.recordType === "pad" && row.state === "Ohio")
    .sort((left, right) => left.padId.localeCompare(right.padId));
  const fixedActionComponentOccurrences = (padPageSource.match(/<FixedNavigateAction\b/g) || []).length;
  const categoryCounts = {
    releasedApprovedRouteActions: 0,
    ownerReviewedRouteActions: 0,
    trustedGpsDestinationOnlyActions: 0,
    disabledMissingDestinationActions: 0,
  };
  const trustedSourceCounts = {
    verified_driver_entrance: 0,
    saved_pad_gps: 0,
    official_pad_reference: 0,
    official_wellhead_reference: 0,
  };
  const actionRows = [];
  const invalidCoordinates = [];
  const incompleteCoordinates = [];
  const missingDestinations = [];
  const staleReviewedCandidateMatches = [];
  const unexpectedFixedOriginUrls = [];
  const unexpectedGoogleEndpoints = [];
  const unexpectedNonHttpsGoogleUrls = [];
  const missingRequiredGoogleParameters = [];
  const destinationMismatches = [];
  const fabricatedDestinationLinks = [];
  const actionCountViolations = [];

  for (const pad of ohioPads) {
    const destination = runtime.trustedPadDestination(pad);
    const shape = coordinateShape(pad);
    if (shape === "incomplete") incompleteCoordinates.push(compactPad(pad, "incomplete_coordinate_pair"));
    if (shape === "complete" && !destination) invalidCoordinates.push(compactPad(pad, "coordinate_rejected_by_trustedPadDestination"));
    if (!destination) missingDestinations.push(compactPad(pad, "no_trusted_coordinate_in_safe_directory_model"));
    if (destination) trustedSourceCounts[destination.source] += 1;

    const knownReviewedId = runtime.reviewedPadIds.has(pad.padId);
    const exactReviewed = runtime.reviewedNavigationCandidateForPad(pad);
    if (knownReviewedId && !exactReviewed) staleReviewedCandidateMatches.push(compactPad(pad, "exact_reviewed_contract_did_not_match_current_record"));

    const resolved = resolveAuditAction(pad, runtime);
    if (resolved.category === "released_approved_route") categoryCounts.releasedApprovedRouteActions += 1;
    else if (resolved.category === "owner_reviewed_route") categoryCounts.ownerReviewedRouteActions += 1;
    else if (resolved.category === "trusted_gps_destination_only") categoryCounts.trustedGpsDestinationOnlyActions += 1;
    else categoryCounts.disabledMissingDestinationActions += 1;
    if (resolved.actionCount !== 1) actionCountViolations.push(compactPad(pad, `action_count_${resolved.actionCount}`));

    if (resolved.action?.href) {
      const inspected = inspectGoogleDirectionsUrl(resolved.action.href);
      if (inspected.failures.includes("fixed_origin")) unexpectedFixedOriginUrls.push(pad.padId);
      if (inspected.failures.includes("unexpected_google_endpoint")) unexpectedGoogleEndpoints.push(pad.padId);
      if (inspected.failures.includes("non_https")) unexpectedNonHttpsGoogleUrls.push(pad.padId);
      if (inspected.failures.some((failure) => ["missing_api_1", "missing_driving_mode", "missing_navigate_action", "missing_destination"].includes(failure))) {
        missingRequiredGoogleParameters.push(pad.padId);
      }
      if (resolved.category === "trusted_gps_destination_only" && destination) {
        const destinationFailures = validateDestinationOnlyAction(resolved.action, destination);
        if (destinationFailures.includes("destination_mismatch")) destinationMismatches.push(pad.padId);
      }
      if (!destination && resolved.kind === "destination_pin") fabricatedDestinationLinks.push(pad.padId);
    }
    actionRows.push({
      padId: pad.padId,
      recordRevision: pad.recordRevision,
      category: resolved.category,
      kind: resolved.kind,
      clickable: resolved.clickable,
      selectionRequired: resolved.selectionRequired,
      destinationSource: destination?.source || null,
      source: resolved.source,
    });
  }

  const duplicateGroups = [...Map.groupBy(ohioPads, (pad) => normalizedName(pad.padName)).entries()]
    .filter(([name, rows]) => name && rows.length > 1)
    .map(([name, rows]) => ({
      normalizedName: name,
      companies: [...new Set(rows.map((row) => row.company))].sort(),
      counties: [...new Set(rows.map((row) => row.county))].sort(),
      records: rows.map((row) => ({ padId: row.padId, company: row.company, county: row.county, recordRevision: row.recordRevision })).sort((left, right) => left.padId.localeCompare(right.padId)),
    }))
    .sort((left, right) => left.normalizedName.localeCompare(right.normalizedName));

  const ownerReviewedRows = actionRows.filter((row) => row.category === "owner_reviewed_route");
  const lawson = ohioPads.find((pad) => pad.padId === "143f5268-33e4-4598-8101-40220b5cfdc4");
  const bilinovich = ohioPads.find((pad) => pad.padId === "59061829-1122-4aae-872d-cf5024310373");
  const violations = [];
  const trustedWithoutAction = actionRows.filter((row) => row.destinationSource && !row.clickable && !row.selectionRequired);
  if (trustedWithoutAction.length) violations.push(`trusted destinations without clickable action: ${trustedWithoutAction.length}`);
  if (unexpectedFixedOriginUrls.length) violations.push(`fixed-origin URLs: ${unexpectedFixedOriginUrls.length}`);
  if (unexpectedGoogleEndpoints.length) violations.push(`unexpected Google endpoints: ${unexpectedGoogleEndpoints.length}`);
  if (unexpectedNonHttpsGoogleUrls.length) violations.push(`non-HTTPS Google URLs: ${unexpectedNonHttpsGoogleUrls.length}`);
  if (missingRequiredGoogleParameters.length) violations.push(`URLs missing required parameters: ${missingRequiredGoogleParameters.length}`);
  if (destinationMismatches.length) violations.push(`destination mismatches: ${destinationMismatches.length}`);
  if (fabricatedDestinationLinks.length) violations.push(`fabricated destination links: ${fabricatedDestinationLinks.length}`);
  if (actionCountViolations.length || fixedActionComponentOccurrences !== 1) violations.push("pad pages do not resolve to exactly one fixed navigation action");
  if (staleReviewedCandidateMatches.length) violations.push(`stale reviewed candidate contracts: ${staleReviewedCandidateMatches.length}`);
  if (!lawson || !runtime.reviewedNavigationCandidateForPad(lawson)) violations.push("LAWSON reviewed route regression");
  if (!bilinovich || !runtime.reviewedNavigationCandidateForPad(bilinovich) || /Blaze/i.test(bilinovich.structuredRoadSequence)) violations.push("BILINOVICH no-Blaze reviewed route regression");
  for (const contract of [...releasedApprovedContracts, ...namedReviewedContracts]) {
    const pad = ohioPads.find((candidate) => candidate.padId === contract.padId);
    if (!pad || !matchesExactContract(pad, contract)) violations.push(`stale higher-priority route contract: ${contract.padId}`);
  }

  return {
    schemaVersion: 1,
    audit: "v18-ohio-get-directions",
    snapshot: {
      snapshotId: snapshot.snapshotId,
      sourceRevision: snapshot.sourceRevision,
      sourceState: snapshot.sourceState,
      generatedAt: snapshot.generatedAt,
      directoryRows: snapshot.rows.length,
      referenceRows: referenceMetadata.rowCount,
      referenceContentSha256: referenceMetadata.contentSha256,
    },
    method: {
      directory: "V18 live-current directory loader plus strict snapshot-bound pad-reference projection",
      navigation: "Production trustedPadDestination and fixed-action builders loaded through Vite SSR",
      higherPriorityRoutes: "Exact current record-bound release/named-approach registries recovered read-only; no all-pad route/status fanout",
      denominator: "Derived at runtime; not pinned",
    },
    counts: {
      totalCurrentOhioPadsExamined: ohioPads.length,
      ...categoryCounts,
      ownerReviewedImmediatelyClickableActions: ownerReviewedRows.filter((row) => row.clickable).length,
      ownerReviewedSelectionRequiredActions: ownerReviewedRows.filter((row) => row.selectionRequired).length,
      invalidCoordinateRecords: invalidCoordinates.length,
      incompleteCoordinateRecords: incompleteCoordinates.length,
      recordsWithActionCountViolation: actionCountViolations.length,
    },
    trustedDestinationSources: trustedSourceCounts,
    missingOrInvalidDestinations: {
      count: missingDestinations.length,
      records: missingDestinations,
      invalidCoordinates,
      incompleteCoordinates,
    },
    duplicatePadNames: {
      groupCount: duplicateGroups.length,
      recordCount: duplicateGroups.reduce((total, group) => total + group.records.length, 0),
      groups: duplicateGroups,
    },
    routeContracts: {
      releasedApproved: releasedApprovedContracts,
      namedOwnerReviewed: namedReviewedContracts,
      repositoryReviewed: ownerReviewedRows.filter((row) => row.source === "exact_repository_reviewed_candidate").map((row) => row.padId),
    },
    urlValidation: {
      destinationOnlyUrlsChecked: categoryCounts.trustedGpsDestinationOnlyActions,
      repositoryReviewedUrlsChecked: ownerReviewedRows.filter((row) => !namedReviewedContracts.some((contract) => contract.padId === row.padId)).length,
      serverReleasedUrls: "validated by existing release/named-approach runtime contracts; not refetched by this directory/GPS-only audit",
      unexpectedFixedOriginUrls,
      unexpectedGoogleEndpoints,
      unexpectedNonHttpsGoogleUrls,
      missingRequiredGoogleParameters,
      destinationMismatches,
      fabricatedDestinationLinks,
    },
    identityValidation: {
      staleReviewedCandidateMatches,
      fixedActionComponentOccurrences,
      actionCountViolations,
    },
    regressions: {
      lawsonReviewedRouteExact: Boolean(lawson && runtime.reviewedNavigationCandidateForPad(lawson)),
      bilinovichReviewedRouteExactAndNoBlaze: Boolean(bilinovich && runtime.reviewedNavigationCandidateForPad(bilinovich) && !/Blaze/i.test(bilinovich.structuredRoadSequence)),
    },
    actionDigestSha256: sha256(stableStringify(actionRows)),
    violations,
  };
}

async function loadRuntimeModules(server) {
  const directory = await server.ssrLoadModule("/src/data/directory.ts");
  const references = await server.ssrLoadModule("/src/data/padReferences.ts");
  const destination = await server.ssrLoadModule("/src/data/googleDestination.ts");
  const candidates = await server.ssrLoadModule("/src/data/reviewedNavigationCandidates.ts");
  const padPage = await server.ssrLoadModule("/src/features/pad/PadPage.tsx");
  const supabase = await server.ssrLoadModule("/src/data/supabaseClient.ts");
  return { directory, references, destination, candidates, padPage, supabase };
}

async function loadStrictPadReferences(snapshot, modules) {
  const response = await fetch(`${modules.supabase.supabaseUrl}/rest/v1/rpc/brinesearch_v18_pad_reference_coordinates`, {
    method: "POST",
    headers: { apikey: modules.supabase.supabasePublishableKey, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ p_snapshot_id: snapshot.snapshotId }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`V18 pad-reference audit request failed (${response.status})`);
  const payload = await response.json();
  const value = Array.isArray(payload) && payload.length === 1 ? payload[0] : payload;
  const references = modules.references.normalizePadReferencePayload(value, snapshot.snapshotId, snapshot.sourceRevision);
  if (!references) throw new Error("V18 pad-reference audit payload failed the production normalizer");
  return {
    snapshot: modules.references.attachPadReferences(snapshot, references),
    metadata: { rowCount: Number(value.rowCount), contentSha256: String(value.contentSha256) },
  };
}

export async function runLiveAudit() {
  const server = await createServer({
    root: v18Root,
    configFile: path.join(v18Root, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const modules = await loadRuntimeModules(server);
    const snapshot = await modules.directory.loadDirectorySnapshot();
    if (snapshot.sourceState !== "live_current") throw new Error(`Ohio audit requires live_current directory state, received ${snapshot.sourceState}`);
    const attached = await loadStrictPadReferences(snapshot, modules);
    const runtime = {
      trustedPadDestination: modules.destination.trustedPadDestination,
      reviewedNavigationCandidateForPad: modules.candidates.reviewedNavigationCandidateForPad,
      buildFixedNavigationAction: modules.padPage.buildFixedNavigationAction,
      reviewedPadIds: new Set([
        "143f5268-33e4-4598-8101-40220b5cfdc4",
        "59061829-1122-4aae-872d-cf5024310373",
      ]),
      unavailableView: {
        available: false,
        state: "unavailable",
        routeUrl: null,
        reason: "No exact approved route is available for a Google handoff.",
        mode: null,
        approachLabel: null,
        finalLegMode: null,
        selectionRequired: false,
      },
    };
    const padPageSource = await readFile(path.join(v18Root, "src/features/pad/PadPage.tsx"), "utf8");
    return buildCoverageReport(attached.snapshot, attached.metadata, runtime, padPageSource);
  } finally {
    await server.close();
  }
}

async function main() {
  const mode = process.argv[2] || "--check";
  const report = await runLiveAudit();
  const formatted = `${JSON.stringify(report, null, 2)}\n`;
  if (report.violations.length) throw new Error(`Ohio Get Directions coverage audit failed: ${report.violations.join("; ")}`);
  if (mode === "--print") {
    process.stdout.write(formatted);
    return;
  }
  if (mode !== "--check") throw new Error(`Unknown audit mode: ${mode}`);
  const durable = await readFile(reportPath, "utf8");
  if (durable.replace(/\r\n?/g, "\n") !== formatted) throw new Error("Durable Ohio Get Directions coverage report is stale; run the audit and review the current live snapshot");
  console.log(`V18 Ohio Get Directions audit passed: ${report.counts.totalCurrentOhioPadsExamined} current Ohio pads, ${report.counts.trustedGpsDestinationOnlyActions} GPS-only actions, ${report.counts.disabledMissingDestinationActions} unavailable.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
