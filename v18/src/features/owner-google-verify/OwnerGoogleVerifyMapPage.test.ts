import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const normalizedSource = (url: URL) => readFileSync(url, "utf8").replace(/\r\n/g, "\n");
const pageSource = normalizedSource(new URL("./OwnerGoogleVerifyMapPage.tsx", import.meta.url));
const routeSource = normalizedSource(new URL("./freeRoutePreview.ts", import.meta.url));
const pageCss = normalizedSource(new URL("./owner-google-verify.css", import.meta.url));

describe("owner free route verify map source contracts", () => {
  it("checks owner access before starting the free MapLibre map", () => {
    const ownerGate = pageSource.indexOf('if (access.state !== "owner" || !pad || !destination || !mapHost.current) return;');
    const mapStart = pageSource.indexOf("map = new MapLibreMap({");
    expect(ownerGate).toBeGreaterThanOrEqual(0);
    expect(mapStart).toBeGreaterThan(ownerGate);
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
      "setAnchor(null)", "setTurnPins([])", "setDraftId(\"\")",
      "setEntranceLatitude(\"\")", "setEntranceLongitude(\"\")",
    ]) expect(resetSource).toContain(reset);
  });

  it("uses no Google Maps loader, paid API key, or hidden routing credential", () => {
    expect(pageSource).toContain('style: ownerRoadBasemapStyle("road")');
    expect(pageSource).toContain("No Google key or paid map account is used here.");
    expect(routeSource).toContain('freeRoutePreviewEndpoint = "https://router.project-osrm.org/route/v1/driving"');
    expect(`${pageSource}\n${routeSource}`).not.toMatch(/VITE_GOOGLE_MAPS_API_KEY|maps\.googleapis\.com|routes\.googleapis\.com/);
    expect(routeSource).not.toMatch(/api[_-]?key|access[_-]?token|bearer/i);
  });

  it("starts at the anchor, preserves ordered turn pins, and locks the saved pad destination", () => {
    expect(pageSource).toContain("requestFreeRoutePreview(anchor, turnPins, destination, controller.signal)");
    expect(pageSource).toContain("const expectedLegCount = turnPins.length + 1;");
    expect(pageSource).toContain("addOwnerGoogleVerifyPoint(anchor, turnPins, point)");
    expect(pageSource).toContain("{turnPins.length} of {maximumOwnerGoogleVerifyTurnPins}");
    const routeCall = pageSource.slice(
      pageSource.indexOf("requestFreeRoutePreview(anchor"),
      pageSource.indexOf(".then((legs)", pageSource.indexOf("requestFreeRoutePreview(anchor")),
    );
    expect(routeCall).not.toMatch(/candidateEntrance|entranceLatitude|entranceLongitude/);
    expect(pageSource).toContain("The anchor is the starting point.");
    expect(pageSource).toContain("This owner map never requests or uses phone GPS.");
    expect(pageSource).not.toMatch(/navigator\.geolocation|getCurrentPosition|Use phone GPS|setOrigin\(/);
    expect(routeSource).toContain('alternatives: "3"');
    expect(routeSource).toContain("candidate.distanceMeters < shortest.distanceMeters");
  });

  it("draws every reviewed public-road reference in teal without turning display into authority", () => {
    expect(pageSource).toContain('companyRoads.selection !== "all") companyRoads.selectRoads("all");');
    expect(pageSource).toContain("features: overlay.rows.map((row)");
    expect(pageSource).toContain('"line-color": "#14b8a6"');
    expect(pageSource).toContain("<strong>Public road reference overlay</strong>");
    expect(pageSource).toContain("reviewed public-road sections shown as references.");
    expect(pageSource).toContain("Public-road references unavailable; nothing was inferred.");
  });

  it("adds selected-pad reviewed named-road geometry with an extra-bright teal casing", () => {
    expect(pageSource).toContain("ownerGoogleVerifyNamedRoadRoutes(status)");
    expect(pageSource).toContain("features: approvedStepRoutes.flatMap");
    expect(pageSource).toContain('"line-color": "#2dd4bf"');
    expect(pageSource).toContain("Teal is display only; State-1 graph/public-Google authority is separate.");
    expect(pageSource).toContain("No reviewed named-road display geometry is available for this pad; no line was inferred.");
    expect(pageSource).toContain(">Approve named road</button>");
    expect(pageSource).toContain(">Wrong road</button>");
    expect(pageSource).toContain("<strong>Review and approve</strong>");
    expect(pageSource).toContain("Every route section is approved for this draft");
  });

  it("captures optional draft-only entrance coordinates without changing the route destination", () => {
    expect(pageSource).toContain("<legend>Candidate entrance coordinates</legend>");
    expect(pageSource).toContain('aria-label="Candidate entrance latitude"');
    expect(pageSource).toContain('aria-label="Candidate entrance longitude"');
    expect(pageSource).toContain("candidateEntrance: parsedCandidateEntrance.point");
    expect(pageSource).toContain('candidateEntrancePoint && { point: candidateEntrancePoint, color: "#a855f7", label: "E"');
    expect(pageSource).toContain("requestFreeRoutePreview(anchor, turnPins, destination, controller.signal)");
  });

  it("keeps results draft-only and never introduces a phone or fallback starting point", () => {
    expect(pageSource).toContain("<strong>Draft only — driver Navigate unchanged.</strong>");
    expect(pageSource).toContain('setSaveMessage("Draft saved on this device. Driver Navigate is unchanged.");');
    expect(pageSource).not.toMatch(/navigator\.geolocation|getCurrentPosition|setOrigin\(|Current phone GPS|label: "YOU"/);
    expect(`${pageSource}\n${routeSource}`).not.toMatch(/\bconsole\./);
  });

  it("keeps the setup and draft panels controlled, mutually exclusive, and collapsed by default", () => {
    expect(pageSource).toContain("const [workflowOpen, setWorkflowOpen] = useState(false);");
    expect(pageSource).toContain("const [draftPanelOpen, setDraftPanelOpen] = useState(false);");
    expect(pageSource).toMatch(/function toggleWorkflowPanel\(\)[\s\S]*?setDraftPanelOpen\(false\);[\s\S]*?setSelectedSectionId\(""\);/);
    expect(pageSource).toMatch(/function toggleDraftPanel\(\)[\s\S]*?setWorkflowOpen\(false\);[\s\S]*?setSelectedSectionId\(""\);/);
    expect(pageSource).toContain('{workflowOpen && <div id="owner-google-workflow-content"');
    expect(pageSource).toContain('{draftPanelOpen && <div id="owner-google-draft-content"');
  });

  it("keeps the map full-height with free-map attribution and mobile controls uncovered", () => {
    expect(pageCss).toMatch(/\.owner-google-verify-map\s*\{[^}]*inset:\s*0;/s);
    expect(pageCss).toContain("the free map attribution stays");
    expect(pageCss).toContain(".owner-google-verify-map .maplibregl-ctrl-bottom-right");
    expect(pageCss).toContain(".owner-free-map-marker");
    expect(pageCss).toMatch(/\.owner-google-draft-panel\s*\{[^}]*bottom:\s*max\(38px,/s);
  });

  it("returns Back to Approved Roads and keeps pad, movable anchor, pins, and road labels obvious", () => {
    expect(pageSource).toContain('<Link to="/?view=roads" replace className="icon-button" aria-label="Back to Approved Roads map">');
    expect(pageSource).toContain('label: "A", title: "Named-road anchor — drag to move"');
    expect(pageSource).toContain('label: String(index + 1), title: `Turn pin ${index + 1} — drag to move`');
    expect(pageSource).toContain('draggable: Boolean(item.control)');
    expect(pageSource).toContain('marker.on("dragend"');
    expect(pageCss).toContain(".owner-free-map-marker.is-draggable");
    expect(pageSource).toContain('label: "PAD", title: `${pad.padName} — saved pad GPS`');
    expect(pageSource).toContain('aria-label={`Find ${pad.padName} saved pad GPS`}');
    expect(pageSource).toContain('map.easeTo({ center: mapPoint(destination), zoom: 16, duration: 260 });');
    expect(pageSource).toContain('{ top: 180, right: 24, bottom: 136, left: 24 }');
    expect(pageSource).toContain('value === "satellite" ? "road" : "satellite"');
  });
});
