    /* GitHub #69 — structured route-step foundation.
       This layer deliberately shadows the legacy V17.3.27/V17.3.28 occurrence
       matching/publish path. An "exact" route step is identified by its own
       route_step_id and clipped LineString, never by road-name similarity or by
       whichever master road happens to be closest to the pad. */

    const ROUTE_ISSUE69_DRAFT_KEY = "brinesearch.routeMapperStructuredDrafts.issue69.v1";
    let routeIssue69State = { padId: "", routeRevision: 0, reviewId: null, loaded: false };

    function routeIssue69Uuid() {
      if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, value => {
        const random = Math.random() * 16 | 0;
        return (value === "x" ? random : ((random & 3) | 8)).toString(16);
      });
    }

    function routeIssue69Coordinate(value) {
      if (!Array.isArray(value) || value.length < 2) return null;
      const lng = Number(value[0]), lat = Number(value[1]);
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
    }

    function routeIssue69Line(value) {
      const geometry = value?.type === "LineString" ? value : null;
      if (!geometry || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return null;
      const coordinates = geometry.coordinates.map(routeIssue69Coordinate).filter(Boolean);
      return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
    }

    function routeIssue69ExactLine(segment) {
      return routeIssue69Line(segment?.clippedGeometry)?.coordinates || null;
    }

    function routeIssue69HasExactGeometry(segment) {
      const line = routeIssue69Line(segment?.clippedGeometry);
      const start = routeIssue69Coordinate(segment?.startCoordinate);
      const end = routeIssue69Coordinate(segment?.endCoordinate);
      if (!line || !start || !end) return false;
      const first = line.coordinates[0], last = line.coordinates[line.coordinates.length - 1];
      const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
      return same(first, start) && same(last, end) && Number(segment?.geometryVersion || 0) === 1;
    }

    function routeIssue69StructuredSegment(step) {
      const aliases = Array.isArray(step?.aliases) ? step.aliases.filter(Boolean) : [];
      return {
        roadId: step?.road_id || "",
        roadName: step?.road_name || "Unnamed road",
        roadType: "local",
        routeNumber: null,
        state: null,
        verificationStatus: "owner_verified",
        sourceAgency: null,
        sourceUrl: null,
        sourceRecordId: step?.geometry_source_record_id || null,
        geometryStatus: step?.geometry_status || "needs_step_geometry",
        miles: step?.miles == null ? "" : String(step.miles),
        turn: step?.turn_direction || "",
        note: step?.note || "",
        routeStepId: step?.route_step_id || routeIssue69Uuid(),
        startCoordinate: routeIssue69Coordinate(step?.start_coordinate),
        endCoordinate: routeIssue69Coordinate(step?.end_coordinate),
        clippedGeometry: routeIssue69Line(step?.clipped_geometry),
        aliases,
        inboundTurn: step?.inbound_turn || "",
        geometrySource: step?.geometry_source || null,
        geometrySourceRecordId: step?.geometry_source_record_id || null,
        geometryVersion: Number(step?.geometry_version || 0),
        routeRevision: Number(step?.route_revision || 0)
      };
    }

    const routeIssue69SegmentFromRoadBefore = routeMapperSegmentFromRoadV17324;
    routeMapperSegmentFromRoadV17324 = function routeMapperStructuredSegmentFromRoadIssue69(road) {
      return {
        ...routeIssue69SegmentFromRoadBefore(road),
        routeStepId: routeIssue69Uuid(),
        startCoordinate: null,
        endCoordinate: null,
        clippedGeometry: null,
        aliases: Array.isArray(road?.aliases) ? [...road.aliases] : [],
        inboundTurn: "",
        geometrySource: null,
        geometrySourceRecordId: road?.source_record_id || null,
        geometryVersion: 0,
        routeRevision: routeIssue69State.routeRevision || 0
      };
    };

    function routeIssue69DraftsRead() {
      try {
        const value = JSON.parse(localStorage.getItem(ROUTE_ISSUE69_DRAFT_KEY) || "{}");
        return value && typeof value === "object" ? value : {};
      } catch { return {}; }
    }

    function routeIssue69DraftSave() {
      const pad = routeMapperSelectedPadV17324;
      if (!pad) return;
      const drafts = routeIssue69DraftsRead();
      drafts[routeMapperLegacyIdV17324(pad)] = {
        routeRevision: routeIssue69State.routeRevision || 0,
        reviewId: routeIssue69State.reviewId || null,
        steps: routeMapperSegmentsV17324.map(segment => ({
          roadId: segment.roadId || "",
          roadName: segment.roadName || "Unnamed road",
          roadType: segment.roadType || "local",
          routeNumber: segment.routeNumber || null,
          state: segment.state || null,
          verificationStatus: segment.verificationStatus || null,
          sourceAgency: segment.sourceAgency || null,
          sourceUrl: segment.sourceUrl || null,
          sourceRecordId: segment.sourceRecordId || null,
          geometryStatus: segment.geometryStatus || "needs_step_geometry",
          miles: segment.miles || "",
          turn: segment.turn || "",
          note: segment.note || "",
          routeStepId: segment.routeStepId || routeIssue69Uuid(),
          startCoordinate: routeIssue69Coordinate(segment.startCoordinate),
          endCoordinate: routeIssue69Coordinate(segment.endCoordinate),
          clippedGeometry: routeIssue69Line(segment.clippedGeometry),
          aliases: Array.isArray(segment.aliases) ? segment.aliases : [],
          inboundTurn: segment.inboundTurn || "",
          geometrySource: segment.geometrySource || null,
          geometrySourceRecordId: segment.geometrySourceRecordId || null,
          geometryVersion: Number(segment.geometryVersion || 0),
          routeRevision: Number(segment.routeRevision || routeIssue69State.routeRevision || 0)
        }))
      };
      try { localStorage.setItem(ROUTE_ISSUE69_DRAFT_KEY, JSON.stringify(drafts)); } catch {}
    }

    const routeIssue69DraftSaveBefore = routeMapperDraftSaveV17324;
    routeMapperDraftSaveV17324 = function routeMapperDraftSaveStructuredIssue69() {
      routeIssue69DraftSaveBefore();
      routeIssue69DraftSave();
    };

    function routeIssue69RichDraft(pad) {
      const row = routeIssue69DraftsRead()[routeMapperLegacyIdV17324(pad)];
      if (!row || !Array.isArray(row.steps)) return null;
      return row;
    }

    async function routeIssue69LoadStructured(pad) {
      const padId = routeMapperPadIdV17324(pad);
      routeIssue69State = { padId, routeRevision: 0, reviewId: null, loaded: false };
      if (!padId) return false;
      try {
        const response = await editorRequest("/rest/v1/rpc/brinesearch_get_structured_route_steps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_pad_id: padId })
        });
        const payload = Array.isArray(response) ? response[0] : response;
        const steps = payload?.structured_route_steps || payload?.steps || [];
        routeIssue69State = {
          padId,
          routeRevision: Number(payload?.route_revision || 0),
          reviewId: payload?.review_id || null,
          loaded: true
        };
        if (!Array.isArray(steps) || !steps.length) return false;
        routeMapperSegmentsV17324 = steps.map(routeIssue69StructuredSegment);
        routeMapperReviewV17324 = payload?.review_id ? { id: payload.review_id, status: "approved" } : null;
        return true;
      } catch (error) {
        console.warn("Structured route load unavailable", error);
        return false;
      }
    }

    const routeIssue69LoadReviewBefore = routeMapperLoadReviewV17324;
    routeMapperLoadReviewV17324 = async function routeMapperLoadStructuredFirstIssue69(pad) {
      if (await routeIssue69LoadStructured(pad)) {
        routeIssue69DraftSave();
        return;
      }
      const rich = routeIssue69RichDraft(pad);
      await routeIssue69LoadReviewBefore(pad);
      if (!rich?.steps?.length) return;
      const sameRoadSequence = rich.steps.length === routeMapperSegmentsV17324.length
        && rich.steps.every((step, index) => String(step.roadId || "") === String(routeMapperSegmentsV17324[index]?.roadId || ""));
      if (!sameRoadSequence) return;
      routeIssue69State.routeRevision = Number(rich.routeRevision || routeIssue69State.routeRevision || 0);
      routeIssue69State.reviewId = rich.reviewId || routeIssue69State.reviewId || null;
      routeMapperSegmentsV17324 = routeMapperSegmentsV17324.map((segment, index) => ({ ...segment, ...rich.steps[index] }));
    };

    routeStepTraceRowV17328 = function routeStepTraceExactOccurrenceIssue69(index = routeInteractiveSelectedStepV17327) {
      const segment = routeMapperSegmentsV17324?.[Number(index)] || null;
      const line = routeIssue69ExactLine(segment);
      if (!segment || !line) return null;
      return { matched: true, exactOccurrence: true, traceLine: line, token: { label: segment.roadName }, routeStepId: segment.routeStepId };
    };

    routeStepSelectedLineV17328 = function routeStepSelectedExactLineIssue69() {
      return routeIssue69ExactLine(routeMapperSegmentsV17324?.[routeInteractiveSelectedStepV17327]);
    };

    routeStepSnapToV17328 = async function routeStepSnapExactOccurrenceIssue69(index, announce = false) {
      const segment = routeMapperSegmentsV17324?.[Number(index)] || null;
      const line = routeIssue69ExactLine(segment);
      const root = routeInteractiveMapV17327?.root;
      const status = root?.querySelector("[data-route-map-edit-status]");
      if (!segment || !line) {
        if (status) status.textContent = segment
          ? `Step ${Number(index) + 1}: exact boundaries are unresolved. Set/confirm this occurrence before publishing.`
          : "Choose a route step.";
        if (announce && segment) showToast("This step has no exact clipped geometry yet");
        routeInteractiveRenderV17327();
        return false;
      }
      routeStepFitLineV17328(line);
      if (status) status.textContent = `Step ${Number(index) + 1}: exact stored occurrence of ${segment.roadName}.`;
      return true;
    };

    function routeIssue69DrawLine(svg, map, line, className) {
      const points = line.map(point => routeInteractiveScreenPointV17327(point[1], point[0], map)).filter(Boolean);
      if (points.length < 2) return;
      const d = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
      const halo = document.createElementNS("http://www.w3.org/2000/svg", "path");
      halo.setAttribute("d", d); halo.setAttribute("class", "route-interactive-halo"); svg.appendChild(halo);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d); path.setAttribute("class", className); svg.appendChild(path);
    }

    routeInteractiveRenderOverlayV17327 = function routeInteractiveRenderExactOccurrencesIssue69(map) {
      const svg = map?.overlay;
      if (!svg || !map?.root) return;
      const width = map.root.clientWidth, height = map.root.clientHeight;
      svg.setAttribute("viewBox", `0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`);
      svg.innerHTML = "";
      routeMapperSegmentsV17324.forEach((segment, index) => {
        const line = routeIssue69ExactLine(segment);
        if (!line) return;
        const selected = index === routeInteractiveSelectedStepV17327;
        routeIssue69DrawLine(svg, map, line, selected ? "route-step-selected-v17328" : "route-interactive-road verified");
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

    const routeIssue69RenderSegmentsBefore = routeMapperRenderSegmentsV17324;
    routeMapperRenderSegmentsV17324 = function routeMapperRenderStructuredStatusIssue69() {
      routeIssue69RenderSegmentsBefore();
      document.querySelectorAll("[data-route-mapper-segment]").forEach(article => {
        const index = Number(article.dataset.routeMapperSegment);
        const segment = routeMapperSegmentsV17324[index];
        if (!segment) return;
        let status = article.querySelector(".route-issue69-geometry-status");
        if (!status) {
          status = document.createElement("div");
          status.className = "route-issue69-geometry-status";
          article.querySelector(".route-mapper-segment-head")?.after(status);
        }
        status.textContent = routeIssue69HasExactGeometry(segment)
          ? `Exact occurrence • ${Number(segment.miles || 0).toFixed(3)} mi • ${segment.routeStepId}`
          : "Exact geometry unresolved — this step cannot be published yet";
        const miles = article.querySelector(`[data-route-mapper-miles="${index}"]`);
        if (miles && routeIssue69HasExactGeometry(segment)) {
          miles.value = segment.miles || "";
          miles.readOnly = true;
          miles.title = "Mileage is derived from the clipped route-step geometry";
        }
      });
    };

    function routeIssue69PublishPayload() {
      return routeMapperSegmentsV17324.map((segment, index) => {
        if (!segment.routeStepId) segment.routeStepId = routeIssue69Uuid();
        if (!segment.roadId) throw new Error(`Step ${index + 1} has no Road Manager road ID`);
        if (!routeIssue69HasExactGeometry(segment)) throw new Error(`Step ${index + 1}: ${segment.roadName} needs exact start/end boundaries and clipped geometry`);
        if (index > 0 && !segment.turn) throw new Error(`Step ${index + 1}: ${segment.roadName} needs a turn instruction`);
        return {
          step_order: index + 1,
          route_step_id: segment.routeStepId,
          road_id: segment.roadId,
          start_coordinate: routeIssue69Coordinate(segment.startCoordinate),
          end_coordinate: routeIssue69Coordinate(segment.endCoordinate),
          clipped_geometry: routeIssue69Line(segment.clippedGeometry),
          turn_direction: segment.turn || null,
          inbound_turn: segment.inboundTurn || null,
          note: segment.note || null,
          geometry_source: segment.geometrySource || "owner_structured_route_issue69",
          geometry_status: segment.geometryStatus === "field_confirmed" ? "field_confirmed" : "snapped_intersections"
        };
      });
    }

    async function routeIssue69PublishStructured() {
      const pad = routeMapperSelectedPadV17324;
      const padId = routeMapperPadIdV17324(pad);
      const button = document.getElementById("routeMapperSaveReview");
      const status = document.getElementById("routeMapperSaveStatus");
      if (!pad || !padId) throw new Error("This pad does not have a live database ID");
      const steps = routeIssue69PublishPayload();
      if (button) { button.disabled = true; button.textContent = "Publishing exact route…"; }
      if (status) status.textContent = "Validating exact intersections, continuity, centerline support, and geometry mileage…";
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
        const payload = Array.isArray(response) ? response[0] : response;
        const savedSteps = payload?.structured_route_steps || payload?.steps || [];
        routeIssue69State.routeRevision = Number(payload?.route_revision || routeIssue69State.routeRevision || 0);
        routeIssue69State.reviewId = payload?.review_id || routeIssue69State.reviewId || null;
        if (Array.isArray(savedSteps) && savedSteps.length) routeMapperSegmentsV17324 = savedSteps.map(routeIssue69StructuredSegment);
        if (payload?.structured_sequence) pad.Structured_Road_Sequence = payload.structured_sequence;
        if (payload?.directions_clear) {
          pad.directionsClear = payload.directions_clear;
          pad.directions_clear = payload.directions_clear;
        }
        routeInteractiveUseDraftV17327 = false;
        routeIssue69DraftSave();
        routeMapperRenderSegmentsV17324();
        routeInteractiveRenderV17327();
        if (status) status.textContent = "Exact structured route published. Driver directions/cards were regenerated from the stored route steps.";
        showToast("Exact route published");
      } finally {
        if (button) { button.disabled = false; button.textContent = "Publish exact route & update directions"; }
      }
    }

    routeMapperSaveReviewV17324 = async function routeMapperSaveStructuredIssue69() {
      const button = document.getElementById("routeMapperSaveReview");
      const status = document.getElementById("routeMapperSaveStatus");
      try { await routeIssue69PublishStructured(); }
      catch (error) {
        if (status) status.textContent = error?.message || "Could not publish exact structured route.";
        showToast(error?.message || "Could not publish exact structured route");
        if (button) { button.disabled = false; button.textContent = "Publish exact route & update directions"; }
      }
    };

    const routeIssue69RenderWorkspaceBefore = routeMapperRenderWorkspaceV17324;
    routeMapperRenderWorkspaceV17324 = function routeMapperRenderStructuredWorkspaceIssue69() {
      routeIssue69RenderWorkspaceBefore();
      const button = document.getElementById("routeMapperSaveReview");
      const note = document.querySelector(".route-mapper-no-publish");
      if (button) button.textContent = "Publish exact route & update directions";
      if (note) note.textContent = "#69 exact mode: only intersection-bounded clipped route-step geometry can publish. Unresolved steps stay unresolved; BrineSearch will not substitute a whole road or a name-similar occurrence.";
      routeMapperRenderSegmentsV17324();
    };

    window.routeIssue69HasExactGeometry = routeIssue69HasExactGeometry;
    window.routeIssue69PublishStructured = routeIssue69PublishStructured;
    window.routeIssue69State = () => ({ ...routeIssue69State });
