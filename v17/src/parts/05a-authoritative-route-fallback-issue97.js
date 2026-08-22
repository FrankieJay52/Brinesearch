    /* GitHub #97 — an authoritative route request may never degrade into an
       unverified point-to-point Google driving URL. Exact pad-pin access remains
       available on the pad page as a clearly labelled non-route fallback. */

    routeDirectionsUrl = function routeDirectionsUrlIssue97(_route, p) {
      const authoritative = googleMapsRouteChunks(p);
      return authoritative.length ? authoritative[0].url : "";
    };
