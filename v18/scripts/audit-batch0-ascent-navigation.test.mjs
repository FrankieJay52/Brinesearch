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
  "d7898e8c-1bb6-48f8-b5e0-87bc1898420e",
  "333598ca-37b3-4b44-9411-a490cc3da672",
  "166c5d6c-3a8d-4481-b8bf-5d74b7605f0d",
  "800c877a-6b4f-4a87-a710-b1e00af63c62",
  "fbdb5ee4-38d6-4801-81cc-8ad4abbb24e2",
  "ad5ef012-46f5-46ca-93c7-0f5b492cb201",
  "c10e2066-d6b7-4117-aea9-137dd1237b3a",
  "ca1560b5-4ea6-4eb7-a82e-de2467937eb2",
  "9aa065c0-8896-49e2-b02d-d4ca71acefc3",
  "47a0305e-c641-499b-990c-0f7fe83493b8",
  "cd4f6dcc-b603-4155-84b2-30d7ee87bbc7",
  "d6d0a0fd-1cd3-48ae-8e41-90d744b9f8f6",
  "a35f0ea7-13d7-45dd-8fe2-fe73e4964df2",
  "74032b6e-179d-4672-8720-55ac86cab232",
  "f2f82142-f6d8-4f8d-b440-2ff86f624158",
  "25dc9adf-e09a-4cfa-8900-59492fbad0ec",
  "f80dea77-db11-45f8-b30c-6c6abb85e469",
  "5c4a497e-cf33-48dd-8272-9fd06ebb9e6a",
  "83b27fd3-4615-4ea1-ad36-0b05b359f5d2",
  "475462f4-7e7a-4432-801c-5e513d5e953f",
  "691fb27b-2b35-471d-81fa-9239f6bd4081",
  "143f5268-33e4-4598-8101-40220b5cfdc4",
  "59061829-1122-4aae-872d-cf5024310373",
  "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
  "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b",
  "bb351070-6c94-45e5-942f-e155f9e86f7e",
  "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
  "41f0bfc3-7be1-450f-abfc-96dce544547b",
  "19a4f7ef-4334-4b1c-8443-2c5ccb323d1d",
  "fba35b8e-ccc6-406b-b27c-ac9ce4eed29d",
  "58c94af4-32b1-4f80-a278-a5f73688fa23",
  "bd2e0e20-8aa8-4e05-a4c0-0af312234853",
  "71c9c874-5514-46a4-8d91-b105c6734799",
  "ccf7415a-331b-440a-829d-28282a33cde1",
  "1e898176-672d-4174-8878-4aae0aee2128",
  "6c93d03a-76e8-4c03-b47e-8b7011c81a1a",
  "b22c557a-950a-4ed7-a65a-f4730b9bc727",
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

test("all forty-five reviewed ledger states require every exact record and destination field", () => {
  assert.equal(reviewedPadIds.length, 45);
  assert.equal(new Set(reviewedPadIds).size, 45);
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

test("BAKOS audit receipt exposes a reviewed handoff without promoting route authority", () => {
  const receipt = explicitReceiptForPad("d7898e8c-1bb6-48f8-b5e0-87bc1898420e");
  assert.match(receipt, /US-250 and Holly View Drive reviewed handoff/u);
  assert.doesNotMatch(receipt, /GPS fallback|approved public|public Google/u);
});

test("batch-7 audit receipts expose exact reviewed handoffs without promoting route authority", () => {
  for (const [padId, expectedRoad] of [
    ["fbdb5ee4-38d6-4801-81cc-8ad4abbb24e2", "Dutton Drive"],
    ["ad5ef012-46f5-46ca-93c7-0f5b492cb201", "Potts Road"],
    ["c10e2066-d6b7-4117-aea9-137dd1237b3a", "Fairpoint-Shepherdstown"],
    ["ca1560b5-4ea6-4eb7-a82e-de2467937eb2", "Lew Martin Road"],
    ["9aa065c0-8896-49e2-b02d-d4ca71acefc3", "Beech Road"],
  ]) {
    const receipt = explicitReceiptForPad(padId);
    assert.match(receipt, new RegExp(expectedRoad, "u"));
    assert.match(receipt, /unapproved/iu);
    assert.doesNotMatch(receipt, /approved public|public Google|graph approved/iu);
  }
});

test("batch-8 audit receipts expose exact reviewed handoffs without promoting route authority", () => {
  for (const [padId, expectedRoad] of [
    ["47a0305e-c641-499b-990c-0f7fe83493b8", "Potts Road"],
    ["cd4f6dcc-b603-4155-84b2-30d7ee87bbc7", "Sloans Run"],
    ["d6d0a0fd-1cd3-48ae-8e41-90d744b9f8f6", "Sloans Run"],
    ["a35f0ea7-13d7-45dd-8fe2-fe73e4964df2", "Barton-Blaine Road"],
  ]) {
    const receipt = explicitReceiptForPad(padId);
    assert.match(receipt, new RegExp(expectedRoad, "u"));
    assert.match(receipt, /unapproved/iu);
    assert.doesNotMatch(receipt, /approved public|public Google|graph approved/iu);
  }
});

test("batch-9 audit receipts expose exact reviewed handoffs without promoting route authority", () => {
  for (const [padId, expectedRoad] of [
    ["74032b6e-179d-4672-8720-55ac86cab232", "Shepherdstown Road / CR-64"],
    ["f2f82142-f6d8-4f8d-b440-2ff86f624158", "Chaney Road / TR-386"],
    ["25dc9adf-e09a-4cfa-8900-59492fbad0ec", "Morgan"],
    ["f80dea77-db11-45f8-b30c-6c6abb85e469", "Cox"],
    ["5c4a497e-cf33-48dd-8272-9fd06ebb9e6a", "Lodge"],
    ["83b27fd3-4615-4ea1-ad36-0b05b359f5d2", "Jockey Hollow Road / TR-254"],
    ["475462f4-7e7a-4432-801c-5e513d5e953f", "Archers Ridge Road / CR-2"],
    ["691fb27b-2b35-471d-81fa-9239f6bd4081", "Hill Road / TR-307"],
  ]) {
    const receipt = explicitReceiptForPad(padId);
    assert.match(receipt, new RegExp(expectedRoad, "u"));
    assert.match(receipt, /unapproved/iu);
    assert.doesNotMatch(receipt, /approved public|public Google|graph approved/iu);
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

test("PICKENS audit binding preserves its verified entrance and held authority", () => {
  const padId = "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b";
  const binding = reviewedBindingForPad(padId);
  assert.deepEqual(binding.directoryDestination, {
    gpsSource: "saved",
    coordinateRole: "verified driver entrance",
    latitude: 40.182544,
    longitude: -80.977135,
  });
  assert.match(explicitReceiptForPad(padId), /OH-519 turn reviewed handoff/u);
  assert.doesNotMatch(explicitReceiptForPad(padId), /approved (?:lease|access|public)/iu);
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
