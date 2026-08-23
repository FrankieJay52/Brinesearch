import { describe, expect, it } from "vitest";
import { cachedSnapshotSourceState, resolveRecentIdentities, validateCachedPad } from "./offline";
import type { PadSummary } from "./types";

function cachedPad(overrides: Partial<PadSummary> = {}): PadSummary {
  const padId = "11111111-1111-4111-8111-111111111111";
  return {
    padId,
    canonicalId: padId,
    legacyId: "test--pad",
    aliases: ["test--pad"],
    recordNumber: 1,
    recordRevision: "42",
    recordType: "pad",
    company: "Test Company",
    padName: "TEST PAD",
    state: "Ohio",
    county: "Belmont",
    township: "",
    address: "",
    coordinate: { role: "driver_entrance", latitude: 40.1, longitude: -80.9 },
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: "",
    writtenDirections: "",
    verificationStatus: "verified",
    operatingStatus: "active",
    updatedAt: "2026-08-22T00:00:00Z",
    ...overrides,
  };
}

describe("cached V18 directory validation", () => {
  it("accepts a complete canonical row and reconstructs its coordinate", () => {
    expect(validateCachedPad(cachedPad())).toMatchObject({
      canonicalId: "11111111-1111-4111-8111-111111111111",
      coordinate: { role: "driver_entrance", latitude: 40.1, longitude: -80.9 },
    });
  });

  it("rejects a tampered identity, revision, coordinate role, or zero-origin coordinate", () => {
    expect(validateCachedPad(cachedPad({ canonicalId: "different" }))).toBeNull();
    expect(validateCachedPad(cachedPad({ recordRevision: "unversioned" }))).toBeNull();
    expect(validateCachedPad(cachedPad({ coordinate: { role: "legacy_saved", latitude: 40.1, longitude: -80.9 } }))).toBeNull();
    expect(validateCachedPad(cachedPad({ coordinate: { role: "driver_entrance", latitude: 0, longitude: 0 } }))).toBeNull();
  });

  it("rejects corrupted optional display and search fields from device storage", () => {
    expect(validateCachedPad(cachedPad({ county: "Belmont-".repeat(90) }))).toBeNull();
    expect(validateCachedPad(cachedPad({ company: "Test\u0007Company" }))).toBeNull();
    expect(validateCachedPad(cachedPad({ wellNames: ["WELL 1 corrected note"] }))).toBeNull();
    expect(validateCachedPad(cachedPad({ propertyNumbers: ["turn right onto lease road"] }))).toBeNull();
    expect(validateCachedPad(cachedPad({ safeRoadTerms: Array.from({ length: 9 }, (_, index) => `TR-${index + 1}`) }))).toBeNull();
  });
});

describe("recent identity reconciliation", () => {
  it("collapses a legacy recent and its later canonical UUID with the newest time", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    expect(resolveRecentIdentities([
      { padId: "test--pad", openedAt: "2026-08-22T12:00:00.000Z" },
      { padId: uuid, openedAt: "2026-08-22T12:05:00.000Z" },
      { padId: "other--pad", openedAt: "2026-08-22T11:00:00.000Z" },
    ], (padId) => padId === "test--pad" ? uuid : padId)).toEqual({
      recents: [
        { padId: uuid, openedAt: "2026-08-22T12:05:00.000Z" },
        { padId: "other--pad", openedAt: "2026-08-22T11:00:00.000Z" },
      ],
      migrations: [{ from: "test--pad", to: uuid }],
    });
  });
});

describe("cached snapshot authority", () => {
  it("preserves a known-stale classification instead of upgrading it on device", () => {
    expect(cachedSnapshotSourceState("live_stale")).toBe("cached_stale");
    expect(cachedSnapshotSourceState("cached_stale")).toBe("cached_stale");
    expect(cachedSnapshotSourceState("live_current")).toBe("cached_live");
  });
});
