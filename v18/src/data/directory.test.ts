import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDirectorySnapshot, resolveDirectoryFavoriteIds, resolveDirectoryPad } from "./directory";
import type { PadSummary } from "./types";

const snapshotId = "11111111-1111-4111-8111-111111111111";

function directoryRow(ordinal: number, recordType: "pad" | "disposal") {
  return {
    ordinal,
    padId: `${ordinal}1111111-1111-4111-8111-111111111111`.slice(0, 36),
    recordRevision: String(ordinal),
    legacyId: `fixture--${ordinal}`,
    recordType,
    company: "Fixture",
    padName: `FIXTURE ${ordinal}`,
    state: "Ohio",
    county: "Belmont",
    township: null,
    address: null,
    structuredRoadSequence: null,
    driverEntrance: { role: "driver_entrance", qualityState: "validated", latitude: 40 + ordinal / 100, longitude: -80.9 },
    coordinateState: "verified",
    aliases: [],
    wellNames: [],
    apis: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    verificationState: "verified",
    operatingState: "active",
    updatedAt: "2026-08-22T00:00:00Z",
  };
}

function response(rows: Record<string, unknown>[], rowCount = rows.length) {
  return new Response(JSON.stringify({
    schemaVersion: 1,
    snapshot: {
      snapshotId,
      sourceRevision: "7",
      generatedAt: "2026-08-22T00:00:00Z",
      publishedAt: "2026-08-22T00:00:00Z",
      publicationState: "current",
      retainedUntil: null,
      rowCount,
      searchableCount: rowCount,
      typeCounts: { pad: rows.filter((row) => row.recordType === "pad").length, disposal: rows.filter((row) => row.recordType === "disposal").length, other: 0 },
      coordinateCounts: { verifiedDriverEntrance: rows.length, missingDriverEntrance: 0, heldDriverEntrance: 0 },
      identityEventCount: 0,
      contentSha256: "a".repeat(64),
    },
    page: { afterOrdinal: 0, nextAfterOrdinal: rows.length, rowCount: rows.length, complete: true },
    rows,
    identityState: [],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("immutable V18 directory loader", () => {
  it("resolves canonical identities first and fails closed on ambiguous legacy IDs", () => {
    const first = {
      padId: "11111111-1111-4111-8111-111111111111",
      canonicalId: "11111111-1111-4111-8111-111111111111",
      legacyId: "fixture--shared",
    } as PadSummary;
    const second = {
      padId: "21111111-1111-4111-8111-111111111111",
      canonicalId: "21111111-1111-4111-8111-111111111111",
      legacyId: "fixture--shared",
    } as PadSummary;

    expect(resolveDirectoryPad([first, second], first.padId)).toBe(first);
    expect(resolveDirectoryPad([first, second], "fixture--shared")).toBeNull();
    expect(resolveDirectoryPad([first], "fixture--shared")).toBe(first);
  });

  it("migrates unique fallback favorites, deduplicates them, and preserves ambiguous IDs", () => {
    const first = {
      padId: "11111111-1111-4111-8111-111111111111",
      canonicalId: "11111111-1111-4111-8111-111111111111",
      legacyId: "fixture--shared",
    } as PadSummary;
    const second = {
      padId: "21111111-1111-4111-8111-111111111111",
      canonicalId: "21111111-1111-4111-8111-111111111111",
      legacyId: "fixture--second",
    } as PadSummary;
    const unique = resolveDirectoryFavoriteIds([first, second], ["fixture--second", second.padId]);
    expect([...unique.favoriteIds]).toEqual([second.padId]);
    expect(unique.migrations).toEqual([{ from: "fixture--second", to: second.padId }]);

    const ambiguous = resolveDirectoryFavoriteIds([{ ...first }, { ...second, legacyId: "fixture--shared" }], ["fixture--shared"]);
    expect([...ambiguous.favoriteIds]).toEqual(["fixture--shared"]);
    expect(ambiguous.migrations).toEqual([]);
  });

  it("accepts one complete, contiguous, count-reconciled snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([directoryRow(1, "pad"), directoryRow(2, "disposal")])));
    const result = await loadDirectorySnapshot();
    expect(result.sourceState).toBe("live_current");
    expect(result.snapshotId).toBe(snapshotId);
    expect(result.counts).toMatchObject({ locations: 2, pads: 1, disposals: 1, mapped: 2 });
  });

  it("finishes the same snapshot when it becomes retained mid-download", async () => {
    const first = directoryRow(1, "pad");
    const second = directoryRow(2, "disposal");
    const firstPayload = await response([first, second]).json() as Record<string, unknown>;
    firstPayload.rows = [first];
    firstPayload.page = { afterOrdinal: 0, nextAfterOrdinal: 1, rowCount: 1, complete: false };
    const secondPayload = structuredClone(firstPayload);
    const secondMetadata = secondPayload.snapshot as Record<string, unknown>;
    secondMetadata.publicationState = "retained";
    secondMetadata.retainedUntil = "2099-08-22T00:15:00Z";
    secondPayload.rows = [second];
    secondPayload.page = { afterOrdinal: 1, nextAfterOrdinal: 2, rowCount: 1, complete: true };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(firstPayload), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(secondPayload), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await loadDirectorySnapshot();

    expect(result.sourceState).toBe("live_stale");
    expect(result.snapshotId).toBe(snapshotId);
    expect(result.rows.map((row) => row.recordNumber)).toEqual([1, 2]);
  });

  it("rejects an expired retained snapshot during paging", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = directoryRow(1, "pad");
    const second = directoryRow(2, "disposal");
    const firstPayload = await response([first, second]).json() as Record<string, unknown>;
    firstPayload.rows = [first];
    firstPayload.page = { afterOrdinal: 0, nextAfterOrdinal: 1, rowCount: 1, complete: false };
    const expiredPayload = structuredClone(firstPayload);
    const expiredMetadata = expiredPayload.snapshot as Record<string, unknown>;
    expiredMetadata.publicationState = "retained";
    expiredMetadata.retainedUntil = "2000-01-01T00:00:00Z";
    expiredPayload.rows = [second];
    expiredPayload.page = { afterOrdinal: 1, nextAfterOrdinal: 2, rowCount: 1, complete: true };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(firstPayload), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(expiredPayload), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await loadDirectorySnapshot();
    expect(result.sourceState).toBe("packaged_fallback");
  });

  it("rejects an ordinal gap and falls back as one complete source", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([directoryRow(1, "pad"), directoryRow(3, "disposal")])));
    const result = await loadDirectorySnapshot();
    expect(result.sourceState).toBe("packaged_fallback");
    expect(result.counts).toMatchObject({ locations: 1262, pads: 1217, disposals: 45 });
  });

  it("does not label the old unversioned endpoint as live when the V18 RPC is absent", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not installed", { status: 404 })));
    const result = await loadDirectorySnapshot();
    expect(result.sourceState).toBe("packaged_fallback");
    expect(result.counts.locations).toBe(1262);
  });

  it.each([
    ["invalid canonical identity", { ...directoryRow(1, "pad"), padId: "fixture--1" }],
    ["unvalidated coordinate role", { ...directoryRow(1, "pad"), driverEntrance: { role: "reference", qualityState: "validated", latitude: 40.1, longitude: -80.9 } }],
    ["hidden extra field", { ...directoryRow(1, "pad"), researchNotes: "must not enter the public client" }],
    ["oversized county corruption", { ...directoryRow(1, "pad"), county: "Belmont-".repeat(90) }],
    ["control characters", { ...directoryRow(1, "pad"), company: "Fixture\u0007" }],
    ["annotated well prose", { ...directoryRow(1, "pad"), wellNames: ["WELL 1 corrected note"] }],
    ["directions disguised as a property", { ...directoryRow(1, "pad"), propertyNumbers: ["turn right onto lease road"] }],
    ["too many safe road terms", { ...directoryRow(1, "pad"), safeRoadTerms: Array.from({ length: 9 }, (_, index) => `TR-${index + 1}`) }],
    ["duplicate aliases", { ...directoryRow(1, "pad"), aliases: ["FIXTURE", "FIXTURE"] }],
  ])("rejects a live row with %s", async (_label, row) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([row])));
    const result = await loadDirectorySnapshot();
    expect(result.sourceState).toBe("packaged_fallback");
  });

  it("rejects incomplete snapshot metadata instead of labeling it live", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bad = response([directoryRow(1, "pad")]);
    const payload = await bad.json() as Record<string, unknown>;
    const metadata = payload.snapshot as Record<string, unknown>;
    metadata.contentSha256 = "not-a-digest";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })));
    const result = await loadDirectorySnapshot();
    expect(result.sourceState).toBe("packaged_fallback");
  });
});
