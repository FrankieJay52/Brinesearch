import { afterEach, describe, expect, it, vi } from "vitest";
import { freeRoutePreviewUrl, requestFreeRoutePreview } from "./freeRoutePreview";

const anchor = { latitude: 40.11, longitude: -80.91 };
const turn = { latitude: 40.12, longitude: -80.92 };
const destination = { latitude: 40.13, longitude: -80.93 };

afterEach(() => vi.unstubAllGlobals());

describe("free owner route preview", () => {
  it("requests up to three road alternatives between two owner control points without a key", () => {
    const url = new URL(freeRoutePreviewUrl(anchor, turn));
    expect(url.origin).toBe("https://router.project-osrm.org");
    expect(url.pathname).toContain("-80.9100000,40.1100000;-80.9200000,40.1200000");
    expect(url.searchParams.get("alternatives")).toBe("3");
    expect(url.searchParams.get("steps")).toBe("true");
    expect(url.searchParams.get("geometries")).toBe("geojson");
    expect(url.searchParams.get("continue_straight")).toBe("true");
    expect(url.search).not.toMatch(/key|token/i);
  });

  it("starts at the anchor and chooses the shortest returned road alternative for every section", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const secondSection = String(input).includes("-80.9200000,40.1200000;-80.9300000,40.1300000");
      const start = secondSection ? [-80.92, 40.12] : [-80.91, 40.11];
      const middle = secondSection ? [-80.925, 40.125] : [-80.915, 40.115];
      const end = secondSection ? [-80.93, 40.13] : [-80.92, 40.12];
      return new Response(JSON.stringify({
        code: "Ok",
        routes: [
          { distance: 2400, legs: [{ steps: [{ geometry: { type: "LineString", coordinates: [start, [-80.8, 40.2], end] } }] }] },
          { distance: 900, legs: [{ steps: [
            { geometry: { type: "LineString", coordinates: [start, middle] } },
            { geometry: { type: "LineString", coordinates: [middle, end] } },
          ] }] },
        ],
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestFreeRoutePreview(anchor, [turn], destination)).resolves.toEqual([
      { distanceMeters: 900, routingMode: "road", path: [[-80.91, 40.11], [-80.915, 40.115], [-80.92, 40.12]] },
      { distanceMeters: 900, routingMode: "road", path: [[-80.92, 40.12], [-80.925, 40.125], [-80.93, 40.13]] },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("-80.9100000,40.1100000;-80.9200000,40.1200000");
    expect(String(fetchMock.mock.calls[1][0])).toContain("-80.9200000,40.1200000;-80.9300000,40.1300000");
  });

  it("uses the exact owner pins as a direct unmapped section instead of accepting a large loop", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      code: "Ok",
      routes: [{
        distance: 12_000,
        legs: [{ steps: [{ geometry: { type: "LineString", coordinates: [[-80.91, 40.11], [-81.02, 40.2], [-80.93, 40.13]] } }] }],
      }],
    }), { status: 200 })));

    const [leg] = await requestFreeRoutePreview(anchor, [], destination);
    expect(leg.routingMode).toBe("direct_unmapped");
    expect(leg.path).toEqual([[-80.91, 40.11], [-80.93, 40.13]]);
    expect(leg.distanceMeters).toBeGreaterThan(0);
    expect(leg.distanceMeters).toBeLessThan(12_000);
  });

  it("fails closed when every returned alternative omits usable road geometry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      code: "Ok",
      routes: [{ distance: 100, legs: [{ steps: [] }] }],
    }), { status: 200 })));

    await expect(requestFreeRoutePreview(anchor, [], destination)).rejects.toThrow(/geometry/i);
  });
});
