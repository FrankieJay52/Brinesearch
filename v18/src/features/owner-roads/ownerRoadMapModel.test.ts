import { describe, expect, it } from "vitest";
import type { OwnerPadOption, OwnerRoadFeature, OwnerRoadViewportRequest } from "@/data/ownerRoads";
import type { DriverPadStatus, PadSummary } from "@/data/types";
import {
  filterOwnerPadOverlayMarkers,
  ownerBoundsUnion,
  ownerPadOverlayBounds,
  ownerPadOverlayCollection,
  ownerPadOverlayBlockReason,
  ownerPadOverlayMarker,
  ownerPadOverlayStatus,
  ownerRoadCollection,
  ownerRoadCompanyOptions,
  ownerRoadCoverage,
  ownerRoadFeatureBounds,
  ownerRoadFeaturesBounds,
  ownerRoadFeatureLimit,
  ownerRoadJurisdiction,
  ownerRoadPadOptions,
  ownerRoadPadSearchResults,
  ownerRoadSelection,
  ownerRoadStateCode,
  ownerRoadViewportRequestKey,
} from "./ownerRoadMapModel";

const feature: OwnerRoadFeature = {
  type: "Feature",
  geometry: { type: "MultiLineString", coordinates: [[[-81.2, 39.8], [-81.1, 39.9]], [[-81.3, 39.7], [-81.05, 40]]] },
  properties: {
    identityId: "11111111-1111-4111-8111-111111111111",
    canonicalRoadId: null,
    displayName: "Example Road",
    canonicalName: null,
    routeSystem: null,
    routeNumber: null,
    routeDesignation: null,
    roadClass: "local",
    stateCode: "OH",
    countyCode: "MON",
    countyName: "Monroe",
    township: null,
    municipality: null,
    approvalStatus: "candidate",
    sourceCurrent: true,
    mappingConflict: false,
    occurrenceCount: 1,
    padCount: 1,
    sourceIdentityKey: "OH:TEST:1",
    sourceAgency: "Test",
    sourceDataset: "Test roads",
    sourceVersion: "1",
    displayBoundary: "identity_viewport",
    endpointOffsetMeters: null,
    routeFocus: false,
    terminatesAtPad: false,
  },
};

describe("owner road map model", () => {
  it("keeps phone viewport payloads bounded while retaining a useful exact-road layer", () => {
    expect(ownerRoadFeatureLimit(390)).toBe(160);
    expect(ownerRoadFeatureLimit(820)).toBe(440);
    expect(ownerRoadFeatureLimit(1_280)).toBe(700);
  });

  it("deduplicates semantically identical viewport requests", () => {
    const request: OwnerRoadViewportRequest = {
      west: -80.9800002,
      south: 39.8000002,
      east: -80.4599998,
      north: 40.2999998,
      zoom: 10,
      state: null,
      county: null,
      roadClasses: ["county", "interstate"],
      routeSystems: null,
      statuses: ["held", "approved_by_policy"],
      search: null,
      padId: null,
      limit: 160,
    };
    expect(ownerRoadViewportRequestKey(request)).toBe(ownerRoadViewportRequestKey({
      ...request,
      west: -80.9800001,
      roadClasses: ["interstate", "county"],
      statuses: ["approved_by_policy", "held"],
    }));
    expect(ownerRoadViewportRequestKey(request)).not.toBe(ownerRoadViewportRequestKey({ ...request, state: "OH" }));
  });

  it("keeps exact identity and status on the selectable map feature", () => {
    expect(ownerRoadCollection([feature], { mode: "all_roads", padId: null }, null).features[0].properties).toEqual({
      identityId: feature.properties.identityId,
      displayName: "Example Road",
      approvalStatus: "candidate",
      padFocused: false,
    });
    const exact = { ...feature, properties: { ...feature.properties, routeFocus: true, displayBoundary: "exact_route_occurrence" as const } };
    expect(ownerRoadCollection([exact], { mode: "exact_route_ready", padId: "pad-a" }, "pad-a").features[0].properties.padFocused).toBe(true);
    expect(ownerRoadCollection([exact], { mode: "held", padId: "pad-a" }, "pad-a").features[0].properties.padFocused).toBe(false);
    expect(ownerRoadCollection([exact], { mode: "exact_route_ready", padId: "pad-b" }, "pad-a").features[0].properties.padFocused).toBe(false);
  });

  it("reuses a proven trunk while keeping each pad-specific last mile separate", () => {
    const exactPart = (identityId: string, coordinates: [number, number][], terminatesAtPad: boolean): OwnerRoadFeature => ({
      ...feature,
      geometry: { type: "LineString", coordinates },
      properties: {
        ...feature.properties,
        identityId,
        displayBoundary: "exact_route_occurrence",
        endpointOffsetMeters: terminatesAtPad ? 0 : null,
        routeFocus: true,
        terminatesAtPad,
      },
    });
    const sharedTrunk = [[-80.95, 40.15], [-80.93, 40.16]] as [number, number][];
    const earlierPadResponse = [
      exactPart("11111111-1111-4111-8111-111111111111", sharedTrunk, false),
      exactPart("22222222-2222-4222-8222-222222222222", [[-80.93, 40.16], [-80.903485, 40.165091]], true),
    ];
    const fartherPadResponse = [
      exactPart("11111111-1111-4111-8111-111111111111", sharedTrunk, false),
      exactPart("33333333-3333-4333-8333-333333333333", [[-80.93, 40.16], [-80.931288, 40.168593]], true),
    ];
    expect(earlierPadResponse[0].geometry).toEqual(fartherPadResponse[0].geometry);
    expect(earlierPadResponse[1].geometry).not.toEqual(fartherPadResponse[1].geometry);
    expect(ownerRoadCollection(earlierPadResponse, { mode: "exact_route_ready", padId: "pad-a" }, "pad-a").features.every((item) => item.properties.padFocused)).toBe(true);
    expect(ownerRoadCollection(fartherPadResponse, { mode: "exact_route_ready", padId: "pad-b" }, "pad-b").features.every((item) => item.properties.padFocused)).toBe(true);
    expect(ownerRoadCollection(earlierPadResponse, { mode: "held", padId: "scout" }, "scout").features.every((item) => !item.properties.padFocused)).toBe(true);
    expect(ownerRoadCollection(fartherPadResponse, { mode: "held", padId: "cravat" }, "cravat").features.every((item) => !item.properties.padFocused)).toBe(true);
  });

  it("summarizes only returned exact evidence without inventing route coverage", () => {
    const endpoint: OwnerRoadFeature = {
      ...feature,
      properties: {
        ...feature.properties,
        identityId: "22222222-2222-4222-8222-222222222222",
        approvalStatus: "held",
        occurrenceCount: 2,
        displayBoundary: "pad_endpoint_projection",
        endpointOffsetMeters: 3.2,
        routeFocus: false,
        terminatesAtPad: true,
      },
    };
    expect(ownerRoadCoverage([feature, endpoint])).toEqual({
      identityCount: 2,
      occurrenceCount: 3,
      endpointCount: 1,
      routeFocusCount: 0,
      terminalCount: 1,
      statusCounts: {
        approved_by_policy: 0,
        explicitly_approved: 0,
        candidate: 1,
        held: 1,
        restricted: 0,
        reference_only: 0,
      },
    });
    expect(ownerRoadCoverage([]).occurrenceCount).toBe(0);
  });

  it("focuses the complete returned exact geometry", () => {
    expect(ownerRoadFeatureBounds(feature)).toEqual({ west: -81.3, south: 39.7, east: -81.05, north: 40 });
    expect(ownerRoadFeaturesBounds([feature, {
      ...feature,
      geometry: { type: "LineString", coordinates: [[-80.9, 40.1], [-80.8, 40.2]] },
    }])).toEqual({ west: -81.3, south: 39.7, east: -80.8, north: 40.2 });
    expect(ownerRoadFeaturesBounds([])).toBeNull();
  });

  it("keeps jurisdiction in selected-road labels", () => {
    expect(ownerRoadJurisdiction(feature.properties)).toBe("OH · Monroe");
  });

  it("loads expensive release-current detail only after an explicit road selection", () => {
    expect(ownerRoadSelection([feature], null)).toBeNull();
    expect(ownerRoadSelection([feature], feature.properties.identityId)).toBe(feature.properties.identityId);
    expect(ownerRoadSelection([], feature.properties.identityId)).toBeNull();
  });

  it("merges every live directory location into the protected route selector", () => {
    const row = (id: string, padName: string, state: string, coordinate: PadSummary["coordinate"], legacyId: string | null = null): PadSummary => ({
      padId: id, canonicalId: id, legacyId, aliases: [], recordNumber: null, recordRevision: "1", recordType: "pad",
      company: "Ascent", padName, state, county: "Belmont", township: "", address: "", coordinate,
      wellNames: [], apiNumbers: [], propertyNumbers: [], safeRoadTerms: [], structuredRoadSequence: "", writtenDirections: "",
      verificationStatus: "", operatingStatus: "", updatedAt: null,
    });
    const protectedOptions: OwnerPadOption[] = [{
      padId: "11111111-1111-4111-8111-111111111111", padName: "Old name", company: "Ascent", state: "OH",
      latitude: 40.2, longitude: -81.3,
    }];
    const merged = ownerRoadPadOptions([
      row("11111111-1111-4111-8111-111111111111", "Bannock", "Ohio", null),
      row("22222222-2222-4222-8222-222222222222", "Directions only", "West Virginia", { latitude: 39.7, longitude: -80.5, role: "driver_entrance" }),
      row("6ef0746f-341a-4d29-9399-a81cfbec11e8", "SCOUT", "Ohio", null, "ascent--scout"),
    ], protectedOptions);
    expect(merged).toHaveLength(3);
    expect(merged.find((pad) => pad.padName === "Bannock")).toMatchObject({ state: "OH", latitude: 40.2, longitude: -81.3 });
    expect(merged.find((pad) => pad.padName === "Directions only")).toMatchObject({ state: "WV", latitude: 39.7, longitude: -80.5 });
    expect(merged.find((pad) => pad.padName === "SCOUT")).toMatchObject({ state: "OH", latitude: 40.165091, longitude: -80.903485 });
    expect(ownerRoadStateCode("Pennsylvania")).toBe("PA");
  });

  it("separates the bounded pad picker by exact company and pad-name text", () => {
    const pads: OwnerPadOption[] = [
      { padId: "11111111-1111-4111-8111-111111111111", padName: "Bannock", company: "Ascent", state: "OH", latitude: 40, longitude: -81 },
      { padId: "22222222-2222-4222-8222-222222222222", padName: "Banjo", company: "Ascent", state: "OH", latitude: 40, longitude: -81 },
      { padId: "33333333-3333-4333-8333-333333333333", padName: "Bannock South", company: "EQT", state: "OH", latitude: 40, longitude: -81 },
      { padId: "44444444-4444-4444-8444-444444444444", padName: "Cabin", company: "", state: "WV", latitude: 40, longitude: -81 },
    ];
    expect(ownerRoadCompanyOptions(pads)).toEqual(["Ascent", "EQT"]);
    expect(ownerRoadPadSearchResults(pads, "Ascent", "bann").map((pad) => pad.padName)).toEqual(["Bannock"]);
    expect(ownerRoadPadSearchResults(pads, "", "nno").map((pad) => pad.padName)).toEqual(["Bannock", "Bannock South"]);
    expect(ownerRoadPadSearchResults(pads, "EQT", "banjo")).toEqual([]);
  });

  it("never renders the entire pad directory as search choices", () => {
    const pads: OwnerPadOption[] = Array.from({ length: 80 }, (_, index) => ({
      padId: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
      padName: `Pad ${String(index).padStart(2, "0")}`,
      company: "Ascent",
      state: "OH",
      latitude: 40,
      longitude: -81,
    }));
    expect(ownerRoadPadSearchResults(pads, "Ascent", "", 12)).toHaveLength(12);
    expect(ownerRoadPadSearchResults(pads, "Ascent", "", 500)).toHaveLength(50);
  });

  it("keeps Cologie ready while Lasso remains visible and held without inventing a route", () => {
    const directoryPad = (padId: string, padName: string): PadSummary => ({
      padId, canonicalId: padId, legacyId: `ascent--${padName.toLowerCase()}`, aliases: [], recordNumber: null,
      recordRevision: "1", recordType: "pad", company: "Ascent", padName, state: "Ohio", county: "Harrison",
      township: "", address: "", coordinate: null, mapReference: null, wellNames: [], apiNumbers: [], propertyNumbers: [],
      safeRoadTerms: [], structuredRoadSequence: "", writtenDirections: "", verificationStatus: "", operatingStatus: "", updatedAt: null,
    });
    const status = (state: DriverPadStatus["route"]["state"], source: DriverPadStatus["route"]["source"], graph: DriverPadStatus["graph"]["state"], safeReason: string | null = null): DriverPadStatus => ({
      padId: "11111111-1111-4111-8111-111111111111", recordRevision: "1", dataState: "live",
      route: { state, source, geometry: null, safeReason, lastVerifiedAt: null, writtenDirections: null },
      graph: { state: graph, county: "Harrison", publicSource: null, lastVerifiedAt: null },
      google: { publicState: "not_published", routeUrl: null, safeReason: "exact_route_not_ready" },
      destination: { available: false, latitude: null, longitude: null }, routeSteps: [],
    });
    const cologie = ownerPadOverlayMarker(
      { padId: "11111111-1111-4111-8111-111111111111", padName: "COLOGIE", company: "Ascent", state: "OH", latitude: 40.25403, longitude: -80.913577 },
      directoryPad("11111111-1111-4111-8111-111111111111", "COLOGIE"),
      status("ready", "exact_graph", "active_current"),
      true,
    );
    const lasso = ownerPadOverlayMarker(
      { padId: "22222222-2222-4222-8222-222222222222", padName: "LASSO", company: "Ascent", state: "OH", latitude: 40.240883, longitude: -80.913963 },
      directoryPad("22222222-2222-4222-8222-222222222222", "LASSO"),
      null,
      false,
    );
    expect(cologie).toMatchObject({ status: "ready", blockReason: "Approved route ready", statusChecked: true });
    expect(lasso).toMatchObject({ status: "held", blockReason: "No exact route match", statusChecked: true });
    const markers = filterOwnerPadOverlayMarkers([cologie!, lasso!], {
      state: "OH", county: "Harrison", selectedCompany: "Ascent", companyScope: "selected", includeHeld: true,
    });
    expect(markers.map((marker) => marker.padName)).toEqual(["COLOGIE", "LASSO"]);
    expect(filterOwnerPadOverlayMarkers(markers, {
      state: "OH", county: "Harrison", selectedCompany: "Ascent", companyScope: "selected", includeHeld: false,
    }).map((marker) => marker.padName)).toEqual(["COLOGIE"]);
    expect(ownerPadOverlayCollection(markers, cologie!.padId, lasso!.padId).features.map((item) => item.properties)).toEqual([
      expect.objectContaining({ padName: "COLOGIE", overlayStatus: "ready", selected: true, inspected: false }),
      expect.objectContaining({ padName: "LASSO", overlayStatus: "held", selected: false, inspected: true }),
    ]);
  });

  it("uses only safe status fields for candidate, restricted, and fit bounds", () => {
    const base = {
      padId: "11111111-1111-4111-8111-111111111111", recordRevision: "1", dataState: "live" as const,
      route: { state: "written_only" as const, source: "legacy_written" as const, geometry: null, safeReason: null, lastVerifiedAt: null, writtenDirections: "Reviewed" },
      graph: { state: "held" as const, county: "Harrison", publicSource: null, lastVerifiedAt: null },
      google: { publicState: "held" as const, routeUrl: null, safeReason: "exact_route_not_ready" },
      destination: { available: false, latitude: null, longitude: null }, routeSteps: [],
    } satisfies DriverPadStatus;
    expect(ownerPadOverlayStatus(base)).toBe("candidate");
    expect(ownerPadOverlayStatus({ ...base, route: { ...base.route, state: "held", safeReason: "road_restricted" } })).toBe("restricted");
    expect(ownerPadOverlayBlockReason({
      ...base,
      route: { ...base.route, state: "held", safeReason: null },
      google: { ...base.google, safeReason: "public_route_or_graph_authority_held" },
    }, true)).toBe("Route not reconciled");
    const padBounds = ownerPadOverlayBounds([
      { padId: "1", padName: "A", company: "Ascent", state: "OH", county: "Harrison", latitude: 40.1, longitude: -81, status: "held", blockReason: "Route held", statusChecked: true },
      { padId: "2", padName: "B", company: "Ascent", state: "OH", county: "Harrison", latitude: 40.3, longitude: -80.8, status: "ready", blockReason: "Approved route ready", statusChecked: true },
    ]);
    expect(padBounds).toEqual({ west: -81, south: 40.1, east: -80.8, north: 40.3 });
    expect(ownerBoundsUnion(padBounds, { west: -81.2, south: 40, east: -80.9, north: 40.2 })).toEqual({ west: -81.2, south: 40, east: -80.8, north: 40.3 });
  });
});
