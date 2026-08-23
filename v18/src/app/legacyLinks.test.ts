import { describe, expect, it } from "vitest";
import { legacyBrineSearchPaths } from "./legacyLinks";

describe("production operational links", () => {
  it("keeps working V17 tools on the trusted BrineSearch origin", () => {
    expect(Object.values(legacyBrineSearchPaths).every((path) => path.startsWith("https://brinesearch.com/index.html#/"))).toBe(true);
  });

  it("opens the authenticated Road Manager for Control Center", () => {
    expect(legacyBrineSearchPaths.controlCenter).toBe("https://brinesearch.com/index.html#/settings/roads");
  });
});
