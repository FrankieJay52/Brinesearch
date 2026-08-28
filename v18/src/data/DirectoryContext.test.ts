import { describe, expect, it } from "vitest";
import { directoryAuthorityVersionChanged, directoryNeedsRevalidation, loadDirectoryForDisplay } from "./DirectoryContext";
import type { DirectorySnapshot } from "./types";

function snapshot(sourceState: DirectorySnapshot["sourceState"], lastVerifiedAt: string | null): DirectorySnapshot {
  return {
    schemaVersion: 1,
    snapshotId: "11111111-1111-4111-8111-111111111111",
    sourceRevision: "1",
    generatedAt: "2026-08-22T12:00:00.000Z",
    fetchedAt: "2026-08-22T12:00:00.000Z",
    lastVerifiedAt,
    sourceState,
    rows: [],
    counts: { locations: 0, pads: 0, disposals: 0, mapped: 0 },
  };
}

describe("directory freshness boundary", () => {
  const verifiedAt = "2026-08-22T12:00:00.000Z";

  it("keeps a server-confirmed live snapshot current for less than five minutes", () => {
    expect(directoryNeedsRevalidation(snapshot("live_current", verifiedAt), Date.parse("2026-08-22T12:04:59.999Z"))).toBe(false);
  });

  it("requires revalidation at five minutes and for an invalid verification time", () => {
    expect(directoryNeedsRevalidation(snapshot("live_current", verifiedAt), Date.parse("2026-08-22T12:05:00.000Z"))).toBe(true);
    expect(directoryNeedsRevalidation(snapshot("live_current", "not-a-time"), Date.parse("2026-08-22T12:01:00.000Z"))).toBe(true);
  });

  it("retries every non-current source so a transient fallback can recover while the app stays visible", () => {
    expect(directoryNeedsRevalidation(snapshot("live_stale", verifiedAt))).toBe(true);
    expect(directoryNeedsRevalidation(snapshot("cached_live", verifiedAt))).toBe(true);
    expect(directoryNeedsRevalidation(snapshot("cached_stale", verifiedAt))).toBe(true);
    expect(directoryNeedsRevalidation(snapshot("packaged_fallback", verifiedAt))).toBe(true);
    expect(directoryNeedsRevalidation(snapshot("unavailable", verifiedAt))).toBe(true);
    expect(directoryNeedsRevalidation(null)).toBe(false);
  });
});

describe("directory GPS composition", () => {
  it("finishes exact pad-reference enrichment before publishing a live directory", async () => {
    const base = snapshot("live_current", "2026-08-22T12:00:00.000Z");
    const enriched = { ...base, fetchedAt: "2026-08-22T12:00:01.000Z" };
    let referenceCalls = 0;
    const result = await loadDirectoryForDisplay(
      async () => base,
      async (value) => {
        referenceCalls += 1;
        expect(value).toBe(base);
        return { snapshot: enriched, verified: true };
      },
      true,
    );
    expect(result).toEqual({ snapshot: enriched, persistable: true });
    expect(referenceCalls).toBe(1);
  });

  it("never fetches live pad references for an offline or non-current snapshot", async () => {
    let referenceCalls = 0;
    const loadReferences = async (value: DirectorySnapshot) => {
      referenceCalls += 1;
      return { snapshot: value, verified: true };
    };
    const cached = snapshot("cached_live", "2026-08-22T12:00:00.000Z");
    expect(await loadDirectoryForDisplay(async () => cached, loadReferences, true)).toEqual({ snapshot: cached, persistable: false });
    const live = snapshot("live_current", "2026-08-22T12:00:00.000Z");
    expect(await loadDirectoryForDisplay(async () => live, loadReferences, false)).toEqual({ snapshot: live, persistable: false });
    expect(referenceCalls).toBe(0);
  });

  it("does not mark a GPS-less live snapshot safe to persist after a reference failure", async () => {
    const base = snapshot("live_current", "2026-08-22T12:00:00.000Z");
    const result = await loadDirectoryForDisplay(
      async () => base,
      async () => ({ snapshot: base, verified: false }),
      true,
    );
    expect(result).toEqual({ snapshot: { ...base, sourceState: "live_stale" }, persistable: false });
  });

  it("preserves completed pad checks for the same immutable directory and clears them for a new authority version", () => {
    const current = snapshot("live_current", "2026-08-22T12:00:00.000Z");
    expect(directoryAuthorityVersionChanged(current, {
      ...current,
      fetchedAt: "2026-08-22T12:05:00.000Z",
      lastVerifiedAt: "2026-08-22T12:05:00.000Z",
    })).toBe(false);
    expect(directoryAuthorityVersionChanged(current, { ...current, sourceRevision: "2" })).toBe(true);
    expect(directoryAuthorityVersionChanged(current, { ...current, snapshotId: "22222222-2222-4222-8222-222222222222" })).toBe(true);
    expect(directoryAuthorityVersionChanged(null, current)).toBe(true);
  });
});
