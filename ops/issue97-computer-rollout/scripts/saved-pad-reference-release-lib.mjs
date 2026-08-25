import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("C:/Users/frank/AppData/Local/Temp/brinesearch-issue97-pg/node_modules/pg");

export const migrationVersion = "20260825091844";
export const migrationName = "v18_public_saved_pad_reference_coordinates";
export const priorMigrationVersion = "20260825081500";
export const expectedMigrationSha256 = "01d40a9f4de1d9f9c3ccb0d043420744e16cfe09970dfbcc6baecd5de5bfc7a4";
export const expectedSnapshotId = "586344d2-7118-4f61-b6bc-98a97a690fd1";
export const expectedReferenceSha256 = "f73b74cd91a103c7ebd1f425f61c15142110e861972318c0f754901cc6bccaa9";
export const expectedBeforeFunctionMd5 = "77e567a85ef748a21da8959054cd6e4f";

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
    if (separator > 0) result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
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

export function loadRelease(repositoryRoot) {
  const migrationPath = path.join(
    repositoryRoot,
    "supabase",
    "migrations",
    `${migrationVersion}_${migrationName}.sql`,
  );
  const migrationSql = fs.readFileSync(migrationPath, "utf8");
  const migrationSha256 = crypto.createHash("sha256").update(migrationSql).digest("hex");
  if (migrationSha256 !== expectedMigrationSha256) {
    throw new Error(`Migration digest diverged: ${migrationSha256}`);
  }
  if (/\b(?:begin|commit|rollback)\s*;/iu.test(migrationSql)) {
    throw new Error("Migration unexpectedly contains transaction control");
  }
  if (/\b(?:insert|update|delete|truncate)\s+(?:into\s+)?(?:public|private_verification)\./iu.test(migrationSql)) {
    throw new Error("Migration unexpectedly contains production data DML");
  }
  return {
    migrationPath,
    migrationSql,
    migrationSha256,
    migrationStatementMd5: crypto.createHash("md5").update(migrationSql).digest("hex"),
  };
}

export function createClient(applicationName) {
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
  return new Client({
    host: service.host,
    port: Number(service.port),
    database: service.dbname,
    user: service.user,
    password: pgPassFields[4],
    ssl: service.sslmode === "disable" ? false : { rejectUnauthorized: false },
    application_name: applicationName,
    connectionTimeoutMillis: 20_000,
    keepAlive: true,
  });
}

export const stateSql = `
with pad_state as (
  select count(*)::integer row_count,pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.md5(pg_catalog.to_jsonb(pad)::text),',' order by pad.id
  ),'')) digest from public.pads pad
), directions_state as (
  select count(*)::integer row_count,pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.md5(pg_catalog.to_jsonb(directions)::text),',' order by directions.pad_id
  ),'')) digest from public.brinesearch_driver_directions_public directions
), route_state as (
  select
    (select count(*) from public.brinesearch_route_prep)::integer route_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(route)::text),',' order by route.id),'')) from public.brinesearch_route_prep route) route_digest,
    (select count(*) from public.brinesearch_route_prep_steps)::integer step_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(step)::text),',' order by step.id),'')) from public.brinesearch_route_prep_steps step) step_digest
), graph_state as (
  select
    (select count(*) from public.brinesearch_road_graph_builds)::integer build_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(build)::text),',' order by build.id),'')) from public.brinesearch_road_graph_builds build) build_digest,
    (select count(*) from public.brinesearch_road_junctions)::integer junction_count,
    (select count(*) from public.brinesearch_road_junction_anchors)::integer anchor_count,
    (select count(*) from public.brinesearch_road_junction_memberships)::integer membership_count
), google_state as (
  select
    (select count(*) from private_verification.brinesearch_google_route_receipts_issue97)::integer private_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),',' order by receipt.pad_id),'')) from private_verification.brinesearch_google_route_receipts_issue97 receipt) private_digest,
    (select count(*) from public.brinesearch_driver_google_routes_public)::integer public_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(public_route)::text),',' order by public_route.pad_id),'')) from public.brinesearch_driver_google_routes_public public_route) public_digest,
    (select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97)::integer queue_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(queue)::text),',' order by queue.pad_id),'')) from private_verification.brinesearch_google_route_refresh_queue_issue97 queue) queue_digest
), overlay_state as (
  select
    (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18)::integer snapshot_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(snapshot)::text),',' order by snapshot.snapshot_id),'')) from public.brinesearch_company_road_overlay_snapshots_v18 snapshot) snapshot_digest,
    (select count(*) from public.brinesearch_company_road_overlay_rows_v18)::integer row_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text),',' order by row_value.snapshot_id,row_value.selection_kind,row_value.selection_key,row_value.ordinal),'')) from public.brinesearch_company_road_overlay_rows_v18 row_value) row_digest
), directory_state as (
  select snapshot.snapshot_id,snapshot.source_revision,snapshot.row_count,
    snapshot.searchable_count,snapshot.content_sha256,
    (select count(*) from public.brinesearch_directory_snapshot_rows_v18 row_value
      where row_value.snapshot_id=snapshot.snapshot_id)::integer snapshot_row_count,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text),',' order by row_value.ordinal
    ),'')) from public.brinesearch_directory_snapshot_rows_v18 row_value
      where row_value.snapshot_id=snapshot.snapshot_id) snapshot_row_digest
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.publication_state='current'
), reference_function as (
  select pg_catalog.jsonb_build_object(
    'oid',procedure.oid,'definitionMd5',pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)),
    'acl',procedure.proacl,'securityDefiner',procedure.prosecdef,'volatility',procedure.provolatile,
    'config',procedure.proconfig
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
  'directory',(select pg_catalog.to_jsonb(directory_state) from directory_state),
  'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton),
  'priorMigrationLedgerCount',(select count(*) from supabase_migrations.schema_migrations where version='${priorMigrationVersion}'),
  'migrationLedgerCount',(select count(*) from supabase_migrations.schema_migrations where version='${migrationVersion}'),
  'migrationStatementMd5',(select pg_catalog.md5(coalesce(statements[1],'')) from supabase_migrations.schema_migrations where version='${migrationVersion}'),
  'referenceFunction',(select value from reference_function)
) state`;

export const evidenceSql = `
with response as (
  select public.brinesearch_v18_pad_reference_coordinates('${expectedSnapshotId}'::uuid) payload
)
select pg_catalog.jsonb_build_object(
  'snapshotId',payload->>'snapshotId','sourceRevision',payload->>'sourceRevision',
  'rowCount',(payload->>'rowCount')::integer,
  'officialPadReference',(payload->'kindCounts'->>'officialPadReference')::integer,
  'officialWellheadReference',(payload->'kindCounts'->>'officialWellheadReference')::integer,
  'savedPadReference',(payload->'kindCounts'->>'savedPadReference')::integer,
  'contentSha256',payload->>'contentSha256','arrayRows',pg_catalog.jsonb_array_length(payload->'rows'),
  'duplicatePadIds',(select count(*) from (
    select row_item.value->>'padId'
    from pg_catalog.jsonb_array_elements(payload->'rows') row_item(value)
    group by row_item.value->>'padId' having count(*)<>1
  ) duplicate),
  'publicGoogleRows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton),
  'overlayCurrent',(select pg_catalog.jsonb_build_object('snapshotId',snapshot_id,'rows',row_count,'sha256',content_sha256)
    from public.brinesearch_company_road_overlay_snapshots_v18 where publication_state='current')
) evidence from response`;

export async function queryState(client) {
  return (await client.query(stateSql)).rows[0].state;
}

export async function queryEvidence(client) {
  return (await client.query(evidenceSql)).rows[0].evidence;
}

export function protectedState(value) {
  const {
    checkedAt: _checkedAt,
    referenceFunction: _referenceFunction,
    migrationLedgerCount: _migrationLedgerCount,
    migrationStatementMd5: _migrationStatementMd5,
    ...protectedValue
  } = value;
  return JSON.stringify(protectedValue);
}

export function stateWithoutClock(value) {
  const { checkedAt: _checkedAt, ...rest } = value;
  return JSON.stringify(rest);
}

export function assertBaseline(state) {
  if (state.directory?.snapshot_id !== expectedSnapshotId
    || Number(state.directory?.source_revision) !== 5
    || Number(state.directory?.row_count) !== 1214
    || Number(state.directory?.snapshot_row_count) !== 1214
    || Number(state.google?.public_count) !== 0
    || state.cutoverAt !== null
    || Number(state.overlay?.row_count) !== 10
    || Number(state.priorMigrationLedgerCount) !== 1
    || Number(state.migrationLedgerCount) !== 0
    || state.referenceFunction?.definitionMd5 !== expectedBeforeFunctionMd5
    || state.pads?.digest !== "6670b55572e446504a65056d9420de8c"
    || state.directions?.digest !== "7c31ba793ff44c7bd44462239fb5ad6a"
    || state.routes?.route_digest !== "2eca6b1c43bfa8a3cdd00f0e572d7efd"
    || state.routes?.step_digest !== "938f0602d119df89182f1ae61a9f7e7e"
    || state.graphs?.build_digest !== "1fe95d415ed91aba9568257bdf5f9bab"
    || state.google?.private_digest !== "7e6d98519345b9d4f41d91d60633f002"
    || state.overlay?.row_digest !== "be8f24ec27137f625ab7c3b3328d0489") {
    throw new Error("Saved-pad-reference production preconditions drifted");
  }
}

export function assertExpandedEvidence(evidence) {
  if (evidence.snapshotId !== expectedSnapshotId
    || evidence.sourceRevision !== "5"
    || Number(evidence.rowCount) !== 731
    || Number(evidence.officialPadReference) !== 64
    || Number(evidence.officialWellheadReference) !== 85
    || Number(evidence.savedPadReference) !== 582
    || Number(evidence.arrayRows) !== 731
    || Number(evidence.duplicatePadIds) !== 0
    || evidence.contentSha256 !== expectedReferenceSha256
    || Number(evidence.publicGoogleRows) !== 0
    || evidence.cutoverAt !== null) {
    throw new Error("Expanded saved-pad-reference evidence did not match the pinned contract");
  }
}

export function publicError(error, phase, startedAt) {
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
