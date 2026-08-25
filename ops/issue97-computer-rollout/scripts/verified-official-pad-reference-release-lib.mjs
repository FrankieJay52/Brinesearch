import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createClient,
  publicError,
  stateSql,
} from "./saved-pad-reference-release-lib.mjs";

export { createClient, publicError };

export const migrationVersion="20260825103402";
export const migrationName="v18_public_verified_official_pad_references";
export const expectedSnapshotId="586344d2-7118-4f61-b6bc-98a97a690fd1";
export const expectedReferenceSha256="1dfa303193d52cff7e6cefe358afca52d1e4406e9378d16ac993f1482e0f3e45";
export const expectedBeforeFunctionMd5="c49745b57f68275ca2d5017b2e054834";
export const expectedMigrationSha256="90c3cdc53497a60619b5741c4764916fbd1721c898dda28c45ae07c0cf6dca4b";

const proofStateSql=`
with targets(pad_id,official_pad_id,object_id) as (
  values
    ('0dc102c5-1640-47bf-9975-736cf684c227'::uuid,'PadGuernseyWashingtonSection14-1',343::bigint),
    ('4166a215-45bb-4662-82e2-80bb0184703b'::uuid,'PadBelmontRichlandSection35-2',868::bigint),
    ('07b566cd-393e-49f6-9547-676438aefc1a'::uuid,'PadBelmontRichlandSection22-2',908::bigint),
    ('54bbef2d-fc87-4a33-b999-1fec24fc3c62'::uuid,'PadJeffersonMtPleasantSection16-1',927::bigint),
    ('c4ef4511-c391-48af-9e1a-7b70b90e9294'::uuid,'PadGuernseyOxfordSection5-2',438::bigint)
), layer_rows as (
  select target.pad_id,layer.pad_id official_pad_id,layer.object_id,
    layer.county,layer.township,layer.latitude,layer.longitude
  from targets target
  join private_verification.ohio_pad_layer_20260804 layer
    on layer.pad_id=target.official_pad_id and layer.object_id=target.object_id
), selected_rows as (
  select selected.pad_id,selected.source,selected.official_id,
    selected.selection_reason,selected.coordinate_county_match,
    selected.coordinate_township_match
  from targets target
  join private_verification.pad_match_v2_selected_20260803 selected
    on selected.pad_id=target.pad_id
), receipt_rows as (
  select candidate.pad_id,source.source_key,record.source_record_id,
    record.state,record.entity_type,record.retired_at,
    record.normalized_facts->>'official_pad_id' official_pad_id,
    record.normalized_facts->>'source_object_id' source_object_id,
    record.latitude,record.longitude,candidate.result_category,
    candidate.match_method,candidate.confidence,candidate.review_status,
    candidate.conflicts
  from targets target
  join private_verification.public_data_match_candidates candidate
    on candidate.pad_id=target.pad_id
  join private_verification.public_data_source_records record
    on record.id=candidate.source_record_id
  join private_verification.public_data_sources source
    on source.id=record.source_id
  where source.source_key in (
      'oh_odnr_wellpads_snapshot_20260804','oh_odnr_live_wellpads'
    )
    and candidate.result_category='VERIFIED_EXISTING_RECORD'
    and candidate.review_status='confirmed'
), helper as (
  select pg_catalog.jsonb_build_object(
    'oid',procedure.oid,
    'definitionMd5',pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)),
    'acl',procedure.proacl,
    'securityDefiner',procedure.prosecdef,
    'volatility',procedure.provolatile,
    'config',procedure.proconfig
  ) value
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='private_verification'
    and procedure.proname=
      'brinesearch_v18_pad_reference_coordinates_base_20260825100521'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)=
      'p_snapshot_id uuid'
), current_reference as (
  select public.brinesearch_v18_pad_reference_coordinates(
    '${expectedSnapshotId}'::uuid
  ) payload
)
select pg_catalog.jsonb_build_object(
  'priorMigrationLedgerCount',(
    select pg_catalog.count(*) from supabase_migrations.schema_migrations
    where version='20260825100521'
  ),
  'priorMigrationStatementMd5',(
    select pg_catalog.md5(coalesce(statements[1],''))
    from supabase_migrations.schema_migrations
    where version='20260825100521'
  ),
  'targetMigrationLedgerCount',(
    select pg_catalog.count(*) from supabase_migrations.schema_migrations
    where version='${migrationVersion}'
  ),
  'targetMigrationStatementMd5',(
    select pg_catalog.md5(coalesce(statements[1],''))
    from supabase_migrations.schema_migrations
    where version='${migrationVersion}'
  ),
  'layers',(select pg_catalog.jsonb_build_object(
    'count',pg_catalog.count(*),
    'digest',pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(layer_rows)::text),',' order by pad_id
    ),''))
  ) from layer_rows),
  'selected',(select pg_catalog.jsonb_build_object(
    'count',pg_catalog.count(*),
    'digest',pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(selected_rows)::text),',' order by pad_id
    ),''))
  ) from selected_rows),
  'receipts',(select pg_catalog.jsonb_build_object(
    'count',pg_catalog.count(*),
    'digest',pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(receipt_rows)::text),','
      order by pad_id,source_key
    ),''))
  ) from receipt_rows),
  'helper',(select value from helper),
  'currentReference',(select pg_catalog.jsonb_build_object(
    'rowCount',(payload->>'rowCount')::integer,
    'officialPadReference',(payload->'kindCounts'->>'officialPadReference')::integer,
    'officialWellheadReference',(payload->'kindCounts'->>'officialWellheadReference')::integer,
    'savedPadReference',(payload->'kindCounts'->>'savedPadReference')::integer,
    'contentSha256',payload->>'contentSha256'
  ) from current_reference)
) value`;

const evidenceSql=`
with response as (
  select public.brinesearch_v18_pad_reference_coordinates(
    '${expectedSnapshotId}'::uuid
  ) payload
), rows as (
  select item.value
  from response
  cross join lateral pg_catalog.jsonb_array_elements(response.payload->'rows') item(value)
), ohio as (
  select snapshot_row.*
  from public.brinesearch_directory_snapshot_rows_v18 snapshot_row
  where snapshot_row.snapshot_id='${expectedSnapshotId}'::uuid
    and snapshot_row.state='Ohio'
    and snapshot_row.record_type='pad'
), targets(pad_id) as (
  values
    ('0dc102c5-1640-47bf-9975-736cf684c227'::uuid),
    ('4166a215-45bb-4662-82e2-80bb0184703b'::uuid),
    ('07b566cd-393e-49f6-9547-676438aefc1a'::uuid),
    ('54bbef2d-fc87-4a33-b999-1fec24fc3c62'::uuid),
    ('c4ef4511-c391-48af-9e1a-7b70b90e9294'::uuid)
)
select pg_catalog.jsonb_build_object(
  'snapshotId',payload->>'snapshotId',
  'sourceRevision',payload->>'sourceRevision',
  'rowCount',(payload->>'rowCount')::integer,
  'officialPadReference',(payload->'kindCounts'->>'officialPadReference')::integer,
  'officialWellheadReference',(payload->'kindCounts'->>'officialWellheadReference')::integer,
  'savedPadReference',(payload->'kindCounts'->>'savedPadReference')::integer,
  'contentSha256',payload->>'contentSha256',
  'arrayRows',pg_catalog.jsonb_array_length(payload->'rows'),
  'duplicatePadIds',(select pg_catalog.count(*) from (
    select value->>'padId' from rows group by value->>'padId'
    having pg_catalog.count(*)<>1
  ) duplicate),
  'targetCount',(select pg_catalog.count(*)
    from rows join targets on rows.value->>'padId'=targets.pad_id::text
    where rows.value->>'referenceKind'='official_pad_reference'),
  'targetKeyViolationCount',(select pg_catalog.count(*)
    from rows join targets on rows.value->>'padId'=targets.pad_id::text
    where (select pg_catalog.array_agg(key order by key)
      from pg_catalog.jsonb_object_keys(rows.value) key)
      <>array['latitude','longitude','padId','referenceKind']::text[]),
  'remainingOhioPads',(select pg_catalog.count(*) from ohio
    where (driver_latitude is null or driver_longitude is null)
      and not exists(select 1 from rows where rows.value->>'padId'=ohio.pad_id::text)),
  'publicGoogleRows',(
    select pg_catalog.count(*) from public.brinesearch_driver_google_routes_public
  ),
  'cutoverAt',(
    select cutover_at from public.brinesearch_issue97_release_state where singleton
  )
) evidence
from response`;

export function loadRelease(repositoryRoot) {
  const migrationPath=path.join(
    repositoryRoot,"supabase","migrations",
    `${migrationVersion}_${migrationName}.sql`,
  );
  const migrationSql=fs.readFileSync(migrationPath,"utf8");
  const migrationSha256=crypto.createHash("sha256")
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
  const proof=(await client.query(proofStateSql)).rows[0].value;
  return {...base,verifiedOfficialPadProof:proof};
}

export async function queryEvidence(client) {
  return (await client.query(evidenceSql)).rows[0].evidence;
}

export function protectedState(value) {
  const {
    checkedAt:_checkedAt,
    referenceFunction:_referenceFunction,
    verifiedOfficialPadProof,
    ...rest
  }=value;
  const {
    targetMigrationLedgerCount:_targetMigrationLedgerCount,
    targetMigrationStatementMd5:_targetMigrationStatementMd5,
    helper:_helper,
    currentReference:_currentReference,
    ...protectedProof
  }=verifiedOfficialPadProof;
  return JSON.stringify({...rest,verifiedOfficialPadProof:protectedProof});
}

export function stateWithoutClock(value) {
  const {checkedAt:_checkedAt,...rest}=value;
  return JSON.stringify(rest);
}

export function assertBaseline(state) {
  const proof=state.verifiedOfficialPadProof;
  if (state.directory?.snapshot_id!==expectedSnapshotId
    || Number(state.directory?.source_revision)!==5
    || Number(state.directory?.row_count)!==1214
    || Number(state.directory?.snapshot_row_count)!==1214
    || Number(state.google?.public_count)!==0
    || state.cutoverAt!==null
    || Number(state.overlay?.row_count)!==10
    || Number(state.priorMigrationLedgerCount)!==1
    || Number(state.migrationLedgerCount)!==1
    || state.referenceFunction?.definitionMd5!==expectedBeforeFunctionMd5
    || Number(proof?.priorMigrationLedgerCount)!==1
    || proof?.priorMigrationStatementMd5!=="9daa6250697611c3ca99e4e2ddd2b663"
    || Number(proof?.targetMigrationLedgerCount)!==0
    || proof?.targetMigrationStatementMd5!==null
    || proof?.helper!==null
    || Number(proof?.layers?.count)!==5
    || proof?.layers?.digest!=="7bd6e9d5f3a7cacdba6c5e8381c50f1e"
    || Number(proof?.selected?.count)!==5
    || proof?.selected?.digest!=="a813a96abc30db1a33d4743b4c3ed59c"
    || Number(proof?.receipts?.count)!==10
    || proof?.receipts?.digest!=="a6ede67b4b8ae8e7fd3c0bd04140f41c"
    || Number(proof?.currentReference?.rowCount)!==741
    || Number(proof?.currentReference?.officialPadReference)!==64
    || Number(proof?.currentReference?.officialWellheadReference)!==95
    || Number(proof?.currentReference?.savedPadReference)!==582
    || proof?.currentReference?.contentSha256!==
      "65af6626f38c372ed6263b861cf4d62375d6246c5581692dff1b9bbf2fc4dd47"
    || state.pads?.digest!=="6670b55572e446504a65056d9420de8c"
    || state.directions?.digest!=="7c31ba793ff44c7bd44462239fb5ad6a"
    || state.routes?.route_digest!=="2eca6b1c43bfa8a3cdd00f0e572d7efd"
    || state.routes?.step_digest!=="938f0602d119df89182f1ae61a9f7e7e"
    || state.graphs?.build_digest!=="1fe95d415ed91aba9568257bdf5f9bab"
    || state.google?.private_digest!=="7e6d98519345b9d4f41d91d60633f002"
    || state.overlay?.row_digest!=="be8f24ec27137f625ab7c3b3328d0489") {
    throw new Error("Verified official-pad reference production preconditions drifted");
  }
}

export function assertExpandedEvidence(evidence) {
  if (evidence.snapshotId!==expectedSnapshotId
    || evidence.sourceRevision!=="5"
    || Number(evidence.rowCount)!==746
    || Number(evidence.officialPadReference)!==69
    || Number(evidence.officialWellheadReference)!==95
    || Number(evidence.savedPadReference)!==582
    || Number(evidence.arrayRows)!==746
    || Number(evidence.duplicatePadIds)!==0
    || Number(evidence.targetCount)!==5
    || Number(evidence.targetKeyViolationCount)!==0
    || Number(evidence.remainingOhioPads)!==48
    || evidence.contentSha256!==expectedReferenceSha256
    || Number(evidence.publicGoogleRows)!==0
    || evidence.cutoverAt!==null) {
    throw new Error("Expanded verified official-pad reference evidence diverged");
  }
}
