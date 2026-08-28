import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  latestOwnerGoogleVerifyDraftForPad,
  ownerGoogleVerifyDraftLimit,
  ownerGoogleVerifyExportJson,
  ownerGoogleVerifyStorageKey,
  ownerGoogleVerifySummary,
  readOwnerGoogleVerifyDrafts,
  saveOwnerGoogleVerifyDraft,
  type OwnerGoogleVerifyDraft,
} from "./ownerGoogleVerifyDrafts";

const moduleSource = readFileSync(new URL("./ownerGoogleVerifyDrafts.ts", import.meta.url), "utf8");

function draft(overrides: Partial<OwnerGoogleVerifyDraft> = {}): OwnerGoogleVerifyDraft {
  return {
    schemaVersion: 1,
    draftId: "pad-alpha:2026-08-28T18:00:00.000Z",
    pad: {
      padId: "11111111-1111-4111-8111-111111111111",
      padName: "ALPHA",
      company: "Example Energy",
      recordRevision: "17",
      destination: {
        latitude: 40.25403,
        longitude: -80.913577,
        source: "saved_pad_gps",
        label: "Saved pad GPS",
      },
      candidateEntrance: null,
    },
    anchor: { latitude: 40.2, longitude: -80.95 },
    turnPins: [
      { latitude: 40.21, longitude: -80.94 },
      { latitude: 40.22, longitude: -80.93 },
    ],
    sectionMarks: [
      {
        sectionId: "section-1",
        ordinal: 1,
        state: "approved_named_road",
        roadName: "County Road 10",
        start: { latitude: 40.2, longitude: -80.95 },
        end: { latitude: 40.21, longitude: -80.94 },
      },
      {
        sectionId: "section-2",
        ordinal: 2,
        state: "approved_named_road",
        roadName: "State Route 519",
        start: { latitude: 40.21, longitude: -80.94 },
        end: { latitude: 40.22, longitude: -80.93 },
      },
      {
        sectionId: "section-3",
        ordinal: 3,
        state: "lease_or_unnamed",
        roadName: null,
        start: { latitude: 40.22, longitude: -80.93 },
        end: { latitude: 40.25403, longitude: -80.913577 },
      },
    ],
    savedAt: "2026-08-28T18:00:00.000Z",
    ...overrides,
  };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    value(key: string) {
      return values.get(key) ?? null;
    },
  };
}

function storedDrafts(...drafts: unknown[]) {
  return JSON.stringify({ schemaVersion: 1, drafts });
}

describe("owner Google verify draft validation", () => {
  it("round-trips one valid draft with no candidate entrance through the versioned local store", () => {
    const storage = memoryStorage();
    const value = draft();

    expect(value.pad.candidateEntrance).toBeNull();
    expect(saveOwnerGoogleVerifyDraft(value, storage)).toEqual(value);
    expect(JSON.parse(storage.value(ownerGoogleVerifyStorageKey)!)).toEqual({ schemaVersion: 1, drafts: [value] });
    expect(readOwnerGoogleVerifyDrafts(storage)).toEqual([value]);
    expect(latestOwnerGoogleVerifyDraftForPad(value.pad.padId, storage)).toEqual(value);
    expect(ownerGoogleVerifySummary(storage)).toEqual({ draftCount: 1, lastDraft: value });
    expect(ownerGoogleVerifyStorageKey).toBe("brinesearch:v18:owner-google-verify-drafts:v1");
  });

  it("round-trips and exports an optional draft-only candidate entrance point", () => {
    const storage = memoryStorage();
    const candidateEntrance = { latitude: 40.159734, longitude: -81.260675 };
    const value = draft({
      pad: { ...draft().pad, candidateEntrance },
    });

    saveOwnerGoogleVerifyDraft(value, storage);
    expect(readOwnerGoogleVerifyDrafts(storage)[0].pad.candidateEntrance).toEqual(candidateEntrance);

    const exported = JSON.parse(ownerGoogleVerifyExportJson(storage, "2026-08-28T19:00:00.000Z"));
    expect(exported.drafts[0].pad.candidateEntrance).toEqual(candidateEntrance);
    expect(exported.authority).toBe("draft_only");
    expect(exported.driverNavigateChanged).toBe(false);
  });

  it("requires candidateEntrance to be present as either null or one strict point", () => {
    const missingPad = { ...draft().pad } as Record<string, unknown>;
    delete missingPad.candidateEntrance;
    for (const candidate of [
      { ...draft(), pad: missingPad },
      { ...draft(), pad: { ...draft().pad, candidateEntrance: { latitude: 0, longitude: 0 } } },
      { ...draft(), pad: { ...draft().pad, candidateEntrance: { latitude: 40.159734, longitude: -81.260675, label: "Entrance" } } },
    ]) {
      expect(() => saveOwnerGoogleVerifyDraft(candidate as unknown as OwnerGoogleVerifyDraft, memoryStorage())).toThrow(
        "Owner route verification draft failed validation.",
      );
    }
  });

  it("keeps every stored destination bound to the saved pad GPS authority", () => {
    for (const candidate of [
      { ...draft(), pad: { ...draft().pad, destination: { ...draft().pad.destination, source: "verified_driver_entrance" } } },
      { ...draft(), pad: { ...draft().pad, destination: { ...draft().pad.destination, label: "Candidate entrance" } } },
    ]) {
      const storage = memoryStorage();
      expect(() => saveOwnerGoogleVerifyDraft(candidate, storage)).toThrow(/failed validation/i);
      expect(readOwnerGoogleVerifyDrafts(storage)).toEqual([]);
    }
  });

  it("rejects malformed JSON and a store with the wrong schema", () => {
    expect(readOwnerGoogleVerifyDrafts(memoryStorage({ [ownerGoogleVerifyStorageKey]: "{" }))).toEqual([]);
    expect(readOwnerGoogleVerifyDrafts(memoryStorage({
      [ownerGoogleVerifyStorageKey]: JSON.stringify({ schemaVersion: 2, drafts: [draft()] }),
    }))).toEqual([]);
  });

  it.each([
    ["wrong draft schema", { ...draft(), schemaVersion: 2 }],
    ["six turn pins", { ...draft(), turnPins: Array.from({ length: 6 }, (_, index) => ({ latitude: 40.1 + index / 100, longitude: -80.9 })) }],
    ["non-finite anchor", { ...draft(), anchor: { latitude: Number.NaN, longitude: -80.9 } }],
    ["invalid section state", { ...draft(), sectionMarks: [{ ...draft().sectionMarks[0], state: "maybe" }] }],
    ["blank approved road name", { ...draft(), sectionMarks: [{ ...draft().sectionMarks[0], roadName: "   " }] }],
    ["invalid save date", { ...draft(), savedAt: "not-a-date" }],
  ])("refuses to save %s", (_label, candidate) => {
    expect(() => saveOwnerGoogleVerifyDraft(candidate as unknown as OwnerGoogleVerifyDraft, memoryStorage())).toThrow(
      "Owner route verification draft failed validation.",
    );
  });

  it("filters invalid drafts while preserving valid drafts, sorting newest first, and enforcing the device limit", () => {
    const valid = Array.from({ length: ownerGoogleVerifyDraftLimit + 3 }, (_, index) => draft({
      draftId: `draft-${index}`,
      savedAt: new Date(Date.UTC(2026, 7, 28, 18, index)).toISOString(),
    }));
    const invalid = { ...draft(), draftId: "invalid", turnPins: Array.from({ length: 6 }, () => ({ latitude: 40, longitude: -80 })) };
    const storage = memoryStorage({ [ownerGoogleVerifyStorageKey]: storedDrafts(invalid, ...valid) });
    const loaded = readOwnerGoogleVerifyDrafts(storage);

    expect(loaded).toHaveLength(ownerGoogleVerifyDraftLimit);
    expect(loaded[0].draftId).toBe(`draft-${ownerGoogleVerifyDraftLimit + 2}`);
    expect(loaded.some((value) => value.draftId === "invalid")).toBe(false);
  });

  it("rejects non-allowlisted fields so stored Google route content or keys cannot enter a local export", () => {
    const mapConfigValue = "test-only-map-config-value";
    const routeUrl = "https://www.google.com/maps/dir/?api=1&destination=40.25403,-80.913577";
    const injected = {
      ...draft(),
      googleRouteUrl: routeUrl,
      googleMapsApiKey: mapConfigValue,
      pad: {
        ...draft().pad,
        destination: { ...draft().pad.destination, googleMapsApiKey: mapConfigValue },
      },
    };
    const storage = memoryStorage({ [ownerGoogleVerifyStorageKey]: storedDrafts(injected) });

    expect(readOwnerGoogleVerifyDrafts(storage)).toEqual([]);
    const exported = ownerGoogleVerifyExportJson(storage, "2026-08-28T19:00:00.000Z");
    expect(exported).not.toContain(mapConfigValue);
    expect(exported).not.toContain(routeUrl);
    expect(exported).not.toContain("googleRouteUrl");
    expect(exported).not.toContain("googleMapsApiKey");
  });
});

describe("owner Google verify local-only export", () => {
  it("exports only validated drafts with an explicit non-authoritative driver boundary", () => {
    const storage = memoryStorage();
    const value = draft();
    saveOwnerGoogleVerifyDraft(value, storage);

    const exportedAt = "2026-08-28T19:00:00.000Z";
    const json = ownerGoogleVerifyExportJson(storage, exportedAt);
    expect(JSON.parse(json)).toEqual({
      schemaVersion: 1,
      kind: "brinesearch-owner-google-route-verification-drafts",
      exportedAt,
      authority: "draft_only",
      driverNavigateChanged: false,
      drafts: [value],
    });
    expect(json).not.toMatch(/https:\/\/(?:www\.)?google\.com\/maps|maps\.googleapis\.com/i);
    expect(json).not.toMatch(/\b(?:apiKey|googleMapsApiKey|routeUrl|access_token|refresh_token)\b/i);
  });

  it("contains no network, Supabase, Google route, or environment-key transport", () => {
    expect(moduleSource).not.toMatch(/\bfetch\s*\(/);
    expect(moduleSource).not.toMatch(/\bownerRpc\s*\(/);
    expect(moduleSource).not.toMatch(/from\s+["'][^"']*supabase/i);
    expect(moduleSource).not.toContain("VITE_GOOGLE_MAPS_API_KEY");
    expect(moduleSource).not.toMatch(/https:\/\/(?:www\.)?google\.com\/maps|maps\.googleapis\.com/i);
  });
});
