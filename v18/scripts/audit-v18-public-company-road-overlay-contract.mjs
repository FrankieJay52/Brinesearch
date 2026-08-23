import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260823002729_v18_public_company_road_overlay_contract.sql",
);
const testPath = path.join(
  root,
  "supabase/tests/v18_public_company_road_overlay_contract.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const sqlTest = fs.readFileSync(testPath, "utf8");

function compact(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function section(sql, start, end) {
  const lower = sql.toLowerCase();
  const from = lower.indexOf(start.toLowerCase());
  const to = lower.indexOf(end.toLowerCase(), from + start.length);
  if (from < 0 || to < 0) return "";
  return sql.slice(from, to);
}

function lastSection(sql, start, end) {
  const lower = sql.toLowerCase();
  const from = lower.lastIndexOf(start.toLowerCase());
  const to = lower.indexOf(end.toLowerCase(), from + start.length);
  if (from < 0 || to < 0) return "";
  return sql.slice(from, to);
}

function unterminatedPlpgsqlBlocks(sql) {
  return [...sql.matchAll(/^end\r?\n\$(?:[A-Za-z0-9_]+)?\$;/gm)];
}

const expectedTriggerRelations = [
  "private_verification.brinesearch_driver_safety_facts_issue69",
  "private_verification.brinesearch_google_route_receipts_issue97",
  "private_verification.brinesearch_issue97_graph_release_generations",
  "private_verification.brinesearch_issue97_graph_release_qualifications",
  "private_verification.brinesearch_route_occurrence_geometry_receipts_issue97",
  "private_verification.brinesearch_route_occurrence_receipts_issue97",
  "private_verification.brinesearch_route_reconciliation_receipts_issue97",
  "private_verification.brinesearch_route_transition_receipts_issue97",
  "public.brinesearch_authoritative_external_road_segments",
  "public.brinesearch_authoritative_road_identities",
  "public.brinesearch_authoritative_road_names",
  "public.brinesearch_authoritative_segment_identity_assignments",
  "public.brinesearch_authoritative_supplemental_centerlines",
  "public.brinesearch_directory_snapshot_rows_v18",
  "public.brinesearch_directory_snapshots_v18",
  "public.brinesearch_odot_road_catalog",
  "public.brinesearch_road_graph_builds",
  "public.brinesearch_road_graph_counties",
  "public.brinesearch_road_identity_mappings",
  "public.brinesearch_road_junction_anchors",
  "public.brinesearch_road_junction_memberships",
  "public.brinesearch_road_junctions",
  "public.brinesearch_road_source_dataset_counties",
  "public.brinesearch_road_source_datasets",
  "public.brinesearch_road_source_ingest_pages",
  "public.brinesearch_road_source_ingest_runs",
  "public.brinesearch_roads",
  "public.brinesearch_route_prep",
  "public.brinesearch_route_prep_steps",
  "public.brinesearch_supplemental_centerline_dispositions",
  "public.brinesearch_supplemental_centerline_identity_mappings",
  "public.pad_verification_status",
  "public.pads",
  "public.public_pad_detail",
].sort();

function audit(sql, test) {
  const errors = [];
  const normalized = compact(sql);
  if (unterminatedPlpgsqlBlocks(sql).length) {
    errors.push("migration contains a PL/pgSQL block without the required END semicolon");
  }
  if (unterminatedPlpgsqlBlocks(test).length) {
    errors.push("SQL contract test contains a PL/pgSQL block without the required END semicolon");
  }
  const invalidQualifiedSpecial = /pg_catalog\.(?:coalesce|nullif|greatest|least|extract|jsonb_object_length)\s*\(/i;
  if (invalidQualifiedSpecial.test(sql) || invalidQualifiedSpecial.test(test)) {
    errors.push("PostgreSQL special syntax is incorrectly schema-qualified");
  }
  const geometryGuard = section(
    sql,
    "create or replace function\n  private_verification.brinesearch_v18_company_road_geometry_is_safe",
    "create or replace function\n  private_verification.brinesearch_v18_company_road_safe_labels",
  );
  const ownerAuthority = section(
    sql,
    "create or replace function\n  private_verification.brinesearch_v18_owner_authority_current",
    "revoke all on function\n  private_verification.brinesearch_v18_owner_authority_current",
  );
  const authorityHash = lastSection(
    sql,
    "create or replace function\n  private_verification.brinesearch_v18_company_road_authority_definition_sha256",
    "revoke all on function\n  private_verification.brinesearch_v18_company_road_authority_definition_sha256",
  );
  const cachedProjectionClone = section(
    sql,
    "do $v18_company_road_clone_cached_exact_projection$",
    "create or replace function\n  private_verification.brinesearch_v18_company_road_authority_definition_sha256",
  );
  const authorizer = section(
    sql,
    "create or replace function\n  public.brinesearch_v18_authorize_company_road_overlay_release",
    "revoke all on function\n  public.brinesearch_v18_authorize_company_road_overlay_release",
  );
  const publisher = section(
    sql,
    "create or replace function\n  private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot",
    "revoke all on function\n  private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot",
  );
  const withdrawal = section(
    sql,
    "create or replace function\n  private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change",
    "revoke all on function\n  private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change",
  );
  const page = section(
    sql,
    "create or replace function public.brinesearch_v18_company_road_overlay_page",
    "revoke all on function\n  public.brinesearch_v18_company_road_overlay_page",
  );
  if (!geometryGuard || !ownerAuthority || !cachedProjectionClone || !authorityHash
      || !authorizer || !publisher || !withdrawal || !page) {
    errors.push("one or more company-road contract function sections are missing");
    return errors;
  }
  const nGeometry = compact(geometryGuard);
  const nOwnerAuthority = compact(ownerAuthority);
  const nCachedProjectionClone = compact(cachedProjectionClone);
  const nAuthority = compact(authorityHash);
  const nAuthorizer = compact(authorizer);
  const nPublisher = compact(publisher);
  const nWithdrawal = compact(withdrawal);
  const nPage = compact(page);
  const nTest = compact(test);

  const requireGlobal = (value, label = value) => {
    if (!normalized.includes(compact(value))) errors.push(`missing ${label}`);
  };
  const requireIn = (body, value, label = value) => {
    if (!body.includes(compact(value))) errors.push(`missing ${label}`);
  };

  for (const tableContract of [
    "create table public.brinesearch_company_road_overlay_snapshots_v18",
    "create table public.brinesearch_company_road_overlay_rows_v18",
    "create table private_verification.brinesearch_v18_company_road_overlay_releases",
    "directory_snapshot_id uuid not null references public.brinesearch_directory_snapshots_v18",
    "publication_state in ('current','retained','withdrawn')",
    "retained_until>published_at",
    "row_count>=2 and row_count<=40000",
    "company_count>=1 and company_count<=200",
    "available_companies text[] not null",
    "pg_catalog.cardinality(available_companies)=company_count",
    "selection_kind='all' and selection_key=''",
    "selection_kind='company'",
    "check(ordinal>=1 and ordinal<=10000)",
    "geometry jsonb not null",
    "length_miles numeric(12,6) not null",
    "approval_state text not null",
    "approval_state='approved' and consumed_at is null and withdrawn_at is null",
    "approval_state='consumed' and consumed_at is not null and withdrawn_at is null",
    "approval_state='withdrawn' and consumed_at is null and withdrawn_at is not null",
    "expires_at<=approved_at+interval '15 minutes'",
    "approval_receipt_sha256~'^[0-9a-f]{64}$'",
    "where approval_state='approved'",
    "enable row level security",
    "force row level security",
  ]) requireGlobal(tableContract, `table contract ${tableContract}`);
  if ((normalized.match(/force row level security/g) || []).length !== 3) {
    errors.push("expected FORCE RLS on exactly three overlay/release tables");
  }
  for (const directBoundary of [
    "revoke all on public.brinesearch_company_road_overlay_snapshots_v18 from public,anon,authenticated,service_role",
    "revoke all on public.brinesearch_company_road_overlay_rows_v18 from public,anon,authenticated,service_role",
    "revoke all on private_verification.brinesearch_v18_company_road_overlay_releases from public,anon,authenticated,service_role",
    "revoke all on function private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer) from public,anon,authenticated,service_role",
    "grant execute on function public.brinesearch_v18_authorize_company_road_overlay_release() to authenticated",
    "grant execute on function private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot() to service_role",
    "grant execute on function public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer) to anon,authenticated,service_role",
    "revoke all on function private_verification.brinesearch_v18_company_road_authority_definition_sha256() from public,anon,authenticated,service_role",
    "revoke all on function private_verification.brinesearch_v18_owner_authority_current(uuid) from public,anon,authenticated,service_role",
  ]) requireGlobal(directBoundary, `privilege boundary ${directBoundary}`);
  if (/grant\s+(select|insert|update|delete|all).*brinesearch_(?:company_road_overlay_(?:snapshots|rows)_v18|v18_company_road_overlay_releases)/i.test(sql)) {
    errors.push("overlay/release tables gained direct grants");
  }
  if (/create\s+policy[\s\S]*?brinesearch_(?:company_road_overlay_(?:snapshots|rows)_v18|v18_company_road_overlay_releases)/i.test(sql)) {
    errors.push("overlay/release tables gained an RLS policy bypass");
  }
  if (/grant\s+execute\s+on\s+function\s+private_verification\.brinesearch_v18_exact_route_projection_cached/i.test(sql)) {
    errors.push("private cached projection gained a direct execution grant");
  }

  for (const guard of [
    "immutable",
    "parallel safe",
    "security invoker",
    "(p_geometry-'type'-'coordinates')<>'{}'::jsonb",
    "p_geometry->>'type' not in ('linestring','multilinestring')",
    "pg_column_size(p_geometry)>2097152",
    "st_ndims(v_geometry)=2",
    "st_npoints(v_geometry) between 2 and 20000",
    "st_makeenvelope(-84,37,-74,43,4326)",
    "exception when others then return false",
  ]) requireIn(nGeometry, guard, `geometry guard ${guard}`);
  for (const ownerContract of [
    "volatile",
    "security definer",
    "set search_path=''",
    "from public.editor_accounts account",
    "join auth.users user_account",
    "user_account.email_confirmed_at is not null",
    "'owner'=any(coalesce(account.permissions,'{}'::text[]))",
    "account.role='owner'",
  ]) requireIn(nOwnerAuthority, ownerContract, `fresh owner authority ${ownerContract}`);

  const authorityFunctions = [
    "private_verification.brinesearch_v18_safe_directory_text(text,text)",
    "private_verification.brinesearch_v18_company_road_geometry_is_safe(jsonb)",
    "private_verification.brinesearch_v18_company_road_safe_labels(text[],text,integer)",
    "private_verification.brinesearch_v18_owner_authority_current(uuid)",
    "private_verification.brinesearch_v18_company_road_authority_definition_sha256()",
    "public.brinesearch_v18_authorize_company_road_overlay_release()",
    "private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()",
    "private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change()",
    "public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer)",
    "public.is_brinesearch_owner(uuid)",
    "private_verification.brinesearch_v18_exact_route_projection(uuid,integer)",
    "private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)",
    "private_verification.brinesearch_issue97_prepare_scope_current_cache(text)",
    "private_verification.brinesearch_issue97_dataset_scope_current_cached(uuid,text,text)",
    "private_verification.brinesearch_issue97_prepare_graph_release_current_cache()",
    "private_verification.brinesearch_issue97_graph_build_release_current_cached(uuid)",
    "private_verification.brinesearch_issue97_graph_build_release_current_contextual(uuid)",
    "private_verification.brinesearch_issue97_graph_build_release_current(uuid)",
    "private_verification.brinesearch_issue97_graph_build_sources_current(uuid)",
    "private_verification.brinesearch_issue97_graph_source_content_digest(uuid)",
    "private_verification.brinesearch_issue97_graph_name_input_digest(uuid)",
    "private_verification.brinesearch_issue97_graph_supplemental_input_digest(uuid)",
    "private_verification.brinesearch_issue97_graph_mapping_evidence(text,jsonb)",
    "private_verification.brinesearch_issue97_transition_google_dark_current(uuid)",
    "private_verification.brinesearch_issue97_transition_google_dependency(uuid)",
    "private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)",
    "private_verification.brinesearch_issue97_ingest_run_verified(uuid)",
    "private_verification.brinesearch_issue97_source_snapshot_fingerprint(jsonb)",
    "private_verification.brinesearch_issue97_pad_safety_facts(uuid)",
    "private_verification.brinesearch_issue97_route_data_blocked(uuid)",
    "private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(uuid)",
    "private_verification.brinesearch_issue97_dataset_scope_current(uuid,text,text)",
    "private_verification.brinesearch_issue97_mapping_fingerprint(uuid)",
    "private_verification.brinesearch_issue97_identity_driver_name(uuid)",
    "private_verification.brinesearch_issue97_identity_aliases(uuid,uuid)",
    "private_verification.brinesearch_issue97_explicit_occurrence_source_key(text,text,jsonb)",
    "private_verification.brinesearch_v18_valid_right_continuation(text,text,text,text,integer,jsonb,text,text,uuid)",
  ];
  for (const signature of authorityFunctions) {
    requireIn(nAuthority, signature, `authority definition ${signature}`);
  }
  requireIn(
    nAuthority,
    "('private_verification.brinesearch_v18_company_road_authority_definition_sha256()')",
    "authority digest self allow-list entry",
  );
  for (const authorityRelation of [
    "auth.users",
    "private_verification.brinesearch_issue97_authoritative_road_segments_internal",
    "private_verification.brinesearch_v18_company_road_overlay_releases",
    "public.brinesearch_company_road_overlay_rows_v18",
    "public.brinesearch_company_road_overlay_snapshots_v18",
    "public.brinesearch_directory_snapshot_rows_v18",
    "public.brinesearch_directory_snapshots_v18",
    "public.editor_accounts",
    ...expectedTriggerRelations,
  ]) {
    requireIn(nAuthority, `('${authorityRelation}')`, `authority relation ${authorityRelation}`);
  }
  for (const authorityStructure of [
    "volatile",
    "security definer",
    "set search_path=''",
    "pg_get_functiondef",
    "procedure.proacl",
    "relation.relrowsecurity",
    "relation.relforcerowsecurity",
    "relation.reloptions",
    "relation.relacl",
    "pg_get_constraintdef",
    "from pg_catalog.pg_policy policy",
    "pg_get_triggerdef",
    "pg_get_viewdef",
    "order by authority.kind,authority.identity",
    "'sha256'",
  ]) {
    requireIn(nAuthority, authorityStructure, `canonical authority hash ${authorityStructure}`);
  }

  for (const cloneContract of [
    "v_old_name_count<>1 or v_new_name_count<>0 or v_old_scope_count<>1 or v_new_scope_count<>0",
    "v_old_name_count<>0 or v_new_name_count<>1 or v_old_scope_count<>0 or v_new_scope_count<>1",
    "v_cached_definition:=pg_catalog.replace( pg_catalog.replace(v_source_definition,v_old_name,v_new_name), v_old_scope,v_new_scope )",
    "execute v_cached_definition",
    "brinesearch_v18_exact_route_projection(uuid,integer)",
    "brinesearch_v18_exact_route_projection_cached(uuid,integer)",
    "brinesearch_issue97_dataset_scope_current(",
    "brinesearch_issue97_dataset_scope_current_cached(",
  ]) requireIn(nCachedProjectionClone, cloneContract, `cached projection clone ${cloneContract}`);
  if (normalized.includes("create or replace function private_verification.brinesearch_v18_exact_route_projection(")) {
    errors.push("migration modifies the browser-reachable exact projection");
  }

  for (const releaseContract of [
    "security definer",
    "set search_path=''",
    "set statement_timeout='10s'",
    "set lock_timeout='2s'",
    "v_actor uuid:=(select auth.uid())",
    "not private_verification.brinesearch_v18_owner_authority_current(v_actor)",
    "hashtextextended('brinesearch:v18:directory-snapshot',18)",
    "hashtextextended('brinesearch:v18:company-road-overlay',18)",
    "where snapshot.publication_state='current'",
    "v_directory.row_count<1 or v_directory.row_count>10000",
    "v_approved_at:=pg_catalog.clock_timestamp()",
    "v_expires_at:=v_approved_at+interval '15 minutes'",
    "'brinesearch-v18-company-road-overlay-release-v1'",
    "update private_verification.brinesearch_v18_company_road_overlay_releases set approval_state='withdrawn'",
    "insert into private_verification.brinesearch_v18_company_road_overlay_releases",
    "'approvalstate','approved'",
  ]) requireIn(nAuthorizer, releaseContract, `owner release ${releaseContract}`);
  if (nAuthorizer.indexOf("hashtextextended('brinesearch:v18:directory-snapshot',18)")
      > nAuthorizer.indexOf("hashtextextended('brinesearch:v18:company-road-overlay',18)")) {
    errors.push("owner release lock order must be directory then overlay");
  }
  const authorizerClockAt = nAuthorizer.indexOf("v_approved_at:=pg_catalog.clock_timestamp()");
  const authorizerOverlayLockAt = nAuthorizer.indexOf(
    "hashtextextended('brinesearch:v18:company-road-overlay',18)",
  );
  if (authorizerClockAt < 0 || authorizerClockAt <= authorizerOverlayLockAt
      || nAuthorizer.includes("statement_timestamp()")) {
    errors.push("owner approval lifetime must begin from wall clock after both locks");
  }
  if ((nAuthorizer.match(/insert into private_verification\.brinesearch_v18_company_road_overlay_releases/g) || []).length !== 1) {
    errors.push("owner release must issue exactly one private receipt");
  }
  if ((nAuthorizer.match(/private_verification\.brinesearch_v18_owner_authority_current\(v_actor\)/g) || []).length !== 2) {
    errors.push("owner authority must be checked before and after approval locks");
  }

  for (const routeGate of [
    "security definer",
    "set search_path=''",
    "set statement_timeout='14min'",
    "set lock_timeout='30s'",
    "select release.* into strict v_release from private_verification.brinesearch_v18_company_road_overlay_releases release",
    "release.approval_state='approved'",
    "release.directory_snapshot_id=v_directory.snapshot_id",
    "release.authority_definition_sha256=v_authority_hash",
    "release.approved_at<=pg_catalog.clock_timestamp()",
    "release.expires_at>pg_catalog.clock_timestamp()",
    "for update",
    "not private_verification.brinesearch_v18_owner_authority_current( v_release.approved_by )",
    "'brinesearch-v18-company-road-overlay-release-v1'",
    "row.coordinate_state='verified'",
    "verification.pad_id=row.pad_id and verification.gps_verified",
    "google.status='ready' and google.hold_reason is null",
    "google.manifest_version='issue97-google-v1'",
    "google.evidence->>'publication_mode'='private_dark'",
    "(google.evidence->>'no_guess')::boolean,false",
    "with projection as materialized",
    "brinesearch_v18_exact_route_projection_cached( candidate.route_prep_id,candidate.expected_occurrences )",
    "receipt.route_status='route_ready'",
    "receipt.stage='ready'",
    "receipt.held_occurrence_count=0",
    "receipt.exact_geometry_count=receipt.road_occurrence_count",
    "occurrence.resolution_status='resolved'",
    "occurrence.hold_reason is null",
    "geometry.status='resolved' and geometry.hold_reason is null",
    "identity.public_access_status='public'",
    "identity.drivable_status='drivable'",
    "mapping.mapping_status='verified'",
    "road.verification_status='verified'",
    "not coalesce(road.candidate_only,false)",
    "coalesce(road.approved_by_default,false)",
    "brinesearch_issue97_dataset_scope_current_cached",
    "brinesearch_issue97_mapping_fingerprint",
    "brinesearch_issue97_authoritative_identity_geometry_digest",
    "build.status='active'",
    "graph_cache.current",
    "brinesearch_issue97_prepare_graph_release_current_cache",
    "brinesearch_issue97_graph_build_release_current_cached",
    "projected.public_feature->'geometry'= extensions.st_asgeojson(geometry.step_geometry,9,0)::jsonb",
    "st_makeenvelope(-84,37,-74,43,4326)",
  ]) requireIn(nPublisher, routeGate, `approval gate ${routeGate}`);
  for (const finalGate of [
    "v_generated_at:=pg_catalog.clock_timestamp()",
    "v_publish_at:=pg_catalog.clock_timestamp()",
    "v_consume_at:=pg_catalog.clock_timestamp()",
    "consumed_at=v_consume_at",
    "select snapshot.* into strict v_final_directory",
    "snapshot.snapshot_id=v_directory.snapshot_id",
    "snapshot.publication_state='current'",
    "snapshot.retained_until is null",
    "v_final_directory.source_revision<>v_directory.source_revision",
    "v_final_directory.content_sha256 is distinct from v_directory.content_sha256",
    "v_final_authority_hash:= private_verification.brinesearch_v18_company_road_authority_definition_sha256()",
    "v_final_authority_hash is distinct from v_authority_hash",
    "v_release.approval_state<>'approved'",
    "v_release.directory_snapshot_id<>v_final_directory.snapshot_id",
    "v_release.authority_definition_sha256<>v_final_authority_hash",
    "v_release.approved_at>v_publish_at",
    "v_release.expires_at<=v_publish_at",
    "not private_verification.brinesearch_v18_owner_authority_current( v_release.approved_by )",
    "v_generated_at,v_generated_at,'withdrawn',null",
    "set publication_state='current',retained_until=null, published_at=v_publish_at",
    "v_consume_at:=pg_catalog.clock_timestamp()",
    "consumed_at=v_consume_at",
    "authority_definition_sha256=v_final_authority_hash",
    "approved_at<=v_consume_at",
    "expires_at>v_consume_at",
    "private_verification.brinesearch_v18_owner_authority_current(approved_by)",
  ]) requireIn(nPublisher, finalGate, `final activation gate ${finalGate}`);
  const publisherOverlayLockAt = nPublisher.indexOf(
    "hashtextextended('brinesearch:v18:company-road-overlay',18)",
  );
  const publisherStartClockAt = nPublisher.indexOf(
    "v_generated_at:=pg_catalog.clock_timestamp()",
  );
  const publisherStagingAt = nPublisher.indexOf(
    "insert into public.brinesearch_company_road_overlay_snapshots_v18",
  );
  const publisherStagingRowsAt = nPublisher.indexOf(
    "insert into public.brinesearch_company_road_overlay_rows_v18",
  );
  const publisherFinalDirectoryAt = nPublisher.indexOf(
    "select snapshot.* into strict v_final_directory",
  );
  const publisherFinalHashAt = nPublisher.indexOf(
    "v_final_authority_hash:= private_verification.brinesearch_v18_company_road_authority_definition_sha256()",
  );
  const publisherFinalClockAt = nPublisher.indexOf(
    "v_publish_at:=pg_catalog.clock_timestamp()",
  );
  const publisherActivationAt = nPublisher.indexOf(
    "set publication_state='current',retained_until=null, published_at=v_publish_at",
  );
  const publisherConsumeClockAt = nPublisher.indexOf(
    "v_consume_at:=pg_catalog.clock_timestamp()",
  );
  const publisherConsumeAt = nPublisher.indexOf(
    "set approval_state='consumed',consumed_at=v_consume_at",
  );
  if (publisherStartClockAt <= publisherOverlayLockAt
      || publisherStagingAt <= publisherStartClockAt
      || publisherStagingRowsAt <= publisherStagingAt
      || publisherFinalDirectoryAt <= publisherStagingRowsAt
      || publisherFinalHashAt <= publisherFinalDirectoryAt
      || publisherFinalClockAt <= publisherFinalHashAt
      || publisherActivationAt <= publisherFinalClockAt
      || publisherConsumeClockAt <= publisherActivationAt
      || publisherConsumeAt <= publisherConsumeClockAt) {
    errors.push("publisher wall-clock/final revalidation must immediately precede activation");
  }
  if ((nPublisher.match(/not private_verification\.brinesearch_v18_owner_authority_current\( v_release\.approved_by \)/g) || []).length !== 2) {
    errors.push("publisher must recheck owner authority both before build and at activation");
  }
  if (nPublisher.includes("brinesearch_v18_driver_pad_status")) {
    errors.push("publisher reintroduced row-by-row public driver-status RPC calls");
  }
  if ((nPublisher.match(/brinesearch_v18_exact_route_projection_cached\(/g) || []).length !== 1
      || nPublisher.includes("brinesearch_v18_exact_route_projection(")) {
    errors.push("publisher must have exactly one private cached projection call site");
  }
  const rawBoundAt = nPublisher.indexOf("if v_candidate_route_count>5000");
  const releaseGateAt = nPublisher.indexOf("select release.* into strict v_release");
  const projectionAt = nPublisher.indexOf(
    "private_verification.brinesearch_v18_exact_route_projection_cached(",
  );
  const projectionBoundAt = nPublisher.indexOf("v_prequalified_route_count>1000");
  if (releaseGateAt < 0 || rawBoundAt < 0 || projectionBoundAt < 0 || projectionAt < 0
      || releaseGateAt > rawBoundAt || rawBoundAt > projectionAt
      || projectionBoundAt > projectionAt) {
    errors.push("owner release, candidate, and projection bounds must precede projection calls");
  }
  if ((nPublisher.match(/v_prequalified_route_count>1000/g) || []).length !== 2) {
    errors.push("publisher must bound both claimed and transition-qualified projection sets");
  }
  if ((nPublisher.match(/brinesearch_issue97_prepare_scope_current_cache\('/g) || []).length !== 3
      || (nPublisher.match(/brinesearch_issue97_prepare_graph_release_current_cache\(\)/g) || []).length !== 1) {
    errors.push("publisher cache preparation must be exactly three fixed states and one graph batch");
  }
  for (const bulkCacheContract of [
    "drop table if exists pg_temp.tmp_issue97_scope_current_cache",
    "v_scope_cache_count<>v_source_scope_count",
    "from pg_temp.tmp_issue97_scope_current_cache cache except select scope.dataset_id,scope.state_code,scope.county_code",
    "select scope.dataset_id,scope.state_code,scope.county_code from public.brinesearch_road_source_dataset_counties scope",
  ]) requireIn(nPublisher, bulkCacheContract, `bulk currentness cache ${bulkCacheContract}`);
  if ((nPublisher.match(/\bexcept\b/g) || []).length !== 2) {
    errors.push("publisher must prove scope-cache equality in both directions");
  }
  const scopePrepareAt = nPublisher.indexOf("brinesearch_issue97_prepare_scope_current_cache('oh')");
  const scopeResetAt = nPublisher.indexOf("drop table if exists pg_temp.tmp_issue97_scope_current_cache");
  const scopeCoverageAt = nPublisher.indexOf("v_scope_cache_count<>v_source_scope_count");
  if (scopeResetAt < 0 || scopePrepareAt < scopeResetAt
      || scopeCoverageAt < scopePrepareAt || scopeCoverageAt > projectionAt) {
    errors.push("scope cache must reset, prepare, and prove complete before projection");
  }
  const dropTables = [...nPublisher.matchAll(/drop table if exists ([a-z_]+\.[a-z0-9_]+)/g)]
    .map((match) => match[1]);
  if (JSON.stringify(dropTables) !== JSON.stringify([
    "pg_temp.tmp_issue97_scope_current_cache",
  ])) {
    errors.push("publisher temp-cache reset scope changed");
  }
  for (const forbiddenInference of [
    "structured_route_steps",
    "name_only",
    "fuzzy_name",
    "nearest_road",
    "levenshtein",
  ]) {
    if (nPublisher.includes(forbiddenInference)) {
      errors.push(`publisher includes forbidden legacy/inference path ${forbiddenInference}`);
    }
  }

  for (const dedupeContract of [
    "select 'all','',occurrence.company_label",
    "select 'company',occurrence.company_label,occurrence.company_label",
    "extensions.st_unaryunion(extensions.st_collect(scoped.step_geometry))",
    "st_subdivide( scope.union_geometry,256 )",
    "st_intersection( occurrence.step_geometry,part.part_geometry )",
    "st_dimension(overlap.overlap_geometry)=1",
    "dedupe left overlapping public geometry",
    "partition by row.selection_kind,row.selection_key",
  ]) requireIn(nPublisher, dedupeContract, `dedupe contract ${dedupeContract}`);
  for (const publisherBound of [
    "v_directory.row_count<1 or v_directory.row_count>10000",
    "v_candidate_route_count>5000",
    "v_prequalified_route_count>1000",
    "v_expected_occurrence_count>40000",
    "v_source_scope_count>200",
    "v_graph_cache_input_count>200",
    "v_eligible_route_count<>v_prequalified_route_count",
    "v_max_selection_row_count>10000",
    "v_max_selection_point_count>250000",
    "sum(extensions.st_npoints(row.part_geometry))",
    "set approval_state='consumed',consumed_at=v_consume_at, overlay_snapshot_id=v_snapshot_id",
    "get diagnostics v_release_consumed_count=row_count",
    "v_release_consumed_count<>1",
    "'boundedprojectioncallcount',v_prequalified_route_count",
    "v_part_count>40000",
    "pg_catalog.cardinality(row.company_labels) not between 1 and 200",
    "interval '15 minutes'",
    "'retained'",
    "retained_until=v_publish_at+interval '15 minutes'",
    "set publication_state='current',retained_until=null",
  ]) requireIn(nPublisher, publisherBound, `publisher bound ${publisherBound}`);
  if ((nPublisher.match(/interval '15 minutes'/g) || []).length !== 1) {
    errors.push("publisher must grant one exact 15-minute window only to the prior current snapshot");
  }
  if (/\bexecute\b/i.test(publisher)) errors.push("publisher contains dynamic SQL execution");
  for (const source of [
    "public.pads",
    "public.public_pad_detail",
    "public.brinesearch_route_prep",
    "public.brinesearch_roads",
    "private_verification.brinesearch_route_occurrence_receipts_issue97",
  ]) {
    if (new RegExp(`(?:insert\\s+into|update|delete\\s+from|truncate)\\s+${source.replaceAll(".", "\\.")}`, "i").test(publisher)) {
      errors.push(`publisher mutates authority source ${source}`);
    }
  }
  if (/\b(?:select|perform)\s+private_verification\.brinesearch_v18_refresh_company_road_overlay_snapshot\s*\(/i.test(
    sql.replace(publisher, ""),
  )) {
    errors.push("migration automatically executes the overlay publisher");
  }
  if (/\b(?:select|perform)\s+public\.brinesearch_v18_authorize_company_road_overlay_release\s*\(/i.test(
    sql.replace(authorizer, ""),
  )) {
    errors.push("migration automatically creates an owner overlay release");
  }
  const releaseInsertsOutsideAuthorizer = sql.replace(authorizer, "")
    .match(/insert\s+into\s+private_verification\.brinesearch_v18_company_road_overlay_releases/gi) || [];
  if (releaseInsertsOutsideAuthorizer.length !== 0) {
    errors.push("migration seeds or forges a release outside owner authorization");
  }

  for (const withdrawalContract of [
    "returns trigger",
    "security definer",
    "set statement_timeout='30s'",
    "set lock_timeout='5s'",
    "hashtextextended('brinesearch:v18:directory-snapshot',18)",
    "hashtextextended('brinesearch:v18:company-road-overlay',18)",
    "where publication_state in ('current','retained')",
    "update private_verification.brinesearch_v18_company_road_overlay_releases set approval_state='withdrawn', withdrawn_at=pg_catalog.clock_timestamp() where approval_state='approved'",
    "return null",
  ]) requireIn(nWithdrawal, withdrawalContract, `withdrawal ${withdrawalContract}`);
  if (nWithdrawal.indexOf("hashtextextended('brinesearch:v18:directory-snapshot',18)")
      > nWithdrawal.indexOf("hashtextextended('brinesearch:v18:company-road-overlay',18)")) {
    errors.push("withdrawal lock order must be directory then overlay");
  }
  if (/\b(insert|delete|truncate|execute)\b/i.test(withdrawal)) {
    errors.push("invalidation function gained non-withdrawal writer behavior");
  }
  if (nWithdrawal.includes("retained_until<=")) {
    errors.push("source invalidation preserves a retained overlay until expiry");
  }
  const withdrawalUpdateTargets = [...nWithdrawal.matchAll(/update ([a-z_]+\.[a-z0-9_]+)/g)]
    .map((match) => match[1]).sort();
  const expectedWithdrawalUpdateTargets = [
    "private_verification.brinesearch_v18_company_road_overlay_releases",
    "public.brinesearch_company_road_overlay_snapshots_v18",
  ].sort();
  if (JSON.stringify(withdrawalUpdateTargets) !== JSON.stringify(expectedWithdrawalUpdateTargets)) {
    errors.push("invalidation mutation target set changed");
  }

  const triggerPattern = /create trigger brinesearch_v18_company_road_overlay_invalidate\s+after insert or update or delete or truncate\s+on\s+([a-z_]+\.[a-z0-9_]+)\s+for each statement execute function\s+private_verification\.brinesearch_v18_withdraw_company_road_overlay_on_source_change\(\);/gi;
  const actualTriggers = [...sql.matchAll(triggerPattern)].map((match) => match[1]).sort();
  if (JSON.stringify(actualTriggers) !== JSON.stringify(expectedTriggerRelations)) {
    errors.push(`exhaustive invalidation trigger set changed (${actualTriggers.length})`);
  }

  for (const pageContract of [
    "volatile",
    "security definer",
    "set search_path=''",
    "set statement_timeout='2500ms'",
    "set lock_timeout='500ms'",
    "p_limit is null or p_limit<1 or p_limit>500",
    "p_company<>pg_catalog.btrim(p_company)",
    "not p_company=any(v_available_companies)",
    "row.selection_kind=v_selection_kind",
    "row.selection_key=v_selection_key",
    "row.ordinal>p_after_ordinal",
    "p_after_ordinal>v_selection_count",
    "snapshot.publication_state='retained' and snapshot.retained_until>pg_catalog.statement_timestamp()",
    "authority_definition_sha256 is distinct from",
    "v_available_companies:=v_snapshot.available_companies",
    "'availablecompanies',pg_catalog.to_jsonb(v_available_companies)",
    "'directorysnapshotid',v_snapshot.directory_snapshot_id",
    "'companylabel',case when page.selection_kind='company' then page.selection_key else null end",
    "'displaynames',pg_catalog.to_jsonb(page.display_names)",
    "'verifieddesignations',pg_catalog.to_jsonb(page.verified_designations)",
    "exception when others then return pg_catalog.jsonb_build_object( 'schemaversion',1,'error','overlay_unavailable' )",
  ]) requireIn(nPage, pageContract, `page contract ${pageContract}`);
  if (nPage.includes("array_agg(distinct row.selection_key")) {
    errors.push("page recomputes company options from overlay rows");
  }
  if (/\boffset\b/i.test(page)) errors.push("overlay page uses OFFSET paging");
  for (const privateOutputKey of [
    "'padid'",
    "'routeprepid'",
    "'roadid'",
    "'identityid'",
    "'graphbuildid'",
    "'holdreason'",
    "'receiptdigest'",
    "'dependencydigest'",
    "'graphdigest'",
    "'manifestdigest'",
    "'contentsha256'",
    "'authoritydefinitionsha256'",
  ]) {
    if (nPage.includes(privateOutputKey)) errors.push(`page emits private key ${privateOutputKey}`);
  }

  for (const testContract of [
    "begin;",
    "set local statement_timeout='3min'",
    "set local lock_timeout='5s'",
    "rollback;",
    "relrowsecurity and relation.relforcerowsecurity",
    "has_table_privilege",
    "brinesearch_v18_company_road_overlay_releases",
    "brinesearch_v18_authorize_company_road_overlay_release",
    "brinesearch_v18_exact_route_projection_cached",
    "'anon', 'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)', 'execute'",
    "'authenticated', 'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)', 'execute'",
    "'service_role', 'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)', 'execute'",
    "v_projection not ilike '%brinesearch_issue97_dataset_scope_current(%'",
    "v_cached_projection not ilike '%brinesearch_issue97_dataset_scope_current_cached(%'",
    "v_driver not ilike '%brinesearch_v18_exact_route_projection(%'",
    "v_publisher not ilike '%droptableifexistspg_temp.tmp_issue97_scope_current_cache%'",
    "v_publisher not ilike '%v_max_selection_row_count>10000%'",
    "v_publisher not ilike '%v_max_selection_point_count>250000%'",
    "v_publish_at:=pg_catalog.clock_timestamp()",
    "v_approved_at:=pg_catalog.clock_timestamp()",
    "ordinal<=10000",
    "pg_get_constraintdef",
    "pg_get_viewdef",
    "pg_get_triggerdef",
    "pg_get_functiondef",
    "brinesearch_v18_company_road_authority_definition_sha256()'::pg_catalog.regprocedure and procedure.provolatile='v'",
    "brinesearch_v18_owner_authority_current",
    "brinesearch_v18_owner_authority_current(uuid)'::pg_catalog.regprocedure and procedure.provolatile='v'",
    "frompublic.editor_accounts",
    "joinauth.users",
    "procedure.proconfig",
    "statement_timeout=%",
    "lock_timeout=%",
    "authority digest ignored publisher definition mutation",
    "authority digest did not restore deterministically",
    "where approval_state='approved'",
    "historical release proof was not retained",
    "v18 company-road public/bulk currentness separation changed",
    "migration installed an unauthorized release",
    "v_trigger_relations is distinct from v_expected_relations",
    "proc.proname= 'brinesearch_v18_withdraw_company_road_overlay_on_source_change'",
    "(trigger.tgtype&2)=0",
    "(trigger.tgtype&16)=16",
    "(trigger.tgtype&64)=0",
    "v_withdraw,'brinesearch:v18:directory-snapshot'",
    "brinesearch_v18_company_road_geometry_is_safe",
    "set local role anon",
    "'alpha energy'",
    "'missing energy'",
    "'invalid_cursor'",
    "'invalid_limit'",
    "'snapshot_expired'",
    "ordinary retained snapshot was not readable",
    "'{snapshot,directorysnapshotid}'",
    "(routeprepid|roadid|identityid|graphbuildid|holdreason|receiptdigest|dependencydigest|graphdigest|manifestdigest|padid)",
    "where false",
    "source mutation did not withdraw current and retained",
    "source mutation did not revoke pending release",
    "'overlay_unavailable'",
  ]) requireIn(nTest, testContract, `SQL test ${testContract}`);
  if ((nTest.match(/\(routeprepid\|roadid\|identityid\|graphbuildid\|holdreason\|receiptdigest\|dependencydigest\|graphdigest\|manifestdigest\|padid\)/g) || []).length !== 3) {
    errors.push("SQL test must scan All, company, and retained responses for private identifiers");
  }

  return errors;
}

const errors = audit(migration, sqlTest);
if (errors.length) {
  console.error("V18 public company-road overlay audit failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const mutations = [
  ["PL/pgSQL terminal semicolon", "return false;\nend;", "return false;\nend"],
  ["schema-qualified COALESCE special syntax", "coalesce(pg_catalog.cardinality(p_values),0)", "pg_catalog.coalesce(pg_catalog.cardinality(p_values),0)"],
  ["private ready", "google.status='ready' and google.hold_reason is null", "google.status<>'deleted'"],
  ["active graph", "and graph_cache.current", "and true"],
  ["cached canonical projection", "private_verification.brinesearch_v18_exact_route_projection_cached(\n        candidate.route_prep_id,candidate.expected_occurrences\n      )", "null::jsonb"],
  ["cached clone source cardinality", "or v_old_scope_count<>1 or v_new_scope_count<>0 then", "or v_old_scope_count<>2 or v_new_scope_count<>0 then"],
  ["cached clone replacement", "v_old_scope,v_new_scope\n  );", "v_old_scope,v_old_scope\n  );"],
  ["private cached projection revoke", "private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)\nfrom public,anon,authenticated,service_role", "private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)\nto public,anon,authenticated,service_role"],
  ["raw candidate bound", "v_candidate_route_count>5000", "v_candidate_route_count>5001"],
  ["projection call bound", "v_prequalified_route_count>1000", "v_prequalified_route_count>1001"],
  ["occurrence work bound", "v_expected_occurrence_count>40000", "v_expected_occurrence_count>40001"],
  ["scope cache bound", "v_source_scope_count>200", "v_source_scope_count>201"],
  ["scope cache caller reset", "drop table if exists pg_temp.tmp_issue97_scope_current_cache", "select 1"],
  ["scope cache count equality", "v_scope_cache_count<>v_source_scope_count", "v_scope_cache_count>v_source_scope_count"],
  ["scope cache set equality", "       except\n       select cache.dataset_id", "       union\n       select cache.dataset_id"],
  ["graph cache bound", "v_graph_cache_input_count>200", "v_graph_cache_input_count>201"],
  ["projection completeness", "v_eligible_route_count<>v_prequalified_route_count", "v_eligible_route_count>v_prequalified_route_count"],
  ["owner authorizer", "not private_verification.brinesearch_v18_owner_authority_current(v_actor)", "v_actor is null"],
  ["fresh owner helper", "returns boolean\nlanguage sql\nvolatile\nsecurity definer", "returns boolean\nlanguage sql\nstable\nsecurity definer"],
  ["owner helper private ACL", "private_verification.brinesearch_v18_owner_authority_current(uuid)\nfrom public,anon,authenticated,service_role", "private_verification.brinesearch_v18_owner_authority_current(uuid)\nfrom authenticated,service_role"],
  ["authorizer wall clock", "v_approved_at:=pg_catalog.clock_timestamp()", "v_approved_at:=pg_catalog.statement_timestamp()"],
  ["authorizer expiry derivation", "v_expires_at:=v_approved_at+interval '15 minutes'", "v_expires_at:=pg_catalog.statement_timestamp()+interval '15 minutes'"],
  ["authorizer statement timeout", "set statement_timeout='10s'", "set statement_timeout='0'"],
  ["release directory binding", "release.directory_snapshot_id=v_directory.snapshot_id", "release.directory_snapshot_id is not null"],
  ["release definition binding", "release.authority_definition_sha256=v_authority_hash", "release.authority_definition_sha256 is not null"],
  ["release expiry gate", "release.expires_at>pg_catalog.clock_timestamp()", "release.expires_at is not null"],
  ["release owner recheck", "not private_verification.brinesearch_v18_owner_authority_current(\n       v_release.approved_by\n     )", "false"],
  ["final publish wall clock", "v_publish_at:=pg_catalog.clock_timestamp()", "v_publish_at:=v_generated_at"],
  ["public build staging", "v_generated_at,v_generated_at,'withdrawn',null", "v_generated_at,v_generated_at,'retained',v_generated_at+interval '15 minutes'"],
  ["final exact directory state", "and snapshot.publication_state='current'\n    and snapshot.retained_until is null;", "and snapshot.publication_state<>'withdrawn';"],
  ["final directory content binding", "v_final_directory.content_sha256 is distinct from\n       v_directory.content_sha256", "false"],
  ["final authority recomputation", "v_final_authority_hash:=\n    private_verification.brinesearch_v18_company_road_authority_definition_sha256();", "v_final_authority_hash:=v_authority_hash;"],
  ["final authority equality", "v_final_authority_hash is distinct from v_authority_hash", "false"],
  ["final exact release directory", "v_release.directory_snapshot_id<>v_final_directory.snapshot_id", "false"],
  ["final release expiry", "v_release.expires_at<=v_publish_at", "false"],
  ["final owner recheck", "or not private_verification.brinesearch_v18_owner_authority_current(\n       v_release.approved_by\n     ) then\n    raise exception 'V18 company-road owner release expired or changed during build';", "or false then\n    raise exception 'V18 company-road owner release expired or changed during build';"],
  ["final consumption wall clock", "v_consume_at:=pg_catalog.clock_timestamp()", "v_consume_at:=v_publish_at"],
  ["final consumption time", "consumed_at=v_consume_at", "consumed_at=v_generated_at"],
  ["final consumption expiry", "and expires_at>v_consume_at", "and expires_at is not null"],
  ["final consumption owner", "and private_verification.brinesearch_v18_owner_authority_current(approved_by);", ";"],
  ["release one-shot consume", "v_release_consumed_count<>1", "v_release_consumed_count<0"],
  ["release maximum lifetime", "expires_at<=approved_at+interval '15 minutes'", "expires_at<=approved_at+interval '15 days'"],
  ["release source revocation", "where approval_state='approved';\n  return null;", "where false;\n  return null;"],
  ["explicit approval", "coalesce(road.approved_by_default,false)", "true"],
  ["candidate exclusion", "not coalesce(road.candidate_only,false)", "true"],
  ["public access", "identity.public_access_status='public'", "identity.public_access_status<>'held'"],
  ["drivable", "identity.drivable_status='drivable'", "identity.drivable_status<>'held'"],
  ["mapping", "mapping.mapping_status='verified'", "mapping.mapping_status<>'rejected'"],
  ["service area", "extensions.st_makeenvelope(-84,37,-74,43,4326)", "extensions.st_makeenvelope(-180,-90,180,90,4326)"],
  ["dedupe union", "extensions.st_unaryunion(extensions.st_collect(scoped.step_geometry))", "extensions.st_collect(scoped.step_geometry)"],
  ["all scope", "select 'all','',occurrence.company_label", "select 'company','',occurrence.company_label"],
  ["selection row bound", "v_max_selection_row_count>10000", "v_max_selection_row_count>10001"],
  ["selection geometry-point bound", "v_max_selection_point_count>250000", "v_max_selection_point_count>250001"],
  ["stored row ordinal bound", "check(ordinal>=1 and ordinal<=10000)", "check(ordinal>=1 and ordinal<=40000)"],
  ["publisher statement timeout", "set statement_timeout='14min'", "set statement_timeout='0'"],
  ["retention", "retained_until=v_publish_at+interval '15 minutes'", "retained_until=v_publish_at+interval '15 days'"],
  ["page bound", "p_limit is null or p_limit<1 or p_limit>500", "p_limit is null or p_limit<1 or p_limit>501"],
  ["high cursor", "p_after_ordinal>v_selection_count", "false"],
  ["exact company", "not p_company=any(v_available_companies)", "not lower(p_company)=any(v_available_companies)"],
  ["directory binding", "'directorySnapshotId',v_snapshot.directory_snapshot_id", "'directorySnapshotId',null"],
  ["stored company options", "v_available_companies:=v_snapshot.available_companies", "v_available_companies:='{}'::text[]"],
  ["definition binding", "v_snapshot.authority_definition_sha256 is distinct from", "null is distinct from"],
  ["authority self binding", "('private_verification.brinesearch_v18_company_road_authority_definition_sha256()'),", "('private_verification.brinesearch_v18_company_road_authority_definition_sha256_removed()'),"],
  ["authority fresh owner binding", "('private_verification.brinesearch_v18_owner_authority_current(uuid)'),\n      ('private_verification.brinesearch_v18_company_road_authority_definition_sha256()'),", "('private_verification.brinesearch_v18_owner_authority_current_removed(uuid)'),\n      ('private_verification.brinesearch_v18_company_road_authority_definition_sha256()'),"],
  ["authority auth-users relation", "      ('auth.users'),", "      ('auth.users_removed'),"],
  ["authority owner-account relation", "      ('public.editor_accounts'),", "      ('public.editor_accounts_removed'),"],
  ["fresh authority snapshot", "canonical allow-list is itself an authority change.\ncreate or replace function\n  private_verification.brinesearch_v18_company_road_authority_definition_sha256()\nreturns text\nlanguage sql\nvolatile", "canonical allow-list is itself an authority change.\ncreate or replace function\n  private_verification.brinesearch_v18_company_road_authority_definition_sha256()\nreturns text\nlanguage sql\nstable"],
  ["authority authorizer binding", "('public.brinesearch_v18_authorize_company_road_overlay_release()'),", "('public.brinesearch_v18_authorize_company_road_overlay_release_removed()'),"],
  ["authority publisher binding", "('private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()'),", "('private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot_removed()'),"],
  ["authority public page binding", "('public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer)'),", "('public.brinesearch_v18_company_road_overlay_page_removed(uuid,text,integer,integer)'),"],
  ["authority view definitions", "pg_catalog.pg_get_viewdef(authority.signature::pg_catalog.regclass,true)", "authority.signature::text"],
  ["authority constraint definitions", "pg_catalog.pg_get_constraintdef(constraint_row.oid,true)", "constraint_row.conname"],
  ["authority policy definitions", "from pg_catalog.pg_policy policy", "from pg_catalog.pg_policy_missing policy"],
  ["authority trigger definitions", "pg_catalog.pg_get_triggerdef(trigger_row.oid,true)", "trigger_row.tgname"],
  ["RLS", "force row level security", "enable row level security"],
  ["source invalidation", "on public.brinesearch_roads for each statement", "on public.brinesearch_roads_missing for each statement"],
  ["retained source invalidation", "where publication_state in ('current','retained');", "where publication_state='current';"],
  ["page statement timeout", "set statement_timeout='2500ms'", "set statement_timeout='0'"],
  ["fresh page authority check", "returns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer\nset search_path=''\nset statement_timeout='2500ms'", "returns jsonb\nlanguage plpgsql\nstable\nsecurity definer\nset search_path=''\nset statement_timeout='2500ms'"],
  ["automatic owner release", "-- Deliberately no automatic authorization or refresh.", "select public.brinesearch_v18_authorize_company_road_overlay_release();\n-- Deliberately no automatic authorization or refresh."],
  ["private output", "'geometry',page.geometry", "'roadId',page.selection_key,'geometry',page.geometry"],
];

for (const [label, before, after] of mutations) {
  if (!migration.includes(before)) {
    console.error(`Mutation precondition missing: ${label}`);
    process.exit(1);
  }
  const mutated = migration.replace(before, after);
  if (audit(mutated, sqlTest).length === 0) {
    console.error(`Mutation escaped static audit: ${label}`);
    process.exit(1);
  }
}

const testMutations = [
  ["SQL-test PL/pgSQL terminal semicolon", "end;\n$v18_company_road_schema_contract$;", "end\n$v18_company_road_schema_contract$;"],
  ["anonymous role", "set local role anon;", "set local role service_role;"],
  ["test statement timeout", "set local statement_timeout='3min';", "set local statement_timeout='0';"],
  ["test lock timeout", "set local lock_timeout='5s';", "set local lock_timeout='0';"],
  ["private leak assertion", "(routePrepId|roadId|identityId|graphBuildId|holdReason|receiptDigest|dependencyDigest|graphDigest|manifestDigest|padId)", "(safeOnly)"],
  ["cached clone privilege test", "'service_role',\n       'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)'", "'service_role',\n       'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'"],
  ["public bulk separation test", "V18 company-road public/bulk currentness separation changed", "V18 separation omitted"],
  ["default-off release test", "V18 company-road migration installed an unauthorized release", "V18 release test omitted"],
  ["historical release allowance", "where approval_state='approved'\n  ) then", "where true\n  ) then"],
  ["historical release proof", "V18 historical release proof was not retained", "V18 historical release proof omitted"],
  ["authority mutation proof", "V18 authority digest ignored publisher definition mutation", "V18 authority mutation proof omitted"],
  ["retained read proof", "V18 ordinary retained snapshot was not readable", "V18 retained read proof omitted"],
  ["selection point-bound proof", "v_publisher not ilike '%v_max_selection_point_count>250000%'", "v_publisher not ilike '%v_max_selection_point_count>250001%'"],
  ["timeout catalog proof", "statement_timeout=%", "statement_timeout_missing=%"],
  ["invalidation", "where false;", "where snapshot_id is null;"],
  ["retained invalidation proof", "source mutation did not withdraw current and retained", "source mutation did not withdraw current"],
  ["release invalidation test", "source mutation did not revoke pending release", "release invalidation test omitted"],
  ["rollback", "rollback;", "commit;"],
];
for (const [label, before, after] of testMutations) {
  if (!sqlTest.includes(before)) {
    console.error(`SQL-test mutation precondition missing: ${label}`);
    process.exit(1);
  }
  if (audit(migration, sqlTest.replace(before, after)).length === 0) {
    console.error(`SQL-test mutation escaped static audit: ${label}`);
    process.exit(1);
  }
}

console.log(
  `V18 public company-road overlay contract audit passed (${mutations.length + testMutations.length} negative mutations).`,
);
