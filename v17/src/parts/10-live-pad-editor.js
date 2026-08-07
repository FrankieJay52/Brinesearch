    function requireEditorAccess() {
      if (!editorSession) {
        openEditorAuth("Sign in before editing the live directory.");
        return false;
      }
      if (!editorCanEdit()) {
        openEditorAuth("Your editor account is waiting for owner approval.");
        return false;
      }
      return true;
    }

    function editorFieldsForSection(p, section, clearerDraft = "") {
      const fields = [];
      if (section === "identity" || section === "all") {
        fields.push(liveEditorField("Pad or facility name", "padName", p.padName, { required:true }));
        fields.push(liveEditorField("Company", "company", p.company, { required:true }));
        fields.push(liveEditorField("State", "state", p.state, { required:true }));
      }
      if (section === "location" || section === "all") {
        if (section !== "all") fields.push(liveEditorField("State", "state", p.state, { required:true }));
        fields.push(liveEditorField("County", "county", p.county));
        fields.push(liveEditorField("Township", "township", p.township));
        fields.push(liveEditorField("Address", "address", p.address, { wide:true }));
        fields.push(liveEditorField("Latitude", "latitude", p.latitude, { inputmode:"decimal" }));
        fields.push(liveEditorField("Longitude", "longitude", p.longitude, { inputmode:"decimal" }));
        fields.push(`<div class="live-editor-field wide coordinate-capture-tools">
          <button class="btn secondary" id="captureLiveCoordinates" type="button"><span class="fm-icon fm-gps"></span> Capture current coordinates</button>
          <span class="coordinate-capture-status" id="liveCoordinateCaptureStatus">Use while stopped at the ${isDisposal(p) ? "disposal location" : "lease entrance or pad"}.</span>
        </div>`);
      }
      if ((section === "well" || section === "all") && !isDisposal(p)) {
        fields.push(liveEditorField("Well names", "wellName", editMultiValue(p.wellName), {
          textarea:true, help:"Enter one well per line."
        }));
        fields.push(liveEditorField("API numbers", "api", editMultiValue(p.api), {
          textarea:true, help:"Keep each API on the same line as its well."
        }));
        fields.push(liveEditorField("Property numbers", "property", editMultiValue(p.property), {
          textarea:true, wide:true, help:"Keep each property number on the same line as its well."
        }));
      }
      if (section === "route" || section === "all") {
        fields.push(liveEditorField("Road sequence", "Structured_Road_Sequence", p.Structured_Road_Sequence, {
          textarea:true, wide:true, help:"Use arrows or one road per line. Do not add roads that are not confirmed."
        }));
      }
      if (section === "directions" || section === "all") {
        fields.push(liveEditorField("Original written directions", "writtenDirections", p.writtenDirections, {
          textarea:true, tall:true, wide:true
        }));
        fields.push(liveEditorField("Saved clearer version (manual only)", "directionsClear", p.directionsClear, {
          textarea:true, tall:true, wide:true,
          help:"The AI rewrite preview never fills or saves this field. Only text you manually type or paste here is included when you tap Save live changes."
        }));
      }
      return fields.join("");
    }

    function captureLiveEditorCoordinates(p) {
      const button = document.getElementById("captureLiveCoordinates");
      const status = document.getElementById("liveCoordinateCaptureStatus");
      const latitudeInput = document.getElementById("live-latitude");
      const longitudeInput = document.getElementById("live-longitude");
      const locationLabel = isDisposal(p) ? "disposal location" : "lease entrance or pad";

      if (!latitudeInput || !longitudeInput) return;
      if (!navigator.geolocation) {
        if (status) {
          status.textContent = "This browser cannot capture location.";
          status.className = "coordinate-capture-status error";
        }
        return;
      }

      if (button) {
        button.disabled = true;
        button.textContent = "Capturing…";
      }
      if (status) {
        status.textContent = "Waiting for iPhone location permission and GPS…";
        status.className = "coordinate-capture-status";
      }

      navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        const accuracy = Math.round(position.coords.accuracy);
        latitudeInput.value = lat;
        longitudeInput.value = lng;
        latitudeInput.dispatchEvent(new Event("input", { bubbles:true }));
        longitudeInput.dispatchEvent(new Event("input", { bubbles:true }));
        if (status) {
          status.textContent = `Captured ${lat}, ${lng} · accuracy about ${accuracy} meters. Tap Save live changes to update this ${locationLabel}.`;
          status.className = "coordinate-capture-status success";
        }
        if (button) {
          button.disabled = false;
          button.innerHTML = `<span class="fm-icon fm-gps"></span> Capture again`;
        }
      }, error => {
        const messages = {
          1: "Location permission was denied. Allow location access for BrineSearch in Safari settings.",
          2: "Your current location could not be determined.",
          3: "Location capture timed out. Try again while outdoors or near a window."
        };
        if (status) {
          status.textContent = messages[error.code] || "Location capture failed.";
          status.className = "coordinate-capture-status error";
        }
        if (button) {
          button.disabled = false;
          button.innerHTML = `<span class="fm-icon fm-gps"></span> Try capture again`;
        }
      }, { enableHighAccuracy:true, timeout:20000, maximumAge:0 });
    }

    function openLivePadEditor(id, section = "all", clearerDraft = "") {
      const p = padById(id);
      if (!p) return;
      if (!p._dbId || DATA_SOURCE_LABEL !== "Live database") {
        showToast("Live database connection is required to edit.");
        return;
      }
      if (!requireEditorAccess()) return;

      closeLivePadEditor();
      const stepForSection = {
        identity:0, location:1, well:2, route:3, directions:3, all:0
      };
      let liveEditorStep = stepForSection[section] ?? 0;
      const liveEditorSteps = [
        { key:"basics", title:"Basic pad information", help:"Update the pad name, company, state, county, and township." },
        { key:"location", title:"Entrance and location", help:"Update the truck entrance address or capture accurate coordinates." },
        { key:"wells", title:"Wells and official numbers", help:isDisposal(p) ? "Well information is not required for a disposal location." : "Keep each well, API, and property number on matching lines." },
        { key:"directions", title:"Roads and directions", help:"Build the road sequence and keep the saved driver directions clear." },
        { key:"review", title:"Review and save", help:"Review the information, verification status, and record history before saving." }
      ];

      const shell = document.createElement("div");
      shell.className = "live-editor-shell live-editor-wizard-shell";
      shell.id = "liveEditorShell";
      shell.innerHTML = `
        <section class="live-editor-panel live-editor-wizard-panel" role="dialog" aria-modal="true" aria-label="Edit ${esc(display(p.padName))}">
          <header class="live-editor-head">
            <div>
              <div class="eyebrow">Live database edit</div>
              <h2>${esc(display(p.padName))}</h2>
              <p>Update the pad one simple step at a time.</p>
            </div>
            <button class="icon-btn" id="closeLiveEditor" type="button" aria-label="Close editor"><span class="fm-icon fm-close"></span></button>
          </header>
          <form id="liveEditorForm" novalidate>
            <nav class="live-editor-steps" id="liveEditorSteps" aria-label="Edit pad steps">
              <button class="live-editor-step" type="button" data-live-editor-step="0" aria-label="Step 1: Basics"><span class="wizard-step-number">1</span><span class="wizard-step-label">Basics</span></button>
              <button class="live-editor-step" type="button" data-live-editor-step="1" aria-label="Step 2: Location"><span class="wizard-step-number">2</span><span class="wizard-step-label">Location</span></button>
              <button class="live-editor-step" type="button" data-live-editor-step="2" aria-label="Step 3: Wells"><span class="wizard-step-number">3</span><span class="wizard-step-label">Wells</span></button>
              <button class="live-editor-step" type="button" data-live-editor-step="3" aria-label="Step 4: Directions"><span class="wizard-step-number">4</span><span class="wizard-step-label">Directions</span></button>
              <button class="live-editor-step" type="button" data-live-editor-step="4" aria-label="Step 5: Review"><span class="wizard-step-number">5</span><span class="wizard-step-label">Review</span></button>
            </nav>
            <div class="live-editor-body">
              <div class="live-editor-wizard-title">
                <div><h3 id="liveEditorStepTitle"></h3><p id="liveEditorStepHelp"></p></div>
                <span id="liveEditorStepCount">Step 1 of 5</span>
              </div>

              <section class="live-editor-step-panel" data-live-editor-panel="basics">
                <div class="live-editor-grid">
                  ${liveEditorField("Pad or facility name", "padName", p.padName, { required:true })}
                  ${liveEditorField("Company", "company", p.company, { required:true })}
                  ${liveEditorField("State", "state", p.state, { required:true })}
                  ${liveEditorField("County", "county", p.county)}
                  ${liveEditorField("Township", "township", p.township, { wide:true })}
                </div>
              </section>

              <section class="live-editor-step-panel" data-live-editor-panel="location">
                <div class="live-editor-grid">
                  ${liveEditorField("Lease or facility address", "address", p.address, { wide:true })}
                  ${liveEditorField("Latitude", "latitude", p.latitude, { inputmode:"decimal" })}
                  ${liveEditorField("Longitude", "longitude", p.longitude, { inputmode:"decimal" })}
                  <div class="live-editor-field wide coordinate-capture-tools">
                    <button class="btn secondary" id="captureLiveCoordinates" type="button"><span class="fm-icon fm-gps"></span> Capture current coordinates</button>
                    <span class="coordinate-capture-status" id="liveCoordinateCaptureStatus">Use while stopped at the ${isDisposal(p) ? "disposal location" : "lease entrance or pad"}.</span>
                  </div>
                </div>
              </section>

              <section class="live-editor-step-panel" data-live-editor-panel="wells">
                ${isDisposal(p) ? `<div class="live-editor-empty-step"><strong>No wells needed</strong><span>This record is a disposal location, so you can continue to Directions.</span></div>` : `
                <div class="live-editor-grid">
                  ${liveEditorField("Well names", "wellName", editMultiValue(p.wellName), { textarea:true, help:"Enter one well per line." })}
                  ${liveEditorField("API numbers", "api", editMultiValue(p.api), { textarea:true, help:"Keep each API on the same line as its well." })}
                  ${liveEditorField("Property numbers", "property", editMultiValue(p.property), { textarea:true, wide:true, help:"Keep each property number on the same line as its well." })}
                </div>`}
              </section>

              <section class="live-editor-step-panel" data-live-editor-panel="directions">
                <div class="live-editor-grid" id="liveEditorDirectionsGrid">
                  ${liveEditorField("Road sequence", "Structured_Road_Sequence", p.Structured_Road_Sequence, { textarea:true, wide:true, help:"Use the Directions Wizard or enter roads with arrows or one road per line." })}
                  ${liveEditorField("Original written directions", "writtenDirections", p.writtenDirections, { textarea:true, tall:true, wide:true })}
                  ${liveEditorField("Saved clearer version (manual only)", "directionsClear", clearerDraft || p.directionsClear, { textarea:true, tall:true, wide:true, help:"Only text you manually type or paste here is saved." })}
                </div>
                <div class="direction-tools" style="margin-top:12px">
                  <button class="rewrite-button" id="rewriteInsideEditor" type="button">✨ AI rewrite preview</button>
                  <span class="direction-warning">Temporary preview only. It is never included in Save live changes.</span>
                </div>
                <div class="rewrite-preview not-saved" id="liveRewritePreview" hidden></div>
              </section>

              <section class="live-editor-step-panel" data-live-editor-panel="review">
                <div class="live-editor-review-grid" id="liveEditorReviewSummary"></div>
                <section class="live-editor-review-section">
                  <h3>Verification</h3>
                  <div id="liveEditorVerification"><div class="pad-quality-note">Loading verification status…</div></div>
                </section>
                <section class="live-editor-review-section">
                  <h3>Record history</h3>
                  <div class="live-editor-history-card">
                    <strong>Created:</strong> ${esc(p.created_at ? padVerificationDate(p.created_at) : "Not recorded")}<br>
                    <strong>Last updated:</strong> ${esc(p.updated_at || p.lastUpdatedDate ? padVerificationDate(p.updated_at || p.lastUpdatedDate) : "Not recorded")}<br>
                    <strong>Last updated by:</strong> ${esc(display(p.lastUpdatedBy || "Not recorded"))}
                  </div>
                </section>
              </section>

              <div class="live-editor-error" id="liveEditorError"></div>
            </div>
            <footer class="live-editor-foot live-editor-wizard-foot">
              <div class="live-editor-foot-group">
                <button class="btn ghost" id="liveEditorBack" type="button">← Back</button>
                <button class="btn ghost" id="cancelLiveEditor" type="button">Cancel</button>
              </div>
              <div class="live-editor-foot-group">
                <button class="btn secondary" id="liveEditorNext" type="button">Next →</button>
                <button class="btn primary" id="saveLiveEditor" type="submit">Save live changes</button>
              </div>
            </footer>
          </form>
        </section>`;
      document.body.appendChild(shell);
      document.body.style.overflow = "hidden";
      setupDirectionWizard(p, "all");

      const panels = [...shell.querySelectorAll("[data-live-editor-panel]")];
      const stepButtons = [...shell.querySelectorAll("[data-live-editor-step]")];
      const panel = shell.querySelector(".live-editor-panel");
      const buildLiveEditorReview = () => {
        const form = document.getElementById("liveEditorForm");
        if (!form) return;
        const data = new FormData(form);
        const value = name => normalize(data.get(name));
        const wellCount = isDisposal(p) ? 0 : Math.max(
          value("wellName").split(/\n|\|/).filter(Boolean).length,
          value("api").split(/\n|\|/).filter(Boolean).length,
          value("property").split(/\n|\|/).filter(Boolean).length
        );
        const location = [value("county"), value("township"), value("state")].filter(Boolean).join(" · ") || "Not provided";
        const coordinates = [value("latitude"), value("longitude")].filter(Boolean).join(", ") || "Not provided";
        const items = [
          ["Pad", `${value("company") || "Company missing"} · ${value("padName") || "Name missing"}`],
          ["Location", location],
          ["Entrance", value("address") || coordinates],
          ["Wells", isDisposal(p) ? "Not required for disposal" : (wellCount ? `${wellCount} well entr${wellCount === 1 ? "y" : "ies"}` : "No wells listed")],
          ["Directions", value("Structured_Road_Sequence") || value("writtenDirections") || "Not provided"]
        ];
        const host = document.getElementById("liveEditorReviewSummary");
        if (host) host.innerHTML = items.map(([label,text]) => `<div class="live-editor-review-card"><strong>${esc(label)}</strong><span>${esc(text)}</span></div>`).join("");
      };
      const renderLiveEditorStep = nextStep => {
        liveEditorStep = Math.max(0, Math.min(liveEditorSteps.length - 1, Number(nextStep) || 0));
        const step = liveEditorSteps[liveEditorStep];
        panels.forEach((item, index) => item.classList.toggle("active", index === liveEditorStep));
        stepButtons.forEach((button, index) => {
          button.classList.toggle("active", index === liveEditorStep);
          button.classList.toggle("done", index < liveEditorStep);
          button.setAttribute("aria-current", index === liveEditorStep ? "step" : "false");
        });
        document.getElementById("liveEditorStepTitle").textContent = step.title;
        document.getElementById("liveEditorStepHelp").textContent = step.help;
        document.getElementById("liveEditorStepCount").textContent = `Step ${liveEditorStep + 1} of ${liveEditorSteps.length}`;
        const back = document.getElementById("liveEditorBack");
        const next = document.getElementById("liveEditorNext");
        const footer = shell.querySelector(".live-editor-wizard-foot");
        if (back) back.classList.toggle("hide", liveEditorStep === 0);
        if (next) next.classList.toggle("hide", liveEditorStep === liveEditorSteps.length - 1);
        footer?.classList.toggle("first-step", liveEditorStep === 0);
        footer?.classList.toggle("last-step", liveEditorStep === liveEditorSteps.length - 1);
        if (liveEditorStep === 4) {
          buildLiveEditorReview();
          loadPadVerification(p, document.getElementById("liveEditorVerification"));
        }
        panel?.scrollTo({ top:0, left:0, behavior:"auto" });
      };

      stepButtons.forEach(button => button.addEventListener("click", () => renderLiveEditorStep(button.dataset.liveEditorStep)));
      document.getElementById("liveEditorBack")?.addEventListener("click", () => renderLiveEditorStep(liveEditorStep - 1));
      document.getElementById("liveEditorNext")?.addEventListener("click", () => renderLiveEditorStep(liveEditorStep + 1));
      document.getElementById("closeLiveEditor").addEventListener("click", closeLivePadEditor);
      document.getElementById("cancelLiveEditor").addEventListener("click", closeLivePadEditor);
      document.getElementById("captureLiveCoordinates")?.addEventListener("click", () => captureLiveEditorCoordinates(p));
      document.getElementById("rewriteInsideEditor")?.addEventListener("click", () => {
        const original = document.getElementById("live-writtenDirections")?.value || p.writtenDirections;
        const rewritten = smartRewriteDirections(
          original,
          document.getElementById("live-Structured_Road_Sequence")?.value || p.Structured_Road_Sequence
        );
        const preview = document.getElementById("liveRewritePreview");
        if (!preview) return;
        preview.hidden = false;
        preview.innerHTML = `
          <div class="rewrite-preview-badge">Temporary · not saved</div>
          <div class="direction-label">AI rewrite preview</div>
          <p class="direction-text">${esc(rewritten)}</p>
          <div class="direction-warning">This preview is separate from every form field and cannot be saved by the Save live changes button.</div>
          <div class="rewrite-preview-actions">
            <button class="btn small secondary" id="copyLiveRewrite" type="button">Copy preview</button>
            <button class="btn small ghost" id="hideLiveRewrite" type="button">Hide preview</button>
          </div>`;
        document.getElementById("copyLiveRewrite")?.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(rewritten); showToast("Rewrite preview copied"); }
          catch { showToast("Press and hold the preview to copy it"); }
        });
        document.getElementById("hideLiveRewrite")?.addEventListener("click", () => { preview.hidden = true; });
        preview.scrollIntoView({ behavior:"smooth", block:"nearest" });
      });

      document.getElementById("liveEditorForm").addEventListener("submit", event => saveLivePadEdit(event, p, "all"));
      renderLiveEditorStep(liveEditorStep);
    }
