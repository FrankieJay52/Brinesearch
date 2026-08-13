    /* GitHub Issue #101 — Owner-only privacy-safe visitor analytics.
       This part intentionally loads after Settings/router definitions and before
       account startup, so the first tracker decision happens only after auth/profile
       restoration has completed. */
    const ISSUE101_VISITOR_ANALYTICS_ROUTE = "#/settings/visitor-analytics";
    const ISSUE101_VISITOR_PRIVACY_ROUTE = "#/settings/privacy";
    const ISSUE101_BEACON_PATH = "/public-visit-beacon";
    const ISSUE101_SESSION_KEY = "brinesearch.analytics.session.v1";
    const ISSUE101_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const ISSUE101_RECENT_LIMIT = 25;
    let issue101LastNavigationKey = "";
    let issue101AnalyticsOffset = 0;
    let issue101AnalyticsStartDate = "";
    let issue101AnalyticsEndDate = "";

    function issue101PrivacySignalEnabled() {
      try {
        if (navigator.globalPrivacyControl === true) return true;
        const values = [navigator.doNotTrack, globalThis.doNotTrack, navigator.msDoNotTrack]
          .map(value => String(value ?? "").trim().toLowerCase());
        return values.some(value => value === "1" || value === "yes");
      } catch {
        return true;
      }
    }

    function issue101SessionId() {
      try {
        const existing = sessionStorage.getItem(ISSUE101_SESSION_KEY) || "";
        if (ISSUE101_UUID_V4.test(existing)) return existing.toLowerCase();
        if (typeof crypto?.randomUUID !== "function") return null;
        const created = crypto.randomUUID();
        if (!ISSUE101_UUID_V4.test(created)) return null;
        sessionStorage.setItem(ISSUE101_SESSION_KEY, created);
        return created.toLowerCase();
      } catch {
        return null;
      }
    }

    function issue101NavigationKey() {
      try {
        const raw = String(location.hash || "#/home").split("?")[0].split("#?")[0];
        return raw.slice(0, 300);
      } catch {
        return "#/home";
      }
    }

    function issue101SanitizedRoute() {
      let raw = "";
      try { raw = decodeURIComponent(String(location.hash || "").replace(/^#\/?/, "").split("?")[0]); }
      catch { raw = String(location.hash || "").replace(/^#\/?/, "").split("?")[0]; }
      const parts = raw.split("/").filter(Boolean).map(part => part.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 72));
      if (!parts.length) return "/home";
      const root = String(parts[0] || "").toLowerCase();
      const staticSecond = String(parts[1] || "").toLowerCase();

      // Dynamic identifiers and user/profile/post details are deliberately collapsed.
      if (root === "pad") return "/pad";
      if (root === "company") return "/company";
      if (root === "feed") {
        if (["notifications", "rules", "moderation", "profile", "search"].includes(staticSecond)) return `/feed/${staticSecond}`;
        return "/feed";
      }
      if (root === "settings") {
        const allowed = new Set([
          "access", "database", "editor-activity", "editor-tools", "data-sources", "copyright",
          "verification", "roads", "install", "visitor-analytics", "privacy"
        ]);
        return staticSecond && allowed.has(staticSecond) ? `/settings/${staticSecond}` : "/settings";
      }
      if (root === "quality") {
        return ["missing-gps", "missing-directions", "field-check", "unverified"].includes(staticSecond)
          ? `/quality/${staticSecond}` : "/quality";
      }
      if (["verification", "favorites", "offline", "search", "add-pad", "home"].includes(root)) return `/${root}`;
      return "/other";
    }

    function issue101ReferrerOrigin() {
      try {
        if (!document.referrer) return null;
        const parsed = new URL(document.referrer);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
        return parsed.origin.slice(0, 320);
      } catch {
        return null;
      }
    }

    function issue101MaybeTrackVisit() {
      try {
        // Exclude every signed-in account. This is stricter than the Owner-only
        // requirement and prevents analytics events from being tied to auth state.
        if (editorSession?.access_token) return;
        if (issue101PrivacySignalEnabled()) return;
        const navigationKey = issue101NavigationKey();
        if (navigationKey === issue101LastNavigationKey) return;
        const sessionId = issue101SessionId();
        if (!sessionId) return;
        issue101LastNavigationKey = navigationKey;
        const edgeBase = typeof SECURITY_EDGE_BASE_V174 === "string" ? SECURITY_EDGE_BASE_V174 : "";
        if (!edgeBase) return;
        const body = JSON.stringify({
          session_id: sessionId,
          route: issue101SanitizedRoute(),
          referrer_origin: issue101ReferrerOrigin(),
        });
        void fetch(`${edgeBase}${ISSUE101_BEACON_PATH}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body,
          keepalive: true,
          credentials: "omit",
          cache: "no-store",
        }).catch(() => {});
      } catch {
        // Analytics must never interfere with startup, routing, offline use, or pages.
      }
    }

    function issue101ScheduleVisitTracking() {
      try { queueMicrotask(() => issue101MaybeTrackVisit()); }
      catch { try { setTimeout(issue101MaybeTrackVisit, 0); } catch {} }
    }

    function issue101TodayIso() {
      try {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
        }).formatToParts(new Date());
        const get = type => parts.find(part => part.type === type)?.value || "";
        return `${get("year")}-${get("month")}-${get("day")}`;
      } catch {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      }
    }

    function issue101ShiftIso(iso, deltaDays) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
      if (!match) return issue101TodayIso();
      const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(deltaDays || 0)));
      return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
    }

    function issue101ClampRange(start, end) {
      const today = issue101TodayIso();
      let safeEnd = /^\d{4}-\d{2}-\d{2}$/.test(end || "") ? end : today;
      if (safeEnd > today) safeEnd = today;
      let safeStart = /^\d{4}-\d{2}-\d{2}$/.test(start || "") ? start : issue101ShiftIso(safeEnd, -6);
      if (safeStart > safeEnd) safeStart = safeEnd;
      const minStart = issue101ShiftIso(safeEnd, -89);
      if (safeStart < minStart) safeStart = minStart;
      return [safeStart, safeEnd];
    }

    function issue101FormatTimestamp(value) {
      if (!value) return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
      try {
        return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      } catch { return date.toLocaleString(); }
    }

    function issue101Metric(value) {
      const number = Number(value || 0);
      return Number.isFinite(number) ? number.toLocaleString() : "0";
    }

    function issue101SettingButton(icon, title, detail, route, marker) {
      const host = document.createElement("div");
      host.innerHTML = settingsRow(icon, title, detail, `data-issue101-settings-route="${esc(route)}" data-issue101-row="${esc(marker)}"`);
      const button = host.firstElementChild;
      if (button) button.onclick = () => { location.hash = route; };
      return button;
    }

    function issue101EnhanceSettings() {
      try {
        const sections = [...document.querySelectorAll(".settings-section")];
        const legalSection = sections.find(section => /rules and legal/i.test(section.querySelector("h2")?.textContent || ""));
        const legalList = legalSection?.querySelector(".settings-list");
        if (legalList && !legalList.querySelector('[data-issue101-row="privacy"]')) {
          const privacy = issue101SettingButton("🔒", "Visitor Analytics Privacy", "What limited anonymous visit data BrineSearch keeps and why", ISSUE101_VISITOR_PRIVACY_ROUTE, "privacy");
          if (privacy) legalList.appendChild(privacy);
        }

        if (!settingsRoleInfo().isOwner) return;
        const ownerSection = sections.find(section => /owner controls/i.test(section.querySelector("h2")?.textContent || ""));
        const ownerList = ownerSection?.querySelector(".settings-list");
        if (ownerList && !ownerList.querySelector('[data-issue101-row="analytics"]')) {
          const analytics = issue101SettingButton("📊", "Visitor Analytics", "Private visits, estimated networks, routes, referrers and device trends", ISSUE101_VISITOR_ANALYTICS_ROUTE, "analytics");
          if (analytics) ownerList.appendChild(analytics);
        }
      } catch {
        // Settings still works if analytics presentation cannot be added.
      }
    }

    function issue101RenderBreakdown(title, rows, key, label = key) {
      const data = Array.isArray(rows) ? rows : [];
      return `<section class="va-panel"><h2>${esc(title)}</h2><div class="va-breakdown">${data.length ? data.map(row => `
        <div class="va-breakdown-row"><span>${esc(row?.[key] || "Unknown")}</span><strong>${esc(issue101Metric(row?.visits))}</strong><small>visits</small></div>
      `).join("") : `<p class="va-empty">No ${esc(label)} data in this range.</p>`}</div></section>`;
    }

    function issue101RenderDashboard(data) {
      const summary = data?.summary || {};
      const daily = Array.isArray(data?.daily) ? data.daily : [];
      const routes = Array.isArray(data?.top_routes) ? data.top_routes : [];
      const referrers = Array.isArray(data?.top_referrers) ? data.top_referrers : [];
      const recent = Array.isArray(data?.recent) ? data.recent : [];
      const maxDaily = Math.max(1, ...daily.map(row => Number(row?.visits || 0)));
      const total = Number(summary.recent_total || 0);
      const offset = Number(data?.offset || 0);
      const limit = Number(data?.limit || ISSUE101_RECENT_LIMIT);
      const start = String(summary.start_date || issue101AnalyticsStartDate || "");
      const end = String(summary.end_date || issue101AnalyticsEndDate || "");
      issue101AnalyticsStartDate = start;
      issue101AnalyticsEndDate = end;
      issue101AnalyticsOffset = offset;

      const host = document.getElementById("visitorAnalyticsResults");
      if (!host) return;
      host.innerHTML = `
        <section class="va-summary-grid" aria-label="Visitor analytics totals">
          <div class="va-stat"><strong>${esc(issue101Metric(summary.visits_today))}</strong><span>Visits today</span></div>
          <div class="va-stat"><strong>${esc(issue101Metric(summary.visits_7d))}</strong><span>Visits · 7 days</span></div>
          <div class="va-stat"><strong>${esc(issue101Metric(summary.visits_30d))}</strong><span>Visits · 30 days</span></div>
          <div class="va-stat accent"><strong>${esc(issue101Metric(summary.selected_visits))}</strong><span>Selected range</span></div>
          <div class="va-stat"><strong>${esc(issue101Metric(summary.estimated_unique_networks))}</strong><span>Est. unique networks</span></div>
          <div class="va-stat"><strong>${esc(issue101Metric(summary.sessions))}</strong><span>Sessions</span></div>
          <div class="va-stat"><strong>${esc(issue101Metric(summary.new_sessions))}</strong><span>New sessions</span></div>
          <div class="va-stat"><strong>${esc(issue101Metric(summary.returning_sessions))}</strong><span>Returning sessions</span></div>
        </section>
        <section class="va-panel">
          <div class="va-panel-head"><div><h2>Daily visit trend</h2><p>${esc(start)} through ${esc(end)}</p></div></div>
          <div class="va-trend" role="img" aria-label="Daily visits bar chart">${daily.map(row => {
            const visits = Number(row?.visits || 0);
            const height = Math.max(visits ? 8 : 2, Math.round((visits / maxDaily) * 100));
            return `<div class="va-trend-day" title="${esc(row?.day || "")} · ${esc(issue101Metric(visits))} visits"><span class="va-trend-count">${esc(issue101Metric(visits))}</span><span class="va-trend-bar"><i style="height:${height}%"></i></span><small>${esc(String(row?.day || "").slice(5))}</small></div>`;
          }).join("")}</div>
        </section>
        <div class="va-two-column">
          <section class="va-panel"><h2>Top pages / routes</h2><div class="va-ranked">${routes.length ? routes.map(row => `<div><span>${esc(row.route || "/")}</span><strong>${esc(issue101Metric(row.visits))}</strong><small>${esc(issue101Metric(row.estimated_unique_networks))} est. networks</small></div>`).join("") : '<p class="va-empty">No route data in this range.</p>'}</div></section>
          <section class="va-panel"><h2>Top referrer origins</h2><div class="va-ranked">${referrers.length ? referrers.map(row => `<div><span>${esc(row.referrer || "Direct / unavailable")}</span><strong>${esc(issue101Metric(row.visits))}</strong><small>${esc(issue101Metric(row.estimated_unique_networks))} est. networks</small></div>`).join("") : '<p class="va-empty">No referrer data in this range.</p>'}</div></section>
        </div>
        <div class="va-breakdown-grid">
          ${issue101RenderBreakdown("Device", data?.devices, "device_family", "device")}
          ${issue101RenderBreakdown("Browser", data?.browsers, "browser_family", "browser")}
          ${issue101RenderBreakdown("Operating system", data?.operating_systems, "os_family", "OS")}
          ${issue101RenderBreakdown("Country", data?.countries, "country", "country")}
        </div>
        <section class="va-panel">
          <div class="va-panel-head"><div><h2>Recent visits</h2><p>Only pseudonymous, coarse fields are shown.</p></div><span>${esc(issue101Metric(total))} events</span></div>
          <div class="va-recent-head" aria-hidden="true"><span>Time</span><span>Page</span><span>Network</span><span>Device</span><span>Referrer</span></div>
          <div class="va-recent-list">${recent.length ? recent.map(row => `<article class="va-recent-row">
            <span data-label="Time">${esc(issue101FormatTimestamp(row.occurred_at))}</span>
            <span data-label="Page"><strong>${esc(row.route || "/")}</strong><small>${esc(row.country_code || "—")}</small></span>
            <span data-label="Network"><strong>${esc(row.visitor_code || "—")}</strong><small>${esc(row.network_prefix || "—")}</small></span>
            <span data-label="Device"><strong>${esc(row.device_family || "other")}</strong><small>${esc([row.browser_family, row.os_family].filter(Boolean).join(" · ") || "—")}</small></span>
            <span data-label="Referrer">${esc(row.referrer_host || "Direct / unavailable")}</span>
          </article>`).join("") : '<p class="va-empty">No visits in this range.</p>'}</div>
          <div class="va-pagination"><button class="btn ghost small" id="visitorAnalyticsPrev" type="button" ${offset <= 0 ? "disabled" : ""}>← Newer</button><span>${total ? `${offset + 1}–${Math.min(offset + limit, total)} of ${total}` : "0 events"}</span><button class="btn ghost small" id="visitorAnalyticsNext" type="button" ${offset + limit >= total ? "disabled" : ""}>Older →</button></div>
        </section>`;
      document.getElementById("visitorAnalyticsPrev")?.addEventListener("click", () => issue101LoadAnalytics(Math.max(0, offset - limit)));
      document.getElementById("visitorAnalyticsNext")?.addEventListener("click", () => issue101LoadAnalytics(offset + limit));
    }

    async function issue101LoadAnalytics(offset = 0) {
      const status = document.getElementById("visitorAnalyticsStatus");
      const refresh = document.getElementById("visitorAnalyticsRefresh");
      if (!editorSession?.access_token || !editorIsOwner()) return;
      const startInput = document.getElementById("visitorAnalyticsStart");
      const endInput = document.getElementById("visitorAnalyticsEnd");
      const [start, end] = issue101ClampRange(startInput?.value || issue101AnalyticsStartDate, endInput?.value || issue101AnalyticsEndDate);
      issue101AnalyticsStartDate = start;
      issue101AnalyticsEndDate = end;
      if (startInput) startInput.value = start;
      if (endInput) endInput.value = end;
      if (status) status.textContent = "Refreshing private analytics…";
      if (refresh) refresh.disabled = true;
      try {
        const data = await editorRequest("/rest/v1/rpc/owner_visitor_analytics_issue101", {
          method: "POST",
          body: JSON.stringify({ p_start_date: start, p_end_date: end, p_limit: ISSUE101_RECENT_LIMIT, p_offset: Math.max(0, Number(offset || 0)) }),
        });
        issue101RenderDashboard(data || {});
        if (status) status.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      } catch (error) {
        const host = document.getElementById("visitorAnalyticsResults");
        if (host) host.innerHTML = `<section class="va-panel va-error"><strong>Could not load Visitor Analytics</strong><p>${esc(error?.message || "Try again.")}</p></section>`;
        if (status) status.textContent = "Refresh failed";
      } finally {
        if (refresh) refresh.disabled = false;
      }
    }

    function issue101ApplyPreset(days) {
      const safeDays = Math.max(1, Math.min(Number(days || 7), 90));
      const end = issue101TodayIso();
      const start = issue101ShiftIso(end, -(safeDays - 1));
      const startInput = document.getElementById("visitorAnalyticsStart");
      const endInput = document.getElementById("visitorAnalyticsEnd");
      if (startInput) startInput.value = start;
      if (endInput) endInput.value = end;
      issue101AnalyticsStartDate = start;
      issue101AnalyticsEndDate = end;
      issue101AnalyticsOffset = 0;
      void issue101LoadAnalytics(0);
    }

    function renderVisitorAnalyticsSettings() {
      document.title = "Visitor Analytics · BrineSearch";
      if (!requireOwnerSettingsPage("Visitor Analytics")) return;
      const today = issue101TodayIso();
      const min = issue101ShiftIso(today, -89);
      const defaultStart = issue101AnalyticsStartDate || issue101ShiftIso(today, -6);
      const defaultEnd = issue101AnalyticsEndDate || today;
      app.innerHTML = `<main class="visitor-analytics-page">
        <section class="va-hero"><div><span class="va-owner-badge">Owner only</span><h1>Visitor Analytics</h1><p>Private, privacy-safe usage estimates for BrineSearch.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section>
        <section class="va-notice"><strong>Networks are not people.</strong> IP-based counts estimate networks. Shared Wi-Fi, carrier NAT, VPNs, bots, and changing addresses can combine or split visitors. “New” means first seen in the retained 90-day window.</section>
        <section class="va-controls" aria-label="Visitor analytics date controls">
          <div class="va-presets" role="group" aria-label="Date presets"><button type="button" data-va-days="1">Today</button><button type="button" data-va-days="7">7 days</button><button type="button" data-va-days="30">30 days</button><button type="button" data-va-days="90">90 days</button></div>
          <label><span>Start</span><input id="visitorAnalyticsStart" type="date" min="${esc(min)}" max="${esc(today)}" value="${esc(defaultStart)}"></label>
          <label><span>End</span><input id="visitorAnalyticsEnd" type="date" min="${esc(min)}" max="${esc(today)}" value="${esc(defaultEnd)}"></label>
          <button class="btn primary" id="visitorAnalyticsRefresh" type="button">Refresh</button>
          <span class="va-status" id="visitorAnalyticsStatus" role="status" aria-live="polite">Loading…</span>
        </section>
        <div id="visitorAnalyticsResults"><section class="va-panel"><p class="va-empty">Loading private analytics…</p></section></div>
        <section class="va-privacy-link"><a href="${ISSUE101_VISITOR_PRIVACY_ROUTE}">Read the Visitor Analytics privacy disclosure →</a></section>
      </main>`;
      document.querySelectorAll("[data-va-days]").forEach(button => button.addEventListener("click", () => issue101ApplyPreset(button.dataset.vaDays)));
      document.getElementById("visitorAnalyticsRefresh")?.addEventListener("click", () => { issue101AnalyticsOffset = 0; void issue101LoadAnalytics(0); });
      void issue101LoadAnalytics(issue101AnalyticsOffset);
    }

    function renderVisitorAnalyticsPrivacy() {
      document.title = "Visitor Analytics Privacy · BrineSearch";
      app.innerHTML = `<main class="visitor-privacy-page">
        <section class="va-hero"><div><span class="va-owner-badge public">Public disclosure</span><h1>Visitor Analytics Privacy</h1><p>What BrineSearch records for anonymous visit analytics—and what it deliberately does not.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section>
        <section class="va-privacy-card"><h2>Purpose</h2><p>BrineSearch uses limited anonymous visit analytics to understand overall traffic, commonly used pages, broad device compatibility, and where visits originate. There is no third-party analytics or IP-lookup service.</p></section>
        <section class="va-privacy-card"><h2>What is kept</h2><p>For anonymous visits only, the analytics system may keep: a random sessionStorage UUID for the current browser session, a sanitized page route, referrer hostname/origin, gateway-supplied country code, coarse mobile/tablet/desktop category, coarse browser and operating-system families, a timestamp, a masked network prefix, and a keyed HMAC-SHA256 pseudonymous network identifier represented to the Owner by a short visitor code.</p></section>
        <section class="va-privacy-card"><h2>What is not kept</h2><p>The analytics table never stores raw IP addresses, full user-agent strings, full referrer URLs, query strings, names, email addresses, account IDs, GPS coordinates, or browser fingerprints. Analytics events are not associated with authenticated BrineSearch users, and signed-in Owner visits are excluded.</p></section>
        <section class="va-privacy-card"><h2>Network masking</h2><p>The hosting gateway must necessarily receive a network address to deliver a request. Inside the analytics Edge Function, that address is reduced in memory to an IPv4 /24 or IPv6 /48 network prefix. Only the masked prefix and a keyed HMAC of that network are sent to the private analytics database; the raw address is never sent to the analytics table or displayed.</p></section>
        <section class="va-privacy-card"><h2>Retention and access</h2><p>Raw pseudonymous analytics events have a 90-day retention window. Expired events are excluded from every dashboard query and pruned in bounded batches when analytics events are recorded or the dashboard is viewed. Direct table access is locked down; only the signed-in BrineSearch Owner can read the dashboard through its Owner-checked database function.</p></section>
        <section class="va-privacy-card"><h2>Privacy signals</h2><p>BrineSearch honors Global Privacy Control and Do Not Track for this analytics beacon when the browser provides those signals. If analytics is unavailable or blocked, BrineSearch continues working normally.</p></section>
        <section class="va-privacy-card"><h2>Limits of the estimate</h2><p>IP addresses identify network connections, not individual people. Shared home or work Wi-Fi, carrier NAT, VPNs, bots, and changing addresses can make several people appear as one network or one person appear as several networks. Visitor totals should therefore be treated as estimates.</p></section>
      </main>`;
    }

    const issue101BaseRenderSettings = renderSettings;
    renderSettings = function issue101RenderSettingsWrapper(...args) {
      const result = issue101BaseRenderSettings(...args);
      issue101EnhanceSettings();
      return result;
    };

    const issue101BaseRouter = router;
    router = function issue101RouterWrapper(...args) {
      const route = String(location.hash || "").toLowerCase().split("?")[0];
      if (route === ISSUE101_VISITOR_ANALYTICS_ROUTE) {
        renderVisitorAnalyticsSettings();
        issue101ScheduleVisitTracking();
        return;
      }
      if (route === ISSUE101_VISITOR_PRIVACY_ROUTE) {
        renderVisitorAnalyticsPrivacy();
        issue101ScheduleVisitTracking();
        return;
      }
      const result = issue101BaseRouter(...args);
      issue101ScheduleVisitTracking();
      return result;
    };