import { describe, expect, it } from "vitest";
import { getPackagedSnapshotForTest } from "./directory";
import { searchDirectory } from "./search";

describe("sanitized packaged fallback", () => {
  const snapshot = getPackagedSnapshotForTest();

  it("preserves the complete directory and deterministic identities", () => {
    expect(snapshot.counts).toEqual({ locations: 1262, pads: 1217, disposals: 45, mapped: 951 });
    expect(snapshot.rows.map((row) => row.recordNumber)).toEqual(
      Array.from({ length: 1262 }, (_, index) => index + 1),
    );
    expect(new Set(snapshot.rows.map((row) => row.padId)).size).toBe(1262);
    expect(snapshot.rows.every((row) => row.padId === row.legacyId && row.canonicalId === null)).toBe(true);
    expect(snapshot.rows.every((row) => row.legacyId !== null && row.aliases.join("|") === row.legacyId)).toBe(true);
  });

  it("keeps coordinates paired and labels them only as legacy saved points", () => {
    const mapped = snapshot.rows.filter((row) => row.coordinate !== null);
    expect(mapped).toHaveLength(951);
    expect(mapped.every((row) => row.coordinate?.role === "legacy_saved")).toBe(true);
    expect(mapped.every((row) => Number.isFinite(row.coordinate?.latitude) && Number.isFinite(row.coordinate?.longitude))).toBe(
      true,
    );
    expect(snapshot.rows.find((row) => row.legacyId === "ascent--alamo")?.coordinate).toBeNull();
    expect(snapshot.rows.find((row) => row.legacyId === "antero--albert")?.coordinate).toMatchObject({
      latitude: 39.85701,
      longitude: -81.203851,
      role: "legacy_saved",
    });
  });

  it("does not expose quarantined source corruption through display or search fields", () => {
    const alan = snapshot.rows.find((row) => row.legacyId === "expand--alan-h-degarmo");
    expect(alan?.county).toBe("");
    expect(snapshot.rows.every((row) => row.county.length <= 64 && row.township.length <= 64)).toBe(true);
    expect(snapshot.rows.every((row) => row.address.length <= 256 && row.structuredRoadSequence.length <= 512)).toBe(true);
    expect(snapshot.rows.every((row) => row.writtenDirections === "")).toBe(true);
    expect(
      searchDirectory(
        snapshot.rows,
        "Parks Bryan Neel Carl Rotter Chad Glauser",
        { type: "all", route: "all" },
      ),
    ).toEqual([]);
  });
});
