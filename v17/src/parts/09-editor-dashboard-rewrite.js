    function renderEditorDashboard(data) {
      editorDashboardData = data || {};
      const summary = data?.summary || {};
      const summaryEl = document.getElementById("editorDashboardSummary");
      if (summaryEl) summaryEl.innerHTML = [
        [summary.editors || 0,"Approved editors"],
        [summary.pending_accounts || 0,"Waiting approval"],
        [summary.successful_actions_7d || 0,"Successful · 7 days"],
        [summary.failed_actions_7d || 0,"Failed · 7 days"],
        [summary.pending_submissions || 0,"Pending submissions"]
      ].map(([value,label]) => `<div class="editor-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join("");

      const attentionEl = document.getElementById("ownerAttentionList");
      if (attentionEl) {
        const actions = [];
        if (Number(summary.pending_submissions || 0)) actions.push([summary.pending_submissions, "Pad submissions waiting", "Approve or reject submitted locations below."]);
        if (Number(summary.failed_actions_7d || 0)) actions.push([summary.failed_actions_7d, "Failed editor attempts", "Review exact errors in recent editor activity."]);
        if (Number(summary.pending_accounts || 0)) actions.push([summary.pending_accounts, "Editor accounts waiting", "Approve or suspend them above."]);
        attentionEl.innerHTML = actions.length ? actions.map(([count,title,note]) => `<div class="owner-attention-item"><div><strong>${esc(count)} · ${esc(title)}</strong><small>${esc(note)}</small></div><span>›</span></div>`).join("") : `<div class="owner-attention-item"><div><strong>✓ No owner action required</strong><small>No pending submissions, failed attempts, or waiting accounts.</small></div></div>`;
      }

      const health = data?.health || {};
      const issueCount = Number(health.missing_navigation_gps || 0) + Number(health.missing_directions || 0) + Number(health.duplicate_name_groups || 0) + Number(health.duplicate_coordinate_groups || 0);
      const healthLevel = !health.database_online ? "bad" : issueCount > 0 || Number(health.needs_field_check || 0) > 0 ? "warn" : "good";
      const healthBanner = document.getElementById("ownerHealthBanner");
      if (healthBanner) healthBanner.querySelector("div").innerHTML = `<strong>${health.database_online ? (healthLevel === "good" ? "Database healthy" : "Database online · attention needed") : "Database unavailable"}</strong><small>${esc(DATA_SOURCE_LABEL || "BrineSearch data")} · ${esc(health.total_records || 0)} total records</small>`;
      const healthDot = document.getElementById("ownerHealthDot");
      if (healthDot) healthDot.className = `owner-health-dot ${healthLevel}`;

      const healthGrid = document.getElementById("ownerHealthGrid");
      if (healthGrid) {
        const cards = [
          [health.pads || 0,"Pads",""],
          [health.disposals || 0,"Disposals",""],
          [health.companies || 0,"Companies",""],
          [health.official_attached || 0,"Official records attached",""],
          [health.needs_field_check || 0,"Needs field check",Number(health.needs_field_check || 0) ? "attention" : ""],
          [health.missing_navigation_gps || 0,"Missing navigation GPS",Number(health.missing_navigation_gps || 0) ? "problem" : ""],
          [health.missing_directions || 0,"Missing all directions/address",Number(health.missing_directions || 0) ? "attention" : ""],
          [health.duplicate_name_groups || 0,"Duplicate-name groups",Number(health.duplicate_name_groups || 0) ? "problem" : ""],
          [health.duplicate_coordinate_groups || 0,"Shared saved-coordinate groups",Number(health.duplicate_coordinate_groups || 0) ? "attention" : ""]
        ];
        healthGrid.innerHTML = cards.map(([value,label,klass]) => `<div class="owner-health-item ${klass}"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join("");
      }
      const healthMeta = document.getElementById("ownerHealthMeta");
      if (healthMeta) healthMeta.innerHTML = [
        ["Last pad update",formatEditorTime(health.last_pad_update)],
        ["Last editor activity",formatEditorTime(health.last_editor_activity)],
        ["Last official audit",health.last_audit_date || "Not recorded"],
        ["Dashboard refreshed",formatEditorTime(health.generated_at)]
      ].map(([label,value]) => `<div class="owner-health-meta-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");

      const activityEl = document.getElementById("editorActivityList");
      if (activityEl) activityEl.innerHTML = (data?.activity || []).map(item => `
        <div class="editor-activity ${esc(item.status || "info")}">
          <div class="editor-activity-top"><strong>${esc(item.editor_name || "Editor")} · ${esc((item.action || "activity").replaceAll("_"," "))}</strong><small>${esc(formatEditorTime(item.created_at))}</small></div>
          <div>${esc([item.company,item.pad_name].filter(Boolean).join(" · ") || "No pad name recorded")}</div>
          ${item.error_message ? `<div class="editor-activity-error">${esc(item.error_message)}</div>` : ""}
          <small>${esc(item.status === "success" ? "Succeeded" : item.status === "error" ? "Failed" : "Information")}</small>
        </div>`).join("") || `<p class="editor-dashboard-empty">No editor add attempts have been recorded yet.</p>`;

      const editsEl = document.getElementById("editorRecentEdits");
      if (editsEl) editsEl.innerHTML = (data?.recent_edits || []).map(item => `
        <div class="editor-activity success">
          <div class="editor-activity-top"><strong>${esc(item.editor_name || "System")}</strong><small>${esc(formatEditorTime(item.changed_at))}</small></div>
          <div>${esc([item.company,item.pad_name].filter(Boolean).join(" · ") || "Pad change")}</div>
          <small>${esc((item.changed_fields || []).join(", ") || "Saved change")}</small>
        </div>`).join("") || `<p class="editor-dashboard-empty">No saved changes yet.</p>`;

      const submissionsEl = document.getElementById("editorSubmissionList");
      const pending = (data?.submissions || []).filter(item => item.status === "pending");
      if (submissionsEl) {
        submissionsEl.innerHTML = pending.map(item => `
          <div class="editor-activity info" data-submission-card="${esc(item.id)}">
            <div class="editor-activity-top"><strong>${esc(item.company)} · ${esc(item.pad_name)}</strong><small>${esc(formatEditorTime(item.created_at))}</small></div>
            <div>${esc(item.state || "")} · Submitted by ${esc(item.submitter_name || "Unknown")}</div>
            ${item.submitter_contact ? `<small>${esc(item.submitter_contact)}</small>` : ""}
            <textarea class="submission-review-note" data-submission-note="${esc(item.id)}" placeholder="Optional owner note or rejection reason"></textarea>
            <div class="submission-review-actions">
              <button class="btn small primary" type="button" data-submission-decision="approve" data-submission-id="${esc(item.id)}">Approve and add live</button>
              <button class="btn small ghost" type="button" data-submission-decision="reject" data-submission-id="${esc(item.id)}">Reject</button>
            </div>
          </div>`).join("") || `<p class="editor-dashboard-empty">Nothing is waiting for review.</p>`;
        submissionsEl.querySelectorAll("[data-submission-decision]").forEach(button => button.addEventListener("click", () => reviewPadSubmission(button.dataset.submissionId, button.dataset.submissionDecision)));
      }
    }

    async function reviewPadSubmission(submissionId, decision) {
      if (!editorIsOwner()) return;
      const card = document.querySelector(`[data-submission-card="${CSS.escape(submissionId)}"]`);
      const note = document.querySelector(`[data-submission-note="${CSS.escape(submissionId)}"]`)?.value || "";
      if (decision === "reject" && !note.trim()) {
        const reason = prompt("Why are you rejecting this submission? This will be saved for the record.");
        if (reason === null) return;
        if (!reason.trim()) { showToast("Enter a rejection reason"); return; }
        document.querySelector(`[data-submission-note="${CSS.escape(submissionId)}"]`).value = reason.trim();
      }
      if (decision === "approve" && !confirm("Approve this submission and add it to the live BrineSearch directory?")) return;
      if (decision === "reject" && !confirm("Reject this submission?")) return;
      card?.classList.add("reviewing");
      try {
        const finalNote = document.querySelector(`[data-submission-note="${CSS.escape(submissionId)}"]`)?.value || note;
        const result = await editorRequest("/rest/v1/rpc/review_pad_submission", { method:"POST", body:JSON.stringify({ p_submission_id:submissionId, p_decision:decision, p_review_notes:finalNote || null }) });
        showToast(decision === "approve" ? "Submission approved and added live" : "Submission rejected");
        if (decision === "approve") { setTimeout(() => location.reload(), 700); }
        else await loadEditorDashboard();
        return result;
      } catch (error) {
        card?.classList.remove("reviewing");
        showToast(error.message || "Submission review failed");
      }
    }

    async function loadEditorDashboard() {
      if (!editorIsOwner()) return;
      const data = await editorRequest("/rest/v1/rpc/owner_editor_dashboard", { method:"POST", body:"{}" });
      renderEditorDashboard(Array.isArray(data) ? data[0] : data);
      await loadEditorPeople();
    }

    function accessLabel(person) {
      const permissions = Array.isArray(person.permissions) && person.permissions.length ? person.permissions : [person.role || "member"];
      if (permissions.includes("owner")) return "Owner";
      if (permissions.includes("suspended")) return "Suspended";
      const labels=[];
      if (permissions.includes("administrator")) labels.push("Administrator");
      if (permissions.includes("moderator")) labels.push("Moderator");
      if (permissions.includes("editor")) labels.push("Editor");
      return labels.length ? labels.join(" + ") : "Regular User";
    }

    async function loadEditorPeople() {
      if (!editorIsOwner()) return;
      const people = await editorRequest("/rest/v1/editor_accounts?select=user_id,email,display_name,role,permissions,created_at&order=created_at.asc");
      const container = document.getElementById("editorPeople");
      if (!container) return;
      container.innerHTML = (people || []).map(person => {
        const permissions = Array.isArray(person.permissions) && person.permissions.length ? person.permissions : [person.role || "member"];
        const checked = name => permissions.includes(name) ? "checked" : "";
        return `<div class="editor-person"><div><strong>${esc(person.display_name || person.email || "User")}</strong><small>${esc(person.email || "")} · ${esc(accessLabel(person))}</small>${(() => { const stats=(editorDashboardData?.people||[]).find(item=>item.user_id===person.user_id); return stats?`<div class="editor-person-metrics"><span class="editor-metric-pill">${esc(stats.success_count||0)} success</span><span class="editor-metric-pill">${esc(stats.error_count||0)} failed</span><span class="editor-metric-pill">Last: ${esc(formatEditorTime(stats.last_activity||stats.last_edit))}</span></div>`:""; })()}</div><div class="editor-person-actions" data-user-permissions="${esc(person.user_id)}">${permissions.includes("owner")?`<span class="editor-role-pill">Owner · all permissions</span>`:`<div class="editor-role-summary">Select any combination, then save. New accounts start as Regular User.</div><div class="editor-role-checkboxes"><label class="editor-role-check"><input type="checkbox" value="editor" ${checked('editor')}><span>✎ Editor</span></label><label class="editor-role-check"><input type="checkbox" value="moderator" ${checked('moderator')}><span>⚑ Moderator</span></label><label class="editor-role-check"><input type="checkbox" value="administrator" ${checked('administrator')}><span>🛡 Administrator</span></label><label class="editor-role-check suspend"><input type="checkbox" value="suspended" ${checked('suspended')}><span>⛔ Suspended</span></label></div><button class="btn small primary" type="button" data-save-user-permissions="${esc(person.user_id)}">Save access</button>`}</div></div>`;
      }).join("") || `<p class="muted">No other accounts yet.</p>`;
      container.querySelectorAll('[data-user-permissions]').forEach(box=>{const suspend=box.querySelector('input[value="suspended"]');const others=[...box.querySelectorAll('input:not([value="suspended"])')];suspend?.addEventListener('change',()=>{if(suspend.checked)others.forEach(x=>x.checked=false)});others.forEach(x=>x.addEventListener('change',()=>{if(x.checked&&suspend)suspend.checked=false}));});
      container.querySelectorAll('[data-save-user-permissions]').forEach(button=>button.onclick=async()=>{const box=button.closest('[data-user-permissions]');const permissions=[...box.querySelectorAll('input:checked')].map(x=>x.value);button.disabled=true;button.textContent='Saving…';try{await setUserPermissions(button.dataset.saveUserPermissions,permissions);button.textContent='Saved';setTimeout(()=>loadEditorPeople(),500);}catch(error){alert(error.message);button.disabled=false;button.textContent='Save access';}});
    }

    async function setUserPermissions(userId, permissions) {
      editorStatusElement("Updating access…");
      await editorRequest("/rest/v1/rpc/set_user_permissions", {method:"POST",body:JSON.stringify({p_user_id:userId,p_permissions:permissions.length?permissions:["member"]})});
      editorStatusElement("User access updated.","success");
      await loadEditorDashboard();
    }

    function editableSectionTitle(icon, title, p, section) {
      return `<div class="clean-section-title">
        <span class="section-icon">${cleanIcon(icon)}</span>
        <h2>${esc(title)}</h2>
        ${editorCanEdit() ? `<button class="section-edit-button" type="button"
          data-edit-section="${esc(section)}" data-pad-id="${esc(p._id)}">✎ Edit</button>` : ""}
      </div>`;
    }

    function smartRewriteDirections(source, roadSequence = "") {
      const original = normalize(source);
      if (!original) return "";

      const protectedValues = [];
      const protect = value => {
        const token = `__BRINE_VALUE_${protectedValues.length}__`;
        protectedValues.push(value);
        return token;
      };

      let text = original
        .replace(/\r\n?/g, "\n")
        .replace(/(\d)\.(\d)/g, protect)
        .replace(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/g, protect)
        .replace(/[•●▪◦]/g, "\n")
        .replace(/\s*→\s*/g, "\n")
        .replace(/\s*;\s*/g, "\n")
        .replace(/\.(?=[A-Za-z])/g, ". ")
        .replace(/,\s*(?=(?:then\s+)?(?:turn|take|continue|follow|head|go|keep|bear|merge|exit|cross|pass|enter|stay|drive|proceed)\b)/gi, ". ")
        .replace(/\bthen\s+(?=(?:turn|take|continue|follow|head|go|keep|bear|merge|exit|cross|pass|enter|stay|drive|proceed)\b)/gi, ". Then ")
        .replace(/\bI\s*[- ]?\s*(\d+)\b/gi, "I-$1")
        .replace(/\bU\.?\s*S\.?\s*(?:Route|Rt\.?|Rte\.?|Hwy\.?)?\s*[- ]?\s*(\d+)\b/gi, "US-$1")
        .replace(/\bState\s*(?:Route|Rt\.?|Rte\.?)\s*[- ]?\s*(\d+)\b/gi, "State Route $1")
        .replace(/\bSR\s*[- ]?\s*(\d+)\b/gi, "State Route $1")
        .replace(/\bCR\s*[- ]?\s*(\d+)\b/gi, "County Road $1")
        .replace(/\bTR\s*[- ]?\s*(\d+)\b/gi, "Township Road $1")
        .replace(/\bTwp\.?\s*Rd\.?\s*[- ]?\s*(\d+)\b/gi, "Township Road $1")
        .replace(/\bCo\.?\s*Rd\.?\s*[- ]?\s*(\d+)\b/gi, "County Road $1")
        .replace(/\bapprox\.?\b/gi, "approximately")
        .replace(/\bmi\.?\b/gi, "miles")
        .replace(/\bft\.?\b/gi, "feet")
        .replace(/\bRd\.(?=\s|$)/gi, "Road")
        .replace(/\bHwy\.(?=\s|$)/gi, "Highway")
        .replace(/\bAve\.(?=\s|$)/gi, "Avenue")
        .replace(/\bBlvd\.(?=\s|$)/gi, "Boulevard")
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .trim();

      protectedValues.forEach((value, index) => {
        text = text.replaceAll(`__BRINE_VALUE_${index}__`, value);
      });

      let fragments = text
        .split(/\n+|(?<!\d)\.(?!\d)/)
        .map(value => value.trim().replace(/^[,;:\-–—\s]+|[,;:\-–—\s]+$/g, ""))
        .filter(Boolean);

      const actionPattern = /\b(turn|take|continue|follow|head|go|keep|bear|merge|exit|cross|pass|enter|stay|drive|proceed|start|travel|arrive|park|stop)\b/ig;
      const expanded = [];
      for (const fragment of fragments) {
        const matches = [...fragment.matchAll(actionPattern)];
        if (matches.length <= 1) {
          expanded.push(fragment);
          continue;
        }
        let last = 0;
        for (let index = 1; index < matches.length; index++) {
          const cut = matches[index].index;
          const segment = fragment.slice(last, cut).trim().replace(/[,:;\-–—]+$/g, "");
          if (segment) expanded.push(segment);
          last = cut;
        }
        const finalSegment = fragment.slice(last).trim();
        if (finalSegment) expanded.push(finalSegment);
      }
      fragments = expanded;

      const routeRoads = normalize(roadSequence)
        .split(/\s*→\s*|\n+/)
        .map(value => decodeDirectionMeta(value.trim()).instruction)
        .filter(Boolean);

      if (fragments.length <= 1 && routeRoads.length > 1) {
        fragments = routeRoads.map((road, index) => {
          if (index === 0) return `Start on ${road}`;
          if (index === routeRoads.length - 1) return `Continue to ${road}`;
          return `Continue onto ${road}`;
        });
      }

      const warningPattern = /\b(caution|warning|watch|narrow|steep|sharp|blind|one[- ]lane|washout|low bridge|weight limit|restricted|do not|avoid|closed|closure|mud|rough|soft shoulder|school|church|no turnaround|radio|cb channel|gate code|locked gate|call before|danger|hazard|yield)\b/i;
      const arrivalPattern = /\b(arrive|arrival|destination|pad entrance|lease entrance|facility entrance|site entrance|lease road|well pad|gate is|pad is|facility is|entrance is|on the left|on your left|on the right|on your right|last driveway|first driveway)\b/i;
      const drivingPattern = /\b(turn|take|continue|follow|head|go|keep|bear|merge|exit|cross|pass|enter|stay|drive|proceed|start|travel)\b/i;

      const warnings = [];
      const arrivals = [];
      const routeSteps = [];
      const notes = [];
      const seen = new Set();

      const cleanSentence = value => {
        let sentence = value.replace(/\s+/g, " ").trim();
        sentence = sentence.replace(/^then\s+/i, "Then ");
        sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
        if (!/[.!?]$/.test(sentence)) sentence += ".";
        return sentence;
      };

      for (const fragment of fragments) {
        const sentence = cleanSentence(fragment);
        const key = sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);

        if (warningPattern.test(sentence)) warnings.push(sentence);
        else if (arrivalPattern.test(sentence)) arrivals.push(sentence);
        else if (drivingPattern.test(sentence)) routeSteps.push(sentence);
        else notes.push(sentence);
      }

      if (!routeSteps.length && notes.length) {
        routeSteps.push(...notes.splice(0));
      }

      const sections = [];
      if (routeRoads.length > 1) {
        sections.push(`Saved road sequence reference:\n${routeRoads.join(" → ")}`);
      }
      if (warnings.length) {
        sections.push(`Important before driving:\n${warnings.map(value => `• ${value}`).join("\n")}`);
      }
      if (routeSteps.length) {
        sections.push(`Step-by-step directions:\n${routeSteps.map((value, index) => `${index + 1}. ${value}`).join("\n")}`);
      }
      if (arrivals.length) {
        sections.push(`Arrival details:\n${arrivals.map(value => `• ${value}`).join("\n")}`);
      }
      if (notes.length) {
        sections.push(`Other saved details:\n${notes.map(value => `• ${value}`).join("\n")}`);
      }

      const result = sections.join("\n\n").trim();
      return result || cleanSentence(original);
    }

    function liveEditorField(label, name, value, options = {}) {
      const wide = options.wide ? " wide" : "";
      const help = options.help ? `<div class="live-editor-help">${esc(options.help)}</div>` : "";
      const id = `live-${name}`;
      if (options.textarea) {
        return `<div class="live-editor-field${wide}">
          <label for="${id}">${esc(label)}</label>
          <textarea id="${id}" name="${esc(name)}" class="${options.tall ? "tall" : ""}">${esc(normalize(value))}</textarea>${help}
        </div>`;
      }
      return `<div class="live-editor-field${wide}">
        <label for="${id}">${esc(label)}</label>
        <input id="${id}" name="${esc(name)}" value="${esc(normalize(value))}" ${options.required ? "required" : ""}
          ${options.inputmode ? `inputmode="${esc(options.inputmode)}"` : ""}>${help}
      </div>`;
    }

    function closeLivePadEditor() {
      document.getElementById("liveEditorShell")?.remove();
      document.body.style.overflow = "";
    }
