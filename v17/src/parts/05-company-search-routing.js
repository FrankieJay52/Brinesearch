
    function renderCompanyState(company, state) {
      const knownCompany = allGroups.includes(company);
      if (!knownCompany) return renderNotFound();

      const states = companyStates(company);
      if (!states.includes(state)) return renderNotFound();

      const list = companyPads(company)
        .filter(record => normalize(record.state) === state)
        .sort((a, b) => normalize(a.padName).localeCompare(normalize(b.padName)));

      document.title = `${company} · ${state} · BrineSearch`;
      const counties = [...new Set(list.map(p => normalize(p.county)).filter(Boolean))].sort();

      app.innerHTML = `
        <nav class="breadcrumb">
          <a href="#/">Home</a><span>›</span>
          <a href="${routeUrl(`company/${encodeURIComponent(company)}`)}">${esc(company)}</a><span>›</span>
          <span>${esc(state)}</span>
        </nav>

        <div class="page-title clean-company-title">
          <div class="title-head">
            ${companyLogoHtml(company, "title-logo")}
            <div class="title-copy">
              <div class="eyebrow">${esc(state)}</div>
              <h1>${esc(company)}</h1>
              <div class="title-meta">${company === "Disposals" ? "Disposal locations" : "Pads"} in ${esc(state)}</div>
            </div>
          </div>
          <div class="action-row">
            <a class="btn ghost" href="${routeUrl(`company/${encodeURIComponent(company)}`)}">States</a>
            <a class="btn ghost" href="#/">Companies</a>
          </div>
        </div>

        <section class="clean-card" style="margin-bottom:16px">
          <div class="search-panel" style="margin-top:0;grid-template-columns:minmax(0,1fr) 220px">
            <div class="field">
              <input id="companySearch" type="search" autocomplete="off"
                autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search"
                placeholder="Search ${esc(company)} pads in ${esc(state)}…"
                aria-label="Search ${esc(company)} locations in ${esc(state)}">
            </div>
            <div class="field">
              <select id="countyFilter" aria-label="Filter by county">
                <option value="">All counties</option>
                ${counties.map(c => `<option value="${esc(c)}">${esc(c)} County</option>`).join("")}
              </select>
            </div>
          </div>
        </section>

        ${alphabetRailMarkup(list)}
        <p class="simple-result-note" id="companySummary">Locations</p>
        <div class="pad-list" id="companyResults">${alphabetizedPadCards(list)}</div>`;

      document.body.classList.add("alphabet-rail-active");
      bindAlphabetRail();

      const search = document.getElementById("companySearch");
      const county = document.getElementById("countyFilter");
      const results = document.getElementById("companyResults");
      const summary = document.getElementById("companySummary");

      function companySearchScore(record, rawQuery) {
        const query = normalize(rawQuery).toLowerCase();
        if (!query) return 0;
        const compactQuery = compactSearch(query);
        const pad = normalize(record.padName).toLowerCase();
        const compactPad = compactSearch(pad);
        const api = normalize(record.api).toLowerCase();
        const property = normalize(record.property).toLowerCase();
        const well = normalize(record.wellName).toLowerCase();
        const full = searchable(record);
        const tokens = query.split(/\s+/).filter(Boolean);
        let score = advancedRelevance(record, query, "all");

        if (pad === query || compactPad === compactQuery) score += 1000;
        else if (pad.startsWith(query) || compactPad.startsWith(compactQuery)) score += 500;
        else if (pad.includes(query) || compactPad.includes(compactQuery)) score += 300;

        if (compactQuery && compactSearch(api).includes(compactQuery)) score += 260;
        if (compactQuery && compactSearch(property).includes(compactQuery)) score += 240;
        if (compactQuery && compactSearch(well).includes(compactQuery)) score += 220;
        if (tokens.length > 1 && tokens.every(token => full.includes(token))) score += 180;
        else if (tokens.some(token => full.includes(token))) score += 40;
        return score;
      }

      function runFilter() {
        const query = search.value.trim();
        const countyValue = county.value;
        const countyKey = normalize(countyValue).toLowerCase();

        const found = list
          .filter(record => {
            const countyMatches = !countyKey || normalize(record.county).toLowerCase() === countyKey;
            if (!countyMatches) return false;
            if (!query) return true;
            return companySearchScore(record, query) > 0;
          })
          .sort((a, b) => query
            ? companySearchScore(b, query) - companySearchScore(a, query) || normalize(a.padName).localeCompare(normalize(b.padName))
            : normalize(a.padName).localeCompare(normalize(b.padName)));

        summary.textContent = `${found.length.toLocaleString()} location${found.length === 1 ? "" : "s"}${found.length === list.length ? "" : ` of ${list.length.toLocaleString()}`}${countyValue ? ` · ${countyValue} County` : ""}`;
        results.innerHTML = found.length
          ? (query ? found.map(padCard).join("") : alphabetizedPadCards(found))
          : `<div class="empty">No locations matched those filters.</div>`;
        updateAlphabetRail(query ? [] : found);
        requestAnimationFrame(syncAlphabetRailToScroll);
      }

      let companySearchTimer = 0;
      search.addEventListener("input", () => {
        clearTimeout(companySearchTimer);
        companySearchTimer = setTimeout(runFilter, 160);
      });
      search.addEventListener("search", runFilter);
      county.addEventListener("change", runFilter);
    }

    function formatMulti(value) {
      if (!has(value)) return `<span class="muted">Not listed</span>`;
      return normalize(value).split("|").map(v => v.trim()).filter(Boolean)
        .map(v => `<span class="pill">${esc(v)}</span>`).join(" ");
    }

    function routeContext(p) {
      return [
        normalize(p?.township) ? `${normalize(p.township)} Township` : "",
        normalize(p?.county) ? `${normalize(p.county)} County` : "",
        normalize(p?.state)
      ].filter(Boolean).join(", ");
    }

    function isDestinationRouteStep(step) {
      const value = normalize(step).toLowerCase().replace(/[.]/g, "");
      if (value.includes("exact coordinates")) return true;
      return /^(the )?(pad|site|location|well|well pad|entrance|pad entrance|facility entrance|lease road|access road|lease road \/ pad entrance)$/.test(value) ||
        /^(turn(ing)? (left|right) (on|onto) )?(lease road|access road|pad entrance)$/.test(value);
    }

    function isMajorRouteStep(step) {
      const value = normalize(step).toUpperCase().replace(/[.]/g, "").trim();
      if (!value || isDestinationRouteStep(step) || /^EXIT\b/.test(value)) return false;

      return /\bI[\s-]?\d{1,3}\b/.test(value) ||
        /\bINTERSTATE\s+\d{1,3}\b/.test(value) ||
        /\bUS[\s-]?\d{1,3}\b/.test(value) ||
        /\bU S (ROUTE|HIGHWAY)?\s*\d{1,3}\b/.test(value) ||
        /\b(OH|WV|PA)[\s-]?\d{1,4}\b/.test(value) ||
        /\bSR[\s-]?\d{1,4}\b/.test(value) ||
        /\bSTATE ROUTE[\s-]?\d{1,4}\b/.test(value) ||
        /^ROUTE\s+\d{1,4}\b/.test(value);
    }

    function isUsefulNearPadRoad(step) {
      const value = normalize(step);
      if (!value || isDestinationRouteStep(step) || isMajorRouteStep(step)) return false;
      if (/^(exit|turn|turning|left|right|straight|continue|then|or)\b/i.test(value)) return false;
      return true;
    }

    function finalRouteDestinationLabel(p) {
      return isDisposal(p)
        ? "Facility Entrance (Exact Coordinates)"
        : "Lease Road / Pad Entrance (Exact Coordinates)";
    }

    function routeWithFinalDestination(route, p) {
      if (!hasGps(p)) return route;
      const roadSteps = route.filter(step => !isDestinationRouteStep(step));
      return [...roadSteps, finalRouteDestinationLabel(p)];
    }

    function routeStepTarget(step, p) {
      const destination = mapsTarget(p);
      if (isDestinationRouteStep(step) && destination) return destination;

      const context = routeContext(p);
      return [normalize(step), context].filter(Boolean).join(", ");
    }

    function nearPadRoadIndex(route) {
      for (let index = route.length - 1; index >= 0; index -= 1) {
        if (isUsefulNearPadRoad(route[index])) return index;
      }
      return -1;
    }

    function majorRouteWaypointSteps(route) {
      // Mobile Google Maps URLs reliably handle only a few waypoints. Use the
      // final three major roads closest to the pad so navigation remains on the
      // listed interstate/U.S./state routes until the local approach.
      return route.filter(isMajorRouteStep).slice(-3);
    }

    function routeStepGoogleUrl(step, p) {
      const target = routeStepTarget(step, p);
      if (!target) return "";

      const navigationGps = padNavigationGps(p);
      if (!isDestinationRouteStep(step) && navigationGps) {
        const lat = navigationGps.latitude;
        const lng = navigationGps.longitude;
        return `https://www.google.com/maps/search/${encodeURIComponent(target)}/@${lat},${lng},11z?utm_source=BrineSearch&utm_campaign=major_route_reference`;
      }

      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}&utm_source=BrineSearch&utm_campaign=road_sequence_pin`;
    }

    function routeDirectionsUrl(route, p) {
      return googleMapsUrl(p);
    }


    const DIRECTION_TYPES = [
      ["custom", "Road / custom instruction"],
      ["continue", "Continue on…"],
      ["left", "Turn left onto…"],
      ["right", "Turn right onto…"],
      ["merge", "Merge onto…"],
      ["exit", "Take Exit…"],
      ["keep-left", "Keep left…"],
      ["keep-right", "Keep right…"],
      ["slight-left", "Slight left…"],
      ["slight-right", "Slight right…"],
      ["straight", "Continue straight…"],
      ["destination-left", "Destination on left"],
      ["destination-right", "Destination on right"]
    ];

    const COMPASS_DIRECTIONS = [
      ["N", "North"], ["NE", "Northeast"], ["E", "East"], ["SE", "Southeast"],
      ["S", "South"], ["SW", "Southwest"], ["W", "West"], ["NW", "Northwest"]
    ];

    function normalizeCompassDirection(value) {
      const key = normalize(value).toUpperCase().replace(/[.\s_-]+/g, "");
      const aliases = {
        N:"N", NORTH:"N", NE:"NE", NORTHEAST:"NE", NORTHEASTWARD:"NE",
        E:"E", EAST:"E", SE:"SE", SOUTHEAST:"SE", SOUTHEASTWARD:"SE",
        S:"S", SOUTH:"S", SW:"SW", SOUTHWEST:"SW", SOUTHWESTWARD:"SW",
        W:"W", WEST:"W", NW:"NW", NORTHWEST:"NW", NORTHWESTWARD:"NW"
      };
      return aliases[key] || "";
    }

    function compassDirectionLabel(value) {
      const dir = normalizeCompassDirection(value);
      return Object.fromEntries(COMPASS_DIRECTIONS)[dir] || "";
    }

    function cleanLegacyDirectionText(value) {
      return normalize(value)
        .replace(/\b(Rd|Road)continue\b/gi, "$1 Continue")
        .replace(/\bUpperClearfork\b/gi, "Upper Clearfork")
        .replace(/\buip\b/gi, "up")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function decodeDirectionMeta(value) {
      const raw = normalize(value);
      const match = raw.match(/\s*⟦([^\]]*)⟧\s*$/);
      let instruction = raw;
      let distance = "";
      let note = "";
      let cardinal = "";
      if (match) {
        instruction = raw.slice(0, match.index).trim();
        const fields = {};
        match[1].split(";").forEach(part => {
          const index = part.indexOf("=");
          if (index >= 0) fields[part.slice(0,index).trim()] = part.slice(index+1);
        });
        distance = normalize(fields.d || "");
        cardinal = normalizeCompassDirection(fields.c || "");
        try { note = decodeURIComponent(fields.n || ""); } catch { note = fields.n || ""; }
      } else {
        const mileage = instruction.match(/(?:\s+(?:for\s+)?)?(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b[.]?/i);
        if (mileage) {
          distance = mileage[1];
          instruction = `${instruction.slice(0, mileage.index)} ${instruction.slice(mileage.index + mileage[0].length)}`
            .replace(/\s{2,}/g, " ").replace(/[\s,;:-]+$/g, "").trim();
        }
      }
      return { instruction: cleanLegacyDirectionText(instruction || raw), distance, note, cardinal };
    }

    function splitDirectionRoutes(value) {
      if (!has(value)) return [];
      const normalized = String(value)
        .replace(/\r/g, "")
        .replace(/^\s*(?:PRIMARY ROUTE|ALTERNATE ROUTE)\s*$/gim, marker => marker.toUpperCase() === "ALTERNATE ROUTE" ? " → OR → " : "")
        .replace(/^\s*[-━═_]{4,}\s*$/gm, "");
      return normalized
        .split(/\s*→\s*OR\s*→\s*|\n\s*OR\s*\n|\n\s*ALTERNATE ROUTE\s*\n/i)
        .map(route => route
          .split(/\s*(?:→|->|>>)\s*|\n+/)
          .map(step => step.replace(/^\s*\d+[.)]\s*/, "").trim())
          .filter(step => step && !/^OR$/i.test(step)))
        .filter(route => route.length);
    }

    const ROAD_NAME_CORRECTIONS = new Map([
      ["mcfetridge/dunham rd", "Denham Rd"],
      ["mcfetridge/dunham road", "Denham Rd"],
      ["mcfetridge / dunham rd", "Denham Rd"],
      ["mcfetridge / dunham road", "Denham Rd"]
    ]);

    function roadStatePrefix(p) {
      const state = normalize(p?.state).toUpperCase();
      if (/^OH(?:IO)?$/.test(state)) return "OH";
      if (/^WV|WEST VIRGINIA$/.test(state)) return "WV";
      if (/^PA|PENNSYLVANIA$/.test(state)) return "PA";
      return "SR";
    }

    function roadTitleCase(value) {
      const small = new Set(["and","at","by","for","in","of","on","the","to"]);
      return normalize(value).toLowerCase().split(/(\s+|[-/])/).map((part, index) => {
        if (!part || /^(?:\s+|[-/])$/.test(part)) return part;
        if (/^(?:n|s|e|w|ne|nw|se|sw)$/i.test(part)) return part.toUpperCase();
        if (/^mc[a-z]/i.test(part)) return "Mc" + part.slice(2,3).toUpperCase() + part.slice(3);
        if (index && small.has(part)) return part;
        return part.charAt(0).toUpperCase() + part.slice(1);
      }).join("");
    }
