import { describe, expect, it } from "vitest";
import { directoryNeedsRevalidation } from "./DirectoryContext";
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
