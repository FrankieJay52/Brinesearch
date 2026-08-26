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
    expect(html).toContain("Navigate approved route");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toContain("Copy GPS");
  });

  it("keeps a GPS-pin fallback explicitly separate from approved route authority", () => {
    const pinUrl = "https://www.google.com/maps/search/?api=1&query=40.25403%2C-80.913577";
    const html = renderToStaticMarkup(createElement(MapDestinationPinLink, { pinUrl, padName: "BANNOCK" }));

    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain(`href="${pinUrl.replaceAll("&", "&amp;")}"`);
    expect(html).toContain("Open GPS pin");
    expect(html).toContain("Not an approved route");
    expect(html).not.toContain("Navigate approved route");
    expect(html).not.toContain("/maps/dir/");
  });
});
