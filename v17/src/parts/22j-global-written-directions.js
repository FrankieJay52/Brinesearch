    /* BrineSearch V17.3.15 — global written direction cards.
       Promotes the approved LEE prototype to every pad while keeping the saved
       Clear Directions authoritative. Each real saved direction stays a numbered
       written card; road/highway sign graphics and structured sign sequences are
       suppressed. Explicit road aliases/concurrencies stay in the sentence. A
       second road name from shared direction intelligence is added only when at
       least two bounded saved-route examples support it. ODOT catalog aliases are
       deliberately not injected into route-only steps because one county-road
       number can carry different local names on different physical segments. */

    function directionWrittenCleanV17315(value) {
      return String(value || "").replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").trim();
    }

    function directionWrittenNoteOnlyV17315(value) {
      const text = directionWrittenCleanV17315(value);
      return directionClearNoteOnlyV1732(text)
        || /^(?:Curfew note|Truck warning|Access warning|Safety note|Restriction|Warning|Caution|Important|Note|Gate code|CB\b|Call out|Speed limit|Weight limit|Do not)\b/i.test(text);
    }

    function directionWrittenRoadPatternV17315(primary) {
      const road = directionWrittenCleanV17315(primary).toUpperCase();
      let match;
      if ((match = road.match(/^CR-(\d{1,4}(?:\/\d+)?[A-Z]?)$/))) {
        return new RegExp(`\\b(?:CR|C\\.?\\s*R\\.?|County\\s+(?:Road|Rd|Route|Hwy)|Co\\.?\\s*Rd\\.?)\\s*[- ]?\\s*${match[1].replace("/", "\\/")}\\b`, "i");
      }
      if ((match = road.match(/^TR-(\d{1,4}[A-Z]?)$/))) {
        return new RegExp(`\\b(?:TR|T\\.?\\s*R\\.?|Township\\s+(?:Road|Rd|Route|Hwy)|Twp\\.?\\s*(?:Road|Rd|Route|Hwy)?)\\s*[- ]?\\s*${match[1]}\\b`, "i");
      }
      if ((match = road.match(/^(I|US|OH|WV|PA|SR)-(\d{1,4}[A-Z]?)$/))) {
        const family = match[1];
        const number = match[2];
        if (family === "I") return new RegExp(`\\b(?:I|Interstate)\\s*[- ]?\\s*${number}\\b`, "i");
        if (family === "US") return new RegExp(`\\b(?:US|U\\.?S\\.?)(?:\\s+Route)?\\s*[- ]?\\s*${number}\\b`, "i");
        return new RegExp(`\\b(?:${family}|SR|S\\.?R\\.?|State\\s+Route)\\s*[- ]?\\s*${number}\\b`, "i");
      }
      return null;
    }

    function directionWrittenStrongSharedAliasV17315(text, p, sourceStepOrder) {
      const rows = Array.isArray(p?.directionRoadIntelligence) ? p.directionRoadIntelligence : [];
      const intel = rows.find(row => Number(row?.step_order) === Number(sourceStepOrder));
      const primary = directionWrittenCleanV17315(intel?.primary_road);
      const alias = directionWrittenCleanV17315(intel?.local_road_name);
      if (!primary || !alias) return text;

      const evidence = intel?.evidence && typeof intel.evidence === "object" ? intel.evidence : {};
      if (String(evidence.dual_name_source || "") !== "shared_saved_directions") return text;
      if (Number(evidence.dual_name_support || 0) < 2) return text;
      if (text.toLowerCase().includes(alias.toLowerCase())) return text;

      // Any explicit slash/parenthetical second name in the saved instruction wins.
      // Do not stack an inferred alias onto a concurrency or an existing local name.
      if (/\b(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d[^.;]{0,70}\s*\/\s*[A-Za-z0-9]/i.test(text)
          || /\b(?:County|Township|State)\s+(?:Road|Rd|Route|Hwy)\s*\d[^.;]{0,70}\s*\/\s*[A-Za-z0-9]/i.test(text)
          || /\b(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d[^.;]{0,45}\([^)]*[A-Za-z][^)]*\)/i.test(text)) {
        return text;
      }

      const pattern = directionWrittenRoadPatternV17315(primary);
      if (!pattern || !pattern.test(text)) return text;
      return text.replace(pattern, match => `${match} / ${alias}`);
    }

    function directionWrittenDropStartContextV17315(value) {
      const text = directionWrittenCleanV17315(value);
      const match = text.match(/^From\s+(.{1,110}?),\s*(.+)$/i);
      if (!match) return text;
      const remainder = directionWrittenCleanV17315(match[2]);
      if (!/^(?:head|take|turn|follow|continue|merge|keep|slight|veer|bear|stay|proceed|travel)\b/i.test(remainder)) return text;
      if (!/\b(?:Exit\s*\d|I\s*[- ]?\s*\d|US\s*[- ]?\s*\d|OH\s*[- ]?\s*\d|WV\s*[- ]?\s*\d|PA\s*[- ]?\s*\d|SR\s*[- ]?\s*\d|CR\s*[- ]?\s*\d|TR\s*[- ]?\s*\d|Route\s+\d|County\s+(?:Road|Rd|Route|Hwy)\s*\d|Township\s+(?:Road|Rd|Route|Hwy)\s*\d|[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,6}\s+(?:Rd|Road|St|Street|Ave|Avenue|Ln|Lane|Dr|Drive|Pike|Hwy|Highway))\b/i.test(remainder)) return text;
      return remainder;
    }

    function directionWrittenCompactMileageV17315(value) {
      let text = directionWrittenCleanV17315(value);
      const number = "(\\d+(?:\\.\\d+)?|\\.\\d+|\\d+\\s*\\/\\s*\\d+|[½¼¾])";
      const approx = "(approximately|approx\\.?|about|roughly)?";

      text = text.replace(new RegExp(`\\.\\s*Continue\\s+${approx}\\s*${number}\\s*(?:miles?|mi)\\b`, "ig"), (_, qualifier, amount) => ` for ${qualifier ? "about " : ""}${amount} mi`);
      text = text.replace(new RegExp(`\\.\\s*Continue\\s+${approx}\\s*${number}\\s*(?:feet|ft)\\b`, "ig"), (_, qualifier, amount) => ` for ${qualifier ? "about " : ""}${amount} ft`);
      text = text.replace(new RegExp(`\\.\\s*Continue\\s+${approx}\\s*${number}\\s*(?:yards?|yd)\\b`, "ig"), (_, qualifier, amount) => ` for ${qualifier ? "about " : ""}${amount} yd`);

      text = text.replace(/\bonto\b/gi, "on");
      text = text.replace(/\bthe\s+saved\s+(?=(?:I|US|OH|WV|PA|SR|CR|TR|State Route|County Road|Township Road|Route)\b)/gi, "");
      text = text.replace(/\bsaved\s+(?=(?:I|US|OH|WV|PA|SR|CR|TR|State Route|County Road|Township Road|Route)\b)/gi, "");
      return directionWrittenCleanV17315(text);
    }

    function directionWrittenArrivalV17315(value) {
      let text = directionWrittenCleanV17315(value);
      text = text.replace(/^The\s+(access|lease)\s+road\s+is\s+on\s+the\s+(left|right)\.?$/i, (_, type, side) => `${type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()} road is on the ${side.toLowerCase()}.`);
      text = text.replace(/^The\s+(?:well[- ]site\s+)?entrance\s+is\s+on\s+the\s+(left|right)(?:\s*\/\s*(?:east|west|north|south)\s+side\s+of\s+the\s+road)?\.?$/i, (_, side) => `Entrance is on the ${side.toLowerCase()}.`);
      return directionWrittenCleanV17315(text);
    }

    function directionWrittenSentenceV17315(value, p, sourceStepOrder) {
      let text = directionSanitizeInstructionV1738(value);
      text = directionWrittenDropStartContextV17315(text);
      text = directionWrittenStrongSharedAliasV17315(text, p, sourceStepOrder);
      text = directionWrittenCompactMileageV17315(text);
      text = directionWrittenArrivalV17315(text);
      text = directionWrittenCleanV17315(text);
      if (!text) return "";
      text = text.charAt(0).toUpperCase() + text.slice(1);
      if (!/[.!?]$/.test(text)) text += ".";
      return text;
    }

    function directionGlobalWrittenEntriesV17315(clearText) {
      const parsed = directionClearSectionsV1732(clearText);
      const rawEntries = (parsed.steps || []).map((instruction, index) => ({
        instruction:directionSanitizeInstructionV1738(instruction),
        notes:[],
        sourceStepOrder:index + 1
      })).filter(entry => entry.instruction);

      const reassembled = directionReassembleStepEntriesV17313(rawEntries);
      const entries = [];
      for (const entry of reassembled) {
        const instruction = directionSanitizeInstructionV1738(entry.instruction);
        const notes = (entry.notes || []).map(directionSanitizeInstructionV1738).filter(Boolean);
        if (!instruction) {
          if (notes.length && entries.length) entries[entries.length - 1].notes.push(...notes);
          continue;
        }
        if (directionWrittenNoteOnlyV17315(instruction) && entries.length) {
          entries[entries.length - 1].notes.push(instruction, ...notes);
          continue;
        }
        if (directionClearDistanceOnlyV1732(instruction) && entries.length) {
          entries[entries.length - 1].instruction = `${entries[entries.length - 1].instruction}. ${instruction}`;
          entries[entries.length - 1].notes.push(...notes);
          continue;
        }
        entries.push({
          instruction,
          notes,
          sourceStepOrder:Number(entry.sourceStepOrder || entries.length + 1)
        });
      }
      return { reference:directionSanitizeReferenceV1738(parsed.reference), steps:entries };
    }

    function directionGlobalWrittenPrimaryHtmlV17315(clearText, p) {
      const parsed = directionGlobalWrittenEntriesV17315(clearText);
      if (!parsed.steps.length) return "";
      return `<section class="direction-route-group direction-clear-primary direction-written-global">
        <div class="direction-route-heading"><span>PRIMARY ROUTE</span></div>
        <ol class="direction-pro-steps direction-clear-steps">${parsed.steps.map((entry, index) => {
          const instruction = directionWrittenSentenceV17315(entry.instruction, p, entry.sourceStepOrder);
          const notes = (entry.notes || []).map(note => directionWrittenSentenceV17315(note, p, entry.sourceStepOrder)).filter(Boolean);
          if (!instruction) return "";
          return `<li class="direction-pro-step direction-clear-step direction-written-step">
            <span class="direction-pro-number">${index + 1}</span>
            <div class="direction-pro-main direction-clear-card">
              <div class="direction-clear-fallback direction-written-instruction">${esc(instruction)}</div>
              ${notes.length ? `<div class="direction-clear-note direction-written-note">${esc(notes.join(" · "))}</div>` : ""}
            </div>
          </li>`;
        }).join("")}</ol>
      </section>`;
    }

    const directionClearPrimaryHtmlBeforeGlobalWrittenV17315 = directionClearPrimaryHtmlV1732;
    directionClearPrimaryHtmlV1732 = function directionClearPrimaryHtmlGlobalWrittenV17315(clearText, p) {
      return directionGlobalWrittenPrimaryHtmlV17315(clearText, p)
        || directionClearPrimaryHtmlBeforeGlobalWrittenV17315(clearText, p);
    };

    const directionClearDisplayHtmlBeforeGlobalWrittenV17315 = directionClearDisplayHtmlV1732;
    directionClearDisplayHtmlV1732 = function directionClearDisplayHtmlGlobalWrittenV17315(clearText, structuredValue, p) {
      const primary = directionGlobalWrittenPrimaryHtmlV17315(clearText, p);
      if (primary) return `<div class="direction-route-groups direction-clear-route-groups direction-written-route-groups">${primary}</div>`;
      return directionClearDisplayHtmlBeforeGlobalWrittenV17315(clearText, structuredValue, p);
    };

    function directionUnverifiedRouteTextV17315(value, p) {
      const summary = directionSequenceSummary(value, p);
      if (!summary) return "";
      return `<section class="direction-route-group direction-written-unverified">
        <div class="direction-route-heading"><span>ROUTE SEQUENCE ONLY</span></div>
        <div class="direction-clear-card">
          <div class="direction-clear-fallback direction-written-instruction">${esc(summary)}</div>
          <div class="direction-clear-note direction-written-note">Turn-by-turn directions are not verified for this pad yet.</div>
        </div>
      </section>`;
    }

    const fieldRoadStepsHtmlBeforeGlobalWrittenV17315 = fieldRoadStepsHtml;
    fieldRoadStepsHtml = function fieldRoadStepsHtmlGlobalWrittenV17315(value, p) {
      const clear = String(p?.directionsClear || "").trim();
      if (clear && directionClearSectionsV1732(clear).steps.length) {
        return directionClearDisplayHtmlV1732(clear, value, p);
      }
      const routeOnly = directionUnverifiedRouteTextV17315(value, p);
      if (routeOnly) return routeOnly;
      return `<span class="muted">Step-by-step directions are not verified for this pad yet.</span>`;
    };
