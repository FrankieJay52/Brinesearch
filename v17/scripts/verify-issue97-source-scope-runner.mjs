import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migrationsDir = path.join(root, "supabase/migrations");
const sql = fs.readFileSync(path.join(migrationsDir,
  "20260811235000_issue97_refresh_source_scope.sql"), "utf8");
const baseGraphSql = fs.readFileSync(path.join(migrationsDir,
  "20260811190000_issue97_authoritative_road_junction_graph.sql"), "utf8");
const odotPreservationSql = fs.readFileSync(path.join(migrationsDir,
  "20260811244000_issue97_odot_valid_nonsimple_source_preservation.sql"), "utf8");
const timestampHardeningSql = fs.readFileSync(path.join(migrationsDir,
  "20260811245000_issue97_ingest_generation_timestamp_hardening.sql"), "utf8");
const retirementHardeningSql = fs.readFileSync(path.join(migrationsDir,
  "20260811246000_issue97_source_identity_retirement_hardening.sql"), "utf8");
const ohioSupplementalPerfSql = fs.readFileSync(path.join(migrationsDir,
  "20260811247000_issue97_oh_supplemental_alias_materialization_performance.sql"), "utf8");

for (const token of [
  "create or replace function public.brinesearch_issue97_refresh_source_scope(",
  "scope.active and scope.ingest_enabled",
  "county.active",
  "brinesearch_issue97_source_snapshot(v_source,v_county)",
  "brinesearch_issue97_begin_ingest(",
  "brinesearch_issue97_ingest_page(v_run_id,v_offset,v_limit)",
  "brinesearch_issue97_finalize_ingest(",
  "brinesearch_issue97_fail_ingest(",
  "greatest(1,least(coalesce(p_page_size,1000),2000))",
  "v_offset:=v_offset+v_limit",
  "page count exceeded source snapshot expectation",
  "source-scope orchestrator error",
  "coverage_complete",
  "page_set_digest",
  "content_digest",
  "to service_role"
]) {
  assert.ok(sql.includes(token), `Issue #97 source-scope runner missing: ${token}`);
}

const snapshotAt = sql.indexOf("brinesearch_issue97_source_snapshot(v_source,v_county)");
const beginAt = sql.indexOf("brinesearch_issue97_begin_ingest(", snapshotAt);
const pageAt = sql.indexOf("brinesearch_issue97_ingest_page(v_run_id,v_offset,v_limit)", beginAt);
const finalizeAt = sql.indexOf("brinesearch_issue97_finalize_ingest(", pageAt);
assert.ok(snapshotAt >= 0 && beginAt > snapshotAt && pageAt > beginAt && finalizeAt > pageAt,
  "Issue #97 source-scope runner must preserve snapshot -> bound run -> contiguous pages -> receipt finalization order");

assert.match(sql, /v_expected_pages:=greatest\(1,pg_catalog\.ceil\(v_expected::numeric\/v_limit\)::integer\);/,
  "Issue #97 source-scope runner must bound pages to the source snapshot count");
assert.match(sql, /exit when coalesce\(\(v_page->>'has_more'\)::boolean,false\) is false;[\s\S]*v_offset:=v_offset\+v_limit;/,
  "Issue #97 source-scope runner must advance only after a nonterminal page");
assert.match(sql, /exception when others then[\s\S]*brinesearch_issue97_fail_ingest\([\s\S]*return pg_catalog\.jsonb_build_object\([\s\S]*'status','failed'/,
  "Issue #97 source-scope runner must explicitly fail instead of leaking partial success");
assert.match(sql, /revoke all on function public\.brinesearch_issue97_refresh_source_scope\(text,text,integer\)[\s\S]*from public,anon,authenticated;[\s\S]*grant execute[\s\S]*to service_role;/,
  "Issue #97 source-scope runner must remain service-only");
assert.ok(!/grant execute[\s\S]{0,180}to (?:anon|authenticated)/.test(sql),
  "Issue #97 source-scope runner must never be browser callable");

for (const token of [
  "create or replace function public.brinesearch_issue97_ingest_oh_page(",
  "not extensions.st_isvalid(v_geom)",
  "extensions.st_dimension(v_geom)<>1",
  "extensions.st_coveredby(v_geom,extensions.st_makeenvelope(-180,-90,180,90,4326))",
  "'rejected_rows',v_source_rows-v_rows",
  "to service_role"
]) assert.ok(odotPreservationSql.includes(token), `Issue #97 ODOT preservation migration missing: ${token}`);
assert.ok(!odotPreservationSql.includes("or not extensions.st_issimple(v_geom)"),
  "ODOT source ingestion must preserve valid non-simple authoritative LineStrings instead of rejecting the source row");

const segmentViewStart = baseGraphSql.indexOf("create or replace view public.brinesearch_authoritative_road_segments");
const segmentViewEnd = baseGraphSql.indexOf("comment on view public.brinesearch_authoritative_road_segments", segmentViewStart);
assert.ok(segmentViewStart >= 0 && segmentViewEnd > segmentViewStart,
  "Issue #97 base migration is missing the authoritative road-segment view block");
const segmentViewSql = baseGraphSql.slice(segmentViewStart, segmentViewEnd);
for (const token of [
  "extensions.st_isvalid(c.geom)",
  "extensions.st_issimple(c.geom)",
  "extensions.st_dimension(c.geom)=1",
  "extensions.st_coveredby(c.geom,extensions.st_makeenvelope(-180,-90,180,90,4326))"
]) assert.ok(segmentViewSql.includes(token), `Authoritative ODOT route/topology segment view missing strict geometry guard: ${token}`);
assert.match(baseGraphSql,
  /missing_geometry[\s\S]*not extensions\.st_issimple\(c\.geom\)/i,
  "Ohio identity refresh must continue to treat non-simple source geometry as topology-ineligible evidence");

for (const token of [
  "v_started_at timestamptz:=pg_catalog.transaction_timestamp()",
  "v_wall_started_at timestamptz:=pg_catalog.clock_timestamp()",
  "'generation_cutoff_clock','transaction_timestamp'",
  "'wall_started_at',v_wall_started_at",
  "create or replace function private_verification.brinesearch_issue97_terminal_run_clock()",
  "new.completed_at:=pg_catalog.clock_timestamp()",
  "create trigger brinesearch_issue97_terminal_run_clock",
  "check(completed_at is null or completed_at>=started_at)",
  "issue97_lifecycle_timestamp_repaired"
]) assert.ok(timestampHardeningSql.includes(token), `Issue #97 ingest timestamp hardening missing: ${token}`);
assert.ok(!/values\s*\([\s\S]{0,300}'loading',pg_catalog\.clock_timestamp\(\)/.test(timestampHardeningSql),
  "Issue #97 generation cutoff must never use wall clock while source rows use transaction time");
assert.match(timestampHardeningSql,
  /revoke all on function public\.brinesearch_issue97_begin_ingest\(text,text\)[\s\S]*grant execute[\s\S]*to service_role;/,
  "Issue #97 hardened begin-ingest entrypoint must remain service-only");
assert.match(timestampHardeningSql,
  /revoke all on function private_verification\.brinesearch_issue97_terminal_run_clock\(\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Issue #97 lifecycle trigger helper must not become browser/service callable");

for (const token of [
  "create or replace function public.brinesearch_issue97_finalize_ingest(",
  "public.brinesearch_authoritative_segment_identity_assignments a",
  "a.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id",
  "a.identity_id=i.id and a.active",
  "c.county_code=v_source_county and c.source_active",
  "public.brinesearch_authoritative_external_road_segments s",
  "s.dataset_id=v_run.dataset_id and s.identity_id=i.id and s.active",
  "'identity_retirement_basis'"
]) assert.ok(retirementHardeningSql.includes(token), `Issue #97 source identity retirement hardening missing: ${token}`);
assert.ok(!retirementHardeningSql.includes("not exists(\n        select 1 from public.brinesearch_authoritative_road_segments"),
  "Source identity retirement must never use the geometry-strict normalized topology view");
assert.match(retirementHardeningSql,
  /revoke all on function public\.brinesearch_issue97_finalize_ingest\(uuid,integer,integer,integer,jsonb\)[\s\S]*grant execute[\s\S]*to service_role;/,
  "Issue #97 hardened finalizer must remain service-only");

for (const token of [
  "brinesearch_supp_centerline_scope_run_issue97_idx",
  "brinesearch_supp_centerline_geom_issue97_idx",
  "create or replace function public.brinesearch_issue97_refresh_supplemental_aliases_oh(",
  "public.brinesearch_odot_road_catalog o",
  "public.brinesearch_authoritative_segment_identity_assignments a",
  "o.geom OPERATOR(extensions.&&) extensions.st_expand(c.geom,0.00001)",
  "extensions.st_dwithin(",
  "c.geom::extensions.geography,o.geom::extensions.geography,0.25",
  "'name_used_for_mapping',false",
  "'nearest_road_used_for_mapping',false",
  "'candidate_source','direct indexed ODOT catalog + exact segment assignment'",
  "'oh_materializer','indexed_direct_odot_source_segments'",
  "return public.brinesearch_issue97_refresh_supplemental_aliases_oh(p_run_id)",
  "return public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(p_run_id)"
]) assert.ok(ohioSupplementalPerfSql.includes(token), `Issue #97 indexed Ohio supplemental materializer missing: ${token}`);
assert.ok(!/refresh_supplemental_aliases_oh[\s\S]*join public\.brinesearch_authoritative_road_segments s/.test(ohioSupplementalPerfSql),
  "Ohio OGRIP materialization must not route its candidate spatial join through the security-barrier normalized segment view");
assert.match(ohioSupplementalPerfSql,
  /revoke all on function public\.brinesearch_issue97_refresh_supplemental_aliases_oh\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Ohio supplemental implementation helper must not be directly callable");
assert.match(ohioSupplementalPerfSql,
  /revoke all on function public\.brinesearch_issue97_refresh_supplemental_aliases\(uuid\)[\s\S]*grant execute[\s\S]*to service_role;/,
  "Supplemental materializer dispatcher must remain service-only");

const issue97Migrations = fs.readdirSync(migrationsDir)
  .filter(name => /^\d{14}_issue97_.*\.sql$/.test(name))
  .sort();
const versions = issue97Migrations.map(name => name.slice(0, 14));
assert.equal(new Set(versions).size, versions.length,
  `Issue #97 migration versions must be unique: ${issue97Migrations.join(", ")}`);
for (const required of [
  "20260811190000_issue97_authoritative_road_junction_graph.sql",
  "20260811200000_issue97_confirmed_pad_county_scope.sql",
  "20260811233500_issue97_automatic_google_routes.sql",
  "20260811234600_issue97_all_pad_google_route_accounting.sql",
  "20260811234700_issue97_route_corpus_reconciliation.sql",
  "20260811235000_issue97_refresh_source_scope.sql",
  "20260811240000_issue97_route_transition_receipts.sql",
  "20260811240100_issue97_transition_runtime_hardening.sql",
  "20260811241000_issue97_occurrence_geometry_receipts.sql",
  "20260811241100_issue97_turn_normalization_hardening.sql",
  "20260811241200_issue97_turn_segment_hardening.sql",
  "20260811242000_issue97_transition_google_manifests.sql",
  "20260811243000_issue97_wvdot_multipart_ingest_hardening.sql",
  "20260811244000_issue97_odot_valid_nonsimple_source_preservation.sql",
  "20260811245000_issue97_ingest_generation_timestamp_hardening.sql",
  "20260811246000_issue97_source_identity_retirement_hardening.sql",
  "20260811247000_issue97_oh_supplemental_alias_materialization_performance.sql"
]) assert.ok(issue97Migrations.includes(required), `Issue #97 migration chain missing: ${required}`);

console.log("Issue #97 restartable source-scope ingestion + WVDOT/ODOT preservation + timestamp/source-retirement + indexed Ohio supplemental hardening + complete unique migration chain regression passed.");
