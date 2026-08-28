import assert from "node:assert/strict";
import test from "node:test";
import {
  auditCoordinatePair,
  candidateContentDigest,
  csv,
  hostedBuildArtifact,
  parseMarkdownProvenance,
  markdownSummary,
  reviewedActionDestinationForPad,
  reviewedBindingForPad,
  reviewedBindingMatches,
} from "./audit-batch0-ascent-navigation.mjs";

const reviewedPadIds = [
  "143f5268-33e4-4598-8101-40220b5cfdc4",
  "59061829-1122-4aae-872d-cf5024310373",
  "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
  "bb351070-6c94-45e5-942f-e155f9e86f7e",
  "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
];

function rowFor(binding) {
  return {
    padId: binding.padId,
    legacyId: binding.legacyId,
    recordRevision: binding.recordRevision,
    company: binding.company,
    padName: binding.padName,
    state: binding.state,
    county: binding.county,
    structuredRoadSequence: binding.structuredRoadSequence,
  };
}

test("CSV output neutralizes formula strings but keeps numeric longitudes numeric", () => {
  for (const value of ["=SUM(A1:A2)", "+cmd", "-formula", "@import", "  =hidden", "\r=cmd", "\n+cmd", "\u00a0@cmd", "\ufeff-formula"]) {
    assert.match(csv(value), /^"?'/u);
  }
  assert.equal(csv(-80.913577), "-80.913577");
  assert.equal(csv("ordinary text"), "ordinary text");
});

test("all five reviewed ledger states require every exact record and destination field", () => {
  for (const padId of reviewedPadIds) {
    const binding = reviewedBindingForPad(padId);
    assert.ok(binding, `missing binding for ${padId}`);
    const row = rowFor(binding);
    const destination = { ...binding.directoryDestination };
    assert.equal(reviewedBindingMatches(row, destination, binding), true);

    for (const field of ["padId", "legacyId", "recordRevision", "company", "padName", "state", "county", "structuredRoadSequence"]) {
      assert.equal(
        reviewedBindingMatches({ ...row, [field]: `${row[field]}-drift` }, destination, binding),
        false,
        `${padId} accepted drift in ${field}`,
      );
    }
    assert.equal(reviewedBindingMatches(row, { ...destination, gpsSource: "ODNR pad" }, binding), false);
    assert.equal(reviewedBindingMatches(row, { ...destination, coordinateRole: "verified driver entrance" }, binding), false);
    assert.equal(reviewedBindingMatches(row, { ...destination, latitude: destination.latitude + 0.000001 }, binding), false);
    assert.equal(reviewedBindingMatches(row, { ...destination, longitude: destination.longitude - 0.000001 }, binding), false);
  }
});

test("BILINOVICH keeps its saved lease reference separate from its ODNR action destination", () => {
  const padId = "59061829-1122-4aae-872d-cf5024310373";
  const binding = reviewedBindingForPad(padId);
  const actionDestination = reviewedActionDestinationForPad(padId);
  assert.deepEqual(binding.directoryDestination, { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.08863, longitude: -81.304164 });
  assert.deepEqual(actionDestination, { gpsSource: "ODNR pad", latitude: 40.08738445, longitude: -81.3028262 });
  assert.equal(reviewedBindingMatches(rowFor(binding), actionDestination, binding), false);
});

test("audit coordinates reject missing, partial, malformed, and out-of-area pairs", () => {
  assert.deepEqual(auditCoordinatePair("40.25403", "-80.913577"), { latitude: 40.25403, longitude: -80.913577 });
  for (const pair of [
    [null, null],
    [40.1, null],
    [null, -80.9],
    [true, -80.9],
    [40.1, {}],
    [0, 0],
    [100, -80.9],
    [40.1, -100],
  ]) {
    assert.equal(auditCoordinatePair(pair[0], pair[1]), null);
  }
});

test("candidate content digest is deterministic and changes with implementation content", () => {
  const first = candidateContentDigest([
    { path: "b.ts", content: "two" },
    { path: "a.ts", content: "one" },
  ]);
  const reordered = candidateContentDigest([
    { path: "a.ts", content: "one" },
    { path: "b.ts", content: "two" },
  ]);
  const changed = candidateContentDigest([
    { path: "a.ts", content: "changed" },
    { path: "b.ts", content: "two" },
  ]);
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.match(first, /^[a-f0-9]{64}$/u);
});

test("frozen CI provenance ignores only Netlify's build workspace", () => {
  assert.equal(hostedBuildArtifact(".netlify/build-state.json"), true);
  assert.equal(hostedBuildArtifact(".netlify\\plugins\\manifest.json"), true);
  assert.equal(hostedBuildArtifact("v18/src/untracked-route.ts"), false);
  assert.equal(hostedBuildArtifact("docs/untracked-evidence.md"), false);
});

test("durable summary identifies candidate content without claiming it is on main", () => {
  const summary = markdownSummary({
    provenance: {
      baseMainSha: "a".repeat(40),
      implementationSha: "b".repeat(40),
      candidateContentSha256: "c".repeat(64),
      uncommittedChanges: true,
      implementationPaths: ["v18/test.ts"],
    },
    snapshot: { snapshotId: "snapshot", sourceRevision: "revision" },
    rows: [],
    referenceDigest: "d".repeat(64),
    csvDigest: "e".repeat(64),
  });
  assert.match(summary, /candidate implementation content based on origin\/main/u);
  assert.doesNotMatch(summary, /on main `/u);
  assert.match(summary, /Uncommitted non-generated changes: \*\*yes\*\*/u);
  assert.match(summary, /generated CSV SHA-256/u);
});

test("saved provenance safely carries the exact implementation files into shallow CI", () => {
  const markdown = markdownSummary({
    provenance: {
      baseMainSha: "a".repeat(40),
      implementationSha: "b".repeat(40),
      candidateContentSha256: "c".repeat(64),
      uncommittedChanges: false,
      implementationPaths: ["v18/src/data/status.ts", "v18/src/features/pad/PadPage.tsx"],
    },
    snapshot: { snapshotId: "snapshot", sourceRevision: "8" },
    rows: [],
    referenceDigest: "reference",
    csvDigest: "csv",
  });
  assert.deepEqual(parseMarkdownProvenance(markdown), {
    baseMainSha: "a".repeat(40),
    implementationSha: "b".repeat(40),
    candidateContentSha256: "c".repeat(64),
    implementationPaths: ["v18/src/data/status.ts", "v18/src/features/pad/PadPage.tsx"],
  });
  assert.throws(
    () => parseMarkdownProvenance(markdown.replace("v18/src/data/status.ts", "../secret")),
    /unsafe path/u,
  );
});
