import { describe, expect, it } from "vitest";
import type { PadSummary } from "./types";
import {
  padDestinationNavigationUrl,
  padDestinationPinUrl,
  trustedPadDestination,
  verifiedDriverEntrancePinUrl,
} from "./googleDestination";

function pad(overrides: Partial<PadSummary> = {}): PadSummary {
  return {
    padId: "333598ca-37b3-4b44-9411-a490cc3da672",
    canonicalId: "333598ca-37b3-4b44-9411-a490cc3da672",
    legacyId: "ascent--example",
    aliases: [],
    recordNumber: 1,
    recordRevision: "1",
    recordType: "pad",
    company: "Ascent",
    padName: "EXAMPLE",
    state: "Ohio",
    county: "Harrison",
    township: "Green",
    address: "",
    coordinate: { latitude: 40.25403, longitude: -80.913577, role: "driver_entrance" },
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

describe("trusted pad GPS destinations", () => {
  it("uses snapshot-bound saved pad GPS for one current-location Google destination without implying approval", () => {
    const example = pad({
      coordinate: null,
      mapReference: { latitude: 40.25403, longitude: -80.913577, role: "reference", kind: "saved_pad_reference" },
    });
    expect(trustedPadDestination(example)).toMatchObject({ source: "saved_pad_gps", label: "Saved pad GPS" });
    expect(padDestinationPinUrl(example)).toBe("https://www.google.com/maps/search/?api=1&query=40.25403%2C-80.913577");
    const navigation = new URL(padDestinationNavigationUrl(example)!);
    expect(navigation.pathname).toBe("/maps/dir/");
    expect(navigation.searchParams.get("origin")).toBeNull();
    expect(navigation.searchParams.get("destination")).toBe("40.25403,-80.913577");
    expect(navigation.searchParams.get("travelmode")).toBe("driving");
    expect(navigation.searchParams.get("dir_action")).toBe("navigate");
    expect(verifiedDriverEntrancePinUrl(example)).toBeNull();
  });

  it.each([
    ["official_pad_reference", "official_pad_reference", "ODNR official pad GPS · not an entrance"],
    ["official_wellhead_reference", "official_wellhead_reference", "ODNR official wellhead GPS · not an entrance"],
    ["saved_pad_reference", "saved_pad_gps", "Saved pad GPS"],
  ] as const)("accepts an exact %s projection with its source label", (kind, source, label) => {
    const example = pad({
      coordinate: null,
      mapReference: { latitude: 40.25, longitude: -80.91, role: "reference", kind },
    });
    expect(trustedPadDestination(example)).toEqual({ latitude: 40.25, longitude: -80.91, source, label });
    expect(padDestinationNavigationUrl(example)).toContain("destination=40.25%2C-80.91");
  });

  it("keeps the verified-entrance utility restricted while allowing destination navigation", () => {
    const example = pad({ coordinate: { latitude: 40.2, longitude: -80.8, role: "driver_entrance" } });
    expect(trustedPadDestination(example)?.source).toBe("verified_driver_entrance");
    expect(verifiedDriverEntrancePinUrl(example)).toBe("https://www.google.com/maps/search/?api=1&query=40.2%2C-80.8");
    expect(padDestinationNavigationUrl(example)).toContain("destination=40.2%2C-80.8");
  });

  it("rejects missing, invalid, and packaged-only coordinates as navigation inputs", () => {
    expect(trustedPadDestination(pad({ coordinate: null, mapReference: null, legacyId: "unknown" }))).toBeNull();
    expect(padDestinationNavigationUrl(pad({ coordinate: { latitude: 40.1, longitude: -80.9, role: "legacy_saved" } }))).toBeNull();
    expect(padDestinationNavigationUrl(pad({ coordinate: { latitude: 40.1, longitude: -80.9, role: "saved_pad_destination" }, mapReference: null }))).toBeNull();
  });
});
