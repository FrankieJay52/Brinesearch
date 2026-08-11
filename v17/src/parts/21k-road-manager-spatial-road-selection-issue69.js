    /* GitHub #69 — spatial road identity guard for map taps.
       A tapped road must resolve by exact Road Manager record/source identity or
       by geographic support at the tapped geometry. Name similarity alone is
       never allowed to silently reuse a Road Manager road. */

    const ROUTE_ISSUE69_EXTERNAL_TIMEOUT_MS = 4200;
    const ROUTE_ISSUE69_SPATIAL_MATCH_MI = 0.02;

    function routeIssue69RoadKey(value) {
      return typeof roadNormalizeKey === "function"
        ? roadNormalizeKey(String(value || ""))
        : routeBacktraceRoadKeyV17325(String(value || ""));
    }

    function routeIssue69CompleteRoadGeometry(road) {
      return Boolean(road?.centerline_geojson)
        && ["official_centerline_loaded", "field_confirmed_centerline", "owner_verified_complete"]
          .includes(String(road?.geometry_status || ""));
    }

    function routeIssue69TapLocalCandidatePoint(candidate) {
      const line = routeInteractiveCandidateLineV17327(candidate);
      const tap = candidate?._tapPoint;
      if (!Array.isArray(line) || !line.length || !tap
          || !Number.isFinite(Number(tap.lng)) || !Number.isFinite(Number(tap.lat))) return null;
      return routeBacktraceClosestVertexV17325([Number(tap.lng), Number(tap.lat)], line)?.point || null;
    }

    function routeIssue69RoadSpatialDistance(road, candidate) {
      const sample = routeIssue69TapLocalCandidatePoint(candidate);
      const lines = routeBacktraceGeoLinesV17325(road?.centerline_geojson);
      if (!sample || !lines.length) return Infinity;
      let distance = Infinity;
      for (const line of lines) {
        const hit = routeBacktraceClosestVertexV17325(sample, line);
        if (Number.isFinite(hit?.distance)) distance = Math.min(distance, hit.distance);
      }
      return distance;
    }

    function routeIssue69RoadScopeCompatible(road) {
      // Exact tap-local geometry is authoritative. Pad jurisdiction text is not:
      // real approach routes cross county/state lines and production labels can
      // contain aliases or legacy misspellings.
      return Boolean(road) && !road?.candidate_only;
    }

    function routeIssue69ExactIdentityMatch(road, identity) {
      const candidateKeys = [identity?.canonical, ...(identity?.aliases || [])].map(routeIssue69RoadKey).filter(Boolean);
      const roadKeys = [road?.canonical_name, ...(road?.aliases || [])].map(routeIssue69RoadKey).filter(Boolean);
      return candidateKeys.some(key => roadKeys.includes(key));
    }

    async function routeIssue69AllRoads() {
      const cached = Array.isArray(roadManagerRows) ? roadManagerRows : [];
      try {
        const fresh = await fetchRoads("", 500);
        const merged = new Map(cached.map(road => [road?.id, road]).filter(([id]) => id));
        (fresh || []).forEach(road => { if (road?.id) merged.set(road.id, road); });
        const roads = Array.from(merged.values());
        if (roads.length) roadManagerRows = roads;
        return roads;
      } catch {
        return cached;
      }
    }

    function routeIssue69LocalRoadCandidates(point, roads) {
      const threshold = Math.max(0.015, Math.min(0.11, routeStepMilesPerPixelV17328(point) * 34));
      return (roads || [])
        .filter(road => road?.id && routeIssue69CompleteRoadGeometry(road) && !road?.candidate_only)
        .map(road => {
          const lines = routeBacktraceGeoLinesV17325(road.centerline_geojson);
          let distance = Infinity;
          for (const line of lines) {
            const hit = routeBacktraceClosestVertexV17325([point.lng, point.lat], line);
            if (Number.isFinite(hit?.distance)) distance = Math.min(distance, hit.distance);
          }
          return { road, distance };
        })
        .filter(match => Number.isFinite(match.distance) && match.distance <= threshold)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 12)
        .map(match => ({
          ...routeStepSyntheticCandidateV17328(match.road),
          _distance: match.distance,
          _tapPoint: { lng: Number(point.lng), lat: Number(point.lat) }
        }));
    }

    async function routeIssue69AttachTappedGeometry(road) {
      const name = road?.canonical_name || "This Road Manager road";
      throw new Error(`${name} has no complete Road Manager centerline. One tapped OSM way is only partial source geometry and cannot replace the canonical road. Keep this step unresolved and repair/enrich the road under #70.`);
    }

    routeInteractiveEnsureRoadRecordV17327 = async function routeInteractiveEnsureRoadSpatialIssue69(candidate) {
      if (candidate?._roadRecord?.id) return candidate._roadRecord;
      const identity = routeInteractiveCanonicalCandidateV17327(candidate);
      const roads = await routeIssue69AllRoads();
      const sourceId = candidate?.id ? String(candidate.id) : "";

      // Exact source identity wins. This is not a name match.
      if (sourceId) {
        const sourceMatches = roads.filter(road => String(road?.source_record_id || "") === sourceId && routeIssue69RoadScopeCompatible(road));
        const completeSourceMatches = sourceMatches.filter(routeIssue69CompleteRoadGeometry);
        if (completeSourceMatches.length === 1 && sourceMatches.length === 1) return completeSourceMatches[0];
        if (sourceMatches.length > 1) throw new Error("Multiple Road Manager records share this source geometry ID. Resolve the duplicate road records first.");
        if (sourceMatches.length === 1) {
          throw new Error("This Road Manager road has only partial or unverified centerline coverage. Keep the #69 step unresolved and complete its geometry under #70.");
        }
      }

      // Spatial support comes before naming. Only Road Manager geometries under
      // the tapped OSM geometry are candidates for silent reuse.
      const spatial = roads
        .filter(road => routeIssue69RoadScopeCompatible(road) && routeIssue69CompleteRoadGeometry(road))
        .map(road => ({ road, distance: routeIssue69RoadSpatialDistance(road, candidate) }))
        .filter(match => Number.isFinite(match.distance) && match.distance <= ROUTE_ISSUE69_SPATIAL_MATCH_MI)
        .sort((a, b) => a.distance - b.distance);
      if (spatial.length === 1) return spatial[0].road;
      if (spatial.length > 1) {
        const exactSpatial = spatial.filter(match => routeIssue69ExactIdentityMatch(match.road, identity));
        if (exactSpatial.length === 1) return exactSpatial[0].road;
        throw new Error("More than one Road Manager road is spatially valid at this tap. Choose the existing road explicitly in Find road instead of guessing.");
      }

      // A unique exact scoped identity with no centerline is still unresolved.
      // One OSM way does not prove full canonical-road coverage and must never
      // overwrite the Road Manager centerline.
      const exactIdentity = roads.filter(road => routeIssue69RoadScopeCompatible(road) && routeIssue69ExactIdentityMatch(road, identity));
      const withoutGeometry = exactIdentity.filter(road => !road?.centerline_geojson);
      if (withoutGeometry.length === 1 && exactIdentity.length === 1) {
        return routeIssue69AttachTappedGeometry(withoutGeometry[0]);
      }
      if (exactIdentity.length > 0) {
        throw new Error("This road name already exists in Road Manager but the tapped geometry does not uniquely identify that record. Open Find road and choose/repair it explicitly.");
      }
      throw new Error("This tapped OSM way is not linked to a publishable Road Manager road. A single way cannot create complete canonical-road coverage. Add/repair the road under #70, then reload it here; this #69 step remains unresolved.");
    };

    // V17.3.28 deduped nearby OSM ways by display name. That can erase a
    // separate same-name physical road. Keep individual OSM way identities.
    routeInteractiveLookupRoadsV17327 = async function routeInteractiveLookupRoadsSpatialIssue69(point) {
      const completeRoadInventory = await routeIssue69AllRoads();
      const local = routeIssue69LocalRoadCandidates(point, completeRoadInventory);
      if (local.length) return local;
      const query = `[out:json][timeout:4];way(around:45,${point.lat},${point.lng})["highway"];out tags geom;`;
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; try { controller.abort(); } catch {} }, ROUTE_ISSUE69_EXTERNAL_TIMEOUT_MS);
      const endpoints = ["https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"];
      try {
        const rows = await Promise.any(endpoints.map(async endpoint => {
          const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
            headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal
          });
          if (!response.ok) throw new Error(`Road lookup returned ${response.status}`);
          const data = await response.json();
          return Array.isArray(data?.elements) ? data.elements : [];
        }));
        return rows
          .filter(row => Array.isArray(row?.geometry) && row.geometry.length > 1)
          .map(row => ({
            ...row,
            _distance: routeInteractiveDistanceToCandidateV17327(row, point),
            _tapPoint: { lng: Number(point.lng), lat: Number(point.lat) }
          }))
          .sort((a, b) => a._distance - b._distance)
          .filter((row, index, all) => index === all.findIndex(other => String(other?.id || "") === String(row?.id || "")))
          .slice(0, 8);
      } catch (error) {
        throw new Error(timedOut || error?.name === "AbortError"
          ? "Road lookup timed out — use Find road or tap again"
          : (error?.message || "Road lookup unavailable"));
      } finally {
        clearTimeout(timer);
        try { controller.abort(); } catch {}
      }
    };

    window.routeIssue69RoadSpatialDistance = routeIssue69RoadSpatialDistance;
