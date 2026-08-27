import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20260827033000_bilinovich_no_blaze_reviewed_display.sql",
  import.meta.url,
), "utf8");

describe("BILINOVICH no-Blaze reviewed-display correction", () => {
  it("pins the exact unsafe production checkpoint and immutable raw source", () => {
    expect(migration).toContain("59061829-1122-4aae-872d-cf5024310373");
    expect(migration).toContain("2026-08-27T01:28:35.232844Z");
    expect(migration).toContain("31246311a646ff6ab9041fdc513eb033e5c758835aab1d235675b926513e39d6");
    expect(migration).toContain("c19f59c27e1d86a5d1ce2a042eea61868a703ca47175de7fc4aea3928ef9ae06");
    expect(migration).toContain("a9dd9d31ea01513089f8c54e37b43c7773d509e0cd76bce05e579763d28fab9d");
    expect(migration).toContain("fe4f19d922cf8887351d7ca3f876336e6fccc3b81c76d848eea82c9ea1d7eff0");
    expect(migration).toContain("history.id=-20260827000828");
  });

  it("installs the exact official no-Blaze chain as held display guidance", () => {
    expect(migration).toContain("US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH");
    expect(migration).toContain("Do not take Blaze Rd, the right-hand branch");
    expect(migration).toContain("SGUEUS00022**C");
    expect(migration).toContain("CGUECR00082**C");
    expect(migration).toContain("TGUETR00967**C");
    expect(migration).toContain("CGUECR00694**C");
    expect(migration).toContain("CGUECR00964**C");
    expect(migration).toContain("TGUETR00693**C");
    expect(migration).toContain("'forbidden_road_id','TGUETR00964**C'");
    expect(migration).toContain("'distance_meters',23.1");
  });

  it("preserves audit history and fail-closes every authority plane", () => {
    expect(migration).toContain("-20260827033000");
    expect(migration).toContain("overriding system value");
    expect(migration).toContain("'2026-08-26-bilinovich-owner-correction-v1'");
    expect(migration).toContain("'2026-08-27-bilinovich-no-blaze-reviewed-display-v1'");
    expect(migration).toContain("pad.structured_route_steps='[]'::jsonb");
    expect(migration).toContain("pad.structured_route_revision=0");
    expect(migration).toContain("pad.brinesearch_google_route_status_issue97='not_evaluated'");
    expect(migration).toContain("after_status#>'{route,steps}' is distinct from '[]'::jsonb");
    expect(migration).toContain("after_status#>'{route,geometry}' is distinct from 'null'::jsonb");
    expect(migration).toContain("after_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb");
    expect(migration).toContain("after_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb");
    expect(migration).toContain("BILINOVICH correction changed cutover authority");
  });

  it("disables only the two non-transactional side-effect triggers and restores them", () => {
    expect(migration.match(/disable trigger/g)).toHaveLength(2);
    expect(migration).toContain("disable trigger brinesearch_direction_intelligence_refresh");
    expect(migration).toContain("disable trigger pads_audit_update");
    expect(migration).toContain("enable trigger pads_audit_update");
    expect(migration).toContain("enable trigger brinesearch_direction_intelligence_refresh");
    expect(migration).not.toContain("disable trigger pads_mark_driver_route_reference_stale");
    expect(migration).not.toContain("disable trigger brinesearch_v18_directory_snapshot_invalidate");
    expect(migration).not.toContain("disable trigger brinesearch_v18_company_road_overlay_invalidate");
  });

  it("asserts exact source withdrawal and protected-table stability", () => {
    expect(migration).toContain("66a66928-d78f-4dc2-9153-d2796a830ddc");
    expect(migration).toContain("b4e9b847-449a-4b86-9206-9c6743b6c141");
    expect(migration).toContain("publication_state='withdrawn'");
    expect(migration).toContain("BILINOVICH correction changed a non-target row");
    expect(migration).toContain("BILINOVICH correction changed protected relation %");
    expect(migration).toContain("private_verification.brinesearch_route_occurrence_geometry_receipts_issue97");
    expect(migration).toContain("private_verification.brinesearch_google_route_receipts_issue97");
    expect(migration).toContain("private_verification.brinesearch_v18_core_destination_releases");
    expect(migration).toContain("from public.brinesearch_issue97_release_state release_row");
    expect(migration).not.toContain("to_jsonb(state)-'updated_at'");
    expect(migration).toContain("where singleton)<>1");
  });

  it("does not publish any replacement Google URL", () => {
    expect(migration).not.toContain("https://www.google.com/maps/dir/");
    expect(migration).toContain("'status','withdrawn_no_replacement_published'");
    expect(migration).toContain("'public_google_authority',false");
  });
});
