import { describe, expect, it } from "vitest";
import type { PadSummary } from "@/data/types";
import artifactJson from "./ascentPadApproaches.batch2.json";
import {
  ascentPadApproachMapDisplay,
  ascentPadApproachMapDisplays,
  loadAscentPadApproachesForDirectory,
  parseAscentPadApproachArtifact,
} from "./ascentPadApproaches";

interface RawRecord {
  padId: string;
  canonicalId: string;
  legacyId: string;
  recordRevision: string;
  padName: string;
  company: string;
  state: string;
  county: string;
  structuredRoadSequence: string;
  destination: { coordinates: [number, number] };
}

const rawArtifact = artifactJson as unknown as { records: RawRecord[] };

function padForRecord(record: RawRecord, overrides: Partial<PadSummary> = {}): PadSummary {
  return {
    padId: record.padId,
    canonicalId: record.canonicalId,
    legacyId: record.legacyId,
    aliases: [record.legacyId],
    recordNumber: 1,
    recordRevision: record.recordRevision,
    recordType: "pad",
    company: record.company,
    padName: record.padName,
    state: record.state,
    county: record.county,
    township: "",
    address: "",
    coordinate: {
      role: "legacy_saved",
      longitude: record.destination.coordinates[0],
      latitude: record.destination.coordinates[1],
    },
    mapReference: null,
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: record.structuredRoadSequence,
    writtenDirections: "",
    verificationStatus: "",
    operatingStatus: "",
    updatedAt: null,
    ...overrides,
  };
}

describe("Ascent last-highway approach runtime catalog", () => {
  it("parses all 192 records while scrubbing fail-closed candidate evidence", () => {
    expect((artifactJson as unknown as Record<string, unknown>).scope)
      .toBe("last-exact-highway-identity-bounded-start-to-frozen-pad-gps");
    const catalog = parseAscentPadApproachArtifact(artifactJson);
    expect(catalog.records).toHaveLength(192);
    expect(catalog.records.filter((record) => record.status === "ROUTED_DISPLAY")).toHaveLength(95);
    expect(catalog.records.filter((record) => record.status === "ROUTED_FAIL_CLOSED")).toHaveLength(16);
    expect(catalog.records.filter((record) => record.status === "PIN_ONLY")).toHaveLength(81);
    for (const record of catalog.records.filter((candidate) => candidate.status !== "ROUTED_DISPLAY")) {
      expect(record.start).toBeNull();
      expect(record.roadCoordinates).toEqual([]);
      expect(record.sections).toEqual([]);
      expect(record.gpsTether).toBeNull();
      expect(record.mileage.roadDistanceMiles).toBeNull();
      expect(record.mileage.totalToGpsMiles).toBeNull();
      expect(record.directions).toEqual([]);
      expect(ascentPadApproachMapDisplay(record)).toBeNull();
    }
  });

  it("exact-binds every record and fails only a stale directory row closed", async () => {
    const pads = rawArtifact.records.map((record) => padForRecord(record));
    expect(await loadAscentPadApproachesForDirectory(pads)).toHaveLength(192);
    const stalePads = pads.map((pad, index) => index === 0
      ? { ...pad, recordRevision: `${pad.recordRevision}-stale` }
      : pad);
    const bound = await loadAscentPadApproachesForDirectory(stalePads);
    expect(bound).toHaveLength(191);
    expect(bound.some((record) => record.padId === pads[0].padId)).toBe(false);
  });

  it("exposes map geometry only for 95 routed displays in compact solid/dashed runs", () => {
    const catalog = parseAscentPadApproachArtifact(artifactJson);
    const displays = ascentPadApproachMapDisplays(catalog.records);
    expect(displays).toHaveLength(95);
    expect(displays.every((display) => display.lines.some((line) => line.colorRole === "teal"))).toBe(true);
    expect(displays.every((display) => display.lines.length <= 3)).toBe(true);
    for (const display of displays) {
      expect(display.lines.every((line) => line.coordinates.length >= 2)).toBe(true);
    }
  });

  it("keeps every post-mismatch direction generic and withholds totals for nontrivial tethers", () => {
    const catalog = parseAscentPadApproachArtifact(artifactJson);
    for (const record of catalog.records.filter((candidate) => candidate.status === "ROUTED_DISPLAY")) {
      const firstGeneric = record.directions.findIndex((direction) => direction.authority === "generic_unapproved_access");
      if (firstGeneric >= 0) {
        expect(record.directions.slice(firstGeneric).every((direction) => (
          direction.displayName === "Unnamed / unapproved access"
          && direction.instruction === "Continue on unnamed/unapproved access"
        ))).toBe(true);
      }
      if (record.gpsTether?.nontrivial) {
        expect(record.mileage.totalToGpsMiles).toBeNull();
        expect(record.mileage.totalToGpsMeters).toBeNull();
      }
    }
  });

  it("keeps remote highway anchors pin-only with no candidate geometry or mileage", () => {
    const catalog = parseAscentPadApproachArtifact(artifactJson);
    for (const padName of ["CENA", "NOELLE", "ROXY", "SPORT", "TANNER"]) {
      const record = catalog.records.find((candidate) => candidate.padName === padName);
      expect(record).toMatchObject({
        status: "PIN_ONLY",
        reason: "candidate_start_exceeds_25_air_miles_from_destination",
        start: null,
        roadCoordinates: [],
        sections: [],
        gpsTether: null,
        directions: [],
        mileage: {
          roadDistanceMeters: null,
          roadDistanceMiles: null,
          totalToGpsMeters: null,
          totalToGpsMiles: null,
          gpsTetherExcluded: true,
        },
      });
      expect(record && ascentPadApproachMapDisplay(record)).toBeNull();
    }
  });

  it("rejects display geometry without the exact last-highway anchor or within-25-mile spatial relevance", () => {
    const firstDisplay = (artifactJson as unknown as { records: Array<Record<string, unknown>> }).records
      .find((record) => record.status === "ROUTED_DISPLAY");
    expect(firstDisplay).toBeDefined();

    const wrongAnchor = structuredClone(artifactJson) as unknown as { records: Array<Record<string, unknown>> };
    const wrongAnchorRecord = wrongAnchor.records.find((record) => record.padId === firstDisplay?.padId)!;
    (wrongAnchorRecord.start as Record<string, unknown>).anchoredRoadId = "not-the-last-highway-road-id";
    expect(parseAscentPadApproachArtifact(wrongAnchor).records.some((record) => record.padId === firstDisplay?.padId)).toBe(false);

    const remoteStart = structuredClone(artifactJson) as unknown as { records: Array<Record<string, unknown>> };
    const remoteStartRecord = remoteStart.records.find((record) => record.padId === firstDisplay?.padId)!;
    (remoteStartRecord.start as Record<string, unknown>).requestedCoordinate = [-83, 38];
    (remoteStartRecord.start as Record<string, unknown>).startToDestinationAirMiles = 24;
    expect(parseAscentPadApproachArtifact(remoteStart).records.some((record) => record.padId === firstDisplay?.padId)).toBe(false);
  });

  it("rejects a malformed batch header rather than partially trusting its records", () => {
    expect(parseAscentPadApproachArtifact({
      ...(artifactJson as unknown as Record<string, unknown>),
      batchId: "wrong-batch",
    }).records).toEqual([]);
  });
});
