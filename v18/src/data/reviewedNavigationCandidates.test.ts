import { describe, expect, it } from "vitest";
import type { PadSummary } from "./types";
import {
  BEETLE_REVIEWED_GOOGLE_URL,
  BILINOVICH_REVIEWED_GOOGLE_URL,
  DUKE_REVIEWED_GOOGLE_URL,
  LAWSON_REVIEWED_GOOGLE_URL,
  PORTERFIELD_REVIEWED_GOOGLE_URL,
  buildReviewedNavigationUrl,
  reviewedNavigationCandidateForPad,
  reviewedNavigationSafetyHoldForPad,
  reviewedNavigationUrlMatchesContract,
} from "./reviewedNavigationCandidates";

function bilinovich(): PadSummary {
  return {
    padId: "59061829-1122-4aae-872d-cf5024310373",
    canonicalId: "59061829-1122-4aae-872d-cf5024310373",
    legacyId: "ascent--bilinovich",
    aliases: [],
    recordNumber: 77,
    recordRevision: "1787794115232844",
    recordType: "pad",
    company: "Ascent",
    padName: "BILINOVICH",
    state: "Ohio",
    county: "Guernsey",
    township: "LONDONDERRY",
    address: "23212 Turkle Road",
    coordinate: null,
    mapReference: null,
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: ["Logan Rd / CR-964"],
    structuredRoadSequence: "I-70 W → Exit 193 → OH-513 N → US-22 E → McCoy Rd → Blaze Rd → Logan Rd → Turkle Rd / lease access → BILINOVICH",
    writtenDirections: "",
    verificationStatus: "official_api_verified",
    operatingStatus: "ACTIVE",
    updatedAt: "2026-08-27T01:28:35.232844Z",
  };
}

function lawson(): PadSummary {
  return {
    ...bilinovich(),
    padId: "143f5268-33e4-4598-8101-40220b5cfdc4",
    canonicalId: "143f5268-33e4-4598-8101-40220b5cfdc4",
    legacyId: "ascent--lawson",
    recordRevision: "1786258360881449",
    padName: "LAWSON",
    address: "23291 Millers Fork Road",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → US-250 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → I-70 → Exit 193 → OH-513 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd",
    mapReference: { latitude: 40.124991, longitude: -81.295913, role: "reference", kind: "saved_pad_reference" },
  };
}

function correctedBilinovich(): PadSummary {
  return {
    ...bilinovich(),
    recordRevision: "1787802711836476",
    structuredRoadSequence: "US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH",
    mapReference: { latitude: 40.08863, longitude: -81.304164, role: "reference", kind: "saved_pad_reference" },
  };
}

function beetle(): PadSummary {
  return {
    ...bilinovich(),
    padId: "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
    canonicalId: "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
    legacyId: "ascent--beetle",
    recordRevision: "1787459253071652",
    padName: "BEETLE",
    county: "Harrison",
    township: "SHORT CREEK",
    address: "",
    structuredRoadSequence: "OH-519 → US-250 → Pad",
    coordinate: null,
    mapReference: { latitude: 40.185403, longitude: -80.922718, role: "reference", kind: "saved_pad_reference" },
  };
}

function duke(): PadSummary {
  return {
    ...bilinovich(),
    padId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
    canonicalId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
    legacyId: "ascent--duke",
    recordRevision: "1786265812046205",
    padName: "DUKE",
    county: "Harrison",
    township: "GREEN",
    address: "",
    structuredRoadSequence: "US-250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd",
    mapReference: { latitude: 40.214409, longitude: -80.891316, role: "reference", kind: "saved_pad_reference" },
  };
}

function porterfield(): PadSummary {
  return {
    ...bilinovich(),
    padId: "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
    canonicalId: "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
    legacyId: "ascent--porterfield-gas-unit",
    recordRevision: "1786258360881449",
    padName: "PORTERFIELD GAS UNIT",
    county: "Belmont",
    township: "Richland",
    structuredRoadSequence: "I-70 → Exit 215 → US-40 → Vineyard Rd → OR → OH-331 → US-40 → Vineyard Rd",
    mapReference: { latitude: 40.090431, longitude: -80.928503, role: "reference", kind: "saved_pad_reference" },
  };
}

describe("reviewed navigation candidates", () => {
  it("builds current-location Google handoffs and rejects invalid waypoint counts or coordinates", () => {
    const url = new URL(buildReviewedNavigationUrl(
      { latitude: 40.2, longitude: -80.9 },
      [{ latitude: 40.21, longitude: -80.91 }],
    ));
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(() => buildReviewedNavigationUrl({ latitude: 40.2, longitude: -80.9 }, [])).toThrow();
    expect(() => buildReviewedNavigationUrl({ latitude: 40.2, longitude: -80.9 }, [
      { latitude: 40.21, longitude: -80.91 },
      { latitude: 40.22, longitude: -80.92 },
      { latitude: 40.23, longitude: -80.93 },
      { latitude: 40.24, longitude: -80.94 },
    ])).toThrow();
    expect(() => buildReviewedNavigationUrl(
      { latitude: Number.NaN, longitude: -80.9 },
      [{ latitude: 40.21, longitude: -80.91 }],
    )).toThrow();
  });

  it("rejects duplicate, missing, unknown, fixed-origin, and over-budget URL parameters", () => {
    const destination = { latitude: 40.2, longitude: -80.9 };
    const waypoints = [{ latitude: 40.21, longitude: -80.91 }];
    const valid = buildReviewedNavigationUrl(destination, waypoints);
    expect(reviewedNavigationUrlMatchesContract(valid, destination, waypoints)).toBe(true);
    expect(reviewedNavigationUrlMatchesContract(`${valid}&destination=40.3%2C-80.8`, destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(`${valid}&api=1`, destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(`${valid}&origin=Cadiz%2C%20OH`, destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(`${valid}&unexpected=1`, destination, waypoints)).toBe(false);
    expect(reviewedNavigationUrlMatchesContract(valid.replace("&waypoints=40.21%2C-80.91", ""), destination, waypoints)).toBe(false);
    const fourWaypoints = `${valid}&waypoints=40.21%2C-80.91%7C40.22%2C-80.92%7C40.23%2C-80.93%7C40.24%2C-80.94`;
    expect(reviewedNavigationUrlMatchesContract(fourWaypoints, destination, waypoints)).toBe(false);
  });

  it("withdraws the unsafe BILINOVICH Blaze handoff and binds the safety hold to the exact stale record", () => {
    expect(reviewedNavigationCandidateForPad(bilinovich())).toBeNull();
    expect(reviewedNavigationSafetyHoldForPad(bilinovich())).toMatchObject({
      padId: "59061829-1122-4aae-872d-cf5024310373",
      title: "Reviewed route withdrawn",
      detail: "Do not use Blaze Road · corrected route pending",
    });
  });

  it("returns the exact corrected BILINOVICH no-Blaze handoff without promoting graph authority", () => {
    const corrected = correctedBilinovich();
    const candidate = reviewedNavigationCandidateForPad(corrected);

    expect(candidate).toMatchObject({
      padId: "59061829-1122-4aae-872d-cf5024310373",
      title: "Navigate reviewed route",
      detail: "McCoy → Merry → Penrose → Logan → Turkle → pad GPS",
      routeUrl: BILINOVICH_REVIEWED_GOOGLE_URL,
    });
    expect(reviewedNavigationSafetyHoldForPad(corrected)).toBeNull();

    const url = new URL(candidate!.routeUrl);
    const waypoints = url.searchParams.get("waypoints")?.split("|");
    expect(url.searchParams.get("origin")).toBeNull();
    expect(BILINOVICH_REVIEWED_GOOGLE_URL).toBe("https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.08738445%2C-81.30282620&waypoints=40.123106982%2C-81.353948693%7C40.095894612%2C-81.283992781%7C40.099684564%2C-81.297880136");
    expect(url.searchParams.get("destination")).toBe("40.08738445,-81.30282620");
    expect(waypoints).toEqual([
      "40.123106982,-81.353948693",
      "40.095894612,-81.283992781",
      "40.099684564,-81.297880136",
    ]);
    expect(waypoints).toHaveLength(3);
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(candidate!.routeUrl).not.toContain("40.112583770%2C-81.294937982");
  });

  it.each([
    ["padId", "not-bilinovich"],
    ["canonicalId", "not-bilinovich"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "BILINOVICH EAST"],
    ["state", "West Virginia"],
    ["county", "Harrison"],
    ["structuredRoadSequence", "McCoy Rd → Merry Rd → Pad"],
  ] as const)("fails the corrected BILINOVICH handoff closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...correctedBilinovich(), [field]: value })).toBeNull();
  });

  it.each([
    ["padId", "not-bilinovich"],
    ["canonicalId", "not-bilinovich"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "BILINOVICH EAST"],
    ["state", "West Virginia"],
    ["county", "Harrison"],
    ["structuredRoadSequence", "McCoy Rd → Merry Rd → Pad"],
  ] as const)("fails the BILINOVICH safety hold closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...bilinovich(), [field]: value })).toBeNull();
    expect(reviewedNavigationSafetyHoldForPad({ ...bilinovich(), [field]: value })).toBeNull();
  });

  it("returns LAWSON's exact reviewed road-core-to-GPS handoff without promoting graph authority", () => {
    const candidate = reviewedNavigationCandidateForPad(lawson());
    expect(candidate).toMatchObject({
      padId: "143f5268-33e4-4598-8101-40220b5cfdc4",
      title: "Navigate reviewed route",
      detail: "Reviewed road core → saved GPS · graph status separate",
      routeUrl: LAWSON_REVIEWED_GOOGLE_URL,
    });

    const url = new URL(candidate!.routeUrl);
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("destination")).toBe("40.124991,-81.295913");
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual([
      "40.123106982,-81.353948693",
      "40.111789555,-81.300978103",
      "40.124973191,-81.294865644",
    ]);
    expect(url.searchParams.get("dir_action")).toBe("navigate");
  });

  it.each([
    ["canonicalId", "not-lawson"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "LAWSON EAST"],
    ["county", "Harrison"],
    ["structuredRoadSequence", "US-22 → nearest road → LAWSON"],
  ] as const)("fails LAWSON closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...lawson(), [field]: value })).toBeNull();
  });

  it("fails LAWSON and BILINOVICH closed when their current trusted record coordinate drifts", () => {
    expect(reviewedNavigationCandidateForPad({
      ...lawson(),
      mapReference: { latitude: 40.125, longitude: -81.295913, role: "reference", kind: "saved_pad_reference" },
    })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...correctedBilinovich(),
      mapReference: { latitude: 40.08863, longitude: -81.304, role: "reference", kind: "saved_pad_reference" },
    })).toBeNull();
  });

  it("returns BEETLE's owner-reviewed Sixteen Road handoff without promoting graph authority", () => {
    const candidate = reviewedNavigationCandidateForPad(beetle());
    expect(BEETLE_REVIEWED_GOOGLE_URL).toBe("https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.185403%2C-80.922718&waypoints=40.1869745925099%2C-80.9192177275288%7C40.185340499%2C-80.919294431%7C40.185025%2C-80.920500");

    expect(candidate).toMatchObject({
      padId: "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
      title: "Navigate reviewed route",
      detail: "OH-519 → Sixteen Rd → lease approach · GPS-only final leg",
      routeUrl: BEETLE_REVIEWED_GOOGLE_URL,
      reviewedRoadSequence: "OH-519 → Sixteen Rd → lease approach → saved pad GPS",
      finalLegNotice: expect.stringContaining("not approved public-road geometry"),
    });

    const url = new URL(candidate!.routeUrl);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("destination")).toBe("40.185403,-80.922718");
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual([
      "40.1869745925099,-80.9192177275288",
      "40.185340499,-80.919294431",
      "40.185025,-80.920500",
    ]);
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(candidate!.routeUrl).not.toContain("40.1870079210496%2C-80.9203701394203");
    expect(candidate!.routeUrl).not.toContain("40.1871547%2C-80.9192191");
    expect(candidate!.routeUrl).not.toContain("40.1883181%2C-80.9122508");
    expect(candidate!.reviewedRoadSequence).not.toContain("US-250");
  });

  it.each([
    ["padId", "not-beetle"],
    ["canonicalId", "not-beetle"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "BEETLE EAST"],
    ["state", "West Virginia"],
    ["county", "Belmont"],
    ["structuredRoadSequence", "OH-519 → nearest road → BEETLE"],
  ] as const)("fails the BEETLE reviewed handoff closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...beetle(), [field]: value })).toBeNull();
  });

  it.each([
    ["missing", null],
    ["changed latitude", { latitude: 40.1855, longitude: -80.922718, role: "reference", kind: "saved_pad_reference" }],
    ["changed longitude", { latitude: 40.185403, longitude: -80.923, role: "reference", kind: "saved_pad_reference" }],
    ["incomplete", { latitude: 40.185403, longitude: Number.NaN, role: "reference", kind: "saved_pad_reference" }],
    ["different source", { latitude: 40.185403, longitude: -80.922718, role: "reference", kind: "official_pad_reference" }],
  ] as const)("fails the BEETLE reviewed handoff closed when its trusted destination is %s", (_label, mapReference) => {
    expect(reviewedNavigationCandidateForPad({ ...beetle(), mapReference })).toBeNull();
  });

  it("returns DUKE's exact record-bound Cologie-corridor handoff", () => {
    const candidate = reviewedNavigationCandidateForPad(duke());
    expect(candidate).toMatchObject({
      padId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
      routeUrl: DUKE_REVIEWED_GOOGLE_URL,
      reviewedRoadSequence: "US-250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd → saved pad GPS",
    });
    const url = new URL(candidate!.routeUrl);
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("destination")).toBe("40.214409,-80.891316");
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual([
      "40.2376772526251,-80.9645933421097",
      "40.2344651449313,-80.9216048043883",
      "40.2438460898288,-80.9156965297937",
    ]);
  });

  it.each([
    ["padId", "not-duke"],
    ["canonicalId", "not-duke"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "DUKE EAST"],
    ["state", "West Virginia"],
    ["county", "Belmont"],
    ["structuredRoadSequence", "US-250 → nearest road → DUKE"],
  ] as const)("fails DUKE closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...duke(), [field]: value })).toBeNull();
  });

  it("fails DUKE closed when its exact saved destination changes", () => {
    expect(reviewedNavigationCandidateForPad({
      ...duke(),
      mapReference: { latitude: 40.2145, longitude: -80.891316, role: "reference", kind: "saved_pad_reference" },
    })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...duke(),
      mapReference: { latitude: 40.214409, longitude: -80.891316, role: "reference", kind: "official_pad_reference" },
    })).toBeNull();
  });

  it("returns PORTERFIELD's exact record-bound US-40 and Vineyard Road handoff", () => {
    const candidate = reviewedNavigationCandidateForPad(porterfield());
    expect(candidate).toMatchObject({
      padId: "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
      routeUrl: PORTERFIELD_REVIEWED_GOOGLE_URL,
      reviewedRoadSequence: "I-70 → Exit 215 → US-40 W → Vineyard Rd / CR-56 → saved pad GPS",
    });
    const url = new URL(candidate!.routeUrl);
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("destination")).toBe("40.090431,-80.928503");
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual([
      "40.073689,-80.945041",
      "40.088246,-80.944086",
      "40.090469,-80.928294",
    ]);
  });

  it.each([
    ["padId", "not-porterfield"],
    ["canonicalId", "not-porterfield"],
    ["legacyId", "ascent--other"],
    ["recordRevision", "changed"],
    ["company", "Other"],
    ["padName", "PORTERFIELD"],
    ["state", "West Virginia"],
    ["county", "Harrison"],
    ["structuredRoadSequence", "US-40 → nearest road → PORTERFIELD"],
  ] as const)("fails PORTERFIELD closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...porterfield(), [field]: value })).toBeNull();
  });

  it("fails PORTERFIELD closed when its saved destination changes", () => {
    expect(reviewedNavigationCandidateForPad({
      ...porterfield(),
      mapReference: { latitude: 40.0905, longitude: -80.928503, role: "reference", kind: "saved_pad_reference" },
    })).toBeNull();
    expect(reviewedNavigationCandidateForPad({
      ...porterfield(),
      mapReference: { latitude: 40.090431, longitude: -80.928503, role: "reference", kind: "official_wellhead_reference" },
    })).toBeNull();
  });

  it("never cross-binds same-name pads from another company, county, or exact identity", () => {
    const sameNameOtherCompany = { ...duke(), padId: "11111111-1111-4111-8111-111111111111", canonicalId: "11111111-1111-4111-8111-111111111111", company: "Other" };
    const sameNameOtherCounty = { ...duke(), padId: "22222222-2222-4222-8222-222222222222", canonicalId: "22222222-2222-4222-8222-222222222222", county: "Belmont" };
    expect(sameNameOtherCompany.padName).toBe("DUKE");
    expect(sameNameOtherCounty.padName).toBe("DUKE");
    expect(reviewedNavigationCandidateForPad(sameNameOtherCompany)).toBeNull();
    expect(reviewedNavigationCandidateForPad(sameNameOtherCounty)).toBeNull();
  });
});
