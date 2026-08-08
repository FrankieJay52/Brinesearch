    /* Driver-facing official-data summary. This reads only official evidence
       already attached to the public pad record; private review candidates and
       conflicts never appear here. */
    const publicDataPadCardBaseV1736 = renderPad;

    function publicDataPadCardDateV1736(value) {
      const raw = normalize(value);
      if (!raw) return "";
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return raw;
      return date.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
    }

    function publicDataPadCardSummaryV1736(p) {
      const official = fieldOfficialPad(p);
      if (!official) return null;
      const wells = Array.isArray(p?.official_well_records) ? p.official_well_records : [];
      const statuses = wells.map(w => normalize(w?.well_status).toLowerCase());
      const producing = statuses.filter(s => /producing|active production/.test(s)).length;
      const active = statuses.filter(s => /producing|drilling|well drilled|completed|active/.test(s)).length;
      const permitted = statuses.filter(s => /permit|not drilled/.test(s)).length;
      const latest = [
        official.matched_on,
        p?.researchDate,
        ...wells.map(w => w?.checked),
        ...wells.map(w => w?.completion_date),
        ...wells.map(w => w?.permit_approved_date),
        ...wells.map(w => w?.latest_production_date)
      ].filter(Boolean).map(value => ({ value, time:new Date(value).getTime() })).filter(x => Number.isFinite(x.time)).sort((a,b) => b.time-a.time)[0]?.value || official.matched_on || p?.researchDate || "";
      const officialPadName = normalize(official.pad_name);
      const brineSearchPadName = normalize(p?.padName || p?.name || p?.pad_name);
      const officialNameDiffers = Boolean(officialPadName && brineSearchPadName && officialPadName.toLowerCase() !== brineSearchPadName.toLowerCase());
      const officialCounty = normalize(official.county) || normalize(p?.county);
      const officialTownship = normalize(official.township);
      const officialLocation = [
        officialCounty && `${display(officialCounty)} County`,
        officialTownship && `${display(officialTownship)} Township`
      ].filter(Boolean).join(" · ");
      const permit = normalize(official.pad_permit);
      const matchMethod = normalize(official.match_method);
      const api = fieldApiSummary(p);
      let apiText = "";
      let apiTone = "";
      if (api.savedCount > 0) {
        const extras = [];
        if (api.unmatchedCount > 0) extras.push(`${api.unmatchedCount} review`);
        if (api.pendingCount > 0) extras.push(`${api.pendingCount} pending`);
        apiText = `${api.exact}/${api.savedCount} matched${extras.length ? ` · ${extras.join(" · ")}` : ""}`;
        apiTone = api.exact === api.savedCount ? "exact" : "review";
      }
      return {
        official,
        wells,
        operator: normalize(official.operator) || display(p.company),
        officialPadName,
        officialNameDiffers,
        officialLocation,
        permit,
        matchMethod,
        apiText,
        apiTone,
        status: normalize(official.pad_status) || normalize(p.operatingStatus) || "Not listed",
        producing,
        active,
        permitted,
        latest,
        source: fieldOfficialSourceRecord(p, official)
      };
    }

    function publicDataPadCardHtmlV1736(p) {
      const data = publicDataPadCardSummaryV1736(p);
      if (!data) return "";
      const wellCount = data.wells.length;
      const sourceLabel = data.source?.agency || padVerificationSource(p);
      const latestLabel = publicDataPadCardDateV1736(data.latest) || "Not listed";
      const context = [
        data.officialLocation ? `<div><small>Official location</small><strong>${esc(data.officialLocation)}</strong></div>` : "",
        data.permit ? `<div><small>Pad permit</small><strong>${esc(data.permit)}</strong></div>` : "",
        data.apiText ? `<div class="public-pad-data-api-${esc(data.apiTone)}"><small>Saved API check</small><strong>${esc(data.apiText)}</strong></div>` : "",
        data.matchMethod ? `<div><small>Official match basis</small><strong>${esc(data.matchMethod)}</strong></div>` : ""
      ].filter(Boolean).join("");
      return `<section class="public-pad-data-card" id="publicPadDataCard">
        <div class="public-pad-data-head">
          <div><span class="public-pad-data-kicker">✓ OFFICIAL PUBLIC DATA</span><h2>Current Pad Snapshot</h2></div>
          <span class="field-status-chip ${fieldOperatingTone(data.status)}">${esc(data.status)}</span>
        </div>
        <div class="public-pad-data-identity">
          <div class="public-pad-data-operator"><small>Official operator</small><strong>${esc(data.operator)}</strong></div>
          ${data.officialNameDiffers ? `<div class="public-pad-data-official-name"><small>Official pad name</small><strong>${esc(data.officialPadName)}</strong></div>` : ""}
        </div>
        <div class="public-pad-data-stats">
          <div><strong>${wellCount}</strong><span>Official wells linked</span></div>
          <div><strong>${data.producing}</strong><span>Producing</span></div>
          <div><strong>${data.active}</strong><span>Active / current</span></div>
          <div><strong>${data.permitted}</strong><span>Permitted / not drilled</span></div>
        </div>
        ${context ? `<div class="public-pad-data-context">${context}</div>` : ""}
        <div class="public-pad-data-meta">
          <span><small>Latest public check</small><strong>${esc(latestLabel)}</strong></span>
          <span><small>Source</small><strong>${esc(sourceLabel)}</strong></span>
        </div>
        <button class="btn secondary wide public-pad-data-details" type="button" id="publicPadDataDetails">Public Data / Well Details</button>
        <p>The official name may include operator naming, unit codes, or former names. Official pad centers and wellheads are reference data only; your saved driver/navigation point is unchanged.</p>
      </section>`;
    }

    renderPad = async function publicDataPadCardRenderV1736(id) {
      const result = await publicDataPadCardBaseV1736(id);
      const p = padById(id);
      if (!p) return result;
      document.getElementById("publicPadDataCard")?.remove();
      const html = publicDataPadCardHtmlV1736(p);
      if (!html) return result;
      const wells = document.querySelector(".compact-wells-section");
      const directions = document.querySelector(".compact-directions");
      const anchor = wells || directions;
      if (anchor) anchor.insertAdjacentHTML("afterend", html);
      document.getElementById("publicPadDataDetails")?.addEventListener("click", () => {
        const officialDetails = [...document.querySelectorAll(".field-reference-details")].find(node => /Official Public Pad Information/i.test(node.textContent || ""));
        if (officialDetails) {
          officialDetails.open = true;
          officialDetails.scrollIntoView({ behavior:"smooth", block:"start" });
        }
      });
      return result;
    };
