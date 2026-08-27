import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260827015800_issue97_banjo_oh519_named_core.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Issue #97 BANJO exact OH-519 named approach", () => {
  it("pins the exact target, current graph, junction, identity, and clipped line", () => {
    for (const value of [
      "b7526e45-0b33-4988-ae1c-0a4140971f8e",
      "ascent--banjo",
      "20bc6634-c5de-46bd-9da7-e0785a3796fe",
      "f4e4d43f-e86c-499c-893f-73f2eef3dc29",
      "28810924-2650-8c00-3a6b-23bc24088e2b",
      "a1d85866-9f8d-0cd4-a176-a8aaa2158b12",
      "e883315b-bf54-9192-4556-342bcb7bb1a5",
      "OH:ODOT:NLF:SHASSR00519**C",
      "c070ef779fc51e099df5318ac47ea97f",
      "1.514341",
      "16.967",
    ]) expect(migration).toContain(value);
  });

  it("publishes one reviewed current-location handoff without a stored Google link", () => {
    expect(migration).toContain("via_new_athens");
    expect(migration).toContain("Via New Athens");
    expect(migration).toContain("current_location_to_named_ingress");
    expect(migration).toContain("google_to_saved_gps_unapproved");
    expect(migration).toContain("OH-519 at BANJO lease approach");
    expect(migration).toContain("BANJO verified driver GPS");
    expect(migration).toContain("publicGoogleRowsCreated',false");
    expect(migration).not.toMatch(/https?:\/\//);
    expect(migration).not.toContain("google.com/maps/dir");
  });

  it("does not mutate route, graph, pad, direction, public Google, or cutover authority", () => {
    for (const table of [
      "public.pads",
      "public.brinesearch_route_prep",
      "public.brinesearch_route_prep_steps",
      "public.brinesearch_road_graph_builds",
      "public.brinesearch_driver_directions_public",
      "public.brinesearch_driver_google_routes_public",
      "public.brinesearch_driver_google_handoffs_public",
      "public.brinesearch_issue97_release_state",
    ]) {
      expect(migration).not.toMatch(
        new RegExp(`(?:update|delete\\s+from|insert\\s+into)\\s+${table.replaceAll(".", "\\.")}`, "i"),
      );
    }
    expect(migration).toContain("v_after-'namedApproaches'");
    expect(migration).toContain("Cologie regression changed");
    expect(migration).toContain("Public Google or cutover authority changed");
  });
});
