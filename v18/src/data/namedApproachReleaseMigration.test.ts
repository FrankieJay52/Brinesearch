import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20260826223616_v18_named_approach_release_contract.sql",
  import.meta.url,
), "utf8").replaceAll("\r\n", "\n");

describe("V18 immutable named-approach release infrastructure", () => {
  it("creates empty private/public immutable receipt tables with forced RLS", () => {
    expect(migration).toContain(
      "create table private_verification.brinesearch_v18_named_approach_releases",
    );
    expect(migration).toContain(
      "create table public.brinesearch_driver_named_approach_releases_public",
    );
    expect(migration).toContain("release_version='v18-named-approach-v1'");
    expect(migration).toContain("Immutable named-approach release permits one-way revocation only");
    expect(migration).toContain("Published named-approach release cannot be changed or deleted");
    expect(migration).toMatch(/enable row level security;[\s\S]*force row level security;/i);
    expect(migration).toContain("Infrastructure migration unexpectedly published an approach");
    expect(migration).toContain(
      "unique(pad_id,approach_key,release_version,route_revision)",
    );
    expect(migration).toContain(
      "create unique index brinesearch_v18_named_approach_active_pad_idx",
    );
    expect(migration).not.toMatch(
      /insert\s+into\s+(?:private_verification\.brinesearch_v18_named_approach_releases|public\.brinesearch_driver_named_approach_releases_public)/i,
    );
  });

  it("gates byte-identical active receipts and exposes the exact camelCase row shape", () => {
    expect(migration).toContain("brinesearch_v18_named_approach_release_digest");
    expect(migration).toContain("brinesearch_v18_named_approach_release_receipt_active");
    expect(migration).toContain("build.id=v_private.graph_build_id");
    expect(migration).toContain("build.status='active'");
    expect(migration).toContain(
      "build.graph_digest is not distinct from v_private.graph_digest",
    );
    expect(migration).toContain("route.id=v_private.route_prep_id");
    expect(migration).toContain(
      "route.source_sequence_hash is not distinct from\n           v_private.source_sequence_hash",
    );
    expect(migration).not.toContain(
      "route.route_group is not distinct from v_private.route_group",
    );
    expect(migration).not.toContain(
      "route.variant_index is not distinct from v_private.variant_index",
    );
    for (const key of [
      "approachKey",
      "approachLabel",
      "routeGroup",
      "variantIndex",
      "releaseVersion",
      "routeRevision",
      "steps",
      "geometry",
      "ingress",
      "coreEnd",
      "destination",
      "finalLegMode",
      "handoff",
      "lastVerifiedAt",
      "statusRevision",
      "releaseDigest",
      "publishedAt",
    ]) {
      expect(migration).toContain(`'${key}'`);
    }
    expect(migration).toContain("'exact_approved_ingress'");
    expect(migration).toContain("'exact_approved_handoff'");
    expect(migration).toContain("'driver_entrance','saved_pad_destination'");
    expect(migration).toContain("'current_location_to_named_ingress'");
    expect(migration).toContain("'full_geometry_endpoints','verified_compact'");
    expect(migration).toContain("'full_approved_route'");
    expect(migration).toContain("'google_to_saved_gps_unapproved'");
    expect(migration).toContain("brinesearch_v18_named_approach_waypoints_valid");
    expect(migration).toContain(
      "pg_catalog.jsonb_array_length(p_waypoints) not between 1 and 3",
    );
    expect(migration).toContain(
      "v_seen @> pg_catalog.jsonb_build_array(v_waypoint)",
    );
    expect(migration).toContain(
      "(handoff-array['originMode','handoffMode','waypoints']::text[])='{}'::jsonb",
    );
    expect(migration).toContain(
      "'role','exact_approved_ingress'",
    );
    expect(migration).toContain(
      "'originMode','current_location_to_named_ingress'",
    );
  });

  it("stores and returns no navigation URL", () => {
    expect(migration).toContain("brinesearch_v18_named_approach_has_navigation_link");
    expect(migration).toContain("Returns no private evidence or stored navigation link");
    expect(migration).not.toMatch(/'(?:url|googleUrl|mapsUrl)'\s*,/i);
    expect(migration).not.toMatch(/https?:\/\/(?:www\.)?google\.[^']*\/maps/i);
    expect(migration).toContain("[a-z][a-z0-9+.-]*://|geo:|google[.]navigation:");
  });

  it("atomically adds namedApproaches through a separate additive wrapper", () => {
    expect(migration).toContain(
      "public.brinesearch_v18_driver_pad_status_with_named_approaches(p_pad_id uuid)",
    );
    expect(migration).toContain(
      "public.brinesearch_v18_driver_pad_status_with_google_handoff(p_pad_id)",
    );
    expect(migration).toContain(
      "public.brinesearch_v18_driver_named_approaches(p_pad_id)",
    );
    expect(migration).toContain(
      "grant execute on function public.brinesearch_v18_driver_named_approaches(uuid)\nto service_role;",
    );
    expect(migration).not.toContain(
      "grant execute on function public.brinesearch_v18_driver_named_approaches(uuid)\nto anon,authenticated,service_role;",
    );
    expect(migration).toContain("'{namedApproaches}'");
    expect(migration).toContain(
      "approach.value->>'statusRevision'=\n            base.value#>>'{status,statusRevision}'",
    );
    expect(migration).toContain("v_after_bundle->'namedApproaches' is distinct from '[]'::jsonb");
    expect(migration).toContain("(v_after_bundle-'namedApproaches') is distinct from v_before_bundle");
    expect(migration).toContain("statement_timeout='2s'");
    expect(migration).toContain("statement_timeout='20s'");
    expect(migration).toContain("set search_path=''\nset statement_timeout");
    expect(migration).not.toMatch(/\balter\s+function\b/i);
    expect(migration).not.toMatch(/\brename\s+to\b/i);
    expect(migration).not.toMatch(/\bdrop\s+function\b/i);
    expect(migration).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.brinesearch_v18_driver_pad_status_with_google_handoff/i,
    );
  });

  it("preserves Cologie, LASSO, and revoked HAMILTON/SPROULL bytes", () => {
    expect(migration).toContain("'518659d9-bca2-47b0-b294-3141ba679fc4'");
    expect(migration).toContain("'e2b32e85-9e93-4388-8215-9d8167cbbeb8'");
    expect(migration).toContain("'b9a8e55c-3583-4019-85fc-54a03d420ace'");
    expect(migration).toContain("'f5a82acf-d7c0-4ce3-ad4e-0de810551450'");
    expect(migration).toContain("LASSO or revoked HAMILTON/SPROULL releases changed");
    expect(migration).toContain("Existing driver envelope changed for %");
    expect(migration).toContain(
      ") is distinct from false\n     or private_verification.brinesearch_v18_core_destination_release_receipt_active(",
    );
  });

  it("does not mutate graph, route, ordinary Google, or cutover authority", () => {
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_road_graph_builds/i,
    );
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_route_prep/i,
    );
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.brinesearch_driver_google_/i,
    );
    expect(migration).not.toMatch(/update\s+public\.brinesearch_issue97_release_state/i);
    expect(migration).toContain("Google, cutover, graph, or route authority changed");
  });
});
