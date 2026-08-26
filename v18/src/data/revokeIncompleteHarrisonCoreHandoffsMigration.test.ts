import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20260826214500_issue97_revoke_incomplete_harrison_core_handoffs.sql",
  import.meta.url,
), "utf8").replaceAll("\r\n", "\n");

describe("Issue 97 incomplete Harrison core-handoff revocation", () => {
  it("revokes exactly HAMILTON and SPROULL through the immutable one-way field", () => {
    expect(migration).toContain("'b9a8e55c-3583-4019-85fc-54a03d420ace'");
    expect(migration).toContain("'f5a82acf-d7c0-4ce3-ad4e-0de810551450'");
    expect(migration).toContain("set revoked_at='2026-08-26T21:45:00Z'::timestamptz");
    expect(migration).toContain("Expected exactly two v2 revocations");
    expect(migration).not.toMatch(/delete\s+from\s+(?:private_verification|public)\.brinesearch_v18/i);
  });

  it("documents the precise fail-closed reason", () => {
    expect(migration).toContain("junction-only OH-800 ingress");
    expect(migration).toContain("omitted Kennedy Ridge segment");
    expect(migration).toContain("complete Freeport/Cadiz variants");
  });

  it("preserves frozen release bytes, public projections, and LASSO", () => {
    expect(migration).toContain("Frozen release bytes diverged");
    expect(migration).toContain("Frozen LASSO release changed");
    expect(migration).toContain("is distinct from (v_before.target_public->(v_pad_id::text))");
    expect(migration).toContain("is distinct from ((v_before.target_private->(v_pad_id::text))-'revoked_at')");
  });

  it("proves revoked handoffs cannot dispatch", () => {
    expect(migration).toContain("public.brinesearch_v18_driver_core_destination_release(v_pad_id)");
    expect(migration).toContain("v_bundle#>>'{status,route,source}'='exact_graph_handoff'");
    expect(migration).toContain("Revoked handoff still dispatches");
  });

  it("does not change graph, route, Google, or cutover authority", () => {
    expect(migration).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_road_graph_builds/i);
    expect(migration).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_route_prep/i);
    expect(migration).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+private_verification\.brinesearch_route_(?:occurrence|transition)/i);
    expect(migration).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_driver_google_/i);
    expect(migration).not.toMatch(/update\s+public\.brinesearch_issue97_release_state/i);
    expect(migration).toContain("Function, graph, route, or receipt state changed");
  });
});
