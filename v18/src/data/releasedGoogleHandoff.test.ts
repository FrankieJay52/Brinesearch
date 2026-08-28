import { afterEach, describe, expect, it, vi } from "vitest";
import type { PadSummary } from "./types";
import {
  clearReleasedGoogleHandoffCache,
  currentReleasedGoogleHandoff,
  currentReleasedGoogleHandoffLoad,
  higherPriorityNavigationCheckState,
  loadReleasedGoogleHandoff,
  releasedGoogleNavigationUrl,
} from "./releasedGoogleHandoff";

function pad(id: string, recordRevision = "1"): PadSummary {
  return {
    padId: id,
    canonicalId: id,
    legacyId: null,
    aliases: [],
    recordNumber: null,
    recordRevision,
    recordType: "pad",
    company: "Ascent",
    padName: "COLOGIE",
    state: "Ohio",
    county: "Harrison",
    township: "",
    address: "",
    coordinate: { latitude: 40.25403, longitude: -80.913577, role: "driver_entrance" },
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

function release(id: string) {
  return {
    padId: id,
    routeRevision: 7,
    sourceManifestDigest: "b".repeat(32),
    sourceDependencyDigest: "c".repeat(32),
    handoffVersion: "v18-google-mobile-v1",
    handoffDigest: "d".repeat(32),
    publishedAt: "2026-08-25T22:10:00Z",
    handoff: {
      handoff_version: "v18-google-mobile-v1",
      pad_id: id,
      route_revision: 7,
      source_manifest_digest: "b".repeat(32),
      source_dependency_digest: "c".repeat(32),
      origin_mode: "current_location_until_route_ingress",
      mobile_waypoint_limit: 3,
      waypoints: [
        { sequence: 1, latitude: 40.2376830710089, longitude: -80.9648236007351 },
        { sequence: 13, latitude: 40.2435207, longitude: -80.912831 },
        { sequence: 15, latitude: 40.250514, longitude: -80.9106604 },
      ],
      destination: { sequence: 16, latitude: 40.25403, longitude: -80.913577, pad_id: id },
    },
  };
}

afterEach(() => {
  clearReleasedGoogleHandoffCache();
  vi.unstubAllGlobals();
});

describe("released Google handoff loader", () => {
  it("reuses the same reviewed release for repeat opens in one app session", async () => {
    const id = "e2b32e85-9e93-4388-8215-9d8167cbbeb8";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(release(id)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const firstRequest = loadReleasedGoogleHandoff(pad(id));
    const secondRequest = loadReleasedGoogleHandoff(pad(id));
    const [first, second] = await Promise.all([firstRequest, secondRequest]);

    expect(first.checked).toBe(true);
    expect(first.plan?.singleUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("brinesearch_v18_driver_google_handoff_release");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store", method: "POST" });

    expect((await loadReleasedGoogleHandoff(pad(id))).plan?.singleUrl).toBe(first.plan?.singleUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rechecks an explicit revocation after the Settings refresh and never restores a Google link offline", async () => {
    const id = "44444444-4444-4444-8444-444444444444";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(release(id)), { status: 200 }))
      .mockImplementation(() => Promise.resolve(new Response("null", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    expect((await loadReleasedGoogleHandoff(pad(id))).plan?.singleUrl).toBeTruthy();
    clearReleasedGoogleHandoffCache();
    expect(await loadReleasedGoogleHandoff(pad(id))).toMatchObject({ checked: true, plan: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await loadReleasedGoogleHandoff(pad(id))).toMatchObject({ checked: true, plan: null });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    vi.stubGlobal("navigator", { onLine: false });
    expect(await loadReleasedGoogleHandoff(pad(id))).toMatchObject({ checked: false, plan: null });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never carries a released link to another selected pad or alternate route", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(release(id)), { status: 200 })));
    const loaded = await loadReleasedGoogleHandoff(pad(id));
    const plan = currentReleasedGoogleHandoff(loaded, pad(id));

    expect(currentReleasedGoogleHandoff(loaded, pad("22222222-2222-4222-8222-222222222222"))).toBeNull();
    expect(releasedGoogleNavigationUrl(plan, "alternate")).toBeNull();
    expect(releasedGoogleNavigationUrl(currentReleasedGoogleHandoff(loaded, pad(id)), "primary")).toBe(plan?.singleUrl);
  });

  it("rejects an old released plan immediately when the same pad advances revision", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(release(id)), { status: 200 })));
    const loaded = await loadReleasedGoogleHandoff(pad(id, "1"));

    expect(currentReleasedGoogleHandoff(loaded, pad(id, "1"))).not.toBeNull();
    expect(currentReleasedGoogleHandoff(loaded, pad(id, "2"))).toBeNull();
    expect(currentReleasedGoogleHandoffLoad(loaded, pad(id, "2"))).toBeNull();
  });

  it("fails closed on a missing, mismatched, or malformed release", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...release(id), padId: "different-pad" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadReleasedGoogleHandoff(pad(id))).toMatchObject({ checked: false, plan: null });
    expect(await loadReleasedGoogleHandoff(pad(id))).toMatchObject({ checked: false, plan: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["empty object", {}],
    ["empty array", []],
    ["scalar", "malformed"],
  ])("does not negative-cache a malformed %s response", async (_label, payload) => {
    const id = "55555555-5555-4555-8555-555555555555";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await loadReleasedGoogleHandoff(pad(id))).toMatchObject({ checked: false, plan: null });
    expect(await loadReleasedGoogleHandoff(pad(id))).toMatchObject({ checked: false, plan: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("higher-priority navigation check state", () => {
  it("keeps fallbacks closed until both exact online checks finish", () => {
    expect(higherPriorityNavigationCheckState({
      online: true,
      approvedRouteAvailable: false,
      statusRequestSettled: false,
      statusChecked: false,
      releaseRequestSettled: true,
      releaseChecked: true,
    })).toBe("checking");
  });

  it("distinguishes a completed absence from an authority-check failure", () => {
    expect(higherPriorityNavigationCheckState({
      online: true,
      approvedRouteAvailable: false,
      statusRequestSettled: true,
      statusChecked: true,
      releaseRequestSettled: true,
      releaseChecked: true,
    })).toBe("checked");
    expect(higherPriorityNavigationCheckState({
      online: true,
      approvedRouteAvailable: false,
      statusRequestSettled: true,
      statusChecked: false,
      releaseRequestSettled: true,
      releaseChecked: true,
    })).toBe("unavailable");
  });

  it("lets a current approved route win immediately and preserves offline fallbacks", () => {
    const pending = {
      statusRequestSettled: false,
      statusChecked: false,
      releaseRequestSettled: false,
      releaseChecked: false,
    };
    expect(higherPriorityNavigationCheckState({ online: true, approvedRouteAvailable: true, ...pending })).toBe("checked");
    expect(higherPriorityNavigationCheckState({ online: false, approvedRouteAvailable: false, ...pending })).toBe("checked");
  });
});
