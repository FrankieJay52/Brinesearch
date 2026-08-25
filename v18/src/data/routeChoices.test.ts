import { describe, expect, it } from "vitest";
import { normalizeDriverRouteChoices } from "./routeChoices";

const padId = "11111111-1111-4111-8111-111111111111";

function projection(order: number, longitude = -80.9) {
  return {
    steps: [{
      order,
      kind: "continue",
      displayName: "OH-7",
      verifiedDesignations: ["OH-7"],
      instruction: "Continue on OH-7",
      distanceMiles: null,
    }],
    geometry: {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { stepOrder: order, privateRoadId: "must-not-survive" },
        geometry: { type: "LineString", coordinates: [[longitude, 40.1], [longitude + .01, 40.11]] },
      }],
    },
  };
}

function choice(routeGroup: "primary" | "alternate", variantIndex: number) {
  return {
    routeKey: `${routeGroup}:${variantIndex}`,
    routeGroup,
    variantIndex,
    lastVerifiedAt: "2026-08-24T23:53:01.785257+00:00",
    statusRevision: "1234567890abcdef1234567890abcdef",
    ...projection(1, -80.9 + variantIndex * .02),
  };
}

describe("driver exact-route choices", () => {
  it("lets a driver choose independently validated primary and alternate projections", () => {
    const choices = normalizeDriverRouteChoices({
      padId,
      choices: [choice("alternate", 2), choice("primary", 1)],
    }, padId);

    expect(choices.map(({ routeKey, label }) => ({ routeKey, label }))).toEqual([
      { routeKey: "primary:1", label: "Route 1" },
      { routeKey: "alternate:2", label: "Route 2" },
    ]);
    expect(JSON.stringify(choices)).not.toContain("privateRoadId");
  });

  it("fails the whole choice set closed when one variant is malformed or duplicated", () => {
    expect(normalizeDriverRouteChoices({ padId, choices: [
      choice("primary", 1),
      { ...choice("alternate", 2), steps: [] },
    ] }, padId)).toEqual([]);
    expect(normalizeDriverRouteChoices({ padId, choices: [choice("primary", 1), choice("primary", 1)] }, padId)).toEqual([]);
  });

  it("does not accept held metadata, arbitrary route keys, or another pad", () => {
    expect(normalizeDriverRouteChoices({ padId, choices: [{
      ...choice("alternate", 2),
      routeKey: "alternate:3",
      routeStatus: "needs_review",
    }] }, padId)).toEqual([]);
    expect(normalizeDriverRouteChoices({ padId: "22222222-2222-4222-8222-222222222222", choices: [choice("primary", 1)] }, padId)).toEqual([]);
  });
});
