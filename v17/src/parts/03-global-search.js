
    function passesMissingFilter(p) {
      const mode = advancedMissing.value;
      if (!mode) return true;
      if (mode === "gps") return !hasGps(p);
      if (mode === "address") return !has(p.address);
      if (mode === "api") return !has(p.api);
      if (mode === "property") return !has(p.property);
      if (mode === "wellName") return !has(p.wellName);
      if (mode === "road") return !has(p.Structured_Road_Sequence);
      if (mode === "directions") return !has(p.writtenDirections);
      return true;
    }

    function sortAdvancedResults(list, query) {
      const mode = advancedSort.value;
      return list.sort((a,b) => {
        if (mode === "pad") {
          return normalize(a.padName).localeCompare(normalize(b.padName)) ||
            normalize(a.company).localeCompare(normalize(b.company));
        }
        if (mode === "company") {
          return normalize(a.company).localeCompare(normalize(b.company)) ||
            normalize(a.padName).localeCompare(normalize(b.padName));
        }
        if (mode === "state") {
          return normalize(a.state).localeCompare(normalize(b.state)) ||
            normalize(a.county).localeCompare(normalize(b.county)) ||
            normalize(a.padName).localeCompare(normalize(b.padName));
        }
        if (mode === "county") {
          return normalize(a.county).localeCompare(normalize(b.county)) ||
            normalize(a.padName).localeCompare(normalize(b.padName));
        }
        if (mode === "complete") {
          return dataCompleteness(b) - dataCompleteness(a) ||
            normalize(a.padName).localeCompare(normalize(b.padName));
        }
        if (mode === "record") {
          return Number(a._recordNumber || 0) - Number(b._recordNumber || 0);
        }
        return advancedRelevance(b, query, advancedSearchField.value) -
          advancedRelevance(a, query, advancedSearchField.value) ||
          normalize(a.padName).localeCompare(normalize(b.padName));
      });
    }

    function activeAdvancedFilterLabels() {
      const labels = [];
      if (alwaysSearchInput.value.trim()) labels.push(`Text: ${alwaysSearchInput.value.trim()}`);
      if (advancedSearchField.value !== "all") labels.push(`Field: ${advancedSearchField.options[advancedSearchField.selectedIndex].text}`);
      if (advancedMatchMode.value !== "contains") labels.push(`Match: ${advancedMatchMode.options[advancedMatchMode.selectedIndex].text}`);
      if (advancedCompany.value) labels.push(`Company: ${advancedCompany.value}`);
      if (advancedState.value) labels.push(`State: ${advancedState.value}`);
      if (advancedCounty.value) labels.push(`County: ${advancedCounty.value}`);
      if (advancedTownship.value) labels.push(`Township: ${advancedTownship.value}`);
      if (advancedMissing.value) labels.push(advancedMissing.options[advancedMissing.selectedIndex].text);
      if (requireMapReady.checked) labels.push("Map-ready");
      if (requireGps.checked) labels.push("Has GPS");
      if (requireAddress.checked) labels.push("Has address");
      if (requireApi.checked) labels.push("Has API");
      if (requireProperty.checked) labels.push("Has property");
      if (requireWell.checked) labels.push("Has well");
      if (requireRoad.checked) labels.push("Has road sequence");
      if (requireDirections.checked) labels.push("Has directions");
      return labels;
    }

    function renderActiveAdvancedFilters() {
      const labels = activeAdvancedFilterLabels();
      activeSearchFilters.innerHTML = labels.map(label =>
        `<span class="active-filter-pill">${esc(label)}</span>`
      ).join("");
    }

    function clearAdvancedSearch() {
      alwaysSearchInput.value = "";
      advancedSearchField.value = "all";
      advancedMatchMode.value = "contains";
      advancedCompany.value = "";
      advancedState.value = "";
      advancedCounty.value = "";
      advancedTownship.value = "";
      advancedMissing.value = "";
      advancedSort.value = "relevance";
      advancedLimit.value = "150";
      [
        requireMapReady, requireGps, requireAddress, requireApi,
        requireProperty, requireWell, requireRoad, requireDirections
      ].forEach(control => control.checked = false);
      refreshAdvancedLocationOptions();
      updateAlwaysSearch();
      alwaysSearchInput.focus();
    }

    function openGlobalSearch(initialValue = null, preset = {}) {
      globalSearchModal.classList.add("open");
      document.body.style.overflow = "hidden";

      if (initialValue !== null) alwaysSearchInput.value = initialValue;
      if (preset.company !== undefined) advancedCompany.value = preset.company;
      if (preset.state !== undefined) advancedState.value = preset.state;
      refreshAdvancedLocationOptions();
      if (preset.county !== undefined) advancedCounty.value = preset.county;
      if (preset.township !== undefined) advancedTownship.value = preset.township;

      updateAlwaysSearch();
      setTimeout(() => alwaysSearchInput.focus(), 20);
    }

    function closeGlobalSearch() {
      globalSearchModal.classList.remove("open");
      document.body.style.overflow = "";
    }

    function globalResultCard(p) {
      const location = [p.township, p.county && `${p.county} County`, p.state]
        .filter(has).join(" · ");
      const detail = [isDisposal(p) ? "Disposal" : display(p.company), location].filter(Boolean).join(" · ");
      const badges = [
        isDisposal(p) ? "Disposal" : "",
        hasGps(p) ? "GPS" : "",
        has(p.address) ? "Address" : "",
        has(p.api) ? "API" : "",
        has(p.property) ? "Property" : "",
        has(p.wellName) ? "Well" : "",
        has(p.writtenDirections) ? "Directions" : ""
      ].filter(Boolean);

      return `
        <a class="global-result" href="${routeUrl(`pad/${encodeURIComponent(p._id)}`)}">
          <div>
            <strong>${esc(display(p.padName))}</strong>
            <span>${esc(detail)}</span>
            <span class="global-result-badges">${badges.map(b => `<b>${esc(b)}</b>`).join("")}</span>
          </div>
          <em>Open ›</em>
        </a>`;
    }

    function updateAlwaysSearch() {
      const query = alwaysSearchInput.value.trim().toLowerCase();
      const filtering = Boolean(
        query || advancedCompany.value || advancedState.value ||
        advancedCounty.value || advancedTownship.value || advancedMissing.value ||
        requireMapReady.checked || requireGps.checked || requireAddress.checked ||
        requireApi.checked || requireProperty.checked || requireWell.checked ||
        requireRoad.checked || requireDirections.checked
      );

      renderActiveAdvancedFilters();

      if (!filtering) {
        currentAdvancedResults = [];
        alwaysSearchInfo.textContent = "Search by pad, company, API, property, well, county, address, or road.";
        alwaysSearchResults.innerHTML = `
          <div class="empty">
            Search every field, or use the options to filter by company/disposals, state,
            county, township, data availability, missing information, and match type.
          </div>`;
        return;
      }

      let found = pads.filter(p =>
        matchesAdvancedText(p, query, advancedSearchField.value, advancedMatchMode.value) &&
        (!advancedCompany.value || normalize(p.company) === advancedCompany.value) &&
        (!advancedState.value || normalize(p.state) === advancedState.value) &&
        (!advancedCounty.value || normalize(p.county) === advancedCounty.value) &&
        (!advancedTownship.value || normalize(p.township) === advancedTownship.value) &&
        passesRequiredData(p) &&
        passesMissingFilter(p)
      );

      found = sortAdvancedResults(found, query);
      currentAdvancedResults = found;

      alwaysSearchInfo.textContent = "Matching locations";

      const selectedLimit = advancedLimit.value;
      const limit = selectedLimit === "all" ? found.length : Number(selectedLimit);
      const shown = found.slice(0, limit);

      alwaysSearchResults.innerHTML = shown.length
        ? shown.map(globalResultCard).join("")
        : `<div class="empty">
            No locations matched the selected search and filters.
            <div class="search-empty-actions">
              <button class="btn small" type="button" onclick="document.getElementById('clearAdvancedSearch').click()">Clear filters</button>
            </div>
          </div>`;
    }

    function csvCell(value) {
      const text = normalize(value).replaceAll('"', '""');
      return `"${text}"`;
    }

    function exportAdvancedResults() {
      if (!currentAdvancedResults.length) {
        showToast("No search results to export");
        return;
      }

      const headers = [
        "recordType","company","state","padName","address","latitude","longitude",
        "county","township","wellName","api","property",
        "Structured_Road_Sequence","writtenDirections","verificationStatus"
      ];
      const rows = [
        headers.map(csvCell).join(","),
        ...currentAdvancedResults.map(p =>
          headers.map(key => csvCell(p[key])).join(",")
        )
      ];
      const blob = new Blob(["\ufeff" + rows.join("\r\n")], {
        type: "text/csv;charset=utf-8"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `brinesearch-results-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast(`${currentAdvancedResults.length.toLocaleString()} results exported`);
    }

    const RECENT_PAD_STORAGE_KEY = "brinesearch.recentPads.v1";
    const QUICK_COMPANY_STORAGE_KEY = "brinesearch.quickCompanies.v1";
    const QUICK_COMPANY_LIMIT = 8;

    function defaultQuickCompanyItems() {
      const preferred = [
        { company: "Ascent", state: "Ohio" },
        { company: "Eog", state: "Ohio" },
        { company: "Gulfport", state: "Ohio" }
      ];
      return preferred.filter(item =>
        allGroups.includes(item.company) && companyStates(item.company).includes(item.state)
      );
    }

    function normalizeQuickCompanyItems(value) {
      const items = Array.isArray(value) ? value : [];
      const seen = new Set();
      const cleaned = [];

      for (const item of items) {
        const company = normalize(item?.company);
        const state = normalize(item?.state);
        if (!company || !allGroups.includes(company)) continue;
        if (state && !companyStates(company).includes(state)) continue;
        const key = `${company}::${state}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cleaned.push({ company, state });
        if (cleaned.length >= QUICK_COMPANY_LIMIT) break;
      }
      return cleaned;
    }

    function quickCompanyItems() {
      try {
        const raw = localStorage.getItem(QUICK_COMPANY_STORAGE_KEY);
        if (raw === null) {
          const defaults = defaultQuickCompanyItems();
          localStorage.setItem(QUICK_COMPANY_STORAGE_KEY, JSON.stringify(defaults));
          return defaults;
        }
        return normalizeQuickCompanyItems(JSON.parse(raw));
      } catch {
        return defaultQuickCompanyItems();
      }
    }

    function saveQuickCompanyItems(items) {
      const cleaned = normalizeQuickCompanyItems(items);
      try { localStorage.setItem(QUICK_COMPANY_STORAGE_KEY, JSON.stringify(cleaned)); } catch {}
      return cleaned;
    }

    function quickCompanyHref(item) {
      return item.state
        ? routeUrl(`company/${encodeURIComponent(item.company)}/state/${encodeURIComponent(item.state)}`)
        : routeUrl(`company/${encodeURIComponent(item.company)}`);
    }

    function quickCompanyCount(item) {
      return companyPads(item.company).filter(record =>
        !item.state || normalize(record.state) === item.state
      ).length;
    }

    function quickCompanyGridMarkup() {
      const items = quickCompanyItems();
      if (!items.length) {
        return `<div class="field-quick-empty">Add the companies and states you use most. They will appear here as one-tap searches.</div>`;
      }
      return items.map(item => {
        const count = quickCompanyCount(item);
        const stateLabel = item.state || "All states";
        return `<a class="field-quick-card" href="${quickCompanyHref(item)}">
          ${companyLogoHtml(item.company, "field-quick-logo")}
          <div class="field-quick-copy">
            <strong>${esc(item.company)}</strong>
            <span>${esc(stateLabel)} · ${count.toLocaleString()} ${esc(groupLabel(item.company, count !== 1))}</span>
          </div>
          <span class="field-quick-arrow" aria-hidden="true">›</span>
        </a>`;
      }).join("");
    }

    function quickCompanyManageMarkup() {
      const items = quickCompanyItems();
      if (!items.length) return `<div class="field-quick-empty">No shortcuts saved yet.</div>`;
      return items.map((item, index) => `
        <div class="field-quick-manage-row">
          ${companyLogoHtml(item.company, "field-quick-logo")}
          <div class="field-quick-copy"><strong>${esc(item.company)}</strong><span>${esc(item.state || "All states")}</span></div>
          <button class="field-quick-remove" type="button" data-quick-remove="${index}">Remove</button>
        </div>`).join("");
    }

    function recentPadIds() {
      try {
        const value = JSON.parse(localStorage.getItem(RECENT_PAD_STORAGE_KEY) || "[]");
        return Array.isArray(value) ? value.filter(Boolean).slice(0, OFFLINE_RECENT_LIMIT) : [];
      } catch { return []; }
    }

    function rememberRecentPad(id) {
      const ids = [id, ...recentPadIds().filter(value => value !== id)].slice(0, OFFLINE_RECENT_LIMIT);
      try { localStorage.setItem(RECENT_PAD_STORAGE_KEY, JSON.stringify(ids)); } catch {}
      cachePadForOffline(id, "recent");
    }
