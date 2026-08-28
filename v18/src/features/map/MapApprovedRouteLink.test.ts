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
    expect(html).toContain("Navigate the reviewed approved route to COLOGIE in Google Maps");
    expect(html).not.toContain("<small");
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
      detail: "Approved roads to the handoff, then GPS-only final leg; final GPS leg is not approved road geometry",
    }));

    expect(html).toContain("GET DIRECTIONS");
    expect(html).not.toContain("Via Freeport · Approved roads");
    expect(html).toContain("GPS-only final leg");
    expect(html).toContain("final GPS leg is not approved road geometry");
    expect(html).toContain("use only its reviewed BrineSearch controls");
    expect(html).not.toContain("<small");
    expect(html.match(/<a\b/g)).toHaveLength(1);
  });

  it("keeps GPS-only navigation explicitly separate from approved route authority", () => {
    const pinUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.25403%2C-80.913577";
    const html = renderToStaticMarkup(createElement(MapDestinationPinLink, { pinUrl, padName: "BANNOCK", sourceLabel: "Saved pad GPS" }));

    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain(`href="${pinUrl.replaceAll("&", "&amp;")}"`);
    expect(html).toContain(">GET DIRECTIONS<");
    expect(html).toContain("GPS destination only");
    expect(html).toContain("saved pad gps");
    expect(html).toContain("not an approved route");
    expect(html).not.toContain("<small");
  });

  it("labels an owner-reviewed candidate without claiming public or graph approval", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.08738445%2C-81.30282620";
    const html = renderToStaticMarkup(createElement(MapReviewedRouteLink, { routeUrl, padName: "BILINOVICH" }));

    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain("Owner-reviewed Google directions");
    expect(html).toContain("graph route lines, public Google release, and approved-road overlays remain separate");
    expect(html).not.toContain("<small");
    expect(html).not.toContain("Approved route");
    expect(html).not.toContain("Google ready");
  });

  it("labels an explicit owner-approved direction handoff without creating route-line authority", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.185403%2C-80.922718&waypoints=40.1869745925099%2C-80.9192177275288";
    const html = renderToStaticMarkup(createElement(MapReviewedRouteLink, {
      routeUrl,
      padName: "BEETLE",
      detail: "OH-519 → Sixteen Rd → GPS handoff",
      ownerApproval: {
        kind: "owner_approved_directions",
        evidence: "exact_named_road_identities",
        approvedAt: "2026-08-28",
      },
    }));

    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain("GET DIRECTIONS");
    expect(html).toContain("owner-approved named-road directions for BEETLE");
    expect(html).toContain("graph route lines, public Google release, and approved-road overlays remain separate");
    expect(html).not.toContain("Google ready");
    expect(html).not.toContain("<small");
  });

  it("renders candidate-specific held-graph wording", () => {
    const routeUrl = "https://www.google.com/maps/dir/?api=1&destination=40.124991%2C-81.295913";
    const html = renderToStaticMarkup(createElement(MapReviewedRouteLink, {
      routeUrl,
      padName: "LAWSON",
      detail: "Reviewed road core → saved GPS · graph status separate",
    }));

    expect(html).toContain("GET DIRECTIONS");
    expect(html).toContain("Reviewed road core → saved GPS · graph status separate");
    expect(html).toContain("graph route lines, public Google release, and approved-road overlays remain separate");
    expect(html).not.toContain("Approved route");
    expect(html).not.toContain("<small");
  });
});
