    /* Owner-only public-data research review console.
       All decisions remain audit-only until a separately reviewed live-apply action exists. */
    let publicDataReviewState = {
      summary: null,
      rows: [],
      offset: 0,
      limit: 25,
      total: 0,
      detailId: null,
      loading: false
    };

    function publicDataReviewEsc(value) {
      return typeof esc === "function" ? esc(value ?? "") : String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    }

    function publicDataReviewOwner() {
      try { return typeof editorIsOwner === "function" && editorIsOwner(); }
      catch { return false; }
    }

    function publicDataReviewPanel() {
      if (!publicDataReviewOwner()) return null;
      let panel = document.getElementById("publicDataReviewPanel");
      if (panel) return panel;
      const anchor = document.getElementById("ownerAttentionList") || document.getElementById("editorDashboardSummary") || document.getElementById("ownerHealthGrid");
      if (!anchor) return null;
      panel = document.createElement("section");
      panel.id = "publicDataReviewPanel";
      panel.className = "public-data-review-panel";
      panel.innerHTML = `
        <div class="public-data-review-head">
          <div>
            <span class="public-data-review-kicker">OWNER · OFFICIAL DATA</span>
            <h2>Public Data Review</h2>
            <p>Official agency research is staged here first. Reviewing a finding does <strong>not</strong> publish it to drivers.</p>
          </div>
          <button class="btn small ghost" type="button" id="publicDataReviewRefresh">Refresh</button>
        </div>
        <div class="public-data-review-safety">🔒 Audit-only decisions · no automatic pad, API, direction, road, mileage, or navigation-coordinate changes.</div>
        <div class="public-data-review-stats" id="publicDataReviewStats"></div>
        <div class="public-data-review-sources" id="publicDataReviewSources"></div>
        <div class="public-data-review-filters">
          <input id="publicDataReviewSearch" type="search" placeholder="Search pad, operator, county, API…" autocomplete="off">
          <select id="publicDataReviewStateFilter"><option value="all">All states</option><option>Ohio</option><option>West Virginia</option><option>Pennsylvania</option></select>
          <select id="publicDataReviewCategoryFilter">
            <option value="all">All findings</option>
            <option value="API_CONFLICT">API conflicts</option>
            <option value="LOCATION_CONFLICT">Location conflicts</option>
            <option value="POSSIBLE_DUPLICATE">Possible duplicates</option>
            <option value="NEW_PAD_CANDIDATE">New pads</option>
            <option value="NEW_DISPOSAL_CANDIDATE">New disposals</option>
            <option value="NEW_WELL_FOR_EXISTING_PAD">New wells</option>
            <option value="ACCESS_ROAD_EVIDENCE">Access-road evidence</option>
            <option value="OPERATOR_CHANGE_OR_ALIAS">Operator history</option>
            <option value="STATUS_UPDATE">Status updates</option>
            <option value="OFFICIAL_NAME_ALIAS">Name aliases</option>
            <option value="NEW_FACILITY_CANDIDATE">Facilities</option>
          </select>
          <select id="publicDataReviewPriorityFilter"><option value="0">All priorities</option><option value="90">90+ urgent</option><option value="80">80+ high</option><option value="60">60+</option></select>
          <select id="publicDataReviewSourceFilter"><option value="all">All sources</option></select>
        </div>
        <div class="public-data-review-layout">
          <div>
            <div class="public-data-review-queue-head"><strong id="publicDataReviewCount">Review queue</strong><span id="publicDataReviewStatus"></span></div>
            <div id="publicDataReviewQueue" class="public-data-review-queue"></div>
            <div class="public-data-review-pager"><button class="btn small ghost" id="publicDataReviewPrev" type="button">Previous</button><span id="publicDataReviewPage"></span><button class="btn small ghost" id="publicDataReviewNext" type="button">Next</button></div>
          </div>
          <aside id="publicDataReviewDetail" class="public-data-review-detail"><div class="public-data-review-empty"><strong>Select a finding</strong><span>Saved data, official facts, conflicts, evidence, well links and review history will appear here.</span></div></aside>
        </div>`;
      const host = anchor.closest("section") || anchor.parentElement;
      (host || anchor).insertAdjacentElement("afterend", panel);
      document.getElementById("publicDataReviewRefresh")?.addEventListener("click", () => loadPublicDataReview(true));
      ["publicDataReviewStateFilter","publicDataReviewCategoryFilter","publicDataReviewPriorityFilter","publicDataReviewSourceFilter"].forEach(id => document.getElementById(id)?.addEventListener("change", () => loadPublicDataReview(true)));
      let searchTimer;
      document.getElementById("publicDataReviewSearch")?.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadPublicDataReview(true), 280); });
      document.getElementById("publicDataReviewPrev")?.addEventListener("click", () => { if (publicDataReviewState.offset > 0) { publicDataReviewState.offset = Math.max(0, publicDataReviewState.offset-publicDataReviewState.limit); loadPublicDataReview(false); } });
      document.getElementById("publicDataReviewNext")?.addEventListener("click", () => { if (publicDataReviewState.offset + publicDataReviewState.limit < publicDataReviewState.total) { publicDataReviewState.offset += publicDataReviewState.limit; loadPublicDataReview(false); } });
      return panel;
    }

    function publicDataReviewLabel(value) {
      const labels = {
        API_CONFLICT:"API conflict", LOCATION_CONFLICT:"Location conflict", POSSIBLE_DUPLICATE:"Possible duplicate",
        NEW_PAD_CANDIDATE:"New pad", NEW_DISPOSAL_CANDIDATE:"New disposal", NEW_WELL_FOR_EXISTING_PAD:"New well",
        ACCESS_ROAD_EVIDENCE:"Access-road evidence", OPERATOR_CHANGE_OR_ALIAS:"Operator history", STATUS_UPDATE:"Status update",
        OFFICIAL_NAME_ALIAS:"Name alias", NEW_FACILITY_CANDIDATE:"Facility", VERIFIED_EXISTING_RECORD:"Verified existing"
      };
      return labels[value] || String(value || "Finding").replaceAll("_"," ").toLowerCase();
    }

    function renderPublicDataReviewSummary(summary) {
      const stats = document.getElementById("publicDataReviewStats");
      if (stats) {
        const values = [
          [summary?.needs_owner_review || 0,"Needs review","attention"],
          [summary?.high_priority || 0,"Urgent / high","problem"],
          [summary?.new_pads || 0,"New pads",""],
          [summary?.new_wells || 0,"New wells",""],
          [summary?.new_disposals || 0,"New disposals",""],
          [(summary?.api_conflicts || 0)+(summary?.location_conflicts || 0),"Hard conflicts","problem"],
          [summary?.possible_duplicates || 0,"Duplicates","attention"],
          [summary?.confirmed || 0,"Confirmed evidence","good"]
        ];
        stats.innerHTML = values.map(([v,l,k]) => `<div class="public-data-review-stat ${k}"><strong>${publicDataReviewEsc(v)}</strong><span>${publicDataReviewEsc(l)}</span></div>`).join("");
      }
      const sourceBox = document.getElementById("publicDataReviewSources");
      const sourceSelect = document.getElementById("publicDataReviewSourceFilter");
      const sources = Array.isArray(summary?.sources) ? summary.sources : [];
      if (sourceBox) sourceBox.innerHTML = sources.filter(s => Number(s.records||0)>0 || /live/i.test(s.source_name||"")).map(s => `<span class="public-data-source-pill ${s.health_status === "healthy" ? "healthy" : ""}"><strong>${publicDataReviewEsc(s.records||0)}</strong> ${publicDataReviewEsc(s.source_name||s.source_key)}</span>`).join("");
      if (sourceSelect) {
        const current = sourceSelect.value;
        sourceSelect.innerHTML = `<option value="all">All sources</option>` + sources.map(s => `<option value="${publicDataReviewEsc(s.source_key)}">${publicDataReviewEsc(s.source_name||s.source_key)}</option>`).join("");
        if ([...sourceSelect.options].some(o => o.value === current)) sourceSelect.value = current;
      }
    }

    function renderPublicDataReviewQueue(rows) {
      const queue = document.getElementById("publicDataReviewQueue");
      const count = document.getElementById("publicDataReviewCount");
      const page = document.getElementById("publicDataReviewPage");
      const prev = document.getElementById("publicDataReviewPrev");
      const next = document.getElementById("publicDataReviewNext");
      if (count) count.textContent = `${publicDataReviewState.total.toLocaleString()} findings`;
      if (page) page.textContent = publicDataReviewState.total ? `${publicDataReviewState.offset+1}–${Math.min(publicDataReviewState.offset+publicDataReviewState.limit,publicDataReviewState.total)} of ${publicDataReviewState.total}` : "0 findings";
      if (prev) prev.disabled = publicDataReviewState.offset <= 0;
      if (next) next.disabled = publicDataReviewState.offset + publicDataReviewState.limit >= publicDataReviewState.total;
      if (!queue) return;
      queue.innerHTML = rows.length ? rows.map(row => {
        const saved = row.saved_data || {};
        const conflict = ["API_CONFLICT","LOCATION_CONFLICT","POSSIBLE_DUPLICATE"].includes(row.result_category);
        return `<button type="button" class="public-data-review-row ${conflict ? "conflict" : ""} ${publicDataReviewState.detailId===row.candidate_id ? "selected" : ""}" data-public-data-candidate="${publicDataReviewEsc(row.candidate_id)}">
          <div class="public-data-review-row-top"><span class="public-data-review-category">${publicDataReviewEsc(publicDataReviewLabel(row.result_category))}</span><strong>${publicDataReviewEsc(row.review_priority || 0)}</strong></div>
          <h3>${publicDataReviewEsc(row.official_name || "Unnamed official record")}</h3>
          <p>${publicDataReviewEsc([row.official_operator,row.official_county,row.official_township].filter(Boolean).join(" · ") || row.source_name)}</p>
          ${saved.pad_name ? `<small>Saved: ${publicDataReviewEsc(saved.company ? `${saved.company} · ` : "")}${publicDataReviewEsc(saved.pad_name)}</small>` : `<small>No saved pad attached</small>`}
          <span class="public-data-review-reason">${publicDataReviewEsc(row.priority_reason || row.match_method || "Official evidence")}</span>
        </button>`;
      }).join("") : `<div class="public-data-review-empty"><strong>No findings match these filters.</strong><span>Try a different state, category, source or priority.</span></div>`;
      queue.querySelectorAll("[data-public-data-candidate]").forEach(button => button.addEventListener("click", () => openPublicDataReviewDetail(button.dataset.publicDataCandidate)));
    }

    function publicDataReviewFacts(value) {
      if (value == null) return `<span class="muted">None</span>`;
      if (typeof value !== "object") return publicDataReviewEsc(value);
      const entries = Object.entries(value).filter(([,v]) => v != null && v !== "" && !(Array.isArray(v)&&!v.length));
      if (!entries.length) return `<span class="muted">None</span>`;
      return `<div class="public-data-review-facts">${entries.map(([k,v]) => `<div><span>${publicDataReviewEsc(k.replaceAll("_"," "))}</span><strong>${publicDataReviewEsc(typeof v === "object" ? JSON.stringify(v) : v)}</strong></div>`).join("")}</div>`;
    }

    async function openPublicDataReviewDetail(candidateId) {
      if (!publicDataReviewOwner() || !candidateId) return;
      publicDataReviewState.detailId = candidateId;
      renderPublicDataReviewQueue(publicDataReviewState.rows);
      const detail = document.getElementById("publicDataReviewDetail");
      if (detail) detail.innerHTML = `<div class="public-data-review-loading">Loading official evidence…</div>`;
      try {
        const result = await editorRequest("/rest/v1/rpc/public_data_review_detail", { method:"POST", body:JSON.stringify({ p_candidate_id:candidateId }) });
        const data = Array.isArray(result) ? result[0] : result;
        const c = data?.candidate || {};
        const source = data?.source || {};
        const saved = data?.saved || null;
        const links = Array.isArray(data?.well_links) ? data.well_links : [];
        const history = Array.isArray(data?.review_history) ? data.review_history : [];
        if (!detail) return;
        const actions = c.review_status === "needs_owner_review" || c.review_status === "needs_field_confirmation" ? `
          <div class="public-data-review-decision-box">
            <strong>Owner review decision</strong><small>This changes review status/history only. It does not publish data.</small>
            <textarea id="publicDataReviewNote" placeholder="Optional review note"></textarea>
            <div class="public-data-review-actions">
              <button type="button" class="btn small primary" data-public-data-decision="keep_saved">Keep saved</button>
              <button type="button" class="btn small ghost" data-public-data-decision="attach_official_record">Attach official evidence</button>
              <button type="button" class="btn small ghost" data-public-data-decision="add_new_well">Confirm new well</button>
              <button type="button" class="btn small ghost" data-public-data-decision="save_as_alias">Save as alias</button>
              <button type="button" class="btn small ghost" data-public-data-decision="mark_operator_history">Operator history</button>
              <button type="button" class="btn small ghost" data-public-data-decision="needs_field_check">Needs field check</button>
              <button type="button" class="btn small ghost" data-public-data-decision="defer">Defer</button>
              <button type="button" class="btn small danger" data-public-data-decision="reject">Reject</button>
            </div>
          </div>` : `<button class="btn small ghost" type="button" data-public-data-decision="reopen">Reopen review</button>`;
        detail.innerHTML = `
          <div class="public-data-review-detail-head"><div><span>${publicDataReviewEsc(publicDataReviewLabel(c.result_category))} · priority ${publicDataReviewEsc(c.review_priority||0)}</span><h3>${publicDataReviewEsc(source.normalized_facts?.official_name || source.normalized_facts?.well_name || source.raw_facts?.WELL_NAME || source.source_record_id || "Official finding")}</h3></div><button type="button" class="public-data-review-close" aria-label="Close">×</button></div>
          <div class="public-data-review-detail-badges"><span>${publicDataReviewEsc(c.review_status||"")}</span><span>${publicDataReviewEsc(source.source_name||"")}</span></div>
          <h4>Official facts</h4>${publicDataReviewFacts(source.normalized_facts)}
          <h4>Saved BrineSearch record</h4>${saved ? publicDataReviewFacts({company:saved.company,pad_name:saved.pad_name,record_type:saved.record_type,county:saved.county,township:saved.township,latitude:saved.latitude,longitude:saved.longitude,api:saved.api,operating_status:saved.operating_status}) : `<p class="muted">No saved record is attached to this finding.</p>`}
          <h4>Evidence</h4>${publicDataReviewFacts(c.evidence || [])}
          ${Array.isArray(c.conflicts)&&c.conflicts.length ? `<h4>Conflicts</h4>${publicDataReviewFacts(c.conflicts)}` : ""}
          ${links.length ? `<h4>Official well links</h4><div class="public-data-review-link-list">${links.slice(0,30).map(l => `<div><strong>${publicDataReviewEsc(l.well_name||l.canonical_api||"Well")}</strong><span>${publicDataReviewEsc([l.canonical_api,l.well_status,l.operator].filter(Boolean).join(" · "))}</span></div>`).join("")}</div>` : ""}
          ${history.length ? `<h4>Review history</h4><div class="public-data-review-history">${history.slice(0,15).map(h => `<div><strong>${publicDataReviewEsc(h.decision)}</strong><span>${publicDataReviewEsc(h.reviewer_note||"")}</span><small>${publicDataReviewEsc(typeof formatEditorTime === "function" ? formatEditorTime(h.created_at) : h.created_at)}</small></div>`).join("")}</div>` : ""}
          ${actions}`;
        detail.querySelector(".public-data-review-close")?.addEventListener("click", () => { publicDataReviewState.detailId=null; detail.innerHTML=`<div class="public-data-review-empty"><strong>Select a finding</strong><span>Saved data and official evidence will appear here.</span></div>`; renderPublicDataReviewQueue(publicDataReviewState.rows); });
        detail.querySelectorAll("[data-public-data-decision]").forEach(button => button.addEventListener("click", () => decidePublicDataReview(candidateId, button.dataset.publicDataDecision)));
      } catch (error) {
        if (detail) detail.innerHTML = `<div class="public-data-review-empty problem"><strong>Could not load finding</strong><span>${publicDataReviewEsc(error?.message || "Review detail failed")}</span></div>`;
      }
    }

    async function decidePublicDataReview(candidateId, decision) {
      if (!publicDataReviewOwner()) return;
      const note = document.getElementById("publicDataReviewNote")?.value || "";
      const labels = {keep_saved:"Keep saved data",attach_official_record:"Confirm official attachment",add_new_well:"Confirm new-well evidence",save_as_alias:"Confirm alias",mark_operator_history:"Confirm operator history",needs_field_check:"Mark for field check",defer:"Defer",reject:"Reject",reopen:"Reopen"};
      if (!confirm(`${labels[decision] || "Record decision"}?\n\nThis records an Owner review decision only. It will NOT publish or change driver-facing pad data.`)) return;
      try {
        await editorRequest("/rest/v1/rpc/public_data_review_decide", { method:"POST", body:JSON.stringify({ p_candidate_id:candidateId, p_decision:decision, p_note:note || null }) });
        if (typeof showToast === "function") showToast("Review decision saved · live directory unchanged");
        await loadPublicDataReview(false);
        await openPublicDataReviewDetail(candidateId);
      } catch (error) { if (typeof showToast === "function") showToast(error?.message || "Review decision failed"); else alert(error?.message || "Review decision failed"); }
    }

    async function loadPublicDataReview(resetOffset = false) {
      if (!publicDataReviewOwner()) return;
      const panel = publicDataReviewPanel();
      if (!panel || publicDataReviewState.loading) return;
      if (resetOffset) publicDataReviewState.offset = 0;
      publicDataReviewState.loading = true;
      const status = document.getElementById("publicDataReviewStatus");
      if (status) status.textContent = "Loading…";
      try {
        const search = document.getElementById("publicDataReviewSearch")?.value?.trim() || null;
        const state = document.getElementById("publicDataReviewStateFilter")?.value || "all";
        const category = document.getElementById("publicDataReviewCategoryFilter")?.value || "all";
        const source = document.getElementById("publicDataReviewSourceFilter")?.value || "all";
        const minPriority = Number(document.getElementById("publicDataReviewPriorityFilter")?.value || 0);
        const [summaryResult,queueResult] = await Promise.all([
          editorRequest("/rest/v1/rpc/public_data_review_summary", { method:"POST", body:"{}" }),
          editorRequest("/rest/v1/rpc/public_data_review_queue", { method:"POST", body:JSON.stringify({ p_review_status:"needs_owner_review",p_category:category,p_source_key:source,p_state:state,p_entity_type:null,p_usefulness:null,p_search:search,p_min_priority:minPriority,p_limit:publicDataReviewState.limit,p_offset:publicDataReviewState.offset }) })
        ]);
        publicDataReviewState.summary = Array.isArray(summaryResult) ? summaryResult[0] : summaryResult;
        publicDataReviewState.rows = Array.isArray(queueResult) ? queueResult : [];
        publicDataReviewState.total = Number(publicDataReviewState.rows[0]?.total_count || 0);
        renderPublicDataReviewSummary(publicDataReviewState.summary || {});
        renderPublicDataReviewQueue(publicDataReviewState.rows);
        if (status) status.textContent = "Official staging · Owner only";
      } catch (error) {
        if (status) status.textContent = error?.message || "Review data unavailable";
      } finally { publicDataReviewState.loading = false; }
    }

    if (typeof loadEditorDashboard === "function") {
      const baseLoadEditorDashboardPublicData = loadEditorDashboard;
      loadEditorDashboard = async function loadEditorDashboardWithPublicDataReview(...args) {
        const result = await baseLoadEditorDashboardPublicData.apply(this,args);
        try { await loadPublicDataReview(true); } catch {}
        return result;
      };
    }
