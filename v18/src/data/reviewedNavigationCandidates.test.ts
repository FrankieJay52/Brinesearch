import { describe, expect, it } from "vitest";
import type { PadSummary } from "./types";
import {
  BILINOVICH_REVIEWED_GOOGLE_URL,
  LAWSON_REVIEWED_GOOGLE_URL,
  reviewedNavigationCandidateForPad,
  reviewedNavigationSafetyHoldForPad,
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
  };
}

function correctedBilinovich(): PadSummary {
  return {
    ...bilinovich(),
    recordRevision: "1787802711836476",
    structuredRoadSequence: "US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH",
  };
}

describe("reviewed navigation candidates", () => {
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
});
