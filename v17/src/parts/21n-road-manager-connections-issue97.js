    /* GitHub #97 — authoritative source-road search, junction-centric
       Connections / Intersections, and graph-backed #69 boundaries.

       This extends the current V17 Road Manager. It never adds source-only IDs
       to canonical road pickers and never reuses the Route Mapper map state. */

    let roadOfficialCountyRowsIssue97 = [];
    let roadOfficialSearchCursorIssue97 = null;
    let roadOfficialSearchNextIssue97 = null;
    let roadOfficialSearchHistoryIssue97 = [];
    let roadOfficialSelectedDetailIssue97 = null;
    let roadOfficialConnectionRowsIssue97 = [];
	    let roadOfficialConnectionNextIssue97 = null;
	    let roadOfficialRegistryIssue97 = null;
	    let roadOfficialMapIssue97 = null;
	    let roadOfficialSearchGenerationIssue97 = 0;
	    let roadOfficialDetailGenerationIssue97 = 0;
	    let roadOfficialConnectionGenerationIssue97 = 0;

    function roadOfficialRpcObjectIssue97(value) {
      return Array.isArray(value) ? (value[0] || {}) : (value || {});
    }

    async function roadOfficialRpcIssue97(name, body) {
      return roadOfficialRpcObjectIssue97(await editorRequest(`/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {})
      }));
    }

    function roadOfficialIdentityKindIssue97(kind) {
      return kind === "canonical" ? "Canonical BrineSearch road"
        : kind === "candidate" ? "Candidate · needs review"
          : "Authoritative source-only road";
    }

	    function roadOfficialMapUrlIssue97(coordinate) {
      const point = routeIssue69Coordinate(coordinate);
      if (!point) return "";
      const [lng, lat] = point;
      const delta = 0.004;
      const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
      return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;
	    }

	    function roadOfficialSafeSourceUrlIssue97(value) {
	      try {
	        const url = new URL(String(value || ""));
	        return url.protocol === "https:" ? url.href : "";
	      } catch {
	        return "";
	      }
	    }

    function roadOfficialGeometryLinesIssue97(geometry) {
      if (!geometry || !Array.isArray(geometry.coordinates)) return [];
      if (geometry.type === "LineString") return [geometry.coordinates];
      if (geometry.type === "MultiLineString") return geometry.coordinates;
      return [];
    }

    function roadOfficialRenderMapIssue97() {
      const map = roadOfficialMapIssue97;
      if (!map?.root?.isConnected) return;
      routeInteractiveRenderTilesV17327(map);
      const width = Math.max(map.root.clientWidth, 1);
      const height = Math.max(map.root.clientHeight, 1);
      map.overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
      map.overlay.innerHTML = "";
      roadOfficialConnectionRowsIssue97.forEach(connection => {
        roadOfficialGeometryLinesIssue97(connection.shared_geometry).forEach(line => {
          const points = line.map(point => routeIssue69Coordinate(point))
            .filter(Boolean).map(([lng, lat]) => routeInteractiveScreenPointV17327(lat, lng, map)).filter(Boolean);
          if (points.length < 2) return;
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "));
          path.setAttribute("class", "road-official-shared-line-issue97");
          map.overlay.appendChild(path);
        });
        (Array.isArray(connection.anchors) ? connection.anchors : []).forEach(anchor => {
          const point = routeIssue69Coordinate(anchor.coordinate);
          if (!point) return;
          const screen = routeInteractiveScreenPointV17327(point[1], point[0], map);
          if (!screen) return;
          const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          circle.setAttribute("cx", screen.x); circle.setAttribute("cy", screen.y); circle.setAttribute("r", "6");
          circle.setAttribute("class", anchor.anchor_role === "point" ? "road-official-junction-dot-issue97" : "road-official-shared-anchor-issue97");
          map.overlay.appendChild(circle);
        });
      });
      const zoom = map.root.querySelector("[data-road-official-map-zoom]");
      if (zoom) zoom.textContent = String(map.zoom);
    }

    function roadOfficialFocusMapIssue97(coordinate) {
      const point = routeIssue69Coordinate(coordinate);
      if (!point || !roadOfficialMapIssue97) return false;
      roadOfficialMapIssue97.center = { lat: point[1], lng: point[0] };
      roadOfficialMapIssue97.zoom = Math.max(roadOfficialMapIssue97.zoom, 17);
      roadOfficialRenderMapIssue97();
      roadOfficialMapIssue97.root.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }

    function roadOfficialInitializeMapIssue97(coordinate) {
      roadOfficialMapIssue97?.resizeObserver?.disconnect();
      const root = document.getElementById("roadOfficialMapIssue97");
      const point = routeIssue69Coordinate(coordinate);
      if (!root || !point) { roadOfficialMapIssue97 = null; return; }
      roadOfficialMapIssue97 = {
        root,
        tiles: root.querySelector(".route-interactive-tiles-v17327"),
        overlay: root.querySelector(".route-interactive-overlay-v17327"),
        center: { lat: point[1], lng: point[0] }, zoom: 16
      };
      root.querySelector("[data-road-official-map-in]").onclick = () => {
        roadOfficialMapIssue97.zoom = Math.min(19, roadOfficialMapIssue97.zoom + 1); roadOfficialRenderMapIssue97();
      };
      root.querySelector("[data-road-official-map-out]").onclick = () => {
        roadOfficialMapIssue97.zoom = Math.max(8, roadOfficialMapIssue97.zoom - 1); roadOfficialRenderMapIssue97();
      };
      let drag = null;
      root.onpointerdown = event => {
        if (event.target.closest("button,a")) return;
        drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        root.setPointerCapture?.(event.pointerId);
      };
      root.onpointermove = event => {
        if (!drag || drag.pointerId !== event.pointerId || !roadOfficialMapIssue97) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.x = event.clientX; drag.y = event.clientY;
        const center = routeInteractiveWorldV17327(
          roadOfficialMapIssue97.center.lat,
          roadOfficialMapIssue97.center.lng,
          roadOfficialMapIssue97.zoom
        );
        roadOfficialMapIssue97.center = routeInteractiveLatLngV17327(
          center.x - dx,
          center.y - dy,
          roadOfficialMapIssue97.zoom
        );
        roadOfficialRenderMapIssue97();
      };
      const endDrag = event => {
        if (drag?.pointerId === event.pointerId) drag = null;
      };
      root.onpointerup = endDrag;
      root.onpointercancel = endDrag;
      root.onwheel = event => {
        event.preventDefault();
        if (!roadOfficialMapIssue97) return;
        roadOfficialMapIssue97.zoom = Math.max(8, Math.min(19,
          roadOfficialMapIssue97.zoom + (event.deltaY < 0 ? 1 : -1)
        ));
        roadOfficialRenderMapIssue97();
      };
      roadOfficialRenderMapIssue97();
      if (typeof ResizeObserver === "function") {
        const observer = new ResizeObserver(roadOfficialRenderMapIssue97);
        observer.observe(root); roadOfficialMapIssue97.resizeObserver = observer;
      }
    }

	    function roadOfficialCountySelectionIssue97() {
	      const stateSelect = document.getElementById("roadOfficialStateIssue97");
	      const countySelect = document.getElementById("roadOfficialCountyIssue97");
	      const explicitState = stateSelect?.value || "";
	      const [countyState = "", countyCode = ""] = String(countySelect?.value || "").split("|");
	      if (!countyState || !countyCode) return { stateCode: explicitState || null, countyCode: null };
	      if (explicitState && countyState !== explicitState) {
	        if (countySelect) countySelect.value = "";
	        return { stateCode: explicitState, countyCode: null };
	      }
	      return { stateCode: explicitState || countyState, countyCode };
	    }

	    function roadOfficialFiltersIssue97() {
	      const county = roadOfficialCountySelectionIssue97();
	      return {
	        p_query: document.getElementById("roadOfficialSearchIssue97")?.value?.trim() || null,
	        p_state_code: county.stateCode,
	        p_county_code: county.countyCode,
        p_road_class: document.getElementById("roadOfficialClassIssue97")?.value || null,
        p_access_status: document.getElementById("roadOfficialAccessIssue97")?.value || null,
        p_mapping_status: document.getElementById("roadOfficialMappingIssue97")?.value || null,
        p_cursor: roadOfficialSearchCursorIssue97,
        p_limit: 40
      };
    }

	    function roadOfficialResetPagingIssue97() {
      roadOfficialSearchCursorIssue97 = null;
      roadOfficialSearchNextIssue97 = null;
      roadOfficialSearchHistoryIssue97 = [];
	    }

	    function roadOfficialInvalidateSearchIssue97() {
	      roadOfficialSearchGenerationIssue97 += 1;
	    }

    function roadOfficialRenderCountyOptionsIssue97() {
      const select = document.getElementById("roadOfficialCountyIssue97");
      if (!select) return;
      const state = document.getElementById("roadOfficialStateIssue97")?.value || "";
	      const current = select.value;
	      const rows = roadOfficialCountyRowsIssue97.filter(row => !state || row.state_code === state);
	      select.innerHTML = `<option value="">All confirmed counties</option>${rows.map(row => {
	        const value = `${row.state_code}|${row.county_code}`;
	        return `<option value="${esc(value)}">${esc(`${row.state_code} · ${row.county_name}`)}</option>`;
	      }).join("")}`;
	      if (rows.some(row => `${row.state_code}|${row.county_code}` === current)) select.value = current;
    }

    async function roadOfficialLoadCountiesIssue97() {
      if (roadOfficialCountyRowsIssue97.length) return;
      roadOfficialRegistryIssue97 = await roadOfficialRpcIssue97("brinesearch_authoritative_road_registry", {});
      roadOfficialCountyRowsIssue97 = Array.isArray(roadOfficialRegistryIssue97?.counties)
        ? roadOfficialRegistryIssue97.counties : [];
      roadOfficialRenderCountyOptionsIssue97();
    }

    function roadOfficialResultHtmlIssue97(row) {
      const names = (Array.isArray(row.names) ? row.names : [])
        .map(item => item?.name).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
      const designation = [row.route_system, row.route_number, row.route_suffix, row.route_fraction]
        .filter(Boolean).join(" ");
      const restrictions = [row.public_access_status !== "public" ? row.public_access_status : "", row.drivable_status !== "drivable" ? row.drivable_status : ""]
        .filter(Boolean).join(" · ");
      return `<article class="road-official-result-issue97 ${esc(row.identity_kind || "source_only")}">
        <button type="button" data-road-official-open="${esc(row.identity_id)}">
          <span class="road-official-result-title-issue97"><strong>${esc(row.display_name || "Unnamed official road")}</strong><b>${esc(roadOfficialIdentityKindIssue97(row.identity_kind))}</b></span>
          <small>${esc([designation, row.road_class, `${row.county_name || row.county_code || "Unknown county"}, ${row.state_code || ""}`].filter(Boolean).join(" • "))}</small>
          ${names.length ? `<span>${esc(names.slice(0, 5).join(" · "))}</span>` : ""}
          <small>${esc([row.source?.agency, row.source?.dataset, restrictions].filter(Boolean).join(" • "))}</small>
        </button>
      </article>`;
    }

	    async function roadOfficialLoadSearchIssue97() {
	      const list = document.getElementById("roadOfficialResultsIssue97");
	      if (!list) return;
	      const requestGeneration = ++roadOfficialSearchGenerationIssue97;
	      const filters = roadOfficialFiltersIssue97();
	      const previous = document.getElementById("roadOfficialPreviousIssue97");
	      const next = document.getElementById("roadOfficialNextIssue97");
	      if (previous) previous.disabled = true;
	      if (next) next.disabled = true;
	      const query = document.getElementById("roadOfficialSearchIssue97")?.value?.trim() || "";
	      if (query.length === 1) {
	        roadOfficialSearchNextIssue97 = null;
	        list.innerHTML = '<p class="admin-empty">Enter at least two characters to search official names and aliases.</p>';
	        const status = document.getElementById("roadOfficialPageIssue97");
	        if (status) status.textContent = "Search paused";
	        if (previous) previous.disabled = !roadOfficialSearchHistoryIssue97.length;
	        return;
	      }
	      if (query.length === 2 && !filters.p_county_code) {
	        roadOfficialSearchNextIssue97 = null;
	        list.innerHTML = '<p class="admin-empty">Choose a county for a two-character search, or enter at least three characters.</p>';
	        const status = document.getElementById("roadOfficialPageIssue97");
	        if (status) status.textContent = "County filter required";
	        if (previous) previous.disabled = !roadOfficialSearchHistoryIssue97.length;
	        return;
	      }
	      list.innerHTML = '<p class="admin-empty">Searching official road identities…</p>';
	      try {
	        const payload = await roadOfficialRpcIssue97("brinesearch_authoritative_road_search", filters);
	        if (requestGeneration !== roadOfficialSearchGenerationIssue97 || !list.isConnected) return;
	        const rows = Array.isArray(payload.results) ? payload.results : [];
        roadOfficialSearchNextIssue97 = payload.next_cursor || null;
        list.innerHTML = rows.length ? rows.map(roadOfficialResultHtmlIssue97).join("")
          : '<p class="admin-empty">No authoritative roads match these filters.</p>';
        list.querySelectorAll("[data-road-official-open]").forEach(button => {
          button.onclick = () => roadOfficialOpenIdentityIssue97(button.dataset.roadOfficialOpen);
        });
        const status = document.getElementById("roadOfficialPageIssue97");
        if (status) status.textContent = `${rows.length} official road identit${rows.length === 1 ? "y" : "ies"} on this page`;
	        if (previous) previous.disabled = !roadOfficialSearchHistoryIssue97.length;
	        if (next) next.disabled = !payload.has_more || !roadOfficialSearchNextIssue97;
	      } catch (error) {
	        if (requestGeneration !== roadOfficialSearchGenerationIssue97 || !list.isConnected) return;
	        list.innerHTML = `<p class="admin-empty">${esc(error?.message || "Official-road search failed.")}</p>`;
	        if (previous) previous.disabled = !roadOfficialSearchHistoryIssue97.length;
	        if (next) next.disabled = true;
	      }
	    }

	    function roadOfficialMembershipHtmlIssue97(membership, selectedIdentityId) {
	      const aliases = Array.isArray(membership.aliases) ? membership.aliases : [];
	      const selected = membership.identity_id === selectedIdentityId;
	      const designation = [membership.route_system, membership.route_number, membership.route_suffix,
	        membership.route_fraction, membership.route_extension].filter(Boolean).join(" ");
	      const source = membership.source || {};
	      return `<li class="${selected ? "selected" : ""}"><span><strong>${esc(membership.display_name || "Unnamed road")}</strong><small>${esc([
	        designation, membership.road_class, membership.membership_role,
	        roadOfficialIdentityKindIssue97(membership.identity_kind), membership.public_access_status !== "public" ? membership.public_access_status : ""
	      ].filter(Boolean).join(" • "))}</small><small>${esc([
	        source.agency, source.dataset, source.layer, source.version, membership.source_identity_key
	      ].filter(Boolean).join(" • "))}</small>${aliases.length ? `<em>${esc(aliases.join(" · "))}</em>` : ""}</span>${selected ? '<b>Selected road</b>' : `<button type="button" class="btn ghost small" data-road-official-open-connected="${esc(membership.identity_id)}" data-road-canonical-open-connected="${esc(membership.canonical_road_id || "")}">Open road</button>`}</li>`;
	    }

    function roadOfficialConnectionHtmlIssue97(connection, selectedIdentityId) {
	      const anchors = (Array.isArray(connection.anchors) ? connection.anchors : [])
	        .map(anchor => ({ anchor, point: routeIssue69Coordinate(anchor.coordinate) }))
	        .filter(item => item.point);
      const memberships = Array.isArray(connection.memberships) ? connection.memberships : [];
      const shared = connection.junction_type === "shared_segment";
      return `<article class="road-official-connection-issue97" data-junction-id="${esc(connection.junction_id)}">
        <header><span><strong>${esc(connection.display_id || connection.junction_key)}</strong><small>${esc([
          connection.junction_type, connection.membership_role,
          connection.distance_along_road_m == null ? "order unresolved" : `${Number(connection.distance_along_road_m).toFixed(1)} m along road`,
          [connection.municipality, connection.township, connection.county_name].filter(Boolean).join(", ")
        ].filter(Boolean).join(" • "))}</small></span><b>${shared ? "Shared section" : "Physical junction"}</b></header>
	        <div class="road-official-anchors-issue97">${anchors.length ? anchors.map(({ anchor, point }) => {
	          const role = shared ? (anchor.anchor_role === "shared_start" ? "Shared start" : "Shared end") : "Exact GPS";
	          return `<div><span><strong>${esc(role)}</strong><code>${point[1].toFixed(7)}, ${point[0].toFixed(7)}</code></span><span><button type="button" class="btn ghost small" data-road-official-copy="${esc(`${point[1].toFixed(7)}, ${point[0].toFixed(7)}`)}">Copy GPS</button><button type="button" class="btn secondary small" data-road-official-focus="${esc(`${point[0]},${point[1]}`)}">Show on map</button></span></div>`;
	        }).join("") : '<p class="admin-empty">Authoritative coordinate unavailable; map and copy actions are disabled.</p>'}</div>
	        <ul class="road-official-memberships-issue97">${memberships.map(row => roadOfficialMembershipHtmlIssue97(row, selectedIdentityId)).join("")}</ul>
	        <footer><span>${esc([
	          connection.source_method, connection.source_provenance?.algorithm, connection.build?.algorithm_version,
	          connection.confidence, connection.verification_status
	        ].filter(Boolean).join(" • "))}</span><code>${esc([connection.junction_key, connection.build?.source_revision_digest].filter(Boolean).join(" • "))}</code></footer>
	      </article>`;
	    }

    function roadOfficialWireConnectionActionsIssue97(host) {
      host.querySelectorAll("[data-road-official-copy]").forEach(button => {
        button.onclick = async () => {
          try { await navigator.clipboard.writeText(button.dataset.roadOfficialCopy); showToast("Junction GPS copied"); }
          catch { showToast("Press and hold the GPS coordinate to copy"); }
        };
      });
      host.querySelectorAll("[data-road-official-focus]").forEach(button => {
        button.onclick = () => {
          const [lng, lat] = String(button.dataset.roadOfficialFocus || "").split(",").map(Number);
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
          if (!roadOfficialFocusMapIssue97([lng, lat])) {
            window.open(`https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`, "_blank", "noopener,noreferrer");
          }
        };
      });
      host.querySelectorAll("[data-road-official-open-connected]").forEach(button => {
        button.onclick = async () => {
          const canonicalId = button.dataset.roadCanonicalOpenConnected;
          const canonical = canonicalId && (Array.isArray(roadManagerRows) ? roadManagerRows : [])
            .find(row => row.id === canonicalId);
          if (canonical) {
            await switchRoadManagerTabV173("roads");
            renderRoadForm(canonical);
            document.getElementById("roadManagerEditor")?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
          await switchRoadManagerTabV173("official");
          await roadOfficialOpenIdentityIssue97(button.dataset.roadOfficialOpenConnected);
        };
      });
    }

	    function roadOfficialRenderDetailIssue97() {
	      const host = document.getElementById("roadOfficialDetailIssue97");
	      const detail = roadOfficialSelectedDetailIssue97;
	      if (!host || !detail) return;
	      const mappings = Array.isArray(detail.canonical_mappings) ? detail.canonical_mappings : [];
	      const names = Array.isArray(detail.names) ? detail.names : [];
	      const firstAnchor = roadOfficialConnectionRowsIssue97
	        .flatMap(row => Array.isArray(row.anchors) ? row.anchors : [])
	        .map(anchor => routeIssue69Coordinate(anchor.coordinate)).find(Boolean);
	      const sourceUrl = roadOfficialSafeSourceUrlIssue97(detail.source?.url);
      roadOfficialMapIssue97?.resizeObserver?.disconnect();
      roadOfficialMapIssue97 = null;
      host.innerHTML = `<section class="road-manager-card road-official-detail-card-issue97">
        <div class="road-official-detail-head-issue97"><div><span class="road-official-eyebrow-issue97">${esc(detail.source_identity_key)}</span><h2>${esc(detail.display_name)}</h2><p>${esc([
          [detail.route_system, detail.route_number, detail.route_suffix, detail.route_fraction].filter(Boolean).join(" "),
          detail.road_class, `${detail.county_name || detail.county_code}, ${detail.state_code}`,
          detail.public_access_status, detail.drivable_status
        ].filter(Boolean).join(" • "))}</p></div><button type="button" class="btn ghost small" data-road-official-close>Close</button></div>
	        <div class="road-official-provenance-issue97"><div><strong>Aliases / designations</strong><span>${names.length ? names.map(row => `${row.name} (${row.type})`).map(esc).join(" · ") : "No additional source-backed names"}</span></div><div><strong>Canonical mapping</strong><span>${mappings.length ? mappings.map(row => `${row.canonical_name} · ${row.status} · ${row.method}`).map(esc).join(" · ") : "Source-only; not selectable for structured routes"}</span></div><div><strong>Source</strong><span>${esc([detail.source?.agency, detail.source?.dataset, detail.source?.layer, detail.source?.version].filter(Boolean).join(" • "))}</span>${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open official source</a>` : ""}</div></div>
      </section>
      <section class="road-manager-card road-official-connections-card-issue97">
        <div class="road-official-connections-head-issue97"><div><h2>Connections / Intersections</h2><p>One physical junction with every road membership. Names never create a connection.</p></div><b>${esc(`${roadOfficialConnectionRowsIssue97.length} shown`)}</b></div>
        <div class="road-official-order-issue97">Order: <strong>${esc(detail.connection_order_status || "unknown")}</strong>${detail.connection_order_status === "ambiguous" ? " — authoritative order could not be established; no projection was guessed." : ""}</div>
        ${firstAnchor ? `<div class="road-official-map-frame-issue97"><div id="roadOfficialMapIssue97" class="route-interactive-map-v17327 road-official-map-issue97" role="region" aria-label="Authoritative road junction map"><div class="route-interactive-tiles-v17327"></div><svg class="route-interactive-overlay-v17327" aria-hidden="true"></svg><div class="route-interactive-controls-v17327"><button type="button" data-road-official-map-in aria-label="Zoom in">+</button><span data-road-official-map-zoom>16</span><button type="button" data-road-official-map-out aria-label="Zoom out">−</button></div><div class="route-interactive-attribution-v17327">© OpenStreetMap contributors · authoritative junction overlay</div></div></div>` : '<p class="admin-empty">No active authoritative junction anchors are loaded for this identity.</p>'}
        <div class="road-official-connections-list-issue97">${roadOfficialConnectionRowsIssue97.map(row => roadOfficialConnectionHtmlIssue97(row, detail.identity_id)).join("")}</div>
        ${roadOfficialConnectionNextIssue97 ? '<button type="button" class="btn secondary" id="roadOfficialMoreConnectionsIssue97">Load more intersections</button>' : ""}
      </section>`;
	      host.querySelector("[data-road-official-close]").onclick = () => {
	        roadOfficialDetailGenerationIssue97 += 1;
	        roadOfficialConnectionGenerationIssue97 += 1;
	        roadOfficialMapIssue97?.resizeObserver?.disconnect();
	        roadOfficialMapIssue97 = null;
	        host.innerHTML = "";
	        roadOfficialSelectedDetailIssue97 = null;
	        roadOfficialConnectionRowsIssue97 = [];
	        roadOfficialConnectionNextIssue97 = null;
	      };
      roadOfficialWireConnectionActionsIssue97(host);
      document.getElementById("roadOfficialMoreConnectionsIssue97")?.addEventListener("click", roadOfficialLoadMoreConnectionsIssue97);
	      roadOfficialInitializeMapIssue97(firstAnchor);
      host.scrollIntoView({ behavior: "smooth", block: "start" });
    }

	    async function roadOfficialLoadMoreConnectionsIssue97() {
	      if (!roadOfficialSelectedDetailIssue97 || !roadOfficialConnectionNextIssue97) return;
	      const host = document.getElementById("roadOfficialDetailIssue97");
	      const detailGeneration = roadOfficialDetailGenerationIssue97;
	      const connectionGeneration = ++roadOfficialConnectionGenerationIssue97;
	      const identityId = roadOfficialSelectedDetailIssue97.identity_id;
	      const cursor = roadOfficialConnectionNextIssue97;
	      const cursorSignature = JSON.stringify(cursor);
	      const button = document.getElementById("roadOfficialMoreConnectionsIssue97");
	      if (button) { button.disabled = true; button.textContent = "Loading…"; }
	      try {
	        const payload = await roadOfficialRpcIssue97("brinesearch_authoritative_road_connections", {
	          p_identity_id: identityId,
	          p_cursor: cursor,
	          p_limit: 50
	        });
	        if (detailGeneration !== roadOfficialDetailGenerationIssue97
	          || connectionGeneration !== roadOfficialConnectionGenerationIssue97
	          || roadOfficialSelectedDetailIssue97?.identity_id !== identityId
	          || JSON.stringify(roadOfficialConnectionNextIssue97) !== cursorSignature
	          || !host?.isConnected) return;
	        roadOfficialConnectionRowsIssue97.push(...(Array.isArray(payload.connections) ? payload.connections : []));
	        roadOfficialConnectionNextIssue97 = payload.next_cursor || null;
	        roadOfficialRenderDetailIssue97();
	      } catch (error) {
	        if (detailGeneration !== roadOfficialDetailGenerationIssue97
	          || connectionGeneration !== roadOfficialConnectionGenerationIssue97
	          || !host?.isConnected) return;
	        if (button) { button.disabled = false; button.textContent = "Load more intersections"; }
	        showToast(error?.message || "Could not load more intersections");
	      }
	    }

	    async function roadOfficialOpenIdentityIssue97(identityId) {
	      const host = document.getElementById("roadOfficialDetailIssue97");
	      if (!host || !identityId) return;
	      const detailGeneration = ++roadOfficialDetailGenerationIssue97;
	      const connectionGeneration = ++roadOfficialConnectionGenerationIssue97;
	      roadOfficialSelectedDetailIssue97 = null;
	      roadOfficialConnectionRowsIssue97 = [];
	      roadOfficialConnectionNextIssue97 = null;
	      host.innerHTML = '<section class="road-manager-card"><p class="admin-empty">Loading exact aliases, provenance and physical junctions…</p></section>';
      try {
        const [detail, connections] = await Promise.all([
          roadOfficialRpcIssue97("brinesearch_authoritative_road_detail", { p_identity_id: identityId }),
	          roadOfficialRpcIssue97("brinesearch_authoritative_road_connections", { p_identity_id: identityId, p_cursor: null, p_limit: 50 })
	        ]);
	        if (detailGeneration !== roadOfficialDetailGenerationIssue97
	          || connectionGeneration !== roadOfficialConnectionGenerationIssue97
	          || !host.isConnected || document.getElementById("roadOfficialDetailIssue97") !== host) return;
	        detail.connection_order_status = connections.order_status || "unknown";
        roadOfficialSelectedDetailIssue97 = detail;
        roadOfficialConnectionRowsIssue97 = Array.isArray(connections.connections) ? connections.connections : [];
        roadOfficialConnectionNextIssue97 = connections.next_cursor || null;
	        roadOfficialRenderDetailIssue97();
	      } catch (error) {
	        if (detailGeneration !== roadOfficialDetailGenerationIssue97
	          || connectionGeneration !== roadOfficialConnectionGenerationIssue97
	          || !host.isConnected || document.getElementById("roadOfficialDetailIssue97") !== host) return;
	        host.innerHTML = `<section class="road-manager-card"><p class="admin-empty">${esc(error?.message || "Could not load authoritative road detail.")}</p></section>`;
	      }
	    }

	    async function renderOfficialRoadsTabIssue97() {
	      const pane = document.getElementById("roadManagerPane");
	      if (!pane) return;
	      roadOfficialInvalidateSearchIssue97();
	      roadOfficialDetailGenerationIssue97 += 1;
	      roadOfficialConnectionGenerationIssue97 += 1;
	      roadOfficialResetPagingIssue97();
	      roadOfficialSelectedDetailIssue97 = null;
	      roadOfficialConnectionRowsIssue97 = [];
	      roadOfficialConnectionNextIssue97 = null;
      pane.innerHTML = `<section class="road-manager-card road-official-search-card-issue97">
        <div><h2>All official roads</h2><p>Search source-scoped OH/WV/PA identities. Source-only roads are viewable here but cannot enter a structured route until explicitly mapped.</p></div>
        <div class="road-official-filters-issue97"><input id="roadOfficialSearchIssue97" autocomplete="off" placeholder="Official name, alias or designation…"><select id="roadOfficialStateIssue97" aria-label="State"><option value="">All states</option><option value="OH">Ohio</option><option value="WV">West Virginia</option><option value="PA">Pennsylvania</option></select><select id="roadOfficialCountyIssue97" aria-label="County"><option value="">All confirmed counties</option></select><select id="roadOfficialClassIssue97" aria-label="Road class"><option value="">All classes</option><option value="interstate">Interstate</option><option value="us_route">U.S. route</option><option value="state_route">State route</option><option value="county">County road</option><option value="township">Township road</option><option value="local">Local road</option><option value="ramp">Ramp</option><option value="trail">Trail</option></select><select id="roadOfficialAccessIssue97" aria-label="Access"><option value="">All access classes</option><option value="public">Public</option><option value="access">Access</option><option value="private">Private</option><option value="held">Held</option><option value="unknown">Unknown</option></select><select id="roadOfficialMappingIssue97" aria-label="Mapping status"><option value="">All identity statuses</option><option value="canonical">Canonical</option><option value="source_only">Source-only</option><option value="candidate">Needs review</option></select></div>
        <div class="road-official-search-note-issue97"><strong>No-guess identity:</strong> search text finds records; it never merges same-name roads or promotes a source identity. <span id="roadOfficialRegistrySummaryIssue97"></span></div>
      </section>
      <section class="road-manager-card"><div id="roadOfficialResultsIssue97" class="road-official-results-issue97"></div><div class="route-prep-pagination"><button class="btn ghost small" id="roadOfficialPreviousIssue97">Previous</button><span id="roadOfficialPageIssue97"></span><button class="btn ghost small" id="roadOfficialNextIssue97">Next</button></div></section>
      <div id="roadOfficialDetailIssue97"></div>`;
      await roadOfficialLoadCountiesIssue97();
      const registrySummary = document.getElementById("roadOfficialRegistrySummaryIssue97");
      if (registrySummary) registrySummary.textContent = `${Number(roadOfficialRegistryIssue97?.dataset_count || 0)} authoritative datasets · ${roadOfficialCountyRowsIssue97.length} confirmed counties.`;
	      let timer;
	      document.getElementById("roadOfficialSearchIssue97").oninput = () => {
	        roadOfficialInvalidateSearchIssue97();
	        clearTimeout(timer); timer = setTimeout(() => { roadOfficialResetPagingIssue97(); roadOfficialLoadSearchIssue97(); }, 220);
	      };
	      ["roadOfficialCountyIssue97", "roadOfficialClassIssue97", "roadOfficialAccessIssue97", "roadOfficialMappingIssue97"].forEach(id => {
	        document.getElementById(id).onchange = () => {
	          roadOfficialInvalidateSearchIssue97(); roadOfficialResetPagingIssue97(); roadOfficialLoadSearchIssue97();
	        };
	      });
	      document.getElementById("roadOfficialStateIssue97").onchange = () => {
	        roadOfficialInvalidateSearchIssue97();
	        const state = document.getElementById("roadOfficialStateIssue97")?.value || "";
	        const county = document.getElementById("roadOfficialCountyIssue97");
	        if (county?.value && state && !county.value.startsWith(`${state}|`)) county.value = "";
	        roadOfficialRenderCountyOptionsIssue97(); roadOfficialResetPagingIssue97(); roadOfficialLoadSearchIssue97();
	      };
      document.getElementById("roadOfficialPreviousIssue97").onclick = () => {
        roadOfficialSearchCursorIssue97 = roadOfficialSearchHistoryIssue97.pop() || null;
        roadOfficialLoadSearchIssue97();
      };
      document.getElementById("roadOfficialNextIssue97").onclick = () => {
        if (!roadOfficialSearchNextIssue97) return;
        roadOfficialSearchHistoryIssue97.push(roadOfficialSearchCursorIssue97);
        roadOfficialSearchCursorIssue97 = roadOfficialSearchNextIssue97;
        roadOfficialLoadSearchIssue97();
      };
      await roadOfficialLoadSearchIssue97();
    }

    const switchRoadManagerTabBeforeIssue97 = switchRoadManagerTabV173;
    switchRoadManagerTabV173 = async function switchRoadManagerTabIssue97(tab) {
      if (tab !== "official") return switchRoadManagerTabBeforeIssue97(tab);
      roadManagerActiveTabV173 = "official";
      document.querySelectorAll("[data-road-manager-tab]").forEach(button => {
        const active = button.dataset.roadManagerTab === "official";
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      await renderOfficialRoadsTabIssue97();
    };

    const renderRoadManagerSettingsBeforeIssue97 = renderRoadManagerSettings;
    renderRoadManagerSettings = async function renderRoadManagerSettingsIssue97() {
      const desiredTab = roadManagerActiveTabV173;
      if (!editorSession?.access_token || !editorCanEdit()) return renderRoadManagerSettingsBeforeIssue97();
      if (!editorIsOwner()) {
        document.title = "Road Manager · BrineSearch";
        app.innerHTML = `<main class="road-manager-page"><section class="road-manager-hero"><div><h1>Road Manager</h1><p>Read-only official OH/WV/PA road identities and physical connections.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section><div class="road-manager-tabs" role="tablist"><button type="button" data-road-manager-tab="official" role="tab">All official roads</button></div><div id="roadManagerPane"></div></main>`;
        document.querySelector("[data-road-manager-tab=official]").onclick = () => switchRoadManagerTabV173("official");
        await switchRoadManagerTabV173("official");
        return;
      }
      await renderRoadManagerSettingsBeforeIssue97();
      const tabs = document.querySelector(".road-manager-tabs");
      if (!tabs) return;
      if (!tabs.querySelector('[data-road-manager-tab="official"]')) {
        const button = document.createElement("button");
        button.type = "button"; button.dataset.roadManagerTab = "official";
        button.setAttribute("role", "tab"); button.textContent = "All official roads";
        button.onclick = () => switchRoadManagerTabV173("official");
        tabs.appendChild(button);
      }
      if (desiredTab === "official") await switchRoadManagerTabV173("official");
    };

	    const renderRoadFormBeforeIssue97 = renderRoadForm;
	    renderRoadForm = function renderRoadFormConnectionsIssue97(row = emptyRoadForm()) {
	      renderRoadFormBeforeIssue97(row);
	      if (!row?.id) return;
	      const host = document.getElementById("roadManagerEditor");
	      if (!host || host.querySelector(".road-canonical-connections-issue97")) return;
	      const section = document.createElement("section");
	      section.className = "road-manager-card road-canonical-connections-issue97";
	      section.innerHTML = `<div><h3>Connections / Intersections</h3><p>Open verified exact source mappings and inspect held mapping candidates. Names are never guessed.</p></div><button type="button" class="btn secondary" data-road-canonical-connections>Open authoritative connections</button><div data-road-canonical-identity-list></div>`;
	      host.appendChild(section);
	      const trigger = section.querySelector("[data-road-canonical-connections]");
	      const list = section.querySelector("[data-road-canonical-identity-list]");
	      let identities = [];
	      let connections = [];
	      let nextCursor = null;
	      let hasMore = false;
	      let requestGeneration = 0;
	      let loading = false;

	      const renderCanonicalConnections = () => {
	        if (!section.isConnected) return;
	        if (!identities.length) {
	          list.innerHTML = '<p class="admin-empty">No exact authoritative identity mapping exists. This road remains fail-closed for graph connections.</p>';
	          return;
	        }
	        const verified = identities.filter(identity => identity.mapping_status === "verified");
	        const candidates = identities.filter(identity => identity.mapping_status !== "verified");
	        const mappingSummary = `${verified.length} verified exact mapping${verified.length === 1 ? "" : "s"}`
	          + (candidates.length ? ` · ${candidates.length} held candidate${candidates.length === 1 ? "" : "s"}` : "");
	        list.innerHTML = `<div class="road-canonical-identities-summary-issue97"><strong>${esc(mappingSummary)}</strong><span>${esc(`${connections.length} physical connection${connections.length === 1 ? "" : "s"} shown`)}</span></div><div class="road-canonical-identity-choices-issue97">${identities.map(identity => `<button type="button" class="road-canonical-identity-choice-issue97 ${identity.mapping_status === "verified" ? "verified" : "candidate"}" data-road-canonical-identity="${esc(identity.identity_id)}"><strong>${esc(identity.display_name)}</strong><small>${esc([identity.source_identity_key, identity.county_name, identity.mapping_status === "verified" ? "verified canonical mapping" : "candidate only · not route-usable", identity.source_agency].filter(Boolean).join(" • "))}</small></button>`).join("")}</div>${connections.length ? `<div class="road-official-connections-list-issue97">${connections.map(connection => roadOfficialConnectionHtmlIssue97(connection, null)).join("")}</div>` : `<p class="admin-empty">${verified.length ? "Verified identities are mapped, but no active physical junctions are loaded." : "Candidate identities remain held; no canonical graph connections are route-usable."}</p>`}${hasMore && nextCursor ? '<button type="button" class="btn secondary" data-road-canonical-more>Load more intersections</button>' : ""}`;
	        list.querySelectorAll("[data-road-canonical-identity]").forEach(button => {
	          button.onclick = async () => {
	            requestGeneration += 1;
	            await switchRoadManagerTabV173("official");
	            await roadOfficialOpenIdentityIssue97(button.dataset.roadCanonicalIdentity);
	          };
	        });
	        list.querySelector("[data-road-canonical-more]")?.addEventListener("click", () => loadCanonicalConnections(false));
	        roadOfficialWireConnectionActionsIssue97(list);
	      };

	      const loadCanonicalConnections = async reset => {
	        if (loading || !section.isConnected) return;
	        const generation = ++requestGeneration;
	        const cursor = reset ? null : nextCursor;
	        loading = true;
	        trigger.disabled = true;
	        trigger.textContent = reset ? "Loading authoritative connections…" : "Loading more intersections…";
	        const more = list.querySelector("[data-road-canonical-more]");
	        if (more) more.disabled = true;
	        try {
	          const calls = [roadOfficialRpcIssue97("brinesearch_authoritative_road_connections_for_canonical", {
	            p_road_id: row.id, p_cursor: cursor, p_limit: 100
	          })];
	          if (reset) calls.unshift(roadOfficialRpcIssue97("brinesearch_authoritative_identities_for_road", { p_road_id: row.id }));
	          const payloads = await Promise.all(calls);
	          if (generation !== requestGeneration || !section.isConnected) return;
	          const identityPayload = reset ? payloads[0] : null;
	          const connectionPayload = reset ? payloads[1] : payloads[0];
	          if (reset) identities = Array.isArray(identityPayload.identities) ? identityPayload.identities : [];
	          const page = Array.isArray(connectionPayload.connections) ? connectionPayload.connections : [];
	          const combined = reset ? page : [...connections, ...page];
	          connections = [...new Map(combined.map(connection => [connection.junction_id, connection])).values()];
	          nextCursor = connectionPayload.next_cursor || null;
	          hasMore = Boolean(connectionPayload.has_more && nextCursor);
	          renderCanonicalConnections();
	        } catch (error) {
	          if (generation !== requestGeneration || !section.isConnected) return;
	          list.innerHTML = `<p class="admin-empty">${esc(error?.message || "Could not resolve authoritative identity.")}</p>`;
	        } finally {
	          if (generation === requestGeneration && section.isConnected) {
	            loading = false;
	            trigger.disabled = false;
	            trigger.textContent = "Refresh authoritative connections";
	          }
	        }
	      };

	      trigger.onclick = () => loadCanonicalConnections(true);
	    };

    // #69 route-draft round trip. The anchor belongs to the right-hand step.
    const routeIssue69StructuredSegmentBeforeIssue97 = routeIssue69StructuredSegment;
    routeIssue69StructuredSegment = function routeIssue69StructuredSegmentIssue97(step) {
      return {
        ...routeIssue69StructuredSegmentBeforeIssue97(step),
        entryJunctionAnchorId: step?.entry_junction_anchor_id || step?.entryJunctionAnchorId || null,
        entryJunctionId: step?.entry_junction_id || step?.entryJunctionId || null,
        junctionBuildId: step?.junction_build_id || step?.junctionBuildId || null,
        junctionDigest: step?.junction_digest || step?.junctionDigest || null,
        entryJunction: step?.entry_junction || step?.entryJunction || null
      };
    };

    const routeIssue69NormalizeBeforeIssue97 = routeIssue69NormalizeDraftSegment;
    routeIssue69NormalizeDraftSegment = function routeIssue69NormalizeDraftSegmentIssue97(segment) {
      return {
        ...routeIssue69NormalizeBeforeIssue97(segment),
        entryJunctionAnchorId: segment?.entryJunctionAnchorId || segment?.entry_junction_anchor_id || null,
        entryJunctionId: segment?.entryJunctionId || segment?.entry_junction_id || null,
        junctionBuildId: segment?.junctionBuildId || segment?.junction_build_id || null,
        junctionDigest: segment?.junctionDigest || segment?.junction_digest || null,
        entryJunction: segment?.entryJunction || segment?.entry_junction || null
      };
    };

    routeIssue69DraftSave = function routeIssue69DraftSaveIssue97() {
      const pad = routeMapperSelectedPadV17324;
      if (!pad) return;
      const drafts = routeIssue69DraftsRead();
      drafts[routeMapperLegacyIdV17324(pad)] = {
        routeRevision: routeIssue69State.routeRevision || 0,
        reviewId: routeIssue69State.reviewId || null,
        steps: routeMapperSegmentsV17324.map(segment => ({
          roadId: segment.roadId || "", roadName: segment.roadName || "Unnamed road",
          roadType: segment.roadType || "local", routeNumber: segment.routeNumber || null,
          state: segment.state || null, verificationStatus: segment.verificationStatus || null,
          sourceAgency: segment.sourceAgency || null, sourceUrl: segment.sourceUrl || null,
          sourceRecordId: segment.sourceRecordId || null,
          geometryStatus: segment.geometryStatus || "needs_step_geometry", miles: segment.miles || "",
          turn: segment.turn || "", note: segment.note || "",
          routeStepId: segment.routeStepId || routeIssue69Uuid(),
          startCoordinate: routeIssue69Coordinate(segment.startCoordinate),
          endCoordinate: routeIssue69Coordinate(segment.endCoordinate),
          clippedGeometry: routeIssue69Line(segment.clippedGeometry),
          aliases: Array.isArray(segment.aliases) ? segment.aliases : [],
          inboundTurn: segment.inboundTurn || "", geometrySource: segment.geometrySource || null,
          geometrySourceRecordId: segment.geometrySourceRecordId || null,
          geometryVersion: Number(segment.geometryVersion || 0),
          routeRevision: Number(segment.routeRevision || routeIssue69State.routeRevision || 0),
          entryJunctionAnchorId: segment.entryJunctionAnchorId || null,
          entryJunctionId: segment.entryJunctionId || null,
          junctionBuildId: segment.junctionBuildId || null,
          junctionDigest: segment.junctionDigest || null,
          entryJunction: segment.entryJunction || null
        }))
      };
      try { localStorage.setItem(ROUTE_ISSUE69_DRAFT_KEY, JSON.stringify(drafts)); } catch {}
    };

    routeIssue69TopologySignature = function routeIssue69TopologySignatureIssue97() {
      return JSON.stringify({
        padId: routeIssue69CurrentPadId(),
        steps: (routeMapperSegmentsV17324 || []).map(segment => ({
          routeStepId: segment?.routeStepId || null, roadId: segment?.roadId || null,
          start: routeIssue69Coordinate(segment?.startCoordinate),
          end: routeIssue69Coordinate(segment?.endCoordinate),
          entryJunctionAnchorId: segment?.entryJunctionAnchorId || null,
          turn: segment?.turn || null, inboundTurn: segment?.inboundTurn || null
        }))
      });
    };

    const routeIssue69ValidateBeforeIssue97 = routeIssue69ValidateStructuredPayload;
    routeIssue69ValidateStructuredPayload = function routeIssue69ValidateStructuredPayloadIssue97(payload, options = {}) {
      const validated = routeIssue69ValidateBeforeIssue97(payload, options);
      validated.steps.forEach((segment, index) => {
        if (index === 0 && segment.entryJunctionAnchorId) throw new Error("Reloaded first step unexpectedly has a graph entry anchor");
        if (!index) return;
        const differentRoad = validated.steps[index - 1].roadId !== segment.roadId;
        if (differentRoad && !segment.entryJunctionAnchorId) throw new Error(`Reloaded step ${index + 1} has no authoritative junction anchor`);
        if (!differentRoad && segment.entryJunctionAnchorId) throw new Error(`Reloaded same-road step ${index + 1} has an invalid graph anchor`);
      });
      return validated;
    };

    const routeIssue69PublishPayloadBeforeIssue97 = routeIssue69PublishPayload;
    routeIssue69PublishPayload = function routeIssue69PublishPayloadIssue97() {
      const payload = routeIssue69PublishPayloadBeforeIssue97();
      payload.forEach((step, index) => {
        const segment = routeMapperSegmentsV17324[index];
        const differentRoad = index > 0 && routeMapperSegmentsV17324[index - 1]?.roadId !== segment?.roadId;
        if (index === 0 && segment?.entryJunctionAnchorId) throw new Error("Step 1 cannot have an entry junction anchor");
        if (differentRoad && !segment?.entryJunctionAnchorId) throw new Error(`Step ${index + 1}: choose an authoritative road junction before publishing`);
        if (!differentRoad && index > 0 && segment?.entryJunctionAnchorId) throw new Error(`Step ${index + 1}: same-road splits cannot use a junction anchor`);
        step.entry_junction_anchor_id = differentRoad ? segment.entryJunctionAnchorId : null;
      });
      return payload;
    };

    function routeIssue97ClearEntryAnchor(segment) {
      if (!segment) return;
      segment.entryJunctionAnchorId = null; segment.entryJunctionId = null;
      segment.junctionBuildId = null; segment.junctionDigest = null; segment.entryJunction = null;
    }

    const routeIssue69InvalidateWindowBeforeIssue97 = routeIssue69InvalidateWindow;
    routeIssue69InvalidateWindow = function routeIssue69InvalidateWindowIssue97(index, clearBoundaries = true) {
      routeIssue69InvalidateWindowBeforeIssue97(index, clearBoundaries);
      if (!clearBoundaries) return;
      routeIssue97ClearEntryAnchor(routeMapperSegmentsV17324[Number(index)]);
      routeIssue97ClearEntryAnchor(routeMapperSegmentsV17324[Number(index) + 1]);
      routeIssue69DraftSave();
    };

    const routeIssue69ClearReorderBeforeIssue97 = routeIssue69ClearAllTopologyAfterReorder;
    routeIssue69ClearAllTopologyAfterReorder = function routeIssue69ClearAllTopologyAfterReorderIssue97() {
      routeIssue69ClearReorderBeforeIssue97();
      routeMapperSegmentsV17324.forEach(routeIssue97ClearEntryAnchor);
      routeIssue69DraftSave();
    };

    const routeIssue69UseCandidateBeforeIssue97 = routeInteractiveUseCandidateV17327;
    routeInteractiveUseCandidateV17327 = async function routeInteractiveUseCandidateIssue97(candidate, stepIndex) {
      await routeIssue69UseCandidateBeforeIssue97(candidate, stepIndex);
      const index = Number(routeInteractiveSelectedStepV17327);
      routeIssue97ClearEntryAnchor(routeMapperSegmentsV17324[index]);
      routeIssue97ClearEntryAnchor(routeMapperSegmentsV17324[index + 1]);
      routeIssue69DraftSave();
    };

    const routeIssue69RemoveBeforeIssue97 = routeStepRemoveSelectedV17328;
    routeStepRemoveSelectedV17328 = async function routeStepRemoveSelectedIssue97() {
      const index = Number(routeInteractiveSelectedStepV17327);
      const count = routeMapperSegmentsV17324.length;
      await routeIssue69RemoveBeforeIssue97();
      if (routeMapperSegmentsV17324.length === count) return;
      routeIssue97ClearEntryAnchor(routeMapperSegmentsV17324[Math.max(0, index)]);
      routeIssue69DraftSave();
    };

    routeIssue69ApplyBoundaryGuarded = async function routeIssue69ApplyBoundaryGuardedIssue97(index, side, coordinate, token, candidate = null) {
      if (!routeIssue69RequestCurrent(token)) return false;
      const current = routeMapperSegmentsV17324[Number(index)];
      const point = routeIssue69Coordinate(coordinate);
      if (!current || !point) return false;
      const previous = routeMapperSegmentsV17324[Number(index) - 1];
      const next = routeMapperSegmentsV17324[Number(index) + 1];
      const adjacent = side === "start" ? previous : next;
      const anchorTarget = side === "start" ? current : next;
      if (adjacent) {
        const differentRoad = adjacent.roadId !== current.roadId;
        if (differentRoad && !candidate?.anchor_id) throw new Error("Authoritative junction anchor missing from boundary choice");
        if (!differentRoad && candidate?.anchor_id) throw new Error("Same-road split cannot use a graph junction anchor");
        routeIssue97ClearEntryAnchor(anchorTarget);
        if (differentRoad) {
          anchorTarget.entryJunctionAnchorId = candidate.anchor_id;
          anchorTarget.entryJunctionId = candidate.junction_id || null;
          anchorTarget.junctionBuildId = candidate.build_id || null;
          anchorTarget.junctionDigest = candidate.junction_digest || null;
          anchorTarget.entryJunction = candidate;
        }
      } else if (side === "start") routeIssue97ClearEntryAnchor(current);
      if (side === "start") {
        current.startCoordinate = point;
        if (previous) previous.endCoordinate = [...point];
      } else {
        current.endCoordinate = point;
        if (next) next.startCoordinate = [...point];
      }
      routeIssue69BoundaryMode = null;
      routeIssue69BoundarySheetClose();
      routeIssue69BumpTopology();
      await routeIssue69ReclipAroundGuarded(index);
      routeInteractiveRenderEditBarV17327();
      await routeStepSnapToV17328(index, false);
      return true;
    };

	    routeIssue69RenderBoundaryChoicesGuarded = function routeIssue69RenderBoundaryChoicesGuardedIssue97(index, side, payload, token) {
	      const root = routeInteractiveMapV17327?.root;
	      if (!root || !routeIssue69RequestCurrent(token)) return;
	      routeIssue69BoundarySheetClose();
	      const rawCandidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
	      if (!rawCandidates.length) throw new Error("Authoritative junction coordinate unresolved");
	      const candidatePoints = rawCandidates.map(candidate => routeIssue69Coordinate(candidate.coordinate));
	      if (candidatePoints.some(point => !point)) throw new Error("Authoritative junction returned an invalid coordinate");
	      const candidates = rawCandidates.map((candidate, candidateIndex) => ({
	        ...candidate, coordinate: candidatePoints[candidateIndex]
	      }));
	      const sheet = document.createElement("div");
      sheet.className = "route-boundary-sheet-issue69 route-map-road-sheet-v17327";
	      sheet.innerHTML = `<div class="route-map-road-sheet-head"><div><strong>Choose authoritative ${side} boundary</strong><small>Every physical occurrence remains separate; choose explicitly</small></div><button type="button" data-route-boundary-close aria-label="Close">×</button></div><div class="route-map-road-candidates">${candidates.map((candidate, candidateIndex) => {
	        const point = candidate.coordinate;
        const sharedRole = candidate.anchor_role === "shared_start" ? "shared-section start" : candidate.anchor_role === "shared_end" ? "shared-section end" : "physical point";
        return `<button type="button" data-route-boundary-choice="${candidateIndex}"><span><strong>${point[1].toFixed(6)}, ${point[0].toFixed(6)}</strong><small>${esc([candidate.display_id || candidate.junction_key, candidate.junction_type, sharedRole, candidate.distance_to_tap_m != null ? `${candidate.distance_to_tap_m} m from tap` : ""].filter(Boolean).join(" • "))}</small></span><b>Use</b></button>`;
      }).join("")}</div>`;
      root.appendChild(sheet);
      sheet.querySelector("[data-route-boundary-close]").onclick = () => {
        routeIssue69BoundaryMode = null; routeIssue69BoundarySheetClose(); routeInteractiveRenderEditBarV17327();
      };
      sheet.querySelectorAll("[data-route-boundary-choice]").forEach(button => {
        button.onclick = async () => {
          if (!routeIssue69RequestCurrent(token)) { routeIssue69BoundarySheetClose(); return; }
          const candidate = candidates[Number(button.dataset.routeBoundaryChoice)];
          if (!candidate) return;
          button.disabled = true;
          try { await routeIssue69ApplyBoundaryGuarded(index, side, candidate.coordinate, token, candidate); }
          catch (error) { button.disabled = false; showToast(error?.message || "Could not set route boundary"); }
        };
      });
    };

    routeIssue69ResolveBoundaryTapGuarded = async function routeIssue69ResolveBoundaryTapGuardedIssue97(index, side, point) {
      const current = routeMapperSegmentsV17324[Number(index)];
      if (!current?.roadId) throw new Error("Selected step has no Road Manager road ID");
      const token = { padId: routeIssue69CurrentPadId(), index: Number(index), topologyGeneration: routeIssue69TopologyGeneration, routeStepId: current.routeStepId };
      const near = [Number(point.lng), Number(point.lat)];
      const adjacent = side === "start" ? routeMapperSegmentsV17324[Number(index) - 1] : routeMapperSegmentsV17324[Number(index) + 1];
	      if (!adjacent) {
	        const snapped = await routeIssue69Rpc("brinesearch_route_step_snap_point", { p_road_id: current.roadId, p_near_coordinate: near });
	        if (!routeIssue69RequestCurrent(token)) return;
	        if (!snapped?.resolved) throw new Error(String(snapped?.reason || "route anchor unresolved").replaceAll("_", " "));
	        const snappedPoint = routeIssue69Coordinate(snapped.coordinate);
	        if (!snappedPoint) throw new Error("Authoritative route anchor returned an invalid coordinate");
	        await routeIssue69ApplyBoundaryGuarded(index, side, snappedPoint, token, null);
        return;
      }
      if (!adjacent.roadId) throw new Error("Adjacent step has no Road Manager road ID");
      const payload = await routeIssue69Rpc("brinesearch_route_step_boundary_candidates", {
        p_left_road_id: side === "start" ? adjacent.roadId : current.roadId,
        p_right_road_id: side === "start" ? current.roadId : adjacent.roadId,
        p_near_coordinate: near, p_limit: 8
      });
      if (!routeIssue69RequestCurrent(token)) return;
	      const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
	      if (!payload?.resolved || !candidates.length) throw new Error(String(payload?.reason || "authoritative junction unresolved").replaceAll("_", " "));
	      const candidatePoints = candidates.map(candidate => routeIssue69Coordinate(candidate.coordinate));
	      if (candidatePoints.some(candidatePoint => !candidatePoint)) throw new Error("Authoritative junction returned an invalid coordinate");
	      const normalizedCandidates = candidates.map((candidate, candidateIndex) => ({
	        ...candidate, coordinate: candidatePoints[candidateIndex]
	      }));
	      const normalizedPayload = { ...payload, candidates: normalizedCandidates };
	      if (payload?.ambiguous || Number(payload?.candidate_count || candidates.length) !== 1 || payload?.candidates_truncated) {
	        routeIssue69RenderBoundaryChoicesGuarded(index, side, normalizedPayload, token); return;
	      }
	      await routeIssue69ApplyBoundaryGuarded(index, side, normalizedCandidates[0].coordinate, token, normalizedCandidates[0]);
	    };
