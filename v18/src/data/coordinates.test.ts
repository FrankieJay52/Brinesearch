import { describe, expect, it } from "vitest";
import { parseCoordinatePair } from "./coordinates";

describe("parseCoordinatePair", () => {
  it.each([
    [null, null, "missing"],
    ["", " ", "missing"],
    [40, null, "partial"],
    [true, -80, "malformed"],
    ["north", -80, "malformed"],
    [91, -80, "out_of_range"],
    [40, -181, "out_of_range"],
    [0, 0, "zero_origin"],
    ["0", "0", "zero_origin"],
    [-80, 40, "outside_service_area"],
    [45, -80, "outside_service_area"],
  ])("rejects %p/%p as %s", (latitude, longitude, reason) => {
    expect(parseCoordinatePair(latitude, longitude)).toEqual({ ok: false, reason });
  });

  it("accepts Cologie's saved point without upgrading its role", () => {
    expect(parseCoordinatePair(40.25403, -80.913577, "legacy_saved")).toEqual({
      ok: true,
      value: { latitude: 40.25403, longitude: -80.913577, role: "legacy_saved" },
    });
  });
});
