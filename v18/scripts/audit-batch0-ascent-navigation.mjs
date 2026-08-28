import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const outputCsv = path.join(repositoryRoot, "docs", "batch0-ascent-six-county-navigation-ledger-20260827.csv");
const outputMarkdown = path.join(repositoryRoot, "docs", "batch0-ascent-six-county-navigation-ledger-20260827.md");
const generatedAuditPaths = new Set([
  "docs/batch0-ascent-six-county-navigation-ledger-20260827.csv",
  "docs/batch0-ascent-six-county-navigation-ledger-20260827.md",
]);
const counties = ["Belmont", "Guernsey", "Harrison", "Jefferson", "Monroe", "Noble"];

const explicitStates = new Map([
  ["d7898e8c-1bb6-48f8-b5e0-87bc1898420e", {
    state: "3",
    blocker: "The frozen exact-route receipt has no current public mobile handoff; use the saved GPS destination only.",
    receipt: "BAKOS frozen route regression plus trusted GPS fallback",
  }],
  ["e2b32e85-9e93-4388-8215-9d8167cbbeb8", {
    state: "1",
    blocker: "",
    receipt: "Cologie exact public route and reviewed Google handoff",
  }],
  ["518659d9-bca2-47b0-b294-3141ba679fc4", {
    state: "2",
    blocker: "Approved public-road core ends at its exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "LASSO frozen exact-core destination release",
  }],
  ["185d9eb6-58af-4009-bf53-fdd23113a572", {
    state: "2",
    blocker: "Approved named public-road approaches end at an exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "CARDINAL named-approach release",
  }],
  ["95dcbd15-afd0-4357-a521-e23bcd6b4118", {
    state: "2",
    blocker: "Approved named public-road approaches end at an exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "CONOTTON named-approach release",
  }],
  ["61e21e3c-360b-40b0-8153-209b4fb3d5eb", {
    state: "2",
    blocker: "Approved named public-road approaches end at an exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "ELLEN named-approach release",
  }],
  ["b9a8e55c-3583-4019-85fc-54a03d420ace", {
    state: "2",
    blocker: "Approved named public-road approaches end at an exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "HAMILTON named-approach release",
  }],
  ["655a97d5-ffdf-4b13-bf66-3d22022239b4", {
    state: "2",
    blocker: "Approved named public-road approaches end at an exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "PETTAY named-approach release",
  }],
  ["f5a82acf-d7c0-4ce3-ad4e-0de810551450", {
    state: "2",
    blocker: "Approved named public-road approaches end at an exact handoff; the final saved-GPS leg is not approved geometry.",
    receipt: "SPROULL named-approach release",
  }],
  ["b7526e45-0b33-4988-ae1c-0a4140971f8e", {
    state: "2",
    blocker: "The approved OH-519 road core ends at the lease handoff; the final leg to the saved pin is GPS-only.",
    receipt: "BANJO frozen OH-519 named approach",
  }],
  ["0e6f23f1-3bfb-44b0-aa4e-f24dde611880", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "BEETLE exact-record Sixteen Road reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
      legacyId: "ascent--beetle",
      recordRevision: "1787459253071652",
      company: "Ascent",
      padName: "BEETLE",
      state: "Ohio",
      county: "Harrison",
      structuredRoadSequence: "OH-519 → US-250 → Pad",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.185403, longitude: -80.922718 },
    },
  }],
  ["bb351070-6c94-45e5-942f-e155f9e86f7e", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "DUKE exact-record Cologie-corridor reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
      legacyId: "ascent--duke",
      recordRevision: "1786265812046205",
      company: "Ascent",
      padName: "DUKE",
      state: "Ohio",
      county: "Harrison",
      structuredRoadSequence: "US-250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.214409, longitude: -80.891316 },
    },
  }],
  ["0b7105a0-1b36-4182-8d10-1f2e297c8bab", {
    state: "reviewed_handoff_authority_held",
    blocker: "An exact-record owner-reviewed Google handoff exists; graph and public-Google authority remain held.",
    receipt: "PORTERFIELD GAS UNIT exact-record Vineyard Road reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
      legacyId: "ascent--porterfield-gas-unit",
      recordRevision: "1786258360881449",
      company: "Ascent",
      padName: "PORTERFIELD GAS UNIT",
      state: "Ohio",
      county: "Belmont",
      structuredRoadSequence: "I-70 → Exit 215 → US-40 → Vineyard Rd → OR → OH-331 → US-40 → Vineyard Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.090431, longitude: -80.928503 },
    },
  }],
  ["143f5268-33e4-4598-8101-40220b5cfdc4", {
    state: "reviewed_handoff_authority_held",
    blocker: "A record-bound reviewed handoff exists, but approved graph and public-Google authority remain held.",
    receipt: "LAWSON record-bound reviewed handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "143f5268-33e4-4598-8101-40220b5cfdc4",
      legacyId: "ascent--lawson",
      recordRevision: "1786258360881449",
      company: "Ascent",
      padName: "LAWSON",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → US-250 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → I-70 → Exit 193 → OH-513 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.124991, longitude: -81.295913 },
    },
  }],
  ["59061829-1122-4aae-872d-cf5024310373", {
    state: "reviewed_handoff_authority_held",
    blocker: "The frozen no-Blaze reviewed handoff works, but approved graph and public-Google authority remain held.",
    receipt: "BILINOVICH frozen PR #174 no-Blaze handoff",
    navigationLabel: "Owner-reviewed route in Google Maps",
    reviewedBinding: {
      padId: "59061829-1122-4aae-872d-cf5024310373",
      legacyId: "ascent--bilinovich",
      recordRevision: "1787802711836476",
      company: "Ascent",
      padName: "BILINOVICH",
      state: "Ohio",
      county: "Guernsey",
      structuredRoadSequence: "US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH",
      directoryDestination: { gpsSource: "saved", coordinateRole: "saved pad reference", latitude: 40.08863, longitude: -81.304164 },
    },
    actionDestination: {
      gpsSource: "ODNR pad",
      latitude: 40.08738445,
      longitude: -81.30282620,
    },
  }],
  ["0b675c3f-2c04-4901-955d-8629e7dba05e", {
    state: "3",
    blocker: "The West Grove lease-end receipt does not approve route geometry or a Google handoff; use the saved GPS destination only.",
    receipt: "UNA frozen West Grove lease endpoint plus trusted GPS fallback",
  }],
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function csv(value) {
  const raw = String(value ?? "");
  const text = typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/u.test(value) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function reviewedBindingForPad(padId) {
  return explicitStates.get(padId)?.reviewedBinding || null;
}

export function reviewedActionDestinationForPad(padId) {
  return explicitStates.get(padId)?.actionDestination || null;
}

export function reviewedBindingMatches(row, directoryDestination, binding) {
  if (!binding || !directoryDestination) return false;
  return row.padId === binding.padId
    && row.legacyId === binding.legacyId
    && String(row.recordRevision) === binding.recordRevision
    && row.company === binding.company
    && row.padName === binding.padName
    && row.state === binding.state
    && row.county === binding.county
    && row.structuredRoadSequence === binding.structuredRoadSequence
    && directoryDestination.gpsSource === binding.directoryDestination.gpsSource
    && directoryDestination.coordinateRole === binding.directoryDestination.coordinateRole
    && Math.abs(directoryDestination.latitude - binding.directoryDestination.latitude) <= 1e-9
    && Math.abs(directoryDestination.longitude - binding.directoryDestination.longitude) <= 1e-9;
}

export function candidateContentDigest(entries) {
  const digest = createHash("sha256");
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    digest.update(entry.path);
    digest.update("\0");
    digest.update(entry.content);
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function hostedBuildArtifact(relativePath) {
  const normalized = String(relativePath).replaceAll("\\", "/");
  return normalized === ".netlify" || normalized.startsWith(".netlify/");
}

function countBy(rows, field) {
  return rows.reduce((counts, row) => {
    const value = row[field];
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function git(...args) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

function normalizedNewlines(value) {
  return value.replace(/\r\n?/gu, "\n");
}

function tryGit(...args) {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function gitBlob(relativePath) {
  try {
    return execFileSync("git", ["show", `HEAD:${relativePath}`], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function gitPaths(...args) {
  const output = git(...args);
  return output ? output.split(/\r?\n/u).filter(Boolean).map((value) => value.replaceAll("\\", "/")) : [];
}

async function implementationProvenance(baseMainSha, frozen = null) {
  const implementationSha = frozen?.implementationSha || git(
      "log",
      "-1",
      "--format=%H",
      "HEAD",
      "--",
      ".",
      ":(exclude)docs/batch0-ascent-six-county-navigation-ledger-20260827.csv",
      ":(exclude)docs/batch0-ascent-six-county-navigation-ledger-20260827.md",
    );
  const changedFromBase = frozen?.implementationPaths || gitPaths("diff", "--name-only", baseMainSha, "--", ".");
  // Netlify creates its own untracked .netlify working files before this audit
  // runs. They are not candidate source, and must not make a frozen, committed
  // report depend on the build provider. Every other untracked path remains in
  // the fingerprint so genuine implementation work cannot be omitted.
  const allUntracked = gitPaths("ls-files", "--others", "--exclude-standard");
  const untracked = frozen
    ? allUntracked.filter((value) => !hostedBuildArtifact(value))
    : allUntracked;
  const implementationPaths = [...new Set([...changedFromBase, ...untracked])]
    .filter((value) => !generatedAuditPaths.has(value))
    .sort();
  const changedWorkingPaths = [...new Set([
    ...gitPaths("diff", "--name-only", "HEAD", "--", "."),
    ...gitPaths("diff", "--cached", "--name-only", "HEAD", "--", "."),
    ...untracked,
  ])].filter((value) => !generatedAuditPaths.has(value));
  const frozenPaths = new Set(implementationPaths);
  const dirtyPaths = frozen
    ? changedWorkingPaths.filter((value) => frozenPaths.has(value))
    : changedWorkingPaths;
  const dirty = new Set(dirtyPaths);
  const entries = [];
  for (const relativePath of implementationPaths) {
    try {
      const committed = dirty.has(relativePath) ? null : gitBlob(relativePath);
      entries.push({
        path: relativePath,
        content: committed || await readFile(path.join(repositoryRoot, ...relativePath.split("/"))),
      });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      entries.push({ path: relativePath, content: "<deleted>" });
    }
  }
  return {
    baseMainSha,
    implementationSha,
    candidateContentSha256: candidateContentDigest(entries),
    uncommittedChanges: dirtyPaths.length > 0,
    implementationPaths,
  };
}

export function parseMarkdownProvenance(markdown) {
  const baseMainSha = /- Base origin\/main SHA: `([0-9a-f]{40})`/u.exec(markdown)?.[1];
  const implementationSha = /- Candidate implementation HEAD: `([0-9a-f]{40})`/u.exec(markdown)?.[1];
  const candidateContentSha256 = /- Candidate content SHA-256: `([0-9a-f]{64})`/u.exec(markdown)?.[1];
  const section = /## Candidate implementation files\s+([\s\S]*?)\s+## Counts/u.exec(markdown)?.[1] || "";
  const implementationPaths = [...section.matchAll(/^- `([^`]+)`$/gmu)].map((match) => match[1]);
  assert(baseMainSha && implementationSha && candidateContentSha256, "Saved Batch 0 provenance is incomplete");
  assert(implementationPaths.length > 0, "Saved Batch 0 implementation file list is empty");
  assert(new Set(implementationPaths).size === implementationPaths.length, "Saved Batch 0 implementation file list is duplicated");
  assert(implementationPaths.every((value) => {
    const normalized = value.replaceAll("\\", "/");
    return value === normalized
      && !path.isAbsolute(value)
      && !normalized.split("/").includes("..")
      && !normalized.startsWith("/");
  }), "Saved Batch 0 implementation file list contains an unsafe path");
  return { baseMainSha, implementationSha, candidateContentSha256, implementationPaths };
}

async function githubPullRequestBaseSha() {
  if (!process.env.GITHUB_EVENT_PATH) return null;
  try {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
    const value = event?.pull_request?.base?.sha;
    return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value) ? value : null;
  } catch {
    return null;
  }
}

async function publicConfiguration() {
  const source = await readFile(path.join(repositoryRoot, "v18", "src", "data", "directory.ts"), "utf8");
  const supabaseUrl = /VITE_SUPABASE_URL\s*\|\|\s*"([^"]+)"/u.exec(source)?.[1];
  const publishableKey = /VITE_SUPABASE_PUBLISHABLE_KEY\s*\|\|\s*"([^"]+)"/u.exec(source)?.[1];
  assert(supabaseUrl && publishableKey, "V18 public Supabase configuration is unavailable");
  return { supabaseUrl, publishableKey };
}

async function rpc(configuration, name, body, timeoutMs = 15_000) {
  const response = await fetch(`${configuration.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: configuration.publishableKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  assert(response.ok, `${name} failed once with HTTP ${response.status}: ${text.slice(0, 240)}`);
  return JSON.parse(text);
}

async function directory(configuration) {
  const rows = [];
  let snapshot = null;
  let afterOrdinal = 0;
  for (;;) {
    const payload = object(await rpc(configuration, "brinesearch_v18_directory_page", {
      p_snapshot_id: snapshot?.snapshotId || null,
      p_after_ordinal: afterOrdinal,
      p_limit: 1000,
    }));
    const nextSnapshot = object(payload.snapshot);
    assert(nextSnapshot.snapshotId, "Directory snapshot identity is missing");
    if (snapshot) {
      assert(nextSnapshot.snapshotId === snapshot.snapshotId, "Directory snapshot changed during paging");
      assert(String(nextSnapshot.sourceRevision) === String(snapshot.sourceRevision), "Directory revision changed during paging");
    }
    snapshot = nextSnapshot;
    const page = object(payload.page);
    const batch = Array.isArray(payload.rows) ? payload.rows : [];
    assert(Number(page.afterOrdinal) === afterOrdinal, "Directory cursor is not exact");
    rows.push(...batch);
    if (page.complete === true) break;
    const nextAfter = Number(page.nextAfterOrdinal);
    assert(batch.length > 0 && nextAfter === rows.length && nextAfter > afterOrdinal, "Directory paging failed closed");
    afterOrdinal = nextAfter;
  }
  assert(Number(snapshot.rowCount) === rows.length, "Directory row count diverged");
  return { snapshot, rows };
}

export function auditCoordinatePair(latitudeRaw, longitudeRaw) {
  const missing = (value) => value === null || value === undefined
    || typeof value === "string" && value.trim() === "";
  if (missing(latitudeRaw) || missing(longitudeRaw)) return null;
  if ([latitudeRaw, longitudeRaw].some((value) => typeof value === "boolean" || typeof value === "object")) return null;
  const latitude = Number(latitudeRaw);
  const longitude = Number(longitudeRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  if (latitude < 37 || latitude > 43 || longitude < -84 || longitude > -74) return null;
  return { latitude, longitude };
}

function trustedDirectoryDestination(row, references) {
  const entrance = object(row.driverEntrance);
  if (entrance.role === "driver_entrance" && entrance.qualityState === "validated") {
    const coordinate = auditCoordinatePair(entrance.latitude, entrance.longitude);
    if (!coordinate) return null;
    return {
      gpsSource: "saved",
      coordinateRole: "verified driver entrance",
      ...coordinate,
    };
  }
  const reference = references.get(row.padId);
  if (!reference) return null;
  const source = {
    saved_pad_reference: "saved",
    official_pad_reference: "ODNR pad",
    official_wellhead_reference: "ODNR wellhead",
  }[reference.referenceKind];
  assert(source, `Unsupported GPS source for ${row.padId}`);
  const coordinate = auditCoordinatePair(reference.latitude, reference.longitude);
  if (!coordinate) return null;
  return {
    gpsSource: source,
    coordinateRole: reference.referenceKind.replaceAll("_", " "),
    ...coordinate,
  };
}

export function markdownSummary({ provenance, snapshot, rows, referenceDigest, csvDigest }) {
  const states = countBy(rows, "current_state");
  const sources = countBy(rows, "gps_source");
  const directorySources = countBy(rows, "directory_gps_source");
  const countyRows = counties.map((county) => {
    const matching = rows.filter((row) => row.county === county);
    const counts = countBy(matching, "current_state");
    const noGps = matching.filter((row) => row.gps_source === "missing").length;
    return `| ${county} | ${matching.length} | ${counts["1"] || 0} | ${counts["2"] || 0} | ${counts["3"] || 0} | ${counts.reviewed_handoff_authority_held || 0} | ${noGps} |`;
  }).join("\n");
  return `# Batch 0 Ascent six-county navigation ledger — 2026-08-27
- Base origin/main SHA: \`${provenance.baseMainSha}\`
- Candidate implementation HEAD: \`${provenance.implementationSha}\`
- Candidate content SHA-256: \`${provenance.candidateContentSha256}\`
- Uncommitted non-generated changes: **${provenance.uncommittedChanges ? "yes" : "no"}**
- 247 / 1 approved / 8 core+GPS / 233 GPS-only / 5 reviewed-held
- Production writes zero
- LAWSON + BILINOVICH + BEETLE + DUKE + PORTERFIELD GAS UNIT: \`reviewed_handoff_authority_held\`

This candidate ledger binds the 247 current Ascent pads in Belmont, Guernsey, Harrison, Jefferson, Monroe, and Noble counties to production directory snapshot \`${snapshot.snapshotId}\` and source revision \`${snapshot.sourceRevision}\`. It describes candidate implementation content based on origin/main; it does not claim that unmerged work is already on main.

## Candidate implementation files

${provenance.implementationPaths.map((value) => `- \`${value}\``).join("\n")}

## Counts

- State 1 — Reviewed approved route: **${states["1"] || 0}**
- State 2 — Approved roads then GPS: **${states["2"] || 0}**
- State 3 — GPS destination only: **${states["3"] || 0}**
- Reviewed handoff authority held: **${states.reviewed_handoff_authority_held || 0}**
- No trusted GPS: **${rows.filter((row) => row.gps_source === "missing").length}**
- Exactly one navigation action destination: **${rows.filter((row) => row.gps_source !== "missing").length}**

| County | Pads | State 1 | State 2 | State 3 | Reviewed-held | No GPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${countyRows}

## GPS source accounting

The required \`gps_source\` column describes the coordinate used by the Navigate action: saved **${sources.saved || 0}**, ODNR pad **${sources["ODNR pad"] || 0}**, ODNR wellhead **${sources["ODNR wellhead"] || 0}**, missing **${sources.missing || 0}**. The separate \`directory_gps_source\` column preserves the canonical public-directory source: saved **${directorySources.saved || 0}**, ODNR pad **${directorySources["ODNR pad"] || 0}**, ODNR wellhead **${directorySources["ODNR wellhead"] || 0}**, missing **${directorySources.missing || 0}**.

BILINOVICH is the one deliberate distinction: its frozen PR #174 handoff navigates to the ODNR pad-surface destination \`40.08738445, -81.30282620\`; its current directory reference remains the saved lease-approach coordinate \`40.08863, -81.304164\`. Neither coordinate is called an entrance. The frozen URL and receipt remain unchanged, and Blaze Road remains excluded.

## Authority boundary

- The phone's current location is the origin. State 3 URLs contain no origin or waypoint.
- State 1 is limited to Cologie's exact clipped public route and reviewed Google handoff.
- State 2 draws approved public-road geometry only to its exact handoff. Its lease/pin leg is GPS-only.
- State 3 uses an exact saved or ODNR coordinate without approving Google's chosen roads.
- LAWSON, BILINOVICH, BEETLE, DUKE, and PORTERFIELD GAS UNIT remain \`reviewed_handoff_authority_held\` rather than being promoted: their exact record-bound reviewed handoffs are separate from graph/public-Google authority. DUKE and PORTERFIELD remain pre-deployment candidates until their exact Google links receive recorded phone/visual QA.
- Written directions are not converted into geometry, and ODNR points are never labeled as entrances.
- The public reference projection SHA-256 is \`${referenceDigest}\`.
- The generated CSV SHA-256 is \`${csvDigest}\`.
- Production database writes for this ledger: **0**.

Regenerate from the current live public contracts with \`npm --prefix v18 run audit:batch0-navigation -- --write\`. The audit performs one request per page/contract and has no retry path.
`;
}

async function main() {
  const originMainSha = tryGit("rev-parse", "origin/main");
  const checking = process.argv.includes("--check");
  let provenance;
  if (checking) {
    const frozen = parseMarkdownProvenance(await readFile(outputMarkdown, "utf8"));
    if (originMainSha) {
      const mergeBase = git("merge-base", "HEAD", "origin/main");
      assert(mergeBase === frozen.baseMainSha,
        `Saved Batch 0 base ${frozen.baseMainSha} does not match current origin/main merge base ${mergeBase}`);
      const currentPaths = gitPaths("diff", "--name-only", frozen.baseMainSha, "--", ".")
        .filter((value) => !generatedAuditPaths.has(value))
        .sort();
      assert(JSON.stringify(currentPaths) === JSON.stringify([...frozen.implementationPaths].sort()),
        "Saved Batch 0 implementation file list is stale");
    }
    const githubBase = await githubPullRequestBaseSha();
    assert(!githubBase || githubBase === frozen.baseMainSha,
      `Saved Batch 0 base ${frozen.baseMainSha} does not match the pull-request base ${githubBase}`);
    provenance = await implementationProvenance(frozen.baseMainSha, frozen);
    assert(provenance.candidateContentSha256 === frozen.candidateContentSha256,
      `Saved Batch 0 candidate content fingerprint is stale (${provenance.candidateContentSha256} != ${frozen.candidateContentSha256})`);
  } else {
    assert(originMainSha, "origin/main is required when generating the Batch 0 ledger");
    const mergeBase = git("merge-base", "HEAD", "origin/main");
    assert(mergeBase === originMainSha, `Batch 0 branch must start at current origin/main (${originMainSha}); merge base is ${mergeBase}`);
    provenance = await implementationProvenance(originMainSha);
  }
  const configuration = await publicConfiguration();
  const { snapshot, rows: directoryRows } = await directory(configuration);
  assert(snapshot.publicationState === "current", "Directory snapshot is not current");

  const rawReferences = await rpc(configuration, "brinesearch_v18_pad_reference_coordinates", {
    p_snapshot_id: snapshot.snapshotId,
  });
  const referencePayload = object(Array.isArray(rawReferences) ? rawReferences[0] : rawReferences);
  assert(referencePayload.snapshotId === snapshot.snapshotId, "Pad references do not match the directory snapshot");
  assert(String(referencePayload.sourceRevision) === String(snapshot.sourceRevision), "Pad references do not match the directory revision");
  assert(Array.isArray(referencePayload.rows), "Pad-reference rows are unavailable");
  const references = new Map(referencePayload.rows.map((row) => [row.padId, row]));

  const targets = directoryRows.filter((row) => row.company === "Ascent"
    && row.state === "Ohio" && counties.includes(row.county));
  assert(targets.length === 247, `Expected 247 exact Ascent targets; received ${targets.length}`);
  assert(new Set(targets.map((row) => row.padId)).size === 247, "Ascent target identities are not unique");
  assert(new Set(targets.map((row) => row.padName)).size === 247, "Ascent target names are not unique");
  for (const padId of explicitStates.keys()) {
    assert(targets.some((row) => row.padId === padId), `Explicit state receipt target ${padId} is absent`);
  }
  for (const [padId, explicit] of explicitStates) {
    if (explicit.state === "reviewed_handoff_authority_held") {
      assert(explicit.reviewedBinding, `Reviewed handoff ${padId} lacks an exact audit binding`);
    }
  }

  const ledger = targets.map((row) => {
    const directoryDestination = trustedDirectoryDestination(row, references);
    const explicit = explicitStates.get(row.padId);
    if (explicit?.state === "reviewed_handoff_authority_held") {
      assert(
        reviewedBindingMatches(row, directoryDestination, explicit.reviewedBinding),
        `Reviewed handoff binding drifted for ${row.padId}`,
      );
      if (explicit.actionDestination) {
        assert(explicit.actionDestination.gpsSource === "ODNR pad", `Reviewed action destination source drifted for ${row.padId}`);
        assert(
          explicit.actionDestination.latitude !== directoryDestination.latitude
            || explicit.actionDestination.longitude !== directoryDestination.longitude,
          `Reviewed action destination was incorrectly collapsed into the directory destination for ${row.padId}`,
        );
      }
    }
    const actionDestination = explicit?.actionDestination || directoryDestination;
    const currentState = explicit?.state || (actionDestination ? "3" : "unknown");
    const navigationLabel = explicit?.navigationLabel || {
      "1": "Reviewed approved route",
      "2": "Approved roads then GPS",
      "3": "GPS destination only",
    }[currentState] || "";
    const blocker = explicit ? explicit.blocker : currentState === "3"
      ? row.structuredRoadSequence
        ? "No state-1/2 clipped-route and mobile-handoff receipt is released; use the trusted GPS destination only."
        : "No reviewed exact public-road sequence is released; use the trusted GPS destination only."
      : "Trusted GPS destination is missing.";
    return {
      record_id: row.padId,
      legacy_id: row.legacyId || "",
      name: row.padName,
      company: row.company,
      state: row.state,
      county: row.county,
      structured_road_sequence: row.structuredRoadSequence || "",
      current_state: currentState,
      gps_source: actionDestination?.gpsSource || "missing",
      destination_latitude: actionDestination?.latitude ?? "",
      destination_longitude: actionDestination?.longitude ?? "",
      directory_gps_source: directoryDestination?.gpsSource || "missing",
      directory_coordinate_role: directoryDestination?.coordinateRole || "missing",
      directory_latitude: directoryDestination?.latitude ?? "",
      directory_longitude: directoryDestination?.longitude ?? "",
      record_revision: row.recordRevision,
      navigation_label: navigationLabel,
      origin: actionDestination ? "phone current location" : "",
      blocker,
      receipt: explicit?.receipt || "trusted GPS fallback",
    };
  }).sort((left, right) => counties.indexOf(left.county) - counties.indexOf(right.county)
    || left.name.localeCompare(right.name));

  const stateCounts = countBy(ledger, "current_state");
  assert(stateCounts["1"] === 1 && stateCounts["2"] === 8 && stateCounts["3"] === 233
    && stateCounts.reviewed_handoff_authority_held === 5,
    `State counts diverged: ${JSON.stringify(stateCounts)}`);
  assert(ledger.every((row) => row.gps_source !== "missing"), "At least one target lacks a trusted Navigate destination");

  const headers = Object.keys(ledger[0]);
  const csvText = `${headers.join(",")}\n${ledger.map((row) => headers.map((header) => csv(row[header])).join(",")).join("\n")}\n`;
  const csvDigest = createHash("sha256").update(csvText).digest("hex");
  const markdownText = markdownSummary({
    provenance,
    snapshot,
    rows: ledger,
    referenceDigest: referencePayload.contentSha256,
    csvDigest,
  });
  if (process.argv.includes("--write")) {
    await writeFile(outputCsv, csvText, "utf8");
    await writeFile(outputMarkdown, markdownText, "utf8");
  } else if (checking) {
    const savedCsv = normalizedNewlines(await readFile(outputCsv, "utf8"));
    const renderedCsv = normalizedNewlines(csvText);
    const savedMarkdown = normalizedNewlines(await readFile(outputMarkdown, "utf8"));
    const renderedMarkdown = normalizedNewlines(markdownText);
    assert(savedCsv === renderedCsv,
      `Checked-in Batch 0 CSV is stale (${createHash("sha256").update(savedCsv).digest("hex")} != ${createHash("sha256").update(renderedCsv).digest("hex")})`);
    assert(savedMarkdown === renderedMarkdown,
      `Checked-in Batch 0 Markdown is stale (${createHash("sha256").update(savedMarkdown).digest("hex")} != ${createHash("sha256").update(renderedMarkdown).digest("hex")})`);
  }
  console.log(JSON.stringify({
    ...provenance,
    snapshotId: snapshot.snapshotId,
    sourceRevision: snapshot.sourceRevision,
    targetCount: ledger.length,
    stateCounts,
    gpsSourceCounts: countBy(ledger, "gps_source"),
    directoryGpsSourceCounts: countBy(ledger, "directory_gps_source"),
    outputCsv: process.argv.includes("--write") ? outputCsv : null,
    outputMarkdown: process.argv.includes("--write") ? outputMarkdown : null,
    productionWrites: 0,
  }, null, 2));
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) await main();
