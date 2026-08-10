    /* BrineSearch V17.3.28 — step-snap route editor.
       Selecting a route step snaps the map to that road segment. The Owner can
       move the map to the correct road, replace the selected step, insert a road
       before/after it, remove a bad step, and edit turn/mileage without leaving
       the full-screen map. Road Manager geometry is checked before an external
       map lookup so ordinary edits do not depend on Overpass being responsive. */

    let routeStepEditActionV17328 = "replace";
    let routeStepSnapSerialV17328 = 0;
    const ROUTE_STEP_LOCAL_TAP_MIN_MI_V17328 = 0.018;
    const ROUTE_STEP_LOCAL_TAP_MAX_MI_V17328 = 0.11;
    const ROUTE_STEP_EXTERNAL_TIMEOUT_MS_V17328 = 4200;

    function routeStepSegmentV17328(index = routeInteractiveSelectedStepV17327) {
      return routeMapperSegmentsV17324?.[Number(index)] || null;
    }

    function routeStepTraceRowV17328(index = routeInteractiveSelectedStepV17327) {
      const segment = routeStepSegmentV17328(index);
      if (!segment) return null;
      const rows = routeInteractiveTraceResultV17327?.selected || [];
      let best = null;
      rows.forEach(row => {
        if (!row?.matched || !row?.traceLine?.length || !row?.token?.label) return;
        const score = routeBacktraceSimilarityV17325(segment.roadName, row.token.label);
        if (!best || score > best.score) best = { row, score };
      });
      return best?.score >= 0.6 ? best.row : null;
    }

    function routeStepLineMidpointV17328(line) {
      if (!Array.isArray(line) || !line.length) return null;
      if (line.length === 1) return line[0];
      const total = routeBacktraceLineLengthV17325(line);
      if (!Number.isFinite(total) || total <= 0) return line[Math.floor(line.length / 2)];
      let traveled = 0;
      for (let index = 1; index < line.length; index += 1) {
        const leg = routeBacktraceMilesV17325(line[index - 1], line[index]);
        if (traveled + leg >= total / 2) return line[index];
        traveled += leg;
      }
      return line[Math.floor(line.length / 2)];
    }

    function routeStepFitLineV17328(line, preferredZoom = 16) {
      const map = routeInteractiveMapV17327;
      if (!map?.root || !Array.isArray(line) || !line.length) return false;
      const mid = routeStepLineMidpointV17328(line);
      if (!mid) return false;
      map.center = { lat: Number(mid[1]), lng: Number(mid[0]) };
      let zoom = routeInteractiveClampV17327(preferredZoom, ROUTE_INTERACTIVE_MIN_ZOOM_V17327, ROUTE_INTERACTIVE_MAX_ZOOM_V17327);
      if (line.length > 1) {
        const width = Math.max(220, map.root.clientWidth * 0.72);
        const height = Math.max(220, map.root.clientHeight * 0.62);
        for (let candidate = ROUTE_INTERACTIVE_MAX_ZOOM_V17327; candidate >= ROUTE_INTERACTIVE_MIN_ZOOM_V17327; candidate -= 1) {
          const points = line.map(point => routeInteractiveWorldV17327(point[1], point[0], candidate));
          const xs = points.map(point => point.x), ys = points.map(point => point.y);
          const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
          if (spanX <= width && spanY <= height) { zoom = Math.min(candidate, 17); break; }
        }
      }
      map.zoom = Math.max(14, zoom);
      routeInteractiveRenderV17327();
      return true;
    }

    async function routeStepRoadManagerLineV17328(segment) {
      if (!segment) return null;
      let road = (roadManagerRows || []).find(row => row.id === segment.roadId) || null;
      if (!road && segment.roadId) {
        try {
          const rows = await editorRequest(`/rest/v1/brinesearch_roads?select=*&id=eq.${encodeURIComponent(segment.roadId)}&limit=1`, { method: "GET" });
          road = rows?.[0] || null;
          if (road && !(roadManagerRows || []).some(row => row.id === road.id)) roadManagerRows = [...(roadManagerRows || []), road];
        } catch {}
      }
      if (!road) {
        try {
          const rows = await fetchRoads(segment.roadName || "", 25);
          road = (rows || []).map(row => ({ row, score: routeBacktraceSimilarityV17325(segment.roadName, row.canonical_name) }))
            .sort((a, b) => b.score - a.score)[0]?.row || null;
        } catch {}
      }
      if (!road) return null;
      const lines = routeBacktraceGeoLinesV17325(road.centerline_geojson);
      if (!lines.length) return null;
      const trace = routeStepTraceRowV17328();
      if (trace?.traceLine?.length) return trace.traceLine;
      const padCoords = routeMapperPadCoordinateV17324(routeMapperSelectedPadV17324);
      if (!padCoords || lines.length === 1) return lines[0];
      return lines.map(line => ({ line, distance: routeBacktraceClosestVertexV17325([padCoords.lng, padCoords.lat], line).distance }))
        .sort((a, b) => a.distance - b.distance)[0]?.line || lines[0];
    }

    async function routeStepSnapToV17328(index, announce = false) {
      const segment = routeStepSegmentV17328(index);
      if (!segment || !routeInteractiveMapV17327) return false;
      const serial = ++routeStepSnapSerialV17328;
      let line = routeStepTraceRowV17328(index)?.traceLine || null;
      if (!line?.length) line = await routeStepRoadManagerLineV17328(segment);
      if (serial !== routeStepSnapSerialV17328) return false;
      const status = routeInteractiveMapV17327.root.querySelector("[data-route-map-edit-status]");
      if (!line?.length) {
        if (status) status.textContent = `No saved geometry for ${segment.roadName}. Move the map to the correct road and tap it.`;
        if (announce) showToast("No saved geometry for this step — pan to the road and tap it");
        return false;
      }
      routeStepFitLineV17328(line);
      if (status) status.textContent = `Step ${Number(index) + 1}: ${segment.roadName}. If this is wrong, move the map and tap the correct road.`;
      return true;
    }

    function routeStepSelectedLineV17328() {
      return routeStepTraceRowV17328(routeInteractiveSelectedStepV17327)?.traceLine || null;
    }

    const routeStepOverlayBeforeV17328 = routeInteractiveRenderOverlayV17327;
    routeInteractiveRenderOverlayV17327 = function routeInteractiveRenderOverlayStepV17328(map) {
      routeStepOverlayBeforeV17328(map);
      if (!routeInteractiveEditModeV17327 || !map?.overlay) return;
      const line = routeStepSelectedLineV17328();
      if (!line?.length) return;
      const points = line.map(point => routeInteractiveScreenPointV17327(point[1], point[0], map)).filter(Boolean);
      if (points.length < 2) return;
      const d = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "route-step-selected-v17328");
      map.overlay.appendChild(path);
    };

    function routeStepMilesPerPixelV17328(point) {
      const map = routeInteractiveMapV17327;
      if (!map) return 0.02;
      const earthMiles = 24901.461;
      return Math.cos(Number(point.lat) * Math.PI / 180) * earthMiles / (ROUTE_INTERACTIVE_TILE_SIZE_V17327 * (2 ** map.zoom));
    }

    function routeStepRoadHighwayTagV17328(road) {
      if (road?.road_type === "interstate") return "motorway";
      if (["us_route", "state_route"].includes(road?.road_type)) return "primary";
      if (road?.road_type === "county") return "secondary";
      if (road?.road_type === "township") return "tertiary";
      if (road?.road_type === "access") return "service";
      return "unclassified";
    }

    function routeStepSyntheticCandidateV17328(road, line, distance = 0) {
      return {
        id: road?.source_record_id || road?.id || `road-${Math.random().toString(36).slice(2)}`,
        _roadRecord: road,
        _distance: distance,
        tags: {
          name: road?.canonical_name || "Unnamed road",
          ref: road?.route_number ? `${routeMapperRoadTypeCodeV17324(routeMapperSegmentFromRoadV17324(road))}-${road.route_number}` : "",
          highway: routeStepRoadHighwayTagV17328(road)
        },
        geometry: (line || []).map(point => ({ lon: Number(point[0]), lat: Number(point[1]) }))
      };
    }

    async function routeStepLocalRoadCandidatesV17328(point) {
      let roads = Array.isArray(roadManagerRows) && roadManagerRows.length ? roadManagerRows : [];
      if (!roads.length) { try { roads = await fetchRoads("", 500); } catch { roads = []; } }
      const threshold = routeInteractiveClampV17327(routeStepMilesPerPixelV17328(point) * 34, ROUTE_STEP_LOCAL_TAP_MIN_MI_V17328, ROUTE_STEP_LOCAL_TAP_MAX_MI_V17328);
      const candidates = [];
      for (const road of roads) {
        const lines = routeBacktraceGeoLinesV17325(road?.centerline_geojson);
        if (!lines.length) continue;
        let best = null;
        for (const line of lines) {
          const hit = routeBacktraceClosestVertexV17325([point.lng, point.lat], line);
          if (!best || hit.distance < best.distance) best = { line, distance: hit.distance };
        }
        if (best && best.distance <= threshold) candidates.push(routeStepSyntheticCandidateV17328(road, best.line, best.distance));
      }
      return candidates.sort((a, b) => a._distance - b._distance).slice(0, 6);
    }

    routeInteractiveEnsureRoadRecordV17327 = async function routeInteractiveEnsureRoadRecordLocalFirstV17328(candidate) {
      if (candidate?._roadRecord?.id) return candidate._roadRecord;
      const identity = routeInteractiveCanonicalCandidateV17327(candidate);
      let roads = Array.isArray(roadManagerRows) && roadManagerRows.length ? roadManagerRows : [];
      if (!roads.length) { try { roads = await fetchRoads("", 500); } catch { roads = []; } }
      let best = null;
      const labels = [identity.canonical, ...(identity.aliases || [])];
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
        aliases: identity.aliases || [],
        route_number: identity.routeNumber,
        verification_status: "map_match",
        source_agency: "OpenStreetMap",
        source_dataset: "OSM way geometry",
        source_method: "owner_map_tap_v17328",
        source_url: candidate?.id && /^\d+$/.test(String(candidate.id)) ? `https://www.openstreetmap.org/way/${candidate.id}` : null,
        source_record_id: candidate?.id ? String(candidate.id) : null,
        centerline_geojson: { type: "LineString", coordinates: routeInteractiveCandidateLineV17327(candidate) },
        geometry_status: "map_loaded",
        geometry_checked_at: new Date().toISOString(),
        candidate_only: false,
        candidate_basis: { method: "owner_map_tap_v17328", pad_id: routeMapperPadIdV17324(pad) || null },
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
        const matches = await fetchRoads(identity.canonical, 30).catch(() => []);
        const exact = (matches || []).find(road => routeBacktraceSimilarityV17325(identity.canonical, road?.canonical_name) >= 0.96 && road?.road_type === identity.roadType);
        if (exact) return exact;
        throw error;
      }
    };

    const routeStepLookupExternalBeforeV17328 = routeInteractiveLookupRoadsV17327;
    routeInteractiveLookupRoadsV17327 = async function routeInteractiveLookupRoadsLocalFirstV17328(point) {
      const local = await routeStepLocalRoadCandidatesV17328(point);
      if (local.length) return local;
      const query = `[out:json][timeout:4];way(around:45,${point.lat},${point.lng})["highway"];out tags geom;`;
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; try { controller.abort(); } catch {} }, ROUTE_STEP_EXTERNAL_TIMEOUT_MS_V17328);
      const endpoints = ["https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"];
      try {
        const rows = await Promise.any(endpoints.map(async endpoint => {
          const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
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
        try { return await routeStepLookupExternalBeforeV17328(point); }
        catch {
          throw new Error(timedOut || error?.name === "AbortError" ? "Road lookup timed out — use Find road or tap again" : (error?.message || "Road lookup unavailable"));
        }
      } finally {
        clearTimeout(timer); try { controller.abort(); } catch {}
      }
    };

    async function routeStepRefreshLocalTraceV17328() {
      const pad = routeMapperSelectedPadV17324;
      const coords = routeMapperPadCoordinateV17324(pad);
      if (!pad || !coords || !routeMapperSegmentsV17324.length) return;
      let roads = Array.isArray(roadManagerRows) && roadManagerRows.length ? roadManagerRows : [];
      if (!roads.length) { try { roads = await fetchRoads("", 500); } catch { roads = []; } }
      const tokens = routeBacktraceRoadTokensV17325(pad);
      routeInteractiveTraceResultV17327 = { tokens, selected: routeBacktraceBuildTraceV17325(tokens, roads, [], coords) };
      routeInteractiveRenderV17327();
    }

    routeInteractiveUseCandidateV17327 = async function routeInteractiveUseCandidateStepActionV17328(candidate, stepIndex) {
      const fallbackIndex = Number(stepIndex);
      let index = Number.isInteger(routeInteractiveSelectedStepV17327) ? routeInteractiveSelectedStepV17327 : fallbackIndex;
      if (!Number.isInteger(index) || index < 0) index = 0;
      if (routeStepEditActionV17328 === "replace" && index >= routeMapperSegmentsV17324.length) { showToast("Choose the route step to move first"); return; }
      const road = await routeInteractiveEnsureRoadRecordV17327(candidate);
      const newSegment = routeMapperSegmentFromRoadV17324(road);
      let message = "";
      if (routeStepEditActionV17328 === "before") {
        routeMapperSegmentsV17324.splice(index, 0, newSegment);
        routeInteractiveSelectedStepV17327 = index;
        message = `Added ${road.canonical_name} before step ${index + 2}`;
      } else if (routeStepEditActionV17328 === "after") {
        const insertAt = Math.min(index + 1, routeMapperSegmentsV17324.length);
        routeMapperSegmentsV17324.splice(insertAt, 0, newSegment);
        routeInteractiveSelectedStepV17327 = insertAt;
        message = `Added ${road.canonical_name} as step ${insertAt + 1}`;
      } else {
        const old = routeMapperSegmentsV17324[index];
        routeMapperSegmentsV17324[index] = { ...newSegment, miles: old?.miles || "", turn: old?.turn || "", note: old?.note || "" };
        routeInteractiveSelectedStepV17327 = index;
        message = `Step ${index + 1} moved to ${road.canonical_name}`;
      }
      routeStepEditActionV17328 = "replace";
      routeInteractiveUseDraftV17327 = true;
      routeMapperDraftSaveV17324();
      routeMapperRenderSegmentsV17324();
      routeBacktraceMemoryV17325.clear();
      routeInteractiveCloseCandidateSheetV17327();
      await routeStepRefreshLocalTraceV17328();
      routeInteractiveRenderEditBarV17327();
      await routeStepSnapToV17328(routeInteractiveSelectedStepV17327, false);
      showToast(message);
      routeBacktraceRunV17325().then(async () => {
        routeInteractiveRenderEditBarV17327();
        await routeStepSnapToV17328(routeInteractiveSelectedStepV17327, false);
      }).catch(() => {});
    };

    routeInteractiveTapRoadV17327 = async function routeInteractiveTapRoadStepV17328(x, y) {
      const point = routeInteractiveLatLngFromScreenV17327(x, y);
      if (!point) return;
      const status = routeInteractiveMapV17327?.root?.querySelector("[data-route-map-edit-status]");
      if (status) status.textContent = routeStepEditActionV17328 === "before" ? "Finding road to add before this step…" : routeStepEditActionV17328 === "after" ? "Finding road to add after this step…" : "Finding the road you tapped…";
      try {
        const candidates = await routeInteractiveLookupRoadsV17327(point);
        routeInteractiveRenderCandidateSheetV17327(candidates, point);
        if (status) status.textContent = candidates.length ? "Choose the correct road" : "No nearby mapped road found — use Find road";
      } catch (error) {
        const message = error?.message || "Road lookup unavailable";
        if (status) status.textContent = `${message}. You can still use Find road.`;
        showToast(message);
      }
    };

    async function routeStepRemoveSelectedV17328() {
      const index = routeInteractiveSelectedStepV17327;
      const segment = routeStepSegmentV17328(index);
      if (!segment) return;
      if (!window.confirm(`Remove step ${index + 1}: ${segment.roadName} from this route draft?`)) return;
      routeMapperSegmentsV17324.splice(index, 1);
      routeInteractiveSelectedStepV17327 = Math.max(0, Math.min(index, routeMapperSegmentsV17324.length - 1));
      routeInteractiveUseDraftV17327 = true;
      routeStepEditActionV17328 = "replace";
      routeMapperDraftSaveV17324();
      routeMapperRenderSegmentsV17324();
      routeBacktraceMemoryV17325.clear();
      await routeStepRefreshLocalTraceV17328();
      routeInteractiveRenderEditBarV17327();
      if (routeMapperSegmentsV17324.length) await routeStepSnapToV17328(routeInteractiveSelectedStepV17327, false);
      showToast(`${segment.roadName} removed from route draft`);
    }

    async function routeStepSearchRoadManagerV17328() {
      const root = routeInteractiveMapV17327?.root;
      const input = root?.querySelector("[data-route-step-road-search]");
      const q = input?.value?.trim() || "";
      const status = root?.querySelector("[data-route-map-edit-status]");
      if (!q) { if (status) status.textContent = "Type a road name or route number first"; return; }
      if (status) status.textContent = `Searching Road Manager for ${q}…`;
      try {
        const roads = await fetchRoads(q, 25);
        const candidates = (roads || []).slice(0, 8).map(road => {
          const line = routeBacktraceGeoLinesV17325(road.centerline_geojson)[0] || [];
          return routeStepSyntheticCandidateV17328(road, line, 0);
        });
        routeInteractiveRenderCandidateSheetV17327(candidates, routeInteractiveMapV17327.center);
        if (status) status.textContent = candidates.length ? "Choose the Road Manager road" : "No Road Manager road matched that search";
      } catch (error) {
        if (status) status.textContent = error?.message || "Road search failed";
      }
    }

    function routeStepActionLabelV17328() {
      if (routeStepEditActionV17328 === "before") return "Tap a road to add BEFORE this step";
      if (routeStepEditActionV17328 === "after") return "Tap a road to add AFTER this step";
      return "Tap the correct road to MOVE/REPLACE this step";
    }

    const routeStepRenderEditBarBeforeV17328 = routeInteractiveRenderEditBarV17327;
    routeInteractiveRenderEditBarV17327 = function routeInteractiveRenderEditBarStepV17328() {
      routeStepRenderEditBarBeforeV17328();
      const root = routeInteractiveMapV17327?.root;
      const bar = root?.querySelector(".route-map-edit-bar-v17327");
      if (!bar || !routeInteractiveEditModeV17327) return;
      const segment = routeStepSegmentV17328();
      const chips = bar.querySelector("[data-route-map-step-chips]");
      chips?.querySelectorAll("[data-route-map-step]").forEach(button => {
        button.onclick = async () => {
          routeInteractiveSelectedStepV17327 = Number(button.dataset.routeMapStep);
          routeStepEditActionV17328 = "replace";
          routeInteractiveRenderEditBarV17327();
          await routeStepSnapToV17328(routeInteractiveSelectedStepV17327, true);
        };
      });

      let controls = bar.querySelector(".route-step-controls-v17328");
      if (!controls) {
        controls = document.createElement("div");
        controls.className = "route-step-controls-v17328";
        controls.innerHTML = `
          <div class="route-step-action-row-v17328">
            <button type="button" data-route-step-action="replace">Move / replace</button>
            <button type="button" data-route-step-action="before">＋ Before</button>
            <button type="button" data-route-step-action="after">＋ After</button>
            <button type="button" class="danger" data-route-step-remove>Remove</button>
          </div>
          <div class="route-step-fields-v17328">
            <label>Turn<select data-route-step-turn>${routeMapperTurnOptionsV17324("")}</select></label>
            <label>Miles<input type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" data-route-step-miles></label>
          </div>
          <div class="route-step-search-v17328"><input type="search" autocomplete="off" placeholder="Find road: CR-10, W Steubenville St…" data-route-step-road-search><button type="button" data-route-step-find>Find road</button></div>
          <div class="route-step-mode-v17328" data-route-step-mode></div>`;
        bar.appendChild(controls);
      }
      controls.querySelectorAll("[data-route-step-action]").forEach(button => {
        const action = button.dataset.routeStepAction;
        button.classList.toggle("active", action === routeStepEditActionV17328);
        button.onclick = () => {
          routeStepEditActionV17328 = action;
          routeInteractiveRenderEditBarV17327();
          const status = root.querySelector("[data-route-map-edit-status]");
          if (status) status.textContent = routeStepActionLabelV17328();
        };
      });
      const mode = controls.querySelector("[data-route-step-mode]");
      if (mode) mode.textContent = routeStepActionLabelV17328();
      controls.querySelector("[data-route-step-remove]").onclick = routeStepRemoveSelectedV17328;
      controls.querySelector("[data-route-step-find]").onclick = routeStepSearchRoadManagerV17328;
      const search = controls.querySelector("[data-route-step-road-search]");
      search.onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); routeStepSearchRoadManagerV17328(); } };
      const turn = controls.querySelector("[data-route-step-turn]");
      const miles = controls.querySelector("[data-route-step-miles]");
      if (turn && segment) {
        turn.value = segment.turn || "";
        turn.onchange = () => {
          segment.turn = turn.value;
          routeInteractiveUseDraftV17327 = true;
          routeMapperDraftSaveV17324();
          routeMapperRenderSegmentsV17324();
        };
      }
      if (miles && segment) {
        miles.value = segment.miles || "";
        miles.onchange = () => {
          segment.miles = miles.value;
          routeInteractiveUseDraftV17327 = true;
          routeMapperDraftSaveV17324();
          routeMapperRenderSegmentsV17324();
        };
      }
    };

    const routeStepToggleEditBeforeV17328 = routeInteractiveToggleEditV17327;
    routeInteractiveToggleEditV17327 = async function routeInteractiveToggleEditStepSnapV17328() {
      const wasEditing = routeInteractiveEditModeV17327;
      await routeStepToggleEditBeforeV17328();
      if (!wasEditing && routeInteractiveEditModeV17327) {
        routeStepEditActionV17328 = "replace";
        routeInteractiveRenderEditBarV17327();
        await routeStepSnapToV17328(routeInteractiveSelectedStepV17327, false);
      }
    };

    window.routeStepSnapToV17328 = routeStepSnapToV17328;
    window.routeStepEditActionV17328 = () => routeStepEditActionV17328;
