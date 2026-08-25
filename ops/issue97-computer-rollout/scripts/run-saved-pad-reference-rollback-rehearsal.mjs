import {
  assertBaseline,
  assertExpandedEvidence,
  createClient,
  loadRelease,
  protectedState,
  publicError,
  queryEvidence,
  queryState,
  stateWithoutClock,
} from "./saved-pad-reference-release-lib.mjs";

const repositoryRoot = process.argv[2];
if (!repositoryRoot) throw new Error("Repository root argument is required");
const release = loadRelease(repositoryRoot);
const startedAt = Date.now();
let phase = "connect";
let transactionOpen = false;
let client = createClient("issue97-saved-pad-reference-rollback-rehearsal");

if (process.argv.includes("--read-only-preflight")) {
  await client.connect();
  const state = await queryState(client);
  assertBaseline(state);
  console.log(JSON.stringify({ kind: "read-only-preflight", migrationSha256: release.migrationSha256, state }));
  await client.end();
  process.exit(0);
}

try {
  await client.connect();
  phase = "begin";
  await client.query("begin");
  transactionOpen = true;
  await client.query("set local statement_timeout='30s'");
  await client.query("set local lock_timeout='2s'");

  phase = "before-snapshot";
  const before = await queryState(client);
  assertBaseline(before);
  console.log(JSON.stringify({ kind: "before", migrationSha256: release.migrationSha256, state: before }));

  phase = "migration";
  await client.query(release.migrationSql);

  phase = "inside-evidence";
  const inside = await queryState(client);
  const evidence = await queryEvidence(client);
  if (protectedState(before) !== protectedState(inside)) {
    throw new Error("Migration changed protected production data inside rehearsal");
  }
  if (!inside.referenceFunction
    || inside.referenceFunction.definitionMd5 === before.referenceFunction.definitionMd5
    || Number(inside.migrationLedgerCount) !== 0) {
    throw new Error("Transaction-local function state did not match rehearsal boundaries");
  }
  assertExpandedEvidence(evidence);
  console.log(JSON.stringify({ kind: "inside", state: inside, evidence }));

  phase = "rollback";
  await client.query("rollback");
  transactionOpen = false;

  phase = "after-snapshot";
  const after = await queryState(client);
  const zeroPersistentDelta = stateWithoutClock(before) === stateWithoutClock(after);
  console.log(JSON.stringify({ kind: "after", zeroPersistentDelta, state: after }));
  if (!zeroPersistentDelta) throw new Error("Rollback rehearsal left a persistent state delta");

  phase = "complete";
  console.log(JSON.stringify({
    kind: "complete",
    result: "passed-and-rolled-back",
    migrationSha256: release.migrationSha256,
    referenceSha256: evidence.contentSha256,
    rehearsalFunctionDefinitionMd5: inside.referenceFunction.definitionMd5,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  }));
} catch (error) {
  console.error(JSON.stringify(publicError(error, phase, startedAt)));
  if (transactionOpen) {
    try {
      await client.query("rollback");
      transactionOpen = false;
      console.error(JSON.stringify({ kind: "rollback-after-failure", result: "succeeded" }));
    } catch (rollbackError) {
      console.error(JSON.stringify(publicError(rollbackError, "rollback-after-failure", startedAt)));
    }
  }
  try { await client.end(); } catch {}
  client = createClient("issue97-saved-pad-reference-failure-inspection");
  try {
    await client.connect();
    const persisted = await queryState(client);
    console.error(JSON.stringify({ kind: "persisted-state-inspection", state: persisted }));
  } catch (inspectionError) {
    console.error(JSON.stringify(publicError(inspectionError, "persisted-state-inspection", startedAt)));
  }
  process.exitCode = 1;
} finally {
  try { await client.end(); } catch {}
}
