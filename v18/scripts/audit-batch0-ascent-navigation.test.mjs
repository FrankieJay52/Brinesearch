import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  auditCoordinatePair,
  candidateContentDigest,
  csv,
  driverRuleStatusForState,
  ensureCommitAvailable,
  explicitReceiptForPad,
  frozenDigestUsesHistoricalContent,
  frozenProvenanceCheckoutMode,
  frozenProvenanceNeedsBaseHistory,
  gitBlob,
  gitBlobAt,
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

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
  "fa2d692c-4f3a-4a28-8985-3809c9dbd15d",
  "85d74b99-da49-4a5a-aadf-1ce2b461071c",
  "952f385d-659a-4f00-80c6-3aff474d5f27",
  "fcbf5085-4ba2-496d-9c20-516e8b52f9bd",
  "c09f4dd1-68f9-46d1-90b3-560240550ecd",
  "be83fc24-5c6a-49cd-88a0-52016ca7b657",
  "0b7ed9a5-7748-4d92-992a-7f2cecf9dd08",
  "73f48788-9990-435a-adee-999740e958de",
  "883420b3-07b9-4682-912e-42ba278d1132",
  "8e823835-2c10-4275-84e9-4067376fa364",
  "eae4741b-7fb4-4bc3-8b20-26043032acda",
  "0a2a4a64-6e64-4b7d-9652-e1a97db4fc4f",
  "25dc64b5-4a52-4cef-8b2c-62e7e36d64c7",
  "0f848006-4c09-4c7f-b9f2-4743d5ccd37f",
  "4213711f-0f23-440a-b0ec-42a1f9be4db0",
  "5a0ede1b-4586-4edc-9438-7cb29a24e58e",
  "8a7b9669-169d-45a5-bf55-b9be5cbd51e2",
  "45b2cfd7-1936-406d-bf6c-de0b8acc8e88",
  "18257dbf-d681-46dd-be38-a8e4a6aab56f",
  "69c63442-de05-4d15-95da-07da587bc070",
  "b9d1a8de-2ddd-4345-82a1-7e2a1f6ff2cb",
  "23053421-06d5-47a2-bf77-5c3fdea4939b",
  "83499ca1-3c45-4502-b7c2-688e88343093",
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

test("everyday driver status treats all reviewed named-road handoffs as DONE", () => {
  assert.equal(driverRuleStatusForState("1"), "DONE");
  assert.equal(driverRuleStatusForState("2"), "DONE");
  assert.equal(driverRuleStatusForState("reviewed_handoff_authority_held"), "DONE");
  assert.equal(driverRuleStatusForState("3"), "GPS_ONLY");
  assert.equal(driverRuleStatusForState("unknown"), "UNAVAILABLE");
});

test("all sixty-eight reviewed ledger states require every exact record and destination field", () => {
  assert.equal(reviewedPadIds.length, 68);
  assert.equal(new Set(reviewedPadIds).size, 68);
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

test("six highway-direct receipts preserve their unapproved final GPS handoff without owner authority", () => {
  for (const [padId, expectedRoad] of [
    ["fa2d692c-4f3a-4a28-8985-3809c9dbd15d", "OH-147"],
    ["85d74b99-da49-4a5a-aadf-1ce2b461071c", "OH-147"],
    ["952f385d-659a-4f00-80c6-3aff474d5f27", "OH-147"],
    ["fcbf5085-4ba2-496d-9c20-516e8b52f9bd", "OH-285"],
    ["c09f4dd1-68f9-46d1-90b3-560240550ecd", "OH-147"],
    ["be83fc24-5c6a-49cd-88a0-52016ca7b657", "US-22"],
  ]) {
    const receipt = explicitReceiptForPad(padId);
    assert.match(receipt, new RegExp(expectedRoad, "u"));
    assert.match(receipt, /unapproved/iu);
    assert.doesNotMatch(receipt, /owner[- ](?:approved|reviewed)|approved public|public Google|graph approved/iu);
  }
});

test("six first-wave audit receipts preserve reviewed roads without owner authority", () => {
  for (const [padId, expectedRoad] of [
    ["73f48788-9990-435a-adee-999740e958de", "Lloydsville-Bannock Rd / CR-80"],
    ["883420b3-07b9-4682-912e-42ba278d1132", "Salem Rd / CR-74"],
    ["8e823835-2c10-4275-84e9-4067376fa364", "Nighthawk Rd"],
    ["eae4741b-7fb4-4bc3-8b20-26043032acda", "Nighthawk Rd"],
    ["0a2a4a64-6e64-4b7d-9652-e1a97db4fc4f", "New Gottengen Rd"],
    ["25dc64b5-4a52-4cef-8b2c-62e7e36d64c7", "Bridgewater Rd"],
  ]) {
    const receipt = explicitReceiptForPad(padId);
    assert.match(receipt, new RegExp(expectedRoad.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.match(receipt, /unapproved/iu);
    assert.doesNotMatch(receipt, /owner[- ](?:approved|reviewed)|approved public|public Google|graph approved/iu);
  }
});

test("ten second-wave audit receipts preserve reviewed roads without owner authority", () => {
  for (const [padId, expectedRoad] of [
    ["0f848006-4c09-4c7f-b9f2-4743d5ccd37f", "Buckingham Rd / TR-232"],
    ["4213711f-0f23-440a-b0ec-42a1f9be4db0", "Cumberland Run Rd"],
    ["5a0ede1b-4586-4edc-9438-7cb29a24e58e", "Unity Church Rd"],
    ["8a7b9669-169d-45a5-bf55-b9be5cbd51e2", "Bond Ln"],
    ["45b2cfd7-1936-406d-bf6c-de0b8acc8e88", "CR-25"],
    ["18257dbf-d681-46dd-be38-a8e4a6aab56f", "Dawson Rd"],
    ["69c63442-de05-4d15-95da-07da587bc070", "OH-149"],
    ["b9d1a8de-2ddd-4345-82a1-7e2a1f6ff2cb", "Elm States Rd"],
    ["23053421-06d5-47a2-bf77-5c3fdea4939b", "Shepherstown Rd"],
    ["83499ca1-3c45-4502-b7c2-688e88343093", "Campbell-johnson Hill Rd"],
  ]) {
    const receipt = explicitReceiptForPad(padId);
    assert.match(receipt, new RegExp(expectedRoad.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.match(receipt, /unapproved/iu);
    assert.doesNotMatch(receipt, /owner[- ](?:approved|reviewed)|approved public|public Google|graph approved/iu);
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

test("batch-10 audit receipt exposes WINSTON SMITH's exact reviewed handoff without promoting route authority", () => {
  const receipt = explicitReceiptForPad("0b7ed9a5-7748-4d92-992a-7f2cecf9dd08");
  assert.match(receipt, /Gurewicz Road \/ TR-303A/u);
  assert.match(receipt, /unapproved/iu);
  assert.doesNotMatch(receipt, /approved public|public Google|graph approved/iu);
});

test("SKULL FORK ledger receipt freezes the named-road-to-pin driver rule without route promotion", () => {
  const receipt = explicitReceiptForPad("06ac93a2-3b46-44fd-9fa6-2fd29201858a");
  assert.match(receipt, /Cadiz Road \/ US-22 → Repik Lane \/ TR-9876 → exact trusted pin/u);
  assert.match(receipt, /named-road-to-pin handoff is sufficient/u);
  assert.doesNotMatch(receipt, /approved (?:lease|pad-deck|public)|public Google|graph approved/iu);
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

test("tracked Git blobs larger than the default exec buffer are read completely", () => {
  const content = gitBlob("v18/src/features/map/ascentPadApproaches.batch2.json");
  assert.ok(content);
  assert.equal(content.length, 3_233_663);
  assert.equal(
    createHash("sha256").update(content).digest("hex"),
    "8ffb264ebd14696c933f472b80bfd791a172fe0b2f16a8232a3aaeb42088d79d",
  );
});

test("Git blob reads ignore CRLF worktree bytes and preserve committed LF bytes", async (context) => {
  const temporaryRepository = await mkdtemp(path.join(tmpdir(), "brinesearch-batch0-git-blob-"));
  context.after(() => rm(temporaryRepository, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet"], { cwd: temporaryRepository });
  execFileSync("git", ["config", "user.name", "BrineSearch test"], { cwd: temporaryRepository });
  execFileSync("git", ["config", "user.email", "brinesearch-test@example.invalid"], { cwd: temporaryRepository });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: temporaryRepository });
  const relativePath = "route.txt";
  const absolutePath = path.join(temporaryRepository, relativePath);
  await writeFile(absolutePath, "OH-9\nMaynard\n", "utf8");
  execFileSync("git", ["add", "--", relativePath], { cwd: temporaryRepository });
  execFileSync("git", ["commit", "--quiet", "-m", "Add LF route"], { cwd: temporaryRepository });
  await writeFile(absolutePath, "OH-9\r\nMaynard\r\n", "utf8");

  const committed = gitBlobAt("HEAD", relativePath, { cwd: temporaryRepository });
  assert.ok(committed);
  assert.equal(committed.toString("utf8"), "OH-9\nMaynard\n");
  assert.notDeepEqual(committed, await readFile(absolutePath));
});

test("Git blob reads return null only for a genuinely missing path", () => {
  assert.equal(gitBlobAt("HEAD", "v18/this-path-does-not-exist.txt"), null);
});

test("Git blob reads fail closed for ENOBUFS and other process errors", () => {
  const objectId = "a".repeat(40);
  for (const code of ["ENOBUFS", "EACCES"]) {
    const failure = Object.assign(new Error(`git failed with ${code}`), { code });
    const execFile = (_command, args) => {
      if (args[0] === "ls-tree") {
        return Buffer.from(`100644 blob ${objectId}\tlarge.bin\0`);
      }
      if (args[0] === "cat-file" && args[1] === "-s") {
        return Buffer.from("2000000\n");
      }
      throw failure;
    };
    assert.throws(
      () => gitBlobAt("HEAD", "large.bin", { cwd: repositoryRoot, execFile }),
      (error) => error === failure,
    );
  }
});

test("frozen historical substitution produces the canonical Batch 0 fingerprint", async () => {
  const markdown = await readFile(
    path.join(repositoryRoot, "docs", "batch0-ascent-six-county-navigation-ledger-20260827.md"),
    "utf8",
  );
  const frozen = parseMarkdownProvenance(markdown);
  ensureCommitAvailable(frozen.implementationSha);
  const entries = frozen.implementationPaths.map((relativePath) => {
    const content = frozenDigestUsesHistoricalContent(relativePath)
      ? gitBlobAt(frozen.implementationSha, relativePath)
      : gitBlob(relativePath);
    assert.ok(content, `missing frozen fingerprint input ${relativePath}`);
    return { path: relativePath, content };
  });
  assert.equal(candidateContentDigest(entries), frozen.candidateContentSha256);
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

test("frozen digest pins validator code historically but checks route/runtime content from the current tree", () => {
  assert.equal(frozenDigestUsesHistoricalContent("v18/scripts/audit-batch0-ascent-navigation.mjs"), true);
  assert.equal(frozenDigestUsesHistoricalContent("v18\\scripts\\audit-batch0-ascent-navigation.mjs"), true);
  assert.equal(frozenDigestUsesHistoricalContent("v18/src/features/map/MapPage.tsx"), false);
  assert.equal(frozenDigestUsesHistoricalContent("v18/scripts/audit-batch0-ascent-navigation.test.mjs"), false);
});

test("frozen provenance distinguishes the original candidate from post-merge descendant branches", () => {
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
  assert.equal(frozenProvenanceCheckoutMode({
    headSha: "c".repeat(40),
    originMainSha: "d".repeat(40),
    frozenBaseSha,
  }), "post-merge-descendant");
});

test("only the original candidate branch requires the frozen base commit history", () => {
  assert.equal(frozenProvenanceNeedsBaseHistory("candidate-branch"), true);
  assert.equal(frozenProvenanceNeedsBaseHistory("merged-main"), false);
  assert.equal(frozenProvenanceNeedsBaseHistory("post-merge-descendant"), false);
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
  assert.match(summary, /77 DONE reviewed named-road handoffs \/ 170 GPS_ONLY/u);
  assert.match(summary, /Cologie is the first working pad, not a higher grade/u);
  assert.match(summary, /They are not everyday driver grades or Navigate blockers/u);
  assert.match(summary, /remaining 170 pads have no reviewed named-road sequence yet and therefore remain GPS_ONLY/u);
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
