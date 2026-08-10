    /* V17.3.27 canonical-road guard for map taps.
       A tapped numbered road is stored as the canonical route (OH-519, US-250,
       CR-10, etc.) while its mapped/local name remains an alias. */

    const routeInteractiveCandidateDisplayBeforeCanonicalV17327 = routeInteractiveCandidateNameV17327;

    function routeInteractiveCanonicalCandidateV17327(candidate) {
      const pad = routeMapperSelectedPadV17324;
      const roadType = routeInteractiveInferRoadTypeV17327(candidate);
      const rawRef = normalize(candidate?.tags?.ref || "");
      const mappedName = normalize(candidate?.tags?.name || "");
      const number = rawRef.match(/\d{1,4}(?:\/\d+)?[A-Z]?/i)?.[0] || null;
      const state = routeMapperStateCodeV17324(pad?.state);
      let canonical = mappedName || rawRef || `${pad?.padName || "Pad"} Access Road`;
      if (number) {
        if (roadType === "interstate") canonical = `I-${number}`;
        else if (roadType === "us_route") canonical = `US-${number}`;
        else if (roadType === "state_route" && ["OH", "PA", "WV"].includes(state)) canonical = `${state}-${number}`;
        else if (roadType === "county") canonical = `CR-${number}`;
        else if (roadType === "township") canonical = `TR-${number}`;
      }
      const aliases = Array.from(new Set([mappedName, rawRef, routeInteractiveCandidateDisplayBeforeCanonicalV17327(candidate)].map(normalize).filter(value => value && value.toLowerCase() !== canonical.toLowerCase())));
      return { canonical, aliases, roadType, state: ["interstate", "us_route"].includes(roadType) ? null : state, routeNumber: number };
    }

    routeInteractiveEnsureRoadRecordV17327 = async function routeInteractiveEnsureCanonicalRoadRecordV17327(candidate) {
      const identity = routeInteractiveCanonicalCandidateV17327(candidate);
      let roads = Array.isArray(roadManagerRows) && roadManagerRows.length ? roadManagerRows : [];
      if (!roads.length) { try { roads = await fetchRoads("", 500); } catch { roads = []; } }
      let best = null;
      const labels = [identity.canonical, ...identity.aliases];
      for (const road of roads) {
        const typePenalty = road?.road_type === identity.roadType ? 0 : 0.12;
        const score = Math.max(...labels.map(label => Math.max(...routeBacktraceRoadLabelsV17325(road).map(existing => routeBacktraceSimilarityV17325(label, existing)), 0)), 0) - typePenalty;
        if (!best || score > best.score) best = { road, score };
      }
      if (best?.score >= 0.84) return best.road;

      const pad = routeMapperSelectedPadV17324;
      const body = {
        canonical_name: identity.canonical,
        normalized_name: typeof roadNormalizeKey === "function" ? roadNormalizeKey(identity.canonical) : routeBacktraceRoadKeyV17325(identity.canonical),
        road_type: identity.roadType,
        state: identity.state,
        county: ["interstate", "us_route", "state_route"].includes(identity.roadType) ? null : (pad?.county || null),
        township: ["interstate", "us_route", "state_route"].includes(identity.roadType) ? null : (pad?.township || null),
        aliases: identity.aliases,
        route_number: identity.routeNumber,
        verification_status: "map_match",
        source_agency: "OpenStreetMap",
        source_dataset: "OSM way geometry",
        source_method: "owner_map_tap_v17327",
        source_url: `https://www.openstreetmap.org/way/${candidate.id}`,
        source_record_id: String(candidate.id || ""),
        centerline_geojson: { type: "LineString", coordinates: routeInteractiveCandidateLineV17327(candidate) },
        geometry_status: "map_loaded",
        geometry_checked_at: new Date().toISOString(),
        candidate_only: false,
        candidate_basis: { method: "owner_map_tap_v17327", pad_id: routeMapperPadIdV17324(pad) || null },
        route_directions: [],
        coverage_states: identity.state ? [identity.state] : []
      };
      try {
        const saved = await editorRequest("/rest/v1/brinesearch_roads", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
        const road = Array.isArray(saved) ? saved[0] : saved;
        if (!road?.id) throw new Error("Road Manager did not return the selected road");
        roadManagerRows = [...roads, road];
        return road;
      } catch (error) {
        // A canonical identity trigger/unique index may reveal a road that was not
        // in the first 500-row cache. Re-query that name before surfacing failure.
        const matches = await fetchRoads(identity.canonical, 30).catch(() => []);
        const exact = (matches || []).find(road => routeBacktraceSimilarityV17325(identity.canonical, road?.canonical_name) >= 0.96 && road?.road_type === identity.roadType);
        if (exact) return exact;
        throw error;
      }
    };

    window.routeInteractiveCanonicalCandidateV17327 = routeInteractiveCanonicalCandidateV17327;
