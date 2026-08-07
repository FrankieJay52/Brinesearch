
    const FAVORITE_PAD_STORAGE_KEY = "brinesearch.favoritePads.v1";
    function favoritePadIds() {
      try {
        const value = JSON.parse(localStorage.getItem(FAVORITE_PAD_STORAGE_KEY) || "[]");
        return Array.isArray(value) ? value.filter(Boolean).slice(0, 24) : [];
      } catch { return []; }
    }
    function isFavoritePad(id) { return favoritePadIds().includes(id); }
    function toggleFavoritePad(id) {
      const current = favoritePadIds();
      const next = current.includes(id) ? current.filter(value => value !== id) : [id, ...current].slice(0,24);
      try { localStorage.setItem(FAVORITE_PAD_STORAGE_KEY, JSON.stringify(next)); } catch {}
      const active = next.includes(id);
      if (active) cachePadForOffline(id, "favorite");
      else pruneOfflinePadCache();
      return active;
    }
    function cachePadForOffline(id, reason = "recent") {
      const pad = padById(id);
      if (!pad) return;
      const cache = readOfflinePadCache();
      const existing = cache[id] || {};
      const reasons = new Set(Array.isArray(existing.reasons) ? existing.reasons : []);
      reasons.add(reason);
      cache[id] = { pad, cachedAt: new Date().toISOString(), reasons: Array.from(reasons) };
      writeOfflinePadCache(cache);
      pruneOfflinePadCache();
    }
    function pruneOfflinePadCache() {
      const cache = readOfflinePadCache();
      const favorites = new Set(favoritePadIds());
      const recents = new Set(recentPadIds().slice(0, OFFLINE_RECENT_LIMIT));
      Object.keys(cache).forEach(id => {
        if (!favorites.has(id) && !recents.has(id)) delete cache[id];
        else {
          cache[id].reasons = [favorites.has(id) ? "favorite" : null, recents.has(id) ? "recent" : null].filter(Boolean);
        }
      });
      writeOfflinePadCache(cache);
    }
    function refreshOfflinePadCache() {
      [...new Set([...favoritePadIds(), ...recentPadIds().slice(0, OFFLINE_RECENT_LIMIT)])].forEach(id => cachePadForOffline(id, favoritePadIds().includes(id) ? "favorite" : "recent"));
      try { localStorage.setItem("brinesearch.offlineLastRefresh.v1", new Date().toISOString()); } catch {}
    }
    function offlineStorageBytes() {
      try { return new Blob([localStorage.getItem(OFFLINE_PAD_CACHE_KEY) || "{}"]).size; } catch { return 0; }
    }
    function formatOfflineBytes(bytes) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    function favoritePadMarkup() {
      const favorites = favoritePadIds().map(padById).filter(Boolean);
      if (!favorites.length) return `<div class="field-favorites-empty">Tap ☆ Favorite on a pad page to keep your most-used locations here.</div>`;
      return `<div class="field-recent-row">${favorites.map(p => `<a class="field-recent-card" href="${routeUrl(`pad/${encodeURIComponent(p._id)}`)}"><strong>★ ${esc(display(p.padName))}</strong><span>${esc(isDisposal(p) ? "Disposal" : display(p.company))} · ${esc(p.county || p.state || "Location")}</span></a>`).join("")}</div>`;
    }

    function recentPadMarkup() {
      const recent = recentPadIds().map(padById).filter(Boolean);
      if (!recent.length) {
        return `<div class="field-home-note">Pads you open will appear here for faster return trips.</div>`;
      }
      return `<div class="field-recent-row">${recent.map(p => `
        <a class="field-recent-card" href="${routeUrl(`pad/${encodeURIComponent(p._id)}`)}">
          <strong>${esc(display(p.padName))}</strong>
          <span>${esc(isDisposal(p) ? "Disposal" : display(p.company))} · ${esc(p.county || p.state || "Location")}</span>
        </a>`).join("")}</div>`;
    }

    function dashboardGreeting(){
      const h=new Date().getHours();
      return h<12?"Good morning":h<17?"Good afternoon":"Good evening";
    }
    function dashboardPadCards(records, emptyText){
      if(!records.length)return `<div class="dashboard-empty">${esc(emptyText)}</div>`;
      return `<div class="dashboard-scroll">${records.map(p=>`<a class="dashboard-pad-card" href="${routeUrl(`pad/${encodeURIComponent(p._id)}`)}"><strong>${esc(display(p.padName))}</strong><span>${esc(isDisposal(p)?"Disposal":display(p.company))}</span><span>${esc([p.county,p.township,p.state].filter(Boolean).join(" · ")||"Location")}</span>${Number.isFinite(p._dashboardDistance)?`<span class="distance">${p._dashboardDistance.toFixed(1)} mi away</span>`:""}</a>`).join("")}</div>`;
    }
    const DASHBOARD_LOCATION_KEY = "brinesearch.dashboardLocation.v1";
    function readDashboardLocation(){
      try{
        const saved=JSON.parse(localStorage.getItem(DASHBOARD_LOCATION_KEY)||"null");
        return saved&&Number.isFinite(Number(saved.lat))&&Number.isFinite(Number(saved.lon))?saved:null;
      }catch{return null;}
    }
    function saveDashboardLocation(lat,lon,accuracy){
      const saved={lat:Number(lat),lon:Number(lon),accuracy:Number(accuracy)||null,savedAt:Date.now()};
      try{localStorage.setItem(DASHBOARD_LOCATION_KEY,JSON.stringify(saved));}catch{}
      return saved;
    }
    function dashboardNearbyRows(location){
      const lat=Number(location?.lat),lon=Number(location?.lon),toRad=x=>x*Math.PI/180;
      if(!Number.isFinite(lat)||!Number.isFinite(lon))return [];
      return pads.filter(p=>Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude))).map(p=>{
        const dlat=toRad(Number(p.latitude)-lat),dlon=toRad(Number(p.longitude)-lon);
        const a=Math.sin(dlat/2)**2+Math.cos(toRad(lat))*Math.cos(toRad(Number(p.latitude)))*Math.sin(dlon/2)**2;
        return Object.assign({},p,{_dashboardDistance:3958.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))});
      }).sort((a,b)=>a._dashboardDistance-b._dashboardDistance).slice(0,5);
    }
    function dashboardNearbyMarkup(location){
      if(!location)return `<button class="dashboard-nearby-action" id="dashboardNearbyButton" type="button"><span class="fm-icon fm-capture-gps"></span>Use my location</button><div class="dashboard-nearby-note">You only need to approve location once on this device.</div>`;
      const rows=dashboardNearbyRows(location);
      const updated=location.savedAt?new Date(location.savedAt).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"Saved location";
      return `${dashboardPadCards(rows,"No nearby pads with GPS were found.")}<div class="dashboard-nearby-tools"><button class="dashboard-nearby-action" id="dashboardNearbyButton" type="button"><span class="fm-icon fm-refresh"></span>Refresh nearby pads</button><div class="dashboard-nearby-note">Using your saved location · Updated ${esc(updated)}</div></div>`;
    }
    function renderHome() {
      document.title = "BrineSearch · Driver Dashboard";
      const favoriteRecords=favoritePadIds().map(padById).filter(Boolean).slice(0,5);
      const recentRecords=recentPadIds().map(padById).filter(Boolean).slice(0,8);
      const padCount=pads.filter(p=>!isDisposal(p)).length;
      const disposalCount=pads.filter(isDisposal).length;
      app.innerHTML = `
        <main class="driver-dashboard">
          <section class="dashboard-hero">
            <div class="dashboard-hero-top"><div><div class="eyebrow">BrineSearch driver dashboard</div><h1 class="dashboard-greeting">${dashboardGreeting()}</h1><div class="dashboard-sub">Find the next location, check field updates, and get back on the road.</div></div><div class="dashboard-status ${navigator.onLine?"":"offline"}"><span class="dashboard-status-dot"></span>${navigator.onLine?"Online":"Offline"}</div></div>
            <div class="dashboard-search"><input id="globalSearch" type="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" placeholder="Search pad, company, API, road…" aria-label="Search BrineSearch"><span class="fm-icon fm-search"></span></div>
            <div class="dashboard-search-results hide" id="searchResultsSection"><div class="field-compact-head"><h2>Search results</h2><span id="searchSummary"></span></div><div class="pad-list" id="searchResults"></div></div>
          </section>

          <section class="dashboard-section"><div class="dashboard-section-head"><h2>Quick actions</h2></div><div class="dashboard-quick-grid">
            <button class="dashboard-quick primary" id="dashboardSearchFocus" type="button"><span class="fm-icon fm-search"></span><span>Search Pads</span></button>
            <button class="dashboard-quick" id="dashboardNearbyAction" type="button"><span class="fm-icon fm-capture-gps"></span><span>Nearby Pads</span></button>
            <a class="dashboard-quick" href="#/favorites"><span class="fm-icon fm-favorite"></span><span>Favorites</span></a>
            <a class="dashboard-quick" href="#/feed"><span class="fm-icon fm-feed"></span><span>Field Feed</span></a>
            <button class="dashboard-quick" id="dashboardAddPad" type="button"><span class="fm-icon fm-add"></span><span>Add Pad</span></button>
            <a class="dashboard-quick" href="#/offline"><span class="fm-icon fm-offline"></span><span>Offline Mode</span></a>
          </div></section>

          <section class="dashboard-section" id="dashboardNearbySection"><div class="dashboard-section-head"><h2>Nearby pads</h2><span></span></div><div id="dashboardNearby">${dashboardNearbyMarkup(readDashboardLocation())}</div></section>

          <section class="dashboard-section"><div class="dashboard-section-head"><h2>Favorites</h2><a href="#/favorites">View all</a></div>${dashboardPadCards(favoriteRecords,"Favorite pads will appear here for one-tap access.")}</section>
          <section class="dashboard-section"><div class="dashboard-section-head"><h2>Recent pads</h2><span>Last opened</span></div>${dashboardPadCards(recentRecords,"Pads you open will appear here.")}</section>

          <section class="dashboard-section"><div class="dashboard-section-head"><h2>Latest Field Feed</h2><a href="#/feed">View feed</a></div><div class="dashboard-feed-list" id="dashboardFeedList"><div class="dashboard-empty">Loading field updates…</div></div></section>

          <section class="dashboard-section"><div class="dashboard-section-head"><h2>Database status</h2><span>${navigator.onLine?"Live":"Offline copy"}</span></div><div class="dashboard-stat-grid"><div class="dashboard-stat"><strong>${pads.length.toLocaleString()}</strong><span>Locations</span></div><div class="dashboard-stat"><strong>${padCount.toLocaleString()}</strong><span>Pads</span></div><div class="dashboard-stat"><strong>${disposalCount.toLocaleString()}</strong><span>Disposals</span></div></div></section>

          <details class="dashboard-section dashboard-browse-details"><summary>Browse companies</summary><div class="company-grid">${allGroups.map(companyCard).join("")}</div></details>
        </main>`;

      const search=document.getElementById("globalSearch"), resultSection=document.getElementById("searchResultsSection"), results=document.getElementById("searchResults"), summary=document.getElementById("searchSummary");
      function runSearch(){
        const query=normalize(search.value).toLowerCase(), words=query.split(/\s+/).filter(Boolean);
        if(!words.length){resultSection.classList.add("hide");results.innerHTML="";return;}
        const found=pads.filter(p=>{const hay=searchable(p);return words.every(w=>hay.includes(w));}).sort((a,b)=>{const an=normalize(a.padName).toLowerCase(),bn=normalize(b.padName).toLowerCase();return (an.startsWith(query)?0:1)-(bn.startsWith(query)?0:1)||an.localeCompare(bn);});
        resultSection.classList.remove("hide");summary.textContent=`${found.length.toLocaleString()} match${found.length===1?"":"es"}${found.length>40?" · showing 40":""}`;results.innerHTML=found.length?found.slice(0,40).map(padCard).join(""):`<div class="empty">No locations matched that search.</div>`;
      }
      let timer;search.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(runSearch,180)});
      document.getElementById("dashboardSearchFocus")?.addEventListener("click",()=>{search.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>search.focus(),250)});
      const nearbySection=document.getElementById("dashboardNearbySection"),nearbyBox=document.getElementById("dashboardNearby");
      document.getElementById("dashboardNearbyAction")?.addEventListener("click",()=>{nearbySection?.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>document.getElementById("dashboardNearbyButton")?.focus(),350);});
      document.getElementById("dashboardAddPad")?.addEventListener("click",()=>{ if(typeof openEditorAddPadWizard==="function") openEditorAddPadWizard(); else location.hash="#/settings"; });
      nearbyBox?.addEventListener("click",event=>{
        if(!event.target.closest("#dashboardNearbyButton"))return;
        nearbyBox.innerHTML=`<div class="dashboard-empty">Refreshing your location…</div>`;
        if(!navigator.geolocation){nearbyBox.innerHTML=`<div class="dashboard-empty">Location is not supported on this device.</div>`;return;}
        navigator.geolocation.getCurrentPosition(pos=>{
          const saved=saveDashboardLocation(pos.coords.latitude,pos.coords.longitude,pos.coords.accuracy);
          nearbyBox.innerHTML=dashboardNearbyMarkup(saved);
        },()=>{
          const saved=readDashboardLocation();
          nearbyBox.innerHTML=saved?`${dashboardNearbyMarkup(saved)}<div class="dashboard-nearby-error">Could not refresh your location. The saved nearby-pad list is still shown.</div>`:`<button class="dashboard-nearby-action" id="dashboardNearbyButton" type="button"><span class="fm-icon fm-capture-gps"></span>Use my location</button><div class="dashboard-nearby-error">Location permission is off. Allow location access in your browser settings, then try again.</div>`;
        },{enableHighAccuracy:false,timeout:12000,maximumAge:0});
      });
      (async()=>{const el=document.getElementById("dashboardFeedList");try{const rows=await fieldApi("/rest/v1/rpc/field_feed_list",{method:"POST",body:JSON.stringify({p_search:null,p_category:null,p_limit:3,p_offset:0})});el.innerHTML=Array.isArray(rows)&&rows.length?rows.slice(0,3).map(p=>`<a class="dashboard-feed-item" href="#/feed"><strong><span>${esc(fieldCategoryLabel(p.category))}</span><span>${esc(fieldTime(p.created_at))}</span></strong><p>${esc(p.body||"")}</p></a>`).join(""):`<div class="dashboard-empty">No Field Feed posts yet.</div>`;}catch{el.innerHTML=`<div class="dashboard-empty">Field updates are unavailable offline.</div>`;}})();
    }

    function companyStates(company) {
      return [...new Set(
        companyPads(company)
          .map(record => normalize(record.state))
          .filter(Boolean)
      )].sort((a, b) => a.localeCompare(b));
    }

    function stateBrowserCard(company, state) {
      return `
        <a class="state-browser-card"
          href="${routeUrl(`company/${encodeURIComponent(company)}/state/${encodeURIComponent(state)}`)}">
          <div class="state-browser-main">
            <div class="state-browser-label">Browse state</div>
            <div class="state-browser-name">${esc(state)}</div>
          </div>
          <div class="state-browser-arrow">›</div>
        </a>`;
    }

    function renderCompany(company) {
      const list = companyPads(company);
      const knownCompany = allGroups.includes(company);
      if (!knownCompany || !list.length) return renderNotFound();

      document.title = `${company} · BrineSearch`;
      const states = companyStates(company);

      /* Most operators here work a single state, and the interstitial made
         every one of those a pointless extra tap. Skip straight to the pad
         list; the state page's own breadcrumb still leads back here. */
      if (states.length === 1) {
        return location.replace(routeUrl(`company/${encodeURIComponent(company)}/state/${encodeURIComponent(states[0])}`));
      }

      app.innerHTML = `
        <nav class="breadcrumb">
          <a href="#/">Home</a><span>›</span><span>${esc(company)}</span>
        </nav>

        <div class="page-title clean-company-title">
          <div class="title-head">
            ${companyLogoHtml(company, "title-logo")}
            <div class="title-copy">
              <div class="eyebrow">${company === "Disposals" ? "Disposal locations" : "Operator"}</div>
              <h1>${esc(company)}</h1>
              <div class="title-meta">Choose a state to browse locations.</div>
            </div>
          </div>
          <div class="action-row">
            <a class="btn ghost" href="#/">Companies</a>
          </div>
        </div>

        <section class="state-page-heading">
          <h2>Choose a state</h2>
          <p>Select a state to see ${company === "Disposals" ? "disposal locations" : "pads"}.</p>
        </section>

        <div class="state-browser-grid">
          ${states.map(state => stateBrowserCard(company, state)).join("")}
        </div>`;
    }


    const PAD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

    function padAlphabetLetter(record) {
      const first = normalize(record?.padName).trim().charAt(0).toUpperCase();
      return /^[A-Z]$/.test(first) ? first : "";
    }

    function alphabetizedPadCards(records) {
      let previousLetter = "";
      return records.map(record => {
        const letter = padAlphabetLetter(record);
        const beginsGroup = letter && letter !== previousLetter;
        if (letter) previousLetter = letter;
        const anchor = beginsGroup
          ? `<div class="alphabet-letter-anchor" id="pad-letter-${letter}" aria-hidden="true"></div><div class="alphabet-letter-marker" aria-hidden="true">${letter}</div>`
          : "";
        return anchor + padCard(record);
      }).join("");
    }

    function alphabetRailMarkup(records) {
      const available = new Set(records.map(padAlphabetLetter).filter(Boolean));
      return `<nav class="alphabet-jump-rail" id="alphabetJumpRail" aria-label="Jump to pad name letter">
        ${PAD_ALPHABET.map(letter => `<button type="button" data-letter="${letter}" class="${available.has(letter) ? "available" : ""}" ${available.has(letter) ? "" : "disabled"} aria-label="Jump to pads beginning with ${letter}">${letter}</button>`).join("")}
      </nav>`;
    }

    function updateAlphabetRail(records) {
      const rail = document.getElementById("alphabetJumpRail");
      if (!rail) return;
      const available = new Set(records.map(padAlphabetLetter).filter(Boolean));
      rail.querySelectorAll("button[data-letter]").forEach(button => {
        const enabled = available.has(button.dataset.letter);
        button.disabled = !enabled;
        button.classList.toggle("available", enabled);
        if (!enabled) button.classList.remove("active");
      });
    }

    function setActiveAlphabetLetter(letter) {
      const rail = document.getElementById("alphabetJumpRail");
      if (!rail) return;
      rail.querySelectorAll("button[data-letter]").forEach(button => {
        button.classList.toggle("active", button.dataset.letter === letter && !button.disabled);
      });
    }

    function syncAlphabetRailToScroll() {
      const rail = document.getElementById("alphabetJumpRail");
      if (!rail) return;

      const markers = [...document.querySelectorAll(".alphabet-letter-marker")];
      if (!markers.length) {
        setActiveAlphabetLetter("");
        return;
      }

      const header = document.querySelector(".site-header");
      const threshold = (header?.getBoundingClientRect().height || 70) + 28;
      let activeMarker = markers[0];

      for (const marker of markers) {
        if (marker.getBoundingClientRect().top <= threshold) activeMarker = marker;
        else break;
      }

      setActiveAlphabetLetter(activeMarker.textContent.trim());
    }

    function bindAlphabetRail() {
      const rail = document.getElementById("alphabetJumpRail");
      if (!rail) return;

      rail.addEventListener("click", event => {
        const button = event.target.closest("button[data-letter]");
        if (!button || button.disabled) return;
        const target = document.getElementById(`pad-letter-${button.dataset.letter}`);
        if (!target) return;
        setActiveAlphabetLetter(button.dataset.letter);
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      /* Tapping an 11px letter one-handed in a moving truck is a coin flip.
         Drag-scrubbing the rail — the iOS Contacts gesture — jumps as the
         finger moves and shows a large preview of the current letter, so the
         letter is confirmed before the finger lifts. Tap still works. */
      const bubble = document.getElementById("alphabetScrubBubble");
      let scrubbing = false;
      let lastScrubLetter = "";

      const scrubTo = clientY => {
        const box = rail.getBoundingClientRect();
        const button = document.elementFromPoint(box.left + box.width / 2, clientY)?.closest?.("button[data-letter]");
        if (!button || button.disabled) return;
        const letter = button.dataset.letter;
        if (letter === lastScrubLetter) return;
        lastScrubLetter = letter;
        if (bubble) { bubble.textContent = letter; bubble.classList.add("show"); }
        const target = document.getElementById(`pad-letter-${letter}`);
        if (!target) return;
        setActiveAlphabetLetter(letter);
        target.scrollIntoView({ behavior: "auto", block: "start" });
      };

      const endScrub = () => {
        if (!scrubbing) return;
        scrubbing = false;
        lastScrubLetter = "";
        rail.classList.remove("scrubbing");
        bubble?.classList.remove("show");
      };

      rail.addEventListener("touchstart", event => {
        if (!event.target.closest("button[data-letter]")) return;
        scrubbing = true;
        rail.classList.add("scrubbing");
        scrubTo(event.touches[0].clientY);
      }, { passive: true });

      rail.addEventListener("touchmove", event => {
        if (!scrubbing) return;
        event.preventDefault();
        scrubTo(event.touches[0].clientY);
      }, { passive: false });

      rail.addEventListener("touchend", endScrub);
      rail.addEventListener("touchcancel", endScrub);

      if (window.__brineAlphabetScrollHandler) {
        window.removeEventListener("scroll", window.__brineAlphabetScrollHandler);
        window.removeEventListener("resize", window.__brineAlphabetScrollHandler);
      }

      let alphabetScrollFrame = 0;
      window.__brineAlphabetScrollHandler = () => {
        if (alphabetScrollFrame) return;
        alphabetScrollFrame = requestAnimationFrame(() => {
          alphabetScrollFrame = 0;
          syncAlphabetRailToScroll();
        });
      };

      window.addEventListener("scroll", window.__brineAlphabetScrollHandler, { passive: true });
      window.addEventListener("resize", window.__brineAlphabetScrollHandler, { passive: true });
      requestAnimationFrame(syncAlphabetRailToScroll);
    }
