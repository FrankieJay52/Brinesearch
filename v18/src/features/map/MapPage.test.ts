import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { PadSummary } from "@/data/types";
import {
  coincidentLocationsNeedChooser,
  emptyMapCoordinateNotice,
  filterMapRows,
  mapGoogleHandoffState,
  mapMarkerVisualStyle,
  mapOverlayMarkerState,
  mapPadSearchResults,
  mapRowsCoordinateExtent,
  selectedMapRouteIsPrimary,
  mapViewerModeFromParam,
} from "./mapModel";

function pad(padId: string, latitude: number, longitude: number): PadSummary {
  return {
    padId,
    canonicalId: padId,
    legacyId: null,
    aliases: [],
    recordNumber: null,
    recordRevision: "1",
    recordType: "pad",
    company: "Acme",
    padName: padId,
    state: "Ohio",
    county: "Monroe",
    township: "",
    address: "",
    coordinate: { latitude, longitude, role: "driver_entrance" },
    wellNames: [],
    apiNumbers: [],
    propertyNumbers: [],
    safeRoadTerms: [],
    structuredRoadSequence: "",
    writtenDirections: "",
    verificationStatus: "verified",
    operatingStatus: "active",
    updatedAt: null,
  };
}

describe("coincidentLocationsNeedChooser", () => {
  it("opens the chooser for exact-coordinate locations", () => {
    expect(coincidentLocationsNeedChooser([
      pad("alpha", 39.8, -81.2),
      pad("beta", 39.8, -81.2),
    ])).toBe(true);
  });

  it("never combines distinct nearby locations into a moving cluster", () => {
    const rows = [
      pad("alpha", 39.8, -81.2),
      pad("beta", 39.8001, -81.2001),
    ];

    expect(coincidentLocationsNeedChooser(rows)).toBe(false);
  });

  it("does not open a chooser for a single location", () => {
    expect(coincidentLocationsNeedChooser([pad("alpha", 39.8, -81.2)])).toBe(false);
  });
});

describe("selectedMapRouteIsPrimary", () => {
  it("keeps named and ordinary alternate selections out of primary-only fallbacks", () => {
    expect(selectedMapRouteIsPrimary("primary", null)).toBe(true);
    expect(selectedMapRouteIsPrimary("alternate", null)).toBe(false);
    expect(selectedMapRouteIsPrimary(null, "alternate")).toBe(false);
    expect(selectedMapRouteIsPrimary(null, null)).toBe(true);
  });
});

describe("filterMapRows", () => {
  const acmePad = pad("acme-pad", 39.8, -81.2);
  const betaPad = { ...pad("beta-pad", 39.9, -81.3), company: "Beta" };
  const acmeDisposal = { ...pad("acme-disposal", 39.7, -81.1), recordType: "disposal" as const };

  it("shows only the selected company's locations behind its approved roads", () => {
    expect(filterMapRows([acmePad, betaPad, acmeDisposal], "all", "Acme").map((row) => row.padId)).toEqual(["acme-pad", "acme-disposal"]);
  });

  it("combines company and location-type filters without changing All behavior", () => {
    expect(filterMapRows([acmePad, betaPad, acmeDisposal], "disposal", "Acme")).toEqual([acmeDisposal]);
    expect(filterMapRows([acmePad, betaPad, acmeDisposal], "all", null)).toHaveLength(3);
  });
});

describe("emptyMapCoordinateNotice", () => {
  it("treats an unmapped directory filter as a data state instead of a renderer failure", () => {
    expect(emptyMapCoordinateNotice(45)).toBe("45 directory locations do not have a verified map coordinate yet. Use Search to open the directory record.");
    expect(emptyMapCoordinateNotice(0)).toBe("No locations match this map filter.");
  });
});

describe("filtered company viewport", () => {
  it("treats valid filtered pads outside the camera as offscreen, not a renderer failure", () => {
    expect(mapOverlayMarkerState(54, 0)).toBe("offscreen");
    expect(mapOverlayMarkerState(54, 12)).toBe("visible");
    expect(mapOverlayMarkerState(0, 0)).toBe("empty");
  });

  it("builds an exact fit extent from the selected company's safe display coordinates", () => {
    const northEast = pad("north-east", 40.4, -80.1);
    const southWest = pad("south-west", 39.2, -81.6);
    const unmapped = { ...pad("unmapped", 39.8, -80.8), coordinate: null };

    expect(mapRowsCoordinateExtent([northEast, southWest, unmapped])).toEqual({
      coordinateCount: 2,
      northEast: [-80.1, 40.4],
      southWest: [-81.6, 39.2],
    });
    expect(mapRowsCoordinateExtent([unmapped])).toBeNull();
  });
});

describe("map viewer controls", () => {
  it("opens only the two explicit full-screen viewer modes from the URL", () => {
    expect(mapViewerModeFromParam("map")).toBe("fullscreen");
    expect(mapViewerModeFromParam("roads")).toBe("roads");
    expect(mapViewerModeFromParam("owner")).toBe("standard");
    expect(mapViewerModeFromParam(null)).toBe("standard");
  });

  it("searches mapped pads without returning disposals or unmapped records", () => {
    const bannock = { ...pad("bannock", 40.1, -80.9), padName: "BANNOCK", company: "Ascent" };
    const disposal = { ...pad("bannock-disposal", 40.2, -80.8), padName: "BANNOCK Disposal", recordType: "disposal" as const };
    const unmapped = { ...pad("bannock-unmapped", 40.3, -80.7), padName: "BANNOCK North", coordinate: null };

    expect(mapPadSearchResults([disposal, unmapped, bannock], "Bannock").map((row) => row.padId)).toEqual(["bannock"]);
    expect(mapPadSearchResults([bannock], " ")).toEqual([]);
  });

  it("searches an exact-identity saved GPS as a field-check point", () => {
    const scout = { ...pad("scout", 40.1, -80.9), legacyId: "ascent--scout", padName: "SCOUT", coordinate: null };
    expect(mapPadSearchResults([scout], "Scout")).toEqual([scout]);
  });
});

describe("map viewer authority boundary", () => {
  const pageSource = readFileSync(new URL("./MapPage.tsx", import.meta.url), "utf8");
  const appCss = readFileSync(new URL("../../styles/app.css", import.meta.url), "utf8");

  it("keeps the published approved-road overlay teal and separable in every map mode", () => {
    expect(pageSource).toContain("companyRoads.selectRoads(requestedRoadSelection)");
    expect(pageSource).toContain('companyRoads.availability.state === "ready"');
    expect(pageSource).toContain("companyRoads.overlay?.selection === requestedRoadSelection");
    expect(pageSource).toContain('"line-color": "#14b8a6"');
    expect(pageSource).toContain('map.setPaintProperty(companyRoadLineLayerId, "line-color", "#14b8a6")');
    expect(pageSource).toContain("function drawApprovedRoadNetwork(");
    expect(pageSource).toContain("fallbackApplied ? companyRoadRowsRef.current : []");
    expect(pageSource).toContain("const mapLibreRoadRows = fallbackApplied ? [] : companyRoadRowsRef.current");
    expect(pageSource).toContain("This is a renderer fallback, not a geometry");
    expect(pageSource).toContain('aria-label="Filter pads and approved roads by company"');
    expect(pageSource).toContain('<option value="all">All pads + all approved roads</option>');
    expect(pageSource).toContain("Only ${selectedCompany} pads and released approved roads are shown.");
    expect(pageSource).toContain("Held, candidate, stale, guessed, and unpublished routes stay hidden.");
    expect(pageSource).not.toContain('option value="">Roads off');
    expect(pageSource).not.toContain('"rgba(240, 180, 93, .9)"');
    expect(pageSource).not.toContain("isolateSelectedRoute");
    expect(pageSource).not.toContain("loadOwnerRoadViewport");
  });

  it("adds only the Liberty structured highway reference beneath exact approved roads", () => {
    expect(pageSource).toContain("function syncHighwayReferenceLayers(map: MapLibreMap)");
    expect(pageSource).toContain("libertyHighwayReferenceSource(map.getStyle())");
    expect(pageSource).toContain("const [casing, line] = highwayReferenceLayerSpecifications(source)");
    expect(pageSource).toContain("const highwayReady = fallbackApplied ? false : syncHighwayReferenceLayers(map)");
    expect(pageSource.indexOf("syncHighwayReferenceLayers(map)")).toBeLessThan(
      pageSource.indexOf("syncCompanyRoadLayers(map, mapLibreRoadRows)"),
    );
    expect(pageSource).toContain("Pad-county Interstate / U.S. / state reference · thin teal");
    expect(pageSource).toContain("Exact approved route road · stronger teal");
    expect(pageSource).toContain("Selected pad route · bright teal");
    expect(pageSource).toContain("no approved-route geometry is being claimed");
    expect(pageSource).toContain("if (basemapReady || styleReady || fallbackApplied) return");
    expect(pageSource).toContain("slow road tiles have not completed");
    expect(appCss).toContain(".legend-line.highway");
  });

  it("draws a pad-specific bright route only from the selected pad's reviewed geometry", () => {
    expect(pageSource).toContain("selectedRouteRef.current = selectedRouteGeometry");
    expect(pageSource).toContain("drawRoute(context, map, selectedId ? geometry : null)");
    expect(pageSource).toContain("Pad-bound route color is selection-only");
    expect(pageSource).toContain("persistent teal road network");
    expect(pageSource).toContain('selectedRouteGeometry && <div className="selected-pad-route-key"');
    expect(pageSource).toContain("Selected pad route · bright teal");
    const unselectedLegend = pageSource.slice(pageSource.indexOf('<aside className="map-legend-card">'));
    expect(unselectedLegend).not.toContain("Selected pad route · bright teal");
    expect(pageSource).toContain('selectedRouteChoice?.routeGroup === "alternate"');
    expect(pageSource).toContain("currentSelectedStatus?.route.geometry || null");
    expect(pageSource).toContain("? selectedNamedApproach.geometry");
    expect(pageSource).toContain("loadDriverRouteChoices(selected)");
    expect(pageSource).toContain("With no reviewed geometry, draw no teal.");
    expect(pageSource).toContain("working static Google handoff never");
    expect(pageSource).not.toContain(": selectedReviewedNavigation ? null");
    expect(pageSource).toContain("No reviewed named-road display geometry · no teal line inferred.");
    expect(pageSource).not.toContain("selectedReviewedNavigation.ownerApproval.geometry");
    expect(pageSource).not.toContain("selectedReviewedNavigation.ownerApproval.routeGeometry");
    expect(pageSource).not.toContain("selectedReviewedNavigationCandidate.geometry");
    expect(pageSource).not.toContain("nearest_road");
    expect(pageSource).not.toContain("fuzzy_name");
  });

  it("draws BANNOCK's selected arrival teal and brighter exit red without changing the pin", () => {
    expect(pageSource).toContain("selectedPadFieldDirectionDisplayForPad(selected)");
    expect(pageSource).toContain("selectedFieldDirectionDisplayRef.current = selectedFieldDirectionDisplay");
    expect(pageSource).toContain("selectedId === fieldDirectionDisplay?.padId ? fieldDirectionDisplay : null");
    expect(pageSource).toContain('drawSelectedPadFieldDirectionLine(context, map, display.inbound, "#52e4bd", 5)');
    expect(pageSource).toContain('drawSelectedPadFieldDirectionLine(context, map, display.outbound, "#ef4444", 5)');
    expect(pageSource).toContain('drawSelectedPadFieldDirectionLine(context, map, display.inbound, "rgba(7, 19, 31, .88)", 9)');
    expect(pageSource).toContain("[selectedFieldDirectionDisplay.inbound.coordinates, selectedFieldDirectionDisplay.outbound.coordinates]");
    expect(pageSource).toContain("Teal arrival");
    expect(pageSource).toContain("OH-331 → Lafferty-Bannock Road / CR-10 → BANNOCK");
    expect(pageSource).toContain("Red exit reference");
    expect(pageSource).toContain("Black Oak Road → OH-149");
    expect(pageSource).toContain("Red is not a restriction or closure.");
    expect(pageSource).toContain("no road-to-pin connector is inferred");
    expect(pageSource).toContain("Google Navigate link and road authority are unchanged");
    expect(pageSource).not.toContain('map.setPaintProperty(companyRoadLineLayerId, "line-color", "#ef4444")');
    expect(appCss).toContain(".legend-line.exit");
  });

  it("keeps the exact BANNOCK arrival teal and exit red on the all-pads and Ascent main map", () => {
    expect(pageSource).toContain("bannockFieldDirectionDisplayForDirectory(snapshot?.rows || [])");
    expect(pageSource).toContain('companyFilter === "all" || companyFilter === bannockFieldDirectionDisplay.company');
    expect(pageSource).toContain('typeFilter !== "disposal"');
    expect(pageSource).toContain("function syncBannockRoadReferenceLayers(");
    expect(pageSource).toContain("map.addSource(bannockRoadReferenceSourceId");
    expect(pageSource).toContain("features: [display.inbound, display.outbound].map");
    expect(pageSource).toContain('role: line.colorRole === "teal" ? "inbound-road-reference" : "outbound-road-reference"');
    expect(pageSource).toContain("colorRole: line.colorRole");
    expect(pageSource).toContain('["match", ["get", "colorRole"], "teal", "#52e4bd", "red", "#ef4444", "#52e4bd"]');
    expect(pageSource).toContain("syncBannockRoadReferenceLayers(map, bannockRoadReferenceRef.current)");
    expect(pageSource).toContain("map.moveLayer(bannockRoadReferenceLineLayerId)");
    expect(pageSource).toContain('map.setPaintProperty(bannockRoadReferenceLineLayerId, "line-color", [');
    expect(pageSource).toContain("OH-331 to BANNOCK · teal");
    expect(pageSource).toContain("BANNOCK via Black Oak Road to OH-149 · red");
    expect(pageSource).toContain("BANNOCK's field reference is teal from OH-331 to the pad and red by Black Oak Road to OH-149.");
    expect(pageSource).toContain("BANNOCK road colors: teal from OH-331 to BANNOCK; red from BANNOCK by Black Oak Road to OH-149.");
    expect(pageSource).toContain("[visibleBannockRoadReference, visibleCompanyRoadOverlay, viewerMode]");
    expect(pageSource).not.toContain('map.setPaintProperty(companyRoadLineLayerId, "line-color", "#ef4444")');
    expect(pageSource).not.toContain('map.setPaintProperty(highwayReferenceLineLayerId, "line-color", "#ef4444")');
  });

  it("removes the two top badges and lets the map controls collapse to the left", () => {
    expect(pageSource).not.toContain('className="map-data-note"');
    expect(pageSource).not.toContain('className="map-bannock-exit-note"');
    expect(pageSource).not.toContain("safe map points");
    expect(pageSource).not.toContain("const visibleMappedCount");
    expect(appCss).not.toMatch(/\.map-data-note\b/);
    expect(appCss).not.toMatch(/\.map-bannock-exit-note\b/);
    expect(pageSource).toContain('className="map-control-toggle"');
    expect(pageSource).toContain('aria-controls="map-primary-controls"');
    expect(pageSource).toContain("aria-expanded={!mapControlsCollapsed}");
    expect(pageSource).toContain('aria-label={mapControlsCollapsed ? "Show map controls" : "Collapse map controls to the left"}');
    expect(pageSource).toContain('id="map-primary-controls" className="map-primary-controls" hidden={mapControlsCollapsed}');
    expect(appCss).toMatch(/\.map-control-toggle\s*\{[^}]*width:\s*44px;[^}]*min-height:\s*44px;/s);
    expect(appCss).toMatch(/\.map-control-stack\.is-collapsed\s*\{[^}]*width:\s*fit-content;/s);
  });

  it("requires a named approach choice and binds its map line and navigation action together", () => {
    expect(pageSource).toContain("const currentNamedApproaches = currentSelectedStatus?.namedApproaches || []");
    expect(pageSource).toContain("currentNamedApproaches.length > 1 && !selectedNamedApproach");
    expect(pageSource).toContain("selectedNamedApproach?.navigationUrl");
    expect(pageSource).toContain("selectedNamedApproach.geometry");
    expect(pageSource).toContain('aria-label="Choose reviewed named approach"');
    expect(pageSource).toContain("setSelectedNamedApproachKey(approach.approachKey)");
    expect(pageSource).toContain("Choose one reviewed named-road approach");
    expect(pageSource).toContain("GPS destination navigation remains available; no teal line is selected.");
    expect(pageSource).toContain("unnamed final movement is not shown as a named road");
    expect(pageSource).toContain("approachLabel={selectedNamedApproach?.approachLabel}");
    expect(pageSource).toContain('`${selectedNamedApproach.approachLabel} core + GPS`');
    expect(pageSource).toContain('`${selectedNamedApproach.approachLabel} ready`');
  });

  it("labels a released core plus GPS handoff as named-road display", () => {
    expect(pageSource).toContain('? "Directed named roads to the handoff, then an unnamed GPS final leg"');
    expect(pageSource).toContain(': "Reviewed named roads to the saved pin"');
    expect(pageSource).toContain('currentSelectedStatus?.route.source === "exact_graph_handoff"');
    expect(pageSource).toContain('"Reviewed named roads highlighted to their handoff · saved pad GPS shown separately."');
  });

  it("provides an explicit full-screen exit and pad-detail connection", () => {
    expect(pageSource).toContain('className="map-view-exit"');
    expect(pageSource).toContain('{!fullscreen && <button type="button" aria-pressed="false"');
    expect(pageSource).not.toContain('{fullscreen ? "Map" : "Full screen"}');
    expect(pageSource).toContain('changeViewerMode("standard")');
    expect(pageSource).toContain("Open pad details");
    expect(pageSource).toContain("focusPad(target.rows[0])");
    expect(pageSource).not.toContain('if (viewerModeRef.current === "roads") {');
    expect(pageSource).not.toContain('navigate(`/pad/${encodeURIComponent(target.rows[0].padId)}`);');
    expect(pageSource).toContain('className="map-cluster-choice" onClick={() => focusPad(row)}');
    expect(pageSource).toContain('onClick={() => navigate(`/pad/${encodeURIComponent(selected.padId)}`)}>Open pad details');
  });

  it("keeps the selected-pad driver card compact without dropping route context", () => {
    const approvedAction = pageSource.indexOf("<MapApprovedRouteLink routeUrl={approvedNavigationUrl}");
    const reviewedAction = pageSource.indexOf("<MapReviewedRouteLink routeUrl={selectedReviewedNavigation.routeUrl}", approvedAction);
    const pinAction = pageSource.indexOf("<MapDestinationPinLink pinUrl={selectedGpsNavigationUrl}", reviewedAction);
    const disabledAction = pageSource.indexOf("No trusted GPS destination", pinAction);
    const sequenceDisclosure = pageSource.indexOf('<details className="map-saved-road-sequence">');
    const referenceWarning = pageSource.indexOf('selectedCoordinate?.role !== "driver_entrance"', sequenceDisclosure);

    expect(pageSource).toContain('className="map-selection-header"');
    expect(pageSource).toContain('<details className="map-route-status">');
    expect(pageSource).toContain('<details className="map-saved-road-sequence">');
    expect(pageSource).toContain('selectedReviewedNavigation?.reviewedRoadSequence || (!approvedNavigationUrl ? selected?.structuredRoadSequence || "" : "")');
    expect(pageSource).not.toContain('eligibleReviewedNavigation?.reviewedRoadSequence');
    expect(pageSource).toContain("{selectedRoadSequence}");
    expect(pageSource).toContain('selectedReviewedNavigation ? "Reviewed named-road sequence" : "Saved road sequence"');
    expect(pageSource).toContain('selectedReviewedNavigation.ownerApproval.evidence === "exact_named_road_identities" ? "Owner-approved named-road directions" : "Owner-approved Google directions"');
    expect(pageSource).toContain("const selectedReviewedNavigation = eligibleReviewedNavigation;");
    expect(pageSource).not.toContain("navigationFallbackAfterHigherPriorityCheck");
    expect(pageSource).not.toContain("Checking for the highest-priority reviewed route…");
    expect(pageSource).not.toContain("Live route check unavailable · no fallback opened");
    expect(pageSource).not.toContain("selectedReviewedNavigationCandidate ? <MapReviewedRouteLink");
    expect(pageSource).toContain("Open pad details");
    expect([approvedAction, reviewedAction, pinAction, disabledAction, sequenceDisclosure, referenceWarning].every((index) => index >= 0)).toBe(true);
    expect(approvedAction).toBeLessThan(reviewedAction);
    expect(reviewedAction).toBeLessThan(pinAction);
    expect(pinAction).toBeLessThan(disabledAction);
    expect(sequenceDisclosure).toBeLessThan(referenceWarning);
    expect(appCss).toMatch(/\.map-selection-card\s*\{[^}]*padding:\s*16px;/s);
    expect(appCss).toMatch(/\.map-selection-card\s*\{[^}]*max-height:\s*min\(64dvh,\s*560px\);/s);
    expect(appCss).toMatch(/\.map-selection-card \.button-primary\s*\{[^}]*min-height:\s*48px;/s);
    expect(appCss).toMatch(/\.map-saved-road-sequence summary\s*\{[^}]*display:\s*flex;/s);
    expect(appCss).toMatch(/\.map-coordinate-reference\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
    expect(appCss).toContain("--nav-bottom-offset: max(10px, env(safe-area-inset-bottom));");
    expect(appCss).toContain("bottom: var(--nav-bottom-offset);");
    expect(appCss).toContain("bottom: calc(var(--nav-height) + var(--nav-bottom-offset) + 12px);");
    expect(appCss).toMatch(/\.map-selection-card, \.map-cluster-chooser\s*\{[^}]*bottom:\s*calc\(var\(--nav-height\) \+ var\(--nav-bottom-offset\) \+ 12px\);/s);
    expect(appCss).toMatch(/@media \(max-width:\s*760px\)[\s\S]*?--nav-bottom-offset:\s*max\(2px, calc\(env\(safe-area-inset-bottom\) - 8px\)\);/s);
    expect(appCss).toMatch(/\.map-coordinate-reference > a\s*\{[^}]*min-height:\s*44px;/s);
    expect(appCss).toMatch(/\.map-route-status > summary\s*\{[^}]*min-height:\s*44px;/s);
    expect(appCss).toMatch(/\.map-control-stack\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
    expect(appCss).toMatch(/\.map-view-toolbar\s*\{[^}]*max-width:\s*100%;/s);
    expect(appCss).not.toMatch(/@media \(min-width:\s*1100px\)[\s\S]*?\.map-selection-card, \.map-cluster-chooser\s*\{[^}]*bottom:/s);
    expect(appCss).toMatch(/@media \(max-width:\s*620px\)[\s\S]*?\.map-selection-card\s*\{[^}]*max-height:\s*min\(54dvh,\s*470px\);[^}]*padding:\s*13px;/s);
    expect(appCss).toMatch(/@media \(max-width:\s*620px\)[\s\S]*?\.map-selection-card \.button-primary\s*\{[^}]*min-height:\s*44px;/s);
  });

  it("marks Google unavailable for an alternate even when the primary is ready", () => {
    expect(mapGoogleHandoffState("ready", true, false)).toBe("unavailable");
    expect(mapGoogleHandoffState("held", true, true)).toBe("ready");
    expect(mapGoogleHandoffState("held", false, true)).toBe("held");
  });

  it("prioritizes the reviewed route and otherwise exposes a sourced GPS-only destination", () => {
    expect(pageSource).toContain("loadReleasedGoogleHandoff(selected)");
    expect(pageSource).toContain("currentReleasedGoogleHandoff(releasedHandoff, selected)");
    expect(pageSource).toContain("releasedGoogleNavigationUrl(");
    expect(pageSource).toContain("<MapApprovedRouteLink routeUrl={approvedNavigationUrl}");
    expect(pageSource).toContain("reviewedNavigationCandidateForPad(selected)");
    expect(pageSource).toContain("reviewedNavigationSafetyHoldForPad(selected)");
    expect(pageSource).toContain("<MapReviewedRouteLink routeUrl={selectedReviewedNavigation.routeUrl}");
    expect(pageSource).toContain("ownerApproval={selectedReviewedNavigation.ownerApproval}");
    expect(pageSource).toContain("const selectedReviewedNavigation = eligibleReviewedNavigation;");
    expect(pageSource).toContain("without gating the ordinary named-road");
    expect(pageSource).not.toContain("statusRequestSettled:");
    expect(pageSource).not.toContain("releaseRequestSettled:");
    expect(pageSource).toContain("Reviewed Google directions are available for this exact pad.");
    expect(pageSource).toContain("padDestinationPinUrl(selected)");
    expect(pageSource).toContain("padDestinationNavigationUrl(selected)");
    expect(pageSource).toContain("trustedPadDestination(selected)");
    expect(pageSource).toContain("<MapDestinationPinLink pinUrl={selectedGpsNavigationUrl}");
    expect(pageSource.indexOf("selectedGpsNavigationUrl && selectedGpsDestination")).toBeLessThan(
      pageSource.indexOf("namedSelectionRequired ? <small", pageSource.indexOf("selectedGpsNavigationUrl && selectedGpsDestination")),
    );
    expect(pageSource).toContain('className="map-coordinate-pin"');
    expect(pageSource).toContain("destination pin only, no reviewed named-road sequence");
    expect(pageSource).not.toContain("Copy GPS");
    expect(pageSource).not.toContain("navigator.clipboard.writeText");
    expect(pageSource).not.toContain("google.com/maps/search");
  });

  it("withdraws a revision-bound unsafe route from the map without hiding its GPS destination", () => {
    const safetyAlert = pageSource.indexOf('selectedReviewedNavigationSafetyHold && <div className="inline-warning map-route-safety-alert" role="alert">');
    const routeStatus = pageSource.indexOf('<details className="map-route-status">');
    expect(safetyAlert).toBeGreaterThanOrEqual(0);
    expect(routeStatus).toBeGreaterThan(safetyAlert);
    expect(pageSource).toContain("GPS destination only until corrected");
    expect(pageSource).toContain("selectedGpsNavigationUrl && selectedGpsDestination");
  });

  it("keys status and route choices to the current pad before rendering authority", () => {
    expect(pageSource).toContain("selectedStatus?.padId === selected.padId");
    expect(pageSource).toContain("selectedStatus.recordRevision === selected.recordRevision");
    expect(pageSource).toContain("routeChoicesRecordKey === selectedRecordKey");
    expect(pageSource).toContain("`${selected.padId}:${selected.recordRevision}`");
    expect(pageSource).toContain('selectedRouteIsPrimary ? "primary" : "alternate"');
  });

  it("keeps phone map search compact while preserving expandable filters", () => {
    expect(pageSource).toContain("const [mapFiltersOpen, setMapFiltersOpen] = useState(false)");
    expect(pageSource).toContain('placeholder="Search pads"');
    expect(pageSource).toContain("usePadSearchLocation()");
    expect(pageSource).toContain("closestPadSearchResults(companyScopedRows, mapSearch, mapSearchOrigin, 7)");
    expect(pageSource).toContain("nearbyPadResultsHeading(mapSearch, mapSearchOrigin)");
    expect(pageSource).toContain("Using this phone's current GPS to find nearby pads");
    expect(pageSource).toContain('role="region" aria-label="Pad search results"');
    expect(pageSource).not.toContain('role="combobox"');
    expect(pageSource).not.toContain('role="listbox"');
    expect(pageSource).toContain('aria-controls="map-filter-panel"');
    expect(pageSource).toContain('hidden={!mapFiltersOpen}');
    expect(pageSource).toContain('aria-label="Filter pads and approved roads by company"');
  });

  it("uses stable individual markers instead of moving numbered clusters", () => {
    expect(pageSource).toContain("groupCoincidentProjectedPads");
    expect(pageSource).toContain("stable double marker");
    expect(pageSource).not.toContain("fillText(group.rows.length");
  });

  it("defers all-pad canvas projection until mobile camera movement settles", () => {
    expect(pageSource).toContain('map.on("movestart", () => {');
    expect(pageSource).toContain('map.on("moveend", () => {');
    expect(pageSource).not.toContain('map.on("move", scheduleOverlayDraw)');
    expect(pageSource).toContain("if (overlayInteractionActive) return;");
    expect(pageSource).toContain("clearOverlayForInteraction();");
    expect(pageSource).toContain("hitTargetsRef.current = [];");
    expect(pageSource).toContain("if (!overlayInteractionActive && overlayDirty)");
    expect(pageSource).toContain("drawOverlay();");
  });

  it("fits valid company pads after a company filter changes", () => {
    expect(pageSource).toContain("mapRowsCoordinateExtent(companyScopedRows)");
    expect(pageSource).toContain("mapRef.current.fitBounds(new LngLatBounds(extent.southWest, extent.northEast)");
    expect(pageSource).toContain("previousCompanyFilterRef.current = companyFilter");
    expect(pageSource).toContain("Filtered mapped locations are outside the current view. Zoom out or choose another company.");
  });
});

describe("map marker visual density", () => {
  it("keeps every pad tappable while shrinking regional-view dots continuously", () => {
    const regional = mapMarkerVisualStyle(7.25, false);
    const middle = mapMarkerVisualStyle(9, false);
    const close = mapMarkerVisualStyle(11.5, false);
    const selected = mapMarkerVisualStyle(7.25, true);

    expect(regional).toMatchObject({ radius: 2.75, opacity: 0.6, strokeWidth: 1 });
    expect(regional.stackOffset).toBeCloseTo(1.5125);
    expect(middle.radius).toBeGreaterThan(regional.radius);
    expect(middle.radius).toBeLessThan(close.radius);
    expect(close).toMatchObject({ radius: 5.5, opacity: 1, strokeWidth: 2 });
    expect(close.stackOffset).toBeCloseTo(3.025);
    expect(selected).toEqual({ radius: 8, opacity: 1, strokeWidth: 3, stackOffset: 3 });
  });
});
