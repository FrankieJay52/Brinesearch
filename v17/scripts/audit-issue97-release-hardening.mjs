import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const need = (source, token, label = token) =>
  assert.ok(source.includes(token), `Issue #97 release hardening missing ${label}`);
const forbid = (source, token, label = token) =>
  assert.ok(!source.includes(token), `Issue #97 release hardening forbids ${label}`);
const count = (source, token) => source.split(token).length - 1;

const saved = read("supabase/migrations/20260814160000_issue97_saved_road_release_baseline_current.sql");
const bridgeRegistry = read("supabase/migrations/20260814161000_issue97_possum_reviewed_subsegment_bridge_registry.sql");
const bridgeProof = read("supabase/migrations/20260814161100_issue97_possum_reviewed_subsegment_bridge_proof.sql");
const bridgeApply = read("supabase/migrations/20260814161200_issue97_possum_reviewed_subsegment_bridge_apply.sql");
const bridgeRuntime = read("supabase/migrations/20260814161300_issue97_possum_reviewed_subsegment_bridge_runtime.sql");
const endpointIndexes = read("supabase/migrations/20260814161400_issue97_ogrip_endpoint_geography_indexes.sql");
const ogrip = read("supabase/migrations/20260814161500_issue97_ogrip_corroborated_source_vertex.sql");
const transition = read("supabase/migrations/20260814162000_issue97_transition_google_schema_acl_hardening.sql");
const generation = read("supabase/migrations/20260814163000_issue97_graph_release_generation_registry.sql");
const releasePredicate = read("supabase/migrations/20260814163100_issue97_graph_release_current_predicate.sql");
const ohi = read("supabase/migrations/20260814163200_issue97_ohi_release_qualification.sql");
const consumers = read("supabase/migrations/20260814163300_issue97_release_current_consumers.sql");
const releaseInputs = read("supabase/migrations/20260814163400_issue97_graph_release_input_digests.sql");
const releaseManifests = read("supabase/migrations/20260814164000_issue97_release_manifests_and_verification_reports.sql");
const irreversibleGates = read("supabase/migrations/20260814164100_issue97_manifest_bound_activation_cutover.sql");
const shell = read("ops/issue97-computer-rollout/issue97-release-rollout.sh");
const preflight = read("ops/issue97-computer-rollout/sql/17-release-preflight.sql");
const build = read("ops/issue97-computer-rollout/sql/18-build-county-release.sql");
const verify = read("ops/issue97-computer-rollout/sql/19-verify-county-release.sql");
const plan = read("ops/issue97-computer-rollout/sql/20-release-dark-plan.sql");
const nob = read("ops/issue97-computer-rollout/sql/21-verify-nob-leonard-release.sql");
const possum = read("ops/issue97-computer-rollout/sql/22-verify-pa-was-possum-release.sql");
const canaryGate = read("ops/issue97-computer-rollout/sql/23-release-canary-complete-gate.sql");
const darkCandidate = read("supabase/tests/issue97_dark_candidate_release.sql");
const preCutover = read("supabase/tests/issue97_pre_cutover_release.sql");
const postCutover = read("supabase/tests/issue97_post_cutover_smoke.sql");

for (const token of [
  "16111",
  "4825b5291ea682af7f659130cd735838",
  "cb49d2f5912019abfefe553337860b61",
  "d3c545529f508f5f4ee8876ee1807ce4",
  "ebcacb4b049483fdc48cfcf04dc97dad",
  "4668be7f41b420225c0ae7261ac19b71",
  "route-semantic-v2",
  "unchanged_route_semantic_pads",
  "p.structured_route_steps::text,p.driver_safety_context::text))",
  "v_effective_definition like",
  "p.driver_safety_context::text,p.updated_at::text",
  "v_inventory_digest is distinct from v_baseline.expected_inventory_digest",
  "v_child_occurrences<>v_baseline.expected_occurrence_count",
  "if v_patched like '%v_occurrences<>16109%'",
  "if v_patched like '%expected_occurrence_count<>16109%'",
]) need(saved, token, `saved-road reviewed baseline ${token}`);
forbid(
  saved,
  "'source_digest','d28ca2b6fe5cd9610937df0d27362357'",
  "obsolete timestamp-sensitive digest as the active saved-road baseline",
);
forbid(
  saved,
  "literal backslash-n separator",
  "incorrect saved-road inventory delimiter description",
);

for (const source of [bridgeRegistry, bridgeProof, bridgeApply, bridgeRuntime]) {
  forbid(source, "similarity(", "fuzzy Possum matching");
  forbid(source, "<->", "nearest-geometry Possum matching");
}
for (const token of [
  "exact_source_subsegment_boundary_pair",
  "RCL22649@co.washington.pa.us",
  "RCL39851@co.washington.pa.us",
  "PA:PENNDOT:LOCAL:SEGMENT:379767",
  "PA:PENNDOT:LOCAL:SEGMENT:386101",
  "name_used",
  "nearest_road_used",
  "endpoint_snapping_used",
]) need(bridgeRegistry, token, `reviewed Possum bridge ${token}`);
for (const token of [
  "source_coverage_5m",
  "clip_coverage_5m",
  "cross_source_boundary_distance_m",
  "source_endpoint_snapping_forbidden",
  "brinesearch_issue97_municipality_key",
]) need(bridgeProof, token, `Possum structural proof ${token}`);
for (const token of [
  "brinesearch_issue97_apply_reviewed_subsegment_bridges",
  "brinesearch_issue97_ingest_run_verified",
  "brinesearch_issue97_supplemental_scope_content_digest",
  "mapping_method','exact_source_subsegment_boundary_pair",
]) need(bridgeApply, token, `Possum apply contract ${token}`);
for (const token of [
  "af72c01100aa90636ba0d40304724531",
  "1072f796d437a8e9bf94bb025785ea8e",
  "Issue #97 required Possum Hollow reviewed bridge fixtures failed",
]) need(bridgeRuntime, token, `Possum runtime fixture ${token}`);

for (const token of [
  "brinesearch_supp_centerline_oh_active_start_geog_issue97_idx",
  "brinesearch_supp_centerline_oh_active_end_geog_issue97_idx",
  "extensions.st_startpoint(extensions.st_linemerge(geom))::extensions.geography",
  "extensions.st_endpoint(extensions.st_linemerge(geom))::extensions.geography",
  "where active and state_code='OH'",
  "analyze public.brinesearch_authoritative_supplemental_centerlines",
]) need(endpointIndexes, token, `OGRIP endpoint performance ${token}`);
assert.equal(count(endpointIndexes, "using gist"), 2,
  "Issue #97 must create exactly two OGRIP endpoint geography GiST indexes");

for (const token of [
  "06c4b57ff9056b96137b9aaf4f4b856d",
  "7abd11f432c3e7b475b10d0817f5e8fc",
  "independent_ogrip_endpoint_corroboration",
  "candidate_coordinate_retained",
  "mapping_method='exact_geometry_coverage'",
  "coalesce(corroboration.corroborated,false)",
  "extensions.st_startpoint(extensions.st_linemerge(c.geom))::extensions.geography",
  "extensions.st_endpoint(extensions.st_linemerge(c.geom))::extensions.geography",
]) need(ogrip, token, `OGRIP corroboration ${token}`);
forbid(ogrip, "nearest_road_used',true", "nearest-road OGRIP promotion");
forbid(ogrip, "name_used',true", "name-driven OGRIP promotion");

// The transition migration patches function source held inside SQL strings, so
// quote-aware anchors deliberately use doubled SQL quotes.
for (const token of [
  "private_verification.brinesearch_issue97_mapping_fingerprint(o.identity_id)",
  "t.graph_digest is null",
  "run.details->>''page_set_digest''",
  "private_verification.brinesearch_issue97_ingest_run_verified(run.id)",
  "revoke all on function public.brinesearch_issue97_activate_cutover_without_google_routes",
  "revoke all on function public.brinesearch_publish_structured_route_issue97_without_google",
  "all_current_pads_accounted",
  "if v_patched like '%public.brinesearch_issue97_road_mapping_fingerprint(%'",
  "or v_patched like '%run.status=''succeeded''%'",
  "if v_definition like '%public.brinesearch_issue97_road_mapping_fingerprint%'",
  "or v_definition like '%status=''succeeded''%'",
]) need(transition, token, `transition/cutover hardening ${token}`);

for (const token of [
  "issue97-release-20260814-r1",
  "7abd11f432c3e7b475b10d0817f5e8fc",
  "4dd8a572b153d795163cf38a41ea9d1f",
  "7493c03da13f57707cb00bf90167bf7d",
  "5571341192c3573861ed0318fe0b71b3",
  "brinesearch_issue97_graph_source_content_digest",
  "brinesearch_issue97_release_manifest_current",
]) need(generation, token, `release generation ${token}`);
for (const token of [
  "brinesearch_issue97_stamp_graph_release_receipt",
  "pre-generation graph cannot be stamped",
  "brinesearch_issue97_graph_build_release_current",
  "brinesearch_issue97_graph_build_release_current_cached",
  "brinesearch_issue97_prepare_graph_release_current_cache",
]) need(releasePredicate, token, `release-current predicate ${token}`);
for (const token of [
  "a14358e638db5d01ca2ac07fef35e357",
  "2587",
  "5977",
  "historical_build_receipt_rewritten',false",
]) need(ohi, token, `OHI qualification ${token}`);
for (const token of [
  "release_generation_is_not_current",
  "brinesearch_issue97_graph_build_release_current(",
  "brinesearch_issue97_graph_build_release_current_cached(",
  "brinesearch_issue97_prepare_graph_release_current_cache()",
  "brinesearch_issue97_release_manifest_current()",
  "stale-generation BEL/JEF/NOB graphs were silently grandfathered",
]) need(consumers, token, `release-current consumer ${token}`);

for (const token of [
  "brinesearch_issue97_graph_name_input_digest",
  "brinesearch_issue97_graph_supplemental_input_digest",
  "release_authoritative_name_digest",
  "release_supplemental_input_digest",
  "captured-run-content+authoritative-name+supplemental-map-v2",
  "authoritative_name_input_digest",
  "supplemental_input_digest",
  "brinesearch_issue97_graph_release_qualification_immutable",
  "brinesearch_issue97_reject_release_receipt_mutation",
]) need(releaseInputs, token, `complete graph input currentness ${token}`);

for (const token of [
  "brinesearch_issue97_release_manifests",
  "brinesearch_issue97_release_manifest_members",
  "brinesearch_issue97_verification_reports",
  "brinesearch_issue97_current_route_eligibility_members",
  "coalesce(p.list_only,false)=false",
  "brinesearch_issue97_persist_release_manifest",
  "candidate manifest requires 38 release-current dark builds plus retained OHI",
  "brinesearch_issue97_candidate_manifest_activation_current",
  "brinesearch_issue97_candidate_manifest_authorizes_build",
  "brinesearch_issue97_persist_verification_report",
  "brinesearch_issue97_verification_report_current",
  "route_eligibility_manifest_digest",
  "ready_or_explicit_held_during_cutover_transaction",
  "'thrush','bellaire','leonard','cr26','possum'",
  "'cologie','repeated_road','shared_segment','long_chunk','parallel_shortcut'",
  "brinesearch_issue97_release_manifest_immutable",
  "brinesearch_issue97_verification_report_immutable",
]) need(releaseManifests, token, `persisted release evidence ${token}`);
for (const role of ["public","anon","authenticated","service_role"]) {
  need(releaseManifests, `from public,anon,authenticated,service_role`, `private release-ledger ACLs including ${role}`);
}

for (const token of [
  "candidate_manifest_digest",
  "brinesearch_issue97_candidate_manifest_authorizes_build",
  "verification_report_digest",
  "brinesearch_issue97_verification_report_current",
  "reviewed non-list-only scope",
  "coalesce(pad.list_only,false)=false",
  "blocked_unreviewed_candidate_manifest",
]) need(irreversibleGates, token, `manifest-bound irreversible gate ${token}`);
forbid(irreversibleGates, "\\n             where status", "fragile literal backslash-n receipt replacement");

for (const token of [
  "canaries",
  "build-pending-release-dark",
  "OH NOB semantic topology canary",
  "PA WAS Possum/performance canary",
  "no retry will occur",
  "mirror_log()",
  "rc=${PIPESTATUS[0]}",
  "23-release-canary-complete-gate.sql",
]) need(shell, token, `release rollout ${token}`);
for (const token of [
  "activate_graph_build",
  "activate_cutover",
  "refresh_google_routes",
  "| tee ",
]) forbid(shell, token, `release dark runner forbidden surface ${token}`);

for (const token of [
  "7abd11f432c3e7b475b10d0817f5e8fc",
  "4dd8a572b153d795163cf38a41ea9d1f",
  "16111",
  "4825b5291ea682af7f659130cd735838",
  "old_frozen_not_grandfathered",
  "inner_bypasses_closed",
  "transition_schema_current",
  "brinesearch_supp_centerline_oh_active_start_geog_issue97_idx",
  "brinesearch_supp_centerline_oh_active_end_geog_issue97_idx",
]) need(preflight, token, `release preflight ${token}`);
need(build, "set local statement_timeout='90min'", "finite release county builder timeout");
need(build, "brinesearch_issue97_graph_build_release_current", "release-current build duplicate guard");
need(verify, "release_generation_key'='issue97-release-20260814-r1", "release receipt verification");
need(verify, "release_builder_md5'='7abd11f432c3e7b475b10d0817f5e8fc", "final builder receipt");
need(plan, "private_verification.brinesearch_issue97_graph_build_release_current", "release-current pending plan");
need(plan, "state_code='OH' and c.county_code='NOB'", "NOB first canary order");
need(plan, "state_code='PA' and c.county_code='WAS'", "PA/WAS second canary order");
need(nob, "TNOBTR00055**C", "Leonard three-member multiway");
need(nob, "j.junction_type='multiway'", "Leonard multiway fixture");
need(possum, "exact_source_subsegment_boundary_pair", "Possum release fixture");
need(possum, "-80.4327636867076", "Possum exact PennDOT boundary coordinate");
need(canaryGate, "OH','NOB", "NOB canary completion gate");
need(canaryGate, "PA','WAS", "PA/WAS canary completion gate");

for (const token of [
  "cutover OFF",
  "release_generation_key",
  "brinesearch_issue97_graph_build_release_current",
  "brinesearch_issue97_transition_google_dependency",
]) need(darkCandidate, token, `dark-candidate release suite ${token}`);
for (const stale of ["OH','HOL", "OH','LIC", "WV','HAR"]) forbid(preCutover, stale, `stale county ${stale}`);
for (const current of ["OH','MEG", "OH','VIN", "WV','LEW"]) need(preCutover, current, `correct county ${current}`);
for (const token of [
  "cutover OFF",
  "exact 39-county active release-current manifest",
  "16111",
  "route_critical_held_count",
  "brinesearch_issue97_release_manifest_current",
]) need(preCutover, token, `pre-cutover suite ${token}`);
for (const token of [
  "cutover ACTIVE",
  "ready or held",
  "brinesearch_issue97_google_route_current",
  "public projection exposed a non-current Google route",
  "coalesce(p.list_only,false)=false",
]) need(postCutover, token, `post-cutover smoke ${token}`);
forbid(postCutover, "coalesce(p.record_type,'pad')<>'list_only'", "wrong Google pad denominator");

console.log("Issue #97 release-generation, complete input currentness, semantic saved baseline, Possum, transition ACL, OGRIP performance, persisted release evidence and canary rollout static audit passed.");
