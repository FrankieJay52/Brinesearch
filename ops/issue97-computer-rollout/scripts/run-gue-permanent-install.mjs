import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("C:/Users/frank/AppData/Local/Temp/brinesearch-issue97-pg/node_modules/pg");

const repositoryRoot = process.argv[2];
if (!repositoryRoot) throw new Error("Repository root argument is required");

const migrationVersion = "20260824122000";
const migrationName = "issue97_gue_held_route_exact_identity_receipts";
const expectedMigrationSha256 = "b81fe6934e956aad4900a406207d48f42d3a3e4479a61329dfad046e433b4233";
const migrationPath = path.join(
  repositoryRoot,
  "supabase",
  "migrations",
  `${migrationVersion}_${migrationName}.sql`,
);
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const migrationSha256 = crypto.createHash("sha256").update(migrationSql).digest("hex");
const migrationMd5 = crypto.createHash("md5").update(migrationSql).digest("hex");

if (migrationSha256 !== expectedMigrationSha256) {
  throw new Error(`Migration digest diverged: ${migrationSha256}`);
}
if (/\b(?:begin|commit|rollback)\s*;/iu.test(migrationSql)) {
  throw new Error("Migration unexpectedly contains transaction control");
}

function parseServiceFile(contents, serviceName) {
  let section = null;
  const result = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sectionMatch = /^\[([^\]]+)\]$/u.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    if (section !== serviceName) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return result;
}

function parsePgPassLine(line) {
  const fields = [];
  let value = "";
  let escaped = false;
  for (const character of line) {
    if (escaped) {
      value += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === ":") {
      fields.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  fields.push(value);
  return fields;
}

const serviceName = process.env.PGSERVICE;
const appData = process.env.APPDATA;
if (!serviceName || !appData) throw new Error("PGSERVICE or APPDATA is unavailable");

const service = parseServiceFile(
  fs.readFileSync(path.join(appData, "postgresql", ".pg_service.conf"), "utf8"),
  serviceName,
);
for (const key of ["host", "port", "dbname", "user"]) {
  if (!service[key]) throw new Error(`Postgres service is missing ${key}`);
}

const pgPassFields = fs
  .readFileSync(path.join(appData, "postgresql", "pgpass.conf"), "utf8")
  .split(/\r?\n/u)
  .filter((line) => line && !line.startsWith("#"))
  .map(parsePgPassLine)
  .find(
    (fields) =>
      fields.length === 5 &&
      (fields[0] === "*" || fields[0] === service.host) &&
      (fields[1] === "*" || fields[1] === service.port) &&
      (fields[2] === "*" || fields[2] === service.dbname) &&
      (fields[3] === "*" || fields[3] === service.user),
  );
if (!pgPassFields) throw new Error("No matching pgpass entry exists for the configured service");

const connectionConfig = {
  host: service.host,
  port: Number(service.port),
  database: service.dbname,
  user: service.user,
  password: pgPassFields[4],
  ssl: service.sslmode === "disable" ? false : { rejectUnauthorized: false },
  application_name: "issue97-gue-permanent-install",
  connectionTimeoutMillis: 20_000,
  keepAlive: true,
};

const stateSql = `
with target_steps as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    step.id::text||':'||coalesce(step.road_id::text,'')||':'||coalesce(step.step_kind,'')||':'||
      coalesce(step.match_status,'')||':'||coalesce(step.match_method,'')||':'||
      coalesce(step.geometry_status,'')||':'||coalesce(step.source_details::text,''),
    ',' order by step.id),'')) as digest
  from public.brinesearch_route_prep_steps step
  join public.brinesearch_route_prep route on route.id=step.route_prep_id
  join public.pads pad on pad.id=route.pad_id
  where pad.legacy_id in ('ascent--cooper','ascent--lorraine')
), target_receipts as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.route_prep_step_id::text||':'||coalesce(receipt.resolution_status,'')||':'||
      coalesce(receipt.resolution_method,'')||':'||coalesce(receipt.hold_reason,'')||':'||
      coalesce(receipt.identity_id::text,'')||':'||coalesce(receipt.canonical_road_id::text,''),
    ',' order by receipt.route_prep_step_id),'')) as digest
  from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  join public.brinesearch_route_prep_steps step on step.id=receipt.route_prep_step_id
  join public.brinesearch_route_prep route on route.id=step.route_prep_id
  join public.pads pad on pad.id=route.pad_id
  where pad.legacy_id in ('ascent--cooper','ascent--lorraine')
), graph_state as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.state_code||':'||build.county_code||':'||build.status||':'||
      coalesce(build.source_revision_digest,'')||':'||coalesce(build.graph_digest,''),
    ',' order by build.id),'')) as digest,
    count(*) as build_count,
    count(*) filter(where build.state_code='OH' and build.status='active') as oh_active,
    count(*) filter(where build.state_code='WV' and build.status='active') as wv_active,
    count(*) filter(where build.status='staging') as staging
  from public.brinesearch_road_graph_builds build
), pad_authority as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pad.id::text||':'||coalesce(pad.structured_road_sequence,'')||':'||
      coalesce(pad.written_directions,'')||':'||coalesce(pad.directions_clear,'')||':'||
      coalesce(pad.structured_route_steps::text,'')||':'||
      coalesce(pad.driver_safety_context::text,'')||':'||
      coalesce(pg_catalog.round(pad.latitude::numeric,7)::text,'')||':'||
      coalesce(pg_catalog.round(pad.longitude::numeric,7)::text,''),
    ',' order by pad.id),'')) as digest from public.pads pad
), public_directions as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    directions.pad_id::text||':'||coalesce(directions.legacy_id,'')||':'||
      coalesce(directions.directions_clear,'')||':'||coalesce(directions.source_revision::text,''),
    ',' order by directions.pad_id),'')) as digest
  from public.brinesearch_driver_directions_public directions
), resolved_target as (
  select count(*) as count
  from public.brinesearch_route_prep_steps step
  join public.brinesearch_route_prep route on route.id=step.route_prep_id and route.active
  join public.pads pad on pad.id=route.pad_id
  join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    on receipt.route_prep_step_id=step.id
  where step.active and pad.legacy_id in('ascent--cooper','ascent--lorraine')
    and step.step_kind<>'private_segment'
    and receipt.resolution_status='resolved'
    and receipt.resolution_method='explicit_authoritative_source_receipt'
    and receipt.source_identity_key=step.source_details->>'source_identity_key'
    and receipt.canonical_road_id=step.road_id
)
select pg_catalog.jsonb_build_object(
  'checkedAt',pg_catalog.clock_timestamp(),
  'gue',(
    select pg_catalog.jsonb_build_object(
      'id',id,'status',status,'sourceRevisionDigest',source_revision_digest,
      'graphDigest',graph_digest,
      'releaseCurrent',private_verification.brinesearch_issue97_graph_build_release_current(id)
    ) from public.brinesearch_road_graph_builds
    where state_code='OH' and county_code='GUE' and status='active'
  ),
  'oh258Road',(
    select pg_catalog.jsonb_build_object(
      'id',road.id,'verificationStatus',road.verification_status,
      'geometryStatus',road.geometry_status,'sourceMethod',road.source_method,
      'sourceRecordId',road.source_record_id,
      'centerlineDigest',case when road.centerline_geojson is null then null
        else pg_catalog.md5(road.centerline_geojson::text) end
    ) from public.brinesearch_roads road
    where road.id='f230224c-b99a-4652-b672-3b80667ba81e'
  ),
  'graphState',(select pg_catalog.to_jsonb(graph_state) from graph_state),
  'targetStepDigest',(select digest from target_steps),
  'targetReceiptDigest',(select digest from target_receipts),
  'resolvedTargetPublicOccurrences',(select count from resolved_target),
  'cooperPrivateAccess',(
    select pg_catalog.jsonb_build_object(
      'status',receipt.resolution_status,'holdReason',receipt.hold_reason,
      'identityId',receipt.identity_id,'roadId',receipt.canonical_road_id
    ) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    where receipt.route_prep_step_id='ccf07501-e55f-476a-b440-741bd750ae5b'
  ),
  'targetPrivateGoogle',(
    select pg_catalog.jsonb_object_agg(
      pad.legacy_id,pad.brinesearch_google_route_status_issue97 order by pad.legacy_id
    ) from public.pads pad where pad.legacy_id in('ascent--cooper','ascent--lorraine')
  ),
  'targetRoads',(select count(*) from public.brinesearch_roads where id in(
    'bb31e5fa-7fbd-38bd-564a-65cd8005a8a0','404a9e8d-b1f1-7539-39d0-47f0b3fb721d')),
  'targetMappings',(select count(*) from public.brinesearch_road_identity_mappings where identity_id in(
    '1d61e8f0-527b-582a-022a-673001d546df','b80b9fff-6d0e-b5b7-3b93-e8c28b476fca',
    '2ef72301-66f2-e0d9-983b-9d289a306a1a')),
  'targetManifestCount',(select count(*)
    from private_verification.brinesearch_issue97_state_candidate_manifests
    where manifest_key='issue97-ohio-r4-gue-exact-identity-candidate'),
  'occurrenceReceipts',(select count(*)
    from private_verification.brinesearch_route_occurrence_receipts_issue97),
  'padAuthorityDigest',(select digest from pad_authority),
  'publicDirectionsDigest',(select digest from public_directions),
  'directory',(
    select pg_catalog.jsonb_build_object(
      'snapshotId',snapshot_id,'sourceRevision',source_revision,'rowCount',row_count,
      'searchableCount',searchable_count,'sha256',content_sha256
    ) from public.brinesearch_directory_snapshots_v18 where publication_state='current'
  ),
  'publicGoogleRows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'googleQueue',(select count(*)
    from private_verification.brinesearch_google_route_refresh_queue_issue97),
  'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton),
  'savedReconciliationRuns',(select count(*)
    from private_verification.brinesearch_issue97_saved_road_reconciliation_runs),
  'overlaySnapshots',(select count(*) from public.brinesearch_company_road_overlay_snapshots_v18),
  'overlayRows',(select count(*) from public.brinesearch_company_road_overlay_rows_v18),
  'ledger',(
    select pg_catalog.jsonb_build_object(
      'count',count(*),'name',max(name),'statementCount',max(cardinality(statements)),
      'statementMd5',max(pg_catalog.md5(statements[1]))
    ) from supabase_migrations.schema_migrations where version='${migrationVersion}'
  )
) as state`;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertBefore(state) {
  invariant(state.gue?.id === "44245144-3e39-45fe-907b-95e2b01b9c32", "GUE active build drifted");
  invariant(state.gue?.status === "active" && state.gue?.releaseCurrent === true, "GUE currentness drifted");
  invariant(state.gue?.graphDigest === "d7a43bacbf54794d4e92d9e8ceca2e28", "GUE graph digest drifted");
  invariant(state.gue?.sourceRevisionDigest === "b0cc4e8e3aaa7121cc39cc7935189664", "GUE source digest drifted");
  invariant(state.oh258Road?.verificationStatus === "needs_review", "OH-258 verification state drifted");
  invariant(state.oh258Road?.geometryStatus === "not_loaded", "OH-258 geometry state drifted");
  invariant(state.oh258Road?.sourceMethod === "explicit_in_saved_directions", "OH-258 source state drifted");
  invariant(state.oh258Road?.sourceRecordId === null && state.oh258Road?.centerlineDigest === null, "OH-258 data drifted");
  invariant(state.graphState?.digest === "d0ef1651c2849546f58d7ceed8ae4ab8", "Graph corpus drifted");
  invariant(Number(state.graphState?.build_count) === 49, "Graph build count drifted");
  invariant(Number(state.graphState?.oh_active) === 19 && Number(state.graphState?.wv_active) === 1, "Active graph count drifted");
  invariant(Number(state.graphState?.staging) === 0, "Unexpected staging graph exists");
  invariant(state.targetStepDigest === "8274750e5ab43e6d0bb9b70527dd29cc", "Target steps drifted");
  invariant(state.targetReceiptDigest === "9e58e0c45050e90bf43dd357bae7516d", "Target receipts drifted");
  invariant(Number(state.targetRoads) === 0 && Number(state.targetMappings) === 0, "GUE target objects already exist");
  invariant(Number(state.targetManifestCount) === 0, "GUE target manifest already exists");
  invariant(Number(state.occurrenceReceipts) === 4106, "Occurrence receipt count drifted");
  invariant(state.padAuthorityDigest === "3bfe76004119278b472596b5570373ca", "Pad authority drifted");
  invariant(state.publicDirectionsDigest === "b123f19d3a8f1e31f9f8c41ea2fa677a", "Public directions drifted");
  invariant(state.directory?.snapshotId === "1793f911-a0c2-4a8a-8a2f-195f2f375e09", "Directory snapshot drifted");
  invariant(Number(state.directory?.sourceRevision) === 3 && state.directory?.sha256 === "52e12db47007d7ce2cbae17519809f0081b7be8d575f880a1a583b93f9ac4447", "Directory revision drifted");
  invariant(Number(state.publicGoogleRows) === 0 && Number(state.googleQueue) === 0, "Google state drifted");
  invariant(state.cutoverAt === null, "Cutover is unexpectedly active");
  invariant(Number(state.savedReconciliationRuns) === 0, "Saved reconciliation state drifted");
  invariant(Number(state.overlaySnapshots) === 0 && Number(state.overlayRows) === 0, "Overlay state drifted");
  invariant(Number(state.ledger?.count) === 0, "GUE migration ledger entry already exists");
}

function assertAfter(state) {
  invariant(state.gue?.id !== "44245144-3e39-45fe-907b-95e2b01b9c32", "GUE active build was not replaced");
  invariant(state.gue?.status === "active" && state.gue?.releaseCurrent === true, "New GUE build is not release-current");
  invariant(state.gue?.graphDigest === "b6c8618795fa8692427b8c47a473d551", "New GUE graph digest diverged from rehearsal");
  invariant(state.gue?.sourceRevisionDigest === "082daf6c993fa38f1e8069bb5a20e9db", "New GUE source digest diverged from rehearsal");
  invariant(state.oh258Road?.verificationStatus === "verified", "OH-258 is not verified");
  invariant(state.oh258Road?.geometryStatus === "official_centerline_loaded", "OH-258 geometry was not installed");
  invariant(state.oh258Road?.sourceMethod === "issue97_oh_exact_route_family", "OH-258 source method diverged");
  invariant(state.oh258Road?.sourceRecordId === "SGUESR00258**C", "OH-258 source record diverged");
  invariant(state.oh258Road?.centerlineDigest === "51e2d9edc4aa6ba818642ea82272ce4c", "OH-258 centerline diverged");
  invariant(Number(state.graphState?.oh_active) === 19 && Number(state.graphState?.wv_active) === 1, "Active graph count changed");
  invariant(Number(state.graphState?.staging) === 0, "A staging graph remains");
  invariant(Number(state.targetRoads) === 2 && Number(state.targetMappings) === 3, "GUE target object counts are wrong");
  invariant(Number(state.targetManifestCount) === 1, "GUE manifest count is wrong");
  invariant(Number(state.resolvedTargetPublicOccurrences) === 10, "GUE exact occurrence count is wrong");
  invariant(state.cooperPrivateAccess?.status === "held", "Cooper private access was upgraded");
  invariant(state.cooperPrivateAccess?.roadId === null && state.cooperPrivateAccess?.identityId === null, "Cooper private access gained invented authority");
  invariant(state.targetPrivateGoogle?.["ascent--cooper"] === "not_evaluated", "Cooper Google state changed");
  invariant(state.targetPrivateGoogle?.["ascent--lorraine"] === "not_evaluated", "Lorraine Google state changed");
  invariant(Number(state.occurrenceReceipts) === 4106, "Occurrence receipt corpus count changed");
  invariant(state.padAuthorityDigest === "3bfe76004119278b472596b5570373ca", "Pad authority changed");
  invariant(state.publicDirectionsDigest === "b123f19d3a8f1e31f9f8c41ea2fa677a", "Public directions changed");
  invariant(Number(state.directory?.sourceRevision) === 4, "Directory revision is not 4");
  invariant(Number(state.directory?.rowCount) === 1214 && Number(state.directory?.searchableCount) === 1214, "Directory row counts changed");
  invariant(state.directory?.snapshotId !== "1793f911-a0c2-4a8a-8a2f-195f2f375e09", "Directory snapshot was not refreshed");
  invariant(
    typeof state.directory?.sha256 === "string" &&
      /^[0-9a-f]{64}$/u.test(state.directory.sha256) &&
      state.directory.sha256 !== "52e12db47007d7ce2cbae17519809f0081b7be8d575f880a1a583b93f9ac4447",
    "Directory digest was not refreshed",
  );
  invariant(Number(state.publicGoogleRows) === 0 && Number(state.googleQueue) === 0, "Google state expanded");
  invariant(state.cutoverAt === null, "Cutover was enabled");
  invariant(Number(state.savedReconciliationRuns) === 0, "Saved reconciliation was run");
  invariant(Number(state.overlaySnapshots) === 0 && Number(state.overlayRows) === 0, "Overlay authority changed");
  invariant(Number(state.ledger?.count) === 1, "GUE migration ledger count is wrong");
  invariant(state.ledger?.name === migrationName, "GUE migration ledger name is wrong");
  invariant(Number(state.ledger?.statementCount) === 1, "GUE migration ledger statement count is wrong");
  invariant(state.ledger?.statementMd5 === migrationMd5, "GUE migration ledger bytes diverged");
}

function publicError(error, phase, startedAt) {
  return {
    kind: "failure",
    phase,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    code: error?.code ?? null,
    message: error?.message ?? String(error),
    detail: error?.detail ?? null,
    hint: error?.hint ?? null,
    where: error?.where ?? null,
  };
}

const startedAt = Date.now();
let phase = "connect";
let transactionOpen = false;
let persistedState = null;
let client = new Client(connectionConfig);
const heartbeat = setInterval(() => {
  console.log(JSON.stringify({
    kind: "heartbeat",
    phase,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  }));
}, 30_000);

try {
  await client.connect();

  phase = "drift-check";
  const before = (await client.query(stateSql)).rows[0].state;
  assertBefore(before);
  console.log(JSON.stringify({ kind: "before", migrationSha256, state: before }));

  phase = "begin";
  await client.query("begin");
  transactionOpen = true;
  await client.query("set local application_name='issue97-gue-permanent-install'");

  phase = "transaction-drift-check";
  assertBefore((await client.query(stateSql)).rows[0].state);

  phase = "migration";
  const migrationResults = await client.query(migrationSql);
  const results = Array.isArray(migrationResults) ? migrationResults : [migrationResults];
  const migrationResult = results
    .flatMap((result) => result.rows ?? [])
    .find((row) => Object.hasOwn(row, "issue97_gue_result"))?.issue97_gue_result ?? null;
  invariant(migrationResult !== null, "GUE migration returned no result evidence");
  console.log(JSON.stringify({ kind: "migration-result", result: migrationResult }));

  phase = "migration-ledger";
  await client.query(
    "insert into supabase_migrations.schema_migrations(version,statements,name) values ($1,array[$2]::text[],$3)",
    [migrationVersion, migrationSql, migrationName],
  );

  phase = "inside-verification";
  const inside = (await client.query(stateSql)).rows[0].state;
  assertAfter(inside);
  console.log(JSON.stringify({ kind: "inside", state: inside }));

  phase = "commit";
  await client.query("commit");
  transactionOpen = false;

  phase = "persisted-verification";
  persistedState = (await client.query(stateSql)).rows[0].state;
  assertAfter(persistedState);
  console.log(JSON.stringify({ kind: "after", state: persistedState }));

  phase = "complete";
  console.log(JSON.stringify({
    kind: "complete",
    result: "installed-and-verified",
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
  if (persistedState === null) {
    try {
      await client.end();
    } catch {}
    client = new Client(connectionConfig);
    try {
      await client.connect();
      persistedState = (await client.query(stateSql)).rows[0].state;
    } catch (inspectionError) {
      console.error(JSON.stringify(publicError(inspectionError, "persisted-state-inspection", startedAt)));
    }
  }
  if (persistedState !== null) {
    console.error(JSON.stringify({ kind: "persisted-state-inspection", state: persistedState }));
  }
  process.exitCode = 1;
} finally {
  clearInterval(heartbeat);
  try {
    await client.end();
  } catch {}
}
