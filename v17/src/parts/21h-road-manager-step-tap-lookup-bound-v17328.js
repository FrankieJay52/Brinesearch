    /* V17.3.28 — strict tap lookup bound.
       Road Manager geometry remains first. If it cannot identify the tapped road,
       use only the two current global OSM Overpass endpoints and stop after the
       V17.3.28 timeout instead of falling through to an older second wait cycle. */

    routeInteractiveLookupRoadsV17327 = async function routeInteractiveLookupRoadsStrictBoundV17328(point) {
      const local = await routeStepLocalRoadCandidatesV17328(point);
      if (local.length) return local;
      const query = `[out:json][timeout:4];way(around:45,${point.lat},${point.lng})["highway"];out tags geom;`;
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; try { controller.abort(); } catch {} }, ROUTE_STEP_EXTERNAL_TIMEOUT_MS_V17328);
      const endpoints = ["https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"];
      try {
        const rows = await Promise.any(endpoints.map(async endpoint => {
          const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal: controller.signal
          });
          if (!response.ok) throw new Error(`Road lookup returned ${response.status}`);
          const data = await response.json();
          return Array.isArray(data?.elements) ? data.elements : [];
        }));
        return rows.filter(row => Array.isArray(row?.geometry) && row.geometry.length > 1)
          .map(row => ({ ...row, _distance: routeInteractiveDistanceToCandidateV17327(row, point) }))
          .sort((a, b) => a._distance - b._distance)
          .filter((row, index, all) => index === all.findIndex(other => routeInteractiveCandidateNameV17327(other) === routeInteractiveCandidateNameV17327(row)))
          .slice(0, 6);
      } catch (error) {
        throw new Error(timedOut || error?.name === "AbortError"
          ? "Road lookup timed out — use Find road or tap again"
          : (error?.message || "Road lookup unavailable — use Find road"));
      } finally {
        clearTimeout(timer);
        try { controller.abort(); } catch {}
      }
    };
