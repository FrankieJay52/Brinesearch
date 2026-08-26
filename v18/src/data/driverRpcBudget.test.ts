import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const statusSource = readFileSync(new URL("./status.ts", import.meta.url), "utf8");
const choicesSource = readFileSync(new URL("./routeChoices.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../../supabase/migrations/20260825015415_v18_driver_rpc_execution_budget.sql", import.meta.url),
  "utf8",
);
const handoffPerformanceMigration = readFileSync(
  new URL("../../../supabase/migrations/20260825234943_v18_cologie_atomic_google_handoff_performance.sql", import.meta.url),
  "utf8",
);

describe("V18 driver RPC execution budget", () => {
  it("keeps each public client bounded beyond its database budget", () => {
    expect(statusSource).toContain("AbortSignal.timeout(25_000)");
    expect(choicesSource).toContain("AbortSignal.timeout(15_000)");
    expect(migration.match(/set statement_timeout='12s'/g)).toHaveLength(2);
    expect(handoffPerformanceMigration).toContain("set statement_timeout='20s'");
  });

  it("changes configuration without weakening route, graph, or Google authority", () => {
    expect(migration).toContain("brinesearch_issue97_graph_build_release_current");
    expect(migration).toContain("brinesearch_v18_exact_route_projection");
    expect(migration).toContain("brinesearch_driver_directions_public");
    expect(migration).not.toMatch(/\b(?:insert|update|delete|truncate)\b/i);
  });
});
