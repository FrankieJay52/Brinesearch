import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PadSummary } from "@/data/types";
import { filterMapRows, mapCompanyOptions, mapRoadSelectionForCompany } from "./mapModel";

function pad(padId: string, company: string): PadSummary {
  return {
    padId,
    canonicalId: padId,
    legacyId: null,
    aliases: [],
    recordNumber: null,
    recordRevision: "1",
    recordType: "pad",
    company,
    padName: padId,
    state: "Ohio",
    county: "Harrison",
    township: "",
    address: "",
    coordinate: { latitude: 40.1, longitude: -80.9, role: "driver_entrance" },
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

describe("unified map company filter", () => {
  it("offers every directory company, including one with no approved-road rows", () => {
    const rows = [
      pad("beta", "Beta Energy"),
      pad("ascent-one", "Ascent"),
      pad("blank", " "),
      pad("ascent-two", "Ascent"),
      pad("no-roads", "No Roads Oil"),
    ];

    expect(mapCompanyOptions(rows)).toEqual(["Ascent", "Beta Energy", "No Roads Oil"]);
    expect(filterMapRows(rows, "all", "No Roads Oil").map((row) => row.padId)).toEqual(["no-roads"]);
  });

  it("requests only an available released-road scope and leaves no-road companies empty", () => {
    expect(mapRoadSelectionForCompany("all", ["Ascent"], true)).toBe("all");
    expect(mapRoadSelectionForCompany("Ascent", ["Ascent"], true)).toBe("Ascent");
    expect(mapRoadSelectionForCompany("No Roads Oil", ["Ascent"], true)).toBeNull();
    expect(mapRoadSelectionForCompany("Ascent", ["Ascent"], false)).toBeNull();
  });

  it("uses one selection for pad scope, search scope, and the matching released-road request", () => {
    const source = readFileSync(new URL("./MapPage.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../../styles/app.css", import.meta.url), "utf8");

    expect(source).toContain('const [companyFilter, setCompanyFilter] = useState<"all" | string>("all")');
    expect(source).toContain('filterMapRows(snapshot?.rows || [], "all", selectedCompany)');
    expect(source).toContain("closestPadSearchResults(companyScopedRows, mapSearch, mapSearchOrigin, 7)");
    expect(source).toContain("companyRoads.availability.companies.includes(companyFilter)");
    expect(source).toContain("companyRoads.selectRoads(requestedRoadSelection)");
    expect(source).toContain("companyRoads.overlay?.selection === requestedRoadSelection");
    expect(source).toContain('aria-label="Filter pads and approved roads by company"');
    expect(source).toContain('<option value="all">All pads + all approved roads</option>');
    expect(source).toContain("companyOptions.map((company)");
    expect(css).toMatch(/@media \(max-width:\s*420px\)[\s\S]*?\.company-road-filter\s*\{[^}]*flex-direction:\s*column;/s);
    expect(css).toMatch(/@media \(max-width:\s*420px\)[\s\S]*?\.company-road-filter select\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/s);
  });

  it("shows company pads but requests no other road overlay when that company has no released rows", () => {
    const source = readFileSync(new URL("./MapPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("const requestedRoadSelection = mapRoadSelectionForCompany(");
    expect(source).toContain("No released exact approved roads are available for this company; nothing was inferred.");
    expect(source).toContain("Suppress stale overlay data until its embedded");
    expect(source).not.toContain("companyRoads.selectRoads(companyFilter === \"all\" ? \"all\" : \"all\")");
  });
});
