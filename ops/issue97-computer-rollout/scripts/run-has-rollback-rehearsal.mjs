import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("C:/Users/frank/AppData/Local/Temp/brinesearch-issue97-pg/node_modules/pg");

const repositoryRoot = process.argv[2];
const preflightOnly = process.argv.includes("--preflight-only");
const diagnosticOnly = process.argv.includes("--diagnostic-only");
const inspectBuilderOnly = process.argv.includes("--inspect-builder-only");
const dependencyAuditOnly = process.argv.includes("--dependency-audit-only");
const bakosDiagnosticOnly = process.argv.includes("--bakos-diagnostic-only");
const permanentInstall = process.argv.includes("--permanent-install");
if (!repositoryRoot) throw new Error("Repository root argument is required");
if ([
  preflightOnly,
  diagnosticOnly,
  inspectBuilderOnly,
  dependencyAuditOnly,
  bakosDiagnosticOnly,
  permanentInstall,
].filter(Boolean).length > 1) {
  throw new Error("Choose only one execution mode");
}

const migrationPath = path.join(
  repositoryRoot,
  "supabase",
  "migrations",
  "20260824124500_issue97_has_scout_exact_identity_receipts.sql",
);
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const migrationSha256 = crypto.createHash("sha256").update(migrationSql).digest("hex");
const migrationMd5 = crypto.createHash("md5").update(migrationSql).digest("hex");
const expectedMigrationSha256 = "d17b175ada0c9a103b9ef17da6f567b2cf2c1076e1f9927b614e475eda77c5cc";
const migrationVersion = "20260824124500";
const migrationName = "issue97_has_scout_exact_identity_receipts";

if (migrationSha256 !== expectedMigrationSha256) {
  throw new Error(`Migration digest diverged: ${migrationSha256}`);
}
if (/\b(?:begin|commit|rollback)\s*;/iu.test(migrationSql)) {
  throw new Error("Migration unexpectedly contains transaction control");
}

const diagnosticStopMarker = "do $issue97_has_manifest$";
const diagnosticStopOffset = migrationSql.indexOf(diagnosticStopMarker);
if (diagnosticStopOffset < 1 || migrationSql.indexOf(diagnosticStopMarker, diagnosticStopOffset + 1) !== -1) {
  throw new Error("HAS diagnostic stop marker is absent or ambiguous");
}
const diagnosticPrefixSql = migrationSql.slice(0, diagnosticStopOffset);

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
  application_name: preflightOnly
    ? "issue97-has-read-only-preflight"
    : permanentInstall
      ? "issue97-has-permanent-install"
    : inspectBuilderOnly
      ? "issue97-has-builder-inspection"
    : dependencyAuditOnly
      ? "issue97-oh-cross-county-dependency-audit"
    : bakosDiagnosticOnly
      ? "issue97-has-bel-bakos-read-only-diagnostic"
    : diagnosticOnly
      ? "issue97-has-release-diagnostic"
      : "issue97-has-rollback-rehearsal",
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
), private_google_receipts as (
  select count(*) as receipt_count,
    count(*) filter(where receipt.status='ready') as ready_count,
    count(*) filter(where receipt.status='held') as held_count,
    count(*) filter(where receipt.status='stale') as stale_count,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.pad_id::text||':'||coalesce(receipt.status,'')||':'||
        coalesce(receipt.hold_reason,'')||':'||coalesce(receipt.manifest_digest,'')||':'||
        coalesce(receipt.dependency_digest,'')||':'||coalesce(receipt.manifest::text,'')||':'||
        coalesce(receipt.evidence::text,''),
      ',' order by receipt.pad_id
    ),'')) as digest
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
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
), target_graphs as materialized (
  select build.id
  from public.brinesearch_road_graph_builds build
  where build.state_code='OH' and build.county_code in ('BEL','HAS')
    and build.status='active'
), target_identities as materialized (
  select identity.id
  from public.brinesearch_authoritative_road_identities identity
  where identity.active and identity.state_code='OH'
    and identity.county_code in ('BEL','HAS')
), target_refresh_mappings as materialized (
  select mapping.identity_id,mapping.road_id
  from public.brinesearch_road_identity_mappings mapping
  join target_identities identity on identity.id=mapping.identity_id
  where mapping.mapping_method in ('exact_source_record_id','exact_route_designation')
    and mapping.mapping_status in ('verified','candidate')
), dependency_sources as materialized (
  select pad.id as pad_id,pad.legacy_id,'published_road_identity'::text as source
  from target_identities identity
  join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=identity.id
  join public.brinesearch_pad_roads step on step.road_id=mapping.road_id
  join public.pads pad on pad.id=step.pad_id
  union
  select receipt.pad_id,pad.legacy_id,'private_receipt_mapping'::text
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
  join public.pads pad on pad.id=receipt.pad_id
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(receipt.manifest->'points','[]'::jsonb)
  ) point
  join target_refresh_mappings mapping
    on mapping.identity_id=nullif(point->>'identity_id','')::uuid
    or mapping.road_id=nullif(point->>'road_id','')::uuid
  union
  select receipt.pad_id,pad.legacy_id,'private_receipt_graph'::text
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
  join public.pads pad on pad.id=receipt.pad_id
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(receipt.manifest->'points','[]'::jsonb)
  ) point
  join target_graphs build on build.id=nullif(point->>'graph_build_id','')::uuid
  union
  select step.pad_id,pad.legacy_id,'published_step_graph'::text
  from public.brinesearch_pad_roads step
  join public.pads pad on pad.id=step.pad_id
  join target_graphs build on build.id=step.junction_build_id
), dependency_pads as (
  select dependency.pad_id as id,dependency.legacy_id,
    pad.brinesearch_google_route_status_issue97 as google_status,
    pg_catalog.array_agg(distinct dependency.source order by dependency.source) as sources
  from dependency_sources dependency
  join public.pads pad on pad.id=dependency.pad_id
  group by dependency.pad_id,dependency.legacy_id,
    pad.brinesearch_google_route_status_issue97
)
select pg_catalog.jsonb_build_object(
  'checkedAt',pg_catalog.clock_timestamp(),
  'has',(
    select pg_catalog.jsonb_build_object(
      'id',id,'status',status,'sourceRevisionDigest',source_revision_digest,
      'graphDigest',graph_digest,
      'releaseCurrent',private_verification.brinesearch_issue97_graph_build_release_current(id)
    ) from public.brinesearch_road_graph_builds
    where state_code='OH' and county_code='HAS' and status='active'
  ),
  'bel',(
    select pg_catalog.jsonb_build_object(
      'id',id,'status',status,'sourceRevisionDigest',source_revision_digest,
      'graphDigest',graph_digest,
      'releaseCurrent',private_verification.brinesearch_issue97_graph_build_release_current(id)
    ) from public.brinesearch_road_graph_builds
    where state_code='OH' and county_code='BEL' and status='active'
  ),
  'gue',(
    select pg_catalog.jsonb_build_object(
      'id',id,'status',status,'sourceRevisionDigest',source_revision_digest,
      'graphDigest',graph_digest,
      'releaseCurrent',private_verification.brinesearch_issue97_graph_build_release_current(id)
    ) from public.brinesearch_road_graph_builds
    where state_code='OH' and county_code='GUE' and status='active'
  ),
  'graphState',(select pg_catalog.to_jsonb(graph_state) from graph_state),
  'dependencyPads',(
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'legacyId',legacy_id,'googleStatus',google_status,'sources',sources
      )
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
    )
    from private_verification.brinesearch_route_transition_receipts_issue97
    where route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68' and boundary_index=2
  ),
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
  'belManifestBound',exists(
    select 1
    from private_verification.brinesearch_issue97_state_candidate_manifests manifest
    join private_verification.brinesearch_issue97_state_candidate_manifest_members member
      on member.manifest_id=manifest.id and member.member_key='OH:BEL'
    join public.brinesearch_road_graph_builds build
      on build.id=(member.member_value->>'build_id')::uuid
    where manifest.id='0e994642-02ac-4d19-a5c1-872d82f2300a'
      and manifest.manifest_digest='1ed2d585eef7f51544960cb83c6e5bda'
      and manifest.state_code='OH' and manifest.member_count=19
      and private_verification.brinesearch_issue97_state_candidate_manifest_integrity(manifest.id)
      and build.id='1c1320b3-4257-4239-9c55-b18a801aa97e'
      and build.status='active' and build.state_code='OH' and build.county_code='BEL'
      and member.member_value->>'source_revision_digest'=build.source_revision_digest
      and member.member_value->>'graph_digest'=build.graph_digest
  ),
  'occurrenceReceipts',(select count(*)
    from private_verification.brinesearch_route_occurrence_receipts_issue97),
  'padAuthorityDigest',(select digest from pad_authority),
  'publicDirectionsDigest',(select digest from public_directions),
  'privateGoogleReceipts',(
    select pg_catalog.to_jsonb(private_google_receipts) from private_google_receipts
  ),
  'dependencyReadyReceipts',(
    select coalesce(pg_catalog.jsonb_agg(pad.legacy_id order by pad.legacy_id),'[]'::jsonb)
    from private_verification.brinesearch_google_route_receipts_issue97 receipt
    join public.pads pad on pad.id=receipt.pad_id
    join dependency_pads dependency on dependency.id=pad.id
    where receipt.status='ready'
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
  'savedReconciliationRuns',(select count(*)
    from private_verification.brinesearch_issue97_saved_road_reconciliation_runs),
  'overlaySnapshots',(select count(*) from public.brinesearch_company_road_overlay_snapshots_v18),
  'overlayRows',(select count(*) from public.brinesearch_company_road_overlay_rows_v18),
  'gueLedgerCount',(select count(*) from supabase_migrations.schema_migrations
    where version='20260824122000' and name='issue97_gue_held_route_exact_identity_receipts'),
  'hasLedger',(
    select pg_catalog.jsonb_build_object(
      'count',count(*),'name',max(name),'statementCount',max(cardinality(statements)),
      'statementMd5',max(pg_catalog.md5(statements[1]))
    ) from supabase_migrations.schema_migrations where version='${migrationVersion}'
  )
) as state`;

const insideSql = `
select pg_catalog.jsonb_build_object(
  'newGraphs',(
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'countyCode',target.county_code,
      'oldBuildId',target.old_build_id,'newBuildId',target.new_build_id,
      'manifestId',target.candidate_manifest_id,'manifestDigest',target.candidate_manifest_digest,
      'activation',target.activation_result,'cache',target.cache_result,
      'status',build.status,'graphDigest',build.graph_digest,
      'sourceRevisionDigest',build.source_revision_digest,
      'releaseCurrent',private_verification.brinesearch_issue97_graph_build_release_current(build.id)
    ) order by target.county_code)
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
      'ascent--bakos','ascent--banjo','ascent--besece','ascent--blayney','ascent--cologie',
      'ascent--jennings','ascent--pickens','ascent--scout','ascent--shutway')
  ),
  'cologieReadyReceipt',exists(
    select 1 from private_verification.brinesearch_google_route_receipts_issue97 receipt
    join public.pads pad on pad.id=receipt.pad_id
    where pad.legacy_id='ascent--cologie' and receipt.status='ready'
  ),
  'bakosReadyReceipt',exists(
    select 1 from private_verification.brinesearch_google_route_receipts_issue97 receipt
    join public.pads pad on pad.id=receipt.pad_id
    where pad.legacy_id='ascent--bakos' and receipt.status='ready'
      and private_verification.brinesearch_issue97_transition_google_dark_current(pad.id)
  ),
  'otherReadyReceiptCount',(
    select count(*) from private_verification.brinesearch_google_route_receipts_issue97 receipt
    join public.pads pad on pad.id=receipt.pad_id
    where pad.legacy_id in(
      'ascent--banjo','ascent--besece','ascent--blayney',
      'ascent--jennings','ascent--pickens','ascent--scout','ascent--shutway')
      and receipt.status='ready'
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

const diagnosticSql = `
with exact_members as materialized (
  select member_key,member_value
  from private_verification.brinesearch_issue97_current_state_candidate_members('OH')
), missing_counties as materialized (
  select county.county_code
  from public.brinesearch_road_graph_counties county
  where county.active and county.state_code='OH'
    and not exists(
      select 1 from exact_members member where member.member_key='OH:'||county.county_code
    )
), missing_builds as materialized (
  select build.*
  from public.brinesearch_road_graph_builds build
  join missing_counties missing using(county_code)
  where build.state_code='OH' and build.status in ('active','validated')
), missing_mapping_inputs as materialized (
  select build.id,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      current_map.identity_id::text||':'||current_map.fingerprint,
      ',' order by current_map.identity_id
    ),'')) as current_mapping_digest
  from missing_builds build
  left join lateral (
    select identities.identity_id,
      pg_catalog.md5(pg_catalog.concat_ws('|',
        identities.identity_id::text,coalesce(mapping.road_id::text,'unmapped'),
        coalesce(mapping.mapping_method,''),coalesce(
          case
            when build.details->>'mapping_snapshot_version'='issue97-graph-mapping-v2'
              then private_verification.brinesearch_issue97_graph_mapping_evidence(
                mapping.mapping_method,mapping.evidence
              )
            when nullif(build.details->>'mapping_snapshot_version','') is null
              then mapping.evidence
            else null
          end::text,''
        ),
        coalesce(road.canonical_name,''),coalesce(road.state,''),
        coalesce(road.county,''),coalesce(road.township,''),
        coalesce(road.road_type,''),coalesce(road.route_number,''),
        coalesce(road.source_record_id,''),coalesce(road.verification_status,''),
        coalesce(road.candidate_only::text,''),coalesce(road.geometry_status,''),
        coalesce(pg_catalog.md5(road.centerline_geojson::text),'')
      )) as fingerprint
    from (
      select distinct membership.identity_id
      from public.brinesearch_road_junction_memberships membership
      join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
      where junction.build_id=build.id
    ) identities
    left join public.brinesearch_road_identity_mappings mapping
      on mapping.identity_id=identities.identity_id and mapping.mapping_status='verified'
    left join public.brinesearch_roads road on road.id=mapping.road_id
  ) current_map on true
  group by build.id
)
select pg_catalog.jsonb_build_object(
  'memberCount',(select count(*) from exact_members),
  'members',(
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'memberKey',member_key,'memberValue',member_value
    ) order by member_key) from exact_members
  ),
  'missingCounties',(
    select pg_catalog.jsonb_agg(county_code order by county_code) from missing_counties
  ),
  'missingCountyBuilds',(
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'countyCode',build.county_code,'id',build.id,'status',build.status,
      'algorithmVersion',build.algorithm_version,
      'releaseCurrent',private_verification.brinesearch_issue97_graph_build_release_current(build.id),
      'sourcesCurrent',private_verification.brinesearch_issue97_graph_build_sources_current(build.id),
      'mappingSnapshotVersion',build.details->>'mapping_snapshot_version',
      'mappingSnapshotStored',build.details->>'mapping_snapshot_digest',
      'mappingSnapshotCurrent',mapping_inputs.current_mapping_digest,
      'sourceContentStored',build.details->>'release_source_content_digest',
      'sourceContentCurrent',private_verification.brinesearch_issue97_graph_source_content_digest(build.id),
      'authoritativeNamesStored',build.details->>'release_authoritative_name_digest',
      'authoritativeNamesCurrent',private_verification.brinesearch_issue97_graph_name_input_digest(build.id),
      'supplementalInputsStored',build.details->>'release_supplemental_input_digest',
      'supplementalInputsCurrent',private_verification.brinesearch_issue97_graph_supplemental_input_digest(build.id),
      'generationKeyStored',build.details->>'release_generation_key',
      'builderMd5Stored',build.details->>'release_builder_md5',
      'mapperMd5Stored',build.details->>'release_supplemental_mapper_md5',
      'sourceContractStored',build.details->>'release_source_content_contract',
      'sourceRevisionDigest',build.source_revision_digest,'graphDigest',build.graph_digest,
      'sourceSegmentCount',build.source_segment_count,'identityCount',build.identity_count,
      'pointJunctionCount',build.point_junction_count,
      'sharedSegmentCount',build.shared_segment_count,
      'membershipCount',build.membership_count
    ) order by build.status,build.id)
    from missing_builds build
    join missing_mapping_inputs mapping_inputs on mapping_inputs.id=build.id
  ),
  'newBuilds',(
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'countyCode',target.county_code,'id',build.id,'status',build.status,
      'algorithmVersion',build.algorithm_version,
      'sourceRevisionDigest',build.source_revision_digest,'graphDigest',build.graph_digest,
      'sourceSegmentCount',build.source_segment_count,'identityCount',build.identity_count,
      'pointJunctionCount',build.point_junction_count,
      'sharedSegmentCount',build.shared_segment_count,
      'membershipCount',build.membership_count,
      'releaseCurrent',private_verification.brinesearch_issue97_graph_build_release_current(build.id),
      'sourcesCurrent',private_verification.brinesearch_issue97_graph_build_sources_current(build.id),
      'mappingSnapshotStored',build.details->>'mapping_snapshot_digest',
      'mappingSnapshotVersion',build.details->>'mapping_snapshot_version',
      'sourceContentStored',build.details->>'release_source_content_digest',
      'sourceContentCurrent',private_verification.brinesearch_issue97_graph_source_content_digest(build.id),
      'authoritativeNamesStored',build.details->>'release_authoritative_name_digest',
      'authoritativeNamesCurrent',private_verification.brinesearch_issue97_graph_name_input_digest(build.id),
      'supplementalInputsStored',build.details->>'release_supplemental_input_digest',
      'supplementalInputsCurrent',private_verification.brinesearch_issue97_graph_supplemental_input_digest(build.id),
      'generationKeyStored',build.details->>'release_generation_key',
      'builderMd5Stored',build.details->>'release_builder_md5'
    ) order by target.county_code)
    from pg_temp.tmp_issue97_has_new_graph target
    join public.brinesearch_road_graph_builds build on build.id=target.new_build_id
  ),
  'generation',(
    select pg_catalog.jsonb_build_object(
      'currentKey',generation_key,'expectedBuilderMd5',builder_definition_md5,
      'currentBuilderMd5',pg_catalog.md5(pg_catalog.pg_get_functiondef(
        'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
      )),
      'expectedMapperMd5',supplemental_mapper_md5,
      'currentMapperMd5',pg_catalog.md5(pg_catalog.pg_get_functiondef(
        'public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)'::pg_catalog.regprocedure
      )),
      'expectedContract',source_content_contract,'expectedAlgorithmVersion',algorithm_version
    ) from private_verification.brinesearch_issue97_graph_release_generations where active
  ),
  'targetMappings',(
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'identityId',mapping.identity_id,'roadId',mapping.road_id,
      'status',mapping.mapping_status,'method',mapping.mapping_method,
      'evidence',mapping.evidence,
      'graphFingerprint',private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2(
        mapping.identity_id
      )
    ) order by mapping.identity_id)
    from public.brinesearch_road_identity_mappings mapping
    where mapping.identity_id in(
      '5672af6b-03e5-cc37-95cf-216bb72afe86','e69eb3cb-bbc7-9ea8-223c-7798d66d38c8'
    )
  )
) as evidence`;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertBefore(state) {
  invariant(state.has?.id === "0870470a-11f8-4f33-8af3-08d6849d5f34", "HAS active build drifted");
  invariant(state.has?.status === "active" && state.has?.releaseCurrent === true
    && state.hasManifestBound === true, "HAS manifest binding drifted");
  invariant(state.has?.graphDigest === "fc53a1492a3eecab78a524dbadcddfe8", "HAS graph digest drifted");
  invariant(state.has?.sourceRevisionDigest === "ece929162c9063ea35a6a276de59a940", "HAS source digest drifted");
  invariant(state.bel?.id === "1c1320b3-4257-4239-9c55-b18a801aa97e", "BEL dependency build drifted");
  invariant(state.bel?.status === "active" && state.bel?.releaseCurrent === true
    && state.belManifestBound === true, "BEL dependency manifest binding drifted");
  invariant(state.bel?.graphDigest === "269e903e991f1790bf5d1428e4c2bb43", "BEL dependency graph digest drifted");
  invariant(state.bel?.sourceRevisionDigest === "b20843ddf3d2a648b8d53a0b3eb1a1c2", "BEL dependency source digest drifted");
  invariant(state.gue?.id === "f982e6dd-ff37-4fe0-b2e8-756112793bd5", "GUE predecessor build drifted");
  invariant(state.gue?.status === "active" && state.gue?.releaseCurrent === true
    && state.gueManifestBound === true, "GUE predecessor manifest binding drifted");
  invariant(state.gue?.graphDigest === "b6c8618795fa8692427b8c47a473d551", "GUE predecessor graph digest drifted");
  invariant(state.gue?.sourceRevisionDigest === "082daf6c993fa38f1e8069bb5a20e9db", "GUE predecessor source digest drifted");
  invariant(Number(state.graphState?.oh_active) === 19 && Number(state.graphState?.wv_active) === 1, "Active graph count drifted");
  invariant(Number(state.graphState?.staging) === 0, "Unexpected staging graph exists");
  invariant(JSON.stringify((state.dependencyPads || []).map((pad) => pad.legacyId)) === JSON.stringify([
    "ascent--bakos", "ascent--banjo", "ascent--besece", "ascent--blayney", "ascent--cologie",
    "ascent--jennings", "ascent--pickens", "ascent--scout", "ascent--shutway",
  ]), "HAS/BEL dependency set drifted");
  invariant(JSON.stringify((state.dependencyPads || []).find(
    (pad) => pad.legacyId === "ascent--bakos",
  )?.sources) === JSON.stringify(["private_receipt_mapping"]), "Bakos dependency proof drifted");
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
  invariant(Number(state.privateGoogleReceipts?.receipt_count) === 36
    && Number(state.privateGoogleReceipts?.ready_count) === 2
    && Number(state.privateGoogleReceipts?.held_count) === 10
    && Number(state.privateGoogleReceipts?.stale_count) === 24,
  "Private Google receipt corpus drifted");
  invariant(state.cutoverAt === null, "Cutover is unexpectedly active");
  invariant(Number(state.savedReconciliationRuns) === 0, "Saved reconciliation state drifted");
  invariant(Number(state.overlaySnapshots) === 0 && Number(state.overlayRows) === 0, "Overlay state drifted");
  invariant(Number(state.gueLedgerCount) === 1, "GUE migration ledger drifted");
  invariant(Number(state.hasLedger?.count) === 0, "HAS migration is already installed");
}

function assertInside(evidence, before) {
  const newGraphs = evidence.newGraphs || [];
  const hasGraph = newGraphs.find((graph) => graph.countyCode === "HAS");
  const belGraph = newGraphs.find((graph) => graph.countyCode === "BEL");
  invariant(newGraphs.length === 2 && hasGraph && belGraph, "Exact HAS/BEL build set is incomplete");
  invariant(hasGraph.oldBuildId === before.has.id, "HAS old build changed inside rehearsal");
  invariant(hasGraph.newBuildId && hasGraph.newBuildId !== before.has.id, "HAS build was not replaced");
  invariant(hasGraph.status === "active" && hasGraph.releaseCurrent === true, "New HAS build is not release-current");
  invariant(hasGraph.sourceRevisionDigest && hasGraph.sourceRevisionDigest !== before.has.sourceRevisionDigest, "HAS source revision did not change");
  invariant(belGraph.oldBuildId === before.bel.id, "BEL old build changed inside rehearsal");
  invariant(belGraph.newBuildId && belGraph.newBuildId !== before.bel.id, "BEL build was not replaced");
  invariant(belGraph.status === "active" && belGraph.releaseCurrent === true, "New BEL build is not release-current");
  invariant(belGraph.sourceRevisionDigest && belGraph.sourceRevisionDigest !== before.bel.sourceRevisionDigest, "BEL source revision did not change");
  invariant(Number(evidence.graphCounts?.ohActive) === 19 && Number(evidence.graphCounts?.wvActive) === 1 && Number(evidence.graphCounts?.staging) === 0, "Graph counts changed inside rehearsal");
  invariant(Number(evidence.targetRoads) === 2 && Number(evidence.targetMappings) === 2, "HAS target object counts are wrong");
  invariant(Number(evidence.resolvedScoutOccurrences) === 5, "Scout exact occurrence count is wrong");
  invariant(evidence.scoutBoundary?.status === "held", "Scout same-road boundary was upgraded");
  invariant(evidence.scoutBoundary?.holdReason === "adjacent_same_road_split_requires_explicit_source_boundary", "Scout boundary hold reason changed");
  invariant(evidence.scoutBoundary?.leftRoadId === evidence.scoutBoundary?.rightRoadId, "Scout boundary no longer preserves the same-road identity");
  invariant(evidence.scoutBoundary?.junctionId === null && evidence.scoutBoundary?.anchorId === null, "Scout boundary gained invented junction authority");
  invariant(evidence.cologieReadyReceipt === true && evidence.bakosReadyReceipt === true
    && Number(evidence.otherReadyReceiptCount) === 0,
  "HAS private Google result did not preserve exact Bakos/Cologie readiness");
  invariant(Number(evidence.directory?.sourceRevision) === 5, "Directory revision is not 5 inside rehearsal");
  invariant(Number(evidence.directory?.rowCount) === 1214 && Number(evidence.directory?.searchableCount) === 1214, "Directory row counts changed inside rehearsal");
  invariant(evidence.padAuthorityDigest === before.padAuthorityDigest, "Pad authority changed inside rehearsal");
  invariant(evidence.publicDirectionsDigest === before.publicDirectionsDigest, "Public directions changed inside rehearsal");
  invariant(Number(evidence.publicGoogleRows) === 0 && Number(evidence.googleQueue) === 0, "Public Google or queue expanded inside rehearsal");
  invariant(evidence.cutoverAt === null, "Cutover was enabled inside rehearsal");
  invariant(Number(evidence.savedReconciliationRuns) === 0, "Saved reconciliation ran inside rehearsal");
  invariant(Number(evidence.overlaySnapshots) === 0 && Number(evidence.overlayRows) === 0, "Overlay authority changed inside rehearsal");
}

function assertAfterPermanent(state, before, inside) {
  const newGraphs = inside.newGraphs || [];
  const hasGraph = newGraphs.find((graph) => graph.countyCode === "HAS");
  const belGraph = newGraphs.find((graph) => graph.countyCode === "BEL");
  invariant(hasGraph && belGraph && newGraphs.length === 2,
    "Permanent HAS/BEL graph evidence is incomplete");
  invariant(state.has?.id === hasGraph.newBuildId && state.has?.status === "active"
    && state.has?.releaseCurrent === true,
  "Persisted HAS graph does not match the verified transaction");
  invariant(state.has?.graphDigest === hasGraph.graphDigest
    && state.has?.sourceRevisionDigest === hasGraph.sourceRevisionDigest,
  "Persisted HAS graph digests diverged");
  invariant(state.bel?.id === belGraph.newBuildId && state.bel?.status === "active"
    && state.bel?.releaseCurrent === true,
  "Persisted BEL graph does not match the verified transaction");
  invariant(state.bel?.graphDigest === belGraph.graphDigest
    && state.bel?.sourceRevisionDigest === belGraph.sourceRevisionDigest,
  "Persisted BEL graph digests diverged");
  invariant(state.gue?.id === before.gue.id && state.gue?.status === "active"
    && state.gue?.releaseCurrent === true
    && state.gue?.graphDigest === before.gue.graphDigest
    && state.gue?.sourceRevisionDigest === before.gue.sourceRevisionDigest,
  "GUE predecessor changed during HAS install");
  invariant(Number(state.graphState?.build_count) === 52
    && Number(state.graphState?.oh_active) === 19
    && Number(state.graphState?.wv_active) === 1
    && Number(state.graphState?.staging) === 0,
  "Persisted graph corpus counts diverged");
  invariant(JSON.stringify((state.dependencyPads || []).map((pad) => pad.legacyId))
    === JSON.stringify([
      "ascent--bakos", "ascent--banjo", "ascent--besece", "ascent--blayney",
      "ascent--cologie", "ascent--jennings", "ascent--pickens", "ascent--scout",
      "ascent--shutway",
    ]), "Persisted HAS/BEL dependency set diverged");
  invariant(JSON.stringify(state.dependencyReadyReceipts)
    === JSON.stringify(["ascent--bakos", "ascent--cologie"]),
  "Persisted private-ready dependency set diverged");
  invariant(Number(state.targetRoads) === 2 && Number(state.targetMappings) === 2
    && Number(state.targetStepCount) === 1 && Number(state.targetManifestCount) === 1,
  "Persisted HAS target object counts diverged");
  invariant(Number(state.scoutRoute?.step_count) === 5
    && Number(state.scoutReceiptCount) === 5
    && Number(state.resolvedScoutOccurrences) === 5,
  "Persisted Scout exact occurrence set diverged");
  invariant(state.scoutBoundary?.status === "held"
    && state.scoutBoundary?.holdReason
      === "adjacent_same_road_split_requires_explicit_source_boundary"
    && state.scoutBoundary?.leftRoadId === state.scoutBoundary?.rightRoadId
    && state.scoutBoundary?.junctionId === null && state.scoutBoundary?.anchorId === null,
  "Persisted Scout source boundary was upgraded or changed");
  invariant(Number(state.occurrenceReceipts) === 4107,
    "Persisted occurrence receipt corpus count diverged");
  invariant(state.padAuthorityDigest === before.padAuthorityDigest,
    "Pad authority changed during permanent install");
  invariant(state.publicDirectionsDigest === before.publicDirectionsDigest,
    "Reviewed public directions changed during permanent install");
  invariant(Number(state.directory?.sourceRevision) === 5
    && Number(state.directory?.rowCount) === 1214
    && Number(state.directory?.searchableCount) === 1214
    && state.directory?.snapshotId === inside.directory?.snapshotId
    && state.directory?.sha256 === inside.directory?.sha256,
  "Persisted directory does not match the verified transaction");
  invariant(Number(state.privateGoogleReceipts?.receipt_count) === 36
    && Number(state.privateGoogleReceipts?.ready_count) === 2
    && Number(state.privateGoogleReceipts?.held_count) === 10
    && Number(state.privateGoogleReceipts?.stale_count) === 24,
  "Persisted private Google receipt corpus counts diverged");
  invariant(Number(state.publicGoogleRows) === 0 && Number(state.googleQueue) === 0,
    "Public Google or refresh queue expanded");
  invariant(state.cutoverAt === null, "Cutover was enabled");
  invariant(Number(state.savedReconciliationRuns) === 0,
    "Saved reconciliation ran during permanent install");
  invariant(Number(state.overlaySnapshots) === 0 && Number(state.overlayRows) === 0,
    "Owner overlay authority changed during permanent install");
  invariant(Number(state.gueLedgerCount) === 1, "GUE migration ledger changed");
  invariant(Number(state.hasLedger?.count) === 1
    && state.hasLedger?.name === migrationName
    && Number(state.hasLedger?.statementCount) === 1
    && state.hasLedger?.statementMd5 === migrationMd5,
  "HAS migration ledger entry diverged");
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
  if (inspectBuilderOnly) {
    phase = "read-only-builder-inspection";
    const inspection = (await client.query(`
      with definition as (
        select pg_catalog.pg_get_functiondef(
          'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
        ) as sql
      ), names as (
        select distinct match[1] as name
        from definition
        cross join lateral pg_catalog.regexp_matches(
          definition.sql,
          'create[[:space:]]+temporary[[:space:]]+table[[:space:]]+(?:if[[:space:]]+not[[:space:]]+exists[[:space:]]+)?([a-zA-Z0-9_]+)',
          'gi'
        ) as match
      ), drops as (
        select distinct match[1] as name
        from definition
        cross join lateral pg_catalog.regexp_matches(
          definition.sql,
          'drop[[:space:]]+table[[:space:]]+if[[:space:]]+exists[[:space:]]+(?:pg_temp\\.)?([a-zA-Z0-9_]+)',
          'gi'
        ) as match
      )
      select pg_catalog.jsonb_build_object(
        'functionMd5',pg_catalog.md5(definition.sql),
        'temporaryTables',(select pg_catalog.jsonb_agg(name order by name) from names),
        'explicitlyDroppedTables',(select pg_catalog.jsonb_agg(name order by name) from drops),
        'createdWithoutExplicitDrop',(
          select pg_catalog.jsonb_agg(names.name order by names.name)
          from names left join drops using(name) where drops.name is null
        )
      ) as evidence
      from definition
    `)).rows[0].evidence;
    console.log(JSON.stringify({ kind: "builder-inspection", evidence: inspection }));
    phase = "complete";
    console.log(JSON.stringify({ kind: "complete", result: "read-only-builder-inspection-passed" }));
  } else if (bakosDiagnosticOnly) {
    phase = "read-only-has-bel-bakos-diagnostic";
    await client.query("begin read only");
    transactionOpen = true;
    await client.query("set local statement_timeout='120s'");
    const diagnostic = (await client.query(`
      with target_builds as materialized (
        select build.id,build.county_code,build.graph_digest,build.source_revision_digest
        from public.brinesearch_road_graph_builds build
        where build.state_code='OH' and build.county_code in ('BEL','HAS')
          and build.status='active'
      ), road_pinned as materialized (
        select distinct pad.id as pad_id,pad.legacy_id
        from public.brinesearch_authoritative_road_identities identity
        join public.brinesearch_road_identity_mappings mapping
          on mapping.identity_id=identity.id and mapping.mapping_status='verified'
        join public.brinesearch_pad_roads step on step.road_id=mapping.road_id
        join public.pads pad on pad.id=step.pad_id
        where identity.active and identity.state_code='OH'
          and identity.county_code in ('BEL','HAS')
      ), any_status_target_pads as materialized (
        select distinct pad.id as pad_id,pad.legacy_id
        from public.brinesearch_authoritative_road_identities identity
        join public.brinesearch_road_identity_mappings mapping
          on mapping.identity_id=identity.id
        join public.brinesearch_pad_roads step on step.road_id=mapping.road_id
        join public.pads pad on pad.id=step.pad_id
        where identity.state_code='OH' and identity.county_code in ('BEL','HAS')
      ), target_step_mappings as materialized (
        select distinct pad.id as pad_id,pad.legacy_id,step.road_id,
          mapping.id as mapping_id,mapping.mapping_status,mapping.mapping_method,
          identity.id as identity_id,identity.active as identity_active,
          identity.county_code as identity_county,identity.source_identity_key
        from public.brinesearch_authoritative_road_identities identity
        join public.brinesearch_road_identity_mappings mapping
          on mapping.identity_id=identity.id
        join public.brinesearch_pad_roads step on step.road_id=mapping.road_id
        join public.pads pad on pad.id=step.pad_id
        where identity.state_code='OH' and identity.county_code in ('BEL','HAS')
      ), bakos_roads as materialized (
        select distinct road.id,road.canonical_name,road.state,road.county,road.township,
          road.road_type,road.route_number,road.source_record_id,
          road.verification_status,road.candidate_only
        from public.pads pad
        join public.brinesearch_pad_roads step on step.pad_id=pad.id
        join public.brinesearch_roads road on road.id=step.road_id
        where pad.legacy_id='ascent--bakos'
      ), target_identities as materialized (
        select identity.*,
          pg_catalog.split_part(
            pg_catalog.replace(identity.source_identity_key,'OH:ODOT:NLF:',''),':',1
          ) as nlf_base,
          pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.regexp_replace(
            coalesce(identity.route_number,'')||coalesce(identity.route_suffix,'')||
            coalesce(identity.route_fraction,'')||coalesce(identity.route_extension,''),
            '[^0-9A-Z]','','g'
          )),'^0+','') as route_token
        from public.brinesearch_authoritative_road_identities identity
        where identity.active and identity.state_code='OH'
          and identity.county_code in ('BEL','HAS')
      ), nlf_base_counts as materialized (
        select pg_catalog.split_part(
            pg_catalog.replace(identity.source_identity_key,'OH:ODOT:NLF:',''),':',1
          ) as nlf_base,count(*)::integer as identity_count
        from public.brinesearch_authoritative_road_identities identity
        where identity.active and identity.state_code='OH'
        group by 1
      ), bakos_exact_candidates as materialized (
        select identity.id as identity_id,identity.county_code,
          identity.source_identity_key,road.id as road_id,road.canonical_name,
          'exact_source_record_id'::text as mapping_method
        from target_identities identity
        left join nlf_base_counts base on base.nlf_base=identity.nlf_base
        join bakos_roads road on (
          road.source_record_id=identity.source_identity_key
          or (pg_catalog.split_part(coalesce(road.source_record_id,''),'|',1)=identity.nlf_base
            and base.identity_count=1)
        )
        where road.verification_status='verified'
          and (road.state='OH' or (road.state is null and road.road_type in ('interstate','us_route')))
          and (road.road_type in ('interstate','us_route','state_route')
            or pg_catalog.lower(coalesce(road.county,''))=pg_catalog.lower(identity.county_name))

        union

        select identity.id,identity.county_code,identity.source_identity_key,
          road.id,road.canonical_name,'exact_route_designation'::text
        from target_identities identity
        join bakos_roads road on road.road_type=identity.road_class
          and pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.regexp_replace(
            coalesce(road.route_number,''),'[^0-9A-Z]','','g'
          )),'^0+','')=identity.route_token
          and (
            identity.road_class in ('interstate','us_route')
            or (road.state='OH' and identity.road_class='state_route')
            or (road.state='OH' and identity.road_class='county'
              and pg_catalog.lower(coalesce(road.county,''))=pg_catalog.lower(identity.county_name))
            or (road.state='OH' and identity.road_class='township'
              and pg_catalog.lower(coalesce(road.county,''))=pg_catalog.lower(identity.county_name)
              and nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(identity.township,''))),'') is not null
              and pg_catalog.lower(pg_catalog.btrim(coalesce(road.township,'')))
                =pg_catalog.lower(pg_catalog.btrim(identity.township)))
          )
        where road.verification_status='verified' and identity.route_token<>''
      ), target_refresh_mappings as materialized (
        select mapping.identity_id,mapping.road_id,mapping.mapping_status,
          mapping.mapping_method,identity.county_code,identity.source_identity_key
        from public.brinesearch_road_identity_mappings mapping
        join public.brinesearch_authoritative_road_identities identity
          on identity.id=mapping.identity_id
        where identity.state_code='OH' and identity.county_code in ('BEL','HAS')
          and mapping.mapping_method in ('exact_source_record_id','exact_route_designation')
          and mapping.mapping_status in ('verified','candidate')
      ), all_google_point_refs as materialized (
        select receipt.pad_id,pad.legacy_id,
          nullif(point->>'graph_build_id','')::uuid as graph_build_id,
          nullif(point->>'identity_id','')::uuid as identity_id,
          nullif(point->>'road_id','')::uuid as road_id
        from private_verification.brinesearch_google_route_receipts_issue97 receipt
        join public.pads pad on pad.id=receipt.pad_id
        cross join lateral pg_catalog.jsonb_array_elements(
          coalesce(receipt.manifest->'points','[]'::jsonb)
        ) point
      ), mapping_receipt_impacted as materialized (
        select distinct point.pad_id,point.legacy_id
        from all_google_point_refs point
        join target_refresh_mappings mapping
          on mapping.identity_id=point.identity_id or mapping.road_id=point.road_id
      ), receipt_refs as materialized (
        select distinct receipt.pad_id,pad.legacy_id,
          nullif(point->>'graph_build_id','')::uuid as graph_build_id,
          nullif(point->>'identity_id','')::uuid as identity_id,
          nullif(point->>'road_id','')::uuid as road_id
        from private_verification.brinesearch_google_route_receipts_issue97 receipt
        join public.pads pad on pad.id=receipt.pad_id
        cross join lateral pg_catalog.jsonb_array_elements(
          coalesce(receipt.manifest->'points','[]'::jsonb)
        ) point
        join target_builds build on build.id=nullif(point->>'graph_build_id','')::uuid
      ), step_refs as materialized (
        select distinct step.pad_id,pad.legacy_id,step.junction_build_id as graph_build_id,
          step.road_id
        from public.brinesearch_pad_roads step
        join public.pads pad on pad.id=step.pad_id
        join target_builds build on build.id=step.junction_build_id
      ), trigger_impacted as materialized (
        select pad_id,legacy_id,'receipt_manifest'::text as source from receipt_refs
        union
        select pad_id,legacy_id,'pad_step'::text from step_refs
      ), impacted_pads as materialized (
        select impacted.pad_id,impacted.legacy_id,
          pg_catalog.array_agg(distinct impacted.source order by impacted.source) as sources
        from trigger_impacted impacted
        group by impacted.pad_id,impacted.legacy_id
      ), mapped_counties as materialized (
        select step.pad_id,
          pg_catalog.array_agg(distinct identity.county_code order by identity.county_code)
            filter(where identity.county_code is not null) as identity_counties
        from public.brinesearch_pad_roads step
        left join public.brinesearch_road_identity_mappings mapping
          on mapping.road_id=step.road_id and mapping.mapping_status='verified'
        left join public.brinesearch_authoritative_road_identities identity
          on identity.id=mapping.identity_id and identity.active
        group by step.pad_id
      ), trigger_definition as materialized (
        select pg_catalog.pg_get_functiondef(
          'private_verification.brinesearch_issue97_invalidate_google_route_trigger()'::
            pg_catalog.regprocedure
        ) as sql
      )
      select pg_catalog.jsonb_build_object(
        'checkedAt',pg_catalog.clock_timestamp(),
        'transactionReadOnly',pg_catalog.current_setting('transaction_read_only'),
        'targetBuilds',(
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'countyCode',county_code,'id',id,'graphDigest',graph_digest,
            'sourceRevisionDigest',source_revision_digest
          ) order by county_code) from target_builds
        ),
        'roadPinnedPads',(
          select pg_catalog.jsonb_agg(legacy_id order by legacy_id) from road_pinned
        ),
        'anyStatusTargetCountyPads',(
          select pg_catalog.jsonb_agg(legacy_id order by legacy_id)
          from any_status_target_pads
        ),
        'anyStatusOnlyPads',(
          select coalesce(pg_catalog.jsonb_agg(any_status.legacy_id order by any_status.legacy_id),'[]'::jsonb)
          from any_status_target_pads any_status
          left join road_pinned pinned on pinned.pad_id=any_status.pad_id
          where pinned.pad_id is null
        ),
        'mappingReceiptImpactedPads',(
          select coalesce(pg_catalog.jsonb_agg(legacy_id order by legacy_id),'[]'::jsonb)
          from mapping_receipt_impacted
        ),
        'mappingReceiptOnlyPads',(
          select coalesce(pg_catalog.jsonb_agg(impacted.legacy_id order by impacted.legacy_id),'[]'::jsonb)
          from mapping_receipt_impacted impacted
          left join road_pinned pinned on pinned.pad_id=impacted.pad_id
          where pinned.pad_id is null
        ),
        'graphTriggerPads',(
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'legacyId',impacted.legacy_id,'padId',impacted.pad_id,
            'sources',impacted.sources,
            'roadPinned',pinned.pad_id is not null,
            'mappedIdentityCounties',coalesce(counties.identity_counties,array[]::text[]),
            'receiptStatus',receipt.status,'receiptHoldReason',receipt.hold_reason,
            'receiptManifestDigest',receipt.manifest_digest,
            'receiptDependencyDigest',receipt.dependency_digest,
            'receiptGraphRefs',(
              select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'graphBuildId',ref.graph_build_id,'identityId',ref.identity_id,
                'roadId',ref.road_id
              ) order by ref.graph_build_id,ref.identity_id,ref.road_id),'[]'::jsonb)
              from receipt_refs ref where ref.pad_id=impacted.pad_id
            ),
            'stepGraphRefs',(
              select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'graphBuildId',ref.graph_build_id,'roadId',ref.road_id
              ) order by ref.graph_build_id,ref.road_id),'[]'::jsonb)
              from step_refs ref where ref.pad_id=impacted.pad_id
            )
          ) order by impacted.legacy_id)
          from impacted_pads impacted
          left join road_pinned pinned on pinned.pad_id=impacted.pad_id
          left join mapped_counties counties on counties.pad_id=impacted.pad_id
          left join private_verification.brinesearch_google_route_receipts_issue97 receipt
            on receipt.pad_id=impacted.pad_id
        ),
        'triggerOnlyPads',(
          select coalesce(pg_catalog.jsonb_agg(impacted.legacy_id order by impacted.legacy_id),'[]'::jsonb)
          from impacted_pads impacted
          left join road_pinned pinned on pinned.pad_id=impacted.pad_id
          where pinned.pad_id is null
        ),
        'roadPinnedButNotGraphTriggered',(
          select coalesce(pg_catalog.jsonb_agg(pinned.legacy_id order by pinned.legacy_id),'[]'::jsonb)
          from road_pinned pinned
          left join impacted_pads impacted on impacted.pad_id=pinned.pad_id
          where impacted.pad_id is null
        ),
        'bakos',(
          select pg_catalog.jsonb_build_object(
            'padId',pad.id,'legacyId',pad.legacy_id,
            'graphTriggered',impacted.pad_id is not null,
            'triggerSources',coalesce(impacted.sources,array[]::text[]),
            'roadPinned',pinned.pad_id is not null,
            'mappedIdentityCounties',coalesce(counties.identity_counties,array[]::text[]),
            'targetCountyStepMappings',(
              select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'roadId',mapping.road_id,'mappingId',mapping.mapping_id,
                'mappingStatus',mapping.mapping_status,
                'mappingMethod',mapping.mapping_method,
                'identityId',mapping.identity_id,
                'identityActive',mapping.identity_active,
                'identityCounty',mapping.identity_county,
                'sourceIdentityKey',mapping.source_identity_key
              ) order by mapping.identity_county,mapping.source_identity_key,mapping.mapping_id),'[]'::jsonb)
              from target_step_mappings mapping where mapping.pad_id=pad.id
            ),
            'publishedRoads',(
              select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'roadId',road.id,'canonicalName',road.canonical_name,
                'state',road.state,'county',road.county,'township',road.township,
                'roadType',road.road_type,'routeNumber',road.route_number,
                'sourceRecordId',road.source_record_id,
                'verificationStatus',road.verification_status,
                'candidateOnly',road.candidate_only
              ) order by road.id),'[]'::jsonb) from bakos_roads road
            ),
            'prospectiveExactCandidates',(
              select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'identityId',candidate.identity_id,'identityCounty',candidate.county_code,
                'sourceIdentityKey',candidate.source_identity_key,
                'roadId',candidate.road_id,'canonicalName',candidate.canonical_name,
                'mappingMethod',candidate.mapping_method
              ) order by candidate.county_code,candidate.source_identity_key,candidate.road_id),'[]'::jsonb)
              from bakos_exact_candidates candidate
            ),
            'privateGooglePointRefs',(
              select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'graphBuildId',point.graph_build_id,'identityId',point.identity_id,
                'roadId',point.road_id,
                'targetMapping',mapping.identity_id is not null,
                'mappingStatus',mapping.mapping_status,
                'mappingMethod',mapping.mapping_method,
                'identityCounty',mapping.county_code,
                'sourceIdentityKey',mapping.source_identity_key
              ) order by point.identity_id,point.road_id),'[]'::jsonb)
              from all_google_point_refs point
              left join target_refresh_mappings mapping
                on mapping.identity_id=point.identity_id or mapping.road_id=point.road_id
              where point.pad_id=pad.id
            ),
            'occurrenceReceipts',(
              select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'routePrepId',route.id,'routePrepStepId',receipt.route_prep_step_id,
                'identityId',receipt.identity_id,'canonicalRoadId',receipt.canonical_road_id,
                'resolutionStatus',receipt.resolution_status,
                'identityCounty',identity.county_code,
                'sourceIdentityKey',identity.source_identity_key
              ) order by route.id,receipt.route_prep_step_id),'[]'::jsonb)
              from public.brinesearch_route_prep route
              join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
                on receipt.route_prep_id=route.id
              left join public.brinesearch_authoritative_road_identities identity
                on identity.id=receipt.identity_id
              where route.pad_id=pad.id and route.active
            ),
            'activeRoutePreps',(
              select coalesce(pg_catalog.jsonb_agg(route.id order by route.id),'[]'::jsonb)
              from public.brinesearch_route_prep route
              where route.pad_id=pad.id and route.active
            )
          )
          from public.pads pad
          left join impacted_pads impacted on impacted.pad_id=pad.id
          left join road_pinned pinned on pinned.pad_id=pad.id
          left join mapped_counties counties on counties.pad_id=pad.id
          where pad.legacy_id='ascent--bakos'
        ),
        'triggerFunction',(
          select pg_catalog.jsonb_build_object(
            'md5',pg_catalog.md5(sql),
            'checksReceiptManifestGraphBuild',
              sql like '%receipt.manifest->''points''%' and sql like '%graph_build_id%',
            'checksPadStepJunctionBuild',sql like '%step.junction_build_id=v_build_id%',
            'mappingAndIdentityBranchesIgnoreMappingStatus',
              sql like '%join public.brinesearch_road_identity_mappings mapping on mapping.road_id=step.road_id%'
              and sql not like '%mapping.mapping_status=%'
          ) from trigger_definition
        ),
        'queueRows',(select count(*)
          from private_verification.brinesearch_google_route_refresh_queue_issue97),
        'publicGoogleRows',(select count(*) from public.brinesearch_driver_google_routes_public),
        'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton)
      ) as evidence
    `)).rows[0].evidence;
    console.log(JSON.stringify({ kind: "has-bel-bakos-read-only-diagnostic", evidence: diagnostic }));
    await client.query("rollback");
    transactionOpen = false;
    phase = "complete";
    console.log(JSON.stringify({ kind: "complete", result: "read-only-has-bel-bakos-diagnostic-passed" }));
  } else if (dependencyAuditOnly) {
    phase = "read-only-cross-county-dependency-audit";
    await client.query("begin read only");
    transactionOpen = true;
    await client.query("set local statement_timeout='120s'");
    const audit = (await client.query(`
      with active_builds as materialized (
        select build.id,build.county_code,
          private_verification.brinesearch_issue97_graph_build_release_current(build.id)
            as release_current
        from public.brinesearch_road_graph_builds build
        where build.state_code='OH' and build.status='active'
      ), memberships as materialized (
        select distinct build.id as build_id,build.county_code as build_county,
          build.release_current,identity.id as identity_id,
          identity.county_code as identity_county,identity.source_identity_key,
          identity.road_class,identity.route_number,mapping.road_id,
          mapping.mapping_method,road.canonical_name
        from active_builds build
        join public.brinesearch_road_junctions junction on junction.build_id=build.id
        join public.brinesearch_road_junction_memberships member
          on member.junction_id=junction.id
        join public.brinesearch_authoritative_road_identities identity
          on identity.id=member.identity_id
        left join public.brinesearch_road_identity_mappings mapping
          on mapping.identity_id=identity.id and mapping.mapping_status='verified'
        left join public.brinesearch_roads road on road.id=mapping.road_id
      ), cross_county as materialized (
        select * from memberships where identity_county<>build_county
      ), shared as materialized (
        select identity_id,identity_county,source_identity_key,road_class,route_number,
          road_id,mapping_method,canonical_name,
          pg_catalog.array_agg(distinct build_county order by build_county) as graph_counties
        from memberships
        group by identity_id,identity_county,source_identity_key,road_class,route_number,
          road_id,mapping_method,canonical_name
        having count(distinct build_county)>1
      )
      select pg_catalog.jsonb_build_object(
        'checkedAt',pg_catalog.clock_timestamp(),
        'activeBuildCount',(select count(*) from active_builds),
        'nonCurrentActiveBuilds',(
          select coalesce(pg_catalog.jsonb_agg(county_code order by county_code),'[]'::jsonb)
          from active_builds where not release_current
        ),
        'crossCountyMembershipCount',(select count(*) from cross_county),
        'crossCountyIdentityCount',(select count(distinct identity_id) from cross_county),
        'dependencyEdges',(
          select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'graphCounty',edge.build_county,'identityCounty',edge.identity_county,
            'identityCount',edge.identity_count
          ) order by edge.build_county,edge.identity_county),'[]'::jsonb)
          from (
            select build_county,identity_county,count(distinct identity_id) as identity_count
            from cross_county group by build_county,identity_county
          ) edge
        ),
        'sharedRoadIdentities',(
          select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'identityId',identity_id,'identityCounty',identity_county,
            'sourceIdentityKey',source_identity_key,'roadClass',road_class,
            'routeNumber',route_number,'roadId',road_id,'mappingMethod',mapping_method,
            'canonicalName',canonical_name,'graphCounties',graph_counties
          ) order by identity_county,source_identity_key),'[]'::jsonb)
          from shared
        )
      ) as evidence
    `)).rows[0].evidence;
    console.log(JSON.stringify({ kind: "cross-county-dependency-audit", evidence: audit }));
    await client.query("rollback");
    transactionOpen = false;
    phase = "complete";
    console.log(JSON.stringify({ kind: "complete", result: "read-only-cross-county-dependency-audit-passed" }));
  } else {
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
      await client.query(permanentInstall
        ? "set local application_name='issue97-has-permanent-install'"
        : "set local application_name='issue97-has-rollback-rehearsal'");

      phase = "transaction-drift-check";
      assertBefore((await client.query(stateSql)).rows[0].state);

      let verifiedInside = null;
      if (diagnosticOnly) {
        phase = "diagnostic-rebuild";
        await client.query(diagnosticPrefixSql);

        phase = "diagnostic-snapshot";
        const diagnostic = (await client.query(diagnosticSql)).rows[0].evidence;
        console.log(JSON.stringify({ kind: "diagnostic", evidence: diagnostic }));
      } else {
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
        verifiedInside = inside;
        console.log(JSON.stringify({ kind: "inside", evidence: inside }));
      }

      if (permanentInstall) {
        phase = "migration-ledger";
        await client.query(
          "insert into supabase_migrations.schema_migrations(version,statements,name) values ($1,array[$2]::text[],$3)",
          [migrationVersion, migrationSql, migrationName],
        );

        phase = "precommit-verification";
        const precommit = (await client.query(stateSql)).rows[0].state;
        assertAfterPermanent(precommit, before, verifiedInside);
        console.log(JSON.stringify({ kind: "precommit", state: precommit }));

        phase = "commit";
        await client.query("commit");
        transactionOpen = false;

        phase = "persisted-verification";
        const after = (await client.query(stateSql)).rows[0].state;
        assertAfterPermanent(after, before, verifiedInside);
        const exactVerifiedCommit = canonicalState(precommit) === canonicalState(after);
        console.log(JSON.stringify({ kind: "after", exactVerifiedCommit, state: after }));
        invariant(exactVerifiedCommit,
          "Persisted HAS install differs from the verified precommit state");

        phase = "complete";
        console.log(JSON.stringify({
          kind: "complete",
          result: "installed-and-verified",
          elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
        }));
      } else {
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
          result: diagnosticOnly ? "diagnosed-and-rolled-back" : "passed-and-rolled-back",
          elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
        }));
      }
    }
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
