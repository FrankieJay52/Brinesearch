import { describe, expect, it } from "vitest";
import type { OwnerPadOption, OwnerRoadFeature, OwnerRoadViewportRequest } from "@/data/ownerRoads";
import type { PadSummary } from "@/data/types";
import {
  ownerRoadCollection,
  ownerRoadFeatureBounds,
  ownerRoadFeaturesBounds,
  ownerRoadFeatureLimit,
  ownerRoadJurisdiction,
  ownerRoadPadOptions,
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
    const row = (id: string, padName: string, state: string, coordinate: PadSummary["coordinate"]): PadSummary => ({
      padId: id, canonicalId: id, legacyId: null, aliases: [], recordNumber: null, recordRevision: "1", recordType: "pad",
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
    ], protectedOptions);
    expect(merged).toHaveLength(2);
    expect(merged.find((pad) => pad.padName === "Bannock")).toMatchObject({ state: "OH", latitude: 40.2, longitude: -81.3 });
    expect(merged.find((pad) => pad.padName === "Directions only")).toMatchObject({ state: "WV", latitude: 39.7, longitude: -80.5 });
    expect(ownerRoadStateCode("Pennsylvania")).toBe("PA");
  });
});
