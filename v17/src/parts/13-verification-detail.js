
    function closeVerificationDetail() {
      document.getElementById("verificationDetailShell")?.remove();
      document.body.style.overflow = "";
    }

    function verificationConflictMarkup(conflicts = {}) {
      const entries = Object.entries(conflicts || {});
      if (!entries.length) return `<p class="muted">No direct field conflicts were flagged by this audit.</p>`;
      return entries.map(([field,value]) => `
        <div class="verification-conflict-card">
          <strong>${esc(field.replaceAll("_"," "))}</strong>
          <div>${esc(verificationValue(value))}</div>
        </div>`).join("");
    }

    function verificationEvidenceLabel(value) {
      const labels = {
        coordinate_boundary_verified:"Saved point located inside an official boundary",
        saved_county_differs_from_coordinates:"Saved county differs from the coordinate boundary",
        saved_township_missing:"Township can be filled from the saved coordinates",
        saved_township_differs_from_coordinates:"Saved township differs from the coordinate boundary",
        saved_api_validated_by_geography:"Saved API agrees with location evidence",
        probable_api_county_code_typo:"Likely API county-code typo",
        saved_api_conflicts_with_location:"Saved API conflicts with the saved location",
        official_well_near_saved_point:"Official well is near the saved point",
        operator_name_differs:"Official operator differs from the company listing",
        no_v2_candidate_selected:"No reliable multi-signal well match was selected"
      };
      return labels[value] || String(value || "").replaceAll("_"," ");
    }

    function verificationAlternativeMarkup(items = []) {
      if (!Array.isArray(items) || !items.length) return `<p class="muted">No other useful official candidates were close enough to compare.</p>`;
      return `<div class="verification-alternative-list">${items.map(item => {
        const official = item.official_data || {};
        const name = official.well_name || official.pad_or_lease_name || "Unnamed official record";
        const place = [official.county, official.township].filter(Boolean).join(" / ");
        const signals = [
          item.saved_api_exact ? "Exact saved API" : null,
          item.saved_api_suffix_match ? "Same permit suffix" : null,
          item.coordinate_county_match === true ? "County agrees" : item.coordinate_county_match === false ? "County differs" : null,
          item.coordinate_township_match === true ? "Township agrees" : null,
          item.operator_consistent === true ? "Operator agrees" : null
        ].filter(Boolean);
        return `<article class="verification-alternative-card">
          <div class="verification-alternative-head"><strong>${esc(name)}</strong><span>${Math.round(Number(item.score || 0)*100)}% evidence score</span></div>
          <div class="verification-alternative-meta">
            ${item.source ? `<span>${esc(item.source)}</span>` : ""}
            ${item.api ? `<span>API: ${esc(item.api)}</span>` : ""}
            ${place ? `<span>${esc(place)}</span>` : ""}
            ${item.distance_miles !== null && item.distance_miles !== undefined ? `<span>${esc(item.distance_miles)} mi from saved point</span>` : ""}
          </div>
          ${signals.length ? `<div class="verification-chips" style="margin-top:8px">${signals.map(signal => `<span class="verification-chip">${esc(signal)}</span>`).join("")}</div>` : ""}
        </article>`;
      }).join("")}</div>`;
    }

    async function openVerificationDetail(padId) {
      if (!editorIsOwner()) {
        openEditorAuth("Owner access is required for verification review.");
        return;
      }
      closeVerificationDetail();
      document.body.style.overflow = "hidden";

      const shell = document.createElement("div");
      shell.className = "verification-detail-shell";
      shell.id = "verificationDetailShell";
      shell.innerHTML = `<section class="verification-detail-panel"><div class="verification-loading">Loading the saved and official records…</div></section>`;
      document.body.appendChild(shell);

      try {
        const data = await editorRequest("/rest/v1/rpc/verification_review_detail", {
          method:"POST", body:JSON.stringify({ p_pad_id:padId })
        });
        const detail = Array.isArray(data) ? data[0] : data;
        try {
          const analysisData = await editorRequest("/rest/v1/rpc/verification_review_analysis", {
            method:"POST", body:JSON.stringify({ p_pad_id:padId })
          });
          detail.analysis = Array.isArray(analysisData) ? analysisData[0] : analysisData;
        } catch (analysisError) {
          detail.analysis = {};
        }
        renderVerificationDetail(detail);
      } catch (error) {
        shell.innerHTML = `<section class="verification-detail-panel"><div class="verification-empty">${esc(error.message || "The record could not be loaded.")}</div><div class="verification-detail-actions"><button class="btn ghost" type="button" data-close-verification-detail>Close</button></div></section>`;
      }
    }

    function renderVerificationDetail(detail) {
      const shell = document.getElementById("verificationDetailShell");
      if (!shell || !detail) return;
      const saved = detail.saved || {};
      const audit = detail.audit || {};
      const official = audit.official_data || {};
      const review = detail.review || null;
      const analysis = detail.analysis || {};
      const geography = analysis.coordinate_geography || {};
      const v2Evidence = analysis.v2_evidence || {};
      const alternatives = Array.isArray(analysis.alternative_matches) ? analysis.alternative_matches : [];
      const evidenceFlags = Array.isArray(v2Evidence.evidence_flags)
        ? v2Evidence.evidence_flags
        : (Array.isArray(official.evidence_flags) ? official.evidence_flags : []);
      const corrections = verificationCorrectionEntries(audit.suggested_changes || {});
      const missing = Array.isArray(audit.missing_fields) ? audit.missing_fields : [];
      const fieldOnly = Array.isArray(audit.field_only_fields) ? audit.field_only_fields : [];
      const officialApi = verificationOfficialValue(official,["official_api","api","permit_number"]);
      const officialName = verificationOfficialValue(official,["official_well_or_pad","official_well_or_facility","well_name","well_pad_name","lease_name","site_name"]);
      const officialOperator = verificationOfficialValue(official,["official_operator","operator"]);
      const officialCounty = verificationOfficialValue(official,["official_county","county"]);
      const officialTownship = verificationOfficialValue(official,["official_township_or_municipality","official_township","township","tax_district","municipality"]);
      const officialStatus = verificationOfficialValue(official,["official_status","status","well_status"]);
      const coordinateCounty = geography.county || official.coordinate_county;
      const coordinateTownship = geography.township || official.coordinate_township;
      const boundarySource = geography.source || official.coordinate_boundary_source;
      const apiGeographyCheck = v2Evidence.api_geography_consistent ?? official.api_geography_consistent;
      const evidenceScore = v2Evidence.selected_match_score ?? audit.match_confidence;
      const selectionMethod = v2Evidence.selected_match_method || official.selection_reason || audit.match_method;
      const currentDecision = review?.decision || "unreviewed";

      shell.innerHTML = `
        <section class="verification-detail-panel" role="dialog" aria-modal="true" aria-label="Verification review">
          <header class="verification-detail-head">
            <div>
              <div class="eyebrow">${esc(saved.company || "Unknown company")} · ${esc(saved.state || "State unknown")}</div>
              <h2>${esc(saved.pad_name || "Unnamed record")}</h2>
              <div class="verification-record-meta">
                <span class="verify-badge ${verificationAuditClass(audit.audit_status)}">${esc(audit.audit_status || "No audit status")}</span>
                <span class="verify-badge ${verificationReviewClass(currentDecision)}">${esc(verificationReviewLabel(currentDecision))}</span>
                ${audit.match_confidence !== null && audit.match_confidence !== undefined ? `<span>Confidence: ${Math.round(Number(audit.match_confidence)*100)}%</span>` : ""}
              </div>
            </div>
            <button class="icon-btn" type="button" data-close-verification-detail aria-label="Close verification review"><span class="fm-icon fm-close"></span></button>
          </header>

          <div class="verification-detail-body">
            <div class="verification-warning"><strong>Two different coordinate uses:</strong> the saved BrineSearch point is used to determine its county, township, or municipality boundary. The official well coordinate normally identifies a wellhead. The system never replaces the saved entrance or pad point with a wellhead automatically.</div>

            <section class="verification-section">
              <h3>Coordinate geography and match evidence</h3>
              <div class="verification-geography-card">
                <section class="verification-column">
                  <h3>Saved point boundary</h3>
                  <dl>${verificationDataRows([
                    ["Boundary source",boundarySource],
                    ["County",coordinateCounty],
                    ["Township / municipality",coordinateTownship],
                    ["Method",geography.method || "Point inside official boundary"]
                  ])}</dl>
                </section>
                <section class="verification-column">
                  <h3>Why this match was selected</h3>
                  <dl>${verificationDataRows([
                    ["Selection method",selectionMethod],
                    ["Evidence score",evidenceScore !== null && evidenceScore !== undefined ? `${Math.round(Number(evidenceScore)*100)}%` : null],
                    ["API vs. location",apiGeographyCheck === true ? "Consistent" : apiGeographyCheck === false ? "Conflict detected" : "Not enough evidence"],
                    ["Name similarity",v2Evidence.name_similarity !== null && v2Evidence.name_similarity !== undefined ? `${Math.round(Number(v2Evidence.name_similarity)*100)}%` : official.name_similarity !== undefined ? `${Math.round(Number(official.name_similarity)*100)}%` : null]
                  ])}</dl>
                </section>
              </div>
              ${evidenceFlags.length ? `<div class="verification-chips" style="margin-top:10px">${evidenceFlags.map(flag => `<span class="verification-chip ${String(flag).includes("conflict") || String(flag).includes("differs") ? "bad" : String(flag).includes("typo") || String(flag).includes("missing") ? "warn" : "good"}">${esc(verificationEvidenceLabel(flag))}</span>`).join("")}</div>` : ""}
              <p class="verification-evidence-note">County and township suggestions come from the saved point inside an official boundary. Well and API suggestions require several signals to agree.</p>
            </section>

            <div class="verification-compare">
              <section class="verification-column">
                <h3>Saved BrineSearch information</h3>
                <dl>${verificationDataRows([
                  ["Name",saved.pad_name],
                  ["Company",saved.company],
                  ["County",saved.county],
                  ["Township",saved.township],
                  ["Address",saved.address],
                  ["Coordinates",verificationCoordinates(saved)],
                  ["Well",saved.well_name],
                  ["API",saved.api],
                  ["Property",saved.property_number],
                  ["Road sequence",saved.road_sequence]
                ])}</dl>
              </section>
              <section class="verification-column">
                <h3>Official source match</h3>
                <dl>${verificationDataRows([
                  ["Source",audit.official_source],
                  ["Match method",audit.match_method],
                  ["Official name",officialName],
                  ["Operator",officialOperator],
                  ["County",officialCounty],
                  ["Township / municipality",officialTownship],
                  ["Coordinates",verificationCoordinates(official,true)],
                  ["API / permit",officialApi],
                  ["Status",officialStatus],
                  ["Wellhead distance",official.wellhead_distance_miles !== undefined ? `${official.wellhead_distance_miles} miles` : null]
                ])}</dl>
              </section>
            </div>

            <section class="verification-section">
              <h3>Conflicts and warnings</h3>
              ${verificationConflictMarkup(audit.conflicts || {})}
            </section>

            <section class="verification-section">
              <h3>Other official candidates considered</h3>
              <p class="muted">These are the next-best nearby or API-related records. They help show why the selected match won and prevent one field from deciding everything.</p>
              ${verificationAlternativeMarkup(alternatives)}
            </section>

            <section class="verification-section">
              <h3>Missing and field-only information</h3>
              <div class="verification-chips">
                ${missing.length ? missing.map(value => `<span class="verification-chip">Missing: ${esc(String(value).replaceAll("_"," "))}</span>`).join("") : `<span class="verification-chip">No missing-field flags</span>`}
                ${fieldOnly.map(value => `<span class="verification-chip">Field/company only: ${esc(String(value).replaceAll("_"," "))}</span>`).join("")}
              </div>
            </section>

            <section class="verification-section">
              <h3>Safe correction choices</h3>
              <p class="muted">These choices are supported by coordinate boundaries and official well evidence. Select only the fields you want to change. Coordinates, addresses, property numbers, gate details, and truck directions still require field or company confirmation.</p>
              <div class="verification-corrections">
                ${corrections.length ? corrections.map(item => `
                  <label class="verification-correction">
                    <input type="checkbox" data-verification-change="${esc(item.field)}" data-verification-value="${esc(item.value)}">
                    <span><strong>Use ${esc(item.label)}</strong><small>${esc(item.value)}</small></span>
                  </label>`).join("") : `<div class="verification-empty">No safe automatic correction is suggested for this record.</div>`}
              </div>
            </section>

            <section class="verification-section verification-note">
              <h3>Owner note</h3>
              <textarea id="verificationOwnerNote" placeholder="Example: Entrance pin confirmed in the field, keep saved coordinates.">${esc(review?.reviewer_note || "")}</textarea>
              ${audit.audit_note ? `<p class="muted">Audit note: ${esc(audit.audit_note)}</p>` : ""}
            </section>
          </div>

          <footer class="verification-detail-actions">
            <div class="verification-detail-status" id="verificationDetailStatus"></div>
            <a class="btn ghost" href="#/pad/${encodeURIComponent(saved.legacy_id || "")}" data-open-reviewed-pad>Open pad</a>
            ${review ? `<button class="btn ghost" type="button" data-verification-decision="clear_review">Clear review</button>` : ""}
            <button class="btn ghost" type="button" data-verification-decision="keep_saved">Keep saved information</button>
            <button class="btn secondary" type="button" data-verification-decision="field_check">Needs field check</button>
            <button class="btn primary" type="button" data-verification-decision="approved_correction"${corrections.length ? "" : " disabled"}>Approve selected correction</button>
          </footer>
        </section>`;

      shell.querySelector("[data-open-reviewed-pad]")?.addEventListener("click", () => closeVerificationDetail());
      shell.querySelectorAll("[data-verification-decision]").forEach(button => {
        button.addEventListener("click", () => submitVerificationDecision(detail.pad_id, button.dataset.verificationDecision));
      });
    }

    async function submitVerificationDecision(padId, decision) {
      const shell = document.getElementById("verificationDetailShell");
      const status = document.getElementById("verificationDetailStatus");
      if (!shell || !status) return;
      const note = normalize(document.getElementById("verificationOwnerNote")?.value);
      const changes = {};
      shell.querySelectorAll("[data-verification-change]:checked").forEach(input => {
        changes[input.dataset.verificationChange] = input.dataset.verificationValue;
      });

      if (decision === "approved_correction" && !Object.keys(changes).length) {
        status.textContent = "Select at least one correction first.";
        status.classList.add("error");
        return;
      }

      status.classList.remove("error");
      status.textContent = decision === "approved_correction" ? "Applying the selected correction…" : "Saving the review decision…";
      shell.classList.add("verification-detail-busy");

      try {
        await ensureEditorSession();
        await editorRequest("/rest/v1/rpc/verification_review_decide", {
          method:"POST",
          body:JSON.stringify({
            p_pad_id:padId,
            p_decision:decision,
            p_note:note || null,
            p_changes:changes
          })
        });
        closeVerificationDetail();
        await Promise.all([loadVerificationSummary(), loadVerificationQueue()]);
        showToast(decision === "approved_correction" ? "Correction approved and saved live" : decision === "field_check" ? "Marked for a field check" : decision === "keep_saved" ? "Saved information kept" : "Review cleared");
      } catch (error) {
        shell.classList.remove("verification-detail-busy");
        status.textContent = error.message || "The review decision could not be saved.";
        status.classList.add("error");
      }
    }
