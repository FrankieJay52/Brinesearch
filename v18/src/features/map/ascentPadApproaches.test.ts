import { describe, expect, it } from "vitest";
import type { PadSummary } from "@/data/types";
import artifactJson from "./ascentPadApproaches.batch2.json";
import {
  ascentPadApproachDirectionAuthorityLabel,
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

function graphEvidenceV3AlabasterArtifact() {
  const artifact = structuredClone(artifactJson) as any;
  const record = artifact.records.find((candidate: any) => candidate.padName === "ALABASTER");
  if (!record) throw new Error("ALABASTER is missing from the sealed schema-3 fixture");
  return { artifact, record };
}

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
  it("parses all 192 records while retaining successful routes and scrubbing pin-only evidence", () => {
    expect((artifactJson as unknown as Record<string, unknown>).scope)
      .toBe("last-exact-highway-identity-bounded-start-to-frozen-pad-gps");
    const catalog = parseAscentPadApproachArtifact(artifactJson);
    expect(catalog.records).toHaveLength(192);
    expect(catalog.records.filter((record) => record.status === "ROUTED_DISPLAY")).toHaveLength(111);
    expect(catalog.records.filter((record) => record.status === "ROUTED_FAIL_CLOSED")).toHaveLength(0);
    expect(catalog.records.filter((record) => record.status === "PIN_ONLY")).toHaveLength(81);
    expect(catalog.records.filter((record) => record.graphEvidence?.receiptApplied === false)).toHaveLength(16);
    for (const record of catalog.records.filter((candidate) => candidate.status === "PIN_ONLY")) {
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

  it("keeps all 111 successful routed displays visible as compact solid teal/neutral runs", () => {
    const catalog = parseAscentPadApproachArtifact(artifactJson);
    const displays = ascentPadApproachMapDisplays(catalog.records);
    expect(displays).toHaveLength(111);
    expect(displays.some((display) => display.lines.some((line) => line.colorRole === "teal"))).toBe(true);
    expect(displays.some((display) => !display.lines.some((line) => line.colorRole === "teal"))).toBe(true);
    expect(displays.every((display) => display.lines.length <= 3)).toBe(true);
    for (const display of displays) {
      expect(display.lines.every((line) => line.coordinates.length >= 2)).toBe(true);
      expect(display.lines.every((line) => (
        line.colorRole === "teal" || line.colorRole === "unverified" || line.colorRole === "gps"
      ))).toBe(true);
    }
  });

  it("labels graph-named and unresolved runs truthfully while keeping every visible line solid", () => {
    const catalog = parseAscentPadApproachArtifact(artifactJson);
    let graphNamedCount = 0;
    let unresolvedCount = 0;
    for (const record of catalog.records.filter((candidate) => candidate.status === "ROUTED_DISPLAY")) {
      expect(record.sections.filter((section) => section.lineStyle !== "none")
        .every((section) => section.lineStyle === "solid")).toBe(true);
      const measuredSections = record.sections.filter((section) => section.lineStyle !== "none");
      expect(record.directions).toHaveLength(measuredSections.length);
      for (const [index, direction] of record.directions.entries()) {
        const section = measuredSections[index];
        expect(direction.matchState).toBe(section.matchState);
        if (direction.authority === "graph_identified_unapproved") {
          graphNamedCount += 1;
          expect(direction.displayName).not.toMatch(/^(?:Unnamed|Unverified) \/ unapproved access$/);
          expect(direction.instruction).toContain(direction.displayName);
          expect(ascentPadApproachDirectionAuthorityLabel(direction))
            .toBe("Graph-identified / unapproved · solid neutral");
        } else if (direction.authority === "generic_unapproved_access") {
          unresolvedCount += 1;
          expect(ascentPadApproachDirectionAuthorityLabel(direction)).toContain("solid neutral");
        }
        expect(direction.displayName).not.toMatch(/^OH-\d+ · SR \d+$/);
      }
      if (record.gpsTether?.nontrivial) {
        expect(record.gpsTether.lineStyle).toBe("solid");
        expect(record.mileage.totalToGpsMiles).toBeNull();
        expect(record.mileage.totalToGpsMeters).toBeNull();
      }
    }
    expect(graphNamedCount).toBeGreaterThan(0);
    expect(unresolvedCount).toBeGreaterThan(0);
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

  it("validates schema-3 graph-named instruction binding and rejects identity-label drift", () => {
    const artifact = structuredClone(artifactJson) as any;
    expect(parseAscentPadApproachArtifact(artifact).records).toHaveLength(192);

    const record = artifact.records.find((candidate: any) => candidate.sections.some((section: any) => (
      section.matchState === "graph_identified_unapproved_source_gap"
    )));
    const section = record.sections.find((candidate: any) => (
      candidate.matchState === "graph_identified_unapproved_source_gap"
    ));
    section.instruction = "Continue on a different road · graph-identified / unapproved";
    expect(parseAscentPadApproachArtifact(artifact).records.some((candidate) => (
      candidate.padId === record.padId
    ))).toBe(false);
  });

  it("retains a zero-exact successful route as solid neutral with qualified router labels", () => {
    const artifact = structuredClone(artifactJson) as any;
    const rawRecord = artifact.records.find((candidate: any) => (
      candidate.status === "ROUTED_DISPLAY"
      && candidate.diagnostics.graphEvidenceReceiptApplied === false
    ));

    const parsed = parseAscentPadApproachArtifact(artifact).byPadId.get(rawRecord.padId);
    expect(parsed?.reason).toBe("graph_evidence_receipt_missing_route_retained");
    expect(parsed?.graphEvidence).toEqual({
      receiptApplied: false,
      receiptKeySha256: null,
      receiptSha256: null,
      routeCoordinateSha256: null,
    });
    expect(parsed?.roadCoordinates).toEqual(rawRecord.roadCoordinates);
    expect(parsed?.mileage.roadDistanceMeters).toBe(rawRecord.mileage.roadDistanceMeters);
    expect(parsed?.directions.length).toBeGreaterThan(0);
    expect(parsed?.directions.every((direction) => (
      direction.authority === "generic_unapproved_access"
    ))).toBe(true);
    expect(parsed?.directions.some((direction) => (
      direction.displayName.endsWith(" · router-reported / graph-unverified")
    ))).toBe(true);

    const display = parsed ? ascentPadApproachMapDisplay(parsed) : null;
    expect(display?.lines.some((line) => line.colorRole === "teal")).toBe(false);
    expect(display?.lines.some((line) => line.colorRole === "unverified")).toBe(true);
    expect(display?.lines.every((line) => line.coordinates.length >= 2)).toBe(true);
  });

  it("keeps exact graph road names and mileage after ALABASTER teal approval stops", () => {
    const { artifact, record: rawRecord } = graphEvidenceV3AlabasterArtifact();
    const record = parseAscentPadApproachArtifact(artifact).byPadId.get(rawRecord.padId);
    expect(record?.graphEvidence).toMatchObject({
      receiptApplied: true,
    });
    expect(record?.graphEvidence?.receiptKeySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record?.graphEvidence?.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record?.graphEvidence?.routeCoordinateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record?.sections.filter((section) => section.lineStyle !== "none")
      .every((section) => section.lineStyle === "solid")).toBe(true);
    expect(record?.directions.slice(0, 2).map((direction) => direction.displayName)).toEqual([
      "OH-78 · MCCONNELSVILLE RD",
      "BEAN RIDGE RD / CR-54",
    ]);
    expect(record?.directions.map((direction) => direction.displayName)).toEqual(expect.arrayContaining([
      "BEAN RIDGE RD / CR-82",
      "TR-33",
      "CURTIS RIDGE RD / TR-233",
      "BUCKINGHAM RD / TR-232",
    ]));
    expect(record?.directions.slice(2).every((direction) => (
      direction.authority !== "named_public_road" && direction.distanceMiles !== null
    ))).toBe(true);
    const firstGraphNamedNeutral = record?.directions.find((direction) => (
      direction.authority === "graph_identified_unapproved"
    ));
    expect(ascentPadApproachDirectionAuthorityLabel(firstGraphNamedNeutral!))
      .toBe("Graph-identified / unapproved · solid neutral");
    const display = record ? ascentPadApproachMapDisplay(record) : null;
    expect(display?.lines.some((line) => (
      line.colorRole === "unverified" && line.label.includes("CR-82")
    ))).toBe(true);
    expect(display?.lines.some((line) => (
      line.colorRole === "unverified" && line.label.includes("BUCKINGHAM")
    ))).toBe(true);
  });

  it("fails a graph receipt section closed when its exact identity digest drifts", () => {
    const { artifact, record } = graphEvidenceV3AlabasterArtifact();
    const exactSection = record.sections.find((section: any) => (
      section.matchState === "matched_ordered_source_and_exact_graph_receipt"
    ));
    exactSection.graphEvidence.geometryDigest = "not-a-digest";
    expect(parseAscentPadApproachArtifact(artifact).byPadId.has(record.padId)).toBe(false);
  });
});
