import { describe, expect, it } from "vitest";
import { getPackagedSnapshotForTest } from "./directory";
import { searchDirectory } from "./search";

const filters = { type: "all", route: "all" } as const;

describe("driver search", () => {
  const snapshot = getPackagedSnapshotForTest();

  it("reconciles the complete packaged directory counts", () => {
    expect(snapshot.counts).toMatchObject({ locations: 1262, pads: 1217, disposals: 45 });
    expect(snapshot.rows).toHaveLength(1262);
    expect(snapshot.rows.filter((row) => row.recordType === "pad")).toHaveLength(1217);
    expect(snapshot.rows.filter((row) => row.recordType === "disposal")).toHaveLength(45);
  });

  it("returns Cologie first for its exact name", () => {
    expect(searchDirectory(snapshot.rows, "COLOGIE", filters, 5)[0]?.legacyId).toBe("ascent--cologie");
  });

  it.each([
    ["antero--albert", "antero--albert"],
    ["34-111-2-4744-00-00", "antero--albert"],
    ["34111247440000", "antero--albert"],
    ["Harrison-1H", "antero--albert"],
    ["42999", "eqt--walking-tall"],
  ])("resolves exact identifier %s deterministically", (query, expectedLegacyId) => {
    const firstRun = searchDirectory(snapshot.rows, query, filters, 20).map((row) => row.padId);
    const secondRun = searchDirectory(snapshot.rows, query, filters, 20).map((row) => row.padId);

    expect(firstRun).toEqual(secondRun);
    expect(searchDirectory(snapshot.rows, query, filters, 1)[0]?.legacyId).toBe(expectedLegacyId);
  });

  it("applies the company filter deterministically", () => {
    const firstRun = searchDirectory(snapshot.rows, "Eqt", { type: "company", route: "all" }, 200);
    const secondRun = searchDirectory(snapshot.rows, "Eqt", { type: "company", route: "all" }, 200);

    expect(firstRun.length).toBeGreaterThan(1);
    expect(firstRun.map((row) => row.padId)).toEqual(secondRun.map((row) => row.padId));
    expect(firstRun.every((row) => row.company === "Eqt")).toBe(true);
  });

  it("returns both ambiguous Cooper records without auto-selecting one", () => {
    const results = searchDirectory(snapshot.rows, "COOPER", filters, 10).filter((row) => row.padName === "COOPER");
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(new Set(results.map((row) => row.company)).size).toBeGreaterThanOrEqual(2);
  });

  it("does not advertise legacy direction text as an approved road search result", () => {
    expect(searchDirectory(snapshot.rows, "Springdale Hill", { type: "road", route: "all" }, 20)).toEqual([]);
  });

  it("finds only an explicitly reviewed safe road term in road mode", () => {
    const fixture = { ...snapshot.rows[0]!, safeRoadTerms: ["Shepherdstown Rd", "CR-64"] };
    expect(searchDirectory([fixture], "CR-64", { type: "road", route: "all" }, 20)).toEqual([fixture]);
  });

  it("requires a road name before showing road-filter results", () => {
    expect(searchDirectory(snapshot.rows, "", { type: "road", route: "all" }, 80)).toEqual([]);
    expect(searchDirectory(snapshot.rows, "   ", { type: "road", route: "all" }, 80)).toEqual([]);
  });

  it("never creates a result for punctuation-only input", () => {
    expect(searchDirectory(snapshot.rows, "---", filters)).toEqual([]);
  });
});
