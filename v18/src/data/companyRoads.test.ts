import { describe, expect, it } from "vitest";
import { validateCompanyRoadPage } from "./companyRoads";

const directorySnapshotId = "11111111-1111-4111-8111-111111111111";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    selection: { kind: "company", company: "Ascent" },
    availableCompanies: ["Ascent", "EQT"],
    snapshot: {
      snapshotId: "22222222-2222-4222-8222-222222222222",
      directorySnapshotId,
      sourceRevision: "7",
      generatedAt: "2026-08-22T00:00:00Z",
      publishedAt: "2026-08-22T00:00:00Z",
      publicationState: "current",
      retainedUntil: null,
      rowCount: 1,
      companyCount: 2,
    },
    page: { afterOrdinal: 0, nextAfterOrdinal: 1, rowCount: 1, complete: true },
    rows: [{
      ordinal: 1,
      companyLabel: "Ascent",
      companies: ["Ascent"],
      displayNames: ["Shepherdstown Rd"],
      verifiedDesignations: ["CR-64"],
      states: ["OH"],
      counties: ["Jefferson"],
      geometry: { type: "LineString", coordinates: [[-80.8, 40.1], [-80.79, 40.11]] },
      lengthMiles: 1.2,
    }],
    ...overrides,
  };
}

describe("company approved-road page validation", () => {
  it("accepts an exact directory-bound company page", () => {
    const result = validateCompanyRoadPage(payload(), directorySnapshotId, "Ascent", 0);
    expect(result?.rows[0]).toMatchObject({ companyLabel: "Ascent", displayNames: ["Shepherdstown Rd"], verifiedDesignations: ["CR-64"] });
  });

  it("rejects a different directory snapshot or inferred company binding", () => {
    const wrongDirectory = payload();
    (wrongDirectory.snapshot as Record<string, unknown>).directorySnapshotId = "33333333-3333-4333-8333-333333333333";
    expect(validateCompanyRoadPage(wrongDirectory, directorySnapshotId, "Ascent", 0)).toBeNull();
    const inferred = payload();
    (inferred.rows as Array<Record<string, unknown>>)[0].companies = ["Ascent", "EQT"];
    expect(validateCompanyRoadPage(inferred, directorySnapshotId, "Ascent", 0)).toBeNull();
  });

  it("rejects out-of-area geometry, ordinal gaps, and unexpected fields", () => {
    const geometry = payload();
    (geometry.rows as Array<Record<string, unknown>>)[0].geometry = { type: "LineString", coordinates: [[0, 0], [-80.79, 40.11]] };
    expect(validateCompanyRoadPage(geometry, directorySnapshotId, "Ascent", 0)).toBeNull();
    const ordinal = payload();
    (ordinal.rows as Array<Record<string, unknown>>)[0].ordinal = 2;
    expect(validateCompanyRoadPage(ordinal, directorySnapshotId, "Ascent", 0)).toBeNull();
    expect(validateCompanyRoadPage({ ...payload(), privateDigest: "hidden" }, directorySnapshotId, "Ascent", 0)).toBeNull();
  });

  it("accepts All only when companyLabel is null", () => {
    const all = payload({ selection: { kind: "all", company: null } });
    (all.rows as Array<Record<string, unknown>>)[0].companyLabel = null;
    (all.rows as Array<Record<string, unknown>>)[0].companies = ["Ascent", "EQT"];
    expect(validateCompanyRoadPage(all, directorySnapshotId, "all", 0)).not.toBeNull();
    (all.rows as Array<Record<string, unknown>>)[0].companyLabel = "Ascent";
    expect(validateCompanyRoadPage(all, directorySnapshotId, "all", 0)).toBeNull();
  });
});
