import { describe, expect, it } from "vitest";
import type { OwnerPadOption, OwnerRoadFeature, OwnerRoadViewportRequest } from "@/data/ownerRoads";
import type { PadSummary } from "@/data/types";
import {
  ownerRoadCollection,
  ownerRoadCompanyOptions,
  ownerRoadCoverage,
  ownerRoadFeatureBounds,
  ownerRoadFeaturesBounds,
  ownerRoadFeatureLimit,
  ownerRoadJurisdiction,
  ownerRoadPadOptions,
  ownerRoadPadSearchResults,
  ownerRoadSelection,
  ownerRoadStateCode,
  ownerRoadViewportRequestKey,
} from "./ownerRoadMapModel";

const feature: OwnerRoadFeature = {
  type: "Feature",
  geometry: { type: "MultiLineString", coordinates: [[[-81.2, 39.8], [-81.1, 39.9]], [[-81.3, 39.7], [-81.05, 40]]] },
  properties: {
    identityId: "11111111-1111-4111-8111-111111111111",
    canonicalRoadId: null,
    displayName: "Example Road",
    canonicalName: null,
    routeSystem: null,
    routeNumber: null,
    routeDesignation: null,
    roadClass: "local",
    stateCode: "OH",
    countyCode: "MON",
    countyName: "Monroe",
    township: null,
    municipality: null,
    approvalStatus: "candidate",
    sourceCurrent: true,
    mappingConflict: false,
    occurrenceCount: 1,
    padCount: 1,
    sourceIdentityKey: "OH:TEST:1",
    sourceAgency: "Test",
    sourceDataset: "Test roads",
    sourceVersion: "1",
    displayBoundary: "identity_viewport",
    endpointOffsetMeters: null,
  },
};

describe("owner road map model", () => {
  it("keeps phone viewport payloads bounded while retaining a useful exact-road layer", () => {
    expect(ownerRoadFeatureLimit(390)).toBe(160);
    expect(ownerRoadFeatureLimit(820)).toBe(440);
    expect(ownerRoadFeatureLimit(1_280)).toBe(700);
  });

  it("deduplicates semantically identical viewport requests", () => {
    const request: OwnerRoadViewportRequest = {
      west: -80.9800002,
      south: 39.8000002,
      east: -80.4599998,
      north: 40.2999998,
      zoom: 10,
      state: null,
      county: null,
      roadClasses: ["county", "interstate"],
      routeSystems: null,
      statuses: ["held", "approved_by_policy"],
      search: null,
      padId: null,
      limit: 160,
    };
    expect(ownerRoadViewportRequestKey(request)).toBe(ownerRoadViewportRequestKey({
      ...request,
      west: -80.9800001,
      roadClasses: ["interstate", "county"],
      statuses: ["approved_by_policy", "held"],
    }));
    expect(ownerRoadViewportRequestKey(request)).not.toBe(ownerRoadViewportRequestKey({ ...request, state: "OH" }));
  });

  it("keeps exact identity and status on the selectable map feature", () => {
    expect(ownerRoadCollection([feature]).features[0].properties).toEqual({
      identityId: feature.properties.identityId,
      displayName: "Example Road",
      approvalStatus: "candidate",
      padFocused: false,
    });
    expect(ownerRoadCollection([feature], true).features[0].properties.padFocused).toBe(true);
  });

  it("summarizes only returned exact evidence without inventing route coverage", () => {
    const endpoint: OwnerRoadFeature = {
      ...feature,
      properties: {
        ...feature.properties,
        identityId: "22222222-2222-4222-8222-222222222222",
        approvalStatus: "held",
        occurrenceCount: 2,
        displayBoundary: "pad_endpoint_projection",
        endpointOffsetMeters: 3.2,
      },
    };
    expect(ownerRoadCoverage([feature, endpoint])).toEqual({
      identityCount: 2,
      occurrenceCount: 3,
      endpointCount: 1,
      statusCounts: {
        approved_by_policy: 0,
        explicitly_approved: 0,
        candidate: 1,
        held: 1,
        restricted: 0,
        reference_only: 0,
      },
    });
    expect(ownerRoadCoverage([]).occurrenceCount).toBe(0);
  });

  it("focuses the complete returned exact geometry", () => {
    expect(ownerRoadFeatureBounds(feature)).toEqual({ west: -81.3, south: 39.7, east: -81.05, north: 40 });
    expect(ownerRoadFeaturesBounds([feature, {
      ...feature,
      geometry: { type: "LineString", coordinates: [[-80.9, 40.1], [-80.8, 40.2]] },
    }])).toEqual({ west: -81.3, south: 39.7, east: -80.8, north: 40.2 });
    expect(ownerRoadFeaturesBounds([])).toBeNull();
  });

  it("keeps jurisdiction in selected-road labels", () => {
    expect(ownerRoadJurisdiction(feature.properties)).toBe("OH · Monroe");
  });

  it("loads expensive release-current detail only after an explicit road selection", () => {
    expect(ownerRoadSelection([feature], null)).toBeNull();
    expect(ownerRoadSelection([feature], feature.properties.identityId)).toBe(feature.properties.identityId);
    expect(ownerRoadSelection([], feature.properties.identityId)).toBeNull();
  });

  it("merges every live directory location into the protected route selector", () => {
    const row = (id: string, padName: string, state: string, coordinate: PadSummary["coordinate"], legacyId: string | null = null): PadSummary => ({
      padId: id, canonicalId: id, legacyId, aliases: [], recordNumber: null, recordRevision: "1", recordType: "pad",
      company: "Ascent", padName, state, county: "Belmont", township: "", address: "", coordinate,
      wellNames: [], apiNumbers: [], propertyNumbers: [], safeRoadTerms: [], structuredRoadSequence: "", writtenDirections: "",
      verificationStatus: "", operatingStatus: "", updatedAt: null,
    });
    const protectedOptions: OwnerPadOption[] = [{
      padId: "11111111-1111-4111-8111-111111111111", padName: "Old name", company: "Ascent", state: "OH",
      latitude: 40.2, longitude: -81.3,
    }];
    const merged = ownerRoadPadOptions([
      row("11111111-1111-4111-8111-111111111111", "Bannock", "Ohio", null),
      row("22222222-2222-4222-8222-222222222222", "Directions only", "West Virginia", { latitude: 39.7, longitude: -80.5, role: "driver_entrance" }),
      row("6ef0746f-341a-4d29-9399-a81cfbec11e8", "SCOUT", "Ohio", null, "ascent--scout"),
    ], protectedOptions);
    expect(merged).toHaveLength(3);
    expect(merged.find((pad) => pad.padName === "Bannock")).toMatchObject({ state: "OH", latitude: 40.2, longitude: -81.3 });
    expect(merged.find((pad) => pad.padName === "Directions only")).toMatchObject({ state: "WV", latitude: 39.7, longitude: -80.5 });
    expect(merged.find((pad) => pad.padName === "SCOUT")).toMatchObject({ state: "OH", latitude: 40.165091, longitude: -80.903485 });
    expect(ownerRoadStateCode("Pennsylvania")).toBe("PA");
  });

  it("separates the bounded pad picker by exact company and pad-name text", () => {
    const pads: OwnerPadOption[] = [
      { padId: "11111111-1111-4111-8111-111111111111", padName: "Bannock", company: "Ascent", state: "OH", latitude: 40, longitude: -81 },
      { padId: "22222222-2222-4222-8222-222222222222", padName: "Banjo", company: "Ascent", state: "OH", latitude: 40, longitude: -81 },
      { padId: "33333333-3333-4333-8333-333333333333", padName: "Bannock South", company: "EQT", state: "OH", latitude: 40, longitude: -81 },
      { padId: "44444444-4444-4444-8444-444444444444", padName: "Cabin", company: "", state: "WV", latitude: 40, longitude: -81 },
    ];
    expect(ownerRoadCompanyOptions(pads)).toEqual(["Ascent", "EQT"]);
    expect(ownerRoadPadSearchResults(pads, "Ascent", "bann").map((pad) => pad.padName)).toEqual(["Bannock"]);
    expect(ownerRoadPadSearchResults(pads, "", "nno").map((pad) => pad.padName)).toEqual(["Bannock", "Bannock South"]);
    expect(ownerRoadPadSearchResults(pads, "EQT", "banjo")).toEqual([]);
  });

  it("never renders the entire pad directory as search choices", () => {
    const pads: OwnerPadOption[] = Array.from({ length: 80 }, (_, index) => ({
      padId: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
      padName: `Pad ${String(index).padStart(2, "0")}`,
      company: "Ascent",
      state: "OH",
      latitude: 40,
      longitude: -81,
    }));
    expect(ownerRoadPadSearchResults(pads, "Ascent", "", 12)).toHaveLength(12);
    expect(ownerRoadPadSearchResults(pads, "Ascent", "", 500)).toHaveLength(50);
  });
});
