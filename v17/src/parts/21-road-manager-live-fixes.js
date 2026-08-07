    /* BrineSearch V17.3.1 — Road Manager live-use fixes and Ascent work queue */
    const ROAD_DATABASE_TYPES_V1731 = [
      { key: "state-route", title: "State routes", detail: "Numbered state highways", matches: row => row?.road_type === "state_route" && !row?.candidate_only },
      { key: "county-road", title: "County roads", detail: "County-maintained public roads", matches: row => row?.road_type === "county" && !row?.candidate_only },
      { key: "township-road", title: "Township roads", detail: "Township-maintained public roads", matches: row => row?.road_type === "township" && !row?.candidate_only },
      { key: "local-road", title: "Local / named roads", detail: "Regular named public roads", matches: row => row?.road_type === "local" && !row?.candidate_only },
      { key: "access-road", title: "Access and lease roads", detail: "Private access, lease, gate, driveway and pad roads", matches: row => row?.road_type === "access" && !row?.candidate_only },
      { key: "review-road", title: "Candidates and other roads", detail: "Records still needing classification or Owner review", matches: row => Boolean(row?.candidate_only) || !["state_route", "county", "township", "local", "access"].includes(row?.road_type) }
    ];

    const ROAD_DATABASE_STATES_V1731 = [
      { code: "OH", title: "Ohio", detail: "Ohio state routes and regular roads" },
      { code: "PA", title: "Pennsylvania", detail: "Pennsylvania state routes and regular roads" },
      { code: "WV", title: "West Virginia", detail: "West Virginia state routes and regular roads" }
    ];

    function roadCategoryBlockV1731(category, rows) {
      const categoryRows = rows.filter(category.matches).sort(compareRoadRowsGrouped);
      if (!categoryRows.length) return "";
      return `<section class="road-state-category road-state-category-${category.key}">
        <header><span><strong>${esc(category.title)}</strong><small>${esc(category.detail)}</small></span><b>${categoryRows.length}</b></header>
        <div class="road-group-list">${categoryRows.map(roadRowHtml).join("")}</div>
      </section>`;
    }

    function groupedRoadDatabaseV1731(rows, searchText = "") {
      const highways = rows
        .filter(row => ["interstate", "us_route"].includes(row?.road_type) && !row?.candidate_only)
        .sort((a, b) => {
          const typeDifference = (a.road_type === "interstate" ? 0 : 1) - (b.road_type === "interstate" ? 0 : 1);
          return typeDifference || compareRoadRowsGrouped(a, b);
        });
      const used = new Set(highways.map(row => row.id));
      const sections = [];

      if (highways.length) {
        sections.push(`<details class="road-database-group road-database-group-highways" open>
          <summary><span class="road-group-heading"><strong>Interstates and U.S. highways</strong><small>Freeways and U.S. routes are kept together across state lines</small></span><span class="road-group-count">${highways.length}</span><span class="road-group-caret" aria-hidden="true">⌄</span></summary>
          <div class="road-group-list">${highways.map(roadRowHtml).join("")}</div>
        </details>`);
      }

      ROAD_DATABASE_STATES_V1731.forEach(state => {
        const stateRows = rows.filter(row => groupedRoadStateCode(row) === state.code && !used.has(row.id) && !["interstate", "us_route"].includes(row?.road_type));
        stateRows.forEach(row => used.add(row.id));
        if (!stateRows.length) return;
        const categoryMarkup = ROAD_DATABASE_TYPES_V1731.map(category => roadCategoryBlockV1731(category, stateRows)).filter(Boolean).join("");
        sections.push(`<details class="road-database-group road-state-group road-state-${state.code.toLowerCase()}" ${searchText || state.code === "OH" ? "open" : ""}>
          <summary><span class="road-group-heading"><strong>${esc(state.title)}</strong><small>${esc(state.detail)}</small></span><span class="road-group-count">${stateRows.length}</span><span class="road-group-caret" aria-hidden="true">⌄</span></summary>
          <div class="road-state-category-list">${categoryMarkup}</div>
        </details>`);
      });

      const otherRows = rows.filter(row => !used.has(row.id)).sort(compareRoadRowsGrouped);
      if (otherRows.length) {
        const categoryMarkup = ROAD_DATABASE_TYPES_V1731.map(category => roadCategoryBlockV1731(category, otherRows)).filter(Boolean).join("");
        sections.push(`<details class="road-database-group road-state-group road-state-other" ${searchText ? "open" : ""}>
          <summary><span class="road-group-heading"><strong>State not set / other</strong><small>Roads still needing a state or final classification</small></span><span class="road-group-count">${otherRows.length}</span><span class="road-group-caret" aria-hidden="true">⌄</span></summary>
          <div class="road-state-category-list">${categoryMarkup || `<div class="road-group-list">${otherRows.map(roadRowHtml).join("")}</div>`}</div>
        </details>`);
      }
      return sections.join("");
    }

    groupedRoadDatabaseHtml = groupedRoadDatabaseV1731;

    const renderRoadFormBeforeLiveFixV1731 = renderRoadForm;
    renderRoadForm = function renderRoadFormLiveV1731(row = emptyRoadForm()) {
      renderRoadFormBeforeLiveFixV1731(row);
      const host = document.getElementById("roadManagerEditor");
      if (!host || !host.firstElementChild) return;
      host.dataset.openRoadId = row?.id || "new";
      requestAnimationFrame(() => {
        host.querySelector('input[name="canonical_name"]')?.focus({ preventScroll: true });
      });
    };

    function roadManagerFilteredRowsV1731(rows) {
      const state = document.getElementById("roadManagerStateFilter")?.value || "";
      const type = document.getElementById("roadManagerTypeFilter")?.value || "";
      return rows.filter(row => {
        if (state === "highways" && !["interstate", "us_route"].includes(row.road_type)) return false;
        if (["OH", "PA", "WV"].includes(state) && groupedRoadStateCode(row) !== state) return false;
        if (type === "highways" && !["interstate", "us_route"].includes(row.road_type)) return false;
        if (type && type !== "highways" && row.road_type !== type) return false;
        return true;
      });
    }

    loadRoadManager = async function loadRoadManagerLiveV1731() {
      const q = document.getElementById("roadManagerSearch")?.value?.trim() || "";
      const list = document.getElementById("roadManagerList");
      if (!list) return;
      list.innerHTML = '<p class="admin-empty">Loading roads…</p>';
      try {
        roadManagerRows = await fetchRoads(q, 500);
        const visibleRows = roadManagerFilteredRowsV1731(roadManagerRows);
        list.classList.add("road-list-grouped");
        list.innerHTML = visibleRows.length ? groupedRoadDatabaseV1731(visibleRows, q) : '<p class="admin-empty">No roads match these filters.</p>';
        list.querySelectorAll(".road-row[data-road-id],.road-row").forEach(article => {
          const button = article.querySelector("[data-road-open]");
          if (!button) return;
          article.dataset.roadId = button.dataset.roadOpen;
          article.tabIndex = 0;
          article.setAttribute("role", "button");
          article.setAttribute("aria-label", button.getAttribute("aria-label") || `Open ${article.querySelector(".road-row-name")?.textContent || "road"}`);
          const open = () => {
            const row = roadManagerRows.find(item => item.id === button.dataset.roadOpen);
            if (!row) return;
            list.querySelectorAll(".road-row-selected").forEach(item => item.classList.remove("road-row-selected"));
            article.classList.add("road-row-selected");
            renderRoadForm(row);
          };
          article.onclick = event => {
            if (event.target.closest("a,input,select,textarea,label")) return;
            open();
          };
          article.onkeydown = event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
          };
        });
      } catch (err) {
        list.innerHTML = `<p class="admin-empty">${esc(err.message || "Could not load roads.")}</p>`;
      }
    };

    renderRoadDatabaseTabV173 = async function renderRoadDatabaseTabLiveV1731() {
      const pane = document.getElementById("roadManagerPane");
      if (!pane) return;
      pane.innerHTML = `<section class="road-manager-card road-manager-controls-card-v1731">
        <div class="road-manager-tools road-manager-tools-v1731">
          <input id="roadManagerSearch" placeholder="Search roads…" autocomplete="off">
          <select id="roadManagerStateFilter" aria-label="Filter roads by state"><option value="">All states</option><option value="highways">Highways · multi-state</option><option value="OH">Ohio</option><option value="PA">Pennsylvania</option><option value="WV">West Virginia</option></select>
          <select id="roadManagerTypeFilter" aria-label="Filter by road type"><option value="">All road types</option><option value="highways">Interstates / U.S. highways</option><option value="state_route">State routes</option><option value="county">County roads</option><option value="township">Township roads</option><option value="local">Local / named roads</option><option value="access">Access / lease roads</option></select>
          <button class="btn primary" id="roadManagerAdd" type="button"><span class="fm-icon fm-add"></span> Add road</button>
        </div>
        <div class="road-database-rule"><strong>Road organization:</strong> Interstates and U.S. highways stay multi-state. State routes and regular roads are separated into Ohio, Pennsylvania and West Virginia sections.</div>
        <div class="road-section-guide" aria-label="Road Manager sections"><span>Highways</span><span>State routes</span><span>County roads</span><span>Township roads</span><span>Local roads</span><span>Access / lease</span></div>
      </section>
      <section class="road-manager-card road-manager-directory-card-v1731"><div class="road-list" id="roadManagerList"></div></section>
      <div id="roadManagerEditor"></div>`;
      let timer;
      document.getElementById("roadManagerSearch").oninput = () => { clearTimeout(timer); timer = setTimeout(loadRoadManager, 180); };
      document.getElementById("roadManagerStateFilter").onchange = loadRoadManager;
      document.getElementById("roadManagerTypeFilter").onchange = loadRoadManager;
      document.getElementById("roadManagerAdd").onclick = () => renderRoadForm();
      await loadRoadManager();
    };

    loadRoutePrepV173 = async function loadRoutePrepAscentV1731(reset = false) {
      const list = document.getElementById("routePrepList");
      if (!list) return;
      if (reset) routePrepOffsetV173 = 0;
      const search = document.getElementById("routePrepSearch")?.value || null;
      const status = document.getElementById("routePrepStatus")?.value || null;
      const state = document.getElementById("routePrepState")?.value || null;
      const company = document.getElementById("routePrepCompany")?.value || null;
      list.innerHTML = '<p class="admin-empty">Loading Route Prep…</p>';
      try {
        const response = rpcObjectV173(await editorRequest("/rest/v1/rpc/road_manager_route_prep_list", {
          method: "POST",
          body: JSON.stringify({ p_search: search || null, p_status: status || null, p_state: state || null, p_company: company || null, p_limit: 40, p_offset: routePrepOffsetV173 })
        }));
        routePrepRowsV173 = Array.isArray(response.items) ? response.items : [];
        list.innerHTML = routePrepRowsV173.length ? routePrepRowsV173.map(item => `<button type="button" class="route-prep-row" data-route-prep-open="${esc(item.id)}">
          <span class="route-prep-row-main"><strong>${esc(item.pad_name)}</strong><small>${esc([item.company, item.state, item.route_group === "alternate" ? `Alternate ${item.variant_index}` : "Primary route"].filter(Boolean).join(" • "))}</small><span>${esc(item.normalized_sequence || item.source_sequence || "No sequence")}</span></span>
          <span class="route-prep-row-side"><b class="route-prep-status ${routePrepBadgeClassV173(item.readiness_status)}">${esc(routePrepStatusLabelV173(item.readiness_status))}</b><small>${esc(`${item.step_matched || 0}/${item.step_total || 0} exact roads`)}</small>${Number(item.step_unmatched_local || 0) ? `<small class="route-prep-unmatched">${esc(item.step_unmatched_local)} local road${Number(item.step_unmatched_local) === 1 ? "" : "s"} unmatched</small>` : ""}</span>
        </button>`).join("") : '<p class="admin-empty">No routes match these filters.</p>';
        list.querySelectorAll("[data-route-prep-open]").forEach(button => { button.onclick = () => openRoutePrepDetailV173(button.dataset.routePrepOpen); });
        const page = document.getElementById("routePrepPageInfo");
        if (page) page.textContent = `${response.total || 0} routes · showing ${routePrepRowsV173.length ? routePrepOffsetV173 + 1 : 0}-${Math.min(routePrepOffsetV173 + routePrepRowsV173.length, Number(response.total || 0))}`;
        const previous = document.getElementById("routePrepPrevious");
        const next = document.getElementById("routePrepNext");
        if (previous) previous.disabled = routePrepOffsetV173 === 0;
        if (next) next.disabled = routePrepOffsetV173 + routePrepRowsV173.length >= Number(response.total || 0);
      } catch (err) {
        list.innerHTML = `<p class="admin-empty">${esc(err.message || "Could not load Route Prep.")}</p>`;
      }
    };

    const renderRoutePrepBeforeAscentV1731 = renderRoutePrepTabV173;
    renderRoutePrepTabV173 = async function renderRoutePrepAscentV1731() {
      await renderRoutePrepBeforeAscentV1731();
      const filters = document.querySelector(".route-prep-filters");
      if (!filters || document.getElementById("routePrepCompany")) return;
      const companySelect = document.createElement("select");
      companySelect.id = "routePrepCompany";
      companySelect.setAttribute("aria-label", "Filter Route Prep by company");
      companySelect.innerHTML = `<option value="">All companies</option><option value="Ascent">Ascent</option><option value="Antero">Antero</option><option value="Eog">EOG</option><option value="Gulfport">Gulfport</option><option value="Expand">Expand</option><option value="Eqt">EQT</option><option value="Cnx">CNX</option><option value="Infinity">Infinity</option><option value="Swn">SWN</option>`;
      const savedCompany = localStorage.getItem("brinesearch.routePrepCompany.v1");
      companySelect.value = savedCompany === null ? "Ascent" : savedCompany;
      filters.appendChild(companySelect);
      companySelect.onchange = () => {
        localStorage.setItem("brinesearch.routePrepCompany.v1", companySelect.value);
        loadRoutePrepV173(true);
      };
      const summaryHead = document.querySelector(".route-prep-summary-head>div");
      if (summaryHead) summaryHead.insertAdjacentHTML("beforeend", '<span class="route-prep-company-active">Ascent turn-by-turn work has started · change the company filter below to view other operators</span>');
      await loadRoutePrepV173(true);
    };

    const openRoutePrepBeforeScrollV1731 = openRoutePrepDetailV173;
    openRoutePrepDetailV173 = async function openRoutePrepAndShowV1731(id) {
      await openRoutePrepBeforeScrollV1731(id);
      const host = document.getElementById("routePrepDetail");
      const route = routePrepSelectedV173?.route || {};
      if (host && route.legacy_id && !host.querySelector("[data-open-route-pad]")) {
        const head = host.querySelector(".route-prep-detail-head");
        head?.insertAdjacentHTML("beforeend", `<a class="btn secondary small" data-open-route-pad href="#/pad/${encodeURIComponent(route.legacy_id)}">Open pad</a>`);
      }
      requestAnimationFrame(() => host?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
