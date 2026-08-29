import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SelectedPadFieldDirectionPad } from "./selectedPadFieldDirectionDisplay";
import { selectedPadFieldDirectionDisplayForPad } from "./selectedPadFieldDirectionDisplay";

function bannock(overrides: Partial<SelectedPadFieldDirectionPad> = {}): SelectedPadFieldDirectionPad {
  return {
    padId: "333598ca-37b3-4b44-9411-a490cc3da672",
    canonicalId: "333598ca-37b3-4b44-9411-a490cc3da672",
    legacyId: "ascent--bannock",
    recordRevision: "1786744183028038",
    padName: "BANNOCK",
    company: "Ascent",
    state: "Ohio",
    county: "Belmont",
    coordinate: { latitude: 40.111003, longitude: -81.002932, role: "driver_entrance" },
    ...overrides,
  };
}

function pointEquals(left: readonly number[], right: readonly number[]) {
  return left[0] === right[0] && left[1] === right[1];
}

describe("selected BANNOCK field-direction display", () => {
  it("binds only to the exact frozen BANNOCK directory record", () => {
    const display = selectedPadFieldDirectionDisplayForPad(bannock());
    expect(display).not.toBeNull();
    expect(display).toMatchObject({
      padId: "333598ca-37b3-4b44-9411-a490cc3da672",
      displayScope: "selected-pad-only",
      savedPin: [-81.002932, 40.111003],
      projectedSeam: [-81.0029984280781, 40.11094217212037],
      noConnectorToGps: true,
      inbound: { type: "LineString", colorRole: "teal" },
      outbound: { type: "LineString", colorRole: "red" },
    });
  });

  it.each([
    ["pad id", { padId: "00000000-0000-0000-0000-000000000000" }],
    ["canonical id", { canonicalId: "00000000-0000-0000-0000-000000000000" }],
    ["legacy id", { legacyId: "ascent--not-bannock" }],
    ["record revision", { recordRevision: "1786744183028039" }],
    ["pad name", { padName: "BANNOCK NORTH" }],
    ["company", { company: "Other" }],
    ["state", { state: "West Virginia" }],
    ["county", { county: "Harrison" }],
    ["latitude", { coordinate: { latitude: 40.111004, longitude: -81.002932, role: "driver_entrance" as const } }],
    ["longitude", { coordinate: { latitude: 40.111003, longitude: -81.002933, role: "driver_entrance" as const } }],
    ["coordinate role", { coordinate: { latitude: 40.111003, longitude: -81.002932, role: "saved_pad_destination" as const } }],
    ["missing coordinate", { coordinate: null }],
  ])("fails closed for a changed %s", (_label, overrides) => {
    expect(selectedPadFieldDirectionDisplayForPad(bannock(overrides))).toBeNull();
  });

  it("preserves the exact endpoints, seam, transition anchors, and point counts", () => {
    const display = selectedPadFieldDirectionDisplayForPad(bannock());
    expect(display).not.toBeNull();
    if (!display) return;

    expect(display.inbound.coordinates).toHaveLength(95);
    expect(display.outbound.coordinates).toHaveLength(239);
    expect(display.inbound.coordinates[0]).toEqual([-80.977251, 40.108873]);
    expect(display.inbound.coordinates.at(-1)).toEqual([-81.0029984280781, 40.11094217212037]);
    expect(display.outbound.coordinates[0]).toEqual([-81.0029984280781, 40.11094217212037]);
    expect(display.outbound.coordinates.at(-1)).toEqual([-81.055906, 40.149757]);
    expect(display.transitions.map(({ coordinate }) => coordinate)).toEqual([
      [-80.977251, 40.108873],
      [-81.008863, 40.112463],
      [-81.016529, 40.112238],
      [-81.025262, 40.112122],
      [-81.055906, 40.149757],
    ]);
  });

  it("uses one continuous road seam while keeping the exact GPS pin separate", () => {
    const display = selectedPadFieldDirectionDisplayForPad(bannock());
    expect(display).not.toBeNull();
    if (!display) return;

    const inboundEnd = display.inbound.coordinates.at(-1);
    const outboundStart = display.outbound.coordinates[0];
    expect(inboundEnd).toEqual(display.projectedSeam);
    expect(outboundStart).toEqual(display.projectedSeam);
    expect(inboundEnd).toEqual(outboundStart);
    expect(display.savedPin).not.toEqual(display.projectedSeam);
    expect(display.noConnectorToGps).toBe(true);
    expect(display.inbound.coordinates.some((point) => pointEquals(point, display.savedPin))).toBe(false);
    expect(display.outbound.coordinates.some((point) => pointEquals(point, display.savedPin))).toBe(false);
  });

  it("contains only valid longitude-latitude positions", () => {
    const display = selectedPadFieldDirectionDisplayForPad(bannock());
    expect(display).not.toBeNull();
    if (!display) return;

    for (const point of [...display.inbound.coordinates, ...display.outbound.coordinates]) {
      expect(point).toHaveLength(2);
      expect(Number.isFinite(point[0])).toBe(true);
      expect(Number.isFinite(point[1])).toBe(true);
      expect(point[0]).toBeGreaterThanOrEqual(-180);
      expect(point[0]).toBeLessThanOrEqual(180);
      expect(point[1]).toBeGreaterThanOrEqual(-90);
      expect(point[1]).toBeLessThanOrEqual(90);
    }
  });

  it("freezes the checked-in inbound and outbound centerline coordinates", () => {
    const display = selectedPadFieldDirectionDisplayForPad(bannock());
    expect(display).not.toBeNull();
    if (!display) return;

    const geometryHash = createHash("sha256")
      .update(JSON.stringify({
        inbound: display.inbound.coordinates,
        outbound: display.outbound.coordinates,
      }))
      .digest("hex");
    expect(geometryHash).toBe("57675008c5190f31f09913732c157c0fc997cd59aba0103ee3c4dc04475ab442");
  });
});
