import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20260826232154_issue97_harrison_named_approaches_batch1.sql",
  import.meta.url,
), "utf8").replaceAll("\r\n", "\n");

describe("Issue 97 Harrison named-approach batch 1", () => {
  it("releases exactly two explicit choices for each of the six reviewed pads", () => {
    for (const padId of [
      "185d9eb6-58af-4009-bf53-fdd23113a572",
      "95dcbd15-afd0-4357-a521-e23bcd6b4118",
      "61e21e3c-360b-40b0-8153-209b4fb3d5eb",
      "b9a8e55c-3583-4019-85fc-54a03d420ace",
      "655a97d5-ffdf-4b13-bf66-3d22022239b4",
      "f5a82acf-d7c0-4ce3-ad4e-0de810551450",
    ]) {
      expect(migration.match(new RegExp(padId, "g"))?.length).toBeGreaterThanOrEqual(2);
    }
    expect(migration).toContain("from tmp_issue97_harrison_named_targets)<>12");
    expect(migration).toContain("from tmp_issue97_harrison_named_targets)<>6");
    expect(migration).toContain("'via_freeport','Via Freeport','primary',1");
    expect(migration).toContain("'via_cadiz','Via Cadiz','alternate',2");
    expect(migration).toContain("'v18-named-approach-v1'");
    expect(migration).toContain("'google_to_saved_gps_unapproved'");
    expect(migration).toContain("'saved_pad_destination'");
    expect(migration).toContain(
      "v_status_revision:=pg_catalog.lower(\n      coalesce(v_base_bundle#>>'{status,statusRevision}','')",
    );
    expect(migration).toContain("baseStatusRevision',v_status_revision");
  });

  it("pins all twelve exact active source rows and their reviewed sequences", () => {
    for (const routeId of [
      "5a74a964-5f9e-44fe-bf93-0a16c98d16db",
      "78fae1c9-5f87-409f-ab49-1429b2558975",
      "53b6c1c4-2fe1-4187-899c-41b92d9fdcd4",
      "b9d0ea76-ee87-4d19-8d23-1194de26ca78",
      "a35beac0-0900-40fd-b5f3-16cf7e615ff9",
      "c4129c8f-b03e-4072-a20c-3e45e1d5f321",
      "e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a",
      "b41b4262-5d35-4588-8bff-4f06cbefc629",
      "34201b4a-f2f4-4986-bf58-21296efca4f0",
      "2208a5ae-ac48-41d1-9750-984d399027f7",
      "4a209eed-5f69-4cc7-b189-85196227c4fe",
      "17461b0c-61f1-4960-93bf-2b73e1be336c",
    ]) {
      expect(migration).toContain(routeId);
    }
    for (const sourceHash of [
      "489243e141a68470ada1e7a796feb1f7",
      "3e597a1e92bab340740974c3785b567c",
      "b67e577f9c1c5954f850e5322b571880",
      "510da8f1529d23bf7d3f67d109f74937",
      "d85772ac965d7ac6d8ce52371715e4da",
      "e1752137f4ae2b51b03722c98af8be85",
      "bdb06bf4293c8f04015eca1d3c1257bd",
      "70f27aca233a84746438dcab73934740",
      "92aaafe54c4fc6b89602d0dc95656a21",
    ]) {
      expect(migration).toContain(sourceHash);
    }
    for (const routeRowDigest of [
      "ba987651596af91de2bacb17a03111e3",
      "bd26417f06f2318b2a7455cf7d6d0438",
      "a5fa94bb51e0658ce15d527a29aebbd7",
      "b0fbe418b3f6e863155dbdc1113f5cff",
      "a62faae2f5fa65e92271c50180293e5e",
      "fba53a49ec0c0b2b28dbe067c178e721",
      "d4f0198318f4b734a1bdfc65155d2122",
      "9bc097183b1301176076a37bd7eefe56",
      "caef747f2997550537052f2d9fa62ec6",
      "f91759de54ba6ab842e2671dd7c0252c",
      "730f95f44034483896285e7b3292534f",
      "dfc2d7c815a4ef3dfc2f6cde2bacad91",
    ]) {
      expect(migration).toContain(routeRowDigest);
    }
    for (const receiptDigest of [
      "e27a38217458d0475136f69f81a57fe1",
      "e0aa0da40f342192f699f309bf5bb18b",
      "bfe2446e31d6162b019ec6c01b6ee33b",
      "eabf70c77705fccb4e42a73aab367320",
      "b53d68865e929f5b6345fa89c7c07745",
      "089c2a87f3ad85924e4e68be478f5e9b",
      "13b4f06bdd26fce72ffb1df2c7043bd7",
      "1cf4488554e9c3e5d1adb022043edf84",
      "d76a05e569f1bd22484e802cce030486",
      "4da63c428356aec171034b81e0464111",
      "0d02bc739c44844e336c7b08cf5b4811",
      "f131a42950e319ba31be0e34fc698788",
      "a86b4dbf0fa720e7508d770e6729b33b",
      "d8f62e5a8b8396ae952a3cea1ad96fbd",
      "39d7790edb020774bcb01b2e81c3ed41",
      "0f51641a7b4702639b60fcff83a9aeeb",
      "1c2ca7583ea831a88592c8f9dba10aa3",
      "ee0a601fd1d0369d5b057d8a7d7a4931",
      "fa5b62e0de4748783731522e898969c5",
      "2c14bacb25696e64b438355f68b99818",
      "eb299ce39306a0da053d1c905d745422",
      "6616b27bfbe368bab050b8380bce053a",
      "5d733b39289de65d74dc1f7ecdc7928f",
      "36aad8f3eff7bed57a4ffc8f48e6996f",
      "728b7477a06e80b93676087a71cb589b",
      "e5db72ccac33ac8149d5bdf8edcc6f67",
      "7330e637255c5edc915c8e9936361336",
      "7a75525b7c3cb7a2b370d92ad3d27dea",
      "f0dca0034e9a0f37b25836572b377070",
      "89adeee568f87db0616cc03f56a5dd3a",
      "22c206b2aa1f526e40c635785fc2fc27",
      "459e1b07d17515289a626d66d8ba181d",
      "57c439beafec57b80353c80bd015d218",
      "4b965e3a098687d0738f6a77c418f51f",
    ]) {
      expect(migration).toContain(receiptDigest);
    }
    expect(migration).toContain("route.active");
    expect(migration).toContain("route.route_group=v_target.source_route_group");
    expect(migration).toContain("route.variant_index=v_target.source_variant_index");
    expect(migration).toContain("route.readiness_status=v_target.source_readiness_status");
    expect(migration).toContain("pg_catalog.md5(pg_catalog.to_jsonb(route)::text)=");
    expect(migration).toContain("route.source_sequence=v_target.source_sequence");
    expect(migration).toContain("route.source_sequence_hash=pg_catalog.md5(route.source_sequence)");
    expect(migration).toContain("source receipt snapshot diverged");
    expect(migration).toContain("source_resolved_geometry_count");
  });

  it("pins exact reviewed mappings, road policy, and current junction memberships", () => {
    for (const mappingEvidence of [
      "05e3c897-b0ca-7f9e-aa15-4ee59fd11214",
      "dfb9062f29ab670ad3d8120458263b29",
      "b365b3cf-b8b3-60b1-95d4-be83dc749bea",
      "16cc55427e657485fd9ce3a3dccad974",
      "b1d43bd2-36fd-5092-b5f6-cce204a07364",
      "afc4907c4c1804115ac0cfc4d6203758",
      "a74a6be7-6db0-693b-2209-4a3dd8cbfe3a",
      "091f3b4c49c4b871865d44a1f587a8f4",
    ]) {
      expect(migration).toContain(mappingEvidence);
    }
    for (const junctionId of [
      "178a32b5-c32b-9b6a-8d7c-7445a5a2475f",
      "7f55c4cf-3b80-8b4c-d514-e909c68afff8",
      "4bfb8842-f123-db6c-54f3-5fb3cb177f2f",
      "5cd51768-047a-90c1-9fc4-7331b897e160",
      "f72d9546-0e5a-3d54-8472-fce5d40569a0",
    ]) {
      expect(migration).toContain(junctionId);
    }
    for (const junctionDigest of [
      "5edeaba19c1a23b92fe65c15bccd7664",
      "e6e8e3bd426b494a5b9a2afa7e638d53",
      "6e5fa1bbb24dc878f79e4fe283bf4865",
      "6ac4dc02de7c629c07d641056319ef7d",
      "1f74f47436375a48b2d83ac078094d78",
    ]) {
      expect(migration).toContain(junctionDigest);
    }
    expect(migration).toContain("mapping.mapping_status='verified'");
    expect(migration).toContain("identity.public_access_status='public'");
    expect(migration).toContain("identity.drivable_status='drivable'");
    expect(migration).toContain("road.approved_by_default is not distinct from");
    expect(migration).toContain("'CR-33',false");
    expect(migration).toContain("'shared_segment','LINESTRING'");
    expect(migration).toContain("junction.graph_digest=expected.junction_graph_digest");
    expect(migration).toContain("membership.junction_id=expected.junction_id)<>2");
    expect(migration).toContain("Exact reviewed core junction/membership authority diverged");
  });

  it("pins each base status revision before publishing either named choice", () => {
    for (const statusRevision of [
      "ff640b9daf0f97f9cf11e7b6116c172e",
      "07260a1a0968247a7ddb7802da151807",
      "b512ae5b094355b2e5992da2a26cf175",
      "be4669d3bd64562273bdce0438e4874b",
      "a9b8ea2cdafab39b7f9c884cc7b779f8",
      "f7a4862d76dbc2c78c03e36c71ec0464",
    ]) {
      expect(migration).toContain(statusRevision);
    }
    expect(migration).toContain("tmp_issue97_harrison_base_status");
    expect(migration).toContain("v_status_revision<>v_target.expected_base_status_revision");
  });

  it("proves the fixed current Harrison graph and exact identity clips", () => {
    expect(migration).toContain("'f4e4d43f-e86c-499c-893f-73f2eef3dc29'");
    expect(migration).toContain("'71cb3479ac57b6f5dc26d0985a056d06'");
    expect(migration).toContain("'2026-08-24T23:53:01.785257Z'");
    for (const evidence of [
      "c7856355-4ac4-70e0-6ecf-c19b5adb05fb",
      "0a8a8721-4d20-41bf-8d95-ec069173e584",
      "4cee534ea14b2111042a5432fc14f8e0",
      "bd4624be-178e-328d-9f9e-462d6066532e",
      "d7a42c92-9a77-49e0-8792-cd634242272e",
      "2448e5ba3c6fff940b02d40121186cfa",
      "fec65f26-a08f-dcd8-f9f0-62d873443889",
      "2ec7ff2a-1599-4fc5-84ac-5dab12d853ad",
      "5f5ba9e2ef79bfdc2e8f34397552478d",
      "108d9932-ec44-a267-a80d-f154dd73b114",
      "fd43709b-2880-4b6c-934a-6f9addc6e5cb",
      "b6030bbdd5fccd131415da02806e72dd",
      "f61bbbe4-353e-4968-e1dd-986d8889c11c",
      "ae8d10e7ae3c41394a1dc2aaaf65fb00",
      "86f39cd1256bcf12a1ca8bfa0803429c",
      "4e7b00d3a709f44268c28a66bb503550",
      "7568ab9fe3a8154c85f98c98c27beaca",
      "9c2e718906e7e7583dd43881f7235525",
    ]) {
      expect(migration).toContain(evidence);
    }
    expect(migration).toContain("40.210926558");
    expect(migration).toContain("-81.262609666");
    expect(migration).toContain("1.399999::numeric");
    expect(migration).toContain("2.755169::numeric");
    expect(migration).toContain("0.752076::numeric");
    expect(migration).toContain("9.085465::numeric");
    expect(migration).toContain("extensions.st_npoints(v_us22_clip)<>445");
    expect(migration).toContain("not extensions.st_issimple(v_us22_clip)");
  });

  it("makes Via Cadiz an exact US-250/US-22 to Douglas approach", () => {
    expect(migration).toContain("extensions.st_makepoint(-81.0128649,40.2779786)");
    expect(migration).toContain("extensions.st_makepoint(-81.1323685,40.2111424)");
    expect(migration).toContain("'displayName','US-22'");
    expect(migration).toContain("Continue west on US-22 toward Douglas Turn Rd");
    expect(migration).toContain("'US-250 at US-22 near Cadiz'");
    expect(migration).toContain(
      "'9c2e718906e7e7583dd43881f7235525|7568ab9fe3a8154c85f98c98c27beaca'",
    );
    expect(migration).toMatch(
      /'waypoints',pg_catalog\.jsonb_build_array\([\s\S]*?40\.2779786[\s\S]*?40\.2111424[\s\S]*?40\.2198834/,
    );
  });

  it("does not claim OH-800 for ELLEN and deterministically clips CARDINAL at 0.4 mile", () => {
    expect(migration).toContain("'freeport_oh799_only'");
    expect(migration).toContain("'Route 22 → Route 799 → Kennedy Ridge → Pad'");
    expect(migration).toContain("Continue east on OH-799 from the OH-800 junction");
    expect(migration).toContain("'cadiz_cardinal_clip'");
    expect(migration).toContain("v_target_metres constant double precision:=643.7376");
    expect(migration).toContain("for v_iteration in 1..80 loop");
    expect(migration).toContain("<>0.400000::numeric");
    expect(migration).toContain("CARDINAL reviewed 0.4-mile Douglas clip proof failed");
  });

  it("adds the two FK advisor indexes before inserting immutable receipts", () => {
    const routeIndex = migration.indexOf(
      "create index brinesearch_v18_named_approach_route_prep_idx",
    );
    const graphIndex = migration.indexOf(
      "create index brinesearch_v18_named_approach_graph_build_idx",
    );
    const firstReceipt = migration.indexOf(
      "insert into private_verification.brinesearch_v18_named_approach_releases",
    );
    expect(routeIndex).toBeGreaterThan(0);
    expect(graphIndex).toBeGreaterThan(routeIndex);
    expect(firstReceipt).toBeGreaterThan(graphIndex);
    expect(migration).toContain(
      "brinesearch_v18_named_approach_releases(route_prep_id)",
    );
    expect(migration).toContain(
      "brinesearch_v18_named_approach_releases(graph_build_id)",
    );
    expect(migration).toContain("Named-approach foreign-key indexes are not ready");
  });

  it("keeps authority boundaries forward-only and proves protected state unchanged", () => {
    expect(migration).toContain("pg_catalog.transaction_timestamp()");
    expect(migration).not.toContain("2026-08-26T23:45:00Z");
    expect(migration).toContain("frozen_source_snapshot_not_full_route_readiness");
    expect(migration).toContain("fullRouteReadinessClaimed',false");
    expect(migration).toContain("route_specific_owner_reviewed_named_release");
    expect(migration).toContain("globalRoadPolicyChanged',false");
    expect(migration).toContain("douglasApprovedByDefault',false");
    expect(migration).toContain("gpsSelectedRoad',false");
    expect(migration).toContain("nearestRoadMatching',false");
    expect(migration).toContain("fuzzyMatching',false");
    expect(migration).toContain("nameOnlyMatching',false");
    expect(migration).toContain("approvedGeometryReachesDestination',false");
    expect(migration).toContain("publicGoogleRowsCreated',false");
    expect(migration).toContain("cutoverChanged',false");
    expect(migration).toContain("LASSO or Cologie regression failed");
    expect(migration).toContain(
      "Protected graph/route/Google/pad/direction authority changed",
    );
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_road_graph_builds/i,
    );
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_route_prep(?:\s|\()/i,
    );
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_driver_google_/i,
    );
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.pads/i,
    );
    expect(migration).not.toMatch(
      /update\s+public\.brinesearch_issue97_release_state/i,
    );
    expect(migration).not.toMatch(/https?:\/\//i);
    expect(migration).not.toMatch(/google[.]com\/maps/i);
  });
});
