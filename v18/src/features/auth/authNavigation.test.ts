import { describe, expect, it } from "vitest";
import { ownerSignInDestination } from "./authNavigation";

describe("V18 owner sign-in destination", () => {
  it("accepts only known internal V18 destinations", () => {
    expect(ownerSignInDestination("/settings/approved-routes")).toBe("/settings/approved-routes");
    expect(ownerSignInDestination("/control-center")).toBe("/control-center");
  });

  it("accepts the exact internal owner verifier path with one safe pad ID", () => {
    const verifierPath = "/settings/verify-route/59061829-1122-4aae-872d-cf5024310373";
    expect(ownerSignInDestination(verifierPath)).toBe(verifierPath);
    expect(ownerSignInDestination("/settings/verify-route/pad._~-1")).toBe("/settings/verify-route/pad._~-1");
  });

  it("fails closed for external, legacy, and malformed destinations", () => {
    for (const value of [null, "", "https://brinesearch.com/index.html#/", "//example.com", "/v17", "/settings/approved-routes?unsafe=1"]) {
      expect(ownerSignInDestination(value)).toBe("/settings/approved-routes");
    }
  });

  it("rejects malformed, queried, nested, and external verifier destinations", () => {
    for (const value of [
      "/settings/verify-route",
      "/settings/verify-route/",
      "/settings/verify-route/pad-1?draft=1",
      "/settings/verify-route/pad-1#section-1",
      "/settings/verify-route/pad-1/extra",
      "/settings/verify-route/pad%2Fextra",
      `/settings/verify-route/${"a".repeat(161)}`,
      "https://example.com/settings/verify-route/pad-1",
      "//example.com/settings/verify-route/pad-1",
    ]) {
      expect(ownerSignInDestination(value)).toBe("/settings/approved-routes");
    }
  });
});
