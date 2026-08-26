import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapApprovedRouteLink, MapDestinationPinLink } from "./MapApprovedRouteLink";

describe("map approved route link", () => {
  it("renders exactly one clearly labelled reviewed Google handoff", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.25403%2C-80.913577";
    const html = renderToStaticMarkup(createElement(MapApprovedRouteLink, { routeUrl, padName: "COLOGIE" }));

    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain(`href="${routeUrl.replaceAll("&", "&amp;")}"`);
    expect(html).toContain(">Navigate<");
    expect(html).toContain("Approved route");
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
      detail: "Approved roads to handoff · GPS-only final leg · not approved",
    }));

    expect(html).toContain("Navigate Via Freeport");
    expect(html).toContain("GPS-only final leg · not approved");
    expect(html).toContain("using only its reviewed BrineSearch controls");
    expect(html.match(/<a\b/g)).toHaveLength(1);
  });

  it("keeps GPS-only navigation explicitly separate from approved route authority", () => {
    const pinUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.25403%2C-80.913577";
    const html = renderToStaticMarkup(createElement(MapDestinationPinLink, { pinUrl, padName: "BANNOCK", sourceLabel: "Saved pad GPS" }));

    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain(`href="${pinUrl.replaceAll("&", "&amp;")}"`);
    expect(html).toContain(">Navigate<");
    expect(html).toContain("GPS destination only");
    expect(html).toContain("GPS destination only · Saved pad GPS");
    expect(html).toContain("saved pad gps");
    expect(html).toContain("not an approved route");
  });
});
