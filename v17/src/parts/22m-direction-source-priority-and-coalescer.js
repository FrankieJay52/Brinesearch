    /* BrineSearch V17.3.16 — live Clear Direction priority + final fragment coalescer.
       V17.3.15 proved that the written-card presentation is easier to scan, but
       the startup deadline could still leave an online phone on the packaged
       legacy rewrite. This pass fixes that source precedence and also coalesces
       obvious legacy sentence fragments without inventing roads, turns, or
       mileage. Saved Clear Directions remain unchanged. */

    function directionStepCleanV17316(value) {
      let text = String(value || "").replace(/\s{2,}/g, " ").trim();
      if (!text) return "";

      // Workbook step numbers were occasionally glued to a short maneuver.
      if (/^(?:turn|go|follow|continue|take|stay|slight|sharp|veer|bear|pad|access road|lease road)\b/i.test(text)) {
        text = text.replace(/\.(\d+)\s*$/i, "");
      }
      text = text.replace(/\s+Then\.?$/i, "");
      text = text.replace(/\s+([,.;])/g, "$1").replace(/\s{2,}/g, " ").trim();
      return text;
    }

    function directionStepStartsActionV17316(value) {
      return /^(?:Turn|Take|Head|Follow|Continue|Go|Proceed|Travel|Merge|Veer|Bear|Stay|Keep|Slight|Sharp)\b/i
        .test(directionStepCleanV17316(value));
    }

    function directionStepShortOriginV17316(value) {
      const text = directionStepCleanV17316(value);
      if (!/^From\s+/i.test(text)) return false;
      if (/[,.]/.test(text.replace(/\.$/, ""))) return false;
      return text.split(/\s+/).length <= 4;
    }

    function directionStepArrivalTokenV17316(value) {
      return /^(?:pad|well\s*pad|access\s+road|lease\s+road|entrance|well[- ]site\s+entrance)\.?$/i
        .test(directionStepCleanV17316(value));
    }

    function directionStepHardFragmentV17316(value) {
      const text = directionStepCleanV17316(value);
      return /^(?:Turn|Slight|Sharp|Stay|Follow|Continue|Take|Go|Head|Veer|Bear|Merge|Keep)\.?$/i.test(text)
        || /^(?:Follow|Continue)\s+(?:to|on|onto)\.?$/i.test(text)
        || /^(?:Turn|Follow|Continue|Take|Go|Head|Veer|Bear|Stay|Keep|Slight|Sharp)\b.*\b(?:and|to|on|onto)\.?$/i.test(text);
    }

    function directionStepJoinPrefixV17316(prefixValue, nextValue) {
      const prefix = directionStepCleanV17316(prefixValue).replace(/[.;]+$/, "");
      const next = directionStepCleanV17316(nextValue).replace(/^[,.;:\s-]+/, "");
      if (!prefix) return next;
      if (!next) return prefix;

      if (/^Turn$/i.test(prefix) && /^(?:left|right)\b/i.test(next)) return `Turn ${next}`;
      if (/^(?:Slight|Sharp|Stay|Veer|Bear|Keep)$/i.test(prefix) && /^(?:left|right)\b/i.test(next)) return `${prefix} ${next}`;
      if (/\band$/i.test(prefix)) return `${prefix} ${next.charAt(0).toLowerCase()}${next.slice(1)}`;
      if (/\b(?:to|on|onto)$/i.test(prefix) && !directionStepStartsActionV17316(next)) return `${prefix} ${next}`;
      return `${prefix} ${next}`;
    }

    function directionStepTrailingNextContextV17316(value, nextValue) {
      const text = directionStepCleanV17316(value);
      const next = directionStepCleanV17316(nextValue);
      if (!text || !directionStepStartsActionV17316(next)) return null;

      // A capitalized trailing location clause in these legacy rewrites usually
      // belongs to the following turn: "... one lane bridge At stop sign" or
      // "... continue on 26 At the top of the next hill".
      const match = text.match(/^(.+?)\s+(At\s+(?:(?:the\s+)?stop\s+sign|(?:the\s+)?top\s+of\b[^.;]*|(?:the\s+)?bottom\s+of\b[^.;]*|(?:the\s+)?next\s+(?:intersection|junction|fork|split)\b[^.;]*))\.?$/);
      if (!match) return null;
      return {
        current: directionStepCleanV17316(match[1]),
        next: `${directionStepCleanV17316(match[2])}, ${next.charAt(0).toLowerCase()}${next.slice(1)}`
      };
    }

    function directionCoalesceEntriesV17316(entries) {
      const source = (entries || []).map(entry => ({
        ...entry,
        instruction:directionStepCleanV17316(entry?.instruction),
        notes:[...(entry?.notes || [])]
      }));
      const result = [];

      for (let index = 0; index < source.length; index += 1) {
        let entry = source[index];
        let text = directionStepCleanV17316(entry.instruction);
        if (!text || /^Then\.?$/i.test(text)) continue;

        const nextText = directionStepCleanV17316(source[index + 1]?.instruction);

        // A short origin is context, not a road step. The following actionable
        // instruction carries the route information the driver needs.
        if (directionStepShortOriginV17316(text) && nextText && directionStepStartsActionV17316(nextText)) {
          continue;
        }

        // "Take Bloomingdale" + "Exit" is one instruction, not two cards.
        if (/^Exit\.?$/i.test(text) && result.length) {
          const previous = result[result.length - 1];
          previous.instruction = `${directionStepCleanV17316(previous.instruction).replace(/[.;]+$/, "")} exit`;
          previous.notes.push(...(entry.notes || []));
          continue;
        }

        // Once an exit has just been named, "Go into <town>" is continuation
        // context for the same step instead of another card.
        if (/^Go\s+into\b/i.test(text) && result.length && /\bexit\b/i.test(result[result.length - 1].instruction || "")) {
          const previous = result[result.length - 1];
          previous.instruction = `${directionStepCleanV17316(previous.instruction).replace(/[.;]+$/, "")} and ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
          previous.notes.push(...(entry.notes || []));
          continue;
        }

        // Move a trailing "At stop sign / At the top..." clause onto the next
        // maneuver without creating another numbered step.
        const movedContext = directionStepTrailingNextContextV17316(text, nextText);
        if (movedContext) {
          text = movedContext.current;
          entry = { ...entry, instruction:text };
          source[index + 1] = { ...source[index + 1], instruction:movedContext.next };
        }

        // Hard prefixes such as "Turn" + "right onto CR-10" or "Turn left and"
        // + "go 2.8 miles" are grammatical fragments from the import parser.
        if (directionStepHardFragmentV17316(text) && nextText) {
          const nextIsFullAction = directionStepStartsActionV17316(nextText);
          const canJoin = /\band\.?$/i.test(text)
            || (/^(?:Turn|Slight|Sharp|Stay|Veer|Bear|Keep)\.?$/i.test(text) && /^(?:left|right)\b/i.test(nextText))
            || (/\b(?:to|on|onto)\.?$/i.test(text) && !nextIsFullAction);

          if (canJoin) {
            let merged = directionStepJoinPrefixV17316(text, nextText);
            const mergedNotes = [...(entry.notes || []), ...(source[index + 1]?.notes || [])];
            index += 1;

            // A few imports split the same sentence over three pieces. Consume
            // only another obvious continuation fragment; never consume a new
            // independent maneuver just to reduce the card count.
            const thirdText = directionStepCleanV17316(source[index + 1]?.instruction);
            if (directionStepHardFragmentV17316(merged) && thirdText) {
              merged = directionStepJoinPrefixV17316(merged, thirdText);
              mergedNotes.push(...(source[index + 1]?.notes || []));
              index += 1;
            }
            result.push({ ...entry, instruction:merged, notes:mergedNotes, fragmentReassembled:true, disableRoadIntel:true });
            continue;
          }

          // "Continue on" followed by a complete new turn has no saved target.
          // Showing it as its own card is misleading, so suppress that orphan.
          if (/^(?:Follow|Continue)\s+(?:to|on|onto)\.?$/i.test(text) && nextIsFullAction) continue;
        }

        // A bare destination token belongs to an incomplete preceding phrase
        // where possible. Otherwise make it an explicit arrival, never "Pad."
        // as a standalone navigation step.
        if (directionStepArrivalTokenV17316(text)) {
          if (result.length) {
            const previous = result[result.length - 1];
            const previousText = directionStepCleanV17316(previous.instruction);
            if (/\b(?:to|onto|at|is|for|follow|reach)\s*$/i.test(previousText) || /\b(?:pad|access road|lease road|entrance)\b/i.test(previousText)) {
              if (!/\b(?:pad|access road|lease road|entrance)\b/i.test(previousText)) {
                previous.instruction = `${previousText.replace(/[.;]+$/, "")} ${text.toLowerCase()}`;
              }
              previous.notes.push(...(entry.notes || []));
              continue;
            }
          }
          const label = /access/i.test(text) ? "access road" : /lease/i.test(text) ? "lease road" : /entrance/i.test(text) ? "entrance" : "pad";
          result.push({ ...entry, instruction:`Arrive at ${label}` });
          continue;
        }

        // A pass/landmark continuation is useful context but not another turn.
        // Keep safety details (bridge, restriction, etc.) on the preceding card.
        if (/^(?:Pass|Continue\s+past)\b/i.test(text) && result.length) {
          result[result.length - 1].notes.push(text, ...(entry.notes || []));
          continue;
        }

        result.push({ ...entry, instruction:text });
      }

      return result.filter(entry => {
        const text = directionStepCleanV17316(entry.instruction);
        return text && !directionStepHardFragmentV17316(text) && !directionStepShortOriginV17316(text) && !/^Exit\.?$/i.test(text);
      });
    }

    const directionGlobalWrittenEntriesBeforeV17316 = directionGlobalWrittenEntriesV17315;
    directionGlobalWrittenEntriesV17315 = function directionGlobalWrittenEntriesCoalescedV17316(clearText) {
      const parsed = directionGlobalWrittenEntriesBeforeV17316(clearText);
      return { ...parsed, steps:directionCoalesceEntriesV17316(parsed.steps || []) };
    };

    const directionWrittenSentenceBeforeV17316 = directionWrittenSentenceV17315;
    directionWrittenSentenceV17315 = function directionWrittenSentenceSourcePriorityV17316(value, p, sourceStepOrder) {
      let text = directionStepCleanV17316(value);
      // Match the approved LEE style globally: short source-location prefixes do
      // not need to consume the beginning of a road-named maneuver card.
      text = text.replace(/^From\s+(?:I\s*[- ]?\s*\d{1,3}|US\s*[- ]?\s*\d{1,4}|OH\s*[- ]?\s*\d{1,4}|WV\s*[- ]?\s*\d{1,4}|PA\s*[- ]?\s*\d{1,4}|SR\s*[- ]?\s*\d{1,4}|Route\s+\d{1,4}|\d{1,4}|[A-Za-z][A-Za-z .'-]{1,40}),\s*(?=(?:take|head|turn|follow|continue|go|merge|veer|bear|stay|keep|slight|sharp)\b)/i, "");
      return directionWrittenSentenceBeforeV17316(text, p, sourceStepOrder);
    };

    function directionApplyLiveClearRowV17316(pad, row) {
      const liveText = String(row?.directions_clear ?? "").trim();
      if (!pad || !liveText) return false;
      pad.directionsClear = liveText;
      pad.directionsClearMethod = row?.directions_clear_method || "Live Clear Directions";
      pad.directionsClearUpdatedAt = row?.directions_clear_updated_at || null;
      pad.__liveClearDirectionV17316 = true;
      return true;
    }

    async function directionFetchJsonV17316(url, timeoutMs = 3500) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization:`Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            Accept:"application/json"
          },
          cache:"no-store",
          signal:controller.signal
        });
        if (!response.ok) throw new Error(`Clear Directions returned ${response.status}`);
        const json = await response.json();
        if (!Array.isArray(json)) throw new Error("Unexpected Clear Directions response");
        return json;
      } finally {
        clearTimeout(timer);
      }
    }

    const directionLivePadRequestsV17316 = new Map();
    async function directionHydrateSelectedLiveClearV17316(id) {
      const pad = padById(id);
      if (!pad || pad.__liveClearDirectionV17316 || !navigator.onLine) return Boolean(pad?.__liveClearDirectionV17316);
      const key = String(pad?._id || pad?._dbId || id || "");
      if (!key) return false;
      if (directionLivePadRequestsV17316.has(key)) return directionLivePadRequestsV17316.get(key);

      const request = (async () => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/public_pad_detail`);
        url.searchParams.set("select", "id,legacy_id,directions_clear,directions_clear_method,directions_clear_updated_at");
        if (pad?._id && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(pad._id))) {
          url.searchParams.set("legacy_id", `eq.${String(pad._id)}`);
        } else if (pad?._dbId) {
          url.searchParams.set("id", `eq.${String(pad._dbId)}`);
        } else {
          return false;
        }
        url.searchParams.set("limit", "1");
        const rows = await directionFetchJsonV17316(url.toString(), 2600);
        if (!rows[0]) return false;
        return directionApplyLiveClearRowV17316(pad, rows[0]);
      })().catch(error => {
        console.warn("Selected live Clear Directions unavailable; using safe local presentation.", error);
        return false;
      }).finally(() => directionLivePadRequestsV17316.delete(key));

      directionLivePadRequestsV17316.set(key, request);
      return request;
    }

    async function directionRefreshAllLiveClearV17316() {
      if (!navigator.onLine) return 0;
      const rows = [];
      const limit = 1000;
      for (let offset = 0; ; offset += limit) {
        const url = new URL(`${SUPABASE_URL}/rest/v1/public_pad_detail`);
        url.searchParams.set("select", "id,legacy_id,directions_clear,directions_clear_method,directions_clear_updated_at");
        url.searchParams.set("directions_clear", "not.is.null");
        url.searchParams.set("order", "id.asc");
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(offset));
        const batch = await directionFetchJsonV17316(url.toString(), 5000);
        rows.push(...batch);
        if (batch.length < limit) break;
      }

      const byKey = new Map();
      rows.forEach(row => {
        if (row?.legacy_id) byKey.set(String(row.legacy_id), row);
        if (row?.id) byKey.set(String(row.id), row);
      });
      let applied = 0;
      pads.forEach(pad => {
        const row = byKey.get(String(pad?._id || "")) || byKey.get(String(pad?._dbId || ""));
        if (row && directionApplyLiveClearRowV17316(pad, row)) applied += 1;
      });
      window.__brineLiveClearDirectionsAppliedV17316 = applied;
      return applied;
    }

    // Refresh the whole directory in the background even when the 1.2-second
    // startup race chose the offline package. Correctness no longer depends on
    // DATA_SOURCE_LABEL being "Live database".
    window.__brineLiveClearDirectionsReadyV17316 = directionRefreshAllLiveClearV17316().catch(error => {
      console.warn("Background live Clear Directions refresh unavailable.", error);
      return 0;
    });

    const renderPadBeforeDirectionSourcePriorityV17316 = renderPad;
    renderPad = async function renderPadDirectionSourcePriorityV17316(id) {
      await directionHydrateSelectedLiveClearV17316(id);
      return renderPadBeforeDirectionSourcePriorityV17316(id);
    };
