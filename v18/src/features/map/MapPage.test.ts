import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { PadSummary } from "@/data/types";
import {
  coincidentLocationsNeedChooser,
  emptyMapCoordinateNotice,
  filterMapRows,
  mapGoogleHandoffState,
  mapPadSearchResults,
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

  it("loads only the published approved-road overlay in road mode", () => {
    expect(pageSource).toContain('companyRoads.selectRoads("all")');
    expect(pageSource).toContain('companyRoads.availability.state === "ready"');
    expect(pageSource).toContain("Held, candidate, stale, guessed, and unpublished roads stay hidden.");
    expect(pageSource).not.toContain("loadOwnerRoadViewport");
  });

  it("draws a selected inbound route only from the fail-closed driver status geometry", () => {
    expect(pageSource).toContain("selectedRouteRef.current = selectedRouteGeometry");
    expect(pageSource).toContain('selectedRouteChoice?.routeGroup === "alternate"');
    expect(pageSource).toContain("currentSelectedStatus?.route.geometry || null");
    expect(pageSource).toContain("loadDriverRouteChoices(selected)");
    expect(pageSource).toContain("No approved inbound route is public · no route line inferred.");
    expect(pageSource).not.toContain("nearest_road");
    expect(pageSource).not.toContain("fuzzy_name");
  });

  it("requires a named approach choice and binds its map line and navigation action together", () => {
    expect(pageSource).toContain("const currentNamedApproaches = currentSelectedStatus?.namedApproaches || []");
    expect(pageSource).toContain("currentNamedApproaches.length > 1 && !selectedNamedApproach");
    expect(pageSource).toContain("selectedNamedApproach?.navigationUrl");
    expect(pageSource).toContain("selectedNamedApproach.geometry");
    expect(pageSource).toContain('aria-label="Choose reviewed named approach"');
    expect(pageSource).toContain("setSelectedNamedApproachKey(approach.approachKey)");
    expect(pageSource).toContain("Choose one reviewed approach to enable approved-road navigation");
    expect(pageSource).toContain("GPS destination-only navigation remains available; no approved route line is selected.");
    expect(pageSource).toContain("GPS-only final leg is not approved road geometry.");
    expect(pageSource).toContain("This GPS destination is the separate unapproved final leg.");
    expect(pageSource).toContain("approachLabel={selectedNamedApproach?.approachLabel}");
    expect(pageSource).toContain('`${selectedNamedApproach.approachLabel} core + GPS`');
    expect(pageSource).toContain('`${selectedNamedApproach.approachLabel} ready`');
  });

  it("labels a released core plus GPS handoff without implying an end-to-end Google route", () => {
    expect(pageSource).toContain('? "Approved core + GPS"');
    expect(pageSource).toContain('? "Approved roads to the handoff, then GPS-only final leg; final GPS leg is not approved road geometry"');
    expect(pageSource).toContain(': "Reviewed approved route"');
    expect(pageSource).toContain('currentSelectedStatus?.route.source === "exact_graph_handoff"');
    expect(pageSource).toContain('"Approved public-road core highlighted to its exact handoff · saved pad GPS shown separately."');
  });

  it("provides an explicit full-screen exit and pad-detail connection", () => {
    expect(pageSource).toContain('className="map-view-exit"');
    expect(pageSource).toContain('{!fullscreen && <button type="button" aria-pressed="false"');
    expect(pageSource).not.toContain('{fullscreen ? "Map" : "Full screen"}');
    expect(pageSource).toContain('changeViewerMode("standard")');
    expect(pageSource).toContain("Open pad details");
    expect(pageSource).toContain("focusPad(target.rows[0])");
  });

  it("keeps the selected-pad driver card compact without dropping route context", () => {
    const pendingAction = pageSource.indexOf("Checking for the highest-priority reviewed route…");
    const failedAction = pageSource.indexOf("Live route check unavailable · no fallback opened", pendingAction);
    const approvedAction = pageSource.indexOf("<MapApprovedRouteLink routeUrl={approvedNavigationUrl}", failedAction);
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
    expect(pageSource).toContain('selectedReviewedNavigation ? "Reviewed route sequence" : "Saved road sequence"');
    expect(pageSource).toContain("const selectedReviewedNavigation = navigationFallbackAfterHigherPriorityCheck(");
    expect(pageSource).not.toContain("selectedReviewedNavigationCandidate ? <MapReviewedRouteLink");
    expect(pageSource).toContain("Open pad details");
    expect([pendingAction, failedAction, approvedAction, reviewedAction, pinAction, disabledAction, sequenceDisclosure, referenceWarning].every((index) => index >= 0)).toBe(true);
    expect(pendingAction).toBeLessThan(failedAction);
    expect(failedAction).toBeLessThan(approvedAction);
    expect(approvedAction).toBeLessThan(reviewedAction);
    expect(reviewedAction).toBeLessThan(pinAction);
    expect(pinAction).toBeLessThan(disabledAction);
    expect(sequenceDisclosure).toBeLessThan(referenceWarning);
    expect(appCss).toMatch(/\.map-selection-card\s*\{[^}]*padding:\s*16px;/s);
    expect(appCss).toMatch(/\.map-selection-card\s*\{[^}]*max-height:\s*min\(64dvh,\s*560px\);/s);
    expect(appCss).toMatch(/\.map-selection-card \.button-primary\s*\{[^}]*min-height:\s*48px;/s);
    expect(appCss).toMatch(/\.map-saved-road-sequence summary\s*\{[^}]*display:\s*flex;/s);
    expect(appCss).toMatch(/\.map-coordinate-reference\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
    expect(appCss).toContain("bottom: calc(var(--nav-height) + max(10px, env(safe-area-inset-bottom)) + 12px);");
    expect(appCss).toMatch(/\.map-selection-card, \.map-cluster-chooser\s*\{[^}]*bottom:\s*calc\(var\(--nav-height\) \+ max\(10px, env\(safe-area-inset-bottom\)\) \+ 12px\);/s);
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
    expect(pageSource).toContain("statusRequestSettled: !selected || currentStatusAuthorityCheck !== null");
    expect(pageSource).toContain("releaseRequestSettled: !selected || currentReleasedHandoffLoadResult !== null");
    expect(pageSource).toContain("Owner-reviewed Google directions are available for this exact pad.");
    expect(pageSource).toContain("padDestinationPinUrl(selected)");
    expect(pageSource).toContain("padDestinationNavigationUrl(selected)");
    expect(pageSource).toContain("trustedPadDestination(selected)");
    expect(pageSource).toContain("<MapDestinationPinLink pinUrl={selectedGpsNavigationUrl}");
    expect(pageSource.indexOf("selectedGpsNavigationUrl && selectedGpsDestination")).toBeLessThan(
      pageSource.indexOf("namedSelectionRequired ? <small", pageSource.indexOf("selectedGpsNavigationUrl && selectedGpsDestination")),
    );
    expect(pageSource).toContain('className="map-coordinate-pin"');
    expect(pageSource).toContain("destination pin only, not an approved route");
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
    expect(pageSource).toContain("closestPadSearchResults(snapshot?.rows || [], mapSearch, mapSearchOrigin, 7)");
    expect(pageSource).toContain("nearbyPadResultsHeading(mapSearch, mapSearchOrigin)");
    expect(pageSource).toContain("Using this phone's current GPS to find nearby pads");
    expect(pageSource).toContain('role="region" aria-label="Pad search results"');
    expect(pageSource).not.toContain('role="combobox"');
    expect(pageSource).not.toContain('role="listbox"');
    expect(pageSource).toContain('aria-controls="map-filter-panel"');
    expect(pageSource).toContain('hidden={!mapFiltersOpen}');
    expect(pageSource).toContain('aria-label="Show approved route roads by company"');
  });

  it("uses stable individual markers instead of moving numbered clusters", () => {
    expect(pageSource).toContain("groupCoincidentProjectedPads");
    expect(pageSource).toContain("stable double marker");
    expect(pageSource).not.toContain("fillText(group.rows.length");
  });
});
