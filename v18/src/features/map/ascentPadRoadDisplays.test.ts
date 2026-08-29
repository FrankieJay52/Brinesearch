import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PadSummary } from "@/data/types";
import {
  ascentPadRoadDisplayForPad,
  ascentPadRoadDisplaysForDirectory,
  ascentRedContinuationIsEligible,
} from "./ascentPadRoadDisplays";

function pad(overrides: Partial<PadSummary> = {}): PadSummary {
  return {
    padId: "e2b32e85-9e93-4388-8215-9d8167cbbeb8",
    canonicalId: "e2b32e85-9e93-4388-8215-9d8167cbbeb8",
    legacyId: "ascent--cologie",
    aliases: ["ascent--cologie"],
    recordNumber: 108,
    recordRevision: "1787615581785257",
    recordType: "pad",
    company: "Ascent",
    padName: "COLOGIE",
    state: "Ohio",
    county: "Harrison",
    township: "Green",
    address: "",
    coordinate: { role: "driver_entrance", latitude: 40.25403, longitude: -80.913577 },
    mapReference: null,
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: "",
    writtenDirections: "",
    verificationStatus: "",
    operatingStatus: "",
    updatedAt: null,
    ...overrides,
  };
}

function duke(overrides: Partial<PadSummary> = {}): PadSummary {
  return pad({
    padId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
    canonicalId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
    legacyId: "ascent--duke",
    aliases: ["ascent--duke"],
    recordNumber: 126,
    recordRevision: "1786265812046205",
    padName: "DUKE",
    township: "Short Creek",
    coordinate: null,
    mapReference: {
      role: "reference",
      kind: "saved_pad_reference",
      latitude: 40.214409,
      longitude: -80.891316,
    },
    ...overrides,
  });
}

describe("Ascent exact GPS road-line batch", () => {
  it("binds COLOGIE and DUKE only to their exact frozen directory records", () => {
    const displays = ascentPadRoadDisplaysForDirectory([pad(), duke()]);
    expect(displays.map((display) => display.padId)).toEqual([
      "e2b32e85-9e93-4388-8215-9d8167cbbeb8",
      "bb351070-6c94-45e5-942f-e155f9e86f7e",
    ]);
    expect(displays.every((display) => display.company === "Ascent")).toBe(true);
    expect(displays.every((display) => display.displayScope === "persistent-main-map-all-and-ascent")).toBe(true);
  });

  it("ends every published teal arrival at that exact saved GPS", () => {
    for (const display of ascentPadRoadDisplaysForDirectory([pad(), duke()])) {
      expect(display.arrival.colorRole).toBe("teal");
      expect(display.arrival.coordinates.at(-1)).toEqual(display.savedPin);
      expect(display.redContinuation).toBeNull();
    }
  });

  it("freezes the reviewed coordinates and expected point counts", () => {
    const displays = ascentPadRoadDisplaysForDirectory([pad(), duke()]);
    expect(displays.map((display) => display.arrival.coordinates.length)).toEqual([277, 253]);
    expect(displays.map((display) => createHash("sha256")
      .update(JSON.stringify(display.arrival.coordinates))
      .digest("hex"))).toEqual([
      "d892361582fabc06cd5ba3a3426d56bf063d50be72dcc8ea7fc0e6a30afe9392",
      "2708db887528c801b6f9df839337999baa77698365e6777933523702c6935d5c",
    ]);
  });

  it("fails closed for stale, moved, mismatched, missing, or duplicate records", () => {
    expect(ascentPadRoadDisplayForPad(pad({ recordRevision: "1787615581785258" }))).toBeNull();
    expect(ascentPadRoadDisplayForPad(pad({ company: "Other" }))).toBeNull();
    expect(ascentPadRoadDisplayForPad(pad({ coordinate: { role: "driver_entrance", latitude: 40.254031, longitude: -80.913577 } }))).toBeNull();
    // The exact legacy-ID packaged reference is an intentional offline-safe
    // coordinate fallback for this otherwise exact canonical record.
    expect(ascentPadRoadDisplayForPad(duke({ mapReference: null }))).not.toBeNull();
    expect(ascentPadRoadDisplaysForDirectory([pad(), duke(), duke()]).map((display) => display.padId)).toEqual([
      "e2b32e85-9e93-4388-8215-9d8167cbbeb8",
    ]);
  });

  it("allows red only with exact no-downstream-pad proof on a non-highway road", () => {
    const expectedPadId = "333598ca-37b3-4b44-9411-a490cc3da672";
    const expectedSavedPin: [number, number] = [-81.01, 40.11];
    const geometrySha256 = "7969ce7d19cb558fb2ba92efbc7ab1ee47bf10b404b24ad0bb5e13d2f879261d";
    const candidate = {
      type: "LineString",
      colorRole: "red",
      visibility: "main-map-all-and-ascent",
      label: "Last pad to OH-149",
      roadClass: "county",
      exactRoadIdentity: "CR-10",
      geometrySha256,
      coordinates: [[-81.01, 40.11], [-81.02, 40.12]],
      noDownstreamPadsProof: {
        directorySnapshotId: "098667bf-a39f-4e7b-86e1-0706c882943c",
        sourceRevision: "6",
        lastPadId: expectedPadId,
        lastPadSavedGps: expectedSavedPin,
        exactRoadIdentity: "CR-10",
        redGeometrySha256: geometrySha256,
      },
      nextHighway: {
        roadClass: "state",
        designation: "OH-149",
        junction: [-81.02, 40.12],
      },
    };
    expect(ascentRedContinuationIsEligible(candidate, expectedPadId, expectedSavedPin)).toBe(true);
    expect(ascentRedContinuationIsEligible({ ...candidate, roadClass: "state" }, expectedPadId, expectedSavedPin)).toBe(false);
    expect(ascentRedContinuationIsEligible({ ...candidate, noDownstreamPadsProof: null }, expectedPadId, expectedSavedPin)).toBe(false);
    expect(ascentRedContinuationIsEligible(candidate, "wrong-pad", expectedSavedPin)).toBe(false);
    expect(ascentRedContinuationIsEligible(candidate, expectedPadId, [-81.011, 40.11])).toBe(false);
    expect(ascentRedContinuationIsEligible({ ...candidate, coordinates: [[-81.01, 40.11], [-81.021, 40.12]] }, expectedPadId, expectedSavedPin)).toBe(false);
    expect(ascentRedContinuationIsEligible({
      ...candidate,
      noDownstreamPadsProof: { ...candidate.noDownstreamPadsProof, redGeometrySha256: "0".repeat(64) },
    }, expectedPadId, expectedSavedPin)).toBe(false);
  });
});
