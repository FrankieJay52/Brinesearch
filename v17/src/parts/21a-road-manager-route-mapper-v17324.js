    /* BrineSearch V17.3.24 — Owner Route Mapper inside Road Manager.
       This is a review workbench, not an automatic driver-direction publisher.
       It starts from the best saved/official pad coordinate, lets the Owner open
       a real map, builds the route only from master Road Manager records, stores
       measured mileage and turns as a route review, and keeps all no-guess rules.
       Saving here does not alter live driver directions. */

    const ROUTE_MAPPER_DRAFT_KEY_V17324 = "brinesearch.routeMapperDrafts.v1";
    const ROUTE_MAPPER_LAST_PAD_KEY_V17324 = "brinesearch.routeMapperLastPad.v1";
    let routeMapperSelectedPadV17324 = null;
    let routeMapperSegmentsV17324 = [];
    let routeMapperRoadSearchRowsV17324 = [];
    let routeMapperReviewV17324 = null;

    function routeMapperStateCodeV17324(value) {
      const text = String(value || "").trim().toUpperCase();
      if (text === "OHIO") return "OH";
      if (text === "WEST VIRGINIA") return "WV";
      if (text === "PENNSYLVANIA") return "PA";
      return text;
    }

    function routeMapperPadCoordinateV17324(pad) {
      const official = pad?.official_pad_record || pad?.officialPadRecord || null;
      const officialLat = Number(official?.latitude);
      const officialLng = Number(official?.longitude);
      if (Number.isFinite(officialLat) && Number.isFinite(officialLng)) {
        return { lat: officialLat, lng: officialLng, source: "Official pad coordinate" };
      }
      const lat = Number(pad?.latitude);
      const lng = Number(pad?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng, source: "Saved driver GPS" };
      }
      return null;
    }

    function routeMapperPadIdV17324(pad) {
      return String(pad?._dbId || "");
    }

    function routeMapperLegacyIdV17324(pad) {
      return String(pad?._id || pad?.legacy_id || "");
    }

    function routeMapperPadSearchTextV17324(pad) {
      return [pad?.padName, pad?.company, pad?.state, pad?.county, pad?.township, routeMapperLegacyIdV17324(pad)]
        .filter(Boolean).join(" ").toLowerCase();
    }

    function routeMapperGoogleUrlV17324(coords) {
      if (!coords) return "";
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coords.lat},${coords.lng}`)}`;
    }

    function routeMapperOsmUrlV17324(coords) {
      if (!coords) return "";
      const latSpan = 0.018;
      const lngSpan = 0.028;
      const bbox = [coords.lng - lngSpan, coords.lat - latSpan, coords.lng + lngSpan, coords.lat + latSpan].join(",");
      return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${coords.lat},${coords.lng}`)}`;
    }

    function routeMapperDraftsReadV17324() {
      try {
        const value = JSON.parse(localStorage.getItem(ROUTE_MAPPER_DRAFT_KEY_V17324) || "{}");
        return value && typeof value === "object" ? value : {};
      } catch { return {}; }
    }

    function routeMapperDraftSaveV17324() {
      const pad = routeMapperSelectedPadV17324;
      if (!pad) return;
      const drafts = routeMapperDraftsReadV17324();
      drafts[routeMapperLegacyIdV17324(pad)] = routeMapperSegmentsV17324.map(segment => ({
        roadId: segment.roadId,
        roadName: segment.roadName,
        roadType: segment.roadType,
        routeNumber: segment.routeNumber || null,
        state: segment.state || null,
        verificationStatus: segment.verificationStatus || null,
        sourceAgency: segment.sourceAgency || null,
        sourceUrl: segment.sourceUrl || null,
        sourceRecordId: segment.sourceRecordId || null,
        geometryStatus: segment.geometryStatus || null,
        miles: segment.miles || "",
        turn: segment.turn || "",
        note: segment.note || ""
      }));
      try { localStorage.setItem(ROUTE_MAPPER_DRAFT_KEY_V17324, JSON.stringify(drafts)); } catch {}
    }

    function routeMapperLocalDraftV17324(pad) {
      const rows = routeMapperDraftsReadV17324()[routeMapperLegacyIdV17324(pad)];
      return Array.isArray(rows) ? rows : [];
    }

    function routeMapperSegmentFromRoadV17324(road) {
      return {
        roadId: road?.id || "",
        roadName: road?.canonical_name || "Unnamed road",
        roadType: road?.road_type || "local",
        routeNumber: road?.route_number || null,
        state: road?.state || null,
        verificationStatus: road?.verification_status || "needs_review",
        sourceAgency: road?.source_agency || null,
        sourceUrl: road?.source_url || null,
        sourceRecordId: road?.source_record_id || null,
        geometryStatus: road?.geometry_status || null,
        miles: "",
        turn: "",
        note: ""
      };
    }

    function routeMapperMilesTotalV17324() {
      let count = 0;
      const total = routeMapperSegmentsV17324.reduce((sum, segment) => {
        const miles = Number(segment.miles);
        if (!Number.isFinite(miles) || miles < 0 || String(segment.miles).trim() === "") return sum;
        count += 1;
        return sum + miles;
      }, 0);
      return count ? Number(total.toFixed(3)) : null;
    }

    function routeMapperRoadTypeCodeV17324(segment) {
      if (segment.roadType === "interstate") return "I";
      if (segment.roadType === "us_route") return "US";
      if (segment.roadType === "state_route") return routeMapperStateCodeV17324(segment.state) || "SR";
      if (segment.roadType === "county") return "CR";
      if (segment.roadType === "township") return "TR";
      if (segment.roadType === "access") return "ACCESS";
      return "LOCAL";
    }

    function routeMapperRouteNumberV17324(segment) {
      if (segment.routeNumber) return String(segment.routeNumber);
      const match = String(segment.roadName || "").match(/\b\d{1,4}(?:\/\d+)?[A-Z]?\b/i);
      return match ? match[0] : null;
    }

    function routeMapperRoadStatusV17324(segment) {
      const label = typeof roadStatusLabel === "function"
        ? roadStatusLabel({ verification_status: segment.verificationStatus, road_type: segment.roadType })
        : (segment.verificationStatus || "Needs review");
      return label || "Needs review";
    }

    function routeMapperTurnOptionsV17324(value) {
      const options = [
        ["", "No turn set"], ["straight", "Continue / straight"], ["left", "Turn left"], ["right", "Turn right"],
        ["slight_left", "Slight left"], ["slight_right", "Slight right"], ["merge_left", "Merge left"],
        ["merge_right", "Merge right"], ["arrive", "Arrive"]
      ];
      return options.map(([key, label]) => `<option value="${key}" ${key === value ? "selected" : ""}>${label}</option>`).join("");
    }

    function routeMapperRenderSegmentsV17324() {
      const host = document.getElementById("routeMapperSegments");
      const totalHost = document.getElementById("routeMapperTotalMiles");
      if (!host) return;
      const total = routeMapperMilesTotalV17324();
      if (totalHost) totalHost.textContent = total == null ? "Mileage not complete" : `${total.toFixed(2)} mi entered`;
      host.innerHTML = routeMapperSegmentsV17324.length ? routeMapperSegmentsV17324.map((segment, index) => `
        <article class="route-mapper-segment" data-route-mapper-segment="${index}">
          <div class="route-mapper-segment-head">
            <span class="route-mapper-step">${index + 1}</span>
            <span class="route-mapper-road-copy"><strong>${esc(segment.roadName)}</strong><small>${esc(`${routeMapperRoadStatusV17324(segment)}${segment.geometryStatus ? ` • geometry: ${segment.geometryStatus}` : ""}`)}</small></span>
            <span class="route-mapper-reorder">
              <button type="button" class="btn ghost small" data-route-mapper-up="${index}" ${index === 0 ? "disabled" : ""} aria-label="Move road up">↑</button>
              <button type="button" class="btn ghost small" data-route-mapper-down="${index}" ${index === routeMapperSegmentsV17324.length - 1 ? "disabled" : ""} aria-label="Move road down">↓</button>
            </span>
          </div>
          <div class="route-mapper-segment-grid">
            <label>Turn<select data-route-mapper-turn="${index}">${routeMapperTurnOptionsV17324(segment.turn || "")}</select></label>
            <label>Miles<input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${esc(segment.miles || "")}" data-route-mapper-miles="${index}"></label>
            <label class="wide">Note<input type="text" value="${esc(segment.note || "")}" placeholder="Optional source / landmark / access note" data-route-mapper-note="${index}"></label>
          </div>
          <div class="route-mapper-segment-actions"><button type="button" class="btn ghost small" data-route-mapper-open-road="${esc(segment.roadId)}">Open in Road Manager</button><button type="button" class="btn ghost small danger" data-route-mapper-remove="${index}">Remove</button></div>
        </article>`).join("") : `<div class="route-mapper-empty"><strong>No roads added yet.</strong><span>Search the master Road Manager below and add only roads you can support from the saved directions, official road data, or the map.</span></div>`;

      host.querySelectorAll("[data-route-mapper-turn]").forEach(select => select.onchange = () => {
        const index = Number(select.dataset.routeMapperTurn); if (!routeMapperSegmentsV17324[index]) return;
        routeMapperSegmentsV17324[index].turn = select.value; routeMapperDraftSaveV17324();
      });
      host.querySelectorAll("[data-route-mapper-miles]").forEach(input => input.oninput = () => {
        const index = Number(input.dataset.routeMapperMiles); if (!routeMapperSegmentsV17324[index]) return;
        routeMapperSegmentsV17324[index].miles = input.value; routeMapperDraftSaveV17324(); routeMapperRenderSegmentsV17324();
      });
      host.querySelectorAll("[data-route-mapper-note]").forEach(input => input.oninput = () => {
        const index = Number(input.dataset.routeMapperNote); if (!routeMapperSegmentsV17324[index]) return;
        routeMapperSegmentsV17324[index].note = input.value; routeMapperDraftSaveV17324();
      });
      host.querySelectorAll("[data-route-mapper-remove]").forEach(button => button.onclick = () => {
        routeMapperSegmentsV17324.splice(Number(button.dataset.routeMapperRemove), 1); routeMapperDraftSaveV17324(); routeMapperRenderSegmentsV17324();
      });
      host.querySelectorAll("[data-route-mapper-up]").forEach(button => button.onclick = () => {
        const index = Number(button.dataset.routeMapperUp); if (index <= 0) return;
        [routeMapperSegmentsV17324[index - 1], routeMapperSegmentsV17324[index]] = [routeMapperSegmentsV17324[index], routeMapperSegmentsV17324[index - 1]];
        routeMapperDraftSaveV17324(); routeMapperRenderSegmentsV17324();
      });
      host.querySelectorAll("[data-route-mapper-down]").forEach(button => button.onclick = () => {
        const index = Number(button.dataset.routeMapperDown); if (index < 0 || index >= routeMapperSegmentsV17324.length - 1) return;
        [routeMapperSegmentsV17324[index + 1], routeMapperSegmentsV17324[index]] = [routeMapperSegmentsV17324[index], routeMapperSegmentsV17324[index + 1]];
        routeMapperDraftSaveV17324(); routeMapperRenderSegmentsV17324();
      });
      host.querySelectorAll("[data-route-mapper-open-road]").forEach(button => button.onclick = async () => {
        const id = button.dataset.routeMapperOpenRoad;
        const segment = routeMapperSegmentsV17324.find(item => item.roadId === id);
        if (!segment) return;
        try {
          const rows = await editorRequest(`/rest/v1/brinesearch_roads?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, { method: "GET" });
          if (rows?.[0]) renderRoadForm(rows[0]);
        } catch (error) { showToast(error.message || "Could not open road"); }
      });
    }

    function routeMapperRenderRoadResultsV17324() {
      const host = document.getElementById("routeMapperRoadResults");
      if (!host) return;
      host.innerHTML = routeMapperRoadSearchRowsV17324.length ? routeMapperRoadSearchRowsV17324.map(road => `
        <button type="button" class="route-mapper-road-result" data-route-mapper-add-road="${esc(road.id)}">
          <span><strong>${esc(road.canonical_name)}</strong><small>${esc(`${roadTypeLabelV173(road.road_type)} • ${roadScopeLabelV173(road)} • ${roadStatusLabel(road)}`)}</small></span><b>＋</b>
        </button>`).join("") : `<div class="route-mapper-empty compact">No Road Manager matches yet.</div>`;
      host.querySelectorAll("[data-route-mapper-add-road]").forEach(button => button.onclick = () => {
        const road = routeMapperRoadSearchRowsV17324.find(row => row.id === button.dataset.routeMapperAddRoad);
        if (!road) return;
        routeMapperSegmentsV17324.push(routeMapperSegmentFromRoadV17324(road));
        routeMapperDraftSaveV17324(); routeMapperRenderSegmentsV17324();
      });
    }

    async function routeMapperSearchRoadsV17324() {
      const input = document.getElementById("routeMapperRoadSearch");
      const q = input?.value?.trim() || "";
      if (!q) { routeMapperRoadSearchRowsV17324 = []; routeMapperRenderRoadResultsV17324(); return; }
      try {
        routeMapperRoadSearchRowsV17324 = await fetchRoads(q, 50);
        routeMapperRenderRoadResultsV17324();
      } catch (error) {
        const host = document.getElementById("routeMapperRoadResults");
        if (host) host.innerHTML = `<div class="route-mapper-empty compact">${esc(error.message || "Could not search roads")}</div>`;
      }
    }

    function routeMapperRenderPadResultsV17324() {
      const input = document.getElementById("routeMapperPadSearch");
      const host = document.getElementById("routeMapperPadResults");
      if (!input || !host) return;
      const q = input.value.trim().toLowerCase();
      if (!q) { host.innerHTML = ""; return; }
      const terms = q.split(/\s+/).filter(Boolean);
      const rows = (pads || []).filter(pad => terms.every(term => routeMapperPadSearchTextV17324(pad).includes(term))).slice(0, 40);
      host.innerHTML = rows.length ? rows.map(pad => {
        const coords = routeMapperPadCoordinateV17324(pad);
        return `<button type="button" class="route-mapper-pad-result" data-route-mapper-pad="${esc(routeMapperLegacyIdV17324(pad))}"><span><strong>${esc(pad.padName || "Unnamed pad")}</strong><small>${esc([pad.company, pad.county, pad.township, pad.state].filter(Boolean).join(" • "))}</small></span><b>${coords ? "GPS" : "No GPS"}</b></button>`;
      }).join("") : `<div class="route-mapper-empty compact">No pads match that search.</div>`;
      host.querySelectorAll("[data-route-mapper-pad]").forEach(button => button.onclick = () => routeMapperSelectPadV17324(button.dataset.routeMapperPad));
    }

    async function routeMapperLoadReviewV17324(pad) {
      routeMapperReviewV17324 = null;
      const padId = routeMapperPadIdV17324(pad);
      if (!padId) { routeMapperSegmentsV17324 = routeMapperLocalDraftV17324(pad); return; }
      try {
        const reviews = await editorRequest(`/rest/v1/brinesearch_route_reviews?select=*&pad_id=eq.${encodeURIComponent(padId)}&limit=1`, { method: "GET" });
        const review = Array.isArray(reviews) ? reviews[0] : null;
        routeMapperReviewV17324 = review || null;
        if (!review?.id) { routeMapperSegmentsV17324 = routeMapperLocalDraftV17324(pad); return; }
        const storedSegments = await editorRequest(`/rest/v1/brinesearch_route_review_segments?select=*&review_id=eq.${encodeURIComponent(review.id)}&order=outbound_order.asc,id.asc`, { method: "GET" });
        if (!Array.isArray(storedSegments) || !storedSegments.length) { routeMapperSegmentsV17324 = routeMapperLocalDraftV17324(pad); return; }
        const ids = Array.from(new Set(storedSegments.map(row => row.road_id).filter(Boolean)));
        let roadMap = new Map();
        if (ids.length) {
          const roads = await editorRequest(`/rest/v1/brinesearch_roads?select=*&id=in.(${ids.join(",")})`, { method: "GET" });
          roadMap = new Map((Array.isArray(roads) ? roads : []).map(road => [road.id, road]));
        }
        routeMapperSegmentsV17324 = storedSegments.map(row => {
          const road = roadMap.get(row.road_id) || {};
          return {
            ...routeMapperSegmentFromRoadV17324({ ...road, id: row.road_id || road.id, canonical_name: road.canonical_name || row.official_road_name || row.road_name }),
            miles: row.miles == null ? "" : String(row.miles),
            turn: row.outbound_turn || "",
            note: row.evidence?.note || ""
          };
        });
      } catch (error) {
        routeMapperSegmentsV17324 = routeMapperLocalDraftV17324(pad);
        showToast("Saved map review unavailable; local draft loaded");
      }
    }

    function routeMapperPadSummaryHtmlV17324(pad) {
      const coords = routeMapperPadCoordinateV17324(pad);
      const google = routeMapperGoogleUrlV17324(coords);
      const osm = routeMapperOsmUrlV17324(coords);
      const sourceDirections = normalize(pad?.originalWrittenDirections || pad?.writtenDirections || "");
      const sequence = normalize(pad?.Structured_Road_Sequence || "");
      return `<section class="road-manager-card route-mapper-pad-card">
        <div class="route-mapper-pad-head"><div><span class="eyebrow">Selected pad</span><h2>${esc(pad.padName || "Unnamed pad")}</h2><p>${esc([pad.company, pad.county, pad.township, pad.state].filter(Boolean).join(" • "))}</p></div><button type="button" class="btn ghost small" id="routeMapperChangePad">Change pad</button></div>
        ${coords ? `<div class="route-mapper-coordinate"><strong>${esc(`${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`)}</strong><span>${esc(coords.source)}</span><button type="button" class="btn ghost small" id="routeMapperCopyCoords">Copy</button></div>` : `<div class="route-mapper-warning">No pad/driver coordinate is available. Add or verify GPS before measuring a route.</div>`}
        <div class="route-mapper-map-actions">${google ? `<a class="btn primary" href="${esc(google)}" target="_blank" rel="noopener noreferrer">Open pad GPS for QA</a>` : ""}<button type="button" class="btn secondary" id="routeMapperRefreshReview">Reload saved review</button></div>
        ${osm ? `<div class="route-mapper-map-frame"><iframe title="Road map around ${esc(pad.padName || "pad")}" src="${esc(osm)}" loading="lazy" referrerpolicy="no-referrer"></iframe></div><p class="route-mapper-map-help">Automatic routes come from verified GPS junctions and source geometry. Use this preview only to review a held route or document an exception; do not save a road name or mileage unless the source supports it.</p>` : ""}
        <details class="route-mapper-source"><summary>Saved route evidence</summary><div><strong>Structured sequence</strong><p>${esc(sequence || "Not listed")}</p><strong>Written directions</strong><p>${esc(sourceDirections || "Not listed")}</p></div></details>
      </section>`;
    }

    async function routeMapperSelectPadV17324(legacyId) {
      const pad = (pads || []).find(row => routeMapperLegacyIdV17324(row) === legacyId) || (typeof padById === "function" ? padById(legacyId) : null);
      if (!pad) return;
      routeMapperSelectedPadV17324 = pad;
      try { localStorage.setItem(ROUTE_MAPPER_LAST_PAD_KEY_V17324, legacyId); } catch {}
      const search = document.getElementById("routeMapperPadSearch"); if (search) search.value = "";
      const results = document.getElementById("routeMapperPadResults"); if (results) results.innerHTML = "";
      const workspace = document.getElementById("routeMapperWorkspace");
      if (workspace) workspace.innerHTML = `<section class="road-manager-card"><p class="admin-empty">Loading ${esc(pad.padName || "pad")} route review…</p></section>`;
      await routeMapperLoadReviewV17324(pad);
      routeMapperRenderWorkspaceV17324();
    }

    async function routeMapperSaveReviewV17324() {
      const pad = routeMapperSelectedPadV17324;
      const button = document.getElementById("routeMapperSaveReview");
      const status = document.getElementById("routeMapperSaveStatus");
      if (!pad || !routeMapperPadIdV17324(pad)) { if (status) status.textContent = "This pad does not have a live database ID."; return; }
      if (button) { button.disabled = true; button.textContent = "Saving…"; }
      if (status) status.textContent = "";
      const coords = routeMapperPadCoordinateV17324(pad);
      const total = routeMapperMilesTotalV17324();
      const hasLocalRoad = routeMapperSegmentsV17324.some(segment => ["county", "township", "local", "access"].includes(segment.roadType));
      const allHighway = routeMapperSegmentsV17324.length > 0 && routeMapperSegmentsV17324.every(segment => ["interstate", "us_route", "state_route"].includes(segment.roadType));
      const sourceDirections = normalize(pad.originalWrittenDirections || pad.writtenDirections || "");
      const clearDirections = normalize(pad.directionsClear || "");
      const sequence = normalize(pad.Structured_Road_Sequence || "");
      const reviewBody = {
        pad_id: routeMapperPadIdV17324(pad),
        legacy_id: routeMapperLegacyIdV17324(pad) || null,
        pad_name: pad.padName || "Unnamed pad",
        company: pad.company || null,
        state: pad.state || null,
        pad_latitude: coords?.lat ?? null,
        pad_longitude: coords?.lng ?? null,
        source_directions_snapshot: sourceDirections || null,
        structured_sequence_snapshot: sequence || null,
        source_quality: clearDirections ? "clear" : (sourceDirections ? "written" : "sequence_only"),
        status: "owner_review",
        route_scope: hasLocalRoad ? "local_roads" : (allHighway ? "state_route_only" : "unknown"),
        candidate_kind: "none",
        state_route_name: null,
        state_route_distance_feet: null,
        candidate_route: {
          type: "owner_route_mapper",
          version: "17.3.24",
          roads: routeMapperSegmentsV17324.map((segment, index) => ({ order: index + 1, road_id: segment.roadId, road_name: segment.roadName, miles: segment.miles === "" ? null : Number(segment.miles), turn: segment.turn || null }))
        },
        evidence: { method: "owner_route_mapper", coordinate_source: coords?.source || "none", no_guess: true, saved_at: new Date().toISOString() },
        no_guess_reason: null,
        measured_total_miles: total,
        field_verification_status: "pending"
      };
      try {
        const saved = await editorRequest("/rest/v1/brinesearch_route_reviews?on_conflict=pad_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(reviewBody)
        });
        const review = Array.isArray(saved) ? saved[0] : saved;
        if (!review?.id) throw new Error("Route review did not return an ID.");
        await editorRequest(`/rest/v1/brinesearch_route_review_segments?review_id=eq.${encodeURIComponent(review.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        if (routeMapperSegmentsV17324.length) {
          const segmentBodies = routeMapperSegmentsV17324.map((segment, index) => ({
            review_id: review.id,
            outbound_order: index + 1,
            inbound_order: routeMapperSegmentsV17324.length - index,
            road_id: segment.roadId || null,
            road_name: segment.roadName || "Unnamed road",
            official_road_name: segment.roadName || null,
            route_type: routeMapperRoadTypeCodeV17324(segment),
            route_number: routeMapperRouteNumberV17324(segment),
            miles: segment.miles === "" ? null : Number(segment.miles),
            outbound_turn: segment.turn || null,
            inbound_turn: null,
            source_level: "owner_verified",
            source_agency: segment.sourceAgency || null,
            source_url: segment.sourceUrl || null,
            source_record_id: segment.sourceRecordId || null,
            is_state_route: segment.roadType === "state_route",
            confidence: "owner_confirmed",
            evidence: { method: "owner_route_mapper", note: segment.note || null, road_verification_status: segment.verificationStatus || null, geometry_status: segment.geometryStatus || null }
          }));
          await editorRequest("/rest/v1/brinesearch_route_review_segments", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(segmentBodies) });
        }
        routeMapperReviewV17324 = review;
        routeMapperDraftSaveV17324();
        if (status) status.textContent = "Saved to Road Manager review. Driver directions were not changed.";
        showToast("Route map review saved");
      } catch (error) {
        if (status) status.textContent = error.message || "Could not save map review.";
      } finally {
        if (button) { button.disabled = false; button.textContent = "Save map review"; }
      }
    }

    function routeMapperRenderWorkspaceV17324() {
      const workspace = document.getElementById("routeMapperWorkspace");
      const pad = routeMapperSelectedPadV17324;
      if (!workspace) return;
      if (!pad) {
        workspace.innerHTML = `<section class="road-manager-card route-mapper-intro"><h2>Choose a held or questioned pad</h2><p>Route-ready pads receive automatic GPS-waypoint navigation. Use this screen only to inspect a held route, resolve an exception, or perform QA. Nothing is published to drivers from this screen.</p></section>`;
        return;
      }
      workspace.innerHTML = `${routeMapperPadSummaryHtmlV17324(pad)}
        <section class="road-manager-card route-mapper-builder-card">
          <div class="route-mapper-builder-head"><div><h2>Exception review</h2><p>Inspect the saved occurrence order and record only source-supported corrections for a held or questioned route.</p></div><span id="routeMapperTotalMiles">Mileage not complete</span></div>
          <div id="routeMapperSegments"></div>
          <div class="route-mapper-road-search"><label>Find a Road Manager road<input id="routeMapperRoadSearch" autocomplete="off" placeholder="OH-800, Muskrat Rd, CR-102…"></label><button type="button" class="btn secondary" id="routeMapperAddMissingRoad">Add missing road</button></div>
          <div id="routeMapperRoadResults" class="route-mapper-road-results"></div>
          <div class="route-mapper-save-row"><div><strong>Review-only save</strong><small id="routeMapperSaveStatus">${routeMapperReviewV17324 ? `Existing review: ${esc(routeMapperReviewV17324.status || "saved")}` : "No saved map review yet."}</small></div><button type="button" class="btn primary" id="routeMapperSaveReview">Save map review</button></div>
          <p class="route-mapper-no-publish">This is a review and exception tool. Automatic route generation remains the product path for every route-ready pad; this screen never manually publishes a Google route.</p>
        </section><div id="roadManagerEditor"></div>`;
      routeMapperRenderSegmentsV17324();
      routeMapperRoadSearchRowsV17324 = [];
      routeMapperRenderRoadResultsV17324();
      let roadTimer;
      document.getElementById("routeMapperRoadSearch").oninput = () => { clearTimeout(roadTimer); roadTimer = setTimeout(routeMapperSearchRoadsV17324, 160); };
      document.getElementById("routeMapperAddMissingRoad").onclick = () => {
        const name = document.getElementById("routeMapperRoadSearch")?.value?.trim() || "";
        const draft = emptyRoadForm();
        draft.canonical_name = name;
        draft.state = routeMapperStateCodeV17324(pad.state);
        draft.county = pad.county || "";
        draft.township = pad.township || "";
        renderRoadForm(draft);
      };
      document.getElementById("routeMapperSaveReview").onclick = routeMapperSaveReviewV17324;
      document.getElementById("routeMapperChangePad").onclick = () => {
        routeMapperSelectedPadV17324 = null; routeMapperSegmentsV17324 = []; routeMapperReviewV17324 = null;
        routeMapperRenderWorkspaceV17324(); document.getElementById("routeMapperPadSearch")?.focus();
      };
      document.getElementById("routeMapperRefreshReview").onclick = () => routeMapperSelectPadV17324(routeMapperLegacyIdV17324(pad));
      document.getElementById("routeMapperCopyCoords")?.addEventListener("click", async () => {
        const coords = routeMapperPadCoordinateV17324(pad); if (!coords) return;
        try { await navigator.clipboard.writeText(`${coords.lat}, ${coords.lng}`); showToast("Coordinates copied"); }
        catch { showToast("Press and hold the coordinates to copy"); }
      });
    }

    async function renderRouteMapperTabV17324() {
      const pane = document.getElementById("roadManagerPane");
      if (!pane) return;
      pane.innerHTML = `<section class="road-manager-card route-mapper-search-card"><div><h2>Route QA &amp; Exceptions</h2><p>Automatic GPS-waypoint routes are the default for route-ready pads. Review only held, ambiguous, or questioned cases here without changing live driver cards.</p></div><label>Find pad<input id="routeMapperPadSearch" autocomplete="off" placeholder="CATTLE, COLOGIE, operator, county…"></label><div id="routeMapperPadResults" class="route-mapper-pad-results"></div></section><div id="routeMapperWorkspace"></div>`;
      document.getElementById("routeMapperPadSearch").oninput = routeMapperRenderPadResultsV17324;
      routeMapperRenderWorkspaceV17324();
      if (!routeMapperSelectedPadV17324) {
        let last = ""; try { last = localStorage.getItem(ROUTE_MAPPER_LAST_PAD_KEY_V17324) || ""; } catch {}
        if (last && (pads || []).some(pad => routeMapperLegacyIdV17324(pad) === last)) await routeMapperSelectPadV17324(last);
      } else {
        await routeMapperSelectPadV17324(routeMapperLegacyIdV17324(routeMapperSelectedPadV17324));
      }
    }

    const switchRoadManagerTabBeforeMapperV17324 = switchRoadManagerTabV173;
    switchRoadManagerTabV173 = async function switchRoadManagerTabMapperV17324(tab) {
      if (tab !== "mapper") return switchRoadManagerTabBeforeMapperV17324(tab);
      roadManagerActiveTabV173 = "mapper";
      document.querySelectorAll("[data-road-manager-tab]").forEach(button => {
        const active = button.dataset.roadManagerTab === "mapper";
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      await renderRouteMapperTabV17324();
    };

    const renderRoadManagerSettingsBeforeMapperV17324 = renderRoadManagerSettings;
    renderRoadManagerSettings = async function renderRoadManagerSettingsMapperV17324() {
      await renderRoadManagerSettingsBeforeMapperV17324();
      if (!editorIsOwner()) return;
      const tabs = document.querySelector(".road-manager-tabs");
      if (!tabs) return;
      if (!tabs.querySelector('[data-road-manager-tab="mapper"]')) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.roadManagerTab = "mapper";
        button.setAttribute("role", "tab");
        button.textContent = "Route QA";
        button.onclick = () => switchRoadManagerTabV173("mapper");
        tabs.appendChild(button);
      }
      document.querySelectorAll("[data-road-manager-tab]").forEach(button => {
        const active = button.dataset.roadManagerTab === roadManagerActiveTabV173;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
    };

    window.routeMapperSelectPadV17324 = routeMapperSelectPadV17324;
    window.renderRouteMapperTabV17324 = renderRouteMapperTabV17324;
