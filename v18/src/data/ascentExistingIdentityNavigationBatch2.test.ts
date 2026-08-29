import { describe, expect, it } from "vitest";
import type { PadSummary } from "./types";
import {
  ascentExistingIdentityNavigationBatch2,
  ascentExistingIdentityNavigationBatch2Holds,
  type ExistingIdentityNavigationContract,
  type ExistingIdentityNavigationHold,
} from "./ascentExistingIdentityNavigationBatch2";
import { reviewedNavigationCandidateForPad } from "./reviewedNavigationCandidates";

const expectedNames = [
  "BETTS", "BILLY SHERMAN", "BLESSED", "BSA", "CERMAK", "COAD", "COLLINS", "COOK",
  "FERGUSON", "GRISWOLD", "GRYWALSKI", "J BARR J", "LEE", "MILLER", "MILLER FARMS",
  "NOELLE", "PUGGLE", "RICHLAND B", "SIDWELL", "SLABAUGH", "TARBERT", "TARPLEY",
  "THREE DADS", "VAULT", "VIOLET",
].sort();

const frozenPadIds = new Set([
  "e2b32e85-9e93-4388-8215-9d8167cbbeb8", // COLOGIE
  "b7526e45-0b33-4988-ae1c-0a4140971f8e", // BANJO
  "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b", // PICKENS
  "06ac93a2-3b46-44fd-9fa6-2fd29201858a", // SKULL FORK
]);

function padFor(contract: ExistingIdentityNavigationContract | ExistingIdentityNavigationHold): PadSummary {
  return {
    padId: contract.padId,
    canonicalId: "canonicalId" in contract ? contract.canonicalId : contract.padId,
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
      latitude: contract.directoryDestination.latitude,
      longitude: contract.directoryDestination.longitude,
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

describe("Ascent existing-identity navigation batch 2", () => {
  it("binds exactly the 25 safe records and none of the frozen pads", () => {
    expect(ascentExistingIdentityNavigationBatch2).toHaveLength(25);
    expect(ascentExistingIdentityNavigationBatch2.map(({ padName }) => padName).sort()).toEqual(expectedNames);
    expect(new Set(ascentExistingIdentityNavigationBatch2.map(({ padId }) => padId)).size).toBe(25);
    expect(ascentExistingIdentityNavigationBatch2.some(({ padId }) => frozenPadIds.has(padId))).toBe(false);
  });

  it("uses phone origin, ordered controls, exact saved GPS, and existing identity metadata only", () => {
    for (const contract of ascentExistingIdentityNavigationBatch2) {
      const url = new URL(contract.routeUrl);
      expect(url.origin, contract.padName).toBe("https://www.google.com");
      expect(url.searchParams.get("origin"), contract.padName).toBeNull();
      expect(url.searchParams.get("api"), contract.padName).toBe("1");
      expect(url.searchParams.get("travelmode"), contract.padName).toBe("driving");
      expect(url.searchParams.get("dir_action"), contract.padName).toBe("navigate");
      expect(url.searchParams.get("destination"), contract.padName).toBe(
        `${contract.trustedDestination.latitude},${contract.trustedDestination.longitude}`,
      );
      expect(url.searchParams.get("waypoints")?.split("|"), contract.padName).toEqual(
        contract.waypoints.map(({ latitude, longitude }) => `${latitude},${longitude}`),
      );
      expect(contract.waypoints.length, contract.padName).toBeGreaterThanOrEqual(1);
      expect(contract.waypoints.length, contract.padName).toBeLessThanOrEqual(3);
      expect(contract.trustedDestination.source, contract.padName).toBe("saved_pad_gps");
      expect(contract.routeDestination, contract.padName).toEqual({
        latitude: contract.trustedDestination.latitude,
        longitude: contract.trustedDestination.longitude,
      });
      expect(contract.identitySequence.every(({ roadId }) =>
        contract.roadIdentityHook.some((identity) => identity.roadId === roadId)), contract.padName).toBe(true);
      expect(Object.hasOwn(contract, "geometry"), contract.padName).toBe(false);
      expect(Object.hasOwn(contract, "ownerApproval"), contract.padName).toBe(false);

      const candidate = reviewedNavigationCandidateForPad(padFor(contract));
      expect(candidate, contract.padName).toMatchObject({
        padId: contract.padId,
        routeUrl: contract.routeUrl,
        reviewedRoadSequence: contract.reviewedRoadSequence,
        roadIdentityHook: contract.roadIdentityHook,
      });
      expect(candidate?.ownerApproval, contract.padName).toBeUndefined();
      expect(candidate?.finalLegNotice, contract.padName).toMatch(/lease\/access remains unapproved|TR-118.*remain unapproved/u);
      expect(candidate?.finalLegNotice, contract.padName).toMatch(/creates no road identity, geometry, teal authority/u);
    }
  });

  it("fails closed on exact directory revision or saved-GPS drift", () => {
    for (const contract of ascentExistingIdentityNavigationBatch2) {
      const exact = padFor(contract);
      expect(reviewedNavigationCandidateForPad({ ...exact, recordRevision: `${exact.recordRevision}-drift` }), contract.padName).toBeNull();
      expect(reviewedNavigationCandidateForPad({
        ...exact,
        mapReference: exact.mapReference ? { ...exact.mapReference, latitude: exact.mapReference.latitude + 0.000001 } : null,
      }), contract.padName).toBeNull();
    }
  });

  it("keeps VANNELLE GPS-only after the documented Shepherdstown backtrack", () => {
    expect(ascentExistingIdentityNavigationBatch2Holds).toHaveLength(1);
    const hold = ascentExistingIdentityNavigationBatch2Holds[0];
    expect(hold).toMatchObject({ padName: "VANNELLE", disposition: "GPS_ONLY" });
    expect(hold.reason).toMatch(/enter Shepherdstown Road briefly, return to OH-9/u);
    expect(reviewedNavigationCandidateForPad(padFor(hold))).toBeNull();
  });
});

