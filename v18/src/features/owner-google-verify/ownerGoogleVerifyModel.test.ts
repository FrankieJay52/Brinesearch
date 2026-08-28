import { describe, expect, it } from "vitest";
import type {
  OwnerGoogleVerifyPoint,
  OwnerGoogleVerifySectionMark,
  OwnerGoogleVerifySectionState,
} from "@/data/ownerGoogleVerifyDrafts";
import type { DriverPadStatus, DriverRouteGeometry, PadSummary } from "@/data/types";
import {
  addOwnerGoogleVerifyPoint,
  buildOwnerGoogleVerifySections,
  maximumOwnerGoogleVerifyTurnPins,
  ownerGoogleVerifyApprovedStepRoutes,
  ownerGoogleVerifyDestination,
  ownerGoogleVerifyOutcome,
  ownerGoogleVerifySectionId,
  type OwnerGoogleVerifyPreviewSection,
} from "./ownerGoogleVerifyModel";

const exactStepGeometry: DriverRouteGeometry = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { stepOrder: 1 },
    geometry: { type: "LineString", coordinates: [[-80.96, 40.18], [-80.95, 40.19]] },
  }],
};

function status(overrides: Partial<DriverPadStatus> = {}): DriverPadStatus {
  return {
    padId: "pad-1",
    recordRevision: "revision-1",
    dataState: "live",
    route: { state: "ready", source: "exact_graph", geometry: exactStepGeometry, safeReason: null, lastVerifiedAt: "2026-08-28T00:00:00.000Z", writtenDirections: null },
    graph: { state: "active_current", county: "Harrison", publicSource: "authoritative", lastVerifiedAt: "2026-08-28T00:00:00.000Z" },
    google: { publicState: "held", routeUrl: null, safeReason: "Public Google 0" },
    destination: { available: true, role: "saved_pad_destination", latitude: 40.19, longitude: -80.95 },
    routeSteps: [{ order: 1, kind: "continue", displayName: "OH-519", verifiedDesignations: ["State Route 519"], instruction: "Continue on OH-519", distanceMiles: 1.2 }],
    ...overrides,
  };
}

const point = (offset: number): OwnerGoogleVerifyPoint => ({
  latitude: 40.1 + offset / 1_000,
  longitude: -80.9 - offset / 1_000,
});

function pad(overrides: Partial<PadSummary> = {}): PadSummary {
  return {
    padId: "pad-1",
    canonicalId: "pad-1",
    legacyId: null,
    aliases: [],
    recordNumber: 1,
    recordRevision: "revision-1",
    recordType: "pad",
    company: "Example Energy",
    padName: "Example Pad",
    state: "Ohio",
    county: "Harrison",
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
    verificationStatus: "verified",
    operatingStatus: "active",
    updatedAt: null,
    ...overrides,
  };
}

function section(
  ordinal: number,
  state: OwnerGoogleVerifySectionState | null,
  roadName: string | null = state === "approved_named_road" ? `Road ${ordinal}` : null,
): OwnerGoogleVerifyPreviewSection {
  const start = point(ordinal - 1);
  const end = point(ordinal);
  const mark: OwnerGoogleVerifySectionMark | null = state === null ? null : {
    sectionId: `section-${ordinal}`,
    ordinal,
    state,
    roadName,
    start,
    end,
  };
  return { sectionId: `section-${ordinal}`, ordinal, start, end, mark };
}

describe("owner Google verify point limit", () => {
  it("sets one anchor, accepts five turn pins, and rejects the sixth without mutating prior points", () => {
    expect(maximumOwnerGoogleVerifyTurnPins).toBe(5);

    const initialPins: OwnerGoogleVerifyPoint[] = [];
    const anchored = addOwnerGoogleVerifyPoint(null, initialPins, point(0));
    expect(anchored).toEqual({
      anchor: point(0),
      turnPins: [],
      notice: "Anchor set. Tap each required turn in order.",
    });
    expect(initialPins).toEqual([]);

    let turnPins: OwnerGoogleVerifyPoint[] = [];
    for (let index = 1; index <= maximumOwnerGoogleVerifyTurnPins; index += 1) {
      const added = addOwnerGoogleVerifyPoint(anchored.anchor, turnPins, point(index));
      turnPins = added.turnPins;
      expect(added.notice).toBe(`Turn pin ${index} added.`);
      expect(turnPins).toHaveLength(index);
    }

    const accepted = turnPins;
    const rejected = addOwnerGoogleVerifyPoint(anchored.anchor, accepted, point(6));
    expect(rejected.anchor).toEqual(anchored.anchor);
    expect(rejected.turnPins).toEqual(accepted);
    expect(rejected.turnPins).not.toBe(accepted);
    expect(rejected.turnPins).toHaveLength(5);
    expect(rejected.notice).toBe("Five turn pins is the limit. Use Undo or Clear before adding another.");
    expect(accepted).toEqual([point(1), point(2), point(3), point(4), point(5)]);
  });
});

describe("owner Google verify saved destination", () => {
  it("accepts an explicit saved pad destination, verified driver entrance, or saved pad reference", () => {
    expect(ownerGoogleVerifyDestination(pad({
      coordinate: { latitude: 40.25403, longitude: -80.913577, role: "saved_pad_destination" },
    }))).toEqual({
      latitude: 40.25403,
      longitude: -80.913577,
      source: "saved_pad_gps",
      label: "Saved pad GPS",
    });

    expect(ownerGoogleVerifyDestination(pad({
      coordinate: { latitude: 40.186964, longitude: -80.968365, role: "driver_entrance" },
    }))).toEqual({
      latitude: 40.186964,
      longitude: -80.968365,
      source: "saved_pad_gps",
      label: "Saved pad GPS",
    });

    expect(ownerGoogleVerifyDestination(pad({
      mapReference: { latitude: 40.08863, longitude: -81.304164, role: "reference", kind: "saved_pad_reference" },
    }))).toEqual({
      latitude: 40.08863,
      longitude: -81.304164,
      source: "saved_pad_gps",
      label: "Saved pad GPS",
    });
  });

  it("rejects official references, legacy saved points, zero sentinels, and missing GPS", () => {
    expect(ownerGoogleVerifyDestination(pad({
      coordinate: { latitude: 40.25403, longitude: -80.913577, role: "legacy_saved" },
    }))).toBeNull();
    for (const kind of ["official_pad_reference", "official_wellhead_reference"] as const) {
      expect(ownerGoogleVerifyDestination(pad({
        mapReference: { latitude: 40.08863, longitude: -81.304164, role: "reference", kind },
      }))).toBeNull();
    }
    expect(ownerGoogleVerifyDestination(pad({
      coordinate: { latitude: 0, longitude: 0, role: "saved_pad_destination" },
    }))).toBeNull();
    expect(ownerGoogleVerifyDestination(pad({
      mapReference: { latitude: 0, longitude: 0, role: "reference", kind: "saved_pad_reference" },
    }))).toBeNull();
    expect(ownerGoogleVerifyDestination(pad())).toBeNull();
  });
});

describe("owner Google verify approved step overlays", () => {
  it("keeps every current exact approved route step eligible regardless of road class", () => {
    expect(ownerGoogleVerifyApprovedStepRoutes(status())).toEqual([{
      geometry: exactStepGeometry,
      stepCount: 1,
    }]);
  });

  it("fails closed for stale, written-only, or unsupported graph authority", () => {
    expect(ownerGoogleVerifyApprovedStepRoutes(status({ dataState: "stale" }))).toEqual([]);
    expect(ownerGoogleVerifyApprovedStepRoutes(status({
      route: { ...status().route, state: "written_only", geometry: null },
    }))).toEqual([]);
    expect(ownerGoogleVerifyApprovedStepRoutes(status({
      graph: { ...status().graph, state: "held" },
    }))).toEqual([]);
  });
});

describe("owner Google verify section boundaries", () => {
  it("builds ordered anchor-to-pin-to-destination sections and binds marks by exact boundary ID", () => {
    const anchor = point(0);
    const firstTurn = point(1);
    const secondTurn = point(2);
    const destination = point(3);
    const markedSectionId = ownerGoogleVerifySectionId(2, firstTurn, secondTurn);
    const mark: OwnerGoogleVerifySectionMark = {
      sectionId: markedSectionId,
      ordinal: 2,
      state: "approved_named_road",
      roadName: "County Road 10",
      start: firstTurn,
      end: secondTurn,
    };
    const staleMark: OwnerGoogleVerifySectionMark = {
      ...mark,
      sectionId: "stale-boundary-id",
      ordinal: 1,
    };

    expect(buildOwnerGoogleVerifySections(anchor, [firstTurn, secondTurn], destination, [staleMark, mark])).toEqual([
      {
        sectionId: ownerGoogleVerifySectionId(1, anchor, firstTurn),
        ordinal: 1,
        start: anchor,
        end: firstTurn,
        mark: null,
      },
      {
        sectionId: markedSectionId,
        ordinal: 2,
        start: firstTurn,
        end: secondTurn,
        mark,
      },
      {
        sectionId: ownerGoogleVerifySectionId(3, secondTurn, destination),
        ordinal: 3,
        start: secondTurn,
        end: destination,
        mark: null,
      },
    ]);
  });
});

describe("owner Google verify outcome", () => {
  it("stays in review until every post-anchor section has a mark", () => {
    expect(ownerGoogleVerifyOutcome([])).toMatchObject({ state: "review", label: "Review route sections" });
    expect(ownerGoogleVerifyOutcome([
      section(1, "approved_named_road"),
      section(2, null),
    ])).toMatchObject({ state: "review", label: "Review route sections" });
  });

  it("immediately reports off approved road when an explicit negative mark precedes an unreviewed section", () => {
    expect(ownerGoogleVerifyOutcome([
      section(1, "not_approved"),
      section(2, null),
    ])).toMatchObject({ state: "off_approved_road", label: "Off approved road" });
  });

  it("succeeds when every section remains on a named approved road", () => {
    expect(ownerGoogleVerifyOutcome([
      section(1, "approved_named_road", "County Road 10"),
      section(2, "approved_named_road", "State Route 519"),
    ])).toEqual({
      state: "success",
      label: "On approved named roads",
      detail: "Every post-anchor section is marked as an approved named road.",
    });
  });

  it("allows only a trailing unnamed or lease movement after contiguous approved named roads", () => {
    expect(ownerGoogleVerifyOutcome([
      section(1, "approved_named_road", "County Road 10"),
      section(2, "approved_named_road", "State Route 519"),
      section(3, "lease_or_unnamed"),
      section(4, "lease_or_unnamed"),
    ])).toEqual({
      state: "success",
      label: "Named roads then saved pin",
      detail: "Approved named roads stay contiguous, followed only by a trailing unnamed or lease movement to the saved pad GPS.",
    });
  });

  it("reports off approved road for an explicit negative mark", () => {
    expect(ownerGoogleVerifyOutcome([
      section(1, "approved_named_road", "County Road 10"),
      section(2, "not_approved"),
    ])).toMatchObject({ state: "off_approved_road", label: "Off approved road" });
  });

  it("reports off approved road when a named road resumes after lease movement", () => {
    expect(ownerGoogleVerifyOutcome([
      section(1, "approved_named_road", "County Road 10"),
      section(2, "lease_or_unnamed"),
      section(3, "approved_named_road", "County Road 12"),
    ])).toEqual({
      state: "off_approved_road",
      label: "Off approved road",
      detail: "The preview returns to a named road after an unnamed or lease section, or an approved section has no owner-entered road name.",
    });
  });

  it("reports off approved road when no named approved section exists or its name is blank", () => {
    expect(ownerGoogleVerifyOutcome([
      section(1, "lease_or_unnamed"),
      section(2, "lease_or_unnamed"),
    ])).toMatchObject({
      state: "off_approved_road",
      detail: "No approved named-road section was recorded after the anchor.",
    });
    expect(ownerGoogleVerifyOutcome([
      section(1, "approved_named_road", "   "),
    ])).toMatchObject({
      state: "off_approved_road",
      detail: expect.stringContaining("no owner-entered road name"),
    });
  });
});
