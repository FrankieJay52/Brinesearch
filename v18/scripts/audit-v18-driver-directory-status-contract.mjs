import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260823002719_v18_driver_directory_status_contract.sql",
);
const sqlTestPath = path.join(
  root,
  "supabase/tests/v18_driver_directory_status_contract.sql",
);
const normalizeNewlines = (value) => value.replace(/\r\n?/g, "\n");
const migration = normalizeNewlines(fs.readFileSync(migrationPath, "utf8"));
const sqlTest = normalizeNewlines(fs.readFileSync(sqlTestPath, "utf8"));

function normalized(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function section(sql, startMarker, endMarker) {
  const lower = sql.toLowerCase();
  const start = lower.indexOf(startMarker.toLowerCase());
  const end = lower.indexOf(endMarker.toLowerCase(), start + startMarker.length);
  if (start < 0 || end < 0) return "";
  return sql.slice(start, end);
}

function unterminatedPlpgsqlBlocks(sql) {
  return [...sql.matchAll(/^end\r?\n\$(?:[A-Za-z0-9_]+)?\$;/gm)];
}

function audit(sql) {
  const errors = [];
  const compact = normalized(sql);
  if (unterminatedPlpgsqlBlocks(sql).length) {
    errors.push("migration contains a PL/pgSQL block without the required END semicolon");
  }
  if (unterminatedPlpgsqlBlocks(sqlTest).length) {
    errors.push("SQL contract test contains a PL/pgSQL block without the required END semicolon");
  }
  const invalidQualifiedSpecial = /pg_catalog\.(?:coalesce|nullif|greatest|least|extract|jsonb_object_length)\s*\(/i;
  if (invalidQualifiedSpecial.test(sql) || invalidQualifiedSpecial.test(sqlTest)) {
    errors.push("PostgreSQL special syntax is incorrectly schema-qualified");
  }
  const safeText = section(
    sql,
    "create or replace function private_verification.brinesearch_v18_safe_directory_text",
    "create or replace function private_verification.brinesearch_v18_safe_directory_array",
  );
  const safeArray = section(
    sql,
    "create or replace function private_verification.brinesearch_v18_safe_directory_array",
    "revoke all on function\n  private_verification.brinesearch_v18_safe_directory_text",
  );
  const publisher = section(
    sql,
    "create or replace function private_verification.brinesearch_v18_refresh_directory_snapshot",
    "revoke all on function private_verification.brinesearch_v18_refresh_directory_snapshot",
  );
  const withdraw = section(
    sql,
    "create or replace function\n  private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change",
    "revoke all on function\n  private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change",
  );
  const page = section(
    sql,
    "create or replace function public.brinesearch_v18_directory_page",
    "revoke all on function public.brinesearch_v18_directory_page",
  );
  const rightContinuation = section(
    sql,
    "create or replace function\n  private_verification.brinesearch_v18_valid_right_continuation",
    "revoke all on function\n  private_verification.brinesearch_v18_valid_right_continuation",
  );
  const projection = section(
    sql,
    "create or replace function private_verification.brinesearch_v18_exact_route_projection",
    "revoke all on function\n  private_verification.brinesearch_v18_exact_route_projection",
  );
  const googleClassifier = section(
    sql,
    "create or replace function\n  private_verification.brinesearch_v18_public_google_status",
    "revoke all on function\n  private_verification.brinesearch_v18_public_google_status",
  );
  const driver = section(
    sql,
    "create or replace function public.brinesearch_v18_driver_pad_status",
    "revoke all on function public.brinesearch_v18_driver_pad_status",
  );
  const owner = section(
    sql,
    "create or replace function public.brinesearch_v18_owner_pad_status",
    "revoke all on function public.brinesearch_v18_owner_pad_status",
  );
  const nPublisher = normalized(publisher);
  const nSafeText = normalized(safeText);
  const nSafeArray = normalized(safeArray);
  const nWithdraw = normalized(withdraw);
  const nPage = normalized(page);
  const nRightContinuation = normalized(rightContinuation);
  const nProjection = normalized(projection);
  const nGoogleClassifier = normalized(googleClassifier);
  const nDriver = normalized(driver);
  const nOwner = normalized(owner);

  const requireGlobal = (needle, label = needle) => {
    if (!compact.includes(normalized(needle))) errors.push(`missing ${label}`);
  };
  const requireIn = (body, needle, label = needle) => {
    if (!body.includes(normalized(needle))) errors.push(`missing ${label}`);
  };

  if (!safeText || !safeArray || !publisher || !withdraw || !page || !rightContinuation || !projection || !googleClassifier || !driver || !owner) {
    errors.push("one or more V18 contract function sections are missing");
    return errors;
  }

  requireGlobal("create table public.brinesearch_directory_snapshots_v18");
  requireGlobal("create table public.brinesearch_directory_snapshot_rows_v18");
  requireGlobal(
    "constraint brinesearch_directory_snapshot_rows_v18_public_shape_check",
    "enforced public row shape constraint",
  );
  requireGlobal("retained_until timestamptz", "retained snapshot expiry column");
  requireGlobal(
    "constraint brinesearch_directory_snapshots_v18_retention_check",
    "retention state constraint",
  );
  requireGlobal(
    "create index brinesearch_directory_snapshots_v18_retention_idx",
    "retention expiry index",
  );
  requireGlobal(
    "create index brinesearch_route_prep_v18_active_pad_group_idx on public.brinesearch_route_prep(pad_id,route_group,id) where active",
    "bounded active pad/group route lookup index",
  );
  requireGlobal(
    "create unique index brinesearch_directory_snapshot_rows_v18_legacy_identity_idx on public.brinesearch_directory_snapshot_rows_v18(snapshot_id,legacy_id) where legacy_id is not null",
    "per-snapshot legacy identity uniqueness index",
  );
  if ((compact.match(/force row level security/g) || []).length !== 2) {
    errors.push("expected FORCE RLS on both public snapshot tables");
  }
  requireGlobal(
    "with (security_invoker=true,security_barrier=true)",
    "security-invoker/barrier current view",
  );
  if ((compact.match(/retained_until>pg_catalog\.statement_timestamp\(\)/g) || []).length < 3) {
    errors.push("retained expiry is not enforced by both RLS policies and paging");
  }
  requireGlobal(
    "grant select on public.brinesearch_directory_snapshots_v18 to anon,authenticated,service_role",
    "snapshot SELECT-only grant",
  );
  requireGlobal(
    "grant select on public.brinesearch_directory_snapshot_rows_v18 to anon,authenticated,service_role",
    "snapshot-row SELECT-only grant",
  );
  requireGlobal(
    "grant execute on function public.brinesearch_v18_owner_pad_status(uuid) to authenticated",
    "authenticated-only owner RPC grant",
  );
  requireGlobal(
    "grant usage on schema private_verification to service_role",
    "least-privilege service schema usage",
  );
  requireGlobal(
    "grant execute on function private_verification.brinesearch_v18_refresh_directory_snapshot() to service_role",
    "service-only publisher grant",
  );
  requireGlobal(
    "revoke all on function private_verification.brinesearch_v18_exact_route_projection(uuid,integer) from public,anon,authenticated,service_role",
    "non-callable exact projection helper",
  );
  requireGlobal(
    "revoke all on function private_verification.brinesearch_v18_public_google_status( boolean,boolean,text,text ) from public,anon,authenticated,service_role",
    "non-callable sanitized public Google classifier",
  );
  requireGlobal(
    "revoke all on function private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change() from public,anon,authenticated,service_role",
    "non-callable invalidation trigger function",
  );
  requireGlobal(
    "revoke all on function private_verification.brinesearch_v18_safe_directory_text(text,text) from public,anon,authenticated,service_role",
    "non-callable text sanitizer",
  );
  requireGlobal(
    "revoke all on function private_verification.brinesearch_v18_safe_directory_array(text[],text,integer) from public,anon,authenticated,service_role",
    "non-callable array sanitizer",
  );
  requireGlobal(
    "revoke all on function private_verification.brinesearch_v18_valid_right_continuation( text,text,text,text,integer,jsonb,text,text,uuid ) from public,anon,authenticated,service_role",
    "non-callable right-continuation validator",
  );
  requireGlobal("select private_verification.brinesearch_v18_refresh_directory_snapshot()");

  const triggerPattern = /create trigger brinesearch_v18_directory_snapshot_invalidate\s+after insert or update or delete or truncate\s+on public\.([a-z0-9_]+)\s+for each statement execute function\s+private_verification\.brinesearch_v18_withdraw_directory_snapshot_on_source_change\(\);/gi;
  const triggerRelations = [...sql.matchAll(triggerPattern)].map((match) => match[1]).sort();
  const expectedTriggerRelations = [
    "brinesearch_driver_route_reference",
    "pad_verification_status",
    "pads",
    "public_pad_detail",
  ];
  if (
    triggerRelations.length !== 4 ||
    JSON.stringify(triggerRelations) !== JSON.stringify(expectedTriggerRelations)
  ) {
    errors.push("source invalidation must be one AFTER statement trigger on each exact input/upstream relation");
  }

  for (const [name, body] of [
    ["safe text", nSafeText],
    ["safe array", nSafeArray],
    ["publisher", nPublisher],
    ["withdrawal", nWithdraw],
    ["projection", nProjection],
    ["Google classifier", nGoogleClassifier],
    ["driver", nDriver],
    ["owner", nOwner],
  ]) {
    if (!body.includes("set search_path=''")) {
      errors.push(`${name} function does not lock search_path`);
    }
  }

  for (const safeTextContract of [
    "immutable",
    "parallel safe",
    "security invoker",
    "v_value~'[[:cntrl:]]'",
    "char_length(v_value)>64",
    "char_length(v_value)>128",
    "char_length(v_value)>256",
    "char_length(v_value)>512",
    "when 'county','township'",
    "when 'alias','well_name','property_number','safe_road_term'",
    "correct(ed)?|note|updated?|verified",
    "approximately|continue|head|left|miles?|onto|outside|right|road|turn",
    "when 'api'",
    "else return null",
  ]) {
    requireIn(nSafeText, safeTextContract, `safe text policy ${safeTextContract}`);
  }
  for (const safeArrayContract of [
    "immutable",
    "parallel safe",
    "security invoker",
    "p_max_items<1 or p_max_items>32",
    "cardinality(p_values),0)>p_max_items",
    "array_agg(distinct sanitized.value order by sanitized.value)",
    "brinesearch_v18_safe_directory_text( raw.value,p_field )",
  ]) {
    requireIn(nSafeArray, safeArrayContract, `safe array policy ${safeArrayContract}`);
  }

  for (const directInput of [
    "from public.public_pad_detail detail",
    "left join public.pad_verification_status verification",
    "left join public.brinesearch_driver_route_reference route_reference",
  ]) {
    requireIn(nPublisher, directInput, `publisher direct input ${directInput}`);
  }
  for (const publisherContract of [
    "security definer",
    "set statement_timeout='5min'",
    "set lock_timeout='15s'",
    "pg_advisory_xact_lock",
    "hashtextextended('brinesearch:v18:directory-snapshot',18)",
    "ordered.gps_verified",
    "ordered.latitude between 37 and 43",
    "ordered.longitude between -84 and -74",
    "not (ordered.latitude=0 and ordered.longitude=0)",
    "extensions.digest",
    "'sha256'",
    "'retained',v_generated_at+interval '15 minutes'",
    "set publication_state='withdrawn',retained_until=null",
    "set publication_state='retained', retained_until=v_generated_at+interval '15 minutes'",
    "set publication_state='current',retained_until=null",
    "brinesearch_v18_safe_directory_text( ordered.county,'county' )",
    "brinesearch_v18_safe_directory_text( ordered.township,'township' )",
    "brinesearch_v18_safe_directory_text( ordered.structured_road_sequence,'structured_road_sequence' )",
    "brinesearch_v18_safe_directory_array",
    "regexp_split_to_table( ordered.well_name,e'\\\\s*\\\\|\\\\s*' )",
    "regexp_split_to_table( ordered.api,e'\\\\s*\\\\|\\\\s*' )",
    "regexp_split_to_table( ordered.property_number,e'\\\\s*\\\\|\\\\s*' )",
    "unsafe required pad name",
    "where row.legacy_id is not null group by row.legacy_id having count(*)>1",
    "ambiguous legacy identity",
  ]) {
    requireIn(nPublisher, publisherContract, `publisher contract ${publisherContract}`);
  }
  if ((nPublisher.match(/ordered\.gps_verified/g) || []).length < 3) {
    errors.push("all snapshot coordinate outputs must require verified GPS");
  }
  if ((nPublisher.match(/not \(ordered\.latitude=0 and ordered\.longitude=0\)/g) || []).length < 3) {
    errors.push("all snapshot coordinate outputs must reject 0,0");
  }
  if ((nPublisher.match(/regexp_split_to_table\(/g) || []).length !== 6) {
    errors.push("publisher must split exactly three primary and three well-entry multi-value fields");
  }
  if (/\bexecute\b/i.test(publisher)) errors.push("snapshot publisher contains dynamic execution");
  if (/\b(delete|truncate)\s+from\s+public\.(public_pad_detail|pads|pad_verification_status|brinesearch_driver_route_reference)\b/i.test(publisher)) {
    errors.push("snapshot publisher mutates a source relation");
  }

  for (const withdrawContract of [
    "returns trigger",
    "security definer",
    "set statement_timeout='30s'",
    "set lock_timeout='5s'",
    "pg_advisory_xact_lock",
    "hashtextextended('brinesearch:v18:directory-snapshot',18)",
    "set publication_state='withdrawn',retained_until=null",
    "where publication_state in ('current','retained')",
    "return null",
  ]) {
    requireIn(nWithdraw, withdrawContract, `withdrawal contract ${withdrawContract}`);
  }
  if ((nWithdraw.match(/update public\.brinesearch_directory_snapshots_v18/g) || []).length !== 1) {
    errors.push("withdrawal function must atomically withdraw current and retained snapshots");
  }
  if (nWithdraw.includes("retained_until<=")) {
    errors.push("source invalidation preserves a retained snapshot until expiry");
  }
  if (/brinesearch_v18_refresh_directory_snapshot|\bexecute\b|\binsert\b|\bdelete\b|\btruncate\b/i.test(withdraw)) {
    errors.push("withdrawal function gained refresh, dynamic SQL, or source-writer behavior");
  }
  for (const sourceRelation of [
    "public.pads",
    "public.public_pad_detail",
    "public.pad_verification_status",
    "public.brinesearch_driver_route_reference",
  ]) {
    if (nWithdraw.includes(sourceRelation)) {
      errors.push(`withdrawal function directly references mutable source ${sourceRelation}`);
    }
  }

  for (const pageContract of [
    "stable",
    "security invoker",
    "set statement_timeout='2500ms'",
    "set lock_timeout='500ms'",
    "p_limit is null or p_limit<1 or p_limit>1000",
    "row.snapshot_id=v_snapshot.snapshot_id",
    "row.ordinal>p_after_ordinal",
    "snapshot.publication_state='current'",
    "snapshot.publication_state='retained' and snapshot.retained_until>pg_catalog.statement_timestamp()",
    "'snapshot_expired'",
    "'retaineduntil',v_snapshot.retained_until",
  ]) {
    requireIn(nPage, pageContract, `page contract ${pageContract}`);
  }
  if (/\boffset\b/i.test(page)) errors.push("directory paging reintroduced OFFSET");

  for (const rightContinuationContract of [
    "immutable",
    "security invoker",
    "return coalesce",
    "p_status='resolved'",
    "p_hold_reason is null",
    "p_junction_type='shared_segment'",
    "p_anchor_role in ('shared_start','shared_end')",
    "p_candidate_count=2",
    "p_evidence->>'shared_segment_sequence'='a->b'",
    "p_evidence->>'right_context_kind' in ('pad_gps','next_resolved_transition')",
    "pg_catalog.jsonb_typeof(p_evidence->'right_context_fraction')='number'",
    "pg_catalog.jsonb_typeof(p_evidence->'shared_start_fraction')='number'",
    "pg_catalog.jsonb_typeof(p_evidence->'shared_end_fraction')='number'",
    "p_evidence->>'right_context_outside_shared_interval'='true'",
    "p_evidence->>'selection_uses_exact_right_identity'='true'",
    "p_evidence->>'selection_uses_route_sequence'='true'",
    "p_evidence->>'selection_uses_name_similarity'='false'",
    "p_evidence->>'selection_uses_nearest_road'='false'",
    "p_evidence->>'selection_uses_route_number_alone'='false'",
    "p_receipt_digest=pg_catalog.md5",
    "),false )",
  ]) {
    requireIn(nRightContinuation, rightContinuationContract, `right-continuation fail-closed contract ${rightContinuationContract}`);
  }

  for (const projectionSource of [
    "public.brinesearch_route_prep route",
    "join public.pads pad",
    "public.pad_verification_status verification",
    "brinesearch_route_reconciliation_receipts_issue97",
    "brinesearch_route_occurrence_receipts_issue97",
    "brinesearch_route_occurrence_geometry_receipts_issue97",
    "brinesearch_route_transition_receipts_issue97",
    "public.brinesearch_route_prep_steps",
    "public.brinesearch_authoritative_road_identities",
    "public.brinesearch_road_identity_mappings",
    "public.brinesearch_road_junctions",
    "public.brinesearch_road_junction_anchors",
    "public.brinesearch_road_graph_builds",
  ]) {
    requireIn(nProjection, projectionSource, `exact projection authority ${projectionSource}`);
  }
  for (const projectionContract of [
    "stable",
    "security invoker",
    "not v_route.gps_verified",
    "p_expected_occurrence_count<2",
    "p_expected_occurrence_count>256",
    "v_route.pad_latitude not between 37 and 43",
    "v_route.pad_longitude not between -84 and -74",
    "(v_route.pad_latitude=0 and v_route.pad_longitude=0)",
    "v_receipt.route_status<>'route_ready'",
    "v_receipt.stage<>'ready'",
    "v_receipt.source_sequence_hash is distinct from v_route.source_sequence_hash",
    "v_receipt.exact_geometry_count<>p_expected_occurrence_count",
    "v_receipt.dependency_digest is distinct from v_expected_dependency",
    "v_receipt.receipt_digest is distinct from pg_catalog.md5",
    "v_route.structured_route_revision::text",
    "brinesearch_issue97_transition_google_dark_current",
    "occurrence.input_digest is distinct from pg_catalog.md5",
    "source_step.raw_text is distinct from occurrence.raw_text",
    "source_step.normalized_text is distinct from occurrence.normalized_text",
    "source_step.step_kind is distinct from occurrence.step_kind",
    "source_step.road_id is distinct from occurrence.input_road_id",
    "brinesearch_issue97_mapping_fingerprint",
    "brinesearch_issue97_identity_driver_name",
    "brinesearch_issue97_identity_aliases",
    "brinesearch_issue97_dataset_scope_current",
    "geometry.dependency_digest is distinct from pg_catalog.md5",
    "geometry.receipt_digest is distinct from pg_catalog.md5",
    "transition.receipt_digest=geometry.start_transition_digest",
    "transition.receipt_digest=geometry.end_transition_digest",
    "brinesearch_issue97_authoritative_identity_geometry_digest",
    "extensions.geometrytype(geometry.step_geometry)<>'linestring'",
    "v_total_geometry_points>100000",
    "extensions.st_npoints(geometry.step_geometry) not between 2 and 2000",
    "not extensions.st_isvalid(geometry.step_geometry)",
    "not extensions.st_issimple(geometry.step_geometry)",
    "extensions.st_coveredby",
    "prior.end_coordinate::extensions.geography, next.start_coordinate::extensions.geography,1",
    "final.pad_coordinate_digest=pg_catalog.md5",
    "shared_segment_sequence_context",
    "first.resolution_method='shared_segment_sequence_context'",
    "second.resolution_method='shared_segment_sequence_context'",
    "first.evidence->>'shared_segment_sequence'='a->b->a'",
    "first.evidence->>'selection_uses_route_sequence'='true'",
    "first.evidence->>'selection_uses_name_similarity'='false'",
    "first.evidence->>'selection_uses_nearest_road'='false'",
    "v_shared_boundary_count<>v_shared_pair_count*2",
    "v_ambiguous_shared_boundaries<>0",
    "'shared_begin'::text",
    "'shared_end'::text",
    "shared_segment_right_continuation_context",
    "not private_verification.brinesearch_v18_valid_right_continuation",
    "v_right_authority_count<>v_right_semantic_count",
    "v_right_semantic_mismatch<>0",
    "from right_authority authority except select semantic.boundary_index from right_semantics semantic",
    "from right_semantics semantic except select authority.boundary_index from right_authority authority",
    "authority.resolution_method= 'shared_segment_right_continuation_context'",
    "where authority.junction_type='name_change'",
    "'name_change'::text",
    "'verifieddesignations',pg_catalog.to_jsonb(traveled.valid_aliases)",
    "'type','featurecollection'",
    "'properties',pg_catalog.jsonb_build_object( 'steporder',traveled.public_order )",
    "extensions.st_asgeojson( traveled.step_geometry,9,0 )::jsonb",
    "pg_catalog.pg_column_size(v_projection)>8388608",
    "exception when others then return null",
  ]) {
    requireIn(nProjection, projectionContract, `exact projection contract ${projectionContract}`);
  }

  for (const classifierContract of [
    "immutable",
    "parallel safe",
    "security invoker",
    "when coalesce(p_public_current,false) and coalesce(p_public_exists,false) then",
    "when coalesce(p_public_exists,false) then",
    "when p_route_state='held' or p_graph_state='held' then",
    "'publicstate','held'",
    "'safereason','public_route_or_graph_authority_held'",
    "when p_route_state='ready' then",
    "'publicstate','not_published'",
    "'publicstate','unavailable'",
  ]) {
    requireIn(
      nGoogleClassifier,
      classifierContract,
      `sanitized public Google classifier ${classifierContract}`,
    );
  }
  const classifierOrder = [
    "when coalesce(p_public_current,false)",
    "when coalesce(p_public_exists,false)",
    "when p_route_state='held' or p_graph_state='held'",
    "when p_route_state='ready'",
    "else",
  ].map((needle) => nGoogleClassifier.indexOf(needle));
  if (
    classifierOrder.some((position) => position < 0) ||
    classifierOrder.some((position, index) => index > 0 && position <= classifierOrder[index - 1])
  ) {
    errors.push("sanitized public Google classifier precedence changed");
  }
  if (
    /brinesearch_google_route_receipts_issue97|transition_google_dark_current|hold_reason|manifest|receipt|\bfrom\b|\bjoin\b|\bexecute\b|\bperform\b/i.test(
      googleClassifier,
    )
  ) {
    errors.push("sanitized public Google classifier reads or names private evidence");
  }
  if (nProjection.includes("structured_route_steps") || nProjection.includes("clipped_geometry")) {
    errors.push("exact projection reads unbound legacy V17 step/geometry data");
  }
  if (/lower\s*\(|levenshtein|st_distance/i.test(
    section(projection, "with transition_authority as materialized", "with transition_authority as materialized (") || "",
  )) {
    errors.push("shared/name-change classification contains a name/proximity guess");
  }
  const outputStart = nProjection.lastIndexOf("with transition_authority as materialized");
  const outputEnd = nProjection.indexOf("if v_projection is null", outputStart);
  const output = outputStart >= 0 && outputEnd > outputStart
    ? nProjection.slice(outputStart, outputEnd)
    : "";
  for (const forbiddenOutputKey of [
    "'note'",
    "'notes'",
    "'roadid'",
    "'routesteppid'",
    "'graphbuildid'",
    "'identityid'",
    "'digest'",
    "'receipt'",
    "'junctionid'",
    "'anchorid'",
  ]) {
    if (output.includes(forbiddenOutputKey)) {
      errors.push(`exact public projection emits private key ${forbiddenOutputKey}`);
    }
  }

  for (const readyContract of [
    "v_receipt.route_status='route_ready'",
    "v_receipt.stage='ready'",
    "v_receipt.pad_id=p_pad_id",
    "v_receipt.route_group='primary'",
    "v_receipt.variant_index=1",
    "v_receipt.source_sequence_hash=v_route.source_sequence_hash",
    "v_route.readiness_status='ready_for_road_matching'",
    "cardinality(v_receipt.exception_reasons)=0",
    "v_route_exact:=v_receipt_ready",
    "v_receipt.road_occurrence_count between 2 and 256",
    "v_receipt.resolved_occurrence_count=v_receipt.road_occurrence_count",
    "v_receipt.held_occurrence_count=0",
    "v_receipt.canonical_mapping_count=v_receipt.road_occurrence_count",
    "v_receipt.exact_geometry_count=v_receipt.road_occurrence_count",
    "if v_route_exact and v_graph_state='active_current' and v_destination_available then",
    "v_pad.latitude between 37 and 43",
    "v_pad.longitude between -84 and -74",
    "private_verification.brinesearch_v18_exact_route_projection( v_route.id,v_receipt.road_occurrence_count )",
    "private_verification.brinesearch_v18_public_google_status( v_public_google_current,v_public_google_exists, v_route_state,v_graph_state )",
    "v_route_publishable:=true",
    "'steps',case when v_route_publishable then v_public_steps else '[]'::jsonb end",
    "'geometry',case when v_route_publishable then v_public_geometry else null end",
    "'writtendirections',null",
  ]) {
    requireIn(nDriver, readyContract, `driver publish gate ${readyContract}`);
  }
  for (const timeoutContract of [
    [nDriver, "set statement_timeout='2500ms'", "driver statement timeout"],
    [nDriver, "set lock_timeout='500ms'", "driver lock timeout"],
    [nOwner, "set statement_timeout='7s'", "owner statement timeout"],
    [nOwner, "set lock_timeout='500ms'", "owner lock timeout"],
  ]) {
    requireIn(timeoutContract[0], timeoutContract[1], timeoutContract[2]);
  }
  if ((nDriver.match(/brinesearch_v18_exact_route_projection/g) || []).length !== 1) {
    errors.push("exact projection must execute once, only on a single pad detail open");
  }
  if (nDriver.includes("structured_route_steps") || nDriver.includes("clipped_geometry")) {
    errors.push("driver RPC reads unbound V17 route steps/geometry");
  }
  if (!nDriver.includes("brinesearch_issue97_google_route_current(p_pad_id)")) {
    errors.push("public Google state does not use the public cutover/current dispatcher");
  }
  if (nDriver.includes("transition_google_dark_current")) {
    errors.push("public driver response function directly reads private Google readiness");
  }
  if (nDriver.includes("directions_clear")) {
    errors.push("public V18 driver status exposes legacy operational direction prose");
  }
  if (nDriver.includes("v_receipt.receipt_digest") || nDriver.includes("v_receipt.updated_at")) {
    errors.push("public driver status exposes private receipt churn through revision/time");
  }
  for (const forbiddenDriverKey of [
    "'googlePrivate'",
    "'routeReceipt'",
    "'graphAuthority'",
    "'holdReason'",
    "'manifestDigest'",
    "'dependencyDigest'",
    "'buildId'",
    "'graphDigest'",
    "'sourceRevisionDigest'",
  ]) {
    if (driver.includes(forbiddenDriverKey)) errors.push(`public driver leaks ${forbiddenDriverKey}`);
  }
  if (nPage.includes("brinesearch_v18_exact_route_projection") || nPublisher.includes("brinesearch_v18_exact_route_projection")) {
    errors.push("exact route projection was added to a directory/list fanout path");
  }

  for (const ownerContract of [
    "security definer",
    "v_actor uuid:=(select auth.uid())",
    "not public.is_brinesearch_owner(v_actor)",
    "transition_google_dark_current(p_pad_id)",
    "'googleprivate'",
    "'privatecurrent'",
    "'publicprojected'",
    "'routereceipt'",
    "'graphauthority'",
  ]) {
    requireIn(nOwner, ownerContract, `owner status contract ${ownerContract}`);
  }

  if (/grant\s+execute\s+on\s+function\s+public\.brinesearch_v18_owner_pad_status\([^)]*\)\s+to\s+[^;]*(anon|public)/i.test(sql)) {
    errors.push("owner RPC grants execution to anon/PUBLIC");
  }
  if (/grant\s+(create|all)\s+on\s+schema\s+private_verification/i.test(sql)) {
    errors.push("private schema CREATE/ALL was granted");
  }
  if (/grant\s+usage\s+on\s+schema\s+private_verification\s+to\s+[^;]*(anon|authenticated|public)/i.test(sql)) {
    errors.push("private schema USAGE was granted beyond service_role");
  }
  const privateGrants = (sql.match(/\bgrant\b[\s\S]*?;/gi) || [])
    .map((statement) => normalized(statement))
    .filter((statement) => statement.includes("private_verification"));
  if (
    privateGrants.length !== 2 ||
    !privateGrants.includes("grant usage on schema private_verification to service_role;") ||
    !privateGrants.includes(
      "grant execute on function private_verification.brinesearch_v18_refresh_directory_snapshot() to service_role;",
    )
  ) {
    errors.push("private schema/object grants exceed the two least-privilege grants");
  }
  if (/grant\s+(insert|update|delete|all)[^;]*brinesearch_directory_(snapshots|snapshot_rows)_v18[^;]*to\s+(anon|authenticated|service_role)/i.test(sql)) {
    errors.push("direct snapshot writes were granted");
  }
  return errors;
}

const errors = audit(migration);
if (errors.length) {
  throw new Error(`V18 directory/status audit failed:\n- ${errors.join("\n- ")}`);
}

const mutations = [
  [
    "remove PL/pgSQL terminal semicolon",
    migration.replace("return v_value;\nend;", "return v_value;\nend"),
  ],
  [
    "schema-qualify NULLIF special syntax",
    migration.replace("nullif(pg_catalog.btrim(p_value),'')", "pg_catalog.nullif(pg_catalog.btrim(p_value),'')"),
  ],
  ["remove FORCE RLS", migration.replace(/force row level security;/i, ";")],
  [
    "remove enforced public row shape",
    migration.replace(
      "constraint brinesearch_directory_snapshot_rows_v18_public_shape_check",
      "constraint brinesearch_directory_snapshot_rows_v18_public_shape_removed",
    ),
  ],
  [
    "weaken current view",
    migration.replace("with (security_invoker=true,security_barrier=true)", "with (security_barrier=true)"),
  ],
  [
    "expose owner RPC to anon",
    migration.replace(
      "to authenticated;\n\ncomment on function public.brinesearch_v18_driver_pad_status",
      "to authenticated,anon;\n\ncomment on function public.brinesearch_v18_driver_pad_status",
    ),
  ],
  ["remove owner authorization", migration.replace("not public.is_brinesearch_owner(v_actor)", "false")],
  [
    "leak private currentness to public driver",
    migration.replace(
      "v_public_google_current:=public.brinesearch_issue97_google_route_current(p_pad_id);",
      "v_public_google_current:=private_verification.brinesearch_issue97_transition_google_dark_current(p_pad_id);",
    ),
  ],
  [
    "ignore graph-held Google state",
    migration.replace(
      "when p_route_state='held' or p_graph_state='held' then",
      "when p_route_state='held' then",
    ),
  ],
  [
    "ignore route-held Google state",
    migration.replace(
      "when p_route_state='held' or p_graph_state='held' then",
      "when p_graph_state='held' then",
    ),
  ],
  [
    "collapse held Google state to unavailable",
    migration.replace("'publicState','held'", "'publicState','unavailable'"),
  ],
  [
    "leak private Google hold reason",
    migration.replace(
      "'safeReason','public_route_or_graph_authority_held'",
      "'safeReason',(select google.hold_reason from private_verification.brinesearch_google_route_receipts_issue97 google limit 1)",
    ),
  ],
  [
    "let held override stale public projection",
    migration.replace(
      "when coalesce(p_public_exists,false) then",
      "when coalesce(p_public_exists,false) and p_route_state<>'held' and p_graph_state<>'held' then",
    ),
  ],
  [
    "expose sanitized classifier directly",
    migration.replace(
      "revoke all on function\n  private_verification.brinesearch_v18_public_google_status(",
      "grant execute on function\n  private_verification.brinesearch_v18_public_google_status(",
    ),
  ],
  [
    "weaken exact geometry equality",
    migration.replace("v_receipt.exact_geometry_count=v_receipt.road_occurrence_count", "v_receipt.exact_geometry_count>=0"),
  ],
  ["remove snapshot verified GPS gate", migration.replace(/ordered\.gps_verified/g, "true")],
  [
    "allow out-of-service-area snapshot latitude",
    migration.replace(/ordered\.latitude between 37 and 43/g, "ordered.latitude between -90 and 90"),
  ],
  [
    "allow out-of-service-area snapshot longitude",
    migration.replace(/ordered\.longitude between -84 and -74/g, "ordered.longitude between -180 and 180"),
  ],
  [
    "remove snapshot zero-origin guard",
    migration.replace(/not \(ordered\.latitude=0 and ordered\.longitude=0\)/g, "true"),
  ],
  [
    "remove legacy identity uniqueness index",
    migration.replace(
      /create unique index brinesearch_directory_snapshot_rows_v18_legacy_identity_idx[\s\S]*?where legacy_id is not null;\r?\n/i,
      "",
    ),
  ],
  [
    "remove publisher ambiguous legacy identity guard",
    migration.replace(
      /\s+if exists\(\s+select 1\s+from pg_temp\.tmp_brinesearch_directory_rows_v18 row\s+where row\.legacy_id is not null\s+group by row\.legacy_id\s+having count\(\*\)>1\s+\) then\s+raise exception 'V18 directory snapshot contains an ambiguous legacy identity';\s+end if;/i,
      "",
    ),
  ],
  ["replace ordinal with offset paging", migration.replace("row.ordinal>p_after_ordinal", "row.ordinal>0 offset p_after_ordinal")],
  [
    "leak private receipt digest through status revision",
    migration.replace(
      "coalesce(v_graph_last_verified_at::text,''),v_google_state,",
      "coalesce(v_receipt.receipt_digest,''),v_google_state,",
    ),
  ],
  [
    "leak private receipt verification time",
    migration.replace("when v_route_state='ready' then v_graph_last_verified_at", "when v_route_state='ready' then v_receipt.updated_at"),
  ],
  [
    "remove public projection response gate",
    migration.replace("when v_route_publishable\n          then v_public_geometry", "when true then v_public_geometry"),
  ],
  [
    "accept stale reconciliation receipt",
    migration.replace("v_receipt.route_status='route_ready'", "v_receipt.route_status is not null"),
  ],
  ["accept non-ready reconciliation stage", migration.replace("v_receipt.stage='ready'", "v_receipt.stage is not null")],
  [
    "accept mismatched receipt source sequence",
    migration.replace("v_receipt.source_sequence_hash=v_route.source_sequence_hash", "true"),
  ],
  [
    "publish to unverified pad GPS",
    migration.replace("and v_destination_available then", "then"),
  ],
  [
    "allow out-of-service-area driver latitude",
    migration.replace("v_pad.latitude between 37 and 43", "v_pad.latitude between -90 and 90"),
  ],
  [
    "allow out-of-service-area exact endpoint longitude",
    migration.replace("v_route.pad_longitude not between -84 and -74", "v_route.pad_longitude not between -180 and 180"),
  ],
  ["remove projection GPS verification", migration.replace("if not found or not v_route.gps_verified", "if not found")],
  [
    "remove county length quarantine",
    migration.replace("when 'county','township' then", "when 'county_removed','township' then"),
  ],
  [
    "remove control-character quarantine",
    migration.replace("if v_value~'[[:cntrl:]]'", "if false"),
  ],
  [
    "allow prose in identifier fields",
    migration.replace("v_value~*'\\m(approximately|continue|head|left|miles?|onto|outside|right|road|turn)\\M'", "false"),
  ],
  [
    "bypass county sanitizer in publisher",
    migration.replace(
      "private_verification.brinesearch_v18_safe_directory_text(\n      ordered.county,'county'\n    ) as county",
      "ordered.county as county",
    ),
  ],
  [
    "drop primary well-name multi-value split",
    migration.replace(
      "from pg_catalog.regexp_split_to_table(\n          ordered.well_name,E'\\\\s*\\\\|\\\\s*'\n        ) split(value)",
      "from (values(ordered.well_name)) split(value)",
    ),
  ],
  [
    "drop primary API multi-value split",
    migration.replace(
      "from pg_catalog.regexp_split_to_table(\n          ordered.api,E'\\\\s*\\\\|\\\\s*'\n        ) split(value)",
      "from (values(ordered.api)) split(value)",
    ),
  ],
  [
    "drop primary property multi-value split",
    migration.replace(
      "from pg_catalog.regexp_split_to_table(\n          ordered.property_number,E'\\\\s*\\\\|\\\\s*'\n        ) split(value)",
      "from (values(ordered.property_number)) split(value)",
    ),
  ],
  [
    "read unbound V17 route steps",
    migration.replace(
      "select route.*,pad.latitude as pad_latitude,pad.longitude as pad_longitude,",
      "select route.*,pad.structured_route_steps,pad.latitude as pad_latitude,pad.longitude as pad_longitude,",
    ),
  ],
  [
    "remove occurrence input binding",
    migration.replace("or occurrence.input_digest is distinct from pg_catalog.md5(", "or occurrence.input_digest is null or pg_catalog.md5("),
  ],
  [
    "remove reconciliation dependency currentness",
    migration.replace("if v_receipt.dependency_digest is distinct from v_expected_dependency", "if false"),
  ],
  [
    "remove geometry start-transition binding",
    migration.replace("and transition.receipt_digest=geometry.start_transition_digest", "and true"),
  ],
  [
    "remove geometry end-transition binding",
    migration.replace(/and transition\.receipt_digest=geometry\.end_transition_digest/g, "and true"),
  ],
  [
    "weaken exact shared-context method",
    migration.replace(/first\.resolution_method='shared_segment_sequence_context'/g, "first.resolution_method is not null"),
  ],
  [
    "allow name similarity for shared semantics",
    migration.replace(/first\.evidence->>'selection_uses_name_similarity'='false'/g, "first.evidence->>'selection_uses_name_similarity'='true'"),
  ],
  [
    "remove required right-continuation evidence key",
    migration.replace(
      "p_evidence->>'selection_uses_exact_right_identity'='true'",
      "true",
    ),
  ],
  [
    "remove NULL-fail-closed right-continuation wrapper",
    migration.replace("return coalesce(\n  p_status='resolved'", "return (\n  p_status='resolved'"),
  ],
  [
    "infer name change from display name",
    migration.replace("where authority.junction_type='name_change'", "where pg_catalog.lower(authority.junction_type)=pg_catalog.lower('name_change')"),
  ],
  [
    "allow non-linear exact route geometry",
    migration.replace("extensions.geometrytype(geometry.step_geometry)<>'LINESTRING'", "extensions.geometrytype(geometry.step_geometry) not in ('LINESTRING','POINT')"),
  ],
  [
    "allow oversized route occurrence count",
    migration.replace("or p_expected_occurrence_count>256", "or false"),
  ],
  [
    "allow oversized route point total",
    migration.replace("or v_total_geometry_points>100000", "or false"),
  ],
  [
    "allow oversized per-step geometry",
    migration.replace(
      "extensions.st_npoints(geometry.step_geometry) not between 2 and 2000",
      "extensions.st_npoints(geometry.step_geometry)>=2",
    ),
  ],
  [
    "allow oversized projection response",
    migration.replace(
      "pg_catalog.pg_column_size(v_projection)>8388608",
      "pg_catalog.pg_column_size(v_projection)>2147483647",
    ),
  ],
  [
    "remove exact-leg continuity",
    migration.replace("prior.end_coordinate::extensions.geography,\n        next.start_coordinate::extensions.geography,1", "prior.end_coordinate::extensions.geography,\n        prior.end_coordinate::extensions.geography,1"),
  ],
  [
    "leak private geometry property",
    migration.replace("'stepOrder',traveled.public_order", "'stepOrder',traveled.public_order,'digest',md5('x')"),
  ],
  [
    "remove retained expiry from snapshot policy",
    migration.replace("and retained_until>pg_catalog.statement_timestamp()", "and true"),
  ],
  [
    "retain old current forever",
    migration.replace("retained_until=v_generated_at+interval '15 minutes'", "retained_until='infinity'::timestamptz"),
  ],
  [
    "remove one invalidation trigger",
    migration.replace(
      /create trigger brinesearch_v18_directory_snapshot_invalidate\r?\nafter insert or update or delete or truncate\r?\non public\.pads[\s\S]*?brinesearch_v18_withdraw_directory_snapshot_on_source_change\(\);/i,
      "",
    ),
  ],
  [
    "preserve retained snapshot after source mutation",
    migration.replace(
      "where publication_state in ('current','retained');",
      "where publication_state='current';",
    ),
  ],
  [
    "make invalidation row-level",
    migration.replace("for each statement execute function", "for each row execute function"),
  ],
  [
    "make invalidator refresh synchronously",
    migration.replace(
      "where publication_state in ('current','retained');\n  return null;",
      "where publication_state in ('current','retained');\n  perform private_verification.brinesearch_v18_refresh_directory_snapshot();\n  return null;",
    ),
  ],
  [
    "remove service schema usage",
    migration.replace("grant usage on schema private_verification to service_role;", ""),
  ],
  [
    "remove publisher statement timeout",
    migration.replace("set statement_timeout='5min'", "set statement_timeout='0'"),
  ],
  [
    "remove public RPC statement timeouts",
    migration.replaceAll("set statement_timeout='2500ms'", "set statement_timeout='0'"),
  ],
  [
    "broaden private schema usage",
    migration.replace("grant usage on schema private_verification to service_role;", "grant usage on schema private_verification to service_role,authenticated;"),
  ],
  [
    "expose legacy operational directions",
    migration.replace("'writtenDirections',null", "'writtenDirections',v_pad.directions_clear"),
  ],
];

for (const [name, mutated] of mutations) {
  if (mutated === migration) throw new Error(`Static self-test mutation did not apply: ${name}`);
  if (audit(mutated).length === 0) {
    throw new Error(`Static audit accepted forbidden mutation: ${name}`);
  }
}

for (const requiredTestEvidence of [
  "begin read only",
  "set local statement_timeout",
  "set local lock_timeout",
  "relforcerowsecurity",
  "security_invoker=true",
  "retained_until",
  "statement_timestamp()",
  "brinesearch_directory_snapshots_v18_retention_check",
  "brinesearch_v18_directory_snapshot_invalidate",
  "tgtype::integer & 32",
  "brinesearch_v18_withdraw_directory_snapshot_on_source_change",
  "brinesearch_v18_safe_directory_text",
  "brinesearch_v18_safe_directory_array",
  "repeat('Belmont, ',130)",
  "turn right onto road",
  "updated note 123",
  "Alpha 1 | Beta 2",
  "34-013-23456 | 34-013-2-3456-00-00",
  "deterministic live optional-field quarantine",
  "brinesearch_directory_snapshot_rows_v18_legacy_identity_idx",
  "ambiguous legacy identity",
  "legacy identity uniqueness contract failed",
  "v_status#>'{route,writtendirections}'<>'null'::jsonb",
  "driver_latitude not between 37 and 43",
  "driver_longitude not between -84 and -74",
  "brinesearch_v18_exact_route_projection",
  "p_expected_occurrence_count>256",
  "v_total_geometry_points>100000",
  "not between 2 and 2000",
  "pg_column_size(v_projection)>8388608",
  "brinesearch_v18_public_google_status",
  "public_route_or_graph_authority_held",
  "ready_precedence",
  "stale_precedence",
  "route_held",
  "graph_held",
  "not_published",
  "unavailable",
  "null_fail_closed",
  "brinesearch_route_occurrence_geometry_receipts_issue97",
  "shared_segment_sequence_context",
  "brinesearch_v18_valid_right_continuation",
  "selection_uses_exact_right_identity",
  "selection_uses_route_sequence}','null'::jsonb",
  "right-continuation validator accepted missing/NULL evidence",
  "shared_begin",
  "shared_end",
  "name_change",
  "verified entrance",
  "non-ready route leaked structured steps/geometry",
  "non-ready/stale receipt became publishable",
  "e2b32e85-9e93-4388-8215-9d8167cbbeb8",
  "private readiness leaked",
  "set local role anon",
  "set local role authenticated",
  "accepted an unauthenticated actor",
  "featurecollection",
  "jsonb_object_keys",
  "{route,geometry}",
  "has_schema_privilege",
  "rollback",
]) {
  if (!sqlTest.toLowerCase().includes(requiredTestEvidence.toLowerCase())) {
    throw new Error(`SQL contract test omits ${requiredTestEvidence}`);
  }
}

console.log(
  `PASS V18 driver directory/status contract: expiring immutable snapshots, exhaustive source invalidation, current receipt-bound exact route steps/geometry, explicit no-guess shared/name-change semantics, verified driver entrance, split public/owner status, and ${mutations.length} mutation controls`,
);
