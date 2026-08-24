import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { PadSummary } from "@/data/types";
import {
  clusterNeedsChooser,
  emptyMapCoordinateNotice,
  filterMapRows,
  mapPadSearchResults,
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

describe("clusterNeedsChooser", () => {
  it("opens the chooser for exact-coordinate locations before maximum zoom", () => {
    expect(clusterNeedsChooser([
      pad("alpha", 39.8, -81.2),
      pad("beta", 39.8, -81.2),
    ], 8)).toBe(true);
  });

  it("allows distinct nearby locations to zoom before opening the chooser", () => {
    const rows = [
      pad("alpha", 39.8, -81.2),
      pad("beta", 39.8001, -81.2001),
    ];

    expect(clusterNeedsChooser(rows, 8)).toBe(false);
    expect(clusterNeedsChooser(rows, 14)).toBe(true);
  });

  it("does not open a chooser for a single location", () => {
    expect(clusterNeedsChooser([pad("alpha", 39.8, -81.2)], 14)).toBe(false);
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
});

describe("map viewer authority boundary", () => {
  const pageSource = readFileSync(new URL("./MapPage.tsx", import.meta.url), "utf8");

  it("loads only the published approved-road overlay in road mode", () => {
    expect(pageSource).toContain('companyRoads.selectRoads("all")');
    expect(pageSource).toContain('companyRoads.availability.state === "ready"');
    expect(pageSource).toContain("Held, candidate, stale, guessed, and unpublished roads stay hidden.");
    expect(pageSource).not.toContain("loadOwnerRoadViewport");
  });

  it("draws a selected inbound route only from the fail-closed driver status geometry", () => {
    expect(pageSource).toContain("selectedRouteRef.current = selectedStatus?.route.geometry || null");
    expect(pageSource).toContain("No route line was inferred.");
    expect(pageSource).not.toContain("nearest_road");
    expect(pageSource).not.toContain("fuzzy_name");
  });

  it("provides an explicit full-screen exit and pad-detail connection", () => {
    expect(pageSource).toContain('className="map-view-exit"');
    expect(pageSource).toContain('changeViewerMode("standard")');
    expect(pageSource).toContain("Open pad details");
    expect(pageSource).toContain("focusPad(target.rows[0])");
  });
});
