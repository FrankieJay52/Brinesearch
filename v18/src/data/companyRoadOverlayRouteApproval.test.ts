import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260825040703_issue97_v18_company_road_route_approval.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Issue #97 company-road route-specific approval correction", () => {
  it("patches only the drift-pinned publisher definition", () => {
    expect(migration).toContain("e6fd290966ff75f24f2c99d471127bd6");
    expect(migration).toContain("v_old_review_count<>1 or v_old_policy_count<>1");
    expect(migration).toContain("route.reviewed_by is not null");
    expect(migration).toContain("route.reviewed_at is not null");
    expect(migration).toContain(
      "private_verification.brinesearch_v18_owner_authority_current(\\n      route.reviewed_by",
    );
    expect(migration).toContain("v_definition:=pg_catalog.replace(v_definition,v_old_policy,'')");
    expect(migration).toContain(
      "occurrence.step_geometry operator(extensions.&&) part.part_geometry",
    );
    expect(migration).toContain(
      "right_row.part_geometry operator(extensions.&&) left_row.part_geometry",
    );
    expect(migration).toContain("v_old_link_overlap_count<>1");
    expect(migration).toContain("v_old_dedupe_overlap_count<>1");
    expect(migration).toContain("pg_catalog.strpos(v_installed_definition,v_old_policy)>0");
    expect(migration).toContain("<>4 then");
  });

  it("rotates authority and preserves the service-only execution boundary", () => {
    expect(migration).toContain(
      "brinesearch_v18_company_road_authority_definition_sha256()",
    );
    expect(migration).toContain(
      "v_after_authority_sha256=v_before_authority_sha256",
    );
    expect(migration).toContain("procedure.prosecdef");
    expect(migration).toContain("procedure.provolatile='v'");
    expect(migration).toContain("procedure.proowner='postgres'::pg_catalog.regrole");
    expect(migration).toContain("'search_path=\"\"'=any(procedure.proconfig)");
    expect(migration).toContain("'statement_timeout=14min'=any(procedure.proconfig)");
    expect(migration).toContain("'lock_timeout=30s'=any(procedure.proconfig)");
    expect(migration).toContain("privilege.grantee='PUBLIC'");
    expect(migration).toContain("'anon',");
    expect(migration).toContain("'authenticated',");
    expect(migration).toContain("'service_role',");
  });

  it("does not publish, rewrite authority data, or loosen unrelated gates", () => {
    expect(migration).not.toMatch(
      /\b(?:select|perform)\s+private_verification\.brinesearch_v18_refresh_company_road_overlay_snapshot\s*\(/i,
    );
    expect(migration).not.toMatch(
      /\b(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public|private_verification)\.(?:pads|brinesearch_route_prep|brinesearch_roads|brinesearch_route_reconciliation_receipts_issue97|brinesearch_route_occurrence_receipts_issue97|brinesearch_route_occurrence_geometry_receipts_issue97|brinesearch_route_transition_receipts_issue97|brinesearch_road_graph_builds|brinesearch_google_route_receipts_issue97|brinesearch_driver_google_routes_public|brinesearch_issue97_release_state|brinesearch_company_road_overlay_snapshots_v18|brinesearch_company_road_overlay_rows_v18)\b/i,
    );
    expect(migration).not.toMatch(/^\s*(?:begin|commit|rollback)\s*;/im);
    expect(migration).toContain("not coalesce(road.candidate_only,false)");
    expect(migration).toContain("verified non-candidate mappings");
    expect(migration).toContain("requires the proven unpublished overlay baseline");
    expect(migration).toContain("company-road correction published an overlay");
  });
});
