import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20260826184037_issue97_lasso_exact_core_destination_handoff.sql",
  import.meta.url,
), "utf8").replaceAll("\r\n", "\n");

describe("Issue 97 LASSO frozen core and saved-destination release", () => {
  it("binds only the reviewed LASSO release to the exact Cologie source core", () => {
    expect(migration).toContain("v_lasso constant uuid:='518659d9-bca2-47b0-b294-3141ba679fc4'");
    expect(migration).toContain("v_cologie constant uuid:='e2b32e85-9e93-4388-8215-9d8167cbbeb8'");
    expect(migration).toContain("v_route_id constant uuid:='0102370e-c03f-443c-94c2-61c7e10bf931'");
    expect(migration).toContain("'exact_graph_handoff'");
    expect(migration).toContain("'saved_pad_destination'");
    expect(migration).toContain("'google_to_saved_gps_unapproved'");
    expect(migration).toContain("'verified_release'");
    expect(migration).toContain("'BrineSearch immutable approved release'");
  });

  it("keeps the public-road core and the unapproved GPS final leg separate", () => {
    expect(migration).toContain("v_handoff_point extensions.geometry");
    expect(migration).toContain("v_destination_point extensions.geometry");
    expect(migration).toMatch(/st_distance\([\s\S]*v_handoff[\s\S]*v_destination[\s\S]*\)<127/i);
    expect(migration).toMatch(/st_distance\([\s\S]*v_handoff[\s\S]*v_destination[\s\S]*\)>129/i);
    expect(migration).toContain("verified_pad_gps_not_on_final_authoritative_geometry");
    expect(migration).toContain("No line, road identity, mileage,");
    expect(migration).toContain("or approval is manufactured between the core handoff and the destination.");
  });

  it("uses one-time evidence proof and a constant-time frozen receipt on driver reads", () => {
    expect(migration).toContain("brinesearch_v18_core_destination_release_proof_at_install");
    expect(migration).toContain("brinesearch_v18_core_destination_release_receipt_active");
    expect(migration).toContain("It does not recompute graph currentness on driver reads.");
    expect(migration).toContain("security definer\nset search_path=''\nset statement_timeout='2s'\nset lock_timeout='500ms'");
    expect(migration).toContain("security definer\nset search_path=''\nset statement_timeout='20s'\nset lock_timeout='500ms'");
    expect(migration).toContain("v_proc.provolatile<>'s'");
  });

  it("materializes only the reviewed source receipts without a corpus-wide candidate scan", () => {
    expect(migration).not.toContain("perform public.brinesearch_issue97_reconcile_route_corpus(");
    expect(migration).toContain("candidate.route_prep_step_id=v_source.route_prep_step_id");
    expect(migration).toContain("v_source.resolution_method is distinct from\n            'explicit_authoritative_source_receipt'");
    expect(migration).toContain("LASSO exact source-receipt materialization failed");
    expect(migration).toContain("brinesearch_issue97_refresh_transition_receipts");
    expect(migration).toContain("brinesearch_issue97_refresh_route_geometry");
    expect(migration).toContain("brinesearch_issue97_refresh_route_receipt");
  });

  it("locks release rows against edits and proves tampering fails closed", () => {
    expect(migration).toContain("brinesearch_v18_private_core_destination_release_immutable");
    expect(migration).toContain("brinesearch_v18_public_core_destination_release_immutable");
    expect(migration).toContain("Frozen core-destination release content cannot be changed or deleted");
    expect(migration).toContain("Published frozen core-destination release cannot be changed or deleted");
    expect(migration).toContain("Waypoint mutation did not fail closed");
    expect(migration).toContain("Nested handoff key injection did not fail closed");
    expect(migration).toContain("Inner destination mutation did not fail closed");
    expect(migration).toContain("Missing geometry feature did not fail closed");
    expect(migration).toContain("Explicit release revocation did not fail closed");
  });

  it("does not publish Google, enable cutover, or mutate a graph", () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.brinesearch_driver_google_(?:routes|handoffs)_public/i);
    expect(migration).not.toMatch(/update\s+public\.brinesearch_issue97_release_state/i);
    expect(migration).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_road_graph_builds/i);
    expect(migration).toContain("v_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb");
    expect(migration).toContain("v_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb");
    expect(migration).toContain("LASSO release changed existing Google publication or cutover");
  });
});
