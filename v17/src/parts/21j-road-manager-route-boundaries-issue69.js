    /* GitHub #69 — explicit route-step boundary editor.
       Boundaries are chosen spatially from Road Manager topology. Interior
       boundaries use adjacent road IDs and actual shared centerline nodes; first
       and last route anchors use an explicit map tap snapped to that road. */

    let routeIssue69BoundaryMode = null; // "start" | "end"

    function routeIssue69ReverseTurn(turn) {
      const reverse = {
        left: "right", right: "left",
        slight_left: "slight_right", slight_right: "slight_left",
        merge_left: "merge_right", merge_right: "merge_left",
        straight: "straight", arrive: "straight"
      };
      return reverse[String(turn || "")] || "";
    }

    function routeIssue69ClearClip(segment) {
      if (!segment) return;
      segment.clippedGeometry = null;
      segment.geometryVersion = 0;
      segment.geometryStatus = "needs_step_geometry";
      segment.geometrySource = null;
      segment.geometrySourceRecordId = null;
      segment.miles = "";
    }

    function routeIssue69InvalidateWindow(index, clearBoundaries = true) {
      const start = Math.max(0, Number(index) - 1);
      const end = Math.min(routeMapperSegmentsV17324.length - 1, Number(index) + 1);
      for (let i = start; i <= end; i += 1) routeIssue69ClearClip(routeMapperSegmentsV17324[i]);
      if (clearBoundaries) {
        const current = routeMapperSegmentsV17324[Number(index)];
        const previous = routeMapperSegmentsV17324[Number(index) - 1];
        const next = routeMapperSegmentsV17324[Number(index) + 1];
        if (previous) previous.endCoordinate = null;
        if (current) { current.startCoordinate = null; current.endCoordinate = null; }
        if (next) next.startCoordinate = null;
      }
      routeMapperDraftSaveV17324();
      routeMapperRenderSegmentsV17324();
      routeInteractiveRenderV17327();
    }

    async function routeIssue69Rpc(name, body) {
      const response = await editorRequest(`/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return Array.isArray(response) ? response[0] : response;
    }

    async function routeIssue69ClipStep(index) {
      const segment = routeMapperSegmentsV17324[Number(index)];
      if (!segment?.roadId || !routeIssue69Coordinate(segment.startCoordinate) || !routeIssue69Coordinate(segment.endCoordinate)) {
        routeIssue69ClearClip(segment);
        return false;
      }
      const result = await routeIssue69Rpc("brinesearch_route_step_clip", {
        p_road_id: segment.roadId,
        p_start_coordinate: routeIssue69Coordinate(segment.startCoordinate),
        p_end_coordinate: routeIssue69Coordinate(segment.endCoordinate)
      });
      if (!result?.resolved) {
        routeIssue69ClearClip(segment);
        const reason = String(result?.reason || "clip_unresolved").replaceAll("_", " ");
        showToast(`Step ${Number(index) + 1} geometry unresolved: ${reason}`);
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
      if (!segment.inboundTurn && segment.turn) segment.inboundTurn = routeIssue69ReverseTurn(segment.turn);
      return true;
    }

    async function routeIssue69ReclipAround(index) {
      const indexes = Array.from(new Set([Number(index) - 1, Number(index), Number(index) + 1]))
        .filter(value => value >= 0 && value < routeMapperSegmentsV17324.length);
      for (const value of indexes) await routeIssue69ClipStep(value);
      routeMapperDraftSaveV17324();
      routeMapperRenderSegmentsV17324();
      routeInteractiveRenderV17327();
    }

    function routeIssue69BoundarySheetClose() {
      routeInteractiveMapV17327?.root?.querySelector(".route-boundary-sheet-issue69")?.remove();
    }

    async function routeIssue69ApplyBoundary(index, side, coordinate) {
      const current = routeMapperSegmentsV17324[Number(index)];
      if (!current) return;
      if (side === "start") {
        current.startCoordinate = routeIssue69Coordinate(coordinate);
        const previous = routeMapperSegmentsV17324[Number(index) - 1];
        if (previous) previous.endCoordinate = routeIssue69Coordinate(coordinate);
      } else {
        current.endCoordinate = routeIssue69Coordinate(coordinate);
        const next = routeMapperSegmentsV17324[Number(index) + 1];
        if (next) next.startCoordinate = routeIssue69Coordinate(coordinate);
      }
      routeIssue69BoundaryMode = null;
      routeIssue69BoundarySheetClose();
      await routeIssue69ReclipAround(index);
      routeInteractiveRenderEditBarV17327();
      await routeStepSnapToV17328(index, false);
    }

    function routeIssue69RenderBoundaryChoices(index, side, payload) {
      const root = routeInteractiveMapV17327?.root;
      if (!root) return;
      routeIssue69BoundarySheetClose();
      const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
      const sheet = document.createElement("div");
      sheet.className = "route-boundary-sheet-issue69 route-map-road-sheet-v17327";
      sheet.innerHTML = `<div class="route-map-road-sheet-head"><div><strong>Choose exact ${side} boundary</strong><small>${payload?.same_road ? "Same-road occurrence split" : "Shared Road Manager intersection nodes"}</small></div><button type="button" data-route-boundary-close aria-label="Close">×</button></div><div class="route-map-road-candidates">${candidates.map((candidate, candidateIndex) => {
        const coordinate = routeIssue69Coordinate(candidate.coordinate) || [0, 0];
        const details = [
          candidate.kind === "shared_road_manager_node" ? "shared node" : "explicit same-road split",
          candidate.node_gap_m != null ? `node gap ${candidate.node_gap_m} m` : "",
          candidate.distance_to_tap_m != null ? `${candidate.distance_to_tap_m} m from tap` : ""
        ].filter(Boolean).join(" • ");
        return `<button type="button" data-route-boundary-choice="${candidateIndex}"><span><strong>${coordinate[1].toFixed(6)}, ${coordinate[0].toFixed(6)}</strong><small>${esc(details)}</small></span><b>Use</b></button>`;
      }).join("")}</div>`;
      root.appendChild(sheet);
      sheet.querySelector("[data-route-boundary-close]").onclick = () => {
        routeIssue69BoundaryMode = null;
        routeIssue69BoundarySheetClose();
        routeInteractiveRenderEditBarV17327();
      };
      sheet.querySelectorAll("[data-route-boundary-choice]").forEach(button => {
        button.onclick = async () => {
          const candidate = candidates[Number(button.dataset.routeBoundaryChoice)];
          if (!candidate) return;
          button.disabled = true;
          try { await routeIssue69ApplyBoundary(index, side, candidate.coordinate); }
          catch (error) { button.disabled = false; showToast(error?.message || "Could not set route boundary"); }
        };
      });
    }

    async function routeIssue69ResolveBoundaryTap(index, side, point) {
      const current = routeMapperSegmentsV17324[Number(index)];
      if (!current?.roadId) throw new Error("Selected step has no Road Manager road ID");
      const near = [Number(point.lng), Number(point.lat)];
      const adjacent = side === "start"
        ? routeMapperSegmentsV17324[Number(index) - 1]
        : routeMapperSegmentsV17324[Number(index) + 1];

      if (!adjacent) {
        const snapped = await routeIssue69Rpc("brinesearch_route_step_snap_point", {
          p_road_id: current.roadId,
          p_near_coordinate: near
        });
        if (!snapped?.resolved) throw new Error(String(snapped?.reason || "route anchor unresolved").replaceAll("_", " "));
        await routeIssue69ApplyBoundary(index, side, snapped.coordinate);
        return;
      }
      if (!adjacent.roadId) throw new Error("Adjacent step has no Road Manager road ID");
      const leftRoad = side === "start" ? adjacent.roadId : current.roadId;
      const rightRoad = side === "start" ? current.roadId : adjacent.roadId;
      const payload = await routeIssue69Rpc("brinesearch_route_step_boundary_candidates", {
        p_left_road_id: leftRoad,
        p_right_road_id: rightRoad,
        p_near_coordinate: near,
        p_limit: 8
      });
      const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
      if (!payload?.resolved || !candidates.length) throw new Error(String(payload?.reason || "no shared Road Manager intersection").replaceAll("_", " "));
      if (candidates.length === 1) {
        await routeIssue69ApplyBoundary(index, side, candidates[0].coordinate);
        return;
      }
      routeIssue69RenderBoundaryChoices(index, side, payload);
    }

    const routeIssue69TapRoadBefore = routeInteractiveTapRoadV17327;
    routeInteractiveTapRoadV17327 = async function routeInteractiveTapBoundaryFirstIssue69(x, y) {
      if (!routeIssue69BoundaryMode) return routeIssue69TapRoadBefore(x, y);
      const point = routeInteractiveLatLngFromScreenV17327(x, y);
      if (!point) return;
      const side = routeIssue69BoundaryMode;
      const index = routeInteractiveSelectedStepV17327;
      const status = routeInteractiveMapV17327?.root?.querySelector("[data-route-map-edit-status]");
      if (status) status.textContent = `Resolving ${side} boundary from Road Manager topology…`;
      try {
        await routeIssue69ResolveBoundaryTap(index, side, point);
        if (status && !routeIssue69BoundaryMode) status.textContent = `Step ${index + 1} ${side} boundary set.`;
      } catch (error) {
        routeIssue69BoundaryMode = null;
        if (status) status.textContent = error?.message || "Boundary could not be resolved";
        showToast(error?.message || "Boundary could not be resolved");
        routeInteractiveRenderEditBarV17327();
      }
    };

    const routeIssue69UseCandidateBefore = routeInteractiveUseCandidateV17327;
    routeInteractiveUseCandidateV17327 = async function routeInteractiveUseCandidateInvalidateTopologyIssue69(candidate, stepIndex) {
      const action = typeof window.routeStepEditActionV17328 === "function" ? window.routeStepEditActionV17328() : "replace";
      const selectedBefore = Number(routeInteractiveSelectedStepV17327);
      const occurrenceBefore = routeMapperSegmentsV17324[selectedBefore]?.routeStepId || null;
      const lengthBefore = routeMapperSegmentsV17324.length;
      await routeIssue69UseCandidateBefore(candidate, stepIndex);
      const selectedAfter = Number(routeInteractiveSelectedStepV17327);
      if (action === "replace" && routeMapperSegmentsV17324.length === lengthBefore && routeMapperSegmentsV17324[selectedAfter]) {
        if (occurrenceBefore) routeMapperSegmentsV17324[selectedAfter].routeStepId = occurrenceBefore;
        routeIssue69InvalidateWindow(selectedAfter, true);
      } else {
        routeIssue69InvalidateWindow(selectedAfter, true);
      }
      routeInteractiveRenderEditBarV17327();
    };

    const routeIssue69RemoveBefore = routeStepRemoveSelectedV17328;
    routeStepRemoveSelectedV17328 = async function routeStepRemoveInvalidateTopologyIssue69() {
      const index = Number(routeInteractiveSelectedStepV17327);
      const lengthBefore = routeMapperSegmentsV17324.length;
      await routeIssue69RemoveBefore();
      if (routeMapperSegmentsV17324.length === lengthBefore) return;
      const previous = routeMapperSegmentsV17324[index - 1];
      const next = routeMapperSegmentsV17324[index];
      if (previous) { previous.endCoordinate = null; routeIssue69ClearClip(previous); }
      if (next) { next.startCoordinate = null; routeIssue69ClearClip(next); }
      routeMapperDraftSaveV17324();
      routeMapperRenderSegmentsV17324();
      routeInteractiveRenderEditBarV17327();
      routeInteractiveRenderV17327();
    };

    const routeIssue69RenderSegmentsTopologyBefore = routeMapperRenderSegmentsV17324;
    routeMapperRenderSegmentsV17324 = function routeMapperRenderTopologyControlsIssue69() {
      routeIssue69RenderSegmentsTopologyBefore();
      const host = document.getElementById("routeMapperSegments");
      host?.querySelectorAll("[data-route-mapper-up]").forEach(button => {
        button.onclick = () => {
          const index = Number(button.dataset.routeMapperUp);
          if (index <= 0) return;
          [routeMapperSegmentsV17324[index - 1], routeMapperSegmentsV17324[index]] = [routeMapperSegmentsV17324[index], routeMapperSegmentsV17324[index - 1]];
          routeMapperSegmentsV17324.forEach(routeIssue69ClearClip);
          routeMapperSegmentsV17324.forEach(segment => { segment.startCoordinate = null; segment.endCoordinate = null; });
          routeMapperDraftSaveV17324();
          routeMapperRenderSegmentsV17324();
          routeInteractiveRenderV17327();
          showToast("Route order changed — exact boundaries must be re-established");
        };
      });
      host?.querySelectorAll("[data-route-mapper-down]").forEach(button => {
        button.onclick = () => {
          const index = Number(button.dataset.routeMapperDown);
          if (index < 0 || index >= routeMapperSegmentsV17324.length - 1) return;
          [routeMapperSegmentsV17324[index + 1], routeMapperSegmentsV17324[index]] = [routeMapperSegmentsV17324[index], routeMapperSegmentsV17324[index + 1]];
          routeMapperSegmentsV17324.forEach(routeIssue69ClearClip);
          routeMapperSegmentsV17324.forEach(segment => { segment.startCoordinate = null; segment.endCoordinate = null; });
          routeMapperDraftSaveV17324();
          routeMapperRenderSegmentsV17324();
          routeInteractiveRenderV17327();
          showToast("Route order changed — exact boundaries must be re-established");
        };
      });
    };

    const routeIssue69RenderEditBefore = routeInteractiveRenderEditBarV17327;
    routeInteractiveRenderEditBarV17327 = function routeInteractiveRenderBoundaryControlsIssue69() {
      routeIssue69RenderEditBefore();
      const root = routeInteractiveMapV17327?.root;
      const bar = root?.querySelector(".route-map-edit-bar-v17327");
      if (!bar || !routeInteractiveEditModeV17327) return;
      const segment = routeMapperSegmentsV17324[routeInteractiveSelectedStepV17327];
      let controls = bar.querySelector(".route-boundary-controls-issue69");
      if (!controls) {
        controls = document.createElement("div");
        controls.className = "route-boundary-controls-issue69";
        controls.innerHTML = `<div class="route-step-action-row-v17328"><button type="button" data-route-boundary-mode="start">Set start boundary</button><button type="button" data-route-boundary-mode="end">Set end boundary</button></div><div data-route-boundary-summary></div><label>Reverse turn<select data-route-boundary-inbound>${routeMapperTurnOptionsV17324("")}</select></label>`;
        bar.appendChild(controls);
      }
      controls.querySelectorAll("[data-route-boundary-mode]").forEach(button => {
        const side = button.dataset.routeBoundaryMode;
        button.classList.toggle("active", side === routeIssue69BoundaryMode);
        button.onclick = () => {
          routeIssue69BoundaryMode = side;
          routeIssue69BoundarySheetClose();
          routeInteractiveRenderEditBarV17327();
          const status = root.querySelector("[data-route-map-edit-status]");
          if (status) status.textContent = `Tap the exact ${side} boundary for step ${routeInteractiveSelectedStepV17327 + 1}. Adjacent roads will resolve only through shared Road Manager nodes.`;
        };
      });
      const summary = controls.querySelector("[data-route-boundary-summary]");
      if (summary) {
        const format = coordinate => routeIssue69Coordinate(coordinate)?.map(value => Number(value).toFixed(6)).join(", ") || "unresolved";
        summary.textContent = segment ? `Start: ${format(segment.startCoordinate)} • End: ${format(segment.endCoordinate)} • ${routeIssue69HasExactGeometry(segment) ? `${Number(segment.miles || 0).toFixed(3)} mi exact` : "geometry unresolved"}` : "No step selected";
      }
      const inbound = controls.querySelector("[data-route-boundary-inbound]");
      if (inbound && segment) {
        inbound.value = segment.inboundTurn || routeIssue69ReverseTurn(segment.turn);
        inbound.onchange = () => {
          segment.inboundTurn = inbound.value;
          routeMapperDraftSaveV17324();
        };
      }
    };

    window.routeIssue69ClipStep = routeIssue69ClipStep;
    window.routeIssue69ResolveBoundaryTap = routeIssue69ResolveBoundaryTap;
    window.routeIssue69ReverseTurn = routeIssue69ReverseTurn;
