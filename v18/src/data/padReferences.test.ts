import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { attachPadReferences, normalizePadReferencePayload } from "./padReferences";
import type { DirectorySnapshot, PadSummary } from "./types";

const snapshotId = "11111111-1111-4111-8111-111111111111";
const padId = "22222222-2222-4222-8222-222222222222";

function pad(): PadSummary {
  return {
    padId,
    canonicalId: padId,
    legacyId: null,
    aliases: [],
    recordNumber: 1,
    recordRevision: "1",
    recordType: "pad",
    company: "Fixture",
    padName: "REFERENCE PAD",
    state: "Ohio",
    county: "Belmont",
    township: "",
    address: "",
    coordinate: null,
    mapReference: null,
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: "",
    writtenDirections: "",
    verificationStatus: "held",
    operatingStatus: "active",
    updatedAt: null,
  };
}

function snapshot(): DirectorySnapshot {
  return {
    schemaVersion: 1,
    snapshotId,
    sourceRevision: "5",
    sourceState: "live_current",
    generatedAt: "2026-08-25T00:00:00Z",
    fetchedAt: "2026-08-25T00:00:00Z",
    lastVerifiedAt: "2026-08-25T00:00:00Z",
    rows: [pad()],
    counts: { locations: 1, pads: 1, disposals: 0, mapped: 0 },
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    snapshotId,
    sourceRevision: "5",
    rowCount: 1,
    kindCounts: { officialPadReference: 1, officialWellheadReference: 0 },
    contentSha256: "a".repeat(64),
    rows: [{
      padId,
      referenceKind: "official_pad_reference",
      latitude: 40.1,
      longitude: -80.9,
    }],
    ...overrides,
  };
}

describe("V18 exact official pad-reference contract", () => {
  it("attaches a validated reference without changing the verified-coordinate count", () => {
    const references = normalizePadReferencePayload(payload(), snapshotId, "5");
    expect(references).not.toBeNull();
    const result = attachPadReferences(snapshot(), references!);
    expect(result.counts.mapped).toBe(0);
    expect(result.rows[0].coordinate).toBeNull();
    expect(result.rows[0].mapReference).toMatchObject({
      role: "reference",
      kind: "official_pad_reference",
      latitude: 40.1,
      longitude: -80.9,
    });
  });

  it("rejects snapshot drift, duplicate IDs, private fields, and count changes", () => {
    expect(normalizePadReferencePayload(payload({ snapshotId: "33333333-3333-4333-8333-333333333333" }), snapshotId, "5")).toBeNull();
    expect(normalizePadReferencePayload(payload({ sourceRevision: "6" }), snapshotId, "5")).toBeNull();
    expect(normalizePadReferencePayload(payload({ rowCount: 2 }), snapshotId, "5")).toBeNull();
    expect(normalizePadReferencePayload(payload({ rows: [payload().rows[0], payload().rows[0]], rowCount: 2, kindCounts: { officialPadReference: 2, officialWellheadReference: 0 } }), snapshotId, "5")).toBeNull();
    expect(normalizePadReferencePayload(payload({ rows: [{ ...payload().rows[0], note: "private" }] }), snapshotId, "5")).toBeNull();
  });

  it("pins the SQL to display-only exact official sources", () => {
    const migration = readFileSync(new URL(
      "../../../supabase/migrations/20260825081500_v18_public_pad_reference_coordinates.sql",
      import.meta.url,
    ), "utf8");
    expect(migration).toContain("'official_pad_layer'");
    expect(migration).toContain("'saved_api_exact_official'");
    expect(migration).toContain("'official_pad_reference'");
    expect(migration).toContain("'official_wellhead_reference'");
    expect(migration).not.toMatch(/\b(update|delete|truncate)\s+public\./i);
    expect(migration).toContain("pg_catalog.strpos(v_definition,'written_directions')>0");
    expect(migration).toContain("pg_catalog.strpos(v_definition,'directions_clear')>0");
    expect(migration).not.toContain("nearest_road");
    expect(migration).not.toContain("fuzzy_name");
  });
});
