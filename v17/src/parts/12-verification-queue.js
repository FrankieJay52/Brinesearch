

    // ---------- Private owner verification review ----------
    function verificationAuditClass(status) {
      if (/^Verified by official/i.test(status || "")) return "exact";
      if (status === "Strong official match") return "strong";
      if (status === "Likely official match") return "likely";
      if (status === "Possible official match - review") return "possible";
      return "nomatch";
    }

    function verificationReviewLabel(status) {
      return ({
        unreviewed: "Unreviewed",
        approved_correction: "Correction approved",
        keep_saved: "Saved data kept",
        field_check: "Needs field check"
      })[status] || status || "Unreviewed";
    }

    function verificationReviewClass(status) {
      if (status === "field_check") return "field";
      if (status && status !== "unreviewed") return "reviewed";
      return "";
    }

    function verificationValue(value) {
      if (value === null || value === undefined || value === "") return "Not listed";
      if (Array.isArray(value)) return value.length ? value.join(" · ") : "None";
      if (typeof value === "object") return JSON.stringify(value, null, 2);
      return String(value);
    }

    function verificationDataRows(entries) {
      return entries.map(([label, value]) => `
        <div class="verification-data-row">
          <dt>${esc(label)}</dt>
          <dd>${esc(verificationValue(value))}</dd>
        </div>`).join("");
    }

    function verificationOfficialValue(official, keys) {
      for (const key of keys) {
        const value = official?.[key];
        if (value !== null && value !== undefined && String(value).trim() !== "") return value;
      }
      const source = official?.source_record || {};
      for (const key of keys) {
        const value = source?.[key];
        if (value !== null && value !== undefined && String(value).trim() !== "") return value;
      }
      return null;
    }

    function verificationCoordinates(data, official = false) {
      const lat = official
        ? verificationOfficialValue(data, ["official_latitude", "latitude"])
        : data?.latitude;
      const lng = official
        ? verificationOfficialValue(data, ["official_longitude", "longitude"])
        : data?.longitude;
      return lat !== null && lat !== undefined && lng !== null && lng !== undefined
        ? `${lat}, ${lng}`
        : null;
    }

    function verificationCorrectionEntries(suggested = {}) {
      const entries = [];
      if (suggested.county !== null && suggested.county !== undefined && String(suggested.county).trim()) {
        entries.push({ field:"county", label:"County", value:String(suggested.county) });
      }
      if (suggested.township !== null && suggested.township !== undefined && String(suggested.township).trim()) {
        entries.push({ field:"township", label:"Township / municipality", value:String(suggested.township) });
      }
      if (suggested.candidate_api !== null && suggested.candidate_api !== undefined && String(suggested.candidate_api).trim()) {
        entries.push({ field:"api", label:"API number", value:String(suggested.candidate_api) });
      }
      if (suggested.official_well_name !== null && suggested.official_well_name !== undefined && String(suggested.official_well_name).trim()) {
        entries.push({ field:"well_name", label:"Well name", value:String(suggested.official_well_name) });
      }
      return entries;
    }

    function verificationSummaryCards(summary = {}) {
      const reviewCards = [
        ["unreviewed", summary.unreviewed || 0, "Unreviewed"],
        ["approved_correction", summary.approved_correction || 0, "Corrections approved"],
        ["keep_saved", summary.keep_saved || 0, "Saved data kept"],
        ["field_check", summary.field_check || 0, "Field checks"],
        ["all", summary.total || 0, "All records"]
      ];
      const auditCards = [
        ["probable_api_correction", summary.probable_api_corrections || 0, "Likely API corrections"],
        ["api_conflict", summary.api_conflicts || 0, "API/location warnings"]
      ];
      return reviewCards.map(([filter, number, label]) => `
        <button class="verification-stat" type="button" data-verification-review-filter="${esc(filter)}">
          <strong>${Number(number).toLocaleString()}</strong><span>${esc(label)}</span>
        </button>`).join("") + auditCards.map(([filter, number, label]) => `
        <button class="verification-stat" type="button" data-verification-result-filter="${esc(filter)}">
          <strong>${Number(number).toLocaleString()}</strong><span>${esc(label)}</span>
        </button>`).join("");
    }

    function verificationResultOptions(selected) {
      const options = [
        ["all", "All audit results"],
        ["probable_api_correction", "Likely API corrections"],
        ["api_conflict", "API/location warnings"],
        ["geography_conflict", "County or township conflicts"],
        ["coordinate_conflict", "Wellhead distance warnings"],
        ["Verified by official API", "Validated official API"],
        ["Verified by official injection API", "Validated injection API"],
        ["Strong official match", "Strong official match"],
        ["Likely official match", "Likely official match"],
        ["Possible official match - review", "Possible match"],
        ["No official match found", "No official match"]
      ];
      return options.map(([value,label]) => `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`).join("");
    }

    function verificationReviewOptions(selected) {
      const options = [
        ["unreviewed", "Unreviewed"],
        ["all", "All review decisions"],
        ["approved_correction", "Correction approved"],
        ["keep_saved", "Saved data kept"],
        ["field_check", "Needs field check"]
      ];
      return options.map(([value,label]) => `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`).join("");
    }

    function verificationRecordCard(row) {
      const saved = row.saved_data || {};
      const conflictCount = Object.keys(row.conflicts || {}).length;
      const missingCount = Array.isArray(row.missing_fields) ? row.missing_fields.length : 0;
      const distance = row.official_data?.wellhead_distance_miles;
      const coordinateCounty = row.official_data?.coordinate_county;
      const coordinateTownship = row.official_data?.coordinate_township;
      const apiWarning = Boolean(row.conflicts?.api);
      return `
        <article class="verification-record" data-verification-pad="${esc(row.pad_id)}">
          <div>
            <div class="verification-record-meta">
              <span>${esc(row.company || "Unknown company")}</span><span>·</span><span>${esc(row.state || "State unknown")}</span>
              <span class="verify-badge ${verificationAuditClass(row.audit_status)}">${esc(row.audit_status)}</span>
              <span class="verify-badge ${verificationReviewClass(row.review_status)}">${esc(verificationReviewLabel(row.review_status))}</span>
            </div>
            <h3>${esc(row.pad_name || "Unnamed record")}</h3>
            <div class="verification-record-facts">
              ${saved.county ? `<span>Saved: ${esc(saved.county)} County</span>` : ""}
              ${coordinateCounty ? `<span>Point: ${esc(coordinateCounty)}${coordinateTownship ? ` / ${esc(coordinateTownship)}` : ""}</span>` : ""}
              ${saved.api ? `<span>API: ${esc(saved.api)}</span>` : ""}
              ${distance !== null && distance !== undefined ? `<span>Wellhead distance: ${esc(distance)} mi</span>` : ""}
              ${apiWarning ? `<span class="verify-alert">API/location warning</span>` : ""}
              ${conflictCount ? `<span class="verify-alert">${conflictCount} conflict${conflictCount === 1 ? "" : "s"}</span>` : ""}
              ${missingCount ? `<span>${missingCount} missing field${missingCount === 1 ? "" : "s"}</span>` : ""}
            </div>
          </div>
          <div class="verification-record-actions">
            <button class="btn small secondary" type="button" data-verification-pad="${esc(row.pad_id)}">Review record</button>
          </div>
        </article>`;
    }

    function bindVerificationPageControls() {
      const form = document.getElementById("verificationSearchForm");
      form?.addEventListener("submit", event => {
        event.preventDefault();
        verificationState.search = normalize(document.getElementById("verificationSearch")?.value);
        verificationState.offset = 0;
        loadVerificationQueue().catch(error => showVerificationPageError(error));
      });

      const bindings = [
        ["verificationReviewStatus", "reviewStatus"],
        ["verificationState", "state"],
        ["verificationResult", "result"],
        ["verificationRecordType", "recordType"]
      ];
      bindings.forEach(([id,key]) => {
        document.getElementById(id)?.addEventListener("change", event => {
          verificationState[key] = event.target.value;
          verificationState.offset = 0;
          loadVerificationQueue().catch(error => showVerificationPageError(error));
        });
      });

      document.getElementById("verificationPrev")?.addEventListener("click", () => {
        verificationState.offset = Math.max(0, verificationState.offset - VERIFICATION_PAGE_SIZE);
        loadVerificationQueue().catch(error => showVerificationPageError(error));
        window.scrollTo({ top:0, behavior:"smooth" });
      });
      document.getElementById("verificationNext")?.addEventListener("click", () => {
        if (verificationState.offset + VERIFICATION_PAGE_SIZE >= verificationState.total) return;
        verificationState.offset += VERIFICATION_PAGE_SIZE;
        loadVerificationQueue().catch(error => showVerificationPageError(error));
        window.scrollTo({ top:0, behavior:"smooth" });
      });
    }

    function showVerificationPageError(error) {
      const list = document.getElementById("verificationList");
      if (list) list.innerHTML = `<div class="verification-empty"><strong>Verification review could not load.</strong><br>${esc(error?.message || "Try signing in again.")}</div>`;
    }

    async function loadVerificationSummary() {
      const data = await editorRequest("/rest/v1/rpc/verification_review_summary", {
        method:"POST", body:"{}"
      });
      verificationSummary = Array.isArray(data) ? data[0] : data;
      const target = document.getElementById("verificationSummary");
      if (target) target.innerHTML = verificationSummaryCards(verificationSummary || {});
    }

    async function loadVerificationQueue() {
      if (!editorIsOwner()) throw new Error("Owner access required.");
      verificationState.loading = true;
      const list = document.getElementById("verificationList");
      if (list) list.innerHTML = `<div class="verification-loading">Checking the private audit…</div>`;

      const data = await editorRequest("/rest/v1/rpc/verification_review_queue", {
        method:"POST",
        body:JSON.stringify({
          p_review_status: verificationState.reviewStatus,
          p_state: verificationState.state,
          p_result: verificationState.result,
          p_record_type: verificationState.recordType,
          p_search: verificationState.search || null,
          p_limit: VERIFICATION_PAGE_SIZE,
          p_offset: verificationState.offset
        })
      });
      verificationRows = Array.isArray(data) ? data : [];
      verificationState.total = Number(verificationRows[0]?.total_count || 0);
      verificationState.loading = false;

      if (list) {
        list.innerHTML = verificationRows.length
          ? verificationRows.map(verificationRecordCard).join("")
          : `<div class="verification-empty">No records match these filters.</div>`;
      }

      const start = verificationState.total ? verificationState.offset + 1 : 0;
      const end = Math.min(verificationState.offset + VERIFICATION_PAGE_SIZE, verificationState.total);
      const count = document.getElementById("verificationCount");
      if (count) count.textContent = `${start.toLocaleString()}–${end.toLocaleString()} of ${verificationState.total.toLocaleString()}`;
      const page = document.getElementById("verificationPageLabel");
      if (page) page.textContent = verificationState.total
        ? `Page ${Math.floor(verificationState.offset / VERIFICATION_PAGE_SIZE) + 1} of ${Math.ceil(verificationState.total / VERIFICATION_PAGE_SIZE)}`
        : "No results";
      const prev = document.getElementById("verificationPrev");
      const next = document.getElementById("verificationNext");
      if (prev) prev.disabled = verificationState.offset <= 0;
      if (next) next.disabled = verificationState.offset + VERIFICATION_PAGE_SIZE >= verificationState.total;
    }

    async function renderVerificationReview() {
      document.title = "Verification Review · BrineSearch";
      closeGlobalSearch();
      closeAssistant();
      closePadEditor();

      if (!editorSession || !editorIsOwner()) {
        app.innerHTML = `
          <section class="verification-access-card">
            <div class="verification-private-badge">🔒 Owner only</div>
            <h1>Verification Review</h1>
            <p>This page contains private audit comparisons and can change live pad information. Sign in with the BrineSearch owner account.</p>
            <button class="btn primary" type="button" data-open-editor-auth>Owner sign in</button>
          </section>`;
        return;
      }

      app.innerHTML = `
        <section class="verification-page">
          <nav class="breadcrumb"><a href="#/">Home</a><span>›</span><span>Verification Review</span></nav>
          <section class="verification-hero">
            <div class="verification-hero-top">
              <div>
                <div class="verification-private-badge">🔒 Private owner workspace</div>
                <h1>Pad Verification Review</h1>
                <p>Compare the live record against coordinate boundaries, nearby official wells, API structure, well names, and operators. No correction is applied until you select it and approve it.</p>
              </div>
              <a class="btn ghost" href="#/">Back to directory</a>
            </div>
            <div class="verification-summary" id="verificationSummary">
              ${verificationSummaryCards({})}
            </div>
          </section>

          <section class="verification-toolbar">
            <form class="verification-search-wrap" id="verificationSearchForm">
              <input id="verificationSearch" value="${esc(verificationState.search)}" placeholder="Search pad, company, county, API, or well…" aria-label="Search verification records">
              <button class="btn secondary" type="submit">Search</button>
            </form>
            <select id="verificationReviewStatus" aria-label="Review decision">${verificationReviewOptions(verificationState.reviewStatus)}</select>
            <select id="verificationState" aria-label="State">
              <option value="all"${verificationState.state === "all" ? " selected" : ""}>All states</option>
              <option value="Ohio"${verificationState.state === "Ohio" ? " selected" : ""}>Ohio</option>
              <option value="West Virginia"${verificationState.state === "West Virginia" ? " selected" : ""}>West Virginia</option>
              <option value="Pennsylvania"${verificationState.state === "Pennsylvania" ? " selected" : ""}>Pennsylvania</option>
            </select>
            <select id="verificationResult" aria-label="Audit result">${verificationResultOptions(verificationState.result)}</select>
            <select id="verificationRecordType" aria-label="Location type">
              <option value="all"${verificationState.recordType === "all" ? " selected" : ""}>Pads and disposals</option>
              <option value="pad"${verificationState.recordType === "pad" ? " selected" : ""}>Pads only</option>
              <option value="disposal"${verificationState.recordType === "disposal" ? " selected" : ""}>Disposals only</option>
            </select>
          </section>

          <div class="verification-results-head"><strong>Review queue</strong><span id="verificationCount">Loading…</span></div>
          <section class="verification-list" id="verificationList"><div class="verification-loading">Checking the private audit…</div></section>
          <div class="verification-pagination">
            <button class="btn ghost" id="verificationPrev" type="button">← Previous</button>
            <span id="verificationPageLabel">Page 1</span>
            <button class="btn ghost" id="verificationNext" type="button">Next →</button>
          </div>
        </section>`;

      bindVerificationPageControls();
      try {
        await ensureEditorSession();
        await Promise.all([loadVerificationSummary(), loadVerificationQueue()]);
      } catch (error) {
        showVerificationPageError(error);
      }
    }
