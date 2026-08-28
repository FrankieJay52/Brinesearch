import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapApprovedRouteLink, MapDestinationPinLink, MapReviewedRouteLink } from "./MapApprovedRouteLink";

describe("map approved route link", () => {
  it("renders exactly one clearly labelled reviewed Google handoff", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.25403%2C-80.913577";
    const html = renderToStaticMarkup(createElement(MapApprovedRouteLink, { routeUrl, padName: "COLOGIE" }));

    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain(`href="${routeUrl.replaceAll("&", "&amp;")}"`);
    expect(html).toContain(">GET DIRECTIONS<");
    expect(html).toContain("Reviewed approved route");
    expect(html).not.toContain("reviewed reviewed");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toContain("Copy GPS");
  });

  it("uses the server-provided approach label and keeps the GPS-only final leg explicit", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.22914%2C-81.151012&waypoints=40.2273687%2C-81.2472549";
    const html = renderToStaticMarkup(createElement(MapApprovedRouteLink, {
      routeUrl,
      padName: "SPROULL",
      approachLabel: "Via Freeport",
      detail: "Approved roads then GPS",
    }));

    expect(html).toContain("GET DIRECTIONS");
    expect(html).toContain("Via Freeport · Approved roads then GPS");
    expect(html).toContain("using only its reviewed BrineSearch controls");
    expect(html.match(/<a\b/g)).toHaveLength(1);
  });

  it("keeps GPS-only navigation explicitly separate from approved route authority", () => {
    const pinUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.25403%2C-80.913577";
    const html = renderToStaticMarkup(createElement(MapDestinationPinLink, { pinUrl, padName: "BANNOCK", sourceLabel: "Saved pad GPS" }));

    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain(`href="${pinUrl.replaceAll("&", "&amp;")}"`);
    expect(html).toContain(">GET DIRECTIONS<");
    expect(html).toContain("GPS destination only");
    expect(html).toContain("GPS destination only · Saved pad GPS");
    expect(html).toContain("saved pad gps");
    expect(html).toContain("not an approved route");
  });

  it("labels an owner-reviewed candidate without claiming public or graph approval", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.08738445%2C-81.30282620";
    const html = renderToStaticMarkup(createElement(MapReviewedRouteLink, { routeUrl, padName: "BILINOVICH" }));

    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain("Owner-reviewed route in Google Maps · Owner-reviewed Google directions");
    expect(html).toContain("exact graph and public Google authority remain separate");
    expect(html).not.toContain("Approved route");
    expect(html).not.toContain("Google ready");
  });

  it("renders candidate-specific held-graph wording", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&destination=40.124991%2C-81.295913";
    const html = renderToStaticMarkup(createElement(MapReviewedRouteLink, {
      routeUrl,
      padName: "LAWSON",
      detail: "Reviewed road core → saved GPS · graph status separate",
    }));

    expect(html).toContain("GET DIRECTIONS");
    expect(html).toContain("Owner-reviewed route in Google Maps · Reviewed road core");
    expect(html).toContain("Reviewed road core → saved GPS · graph status separate");
    expect(html).toContain("exact graph and public Google authority remain separate");
    expect(html).not.toContain("Approved route");
  });
});
