import { describe, expect, it } from "vitest";
import type { PadSummary } from "./types";
import {
  BILINOVICH_REVIEWED_GOOGLE_URL,
  reviewedNavigationCandidateForPad,
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

describe("reviewed navigation candidates", () => {
  it("returns the exact owner-reviewed BILINOVICH mobile handoff", () => {
    const candidate = reviewedNavigationCandidateForPad(bilinovich());
    expect(candidate).toMatchObject({
      padId: "59061829-1122-4aae-872d-cf5024310373",
      title: "Navigate reviewed route",
      detail: "Owner-reviewed Google directions · graph status separate",
      routeUrl: BILINOVICH_REVIEWED_GOOGLE_URL,
    });

    const url = new URL(candidate!.routeUrl);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("origin")).toBe("Saint Clairsville, OH");
    expect(url.searchParams.get("destination")).toBe("40.08738445,-81.30282620");
    expect(url.searchParams.get("waypoints")?.split("|")).toEqual([
      "40.12303995,-81.35382341",
      "40.112583770,-81.294937982",
      "40.09955931,-81.29781917",
    ]);
    expect(url.searchParams.get("dir_action")).toBe("navigate");
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
  ] as const)("fails closed when %s diverges", (field, value) => {
    expect(reviewedNavigationCandidateForPad({ ...bilinovich(), [field]: value })).toBeNull();
  });
});
