    /* BrineSearch V17.3.11 — audited well-list display safety.
       The production data layer now stores one synchronized row per well. Keep
       unresolved rows visibly in Review instead of rendering a naked dash as a
       well name or implying that a name-only legacy row is verified. */

    fieldWellCards = function fieldWellCardsV17311(p) {
      const officialRows = Array.isArray(p?.official_well_records) ? p.official_well_records : [];
      const officialMap = new Map(officialRows.map(row => [fieldApiKey(row?.api), row]));
      const summary = fieldApiSummary(p);
      const unmatched = new Set(summary.unmatched.map(fieldApiKey));

      return alignedWellRows(p).map((row, index) => {
        const apiMissing = !row.api || row.api === "—";
        const nameMissing = !row.well || row.well === "—";
        const apiKey = fieldApiKey(row.api);
        const official = apiKey ? officialMap.get(apiKey) : null;
        let badgeText = "Saved";
        let badgeClass = "saved";

        if (official) {
          badgeText = "✓ Verified";
          badgeClass = "exact";
        } else if (apiMissing || nameMissing || unmatched.has(apiKey)) {
          badgeText = "Review";
          badgeClass = "pending";
        }

        const displayWell = nameMissing && !apiMissing ? "Name needs review" : (row.well || "—");
        const nameClass = nameMissing && !apiMissing ? " well-name-review-placeholder" : "";
        const officialNameDiffers = official?.well_name
          && normalize(official.well_name).toLowerCase() !== normalize(row.well).toLowerCase();
        const detail = [
          officialNameDiffers ? `<div><b>Official well:</b> ${esc(official.well_name)}</div>` : "",
          official?.operator ? `<div><b>Operator:</b> ${esc(official.operator)}</div>` : "",
          official?.well_status ? `<div><b>Status:</b> ${esc(official.well_status)}</div>` : "",
          !official && nameMissing && !apiMissing ? `<div><b>Review:</b> This saved API does not have a confirmed official well name yet.</div>` : "",
          !official && apiMissing && !nameMissing ? `<div><b>Review:</b> This saved well name does not have a confirmed API number yet.</div>` : ""
        ].filter(Boolean).join("");

        return `<details class="compact-well-row">
          <summary>
            <span class="compact-well-index">${index + 1}</span>
            <span class="compact-well-name"><strong class="${nameClass.trim()}">${esc(displayWell)}</strong><small class="${badgeClass}">${esc(badgeText)}</small></span>
            <span class="compact-well-api">${esc(row.api || "—")}</span>
            <span class="compact-well-property">${esc(row.property || "—")}</span>
            <span class="compact-well-chevron">›</span>
          </summary>
          ${detail ? `<div class="compact-well-detail">${detail}</div>` : ""}
        </details>`;
      }).join("");
    };
