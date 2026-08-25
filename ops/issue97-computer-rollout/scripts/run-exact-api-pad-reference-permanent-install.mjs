import {
  assertBaseline,
  assertExpandedEvidence,
  createClient,
  loadRelease,
  migrationName,
  migrationVersion,
  protectedState,
  publicError,
  queryEvidence,
  queryState,
  stateWithoutClock,
} from "./exact-api-pad-reference-release-lib.mjs";

const expectedInstalledFunctionMd5="c49745b57f68275ca2d5017b2e054834";
const repositoryRoot=process.argv[2];
if (!repositoryRoot) throw new Error("Repository root argument is required");
if (!/^[0-9a-f]{32}$/u.test(expectedInstalledFunctionMd5)) {
  throw new Error(
    "Permanent install is locked until the passed rehearsal digest is pinned",
  );
}
const release=loadRelease(repositoryRoot);
const startedAt=Date.now();
let phase="connect";
let transactionOpen=false;
let client=createClient("issue97-exact-api-pad-reference-permanent-install");

try {
  await client.connect();
  phase="begin";
  await client.query("begin");
  transactionOpen=true;
  await client.query("set local statement_timeout='30s'");
  await client.query("set local lock_timeout='2s'");

  phase="before-snapshot";
  const before=await queryState(client);
  assertBaseline(before);
  console.log(JSON.stringify({
    kind:"before",migrationSha256:release.migrationSha256,state:before,
  }));

  phase="migration";
  await client.query(release.migrationSql);

  phase="migration-receipt";
  await client.query(
    "insert into supabase_migrations.schema_migrations(version,statements,name) values ($1,array[$2]::text[],$3)",
    [migrationVersion,release.migrationSql,migrationName],
  );

  phase="inside-verification";
  const inside=await queryState(client);
  const evidence=await queryEvidence(client);
  if (protectedState(before)!==protectedState(inside)) {
    throw new Error("Permanent migration changed protected production data");
  }
  if (inside.referenceFunction?.definitionMd5!==expectedInstalledFunctionMd5
    || Number(inside.officialWellSource?.targetMigrationLedgerCount)!==1
    || inside.officialWellSource?.targetMigrationStatementMd5
      !==release.migrationStatementMd5) {
    throw new Error("Permanent function or migration receipt verification failed");
  }
  assertExpandedEvidence(evidence);
  console.log(JSON.stringify({kind:"inside",state:inside,evidence}));

  phase="commit";
  await client.query("commit");
  transactionOpen=false;

  phase="after-readback";
  const after=await queryState(client);
  const afterEvidence=await queryEvidence(client);
  if (stateWithoutClock(inside)!==stateWithoutClock(after)
    || JSON.stringify(evidence)!==JSON.stringify(afterEvidence)) {
    throw new Error("Committed state readback diverged from transaction verification");
  }
  console.log(JSON.stringify({kind:"after",state:after,evidence:afterEvidence}));

  phase="complete";
  console.log(JSON.stringify({
    kind:"complete",
    result:"installed-once",
    migrationVersion,
    migrationSha256:release.migrationSha256,
    referenceSha256:afterEvidence.contentSha256,
    functionDefinitionMd5:after.referenceFunction.definitionMd5,
    elapsedSeconds:Math.round((Date.now()-startedAt)/1000),
  }));
} catch (error) {
  console.error(JSON.stringify(publicError(error,phase,startedAt)));
  if (transactionOpen && phase!=="commit") {
    try {
      await client.query("rollback");
      transactionOpen=false;
      console.error(JSON.stringify({
        kind:"rollback-after-failure",result:"succeeded",
      }));
    } catch (rollbackError) {
      console.error(JSON.stringify(
        publicError(rollbackError,"rollback-after-failure",startedAt),
      ));
    }
  }
  try { await client.end(); } catch {}
  client=createClient("issue97-exact-api-pad-reference-failure-inspection");
  try {
    await client.connect();
    const persisted=await queryState(client);
    console.error(JSON.stringify({
      kind:"persisted-state-inspection",
      committed:Boolean(
        persisted.referenceFunction?.definitionMd5===expectedInstalledFunctionMd5
        && Number(persisted.officialWellSource?.targetMigrationLedgerCount)===1
      ),
      state:persisted,
    }));
  } catch (inspectionError) {
    console.error(JSON.stringify(
      publicError(inspectionError,"persisted-state-inspection",startedAt),
    ));
  }
  process.exitCode=1;
} finally {
  try { await client.end(); } catch {}
}
