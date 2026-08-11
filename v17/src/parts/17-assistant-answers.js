
    function assistantRecordLinks(records, limit = 10) {
      const shown = records.slice(0, limit);
      return `<div class="chat-result-list">${shown.map(p => {
        const location = [p.county && `${p.county} County`, p.state].filter(has).join(" · ");
        return `<a class="chat-result-link" href="${routeUrl(`pad/${encodeURIComponent(p._id)}`)}">
          ${esc(display(p.padName))}
          <small>${esc(isDisposal(p) ? "Disposal" : display(p.company))}${location ? ` · ${esc(location)}` : ""}</small>
        </a>`;
      }).join("")}</div>`;
    }


    function renderAssistantWellTable(p, focusField = "api") {
      const rows = alignedWellRows(p);
      const name = esc(display(p.padName));
      const focusClass = ["api", "property", "well"].includes(focusField)
        ? ` focus-${focusField}`
        : "";

      return `
        <div class="chat-answer-title">${name}</div>
        <div class="chat-well-table${focusClass}">
          <div class="chat-well-head">
            <div class="chat-well-label">Well Name</div>
            <div class="chat-well-label">API</div>
            <div class="chat-well-label">Property</div>
          </div>
          ${rows.map(row => `
            <div class="chat-well-row">
              <div class="chat-well-value ${row.well === "—" ? "empty" : ""}">${esc(row.well)}</div>
              <div class="chat-well-value ${row.api === "—" ? "empty" : ""}">${esc(row.api)}</div>
              <div class="chat-well-value ${row.property === "—" ? "empty" : ""}">${esc(row.property)}</div>
            </div>
          `).join("")}
        </div>
        ${assistantRecordLinks([p], 1)}`;
    }

    function assistantFieldAnswer(p, field) {
      const name = esc(display(p.padName));
      const company = esc(display(p.company));
      const label = isDisposal(p) ? "disposal" : "pad";

      if (field === "api") {
        return has(p.api) ? renderAssistantWellTable(p, "api") : `<strong>${name}</strong> does not have an API number saved.`;
      }
      if (field === "property") {
        return has(p.property) ? renderAssistantWellTable(p, "property") : `<strong>${name}</strong> does not have a property number saved.`;
      }
      if (field === "well") {
        return has(p.wellName) ? renderAssistantWellTable(p, "well") : `<strong>${name}</strong> does not have a well name saved.`;
      }
      if (field === "address") {
        return has(p.address)
          ? `The saved address for <strong>${name}</strong> is <strong>${esc(p.address)}</strong>.`
          : `<strong>${name}</strong> does not have a street address saved.`;
      }
      if (field === "gps") {
        const gps = padNavigationGps(p);
        if (!gps) return `<strong>${name}</strong> does not have saved or official pad coordinates available.`;
        const sourceNote = gps.source === "official"
          ? " These are the verified official pad coordinates because no saved field GPS is listed."
          : " These are the saved field coordinates.";
        return `The GPS coordinates for <strong>${name}</strong> are <strong>${esc(`${gps.latitude}, ${gps.longitude}`)}</strong>.${sourceNote}`;
      }
      if (field === "county") {
        return has(p.county)
          ? `<strong>${name}</strong> is listed in <strong>${esc(p.county)} County, ${esc(display(p.state))}</strong>.`
          : `<strong>${name}</strong> does not have a county saved.`;
      }
      if (field === "township") {
        return has(p.township)
          ? `<strong>${name}</strong> is listed in <strong>${esc(p.township)} Township</strong>.`
          : `<strong>${name}</strong> does not have a township saved.`;
      }
      if (field === "company") return `<strong>${name}</strong> is listed under <strong>${company}</strong>.`;
      if (field === "route") {
        return has(p.Structured_Road_Sequence)
          ? `<strong>Road sequence for ${name}:</strong><br>${esc(directionSequenceSummary(p.Structured_Road_Sequence, p))}`
          : `<strong>${name}</strong> does not have a confirmed road sequence saved.`;
      }
      if (field === "missing") {
        const missing = padMissingFields(p);
        return missing.length
          ? `<strong>${name}</strong> is missing: <strong>${esc(missing.join(", "))}</strong>.`
          : `<strong>${name}</strong> has all of the main searchable fields filled in.`;
      }
      if (field === "directions") {
        const map = googleMapsUrl(p);
        const googleChunks = googleMapsRouteChunks(p);
        const clearer = has(p.directionsClear)
          ? p.directionsClear
          : smartRewriteDirections(p.writtenDirections, p.Structured_Road_Sequence);
        const text = has(clearer)
          ? `<strong>Step-by-step directions to ${name}:</strong><br><span style="white-space:pre-wrap">${esc(clearer)}</span>`
          : `<strong>${name}</strong> does not have public step-by-step directions available yet.`;
        const links = googleChunks.length
          ? googleChunks.map(chunk => `<a class="chat-result-link" href="${esc(chunk.url)}" target="_blank" rel="noopener">${googleChunks.length === 1 ? "Open authoritative Google Maps route" : `Open Google route ${chunk.chunk} of ${googleChunks.length}`}</a>`).join("")
          : (map ? `<a class="chat-result-link" href="${esc(map)}" target="_blank" rel="noopener">Open exact pad GPS (route not verified)</a>` : "");
        return text + (links ? `<div class="chat-result-list">${links}</div>` : "");
      }

      const details = [
        `<strong>${name}</strong>`,
        `${label} under <strong>${company}</strong>`,
        has(p.county) ? `${esc(p.county)} County` : "",
        has(p.state) ? esc(p.state) : "",
        hasGps(p) ? "GPS saved" : "GPS missing",
        has(p.address) ? `Address: ${esc(p.address)}` : "",
        has(p.api) ? `API: ${esc(p.api)}` : ""
      ].filter(Boolean).join(" · ");
      return `${details}.${assistantRecordLinks([p], 1)}`;
    }

    function detectAssistantField(q) {
      if (/\bmissing\b|\bincomplete\b|\bneed(?:s)? added\b|\bwhat needs\b/.test(q)) return "missing";
      if (/\bapi\b/.test(q)) return "api";
      if (/\bproperty\b|\bprop\b/.test(q)) return "property";
      if (/\bwell\b/.test(q)) return "well";
      if (/\baddress\b|\bstreet\b/.test(q)) return "address";
      if (/\bgps\b|\bcoordinate\b|\blatitude\b|\blongitude\b|\bpin\b/.test(q)) return "gps";
      if (/\bcounty\b/.test(q)) return "county";
      if (/\btownship\b/.test(q)) return "township";
      if (/\bcompany\b|\boperator\b|\bowns\b/.test(q)) return "company";
      if (/\broad sequence\b|\bwhich roads\b|\bwhat roads\b/.test(q)) return "route";
      if (/\bdirection\b|\bhow do i get\b|\bhow to get\b|\brewrite\b|\bclearer\b|\bstep by step\b|\bmap\b/.test(q)) return "directions";
      return "summary";
    }

    function findNamedArea(question, values, suffixPattern = "") {
      const q = assistantNormalize(question);
      return values
        .filter(Boolean)
        .sort((a,b) => b.length - a.length)
        .find(v => {
          const n = assistantNormalize(v);
          return q.includes(n) || (suffixPattern && q.includes(`${n} ${suffixPattern}`));
        });
    }

    function answerAssistantQuestion(question) {
      const raw = question.trim();
      const q = assistantNormalize(raw);
      if (!q) return "Type a question first.";

      const current = assistantCurrentPad();
      let field = detectAssistantField(q);
      const command = q.match(/^(api|gps|route|directions|wells?|property|share|navigate|near|disposals?)\s*(.*)$/);
      if (command) {
        const cmd = command[1];
        const targetText = command[2].trim();
        if (cmd === "disposal" || cmd === "disposals") {
          const disposalMatches = targetText ? findRecordsByName(targetText).filter(isDisposal) : disposalRecords;
          return `Saved disposal locations:${assistantRecordLinks(disposalMatches.length ? disposalMatches : disposalRecords)}`;
        }
        const target = targetText ? findRecordsByName(targetText)[0] : current;
        if (!target) return `I couldn’t match that command to a saved pad. Try <strong>api bella</strong>, <strong>route albatross</strong>, or open a pad first.`;
        if (cmd === "navigate") {
          const map = googleMapsUrl(target);
          return map ? `<strong>${esc(display(target.padName))}</strong><div class="chat-result-list"><a class="chat-result-link" href="${esc(map)}" target="_blank" rel="noopener">Open navigation</a></div>` : `<strong>${esc(display(target.padName))}</strong> does not have a navigation location available.`;
        }
        if (cmd === "share") {
          return `<strong>${esc(display(target.padName))}</strong><div class="chat-result-list"><button class="chat-result-link" data-assistant-share="${esc(target._id)}" type="button">Share this pad</button></div>`;
        }
        field = cmd === "route" ? "route" : cmd === "well" || cmd === "wells" ? "well" : cmd;
        return assistantFieldAnswer(target, field);
      }

      if (current && /\b(this|current|here|it|the pad|this pad|this disposal|these directions)\b/.test(q)) {
        return assistantFieldAnswer(current, field);
      }

      const digitToken = raw.match(/\b\d[\d-]{4,}\b/)?.[0];
      if (digitToken) {
        const token = compactSearch(digitToken);
        const byApi = pads.filter(p => splitMulti(p.api).some(v => compactSearch(v).includes(token)));
        if (byApi.length) return `I found this API number:${assistantRecordLinks(byApi)}`;
        const byProperty = pads.filter(p => splitMulti(p.property).some(v => compactSearch(v).includes(token)));
        if (byProperty.length) return `I found this property number:${assistantRecordLinks(byProperty)}`;
      }

      const county = findNamedArea(raw, allCounties, "county");
      const state = findNamedArea(raw, allStates);
      const company = findNamedArea(raw, allGroups);

      let filtered = pads.slice();
      const filters = [];
      if (company) {
        filtered = company === "Disposals" ? filtered.filter(isDisposal) : filtered.filter(p => normalize(p.company) === company);
        filters.push(company);
      }
      if (county) {
        filtered = filtered.filter(p => normalize(p.county) === county);
        filters.push(`${county} County`);
      }
      if (state) {
        filtered = filtered.filter(p => normalize(p.state) === state);
        filters.push(state);
      }
      if (/\bdisposal/.test(q)) filtered = filtered.filter(isDisposal);
      if (/\bpads?\b/.test(q) && !/\bdisposal/.test(q)) filtered = filtered.filter(p => !isDisposal(p));

      if (/\bhow many\b|\bcount\b/.test(q) && filters.length) {
        return `<strong>${filtered.length.toLocaleString()}</strong> saved ${filtered.length === 1 ? "location matches" : "locations match"} <strong>${esc(filters.join(" · "))}</strong>.${assistantRecordLinks(filtered, 8)}`;
      }

      if (field === "missing" && filters.length) {
        const missingType =
          /\bgps\b|\bcoordinate/.test(q) ? "GPS coordinates" :
          /\baddress/.test(q) ? "address" :
          /\bapi/.test(q) ? "API number" :
          /\bproperty/.test(q) ? "property number" :
          /\broad/.test(q) ? "road sequence" :
          /\bdirection/.test(q) ? "written directions" : "";
        const found = filtered.filter(p => {
          if (!missingType) return padMissingFields(p).length;
          return padMissingFields(p).includes(missingType) ||
            (missingType === "GPS coordinates" && !hasGps(p));
        });
        return `${found.length.toLocaleString()} locations in <strong>${esc(filters.join(" · "))}</strong> are missing ${esc(missingType || "one or more main fields")}:${assistantRecordLinks(found)}`;
      }

      if (filters.length && /\b(which|what|show|list|all|locations|pads|disposals|in|under|from)\b/.test(q)) {
        return `Saved locations for <strong>${esc(filters.join(" · "))}</strong>:${assistantRecordLinks(filtered)}`;
      }

      if (/\bdisposals?\b/.test(q) && /\b(show|list|which|what|all)\b/.test(q)) {
        return `Saved disposal locations:${assistantRecordLinks(disposalRecords)}`;
      }

      const records = findRecordsByName(raw);
      if (!records.length) {
        if (current) return assistantFieldAnswer(current, field);
        return `I couldn’t match that to a saved pad or disposal. Try the <strong>pad name</strong>, company, county, API number, property number, or ask “show Ascent pads in Belmont County.”`;
      }

      const uniqueIds = [...new Set(records.map(p => p._id))];
      if (uniqueIds.length > 1) {
        const exactNames = [...new Set(records.map(p => normalize(p.padName)))];
        if (exactNames.length === 1 || field !== "summary") {
          return `I found more than one possible match. Tap the correct one:${assistantRecordLinks(records)}`;
        }
      }

      const p = records[0];
      return assistantFieldAnswer(p, field);
    }

    function sendAssistantQuestion(question = assistantInput.value) {
      const text = String(question || "").trim();
      if (!text) return;
      addAssistantMessage("user", text);
      saveAssistantRecent(text);
      assistantSuggestions.classList.remove("show");
      assistantInput.value = "";
      assistantInput.style.height = "auto";
      const answer = answerAssistantQuestion(text);
      setTimeout(() => addAssistantMessage("bot", answer), 120);
    }

    document.getElementById("assistantFab").addEventListener("click", openAssistant);
    document.getElementById("assistantClose").addEventListener("click", closeAssistant);
    document.getElementById("assistantBackdrop").addEventListener("click", closeAssistant);
    document.getElementById("assistantSend").addEventListener("click", () => sendAssistantQuestion());
    document.getElementById("assistantActions").addEventListener("click", event => {
      const button = event.target.closest("[data-assistant-action]");
      if (button) runAssistantAction(button.dataset.assistantAction);
    });
    assistantRecent.addEventListener("click", event => {
      const button = event.target.closest("[data-recent-question]");
      if (button) sendAssistantQuestion(button.dataset.recentQuestion);
    });
    assistantSuggestions.addEventListener("click", event => {
      const button = event.target.closest("[data-suggestion-pad]");
      if (!button) return;
      const p = padById(button.dataset.suggestionPad);
      if (!p) return;
      assistantInput.value = display(p.padName);
      assistantSuggestions.classList.remove("show");
      sendAssistantQuestion(display(p.padName));
    });
    assistantVoice.addEventListener("click", () => {
      if (!assistantRecognition) return showToast("Voice input is not supported on this browser");
      try { assistantRecognition.start(); } catch {}
    });
    assistantMessages.addEventListener("click", async event => {
      const share = event.target.closest("[data-assistant-share]");
      if (share) {
        const p = padById(share.dataset.assistantShare);
        if (p) {
          const text = assistantShareText(p);
          try { if (navigator.share) await navigator.share({ title: `${display(p.padName)} · BrineSearch`, text }); else await copyText(text, "Pad link copied"); }
          catch (error) { if (error?.name !== "AbortError") await copyText(text, "Pad link copied"); }
        }
        return;
      }
      if (event.target.closest("a")) closeAssistant();
    });
    assistantInput.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendAssistantQuestion();
      }
    });
    assistantInput.addEventListener("input", () => {
      assistantInput.style.height = "auto";
      assistantInput.style.height = `${Math.min(assistantInput.scrollHeight, 120)}px`;
      renderAssistantSuggestions(assistantInput.value);
    });
    setupAssistantVoice();
