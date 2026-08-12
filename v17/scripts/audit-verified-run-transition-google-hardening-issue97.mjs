import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const provenance = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812037300_issue97_verified_run_provenance_hardening.sql"), "utf8");
const google = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812037400_issue97_transition_google_current_schema.sql"), "utf8");
const googleRuntime = google.split("-- Static install-time guard")[0];

for (const token of [
  "brinesearch_issue97_current_verified_run_id",
  "brinesearch_issue97_ingest_run_verified(r.id)",
  "brinesearch_issue97_rebuild_county_graph(text,text)",
  "brinesearch_issue97_graph_build_sources_current(uuid)",
  "brinesearch_issue97_activate_graph_build(uuid,text,jsonb)",
  "brinesearch_issue97_transition_google_dependency",
  "brinesearch_issue97_authoritative_identity_geometry_digest",
  "occurrence_role",
  "graph_digest",
  "source_revision_digest",
  "dataset_scope_current"
]) {
  assert.ok(provenance.includes(token), `Issue #97 verified-run provenance hardening missing: ${token}`);
}

assert.match(provenance,
  /current_verified_run_id\([\s\S]*ingest_run_verified\(r\.id\)[\s\S]*order by r\.started_at desc,r\.id desc/,
  "Issue #97 current source selector must choose the newest verified run, never merely the newest attempt");
assert.match(provenance,
  /required\.dataset_id,required\.state_code,required\.county_code[\s\S]*current_verified_run_id/,
  "Issue #97 graph source vectors must bind the current verified generation");

for (const forbidden of [
  "last_success_run_id",
  "public.brinesearch_issue97_road_mapping_fingerprint",
  "graph_build_digest",
  "geometry_kind"
]) {
  assert.ok(!provenance.includes(forbidden), `Issue #97 provenance migration retained obsolete runtime token: ${forbidden}`);
}

for (const token of [
  "brinesearch_issue97_refresh_google_route_transition",
  "current_verified_run_id",
  "brinesearch_authoritative_road_segments",
  "geometry_miles",
  "stable_junction_key",
  "shared_geometry_digest",
  "authoritative_junction_anchor",
  "authoritative_clipped_geometry",
  "route_ingress",
  "pad_destination",
  "manifest_digest",
  "pub.manifest-'manifest_digest'",
  "route_revision,status,hold_reason,manifest_version,manifest_digest",
  "pad_id,legacy_id,route_revision,source_revision,manifest",
  "shared_segment_transition_pair_not_unique",
  "name_only_resolution',false",
  "nearest_road_resolution',false",
  "fuzzy_resolution',false"
]) {
  assert.ok(googleRuntime.includes(token), `Issue #97 current-schema Google hardening missing: ${token}`);
}

for (const forbidden of [
  "last_success_run_id",
  "public.brinesearch_issue97_road_mapping_fingerprint",
  "graph_build_digest",
  "j.junction_key",
  "j.shared_geometry",
  "g.miles",
  "verified_at"
]) {
  assert.ok(!googleRuntime.includes(forbidden), `Issue #97 Google runtime retained obsolete schema token: ${forbidden}`);
}

assert.match(googleRuntime,
  /junction_type<>'shared_segment' then 'junction'[\s\S]*earlier\.boundary_index<t\.boundary_index[\s\S]*then 'shared_exit'[\s\S]*else 'shared_entry'/,
  "Issue #97 shared-section Google entry/exit must be determined by route order, not raw anchor-role naming");
assert.match(googleRuntime,
  /md5\(v_base_manifest::text\)[\s\S]*v_base_manifest\|\|pg_catalog\.jsonb_build_object\('manifest_digest',v_manifest_digest\)/,
  "Issue #97 manifest digest must be computed before the digest is embedded");
assert.match(googleRuntime,
  /coalesce\(pub\.manifest->>'manifest_digest',''\)=v_receipt\.manifest_digest[\s\S]*md5\(\(pub\.manifest-'manifest_digest'\)::text\)=v_receipt\.manifest_digest/,
  "Issue #97 transition manifest currentness must validate the embedded digest against the digest-free payload");
assert.match(googleRuntime,
  /revoke all on function private_verification\.brinesearch_issue97_refresh_google_route_transition\(uuid\)[\s\S]*from public,anon,authenticated;[\s\S]*grant execute[\s\S]*to service_role;/,
  "Issue #97 Google transition writer must remain service-only");

console.log("Issue #97 verified-run provenance / transition-Google current-schema audit passed.");
