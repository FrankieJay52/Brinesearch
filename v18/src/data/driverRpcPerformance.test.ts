import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260825030000_issue97_cologie_driver_rpc_query_shape.sql",
    import.meta.url,
  ),
  "utf8",
);
const definitions = migration.split("do $issue97_cologie_query_shape_assertions$")[0];

describe("Issue #97 COLOGIE driver RPC query shape", () => {
  it("proves each exact name source scope once", () => {
    expect(definitions.match(/candidate_names as materialized/gi)).toHaveLength(2);
    expect(definitions.match(/current_scopes as materialized/gi)).toHaveLength(2);
    expect(definitions.match(/select distinct n\.source_dataset_id/gi)).toHaveLength(2);
    expect(definitions).toContain(
      "private_verification.brinesearch_issue97_dataset_scope_current",
    );
  });

  it("proves each referenced graph once without weakening receipt checks", () => {
    expect(migration).toContain("graph_refs as materialized");
    expect(migration).toContain("select distinct t.graph_build_id");
    expect(migration).toContain(
      "private_verification.brinesearch_issue97_graph_build_release_current_contextual",
    );
    expect(migration).toContain("t.graph_digest is distinct from j.graph_digest");
    expect(migration).toContain("t.anchor_digest is distinct from a.anchor_digest");
    expect(migration).toContain(
      "t.source_revision_digest is distinct from b.source_revision_digest",
    );
  });

  it("keeps the public execution boundary and authority model unchanged", () => {
    expect(migration).toContain("'statement_timeout=12s'=any(v_status_config)");
    expect(migration).toContain("'statement_timeout=12s'=any(v_choices_config)");
    expect(migration).toContain("'lock_timeout=500ms'=any(v_status_config)");
    expect(migration).toContain("'search_path=\"\"'=any(v_status_config)");
    expect(migration).toContain(
      "private_verification.brinesearch_issue97_authoritative_identity_geometry_digest",
    );
    expect(migration).not.toMatch(/\b(?:insert|update|delete|truncate)\b/i);
    expect(migration).not.toMatch(/fuzzy|nearest|shortest|fastest/i);
    expect(migration).not.toMatch(/rebuild_county_graph|publish_google|cutover_at\s*=/i);
  });
});
