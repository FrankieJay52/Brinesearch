    /* BrineSearch V17.3.27 — interactive Owner route map.
       Replaces the read-only OSM iframe experience with a one-finger slippy map,
       keeps the verified backtrace aligned while panning/zooming, allows the Owner
       to tap the correct road to repair a route step, and publishes the corrected
       route + Clear Directions together only after validation. */

    const ROUTE_INTERACTIVE_TILE_SIZE_V17327 = 256;
    const ROUTE_INTERACTIVE_MIN_ZOOM_V17327 = 8;
    const ROUTE_INTERACTIVE_MAX_ZOOM_V17327 = 19;
    const ROUTE_INTERACTIVE_LOOKUP_TIMEOUT_MS_V17327 = 4500;
    let routeInteractiveMapV17327 = null;
    let routeInteractiveTraceResultV17327 = null;
    let routeInteractiveEditModeV17327 = false;
    let routeInteractiveSelectedStepV17327 = 0;
    let routeInteractiveUseDraftV17327 = false;
    let routeInteractiveRenderFrameV17327 = 0;
    const routeInteractiveSavedPrimaryTokensV17327 = routeBacktracePrimaryTokensV17325;

    function routeInteractiveClampV17327(value, min, max) { return Math.max(min, Math.min(max, value)); }

    function routeInteractiveWorldV17327(lat, lng, zoom) {
      const scale = ROUTE_INTERACTIVE_TILE_SIZE_V17327 * (2 ** zoom);
      const clampedLat = routeInteractiveClampV17327(Number(lat), -85.05112878, 85.05112878);
      const sin = Math.sin(clampedLat * Math.PI / 180);
      return {
        x: (Number(lng) + 180) / 360 * scale,
        y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
      };
    }

    function routeInteractiveLatLngV17327(x, y, zoom) {
      const scale = ROUTE_INTERACTIVE_TILE_SIZE_V17327 * (2 ** zoom);
      const lng = x / scale * 360 - 180;
      const n = Math.PI - (2 * Math.PI * y / scale);
      const lat = 180 / Math.PI * Math.atan(Math.sinh(n));
      return { lat, lng };
    }

    function routeInteractiveScreenPointV17327(lat, lng, map = routeInteractiveMapV17327) {
      if (!map?.root) return null;
      const center = routeInteractiveWorldV17327(map.center.lat, map.center.lng, map.zoom);
      const point = routeInteractiveWorldV17327(lat, lng, map.zoom);
      return { x: map.root.clientWidth / 2 + (point.x - center.x), y: map.root.clientHeight / 2 + (point.y - center.y) };
    }

    function routeInteractiveLatLngFromScreenV17327(x, y, map = routeInteractiveMapV17327) {
      if (!map?.root) return null;
      const center = routeInteractiveWorldV17327(map.center.lat, map.center.lng, map.zoom);
      return routeInteractiveLatLngV17327(center.x + x - map.root.clientWidth / 2, center.y + y - map.root.clientHeight / 2, map.zoom);
    }

    function routeInteractiveScheduleRenderV17327() {
      if (routeInteractiveRenderFrameV17327) return;
      routeInteractiveRenderFrameV17327 = requestAnimationFrame(() => {
        routeInteractiveRenderFrameV17327 = 0;
        routeInteractiveRenderV17327();
      });
    }

    function routeInteractiveRoadStrokeV17327(row) {
      const source = String(row?.source || "").toLowerCase();
      return source.includes("road manager") ? "route-interactive-road verified" : "route-interactive-road mapped";
    }

    function routeInteractiveRenderTilesV17327(map) {
      const width = map.root.clientWidth;
      const height = map.root.clientHeight;
      if (!width || !height) return;
      const tileLayer = map.tiles;
      tileLayer.innerHTML = "";
      const center = routeInteractiveWorldV17327(map.center.lat, map.center.lng, map.zoom);
      const left = center.x - width / 2;
      const top = center.y - height / 2;
      const minX = Math.floor(left / ROUTE_INTERACTIVE_TILE_SIZE_V17327) - 1;
      const maxX = Math.floor((left + width) / ROUTE_INTERACTIVE_TILE_SIZE_V17327) + 1;
      const minY = Math.floor(top / ROUTE_INTERACTIVE_TILE_SIZE_V17327) - 1;
      const maxY = Math.floor((top + height) / ROUTE_INTERACTIVE_TILE_SIZE_V17327) + 1;
      const tileCount = 2 ** map.zoom;
      for (let ty = minY; ty <= maxY; ty += 1) {
        if (ty < 0 || ty >= tileCount) continue;
        for (let tx = minX; tx <= maxX; tx += 1) {
          const wrappedX = ((tx % tileCount) + tileCount) % tileCount;
          const img = document.createElement("img");
          img.alt = "";
          img.draggable = false;
          img.decoding = "async";
          img.src = `https://tile.openstreetmap.org/${map.zoom}/${wrappedX}/${ty}.png`;
          img.style.left = `${Math.round(tx * ROUTE_INTERACTIVE_TILE_SIZE_V17327 - left)}px`;
          img.style.top = `${Math.round(ty * ROUTE_INTERACTIVE_TILE_SIZE_V17327 - top)}px`;
          tileLayer.appendChild(img);
        }
      }
    }

    function routeInteractiveRenderOverlayV17327(map) {
      const svg = map.overlay;
      const width = map.root.clientWidth;
      const height = map.root.clientHeight;
      svg.setAttribute("viewBox", `0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`);
      svg.innerHTML = "";
      const result = routeInteractiveTraceResultV17327;
      const traceRows = result?.selected?.filter(row => row?.matched && row?.traceLine?.length > 1) || [];
      for (const row of traceRows) {
        const points = row.traceLine.map(point => routeInteractiveScreenPointV17327(point[1], point[0], map)).filter(Boolean);
        if (points.length < 2) continue;
        const d = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
        const halo = document.createElementNS("http://www.w3.org/2000/svg", "path");
        halo.setAttribute("d", d); halo.setAttribute("class", "route-interactive-halo"); svg.appendChild(halo);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d); path.setAttribute("class", routeInteractiveRoadStrokeV17327(row)); svg.appendChild(path);
      }
      const pad = routeMapperSelectedPadV17324;
      const coords = routeMapperPadCoordinateV17324(pad);
      if (coords) {
        const point = routeInteractiveScreenPointV17327(coords.lat, coords.lng, map);
        if (point) {
          const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          ring.setAttribute("cx", point.x); ring.setAttribute("cy", point.y); ring.setAttribute("r", "10"); ring.setAttribute("class", "route-interactive-pad-ring"); svg.appendChild(ring);
          const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          dot.setAttribute("cx", point.x); dot.setAttribute("cy", point.y); dot.setAttribute("r", "5"); dot.setAttribute("class", "route-interactive-pad-dot"); svg.appendChild(dot);
        }
      }
    }

    function routeInteractiveRenderV17327() {
      const map = routeInteractiveMapV17327;
      if (!map?.root?.isConnected) return;
      routeInteractiveRenderTilesV17327(map);
      routeInteractiveRenderOverlayV17327(map);
      const zoom = map.root.querySelector("[data-route-map-zoom]"); if (zoom) zoom.textContent = String(map.zoom);
    }

    function routeInteractiveSetZoomV17327(nextZoom, anchorX = null, anchorY = null) {
      const map = routeInteractiveMapV17327;
      if (!map) return;
      const zoom = routeInteractiveClampV17327(Math.round(nextZoom), ROUTE_INTERACTIVE_MIN_ZOOM_V17327, ROUTE_INTERACTIVE_MAX_ZOOM_V17327);
      if (zoom === map.zoom) return;
      const anchorBefore = anchorX == null ? null : routeInteractiveLatLngFromScreenV17327(anchorX, anchorY, map);
      map.zoom = zoom;
      if (anchorBefore) {
        const anchorWorld = routeInteractiveWorldV17327(anchorBefore.lat, anchorBefore.lng, map.zoom);
        const centerWorld = { x: anchorWorld.x - anchorX + map.root.clientWidth / 2, y: anchorWorld.y - anchorY + map.root.clientHeight / 2 };
        map.center = routeInteractiveLatLngV17327(centerWorld.x, centerWorld.y, map.zoom);
      }
      routeInteractiveRenderV17327();
    }

    function routeInteractivePanPixelsV17327(dx, dy) {
      const map = routeInteractiveMapV17327;
      if (!map) return;
      const center = routeInteractiveWorldV17327(map.center.lat, map.center.lng, map.zoom);
      map.center = routeInteractiveLatLngV17327(center.x - dx, center.y - dy, map.zoom);
      routeInteractiveScheduleRenderV17327();
    }

    function routeInteractiveToggleFullscreenV17327(force = null) {
      const frame = document.querySelector(".route-mapper-map-frame");
      if (!frame) return;
      const next = force == null ? !frame.classList.contains("route-map-fullscreen-v17327") : Boolean(force);
      frame.classList.toggle("route-map-fullscreen-v17327", next);
      document.body.classList.toggle("route-map-body-fullscreen-v17327", next);
      const button = frame.querySelector("[data-route-map-fullscreen]");
      if (button) button.textContent = next ? "Close" : "Full screen";
      setTimeout(routeInteractiveRenderV17327, 30);
    }

    function routeInteractiveCloseCandidateSheetV17327() {
      routeInteractiveMapV17327?.root?.querySelector(".route-map-road-sheet-v17327")?.remove();
    }

    function routeInteractiveInferRoadTypeV17327(candidate) {
      const ref = String(candidate?.tags?.ref || "").toUpperCase();
      const highway = String(candidate?.tags?.highway || "").toLowerCase();
      if (/^(?:I|INTERSTATE)[ -]?\d+/.test(ref)) return "interstate";
      if (/^(?:US|U\.S\.)[ -]?\d+/.test(ref)) return "us_route";
      if (/^(?:OH|SR|STATE ROUTE)[ -]?\d+/.test(ref)) return "state_route";
      if (/^(?:CR|COUNTY ROAD)[ -]?\d+/.test(ref)) return "county";
      if (/^(?:TR|TOWNSHIP ROAD)[ -]?\d+/.test(ref)) return "township";
      if (["service", "track", "path"].includes(highway) || candidate?.tags?.access === "private") return "access";
      return "local";
    }

    function routeInteractiveCandidateNameV17327(candidate) {
      const name = normalize(candidate?.tags?.name || "");
      const ref = normalize(candidate?.tags?.ref || "");
      if (ref && name && routeBacktraceSimilarityV17325(ref, name) < 0.8) return `${ref} / ${name}`;
      if (name) return name;
      if (ref) return ref;
      const pad = routeMapperSelectedPadV17324;
      return `${pad?.padName || "Pad"} Access Road`;
    }

    function routeInteractiveCandidateLineV17327(candidate) {
      return (candidate?.geometry || []).map(point => [Number(point.lon), Number(point.lat)]).filter(point => point.every(Number.isFinite));
    }

    function routeInteractiveDistanceToCandidateV17327(candidate, point) {
      const line = routeInteractiveCandidateLineV17327(candidate);
      if (!line.length) return Infinity;
      return routeBacktraceClosestVertexV17325([point.lng, point.lat], line).distance;
    }

    async function routeInteractiveLookupRoadsV17327(point) {
      const query = `[out:json][timeout:4];way(around:55,${point.lat},${point.lng})["highway"];out tags geom;`;
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; try { controller.abort(); } catch {} }, ROUTE_INTERACTIVE_LOOKUP_TIMEOUT_MS_V17327);
      const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
      try {
        const rows = await Promise.any(endpoints.map(async endpoint => {
          const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error(`Road lookup returned ${response.status}`);
          const data = await response.json();
          return Array.isArray(data?.elements) ? data.elements : [];
        }));
        return rows
          .filter(row => Array.isArray(row?.geometry) && row.geometry.length > 1)
          .map(row => ({ ...row, _distance: routeInteractiveDistanceToCandidateV17327(row, point) }))
          .sort((a, b) => a._distance - b._distance)
          .filter((row, index, all) => index === all.findIndex(other => routeInteractiveCandidateNameV17327(other) === routeInteractiveCandidateNameV17327(row)))
          .slice(0, 6);
      } catch (error) {
        throw new Error(timedOut || error?.name === "AbortError" ? "Road lookup timed out — tap again" : (error?.message || "Road lookup unavailable"));
      } finally {
        clearTimeout(timer); try { controller.abort(); } catch {}
      }
    }

    function routeInteractiveSegmentPlaceholderV17327(name, pad) {
      const text = normalize(name);
      let roadType = "local";
      if (/^I[- ]?\d+/i.test(text)) roadType = "interstate";
      else if (/^US[- ]?\d+/i.test(text)) roadType = "us_route";
      else if (/^(?:OH|SR|State Route)[- ]?\d+/i.test(text)) roadType = "state_route";
      else if (/^(?:CR|County Road)[- ]?\d+/i.test(text)) roadType = "county";
      else if (/^(?:TR|Township Road)[- ]?\d+/i.test(text)) roadType = "township";
      else if (/access|lease/i.test(text)) roadType = "access";
      return { roadId: "", roadName: text, roadType, routeNumber: (text.match(/\d{1,4}(?:\/\d+)?/) || [])[0] || null, state: routeMapperStateCodeV17324(pad?.state), verificationStatus: "needs_review", sourceAgency: null, sourceUrl: null, sourceRecordId: null, geometryStatus: null, miles: "", turn: "", note: "" };
    }

    function routeInteractiveDirectionLinesV17327(pad) {
      return String(pad?.directionsClear || pad?.directions_clear || pad?.originalWrittenDirections || pad?.writtenDirections || "")
        .split(/\n+|(?<=\.)\s+(?=\d+\.|Turn|Take|Continue|Head|Merge|Enter|Arrive)/i)
        .map(value => normalize(value.replace(/^\d+[.)]\s*/, ""))).filter(Boolean);
    }

    function routeInteractiveApplyDirectionHintsV17327(segment, pad) {
      const parts = String(segment?.roadName || "").split(/\s*\/\s*/).filter(Boolean);
      const keys = parts.map(routeBacktraceRoadKeyV17325).filter(key => key.length >= 3);
      const line = routeInteractiveDirectionLinesV17327(pad).find(value => {
        const key = routeBacktraceRoadKeyV17325(value);
        return keys.some(roadKey => key.includes(roadKey));
      });
      if (!line) return segment;
      let turn = segment.turn || "";
      if (/\bslight left\b/i.test(line)) turn = "slight_left";
      else if (/\bslight right\b/i.test(line)) turn = "slight_right";
      else if (/\bmerge left\b/i.test(line)) turn = "merge_left";
      else if (/\bmerge right\b/i.test(line)) turn = "merge_right";
      else if (/\bturn left\b/i.test(line)) turn = "left";
      else if (/\bturn right\b/i.test(line)) turn = "right";
      else if (/\bcontinue\b|\bstraight\b/i.test(line)) turn = "straight";
      const range = line.match(/\b\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*(?:mi|mile)/i);
      const miles = !range ? line.match(/\b(\d+(?:\.\d+)?)\s*(?:mi|mile)/i) : null;
      return { ...segment, turn, miles: segment.miles || (miles ? miles[1] : "") };
    }

    async function routeInteractiveSeedSegmentsV17327() {
      const pad = routeMapperSelectedPadV17324;
      if (!pad) return;
      if (routeMapperSegmentsV17324.length) return;
      const padId = routeMapperPadIdV17324(pad);
      if (padId) {
        try {
          const stored = await editorRequest(`/rest/v1/brinesearch_pad_roads?select=*&pad_id=eq.${encodeURIComponent(padId)}&route_group=eq.primary&route_variant_index=eq.0&order=step_order.asc`, { method: "GET" });
          if (Array.isArray(stored) && stored.length) {
            const ids = Array.from(new Set(stored.map(row => row.road_id).filter(Boolean)));
            const roads = ids.length ? await editorRequest(`/rest/v1/brinesearch_roads?select=*&id=in.(${ids.join(",")})`, { method: "GET" }) : [];
            const roadMap = new Map((roads || []).map(road => [road.id, road]));
            routeMapperSegmentsV17324 = stored.map(row => {
              const road = roadMap.get(row.road_id) || { id: row.road_id, canonical_name: row.instruction || "Road" };
              return routeInteractiveApplyDirectionHintsV17327({ ...routeMapperSegmentFromRoadV17324(road), miles: row.distance_miles == null ? "" : String(row.distance_miles), turn: row.turn_direction || "", note: row.step_note || "" }, pad);
            });
            routeMapperDraftSaveV17324();
            return;
          }
        } catch (error) { console.warn("Could not seed route from pad roads", error); }
      }
      let roads = Array.isArray(roadManagerRows) && roadManagerRows.length ? roadManagerRows : [];
      if (!roads.length) { try { roads = await fetchRoads("", 500); } catch { roads = []; } }
      const tokens = routeInteractiveSavedPrimaryTokensV17327(pad).filter(token => routeBacktraceTokenKindV17325(token) === "road");
      routeMapperSegmentsV17324 = tokens.map(token => {
        const match = routeBacktraceRoadManagerMatchesV17325(token, roads)?.[0];
        const segment = match?.road ? routeMapperSegmentFromRoadV17324(match.road) : routeInteractiveSegmentPlaceholderV17327(token, pad);
        return routeInteractiveApplyDirectionHintsV17327(segment, pad);
      });
      routeMapperDraftSaveV17324();
    }

    routeBacktracePrimaryTokensV17325 = function routeBacktraceEditablePrimaryV17327(pad) {
      if (routeInteractiveUseDraftV17327 && Array.isArray(routeMapperSegmentsV17324) && routeMapperSegmentsV17324.length) {
        return routeMapperSegmentsV17324.map(segment => segment.roadName).filter(Boolean);
      }
      return routeInteractiveSavedPrimaryTokensV17327(pad);
    };

    async function routeInteractiveEnsureRoadRecordV17327(candidate) {
      let roads = Array.isArray(roadManagerRows) && roadManagerRows.length ? roadManagerRows : [];
      if (!roads.length) { try { roads = await fetchRoads("", 500); } catch { roads = []; } }
      const labels = [candidate?.tags?.ref, candidate?.tags?.name, routeInteractiveCandidateNameV17327(candidate)].filter(Boolean);
      let best = null;
      for (const road of roads) {
        const score = Math.max(...labels.map(label => Math.max(...routeBacktraceRoadLabelsV17325(road).map(existing => routeBacktraceSimilarityV17325(label, existing)), 0)), 0);
        if (!best || score > best.score) best = { road, score };
      }
      if (best?.score >= 0.86) return best.road;
      const pad = routeMapperSelectedPadV17324;
      const name = routeInteractiveCandidateNameV17327(candidate);
      const roadType = routeInteractiveInferRoadTypeV17327(candidate);
      const state = ["interstate", "us_route"].includes(roadType) ? null : routeMapperStateCodeV17324(pad?.state);
      const aliases = Array.from(new Set([candidate?.tags?.name, candidate?.tags?.ref].map(normalize).filter(value => value && value.toLowerCase() !== name.toLowerCase())));
      const routeNumber = normalize(candidate?.tags?.ref || "").match(/\d{1,4}(?:\/\d+)?/)?.[0] || null;
      const body = {
        canonical_name: name,
        normalized_name: typeof roadNormalizeKey === "function" ? roadNormalizeKey(name) : routeBacktraceRoadKeyV17325(name),
        road_type: roadType,
        state,
        county: ["interstate", "us_route", "state_route"].includes(roadType) ? null : (pad?.county || null),
        township: ["interstate", "us_route", "state_route"].includes(roadType) ? null : (pad?.township || null),
        aliases,
        route_number: routeNumber,
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
        coverage_states: state ? [state] : []
      };
      const saved = await editorRequest("/rest/v1/brinesearch_roads", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
      const road = Array.isArray(saved) ? saved[0] : saved;
      if (!road?.id) throw new Error("Road Manager did not return the selected road");
      roadManagerRows = [...roads, road];
      return road;
    }

    async function routeInteractiveUseCandidateV17327(candidate, stepIndex) {
      const index = Number(stepIndex);
      if (!Number.isInteger(index) || index < 0 || index >= routeMapperSegmentsV17324.length) { showToast("Choose the route step to replace first"); return; }
      const old = routeMapperSegmentsV17324[index];
      const road = await routeInteractiveEnsureRoadRecordV17327(candidate);
      routeMapperSegmentsV17324[index] = { ...routeMapperSegmentFromRoadV17324(road), miles: old?.miles || "", turn: old?.turn || "", note: old?.note || "" };
      routeInteractiveSelectedStepV17327 = index;
      routeInteractiveUseDraftV17327 = true;
      routeMapperDraftSaveV17324();
      routeMapperRenderSegmentsV17324();
      routeBacktraceMemoryV17325.clear();
      routeInteractiveCloseCandidateSheetV17327();
      showToast(`Step ${index + 1} changed to ${road.canonical_name}`);
      try { await routeBacktraceRunV17325(); } catch {}
      routeInteractiveRenderEditBarV17327();
    }

    function routeInteractiveRenderCandidateSheetV17327(candidates, point) {
      const map = routeInteractiveMapV17327;
      if (!map?.root) return;
      routeInteractiveCloseCandidateSheetV17327();
      const sheet = document.createElement("div");
      sheet.className = "route-map-road-sheet-v17327";
      const options = routeMapperSegmentsV17324.map((segment, index) => `<option value="${index}" ${index === routeInteractiveSelectedStepV17327 ? "selected" : ""}>${index + 1}. ${esc(segment.roadName)}</option>`).join("");
      sheet.innerHTML = `<div class="route-map-road-sheet-head"><div><strong>Roads near tapped point</strong><small>${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</small></div><button type="button" data-route-road-sheet-close aria-label="Close">×</button></div><label>Replace route step<select data-route-road-step>${options}</select></label><div class="route-map-road-candidates">${candidates.length ? candidates.map((candidate, index) => `<button type="button" data-route-road-candidate="${index}"><span><strong>${esc(routeInteractiveCandidateNameV17327(candidate))}</strong><small>${esc([candidate.tags?.highway, candidate.tags?.surface, candidate.tags?.access].filter(Boolean).join(" • ") || "Mapped road")}</small></span><b>Use</b></button>`).join("") : `<p>No mapped road was found close enough to that tap.</p>`}</div>`;
      map.root.appendChild(sheet);
      sheet.querySelector("[data-route-road-sheet-close]").onclick = routeInteractiveCloseCandidateSheetV17327;
      const stepSelect = sheet.querySelector("[data-route-road-step]");
      stepSelect.onchange = () => { routeInteractiveSelectedStepV17327 = Number(stepSelect.value); routeInteractiveRenderEditBarV17327(); };
      sheet.querySelectorAll("[data-route-road-candidate]").forEach(button => button.onclick = async () => {
        button.disabled = true; button.querySelector("b").textContent = "Saving…";
        try { await routeInteractiveUseCandidateV17327(candidates[Number(button.dataset.routeRoadCandidate)], stepSelect.value); }
        catch (error) { button.disabled = false; button.querySelector("b").textContent = "Use"; showToast(error?.message || "Could not use this road"); }
      });
    }

    async function routeInteractiveTapRoadV17327(x, y) {
      const point = routeInteractiveLatLngFromScreenV17327(x, y);
      if (!point) return;
      const status = routeInteractiveMapV17327?.root?.querySelector("[data-route-map-edit-status]");
      if (status) status.textContent = "Checking roads at tap…";
      try {
        const candidates = await routeInteractiveLookupRoadsV17327(point);
        routeInteractiveRenderCandidateSheetV17327(candidates, point);
        if (status) status.textContent = candidates.length ? "Choose the correct road below" : "No nearby mapped road found";
      } catch (error) {
        if (status) status.textContent = error?.message || "Road lookup unavailable";
        showToast(error?.message || "Road lookup unavailable");
      }
    }

    function routeInteractiveRenderEditBarV17327() {
      const root = routeInteractiveMapV17327?.root;
      if (!root) return;
      const bar = root.querySelector(".route-map-edit-bar-v17327");
      if (!bar) return;
      const segment = routeMapperSegmentsV17324[routeInteractiveSelectedStepV17327];
      bar.hidden = !routeInteractiveEditModeV17327;
      const selected = bar.querySelector("[data-route-map-selected-step]");
      if (selected) selected.textContent = segment ? `Fix step ${routeInteractiveSelectedStepV17327 + 1}: ${segment.roadName}` : "Choose a route step below";
      const chips = bar.querySelector("[data-route-map-step-chips]");
      if (chips) chips.innerHTML = routeMapperSegmentsV17324.map((row, index) => `<button type="button" class="${index === routeInteractiveSelectedStepV17327 ? "active" : ""}" data-route-map-step="${index}">${index + 1}. ${esc(row.roadName)}</button>`).join("");
      chips?.querySelectorAll("[data-route-map-step]").forEach(button => button.onclick = () => { routeInteractiveSelectedStepV17327 = Number(button.dataset.routeMapStep); routeInteractiveRenderEditBarV17327(); });
    }

    async function routeInteractiveToggleEditV17327() {
      await routeInteractiveSeedSegmentsV17327();
      if (!routeMapperSegmentsV17324.length) { showToast("No road sequence is available to edit"); return; }
      routeInteractiveEditModeV17327 = !routeInteractiveEditModeV17327;
      routeInteractiveUseDraftV17327 = routeInteractiveEditModeV17327 || routeInteractiveUseDraftV17327;
      const button = routeInteractiveMapV17327?.root?.querySelector("[data-route-map-edit]");
      if (button) { button.classList.toggle("active", routeInteractiveEditModeV17327); button.textContent = routeInteractiveEditModeV17327 ? "Done editing" : "Edit route"; }
      routeMapperRenderSegmentsV17324();
      routeInteractiveRenderEditBarV17327();
      showToast(routeInteractiveEditModeV17327 ? "Select a route step, then tap the correct road on the map" : "Map edit mode closed");
    }

    function routeInteractiveWirePointersV17327(map) {
      const root = map.root;
      root.onpointerdown = event => {
        if (event.target.closest("button,select,.route-map-road-sheet-v17327,.route-map-edit-bar-v17327")) return;
        root.setPointerCapture?.(event.pointerId);
        map.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
        map.moved = false;
        if (map.pointers.size === 2) {
          const points = Array.from(map.pointers.values());
          map.pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        }
      };
      root.onpointermove = event => {
        const pointer = map.pointers.get(event.pointerId); if (!pointer) return;
        const previous = { x: pointer.x, y: pointer.y }; pointer.x = event.clientX; pointer.y = event.clientY;
        if (Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > 6) map.moved = true;
        if (map.pointers.size === 1) {
          routeInteractivePanPixelsV17327(pointer.x - previous.x, pointer.y - previous.y);
        } else if (map.pointers.size === 2) {
          const points = Array.from(map.pointers.values());
          const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
          if (map.pinchDistance && distance / map.pinchDistance > 1.22) { routeInteractiveSetZoomV17327(map.zoom + 1, map.root.clientWidth / 2, map.root.clientHeight / 2); map.pinchDistance = distance; }
          else if (map.pinchDistance && distance / map.pinchDistance < 0.82) { routeInteractiveSetZoomV17327(map.zoom - 1, map.root.clientWidth / 2, map.root.clientHeight / 2); map.pinchDistance = distance; }
        }
      };
      root.onpointerup = event => {
        const pointer = map.pointers.get(event.pointerId);
        const rect = root.getBoundingClientRect();
        const shouldTap = Boolean(pointer && !map.moved && routeInteractiveEditModeV17327 && map.pointers.size === 1);
        map.pointers.delete(event.pointerId);
        map.pinchDistance = null;
        if (shouldTap) routeInteractiveTapRoadV17327(event.clientX - rect.left, event.clientY - rect.top);
      };
      root.onpointercancel = event => { map.pointers.delete(event.pointerId); map.pinchDistance = null; };
      root.ondblclick = event => { event.preventDefault(); const rect = root.getBoundingClientRect(); routeInteractiveSetZoomV17327(map.zoom + 1, event.clientX - rect.left, event.clientY - rect.top); };
      root.onwheel = event => { event.preventDefault(); const rect = root.getBoundingClientRect(); routeInteractiveSetZoomV17327(map.zoom + (event.deltaY < 0 ? 1 : -1), event.clientX - rect.left, event.clientY - rect.top); };
    }

    function routeInteractiveMountV17327() {
      const frame = document.querySelector(".route-mapper-map-frame");
      const iframe = frame?.querySelector("iframe");
      const pad = routeMapperSelectedPadV17324;
      const coords = routeMapperPadCoordinateV17324(pad);
      if (!frame || !coords) return;
      if (iframe) iframe.style.display = "none";
      let root = frame.querySelector(".route-interactive-map-v17327");
      if (!root) {
        root = document.createElement("div");
        root.className = "route-interactive-map-v17327";
        root.innerHTML = `<div class="route-interactive-tiles-v17327"></div><svg class="route-interactive-overlay-v17327" aria-hidden="true"></svg><div class="route-interactive-controls-v17327"><button type="button" data-route-map-zoom-in aria-label="Zoom in">＋</button><span data-route-map-zoom>14</span><button type="button" data-route-map-zoom-out aria-label="Zoom out">−</button><button type="button" data-route-map-center>Pad</button><button type="button" data-route-map-edit>Edit route</button><button type="button" data-route-map-fullscreen>Full screen</button></div><div class="route-map-edit-bar-v17327" hidden><strong data-route-map-selected-step></strong><small data-route-map-edit-status>Select a step, then tap the correct road</small><div data-route-map-step-chips></div></div><div class="route-interactive-attribution-v17327">© OpenStreetMap contributors</div>`;
        frame.appendChild(root);
      }
      routeInteractiveMapV17327 = { root, tiles: root.querySelector(".route-interactive-tiles-v17327"), overlay: root.querySelector(".route-interactive-overlay-v17327"), center: { lat: coords.lat, lng: coords.lng }, zoom: 14, pointers: new Map(), moved: false, pinchDistance: null };
      routeInteractiveWirePointersV17327(routeInteractiveMapV17327);
      root.querySelector("[data-route-map-zoom-in]").onclick = () => routeInteractiveSetZoomV17327(routeInteractiveMapV17327.zoom + 1);
      root.querySelector("[data-route-map-zoom-out]").onclick = () => routeInteractiveSetZoomV17327(routeInteractiveMapV17327.zoom - 1);
      root.querySelector("[data-route-map-center]").onclick = () => { routeInteractiveMapV17327.center = { lat: coords.lat, lng: coords.lng }; routeInteractiveRenderV17327(); };
      root.querySelector("[data-route-map-edit]").onclick = routeInteractiveToggleEditV17327;
      root.querySelector("[data-route-map-fullscreen]").onclick = () => routeInteractiveToggleFullscreenV17327();
      routeInteractiveRenderEditBarV17327();
      routeInteractiveRenderV17327();
    }

    const routeInteractiveBacktraceRenderBeforeV17327 = routeBacktraceRenderV17325;
    routeBacktraceRenderV17325 = function routeBacktraceRenderInteractiveV17327(result) {
      routeInteractiveTraceResultV17327 = result;
      routeInteractiveBacktraceRenderBeforeV17327(result);
      document.querySelector(".route-backtrace-overlay-v17325")?.remove();
      routeInteractiveMountV17327();
      routeInteractiveRenderV17327();
    };

    const routeInteractiveBacktraceClearBeforeV17327 = routeBacktraceClearV17325;
    routeBacktraceClearV17325 = function routeBacktraceClearInteractiveV17327() {
      routeInteractiveTraceResultV17327 = null;
      routeInteractiveBacktraceClearBeforeV17327();
      routeInteractiveMountV17327();
      routeInteractiveRenderV17327();
    };

    function routeInteractiveMergedSequenceV17327(pad, segments) {
      const original = routeInteractiveSavedPrimaryTokensV17327(pad);
      if (!original.length) return segments.map(segment => segment.roadName);
      const output = [];
      let roadIndex = 0;
      for (const token of original) {
        if (routeBacktraceTokenKindV17325(token) === "road") {
          if (roadIndex < segments.length) output.push(segments[roadIndex++].roadName);
        } else output.push(token);
      }
      const extras = segments.slice(roadIndex).map(segment => segment.roadName);
      if (extras.length) {
        const accessIndex = output.findIndex(token => routeBacktraceTokenKindV17325(token) === "access");
        if (accessIndex >= 0) output.splice(accessIndex, 0, ...extras); else output.push(...extras);
      }
      return output.filter(Boolean);
    }

    function routeInteractiveTurnPhraseV17327(turn, road, first = false) {
      const map = { left: "Turn left on", right: "Turn right on", slight_left: "Slight left on", slight_right: "Slight right on", merge_left: "Merge left onto", merge_right: "Merge right onto", straight: "Continue on", arrive: "Arrive via" };
      if (!turn && first) return `Take ${road}`;
      if (!turn) return "";
      return `${map[turn] || "Continue on"} ${road}`;
    }

    function routeInteractiveOperationalNotesV17327(pad) {
      const raw = String(pad?.directionsClear || pad?.originalWrittenDirections || pad?.writtenDirections || "");
      return raw.split(/\n+|(?<=[.!])\s+/).map(normalize).filter(value => /\b(?:door code|gate code|cb\s*(?:channel)?|load out|loadout|curfew|one lane|narrow|warning|do not|4\s*(?:in|inch)|female|male)\b/i.test(value) && !/hospital|medical park/i.test(value)).slice(0, 8);
    }

    function routeInteractiveBuildClearDirectionsV17327(pad, segments) {
      const merged = routeInteractiveMergedSequenceV17327(pad, segments);
      const instructions = [];
      let roadIndex = 0;
      for (const token of merged) {
        const kind = routeBacktraceTokenKindV17325(token);
        if (kind === "road") {
          const segment = segments[roadIndex++];
          if (!segment) continue;
          const phrase = routeInteractiveTurnPhraseV17327(segment.turn, segment.roadName, roadIndex === 1);
          if (!phrase) throw new Error(`Set the turn for step ${roadIndex}: ${segment.roadName}`);
          const miles = String(segment.miles || "").trim();
          instructions.push(`${phrase}${miles ? ` — ${Number(miles).toFixed(Number(miles) % 1 ? 2 : 0).replace(/0+$/, "").replace(/\.$/, "")} mi` : ""}`);
        } else if (kind === "exit") instructions.push(`Take ${token}`);
        else if (kind === "access" && !segments.some(segment => segment.roadType === "access" || /access|lease/i.test(segment.roadName))) instructions.push(`Enter ${token.toLowerCase()}`);
      }
      const notes = routeInteractiveOperationalNotesV17327(pad);
      return `${instructions.map((line, index) => `${index + 1}. ${line}`).join("\n")}${notes.length ? `\n\nNotes:\n${notes.map(note => `• ${note}`).join("\n")}` : ""}`.trim();
    }

    function routeInteractivePadRoadBodiesV17327(pad, segments, clearDirections) {
      const now = new Date().toISOString();
      return segments.map((segment, index) => ({
        pad_id: routeMapperPadIdV17324(pad),
        road_id: segment.roadId,
        route_group: "primary",
        step_order: index + 1,
        instruction: routeInteractiveTurnPhraseV17327(segment.turn, segment.roadName, index === 0),
        direction: null,
        distance_miles: segment.miles === "" ? null : Number(segment.miles),
        step_note: segment.note || null,
        route_variant_index: 0,
        turn_direction: segment.turn || null,
        distance_source: segment.miles === "" ? null : "owner_interactive_map",
        distance_status: segment.miles === "" ? "not_measured" : "map_measured",
        source_details: { method: "owner_interactive_route_map_v17327", published_at: now, clear_direction_snapshot: clearDirections },
        match_confidence: 1
      }));
    }

    async function routeInteractivePublishV17327() {
      const pad = routeMapperSelectedPadV17324;
      const button = document.getElementById("routeMapperSaveReview");
      const status = document.getElementById("routeMapperSaveStatus");
      if (!pad || !routeMapperPadIdV17324(pad)) throw new Error("This pad does not have a live database ID");
      await routeInteractiveSeedSegmentsV17327();
      if (!routeMapperSegmentsV17324.length) throw new Error("Add or map the route roads first");
      const missingRoad = routeMapperSegmentsV17324.findIndex(segment => !segment.roadId);
      if (missingRoad >= 0) throw new Error(`Map-match or add Road Manager step ${missingRoad + 1}: ${routeMapperSegmentsV17324[missingRoad].roadName}`);
      routeMapperSegmentsV17324.forEach((segment, index) => {
        if (index > 0 && !segment.turn) throw new Error(`Set the turn for step ${index + 1}: ${segment.roadName}`);
        if (segment.miles !== "" && (!Number.isFinite(Number(segment.miles)) || Number(segment.miles) < 0)) throw new Error(`Mileage for step ${index + 1} is invalid`);
      });
      if (button) { button.disabled = true; button.textContent = "Saving route + directions…"; }
      if (status) status.textContent = "Saving Road Manager review…";
      const oldSave = routeInteractiveOriginalSaveReviewV17327;
      await oldSave();
      if (!routeMapperReviewV17324?.id) throw new Error("Could not save the route review before publishing");
      const sequence = routeInteractiveMergedSequenceV17327(pad, routeMapperSegmentsV17324).join(" → ");
      const clearDirections = routeInteractiveBuildClearDirectionsV17327(pad, routeMapperSegmentsV17324);
      const padId = routeMapperPadIdV17324(pad);
      const now = new Date().toISOString();
      if (status) status.textContent = "Updating canonical pad roads…";
      const previousPadRoads = await editorRequest(`/rest/v1/brinesearch_pad_roads?select=*&pad_id=eq.${encodeURIComponent(padId)}&route_group=eq.primary&route_variant_index=eq.0&order=step_order.asc`, { method: "GET" }).catch(() => []);
      try {
        await editorRequest(`/rest/v1/brinesearch_pad_roads?pad_id=eq.${encodeURIComponent(padId)}&route_group=eq.primary&route_variant_index=eq.0`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        const bodies = routeInteractivePadRoadBodiesV17327(pad, routeMapperSegmentsV17324, clearDirections);
        if (bodies.length) await editorRequest("/rest/v1/brinesearch_pad_roads", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(bodies) });
      } catch (error) {
        if (Array.isArray(previousPadRoads) && previousPadRoads.length) {
          const restore = previousPadRoads.map(({ id, created_at, updated_at, created_by, updated_by, ...row }) => row);
          await editorRequest("/rest/v1/brinesearch_pad_roads", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(restore) }).catch(() => {});
        }
        throw error;
      }
      if (status) status.textContent = "Updating live Clear Directions…";
      const updateBody = {
        structured_road_sequence: sequence,
        directions_clear: clearDirections,
        directions_clear_method: "owner_interactive_route_map_v17327",
        directions_clear_updated_at: now,
        directions_clear_updated_by: editorSession?.user?.id || null,
        road_sequence_status: "owner_verified",
        road_sequence_reviewed_date: now.slice(0, 10),
        number_of_road_steps: routeMapperSegmentsV17324.length,
        last_updated_by: editorProfile?.display_name || editorSession?.user?.email || "BrineSearch Owner",
        last_updated_date: now,
        updated_by: editorSession?.user?.id || null,
        updated_at: now
      };
      await editorRequest(`/rest/v1/pads?id=eq.${encodeURIComponent(padId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(updateBody) });
      await editorRequest(`/rest/v1/brinesearch_route_reviews?id=eq.${encodeURIComponent(routeMapperReviewV17324.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "approved", reviewed_by: editorSession?.user?.id || null, reviewed_at: now, approved_at: now, updated_at: now }) }).catch(() => {});
      pad.Structured_Road_Sequence = sequence;
      pad.directionsClear = clearDirections;
      pad.directions_clear = clearDirections;
      pad.directions_clear_method = "owner_interactive_route_map_v17327";
      routeInteractiveUseDraftV17327 = false;
      routeBacktraceMemoryV17325.clear();
      if (status) status.textContent = "Route, Road Manager roads, mileage/turns, and live Clear Directions are synchronized.";
      showToast("Route and driver directions updated");
      if (button) { button.disabled = false; button.textContent = "Save route & update directions"; }
    }

    const routeInteractiveOriginalSaveReviewV17327 = routeMapperSaveReviewV17324;
    routeMapperSaveReviewV17324 = async function routeMapperSaveAndPublishV17327() {
      const button = document.getElementById("routeMapperSaveReview");
      const status = document.getElementById("routeMapperSaveStatus");
      try { await routeInteractivePublishV17327(); }
      catch (error) {
        if (status) status.textContent = error?.message || "Could not save route and directions.";
        showToast(error?.message || "Could not save route and directions");
        if (button) { button.disabled = false; button.textContent = "Save route & update directions"; }
      }
    };

    const routeInteractiveRenderWorkspaceBeforeV17327 = routeMapperRenderWorkspaceV17324;
    routeMapperRenderWorkspaceV17324 = function routeMapperRenderInteractiveWorkspaceV17327() {
      routeInteractiveRenderWorkspaceBeforeV17327();
      const pad = routeMapperSelectedPadV17324;
      if (!pad) return;
      const button = document.getElementById("routeMapperSaveReview"); if (button) button.textContent = "Save route & update directions";
      const noPublish = document.querySelector(".route-mapper-no-publish");
      if (noPublish) noPublish.textContent = "Map edits remain a local/Owner review until you tap Save route & update directions. That action synchronizes the Road Manager route, structured road sequence, mileage/turns and live Clear Directions together.";
      const saveLabel = document.querySelector(".route-mapper-save-row strong"); if (saveLabel) saveLabel.textContent = "Publish corrected route";
      setTimeout(routeInteractiveMountV17327, 0);
    };

    window.routeInteractivePublishV17327 = routeInteractivePublishV17327;
    window.routeInteractiveMapVersionV17327 = "17.3.27";
