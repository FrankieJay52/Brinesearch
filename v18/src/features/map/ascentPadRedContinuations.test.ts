import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PadSummary } from "@/data/types";
import { reviewedNavigationCandidateForPad } from "@/data/reviewedNavigationCandidates";
import approachArtifactJson from "./ascentPadApproaches.batch2.json";
import carlosArtifactJson from "./carlosRedContinuation.json";
import { ascentPadPersistentRedDisplaysForDirectory } from "./ascentPadRedContinuations";

const artifact = carlosArtifactJson;

function carlos(overrides: Partial<PadSummary> = {}): PadSummary {
  return {
    padId: artifact.padId,
    canonicalId: artifact.canonicalId,
    legacyId: artifact.legacyId,
    aliases: [],
    recordNumber: null,
    recordRevision: artifact.recordRevision,
    recordType: "pad",
    company: artifact.company,
    padName: artifact.padName,
    state: artifact.state,
    county: artifact.county,
    township: "",
    address: "",
    coordinate: null,
    mapReference: {
      longitude: artifact.destination[0],
      latitude: artifact.destination[1],
      role: "reference",
      kind: "saved_pad_reference",
    },
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: artifact.structuredRoadSequence,
    writtenDirections: "",
    verificationStatus: "",
    operatingStatus: "",
    updatedAt: null,
    ...overrides,
  };
}

describe("CARLOS persistent red continuation", () => {
  it("binds the exact CARLOS record to Airport Road / CR-82 through US-40", () => {
    const displays = ascentPadPersistentRedDisplaysForDirectory([carlos()]);
    expect(displays).toHaveLength(1);
    expect(displays[0]).toMatchObject({
      kind: "persistent-red-continuation",
      padId: artifact.padId,
      company: "Ascent",
    });
    expect(displays[0].lines).toEqual([artifact.redContinuation]);
    expect(artifact.redContinuation.coordinates).toHaveLength(182);
    expect(artifact.redContinuation.coordinates[0]).toEqual(artifact.roadSeam);
    expect(artifact.redContinuation.coordinates.at(-1)).toEqual([-80.966566, 40.0722464]);
    expect(artifact.redContinuation.nextHighway).toEqual({
      roadClass: "us",
      designation: "US-40",
      junction: [-80.966566, 40.0722464],
    });
    expect(artifact.source.osmWays).toEqual([1458533732, 1458533733, 19001996]);
    expect(artifact.source.osmEndNodeId).toBe(196734938);
  });

  it("freezes the full geometry hash and never colors a connector to the saved GPS", () => {
    expect(createHash("sha256").update(JSON.stringify(artifact.redContinuation.coordinates)).digest("hex"))
      .toBe("0a44385106d3623ff541921b243212ff08b2bffa1f595387edae4f7198cf69b0");
    expect(artifact.redContinuation.noDownstreamPadsProof.redGeometrySha256)
      .toBe(artifact.redContinuation.geometrySha256);
    expect(artifact.noConnectorToGps).toBe(true);
    expect(artifact.roadSeam).not.toEqual(artifact.destination);
    expect(artifact.redContinuation.coordinates).not.toContainEqual(artifact.destination);
    expect(artifact.source.productionWrites).toBe(0);
  });

  it("meets the existing measured CARLOS road at the same OSM seam", () => {
    const batch2 = approachArtifactJson as unknown as {
      records: Array<{ padId: string; roadCoordinates: [number, number][] }>;
    };
    const approach = batch2.records.find((record) => record.padId === artifact.padId);
    expect(approach?.roadCoordinates.at(-1)).toEqual(artifact.roadSeam);
  });

  it("fails closed on record drift or duplicate CARLOS rows", () => {
    expect(ascentPadPersistentRedDisplaysForDirectory([carlos({ recordRevision: "stale" })])).toEqual([]);
    expect(ascentPadPersistentRedDisplaysForDirectory([carlos({ structuredRoadSequence: "changed" })])).toEqual([]);
    expect(ascentPadPersistentRedDisplaysForDirectory([carlos({
      mapReference: { longitude: artifact.destination[0], latitude: artifact.destination[1] + .000001, role: "reference", kind: "saved_pad_reference" },
    })])).toEqual([]);
    expect(ascentPadPersistentRedDisplaysForDirectory([carlos(), carlos()])).toEqual([]);
  });

  it("does not promote CARLOS navigation or replace its stale written road label", () => {
    expect(artifact.structuredRoadSequence).toContain("Elm States Rd");
    expect(artifact.redContinuation.exactRoadIdentity).toBe("Airport Road / CR-82");
    expect(reviewedNavigationCandidateForPad(carlos())).toBeNull();
  });
});
