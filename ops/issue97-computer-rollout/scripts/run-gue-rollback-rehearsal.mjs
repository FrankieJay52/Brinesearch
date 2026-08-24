import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("C:/Users/frank/AppData/Local/Temp/brinesearch-issue97-pg/node_modules/pg");

const repositoryRoot = process.argv[2];
if (!repositoryRoot) {
  throw new Error("Repository root argument is required");
}

const migrationPath = path.join(
  repositoryRoot,
  "supabase",
  "migrations",
  "20260824122000_issue97_gue_held_route_exact_identity_receipts.sql",
);
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const migrationSha256 = crypto.createHash("sha256").update(migrationSql).digest("hex");
const expectedMigrationSha256 = "fe64b9d07defa4f9fab986edf23089de11dc289748432e980500e4f03c7af7df";

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

function matchesPgPass(expected, actual) {
  return actual === "*" || actual === expected;
}

const serviceName = process.env.PGSERVICE;
const appData = process.env.APPDATA;
if (!serviceName || !appData) {
  throw new Error("PGSERVICE or APPDATA is unavailable");
}

const servicePath = path.join(appData, "postgresql", ".pg_service.conf");
const pgPassPath = path.join(appData, "postgresql", "pgpass.conf");
const service = parseServiceFile(fs.readFileSync(servicePath, "utf8"), serviceName);
for (const key of ["host", "port", "dbname", "user"]) {
  if (!service[key]) throw new Error(`Postgres service is missing ${key}`);
}

const pgPassFields = fs
  .readFileSync(pgPassPath, "utf8")
  .split(/\r?\n/u)
  .filter((line) => line && !line.startsWith("#"))
  .map(parsePgPassLine)
  .find(
    (fields) =>
      fields.length === 5 &&
      matchesPgPass(service.host, fields[0]) &&
      matchesPgPass(service.port, fields[1]) &&
      matchesPgPass(service.dbname, fields[2]) &&
      matchesPgPass(service.user, fields[3]),
  );
if (!pgPassFields) {
  throw new Error("No matching pgpass entry exists for the configured service");
}

const connectionConfig = {
  host: service.host,
  port: Number(service.port),
  database: service.dbname,
  user: service.user,
  password: pgPassFields[4],
  ssl: service.sslmode === "disable" ? false : { rejectUnauthorized: false },
  application_name: "issue97-gue-manifest-rehearsal",
  connectionTimeoutMillis: 20_000,
  keepAlive: true,
};

const stateSql = `
with target_steps as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    step.id::text||':'||coalesce(step.road_id::text,'')||':'||coalesce(step.step_kind,'')||':'||
      coalesce(step.match_status,'')||':'||coalesce(step.match_method,'')||':'||
      coalesce(step.geometry_status,'')||':'||coalesce(step.source_details::text,''),
    ',' order by step.id
  ),'')) as digest
  from public.brinesearch_route_prep_steps step
  join public.brinesearch_route_prep route on route.id=step.route_prep_id
  join public.pads pad on pad.id=route.pad_id
  where pad.legacy_id in ('ascent--cooper','ascent--lorraine')
), target_receipts as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.route_prep_step_id::text||':'||coalesce(receipt.resolution_status,'')||':'||
      coalesce(receipt.resolution_method,'')||':'||coalesce(receipt.hold_reason,'')||':'||
      coalesce(receipt.identity_id::text,'')||':'||coalesce(receipt.canonical_road_id::text,''),
    ',' order by receipt.route_prep_step_id
  ),'')) as digest
  from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  join public.brinesearch_route_prep_steps step on step.id=receipt.route_prep_step_id
  join public.brinesearch_route_prep route on route.id=step.route_prep_id
  join public.pads pad on pad.id=route.pad_id
  where pad.legacy_id in ('ascent--cooper','ascent--lorraine')
), graph_state as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.state_code||':'||build.county_code||':'||build.status||':'||
      coalesce(build.source_revision_digest,'')||':'||coalesce(build.graph_digest,''),
    ',' order by build.id
  ),'')) as digest,
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
    ',' order by pad.id
  ),'')) as digest from public.pads pad
), public_directions as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    directions.pad_id::text||':'||coalesce(directions.legacy_id,'')||':'||
      coalesce(directions.directions_clear,'')||':'||coalesce(directions.source_revision::text,''),
    ',' order by directions.pad_id
  ),'')) as digest from public.brinesearch_driver_directions_public directions
)
select pg_catalog.jsonb_build_object(
  'checkedAt',pg_catalog.clock_timestamp(),
  'gue',(
    select pg_catalog.jsonb_build_object(
      'id',id,'status',status,'sourceRevisionDigest',source_revision_digest,'graphDigest',graph_digest
    ) from public.brinesearch_road_graph_builds
    where state_code='OH' and county_code='GUE' and status='active'
  ),
  'oh258Road',(
    select pg_catalog.jsonb_build_object(
      'id',road.id,'verificationStatus',road.verification_status,
      'geometryStatus',road.geometry_status,'sourceMethod',road.source_method,
      'sourceRecordId',road.source_record_id,
      'centerlineDigest',case when road.centerline_geojson is null then null
        else pg_catalog.md5(road.centerline_geojson::text) end,
      'candidateBasis',road.candidate_basis
    ) from public.brinesearch_roads road
    where road.id='f230224c-b99a-4652-b672-3b80667ba81e'
  ),
  'graphState',(select pg_catalog.to_jsonb(graph_state) from graph_state),
  'targetStepDigest',(select digest from target_steps),
  'targetReceiptDigest',(select digest from target_receipts),
  'targetRoads',(select count(*) from public.brinesearch_roads where id in(
    'bb31e5fa-7fbd-38bd-564a-65cd8005a8a0','404a9e8d-b1f1-7539-39d0-47f0b3fb721d'
  )),
  'targetMappings',(select count(*) from public.brinesearch_road_identity_mappings where identity_id in(
    '1d61e8f0-527b-582a-022a-673001d546df','b80b9fff-6d0e-b5b7-3b93-e8c28b476fca',
    '2ef72301-66f2-e0d9-983b-9d289a306a1a'
  )),
  'targetManifestCount',(select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests
    where manifest_key='issue97-ohio-r4-gue-exact-identity-candidate'),
  'occurrenceReceipts',(select count(*) from private_verification.brinesearch_route_occurrence_receipts_issue97),
  'padAuthorityDigest',(select digest from pad_authority),
  'publicDirectionsDigest',(select digest from public_directions),
  'directory',(
    select pg_catalog.jsonb_build_object(
      'snapshotId',snapshot_id,'sourceRevision',source_revision,'rowCount',row_count,
      'searchableCount',searchable_count,'sha256',content_sha256
    ) from public.brinesearch_directory_snapshots_v18 where publication_state='current'
  ),
  'publicGoogleRows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'googleQueue',(select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97),
  'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton),
  'savedReconciliationRuns',(select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs),
  'overlaySnapshots',(select count(*) from public.brinesearch_company_road_overlay_snapshots_v18),
  'overlayRows',(select count(*) from public.brinesearch_company_road_overlay_rows_v18)
) as state`;

const insideSql = `
select pg_catalog.jsonb_build_object(
  'checkedAt',pg_catalog.clock_timestamp(),
  'newGraph',(
    select pg_catalog.jsonb_build_object(
      'oldBuildId',target.old_build_id,'newBuildId',target.new_build_id,
      'manifestId',target.candidate_manifest_id,'manifestDigest',target.candidate_manifest_digest,
      'manifestGeneration',target.candidate_manifest_generation,
      'activation',target.activation_result,'cache',target.cache_result,
      'status',build.status,'graphDigest',build.graph_digest,'sourceRevisionDigest',build.source_revision_digest
    ) from pg_temp.tmp_issue97_gue_new_graph target
    join public.brinesearch_road_graph_builds build on build.id=target.new_build_id
  ),
  'graphCounts',(
    select pg_catalog.jsonb_build_object(
      'ohActive',count(*) filter(where state_code='OH' and status='active'),
      'wvActive',count(*) filter(where state_code='WV' and status='active'),
      'staging',count(*) filter(where status='staging')
    ) from public.brinesearch_road_graph_builds
  ),
  'targetRoads',(select count(*) from public.brinesearch_roads where id in(
    'bb31e5fa-7fbd-38bd-564a-65cd8005a8a0','404a9e8d-b1f1-7539-39d0-47f0b3fb721d'
  )),
  'targetMappings',(select count(*) from public.brinesearch_road_identity_mappings where identity_id in(
    '1d61e8f0-527b-582a-022a-673001d546df','b80b9fff-6d0e-b5b7-3b93-e8c28b476fca',
    '2ef72301-66f2-e0d9-983b-9d289a306a1a'
  )),
  'oh258Road',(
    select pg_catalog.jsonb_build_object(
      'id',road.id,'verificationStatus',road.verification_status,
      'geometryStatus',road.geometry_status,'sourceMethod',road.source_method,
      'sourceRecordId',road.source_record_id,
      'centerlineDigest',case when road.centerline_geojson is null then null
        else pg_catalog.md5(road.centerline_geojson::text) end,
      'candidateBasis',road.candidate_basis
    ) from public.brinesearch_roads road
    where road.id='f230224c-b99a-4652-b672-3b80667ba81e'
  ),
  'resolvedTargetPublicOccurrences',(
    select count(*)
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
  ),
  'cooperPrivateAccess',(
    select pg_catalog.jsonb_build_object(
      'status',receipt.resolution_status,'holdReason',receipt.hold_reason,
      'identityId',receipt.identity_id,'roadId',receipt.canonical_road_id
    ) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    where receipt.route_prep_step_id='ccf07501-e55f-476a-b440-741bd750ae5b'
  ),
  'targetPrivateGoogle',(
    select pg_catalog.jsonb_object_agg(pad.legacy_id,pad.brinesearch_google_route_status_issue97 order by pad.legacy_id)
    from public.pads pad where pad.legacy_id in('ascent--cooper','ascent--lorraine')
  ),
  'directory',(
    select pg_catalog.jsonb_build_object(
      'snapshotId',snapshot_id,'sourceRevision',source_revision,'rowCount',row_count,
      'searchableCount',searchable_count,'sha256',content_sha256
    ) from public.brinesearch_directory_snapshots_v18 where publication_state='current'
  ),
  'publicGoogleRows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'googleQueue',(select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97),
  'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton),
  'savedReconciliationRuns',(select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs),
  'overlaySnapshots',(select count(*) from public.brinesearch_company_road_overlay_snapshots_v18),
  'overlayRows',(select count(*) from public.brinesearch_company_road_overlay_rows_v18)
) as evidence`;

function canonicalState(value) {
  const { checkedAt: _checkedAt, ...state } = value;
  return JSON.stringify(state);
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
  phase = "begin";
  await client.query("begin");
  transactionOpen = true;
  await client.query("set local application_name='issue97-gue-manifest-rehearsal'");

  phase = "before-snapshot";
  const before = (await client.query(stateSql)).rows[0].state;
  console.log(JSON.stringify({ kind: "before", migrationSha256, state: before }));

  phase = "migration";
  const migrationResults = await client.query(migrationSql);
  const results = Array.isArray(migrationResults) ? migrationResults : [migrationResults];
  const migrationResult = results
    .flatMap((result) => result.rows ?? [])
    .find((row) => Object.hasOwn(row, "issue97_gue_result"))?.issue97_gue_result ?? null;
  console.log(JSON.stringify({ kind: "migration-result", result: migrationResult }));

  phase = "inside-snapshot";
  const inside = (await client.query(insideSql)).rows[0].evidence;
  console.log(JSON.stringify({ kind: "inside", evidence: inside }));

  phase = "rollback";
  await client.query("rollback");
  transactionOpen = false;

  phase = "after-snapshot";
  const after = (await client.query(stateSql)).rows[0].state;
  const zeroPersistentDelta = canonicalState(before) === canonicalState(after);
  console.log(JSON.stringify({ kind: "after", zeroPersistentDelta, state: after }));
  if (!zeroPersistentDelta) {
    throw new Error("Rollback rehearsal left a persistent state delta");
  }

  phase = "complete";
  console.log(JSON.stringify({
    kind: "complete",
    result: "passed-and-rolled-back",
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
  try {
    await client.end();
  } catch {}
  client = new Client(connectionConfig);
  try {
    await client.connect();
    const persisted = (await client.query(stateSql)).rows[0].state;
    console.error(JSON.stringify({ kind: "persisted-state-inspection", state: persisted }));
  } catch (inspectionError) {
    console.error(JSON.stringify(publicError(inspectionError, "persisted-state-inspection", startedAt)));
  }
  process.exitCode = 1;
} finally {
  clearInterval(heartbeat);
  try {
    await client.end();
  } catch {}
}
