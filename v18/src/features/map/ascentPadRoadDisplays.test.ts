import { describe, expect, it } from "vitest";
import type { PadSummary } from "@/data/types";
import artifactJson from "./ascentPadRoadDisplays.batch1.json";
import {
  ascentPadRoadDisplayForPad,
  ascentPadRoadDisplaysForDirectory,
  ascentRedContinuationIsEligible,
} from "./ascentPadRoadDisplays";

interface RouteFixture {
  padId: string;
  canonicalId: string;
  legacyId: string;
  recordRevision: string;
  padName: string;
  company: string;
  state: string;
  county: string;
  structuredRoadSequence: string;
  directoryCoordinate: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
}

const routes = (artifactJson as unknown as { routes: RouteFixture[] }).routes;

function padForRoute(route: RouteFixture, overrides: Partial<PadSummary> = {}): PadSummary {
  return {
    padId: route.padId,
    canonicalId: route.canonicalId,
    legacyId: route.legacyId,
    aliases: [route.legacyId],
    recordNumber: 1,
    recordRevision: route.recordRevision,
    recordType: "pad",
    company: route.company,
    padName: route.padName,
    state: route.state,
    county: route.county,
    township: "",
    address: "",
    coordinate: {
      role: "legacy_saved",
      latitude: route.directoryCoordinate.latitude,
      longitude: route.directoryCoordinate.longitude,
    },
    mapReference: null,
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: route.structuredRoadSequence,
    writtenDirections: "",
    verificationStatus: "",
    operatingStatus: "",
    updatedAt: null,
    ...overrides,
  };
}

describe("Ascent reviewed all-55 road-line artifact", () => {
  it("binds all 55 generated routes to their exact directory records", () => {
    expect(routes).toHaveLength(55);
    const displays = ascentPadRoadDisplaysForDirectory(routes.map((route) => padForRoute(route)));
    expect(displays).toHaveLength(55);
    expect(new Set(displays.map((display) => display.padId)).size).toBe(55);
    expect(displays.every((display) => display.company === "Ascent")).toBe(true);
  });

  it("fails one stale record independently while retaining the other 54", () => {
    const pads = routes.map((route, index) => padForRoute(
      route,
      index === 0 ? { recordRevision: `${route.recordRevision}-stale` } : {},
    ));
    const displays = ascentPadRoadDisplaysForDirectory(pads);
    expect(displays).toHaveLength(54);
    expect(displays.some((display) => display.padId === routes[0].padId)).toBe(false);
    expect(ascentPadRoadDisplayForPad(pads[0])).toBeNull();
  });

  it("binds BILINOVICH by its directory coordinate while keeping its distinct route destination", () => {
    const route = routes.find((candidate) => candidate.padName === "BILINOVICH");
    expect(route).toBeDefined();
    const display = ascentPadRoadDisplayForPad(padForRoute(route!));
    expect(display).not.toBeNull();
    expect(display?.directoryCoordinate).toEqual([
      route!.directoryCoordinate.longitude,
      route!.directoryCoordinate.latitude,
    ]);
    expect(display?.savedPin).toEqual([route!.destination.longitude, route!.destination.latitude]);
    expect(display?.savedPin).not.toEqual(display?.directoryCoordinate);
  });

  it("keeps solid network geometry separate from dashed unapproved GPS tethers", () => {
    const displays = ascentPadRoadDisplaysForDirectory(routes.map((route) => padForRoute(route)));
    expect(displays.every((display) => display.arrival.colorRole === "teal"
      && display.arrival.pattern === "solid")).toBe(true);
    expect(displays.filter((display) => display.gpsLeg)).toHaveLength(54);
    for (const display of displays) {
      if (display.gpsLeg) {
        expect(display.gpsLeg.colorRole).toBe("gps");
        expect(display.gpsLeg.lineStyle).toBe("dashed");
        expect(display.gpsLeg.authority).toBe("unapproved_gps_tether");
        expect(display.gpsLeg.navigationGeometry).toBe(false);
        expect(display.gpsLeg.coordinates[0]).toEqual(display.arrival.coordinates.at(-1));
        expect(display.gpsLeg.coordinates.at(-1)).toEqual(display.savedPin);
      } else {
        expect(display.arrival.coordinates.at(-1)).toEqual(display.savedPin);
      }
    }
  });

  it("rejects record-coordinate, sequence, and duplicate mismatches independently", () => {
    const first = routes[0];
    expect(ascentPadRoadDisplayForPad(padForRoute(first, {
      coordinate: { role: "legacy_saved", latitude: first.directoryCoordinate.latitude + .000001, longitude: first.directoryCoordinate.longitude },
    }))).toBeNull();
    expect(ascentPadRoadDisplayForPad(padForRoute(first, { structuredRoadSequence: `${first.structuredRoadSequence} changed` }))).toBeNull();
    expect(ascentPadRoadDisplaysForDirectory([
      ...routes.map((route) => padForRoute(route)),
      padForRoute(first),
    ])).toHaveLength(54);
  });

  it("allows red only with exact no-downstream-pad proof on a non-highway road", () => {
    const expectedPadId = "333598ca-37b3-4b44-9411-a490cc3da672";
    const expectedSavedPin: [number, number] = [-81.01, 40.11];
    const expectedRoadSeam: [number, number] = [-81.0101, 40.1101];
    const geometrySha256 = "7969ce7d19cb558fb2ba92efbc7ab1ee47bf10b404b24ad0bb5e13d2f879261d";
    const candidate = {
      type: "LineString",
      colorRole: "red",
      approvedRoad: false,
      visibility: "main-map-all-and-ascent",
      label: "Last pad to OH-149",
      roadClass: "county",
      exactRoadIdentity: "CR-10",
      geometrySha256,
      coordinates: [expectedRoadSeam, [-81.02, 40.12]],
      noDownstreamPadsProof: {
        directorySnapshotId: "098667bf-a39f-4e7b-86e1-0706c882943c",
        sourceRevision: "6",
        lastPadId: expectedPadId,
        lastPadSavedGps: expectedSavedPin,
        exactRoadIdentity: "CR-10",
        redGeometrySha256: geometrySha256,
      },
      nextHighway: { roadClass: "state", designation: "OH-149", junction: [-81.02, 40.12] },
    };
    expect(ascentRedContinuationIsEligible(candidate, expectedPadId, expectedRoadSeam, expectedSavedPin)).toBe(true);
    expect(ascentRedContinuationIsEligible({ ...candidate, roadClass: "state" }, expectedPadId, expectedRoadSeam, expectedSavedPin)).toBe(false);
    expect(ascentRedContinuationIsEligible({ ...candidate, noDownstreamPadsProof: null }, expectedPadId, expectedRoadSeam, expectedSavedPin)).toBe(false);
    expect(ascentRedContinuationIsEligible(candidate, "wrong-pad", expectedRoadSeam, expectedSavedPin)).toBe(false);
  });
});
