import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import batch2Artifact from "@/features/map/ascentPadApproaches.batch2.json";
import { ascentSavedDirectionExactMatchBatch1 } from "./ascentSavedDirectionExactMatchBatch1";

const rawBatch2Records = (batch2Artifact as unknown as { records: any[] }).records;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("Ascent saved-direction exact-match Batch 1", () => {
  it("freezes exactly six deterministic highway-direct record bindings", () => {
    expect(ascentSavedDirectionExactMatchBatch1.map((record) => record.padName)).toEqual([
      "HELLER",
      "JENNINGS",
      "KEMPER",
      "RED-HILL-FARM",
      "AXLE",
      "KALDOR",
    ]);
    expect(new Set(ascentSavedDirectionExactMatchBatch1.map((record) => record.padId)).size).toBe(6);

    for (const record of ascentSavedDirectionExactMatchBatch1) {
      expect(record.canonicalId).toBe(record.padId);
      expect(sha256(record.structuredRoadSequence)).toBe(record.structuredRoadSequenceSha256);
      expect(record.routeDestination).toEqual({
        latitude: record.trustedDestination.latitude,
        longitude: record.trustedDestination.longitude,
      });
      expect(record.trustedDestination).toMatchObject({
        source: "saved_pad_gps",
        destinationGpsSource: "saved",
        directoryCoordinateRole: "saved pad reference",
      });
      expect(record.selectedTerminalPublicRoadSequence).toHaveLength(1);
      expect(record.selectedTerminalPublicRoadSequence.join(" ")).not.toMatch(/lease|access|pad/iu);
    }
  });

  it("cross-binds every record to its immutable Batch-2 highway receipt and neutral GPS tether", () => {
    for (const record of ascentSavedDirectionExactMatchBatch1) {
      const batch2 = rawBatch2Records.find((candidate) => candidate.padId === record.padId);
      expect(batch2, record.padName).toBeDefined();
      expect(batch2, record.padName).toMatchObject({
        canonicalId: record.canonicalId,
        legacyId: record.legacyId,
        recordRevision: record.recordRevision,
        padName: record.padName,
        company: record.company,
        state: record.state,
        county: record.county,
        structuredRoadSequence: record.structuredRoadSequence,
        status: "ROUTED_DISPLAY",
      });
      expect(batch2.destination.coordinates, record.padName).toEqual([
        record.trustedDestination.longitude,
        record.trustedDestination.latitude,
      ]);
      expect(batch2.start, record.padName).toMatchObject({
        authority: record.measuredApproachEvidence.startAuthority,
        candidateOnly: record.measuredApproachEvidence.startCandidateOnly,
        anchoredRoadId: record.measuredApproachEvidence.startAnchoredRoadId,
      });
      expect(batch2.start.snappedCoordinate, record.padName).toEqual([
        record.waypoints[0].longitude,
        record.waypoints[0].latitude,
      ]);
      expect(batch2.lastHighway, record.padName).toMatchObject({
        sourceStepOrder: record.measuredApproachEvidence.lastHighwaySourceStepOrder,
        roadId: record.measuredApproachEvidence.roadId,
      });
      expect(record.selectedTerminalPublicRoadSequence, record.padName).toEqual([
        batch2.lastHighway.displayRoad,
      ]);

      const roadSections = batch2.sections.filter((section: any) => section.matchState !== "structural_zero_distance");
      const firstNeutralIndex = roadSections.findIndex((section: any) =>
        section.matchState !== "matched_ordered_source_and_exact_graph_receipt");
      const exactPrefix = firstNeutralIndex === -1 ? roadSections : roadSections.slice(0, firstNeutralIndex);
      const neutralRemainder = firstNeutralIndex === -1 ? [] : roadSections.slice(firstNeutralIndex);
      expect(exactPrefix.length, record.padName).toBeGreaterThan(0);
      for (const section of exactPrefix) {
        expect(section, record.padName).toMatchObject({
          matchState: "matched_ordered_source_and_exact_graph_receipt",
          lineStyle: "solid",
          colorRole: "teal",
          authority: "immutable_graph_evidence_receipt",
          sourceRoadId: record.measuredApproachEvidence.roadId,
          sourceIdentityId: record.measuredApproachEvidence.identityId,
          matchedIdentitySha256: record.measuredApproachEvidence.matchedIdentitySha256,
        });
      }
      for (const section of neutralRemainder) {
        expect(section.matchState, record.padName).toMatch(/^unverified_/u);
        expect(section, record.padName).toMatchObject({
          lineStyle: "solid",
          colorRole: "unverified",
          sourceRoadId: null,
          sourceIdentityId: null,
          sourceDisplayRoad: null,
          routerReportedUnverifiedLabel: null,
          matchedIdentitySha256: null,
        });
        expect([
          "unverified_graph_evidence",
          "permanent_stop_after_source_or_graph_gap",
        ], record.padName).toContain(section.authority);
      }
      expect(batch2.diagnostics, record.padName).toMatchObject({
        graphEvidenceReceiptApplied: true,
        graphEvidenceStatus: "sealed_receipt_applied",
        graphEvidenceReceiptKeySha256: record.measuredApproachEvidence.graphEvidenceReceiptKeySha256,
        graphEvidenceReceiptSha256: record.measuredApproachEvidence.graphEvidenceReceiptSha256,
        graphEvidenceRouteCoordinateSha256: record.measuredApproachEvidence.graphEvidenceRouteCoordinateSha256,
        simplifiedGeometrySha256: record.measuredApproachEvidence.roadCoordinatesSha256,
      });
      expect(batch2.gpsTether, record.padName).toMatchObject({
        lineStyle: "solid",
        colorRole: "gps",
        authority: record.measuredApproachEvidence.gpsTetherAuthority,
        navigationGeometry: record.measuredApproachEvidence.gpsTetherNavigationGeometry,
        distanceMeters: record.measuredApproachEvidence.gpsTetherDistanceMeters,
      });
      expect(batch2.mileage.totalToGpsMiles, record.padName).toBeNull();
    }
  });

  it("shares the exact OH-147 identity without sharing either pad-specific tail", () => {
    const heller = ascentSavedDirectionExactMatchBatch1.find((record) => record.padName === "HELLER")!;
    const kemper = ascentSavedDirectionExactMatchBatch1.find((record) => record.padName === "KEMPER")!;
    expect(heller.measuredApproachEvidence.roadId).toBe(kemper.measuredApproachEvidence.roadId);
    expect(heller.measuredApproachEvidence.identityId).toBe(kemper.measuredApproachEvidence.identityId);
    expect(heller.routeDestination).not.toEqual(kemper.routeDestination);
    expect(heller.measuredApproachEvidence.roadCoordinatesSha256)
      .not.toBe(kemper.measuredApproachEvidence.roadCoordinatesSha256);
  });

  it("keeps RED-HILL-FARM's material access gap neutral and non-navigation", () => {
    const redHill = ascentSavedDirectionExactMatchBatch1.find((record) => record.padName === "RED-HILL-FARM")!;
    expect(redHill.measuredApproachEvidence.gpsTetherDistanceMeters).toBeCloseTo(198.36400693513545, 9);
    expect(redHill.measuredApproachEvidence.gpsTetherAuthority)
      .toBe("unapproved_straight_network_snap_to_saved_gps");
    expect(redHill.measuredApproachEvidence.gpsTetherNavigationGeometry).toBe(false);
    expect(redHill.finalLegNotice).toMatch(/unnamed, unapproved GPS\/access handoff/u);
    expect(redHill.finalLegNotice).toMatch(/not road or navigation geometry/u);
  });

  it("stops AXLE and KALDOR teal at their receipt-backed OH-147 prefix", () => {
    for (const [padName, expectedNeutralMeters, expectedTetherMeters] of [
      ["AXLE", 357.2756756756757, 299.9090977139086],
      ["KALDOR", 774.5712328767123, 538.3996263081775],
    ] as const) {
      const record = ascentSavedDirectionExactMatchBatch1.find((candidate) => candidate.padName === padName)!;
      const batch2 = rawBatch2Records.find((candidate) => candidate.padId === record.padId);
      const roadSections = batch2.sections.filter((section: any) => section.matchState !== "structural_zero_distance");
      const firstNeutralIndex = roadSections.findIndex((section: any) => section.colorRole !== "teal");
      expect(firstNeutralIndex, padName).toBeGreaterThan(0);
      expect(roadSections.slice(0, firstNeutralIndex).every((section: any) =>
        section.authority === "immutable_graph_evidence_receipt" && section.colorRole === "teal"), padName).toBe(true);
      expect(roadSections.slice(firstNeutralIndex).every((section: any) =>
        section.colorRole === "unverified"
          && section.sourceRoadId === null
          && section.sourceIdentityId === null), padName).toBe(true);
      expect(batch2.diagnostics.unapprovedDistanceMeters, padName).toBeCloseTo(expectedNeutralMeters, 9);
      expect(batch2.diagnostics.solidStopsPermanentlyAtFirstMismatch, padName).toBe(true);
      expect(batch2.sourceDirections.slice(1).every((step: any) =>
        step.sourceDisplayRoad === null && step.instructionRole === "generic_unapproved_access"), padName).toBe(true);
      expect(batch2.gpsTether.distanceMeters, padName).toBeCloseTo(expectedTetherMeters, 9);
      expect(batch2.gpsTether.navigationGeometry, padName).toBe(false);
      expect(record.finalLegNotice, padName).toMatch(/solid neutral and unapproved/u);
      expect(record.finalLegNotice, padName).toMatch(/not road or navigation geometry/u);
    }
  });
});
