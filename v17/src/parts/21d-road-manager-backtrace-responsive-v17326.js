    /* BrineSearch V17.3.26 — responsive backward trace.
       Show Road Manager geometry immediately, then use a short, bounded OSM
       fallback only for roads still missing. Never leave the Owner UI stuck on
       "Tracing roads…" because an external map service is slow or unavailable. */

    const ROUTE_BACKTRACE_EXTERNAL_TIMEOUT_MS_V17326 = 6500;
    const ROUTE_BACKTRACE_EXTERNAL_MAX_TOKENS_V17326 = 8;

    routeBacktraceOverpassV17325 = async function routeBacktraceOverpassBoundedV17326(tokens, coords) {
      if (!tokens?.length || !coords) return [];
      const queryTokens = tokens.slice(0, ROUTE_BACKTRACE_EXTERNAL_MAX_TOKENS_V17326);
      const statements = queryTokens.map(token => {
        const pattern = routeBacktraceOverpassPatternV17325(token.label);
        return `way(around:${ROUTE_BACKTRACE_RADIUS_M_V17325},${coords.lat},${coords.lng})["highway"]["name"~"${pattern}",i];way(around:${ROUTE_BACKTRACE_RADIUS_M_V17325},${coords.lat},${coords.lng})["highway"]["ref"~"${pattern}",i];`;
      }).join("");
      const query = `[out:json][timeout:6];(${statements});out tags geom;`;
      const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try { controller.abort(); } catch {}
      }, ROUTE_BACKTRACE_EXTERNAL_TIMEOUT_MS_V17326);
      try {
        const requests = endpoints.map(async endpoint => {
          const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal: controller.signal
          });
          if (!response.ok) throw new Error(`Map road lookup returned ${response.status}`);
          const data = await response.json();
          if (!Array.isArray(data?.elements)) throw new Error("Map road lookup returned no road data");
          return data.elements;
        });
        return await Promise.any(requests);
      } catch (error) {
        if (timedOut || error?.name === "AbortError") throw new Error("Map road lookup timed out");
        throw new Error(error?.message || "Map road lookup unavailable");
      } finally {
        clearTimeout(timer);
        try { controller.abort(); } catch {}
      }
    };

    function routeBacktraceMissingRoadTokensV17326(roadTokens, selected) {
      return roadTokens.filter(token => {
        const row = (selected || []).find(item => item?.token?.label === token.label);
        return !row?.matched;
      });
    }

    function routeBacktraceMatchedCountV17326(selected) {
      return (selected || []).filter(row => row?.matched).length;
    }

    routeBacktraceRunV17325 = async function routeBacktraceRunResponsiveV17326() {
      const button = document.getElementById("routeBacktraceRunV17325");
      const pad = routeMapperSelectedPadV17324;
      const coords = routeMapperPadCoordinateV17324(pad);
      if (!button) return;
      if (!pad || !coords) { showToast("This pad needs a verified or saved GPS point first"); return; }

      const tokens = routeBacktraceRoadTokensV17325(pad);
      const roadTokens = tokens.filter(token => token.kind === "road");
      if (!roadTokens.length) { showToast("No usable primary road sequence is saved for this pad"); return; }

      const cacheKey = `${routeMapperLegacyIdV17324(pad)}|${roadTokens.map(token => token.label).join("|")}`;
      button.disabled = true;
      button.textContent = "Checking Road Manager…";

      try {
        const cached = routeBacktraceMemoryV17325.get(cacheKey);
        if (cached) {
          routeBacktraceRenderV17325(cached);
          const matched = routeBacktraceMatchedCountV17326(cached.selected);
          showToast(matched ? `Highlighted ${matched} saved-route road${matched === 1 ? "" : "s"} backward from the pad` : "No saved-route road geometry could be matched");
          return;
        }

        let roads = Array.isArray(roadManagerRows) && roadManagerRows.length ? roadManagerRows : [];
        if (!roads.length) roads = await fetchRoads("", 500);

        // First paint: local Road Manager geometry only. The Owner sees useful
        // results immediately and never waits on an external map service before
        // the highlight/status panel appears.
        let selected = routeBacktraceBuildTraceV17325(tokens, roads, [], coords);
        let result = { tokens, selected };
        routeBacktraceRenderV17325(result);

        const initialMatched = routeBacktraceMatchedCountV17326(selected);
        const missingTokens = routeBacktraceMissingRoadTokensV17326(roadTokens, selected);
        if (!missingTokens.length) {
          routeBacktraceMemoryV17325.set(cacheKey, result);
          showToast(`Highlighted ${initialMatched} saved-route road${initialMatched === 1 ? "" : "s"} from Road Manager`);
          return;
        }

        button.textContent = "Checking map for missing roads…";
        try {
          const osmElements = await routeBacktraceOverpassV17325(missingTokens, coords);
          if (osmElements.length) {
            const enriched = routeBacktraceBuildTraceV17325(tokens, roads, osmElements, coords);
            if (routeBacktraceMatchedCountV17326(enriched) >= initialMatched) {
              selected = enriched;
              result = { tokens, selected };
              routeBacktraceRenderV17325(result);
            }
          }
          routeBacktraceMemoryV17325.set(cacheKey, result);
          const finalMatched = routeBacktraceMatchedCountV17326(result.selected);
          showToast(finalMatched ? `Highlighted ${finalMatched} saved-route road${finalMatched === 1 ? "" : "s"} backward from the pad` : "No saved-route road geometry could be matched");
        } catch (error) {
          console.warn("OSM backward trace fallback unavailable", error);
          const visible = routeBacktraceMatchedCountV17326(result.selected);
          showToast(visible
            ? `${visible} Road Manager road${visible === 1 ? "" : "s"} highlighted; external map lookup stopped`
            : "External map lookup stopped; no verified road geometry was available");
        }
      } catch (error) {
        showToast(error?.message || "Could not trace this route");
      } finally {
        button.disabled = false;
        button.textContent = "Highlight route backward";
      }
    };

    window.routeBacktraceExternalTimeoutV17326 = ROUTE_BACKTRACE_EXTERNAL_TIMEOUT_MS_V17326;
