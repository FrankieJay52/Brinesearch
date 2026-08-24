import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("C:/Users/frank/AppData/Local/Temp/brinesearch-issue97-pg/node_modules/pg");

const repositoryRoot = process.argv[2];
const preflightOnly = process.argv.includes("--preflight-only");
if (!repositoryRoot) throw new Error("Repository root argument is required");

const migrationPath = path.join(
  repositoryRoot,
  "supabase",
  "migrations",
  "20260824124500_issue97_has_scout_exact_identity_receipts.sql",
);
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const migrationSha256 = crypto.createHash("sha256").update(migrationSql).digest("hex");
const expectedMigrationSha256 = "c8b8f1bcd6c81af927bbcd3257dd29d6a378b59f2ec064d2a4f6ffd3aad44f76";

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
  application_name: preflightOnly ? "issue97-has-read-only-preflight" : "issue97-has-rollback-rehearsal",
  connectionTimeoutMillis: 20_000,
  keepAlive: true,
};

const stateSql = `
with graph_state as (
  select count(*) as build_count,
    count(*) filter(where state_code='OH' and status='active') as oh_active,
    count(*) filter(where state_code='WV' and status='active') as wv_active,
    count(*) filter(where status='staging') as staging
  from public.brinesearch_road_graph_builds
), pad_authority as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pad.id::text||':'||coalesce(pad.structured_road_sequence,'')||':'||
      coalesce(pad.written_directions,'')||':'||coalesce(pad.directions_clear,'')||':'||
      coalesce(pad.structured_route_steps::text,'')||':'||
      coalesce(pad.driver_safety_context::text,'')||':'||
      coalesce(pg_catalog.round(pad.latitude::numeric,7)::text,'')||':'||
      coalesce(pg_catalog.round(pad.longitude::numeric,7)::text,''),
    ',' order by pad.id),'')) as digest
  from public.pads pad
), public_directions as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    directions.pad_id::text||':'||coalesce(directions.legacy_id,'')||':'||
      coalesce(directions.directions_clear,'')||':'||coalesce(directions.source_revision::text,''),
    ',' order by directions.pad_id),'')) as digest
  from public.brinesearch_driver_directions_public directions
), scout_route as (
  select count(*) as step_count,
    pg_catalog.md5(pg_catalog.string_agg(
      step.id::text||'|'||step.step_order||'|'||step.raw_text||'|'||step.normalized_text||'|'||
        step.step_kind||'|'||coalesce(step.road_id::text,'')||'|'||step.match_status||'|'||
        coalesce(step.match_method,'')||'|'||coalesce(step.source_details::text,'{}'),
      E'\n' order by step.step_order
    )) as step_digest
  from public.brinesearch_route_prep_steps step
  where step.route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68' and step.active
), dependency_pads as (
  select distinct pad.id,pad.legacy_id,pad.brinesearch_google_route_status_issue97 as google_status
  from public.brinesearch_authoritative_road_identities identity
  join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=identity.id and mapping.mapping_status='verified'
  join public.brinesearch_pad_roads step on step.road_id=mapping.road_id
  join public.pads pad on pad.id=step.pad_id
  where identity.active and identity.state_code='OH' and identity.county_code='HAS'
)
select pg_catalog.jsonb_build_object(
  'checkedAt',pg_catalog.clock_timestamp(),
  'has',(
    select pg_catalog.jsonb_build_object(
      'id',id,'status',status,'sourceRevisionDigest',source_revision_digest,
      'graphDigest',graph_digest
    ) from public.brinesearch_road_graph_builds
    where state_code='OH' and county_code='HAS' and status='active'
  ),
  'gue',(
    select pg_catalog.jsonb_build_object(
      'id',id,'status',status,'sourceRevisionDigest',source_revision_digest,
      'graphDigest',graph_digest
    ) from public.brinesearch_road_graph_builds
    where state_code='OH' and county_code='GUE' and status='active'
  ),
  'graphState',(select pg_catalog.to_jsonb(graph_state) from graph_state),
  'dependencyPads',(
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('legacyId',legacy_id,'googleStatus',google_status)
      order by legacy_id
    ),'[]'::jsonb) from dependency_pads
  ),
  'scoutRoute',(select pg_catalog.to_jsonb(scout_route) from scout_route),
  'scoutReceiptCount',(select count(*)
    from private_verification.brinesearch_route_occurrence_receipts_issue97
    where route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68'),
  'scoutTransitionCount',(select count(*)
    from private_verification.brinesearch_route_transition_receipts_issue97
    where route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68'),
  'scoutGeometryReceiptCount',(select count(*)
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97
    where route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68'),
  'scoutSequenceHash',(select source_sequence_hash from public.brinesearch_route_prep
    where id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68' and active),
  'targetRoads',(select count(*) from public.brinesearch_roads where id in(
    'e236e7bc-6313-39a4-f1d8-d1815ea44167','219e5560-8875-4baf-1a24-b600c862ecfb')),
  'targetMappings',(select count(*) from public.brinesearch_road_identity_mappings where identity_id in(
    '5672af6b-03e5-cc37-95cf-216bb72afe86','e69eb3cb-bbc7-9ea8-223c-7798d66d38c8')),
  'targetStepCount',(select count(*) from public.brinesearch_route_prep_steps
    where id='377ce794-1ca4-1826-22d5-9f60e73787bc'),
  'targetManifestCount',(select count(*)
    from private_verification.brinesearch_issue97_state_candidate_manifests
    where manifest_key='issue97-ohio-r5-has-scout-exact-identity-candidate'),
  'gueMappingCount',(select count(*) from public.brinesearch_road_identity_mappings
    where identity_id in(
      '1d61e8f0-527b-582a-022a-673001d546df','b80b9fff-6d0e-b5b7-3b93-e8c28b476fca',
      '2ef72301-66f2-e0d9-983b-9d289a306a1a') and mapping_status='verified'),
  'gueManifestBound',exists(
    select 1
    from private_verification.brinesearch_issue97_state_candidate_manifests manifest
    join private_verification.brinesearch_issue97_state_candidate_manifest_members member
      on member.manifest_id=manifest.id and member.member_key='OH:GUE'
    join public.brinesearch_road_graph_builds build
      on build.id=(member.member_value->>'build_id')::uuid
    where manifest.id='0e994642-02ac-4d19-a5c1-872d82f2300a'
      and manifest.manifest_key='issue97-ohio-r4-gue-exact-identity-candidate'
      and manifest.manifest_digest='1ed2d585eef7f51544960cb83c6e5bda'
      and manifest.state_code='OH'
      and manifest.member_count=19
      and private_verification.brinesearch_issue97_state_candidate_manifest_integrity(manifest.id)
      and build.id='f982e6dd-ff37-4fe0-b2e8-756112793bd5'
      and build.status='active' and build.state_code='OH' and build.county_code='GUE'
      and member.member_value->>'source_revision_digest'=build.source_revision_digest
      and member.member_value->>'graph_digest'=build.graph_digest
  ),
  'hasManifestBound',exists(
    select 1
    from private_verification.brinesearch_issue97_state_candidate_manifests manifest
    join private_verification.brinesearch_issue97_state_candidate_manifest_members member
      on member.manifest_id=manifest.id and member.member_key='OH:HAS'
    join public.brinesearch_road_graph_builds build
      on build.id=(member.member_value->>'build_id')::uuid
    where manifest.id='0e994642-02ac-4d19-a5c1-872d82f2300a'
      and manifest.manifest_digest='1ed2d585eef7f51544960cb83c6e5bda'
      and manifest.state_code='OH' and manifest.member_count=19
      and private_verification.brinesearch_issue97_state_candidate_manifest_integrity(manifest.id)
      and build.id='0870470a-11f8-4f33-8af3-08d6849d5f34'
      and build.status='active' and build.state_code='OH' and build.county_code='HAS'
      and member.member_value->>'source_revision_digest'=build.source_revision_digest
      and member.member_value->>'graph_digest'=build.graph_digest
  ),
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
  'googleQueue',(select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97),
  'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton),
  'savedReconciliationRuns',(select count(*)
    from private_verification.brinesearch_issue97_saved_road_reconciliation_runs),
  'overlaySnapshots',(select count(*) from public.brinesearch_company_road_overlay_snapshots_v18),
  'overlayRows',(select count(*) from public.brinesearch_company_road_overlay_rows_v18),
  'gueLedgerCount',(select count(*) from supabase_migrations.schema_migrations
    where version='20260824122000' and name='issue97_gue_held_route_exact_identity_receipts'),
  'hasLedgerCount',(select count(*) from supabase_migrations.schema_migrations
    where version='20260824124500')
) as state`;

const insideSql = `
select pg_catalog.jsonb_build_object(
  'newGraph',(
    select pg_catalog.jsonb_build_object(
      'oldBuildId',target.old_build_id,'newBuildId',target.new_build_id,
      'manifestId',target.candidate_manifest_id,'manifestDigest',target.candidate_manifest_digest,
      'activation',target.activation_result,'cache',target.cache_result,
      'status',build.status,'graphDigest',build.graph_digest,
      'sourceRevisionDigest',build.source_revision_digest,
      'releaseCurrent',private_verification.brinesearch_issue97_graph_build_release_current(build.id)
    from pg_temp.tmp_issue97_has_new_graph target
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
    'e236e7bc-6313-39a4-f1d8-d1815ea44167','219e5560-8875-4baf-1a24-b600c862ecfb')),
  'targetMappings',(select count(*) from public.brinesearch_road_identity_mappings where identity_id in(
    '5672af6b-03e5-cc37-95cf-216bb72afe86','e69eb3cb-bbc7-9ea8-223c-7798d66d38c8')),
  'resolvedScoutOccurrences',(
    select count(*)
    from public.brinesearch_route_prep_steps step
    join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      on receipt.route_prep_step_id=step.id
    where step.route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68' and step.active
      and receipt.resolution_status='resolved'
      and receipt.resolution_method='explicit_authoritative_source_receipt'
      and receipt.source_identity_key=step.source_details->>'source_identity_key'
      and receipt.canonical_road_id=step.road_id
  ),
  'scoutBoundary',(
    select pg_catalog.jsonb_build_object(
      'status',status,'holdReason',hold_reason,'leftRoadId',left_road_id,
      'rightRoadId',right_road_id,'junctionId',junction_id,'anchorId',anchor_id
    ) from private_verification.brinesearch_route_transition_receipts_issue97
    where route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68' and boundary_index=2
  ),
  'dependencyGoogle',(
    select pg_catalog.jsonb_object_agg(
      pad.legacy_id,pad.brinesearch_google_route_status_issue97 order by pad.legacy_id
    ) from public.pads pad where pad.legacy_id in(
      'ascent--banjo','ascent--besece','ascent--blayney','ascent--cologie',
      'ascent--pickens','ascent--scout','ascent--shutway')
  ),
  'cologieReadyReceipt',exists(
    select 1 from private_verification.brinesearch_google_route_receipts_issue97 receipt
    join public.pads pad on pad.id=receipt.pad_id
    where pad.legacy_id='ascent--cologie' and receipt.status='ready'
  ),
  'otherReadyReceiptCount',(
    select count(*) from private_verification.brinesearch_google_route_receipts_issue97 receipt
    join public.pads pad on pad.id=receipt.pad_id
    where pad.legacy_id in(
      'ascent--banjo','ascent--besece','ascent--blayney',
      'ascent--pickens','ascent--scout','ascent--shutway') and receipt.status='ready'
  ),
  'directory',(
    select pg_catalog.jsonb_build_object(
      'snapshotId',snapshot_id,'sourceRevision',source_revision,'rowCount',row_count,
      'searchableCount',searchable_count,'sha256',content_sha256
    ) from public.brinesearch_directory_snapshots_v18 where publication_state='current'
  ),
  'padAuthorityDigest',(
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pad.id::text||':'||coalesce(pad.structured_road_sequence,'')||':'||
        coalesce(pad.written_directions,'')||':'||coalesce(pad.directions_clear,'')||':'||
        coalesce(pad.structured_route_steps::text,'')||':'||
        coalesce(pad.driver_safety_context::text,'')||':'||
        coalesce(pg_catalog.round(pad.latitude::numeric,7)::text,'')||':'||
        coalesce(pg_catalog.round(pad.longitude::numeric,7)::text,''),
      ',' order by pad.id),'')) from public.pads pad
  ),
  'publicDirectionsDigest',(
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      directions.pad_id::text||':'||coalesce(directions.legacy_id,'')||':'||
        coalesce(directions.directions_clear,'')||':'||coalesce(directions.source_revision::text,''),
      ',' order by directions.pad_id),''))
    from public.brinesearch_driver_directions_public directions
  ),
  'publicGoogleRows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'googleQueue',(select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97),
  'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton),
  'savedReconciliationRuns',(select count(*)
    from private_verification.brinesearch_issue97_saved_road_reconciliation_runs),
  'overlaySnapshots',(select count(*) from public.brinesearch_company_road_overlay_snapshots_v18),
  'overlayRows',(select count(*) from public.brinesearch_company_road_overlay_rows_v18)
) as evidence`;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertBefore(state) {
  invariant(state.has?.id === "0870470a-11f8-4f33-8af3-08d6849d5f34", "HAS active build drifted");
  invariant(state.has?.status === "active" && state.hasManifestBound === true, "HAS manifest binding drifted");
  invariant(state.has?.graphDigest === "fc53a1492a3eecab78a524dbadcddfe8", "HAS graph digest drifted");
  invariant(state.has?.sourceRevisionDigest === "ece929162c9063ea35a6a276de59a940", "HAS source digest drifted");
  invariant(state.gue?.id === "f982e6dd-ff37-4fe0-b2e8-756112793bd5", "GUE predecessor build drifted");
  invariant(state.gue?.status === "active" && state.gueManifestBound === true, "GUE predecessor manifest binding drifted");
  invariant(state.gue?.graphDigest === "b6c8618795fa8692427b8c47a473d551", "GUE predecessor graph digest drifted");
  invariant(state.gue?.sourceRevisionDigest === "082daf6c993fa38f1e8069bb5a20e9db", "GUE predecessor source digest drifted");
  invariant(Number(state.graphState?.oh_active) === 19 && Number(state.graphState?.wv_active) === 1, "Active graph count drifted");
  invariant(Number(state.graphState?.staging) === 0, "Unexpected staging graph exists");
  invariant(JSON.stringify((state.dependencyPads || []).map((pad) => pad.legacyId)) === JSON.stringify([
    "ascent--banjo", "ascent--besece", "ascent--blayney", "ascent--cologie",
    "ascent--pickens", "ascent--scout", "ascent--shutway",
  ]), "HAS dependency set drifted");
  invariant(Number(state.scoutRoute?.step_count) === 4, "Scout step count drifted");
  invariant(state.scoutRoute?.step_digest === "6b9bc9eab5d6865b9c4828dd0260f558", "Scout step digest drifted");
  invariant(state.scoutSequenceHash === "0b2caedee1fe2eefa0cd26f53f3667b4", "Scout sequence hash drifted");
  invariant(Number(state.scoutReceiptCount) === 4, "Scout occurrence receipts drifted");
  invariant(Number(state.scoutTransitionCount) === 0 && Number(state.scoutGeometryReceiptCount) === 0, "Scout transition/geometry baseline drifted");
  invariant(Number(state.targetRoads) === 0 && Number(state.targetMappings) === 0 && Number(state.targetStepCount) === 0, "HAS target objects already exist");
  invariant(Number(state.targetManifestCount) === 0, "HAS target manifest already exists");
  invariant(Number(state.gueMappingCount) === 3, "GUE predecessor mapping evidence drifted");
  invariant(Number(state.occurrenceReceipts) === 4106, "Occurrence receipt count drifted");
  invariant(state.padAuthorityDigest === "3bfe76004119278b472596b5570373ca", "Pad authority drifted");
  invariant(state.publicDirectionsDigest === "b123f19d3a8f1e31f9f8c41ea2fa677a", "Public directions drifted");
  invariant(state.directory?.snapshotId === "77b4f802-94eb-4b54-8194-c2f42ef5a440", "Directory snapshot drifted");
  invariant(Number(state.directory?.sourceRevision) === 4 && state.directory?.sha256 === "7f0fc3e0f8925a3a85274cf2cb17031aeed8f31adfbd44cd01867e92623e5600", "Directory revision drifted");
  invariant(Number(state.directory?.rowCount) === 1214 && Number(state.directory?.searchableCount) === 1214, "Directory row counts drifted");
  invariant(Number(state.publicGoogleRows) === 0 && Number(state.googleQueue) === 0, "Google state drifted");
  invariant(state.cutoverAt === null, "Cutover is unexpectedly active");
  invariant(Number(state.savedReconciliationRuns) === 0, "Saved reconciliation state drifted");
  invariant(Number(state.overlaySnapshots) === 0 && Number(state.overlayRows) === 0, "Overlay state drifted");
  invariant(Number(state.gueLedgerCount) === 1, "GUE migration ledger drifted");
  invariant(Number(state.hasLedgerCount) === 0, "HAS migration is already installed");
}

function assertInside(evidence, before) {
  invariant(evidence.newGraph?.oldBuildId === before.has.id, "HAS old build changed inside rehearsal");
  invariant(evidence.newGraph?.newBuildId && evidence.newGraph.newBuildId !== before.has.id, "HAS build was not replaced");
  invariant(evidence.newGraph?.status === "active" && evidence.newGraph?.releaseCurrent === true, "New HAS build is not release-current");
  invariant(evidence.newGraph?.sourceRevisionDigest && evidence.newGraph.sourceRevisionDigest !== before.has.sourceRevisionDigest, "HAS source revision did not change");
  invariant(Number(evidence.graphCounts?.ohActive) === 19 && Number(evidence.graphCounts?.wvActive) === 1 && Number(evidence.graphCounts?.staging) === 0, "Graph counts changed inside rehearsal");
  invariant(Number(evidence.targetRoads) === 2 && Number(evidence.targetMappings) === 2, "HAS target object counts are wrong");
  invariant(Number(evidence.resolvedScoutOccurrences) === 5, "Scout exact occurrence count is wrong");
  invariant(evidence.scoutBoundary?.status === "held", "Scout same-road boundary was upgraded");
  invariant(evidence.scoutBoundary?.holdReason === "adjacent_same_road_split_requires_explicit_source_boundary", "Scout boundary hold reason changed");
  invariant(evidence.scoutBoundary?.leftRoadId === evidence.scoutBoundary?.rightRoadId, "Scout boundary no longer preserves the same-road identity");
  invariant(evidence.scoutBoundary?.junctionId === null && evidence.scoutBoundary?.anchorId === null, "Scout boundary gained invented junction authority");
  invariant(evidence.cologieReadyReceipt === true && Number(evidence.otherReadyReceiptCount) === 0, "HAS private Google result did not remain fail-closed");
  invariant(Number(evidence.directory?.sourceRevision) === 5, "Directory revision is not 5 inside rehearsal");
  invariant(Number(evidence.directory?.rowCount) === 1214 && Number(evidence.directory?.searchableCount) === 1214, "Directory row counts changed inside rehearsal");
  invariant(evidence.padAuthorityDigest === before.padAuthorityDigest, "Pad authority changed inside rehearsal");
  invariant(evidence.publicDirectionsDigest === before.publicDirectionsDigest, "Public directions changed inside rehearsal");
  invariant(Number(evidence.publicGoogleRows) === 0 && Number(evidence.googleQueue) === 0, "Public Google or queue expanded inside rehearsal");
  invariant(evidence.cutoverAt === null, "Cutover was enabled inside rehearsal");
  invariant(Number(evidence.savedReconciliationRuns) === 0, "Saved reconciliation ran inside rehearsal");
  invariant(Number(evidence.overlaySnapshots) === 0 && Number(evidence.overlayRows) === 0, "Overlay authority changed inside rehearsal");
}

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
  phase = "read-only-preflight";
  const before = (await client.query(stateSql)).rows[0].state;
  assertBefore(before);
  console.log(JSON.stringify({ kind: "before", migrationSha256, state: before }));

  if (preflightOnly) {
    phase = "complete";
    console.log(JSON.stringify({ kind: "complete", result: "read-only-preflight-passed" }));
  } else {
    phase = "begin";
    await client.query("begin");
    transactionOpen = true;
    await client.query("set local application_name='issue97-has-rollback-rehearsal'");

    phase = "transaction-drift-check";
    assertBefore((await client.query(stateSql)).rows[0].state);

    phase = "migration";
    const migrationResults = await client.query(migrationSql);
    const results = Array.isArray(migrationResults) ? migrationResults : [migrationResults];
    const migrationResult = results
      .flatMap((result) => result.rows ?? [])
      .find((row) => Object.hasOwn(row, "issue97_has_result"))?.issue97_has_result ?? null;
    invariant(migrationResult !== null, "HAS migration returned no result evidence");
    console.log(JSON.stringify({ kind: "migration-result", result: migrationResult }));

    phase = "inside-snapshot";
    const inside = (await client.query(insideSql)).rows[0].evidence;
    assertInside(inside, before);
    console.log(JSON.stringify({ kind: "inside", evidence: inside }));

    phase = "rollback";
    await client.query("rollback");
    transactionOpen = false;

    phase = "after-snapshot";
    const after = (await client.query(stateSql)).rows[0].state;
    const zeroPersistentDelta = canonicalState(before) === canonicalState(after);
    console.log(JSON.stringify({ kind: "after", zeroPersistentDelta, state: after }));
    invariant(zeroPersistentDelta, "Rollback rehearsal left a persistent state delta");

    phase = "complete";
    console.log(JSON.stringify({
      kind: "complete",
      result: "passed-and-rolled-back",
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    }));
  }
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
