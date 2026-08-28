import { describe, expect, it } from "vitest";
import { ownerVerifiedAccessFixture } from "./ownerVerifiedAccessFixture";
import { routeLineGroups } from "./routeLineGroups";

describe("route line authority groups", () => {
  it("keeps the six exact features solid and isolates only the owner access feature for dashing", () => {
    const release = ownerVerifiedAccessFixture();
    const groups = routeLineGroups(release.geometry);

    expect(groups.exact).toHaveLength(6);
    expect(groups.ownerVerifiedAccess).toHaveLength(1);
    expect(groups.ownerVerifiedAccess[0]).toEqual(release.geometry.features[6].geometry.coordinates);
  });

  it("leaves existing geometry without authority metadata entirely unchanged", () => {
    const geometry = {
      type: "FeatureCollection" as const,
      features: [{
        type: "Feature" as const,
        properties: { stepOrder: 1 },
        geometry: { type: "LineString" as const, coordinates: [[-81, 40], [-80.9, 40.1]] as [number, number][] },
      }],
    };

    expect(routeLineGroups(geometry)).toEqual({
      exact: [[[-81, 40], [-80.9, 40.1]]],
      ownerVerifiedAccess: [],
    });
  });
});
