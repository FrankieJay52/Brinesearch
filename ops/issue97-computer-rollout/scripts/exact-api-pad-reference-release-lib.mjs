import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createClient,
  publicError,
  stateSql,
} from "./saved-pad-reference-release-lib.mjs";

export { createClient, publicError };

export const migrationVersion = "20260825100521";
export const migrationName = "v18_public_exact_base_api_pad_references";
export const expectedSnapshotId = "586344d2-7118-4f61-b6bc-98a97a690fd1";
export const expectedReferenceSha256 = "65af6626f38c372ed6263b861cf4d62375d6246c5581692dff1b9bbf2fc4dd47";
export const expectedBeforeFunctionMd5 = "dc38da188bf4c4343dcf5cae5f1c41a7";
export const expectedMigrationSha256 = "3325fefa505c68a41d3fe60e4ab8437d680ec87d51fd555a13ddf1714b0a9943";

const sourceStateSql = `
select pg_catalog.jsonb_build_object(
  'rowCount',pg_catalog.count(*),
  'ohioRowCount',pg_catalog.count(*) filter(
    where pg_catalog.lower(coalesce(source_row.state,'')) in ('oh','ohio')
  ),
  'digest',pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.md5(pg_catalog.to_jsonb(source_row)::text),','
    order by source_row.state,source_row.canonical_api,source_row.official_id
  ),'')),
  'targetMigrationLedgerCount',(
    select pg_catalog.count(*)
    from supabase_migrations.schema_migrations
    where version='${migrationVersion}'
  ),
  'targetMigrationStatementMd5',(
    select pg_catalog.md5(coalesce(migration.statements[1],''))
    from supabase_migrations.schema_migrations migration
    where migration.version='${migrationVersion}'
  )
) value
from private_verification.official_wells_unified_20260803 source_row`;

const evidenceSql = `
with response as (
  select public.brinesearch_v18_pad_reference_coordinates(
    '${expectedSnapshotId}'::uuid
  ) payload
), rows as (
  select row_value.value
  from response
  cross join lateral pg_catalog.jsonb_array_elements(
    response.payload->'rows'
  ) row_value(value)
), ohio as (
  select snapshot_row.*
  from public.brinesearch_directory_snapshot_rows_v18 snapshot_row
  where snapshot_row.snapshot_id='${expectedSnapshotId}'::uuid
    and snapshot_row.state='Ohio'
    and snapshot_row.record_type='pad'
), released_ids as (
  select (row.value->>'padId')::uuid pad_id from rows row
)
select pg_catalog.jsonb_build_object(
  'snapshotId',payload->>'snapshotId',
  'sourceRevision',payload->>'sourceRevision',
  'rowCount',(payload->>'rowCount')::integer,
  'officialPadReference',
    (payload->'kindCounts'->>'officialPadReference')::integer,
  'officialWellheadReference',
    (payload->'kindCounts'->>'officialWellheadReference')::integer,
  'savedPadReference',
    (payload->'kindCounts'->>'savedPadReference')::integer,
  'contentSha256',payload->>'contentSha256',
  'arrayRows',pg_catalog.jsonb_array_length(payload->'rows'),
  'duplicatePadIds',(select pg_catalog.count(*) from (
    select row.value->>'padId'
    from rows row
    group by row.value->>'padId'
    having pg_catalog.count(*)<>1
  ) duplicate),
  'releasedCandidateCount',(select pg_catalog.count(*)
    from rows row
    where row.value->>'padId'=any(array[
      'cf86addd-cbea-4036-ad84-7ab9c6ef8ead',
      'a2a09410-ebe7-41d0-8270-8f627070a58e',
      '51c477b2-d4b0-44c4-8363-ba4b31f4b01e',
      '54268967-e9d8-44f8-93c6-32e19727cad6',
      '864157a4-2d97-4af3-b10b-7022737b53a0',
      '0e01bbf2-0bdb-44d8-bd12-baae1da226f6',
      'c1b95a10-c9ec-499f-ae6c-84430175b9b3',
      '254d4d73-5795-49b6-b89c-333809aac154',
      '133d1688-e886-4d50-a60f-75d71da41487',
      '2f4e6e6e-869b-515a-8259-69ddb5bf70c8'
    ]) and row.value->>'referenceKind'='official_wellhead_reference'),
  'remainingOhioPads',(select pg_catalog.count(*)
    from ohio
    where (driver_latitude is null or driver_longitude is null)
      and not exists(
        select 1 from released_ids released where released.pad_id=ohio.pad_id
      )),
  'publicGoogleRows',(
    select pg_catalog.count(*)
    from public.brinesearch_driver_google_routes_public
  ),
  'cutoverAt',(
    select cutover_at
    from public.brinesearch_issue97_release_state where singleton
  )
) evidence
from response`;

export function loadRelease(repositoryRoot) {
  const migrationPath = path.join(
    repositoryRoot,"supabase","migrations",
    `${migrationVersion}_${migrationName}.sql`,
  );
  const migrationSql = fs.readFileSync(migrationPath,"utf8");
  const migrationSha256 = crypto.createHash("sha256")
    .update(migrationSql).digest("hex");
  if (migrationSha256!==expectedMigrationSha256) {
    throw new Error(`Migration digest diverged: ${migrationSha256}`);
  }
  if (/\b(?:begin|commit|rollback)\s*;/iu.test(migrationSql)) {
    throw new Error("Migration unexpectedly contains transaction control");
  }
  if (/\b(?:insert|update|delete|truncate)\s+(?:into\s+)?(?:public|private_verification)\./iu.test(migrationSql)) {
    throw new Error("Migration unexpectedly contains production data DML");
  }
  return {
    migrationPath,migrationSql,migrationSha256,
    migrationStatementMd5:crypto.createHash("md5")
      .update(migrationSql).digest("hex"),
  };
}

export async function queryState(client) {
  const base=(await client.query(stateSql)).rows[0].state;
  const source=(await client.query(sourceStateSql)).rows[0].value;
  return {...base,officialWellSource:source};
}

export async function queryEvidence(client) {
  return (await client.query(evidenceSql)).rows[0].evidence;
}

export function protectedState(value) {
  const {
    checkedAt:_checkedAt,
    referenceFunction:_referenceFunction,
    officialWellSource,
    ...rest
  }=value;
  const {
    targetMigrationLedgerCount:_targetMigrationLedgerCount,
    targetMigrationStatementMd5:_targetMigrationStatementMd5,
    ...protectedOfficialWellSource
  }=officialWellSource;
  return JSON.stringify({...rest,officialWellSource:protectedOfficialWellSource});
}

export function stateWithoutClock(value) {
  const {checkedAt:_checkedAt,...rest}=value;
  return JSON.stringify(rest);
}

export function assertBaseline(state) {
  if (state.directory?.snapshot_id!==expectedSnapshotId
    || Number(state.directory?.source_revision)!==5
    || Number(state.directory?.row_count)!==1214
    || Number(state.directory?.snapshot_row_count)!==1214
    || Number(state.google?.public_count)!==0
    || state.cutoverAt!==null
    || Number(state.overlay?.row_count)!==10
    || Number(state.priorMigrationLedgerCount)!==1
    || Number(state.migrationLedgerCount)!==1
    || state.migrationStatementMd5!=="054f8d1e5be92a58b193efe43fb9b4e3"
    || Number(state.officialWellSource?.targetMigrationLedgerCount)!==0
    || state.officialWellSource?.targetMigrationStatementMd5!==null
    || Number(state.officialWellSource?.rowCount)!==32340
    || Number(state.officialWellSource?.ohioRowCount)!==4250
    || state.officialWellSource?.digest!=="c1c6ed406e4808bf7931bbffca73f793"
    || state.referenceFunction?.definitionMd5!==expectedBeforeFunctionMd5
    || state.pads?.digest!=="6670b55572e446504a65056d9420de8c"
    || state.directions?.digest!=="7c31ba793ff44c7bd44462239fb5ad6a"
    || state.routes?.route_digest!=="2eca6b1c43bfa8a3cdd00f0e572d7efd"
    || state.routes?.step_digest!=="938f0602d119df89182f1ae61a9f7e7e"
    || state.graphs?.build_digest!=="1fe95d415ed91aba9568257bdf5f9bab"
    || state.google?.private_digest!=="7e6d98519345b9d4f41d91d60633f002"
    || state.overlay?.row_digest!=="be8f24ec27137f625ab7c3b3328d0489") {
    throw new Error("Exact-API pad-reference production preconditions drifted");
  }
}

export function assertExpandedEvidence(evidence) {
  if (evidence.snapshotId!==expectedSnapshotId
    || evidence.sourceRevision!=="5"
    || Number(evidence.rowCount)!==741
    || Number(evidence.officialPadReference)!==64
    || Number(evidence.officialWellheadReference)!==95
    || Number(evidence.savedPadReference)!==582
    || Number(evidence.arrayRows)!==741
    || Number(evidence.duplicatePadIds)!==0
    || Number(evidence.releasedCandidateCount)!==10
    || Number(evidence.remainingOhioPads)!==53
    || evidence.contentSha256!==expectedReferenceSha256
    || Number(evidence.publicGoogleRows)!==0
    || evidence.cutoverAt!==null) {
    throw new Error("Expanded exact-API pad-reference evidence diverged");
  }
}
