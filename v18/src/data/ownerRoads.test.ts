import { describe, expect, it } from "vitest";
import { validateOwnerPadOptions, validateOwnerRoadDetail, validateOwnerRoadViewport } from "./ownerRoads";

const roadProperties = {
  // Production road identities are valid Postgres UUIDs but can use
  // deterministic version/variant nibbles outside RFC 4122 versions 1-5.
  identity_id: "1a054581-6c44-73b2-e89f-8b6d8054b93c",
  canonical_road_id: null,
  display_name: "Lafferty-Bannock Rd",
  canonical_name: "Lafferty-Bannock Road",
  route_system: null,
  route_number: null,
  route_designation: null,
  road_class: "county",
  state_code: "OH",
  county_code: "BEL",
  county_name: "Belmont",
  township: "Kirkwood",
  municipality: null,
  approval_status: "candidate",
  source_current: true,
  mapping_conflict: false,
  occurrence_count: 2,
  pad_count: 1,
  source_identity_key: "OH:ODOT:NLF:PBELCR00010**C",
  source_agency: "Ohio Department of Transportation",
  source_dataset: "ODOT NLF",
  source_version: "2026-08",
};

describe("owner road viewport contract", () => {
  it("preserves exact identity geometry/status and drops injected private fields", () => {
    const parsed = validateOwnerRoadViewport({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[-81.2, 39.8], [-81.19, 39.81]] },
        properties: { ...roadProperties, private_review_notes: "must not escape" },
      }],
      pads: [],
      truncated: false,
      limit: 340,
      zoom: 13,
      private_review_notes: "must not escape",
    });
    expect(parsed?.features[0].properties).toMatchObject({
      identityId: roadProperties.identity_id,
      approvalStatus: "candidate",
      sourceIdentityKey: roadProperties.source_identity_key,
    });
    expect(JSON.stringify(parsed)).not.toContain("private_review_notes");
    expect(JSON.stringify(parsed)).not.toContain("must not escape");
  });

  it("rejects fabricated or out-of-region geometry", () => {
    expect(validateOwnerRoadViewport({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] }, properties: roadProperties }],
      pads: [], truncated: false, limit: 340, zoom: 13,
    })).toBeNull();
  });

  it("rejects malformed nullable identity fields instead of silently clearing them", () => {
    expect(validateOwnerRoadViewport({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[-81.2, 39.8], [-81.19, 39.81]] },
        properties: { ...roadProperties, canonical_road_id: "not-a-uuid" },
      }],
      pads: [], truncated: false, limit: 340, zoom: 13,
    })).toBeNull();
    expect(validateOwnerRoadViewport({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[-81.2, 39.8], [-81.19, 39.81]] },
        properties: { ...roadProperties, municipality: { private_review_notes: "hidden" } },
      }],
      pads: [], truncated: false, limit: 340, zoom: 13,
    })).toBeNull();
    expect(validateOwnerRoadViewport({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[-81.2, 39.8], [-81.19, 39.81]] },
        properties: { ...roadProperties, identity_id: "1a054581-6c44-73b2-e89f-not-a-uuid" },
      }],
      pads: [], truncated: false, limit: 340, zoom: 13,
    })).toBeNull();
  });

  it("keeps an empty selected-pad result fail-closed", () => {
    expect(validateOwnerRoadViewport({ type: "FeatureCollection", features: [], pads: [], truncated: false, limit: 340, zoom: 13 })).toEqual({
      type: "FeatureCollection", features: [], pads: [], truncated: false, limit: 340, zoom: 13, zoomRequired: null,
    });
  });

  it("accepts the deliberately minimal selected-pad marker returned by the viewport RPC", () => {
    const parsed = validateOwnerRoadViewport({
      type: "FeatureCollection",
      features: [],
      pads: [{
        pad_id: "333598ca-37b3-4b44-9411-a490cc3da672",
        pad_name: "Bannock",
        company: "Ascent",
        lat: 40.1,
        lng: -81.2,
      }],
      truncated: false,
      limit: 160,
      zoom: 9,
    });
    expect(parsed?.pads[0]).toEqual({
      padId: "333598ca-37b3-4b44-9411-a490cc3da672",
      padName: "Bannock",
      company: "Ascent",
      state: "",
      latitude: 40.1,
      longitude: -81.2,
    });
  });
});

describe("owner road detail contract", () => {
  it("returns only sanitized owner-safe detail and release-current junction fields", () => {
    const detail = validateOwnerRoadDetail({
      ...roadProperties,
      aliases: ["CR 10"],
      source_record_ids: ["PBELCR00010**C"],
      approval_basis: "Saved route use exists without exact positive truck approval.",
      public_access_status: "public",
      drivable_status: "drivable",
      truck_status: null,
      restriction_summary: null,
      hold_summary: null,
      geometry_status: "exact current authoritative geometry",
      geometry_segment_count: 4,
      bounds: { west: -81.25, south: 39.75, east: -81.1, north: 39.9 },
      pads: [{ pad_id: "333598ca-37b3-4b44-9411-a490cc3da672", pad_name: "Bannock", company: "Ascent", occurrence_count: 2 }],
      known_physical_junctions: 1,
      junctions_truncated: false,
      junctions: [{
        junction_id: "22222222-2222-4222-8222-222222222222",
        display_id: "BEL-1",
        lat: 39.81,
        lng: -81.18,
        connected_roads: [{
          identity_id: "44444444-4444-4444-8444-444444444444",
          display_name: "OH-331",
          road_name_at_junction: "State Route 331",
          route_system: "3",
          route_number: "331",
          road_class: "state_route",
          state_code: "OH",
          county_code: "BEL",
          county_name: "Belmont",
          township: null,
          municipality: null,
          source_identity_key: "OH:ODOT:NLF:PBELSR00331**C",
        }],
      }],
      graph_summary: "release-current build",
      verification_date: "2026-08-16T12:00:00Z",
      private_review_notes: "not returned",
    });
    expect(detail?.pads[0]).toMatchObject({ padName: "Bannock", occurrenceCount: 2 });
    expect(detail?.junctions[0].connectedRoads[0].sourceIdentityKey).toContain("SR00331");
    expect(JSON.stringify(detail)).not.toContain("private_review_notes");
    expect(JSON.stringify(detail)).not.toContain("not returned");
  });
});

describe("owner pad selector contract", () => {
  it("accepts only bounded exact pad identities and coordinates", () => {
    expect(validateOwnerPadOptions([{ pad_id: "333598ca-37b3-4b44-9411-a490cc3da672", pad_name: "Bannock", company: "Ascent", state: "OH", lat: 40.1, lng: -81.2 }]))?.toHaveLength(1);
    expect(validateOwnerPadOptions([{ pad_id: "not-a-uuid", pad_name: "Bannock", company: "Ascent", state: "OH", lat: 40.1, lng: -81.2 }])).toBeNull();
  });
});
