import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./OwnerGoogleVerifyMapPage.tsx", import.meta.url), "utf8");
const loaderSource = readFileSync(new URL("./googleMapsLoader.ts", import.meta.url), "utf8");
const pageCss = readFileSync(new URL("./owner-google-verify.css", import.meta.url), "utf8");

describe("owner Google verify map source contracts", () => {
  it("checks owner access before dynamically loading Google Maps", () => {
    const ownerGate = pageSource.indexOf('if (access.state !== "owner" || !pad || !destination || !mapHost.current) return;');
    const loaderCall = pageSource.indexOf('import("./googleMapsLoader").then(({ loadOwnerGoogleMaps }) => loadOwnerGoogleMaps())');

    expect(ownerGate).toBeGreaterThanOrEqual(0);
    expect(loaderCall).toBeGreaterThan(ownerGate);
  });

  it("starts a fresh, record-bound session when the verifier changes pads or authority", () => {
    expect(pageSource).toContain("<OwnerGoogleVerifyMapSession key={padId} padId={padId}/>");
    expect(pageSource).toContain('const verifierSessionKey = `${access.state === "owner" ? "owner" : "gated"}:${verifierRecordKey}`;');
    const resetStart = pageSource.indexOf("useEffect(() => {\n    invalidatePreview();");
    const resetEnd = pageSource.indexOf("}, [invalidatePreview, verifierSessionKey]);", resetStart);
    const resetSource = pageSource.slice(resetStart, resetEnd);
    expect(resetStart).toBeGreaterThanOrEqual(0);
    expect(resetEnd).toBeGreaterThan(resetStart);
    for (const reset of [
      "setOrigin(null)", "setAnchor(null)", "setTurnPins([])", "setDraftId(\"\")",
      "setEntranceLatitude(\"\")", "setEntranceLongitude(\"\")",
    ]) expect(resetSource).toContain(reset);
  });

  it("uses only the V18 environment key and exposes the exact missing-key state", () => {
    expect(loaderSource).toContain('return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();');
    expect(loaderSource.match(/import\.meta\.env\.[A-Z0-9_]+/g)).toEqual(["import.meta.env.VITE_GOOGLE_MAPS_API_KEY"]);
    expect(loaderSource).toContain('if (!apiKey) return Promise.reject(new Error("Owner map not configured."));');
    expect(loaderSource).toContain("key: apiKey");
    expect(loaderSource).not.toMatch(/const\s+apiKey\s*=\s*["'][^"']+["']/);
    expect(pageSource).toContain('setMapMessage(notConfigured ? "Owner map not configured." : "Owner Google map could not start.");');
    expect(pageSource).toContain("Add VITE_GOOGLE_MAPS_API_KEY to the V18 environment. Never paste it into this page.");
  });

  it("routes phone origin through anchor and up to five ordered turn pins to the locked saved destination", () => {
    const routeStart = pageSource.indexOf("Route.computeRoutes({");
    const routeEnd = pageSource.indexOf("}).then(({ routes }) =>", routeStart);
    const routeRequest = pageSource.slice(routeStart, routeEnd);

    expect(routeStart).toBeGreaterThanOrEqual(0);
    expect(routeEnd).toBeGreaterThan(routeStart);
    expect(routeRequest).toContain("origin: googlePoint(origin)");
    expect(routeRequest).toContain("destination: googlePoint(destination)");
    expect(routeRequest).not.toContain("candidateEntrance");
    expect(routeRequest).toContain("intermediates: [anchor, ...turnPins].map");
    expect(routeRequest).toContain("optimizeWaypointOrder: false");
    expect(pageSource).toContain("const expectedLegCount = turnPins.length + 2;");
    expect(pageSource).toContain("addOwnerGoogleVerifyPoint(anchor, turnPins, point)");
    expect(pageSource).toContain("{turnPins.length} of {maximumOwnerGoogleVerifyTurnPins}");
  });

  it("selects and draws every exact approved road as a teal non-clickable reference overlay", () => {
    expect(pageSource).toContain('import { useCompanyRoads } from "@/data/CompanyRoadsContext";');
    expect(pageSource).toContain("const companyRoads = useCompanyRoads();");
    expect(pageSource).toContain('companyRoads.selection !== "all") companyRoads.selectRoads("all");');

    const overlayStart = pageSource.indexOf("const overlay = companyRoads.overlay;");
    const overlayEnd = pageSource.indexOf("}, [clearApprovedRoadOverlays, companyRoads.overlay, mapState]);", overlayStart);
    const overlaySource = pageSource.slice(overlayStart, overlayEnd);
    expect(overlayStart).toBeGreaterThanOrEqual(0);
    expect(overlayEnd).toBeGreaterThan(overlayStart);
    expect(overlaySource).toContain('overlay.selection !== "all"');
    expect(overlaySource).toContain("for (const row of overlay.rows)");
    expect(overlaySource).toContain('strokeColor: "#14b8a6"');
    expect(overlaySource).toContain("clickable: false");
    expect(overlaySource).not.toContain("addListener");
    expect(pageSource).toContain("<strong>All approved roads</strong>");
    expect(pageSource).toContain("Loading exact approved-road overlay…");
    expect(pageSource).toContain("exact approved road sections highlighted in teal.");
    expect(pageSource).toContain("Approved roads unavailable; nothing was inferred.");
  });

  it("adds every current pad-specific approved step geometry without filtering highways or state routes", () => {
    expect(pageSource).toContain('import { loadPadStatus } from "@/data/status";');
    expect(pageSource).toContain("ownerGoogleVerifyApprovedStepRoutes(status)");
    expect(pageSource).toContain("loadedApprovedStepRecordKey === approvedStepRecordKey");
    expect(pageSource).toContain("for (const route of approvedStepRoutes)");
    expect(pageSource).toContain("for (const feature of route.geometry.features)");
    expect(pageSource).toContain('strokeColor: "#2dd4bf"');
    expect(pageSource).toContain("clickable: false");
    expect(pageSource).toContain("Interstates, U.S. routes, state routes, county, township, and local roads are all included when present.");
    expect(pageSource).toContain("No current exact approved step geometry is available for this pad; no line was inferred.");
  });

  it("captures optional draft-only entrance coordinates without changing the route destination", () => {
    expect(pageSource).toContain("const [entranceLatitude, setEntranceLatitude] = useState(\"\");");
    expect(pageSource).toContain("const [entranceLongitude, setEntranceLongitude] = useState(\"\");");
    expect(pageSource).toContain("<legend>Candidate entrance coordinates</legend>");
    expect(pageSource).toContain('aria-label="Candidate entrance latitude"');
    expect(pageSource).toContain('aria-label="Candidate entrance longitude"');
    expect(pageSource).toContain("Optional owner-entered draft point. It is shown in purple and never replaces the locked saved pad GPS or driver Navigate.");
    expect(pageSource).toContain("candidateEntrance: parsedCandidateEntrance.point");
    expect(pageSource).toContain("candidateEntrancePoint && { point: candidateEntrancePoint, color: \"#c084fc\", radius: 13 }");

    const routeStart = pageSource.indexOf("Route.computeRoutes({");
    const routeEnd = pageSource.indexOf("}).then(({ routes }) =>", routeStart);
    const routeRequest = pageSource.slice(routeStart, routeEnd);
    expect(routeRequest).toContain("destination: googlePoint(destination)");
    expect(routeRequest).not.toMatch(/candidateEntrance|entranceLatitude|entranceLongitude/);
  });

  it("keeps results draft-only and uses phone geolocation without a console or Cadiz fallback origin", () => {
    expect(pageSource).toContain('<div className="owner-draft-banner"><Icon name="control"/><strong>Draft only — driver Navigate unchanged.</strong></div>');
    expect(pageSource).toContain('setSaveMessage("Draft saved on this device. Driver Navigate is unchanged.");');
    expect(pageSource).toContain("const nextOrigin = { latitude: position.coords.latitude, longitude: position.coords.longitude };");
    expect(pageSource).toContain("origin: googlePoint(origin)");
    expect(pageSource).toContain("Cadiz or another fallback origin will never be used.");
    expect(pageSource).not.toMatch(/setOrigin\(\{\s*latitude:\s*-?\d/);
    expect(pageSource).not.toMatch(/\b(?:cadizOrigin|fallbackOrigin)\b/i);
    expect(`${pageSource}\n${loaderSource}`).not.toMatch(/\bconsole\./);
  });

  it("reserves an uncovered Google attribution edge below the map controls", () => {
    expect(pageCss).toMatch(/\.owner-google-verify-map\s*\{[^}]*inset:\s*0 0 118px;/s);
    expect(pageCss).toContain("Keep Google's logo, attribution, and legal links inside an uncovered map");
    expect(pageCss).toMatch(/details\[open\][^{]*\.owner-google-verify-map\s*\{[^}]*bottom:\s*calc\(min\(45dvh, 360px\) \+ 112px\);/s);
  });
});
