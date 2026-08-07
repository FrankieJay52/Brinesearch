    async function saveLivePadEdit(event, p, section) {
      event.preventDefault();
      const form = event.currentTarget;
      const error = document.getElementById("liveEditorError");
      const saveButton = document.getElementById("saveLiveEditor");
      error.textContent = "";

      const formData = new FormData(form);
      const hasField = name => form.elements.namedItem(name) !== null;
      const read = name => normalize(formData.get(name));
      const showStep = index => document.querySelector(`[data-live-editor-step="${index}"]`)?.click();
      const patch = {};

      if (hasField("padName")) {
        if (!read("padName")) { showStep(0); error.textContent = "Pad name is required."; return; }
        patch.pad_name = read("padName");
      }
      if (hasField("company")) {
        if (!read("company")) { showStep(0); error.textContent = "Company is required."; return; }
        patch.company = read("company");
      }
      if (hasField("state")) {
        if (!read("state")) { showStep(0); error.textContent = "State is required."; return; }
        patch.state = read("state");
      }
      if (hasField("county")) patch.county = read("county") || null;
      if (hasField("township")) patch.township = read("township") || null;
      if (hasField("address")) patch.address = read("address") || null;

      if (hasField("latitude") || hasField("longitude")) {
        const latText = hasField("latitude") ? read("latitude") : normalize(p.latitude);
        const lngText = hasField("longitude") ? read("longitude") : normalize(p.longitude);
        if ((latText && !lngText) || (!latText && lngText)) {
          showStep(1);
          error.textContent = "Enter both latitude and longitude, or leave both blank.";
          return;
        }
        if (latText) {
          const lat = Number(latText), lng = Number(lngText);
          if (!Number.isFinite(lat) || lat < -90 || lat > 90) { showStep(1); error.textContent = "Latitude must be between -90 and 90."; return; }
          if (!Number.isFinite(lng) || lng < -180 || lng > 180) { showStep(1); error.textContent = "Longitude must be between -180 and 180."; return; }
          patch.latitude = lat; patch.longitude = lng;
        } else {
          patch.latitude = null; patch.longitude = null;
        }
      }

      if (hasField("wellName")) patch.well_name = normalizeEditedMulti(formData.get("wellName")) || null;
      if (hasField("api")) patch.api = normalizeEditedMulti(formData.get("api")) || null;
      if (hasField("property")) patch.property_number = normalizeEditedMulti(formData.get("property")) || null;
      if (hasField("wellName") || hasField("api") || hasField("property")) {
        const splitLines = value => normalize(value).split(/\n|\s*\|\s*/).map(normalize).filter(Boolean);
        const names = splitLines(formData.get("wellName"));
        const apis = splitLines(formData.get("api"));
        const properties = splitLines(formData.get("property"));
        const count = Math.max(names.length, apis.length, properties.length);
        patch.well_entries = Array.from({ length: count }, (_, index) => ({
          well_name: names[index] || "",
          api: apis[index] || "",
          property_number: properties[index] || ""
        })).filter(entry => entry.well_name || entry.api || entry.property_number);
      }
      if (hasField("Structured_Road_Sequence")) patch.structured_road_sequence = normalizeEditedRoute(formData.get("Structured_Road_Sequence")) || null;
      if (hasField("writtenDirections")) patch.written_directions = read("writtenDirections") || null;
      if (hasField("directionsClear")) {
        patch.directions_clear = read("directionsClear") || null;
        patch.directions_clear_method = patch.directions_clear ? "BrineSearch smart rewrite reviewed by editor" : null;
      }

      if (!Object.keys(patch).length) {
        error.textContent = "There is nothing to save.";
        return;
      }

      saveButton.disabled = true;
      saveButton.textContent = "Saving…";
      document.getElementById("liveEditorShell")?.classList.add("live-editor-busy");

      try {
        await ensureEditorSession();
        const url = `/rest/v1/pads?id=eq.${encodeURIComponent(p._dbId)}&select=*`;
        const rows = await editorRequest(url, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(patch)
        });
        const updated = Array.isArray(rows) ? rows[0] : rows;
        if (!updated) throw new Error("The database did not return the updated pad.");
        Object.assign(p, mapSupabasePad(updated));
        closeLivePadEditor();
        renderPad(p._id);
        showToast("Live pad information updated");
      } catch (err) {
        error.textContent = err.message || "The change could not be saved.";
        saveButton.disabled = false;
        saveButton.textContent = "Save live changes";
        document.getElementById("liveEditorShell")?.classList.remove("live-editor-busy");
      }
    }

    function padMissingFields(p) {
      const fields = [];
      if (!has(p.address)) fields.push("address");
      if (!hasGps(p)) fields.push("complete GPS coordinates");
      if (!has(p.county)) fields.push("county");
      if (!has(p.township)) fields.push("township");
      if (!isDisposal(p) && !has(p.wellName)) fields.push("well name");
      if (!has(p.api)) fields.push("API number");
      if (!isDisposal(p) && !has(p.property)) fields.push("property number");
      if (!has(p.Structured_Road_Sequence)) fields.push("road sequence");
      if (!has(p.writtenDirections)) fields.push("written directions");
      return fields;
    }

    function padVerificationSource(p) {
      const state = normalize(p?.state).toLowerCase();
      if (state === "ohio") return "ODNR";
      if (state === "pennsylvania") return "PA DEP";
      if (state === "west virginia") return "WVGES";
      return "official state";
    }

    function fieldApiKey(value) {
      return normalize(value).replace(/\D/g, "");
    }

    function fieldOfficialPad(p) {
      return p?.official_pad_record && typeof p.official_pad_record === "object"
        ? p.official_pad_record : null;
    }

    function fieldApiSummary(p) {
      const saved = p?.api_verification_summary && typeof p.api_verification_summary === "object"
        ? p.api_verification_summary : {};
      const live = p?.live_odnr_unmatched_api_check && typeof p.live_odnr_unmatched_api_check === "object"
        ? p.live_odnr_unmatched_api_check : {};
      const savedCount = Number(saved.saved_api_count ?? live.saved_api_count ?? alignedWellRows(p).filter(row => row.api !== "—").length ?? 0);
      const exact = Number(saved.exact_odnr_matches ?? live.exact_odnr_matches ?? (Array.isArray(p?.official_well_records) ? p.official_well_records.length : 0));
      const unmatched = Array.isArray(saved.unmatched_saved_apis)
        ? saved.unmatched_saved_apis
        : (Array.isArray(live.unmatched_apis) ? live.unmatched_apis : []);
      return { savedCount, exact, unmatched, unmatchedCount:Number(live.unmatched_count ?? unmatched.length) };
    }

    function fieldSourceLabel(source) {
      if (typeof source === "string") return source;
      if (!source || typeof source !== "object") return "Official public record";
      return [source.agency, source.database || source.service, source.checked && `checked ${source.checked}`]
        .filter(Boolean).join(" · ") || source.type || "Official public record";
    }

    function fieldWellCards(p) {
      const officialRows = Array.isArray(p?.official_well_records) ? p.official_well_records : [];
      const officialMap = new Map(officialRows.map(row => [fieldApiKey(row?.api), row]));
      const summary = fieldApiSummary(p);
      const unmatched = new Set(summary.unmatched.map(fieldApiKey));
      return alignedWellRows(p).map((row, index) => {
        const official = officialMap.get(fieldApiKey(row.api));
        let badgeText = "Saved";
        let badgeClass = "saved";
        if (official) {
          badgeText = "✓ Verified";
          badgeClass = "exact";
        } else if (unmatched.has(fieldApiKey(row.api))) {
          badgeText = "Review";
          badgeClass = "pending";
        }
        const officialNameDiffers = official?.well_name && normalize(official.well_name).toLowerCase() !== normalize(row.well).toLowerCase();
        const detail = [
          officialNameDiffers ? `<div><b>Official well:</b> ${esc(official.well_name)}</div>` : "",
          official?.operator ? `<div><b>Operator:</b> ${esc(official.operator)}</div>` : "",
          official?.well_status ? `<div><b>Status:</b> ${esc(official.well_status)}</div>` : ""
        ].filter(Boolean).join("");
        return `<details class="compact-well-row">
          <summary>
            <span class="compact-well-index">${index + 1}</span>
            <span class="compact-well-name"><strong>${esc(row.well)}</strong><small class="${badgeClass}">${esc(badgeText)}</small></span>
            <span class="compact-well-api">${esc(row.api)}</span>
            <span class="compact-well-property">${esc(row.property || "—")}</span>
            <span class="compact-well-chevron">›</span>
          </summary>
          ${detail ? `<div class="compact-well-detail">${detail}</div>` : ""}
        </details>`;
      }).join("");
    }

    /* The saved road sequence is a single arrow-delimited string. A driver
       glancing at it needs to find "which road am I on now", so it renders as
       numbered rows rather than one wrapped run-on line. Anything that isn't
       clearly delimited falls back to the original single block. */
    function fieldRoadStepsHtml(value, p) {
      if (!has(value)) return "";
      return directionRoutesHtml(value, p);
    }

    /* Operating status was chipped green whatever the text said, so a plugged
       or inactive pad read as good news. */
    function fieldOperatingTone(value) {
      const text = normalize(value).toLowerCase();
      if (/active|producing|completed|verified|operating/.test(text)) return "good";
      if (/plugged|inactive|abandoned|closed|not drilled|never materialized/.test(text)) return "review";
      return "";
    }


    function padVerificationFieldLabel(field) {
      return ({gps_verified:"GPS",directions_verified:"Directions",wells_verified:"Wells",api_verified:"API numbers",property_verified:"Property numbers",roads_verified:"Road names"})[field] || field || "Verification";
    }

    function padVerificationDate(value) {
      if (!value) return "Not reviewed";
      const d=new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
    }

    function padVerificationPanelHtml(data, canEdit) {
      const fields=["gps_verified","directions_verified","wells_verified","api_verified","property_verified","roads_verified"];
      const score=Number(data?.score||0);
      const missing=fields.filter(field=>!data?.[field]);
      return `<div class="pad-quality-head"><div><h2>Pad updates needed</h2><div class="pad-quality-status">${data?.needs_field_check?"Field confirmation required":`${missing.length} item${missing.length===1?"":"s"} remaining`}</div></div><div class="pad-quality-score" style="--score:${score}"><strong>${score}%</strong></div></div>
        ${data?.needs_field_check?`<div class="pad-quality-warning"><strong>Needs field check.</strong>${data.review_note?` ${esc(data.review_note)}`:" A driver or trusted field source should confirm this record."}</div>`:""}
        ${missing.length?`<div class="pad-quality-grid">${missing.map(field=>`<div class="pad-quality-item"><span class="mark">!</span><span>${esc(padVerificationFieldLabel(field))}</span></div>`).join("")}</div>`:""}
        ${canEdit?`<div class="pad-quality-actions">${missing.map(field=>`<button class="btn secondary" type="button" data-pad-verify-field="${field}" data-pad-verify-value="true">Verify ${esc(padVerificationFieldLabel(field))}</button>`).join("")}${missing.length>1?`<button class="btn primary wide" type="button" data-pad-verify-action="verify_all">Verify all remaining items</button>`:""}<button class="btn secondary wide" type="button" data-pad-verify-action="needs_field_check">Mark needs field check</button></div>`:""}`;
    }

    async function loadPadVerification(pad, targetHost) {
      const host=targetHost || document.getElementById("padQualityPanel");
      if(!host) return;
      if(!pad?._dbId){host.hidden=false;host.innerHTML='<div class="pad-quality-note">Verification becomes available when this record is connected to the live database.</div>';return;}
      try{
        const data=await editorRequest('/rest/v1/rpc/pad_verification_get',{method:'POST',body:JSON.stringify({p_pad_id:pad._dbId})});
        const complete=Number(data?.score||0)===100 && !data?.needs_field_check;
        const shell=host.id==="padQualityPanel"?host:host.closest('.pad-quality-card');
        if(complete){
          host.innerHTML='';
          host.hidden=true;
          if(shell && shell!==host) shell.hidden=true;
          if(host.id==="padQualityPanel") host.hidden=true;
          return;
        }
        host.hidden=false;
        if(shell) shell.hidden=false;
        host.innerHTML=padVerificationPanelHtml(data,editorCanEdit());
        host.querySelectorAll('[data-pad-verify-field]').forEach(btn=>btn.onclick=async()=>{
          const field=btn.dataset.padVerifyField,value=btn.dataset.padVerifyValue==='true';
          btn.disabled=true;
          try{const next=await editorRequest('/rest/v1/rpc/pad_verification_set',{method:'POST',body:JSON.stringify({p_pad_id:pad._dbId,p_field:field,p_value:value,p_action:'set_field',p_note:null})});host.innerHTML=padVerificationPanelHtml(next,editorCanEdit());loadPadVerification(pad);}catch(e){alert(e.message);btn.disabled=false;}
        });
        host.querySelector('[data-pad-verify-action="verify_all"]')?.addEventListener('click',async()=>{
          if(!confirm('Mark every verification item for this pad as verified?'))return;
          try{await editorRequest('/rest/v1/rpc/pad_verification_set',{method:'POST',body:JSON.stringify({p_pad_id:pad._dbId,p_field:null,p_value:true,p_action:'verify_all',p_note:null})});loadPadVerification(pad);}catch(e){alert(e.message);}
        });
        host.querySelector('[data-pad-verify-action="needs_field_check"]')?.addEventListener('click',async()=>{
          const note=prompt('What needs checked in the field?','Directions, GPS, road access, or site conditions need confirmation.');if(note===null)return;
          try{await editorRequest('/rest/v1/rpc/pad_verification_set',{method:'POST',body:JSON.stringify({p_pad_id:pad._dbId,p_field:null,p_value:true,p_action:'needs_field_check',p_note:note})});loadPadVerification(pad);}catch(e){alert(e.message);}
        });
      }catch(e){host.innerHTML=`<div class="pad-quality-note">Verification status could not be loaded. ${esc(e.message||"")}</div>`;}
    }

    function renderPad(id) {
      const p = padById(id);
      if (!p) return renderNotFound();
      rememberRecentPad(id);

      const companyName = isDisposal(p) ? "Disposals" : display(p.company);
      const companyLabel = companyName === "Hg" ? "HG Energy" : companyName;
      const gmap = googleMapsUrl(p);
      const amap = appleMapsUrl(p);
      const navigationGps = padNavigationGps(p);
      const usingOfficialGps = navigationGps?.source === "official";
      const coordinateValue = padCoordinateText(p);
      const official = fieldOfficialPad(p);
      const officialPadName = normalize(official?.pad_name) || display(p.padName);
      const officialOperator = normalize(official?.operator) || companyLabel;
      const officialPadStatus = normalize(official?.pad_status) || normalize(p.operatingStatus) || "Status not listed";
      const apiSummary = fieldApiSummary(p);
      document.title = `${officialPadName} · ${officialOperator} · BrineSearch`;
      const sourceRows = Array.isArray(p.researchSources) ? p.researchSources : [];
      const cleanGeo = value => { const v = normalize(value); return v && v !== "." ? v : ""; };
      const formatGeoLabel = (value, kind = "") => {
        let v = cleanGeo(value);
        if (!v) return "";
        if (kind === "county") v = v.replace(/\s+county$/i, "");
        if (kind === "township") v = v.replace(/\s+(?:township|twp\.?)$/i, "");
        return v.toLowerCase().replace(/\b([a-z])/g, ch => ch.toUpperCase());
      };
      const location = [
        formatGeoLabel(p.county, "county"),
        formatGeoLabel(p.township, "township"),
        formatGeoLabel(p.state, "state")
      ].filter(Boolean).join(" · ");
      const status = officialPadStatus;
      const rawResearchStatus = normalize(p.researchStatus || p.verificationStatus);
      const researchLabel = rawResearchStatus === "no_reliable_official_pad_match"
        ? "Official match needs review"
        : rawResearchStatus.replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
      const researchTone = /verified|active|exact/i.test(rawResearchStatus) ? "good" : "review";
      const directionsText = has(p.directionsClear) ? p.directionsClear : "";
      const copyDirectionsText = has(p.Structured_Road_Sequence) ? directionCopyText(p.Structured_Road_Sequence, p) : directionsText;
      const wellRows = alignedWellRows(p);

      const officialInfo = official ? `
        <div class="field-official-grid">
          <div class="field-official-item full"><div class="field-label">OFFICIAL PAD NAME</div><div class="field-value">${esc(official.pad_name)}</div></div>
          <div class="field-official-item full"><div class="field-label">OFFICIAL OPERATOR</div><div class="field-value">${esc(official.operator)}</div></div>
          <div class="field-official-item"><div class="field-label">PAD STATUS</div><div class="field-value">${esc(official.pad_status)}</div></div>
          <div class="field-official-item"><div class="field-label">PAD PERMIT</div><div class="field-value">${esc(official.pad_permit ?? "Not listed")}</div></div>
          <div class="field-official-item full"><div class="field-label">OFFICIAL PAD ID</div><div class="field-value mono">${esc(official.pad_id)}</div></div>
          <div class="field-official-item"><div class="field-label">OFFICIAL COUNTY</div><div class="field-value">${esc(official.county)}</div></div>
          <div class="field-official-item"><div class="field-label">OFFICIAL TOWNSHIP</div><div class="field-value">${esc(official.township)}</div></div>
          <div class="field-official-item"><div class="field-label">OFFICIAL LATITUDE</div><div class="field-value mono">${esc(official.latitude)}</div></div>
          <div class="field-official-item"><div class="field-label">OFFICIAL LONGITUDE</div><div class="field-value mono">${esc(official.longitude)}</div></div>
          <div class="field-official-item"><div class="field-label">LOCATION SOURCE</div><div class="field-value">${esc(official.source_method)}</div></div>
          <div class="field-official-item"><div class="field-label">DISTANCE FROM SAVED POINT</div><div class="field-value">${official.distance_from_saved_miles !== null && official.distance_from_saved_miles !== undefined ? `${esc(official.distance_from_saved_miles)} mi` : "Not compared"}</div></div>
        </div>` : `<div class="empty">No official pad-level record is attached yet. Saved directions and field location remain available above.</div>`;

      app.innerHTML = `
        <div class="field-pad-page">
          <nav class="breadcrumb"><a href="#/">Search</a><span>›</span><a href="${routeUrl(`company/${encodeURIComponent(companyName)}`)}">${esc(companyLabel)}</a><span>›</span><span>${esc(officialPadName)}</span></nav>

          <section class="field-pad-hero">
            <div class="field-pad-top"><div class="field-pad-title"><div class="field-official-kicker">OFFICIAL PAD</div><h1>${esc(officialPadName)}</h1><div class="field-pad-company">${esc(officialOperator)} · ${isDisposal(p) ? "Disposal" : "Pad"}</div><div class="field-pad-location">${esc(location || "Location not listed")}</div></div>${companyLogoHtml(companyName,"title-logo pad-hero-logo")}</div>
            <div class="field-status-row"><span class="field-status-chip ${fieldOperatingTone(officialPadStatus)}">${esc(officialPadStatus)}</span>${researchLabel ? `<span class="field-status-chip ${researchTone}">${esc(researchLabel)}</span>` : ""}${usingOfficialGps ? `<span class="field-status-chip good">OFFICIAL GPS FALLBACK</span>` : ""}</div>
            <div class="field-main-actions">
              ${gmap ? `<a class="field-action primary field-action-visual field-action-directions" href="${esc(gmap)}" target="_blank" rel="noopener"><span class="field-action-emblem"><span class="fm-icon fm-directions-large"></span></span><span class="field-action-copy"><strong>Directions</strong><small>Open turn-by-turn navigation</small></span></a>` : `<span class="field-action is-unavailable"><span class="fm-icon fm-warning"></span> No GPS saved — use written directions below</span>`}
              ${amap ? `<a class="field-action field-action-visual" href="${esc(amap)}" target="_blank" rel="noopener"><span class="field-action-emblem"><span class="fm-icon fm-apple-maps-large"></span></span><span class="field-action-copy"><strong>Apple Maps</strong><small>Open this saved location</small></span></a>` : ""}
              <button class="field-action field-action-visual ${amap ? "" : "span-full"}" id="fieldSharePad" type="button"><span class="field-action-emblem"><span class="fm-icon fm-share-pad-large"></span></span><span class="field-action-copy"><strong>Share</strong><small>Post, send, or copy pad details</small></span></button>
              <button class="field-action span-full field-action-visual field-favorite-button ${isFavoritePad(p._id) ? "active" : ""}" id="fieldFavoritePad" type="button"><span class="field-action-emblem"><span class="fm-icon ${isFavoritePad(p._id) ? "fm-favorite-active-large" : "fm-favorite-large"}"></span></span><span class="field-action-copy"><strong>${isFavoritePad(p._id) ? "Favorited" : "Favorite"}</strong><small>${isFavoritePad(p._id) ? "Saved for offline and quick access" : "Save for offline and quick access"}</small></span></button>
              ${editorCanEdit() ? `<button class="field-action edit span-full field-action-visual" type="button" data-edit-section="all" data-pad-id="${esc(p._id)}"><span class="field-action-emblem"><span class="fm-icon fm-edit-pad-large"></span></span><span class="field-action-copy"><strong>Edit pad information</strong><small>Update directions, GPS, wells, and notes</small></span></button>` : ""}
            </div>
          </section>
          <section class="pad-quality-card" id="padQualityPanel"><div class="pad-quality-loading">Loading pad verification…</div></section>

          <details class="field-priority-card driver-directions compact-directions">
            <summary><span><strong>Directions</strong><small>${esc(has(p.Structured_Road_Sequence) ? directionSequenceSummary(p.Structured_Road_Sequence, p) : (directionsText ? directionsText.split(/[.\n]/)[0] : "No approved directions saved"))}</small></span><span class="compact-toggle-label">Show</span></summary>
            <div class="compact-directions-body">
              <div class="field-priority-head"><h2 class="sr-only-head">Directions</h2><button class="field-copy-button" id="fieldCopyDirections" type="button">Copy directions</button></div>
              ${fieldRoadStepsHtml(has(p.Structured_Road_Sequence) ? p.Structured_Road_Sequence : directionsText, p) || `<div class="empty">No approved route cards are available yet.</div>`}
            </div>
          </details>

          ${!isDisposal(p) && wellRows.length ? `<section class="field-priority-card compact-wells-section"><div class="field-priority-head"><h2>Wells</h2><span class="field-status-chip">${wellRows.length}</span></div><div class="compact-well-head"><span></span><span>Well</span><span>API number</span><span>Property</span><span></span></div><div class="field-well-list">${fieldWellCards(p)}</div></section>` : ""}

          <details class="field-reference-details">
            <summary><span class="field-reference-summary">Saved Field Location<small>Address, latitude, longitude, county, township</small></span></summary>
            <div class="field-reference-body">
              <div class="field-priority-head"><h2 class="sr-only-head">Saved Field Location</h2><button class="field-copy-button" id="fieldCopyLocation" type="button">Copy</button></div>
              <div class="field-location-mini">
                <div class="field-official-item"><div class="field-label">ADDRESS / LOCATION</div><div class="field-value">${esc(p.address || "No street address saved")}</div></div>
                <div class="field-official-item"><div class="field-label">LATITUDE</div><div class="field-value mono">${esc(p.latitude ?? "Not listed")}</div></div>
                <div class="field-official-item"><div class="field-label">LONGITUDE</div><div class="field-value mono">${esc(p.longitude ?? "Not listed")}</div></div>
                <div class="field-official-item"><div class="field-label">COUNTY</div><div class="field-value">${esc(cleanGeo(p.county) || "Not listed")}</div></div>
                <div class="field-official-item"><div class="field-label">TOWNSHIP</div><div class="field-value">${esc(cleanGeo(p.township) || "Not listed")}</div></div>
              </div>
            </div>
          </details>

          <details class="field-reference-details">
            <summary><span class="field-reference-summary">Official Public Pad Information<small>${official ? "Pad match found in the public record" : "No public pad record attached yet"}</small></span></summary>
            <div class="field-reference-body">
              <div class="field-priority-head"><h2 class="sr-only-head">Official Public Pad Information</h2><span class="field-status-chip ${official ? "good" : "review"}">${official ? "PAD MATCH FOUND" : "NOT ATTACHED"}</span></div>
              ${officialInfo}
              <p class="field-public-note">Official coordinates are used for map actions only when saved GPS is missing. They do not overwrite the lease entrance, driver route, or saved field location.</p>
            </div>
          </details>

          <details class="field-reference-details">
            <summary><span class="field-reference-summary">API Verification and Sources<small>${apiSummary.exact} of ${apiSummary.savedCount} saved API number${apiSummary.savedCount === 1 ? "" : "s"} matched to the public layer</small></span></summary>
            <div class="field-reference-body">
              <div class="field-priority-head"><h2 class="sr-only-head">API Verification and Sources</h2><span class="field-status-chip ${apiSummary.exact===apiSummary.savedCount && apiSummary.savedCount ? "good" : "review"}">${esc(researchLabel || "Review status")}</span></div>
              <div class="field-api-summary"><div class="field-api-stat"><strong>${apiSummary.savedCount}</strong><span>Saved API numbers</span></div><div class="field-api-stat"><strong class="tone-good">${apiSummary.exact}</strong><span>Exact official API matches</span></div><div class="field-api-stat"><strong class="tone-warn">${apiSummary.unmatchedCount}</strong><span>Not in current public well-point layer</span></div></div>
              ${has(p.researchNote) ? `<p class="field-public-note">${esc(p.researchNote)}</p>` : ""}
              <div class="field-source-list">${sourceRows.length ? sourceRows.map(source => `<div class="field-source"><span class="field-source-check">✓</span><span>${esc(fieldSourceLabel(source))}</span></div>`).join("") : `<div class="field-source"><span class="field-source-check">•</span><span>No public research source is attached yet.</span></div>`}</div>
            </div>
          </details>

          <section class="record-status-card"><h2>Record Status</h2><p class="record-status-note">This summary describes the information currently attached to this record. It does not guarantee present road or site conditions.</p><div class="record-status-grid"><div class="record-status-item"><small>Last reviewed or updated</small><strong>${esc(p.lastUpdatedDate || p.updatedAt || p.researchDate || "Not listed")}</strong></div><div class="record-status-item"><small>GPS status</small><strong>${navigationGps ? (usingOfficialGps ? "Official public GPS fallback" : "Saved GPS available") : "No verified GPS attached"}</strong></div><div class="record-status-item"><small>Directions status</small><strong>${has(p.Structured_Road_Sequence) || directionsText ? "Directions available · continuing review" : "Needs directions review"}</strong></div><div class="record-status-item"><small>Public-source status</small><strong>${official || sourceRows.length ? "Public-source information attached" : "No public source attached yet"}</strong></div></div><div class="source-notice"><strong>Source notice:</strong> This record may combine public records, independent research, field observations, and community-contributed information. Verify before use.</div><div class="record-status-actions"><a class="btn secondary" href="mailto:support@brinesearch.com?subject=${encodeURIComponent(`BrineSearch record concern: ${display(p.padName)}`)}&body=${encodeURIComponent(`Pad: ${display(p.padName)}\nCompany: ${companyLabel}\nURL: ${window.location.href}\n\nConcern type (incorrect directions, GPS, well information, company information, copyright, or other):\n`)}">Report a record concern</a>${editorCanEdit()?`<button class="btn secondary" type="button" data-edit-section="all" data-pad-id="${esc(p._id)}">Review or update record</button>`:""}${editorIsOwner()?`<a class="btn secondary" href="#/verification">Open verification review</a>`:""}</div></section>
        </div>`;


      loadPadVerification(p);

            document.querySelectorAll(".compact-directions").forEach(section => {
        section.addEventListener("toggle", () => {
          const label = section.querySelector(".compact-toggle-label");
          if (label) label.textContent = section.open ? "Hide" : "Show";
        });
      });

      document.getElementById("fieldFavoritePad")?.addEventListener("click", event => {
        const active = toggleFavoritePad(p._id);
        event.currentTarget.classList.toggle("active", active);
        const icon=event.currentTarget.querySelector(".fm-icon");
        if(icon) icon.className=`fm-icon ${active ? "fm-favorite-active-large" : "fm-favorite-large"}`;
        const strong=event.currentTarget.querySelector("strong");
        const small=event.currentTarget.querySelector("small");
        if(strong) strong.textContent=active ? "Favorited" : "Favorite";
        if(small) small.textContent=active ? "Saved for offline and quick access" : "Save for offline and quick access";
        showToast(active ? "Added to favorites" : "Removed from favorites");
      });
      document.getElementById("fieldSharePad")?.addEventListener("click", async () => {
        const padLink = window.location.href;
        const pinQuery = coordinateValue || p.address || [cleanGeo(p.county), cleanGeo(p.state)].filter(Boolean).join(", ");
        const mapPin = pinQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pinQuery)}` : "";
        const shareText = [display(p.padName),companyLabel,location,mapPin ? `Map pin: ${mapPin}` : "",`BrineSearch pad: ${padLink}`].filter(Boolean).join("\n");
        document.getElementById("padShareOverlay")?.remove();
        const overlay=document.createElement("div");
        overlay.id="padShareOverlay";overlay.className="pad-share-overlay";
        overlay.innerHTML=`<section class="pad-share-sheet" role="dialog" aria-modal="true" aria-label="Share ${esc(display(p.padName))}"><h2>Share ${esc(display(p.padName))}</h2><p>Post an update about this pad or share its link and map pin.</p><div class="pad-share-actions"><button class="primary" id="sharePadToFeed">◉ Make a Field Feed post</button><button id="sharePadOutside">↗ Share link and map pin</button><button id="copyPadShare">⧉ Copy pad information</button><button class="cancel" id="cancelPadShare">Cancel</button></div></section>`;
        document.body.appendChild(overlay);
        const close=()=>overlay.remove();
        overlay.addEventListener("click",e=>{if(e.target===overlay)close();});
        overlay.querySelector("#cancelPadShare").onclick=close;
        overlay.querySelector("#sharePadToFeed").onclick=()=>{
          fieldStorePadPrefill(p);
          close();
          const feedHash = "#/feed";
          if (location.hash === feedHash) {
            router();
          } else {
            location.hash = feedHash;
            setTimeout(() => {
              if (location.hash === feedHash && !document.querySelector(".field-feed-page")) router();
            }, 80);
          }
        };
        overlay.querySelector("#copyPadShare").onclick=async()=>{await copyText(shareText,"Pad information copied");close();};
        overlay.querySelector("#sharePadOutside").onclick=async()=>{
          try{if(navigator.share){await navigator.share({title:`${display(p.padName)} · BrineSearch`,text:shareText});showToast("Pad shared");}else await copyText(shareText,"Pad link and map pin copied");}
          catch(error){if(error?.name!=="AbortError")await copyText(shareText,"Pad link and map pin copied");}
          close();
        };
      });
      document.getElementById("fieldCopyLocation")?.addEventListener("click", () => copyText([p.address, coordinateValue, location].filter(has).join("\n"),"Location copied"));
      document.getElementById("fieldCopyDirections")?.addEventListener("click", () => copyDirectionsText ? copyText(copyDirectionsText,"Directions copied") : showToast("No approved directions to copy"));

      /* Point the contextual tab-bar button at this pad and reveal it. The
         top-of-page Directions button stays exactly where it was; this only
         adds a second, thumb-reachable way to fire the same link. */
      const navBtn = document.getElementById("mobileNavigateBtn");
      if (navBtn) {
        if (gmap) {
          navBtn.setAttribute("href", gmap);
          navBtn.setAttribute("aria-label", `Open directions to ${display(p.padName)}`);
          document.body.classList.add("pad-nav-active");
        } else {
          document.body.classList.remove("pad-nav-active");
        }
      }
    }
