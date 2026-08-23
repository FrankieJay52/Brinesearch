import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  auditSanitizedFallback,
  buildSanitizedFallback,
  getSanitizationReport,
  rawFallbackPath,
  sanitizedFallbackPath,
} from "./sanitize-pad-fallback-data.mjs";

const rawSource = JSON.parse(await readFile(rawFallbackPath, "utf8"));
const artifact = JSON.parse(await readFile(sanitizedFallbackPath, "utf8"));

function artifactRow(legacyId) {
  const row = artifact.pads.find((entry) => entry.legacyId === legacyId);
  assert.ok(row, `missing artifact row ${legacyId}`);
  return row;
}

function sourceIndex(legacyId) {
  const index = rawSource.pads.findIndex((entry) => entry._id === legacyId);
  assert.notEqual(index, -1, `missing source row ${legacyId}`);
  return index;
}

function patchRow(index, patch) {
  return {
    ...artifact,
    pads: artifact.pads.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
  };
}

test("the committed artifact is the deterministic allowlisted projection", () => {
  assert.deepEqual(auditSanitizedFallback(artifact, rawSource), {
    locations: 1262,
    pads: 1217,
    disposals: 45,
    mapped: 951,
    contentSha256: artifact.metadata.contentSha256,
  });
});

test("known nonphysical workbook headings are excluded with contiguous output ordinals", () => {
  const excludedIds = new Set([
    "expand--expand-in-west-virginia",
    "expand--west-virginia",
  ]);
  assert.ok(rawSource.pads.filter((row) => excludedIds.has(row._id)).length === excludedIds.size);
  assert.ok(artifact.pads.every((row) => !excludedIds.has(row.legacyId)));
  assert.deepEqual(
    artifact.pads.map((row) => row.ordinal),
    Array.from({ length: 1262 }, (_, index) => index + 1),
  );
});

test("the generator fails closed if either excluded tombstone changes raw shape", async (t) => {
  for (const legacyId of ["expand--expand-in-west-virginia", "expand--west-virginia"]) {
    for (const [mutation, patch] of [
      ["changed identifying value", (row) => ({ ...row, padName: `${row.padName} CHANGED` })],
      ["added source field", (row) => ({ ...row, unreviewedSourceField: true })],
    ]) {
      await t.test(`${legacyId}: ${mutation}`, () => {
        const index = sourceIndex(legacyId);
        const changedSource = {
          ...rawSource,
          pads: rawSource.pads.map((row, rowIndex) => rowIndex === index ? patch(row) : row),
        };
        assert.throws(
          () => buildSanitizedFallback(changedSource),
          new RegExp(`nonphysical tombstone ${legacyId} raw shape changed`),
        );
      });
    }
  }
});

test("the quarantine manifest is stable and covers every known corrupted optional value", () => {
  const report = getSanitizationReport(rawSource);
  assert.deepEqual(
    {
      issueCount: report.issueCount,
      recordCount: report.recordCount,
      fieldCounts: report.fieldCounts,
      manifestSha256: report.manifestSha256,
    },
    {
      issueCount: 157,
      recordCount: 153,
      fieldCounts: { county: 131, propertyNumbers: 7, township: 16, wellNames: 3 },
      manifestSha256: "383701dbefa43bbbdca396b30ca43fb47b988e372612b2fd50d84dcecf8151f3",
    },
  );
  assert.equal(report.issues.filter((issue) => issue.field === "county" && issue.sourceLength === 1149).length, 129);
});

test("known corrupt display and search values are absent while safe siblings remain", () => {
  assert.equal(artifactRow("expand--alan-h-degarmo").county, "");
  assert.equal(artifactRow("chesapeake--david-thompson").county, "");
  assert.equal(artifactRow("eog--groselle").county, "");
  assert.deepEqual(artifactRow("eog--shadow").wellNames, ["Shadow"]);
  assert.deepEqual(artifactRow("swn--jesse-stalder").wellNames, ["Jesse Stalder", "Jesse-Stalder"]);
  assert.deepEqual(artifactRow("gulfport--safreed").wellNames, ["Safreed"]);
  assert.deepEqual(artifactRow("gulfport--safreed").propertyNumbers, []);
  assert.ok(artifactRow("ascent--echo").propertyNumbers.every((value) => !value.includes("?")));
  assert.ok(artifact.pads.every((row) => !("written_directions" in row) && !("writtenDirections" in row)));
});

test("the audit rejects a forbidden internal key", () => {
  assert.throws(
    () => auditSanitizedFallback(patchRow(0, { researchNotes: "must not ship" }), rawSource),
    /forbidden key "researchNotes"/,
  );
});

test("the audit rejects any non-allowlisted key", () => {
  assert.throws(
    () => auditSanitizedFallback(patchRow(0, { displayOnly: true }), rawSource),
    /extra keys: displayOnly/,
  );
});

test("the generator and audit exclude all legacy operational directions", () => {
  assert.ok(rawSource.pads.some((row) => typeof row.writtenDirections === "string" && row.writtenDirections.length > 0));
  assert.ok(artifact.pads.every((row) => !("written_directions" in row) && !("writtenDirections" in row)));
  assert.throws(
    () => auditSanitizedFallback(patchRow(0, { written_directions: "legacy directions must not ship" }), rawSource),
    /forbidden key "written_directions"/,
  );
});

test("the audit rejects identity duplication", () => {
  assert.throws(
    () =>
      auditSanitizedFallback(
        patchRow(1, { legacyId: artifact.pads[0].legacyId, aliases: [artifact.pads[0].legacyId] }),
        rawSource,
      ),
    /duplicate identity/,
  );
});

test("the audit rejects a partial coordinate pair", () => {
  assert.throws(
    () => auditSanitizedFallback(patchRow(0, { longitude: null }), rawSource),
    /unsafe sanitized coordinates \(partial\)/,
  );
});

test("the artifact audit rejects reintroduced display corruption", () => {
  const index = artifact.pads.findIndex((row) => row.legacyId === "expand--alan-h-degarmo");
  assert.notEqual(index, -1);
  assert.throws(
    () => auditSanitizedFallback(patchRow(index, { county: "PAD-NAME ".repeat(200) }), rawSource),
    /county is unsafe \(too_long\)/,
  );
  assert.throws(
    () => auditSanitizedFallback(patchRow(index, { wellNames: ["turn right onto road"] }), rawSource),
    /wellNames contains an unsafe item \(direction_prose\)/,
  );
});

test("the generator rejects malformed required fields and unreviewed optional quarantines", () => {
  const index = sourceIndex("antero--albert");
  const withRequiredCorruption = {
    ...rawSource,
    pads: rawSource.pads.map((row, rowIndex) =>
      rowIndex === index ? { ...row, company: "CORRUPTED ".repeat(20) } : row,
    ),
  };
  assert.throws(() => buildSanitizedFallback(withRequiredCorruption), /unsafe required company \(too_long\)/);

  const withNewOptionalCorruption = {
    ...rawSource,
    pads: rawSource.pads.map((row, rowIndex) =>
      rowIndex === index ? { ...row, address: "PAD-NAME ".repeat(100) } : row,
    ),
  };
  assert.throws(() => buildSanitizedFallback(withNewOptionalCorruption), /quarantine manifest changed/);
});

test("the generator rejects swapped or out-of-service-area coordinates", () => {
  const changedSource = {
    ...rawSource,
    pads: rawSource.pads.map((row, index) =>
      index === 0 ? { ...row, latitude: row.longitude, longitude: row.latitude } : row,
    ),
  };
  assert.throws(() => buildSanitizedFallback(changedSource), /unsafe coordinates \(outside_service_area\)/);
});
