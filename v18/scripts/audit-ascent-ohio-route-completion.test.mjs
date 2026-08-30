import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  OLD_CORPUS_MISSING_IDS,
  PRODUCTION_SNAPSHOT,
  START_MAIN_SHA,
  START_MAIN_TREE,
  auditCheckedInPackage,
  csv,
  fixturePath,
  sha256,
  summarizeCompletionLedger,
  validateCompletionLedger,
} from "./audit-ascent-ohio-route-completion.mjs";
import path from "node:path";
import { repositoryRoot } from "./audit-ascent-ohio-route-completion.mjs";

const ledger = JSON.parse(await readFile(fixturePath, "utf8"));
const clone = () => structuredClone(ledger);

test("the checked-in 254-pad completion package is internally consistent", async () => {
  const result = await auditCheckedInPackage();
  assert.equal(result.summary.totalPads, 254);
  assert.match(result.csvSha256, /^[0-9a-f]{64}$/u);
  assert.match(result.markdownSha256, /^[0-9a-f]{64}$/u);
});

test("the immutable start and production snapshot are exact", () => {
  assert.deepEqual(ledger.generatedFrom.startMain, { sha: START_MAIN_SHA, tree: START_MAIN_TREE });
  assert.deepEqual(ledger.productionSnapshot, PRODUCTION_SNAPSHOT);
  assert.equal(ledger.authority.productionWrites, 0);
  assert.equal(ledger.authority.migrationsApplied, 0);
  assert.equal(ledger.authority.graphChanges, 0);
  assert.equal(ledger.authority.publicGooglePublication, 0);
  assert.equal(ledger.authority.cutover, 0);
});

test("247 to 254 reconciliation names every formerly omitted production record", () => {
  assert.equal(ledger.oldCorpusDifference.oldCount, 247);
  assert.equal(ledger.oldCorpusDifference.currentCount, 254);
  assert.deepEqual(ledger.oldCorpusDifference.missingPadIds, OLD_CORPUS_MISSING_IDS);
  assert.deepEqual(
    ledger.oldCorpusDifference.records.map((row) => row.padName),
    ["ALDERMAN", "DURR", "GATTI", "KANTOR", "ROLIFF", "WEIDINGER W", "WILEY"],
  );
  for (const id of OLD_CORPUS_MISSING_IDS) {
    const pad = ledger.pads.find((candidate) => candidate.identity.padId === id);
    assert(pad);
    assert.equal(pad.identity.county, null);
    assert.equal(pad.destination.available, false);
    assert.equal(pad.finalDisposition, "HELD_DESTINATION");
  }
});

test("source precedence and immutable source-byte digests hold for all pads", () => {
  assert.deepEqual(ledger.sourcePrecedence, [
    "directions_clear",
    "written_directions_fallback",
    "structured_road_sequence_historical_only",
  ]);
  for (const pad of ledger.pads) {
    const directions = pad.directions;
    const primary = directions.primarySource === "directions_clear"
      ? directions.directionsClear
      : directions.writtenDirections;
    assert.equal(sha256(Buffer.from(primary, "utf8")), directions.primarySourceSha256);
    if (directions.directionsClear !== null) assert.equal(directions.primarySource, "directions_clear");
    if (directions.directionsClear === null) {
      assert.equal(directions.primarySource, "written_directions");
      assert.equal(directions.cleanedRoadOrder, null);
    }
    assert.equal(directions.sourceBytesPreserved, true);
  }
  assert.deepEqual(ledger.summary.directionSources, { directions_clear: 249, written_directions: 5 });
});

test("every cleaned-source road occurrence is exact or explicitly held without fuzzy promotion", () => {
  for (const pad of ledger.pads) {
    for (const occurrence of pad.roadOccurrences) {
      assert.ok(["resolved", "held", "not_applicable"].includes(occurrence.identity.state));
      assert.ok(["resolved", "held", "not_applicable"].includes(occurrence.occurrence.state));
      assert.ok(["resolved", "held", "not_applicable"].includes(occurrence.geometry.state));
      assert.equal(occurrence.evidence.nearestRoadUsed, false);
      assert.equal(occurrence.evidence.fuzzyMatchingUsed, false);
      assert.equal(occurrence.evidence.nameOnlyPromotionUsed, false);
      if (occurrence.classification === "public_named" && occurrence.identity.state === "held") {
        assert.ok(occurrence.identity.holdReason);
      }
      if (occurrence.presentation.teal) {
        assert.equal(occurrence.classification, "public_named");
        assert.equal(occurrence.identity.state, "resolved");
        assert.equal(occurrence.occurrence.state, "resolved");
        assert.equal(occurrence.geometry.state, "resolved");
      }
    }
  }
});

test("every adjacent named transition is exact, held, or a proven same-road continuation", () => {
  for (const pad of ledger.pads) {
    for (const transition of pad.transitions) {
      assert.ok(["resolved", "held", "not_applicable"].includes(transition.state));
      assert.equal(transition.nearestRoadUsed, false);
      assert.equal(transition.visualCrossingUsed, false);
      if (transition.state === "resolved") {
        assert.match(transition.junctionId, /^[0-9a-f-]{36}$/u);
        assert.ok(Number.isFinite(transition.latitude));
        assert.ok(Number.isFinite(transition.longitude));
      }
      if (transition.state === "held") assert.ok(transition.holdReason);
    }
  }
});

test("private and terminal remainders never acquire teal authority", () => {
  for (const pad of ledger.pads) {
    for (const occurrence of pad.roadOccurrences.filter((row) => row.classification !== "public_named")) {
      assert.equal(occurrence.presentation.teal, false);
    }
    if (pad.finalLeg.privateConnector.state !== "resolved") {
      assert.equal(pad.finalLeg.privateConnector.presentation, "neutral_or_absent");
      assert.equal(pad.finalLeg.privateConnector.teal, false);
    }
  }
  assert.equal(ledger.authority.straightGpsTetherTealAuthority, false);
});

test("all 61 reviewed contracts remain byte-stable and COLOGIE remains the sole ready route", () => {
  const done = ledger.pads.filter((pad) => pad.currentNavigation.state === "DONE");
  assert.equal(done.length, 61);
  assert.ok(done.every((pad) => pad.currentNavigation.contractByteStable));
  const cologie = ledger.pads.find((pad) => pad.identity.padName === "COLOGIE");
  assert.equal(cologie.identity.padId, "e2b32e85-9e93-4388-8215-9d8167cbbeb8");
  assert.equal(cologie.finalDisposition, "COLOGIE_READY");
  assert.equal(ledger.pads.filter((pad) => pad.finalDisposition === "COLOGIE_READY").length, 1);
});

test("SHUTWAY and VANNELLE candidates omit origin and remain Google QA pending", () => {
  for (const name of ["SHUTWAY", "VANNELLE"]) {
    const pad = ledger.pads.find((candidate) => candidate.identity.padName === name);
    assert.equal(pad.finalDisposition, "GOOGLE_QA_PENDING");
    assert.equal(pad.currentNavigation.state, "GPS_ONLY");
    assert.equal(pad.google.qaStatus, "interactive_two_origin_qa_not_transmitted");
    const url = new URL(pad.google.candidateUrl);
    assert.equal(url.searchParams.has("origin"), false);
    assert.equal(url.searchParams.get("dir_action"), "navigate");
    assert.ok(pad.google.controls.length >= 1 && pad.google.controls.length <= 3);
    assert.equal(pad.google.rendererOnly, true);
  }
});

test("only three exact-evidence migrations are prepared and all remain unapplied", () => {
  assert.deepEqual(ledger.preparedMigrations.map((migration) => migration.file), [
    "20260830105500_ascent_bella_airport_identity.sql",
    "20260830105506_ascent_howell_occurrence_checkpoint.sql",
    "20260830105511_ascent_cricket_foxes_identity_binding.sql",
  ]);
  assert.ok(ledger.preparedMigrations.every((migration) => migration.applicationState === "UNAPPLIED"));
  assert.ok(ledger.preparedMigrations.every((migration) => /^[0-9a-f]{64}$/u.test(migration.normalizedSha256)));
});

test("prepared SQL is fail-closed, pad-scoped, and creates no route or publication authority", async () => {
  const sqlByFile = Object.fromEntries(await Promise.all(ledger.preparedMigrations.map(async (migration) => [
    migration.file,
    await readFile(path.join(repositoryRoot, "supabase/migrations", migration.file), "utf8"),
  ])));
  const bella = sqlByFile["20260830105500_ascent_bella_airport_identity.sql"];
  const howell = sqlByFile["20260830105506_ascent_howell_occurrence_checkpoint.sql"];
  const cricket = sqlByFile["20260830105511_ascent_cricket_foxes_identity_binding.sql"];
  assert.match(bella, /807ccb15-6f57-4c7a-978d-ab02e7a7c4ba/u);
  assert.match(bella, /OH:ODOT:NLF:CHASCR00038\*\*C/u);
  assert.match(bella, /approved_by_default[^;]*false/iu);
  assert.match(howell, /2805772b-58c9-4a41-9c75-de5355f2904a/u);
  assert.match(howell, /st_makepoint\(-80\.7788733, 40\.2739904\)/u);
  assert.match(howell, /route_authority[^;]*false/iu);
  assert.match(howell, /google_publication[^;]*false/iu);
  assert.match(cricket, /3a72c3df-f0a1-4639-a468-019989c78f43/u);
  assert.match(cricket, /update public\.brinesearch_route_prep_steps/iu);
  assert.doesNotMatch(cricket, /insert\s+into\s+public\.brinesearch_(?:roads|authoritative_road_identities|road_identity_mappings)/iu);
  for (const sql of Object.values(sqlByFile)) {
    assert.match(sql, /raise exception/iu);
    assert.doesNotMatch(sql, /(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?brinesearch_issue97_graph_builds/iu);
    assert.doesNotMatch(sql, /(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?brinesearch_v18_(?:public_google|route_releases)/iu);
  }
});

test("the deterministic disposition/accounting summary covers all 254 pads once", () => {
  assert.deepEqual(ledger.summary, summarizeCompletionLedger(ledger.pads));
  assert.deepEqual(ledger.summary.dispositions, {
    COLOGIE_READY: 1,
    GOOGLE_QA_PENDING: 2,
    HELD_DESTINATION: 7,
    HELD_GEOMETRY: 6,
    HELD_IDENTITY: 104,
    HELD_TRANSITION: 71,
    INSUFFICIENT: 3,
    REVIEWED_HANDOFF_READY: 60,
  });
  assert.equal(Object.values(ledger.summary.dispositions).reduce((sum, value) => sum + value, 0), 254);
});

test("the validator rejects a silently omitted pad", () => {
  const changed = clone();
  changed.pads.pop();
  assert.throws(() => validateCompletionLedger(changed), /all current Ohio Ascent pads/u);
});

test("the validator rejects a promoted private connector", () => {
  const changed = clone();
  const target = changed.pads.find((pad) => pad.finalLeg.privateConnector.state === "held");
  target.finalLeg.privateConnector.teal = true;
  assert.throws(() => validateCompletionLedger(changed), /false/u);
});

test("the validator rejects stale source bytes", () => {
  const changed = clone();
  changed.pads[0].directions.primarySourceSha256 = "0".repeat(64);
  assert.throws(() => validateCompletionLedger(changed), /source bytes drifted/u);
});

test("CSV cells fail closed against spreadsheet formula injection", () => {
  assert.equal(csv("=HYPERLINK(\"https://example.invalid\")"), '"\'=HYPERLINK(""https://example.invalid"")"');
  assert.equal(csv("ordinary"), "ordinary");
});
