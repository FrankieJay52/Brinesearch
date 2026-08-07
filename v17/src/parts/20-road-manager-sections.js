    /* BrineSearch Road Manager — grouped road sections and visible road editor */
    const ROAD_DATABASE_GROUPS = [
      {
        key: "highways",
        title: "Highways",
        detail: "Interstates and U.S. highways",
        matches: row => ["interstate", "us_route"].includes(row?.road_type) && !row?.candidate_only
      },
      {
        key: "state-routes",
        title: "State routes",
        detail: "Ohio, Pennsylvania, and West Virginia numbered state routes",
        matches: row => row?.road_type === "state_route" && !row?.candidate_only
      },
      {
        key: "county-township",
        title: "County and township roads",
        detail: "County-road and township-road records",
        matches: row => ["county", "township"].includes(row?.road_type) && !row?.candidate_only
      },
      {
        key: "local-roads",
        title: "Local roads",
        detail: "Regular named roads that are not numbered highways",
        matches: row => row?.road_type === "local" && !row?.candidate_only
      },
      {
        key: "access-roads",
        title: "Access and lease roads",
        detail: "Private access, lease, gate, and pad-road records",
        matches: row => row?.road_type === "access" && !row?.candidate_only
      },
      {
        key: "candidates-other",
        title: "Candidates and other roads",
        detail: "Records still needing classification or Owner review",
        matches: row => Boolean(row?.candidate_only) || !["interstate", "us_route", "state_route", "county", "township", "local", "access"].includes(row?.road_type)
      }
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

    function groupedRoadDatabaseHtml(rows, searchText = "") {
      const assigned = new Set();
      const sections = ROAD_DATABASE_GROUPS.map(group => {
        const groupRows = rows.filter(row => {
          if (assigned.has(row.id) || !group.matches(row)) return false;
          assigned.add(row.id);
          return true;
        }).sort(compareRoadRowsGrouped);
        if (!groupRows.length) return "";
        const open = searchText || ["highways", "state-routes", "county-township", "local-roads"].includes(group.key);
        return `<details class="road-database-group road-database-group-${group.key}" ${open ? "open" : ""}>
          <summary>
            <span class="road-group-heading"><strong>${esc(group.title)}</strong><small>${esc(group.detail)}</small></span>
            <span class="road-group-count">${groupRows.length}</span>
            <span class="road-group-caret" aria-hidden="true">⌄</span>
          </summary>
          <div class="road-group-list">${groupRows.map(roadRowHtml).join("")}</div>
        </details>`;
      }).filter(Boolean);

      const unassigned = rows.filter(row => !assigned.has(row.id)).sort(compareRoadRowsGrouped);
      if (unassigned.length) {
        sections.push(`<details class="road-database-group road-database-group-other" open>
          <summary><span class="road-group-heading"><strong>Other roads</strong><small>Records that do not yet fit a road section</small></span><span class="road-group-count">${unassigned.length}</span><span class="road-group-caret" aria-hidden="true">⌄</span></summary>
          <div class="road-group-list">${unassigned.map(roadRowHtml).join("")}</div>
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
