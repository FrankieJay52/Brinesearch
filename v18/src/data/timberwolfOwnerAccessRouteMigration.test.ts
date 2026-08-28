import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20260828220318_v18_timberwolf_owner_verified_access_route.sql",
  import.meta.url,
), "utf8").replaceAll("\r\n", "\n");

const fingerprintCapture = migration.match(
  /do \$capture_unchanged_relations\$[\s\S]*?\$capture_unchanged_relations\$;/,
)?.[0] ?? "";

describe("V18 TIMBERWOLF owner-verified access release", () => {
  it("resolves the pad naturally and publishes generated immutable receipt IDs", () => {
    expect(migration).toContain("where pad.legacy_id='eog--timberwolf'");
    expect(migration).toContain("and pad.pad_name='TIMBERWOLF'");
    expect(migration).toContain(
      "if v_pad_id<>'2b4ed9cb-65a3-4fcf-af56-709c17faeb33'::uuid",
    );
    expect(migration).toContain("v_access.receipt_id:=pg_catalog.gen_random_uuid()");
    expect(migration).toContain("v_release.release_id:=pg_catalog.gen_random_uuid()");
    expect(migration.match(/set timezone='UTC'/g)).toHaveLength(2);
    expect(migration).toContain("release_version='v18-owner-access-route-v1'");
    expect(migration).toContain("permits one-way revocation only");
    expect(migration).toContain("Published owner-access route cannot be changed or deleted");
    expect(migration).toMatch(/enable row level security;[\s\S]*force row level security;/i);
  });

  it("freezes the seven exact cards and mixed-authority feature contract", () => {
    const steps = [
      ["'order',1,'kind','turn','displayName','OH-646'", "From US-250 / OH-646, take OH-646 north toward Scio.", "6.586224"],
      ["'order',2,'kind','continue'", "Continue onto OH-151 / Scio-Bowerston Road.", "1.546425"],
      ["'order',3,'kind','turn'", "Turn right onto OH-332 / Scio-Carrollton Road.", "12.833431"],
      ["'order',4,'kind','turn'", "In Carrollton, turn left onto East Main Street, then continue right on OH-43 north / Canton Road NW.", "9.716450"],
      ["'order',5,'kind','turn'", "Turn right onto OH-183 east / Alliance Road NW.", "0.931875"],
      ["'order',6,'kind','turn','displayName','Licking Road NW'", "Turn right onto Licking Road NW.", "0.058617"],
      ["'order',7,'kind','turn','displayName','Verified lease road'", "Turn right onto the verified private lease road and follow it to the Timberwolf pad.", "st_length(v_access_line::extensions.geography)/1609.344"],
    ];
    for (const step of steps) {
      for (const value of step) expect(migration).toContain(value);
    }
    expect(migration.match(/'authority','exact_graph'/g)).toHaveLength(6);
    expect(migration).toContain("'stepOrder',7,'authority','owner_verified_access'");
    expect(migration).toContain(
      "'label','Owner-verified lease access — not ODOT road geometry'",
    );
    expect(migration).toContain("'Private lease access'");
    expect(migration).not.toMatch(/approved route|route approved/i);
  });

  it("freezes ingress, four controls, a separate destination, and no stored link", () => {
    for (const value of [
      "'role','exact_public_route_ingress'",
      "'label','US-250 / OH-646'",
      "'latitude',40.3244839,'longitude',-81.1447655",
      "'latitude',40.6897462,'longitude',-81.1622541",
      "'latitude',40.6987115,'longitude',-81.1490346",
      "'latitude',40.6980889,'longitude',-81.1482753",
      "'role','saved_pad_destination','label','Timberwolf pad'",
      "'latitude',40.692699,'longitude',-81.146851",
      "'originMode','current_location_to_route_ingress'",
      "'handoffMode','owner_verified_controls_v1'",
    ]) expect(migration).toContain(value);
    expect(migration).toContain("pg_catalog.jsonb_array_length(p_waypoints)<>4");
    expect(migration).toContain("'storedNavigationArtifact',false");
    expect(migration).not.toMatch(/'(?:routeUrl|googleUrl|mapsUrl)'\s*,/i);
    expect(migration).not.toMatch(/https?:\/\/(?:www\.)?google\.[^']*\/maps/i);
  });

  it("stores the QA'd private trace with exact evidence and endpoint checks", () => {
    const wkt = "LINESTRING(-81.1482753 40.6980889,-81.1482826 40.6980109,-81.1482962 40.6979733,-81.1483202 40.6979426,-81.1483851 40.6979084,-81.1484671 40.6978879,-81.1488771 40.6976761,-81.1491333 40.6975121,-81.1493896 40.6973242,-81.1495604 40.6971773,-81.1497312 40.6970713,-81.1499533 40.6969073,-81.1500046 40.6968424,-81.1500832 40.6967775,-81.1501481 40.6967092,-81.1501788 40.6966408,-81.1501993 40.6965725,-81.1502164 40.6963333,-81.1502173 40.695625,-81.1502344 40.6950571,-81.1502476 40.6939214,-81.1502211 40.6935429,-81.1501643 40.692975,-81.1501359 40.6925207,-81.1500337 40.692392,-81.1499542 40.6923314,-81.1498482 40.692286,-81.1497157 40.6922671,-81.1489964 40.6922481,-81.1488071 40.6922368,-81.1486179 40.6922444,-81.1482393 40.6922406,-81.1479364 40.6922671,-81.1478418 40.6923011,-81.1476904 40.6923693,-81.1474254 40.6925094,-81.1471414 40.6926154,-81.146851 40.692699)";
    expect(migration).toContain(wkt);
    expect(migration).toContain("extensions.st_npoints(v_access_line)<>38");
    expect(migration).toContain("not between 900 and 1100");
    expect(migration).toContain("v_access.source_kind:='owner_field_trace'");
    expect(migration).toContain("'imagerySource','Esri World Imagery'");
    expect(migration).toContain("4743D94DD1D2DF12EC30BCF1D687070CE1C4B7C5EF3178886A7C8640F5A6E063");
    expect(migration).toContain("A09F350D7ED38F39D0BC32A648B3CB8BF1301966823D8769866314ADABCC3421");
  });

  it("binds exact live graph receipts without changing Issue 97 authority", () => {
    for (const value of [
      "exact_active_issue97_graph",
      "exact_source_identity_key",
      "verified_graph_anchor",
      "'roadManagerMappingRequired',false",
      "'privateGeometryAsOdot',false",
      "'issue97Mutation',false",
      "01e7ad0282ee41e9b0ff8321ad3a1c6a",
      "f0c8a04619ca61ddd4057a1ea72d8450",
      "e4330cb09f7d0b01c911860e956f4bd3",
      "73e540b58ce0d5407535375f0f892572",
      "c1332f19b71013508b6031045b1169cb",
      "b590158363b8fcdf85af8dd560810a90",
    ]) expect(migration).toContain(value);
    expect(migration).toContain("OH-183/Licking Road mapping state changed; graph rebuild is forbidden here");
    expect(migration).toContain("Issue #97 cutover must remain OFF");
    expect(migration).toContain("anchor.id=seed.expected_anchor_id");
    expect(migration).toContain("set local extra_float_digits=3");
    expect(migration).toContain(
      "pg_catalog.abs(extensions.st_y(anchor.geom)-seed.latitude)<1e-12",
    );
    expect(migration).toContain(
      "pg_catalog.abs(extensions.st_x(anchor.geom)-seed.longitude)<1e-12",
    );
    expect(migration).toContain("'longitude',boundary.anchor_longitude");
    expect(migration).toContain("'latitude',boundary.anchor_latitude");
    expect(migration).not.toContain("'longitude',boundary.longitude");
    expect(migration).not.toContain("'latitude',boundary.latitude");
    expect(migration).toMatch(
      /extensions\.st_x\(anchor\.geom\)=\s+\(v_boundary->>'longitude'\)::double precision/,
    );
    expect(migration).toMatch(
      /extensions\.st_y\(anchor\.geom\)=\s+\(v_boundary->>'latitude'\)::double precision/,
    );
    expect(migration).toContain(
      "'latitude',40.6897462,'longitude',-81.1622541",
    );
  });

  it("measures every public receipt from the exact released GeoJSON", () => {
    const released = ["646", "151", "332", "43", "183", "licking"];
    released.forEach((name, index) => {
      expect(migration).toContain(
        `(v_geometry->'features'->${index}->'geometry')::text`,
      );
      expect(migration).toContain(
        `v_${name}_released::extensions.geography`,
      );
      expect(migration).toContain(
        `extensions.st_npoints(v_${name}_released)`,
      );
    });
    expect(migration.match(
      /v_(?:646|151|332|43|183|licking)_released::extensions\.geography/g,
    )).toHaveLength(6);
    expect(migration).toContain(
      "This keeps the strict millimetre currentness check meaningful.",
    );
    expect(migration).toMatch(
      /st_length\(v_line::extensions\.geography\)-[\s\S]*\)>0\.001/,
    );
  });

  it("exposes only the additive atomic wrapper and promotes the frozen status", () => {
    expect(migration).toContain(
      "public.brinesearch_v18_driver_pad_status_with_owner_access(",
    );
    expect(migration).toContain("'{ownerVerifiedAccessRoute}'");
    expect(migration).toContain("'state','ready'");
    expect(migration).toContain("'source','owner_verified_access'");
    expect(migration).toContain("'state','verified_release'");
    expect(migration).toContain(
      "Public-road core is exact ODOT graph geometry; final dashed leg is owner-verified private lease access.",
    );
    for (const key of [
      "releaseId", "releaseVersion", "routeRevision", "publicCoreStepCount",
      "steps", "geometry", "ingress", "privateAccessStart", "destination",
      "finalLegMode", "handoff", "lastVerifiedAt", "statusRevision",
      "releaseDigest", "publishedAt",
    ]) expect(migration).toContain(`'${key}'`);
    expect(migration).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.brinesearch_v18_driver_pad_status_with_named_approaches/i,
    );
  });

  it("never mutates protected route, pad, graph, mapping, Google, or snapshot rows", () => {
    const protectedTables = [
      "public.pads",
      "public.pad_verification_status",
      "public.public_pad_detail",
      "public.brinesearch_route_prep",
      "public.brinesearch_route_prep_steps",
      "public.brinesearch_road_identity_mappings",
      "public.brinesearch_road_graph_builds",
      "public.brinesearch_driver_google_routes_public",
      "public.brinesearch_driver_google_handoffs_public",
      "public.brinesearch_issue97_release_state",
      "public.brinesearch_directory_snapshots_v18",
      "public.brinesearch_directory_snapshot_rows_v18",
      "public.brinesearch_company_road_overlay_snapshots_v18",
      "public.brinesearch_company_road_overlay_rows_v18",
    ];
    for (const table of protectedTables) {
      expect(migration).not.toMatch(new RegExp(
        `(?:insert\\s+into|update|delete\\s+from)\\s+${table.replaceAll(".", "\\.")}`,
        "i",
      ));
    }
    expect(migration).toContain("Protected relation % changed");
    expect(migration).toContain("'brinesearch_v18_public_google_route_releases'");
    expect(migration).toContain("'brinesearch_v18_google_handoff_receipts'");
    for (const id of [
      "d7898e8c-1bb6-48f8-b5e0-87bc1898420e",
      "e2b32e85-9e93-4388-8215-9d8167cbbeb8",
      "518659d9-bca2-47b0-b294-3141ba679fc4",
      "b7526e45-0b33-4988-ae1c-0a4140971f8e",
      "59061829-1122-4aae-872d-cf5024310373",
    ]) expect(migration).toContain(id);
  });

  it("avoids gateway-sized graph scans while retaining exact dependency gates", () => {
    expect(fingerprintCapture).not.toBe("");
    for (const largeRelation of [
      "brinesearch_odot_road_catalog",
      "brinesearch_authoritative_road_identities",
      "brinesearch_authoritative_road_names",
      "brinesearch_authoritative_segment_identity_assignments",
      "brinesearch_road_junctions",
      "brinesearch_road_junction_anchors",
      "brinesearch_road_junction_memberships",
    ]) expect(fingerprintCapture).not.toContain(`'${largeRelation}'`);
    for (const retainedRelation of [
      "brinesearch_roads",
      "brinesearch_road_identity_mappings",
      "brinesearch_road_graph_builds",
      "pads",
      "pad_verification_status",
      "public_pad_detail",
      "brinesearch_directory_snapshots_v18",
      "brinesearch_directory_snapshot_rows_v18",
      "brinesearch_company_road_overlay_snapshots_v18",
      "brinesearch_company_road_overlay_rows_v18",
      "brinesearch_route_prep",
      "brinesearch_route_prep_steps",
      "brinesearch_driver_google_routes_public",
      "brinesearch_driver_google_handoffs_public",
      "brinesearch_driver_core_destination_releases_public",
      "brinesearch_driver_named_approach_releases_public",
      "brinesearch_v18_public_google_route_releases",
      "brinesearch_v18_google_handoff_receipts",
    ]) expect(fingerprintCapture).toContain(`'${retainedRelation}'`);
    expect(fingerprintCapture).toContain("relation.relname like '%issue97%'");
    expect(fingerprintCapture).toContain(
      "relation.relname like 'brinesearch_v18_core_destination%'",
    );
    expect(fingerprintCapture).toContain(
      "relation.relname like 'brinesearch_v18_named_approach%'",
    );
    expect(migration).toContain(
      "brinesearch_v18_owner_access_core_receipt_current",
    );
    expect(migration).toContain(
      "brinesearch_issue97_graph_build_release_current_contextual(build.id)",
    );
    expect(migration).toContain(
      "brinesearch_issue97_authoritative_identity_geometry_digest(",
    );
    expect(migration).toContain(
      "from public.brinesearch_road_junction_memberships membership",
    );
    expect(migration).toContain(
      "brinesearch_v18_owner_access_route_receipt_active(",
    );
  });
});
