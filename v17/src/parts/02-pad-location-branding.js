
    function padOfficialGps(p) {
      const official = p?.official_pad_record && typeof p.official_pad_record === "object"
        ? p.official_pad_record
        : null;
      if (!official) return null;
      const latitude = Number(official.latitude);
      const longitude = Number(official.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return null;
      }
      return { latitude, longitude, source:"official" };
    }

    function padNavigationGps(p) {
      if (hasGps(p)) {
        return { latitude:Number(p.latitude), longitude:Number(p.longitude), source:"saved" };
      }
      return padOfficialGps(p);
    }

    function mapsTarget(p) {
      const gps = padNavigationGps(p);
      if (gps) return `${gps.latitude},${gps.longitude}`;
      return normalize(p.address);
    }

    function googleMapsRoutePlan(p) {
      const plan = p?.googleMapsRoutePlanIssue97;
      return plan && Array.isArray(plan.chunks) && plan.chunks.length ? plan : null;
    }

    function googleMapsRouteChunks(p) {
      return googleMapsRoutePlan(p)?.chunks || [];
    }

    function hasAuthoritativeGoogleRoute(p) {
      return googleMapsRouteChunks(p).length > 0;
    }

    function googleMapsUrl(p) {
      const authoritative = googleMapsRouteChunks(p);
      if (authoritative.length) return authoritative[0].url;
      const target = mapsTarget(p);
      return target ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}` : "";
    }

    function googleMapsValueUrl(value) {
      const target = normalize(value);
      return target
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`
        : "";
    }

    function padCoordinateText(p) {
      const gps = padNavigationGps(p);
      return gps ? `${gps.latitude}, ${gps.longitude}` : "";
    }

    function padCoordinateGoogleUrl(p) {
      const gps = padNavigationGps(p);
      if (!gps) return "";
      return googleMapsValueUrl(`${gps.latitude}, ${gps.longitude}`);
    }

    function appleMapsUrl(p) {
      const gps = padNavigationGps(p);
      const coordinates = gps ? `${gps.latitude},${gps.longitude}` : "";
      const target = coordinates || normalize(p.address);
      return target
        ? `https://maps.apple.com/?daddr=${encodeURIComponent(target)}&dirflg=d`
        : "";
    }

    function showToast(message) {
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
    }

    async function copyText(text, success = "Copied") {
      try {
        await navigator.clipboard.writeText(text);
        showToast(success);
      } catch {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
        showToast(success);
      }
    }

    function companyInitials(name) {
      return name.split(/\s+/).map(v => v[0]).join("").slice(0,3).toUpperCase();
    }

    const COMPANY_LOGOS = {"Antero": {"primary": "https://logo.clearbit.com/anteroresources.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.anteroresources.com", "source": "https://www.anteroresources.com/"}, "Ascent": {"primary": "https://logo.clearbit.com/ascentresources.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.ascentresources.com", "source": "https://www.ascentresources.com/"}, "Chesapeake": {"primary": "https://logotyp.us/file/chesapeake-energy.svg", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.expandenergy.com", "source": "https://logotyp.us/get/chesapeake-energy/"}, "Cnx": {"primary": "https://logo.clearbit.com/cnx.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.cnx.com", "source": "https://www.cnx.com/"}, "Eclipse": {"primary": "https://www.sec.gov/Archives/edgar/data/1600470/000119312517378763/g504675g70n09.jpg", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.sec.gov", "source": "https://www.sec.gov/Archives/edgar/data/1600470/000119312517378763/d504675ddef14c.htm"}, "Eog": {"primary": "https://logo.clearbit.com/eogresources.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.eogresources.com", "source": "https://www.eogresources.com/"}, "Eqt": {"primary": "https://logo.clearbit.com/eqt.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.eqt.com", "source": "https://www.eqt.com/"}, "Expand": {"primary": "https://logo.clearbit.com/expandenergy.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.expandenergy.com", "source": "https://www.expandenergy.com/"}, "Gulfport": {"primary": "https://logo.clearbit.com/gulfportenergy.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.gulfportenergy.com", "source": "https://www.gulfportenergy.com/"}, "Hg": {"primary": "https://logo.clearbit.com/hgenergyllc.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://hgenergyllc.com", "source": "https://hgenergyllc.com/"}, "Hilcorp": {"primary": "https://logo.clearbit.com/hilcorp.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.hilcorp.com", "source": "https://www.hilcorp.com/"}, "Infinity": {"primary": "https://logo.clearbit.com/infinitynaturalresources.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://infinitynaturalresources.com", "source": "https://infinitynaturalresources.com/"}, "Lola": {"primary": "https://logo.clearbit.com/lolaenergy.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.lolaenergy.com", "source": "https://www.lolaenergy.com/"}, "Penn Energy": {"primary": "https://logo.clearbit.com/pennenergyresources.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.pennenergyresources.com", "source": "https://www.pennenergyresources.com/"}, "Range": {"primary": "https://logo.clearbit.com/rangeresources.com?size=256", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.rangeresources.com", "source": "https://www.rangeresources.com/"}, "Swn": {"primary": "https://commons.wikimedia.org/wiki/Special:Redirect/file/Southwestern_Energy_logo.jpg", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.expandenergy.com", "source": "https://commons.wikimedia.org/wiki/File:Southwestern_Energy_logo.jpg"}, "Xto": {"primary": "https://commons.wikimedia.org/wiki/Special:Redirect/file/XTO-Energy-Logo.svg", "fallback": "https://www.google.com/s2/favicons?sz=256&domain_url=https://www.xtoenergy.com", "source": "https://commons.wikimedia.org/wiki/File:XTO-Energy-Logo.svg"}};
    // HG Energy site currently falls back to a WordPress icon; use the clean HG monogram instead.
    delete COMPANY_LOGOS.Hg;

    function companyLogoText(name) {
      const base = companyInitials(name || "");
      return (name === "Disposals" ? "DS" : base.slice(0, 2)) || "BD";
    }

    const CUSTOM_COMPANY_LOGO_KEY = "brinesearch.customCompanyLogos.v1";
    function customCompanyLogos() {
      try { const value = JSON.parse(localStorage.getItem(CUSTOM_COMPANY_LOGO_KEY) || "{}"); return value && typeof value === "object" ? value : {}; }
      catch { return {}; }
    }
    function saveCustomCompanyLogo(name, url) {
      const logos = customCompanyLogos();
      if (url) logos[name] = url; else delete logos[name];
      try { localStorage.setItem(CUSTOM_COMPANY_LOGO_KEY, JSON.stringify(logos)); } catch {}
    }
    function effectiveCompanyLogo(name) {
      const custom = customCompanyLogos()[name];
      return custom ? { primary:custom, fallback:(COMPANY_LOGOS[name]?.fallback || custom), source:"Custom device logo" } : COMPANY_LOGOS[name];
    }

    function companyLogoHtml(name, className = "company-logo") {
      const logo = effectiveCompanyLogo(name);
      const initials = esc(companyLogoText(name));
      if (!logo) {
        return `<div class="${className}" style="${logoStyle(name)}">${initials}</div>`;
      }

      const primary = esc(logo.primary);
      const fallback = esc(logo.fallback);
      const source = esc(logo.source);
      const alt = esc(`${name} logo`);
      return `<div class="${className} real-logo" title="${alt}" data-logo-source="${source}">
        <span class="logo-monogram">${initials}</span>
        <img src="${primary}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer"
          onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.classList.add('favicon-fallback');this.src='${fallback}';}else{this.style.display='none';}">
      </div>`;
    }

    function hashString(value) {
      return [...String(value || "")].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    }

    function logoStyle(seed) {
      const palettes = [
        ["#58d5c9", "#6ea8ff"],
        ["#6ea8ff", "#8a8bff"],
        ["#7ae18f", "#58d5c9"],
        ["#ffb35f", "#ff7d81"],
        ["#8b9fff", "#5fd4ff"],
        ["#9a7cff", "#ff7fb4"],
        ["#55d1ff", "#44e2a8"],
        ["#ff8f6b", "#ffcb6b"]
      ];
      const pair = palettes[hashString(seed) % palettes.length];
      return `--logoA:${pair[0]};--logoB:${pair[1]};`;
    }

    function isDisposal(p) {
      return p && p.recordType === "disposal";
    }

    function recordLabel(p, plural = false) {
      if (isDisposal(p)) return plural ? "disposals" : "disposal";
      return plural ? "pads" : "pad";
    }

    function groupLabel(company, plural = false) {
      if (company === "Disposals") return plural ? "disposals" : "disposal";
      return plural ? "pads" : "pad";
    }

    function companyCard(company) {
      const list = companyPads(company);
      const states = [...new Set(list.map(p => normalize(p.state)).filter(Boolean))].sort();
      return `
        <a class="company-card" href="${routeUrl(`company/${encodeURIComponent(company)}`)}">
          <div class="company-top">
            <div class="company-ident">
              ${companyLogoHtml(company, "company-logo")}
              <div class="company-copy">
                <h3>${esc(company)}</h3>
                <div class="company-subtitle">${company === "Disposals" ? "Disposal locations" : (states.map(esc).join(" · ") || "Field locations")}</div>
              </div>
            </div>
            <div class="company-arrow">›</div>
          </div>
        </a>`;
    }

    function padCard(p) {
      const locationText = [p.county && `${p.county} County`, p.state].filter(has).join(" · ") || "Location not listed";
      const map = googleMapsUrl(p);
      const owner = isDisposal(p) ? "Disposals" : display(p.company);
      const detailHref = routeUrl(`pad/${encodeURIComponent(p._id)}`);
      return `
        <article class="pad-card clean-card">
          <a class="clean-card-main" href="${detailHref}">
            <div class="clean-card-top">
              ${companyLogoHtml(owner, "record-avatar clean-card-logo")}
              <div class="clean-card-copy">
                <div class="clean-card-company">${isDisposal(p) ? "Disposal" : esc(owner)}</div>
                <h3>${esc(display(p.padName))}</h3>
                <div class="clean-card-location">${esc(locationText)}</div>
              </div>
              <span class="clean-card-arrow">›</span>
            </div>
          </a>
          <div class="clean-card-actions">
            <a href="${detailHref}">View details</a>
            ${map ? `<a class="navigate" href="${esc(map)}" target="_blank" rel="noopener">${hasAuthoritativeGoogleRoute(p) ? "Open route" : "Open GPS"}</a>` : `<a class="disabled" aria-disabled="true">No GPS</a>`}
          </div>
        </article>`;
    }

    function optionMarkup(values, firstLabel) {
      return `<option value="">${esc(firstLabel)}</option>` +
        values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    }

    function fillAdvancedBaseOptions() {
      advancedCompany.innerHTML = optionMarkup(allGroups, "All companies and disposals");
      advancedState.innerHTML = optionMarkup(allStates, "All states");
      refreshAdvancedLocationOptions();
    }

    function refreshAdvancedLocationOptions() {
      const savedCounty = advancedCounty.value;
      const savedTownship = advancedTownship.value;

      const base = pads.filter(p =>
        (!advancedCompany.value || normalize(p.company) === advancedCompany.value) &&
        (!advancedState.value || normalize(p.state) === advancedState.value)
      );

      const counties = [...new Set(base.map(p => normalize(p.county)).filter(Boolean))]
        .sort((a,b) => a.localeCompare(b));
      advancedCounty.innerHTML = optionMarkup(counties, "All counties");
      if (counties.includes(savedCounty)) advancedCounty.value = savedCounty;

      const countyBase = base.filter(p =>
        (!advancedCounty.value || normalize(p.county) === advancedCounty.value)
      );
      const townships = [...new Set(countyBase.map(p => normalize(p.township)).filter(Boolean))]
        .sort((a,b) => a.localeCompare(b));
      advancedTownship.innerHTML = optionMarkup(townships, "All townships");
      if (townships.includes(savedTownship)) advancedTownship.value = savedTownship;
    }

    function advancedFieldText(p, field) {
      const values = {
        all: [
          p.company, p.padName, p.state, p.county, p.township, p.address,
          p.wellName, p.api, p.property, p.Structured_Road_Sequence,
          p.writtenDirections
        ],
        padName: [p.padName],
        company: [p.company],
        api: [p.api],
        property: [p.property],
        wellName: [p.wellName],
        address: [p.address],
        location: [p.state, p.county, p.township],
        road: [p.Structured_Road_Sequence],
        directions: [p.writtenDirections]
      };
      return (values[field] || values.all).map(normalize).join(" ").toLowerCase();
    }

    function compactSearch(value) {
      return normalize(value).toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function matchesAdvancedText(p, query, field, mode) {
      if (!query) return true;
      const hay = advancedFieldText(p, field);
      const needle = query.trim().toLowerCase();
      const compactHay = compactSearch(hay);
      const compactNeedle = compactSearch(needle);

      if (mode === "exact") {
        return hay.trim() === needle || (compactNeedle && compactHay === compactNeedle);
      }
      if (mode === "starts") {
        return hay.trim().startsWith(needle) ||
          (compactNeedle && compactHay.startsWith(compactNeedle));
      }

      const words = needle.split(/\s+/).filter(Boolean);
      if (mode === "allWords") {
        return words.every(word =>
          hay.includes(word) ||
          (compactSearch(word) && compactHay.includes(compactSearch(word)))
        );
      }
      if (mode === "anyWords") {
        return words.some(word =>
          hay.includes(word) ||
          (compactSearch(word) && compactHay.includes(compactSearch(word)))
        );
      }

      return hay.includes(needle) ||
        (compactNeedle.length >= 2 && compactHay.includes(compactNeedle));
    }

    function hasGps(p) {
      return has(p.latitude) && has(p.longitude) &&
        Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
    }

    function dataCompleteness(p) {
      return [
        has(p.company), has(p.padName), has(p.state), has(p.county),
        has(p.township), has(p.address), hasGps(p), has(p.wellName),
        has(p.api), has(p.property), has(p.Structured_Road_Sequence),
        has(p.writtenDirections)
      ].filter(Boolean).length;
    }

    function advancedRelevance(p, query, field) {
      if (!query) return 0;
      const q = query.trim().toLowerCase();
      let score = 0;
      const pad = normalize(p.padName).toLowerCase();
      const company = normalize(p.company).toLowerCase();
      const api = normalize(p.api).toLowerCase();
      const property = normalize(p.property).toLowerCase();
      const well = normalize(p.wellName).toLowerCase();
      const selected = advancedFieldText(p, field);

      if (pad === q) score += 500;
      else if (pad.startsWith(q)) score += 260;
      else if (pad.includes(q)) score += 180;
      if (company === q) score += 230;
      else if (company.startsWith(q)) score += 120;
      if (api.includes(q) || compactSearch(api).includes(compactSearch(q))) score += 210;
      if (property.includes(q) || compactSearch(property).includes(compactSearch(q))) score += 190;
      if (well.includes(q)) score += 140;
      if (selected.includes(q)) score += 40;
      score += dataCompleteness(p);
      return score;
    }

    function passesRequiredData(p) {
      if (requireMapReady.checked && !(hasGps(p) || has(p.address))) return false;
      if (requireGps.checked && !hasGps(p)) return false;
      if (requireAddress.checked && !has(p.address)) return false;
      if (requireApi.checked && !has(p.api)) return false;
      if (requireProperty.checked && !has(p.property)) return false;
      if (requireWell.checked && !has(p.wellName)) return false;
      if (requireRoad.checked && !has(p.Structured_Road_Sequence)) return false;
      if (requireDirections.checked && !has(p.writtenDirections)) return false;
      return true;
    }
