import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20260826013012_v18_released_google_handoff_snapshot.sql",
  import.meta.url,
), "utf8");

describe("released Google handoff snapshot migration", () => {
  it("exposes only the byte-identical unrevoked reviewed release", () => {
    expect(migration).toContain("brinesearch_v18_driver_google_handoff_release");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path=''\nset statement_timeout='1s'\nset lock_timeout='500ms'");
    expect(migration).toContain("receipt.revoked_at is null");
    expect(migration).toContain("receipt.handoff=projection.handoff");
    expect(migration).toContain("receipt.handoff_digest=projection.handoff_digest");
    expect(migration).toContain("receipt.verified_at=projection.published_at");
  });

  it("keeps grants exact and never returns private evidence", () => {
    expect(migration).toMatch(/revoke all on function[\s\S]*from public,anon,authenticated,service_role;/i);
    expect(migration).toMatch(/grant execute on function[\s\S]*to anon,authenticated,service_role;/i);
    expect(migration).not.toMatch(/'evidence'\s*,/i);
    expect(migration).not.toMatch(/'authorizationBasis'\s*,/i);
  });

  it("does not recompute or mutate route, graph, Google, or pad authority", () => {
    expect(migration).not.toMatch(/brinesearch_v18_google_handoff_current\s*\(/i);
    expect(migration).not.toMatch(/brinesearch_issue97_google_route_current\s*\(/i);
    expect(migration).not.toMatch(/\b(?:insert\s+into|update|delete\s+from|truncate)\b/i);
    expect(migration).not.toMatch(/rebuild_county_graph|publish_google|cutover_at\s*=/i);
  });
});
