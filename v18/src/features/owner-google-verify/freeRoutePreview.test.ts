import { afterEach, describe, expect, it, vi } from "vitest";
import { freeRoutePreviewUrl, requestFreeRoutePreview } from "./freeRoutePreview";

const origin = { latitude: 40.1, longitude: -80.9 };
const anchor = { latitude: 40.11, longitude: -80.91 };
const turn = { latitude: 40.12, longitude: -80.92 };
const destination = { latitude: 40.13, longitude: -80.93 };

afterEach(() => vi.unstubAllGlobals());

describe("free owner route preview", () => {
  it("keeps phone origin, ordered owner controls, and saved destination in one no-key request", () => {
    const url = new URL(freeRoutePreviewUrl(origin, [anchor, turn], destination));
    expect(url.origin).toBe("https://router.project-osrm.org");
    expect(url.pathname).toContain("-80.9000000,40.1000000;-80.9100000,40.1100000;-80.9200000,40.1200000;-80.9300000,40.1300000");
    expect(url.searchParams.get("steps")).toBe("true");
    expect(url.searchParams.get("geometries")).toBe("geojson");
    expect(url.searchParams.get("continue_straight")).toBe("true");
    expect(url.search).not.toMatch(/key|token/i);
  });

  it("returns one road path per ordered leg and joins step geometry without duplicates", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      code: "Ok",
      routes: [{
        legs: [
          { steps: [
            { geometry: { type: "LineString", coordinates: [[-80.9, 40.1], [-80.905, 40.105]] } },
            { geometry: { type: "LineString", coordinates: [[-80.905, 40.105], [-80.91, 40.11]] } },
          ] },
          { steps: [{ geometry: { type: "LineString", coordinates: [[-80.91, 40.11], [-80.93, 40.13]] } }] },
        ],
      }],
    }), { status: 200 })));

    await expect(requestFreeRoutePreview(origin, [anchor], destination)).resolves.toEqual([
      { path: [[-80.9, 40.1], [-80.905, 40.105], [-80.91, 40.11]] },
      { path: [[-80.91, 40.11], [-80.93, 40.13]] },
    ]);
  });

  it("fails closed when the router drops a control point or omits road geometry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      code: "Ok",
      routes: [{ legs: [{ steps: [] }] }],
    }), { status: 200 })));

    await expect(requestFreeRoutePreview(origin, [anchor], destination)).rejects.toThrow(/control point/i);
  });
});
