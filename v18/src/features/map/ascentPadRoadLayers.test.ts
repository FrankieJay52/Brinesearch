import { describe, expect, it } from "vitest";
import type { AscentPadRoadDisplay } from "./ascentPadRoadDisplays";
import {
  ascentPadRoadCollection,
  ascentPadRoadLayerIdsInPaintOrder,
  ascentPadRoadRedLineLayerId,
  ascentPadRoadTealLineLayerId,
} from "./ascentPadRoadLayers";

const display: AscentPadRoadDisplay = {
  padId: "pad-1",
  padName: "PAD ONE",
  company: "Ascent",
  displayScope: "persistent-main-map-all-and-ascent",
  displayAuthority: "display only",
  savedPin: [-80.9, 40.2],
  reviewedRoadSequence: "OH-9 → CR-1 → saved GPS",
  arrival: {
    type: "LineString",
    colorRole: "teal",
    visibility: "main-map-all-and-ascent",
    label: "arrival",
    coordinates: [[-81, 40.1], [-80.9, 40.2]],
  },
  redContinuation: null,
  redDecision: { state: "not_drawn", reason: "No proof" },
};

describe("Ascent native road-line layers", () => {
  it("creates one pad-bound teal feature and no invented red feature", () => {
    expect(ascentPadRoadCollection([display])).toEqual({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {
          padId: "pad-1",
          company: "Ascent",
          colorRole: "teal",
          label: "arrival",
        },
        geometry: {
          type: "LineString",
          coordinates: [[-81, 40.1], [-80.9, 40.2]],
        },
      }],
    });
  });

  it("keeps red continuations below teal and selected emphasis in paint order", () => {
    expect(ascentPadRoadLayerIdsInPaintOrder.indexOf(ascentPadRoadRedLineLayerId))
      .toBeLessThan(ascentPadRoadLayerIdsInPaintOrder.indexOf(ascentPadRoadTealLineLayerId));
    expect(ascentPadRoadLayerIdsInPaintOrder.at(-1)).toContain("selected-line");
  });
});
