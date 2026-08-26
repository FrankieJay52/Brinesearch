import { describe, expect, it } from "vitest";
import {
  initialPadSearchLocationSnapshot,
  padSearchResultsReady,
  reducePadSearchLocation,
} from "./usePadSearchLocation";

describe("phone-location search readiness", () => {
  it("waits for the phone position before exposing tappable nearest results", () => {
    expect(padSearchResultsReady("idle", null)).toBe(false);
    expect(padSearchResultsReady("locating", null)).toBe(false);
    expect(padSearchResultsReady("ready", { latitude: 40.25, longitude: -80.91 })).toBe(true);
  });

  it("keeps exact name search available after permission denial or GPS failure", () => {
    expect(padSearchResultsReady("denied", null)).toBe(true);
    expect(padSearchResultsReady("unavailable", null)).toBe(true);
  });

  it("clears the prior coordinate while a fresh phone reading is in progress", () => {
    const previous = { state: "ready" as const, origin: { latitude: 40.25, longitude: -80.91 }, activeAttempt: 1 };
    expect(reducePadSearchLocation(previous, { type: "request", attempt: 2 })).toEqual({
      state: "locating",
      origin: null,
      activeAttempt: 2,
    });
  });

  it("accepts a valid result only for the current attempt", () => {
    const locating = reducePadSearchLocation(initialPadSearchLocationSnapshot, { type: "request", attempt: 4 });
    const ready = reducePadSearchLocation(locating, {
      type: "success",
      attempt: 4,
      origin: { latitude: 40.25, longitude: -80.91 },
    });

    expect(ready).toEqual({
      state: "ready",
      origin: { latitude: 40.25, longitude: -80.91 },
      activeAttempt: 4,
    });
    expect(reducePadSearchLocation(ready, {
      type: "success",
      attempt: 3,
      origin: { latitude: 1, longitude: 1 },
    })).toBe(ready);
  });

  it("fails closed for invalid coordinates, GPS errors, and synchronous unavailability", () => {
    const locating = reducePadSearchLocation(initialPadSearchLocationSnapshot, { type: "request", attempt: 5 });
    const invalid = reducePadSearchLocation(locating, {
      type: "success",
      attempt: 5,
      origin: { latitude: 999, longitude: -80.91 },
    });
    expect(invalid).toEqual({ state: "unavailable", origin: null, activeAttempt: 5 });

    const retry = reducePadSearchLocation(invalid, { type: "request", attempt: 6 });
    expect(reducePadSearchLocation(retry, { type: "failure", attempt: 6, denied: false })).toEqual({
      state: "unavailable",
      origin: null,
      activeAttempt: 6,
    });
  });

  it("distinguishes permission denial and ignores an obsolete failure", () => {
    const locating = reducePadSearchLocation(initialPadSearchLocationSnapshot, { type: "request", attempt: 8 });
    expect(reducePadSearchLocation(locating, { type: "failure", attempt: 7, denied: false })).toBe(locating);
    expect(reducePadSearchLocation(locating, { type: "failure", attempt: 8, denied: true })).toEqual({
      state: "denied",
      origin: null,
      activeAttempt: 8,
    });
  });
});
