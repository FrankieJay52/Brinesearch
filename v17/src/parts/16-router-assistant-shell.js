    function renderInstallGuideSettings(){
      document.title="Install BrineSearch · Settings";
      const detected=detectInstallDeviceAndBrowser();
      let device=localStorage.getItem("brinesearch_install_device")||detected.device;
      if(!INSTALL_GUIDES[device]) device=detected.device;
      let browser=localStorage.getItem(`brinesearch_install_browser_${device}`)||detected.browser;
      if(!INSTALL_GUIDES[device].browsers[browser]) browser=Object.keys(INSTALL_GUIDES[device].browsers)[0];
      const installed=window.matchMedia?.("(display-mode: standalone)")?.matches||window.navigator.standalone===true;
      app.innerHTML=`<main class="install-guide-page">
        <a class="btn ghost small install-guide-back" href="#/settings"><span class="fm-icon fm-back"></span> Settings</a>
        <section class="install-guide-hero">
          <span class="install-guide-hero-icon"><span class="fm-icon fm-download"></span></span>
          <div><h1>Add BrineSearch to your Home Screen</h1><p>Choose your phone and browser. BrineSearch will show only the instructions that match.</p></div>
          <div class="install-guide-detected" id="installDetected">Detected on this device: <strong>${esc(INSTALL_GUIDES[detected.device].label)} · ${esc(INSTALL_GUIDES[detected.device].browsers[detected.browser]?.label||"Browser")}</strong>. You can change either choice below.</div>
        </section>
        <section class="install-guide-card">
          <h2>1. What phone do you have?</h2>
          <div class="install-choice-grid" id="installDeviceChoices" role="group" aria-label="Choose phone type"></div>
          <div class="install-guide-subtitle">2. What browser are you using?</div>
          <div class="install-choice-grid browser-grid" id="installBrowserChoices" role="group" aria-label="Choose browser"></div>
        </section>
        <section class="install-instructions" id="installInstructions" aria-live="polite"></section>
        ${installed?`<div class="install-guide-installed"><span class="fm-icon fm-check"></span> BrineSearch is already running as an installed app on this device.</div>`:""}
      </main>`;
      const deviceHost=document.getElementById("installDeviceChoices");
      const browserHost=document.getElementById("installBrowserChoices");
      const instructions=document.getElementById("installInstructions");
      const draw=()=>{
        deviceHost.innerHTML=Object.entries(INSTALL_GUIDES).map(([key,item])=>`<button type="button" class="install-choice ${key===device?"active":""}" data-install-device="${key}" aria-pressed="${key===device}">${esc(item.label)}</button>`).join("");
        browserHost.innerHTML=Object.entries(INSTALL_GUIDES[device].browsers).map(([key,item])=>`<button type="button" class="install-choice ${key===browser?"active":""}" data-install-browser="${key}" aria-pressed="${key===browser}">${esc(item.label)}</button>`).join("");
        const guide=INSTALL_GUIDES[device].browsers[browser];
        instructions.innerHTML=`<div class="install-instructions-head"><h2>${esc(guide.title)}</h2><span class="install-browser-badge">${esc(INSTALL_GUIDES[device].label)} · ${esc(guide.label)}</span></div><ol class="install-step-list">${guide.steps.map(([title,copy])=>`<li class="install-step"><div><strong>${esc(title)}</strong><span>${esc(copy)}</span></div></li>`).join("")}</ol><div class="install-guide-note"><strong>Good to know:</strong> ${esc(guide.note)}</div>`;
        deviceHost.querySelectorAll("[data-install-device]").forEach(btn=>btn.onclick=()=>{device=btn.dataset.installDevice;localStorage.setItem("brinesearch_install_device",device);browser=localStorage.getItem(`brinesearch_install_browser_${device}`)||((device===detected.device&&INSTALL_GUIDES[device].browsers[detected.browser])?detected.browser:Object.keys(INSTALL_GUIDES[device].browsers)[0]);if(!INSTALL_GUIDES[device].browsers[browser])browser=Object.keys(INSTALL_GUIDES[device].browsers)[0];draw();});
        browserHost.querySelectorAll("[data-install-browser]").forEach(btn=>btn.onclick=()=>{browser=btn.dataset.installBrowser;localStorage.setItem(`brinesearch_install_browser_${device}`,browser);draw();});
      };
      draw();
    }

    function renderSettings() {
      document.title = "Settings · BrineSearch";
      const r=settingsRoleInfo();
      const theme=document.documentElement.getAttribute("data-theme")==="day"?"day":"night";
      const account = r.signedIn ? `
        ${settingsRow(`<span class="fm-icon fm-profile"></span>`,"My profile","Real name, username, company, role, bio, photo and activity",'data-settings-route="#/feed/profile"')}
        ${settingsRow(`<span class="fm-icon fm-notify"></span>`,"Notifications","Replies, role changes and moderation updates",'data-settings-route="#/feed/notifications"')}
        ${settingsRow(`<span class="fm-icon fm-locked"></span>`,"Account and sign-in","Password reset, access status and sign out",'data-settings-action="account"')}
      ` : `${settingsRow(`<span class="fm-icon fm-locked"></span>`,"Log in or sign up","Create a profile, post updates and request editing access",'data-settings-action="login"')}`;
      const editing = r.canEdit ? `<section class="settings-section"><h2>Editing</h2><div class="settings-list">
        ${settingsRow(`<span class="fm-icon fm-edit"></span>`,"Editor tools","Your editing access, personal activity and pad tools",'data-settings-route="#/settings/editor-tools"')}
        ${settingsRow(`<span class="fm-icon fm-verified"></span>`,"Verification review","Review official pad matches and database corrections",'data-settings-route="#/verification"')}
      </div></section>` : "";
      const moderation = r.canModerate ? `<section class="settings-section"><h2>Moderation</h2><div class="settings-list">
        ${settingsRow(`<span class="fm-icon fm-role-moderator"></span>`,"Moderator dashboard","Reports, hidden content, suspensions and moderation history",'data-settings-route="#/feed/moderation"')}
      </div></section>` : "";
      const owner = r.isOwner ? `<section class="settings-section"><h2>Owner controls <span class="settings-attention" title="Owner-only"></span></h2><p class="settings-owner-note">Each owner tool opens on its own page.</p><div class="settings-list">
        ${settingsRow(`<span class="fm-icon fm-role-owner"></span>`,"User account access","View users and choose their permissions",'data-settings-route="#/settings/access"')}
        ${settingsRow(`<span class="fm-icon fm-signal"></span>`,"Database health","Pad totals, missing GPS, missing directions and quality warnings",'data-settings-route="#/settings/database"')}
        ${settingsRow(`<span class="fm-icon fm-sync"></span>`,"Editor activity","Successful changes, failed attempts and recent saved edits",'data-settings-route="#/settings/editor-activity"')}
        ${settingsRow(`<span class="fm-icon fm-verified"></span>`,"Data quality review","Official verification, conflicts and missing public records",'data-settings-route="#/verification"')}
        ${settingsRow(`<span class="fm-icon fm-report"></span>`,"Community control center","Reports, user actions and moderation audit history",'data-settings-route="#/feed/moderation"')}
      </div></section>` : "";
      app.innerHTML=`<main class="settings-page">
        <section class="settings-hero"><div><h1>Settings</h1><p>Account, app, directory and role-specific controls.</p></div><span class="settings-role">${r.icon} ${esc(r.label)}</span></section>
        <section class="settings-section"><h2>Account</h2><div class="settings-list">${account}</div></section>
        <section class="settings-section"><h2>Directory tools</h2><div class="settings-list">
          ${settingsRow(`<span class="fm-icon fm-add"></span>`,"Add a pad","Submit a new pad or disposal location to BrineSearch",'data-settings-action="addpad"')}
        </div></section>
        <section class="settings-section"><h2>App and offline access</h2><div class="settings-list">
          ${settingsRow(`<span class="fm-icon fm-download"></span>`,"Add BrineSearch to Home Screen","Choose iPhone or Android and get instructions for your browser",'data-settings-route="#/settings/install"')}
          ${settingsRow(`<span class="fm-icon fm-offline"></span>`,"Offline Mode","Favorites and the last 10 opened pads available with weak or no service",'data-settings-route="#/offline"')}
        </div></section>
        <section class="settings-section"><h2>Appearance</h2><div class="settings-choice" id="settingsThemeChoices"><button data-theme-choice="night" class="${theme==='night'?'active':''}">🌙 Dark</button><button data-theme-choice="day" class="${theme==='day'?'active':''}">☀ Daylight</button></div></section>
        ${editing}${moderation}${owner}
        <section class="settings-section"><h2>Rules and legal</h2><div class="settings-list">
          ${settingsRow(`<span class="fm-icon fm-info"></span>`,"Data Sources & Provenance","Where BrineSearch information comes from and how to report concerns",'data-settings-route="#/settings/data-sources"')}
          ${settingsRow(`<span class="fm-icon fm-legal"></span>`,"Copyright & Content Concerns","Report inaccurate, disputed, or potentially infringing content",'data-settings-route="#/settings/copyright"')}
          ${settingsRow(`<span class="fm-icon fm-verified"></span>`,"Data Verification","Understand GPS, community, editor, and review statuses",'data-settings-route="#/settings/verification"')}
          ${settingsRow(`<span class="fm-icon fm-terms"></span>`,"Community Rules","Real names, respectful conduct, no personal attacks or company bashing",'data-settings-route="#/feed/rules"')}
          ${settingsRow(`<span class="fm-icon fm-legal"></span>`,"Terms and disclaimer","Independent platform, user-content and employer-affiliation terms",'data-settings-route="#/feed/rules"')}
        </div></section>
        ${r.signedIn?`<section class="settings-section"><button class="settings-signout" id="settingsSignOutBtn" type="button">Sign out of BrineSearch</button></section>`:""}
        <div class="settings-version"><span>BrineSearch V 17.3</span><span>${r.signedIn?esc(r.label):"Public access"}</span></div>
      </main>`;
      document.querySelectorAll("[data-settings-route]").forEach(btn=>btn.onclick=()=>{ location.hash=btn.dataset.settingsRoute; });
      document.querySelectorAll("[data-settings-action]").forEach(btn=>btn.onclick=()=>{
        const a=btn.dataset.settingsAction;
        if(a==="login"||a==="account") openEditorAuth();
        if(a==="addpad") openAddPad();
      });
      document.getElementById("settingsSignOutBtn")?.addEventListener("click", async()=>{
        await signOutEditor();
        renderSettings();
      });
      document.querySelectorAll("[data-theme-choice]").forEach(btn=>btn.onclick=()=>{
        const desired=btn.dataset.themeChoice;
        const current=document.documentElement.getAttribute("data-theme")==="day"?"day":"night";
        if(desired!==current) document.getElementById("themeToggleBtn")?.click();
        renderSettings();
      });
    }

    function renderOfflineMode() {
      document.title = "Offline Mode · BrineSearch";
      refreshOfflinePadCache();
      const cache = readOfflinePadCache();
      const entries = Object.entries(cache).map(([id, entry]) => ({ id, ...entry })).sort((a,b) => new Date(b.cachedAt||0)-new Date(a.cachedAt||0));
      const favoriteCount = entries.filter(x => (x.reasons||[]).includes("favorite")).length;
      const recentCount = entries.filter(x => (x.reasons||[]).includes("recent")).length;
      const lastRefresh = localStorage.getItem("brinesearch.offlineLastRefresh.v1");
      app.innerHTML = `<main class="offline-page"><a class="feed-secondary" href="#/">‹ Home</a>
        <section class="offline-card"><span class="offline-copy-badge">● Offline Mode On</span><h1 style="margin-top:9px">Available when service disappears</h1><p>BrineSearch quietly keeps every Favorite pad and the last ${OFFLINE_RECENT_LIMIT} pads opened on this phone. BrineSearch saves these copies only after they have been favorited or opened. Cached information is a fallback and may be older than the live directory.</p>
        <div class="offline-status-grid"><div class="offline-stat"><strong>${entries.length}</strong><small>Pads stored</small></div><div class="offline-stat"><strong>${favoriteCount}</strong><small>Favorites</small></div><div class="offline-stat"><strong>${recentCount}</strong><small>Recently opened</small></div><div class="offline-stat"><strong>${formatOfflineBytes(offlineStorageBytes())}</strong><small>Pad-data storage</small></div></div>
        <p class="offline-note"><strong>Last refreshed:</strong> ${lastRefresh ? new Date(lastRefresh).toLocaleString() : "Not yet"}</p>
        <div class="offline-actions"><button id="offlineRefreshBtn">Refresh offline data</button><button class="danger" id="offlineClearBtn">Clear offline data</button></div></section>
        <section class="offline-card"><h2>What is kept</h2><p>Pad name, company, county, township/city, state, address, GPS, written directions, road sequence, wells, API numbers, property numbers, and saved field notes.</p><p>Favorites remain stored while they are favorited. Recently opened pads rotate automatically as newer pads are viewed.</p><p class="offline-note">When offline, BrineSearch shows the saved copy and its last update time. Turn-by-turn maps may still require Apple Maps or Google Maps coverage already stored on the phone.</p></section>
        <section class="offline-card"><h2>Stored pads</h2><div class="offline-list">${entries.length ? entries.map(entry => { const pad=entry.pad||{}; const label=[pad.county,pad.township,pad.state].filter(Boolean).join(" · "); return `<a class="offline-pad-row" href="#/pad/${encodeURIComponent(entry.id)}"><span><strong>${esc(display(pad.padName))}</strong><small>${esc(display(pad.company))}${label?` · ${esc(label)}`:""}</small></span><small>${(entry.reasons||[]).includes("favorite")?"★ Favorite":"Recent"}<br>${entry.cachedAt?esc(new Date(entry.cachedAt).toLocaleDateString()):""}</small></a>`; }).join("") : '<p>No pads are stored yet. Favorite a pad or open a few pad pages while online.</p>'}</div></section></main>`;
      document.getElementById("offlineRefreshBtn").onclick = async () => {
        refreshOfflinePadCache();
        if ("serviceWorker" in navigator) { try { const reg=await navigator.serviceWorker.ready; reg.active?.postMessage({type:"BRINESEARCH_REFRESH_CACHE"}); } catch {} }
        showToast("Offline data refreshed"); renderOfflineMode();
      };
      document.getElementById("offlineClearBtn").onclick = async () => {
        if (!confirm("Clear locally stored offline pad data? Favorites themselves will not be removed.")) return;
        localStorage.removeItem(OFFLINE_PAD_CACHE_KEY); localStorage.removeItem("brinesearch.offlineLastRefresh.v1");
        try { indexedDB.deleteDatabase(OFFLINE_PAD_DB_NAME); } catch {}
        if ("caches" in window) { try { for (const name of await caches.keys()) if (name.startsWith("brinesearch-")) await caches.delete(name); } catch {} }
        showToast("Offline data cleared"); renderOfflineMode();
      };
    }

    function router() {
      document.querySelectorAll(".feed-login-overlay,.feed-pad-search-overlay,.feed-delete-overlay").forEach(element=>element.remove());
      const mobileBackBtn = document.getElementById("mobileBackBtn");
      const currentRoute = location.hash.replace(/^#\/?/, "");
      if (mobileBackBtn) {
        const onHome = !currentRoute;
        mobileBackBtn.disabled = onHome;
        mobileBackBtn.setAttribute("aria-disabled", onHome ? "true" : "false");
        mobileBackBtn.title = onHome ? "Already at home" : "Go back one page";
      }
      document.body.classList.remove("alphabet-rail-active");
      document.body.classList.remove("pad-nav-active");
      if (window.__brineAlphabetScrollHandler) {
        window.removeEventListener("scroll", window.__brineAlphabetScrollHandler);
        window.removeEventListener("resize", window.__brineAlphabetScrollHandler);
        window.__brineAlphabetScrollHandler = null;
      }
      const raw = location.hash.replace(/^#\/?/, "");
      const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);
      // Full-page Settings screens must never remain underneath the account/editor modal.
      if (parts[0] === "settings") closeEditorAuth();
      window.scrollTo({top: 0, behavior: "instant"});
      if (!parts.length) return renderHome();
      if (parts[0] === "settings" && parts[1] === "access") return renderUserAccessSettings();
      if (parts[0] === "settings" && parts[1] === "database") return renderDatabaseHealthSettings();
      if (parts[0] === "settings" && parts[1] === "editor-activity") return renderEditorActivitySettings();
      if (parts[0] === "settings" && parts[1] === "editor-tools") return renderEditorToolsSettings();
      if (parts[0] === "settings" && parts[1] === "data-sources") return renderDataSourcesSettings();
      if (parts[0] === "settings" && parts[1] === "copyright") return renderCopyrightSettings();
      if (parts[0] === "settings" && parts[1] === "verification") return renderDataVerificationSettings();
      if (parts[0] === "settings" && parts[1] === "roads") return renderRoadManagerSettings();
      if (parts[0] === "settings" && parts[1] === "install") return renderInstallGuideSettings();
      if (parts[0] === "settings") return renderSettings();
      if (parts[0] === "favorites") return renderFavorites();
      if (parts[0] === "offline") return renderOfflineMode();
      if (parts[0] === "feed") return renderFieldFeed(parts[1] || "", parts[2] || "");
      if (parts[0] === "verification" || parts[0] === "audit") return renderVerificationReview();
      if (parts[0] === "quality" && parts[1]) return renderQualityPage(parts[1]);
      if (parts[0] === "company" && parts[1] && parts[2] === "state" && parts[3]) {
        return renderCompanyState(parts[1], parts.slice(3).join("/"));
      }
      if (parts[0] === "company" && parts[1]) return renderCompany(parts.slice(1).join("/"));
      if (parts[0] === "pad" && parts[1]) return renderPad(parts.slice(1).join("/"));
      renderNotFound();
    }



    const assistantShell = document.getElementById("assistantShell");
    const assistantMessages = document.getElementById("assistantMessages");
    const assistantInput = document.getElementById("assistantInput");
    const assistantContext = document.getElementById("assistantContext");
    const assistantCurrentCard = document.getElementById("assistantCurrentCard");
    const assistantSuggestions = document.getElementById("assistantSuggestions");
    const assistantRecent = document.getElementById("assistantRecent");
    const assistantVoice = document.getElementById("assistantVoice");
    const ASSISTANT_RECENT_KEY = "brinesearch_assistant_recent_v1";
    let assistantStarted = false;
    let assistantRecognition = null;

    function assistantCurrentPad() {
      const raw = location.hash.replace(/^#\/?/, "");
      const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);
      if (parts[0] === "pad" && parts[1]) return padById(parts.slice(1).join("/"));
      return null;
    }

    function assistantContextText() {
      const p = assistantCurrentPad();
      return p
        ? `Current page: ${display(p.company)} — ${display(p.padName)}`
        : "Searching all saved pads and disposals";
    }

    function assistantRecentQuestions() {
      try { return JSON.parse(localStorage.getItem(ASSISTANT_RECENT_KEY) || "[]").filter(Boolean).slice(0, 6); }
      catch { return []; }
    }

    function saveAssistantRecent(question) {
      const text = String(question || "").trim();
      if (!text) return;
      const next = [text, ...assistantRecentQuestions().filter(item => item.toLowerCase() !== text.toLowerCase())].slice(0, 6);
      localStorage.setItem(ASSISTANT_RECENT_KEY, JSON.stringify(next));
      renderAssistantRecent();
    }

    function renderAssistantRecent() {
      const items = assistantRecentQuestions();
      assistantRecent.classList.toggle("show", items.length > 0);
      assistantRecent.innerHTML = items.map(item => `<button type="button" data-recent-question="${esc(item)}">${esc(item)}</button>`).join("");
    }

    function renderAssistantCurrentCard() {
      const p = assistantCurrentPad();
      assistantCurrentCard.classList.toggle("show", !!p);
      assistantCurrentCard.innerHTML = p ? `<div><strong>Current pad: ${esc(display(p.padName))}</strong><small>${esc(display(p.company))}${has(p.county) ? ` · ${esc(p.county)} County` : ""}</small></div><a href="#/pad/${encodeURIComponent(p._id)}">Open</a>` : "";
    }

    function assistantMatchingPads(value, limit = 6) {
      const q = assistantNormalize(value);
      if (q.length < 2) return [];
      return pads.filter(p => {
        const hay = assistantNormalize([p.padName, p.company, p.county, p.api, p.property, p.wellName].filter(Boolean).join(" "));
        return hay.includes(q);
      }).slice(0, limit);
    }

    function renderAssistantSuggestions(value) {
      const matches = assistantMatchingPads(value);
      assistantSuggestions.classList.toggle("show", matches.length > 0);
      assistantSuggestions.innerHTML = matches.map(p => `<button class="assistant-suggestion" type="button" data-suggestion-pad="${esc(p._id)}"><strong>${esc(display(p.padName))}</strong><small>${esc(display(p.company))}${has(p.county) ? ` · ${esc(p.county)} County` : ""}</small></button>`).join("");
    }

    function assistantShareText(p) {
      const gps = padNavigationGps(p);
      const locationLabel = [cleanGeo(p.county) ? `${cleanGeo(p.county)} County` : "", cleanGeo(p.state)].filter(Boolean).join(", ");
      const padLink = `${window.location.origin}${window.location.pathname}#/pad/${encodeURIComponent(p._id)}`;
      const mapPin = gps ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${gps.latitude},${gps.longitude}`)}` : (has(p.address) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}` : "");
      return [display(p.padName), display(p.company), locationLabel, mapPin ? `Map pin: ${mapPin}` : "", `BrineSearch pad: ${padLink}`].filter(Boolean).join("\n");
    }

    async function runAssistantAction(action) {
      const p = assistantCurrentPad();
      if (action === "disposals") return sendAssistantQuestion("Show disposals");
      if (!p) {
        assistantInput.focus();
        showToast("Open a pad or type its name first");
        return;
      }
      if (action === "gps") return sendAssistantQuestion("What is the GPS on this pad?");
      if (action === "directions") return sendAssistantQuestion("Show directions for this pad");
      if (action === "wells") return sendAssistantQuestion("Show wells on this pad");
      if (action === "api") return sendAssistantQuestion("What is the API on this pad?");
      if (action === "property") return sendAssistantQuestion("What is the property number on this pad?");
      if (action === "navigate") {
        const navigation = googleMapsQuickNavigationIssue97(p);
        if (!navigation) {
          showToast("No navigation location available");
        } else if (navigation.kind === "route_plan") {
          window.location.hash = navigation.href;
          showToast("Open each Google route part in order");
        } else {
          window.open(navigation.href, "_blank", "noopener");
        }
        return;
      }
      if (action === "share") {
        const text = assistantShareText(p);
        try {
          if (navigator.share) await navigator.share({ title: `${display(p.padName)} · BrineSearch`, text });
          else await copyText(text, "Pad link copied");
        } catch (error) { if (error?.name !== "AbortError") await copyText(text, "Pad link copied"); }
      }
    }

    function setupAssistantVoice() {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) { assistantVoice.style.display = "none"; return; }
      assistantRecognition = new Recognition();
      assistantRecognition.lang = "en-US";
      assistantRecognition.interimResults = false;
      assistantRecognition.maxAlternatives = 1;
      assistantRecognition.onstart = () => assistantVoice.classList.add("listening");
      assistantRecognition.onend = () => assistantVoice.classList.remove("listening");
      assistantRecognition.onerror = () => { assistantVoice.classList.remove("listening"); showToast("Voice input unavailable"); };
      assistantRecognition.onresult = event => {
        const text = event.results?.[0]?.[0]?.transcript || "";
        assistantInput.value = text;
        renderAssistantSuggestions(text);
        if (text) sendAssistantQuestion(text);
      };
    }

    function openAssistant() {
      assistantShell.classList.add("open");
      assistantShell.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      assistantContext.textContent = assistantContextText();
      renderAssistantCurrentCard();
      renderAssistantRecent();
      if (!assistantStarted) {
        assistantStarted = true;
        const current = assistantCurrentPad();
        addAssistantMessage(
          "bot",
          current
            ? `<strong>${esc(display(current.padName))}</strong> is the current pad. Use the buttons below or ask for GPS, directions, wells, API, property number, navigation, or sharing.`
            : `<strong>Ask BrineSearch</strong><br>Search pads, directions, wells, API numbers, property numbers, companies, and disposals. You can also type short commands such as <strong>api bella</strong> or <strong>route albatross</strong>.`
        );
      }
      setTimeout(() => assistantInput.focus(), 80);
    }

    function closeAssistant() {
      assistantShell.classList.remove("open");
      assistantShell.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    function addAssistantMessage(role, content) {
      const row = document.createElement("div");
      const tableAnswer = role === "bot" && String(content).includes("chat-well-table");
      row.className = `chat-row ${role}${tableAnswer ? " table-answer" : ""}`;
      row.innerHTML = role === "bot"
        ? `<div class="chat-avatar">✦</div><div class="chat-bubble">${content}</div>`
        : `<div class="chat-bubble">${esc(content)}</div>`;
      assistantMessages.appendChild(row);
      assistantMessages.scrollTop = assistantMessages.scrollHeight;
    }

    function assistantNormalize(value) {
      return normalize(value)
        .toLowerCase()
        .replace(/\bati\b/g, "api")
        .replace(/\bnumber\b/g, "")
        .replace(/[?.,!'"()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function assistantWords(value) {
      return assistantNormalize(value).split(/\s+/).filter(w => w.length > 1);
    }

    function findNumberRecord(question, field) {
      const compactQuestion = compactSearch(question);
      return pads.filter(p => {
        const value = compactSearch(p[field]);
        if (!value) return false;
        const chunks = splitMulti(p[field]).map(compactSearch);
        return chunks.some(chunk => chunk && compactQuestion.includes(chunk)) ||
          (compactQuestion.length >= 6 && value.includes(compactQuestion));
      });
    }

    function recordSearchName(p) {
      return assistantNormalize(`${p.company} ${p.padName}`);
    }

    function findRecordsByName(question) {
      const q = assistantNormalize(question);
      const current = assistantCurrentPad();
      const contextOnly = /\b(this|current|here|it|the pad|this pad|this disposal)\b/.test(q);
      if (current && contextOnly) return [current];

      const exact = pads.filter(p => {
        const padName = assistantNormalize(p.padName);
        const companyName = assistantNormalize(p.company);
        return padName && (
          q.includes(` ${padName} `) ||
          q.endsWith(` ${padName}`) ||
          q.startsWith(`${padName} `) ||
          q === padName ||
          q.includes(`${companyName} ${padName}`)
        );
      });
      if (exact.length) return exact;

      const candidates = pads.map(p => {
        const padName = assistantNormalize(p.padName);
        const companyName = assistantNormalize(p.company);
        let score = 0;
        if (padName && q.includes(padName)) score += 100 + padName.length;
        const qWords = assistantWords(q);
        const padWords = assistantWords(padName);
        score += padWords.filter(w => qWords.includes(w)).length * 18;
        if (companyName && q.includes(companyName)) score += 25;
        return { p, score };
      }).filter(x => x.score > 0).sort((a,b) => b.score - a.score);

      if (!candidates.length && current) return [current];
      const top = candidates[0]?.score || 0;
      return candidates.filter(x => x.score >= Math.max(18, top - 8)).slice(0, 12).map(x => x.p);
    }
