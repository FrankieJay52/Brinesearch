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

    function routeIssue69CandidateSamples(candidate) {
      const line = routeInteractiveCandidateLineV17327(candidate);
      if (!Array.isArray(line) || !line.length) return [];
      const indexes = Array.from(new Set([0, Math.floor((line.length - 1) / 2), line.length - 1]));
      return indexes.map(index => line[index]).filter(point => Array.isArray(point) && point.length >= 2);
    }

    function routeIssue69RoadSpatialDistance(road, candidate) {
      const samples = routeIssue69CandidateSamples(candidate);
      const lines = routeBacktraceGeoLinesV17325(road?.centerline_geojson);
      if (!samples.length || !lines.length) return Infinity;
      let distance = Infinity;
      for (const sample of samples) {
        for (const line of lines) {
          const hit = routeBacktraceClosestVertexV17325(sample, line);
          if (Number.isFinite(hit?.distance)) distance = Math.min(distance, hit.distance);
        }
      }
      return distance;
    }

    function routeIssue69RoadScopeCompatible(road, identity, pad) {
      if (!road) return false;
      if (identity?.roadType && road.road_type && identity.roadType !== road.road_type) return false;
      const candidateState = routeMapperStateCodeV17324(identity?.state || pad?.state);
      const roadState = routeMapperStateCodeV17324(road?.state);
      if (candidateState && roadState && candidateState !== roadState) return false;
      if (["county", "township", "local", "access"].includes(identity?.roadType)) {
        const padCounty = normalize(pad?.county || "").toLowerCase();
        const roadCounty = normalize(road?.county || "").toLowerCase();
        if (padCounty && roadCounty && padCounty !== roadCounty) return false;
      }
      return !road?.candidate_only;
    }

    function routeIssue69ExactIdentityMatch(road, identity) {
      const candidateKeys = [identity?.canonical, ...(identity?.aliases || [])].map(routeIssue69RoadKey).filter(Boolean);
      const roadKeys = [road?.canonical_name, ...(road?.aliases || [])].map(routeIssue69RoadKey).filter(Boolean);
      return candidateKeys.some(key => roadKeys.includes(key));
    }

    async function routeIssue69AllRoads() {
      let roads = Array.isArray(roadManagerRows) && roadManagerRows.length ? roadManagerRows : [];
      if (!roads.length) {
        try { roads = await fetchRoads("", 500); }
        catch { roads = []; }
      }
      return roads;
    }

    async function routeIssue69AttachTappedGeometry(road, candidate, identity, roads) {
      const line = routeInteractiveCandidateLineV17327(candidate);
      if (!road?.id || !Array.isArray(line) || line.length < 2) return road;
      const now = new Date().toISOString();
      const sourceId = candidate?.id ? String(candidate.id) : null;
      const patch = {
        centerline_geojson: { type: "LineString", coordinates: line },
        geometry_status: "map_loaded",
        geometry_checked_at: now,
        verification_status: road.verification_status === "verified" ? "verified" : "map_match",
        source_method: "owner_map_tap_issue69",
        candidate_basis: {
          method: "owner_map_tap_issue69",
          pad_id: routeMapperPadIdV17324(routeMapperSelectedPadV17324) || null,
          explicit_owner_tap: true,
          prior_source_record_id: road.source_record_id || null
        }
      };
      if (!road.source_record_id && sourceId) {
        patch.source_agency = "OpenStreetMap";
        patch.source_dataset = "OSM way geometry";
        patch.source_record_id = sourceId;
        patch.source_url = /^\d+$/.test(sourceId) ? `https://www.openstreetmap.org/way/${sourceId}` : null;
      }
      const saved = await editorRequest(`/rest/v1/brinesearch_roads?id=eq.${encodeURIComponent(road.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch)
      });
      const updated = Array.isArray(saved) ? saved[0] : saved;
      if (!updated?.id) throw new Error("Road Manager did not confirm the tapped road geometry");
      roadManagerRows = (roads || []).map(row => row.id === updated.id ? updated : row);
      return updated;
    }

    routeInteractiveEnsureRoadRecordV17327 = async function routeInteractiveEnsureRoadSpatialIssue69(candidate) {
      if (candidate?._roadRecord?.id) return candidate._roadRecord;
      const identity = routeInteractiveCanonicalCandidateV17327(candidate);
      const pad = routeMapperSelectedPadV17324;
      const roads = await routeIssue69AllRoads();
      const sourceId = candidate?.id ? String(candidate.id) : "";

      // Exact source identity wins. This is not a name match.
      if (sourceId) {
        const sourceMatches = roads.filter(road => String(road?.source_record_id || "") === sourceId && routeIssue69RoadScopeCompatible(road, identity, pad));
        if (sourceMatches.length === 1) return sourceMatches[0];
        if (sourceMatches.length > 1) throw new Error("Multiple Road Manager records share this source geometry ID. Resolve the duplicate road records first.");
      }

      // Spatial support comes before naming. Only Road Manager geometries under
      // the tapped OSM geometry are candidates for silent reuse.
      const spatial = roads
        .filter(road => routeIssue69RoadScopeCompatible(road, identity, pad) && road?.centerline_geojson)
        .map(road => ({ road, distance: routeIssue69RoadSpatialDistance(road, candidate) }))
        .filter(match => Number.isFinite(match.distance) && match.distance <= ROUTE_ISSUE69_SPATIAL_MATCH_MI)
        .sort((a, b) => a.distance - b.distance);
      if (spatial.length === 1) return spatial[0].road;
      if (spatial.length > 1) {
        const exactSpatial = spatial.filter(match => routeIssue69ExactIdentityMatch(match.road, identity));
        if (exactSpatial.length === 1) return exactSpatial[0].road;
        throw new Error("More than one Road Manager road is spatially valid at this tap. Choose the existing road explicitly in Find road instead of guessing.");
      }

      // A unique exact scoped identity with no centerline may receive the exact
      // geometry the Owner just tapped. Ambiguous names are never auto-updated.
      const exactIdentity = roads.filter(road => routeIssue69RoadScopeCompatible(road, identity, pad) && routeIssue69ExactIdentityMatch(road, identity));
      const withoutGeometry = exactIdentity.filter(road => !road?.centerline_geojson);
      if (withoutGeometry.length === 1 && exactIdentity.length === 1) {
        return routeIssue69AttachTappedGeometry(withoutGeometry[0], candidate, identity, roads);
      }
      if (exactIdentity.length > 0) {
        throw new Error("This road name already exists in Road Manager but the tapped geometry does not uniquely identify that record. Open Find road and choose/repair it explicitly.");
      }

      const name = identity.canonical;
      const roadType = identity.roadType;
      const state = ["interstate", "us_route"].includes(roadType) ? null : routeMapperStateCodeV17324(pad?.state);
      const aliases = Array.from(new Set([candidate?.tags?.name, candidate?.tags?.ref].map(normalize).filter(value => value && value.toLowerCase() !== name.toLowerCase())));
      const routeNumber = normalize(candidate?.tags?.ref || "").match(/\d{1,4}(?:\/\d+)?/)?.[0] || null;
      const line = routeInteractiveCandidateLineV17327(candidate);
      if (!Array.isArray(line) || line.length < 2) throw new Error("Tapped road has no usable geometry");
      const body = {
        canonical_name: name,
        normalized_name: routeIssue69RoadKey(name),
        road_type: roadType,
        state,
        county: ["interstate", "us_route", "state_route"].includes(roadType) ? null : (pad?.county || null),
        township: ["interstate", "us_route", "state_route"].includes(roadType) ? null : (pad?.township || null),
        aliases,
        route_number: routeNumber,
        verification_status: "map_match",
        source_agency: "OpenStreetMap",
        source_dataset: "OSM way geometry",
        source_method: "owner_map_tap_issue69",
        source_url: sourceId && /^\d+$/.test(sourceId) ? `https://www.openstreetmap.org/way/${sourceId}` : null,
        source_record_id: sourceId || null,
        centerline_geojson: { type: "LineString", coordinates: line },
        geometry_status: "map_loaded",
        geometry_checked_at: new Date().toISOString(),
        candidate_only: false,
        candidate_basis: { method: "owner_map_tap_issue69", pad_id: routeMapperPadIdV17324(pad) || null, explicit_owner_tap: true },
        route_directions: [],
        coverage_states: state ? [state] : []
      };
      try {
        const saved = await editorRequest("/rest/v1/brinesearch_roads", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(body)
        });
        const road = Array.isArray(saved) ? saved[0] : saved;
        if (!road?.id) throw new Error("Road Manager did not return the selected road");
        roadManagerRows = [...roads, road];
        return road;
      } catch (error) {
        // Never fall back to fuzzy names after a write conflict. Recheck only the
        // exact external source ID; otherwise require explicit owner resolution.
        if (sourceId) {
          const sourceMatches = await editorRequest(`/rest/v1/brinesearch_roads?select=*&source_record_id=eq.${encodeURIComponent(sourceId)}&limit=2`, { method: "GET" }).catch(() => []);
          if (Array.isArray(sourceMatches) && sourceMatches.length === 1) return sourceMatches[0];
        }
        throw new Error(`${error?.message || "Could not save tapped road"}. BrineSearch did not fall back to a name-similar road.`);
      }
    };

    // V17.3.28 deduped nearby OSM ways by display name. That can erase a
    // separate same-name physical road. Keep individual OSM way identities.
    routeInteractiveLookupRoadsV17327 = async function routeInteractiveLookupRoadsSpatialIssue69(point) {
      const local = await routeStepLocalRoadCandidatesV17328(point);
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
          .map(row => ({ ...row, _distance: routeInteractiveDistanceToCandidateV17327(row, point) }))
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
