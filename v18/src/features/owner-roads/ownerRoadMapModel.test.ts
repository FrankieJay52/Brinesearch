import { describe, expect, it } from "vitest";
import type { OwnerRoadFeature } from "@/data/ownerRoads";
import { ownerRoadCollection, ownerRoadFeatureBounds, ownerRoadJurisdiction, ownerRoadSelection } from "./ownerRoadMapModel";

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
