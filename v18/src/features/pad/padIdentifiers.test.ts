import { describe, expect, it } from "vitest";
import { buildPadIdentifierGroups, padIdentifierSummary } from "./padIdentifiers";

describe("V18 pad identifier presentation", () => {
  it("keeps the three reviewed public identifier lists separate", () => {
    const groups = buildPadIdentifierGroups({
      wellNames: ["Albert-W-Kkw-Bl-2H", "Albert-N-Kkw-Bl-6H"],
      apiNumbers: ["34-013-2-1381-00-00"],
      propertyNumbers: ["1553862", "1553864", "1553866"],
    });

    expect(groups).toEqual([
      { key: "well", label: "Well name", values: ["Albert-W-Kkw-Bl-2H", "Albert-N-Kkw-Bl-6H"] },
      { key: "api", label: "API number", values: ["34-013-2-1381-00-00"] },
      { key: "property", label: "Property number", values: ["1553862", "1553864", "1553866"] },
    ]);
  });

  it("does not manufacture aligned rows when public list lengths differ", () => {
    const groups = buildPadIdentifierGroups({
      wellNames: ["Well A", "Well B"],
      apiNumbers: ["API A"],
      propertyNumbers: [],
    });

    expect(groups.map((group) => group.values.length)).toEqual([2, 1, 0]);
    expect(groups[1]?.values).not.toContain("Well B");
    expect(groups[2]?.values).toEqual([]);
  });

  it("reports every public identifier category in the card summary", () => {
    expect(padIdentifierSummary({
      wellNames: ["Well A"],
      apiNumbers: ["API A", "API B"],
      propertyNumbers: ["Property A"],
    })).toBe("1 well name · 2 API numbers · 1 property number");
  });
});
