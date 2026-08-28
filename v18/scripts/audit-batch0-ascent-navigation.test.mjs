import assert from "node:assert/strict";
import test from "node:test";
import {
  auditCoordinatePair,
  candidateContentDigest,
  csv,
  explicitReceiptForPad,
  frozenProvenanceCheckoutMode,
  frozenProvenanceNeedsBaseHistory,
  githubMainRefreshRequired,
  hostedBuildArtifact,
  implementationPathSet,
  netlifyMainRefreshRequired,
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
  "fba35b8e-ccc6-406b-b27c-ac9ce4eed29d",
  "58c94af4-32b1-4f80-a278-a5f73688fa23",
  "bd2e0e20-8aa8-4e05-a4c0-0af312234853",
  "71c9c874-5514-46a4-8d91-b105c6734799",
  "ccf7415a-331b-440a-829d-28282a33cde1",
  "1e898176-672d-4174-8878-4aae0aee2128",
  "48d810bf-e59f-4314-9efb-8103a818a3bd",
  "8f616827-d7da-4b40-b9c2-49fd5e713822",
  "f2df293f-13a2-401e-96b2-21e71ac63e6a",
  "06ac93a2-3b46-44fd-9fa6-2fd29201858a",
  "351b72fb-eb48-4355-b6fc-d8e9a867f79c",
  "4c73e244-6132-4d40-83fc-3fe5e6e65bf6",
  "7dcd1f71-fa32-4edc-ae3d-aa9717d0c72c",
  "3850e94a-826f-4b6b-a54f-d21d482fca46",
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

test("all nineteen reviewed ledger states require every exact record and destination field", () => {
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
    assert.equal(reviewedBindingMatches(row, {
      ...destination,
      coordinateRole: destination.coordinateRole === "verified driver entrance"
        ? "saved pad reference"
        : "verified driver entrance",
    }, binding), false);
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

test("HOOP audit receipt stops reviewed authority at Titus Road", () => {
  const receipt = explicitReceiptForPad("351b72fb-eb48-4355-b6fc-d8e9a867f79c");
  assert.match(receipt, /US-22 and Titus Road reviewed approach/u);
  assert.match(receipt, /post-Titus GPS\/lease tail unapproved/u);
  assert.doesNotMatch(receipt, /Hoop Lane reviewed/u);
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
  assert.deepEqual(
    implementationPathSet(
      ["v18/src/data/status.ts"],
      ["v18/src/features/pad/dirty-outside-frozen.tsx"],
      [".netlify/cache/state.json", "v18/src/untracked-route.ts"],
      true,
    ),
    [
      "v18/src/data/status.ts",
      "v18/src/features/pad/dirty-outside-frozen.tsx",
      "v18/src/untracked-route.ts",
    ],
  );
});

test("frozen provenance accepts the exact merged main but rejects branch base drift", () => {
  const frozenBaseSha = "a".repeat(40);
  const mergedMainSha = "b".repeat(40);
  assert.equal(frozenProvenanceCheckoutMode({
    headSha: mergedMainSha,
    originMainSha: mergedMainSha,
    frozenBaseSha,
  }), "merged-main");
  assert.equal(frozenProvenanceCheckoutMode({
    headSha: "c".repeat(40),
    originMainSha: frozenBaseSha,
    frozenBaseSha,
  }), "candidate-branch");
  assert.throws(() => frozenProvenanceCheckoutMode({
    headSha: "c".repeat(40),
    originMainSha: "d".repeat(40),
    frozenBaseSha,
  }), /does not match current origin\/main/u);
});

test("only candidate branches require the frozen base commit history", () => {
  assert.equal(frozenProvenanceNeedsBaseHistory("candidate-branch"), true);
  assert.equal(frozenProvenanceNeedsBaseHistory("merged-main"), false);
  assert.throws(() => frozenProvenanceNeedsBaseHistory("unknown"), /Unsupported frozen provenance checkout mode/u);
});

test("Netlify refreshes main only for the exact build commit", () => {
  const headSha = "a".repeat(40);
  assert.equal(netlifyMainRefreshRequired({
    netlify: undefined,
    commitRef: undefined,
    headSha,
  }), false);
  assert.equal(netlifyMainRefreshRequired({
    netlify: "true",
    commitRef: headSha,
    headSha,
  }), true);
  assert.throws(() => netlifyMainRefreshRequired({
    netlify: "true",
    commitRef: "b".repeat(40),
    headSha,
  }), /does not match current HEAD/u);
});

test("GitHub refreshes main only for the exact build commit", () => {
  const headSha = "a".repeat(40);
  assert.equal(githubMainRefreshRequired({
    githubActions: undefined,
    githubSha: undefined,
    headSha,
  }), false);
  assert.equal(githubMainRefreshRequired({
    githubActions: "true",
    githubSha: headSha,
    headSha,
  }), true);
  assert.throws(() => githubMainRefreshRequired({
    githubActions: "true",
    githubSha: "b".repeat(40),
    headSha,
  }), /does not match current HEAD/u);
  assert.throws(() => githubMainRefreshRequired({
    githubActions: "true",
    githubSha: undefined,
    headSha,
  }), /does not match current HEAD/u);
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
