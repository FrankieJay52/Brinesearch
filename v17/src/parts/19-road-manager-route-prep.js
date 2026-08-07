    /* BrineSearch V17.3 — canonical Road Manager + owner Route Prep */
    const ROAD_TYPE_LABELS_V173 = {
      interstate: "Interstate",
      us_route: "U.S. route",
      state_route: "State route",
      county: "County road",
      township: "Township road",
      local: "Local road",
      access: "Access / lease road"
    };
    const ROAD_DIRECTION_LABELS_V173 = { N: "North", S: "South", E: "East", W: "West" };
    const ROUTE_PREP_STATUS_LABELS_V173 = {
      ready_for_road_matching: "Ready for road matching",
      needs_gps_review: "GPS needs review",
      needs_sequence_rebuild: "Sequence needs rebuilding",
      needs_sequence_cleanup: "Sequence needs cleanup",
      needs_highway_anchor: "Needs highway anchor",
      needs_state_route_candidate_review: "State-route candidate review",
      needs_sequence_reorder: "Sequence order needs review",
      ready_for_geometry: "Ready for mileage",
      geometry_measured: "Mileage measured",
      field_check: "Needs field confirmation",
      approved: "Approved",
      blocked: "Blocked"
    };
    const ROUTE_PREP_STATUS_ORDER_V173 = Object.keys(ROUTE_PREP_STATUS_LABELS_V173);
    let roadManagerActiveTabV173 = "roads";
    let routePrepRowsV173 = [];
    let routePrepSelectedV173 = null;
    let routePrepOffsetV173 = 0;

    function roadTypeLabelV173(value) {
      return ROAD_TYPE_LABELS_V173[value] || String(value || "Road").replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
    }

    function roadDirectionLabelV173(value) {
      return ROAD_DIRECTION_LABELS_V173[String(value || "").toUpperCase()] || String(value || "");
    }

    function roadDirectionBadgesV173(row) {
      const directions = Array.from(new Set((Array.isArray(row?.route_directions) ? row.route_directions : [])
        .map(value => String(value || "").toUpperCase())
        .filter(value => ROAD_DIRECTION_LABELS_V173[value])));
      if (!directions.length) return "";
      return `<div class="road-direction-list" aria-label="Directions referenced in pad routes">${directions.map(value => `<span class="road-direction-chip road-direction-${value.toLowerCase()}">${esc(roadDirectionLabelV173(value))}</span>`).join("")}</div>`;
    }

    function roadScopeLabelV173(row) {
      if (["interstate", "us_route"].includes(row?.road_type)) {
        const coverage = Array.isArray(row?.coverage_states) ? row.coverage_states.filter(Boolean) : [];
        return coverage.length ? `Multi-state · ${coverage.join(", ")}` : "Multi-state";
      }
      return [row?.state, row?.county, row?.township].filter(Boolean).join(" • ") || "Location not set";
    }

    function roadStatusLabel(valueOrRow) {
      const row = valueOrRow && typeof valueOrRow === "object" ? valueOrRow : { verification_status: valueOrRow };
      if (row.candidate_only) return "Candidate only";
      return ({
        verified: "Official road verified",
        map_match: "Public map match",
        field_name: ["interstate", "us_route", "state_route"].includes(row.road_type) ? "Needs review" : "Local / field name",
        needs_review: "Needs review"
      })[row.verification_status] || "Needs review";
    }

    function roadRowHtml(row) {
      const aliases = Array.isArray(row.aliases) ? row.aliases.filter(Boolean) : [];
      const aliasText = aliases.length ? `<div class="road-row-aliases">Also seen as ${esc(aliases.slice(0, 4).join(", "))}${aliases.length > 4 ? ` +${aliases.length - 4}` : ""}</div>` : "";
      const status = roadStatusLabel(row);
      return `<article class="road-row road-row-v173">
        <button type="button" data-road-open="${esc(row.id)}">
          <div class="road-row-name">${esc(row.canonical_name)}</div>
          <div class="road-row-meta">${esc(`${roadTypeLabelV173(row.road_type)} • ${roadScopeLabelV173(row)}`)}</div>
          ${roadDirectionBadgesV173(row)}
          ${aliasText}
          <div class="road-badges">${roadBadgeHtml(row)}</div>
        </button>
        <span class="road-status ${row.verification_status === "verified" ? "verified" : ""} ${row.candidate_only ? "candidate" : ""}">${esc(status)}</span>
      </article>`;
    }

    function parseNumberedRoadV173(name, selectedType, selectedState) {
      const original = normalize(name).toUpperCase().replace(/\s+/g, " ");
      let match = original.match(/^(I|INTERSTATE)\s*[- ]?\s*0*(\d{1,3})\s*(N|S|E|W)?$/i);
      if (match) return { canonical: `I-${Number(match[2])}`, type: "interstate", state: null, direction: match[3]?.toUpperCase() || null, original };
      match = original.match(/^(US|U\.?S\.?)\s*[- ]?\s*0*(\d{1,3})\s*(N|S|E|W)?$/i);
      if (match) return { canonical: `US-${Number(match[2])}`, type: "us_route", state: null, direction: match[3]?.toUpperCase() || null, original };
      match = original.match(/^(OH|OHIO|PA|PENNSYLVANIA|WV|WEST VIRGINIA|SR|STATE ROUTE)\s*[- ]?\s*0*(\d{1,4})\s*(N|S|E|W)?$/i);
      if (match) {
        let state = String(match[1] || "").toUpperCase();
        if (state === "OHIO") state = "OH";
        if (state === "PENNSYLVANIA") state = "PA";
        if (state === "WEST VIRGINIA") state = "WV";
        if (state === "SR" || state === "STATE ROUTE") state = String(selectedState || "").trim().toUpperCase();
        if (!["OH", "PA", "WV"].includes(state)) return { error: "Choose OH, PA, or WV for a state route." };
        return { canonical: `${state}-${Number(match[2])}`, type: "state_route", state, direction: match[3]?.toUpperCase() || null, original };
      }
      if (["interstate", "us_route", "state_route"].includes(selectedType)) {
        return { error: "Use a numbered-road name such as I-70, US-40, or OH-148. Put East/West/North/South in the direction field, not in the road name." };
      }
      return { canonical: normalize(name), type: selectedType, state: normalize(selectedState).toUpperCase() || null, direction: null, original };
    }

    async function findCanonicalRoadV173(canonical, roadType, state) {
      let path = `/rest/v1/brinesearch_roads?select=*&canonical_name=eq.${encodeURIComponent(canonical)}&road_type=eq.${encodeURIComponent(roadType)}&limit=2`;
      path += ["interstate", "us_route"].includes(roadType)
        ? "&state=is.null"
        : (state ? `&state=eq.${encodeURIComponent(state)}` : "&state=is.null");
      const rows = await editorRequest(path, { method: "GET" });
      return Array.isArray(rows) ? rows[0] || null : null;
    }

    function emptyRoadForm() {
      return { id: "", canonical_name: "", normalized_name: "", road_type: "local", state: "", county: "", township: "", aliases: [], route_directions: [], surface: "", truck_route: false, narrow: false, gravel: false, steep_grade: false, low_bridge: false, weight_limit: false, one_lane: false, seasonal: false, gate: false, construction: false, cb_channel: "", notes: "", verification_status: "needs_review" };
    }

    function renderRoadForm(row = emptyRoadForm()) {
      const host = document.getElementById("roadManagerEditor");
      if (!host) return;
      const directions = Array.isArray(row.route_directions) ? row.route_directions : [];
      host.innerHTML = `<section class="road-manager-card road-form-card-v173">
        <div class="road-form-heading"><div><h2>${row.id ? "Edit road" : "Add road"}</h2><p>One master record per road. Direction belongs to a pad-route step.</p></div><button class="btn ghost small" type="button" id="roadFormCancel">Close</button></div>
        <div class="road-canonical-rule"><strong>Example:</strong> save <b>OH-148</b> once. Do not create separate OH-148E and OH-148W roads; check East and West below instead.</div>
        <form id="roadManagerForm">
          <input type="hidden" name="id" value="${esc(row.id || "")}">
          <div class="road-form-grid">
            <div><label>Official display name</label><input name="canonical_name" required value="${esc(row.canonical_name || "")}" placeholder="OH-148"></div>
            <div><label>Road type</label><select name="road_type"><option value="interstate">Interstate</option><option value="us_route">U.S. route</option><option value="state_route">State route</option><option value="county">County road</option><option value="township">Township road</option><option value="local">Local road</option><option value="access">Access / lease road</option></select></div>
            <div><label>State</label><input name="state" value="${esc(row.state || "")}" placeholder="OH"><small class="road-form-hint">Interstates and U.S. routes are stored once as multi-state roads.</small></div>
            <div><label>County</label><input name="county" value="${esc(row.county || "")}"></div>
            <div><label>Township</label><input name="township" value="${esc(row.township || "")}"></div>
            <div><label>Surface</label><select name="surface"><option value="">Unknown</option><option value="paved">Paved</option><option value="gravel">Gravel</option><option value="mixed">Mixed</option><option value="dirt">Dirt</option></select></div>
            <div class="wide"><label>Directions used in saved routes</label><div class="road-direction-picker">${Object.entries(ROAD_DIRECTION_LABELS_V173).map(([value, label]) => `<label><input type="checkbox" name="route_direction" value="${value}" ${directions.includes(value) ? "checked" : ""}> ${label}</label>`).join("")}</div></div>
            <div class="wide"><label>Aliases / old names (comma separated)</label><input name="aliases" value="${esc((row.aliases || []).join(", "))}" placeholder="SR 148, State Route 148"></div>
            <div><label>CB channel</label><input name="cb_channel" value="${esc(row.cb_channel || "")}"></div>
            <div><label>Verification</label><select name="verification_status"><option value="needs_review">Needs review</option><option value="map_match">Public map match</option><option value="field_name">Local / field name</option><option value="verified">Official road verified</option></select></div>
            <div class="wide"><label>Road notes / restrictions</label><textarea name="notes" rows="3">${esc(row.notes || "")}</textarea></div>
          </div>
          <h3>Road warnings and features</h3>
          <div class="road-check-grid">${ROAD_FLAGS.map(key => `<label><input type="checkbox" name="${key}" ${row[key] ? "checked" : ""}> ${ROAD_FLAG_LABELS[key]}</label>`).join("")}</div>
          <div class="road-form-error" id="roadFormError" role="alert"></div>
          <div class="road-form-actions"><button class="btn ghost" type="button" id="roadFormCancelBottom">Cancel</button><button class="btn primary" type="submit">Save road</button></div>
        </form>
      </section>`;
      const form = host.querySelector("form");
      form.elements.road_type.value = row.road_type || "local";
      form.elements.surface.value = row.surface || "";
      form.elements.verification_status.value = row.verification_status || "needs_review";
      const close = () => { host.innerHTML = ""; };
      document.getElementById("roadFormCancel").onclick = close;
      document.getElementById("roadFormCancelBottom").onclick = close;
      form.onsubmit = async event => {
        event.preventDefault();
        const error = document.getElementById("roadFormError");
        error.textContent = "";
        const data = new FormData(form);
        const parsed = parseNumberedRoadV173(data.get("canonical_name"), data.get("road_type"), data.get("state"));
        if (parsed.error) { error.textContent = parsed.error; return; }
        const id = String(data.get("id") || "");
        let existing = id ? row : await findCanonicalRoadV173(parsed.canonical, parsed.type, parsed.state);
        const existingAliases = Array.isArray(existing?.aliases) ? existing.aliases : [];
        const enteredAliases = String(data.get("aliases") || "").split(",").map(value => normalize(value)).filter(Boolean);
        const aliases = Array.from(new Set([...existingAliases, ...enteredAliases, parsed.original !== parsed.canonical ? parsed.original : null].filter(Boolean)))
          .filter(value => value.toUpperCase() !== parsed.canonical.toUpperCase());
        const existingDirections = Array.isArray(existing?.route_directions) ? existing.route_directions : [];
        const checkedDirections = data.getAll("route_direction").map(value => String(value).toUpperCase());
        const routeDirections = Array.from(new Set([...existingDirections, ...checkedDirections, parsed.direction].filter(value => ROAD_DIRECTION_LABELS_V173[value]))).sort();
        const numbered = ["interstate", "us_route", "state_route"].includes(parsed.type);
        const verification = numbered && data.get("verification_status") === "field_name" ? "needs_review" : data.get("verification_status");
        const body = {
          canonical_name: parsed.canonical,
          normalized_name: roadNormalizeKey(parsed.canonical),
          road_type: parsed.type,
          state: ["interstate", "us_route"].includes(parsed.type) ? null : parsed.state,
          county: numbered ? null : (normalize(data.get("county")) || null),
          township: numbered ? null : (normalize(data.get("township")) || null),
          aliases,
          route_directions: routeDirections,
          surface: data.get("surface") || null,
          cb_channel: normalize(data.get("cb_channel")) || null,
          notes: normalize(data.get("notes")) || null,
          verification_status: verification,
          candidate_only: Boolean(existing?.candidate_only)
        };
        ROAD_FLAGS.forEach(key => { body[key] = data.get(key) === "on"; });
        const saveId = id || existing?.id || "";
        try {
          await editorRequest(`/rest/v1/brinesearch_roads${saveId ? `?id=eq.${encodeURIComponent(saveId)}` : ""}`, {
            method: saveId ? "PATCH" : "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(body)
          });
          showToast(existing && !id ? `Merged into ${parsed.canonical}` : "Road saved");
          close();
          await loadRoadManager();
        } catch (err) {
          error.textContent = err.message || "Could not save road.";
        }
      };
    }

    async function loadRoadManager() {
      const q = document.getElementById("roadManagerSearch")?.value || "";
      const list = document.getElementById("roadManagerList");
      if (!list) return;
      list.innerHTML = '<p class="admin-empty">Loading roads…</p>';
      try {
        roadManagerRows = await fetchRoads(q, 500);
        list.innerHTML = roadManagerRows.length ? roadManagerRows.map(roadRowHtml).join("") : '<p class="admin-empty">No roads found.</p>';
        list.querySelectorAll("[data-road-open]").forEach(button => {
          button.onclick = () => renderRoadForm(roadManagerRows.find(row => row.id === button.dataset.roadOpen));
        });
      } catch (err) {
        list.innerHTML = `<p class="admin-empty">${esc(err.message || "Could not load roads.")}</p>`;
      }
    }

    function routePrepStatusLabelV173(value) {
      return ROUTE_PREP_STATUS_LABELS_V173[value] || String(value || "Needs review").replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
    }

    function rpcObjectV173(value) {
      if (Array.isArray(value)) return value[0] || {};
      return value && typeof value === "object" ? value : {};
    }

    function routePrepBadgeClassV173(status) {
      if (status === "approved") return "approved";
      if (["ready_for_geometry", "geometry_measured", "ready_for_road_matching"].includes(status)) return "ready";
      if (["blocked", "needs_gps_review", "needs_sequence_rebuild"].includes(status)) return "blocked";
      return "review";
    }

    async function routePrepSummaryV173() {
      return rpcObjectV173(await editorRequest("/rest/v1/rpc/road_manager_route_prep_summary", { method: "POST", body: "{}" }));
    }

    async function loadRoutePrepV173(reset = false) {
      const list = document.getElementById("routePrepList");
      if (!list) return;
      if (reset) routePrepOffsetV173 = 0;
      const search = document.getElementById("routePrepSearch")?.value || null;
      const status = document.getElementById("routePrepStatus")?.value || null;
      const state = document.getElementById("routePrepState")?.value || null;
      list.innerHTML = '<p class="admin-empty">Loading Route Prep…</p>';
      try {
        const response = rpcObjectV173(await editorRequest("/rest/v1/rpc/road_manager_route_prep_list", {
          method: "POST",
          body: JSON.stringify({ p_search: search || null, p_status: status || null, p_state: state || null, p_company: null, p_limit: 40, p_offset: routePrepOffsetV173 })
        }));
        routePrepRowsV173 = Array.isArray(response.items) ? response.items : [];
        list.innerHTML = routePrepRowsV173.length ? routePrepRowsV173.map(item => `<button type="button" class="route-prep-row" data-route-prep-open="${esc(item.id)}">
          <span class="route-prep-row-main"><strong>${esc(item.pad_name)}</strong><small>${esc([item.company, item.state, item.route_group === "alternate" ? `Alternate ${item.variant_index}` : "Primary route"].filter(Boolean).join(" • "))}</small><span>${esc(item.normalized_sequence || item.source_sequence || "No sequence")}</span></span>
          <span class="route-prep-row-side"><b class="route-prep-status ${routePrepBadgeClassV173(item.readiness_status)}">${esc(routePrepStatusLabelV173(item.readiness_status))}</b><small>${esc(`${item.step_matched || 0}/${item.step_total || 0} exact roads`)}</small>${Number(item.step_unmatched_local || 0) ? `<small class="route-prep-unmatched">${esc(item.step_unmatched_local)} local road${Number(item.step_unmatched_local) === 1 ? "" : "s"} unmatched</small>` : ""}</span>
        </button>`).join("") : '<p class="admin-empty">No routes match these filters.</p>';
        list.querySelectorAll("[data-route-prep-open]").forEach(button => { button.onclick = () => openRoutePrepDetailV173(button.dataset.routePrepOpen); });
        const page = document.getElementById("routePrepPageInfo");
        if (page) page.textContent = `${response.total || 0} routes · showing ${routePrepOffsetV173 + 1}-${Math.min(routePrepOffsetV173 + routePrepRowsV173.length, Number(response.total || 0))}`;
        const previous = document.getElementById("routePrepPrevious");
        const next = document.getElementById("routePrepNext");
        if (previous) previous.disabled = routePrepOffsetV173 === 0;
        if (next) next.disabled = routePrepOffsetV173 + routePrepRowsV173.length >= Number(response.total || 0);
      } catch (err) {
        list.innerHTML = `<p class="admin-empty">${esc(err.message || "Could not load Route Prep.")}</p>`;
      }
    }

    function routePrepStepStatusV173(step) {
      if (step.match_status === "exact_master") return { label: "Exact Road Manager match", className: "ready" };
      if (step.step_kind === "state_route_candidate") return { label: "State-route candidate only", className: "review" };
      if (step.step_kind === "private_segment") return { label: "Private / lease segment", className: "private" };
      if (step.match_status === "rejected") return { label: "Rejected", className: "blocked" };
      return { label: "No guess — exact match needed", className: "blocked" };
    }

    function routePrepStepHtmlV173(step) {
      const status = routePrepStepStatusV173(step);
      const direction = step.travel_direction ? `<span class="road-direction-chip road-direction-${String(step.travel_direction).toLowerCase()}">${esc(roadDirectionLabelV173(step.travel_direction))}</span>` : "";
      const measured = [step.distance_miles != null ? `${Number(step.distance_miles).toFixed(3)} mi` : null, step.turn_direction ? `turn ${step.turn_direction}` : null].filter(Boolean).join(" • ");
      const candidateControls = step.step_kind === "state_route_candidate" ? `<div class="route-prep-step-actions"><button class="btn primary small" type="button" data-route-step-decision="approve_state_route_candidate" data-step-id="${esc(step.id)}">Approve candidate for review</button><button class="btn ghost small" type="button" data-route-step-decision="reject_state_route_candidate" data-step-id="${esc(step.id)}">Reject</button></div>` : "";
      return `<article class="route-prep-step">
        <span class="route-prep-step-number">${esc(step.step_order)}</span>
        <div class="route-prep-step-copy"><strong>${esc(step.road?.canonical_name || step.normalized_text || step.raw_text)}</strong><small>Saved text: ${esc(step.raw_text)}</small>${measured ? `<small>${esc(measured)}</small>` : ""}<div class="route-prep-step-tags">${direction}<span class="route-prep-status ${status.className}">${esc(status.label)}</span></div>${step.owner_notes ? `<p>${esc(step.owner_notes)}</p>` : ""}${candidateControls}</div>
      </article>`;
    }

    async function openRoutePrepDetailV173(id) {
      const host = document.getElementById("routePrepDetail");
      if (!host) return;
      host.innerHTML = '<section class="road-manager-card"><p class="admin-empty">Loading route…</p></section>';
      try {
        const detail = rpcObjectV173(await editorRequest("/rest/v1/rpc/road_manager_route_prep_detail", { method: "POST", body: JSON.stringify({ p_route_prep_id: id }) }));
        routePrepSelectedV173 = detail;
        const route = detail.route || {};
        const steps = Array.isArray(detail.steps) ? detail.steps : [];
        host.innerHTML = `<section class="road-manager-card route-prep-detail-card">
          <div class="route-prep-detail-head"><div><span class="route-prep-status ${routePrepBadgeClassV173(route.readiness_status)}">${esc(routePrepStatusLabelV173(route.readiness_status))}</span><h2>${esc(route.pad_name || "Route")}</h2><p>${esc([route.company, route.state, route.route_group === "alternate" ? `Alternate ${route.variant_index}` : "Primary route"].filter(Boolean).join(" • "))}</p></div><button class="btn ghost small" type="button" id="routePrepClose">Close</button></div>
          <div class="route-prep-policy"><strong>No-guess rule:</strong> ${esc(route.no_guess_policy || "Local, county, township, lease and access roads are never guessed.")}</div>
          <div class="route-prep-source"><strong>Saved route:</strong><span>${esc(route.source_sequence || "No sequence")}</span></div>
          ${route.highway_anchor_text ? `<div class="route-prep-anchor"><strong>Highway anchor</strong><span>${esc(route.highway_anchor_text)}</span></div>` : `<div class="route-prep-anchor warn"><strong>Highway anchor</strong><span>Not confirmed</span></div>`}
          <div class="route-prep-steps">${steps.map(routePrepStepHtmlV173).join("")}</div>
          <div class="route-prep-review-box"><label>Owner notes</label><textarea id="routePrepOwnerNotes" rows="3" placeholder="Why this route is blocked, what needs checked, or field confirmation notes">${esc(route.owner_notes || "")}</textarea><div class="route-prep-review-actions"><button class="btn ghost" type="button" data-route-review="field_check">Needs field confirmation</button><button class="btn ghost" type="button" data-route-review="blocked">Block route</button>${route.readiness_status === "approved" ? "" : `<button class="btn primary" type="button" data-route-review="ready_for_road_matching">Save review status</button>`}</div></div>
        </section>`;
        document.getElementById("routePrepClose").onclick = () => { host.innerHTML = ""; routePrepSelectedV173 = null; };
        host.querySelectorAll("[data-route-step-decision]").forEach(button => {
          button.onclick = async () => {
            const notes = document.getElementById("routePrepOwnerNotes")?.value || null;
            button.disabled = true;
            try {
              await editorRequest("/rest/v1/rpc/road_manager_route_prep_step_decision", { method: "POST", body: JSON.stringify({ p_step_id: button.dataset.stepId, p_decision: button.dataset.routeStepDecision, p_owner_notes: notes }) });
              showToast("Route step reviewed");
              await openRoutePrepDetailV173(id);
              await loadRoutePrepV173();
            } catch (err) { alert(err.message || "Could not save decision."); button.disabled = false; }
          };
        });
        host.querySelectorAll("[data-route-review]").forEach(button => {
          button.onclick = async () => {
            const notes = document.getElementById("routePrepOwnerNotes")?.value || null;
            button.disabled = true;
            try {
              await editorRequest("/rest/v1/rpc/road_manager_route_prep_set_review", { method: "POST", body: JSON.stringify({ p_route_prep_id: id, p_readiness_status: button.dataset.routeReview, p_owner_notes: notes }) });
              showToast("Route review saved");
              await openRoutePrepDetailV173(id);
              await loadRoutePrepV173();
            } catch (err) { alert(err.message || "Could not save route review."); button.disabled = false; }
          };
        });
      } catch (err) {
        host.innerHTML = `<section class="road-manager-card"><p class="admin-empty">${esc(err.message || "Could not open route.")}</p></section>`;
      }
    }

    async function renderRoutePrepTabV173() {
      const pane = document.getElementById("roadManagerPane");
      if (!pane) return;
      pane.innerHTML = `<section class="road-manager-card route-prep-summary-card"><p class="admin-empty">Loading Route Prep summary…</p></section>`;
      try {
        const summary = await routePrepSummaryV173();
        const readiness = summary.readiness || {};
        pane.innerHTML = `<section class="road-manager-card route-prep-summary-card">
          <div class="route-prep-summary-head"><div><h2>Pad Route Prep</h2><p>Prepare saved road sequences for exact Road Manager matching and mileage calculation.</p></div><button class="btn primary" id="routePrepRefresh" type="button"><span class="fm-icon fm-refresh"></span> Refresh queue</button></div>
          <div class="route-prep-policy"><strong>Hard rule:</strong> ${esc(summary.policy || "Never guess local roads.")}</div>
          <div class="route-prep-stat-grid"><div><strong>${esc(summary.distinct_pads || 0)}</strong><span>Pads</span></div><div><strong>${esc(summary.route_variants || 0)}</strong><span>Route variants</span></div><div><strong>${esc(summary.matched_steps || 0)}</strong><span>Exact road matches</span></div><div><strong>${esc(summary.unmatched_local_steps || 0)}</strong><span>Local roads needing exact match</span></div></div>
          <div class="route-prep-readiness">${ROUTE_PREP_STATUS_ORDER_V173.filter(status => Number(readiness[status] || 0) > 0).map(status => `<button type="button" data-route-prep-status="${esc(status)}"><strong>${esc(readiness[status])}</strong><span>${esc(routePrepStatusLabelV173(status))}</span></button>`).join("")}</div>
        </section>
        <section class="road-manager-card">
          <div class="route-prep-filters"><input id="routePrepSearch" placeholder="Search pad, company or road…" autocomplete="off"><select id="routePrepStatus"><option value="">All statuses</option>${ROUTE_PREP_STATUS_ORDER_V173.map(status => `<option value="${esc(status)}">${esc(routePrepStatusLabelV173(status))}</option>`).join("")}</select><select id="routePrepState"><option value="">All states</option><option value="Ohio">Ohio</option><option value="Pennsylvania">Pennsylvania</option><option value="West Virginia">West Virginia</option></select></div>
          <div class="route-prep-list" id="routePrepList"></div>
          <div class="route-prep-pagination"><button class="btn ghost small" id="routePrepPrevious">Previous</button><span id="routePrepPageInfo"></span><button class="btn ghost small" id="routePrepNext">Next</button></div>
        </section>
        <div id="routePrepDetail"></div>`;
        document.getElementById("routePrepRefresh").onclick = async event => {
          event.currentTarget.disabled = true;
          event.currentTarget.textContent = "Refreshing…";
          try {
            const result = rpcObjectV173(await editorRequest("/rest/v1/rpc/road_manager_refresh_route_prep", { method: "POST", body: "{}" }));
            showToast(`Route Prep refreshed: ${result.active_routes || summary.route_variants || 0} routes`);
            await renderRoutePrepTabV173();
          } catch (err) { alert(err.message || "Could not refresh Route Prep."); event.currentTarget.disabled = false; event.currentTarget.textContent = "Refresh queue"; }
        };
        document.querySelectorAll("[data-route-prep-status]").forEach(button => {
          button.onclick = () => { document.getElementById("routePrepStatus").value = button.dataset.routePrepStatus; loadRoutePrepV173(true); };
        });
        let timer;
        document.getElementById("routePrepSearch").oninput = () => { clearTimeout(timer); timer = setTimeout(() => loadRoutePrepV173(true), 220); };
        document.getElementById("routePrepStatus").onchange = () => loadRoutePrepV173(true);
        document.getElementById("routePrepState").onchange = () => loadRoutePrepV173(true);
        document.getElementById("routePrepPrevious").onclick = () => { routePrepOffsetV173 = Math.max(0, routePrepOffsetV173 - 40); loadRoutePrepV173(); };
        document.getElementById("routePrepNext").onclick = () => { routePrepOffsetV173 += 40; loadRoutePrepV173(); };
        await loadRoutePrepV173(true);
      } catch (err) {
        pane.innerHTML = `<section class="road-manager-card"><p class="admin-empty">${esc(err.message || "Could not load Route Prep.")}</p></section>`;
      }
    }

    async function renderRoadDatabaseTabV173() {
      const pane = document.getElementById("roadManagerPane");
      if (!pane) return;
      pane.innerHTML = `<section class="road-manager-card"><div class="road-manager-tools"><input id="roadManagerSearch" placeholder="Search roads…" autocomplete="off"><button class="btn primary" id="roadManagerAdd" type="button"><span class="fm-icon fm-add"></span> Add road</button></div><div class="road-database-rule"><strong>Canonical road rule:</strong> I-70 is one road. “East” or “West” is stored as direction on a pad route, not as I-70E or I-70W records.</div><div class="road-list" id="roadManagerList"></div></section><div id="roadManagerEditor"></div>`;
      let timer;
      document.getElementById("roadManagerSearch").oninput = () => { clearTimeout(timer); timer = setTimeout(loadRoadManager, 180); };
      document.getElementById("roadManagerAdd").onclick = () => renderRoadForm();
      await loadRoadManager();
    }

    async function switchRoadManagerTabV173(tab) {
      roadManagerActiveTabV173 = tab === "prep" ? "prep" : "roads";
      document.querySelectorAll("[data-road-manager-tab]").forEach(button => {
        const active = button.dataset.roadManagerTab === roadManagerActiveTabV173;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      if (roadManagerActiveTabV173 === "prep") await renderRoutePrepTabV173();
      else await renderRoadDatabaseTabV173();
    }

    async function renderRoadManagerSettings() {
      document.title = "Road Manager · BrineSearch";
      if (!editorSession?.access_token) {
        app.innerHTML = `<main class="road-manager-page"><section class="road-manager-hero"><div><h1>Road Manager</h1><p>Sign in with the Owner account to manage shared roads and Route Prep.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section><button class="btn primary" data-open-editor-auth>Sign in</button></main>`;
        document.querySelector("[data-open-editor-auth]")?.addEventListener("click", () => openEditorAuth());
        return;
      }
      if (!editorIsOwner()) {
        app.innerHTML = `<main class="road-manager-page"><section class="road-manager-hero"><div><h1>Road Manager</h1><p>Only the BrineSearch Owner can manage the master road database and route-preparation queue.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section></main>`;
        return;
      }
      app.innerHTML = `<main class="road-manager-page"><section class="road-manager-hero"><div><h1>Road Manager</h1><p>One canonical road database plus a no-guess preparation queue for pad directions.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section><div class="road-manager-tabs" role="tablist"><button type="button" data-road-manager-tab="roads" role="tab">Road database</button><button type="button" data-road-manager-tab="prep" role="tab">Pad Route Prep</button></div><div id="roadManagerPane"></div></main>`;
      document.querySelectorAll("[data-road-manager-tab]").forEach(button => { button.onclick = () => switchRoadManagerTabV173(button.dataset.roadManagerTab); });
      await switchRoadManagerTabV173(roadManagerActiveTabV173);
    }
