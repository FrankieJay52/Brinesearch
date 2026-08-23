import { describe, expect, it } from "vitest";
import type { PadSummary } from "@/data/types";
import { groupProjectedPads, padFeatureCollection } from "./mapModel";

function pad(overrides: Partial<PadSummary> = {}): PadSummary {
  return {
    padId: "5af84e2b-cec0-4875-99db-3ad198fc3e15",
    canonicalId: "5af84e2b-cec0-4875-99db-3ad198fc3e15",
    legacyId: "acme--alpha",
    aliases: [],
    recordNumber: 1,
    recordRevision: "1",
    recordType: "pad",
    company: "Acme",
    padName: "Alpha",
    state: "Ohio",
    county: "Monroe",
    township: "",
    address: "",
    coordinate: { latitude: 39.8, longitude: -81.2, role: "driver_entrance" },
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: "",
    writtenDirections: "",
    verificationStatus: "verified",
    operatingStatus: "active",
    updatedAt: null,
    ...overrides,
  };
}

describe("padFeatureCollection", () => {
  it("emits only bounded non-zero mapped locations", () => {
    const result = padFeatureCollection([
      pad(),
      pad({ padId: "b1675391-95bf-4221-9bc7-fbe67ae209a7", coordinate: null }),
      pad({ padId: "0f8f8eb6-7c85-4fce-b8d6-c19d8fc095cf", coordinate: { latitude: 0, longitude: 0, role: "reference" } }),
      pad({ padId: "f100e8c5-a9f8-4655-8a28-4504b6a77882", coordinate: { latitude: 95, longitude: -81, role: "reference" } }),
    ]);

    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toMatchObject({
      geometry: { coordinates: [-81.2, 39.8] },
      properties: { company: "Acme", verifiedEntrance: true },
    });
  });
});

describe("groupProjectedPads", () => {
  it("groups nearby projected points without changing their identities", () => {
    const alpha = pad();
    const beta = pad({ padId: "b1675391-95bf-4221-9bc7-fbe67ae209a7", padName: "Beta" });
    const gamma = pad({ padId: "0f8f8eb6-7c85-4fce-b8d6-c19d8fc095cf", padName: "Gamma" });
    const groups = groupProjectedPads([
      { row: alpha, x: 10, y: 12 },
      { row: beta, x: 18, y: 20 },
      { row: gamma, x: 120, y: 120 },
    ], 48);

    expect(groups).toHaveLength(2);
    expect(groups[0].rows.map((row) => row.padName)).toEqual(["Alpha", "Beta"]);
    expect(groups[0]).toMatchObject({ x: 14, y: 16 });
    expect(groups[1].rows[0].padName).toBe("Gamma");
  });
});
