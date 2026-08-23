import { describe, expect, it } from "vitest";
import type { OwnerRoadFeature, OwnerRoadViewportRequest } from "@/data/ownerRoads";
import {
  ownerRoadCollection,
  ownerRoadFeatureBounds,
  ownerRoadFeatureLimit,
  ownerRoadJurisdiction,
  ownerRoadSelection,
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
    });
  });

  it("focuses the complete returned exact geometry", () => {
    expect(ownerRoadFeatureBounds(feature)).toEqual({ west: -81.3, south: 39.7, east: -81.05, north: 40 });
  });

  it("keeps jurisdiction in selected-road labels", () => {
    expect(ownerRoadJurisdiction(feature.properties)).toBe("OH · Monroe");
  });

  it("always selects an exact visible identity when roads are loaded", () => {
    expect(ownerRoadSelection([feature], null)).toBe(feature.properties.identityId);
    expect(ownerRoadSelection([feature], feature.properties.identityId)).toBe(feature.properties.identityId);
    expect(ownerRoadSelection([], feature.properties.identityId)).toBeNull();
  });
});
