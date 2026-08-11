    /* GitHub #69 — final runtime hardening.
       Keeps asynchronous map/RPC responses bound to the pad + topology that
       launched them, strictly reloads the canonical route after publication,
       makes geometry mileage read-only, invalidates turns when topology changes,
       and renders an explicit reverse-route preview from stored inbound turns. */

    let routeIssue69PadGeneration = 0;
    let routeIssue69TopologyGeneration = 0;
    let routeIssue69PublishGeneration = 0;
    let routeIssue69ReversePreview = false;

    function routeIssue69CurrentPadId() {
      return routeMapperPadIdV17324(routeMapperSelectedPadV17324) || "";
    }

    function routeIssue69BumpTopology() {
      routeIssue69TopologyGeneration += 1;
      routeIssue69BoundaryMode = null;
      routeIssue69BoundarySheetClose();
      return routeIssue69TopologyGeneration;
    }

    function routeIssue69PointEqual(a, b, tolerance = 1e-12) {
      const left = routeIssue69Coordinate(a), right = routeIssue69Coordinate(b);
      return Boolean(left && right
        && Math.abs(left[0] - right[0]) <= tolerance
        && Math.abs(left[1] - right[1]) <= tolerance);
    }

    function routeIssue69TopologySignature() {
      return JSON.stringify({
        padId: routeIssue69CurrentPadId(),
        steps: (routeMapperSegmentsV17324 || []).map(segment => ({
          routeStepId: segment?.routeStepId || null,
          roadId: segment?.roadId || null,
          start: routeIssue69Coordinate(segment?.startCoordinate),
          end: routeIssue69Coordinate(segment?.endCoordinate),
          turn: segment?.turn || null,
          inboundTurn: segment?.inboundTurn || null
        }))
      });
    }

    function routeIssue69NormalizeDraftSegment(segment) {
      return {
        ...segment,
        routeStepId: segment?.routeStepId || routeIssue69Uuid(),
        startCoordinate: routeIssue69Coordinate(segment?.startCoordinate),
        endCoordinate: routeIssue69Coordinate(segment?.endCoordinate),
        clippedGeometry: routeIssue69Line(segment?.clippedGeometry),
        aliases: Array.isArray(segment?.aliases) ? [...segment.aliases] : [],
        inboundTurn: segment?.inboundTurn || "",
        geometryVersion: Number(segment?.geometryVersion || 0),
        routeRevision: Number(segment?.routeRevision || 0)
      };
    }

    function routeIssue69ValidateStructuredPayload(payload, options = {}) {
      if (!payload || typeof payload !== "object") throw new Error("Structured route reload returned no payload");
      const revision = Number(payload.route_revision);
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Structured route reload returned an invalid revision");
      if (options.expectedRevision != null && revision !== Number(options.expectedRevision)) {
        throw new Error(`Published route revision ${options.expectedRevision} reloaded as ${revision}`);
      }
      const rawSteps = payload.structured_route_steps || payload.steps || [];
      if (!Array.isArray(rawSteps)) throw new Error("Structured route reload did not return a step array");
      const canonicalCount = payload.canonical_step_count == null ? rawSteps.length : Number(payload.canonical_step_count);
      const exactCount = payload.exact_step_count == null ? rawSteps.length : Number(payload.exact_step_count);
      if (rawSteps.length && (canonicalCount !== rawSteps.length || exactCount !== rawSteps.length)) {
        throw new Error("Structured route reload is incomplete or mixed with unresolved legacy rows");
      }
      const steps = rawSteps.map(routeIssue69StructuredSegment);
      const ids = new Set();
      steps.forEach((segment, index) => {
        if (!segment.routeStepId || ids.has(segment.routeStepId)) throw new Error(`Reloaded step ${index + 1} has an invalid occurrence ID`);
        ids.add(segment.routeStepId);
        if (!segment.roadId) throw new Error(`Reloaded step ${index + 1} has no Road Manager ID`);
        if (!routeIssue69HasExactGeometry(segment)) throw new Error(`Reloaded step ${index + 1} is not exact geometry version 1`);
        if (!Number.isFinite(Number(segment.miles)) || Number(segment.miles) <= 0) throw new Error(`Reloaded step ${index + 1} has invalid geometry mileage`);
        if (index > 0 && !routeIssue69PointEqual(steps[index - 1].endCoordinate, segment.startCoordinate)) {
          throw new Error(`Reloaded step ${index + 1} is not exactly continuous with the prior occurrence`);
        }
      });
      if (Array.isArray(options.expectedStepIds)) {
        const actual = steps.map(segment => segment.routeStepId);
        if (actual.length !== options.expectedStepIds.length
          || actual.some((value, index) => value !== options.expectedStepIds[index])) {
          throw new Error("Reloaded occurrence sequence differs from the published route");
        }
      }
      if (payload.driver_safety_context != null && !Array.isArray(payload.driver_safety_context)) {
        throw new Error("Reloaded driver-safety snapshot is not an array");
      }
      return { revision, steps };
    }

    async function routeIssue69FetchStructuredPayload(padId) {
      const response = await editorRequest("/rest/v1/rpc/brinesearch_get_structured_route_steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_pad_id: padId })
      });
      return Array.isArray(response) ? response[0] : response;
    }

    async function routeIssue69FetchLegacyReviewSnapshot(pad) {
      const padId = routeMapperPadIdV17324(pad);
      if (!padId) return { review: null, segments: routeMapperLocalDraftV17324(pad).map(routeIssue69NormalizeDraftSegment) };
      const reviews = await editorRequest(`/rest/v1/brinesearch_route_reviews?select=*&pad_id=eq.${encodeURIComponent(padId)}&limit=1`, { method: "GET" });
      const review = Array.isArray(reviews) ? reviews[0] : null;
      if (!review?.id) return { review: null, segments: routeMapperLocalDraftV17324(pad).map(routeIssue69NormalizeDraftSegment) };
      const stored = await editorRequest(`/rest/v1/brinesearch_route_review_segments?select=*&review_id=eq.${encodeURIComponent(review.id)}&order=outbound_order.asc,id.asc`, { method: "GET" });
      if (!Array.isArray(stored) || !stored.length) return { review, segments: routeMapperLocalDraftV17324(pad).map(routeIssue69NormalizeDraftSegment) };
      const ids = Array.from(new Set(stored.map(row => row.road_id).filter(Boolean)));
      let roadMap = new Map();
      if (ids.length) {
        const roads = await editorRequest(`/rest/v1/brinesearch_roads?select=*&id=in.(${ids.join(",")})`, { method: "GET" });
        roadMap = new Map((Array.isArray(roads) ? roads : []).map(road => [road.id, road]));
      }
      const segments = stored.map(row => {
        const road = roadMap.get(row.road_id) || {};
        return routeIssue69NormalizeDraftSegment({
          ...routeMapperSegmentFromRoadV17324({ ...road, id: row.road_id || road.id, canonical_name: road.canonical_name || row.official_road_name || row.road_name }),
          miles: row.miles == null ? "" : String(row.miles),
          turn: row.outbound_turn || "",
          inboundTurn: row.inbound_turn || "",
          note: row.evidence?.note || ""
        });
      });
      return { review, segments };
    }

    routeMapperLoadReviewV17324 = async function routeMapperLoadReviewRaceSafeIssue69(pad) {
      const padId = routeMapperPadIdV17324(pad);
      const loadGeneration = ++routeIssue69PadGeneration;
      routeIssue69BumpTopology();
      routeIssue69State = { padId, routeRevision: 0, reviewId: null, loaded: false };
      if (!padId) {
        if (routeMapperSelectedPadV17324 === pad && loadGeneration === routeIssue69PadGeneration) {
          routeMapperReviewV17324 = null;
          routeMapperSegmentsV17324 = routeMapperLocalDraftV17324(pad).map(routeIssue69NormalizeDraftSegment);
        }
        return;
      }
      try {
        const payload = await routeIssue69FetchStructuredPayload(padId);
        if (loadGeneration !== routeIssue69PadGeneration || routeIssue69CurrentPadId() !== padId) return;
        const validated = routeIssue69ValidateStructuredPayload(payload);
        if (validated.steps.length) {
          routeIssue69State = { padId, routeRevision: validated.revision, reviewId: payload?.review_id || null, loaded: true };
          routeMapperReviewV17324 = payload?.review_id ? { id: payload.review_id, status: "approved" } : null;
          routeMapperSegmentsV17324 = validated.steps;
          routeIssue69DraftSave();
          routeIssue69BumpTopology();
          return;
        }

        const legacy = await routeIssue69FetchLegacyReviewSnapshot(pad);
        if (loadGeneration !== routeIssue69PadGeneration || routeIssue69CurrentPadId() !== padId) return;
        let segments = legacy.segments.map(routeIssue69NormalizeDraftSegment);
        const rich = routeIssue69RichDraft(pad);
        const sameRoadSequence = Boolean(rich?.steps?.length === segments.length
          && rich.steps.every((step, index) => String(step.roadId || "") === String(segments[index]?.roadId || "")));
        if (sameRoadSequence && Number(rich.routeRevision || 0) === validated.revision) {
          segments = segments.map((segment, index) => routeIssue69NormalizeDraftSegment({ ...segment, ...rich.steps[index] }));
        }
        routeIssue69State = {
          padId,
          routeRevision: validated.revision,
          reviewId: payload?.review_id || legacy.review?.id || null,
          loaded: true
        };
        routeMapperReviewV17324 = legacy.review || null;
        routeMapperSegmentsV17324 = segments;
        routeIssue69BumpTopology();
      } catch (error) {
        if (loadGeneration !== routeIssue69PadGeneration || routeIssue69CurrentPadId() !== padId) return;
        routeIssue69State = { padId, routeRevision: 0, reviewId: null, loaded: false };
        routeMapperReviewV17324 = null;
        routeMapperSegmentsV17324 = [];
        console.warn("Exact route load failed closed", error);
        showToast("Exact route state could not be loaded. Reload before editing this route.");
      }
    };

    function routeIssue69RequestCurrent(token) {
      const segment = routeMapperSegmentsV17324[token.index];
      return routeIssue69CurrentPadId() === token.padId
        && routeIssue69TopologyGeneration === token.topologyGeneration
        && segment?.routeStepId === token.routeStepId;
    }

    async function routeIssue69ClipStepGuarded(index, topologyGeneration = routeIssue69TopologyGeneration) {
      const segment = routeMapperSegmentsV17324[Number(index)];
      if (!segment?.roadId || !routeIssue69Coordinate(segment.startCoordinate) || !routeIssue69Coordinate(segment.endCoordinate)) {
        routeIssue69ClearClip(segment);
        return false;
      }
      const token = {
        padId: routeIssue69CurrentPadId(), index: Number(index), topologyGeneration,
        routeStepId: segment.routeStepId,
        start: routeIssue69Coordinate(segment.startCoordinate), end: routeIssue69Coordinate(segment.endCoordinate)
      };
      const result = await routeIssue69Rpc("brinesearch_route_step_clip", {
        p_road_id: segment.roadId,
        p_start_coordinate: token.start,
        p_end_coordinate: token.end
      });
      if (!routeIssue69RequestCurrent(token)
        || !routeIssue69PointEqual(segment.startCoordinate, token.start)
        || !routeIssue69PointEqual(segment.endCoordinate, token.end)) return false;
      if (!result?.resolved) {
        routeIssue69ClearClip(segment);
        showToast(`Step ${token.index + 1} geometry unresolved: ${String(result?.reason || "clip_unresolved").replaceAll("_", " ")}`);
        return false;
      }
      segment.startCoordinate = routeIssue69Coordinate(result.start_coordinate);
      segment.endCoordinate = routeIssue69Coordinate(result.end_coordinate);
      segment.clippedGeometry = routeIssue69Line(result.clipped_geometry);
      segment.miles = result.miles == null ? "" : String(result.miles);
      segment.aliases = Array.isArray(result.aliases) ? result.aliases : (segment.aliases || []);
      segment.geometryStatus = result.geometry_status || "snapped_intersections";
      segment.geometrySource = result.geometry_source || "road_manager_clip_issue69";
      segment.geometrySourceRecordId = result.geometry_source_record_id || segment.geometrySourceRecordId || null;
      segment.geometryVersion = 1;
      return true;
    }

    async function routeIssue69ReclipAroundGuarded(index) {
      const generation = routeIssue69TopologyGeneration;
      const indexes = Array.from(new Set([Number(index) - 1, Number(index), Number(index) + 1]))
        .filter(value => value >= 0 && value < routeMapperSegmentsV17324.length);
      for (const value of indexes) {
        if (generation !== routeIssue69TopologyGeneration) return false;
        await routeIssue69ClipStepGuarded(value, generation);
      }
      if (generation !== routeIssue69TopologyGeneration) return false;
      routeMapperDraftSaveV17324();
      routeMapperRenderSegmentsV17324();
      routeInteractiveRenderV17327();
      return true;
    }

    async function routeIssue69ApplyBoundaryGuarded(index, side, coordinate, token) {
      if (!routeIssue69RequestCurrent(token)) return false;
      const current = routeMapperSegmentsV17324[Number(index)];
      const point = routeIssue69Coordinate(coordinate);
      if (!current || !point) return false;
      if (side === "start") {
        current.startCoordinate = point;
        const previous = routeMapperSegmentsV17324[Number(index) - 1];
        if (previous) previous.endCoordinate = [...point];
      } else {
        current.endCoordinate = point;
        const next = routeMapperSegmentsV17324[Number(index) + 1];
        if (next) next.startCoordinate = [...point];
      }
      routeIssue69BoundaryMode = null;
      routeIssue69BoundarySheetClose();
      routeIssue69BumpTopology();
      await routeIssue69ReclipAroundGuarded(index);
      routeInteractiveRenderEditBarV17327();
      await routeStepSnapToV17328(index, false);
      return true;
    }

    function routeIssue69RenderBoundaryChoicesGuarded(index, side, payload, token) {
      const root = routeInteractiveMapV17327?.root;
      if (!root || !routeIssue69RequestCurrent(token)) return;
      routeIssue69BoundarySheetClose();
      const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
      const sheet = document.createElement("div");
      sheet.className = "route-boundary-sheet-issue69 route-map-road-sheet-v17327";
      sheet.innerHTML = `<div class="route-map-road-sheet-head"><div><strong>Choose exact ${side} boundary</strong><small>Multiple Road Manager nodes are valid — choose explicitly</small></div><button type="button" data-route-boundary-close aria-label="Close">×</button></div><div class="route-map-road-candidates">${candidates.map((candidate, candidateIndex) => {
        const point = routeIssue69Coordinate(candidate.coordinate) || [0, 0];
        return `<button type="button" data-route-boundary-choice="${candidateIndex}"><span><strong>${point[1].toFixed(6)}, ${point[0].toFixed(6)}</strong><small>${esc([candidate.kind || "shared node", candidate.distance_to_tap_m != null ? `${candidate.distance_to_tap_m} m from tap` : ""].filter(Boolean).join(" • "))}</small></span><b>Use</b></button>`;
      }).join("")}</div>`;
      root.appendChild(sheet);
      sheet.querySelector("[data-route-boundary-close]").onclick = () => {
        routeIssue69BoundaryMode = null;
        routeIssue69BoundarySheetClose();
        routeInteractiveRenderEditBarV17327();
      };
      sheet.querySelectorAll("[data-route-boundary-choice]").forEach(button => {
        button.onclick = async () => {
          if (!routeIssue69RequestCurrent(token)) { routeIssue69BoundarySheetClose(); return; }
          const candidate = candidates[Number(button.dataset.routeBoundaryChoice)];
          if (!candidate) return;
          button.disabled = true;
          try { await routeIssue69ApplyBoundaryGuarded(index, side, candidate.coordinate, token); }
          catch (error) { button.disabled = false; showToast(error?.message || "Could not set route boundary"); }
        };
      });
    }

    async function routeIssue69ResolveBoundaryTapGuarded(index, side, point) {
      const current = routeMapperSegmentsV17324[Number(index)];
      if (!current?.roadId) throw new Error("Selected step has no Road Manager road ID");
      const token = {
        padId: routeIssue69CurrentPadId(), index: Number(index),
        topologyGeneration: routeIssue69TopologyGeneration, routeStepId: current.routeStepId
      };
      const near = [Number(point.lng), Number(point.lat)];
      const adjacent = side === "start" ? routeMapperSegmentsV17324[Number(index) - 1] : routeMapperSegmentsV17324[Number(index) + 1];
      if (!adjacent) {
        const snapped = await routeIssue69Rpc("brinesearch_route_step_snap_point", { p_road_id: current.roadId, p_near_coordinate: near });
        if (!routeIssue69RequestCurrent(token)) return;
        if (!snapped?.resolved) throw new Error(String(snapped?.reason || "route anchor unresolved").replaceAll("_", " "));
        await routeIssue69ApplyBoundaryGuarded(index, side, snapped.coordinate, token);
        return;
      }
      if (!adjacent.roadId) throw new Error("Adjacent step has no Road Manager road ID");
      const payload = await routeIssue69Rpc("brinesearch_route_step_boundary_candidates", {
        p_left_road_id: side === "start" ? adjacent.roadId : current.roadId,
        p_right_road_id: side === "start" ? current.roadId : adjacent.roadId,
        p_near_coordinate: near,
        p_limit: 8
      });
      if (!routeIssue69RequestCurrent(token)) return;
      const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
      if (!payload?.resolved || !candidates.length) throw new Error(String(payload?.reason || "no shared Road Manager intersection").replaceAll("_", " "));
      if (payload?.ambiguous || Number(payload?.candidate_count || candidates.length) !== 1 || payload?.candidates_truncated) {
        routeIssue69RenderBoundaryChoicesGuarded(index, side, payload, token);
        return;
      }
      await routeIssue69ApplyBoundaryGuarded(index, side, candidates[0].coordinate, token);
    }

    const routeIssue69TapBeforeHardening = routeInteractiveTapRoadV17327;
    routeInteractiveTapRoadV17327 = async function routeInteractiveTapRaceSafeIssue69(x, y) {
      if (!routeIssue69BoundaryMode) return routeIssue69TapBeforeHardening(x, y);
      const point = routeInteractiveLatLngFromScreenV17327(x, y);
      if (!point) return;
      const side = routeIssue69BoundaryMode;
      const index = Number(routeInteractiveSelectedStepV17327);
      const status = routeInteractiveMapV17327?.root?.querySelector("[data-route-map-edit-status]");
      if (status) status.textContent = `Resolving ${side} boundary from Road Manager topology…`;
      try {
        await routeIssue69ResolveBoundaryTapGuarded(index, side, point);
        if (status && !routeIssue69BoundaryMode) status.textContent = `Step ${index + 1} ${side} boundary set.`;
      } catch (error) {
        routeIssue69BoundaryMode = null;
        routeIssue69BoundarySheetClose();
        if (status) status.textContent = error?.message || "Boundary could not be resolved";
        showToast(error?.message || "Boundary could not be resolved");
        routeInteractiveRenderEditBarV17327();
      }
    };

    function routeIssue69InvalidateTransitionTurns(index) {
      const previous = routeMapperSegmentsV17324[index - 1];
      const current = routeMapperSegmentsV17324[index];
      const next = routeMapperSegmentsV17324[index + 1];
      if (current && index > 0) current.turn = "";
      if (previous) previous.inboundTurn = "";
      if (current && next) current.inboundTurn = "";
      if (next) next.turn = "";
    }

    routeInteractiveUseCandidateV17327 = async function routeInteractiveUseCandidateRaceSafeIssue69(candidate, stepIndex) {
      const action = typeof window.routeStepEditActionV17328 === "function" ? window.routeStepEditActionV17328() : "replace";
      let index = Number.isInteger(routeInteractiveSelectedStepV17327) ? Number(routeInteractiveSelectedStepV17327) : Number(stepIndex);
      if (!Number.isInteger(index) || index < 0) index = 0;
      const token = { padId: routeIssue69CurrentPadId(), topologyGeneration: routeIssue69TopologyGeneration };
      const old = routeMapperSegmentsV17324[index];
      const road = await routeInteractiveEnsureRoadRecordV17327(candidate);
      if (token.padId !== routeIssue69CurrentPadId() || token.topologyGeneration !== routeIssue69TopologyGeneration) return;
      const fresh = routeMapperSegmentFromRoadV17324(road);
      let selected = index;
      if (action === "before") {
        routeMapperSegmentsV17324.splice(index, 0, fresh);
      } else if (action === "after") {
        selected = Math.min(index + 1, routeMapperSegmentsV17324.length);
        routeMapperSegmentsV17324.splice(selected, 0, fresh);
      } else {
        if (!old) throw new Error("Choose the route step to replace first");
        routeMapperSegmentsV17324[index] = {
          ...fresh,
          routeStepId: old.routeStepId || routeIssue69Uuid(),
          note: old.note || "",
          turn: old.turn || "",
          inboundTurn: old.inboundTurn || ""
        };
      }
      routeInteractiveSelectedStepV17327 = selected;
      routeStepEditActionV17328 = "replace";
      routeInteractiveUseDraftV17327 = true;
      routeIssue69BumpTopology();
      routeIssue69InvalidateWindow(selected, true);
      routeIssue69InvalidateTransitionTurns(selected);
      routeMapperDraftSaveV17324();
      routeMapperRenderSegmentsV17324();
      routeInteractiveCloseCandidateSheetV17327();
      routeInteractiveRenderEditBarV17327();
      routeInteractiveRenderV17327();
      showToast(action === "before" ? `Added ${road.canonical_name} before step ${selected + 2}` : action === "after" ? `Added ${road.canonical_name} as step ${selected + 1}` : `Step ${selected + 1} moved to ${road.canonical_name}; confirm both adjacent turns`);
    };

    routeStepRemoveSelectedV17328 = async function routeStepRemoveExactIssue69() {
      const index = Number(routeInteractiveSelectedStepV17327);
      const segment = routeMapperSegmentsV17324[index];
      if (!segment) return;
      if (!window.confirm(`Remove step ${index + 1}: ${segment.roadName} from this route draft?`)) return;
      routeMapperSegmentsV17324.splice(index, 1);
      routeInteractiveSelectedStepV17327 = Math.max(0, Math.min(index, routeMapperSegmentsV17324.length - 1));
      routeInteractiveUseDraftV17327 = true;
      routeStepEditActionV17328 = "replace";
      routeIssue69BumpTopology();
      const previous = routeMapperSegmentsV17324[index - 1];
      const next = routeMapperSegmentsV17324[index];
      if (previous) { previous.endCoordinate = null; routeIssue69ClearClip(previous); previous.inboundTurn = ""; }
      if (next) { next.startCoordinate = null; routeIssue69ClearClip(next); next.turn = ""; }
      routeMapperDraftSaveV17324();
      routeMapperRenderSegmentsV17324();
      routeInteractiveRenderEditBarV17327();
      routeInteractiveRenderV17327();
      showToast(`${segment.roadName} removed; the new shared boundary and turns must be confirmed`);
    };

    function routeIssue69ClearAllTopologyAfterReorder() {
      routeIssue69BumpTopology();
      routeMapperSegmentsV17324.forEach(segment => {
        routeIssue69ClearClip(segment);
        segment.startCoordinate = null;
        segment.endCoordinate = null;
        segment.turn = "";
        segment.inboundTurn = "";
      });
      routeMapperDraftSaveV17324();
      routeMapperRenderSegmentsV17324();
      routeInteractiveRenderV17327();
      showToast("Route order changed — all exact boundaries and transition turns must be re-established");
    }

    const routeIssue69RenderSegmentsBeforeHardening = routeMapperRenderSegmentsV17324;
    routeMapperRenderSegmentsV17324 = function routeMapperRenderRuntimeHardeningIssue69() {
      routeIssue69RenderSegmentsBeforeHardening();
      const host = document.getElementById("routeMapperSegments");
      const totalHost = document.getElementById("routeMapperTotalMiles");
      let complete = routeMapperSegmentsV17324.length > 0;
      let total = 0;
      routeMapperSegmentsV17324.forEach((segment, index) => {
        const miles = host?.querySelector(`[data-route-mapper-miles="${index}"]`);
        if (miles) {
          miles.value = routeIssue69HasExactGeometry(segment) ? (segment.miles || "") : "";
          miles.readOnly = true;
          miles.oninput = null;
          miles.onchange = null;
          miles.placeholder = "Derived from geometry";
          miles.title = "Mileage is read-only and derived from exact clipped geometry";
        }
        if (!routeIssue69HasExactGeometry(segment) || !Number.isFinite(Number(segment.miles))) complete = false;
        else total += Number(segment.miles);
      });
      if (totalHost) totalHost.textContent = complete ? `Geometry mileage: ${total.toFixed(2)} mi` : "Geometry mileage incomplete";
      host?.querySelectorAll("[data-route-mapper-up]").forEach(button => {
        button.onclick = () => {
          const index = Number(button.dataset.routeMapperUp);
          if (index <= 0) return;
          [routeMapperSegmentsV17324[index - 1], routeMapperSegmentsV17324[index]] = [routeMapperSegmentsV17324[index], routeMapperSegmentsV17324[index - 1]];
          routeIssue69ClearAllTopologyAfterReorder();
        };
      });
      host?.querySelectorAll("[data-route-mapper-down]").forEach(button => {
        button.onclick = () => {
          const index = Number(button.dataset.routeMapperDown);
          if (index < 0 || index >= routeMapperSegmentsV17324.length - 1) return;
          [routeMapperSegmentsV17324[index + 1], routeMapperSegmentsV17324[index]] = [routeMapperSegmentsV17324[index], routeMapperSegmentsV17324[index + 1]];
          routeIssue69ClearAllTopologyAfterReorder();
        };
      });
    };

    function routeIssue69TurnPhraseRuntime(turn, road, first = false) {
      const labels = { left: "Turn left on", right: "Turn right on", slight_left: "Slight left on", slight_right: "Slight right on", merge_left: "Merge left onto", merge_right: "Merge right onto", straight: "Continue on", arrive: "Arrive via" };
      if (first) return `Take ${road}`;
      return `${labels[turn] || "Turn not set on"} ${road}`;
    }

    function routeIssue69ReverseCards() {
      return [...routeMapperSegmentsV17324].reverse().map((segment, reverseIndex) => ({
        routeStepId: segment.routeStepId,
        roadId: segment.roadId,
        roadName: segment.roadName,
        miles: segment.miles,
        instruction: routeIssue69TurnPhraseRuntime(segment.inboundTurn, segment.roadName, reverseIndex === 0),
        exact: routeIssue69HasExactGeometry(segment)
      }));
    }

    function routeIssue69DrawDirectionalLine(svg, map, line, className) {
      const points = line.map(point => routeInteractiveScreenPointV17327(point[1], point[0], map)).filter(Boolean);
      if (points.length < 2) return;
      const d = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
      const halo = document.createElementNS("http://www.w3.org/2000/svg", "path");
      halo.setAttribute("d", d); halo.setAttribute("class", "route-interactive-halo"); svg.appendChild(halo);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d); path.setAttribute("class", className); path.setAttribute("marker-end", "url(#route-issue69-arrow)"); svg.appendChild(path);
    }

    routeInteractiveRenderOverlayV17327 = function routeInteractiveRenderDirectionalOccurrencesIssue69(map) {
      const svg = map?.overlay;
      if (!svg || !map?.root) return;
      const width = map.root.clientWidth, height = map.root.clientHeight;
      svg.setAttribute("viewBox", `0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`);
      svg.innerHTML = `<defs><marker id="route-issue69-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 z" fill="currentColor"></path></marker></defs>`;
      const rows = routeIssue69ReversePreview
        ? [...routeMapperSegmentsV17324].map((segment, index) => ({ segment, index })).reverse()
        : routeMapperSegmentsV17324.map((segment, index) => ({ segment, index }));
      rows.forEach(({ segment, index }) => {
        const raw = routeIssue69ExactLine(segment);
        if (!raw) return;
        const line = routeIssue69ReversePreview ? [...raw].reverse() : raw;
        routeIssue69DrawDirectionalLine(svg, map, line, index === routeInteractiveSelectedStepV17327 ? "route-step-selected-v17328" : "route-interactive-road verified");
      });
      const coords = routeMapperPadCoordinateV17324(routeMapperSelectedPadV17324);
      if (coords) {
        const point = routeInteractiveScreenPointV17327(coords.lat, coords.lng, map);
        if (point) {
          const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          ring.setAttribute("cx", point.x); ring.setAttribute("cy", point.y); ring.setAttribute("r", "10"); ring.setAttribute("class", "route-interactive-pad-ring"); svg.appendChild(ring);
          const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          dot.setAttribute("cx", point.x); dot.setAttribute("cy", point.y); dot.setAttribute("r", "5"); dot.setAttribute("class", "route-interactive-pad-dot"); svg.appendChild(dot);
        }
      }
    };

    const routeIssue69RenderEditBeforeHardening = routeInteractiveRenderEditBarV17327;
    routeInteractiveRenderEditBarV17327 = function routeInteractiveRenderRuntimeHardeningIssue69() {
      routeIssue69RenderEditBeforeHardening();
      const root = routeInteractiveMapV17327?.root;
      const bar = root?.querySelector(".route-map-edit-bar-v17327");
      if (!bar || !routeInteractiveEditModeV17327) return;
      const geometryMiles = bar.querySelector("[data-route-step-miles]");
      if (geometryMiles) {
        const segment = routeMapperSegmentsV17324[routeInteractiveSelectedStepV17327];
        geometryMiles.value = routeIssue69HasExactGeometry(segment) ? (segment?.miles || "") : "";
        geometryMiles.readOnly = true;
        geometryMiles.onchange = null;
        geometryMiles.title = "Mileage is derived from exact clipped geometry";
      }
      let preview = bar.querySelector(".route-reverse-preview-issue69");
      if (!preview) {
        preview = document.createElement("div");
        preview.className = "route-reverse-preview-issue69";
        bar.appendChild(preview);
      }
      const reverseCards = routeIssue69ReverseCards();
      preview.innerHTML = `<div class="route-step-action-row-v17328"><button type="button" data-route-preview-direction="outbound" class="${routeIssue69ReversePreview ? "" : "active"}">Outbound</button><button type="button" data-route-preview-direction="inbound" class="${routeIssue69ReversePreview ? "active" : ""}">Reverse route</button></div>${routeIssue69ReversePreview ? `<div data-route-reverse-cards>${reverseCards.map((card, index) => `<div><strong>${index + 1}. ${esc(card.instruction)}</strong><small>${card.exact ? `${Number(card.miles || 0).toFixed(3)} mi` : "geometry unresolved"}</small></div>`).join("")}</div>` : ""}`;
      preview.querySelectorAll("[data-route-preview-direction]").forEach(button => {
        button.onclick = () => {
          routeIssue69ReversePreview = button.dataset.routePreviewDirection === "inbound";
          routeInteractiveRenderEditBarV17327();
          routeInteractiveRenderV17327();
        };
      });
    };

    async function routeIssue69PublishStructuredHardened() {
      const pad = routeMapperSelectedPadV17324;
      const padId = routeMapperPadIdV17324(pad);
      const button = document.getElementById("routeMapperSaveReview");
      const status = document.getElementById("routeMapperSaveStatus");
      if (!pad || !padId) throw new Error("This pad does not have a live database ID");
      if (!routeIssue69State.loaded || routeIssue69State.padId !== padId) throw new Error("Reload this pad before publishing exact route geometry");
      const publishGeneration = ++routeIssue69PublishGeneration;
      const topologyGeneration = routeIssue69TopologyGeneration;
      const signature = routeIssue69TopologySignature();
      const steps = routeIssue69PublishPayload();
      const expectedStepIds = steps.map(step => step.route_step_id);
      if (button) { button.disabled = true; button.textContent = "Publishing exact route…"; }
      if (status) status.textContent = "Server-clipping exact occurrences and validating topology…";
      try {
        const response = await editorRequest("/rest/v1/rpc/brinesearch_publish_structured_route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_pad_id: padId,
            p_review_id: routeIssue69State.reviewId || routeMapperReviewV17324?.id || null,
            p_steps: steps,
            p_expected_revision: routeIssue69State.routeRevision
          })
        });
        const published = Array.isArray(response) ? response[0] : response;
        const publishedRevision = Number(published?.route_revision);
        if (!Number.isSafeInteger(publishedRevision) || publishedRevision <= routeIssue69State.routeRevision) {
          throw new Error("Structured publisher did not return a newer durable route revision");
        }
        if (publishGeneration !== routeIssue69PublishGeneration || routeIssue69CurrentPadId() !== padId
          || topologyGeneration !== routeIssue69TopologyGeneration || signature !== routeIssue69TopologySignature()) {
          routeIssue69State.loaded = false;
          throw new Error("Route was published, but this editor changed while the request was running. Reload the pad before making another route edit.");
        }
        if (status) status.textContent = "Published. Reloading exact canonical rows before confirming success…";
        const reloaded = await routeIssue69FetchStructuredPayload(padId);
        if (publishGeneration !== routeIssue69PublishGeneration || routeIssue69CurrentPadId() !== padId
          || topologyGeneration !== routeIssue69TopologyGeneration || signature !== routeIssue69TopologySignature()) {
          routeIssue69State.loaded = false;
          throw new Error("Route published, but the pad/topology changed before reload verification. Reload the pad.");
        }
        const validated = routeIssue69ValidateStructuredPayload(reloaded, { expectedRevision: publishedRevision, expectedStepIds });
        routeMapperSegmentsV17324 = validated.steps;
        routeIssue69State = { padId, routeRevision: validated.revision, reviewId: reloaded?.review_id || null, loaded: true };
        routeMapperReviewV17324 = reloaded?.review_id ? { id: reloaded.review_id, status: "approved" } : null;
        if (reloaded?.structured_sequence) pad.Structured_Road_Sequence = reloaded.structured_sequence;
        if (reloaded?.directions_clear) {
          pad.directionsClear = reloaded.directions_clear;
          pad.directions_clear = reloaded.directions_clear;
        }
        pad.driverSafetyContext = Array.isArray(reloaded?.driver_safety_context) ? reloaded.driver_safety_context : [];
        routeInteractiveUseDraftV17327 = false;
        routeIssue69DraftSave();
        routeIssue69BumpTopology();
        routeMapperRenderSegmentsV17324();
        routeInteractiveRenderEditBarV17327();
        routeInteractiveRenderV17327();
        if (status) status.textContent = `Exact route revision ${validated.revision} published and reloaded from canonical stored geometry.`;
        showToast("Exact route published and reload-verified");
      } finally {
        if (button) { button.disabled = false; button.textContent = "Publish exact route & update directions"; }
      }
    }

    routeMapperSaveReviewV17324 = async function routeMapperSaveRuntimeHardenedIssue69() {
      const button = document.getElementById("routeMapperSaveReview");
      const status = document.getElementById("routeMapperSaveStatus");
      try { await routeIssue69PublishStructuredHardened(); }
      catch (error) {
        if (status) status.textContent = error?.message || "Could not publish exact structured route.";
        showToast(error?.message || "Could not publish exact structured route");
        if (button) { button.disabled = false; button.textContent = "Publish exact route & update directions"; }
      }
    };

    routeInteractivePublishV17327 = routeIssue69PublishStructuredHardened;
    window.routeIssue69PublishStructured = routeIssue69PublishStructuredHardened;
    window.routeInteractivePublishV17327 = routeIssue69PublishStructuredHardened;
    window.routeIssue69ReversePreviewCards = routeIssue69ReverseCards;
    window.routeIssue69ValidateStructuredPayload = routeIssue69ValidateStructuredPayload;
    window.routeIssue69RuntimeState = () => ({
      padGeneration: routeIssue69PadGeneration,
      topologyGeneration: routeIssue69TopologyGeneration,
      publishGeneration: routeIssue69PublishGeneration,
      reversePreview: routeIssue69ReversePreview,
      topologySignature: routeIssue69TopologySignature()
    });
