import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gitBlob } from "./audit-batch0-ascent-navigation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, "../..");
export const fixturePath = path.join(here, "fixtures/ascent-ohio-route-completion-20260830.json");
export const csvPath = path.join(repositoryRoot, "docs/ascent-ohio-route-completion-20260830.csv");
export const markdownPath = path.join(repositoryRoot, "docs/ascent-ohio-route-completion-20260830.md");

export const START_MAIN_SHA = "4ca9a97c91acee1f14c11b9a32880ab3c19fbad5";
export const START_MAIN_TREE = "1a75097c9bc577dcee41362ab4ebafb5229ee1bc";
export const PRODUCTION_SNAPSHOT = Object.freeze({
  snapshotId: "f5cf25b5-e130-47a1-8d20-17ebb59f4b64",
  sourceRevision: 12,
  rowCount: 1215,
  contentSha256: "388c41f955e374b9e13d1f9125db45c871882fec23ed8f8100cc12fdece86416",
});

export const FINAL_DISPOSITIONS = Object.freeze([
  "COLOGIE_READY",
  "REVIEWED_HANDOFF_READY",
  "GOOGLE_QA_PENDING",
  "HELD_IDENTITY",
  "HELD_TRANSITION",
  "HELD_GEOMETRY",
  "HELD_DESTINATION",
  "HELD_AUTHORITY",
  "INSUFFICIENT",
]);

export const OLD_CORPUS_MISSING_IDS = Object.freeze([
  "f52bdf46-6b4a-4901-8f66-175bb7220ad8",
  "7adbf888-6f25-4f8f-b306-649fcc9387f5",
  "878e60fe-cdfc-4bbb-a4e4-93b588bd2059",
  "a77e7898-9f9b-4fd8-82bb-da9ce26abd08",
  "31d0f9bb-09be-4253-bc6b-778e3e19a879",
  "e537c3cb-ac98-4a26-91b9-4d3bcfa1e525",
  "72b25dba-6279-41b6-b9fd-8ead758d0294",
]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizedNewlines(value) {
  return String(value).replace(/\r\n?/gu, "\n");
}

export function csv(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const safe = /^[\s\u00a0\ufeff]*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function countBy(values, key) {
  const counts = {};
  for (const value of values) {
    const bucket = typeof key === "function" ? key(value) : value[key];
    counts[bucket] = (counts[bucket] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function isFiniteCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function assertDigest(value, label) {
  assert.match(value, /^[0-9a-f]{64}$/u, `${label} must be SHA-256`);
}

function namedPublicOccurrences(pad) {
  return pad.roadOccurrences.filter((occurrence) => occurrence.classification === "public_named");
}

export function summarizeCompletionLedger(pads) {
  const occurrences = pads.flatMap((pad) => pad.roadOccurrences);
  const publicOccurrences = occurrences.filter((occurrence) => occurrence.classification === "public_named");
  const transitions = pads.flatMap((pad) => pad.transitions);
  const geometries = publicOccurrences.map((occurrence) => occurrence.geometry);
  return {
    totalPads: pads.length,
    currentNavigable: pads.filter((pad) => pad.currentNavigation.state === "DONE").length,
    currentGpsOnly: pads.filter((pad) => pad.currentNavigation.state === "GPS_ONLY").length,
    withoutDestination: pads.filter((pad) => !pad.destination.available).length,
    directionSources: countBy(pads, (pad) => pad.directions.primarySource),
    dispositions: countBy(pads, "finalDisposition"),
    roadOccurrences: {
      total: occurrences.length,
      namedPublic: publicOccurrences.length,
      privateOrTerminal: occurrences.length - publicOccurrences.length,
      exactIdentity: publicOccurrences.filter((occurrence) => occurrence.identity.state === "resolved").length,
      heldIdentity: publicOccurrences.filter((occurrence) => occurrence.identity.state === "held").length,
      resolvedOccurrence: publicOccurrences.filter((occurrence) => occurrence.occurrence.state === "resolved").length,
      heldOccurrence: publicOccurrences.filter((occurrence) => occurrence.occurrence.state === "held").length,
    },
    transitions: {
      total: transitions.length,
      resolved: transitions.filter((transition) => transition.state === "resolved").length,
      held: transitions.filter((transition) => transition.state === "held").length,
      notApplicable: transitions.filter((transition) => transition.state === "not_applicable").length,
    },
    geometry: {
      totalNamedOccurrences: geometries.length,
      resolved: geometries.filter((geometry) => geometry.state === "resolved").length,
      held: geometries.filter((geometry) => geometry.state === "held").length,
    },
  };
}

export function validateCompletionLedger(ledger) {
  assert.equal(ledger.schemaVersion, "ascent-ohio-route-completion-v1");
  assert.deepEqual(ledger.generatedFrom.startMain, {
    sha: START_MAIN_SHA,
    tree: START_MAIN_TREE,
  });
  assert.deepEqual(ledger.productionSnapshot, PRODUCTION_SNAPSHOT);
  assert.deepEqual(ledger.sourcePrecedence, [
    "directions_clear",
    "written_directions_fallback",
    "structured_road_sequence_historical_only",
  ]);
  assert.equal(ledger.authority.productionWrites, 0);
  assert.equal(ledger.authority.migrationsApplied, 0);
  assert.equal(ledger.authority.graphChanges, 0);
  assert.equal(ledger.authority.publicGooglePublication, 0);
  assert.equal(ledger.authority.cutover, 0);
  assert.equal(ledger.authority.straightGpsTetherTealAuthority, false);

  assert.equal(ledger.pads.length, 254, "all current Ohio Ascent pads must be represented");
  assert.equal(new Set(ledger.pads.map((pad) => pad.identity.padId)).size, 254, "pad UUIDs must be unique");
  const sortedIds = [...ledger.pads]
    .sort((left, right) => (left.identity.county || "").localeCompare(right.identity.county || "")
      || left.identity.padName.localeCompare(right.identity.padName)
      || left.identity.padId.localeCompare(right.identity.padId))
    .map((pad) => pad.identity.padId);
  assert.deepEqual(ledger.pads.map((pad) => pad.identity.padId), sortedIds, "pad order must be deterministic");

  const oldCorpusDifference = ledger.oldCorpusDifference;
  assert.equal(oldCorpusDifference.oldCount, 247);
  assert.equal(oldCorpusDifference.currentCount, 254);
  assert.deepEqual(oldCorpusDifference.missingPadIds, OLD_CORPUS_MISSING_IDS);
  assert.equal(oldCorpusDifference.records.length, 7);

  for (const pad of ledger.pads) {
    const { identity, destination, directions } = pad;
    assert.match(identity.padId, /^[0-9a-f-]{36}$/u, `${identity.padName} pad UUID`);
    assert.equal(identity.company, "Ascent");
    assert.equal(identity.state, "Ohio");
    assert.ok(identity.legacyId.startsWith("ascent--"));
    assert.ok(/^[0-9]+$/u.test(identity.recordRevision), `${identity.padName} record revision`);
    assert.ok(FINAL_DISPOSITIONS.includes(pad.finalDisposition), `${identity.padName} disposition`);
    assert.ok(["DONE", "GPS_ONLY", "UNAVAILABLE"].includes(pad.currentNavigation.state));
    assert.ok(["directions_clear", "written_directions"].includes(directions.primarySource));
    const primaryText = directions.primarySource === "directions_clear"
      ? directions.directionsClear
      : directions.writtenDirections;
    assert.ok(typeof primaryText === "string" && primaryText.length > 0, `${identity.padName} primary source text`);
    assertDigest(directions.primarySourceSha256, `${identity.padName} primary source`);
    assert.equal(sha256(Buffer.from(primaryText, "utf8")), directions.primarySourceSha256,
      `${identity.padName} source bytes drifted`);
    if (directions.directionsClear !== null) {
      assert.equal(directions.primarySource, "directions_clear", `${identity.padName} must prefer directions_clear`);
      assert.equal(sha256(Buffer.from(directions.directionsClear, "utf8")), directions.directionsClearSha256);
    } else {
      assert.equal(directions.primarySource, "written_directions");
      assert.equal(directions.cleanedRoadOrder, null, `${identity.padName} raw fallback must remain unstructured`);
    }
    if (directions.writtenDirections !== null) {
      assert.equal(sha256(Buffer.from(directions.writtenDirections, "utf8")), directions.writtenDirectionsSha256);
    }
    if (directions.olderStructuredRoadSequence !== null) {
      assert.equal(
        sha256(Buffer.from(directions.olderStructuredRoadSequence, "utf8")),
        directions.olderStructuredRoadSequenceSha256,
      );
    }

    if (destination.available) {
      assert.ok(isFiniteCoordinate(destination.latitude) && isFiniteCoordinate(destination.longitude));
    } else {
      assert.equal(destination.latitude, null);
      assert.equal(destination.longitude, null);
      assert.equal(pad.finalDisposition, "HELD_DESTINATION");
    }

    assert.deepEqual(
      pad.roadOccurrences.map((occurrence) => occurrence.index),
      pad.roadOccurrences.map((_, index) => index + 1),
      `${identity.padName} occurrence order`,
    );
    for (const occurrence of pad.roadOccurrences) {
      assert.ok(["public_named", "private_or_access", "exit_or_note", "terminal"].includes(occurrence.classification));
      assert.ok(["resolved", "held", "not_applicable"].includes(occurrence.identity.state));
      assert.ok(["resolved", "held", "not_applicable"].includes(occurrence.occurrence.state));
      assert.ok(["resolved", "held", "not_applicable"].includes(occurrence.geometry.state));
      if (occurrence.classification === "public_named") {
        assert.notEqual(occurrence.identity.state, "not_applicable");
        assert.notEqual(occurrence.occurrence.state, "not_applicable");
        assert.notEqual(occurrence.geometry.state, "not_applicable");
        if (occurrence.identity.state === "held") assert.ok(occurrence.identity.holdReason);
        if (occurrence.occurrence.state === "held") assert.ok(occurrence.occurrence.holdReason);
        if (occurrence.geometry.state === "held") assert.ok(occurrence.geometry.holdReason);
      } else {
        assert.equal(occurrence.presentation.teal, false, `${identity.padName} private/note occurrence cannot be teal`);
      }
      if (occurrence.presentation.teal) {
        assert.equal(occurrence.classification, "public_named");
        assert.equal(occurrence.identity.state, "resolved", `${identity.padName} teal identity must be exact`);
        assert.equal(occurrence.occurrence.state, "resolved", `${identity.padName} teal occurrence must be exact`);
        assert.equal(occurrence.geometry.state, "resolved", `${identity.padName} teal geometry must be exact`);
      }
      assert.equal(occurrence.evidence.nearestRoadUsed, false);
      assert.equal(occurrence.evidence.fuzzyMatchingUsed, false);
      assert.equal(occurrence.evidence.nameOnlyPromotionUsed, false);
    }
    for (const transition of pad.transitions) {
      assert.ok(["resolved", "held", "not_applicable"].includes(transition.state));
      if (transition.state === "held") assert.ok(transition.holdReason);
      if (transition.state === "resolved") {
        assert.match(transition.junctionId, /^[0-9a-f-]{36}$/u);
        assert.ok(isFiniteCoordinate(transition.latitude) && isFiniteCoordinate(transition.longitude));
      }
      assert.equal(transition.nearestRoadUsed, false);
      assert.equal(transition.visualCrossingUsed, false);
    }
    if (pad.finalLeg.privateConnector.state !== "resolved") {
      assert.equal(pad.finalLeg.privateConnector.presentation, "neutral_or_absent");
      assert.equal(pad.finalLeg.privateConnector.teal, false);
    }
    if (pad.google.candidateUrl !== null) {
      const url = new URL(pad.google.candidateUrl);
      assert.equal(url.searchParams.has("origin"), false, `${identity.padName} Google origin must be phone current location`);
      assert.equal(url.searchParams.get("dir_action"), "navigate");
      assert.ok(pad.google.controls.length >= 1 && pad.google.controls.length <= 3);
    }
  }

  const summary = summarizeCompletionLedger(ledger.pads);
  assert.deepEqual(ledger.summary, summary);
  assert.deepEqual(summary.dispositions, {
    COLOGIE_READY: 1,
    GOOGLE_QA_PENDING: 2,
    HELD_DESTINATION: 7,
    HELD_GEOMETRY: 6,
    HELD_IDENTITY: 104,
    HELD_TRANSITION: 71,
    INSUFFICIENT: 3,
    REVIEWED_HANDOFF_READY: 60,
  });
  assert.equal(summary.currentNavigable, 61);
  assert.equal(summary.currentGpsOnly, 186);
  assert.equal(summary.withoutDestination, 7);
  assert.deepEqual(summary.directionSources, { directions_clear: 249, written_directions: 5 });

  const cologie = ledger.pads.find((pad) => pad.identity.padName === "COLOGIE");
  assert(cologie);
  assert.equal(cologie.finalDisposition, "COLOGIE_READY");
  assert.equal(cologie.identity.padId, "e2b32e85-9e93-4388-8215-9d8167cbbeb8");
  assert.equal(cologie.currentNavigation.contractByteStable, true);

  for (const padName of ["SHUTWAY", "VANNELLE"]) {
    const pad = ledger.pads.find((candidate) => candidate.identity.padName === padName);
    assert(pad);
    assert.equal(pad.finalDisposition, "GOOGLE_QA_PENDING");
    assert.equal(pad.google.qaStatus, "interactive_two_origin_qa_not_transmitted");
    assert.equal(pad.currentNavigation.state, "GPS_ONLY");
  }

  assert.equal(ledger.preparedMigrations.length, 3);
  for (const migration of ledger.preparedMigrations) {
    assert.equal(migration.applicationState, "UNAPPLIED");
    assertDigest(migration.normalizedSha256, migration.file);
  }
  return summary;
}

export async function auditCheckedInPackage() {
  const ledger = JSON.parse(await readFile(fixturePath, "utf8"));
  const summary = validateCompletionLedger(ledger);

  const csvText = normalizedNewlines(await readFile(csvPath, "utf8"));
  const csvRows = csvText.trimEnd().split("\n");
  assert.equal(csvRows.length, 255, "CSV must contain one header and 254 pad rows");
  for (const pad of ledger.pads) {
    assert.ok(csvText.includes(pad.identity.padId), `${pad.identity.padName} missing from CSV`);
  }

  const markdown = normalizedNewlines(await readFile(markdownPath, "utf8"));
  for (const value of [
    START_MAIN_SHA,
    START_MAIN_TREE,
    PRODUCTION_SNAPSHOT.snapshotId,
    PRODUCTION_SNAPSHOT.contentSha256,
    "254 current Ohio Ascent pads",
    "247 → 254",
    "production writes = 0",
    "migrations applied = 0",
  ]) assert.ok(markdown.includes(value), `Markdown checkpoint missing ${value}`);

  for (const [relativePath, expectedSha256] of Object.entries(ledger.frozenRuntimeGitBlobSha256)) {
    const bytes = gitBlob(relativePath, { cwd: repositoryRoot });
    assert(bytes, `frozen runtime path missing: ${relativePath}`);
    assert.equal(sha256(bytes), expectedSha256, `${relativePath} is not byte-stable`);
  }

  const mapPage = gitBlob("v18/src/features/map/MapPage.tsx", { cwd: repositoryRoot }).toString("utf8");
  assert.ok(mapPage.includes("if (!snapshot) return"), "saved-directory recovery was removed");
  assert.ok(!mapPage.includes("if (!snapshot || error)"), "directory refresh errors must not blank a saved map");
  assert.ok(mapPage.includes("ascentPadRoadLayerIdsInPaintOrder.slice(0, 6)"), "neutral/red layering checkpoint missing");
  assert.ok(mapPage.indexOf("ascentPadRoadLayerIdsInPaintOrder.slice(0, 6)")
    < mapPage.indexOf("map.moveLayer(highwayReferenceCasingLayerId)"), "OH-7/highway reference must remain above neutral/red approaches");

  const mammoth = ledger.productionRegressionEvidence.mammoth;
  assert.deepEqual(mammoth, {
    padId: "d20cc586-7dad-40d3-8d40-c6c3e7604a56",
    legacyId: "eog--mammoth",
    company: "Eog",
    padName: "MAMMOTH",
    state: "Ohio",
    county: "Noble",
    recordRevision: "1788076094488963",
    latitude: 39.722808,
    longitude: -81.6058281,
    coordinateState: "verified",
  });

  for (const migration of ledger.preparedMigrations) {
    const relativePath = `supabase/migrations/${migration.file}`;
    // New migrations are intentionally auditable before their first commit. Once
    // committed, immutable Git bytes remain the authority; the fallback exists
    // only while the exact new path is still untracked in this worktree.
    const bytes = gitBlob(relativePath, { cwd: repositoryRoot })
      || await readFile(path.join(repositoryRoot, relativePath));
    assert(bytes, `prepared migration missing: ${relativePath}`);
    assert.equal(sha256(normalizedNewlines(bytes.toString("utf8"))), migration.normalizedSha256,
      `${migration.file} digest drifted`);
  }

  return { ledger, summary, csvSha256: sha256(csvText), markdownSha256: sha256(markdown) };
}

async function main() {
  const result = await auditCheckedInPackage();
  console.log(JSON.stringify({
    startMain: { sha: START_MAIN_SHA, tree: START_MAIN_TREE },
    productionSnapshot: PRODUCTION_SNAPSHOT,
    ...result.summary,
    csvSha256: result.csvSha256,
    markdownSha256: result.markdownSha256,
    productionWrites: 0,
    migrationsApplied: 0,
    graphChanges: 0,
    publicGooglePublication: 0,
    cutover: 0,
  }, null, 2));
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) await main();
