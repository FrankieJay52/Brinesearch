    function alignedWellRows(p) {
      const wells = splitMulti(p.wellName);
      const apis = splitMulti(p.api);
      const props = splitMulti(p.property);
      const length = Math.max(wells.length, apis.length, props.length);
      return Array.from({ length }, (_, i) => ({
        well: wells[i] || '—',
        api: apis[i] || '—',
        property: props[i] || '—'
      })).filter(row => row.well !== '—' || row.api !== '—' || row.property !== '—');
    }

    function renderWellTable(p) {
      const rows = alignedWellRows(p);
      return `
        <div class="well-table-card">
          <div class="well-table-head">
            <div class="well-head-label">Well Name</div>
            <div class="well-head-label">API</div>
            <div class="well-head-label">Property</div>
          </div>
          ${rows.map(row => `
            <div class="well-table-row">
              <div class="well-cell ${row.well === '—' ? 'well-empty' : ''}">${esc(row.well)}</div>
              <div class="well-cell ${row.api === '—' ? 'well-empty' : ''}">${esc(row.api)}</div>
              <div class="well-cell ${row.property === '—' ? 'well-empty' : ''}">${esc(row.property)}</div>
            </div>`).join('')}
        </div>`;
    }

    function cleanIcon(name) {
      const icons = {
        location: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
        well: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12M8 3v6l-3 4v8h14v-8l-3-4V3M9 13h6M9 17h6"/></svg>`,
        route: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 3-3v-6a3 3 0 0 1 3-3"/></svg>`,
        directions: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 18-8-8 18-2-8-8-2Z"/><path d="m11 13 4-4"/></svg>`,
        map: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/></svg>`,
        edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>`
      };
      return icons[name] || icons.location;
    }

    function cleanInfoRow(label, value, rawHtml = false) {
      if (!has(value)) return "";
      return `<div class="clean-info-row">
        <div class="clean-info-label">${esc(label)}</div>
        <div class="clean-info-value">${rawHtml ? value : esc(display(value))}</div>
      </div>`;
    }

    function cleanSectionTitle(icon, title) {
      return `<div class="clean-section-title">
        <span class="section-icon">${cleanIcon(icon)}</span>
        <h2>${esc(title)}</h2>
      </div>`;
    }


    function editTextValue(value) {
      return normalize(value);
    }

    function editMultiValue(value) {
      return normalize(value)
        .split("|")
        .map(item => item.trim())
        .filter(Boolean)
        .join("\n");
    }

    function normalizeEditedMulti(value) {
      return normalize(value)
        .split(/\n|\|/)
        .map(item => item.trim())
        .filter(Boolean)
        .join(" | ");
    }

    function normalizeEditedRoute(value) {
      return normalize(value)
        .split(/\n|→/)
        .map(item => item.trim())
        .filter(Boolean)
        .join(" → ");
    }

    function closePadEditor(force = false) {
      const shell = document.getElementById("padEditorShell");
      if (shell && !force && shell.dataset.dirty === "true" && !confirm("Discard unsaved changes?")) return;
      if (shell) shell.remove();
      document.body.style.overflow = "";
    }

    function persistPadEdit(id, patch) {
      savedPadEdits[id] = patch;
      try {
        localStorage.setItem(PAD_EDIT_STORAGE_KEY, JSON.stringify(savedPadEdits));
        return true;
      } catch {
        return false;
      }
    }

    function resetPadEdit(id) {
      if (!savedPadEdits[id]) return;
      if (!confirm("Reset this pad to the original database information?")) return;

      delete savedPadEdits[id];
      try {
        localStorage.setItem(PAD_EDIT_STORAGE_KEY, JSON.stringify(savedPadEdits));
      } catch {}
      closePadEditor(true);
      location.reload();
    }

    function openPadEditor(id) {
      const p = padById(id);
      if (!p) return;

      closePadEditor();
      document.body.style.overflow = "hidden";

      const shell = document.createElement("div");
      shell.className = "pad-editor-shell";
      shell.id = "padEditorShell";
      shell.innerHTML = `
        <div class="pad-editor-backdrop" data-close-editor></div>
        <section class="pad-editor-panel" role="dialog" aria-modal="true" aria-label="Edit pad">
          <header class="pad-editor-header">
            <div>
              <div class="pad-editor-kicker">Pad editor</div>
              <h2>${esc(display(p.padName))}</h2>
              <div class="pad-editor-dirty" id="padEditorDirty">Unsaved changes</div>
            </div>
            <button class="pad-editor-close" type="button" data-close-editor aria-label="Close editor"><span class="fm-icon fm-close"></span></button>
          </header>

          <nav class="pad-editor-tabs" aria-label="Editor sections">
            <button class="pad-editor-tab active" type="button" data-editor-tab="general">General</button>
            <button class="pad-editor-tab" type="button" data-editor-tab="directions">Directions</button>
            <button class="pad-editor-tab" type="button" data-editor-tab="roads">Roads</button>
            ${p.recordType !== "disposal" ? `<button class="pad-editor-tab" type="button" data-editor-tab="wells">Wells</button>` : ""}
            <button class="pad-editor-tab" type="button" data-editor-tab="coordinates">Coordinates</button>
            <button class="pad-editor-tab" type="button" data-editor-tab="verification">Verification</button>
            <button class="pad-editor-tab" type="button" data-editor-tab="history">History</button>
          </nav>

          <form class="pad-editor-form" id="padEditorForm">
            <p class="pad-editor-note">Edit one section at a time. Save Changes applies everything across all tabs.</p>

            <section class="pad-editor-panel-page active" data-editor-panel="general">
              <h3 class="pad-editor-section-title">General information</h3>
              <div class="pad-editor-grid">
                <div class="pad-editor-field"><label for="editPadName">Pad name</label><input id="editPadName" name="padName" value="${esc(editTextValue(p.padName))}" required></div>
                <div class="pad-editor-field"><label for="editCompany">Company</label><input id="editCompany" name="company" value="${esc(editTextValue(p.company))}"></div>
                <div class="pad-editor-field"><label for="editState">State</label><input id="editState" name="state" value="${esc(editTextValue(p.state))}"></div>
                <div class="pad-editor-field"><label for="editCounty">County</label><input id="editCounty" name="county" value="${esc(editTextValue(p.county))}"></div>
                <div class="pad-editor-field"><label for="editTownship">Township / city</label><input id="editTownship" name="township" value="${esc(editTextValue(p.township))}"></div>
                <div class="pad-editor-field"><label for="editAddress">Address</label><input id="editAddress" name="address" value="${esc(editTextValue(p.address))}"></div>
              </div>
            </section>

            <section class="pad-editor-panel-page" data-editor-panel="directions">
              <h3 class="pad-editor-section-title">Directions</h3>
              <p class="pad-editor-section-copy">Update the route sequence and saved field directions.</p>
              <div class="pad-editor-grid">
                <div class="pad-editor-field wide"><label for="editRoadSequence">Road sequence</label><textarea id="editRoadSequence" name="Structured_Road_Sequence">${esc(editTextValue(p.Structured_Road_Sequence))}</textarea><div class="pad-editor-help">Use arrows or put each road on its own line.</div></div>
                <div class="pad-editor-field wide"><label for="editWrittenDirections">Written directions</label><textarea class="tall" id="editWrittenDirections" name="writtenDirections">${esc(editTextValue(p.writtenDirections))}</textarea></div>
              </div>
            </section>


            <section class="pad-editor-panel-page" data-editor-panel="roads">
              <h3 class="pad-editor-section-title">Roads</h3>
              <p class="pad-editor-section-copy">Choose standardized road records instead of retyping the same road on every pad. Adding a road also appends its official display name to the road sequence.</p>
              <div class="road-picker-box">
                <h4>Road Database</h4>
                <input class="road-picker-search" id="padRoadPickerSearch" placeholder="Search OH-800, CR-5, Denham Rd…" autocomplete="off">
                <div class="road-picker-results" id="padRoadPickerResults"><div class="pad-editor-help">Start typing to find a road.</div></div>
                <div class="road-linked-list" id="padRoadLinkedList"></div>
                <div style="margin-top:10px"><a class="btn secondary small" href="#/settings/roads">Open Road Manager</a></div>
              </div>
            </section>

            ${p.recordType !== "disposal" ? `<section class="pad-editor-panel-page" data-editor-panel="wells">
              <h3 class="pad-editor-section-title">Wells and identifiers</h3>
              <div class="pad-editor-grid">
                <div class="pad-editor-field"><label for="editWellName">Well names</label><textarea id="editWellName" name="wellName">${esc(editMultiValue(p.wellName))}</textarea><div class="pad-editor-help">One well per line.</div></div>
                <div class="pad-editor-field"><label for="editApi">API numbers</label><textarea id="editApi" name="api">${esc(editMultiValue(p.api))}</textarea><div class="pad-editor-help">Keep lines in the same order as wells.</div></div>
                <div class="pad-editor-field wide"><label for="editProperty">Property numbers</label><textarea id="editProperty" name="property">${esc(editMultiValue(p.property))}</textarea></div>
              </div>
            </section>` : ""}

            <section class="pad-editor-panel-page" data-editor-panel="coordinates">
              <h3 class="pad-editor-section-title">Coordinates</h3>
              <p class="pad-editor-section-copy">Enter both values together. Use the GPS capture tool on the pad page for a fresh phone reading.</p>
              <div class="pad-editor-grid">
                <div class="pad-editor-field"><label for="editLatitude">Latitude</label><input id="editLatitude" name="latitude" inputmode="decimal" value="${esc(editTextValue(p.latitude))}"></div>
                <div class="pad-editor-field"><label for="editLongitude">Longitude</label><input id="editLongitude" name="longitude" inputmode="decimal" value="${esc(editTextValue(p.longitude))}"></div>
              </div>
            </section>

            <section class="pad-editor-panel-page" data-editor-panel="verification">
              <h3 class="pad-editor-section-title">Verification</h3>
              <div id="padEditorVerification"><div class="pad-quality-note">Loading verification status…</div></div>
            </section>

            <section class="pad-editor-panel-page" data-editor-panel="history">
              <h3 class="pad-editor-section-title">Record history</h3>
              <div class="pad-editor-history-card">
                <strong>Created:</strong> ${esc(p.created_at ? padVerificationDate(p.created_at) : "Not recorded")}<br>
                <strong>Last updated:</strong> ${esc(p.updated_at || p.lastUpdatedDate ? padVerificationDate(p.updated_at || p.lastUpdatedDate) : "Not recorded")}<br>
                <strong>Last updated by:</strong> ${esc(display(p.lastUpdatedBy || "Not recorded"))}<br><br>
                Verification activity is shown in the Verification tab. A complete before-and-after edit audit remains available through the owner/editor activity tools.
              </div>
            </section>

            <div class="pad-editor-error" id="padEditorError"></div>
          </form>

          <footer class="pad-editor-footer">
            <div class="pad-editor-footer-left">${savedPadEdits[id] ? `<button class="pad-editor-button danger" id="resetPadEdit" type="button">Reset pad</button>` : ""}</div>
            <div class="pad-editor-footer-right">
              <button class="pad-editor-button" type="button" data-close-editor>Cancel</button>
              <button class="pad-editor-button primary" type="submit" form="padEditorForm">Save Changes</button>
            </div>
          </footer>
        </section>`

      document.body.appendChild(shell);
      shell.dataset.dirty = "false";

      const activateEditorTab = name => {
        shell.querySelectorAll("[data-editor-tab]").forEach(btn => btn.classList.toggle("active", btn.dataset.editorTab === name));
        shell.querySelectorAll("[data-editor-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.editorPanel === name));
        shell.querySelector(".pad-editor-panel")?.scrollTo({ top: 0, behavior: "smooth" });
        if (name === "verification" && p._dbId) loadPadVerification(p, document.getElementById("padEditorVerification"));
      };
      shell.querySelectorAll("[data-editor-tab]").forEach(btn => btn.addEventListener("click", () => activateEditorTab(btn.dataset.editorTab)));
      setupPadRoadPicker(p);

      shell.querySelectorAll("[data-close-editor]").forEach(element => {
        element.addEventListener("click", () => closePadEditor(false));
      });

      document.getElementById("resetPadEdit")?.addEventListener("click", () => resetPadEdit(id));

      const form = document.getElementById("padEditorForm");
      const error = document.getElementById("padEditorError");
      const dirtyLabel = document.getElementById("padEditorDirty");
      form.addEventListener("input", () => { shell.dataset.dirty = "true"; dirtyLabel?.classList.add("show"); });
      form.addEventListener("change", () => { shell.dataset.dirty = "true"; dirtyLabel?.classList.add("show"); });

      form.addEventListener("submit", event => {
        event.preventDefault();
        error.classList.remove("show");
        error.textContent = "";

        const formData = new FormData(form);
        const padName = normalize(formData.get("padName"));
        const latitudeText = normalize(formData.get("latitude"));
        const longitudeText = normalize(formData.get("longitude"));

        if (!padName) {
          error.textContent = "Pad name is required.";
          error.classList.add("show");
          return;
        }

        if ((latitudeText && !longitudeText) || (!latitudeText && longitudeText)) {
          error.textContent = "Enter both latitude and longitude, or leave both blank.";
          error.classList.add("show");
          return;
        }

        const latitude = latitudeText ? Number(latitudeText) : null;
        const longitude = longitudeText ? Number(longitudeText) : null;

        if (latitudeText && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
          error.textContent = "Latitude must be a number between -90 and 90.";
          error.classList.add("show");
          return;
        }

        if (longitudeText && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
          error.textContent = "Longitude must be a number between -180 and 180.";
          error.classList.add("show");
          return;
        }

        const patch = {
          padName,
          company: normalize(formData.get("company")),
          state: normalize(formData.get("state")),
          county: normalize(formData.get("county")),
          township: normalize(formData.get("township")),
          address: normalize(formData.get("address")),
          latitude,
          longitude,
          Structured_Road_Sequence: normalizeEditedRoute(formData.get("Structured_Road_Sequence")),
          writtenDirections: normalize(formData.get("writtenDirections"))
        };

        if (p.recordType !== "disposal") {
          patch.wellName = normalizeEditedMulti(formData.get("wellName"));
          patch.api = normalizeEditedMulti(formData.get("api"));
          patch.property = normalizeEditedMulti(formData.get("property"));
        }

        const persisted = persistPadEdit(id, patch);
        Object.assign(p, patch);
        shell.dataset.dirty = "false";
        closePadEditor(true);
        renderPad(id);
        showToast(persisted ? "Pad updated" : "Updated for this session");
      });

      if (window.matchMedia("(min-width: 701px)").matches) setTimeout(() => document.getElementById("editPadName")?.focus(), 70);
    }


    // ---------- Secure editor accounts and live section editing ----------
    const EDITOR_SESSION_KEY = "brinesearch.editorSession.v1";
    let editorSession = null;
    let editorProfile = null;

    const VERIFICATION_PAGE_SIZE = 25;
    let verificationState = {
      reviewStatus: "unreviewed",
      state: "all",
      result: "all",
      recordType: "all",
      search: "",
      offset: 0,
      total: 0,
      loading: false
    };
    let verificationRows = [];
    let verificationSummary = null;
    let editorDashboardData = null;

    function loadEditorSession() {
      try {
        const value = JSON.parse(localStorage.getItem(EDITOR_SESSION_KEY) || "null");
        return value && value.access_token ? value : null;
      } catch {
        return null;
      }
    }

    function saveEditorSession(value) {
      editorSession = value && value.access_token ? value : null;
      if (editorSession) localStorage.setItem(EDITOR_SESSION_KEY, JSON.stringify(editorSession));
      else localStorage.removeItem(EDITOR_SESSION_KEY);
      updateEditorButton();
    }

    function editorPermissions() {
      const values = Array.isArray(editorProfile?.permissions) ? editorProfile.permissions : [];
      if (values.length) return values.map(value => String(value).toLowerCase());
      const role = String(editorProfile?.role || "member").toLowerCase();
      if (role === "owner") return ["owner","administrator","moderator","editor"];
      if (role === "administrator") return ["administrator","moderator","editor"];
      if (role === "editor") return ["editor"];
      return [role || "member"];
    }
