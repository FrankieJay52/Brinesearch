import { describe, expect, it } from "vitest";
import { ownerSignInDestination } from "./authNavigation";

describe("V18 owner sign-in destination", () => {
  it("accepts only known internal V18 destinations", () => {
    expect(ownerSignInDestination("/settings/approved-routes")).toBe("/settings/approved-routes");
    expect(ownerSignInDestination("/control-center")).toBe("/control-center");
  });

  it("fails closed for external, legacy, and malformed destinations", () => {
    for (const value of [null, "", "https://brinesearch.com/index.html#/", "//example.com", "/v17", "/settings/approved-routes?unsafe=1"]) {
      expect(ownerSignInDestination(value)).toBe("/settings/approved-routes");
    }
  });
});
