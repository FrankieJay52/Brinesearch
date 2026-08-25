import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("C:/Users/frank/AppData/Local/Temp/brinesearch-issue97-pg/node_modules/pg");

const repositoryRoot = process.argv[2];
if (!repositoryRoot) throw new Error("Repository root argument is required");

const migrationVersion = "20260825081500";
const migrationName = "v18_public_pad_reference_coordinates";
const migrationPath = path.join(repositoryRoot, "supabase", "migrations", `${migrationVersion}_${migrationName}.sql`);
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const migrationSha256 = crypto.createHash("sha256").update(migrationSql).digest("hex");
const expectedMigrationSha256 = "b7c22eb048dd80f19f12670c29a41ea1c85dce77c4f654514fbc308446a1d4c7";
const expectedSnapshotId = "586344d2-7118-4f61-b6bc-98a97a690fd1";
const expectedReferenceSha256 = "9e9220e0e6fbb9eae45555f09704c1846ef763549464730a3a44dcc9e8567792";

if (migrationSha256 !== expectedMigrationSha256) throw new Error(`Migration digest diverged: ${migrationSha256}`);
if (/\b(?:begin|commit|rollback)\s*;/iu.test(migrationSql)) throw new Error("Migration unexpectedly contains transaction control");

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
    } else if (character === "\\") escaped = true;
    else if (character === ":") {
      fields.push(value);
      value = "";
    } else value += character;
  }
  fields.push(value);
  return fields;
}

function matchesPgPass(expected, actual) {
  return actual === "*" || actual === expected;
}

const serviceName = process.env.PGSERVICE;
const appData = process.env.APPDATA;
if (!serviceName || !appData) throw new Error("PGSERVICE or APPDATA is unavailable");
const service = parseServiceFile(fs.readFileSync(path.join(appData, "postgresql", ".pg_service.conf"), "utf8"), serviceName);
for (const key of ["host", "port", "dbname", "user"]) if (!service[key]) throw new Error(`Postgres service is missing ${key}`);
const pgPassFields = fs.readFileSync(path.join(appData, "postgresql", "pgpass.conf"), "utf8")
  .split(/\r?\n/u)
  .filter((line) => line && !line.startsWith("#"))
  .map(parsePgPassLine)
  .find((fields) => fields.length === 5
    && matchesPgPass(service.host, fields[0])
    && matchesPgPass(service.port, fields[1])
    && matchesPgPass(service.dbname, fields[2])
    && matchesPgPass(service.user, fields[3]));
if (!pgPassFields) throw new Error("No matching pgpass entry exists for the configured service");

const connectionConfig = {
  host: service.host,
  port: Number(service.port),
  database: service.dbname,
  user: service.user,
  password: pgPassFields[4],
  ssl: service.sslmode === "disable" ? false : { rejectUnauthorized: false },
  application_name: "issue97-pad-reference-rollback-rehearsal",
  connectionTimeoutMillis: 20_000,
  keepAlive: true,
};

const stateSql = `
with pad_state as (
  select count(*)::integer row_count,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(pad)::text),',' order by pad.id
    ),'')) digest
  from public.pads pad
), directions_state as (
  select count(*)::integer row_count,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(directions)::text),',' order by directions.pad_id
    ),'')) digest
  from public.brinesearch_driver_directions_public directions
), route_state as (
  select
    (select count(*) from public.brinesearch_route_prep)::integer route_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(route)::text),',' order by route.id
    ),'')) from public.brinesearch_route_prep route) route_digest,
    (select count(*) from public.brinesearch_route_prep_steps)::integer step_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(step)::text),',' order by step.id
    ),'')) from public.brinesearch_route_prep_steps step) step_digest
), graph_state as (
  select
    (select count(*) from public.brinesearch_road_graph_builds)::integer build_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(build)::text),',' order by build.id
    ),'')) from public.brinesearch_road_graph_builds build) build_digest,
    (select count(*) from public.brinesearch_road_junctions)::integer junction_count,
    (select count(*) from public.brinesearch_road_junction_anchors)::integer anchor_count,
    (select count(*) from public.brinesearch_road_junction_memberships)::integer membership_count
), google_state as (
  select
    (select count(*) from private_verification.brinesearch_google_route_receipts_issue97)::integer private_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),',' order by receipt.pad_id
    ),'')) from private_verification.brinesearch_google_route_receipts_issue97 receipt) private_digest,
    (select count(*) from public.brinesearch_driver_google_routes_public)::integer public_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(public_route)::text),',' order by public_route.pad_id
    ),'')) from public.brinesearch_driver_google_routes_public public_route) public_digest,
    (select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97)::integer queue_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(queue)::text),',' order by queue.pad_id
    ),'')) from private_verification.brinesearch_google_route_refresh_queue_issue97 queue) queue_digest
), overlay_state as (
  select
    (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18)::integer snapshot_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(snapshot)::text),',' order by snapshot.snapshot_id
    ),'')) from public.brinesearch_company_road_overlay_snapshots_v18 snapshot) snapshot_digest,
    (select count(*) from public.brinesearch_company_road_overlay_rows_v18)::integer row_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text),','
      order by row_value.snapshot_id,row_value.selection_kind,row_value.selection_key,row_value.ordinal
    ),'')) from public.brinesearch_company_road_overlay_rows_v18 row_value) row_digest
), reference_function as (
  select pg_catalog.jsonb_build_object(
    'oid',procedure.oid,
    'definitionMd5',pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)),
    'acl',procedure.proacl
  ) value
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='public'
    and procedure.proname='brinesearch_v18_pad_reference_coordinates'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)='p_snapshot_id uuid'
)
select pg_catalog.jsonb_build_object(
  'checkedAt',pg_catalog.clock_timestamp(),
  'pads',(select pg_catalog.to_jsonb(pad_state) from pad_state),
  'directions',(select pg_catalog.to_jsonb(directions_state) from directions_state),
  'routes',(select pg_catalog.to_jsonb(route_state) from route_state),
  'graphs',(select pg_catalog.to_jsonb(graph_state) from graph_state),
  'google',(select pg_catalog.to_jsonb(google_state) from google_state),
  'overlay',(select pg_catalog.to_jsonb(overlay_state) from overlay_state),
  'directory',(select pg_catalog.jsonb_build_object(
    'snapshotId',snapshot_id,'sourceRevision',source_revision,'rowCount',row_count,
    'searchableCount',searchable_count,'sha256',content_sha256
  ) from public.brinesearch_directory_snapshots_v18 where publication_state='current'),
  'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton),
  'migrationLedgerCount',(select count(*) from supabase_migrations.schema_migrations where version='${migrationVersion}'),
  'referenceFunction',(select value from reference_function)
) state`;

const evidenceSql = `
select pg_catalog.jsonb_build_object(
  'payload',public.brinesearch_v18_pad_reference_coordinates('${expectedSnapshotId}'::uuid),
  'publicGoogleRows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton),
  'overlayCurrent',(select pg_catalog.jsonb_build_object(
    'snapshotId',snapshot_id,'rows',row_count,'sha256',content_sha256
  ) from public.brinesearch_company_road_overlay_snapshots_v18 where publication_state='current')
) evidence`;

function canonicalState(value) {
  const { checkedAt: _checkedAt, referenceFunction: _referenceFunction, ...state } = value;
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

if (process.argv.includes("--read-only-preflight")) {
  await client.connect();
  const state = (await client.query(stateSql)).rows[0].state;
  console.log(JSON.stringify({ kind: "read-only-preflight", migrationSha256, state }));
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
  const before = (await client.query(stateSql)).rows[0].state;
  if (before.referenceFunction !== null || Number(before.migrationLedgerCount) !== 0) {
    throw new Error("Pad-reference feature is already installed or receipted");
  }
  console.log(JSON.stringify({ kind: "before", migrationSha256, state: before }));

  phase = "migration";
  await client.query(migrationSql);

  phase = "inside-evidence";
  const inside = (await client.query(stateSql)).rows[0].state;
  const evidence = (await client.query(evidenceSql)).rows[0].evidence;
  if (canonicalState(before) !== canonicalState(inside)) throw new Error("Migration changed protected data state inside rehearsal");
  if (!inside.referenceFunction) throw new Error("Pad-reference function was not installed transaction-locally");
  const payload = evidence.payload;
  if (!payload || payload.snapshotId !== expectedSnapshotId
    || payload.rowCount !== 149
    || payload.kindCounts?.officialPadReference !== 64
    || payload.kindCounts?.officialWellheadReference !== 85
    || payload.contentSha256 !== expectedReferenceSha256
    || !Array.isArray(payload.rows) || payload.rows.length !== 149) {
    throw new Error("Transaction-local pad-reference payload did not match the pinned contract");
  }
  if (Number(evidence.publicGoogleRows) !== 0 || evidence.cutoverAt !== null) {
    throw new Error("Public Google or cutover authority changed inside rehearsal");
  }
  console.log(JSON.stringify({ kind: "inside", state: inside, evidence }));

  phase = "rollback";
  await client.query("rollback");
  transactionOpen = false;

  phase = "after-snapshot";
  const after = (await client.query(stateSql)).rows[0].state;
  const zeroPersistentDelta = JSON.stringify({ ...before, checkedAt: null }) === JSON.stringify({ ...after, checkedAt: null });
  console.log(JSON.stringify({ kind: "after", zeroPersistentDelta, state: after }));
  if (!zeroPersistentDelta) throw new Error("Rollback rehearsal left a persistent state delta");

  phase = "complete";
  console.log(JSON.stringify({
    kind: "complete",
    result: "passed-and-rolled-back",
    migrationSha256,
    referenceSha256: expectedReferenceSha256,
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
  try { await client.end(); } catch {}
}
