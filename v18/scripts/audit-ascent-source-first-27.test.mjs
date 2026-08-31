import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  exactSourceFirstRecordBinding,
  loadSourceFirst27Audit,
  validateSourceFirst27,
} from "./audit-ascent-source-first-27.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(
  path.join(here, "fixtures/ascent-source-first-27-20260830.json"),
  "utf8",
));
const sourceFixture = JSON.parse(fs.readFileSync(
  path.join(here, "fixtures/ascent-pad-approach-source-20260829.json"),
  "utf8",
));
const graphFixture = JSON.parse(fs.readFileSync(
  path.join(here, "fixtures/ascent-pad-graph-runs-20260829.json"),
  "utf8",
));
const batch2Fixture = JSON.parse(fs.readFileSync(
  path.join(here, "../src/features/map/ascentPadApproaches.batch2.json"),
  "utf8",
));

const clonedInputs = () => ({
  packageFixture: structuredClone(fixture),
  sourceFixture: structuredClone(sourceFixture),
  graphFixture: structuredClone(graphFixture),
  batch2Fixture: structuredClone(batch2Fixture),
});

test("the exact 27-pad source-first package passes", () => {
  const result = loadSourceFirst27Audit();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.summary, {
    records: 27,
    readyNowGoogleQa: 2,
    identityAdoptionsPrepared: 1,
    occurrenceCheckpointsPrepared: 1,
    held: 23,
    googleQaPending: 2,
    productionWrites: 0,
    graphChanges: 0,
    publicGooglePublications: 0,
  });
});

test("exact source binding rejects stale and same-name records", () => {
  const record = fixture.records.find((row) => row.padName === "SHUTWAY");
  const source = sourceFixture.records.find((row) => row.padId === record.padId);
  assert.equal(exactSourceFirstRecordBinding(record, source), true);
  for (const [field, value] of [
    ["padId", "11111111-1111-4111-8111-111111111111"],
    ["legacyId", "ascent--other-shutway"],
    ["recordRevision", "stale"],
    ["company", "Other"],
    ["padName", "SHUTWAY EAST"],
    ["state", "West Virginia"],
    ["county", "Harrison"],
    ["legacyStructuredRoadSequence", `${record.legacyStructuredRoadSequence} → changed`],
  ]) {
    assert.equal(exactSourceFirstRecordBinding({ ...record, [field]: value }, source), false, field);
  }
  assert.equal(exactSourceFirstRecordBinding({
    ...record,
    destination: [record.destination[0], record.destination[1] + 0.000001],
  }, source), false);
});

test("legacy-only roads cannot enter a cleaned route", () => {
  const inputs = clonedInputs();
  const borovich = inputs.packageFixture.records.find((row) => row.padName === "BOROVICH");
  borovich.roadEvidence.push({
    ...borovich.roadEvidence.at(-1),
    order: borovich.roadEvidence.length + 1,
    rawSavedToken: "OH-145",
  });
  const result = validateSourceFirst27(inputs);
  assert.ok(result.errors.some((error) => error.includes("legacy-only road")));
});

test("cleaned source and road evidence remain bound to the verified master extract", () => {
  const inputs = clonedInputs();
  const shutway = inputs.packageFixture.records.find((row) => row.padName === "SHUTWAY");
  shutway.directionsClear = shutway.directionsClear.replace("4.5 miles", "4.6 miles");
  shutway.directionsClearSha256 = createHash("sha256")
    .update(shutway.directionsClear, "utf8")
    .digest("hex");
  const result = validateSourceFirst27(inputs);
  assert.ok(result.errors.some((error) => error.includes("road-evidence digest drifted")));
});

test("exact per-pad disposition and blocker text remain bound to the package", () => {
  const inputs = clonedInputs();
  const oliver = inputs.packageFixture.records.find((row) => row.padName === "OLIVER");
  const patriot = inputs.packageFixture.records.find((row) => row.padName === "PATRIOT");
  [oliver.blocker, patriot.blocker] = [patriot.blocker, oliver.blocker];
  const result = validateSourceFirst27(inputs);
  assert.ok(result.errors.some((error) => error.includes("road-evidence digest drifted")));
});

test("fuzzy, name-only, and nearest matching fail closed", () => {
  for (const forbidden of ["fuzzy_name", "name_only", "nearest_road"]) {
    const inputs = clonedInputs();
    inputs.packageFixture.records[0].roadEvidence[0].mappingStatus = forbidden;
    const result = validateSourceFirst27(inputs);
    assert.ok(result.errors.some((error) => error.includes("forbidden matcher")), forbidden);
  }
});

test("neutral GPS tails cannot become teal or road geometry", () => {
  const inputs = clonedInputs();
  inputs.packageFixture.records[0].tailAuthority = "teal_lease_road";
  const result = validateSourceFirst27(inputs);
  assert.ok(result.errors.some((error) => error.includes("promoted beyond")));
});

test("VANNELLE proximity wording cannot become a required road", () => {
  const inputs = clonedInputs();
  const vannelle = inputs.packageFixture.records.find((row) => row.padName === "VANNELLE");
  vannelle.cleanedRoadSequence = "I-70 → Exit 216 → OH-9 N → Shepherdstown Rd → Pad";
  vannelle.directionsClear = vannelle.directionsClear.replace(
    "OH-9 N (7.5 miles) → Pad near Shepherdstown Rd / CR-64",
    "OH-9 N → Shepherdstown Rd → Pad",
  );
  const result = validateSourceFirst27(inputs);
  assert.ok(result.errors.some((error) => error.includes("proximity wording")));
});

test("Google candidates retain exact URL bytes and omit phone origin", () => {
  const inputs = clonedInputs();
  const shutway = inputs.packageFixture.records.find((row) => row.padName === "SHUTWAY");
  shutway.googleQa.candidateUrl += "&origin=Cadiz";
  const result = validateSourceFirst27(inputs);
  assert.ok(result.errors.some((error) => error.includes("Google candidate URL")));
});

test("Google controls remain bound to the frozen Batch-2 road endpoints", () => {
  const inputs = clonedInputs();
  const vannelle = inputs.batch2Fixture.records.find((row) => row.padName === "VANNELLE");
  vannelle.gpsTether.coordinates[0][0] += 0.000001;
  const result = validateSourceFirst27(inputs);
  assert.ok(result.errors.some((error) => error.includes("VANNELLE Google control drifted")));
});

test("BELLA identity evidence is exact and remains unapplied", () => {
  const inputs = clonedInputs();
  const bella = inputs.packageFixture.records.find((row) => row.padName === "BELLA");
  bella.preparedIdentityEvidence.authoritativeIdentityId = "11111111-1111-4111-8111-111111111111";
  const result = validateSourceFirst27(inputs);
  assert.ok(result.errors.includes("BELLA exact Airport Rd identity adoption evidence drifted"));
});

test("HOWELL legacy-bound display receipt is not source-first authority", () => {
  const inputs = clonedInputs();
  const howell = inputs.packageFixture.records.find((row) => row.padName === "HOWELL");
  howell.preparedOccurrenceEvidence.baselineGraphReceiptProvesCleanedOrder = true;
  const result = validateSourceFirst27(inputs);
  assert.ok(result.errors.includes("HOWELL checkpoint incorrectly promotes legacy-bound display evidence"));
});

test("HOWELL sealed baseline digest and junction drift fail closed", () => {
  const inputs = clonedInputs();
  const receipt = inputs.graphFixture.records.find((row) => row.padId === "2805772b-58c9-4a41-9c75-de5355f2904a");
  receipt.receiptSha256 = "0".repeat(64);
  const result = validateSourceFirst27(inputs);
  assert.ok(result.errors.includes("HOWELL persisted display evidence drifted from the sealed baseline receipt"));
});
