import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDriverRouteChoices } from "./routeChoices";
import { loadPadStatus } from "./status";
import type { PadSummary } from "./types";
import { loadPadWellRows } from "./wellRows";

const padId = "22222222-2222-4222-8222-222222222222";
const pad: PadSummary = {
  padId,
  canonicalId: padId,
  legacyId: "ascent--offline-miss",
  aliases: [],
  recordNumber: 1,
  recordRevision: "1787700000000000",
  recordType: "pad",
  company: "Ascent",
  padName: "OFFLINE MISS",
  state: "Ohio",
  county: "Belmont",
  township: "Union",
  address: "100 Test Road",
  coordinate: { latitude: 40.1, longitude: -80.9, role: "driver_entrance" },
  wellNames: [],
  apiNumbers: [],
  propertyNumbers: [],
  safeRoadTerms: [],
  structuredRoadSequence: "OH-7 → CR-10",
  writtenDirections: "",
  verificationStatus: "reviewed",
  operatingStatus: "ACTIVE",
  updatedAt: "2026-08-25T12:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("V18 airplane-mode behavior", () => {
  it("does not call status, graph-choice, or well-row APIs while offline", async () => {
    const request = vi.fn();
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("fetch", request);

    const [status, choices, rows] = await Promise.all([
      loadPadStatus(pad, "cached_live"),
      loadDriverRouteChoices(pad),
      loadPadWellRows(pad, "cached_live"),
    ]);

    expect(request).not.toHaveBeenCalled();
    expect(choices).toEqual([]);
    expect(rows).toBeNull();
    expect(status.route).toMatchObject({
      state: "unavailable",
      geometry: null,
      safeReason: "Directions for this pad are not cached on this device.",
    });
    expect(status.google.routeUrl).toBeNull();
  });
});
