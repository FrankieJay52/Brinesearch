import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const outputCsv = path.join(repositoryRoot, "docs", "batch0-ascent-six-county-navigation-ledger-20260827.csv");
const outputMarkdown = path.join(repositoryRoot, "docs", "batch0-ascent-six-county-navigation-ledger-20260827.md");
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
  ["143f5268-33e4-4598-8101-40220b5cfdc4", {
    state: "reviewed_handoff_authority_held",
    blocker: "A record-bound reviewed handoff exists, but approved graph and public-Google authority remain held.",
    receipt: "LAWSON record-bound reviewed handoff",
    navigationLabel: "Navigate reviewed route",
  }],
  ["59061829-1122-4aae-872d-cf5024310373", {
    state: "reviewed_handoff_authority_held",
    blocker: "The frozen no-Blaze reviewed handoff works, but approved graph and public-Google authority remain held.",
    receipt: "BILINOVICH frozen PR #174 no-Blaze handoff",
    navigationLabel: "Navigate reviewed route",
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

function csv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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

function trustedDirectoryDestination(row, references) {
  const entrance = object(row.driverEntrance);
  if (entrance.role === "driver_entrance" && entrance.qualityState === "validated") {
    return {
      gpsSource: "saved",
      coordinateRole: "verified driver entrance",
      latitude: Number(entrance.latitude),
      longitude: Number(entrance.longitude),
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
  return {
    gpsSource: source,
    coordinateRole: reference.referenceKind.replaceAll("_", " "),
    latitude: Number(reference.latitude),
    longitude: Number(reference.longitude),
  };
}

function markdownSummary({ mainSha, snapshot, rows, referenceDigest }) {
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
- SHA \`${mainSha}\`
- 247 / 1 approved / 8 core+GPS / 236 GPS-only / 2 reviewed-held
- Production writes zero
- LAWSON + BILINOVICH: \`reviewed_handoff_authority_held\`

This ledger binds the 247 current Ascent pads in Belmont, Guernsey, Harrison, Jefferson, Monroe, and Noble counties to production directory snapshot \`${snapshot.snapshotId}\`, source revision \`${snapshot.sourceRevision}\`, on main \`${mainSha}\`.

## Counts

- State 1 — Reviewed approved route: **${states["1"] || 0}**
- State 2 — Approved roads then GPS: **${states["2"] || 0}**
- State 3 — GPS destination only: **${states["3"] || 0}**
- Reviewed handoff authority held: **${states.reviewed_handoff_authority_held || 0}**
- No trusted GPS: **${rows.filter((row) => row.gps_source === "missing").length}**
- Exactly one trusted destination: **${rows.filter((row) => row.gps_source !== "missing").length}**

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
- LAWSON and BILINOVICH remain \`reviewed_handoff_authority_held\` rather than being promoted: their exact record-bound reviewed handoffs work, but their frozen receipts keep graph/public-Google approval separate or held.
- Written directions are not converted into geometry, and ODNR points are never labeled as entrances.
- The public reference projection SHA-256 is \`${referenceDigest}\`.
- Production database writes for this ledger: **0**.

Regenerate from the current live public contracts with \`npm --prefix v18 run audit:batch0-navigation -- --write\`. The audit performs one request per page/contract and has no retry path.
`;
}

async function main() {
  const mainSha = git("rev-parse", "origin/main");
  const headSha = git("rev-parse", "HEAD");
  assert(headSha === mainSha, `Batch 0 must start at current origin/main (${mainSha}); HEAD is ${headSha}`);
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

  const ledger = targets.map((row) => {
    const directoryDestination = trustedDirectoryDestination(row, references);
    const explicit = explicitStates.get(row.padId);
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
      name: row.padName,
      county: row.county,
      current_state: currentState,
      gps_source: actionDestination?.gpsSource || "missing",
      destination_latitude: actionDestination?.latitude ?? "",
      destination_longitude: actionDestination?.longitude ?? "",
      directory_gps_source: directoryDestination?.gpsSource || "missing",
      directory_coordinate_role: directoryDestination?.coordinateRole || "missing",
      record_revision: row.recordRevision,
      navigation_label: navigationLabel,
      origin: actionDestination ? "phone current location" : "",
      blocker,
      receipt: explicit?.receipt || "trusted GPS fallback",
    };
  }).sort((left, right) => counties.indexOf(left.county) - counties.indexOf(right.county)
    || left.name.localeCompare(right.name));

  const stateCounts = countBy(ledger, "current_state");
  assert(stateCounts["1"] === 1 && stateCounts["2"] === 8 && stateCounts["3"] === 236
    && stateCounts.reviewed_handoff_authority_held === 2,
    `State counts diverged: ${JSON.stringify(stateCounts)}`);
  assert(ledger.every((row) => row.gps_source !== "missing"), "At least one target lacks a trusted Navigate destination");

  const headers = Object.keys(ledger[0]);
  const csvText = `${headers.join(",")}\n${ledger.map((row) => headers.map((header) => csv(row[header])).join(",")).join("\n")}\n`;
  const markdownText = markdownSummary({
    mainSha,
    snapshot,
    rows: ledger,
    referenceDigest: referencePayload.contentSha256,
  });
  if (process.argv.includes("--write")) {
    await writeFile(outputCsv, csvText, "utf8");
    await writeFile(outputMarkdown, markdownText, "utf8");
  }
  console.log(JSON.stringify({
    mainSha,
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

await main();
