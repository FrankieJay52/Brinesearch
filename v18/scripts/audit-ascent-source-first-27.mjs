import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const v18Root = path.resolve(here, "..");

const packageRelativePath = "scripts/fixtures/ascent-source-first-27-20260830.json";
const sourceRelativePath = "scripts/fixtures/ascent-pad-approach-source-20260829.json";
const graphRelativePath = "scripts/fixtures/ascent-pad-graph-runs-20260829.json";
const batch2RelativePath = "src/features/map/ascentPadApproaches.batch2.json";
const bellaMigrationRelativePath = "../supabase/migrations/20260830083409_ascent_source_first_bella_airport_identity.sql";
const howellMigrationRelativePath = "../supabase/migrations/20260830083415_ascent_source_first_howell_occurrence_checkpoint.sql";

const expectedMainSha = "4bfba0d2a07e2c7318c1227743c5765e6dce9094";
const expectedMainTree = "5aff08bc0e9210137f3f890c507e9efe45523350";
const expectedMasterSha = "177534c4f46199b2697d2a45339544f88956ef845c8a5100cdcd2598f6761319";
const expectedRepairMatrixSha = "4582949517cb3c947bcf97bcfa7f6fe1a7f039714a6d0860cab94a30337a54e7";
const expectedSourceSha = "247c94a8da5e3c417fe2d5775e650fd95d096020878e74247fc28332d4ee794c";
const expectedGraphSha = "6a5047cbcb4c4fc5350531307a85bbcaab9a5cafb53195e23d38883470d46ee3";
const expectedBatch2Sha = "a04cdc302f578d5d80a7fa8916e529c64e33e1ac3eb68dbf1dcbaf7991e42dd3";
const expectedBellaMigrationSha = "9c53f20bcd5204b2a8d160bcdf54f3f9dbf1eb7f22c97241f2153a153d58ef5d";
const expectedHowellMigrationSha = "dd1383cae3d98028da365bc4406f6b1161fc4b7e2a840d8d9db2838a0a78bc75";
const expectedPackageSha = "022b614e3a0e1b0c8b3e4e6c156ac0d07e9b8606c77e2ffbe81fd6ee6591c1ea";
const expectedSourceFirstEvidenceSha = "c362310285051466928f54f3ca13ba423b1f9f176c7fdba3280551bff16794bf";

const expectedPadNames = [
  "SHUTWAY", "VANNELLE",
  "OLIVER", "RABER", "BEACON", "BELLA", "PATRIOT",
  "BEDWAY", "BLAYNEY", "BOROVICH", "COLEMAN", "EUREKA", "PREMIERE", "SIDWELL", "THREE DADS",
  "BETTS", "GINGERICH", "LEILA", "ALPHA", "PACKER", "SHERWOOD", "CECELIA", "CERMAK", "DARROW",
  "HOWELL", "PIERGALLINI", "BILLY SHERMAN",
];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const forbiddenMatchingPattern = /(?:fuzzy|nearest|name[_ -]?only|shortest|fastest)/iu;

const normalizedText = (value) => value.replace(/\r\n?/gu, "\n");
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const normalizedFileSha256 = (value) => sha256(normalizedText(value));
const read = (root, relative) => fs.readFileSync(path.join(root, relative), "utf8");

function sameCoordinate(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === 2 && right.length === 2
    && left[0] === right[0] && left[1] === right[1];
}

function sequenceFromDirectionsClear(value) {
  const lines = normalizedText(value).replace(/\\n/gu, "\n").split("\n");
  const header = lines.findIndex((line) => line.trim() === "Road sequence reference:");
  if (header < 0) return null;
  return lines.slice(header + 1).find((line) => line.trim().length > 0)?.trim() ?? null;
}

function googleCandidateUrl(record) {
  if (!record.googleQa) return null;
  const [destinationLongitude, destinationLatitude] = record.destination;
  const [waypointLongitude, waypointLatitude] = record.googleQa.waypoint;
  const parameters = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    dir_action: "navigate",
    destination: `${destinationLatitude},${destinationLongitude}`,
    waypoints: `${waypointLatitude},${waypointLongitude}`,
  });
  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}

function validateGoogleCandidateEvidence(record, batch2Record, errors) {
  if (!batch2Record
    || batch2Record.padId !== record.padId
    || batch2Record.recordRevision !== record.recordRevision
    || !sameCoordinate(batch2Record.destination?.coordinates, record.destination)
    || batch2Record.destination?.gpsSource !== record.destinationSource
    || batch2Record.lastHighway?.roadId !== record.roadEvidence.find(
      (row) => row.kind === "named_public_road" && row.rawSavedToken.includes(
        record.padName === "SHUTWAY" ? "149" : "OH-9",
      ),
    )?.roadManagerRoadId
    || batch2Record.gpsTether?.authority !== "unapproved_straight_network_snap_to_saved_gps"
    || batch2Record.gpsTether?.navigationGeometry !== false
    || !sameCoordinate(batch2Record.gpsTether?.coordinates?.[1], record.destination)
    || Math.abs(
      batch2Record.gpsTether.distanceMeters - record.googleQa.destinationNeutralTetherMeters,
    ) > 0.001) {
    errors.push(`${record.padName} Google candidate is not bound to the frozen Batch-2 pad evidence`);
    return;
  }

  if (record.padName === "SHUTWAY") {
    if (!sameCoordinate(record.googleQa.waypoint, batch2Record.start?.snappedCoordinate)
      || batch2Record.start?.anchoredRoadId !== batch2Record.lastHighway.roadId
      || !sameCoordinate(batch2Record.roadCoordinates?.[0], record.googleQa.waypoint)) {
      errors.push("SHUTWAY Google control drifted from its exact OH-149 anchor");
    }
    return;
  }

  const lastRoadSection = [...(batch2Record.sections || [])].reverse().find(
    (section) => section.sourceRoadId === batch2Record.lastHighway.roadId,
  );
  if (record.padName === "VANNELLE"
    && (!sameCoordinate(record.googleQa.waypoint, batch2Record.gpsTether.coordinates[0])
      || !sameCoordinate(record.googleQa.waypoint, batch2Record.roadCoordinates?.at(-1))
      || !sameCoordinate(record.googleQa.waypoint, lastRoadSection?.coordinates?.at(-1)))) {
    errors.push("VANNELLE Google control drifted from the evidenced OH-9 route endpoint");
  }
}

export function exactSourceFirstRecordBinding(record, candidate) {
  return record.padId === candidate.padId
    && record.legacyId === candidate.legacyId
    && record.recordRevision === candidate.recordRevision
    && record.company === candidate.company
    && record.padName === candidate.padName
    && record.state === candidate.state
    && record.county === candidate.county
    && record.destinationSource === candidate.destinationGpsSource
    && record.directoryCoordinateRole === candidate.directoryCoordinateRole
    && record.legacyStructuredRoadSequence === candidate.structuredRoadSequence
    && sameCoordinate(record.destination, candidate.destination);
}

function validateHowell(record, graphFixture, errors) {
  const evidence = record.preparedOccurrenceEvidence;
  const receipt = graphFixture.records.find((row) => row.padId === record.padId);
  if (!evidence || !receipt) {
    errors.push("HOWELL source-first evidence or baseline graph receipt is missing");
    return;
  }
  const sr151 = receipt.runs.find((run) => run.identityId === evidence.roads[0].identityId
    && run.geometryDigest === evidence.roads[0].geometryDigest);
  const sr152 = receipt.runs.find((run) => run.identityId === evidence.roads[1].identityId
    && run.geometryDigest === evidence.roads[1].geometryDigest
    && run.junctionDigest === evidence.junctionDigest);
  const junction = graphFixture.junctions[evidence.junctionDigest];
  if (evidence.evidenceAuthority !== "source_first_checkpoint_only"
    || evidence.migrationPath !== "supabase/migrations/20260830083415_ascent_source_first_howell_occurrence_checkpoint.sql"
    || evidence.migrationNormalizedSha256 !== "dd1383cae3d98028da365bc4406f6b1161fc4b7e2a840d8d9db2838a0a78bc75"
    || evidence.baselineGraphReceiptSource !== "legacy_structured_road_sequence"
    || evidence.baselineGraphReceiptProvesCleanedOrder !== false
    || !evidence.sourceFirstBinding.startsWith("separate_unapplied_")
    || evidence.productionApplied !== false
    || evidence.navigationStateAfterApply !== "GPS_ONLY") {
    errors.push("HOWELL checkpoint incorrectly promotes legacy-bound display evidence");
  }
  if (receipt.recordRevision !== record.recordRevision
    || receipt.routedIdentitySha256 !== evidence.routedIdentitySha256
    || receipt.routeCoordinateSha256 !== evidence.routeCoordinateSha256
    || receipt.receiptKeySha256 !== evidence.receiptKeySha256
    || receipt.receiptSha256 !== evidence.receiptSha256
    || !sr151 || !sr152 || sr151.sourceMatch !== "graph_named_only"
    || sr152.sourceMatch !== "graph_named_only"
    || sr152.endMeasureMeters !== evidence.occurrenceMeters
    || junction?.junctionId !== evidence.junctionId
    || junction?.buildId !== evidence.graphBuildId
    || junction?.buildDigest !== evidence.graphBuildDigest) {
    errors.push("HOWELL persisted display evidence drifted from the sealed baseline receipt");
  }
  if (evidence.directionsClearSha256 !== record.directionsClearSha256
    || evidence.cleanedSequenceSha256 !== sha256(record.cleanedRoadSequence)
    || evidence.sourceMileageMiles !== 3.5
    || evidence.occurrenceMiles !== 3.488
    || evidence.destinationNeutralTetherMeters !== 222.9755) {
    errors.push("HOWELL source-first mileage or neutral-tail checkpoint drifted");
  }
}

function validateBella(record, errors) {
  const evidence = record.preparedIdentityEvidence;
  if (!evidence
    || evidence.migrationPath !== "supabase/migrations/20260830083409_ascent_source_first_bella_airport_identity.sql"
    || evidence.migrationNormalizedSha256 !== "9c53f20bcd5204b2a8d160bcdf54f3f9dbf1eb7f22c97241f2153a153d58ef5d"
    || evidence.routePrepId !== "7e97ed5c-d06e-4b6d-8680-0f6658a02c52"
    || evidence.routePrepStepId !== "0116d6cb-5283-4602-8008-9a594c4dfe10"
    || evidence.authoritativeIdentityId !== "5e78e286-52af-c0e0-904c-4333b603a6c3"
    || evidence.sourceIdentityKey !== "OH:ODOT:NLF:CHASCR00038**C:COMP:2025_000000000025902"
    || evidence.canonicalRoadId !== "6eb2d5b0-fc1e-1440-6ea5-c35aabdaf549"
    || evidence.identityMappingId !== "8a0accae-9fc2-edf3-ae72-9f38b35116a3"
    || evidence.routeSystem !== "CR" || evidence.routeNumber !== "38"
    || evidence.productionApplied !== false
    || evidence.graphRebuildRequiredLater !== true) {
    errors.push("BELLA exact Airport Rd identity adoption evidence drifted");
  }
}

export function validateSourceFirst27({ packageFixture, sourceFixture, graphFixture, batch2Fixture }) {
  const errors = [];
  const records = Array.isArray(packageFixture.records) ? packageFixture.records : [];
  const sourceRecords = Array.isArray(sourceFixture.records) ? sourceFixture.records : [];
  const sourceByPadId = new Map(sourceRecords.map((record) => [record.padId, record]));
  const sourceFirstEvidenceSha = sha256(JSON.stringify(records.map((record) => ({
    padId: record.padId,
    recordRevision: record.recordRevision,
    directionsClearSha256: record.directionsClearSha256,
    cleanedRoadSequence: record.cleanedRoadSequence,
    legacyOnlyNamedRoadCandidates: record.legacyOnlyNamedRoadCandidates,
    scopeClass: record.scopeClass,
    preparedStatus: record.preparedStatus,
    currentNavigationState: record.currentNavigationState,
    blocker: record.blocker,
    tailAuthority: record.tailAuthority,
    roadEvidence: record.roadEvidence,
    googleQa: record.googleQa,
    preparedIdentityEvidence: record.preparedIdentityEvidence,
    preparedOccurrenceEvidence: record.preparedOccurrenceEvidence,
  }))));

  if (packageFixture.schemaVersion !== "ascent-source-first-27-v1"
    || packageFixture.generatedFrom?.mainSha !== expectedMainSha
    || packageFixture.generatedFrom?.mainTree !== expectedMainTree
    || packageFixture.generatedFrom?.masterArtifactSha256 !== expectedMasterSha
    || packageFixture.generatedFrom?.repairMatrixArtifactSha256 !== expectedRepairMatrixSha
    || packageFixture.generatedFrom?.batch2DisplayArtifactSha256 !== expectedBatch2Sha
    || packageFixture.generatedFrom?.sourcePrecedence?.join("|")
      !== "directions_clear|written_directions_fallback|structured_road_sequence_historical_only") {
    errors.push("source-first package provenance or source precedence drifted");
  }
  if (packageFixture.authority?.repositoryPackageOnly !== true
    || packageFixture.authority?.productionApplied !== false
    || packageFixture.authority?.roadManagerProductionWrites !== false
    || packageFixture.authority?.graphRebuiltOrActivated !== false
    || packageFixture.authority?.publicGooglePublished !== false
    || packageFixture.authority?.cutoverChanged !== false
    || packageFixture.authority?.straightGpsTetherAuthority !== "neutral_only"
    || packageFixture.authority?.tealAuthorityCreated !== false) {
    errors.push("source-first package authority boundary drifted");
  }
  if (packageFixture.baselineAccounting?.total !== 247
    || packageFixture.baselineAccounting?.done !== 61
    || packageFixture.baselineAccounting?.gpsOnly !== 186) {
    errors.push("source-first package baseline accounting drifted");
  }
  if (records.length !== 27 || records.map((record) => record.padName).join("|") !== expectedPadNames.join("|")) {
    errors.push("source-first package is not the exact ordered 27-pad scope");
  }
  if (sourceFirstEvidenceSha !== expectedSourceFirstEvidenceSha) {
    errors.push("source-first directions/sequence/road-evidence digest drifted from the verified 247-pad audit extract");
  }

  const uniquePadIds = new Set();
  const uniqueLegacyIds = new Set();
  const uniqueNames = new Set();
  for (const record of records) {
    const source = sourceByPadId.get(record.padId);
    if (!source || !exactSourceFirstRecordBinding(record, source)) {
      errors.push(`${record.padName || record.padId} exact pad/revision/GPS binding drifted`);
      continue;
    }
    if (uniquePadIds.has(record.padId) || uniqueLegacyIds.has(record.legacyId) || uniqueNames.has(record.padName)) {
      errors.push(`${record.padName} duplicates a source-first identity`);
    }
    uniquePadIds.add(record.padId);
    uniqueLegacyIds.add(record.legacyId);
    uniqueNames.add(record.padName);

    if (record.directionSource !== "directions_clear"
      || record.cleanedRoadSequence !== sequenceFromDirectionsClear(record.directionsClear)
      || record.directionsClearSha256 !== sha256(record.directionsClear)
      || !sha256Pattern.test(record.directionsClearSha256)) {
      errors.push(`${record.padName} cleaned saved-direction source drifted`);
    }
    if (record.currentNavigationState !== "GPS_ONLY" || record.tailAuthority !== "neutral_gps_only") {
      errors.push(`${record.padName} was promoted beyond the authorized repository checkpoint`);
    }
    if (!Array.isArray(record.roadEvidence)
      || record.roadEvidence.some((row, index) => row.order !== index + 1)
      || forbiddenMatchingPattern.test(JSON.stringify(record.roadEvidence))) {
      errors.push(`${record.padName} road evidence is incomplete or uses a forbidden matcher`);
    }
    const cleanedTokens = new Set(record.roadEvidence.map((row) => row.rawSavedToken.toUpperCase()));
    if (record.legacyOnlyNamedRoadCandidates.some((token) => cleanedTokens.has(token.toUpperCase()))) {
      errors.push(`${record.padName} promoted a legacy-only road into the cleaned route`);
    }
    if (!record.blocker || record.blocker.trim().length < 12) {
      errors.push(`${record.padName} lacks a fail-closed disposition`);
    }
  }

  const count = (field, value) => records.filter((record) => record[field] === value).length;
  if (count("scopeClass", "READY_NOW") !== 2
    || count("scopeClass", "SINGLE_IDENTITY_FIX") !== 5
    || count("scopeClass", "SINGLE_OCCURRENCE_JUNCTION_FIX") !== 20
    || count("preparedStatus", "google_qa_pending") !== 2
    || count("preparedStatus", "identity_adoption_prepared_unapplied") !== 1
    || count("preparedStatus", "occurrence_checkpoint_prepared_unapplied") !== 1
    || count("preparedStatus", "held") !== 23) {
    errors.push("source-first scope/disposition counts drifted");
  }

  for (const record of records.filter((row) => row.googleQa)) {
    const url = googleCandidateUrl(record);
    const parameters = new URL(url).searchParams;
    if (record.googleQa.phoneOriginOmitted !== true
      || url !== record.googleQa.candidateUrl
      || parameters.has("origin")
      || parameters.get("destination") !== `${record.destination[1]},${record.destination[0]}`
      || parameters.get("waypoints") !== `${record.googleQa.waypoint[1]},${record.googleQa.waypoint[0]}`) {
      errors.push(`${record.padName} Google candidate URL or phone-origin contract drifted`);
    }
    validateGoogleCandidateEvidence(
      record,
      batch2Fixture.records.find((row) => row.padId === record.padId),
      errors,
    );
  }

  const shutway = records.find((record) => record.padName === "SHUTWAY");
  const vannelle = records.find((record) => record.padName === "VANNELLE");
  if (shutway?.googleQa?.expectedSavedRoadOrder?.join("|") !== "I-70|Exit 208|OH-149 N"
    || vannelle?.googleQa?.expectedSavedRoadOrder?.join("|") !== "I-70|Exit 216|OH-9 N"
    || vannelle?.cleanedRoadSequence.includes("→ Shepherdstown Rd →")) {
    errors.push("READY_NOW cleaned road order drifted or promoted VANNELLE proximity wording");
  }

  const borovich = records.find((record) => record.padName === "BOROVICH");
  for (const legacyOnly of ["OH-1", "OH-800 / Gehrig Rd", "OH-145", "Main St", "Becomes North Ave", "OH-148"]) {
    if (!borovich?.legacyOnlyNamedRoadCandidates.includes(legacyOnly)) {
      errors.push(`BOROVICH legacy-only exclusion is missing ${legacyOnly}`);
    }
  }
  const betts = records.find((record) => record.padName === "BETTS");
  if (/Skull|Styx/iu.test(betts?.cleanedRoadSequence || "")) {
    errors.push("BETTS imported a legacy-only Skullfork/Styx Hill road");
  }

  validateBella(records.find((record) => record.padName === "BELLA"), errors);
  validateHowell(records.find((record) => record.padName === "HOWELL"), graphFixture, errors);

  return {
    errors,
    summary: {
      records: records.length,
      readyNowGoogleQa: count("scopeClass", "READY_NOW"),
      identityAdoptionsPrepared: count("preparedStatus", "identity_adoption_prepared_unapplied"),
      occurrenceCheckpointsPrepared: count("preparedStatus", "occurrence_checkpoint_prepared_unapplied"),
      held: count("preparedStatus", "held"),
      googleQaPending: count("preparedStatus", "google_qa_pending"),
      productionWrites: 0,
      graphChanges: 0,
      publicGooglePublications: 0,
    },
  };
}

export function loadSourceFirst27Audit(root = v18Root) {
  const packageText = read(root, packageRelativePath);
  const sourceText = read(root, sourceRelativePath);
  const graphText = read(root, graphRelativePath);
  const batch2Text = read(root, batch2RelativePath);
  const bellaMigrationText = read(root, bellaMigrationRelativePath);
  const howellMigrationText = read(root, howellMigrationRelativePath);
  const errors = [];
  if (normalizedFileSha256(packageText) !== expectedPackageSha) errors.push("source-first package SHA-256 drifted");
  if (normalizedFileSha256(sourceText) !== expectedSourceSha) errors.push("frozen Ascent source fixture SHA-256 drifted");
  if (normalizedFileSha256(graphText) !== expectedGraphSha) errors.push("sealed Ascent graph fixture SHA-256 drifted");
  if (normalizedFileSha256(batch2Text) !== expectedBatch2Sha) errors.push("frozen Ascent Batch-2 display artifact SHA-256 drifted");
  if (normalizedFileSha256(bellaMigrationText) !== expectedBellaMigrationSha) errors.push("BELLA unapplied migration SHA-256 drifted");
  if (normalizedFileSha256(howellMigrationText) !== expectedHowellMigrationSha) errors.push("HOWELL unapplied migration SHA-256 drifted");
  const result = validateSourceFirst27({
    packageFixture: JSON.parse(packageText),
    sourceFixture: JSON.parse(sourceText),
    graphFixture: JSON.parse(graphText),
    batch2Fixture: JSON.parse(batch2Text),
  });
  return {
    ...result,
    errors: [...errors, ...result.errors],
    packageSha256: normalizedFileSha256(packageText),
  };
}

function main() {
  const result = loadSourceFirst27Audit();
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({
    status: "pass",
    packageSha256: result.packageSha256,
    ...result.summary,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
