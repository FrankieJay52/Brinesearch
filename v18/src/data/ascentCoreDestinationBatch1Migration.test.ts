import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20260826210000_issue97_ascent_harrison_core_destination_batch1.sql",
  import.meta.url,
), "utf8").replaceAll("\r\n", "\n");

describe("Issue 97 first Ascent Harrison core-destination batch", () => {
  it("releases only HAMILTON and SPROULL through the versioned v2 contract", () => {
    expect(migration).toContain("'b9a8e55c-3583-4019-85fc-54a03d420ace'");
    expect(migration).toContain("'f5a82acf-d7c0-4ce3-ad4e-0de810551450'");
    expect(migration).toContain("'v18-core-destination-v2'");
    expect(migration).toContain("'saved_pad_destination'");
    expect(migration).toContain("'google_to_saved_gps_unapproved'");
    expect(migration).toContain("'approved_geometry_reaches_destination',false");
    expect(migration).toContain("'kennedy_ridge_geometry_approved',false");
  });

  it("pins the eastbound OH-799 core to current Harrison graph evidence", () => {
    expect(migration).toContain("'f4e4d43f-e86c-499c-893f-73f2eef3dc29'");
    expect(migration).toContain("'bd4624be-178e-328d-9f9e-462d6066532e'");
    expect(migration).toContain("'d7a42c92-9a77-49e0-8792-cd634242272e'");
    expect(migration).toContain("'a6595489-16d9-00f4-aa17-d07dcdb24103'");
    expect(migration).toContain("'219707e4-cc71-d90d-3368-0f29f8f72b9d'");
    expect(migration).toContain("'4e7b00d3a709f44268c28a66bb503550'");
    expect(migration).toContain("'dff2e04cfcb292adde25f47a0d218fa7'");
    expect(migration).toContain("'5867273debfa12b8743117a80a46aa87'");
    expect(migration).toContain("'4fedea2558a7967fe8d4902b3a71a5c8'");
    expect(migration).toContain("receipt.receipt_digest=v_target.oh799_receipt_digest");
    expect(migration).toContain("Reviewed eastbound OH-799 direction is not preserved");
  });

  it("preserves LASSO v1 behind its unchanged gate", () => {
    expect(migration).toContain(
      "rename to brinesearch_v18_core_destination_release_receipt_active_v1_lasso",
    );
    expect(migration).toContain(
      "brinesearch_v18_core_destination_release_receipt_active_v1_lasso(",
    );
    expect(migration).toContain("Frozen LASSO v1 regression failed");
    expect(migration).toContain("v18-core-destination-v1','v18-core-destination-v2");
  });

  it("does not mutate graph, reconciliation, Google-public, or cutover authority", () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.brinesearch_driver_google_(?:routes|handoffs)_public/i);
    expect(migration).not.toMatch(/update\s+public\.brinesearch_issue97_release_state/i);
    expect(migration).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_road_graph_builds/i);
    expect(migration).not.toContain("brinesearch_issue97_refresh_transition_receipts");
    expect(migration).not.toContain("brinesearch_issue97_refresh_route_geometry");
    expect(migration).not.toContain("brinesearch_issue97_reconcile_route_corpus");
    expect(migration).toContain("Graph/route/reconciliation state changed unexpectedly");
  });

  it("pins security-definer settings, private grants, public function bytes, and v2 constraints", () => {
    expect(migration).toContain("V2 function security/grant/constraint contract diverged");
    expect(migration).toContain("Public function definition/grant/runtime settings changed");
    expect(migration).toContain("p.proacl::text='{postgres=X/postgres}'");
    expect(migration).toContain("statement_timeout=2s");
    expect(migration).toContain("lock_timeout=500ms");
  });
});
