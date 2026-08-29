import { describe, expect, it } from "vitest";
import type { PadSummary } from "./types";
import {
  ascentExistingIdentityNavigationBatch1,
  DONNA_EXISTING_IDENTITY_GOOGLE_URL,
  HENDERSON_EXISTING_IDENTITY_GOOGLE_URL,
  LAVADA_EXISTING_IDENTITY_GOOGLE_URL,
  MATADOR_EXISTING_IDENTITY_GOOGLE_URL,
} from "./ascentExistingIdentityNavigationBatch1";
import { reviewedNavigationCandidateForPad } from "./reviewedNavigationCandidates";

const expectedUrls = new Map([
  ["HENDERSON", HENDERSON_EXISTING_IDENTITY_GOOGLE_URL],
  ["DONNA", DONNA_EXISTING_IDENTITY_GOOGLE_URL],
  ["LAVADA", LAVADA_EXISTING_IDENTITY_GOOGLE_URL],
  ["MATADOR", MATADOR_EXISTING_IDENTITY_GOOGLE_URL],
]);

function padFor(contract: (typeof ascentExistingIdentityNavigationBatch1)[number]): PadSummary {
  return {
    padId: contract.padId,
    canonicalId: contract.canonicalId,
    legacyId: contract.legacyId,
    aliases: [],
    recordNumber: null,
    recordRevision: contract.recordRevision,
    recordType: "pad",
    company: contract.company,
    padName: contract.padName,
    state: contract.state,
    county: contract.county,
    township: "",
    address: "",
    coordinate: null,
    mapReference: {
      latitude: contract.trustedDestination.latitude,
      longitude: contract.trustedDestination.longitude,
      role: "reference",
      kind: "saved_pad_reference",
    },
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: contract.structuredRoadSequence,
    writtenDirections: "",
    verificationStatus: "",
    operatingStatus: "",
    updatedAt: null,
  };
}

describe("Ascent existing-identity navigation batch 1", () => {
  it("binds exactly four Google-checked records without origin or owner approval", () => {
    expect(ascentExistingIdentityNavigationBatch1).toHaveLength(4);
    expect(new Set(ascentExistingIdentityNavigationBatch1.map(({ padId }) => padId)).size).toBe(4);

    for (const contract of ascentExistingIdentityNavigationBatch1) {
      expect(contract.routeUrl, contract.padName).toBe(expectedUrls.get(contract.padName));
      const url = new URL(contract.routeUrl);
      expect(url.origin, contract.padName).toBe("https://www.google.com");
      expect(url.searchParams.get("origin"), contract.padName).toBeNull();
      expect(url.searchParams.get("dir_action"), contract.padName).toBe("navigate");
      expect(url.searchParams.get("destination"), contract.padName).toBe(
        `${contract.trustedDestination.latitude},${contract.trustedDestination.longitude}`,
      );
      expect(url.searchParams.get("waypoints")?.split("|")).toHaveLength(contract.waypoints.length);

      const candidate = reviewedNavigationCandidateForPad(padFor(contract));
      expect(candidate, contract.padName).toMatchObject({
        padId: contract.padId,
        routeUrl: contract.routeUrl,
        reviewedRoadSequence: contract.reviewedRoadSequence,
      });
      expect(candidate?.ownerApproval, contract.padName).toBeUndefined();
      expect(candidate?.finalLegNotice, contract.padName).toMatch(/unnamed access remains unapproved|final unnamed access remains unapproved/u);
    }
  });

  it("fails closed if the exact directory record drifts", () => {
    for (const contract of ascentExistingIdentityNavigationBatch1) {
      const exact = padFor(contract);
      expect(reviewedNavigationCandidateForPad({ ...exact, recordRevision: `${exact.recordRevision}-drift` }), contract.padName).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: exact.mapReference ? { ...exact.mapReference, latitude: exact.mapReference.latitude + 0.000001 } : null,
      }), contract.padName).toBeNull();
    }
  });

  it("records only existing exact Road Manager identities", () => {
    const identities = ascentExistingIdentityNavigationBatch1.flatMap(({ roadIdentityHook, padName }) =>
      roadIdentityHook.identities.map((identity) => ({ ...identity, padName })));
    expect(identities).toHaveLength(5);
    expect(identities.every(({ roadId, county, officialName, routeNumber }) =>
      Boolean(roadId && county && officialName && routeNumber))).toBe(true);
  });
});
