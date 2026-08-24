import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");

const gue = migration("20260824122000_issue97_gue_held_route_exact_identity_receipts.sql");
const has = migration("20260824124500_issue97_has_scout_exact_identity_receipts.sql");

const expectCommonFailClosedContract = (sql: string) => {
  expect(sql).toContain("set local statement_timeout = '15min'");
  expect(sql).toContain("brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest");
  expect(sql).toContain("brinesearch.issue97_expected_state_manifest_id");
  expect(sql).toContain("brinesearch.issue97_expected_state_manifest_digest");
  expect(sql).toContain("brinesearch.issue97_expected_member_count");
  expect(sql).toContain("'cache_scope'<>'exact_state_manifest'");
  expect(sql).toContain("'cache_miss_policy'<>'fail_closed'");
  expect(sql).toContain("'release_current_count'<>'19'");
  expect(sql).toContain("'impact_count')::integer,-1)<>0");
  expect(sql).toContain("or nullif(build.source_revision_digest,'') is null");
  expect(sql).toContain("or build.source_revision_digest=(select before.source_revision_digest");
  expect(sql).toContain(
    "member.member_value->>'source_revision_digest'=build.source_revision_digest",
  );
  expect(sql).toContain("member.member_value->>'graph_digest'=build.graph_digest");
  expect(sql).toContain("'source_revision_changed',build.source_revision_digest is distinct from");
  expect(sql).toContain("'cache_current',coalesce((select cache.current");
  expect(sql).toContain("'global_cutover_authorized',false");
  expect(sql).toContain("'public_google_authorized',false");
  expect(sql).toContain("'route_authority_upgrade',false");
  expect(sql).toContain("'fuzzy_matching_used',false");
  expect(sql).toContain("'nearest_road_used',false");
  expect(sql).toContain("from public.brinesearch_driver_google_routes_public)<>0");
  expect(sql).toContain("select cutover_at from public.brinesearch_issue97_release_state where singleton");
  expect(sql).not.toMatch(/insert\s+into\s+public\.brinesearch_driver_google_routes_public/i);
  expect(sql).not.toMatch(/update\s+public\.brinesearch_issue97_release_state/i);
  expect(sql).not.toMatch(/^\s*(?:begin|commit|rollback)\s*;/im);
};

const expectOrderedStatements = (sql: string, tags: string[]) => {
  let offset = -1;
  for (const tag of tags) {
    const next = sql.indexOf(`do $${tag}$`);
    expect(next, `${tag} must exist`).toBeGreaterThan(offset);
    expect(sql.match(new RegExp(`\\$${tag}\\$`, "g"))).toHaveLength(2);
    offset = next;
  }
};

describe("Issue #97 held-route exact-identity migrations", () => {
  it("splits GUE rebuild, manifest, activation, and cache work into separate timed statements", () => {
    expectCommonFailClosedContract(gue);
    expectOrderedStatements(gue, [
      "issue97_gue_adopt_sr258_family",
      "issue97_gue_verify_canonical_install",
      "issue97_gue_rebuild",
      "issue97_gue_manifest",
      "issue97_gue_activate",
      "issue97_gue_prepare_manifest_cache",
      "issue97_gue_reconcile_targets",
      "issue97_gue_postconditions",
    ]);
    expect(gue).toContain("where p.legacy_id in ('ascent--cooper','ascent--lorraine')");
    expect(gue).toContain("where legacy_id in ('ascent--cooper','ascent--lorraine')");
    expect(gue).toContain("'adoptedRoadFamily','OH-258'");
    expect(gue).toContain("'adoptedRoadFamilyIdentityCount',5");
    expect(gue).toContain("'family_geometry_digest',v_geom_digest");
    expect(gue).toContain("v_geom_digest<>'dfac6e146b3bdde0cba48c3c0de85e3f'");
    expect(gue).toContain("step.road_id='f230224c-b99a-4652-b672-3b80667ba81e'");
    expect(gue).toContain("point->>'identity_id'='1d61e8f0-527b-582a-022a-673001d546df'");
    expect(gue).toContain("'cooperPrivateAccess','held'");
    expect(gue).toContain("'cooperTitusSligoGraphCrossing','held'");
    expect(gue.match(/brinesearch_issue97_state_candidate_manifest_current\(/g)).toHaveLength(1);
    expect(gue.match(/brinesearch_issue97_candidate_manifest_authorizes_build\(/g)).toHaveLength(1);
  });

  it("keeps Scout's same-US-250 boundary explicit and held", () => {
    expectCommonFailClosedContract(has);
    expectOrderedStatements(has, [
      "issue97_has_rebuild",
      "issue97_has_manifest",
      "issue97_has_activate",
      "issue97_has_prepare_manifest_cache",
      "issue97_has_reconcile_scout",
      "issue97_has_postconditions",
    ]);
    expect(has).toContain("'internal_source_boundary_continuation',true");
    expect(has).toContain("'display_as_new_maneuver',false");
    expect(has).toContain("adjacent_same_road_split_requires_explicit_source_boundary");
    expect(has).toContain("'scoutUs250SourceBoundary','held_explicit_boundary_required'");
    expect(has).toContain("'newDriverManeuverCreated',false");
    // One invocation checks the installed GUE predecessor. The other match is
    // the pinned function signature; no redundant HAS pre/post invocation remains.
    expect(has.match(/brinesearch_issue97_state_candidate_manifest_current\(/g)).toHaveLength(2);
    expect(has.match(/brinesearch_issue97_candidate_manifest_authorizes_build\(/g)).toHaveLength(1);
  });
});
