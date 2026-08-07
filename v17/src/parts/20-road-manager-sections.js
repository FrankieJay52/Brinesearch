    /* BrineSearch Road Manager — grouped road sections and visible road editor */
    const ROAD_STATE_GROUPS = [
      { code: "OH", title: "Ohio roads", detail: "Ohio state, county, township, local, and access roads" },
      { code: "PA", title: "Pennsylvania roads", detail: "Pennsylvania state, county, township, local, and access roads" },
      { code: "WV", title: "West Virginia roads", detail: "West Virginia state, county, township, local, and access roads" }
    ];
    const ROAD_STATE_CATEGORIES = [
      { key: "state-routes", title: "State routes", detail: "Numbered state highways", matches: row => row?.road_type === "state_route" && !row?.candidate_only },
      { key: "county-township", title: "County and township roads", detail: "County-road and township-road records", matches: row => ["county", "township"].includes(row?.road_type) && !row?.candidate_only },
      { key: "local-roads", title: "Local roads", detail: "Regular named public roads", matches: row => row?.road_type === "local" && !row?.candidate_only },
      { key: "access-roads", title: "Access and lease roads", detail: "Private access, lease, gate, and pad roads", matches: row => row?.road_type === "access" && !row?.candidate_only },
      { key: "candidates-other", title: "Candidates and other roads", detail: "Records still needing classification or Owner review", matches: row => Boolean(row?.candidate_only) || !["state_route", "county", "township", "local", "access"].includes(row?.road_type) }
    ];

    function roadNumberForSort(row) {
      const value = String(row?.route_number || row?.canonical_name || "");
      const match = value.match(/\d+/);
      return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
    }

    function compareRoadRowsGrouped(a, b) {
      const numberDifference = roadNumberForSort(a) - roadNumberForSort(b);
      if (numberDifference) return numberDifference;
      return String(a?.canonical_name || "").localeCompare(String(b?.canonical_name || ""), undefined, { numeric: true, sensitivity: "base" });
    }

    function groupedRoadStateCode(row) {
      const value = String(row?.state || "").trim().toUpperCase();
      if (value === "OHIO") return "OH";
      if (value === "PENNSYLVANIA") return "PA";
      if (value === "WEST VIRGINIA") return "WV";
      return value;
    }

    roadRowHtml = function roadRowHtmlGrouped(row) {
      const aliases = Array.isArray(row.aliases) ? row.aliases.filter(Boolean) : [];
      const aliasText = aliases.length
        ? `<div class="road-row-aliases">Also seen as ${esc(aliases.slice(0, 4).join(", "))}${aliases.length > 4 ? ` +${aliases.length - 4}` : ""}</div>`
        : "";
      const status = roadStatusLabel(row);
      return `<article class="road-row road-row-v173 road-row-grouped">
        <button type="button" data-road-open="${esc(row.id)}" aria-label="Open ${esc(row.canonical_name)} road details">
          <span class="road-row-copy">
            <span class="road-row-name">${esc(row.canonical_name)}</span>
            <span class="road-row-meta">${esc(`${roadTypeLabelV173(row.road_type)} • ${roadScopeLabelV173(row)}`)}</span>
            ${roadDirectionBadgesV173(row)}
            ${aliasText}
            <span class="road-badges">${roadBadgeHtml(row)}</span>
          </span>
          <span class="road-row-open-cue">Open <span aria-hidden="true">›</span></span>
        </button>
        <span class="road-status ${row.verification_status === "verified" ? "verified" : ""} ${row.candidate_only ? "candidate" : ""}">${esc(status)}</span>
      </article>`;
    };

    function roadCategoryBlockHtml(category, rows) {
      const categoryRows = rows.filter(category.matches).sort(compareRoadRowsGrouped);
      if (!categoryRows.length) return "";
      return `<section class="road-state-category road-state-category-${category.key}">
        <header><span><strong>${esc(category.title)}</strong><small>${esc(category.detail)}</small></span><b>${categoryRows.length}</b></header>
        <div class="road-group-list">${categoryRows.map(roadRowHtml).join("")}</div>
      </section>`;
    }

    function roadStateSectionHtml(stateGroup, rows, searchText = "") {
      const stateRows = rows.filter(row => groupedRoadStateCode(row) === stateGroup.code && !["interstate", "us_route"].includes(row?.road_type));
      if (!stateRows.length) return "";
      const categorized = ROAD_STATE_CATEGORIES.map(category => roadCategoryBlockHtml(category, stateRows)).filter(Boolean).join("");
      const open = Boolean(searchText) || stateGroup.code === "OH";
      return `<details class="road-database-group road-state-group road-state-${stateGroup.code.toLowerCase()}" ${open ? "open" : ""}>
        <summary>
          <span class="road-group-heading"><strong>${esc(stateGroup.title)}</strong><small>${esc(stateGroup.detail)}</small></span>
          <span class="road-group-count">${stateRows.length}</span>
          <span class="road-group-caret" aria-hidden="true">⌄</span>
        </summary>
        <div class="road-state-category-list">${categorized}</div>
      </details>`;
    }

    function groupedRoadDatabaseHtml(rows, searchText = "") {
      const highways = rows
        .filter(row => ["interstate", "us_route"].includes(row?.road_type) && !row?.candidate_only)
        .sort((a, b) => {
          const typeDifference = (a.road_type === "interstate" ? 0 : 1) - (b.road_type === "interstate" ? 0 : 1);
          return typeDifference || compareRoadRowsGrouped(a, b);
        });
      const usedIds = new Set(highways.map(row => row.id));
      const sections = [];

      if (highways.length) {
        sections.push(`<details class="road-database-group road-database-group-highways" open>
          <summary>
            <span class="road-group-heading"><strong>Highways</strong><small>Interstates and U.S. highways · kept together across state lines</small></span>
            <span class="road-group-count">${highways.length}</span>
            <span class="road-group-caret" aria-hidden="true">⌄</span>
          </summary>
          <div class="road-group-list">${highways.map(roadRowHtml).join("")}</div>
        </details>`);
      }

      ROAD_STATE_GROUPS.forEach(stateGroup => {
        const stateRows = rows.filter(row => groupedRoadStateCode(row) === stateGroup.code && !usedIds.has(row.id) && !["interstate", "us_route"].includes(row?.road_type));
        stateRows.forEach(row => usedIds.add(row.id));
        const section = roadStateSectionHtml(stateGroup, stateRows, searchText);
        if (section) sections.push(section);
      });

      const unassigned = rows.filter(row => !usedIds.has(row.id)).sort(compareRoadRowsGrouped);
      if (unassigned.length) {
        const categorized = ROAD_STATE_CATEGORIES.map(category => roadCategoryBlockHtml(category, unassigned)).filter(Boolean).join("");
        sections.push(`<details class="road-database-group road-state-group road-state-other" ${searchText ? "open" : ""}>
          <summary><span class="road-group-heading"><strong>State not set / other roads</strong><small>Records that still need a state or road classification</small></span><span class="road-group-count">${unassigned.length}</span><span class="road-group-caret" aria-hidden="true">⌄</span></summary>
          <div class="road-state-category-list">${categorized || `<div class="road-group-list">${unassigned.map(roadRowHtml).join("")}</div>`}</div>
        </details>`);
      }
      return sections.join("");
    }

    loadRoadManager = async function loadRoadManagerGrouped() {
      const q = document.getElementById("roadManagerSearch")?.value?.trim() || "";
      const list = document.getElementById("roadManagerList");
      if (!list) return;
      list.innerHTML = '<p class="admin-empty">Loading roads…</p>';
      try {
        roadManagerRows = await fetchRoads(q, 500);
        list.classList.add("road-list-grouped");
        list.innerHTML = roadManagerRows.length
          ? groupedRoadDatabaseHtml(roadManagerRows, q)
          : '<p class="admin-empty">No roads found.</p>';
        list.querySelectorAll("[data-road-open]").forEach(button => {
          button.onclick = () => {
            const row = roadManagerRows.find(item => item.id === button.dataset.roadOpen);
            if (!row) return;
            renderRoadForm(row);
            requestAnimationFrame(() => document.querySelector('#roadManagerEditor input[name="canonical_name"]')?.focus({ preventScroll: true }));
          };
        });
      } catch (err) {
        list.innerHTML = `<p class="admin-empty">${esc(err.message || "Could not load roads.")}</p>`;
      }
    };
