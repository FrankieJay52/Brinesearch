import { describe, expect, it } from "vitest";
import { getPackagedSnapshotForTest } from "./directory";
import { closestPadSearchResults, distanceMilesBetween, nearbyDistanceLabel, nearbyPadResultsHeading, searchDirectory } from "./search";

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

  it("returns exactly seven closest mapped pads for an empty quick search", () => {
    const origin = { latitude: 40.25, longitude: -80.91 };
    const results = closestPadSearchResults(snapshot.rows, "", origin);

    expect(results).toHaveLength(7);
    expect(results.every((row) => row.recordType === "pad")).toBe(true);
  });

  it("puts the pad at the phone's current coordinates first", () => {
    const base = snapshot.rows.find((row) => row.recordType === "pad")!;
    const rows = [
      { ...base, padId: "two-miles", padName: "SECOND", coordinate: { latitude: 40.029, longitude: -80, role: "driver_entrance" as const } },
      { ...base, padId: "sitting-here", padName: "FIRST", coordinate: { latitude: 40, longitude: -80, role: "driver_entrance" as const } },
      { ...base, padId: "one-mile", padName: "THIRD", coordinate: { latitude: 40.0145, longitude: -80, role: "driver_entrance" as const } },
    ];

    expect(closestPadSearchResults(rows, "", { latitude: 40, longitude: -80 }).map((row) => row.padId)).toEqual([
      "sitting-here",
      "one-mile",
      "two-miles",
    ]);
  });

  it("filters literal pad-name matches and ranks them nearest-first", () => {
    const base = snapshot.rows.find((row) => row.recordType === "pad")!;
    const rows = [
      { ...base, padId: "far", padName: "ALPHA FAR", coordinate: { latitude: 40.5, longitude: -80.5, role: "driver_entrance" as const } },
      { ...base, padId: "other", padName: "BRAVO NEAR", coordinate: { latitude: 40.001, longitude: -80, role: "driver_entrance" as const } },
      { ...base, padId: "near", padName: "ALPHA NEAR", coordinate: { latitude: 40.01, longitude: -80, role: "driver_entrance" as const } },
    ];

    expect(closestPadSearchResults(rows, "alpha", { latitude: 40, longitude: -80 }).map((row) => row.padId)).toEqual(["near", "far"]);
    expect(closestPadSearchResults(rows, "a", { latitude: 40, longitude: -80 }).map((row) => row.padId)).toEqual(["other", "near", "far"]);
  });

  it("falls back to deterministic name search when device location is unavailable", () => {
    const base = snapshot.rows.find((row) => row.recordType === "pad")!;
    const rows = [
      { ...base, padId: "zulu", padName: "COLOGIE ZULU" },
      { ...base, padId: "alpha", padName: "COLOGIE ALPHA" },
    ];

    expect(closestPadSearchResults(rows, "cologie", null).map((row) => row.padId)).toEqual(["alpha", "zulu"]);
    expect(closestPadSearchResults(rows, "", null)).toEqual([]);
    expect(closestPadSearchResults(rows, "---", null)).toEqual([]);
  });

  it("keeps equal-distance results deterministic when directory input order changes", () => {
    const base = snapshot.rows.find((row) => row.recordType === "pad")!;
    const alpha = { ...base, padId: "alpha", padName: "MATCH ALPHA", coordinate: { latitude: 40.01, longitude: -80, role: "driver_entrance" as const } };
    const zulu = { ...base, padId: "zulu", padName: "MATCH ZULU", coordinate: { latitude: 40.01, longitude: -80, role: "driver_entrance" as const } };
    const origin = { latitude: 40, longitude: -80 };

    expect(closestPadSearchResults([zulu, alpha], "match", origin).map((row) => row.padId)).toEqual(["alpha", "zulu"]);
    expect(closestPadSearchResults([alpha, zulu], "match", origin).map((row) => row.padId)).toEqual(["alpha", "zulu"]);
  });

  it("labels approximate phone distance without claiming the phone is at a pad entrance", () => {
    expect(nearbyDistanceLabel(0)).toBe("<0.1 mi from phone GPS");
    expect(nearbyDistanceLabel(1.24)).toBe("~1.2 mi from phone GPS");
    expect(nearbyDistanceLabel(null)).toBeNull();
  });

  it("describes proximity only when a valid phone GPS is available", () => {
    const phone = { latitude: 40.25, longitude: -80.91 };
    expect(nearbyPadResultsHeading("", phone)).toBe("7 closest pads");
    expect(nearbyPadResultsHeading("Cologie", phone)).toBe("Closest matching pads");
    expect(nearbyPadResultsHeading("", null)).toBe("Nearby pads");
    expect(nearbyPadResultsHeading("Cologie", null)).toBe("Pad-name matches");
  });

  it("uses real great-circle distance without changing route authority", () => {
    expect(distanceMilesBetween(
      { latitude: 40, longitude: -80 },
      { latitude: 41, longitude: -80 },
    )).toBeCloseTo(69.1, 0);
  });
});
