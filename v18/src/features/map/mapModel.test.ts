import { describe, expect, it } from "vitest";
import type { PadSummary } from "@/data/types";
import { groupCoincidentProjectedPads, mapDisplayCoordinate, padFeatureCollection } from "./mapModel";

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

  it("uses an exact-identity packaged GPS only as a legacy-saved display point", () => {
    const scout = pad({
      padId: "6ef0746f-341a-4d29-9399-a81cfbec11e8",
      canonicalId: "6ef0746f-341a-4d29-9399-a81cfbec11e8",
      legacyId: "ascent--scout",
      company: "Ascent",
      padName: "SCOUT",
      coordinate: null,
    });
    expect(mapDisplayCoordinate(scout)).toEqual({ latitude: 40.165091, longitude: -80.903485, role: "legacy_saved" });
    expect(scout.coordinate).toBeNull();
    expect(padFeatureCollection([scout]).features[0]).toMatchObject({
      geometry: { coordinates: [-80.903485, 40.165091] },
      properties: { verifiedEntrance: false },
    });
  });
});

describe("groupCoincidentProjectedPads", () => {
  it("groups only exact-coordinate records and leaves nearby points separate", () => {
    const alpha = pad();
    const beta = pad({ padId: "b1675391-95bf-4221-9bc7-fbe67ae209a7", padName: "Beta" });
    const gamma = pad({
      padId: "0f8f8eb6-7c85-4fce-b8d6-c19d8fc095cf",
      padName: "Gamma",
      coordinate: { latitude: 39.80001, longitude: -81.20001, role: "driver_entrance" },
    });
    const groups = groupCoincidentProjectedPads([
      { row: alpha, coordinate: alpha.coordinate!, x: 10, y: 12 },
      { row: beta, coordinate: beta.coordinate!, x: 18, y: 20 },
      { row: gamma, coordinate: gamma.coordinate!, x: 19, y: 21 },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].rows.map((row) => row.padName)).toEqual(["Alpha", "Beta"]);
    expect(groups[0]).toMatchObject({ x: 14, y: 16 });
    expect(groups[1].rows[0].padName).toBe("Gamma");
  });
});
