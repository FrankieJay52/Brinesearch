import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WITHDRAWN_BILINOVICH_BLAZE_URL = "https://www.google.com/maps/dir/?api=1&origin=Saint%20Clairsville%2C%20OH&destination=40.08738445%2C-81.30282620&waypoints=40.12303995%2C-81.35382341%7C40.112583770%2C-81.294937982%7C40.09955931%2C-81.29781917&travelmode=driving&dir_action=navigate";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20260827000828_bilinovich_reviewed_route_correction.sql",
  import.meta.url,
), "utf8").replaceAll("\r\n", "\n");

describe("BILINOVICH reviewed display-route correction", () => {
  it("keeps the withdrawn Blaze URL only as historical migration evidence", () => {
    expect(migration).toContain(`'${WITHDRAWN_BILINOVICH_BLAZE_URL}'`);
  });

  it("pins the one exact pad and preserves the raw source", () => {
    expect(migration).toContain("59061829-1122-4aae-872d-cf5024310373");
    expect(migration).toContain("ascent--bilinovich");
    expect(migration).toContain(
      "fe4f19d922cf8887351d7ca3f876336e6fccc3b81c76d848eea82c9ea1d7eff0",
    );
    expect(migration).toContain(
      "38b970dada330a696352e40c4c9b81964be6674a1f5e28038c3da3b5b12cbbb1",
    );
    expect(migration).not.toMatch(/set\s+written_directions\s*=/i);
    expect(migration).toContain("raw_written_directions_preserved',true");
    expect(migration).toContain("pad_edit_history");
    expect(migration).toContain("previous',pg_catalog.jsonb_build_object");
  });

  it("stores the corrected McCoy-Blaze-Logan-Turkle display sequence", () => {
    expect(migration).toContain(
      "I-70 W → Exit 193 → OH-513 N → US-22 E → McCoy Rd → Blaze Rd → Logan Rd → Turkle Rd / lease access → BILINOVICH",
    );
    expect(migration).toContain(
      "Do not continue east toward McCoy/Merry.",
    );
    expect(migration).toContain(
      "This ODNR-derived pad-surface reference is not a verified public-road entrance.",
    );
    expect(migration).toContain(
      "This point is not a verified public-road entrance or approved lease geometry.",
    );
    expect(migration).not.toContain("authorized lease road");
    expect(migration).toContain("Guernsey County Road Centerline layer 84");
    expect(migration).toContain("ODNR WellPads ObjectID 792");
  });

  it("records every physical, shaping, lease, and pad coordinate with roles", () => {
    for (const coordinate of [
      "40.05399000", "-81.32158450",
      "40.05308330", "-81.32532670",
      "40.12053090", "-81.35869280",
      "40.12330216", "-81.35434374",
      "40.12303995", "-81.35382341",
      "40.112922973", "-81.294912730",
      "40.112583770", "-81.294937982",
      "40.099937405", "-81.298003204",
      "40.09955931", "-81.29781917",
      "40.088758168", "-81.300650392",
      "40.08865270", "-81.30095089",
      "40.08863000", "-81.30416400",
      "40.08738445", "-81.30282620",
    ]) {
      expect(migration).toContain(coordinate);
    }
    expect(migration).toContain("coordinate_evidence");
    expect(migration).toContain("exact_reviewed_junction");
    expect(migration).toContain("shaping_only");
    expect(migration).toContain("saved_destination_not_verified_public_entrance");
    expect(migration).toContain("odnr_derived_pad_surface_not_entrance");
  });

  it("keeps the reviewed Google URL private and unpublished", () => {
    expect(migration).toContain(
      "origin=Saint%20Clairsville%2C%20OH&destination=40.08738445%2C-81.30282620",
    );
    expect(migration).toContain(
      "waypoints=40.12303995%2C-81.35382341%7C40.112583770%2C-81.294937982%7C40.09955931%2C-81.29781917",
    );
    expect(migration).toContain("visually_validated_candidate_unpublished");
    expect(migration).toContain("public_google_authority',false");
    expect(migration).toContain("pg_catalog.strpos(coalesce(detail.extra_data::text,''),'google.com/maps')=0");
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_driver_google_/i,
    );
  });

  it("does not manufacture routing authority", () => {
    expect(migration).toContain("pad.structured_route_steps='[]'::jsonb");
    expect(migration).toContain("pad.structured_route_revision=0");
    expect(migration).toContain("v_status#>'{route,steps}' is distinct from '[]'::jsonb");
    expect(migration).toContain("v_status#>'{route,geometry}' is distinct from 'null'::jsonb");
    expect(migration).toContain("destination_released',false");
    expect(migration).toContain("google_published',false");
    expect(migration).toContain("cutover_changed',false");
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_(?:route_prep|road_graph_builds)/i,
    );
    expect(migration).not.toMatch(
      /update\s+public\.brinesearch_issue97_release_state/i,
    );
  });

  it("avoids a corpus rebuild and proves publication withdrawal", () => {
    expect(migration).toContain(
      "disable trigger brinesearch_direction_intelligence_refresh",
    );
    expect(migration).toContain(
      "enable trigger brinesearch_direction_intelligence_refresh",
    );
    expect(migration).toContain("disable trigger pads_audit_update");
    expect(migration).toContain("enable trigger pads_audit_update");
    expect(migration).toContain("-20260827000828");
    expect(migration).toContain("pad_edit_history_id_seq");
    expect(migration).not.toContain(
      "brinesearch_refresh_all_direction_intelligence();",
    );
    expect(migration).toContain("direction_intelligence_digest");
    expect(migration).toContain("publication_state='withdrawn'");
    expect(migration).toContain(
      "Directory/overlay source-change withdrawal was not exact",
    );
    expect(migration).not.toContain(
      "brinesearch_v18_refresh_directory_snapshot()",
    );
    expect(migration).not.toContain(
      "brinesearch_v18_publish_company_road_overlay",
    );
  });

  it("locks and row-counts the exact target while preserving rollback state", () => {
    expect(migration).toContain(
      "set transaction isolation level repeatable read;",
    );
    expect(migration).toContain("for update;");
    expect(migration).toContain("tmp_bilinovich_update_result");
    expect(migration).toContain("tmp_bilinovich_audit_result");
    expect(migration).toContain("tmp_bilinovich_verification_result");
    expect(migration).toContain("exact target update count diverged");
    expect(migration).toContain("deterministic audit insert count diverged");
    expect(migration).toContain("verification update count diverged");
    expect(migration).toContain("pads_mark_driver_route_reference_stale");
    expect(migration).toContain("d3c3caa7223852bcfce5b55792554cb8");
    expect(migration).toContain(
      "reference.route_hash=v_before.route_reference_row->>'route_hash'",
    );
    expect(migration).toContain(
      "reference.route_hash is distinct from pg_catalog.md5(",
    );
    expect(migration).toContain("reference.updated_at=v_expected.installed_at");
    expect(migration).toContain("is distinct from 'bigint'");
    expect(migration).toContain("is distinct from 'YES'");
    expect(migration).toContain("is distinct from 'ALWAYS'");
    expect(migration).toContain('overriding system value');
    expect(migration).toContain("other_directory_snapshots_digest");
    expect(migration).toContain("other_overlay_snapshots_digest");
    expect(migration).toContain("overlay_release_digest");
    expect(migration).toContain("occurrence_geometry_digest");
    expect(migration).toContain("transition_digest");
    expect(migration).toContain("private_google_release_digest");
    expect(migration).toContain("private_destination_release_digest");
    expect(migration).toContain("public_destination_release_digest");
    expect(migration).toContain(
      "BILINOVICH correction changed public Google routes",
    );
    expect(migration).toContain(
      "BILINOVICH correction changed cutover authority",
    );
    expect(migration).toContain(
      "state.cutover_at is not null or state.cutover_by is not null",
    );
    expect(migration).toContain(
      "is distinct from (v_before.release_state_row-'updated_at')",
    );
    expect(migration).toContain(
      "pg_catalog.jsonb_typeof(v_before.release_state_row)",
    );
    expect(migration).toContain("'review_details',state.review_details");
  });

  it("proves the exact atomic V18 envelope remains held", () => {
    expect(migration).toContain(
      "brinesearch_v18_driver_pad_status_with_named_approaches",
    );
    expect(migration).toContain(
      "bbf04af9da6fc3f8b2f39fce12c6d6c8",
    );
    expect(migration).toContain(
      "v_bundle#>>'{status,route,state}' is distinct from 'held'",
    );
    expect(migration).toContain(
      "v_bundle->'namedApproaches' is distinct from '[]'::jsonb",
    );
    expect(migration).toContain(
      "v_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb",
    );
    expect(migration).toContain(
      "v_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb",
    );
  });
});
