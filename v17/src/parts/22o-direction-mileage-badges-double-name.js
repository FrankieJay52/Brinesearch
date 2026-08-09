    /* BrineSearch V17.3.17 — written directions with right-side mileage badges.
       Keep the V17.3.16 live-source priority and fragment cleanup, but restore the
       fast-scanning distance badge from the older driver cards. Road/highway sign
       graphics stay removed. Genuine route/local-name pairs are marked as DOUBLE
       NAME only when the displayed instruction itself proves the pair or when the
       existing shared-saved-direction intelligence already inserted that pair. */

    function directionDistanceUnitV17317(unit) {
      const value = String(unit || "").toLowerCase();
      if (/^(?:mile|miles|mi)$/.test(value)) return "mi";
      if (/^(?:foot|feet|ft)$/.test(value)) return "ft";
      if (/^(?:yard|yards|yd)$/.test(value)) return "yd";
      return value;
    }

    function directionDistanceBadgeFromSentenceV17317(value) {
      const sentence = directionWrittenCleanV17315(value);
      const pattern = /\bfor\s+(about\s+|approximately\s+|approx\.?\s+|roughly\s+)?(\d+(?:\.\d+)?|\.\d+|\d+\s*\/\s*\d+|[½¼¾])\s*(miles?|mile|mi|feet|foot|ft|yards?|yd)\b/ig;
      const matches = [...sentence.matchAll(pattern)];
      if (matches.length !== 1) return { text:sentence, label:"", extracted:false };

      const match = matches[0];
      const qualifier = String(match[1] || "").trim();
      const amount = String(match[2] || "").replace(/\s+/g, "");
      const unit = directionDistanceUnitV17317(match[3]);
      const prefix = qualifier ? "≈" : "";
      const label = `${prefix}${amount} ${unit}`;
      let text = `${sentence.slice(0, match.index)}${sentence.slice((match.index || 0) + match[0].length)}`;
      text = text.replace(/\s+([,.;])/g, "$1").replace(/\s{2,}/g, " ").trim();
      text = text.replace(/\s*;\s*$/g, ".");
      if (text && !/[.!?]$/.test(text)) text += ".";
      return { text, label, extracted:true };
    }

    function directionRouteTokenV17317(value) {
      return /\b(?:(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?|(?:State|County|Township)\s+(?:Route|Road|Rd|Hwy|Highway)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?)\b/i.test(String(value || ""));
    }

    function directionLocalRoadTokenV17317(value) {
      return /\b[A-Za-z0-9][A-Za-z0-9 .'-]{0,64}\s+(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way)\b/i.test(String(value || ""));
    }

    function directionExplicitDoubleNameV17317(value) {
      const text = String(value || "");
      for (let index = text.indexOf("/"); index >= 0; index = text.indexOf("/", index + 1)) {
        const left = text.slice(Math.max(0, index - 85), index);
        const right = text.slice(index + 1, Math.min(text.length, index + 86));
        const leftRoute = directionRouteTokenV17317(left);
        const rightRoute = directionRouteTokenV17317(right);
        const leftLocal = directionLocalRoadTokenV17317(left);
        const rightLocal = directionLocalRoadTokenV17317(right);
        if ((leftRoute && rightLocal && !rightRoute) || (rightRoute && leftLocal && !leftRoute)) return true;
      }

      const localThenRoute = /\b[A-Za-z0-9][A-Za-z0-9 .'-]{0,64}\s+(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way)\s*\((?:(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?|(?:State|County|Township)\s+(?:Route|Road|Rd|Hwy)\s*[- ]?\s*\d{1,4})\)/i;
      const routeThenLocal = /\b(?:(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?|(?:State|County|Township)\s+(?:Route|Road|Rd|Hwy)\s*[- ]?\s*\d{1,4})\s*\([^)]*[A-Za-z][^)]*(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way)[^)]*\)/i;
      return localThenRoute.test(text) || routeThenLocal.test(text);
    }

    function directionDoubleNameFromIntelV17317(p, sourceStepOrder, sentence) {
      const rows = Array.isArray(p?.directionRoadIntelligence) ? p.directionRoadIntelligence : [];
      const intel = rows.find(row => Number(row?.step_order) === Number(sourceStepOrder));
      if (!intel) return false;
      const evidence = intel?.evidence && typeof intel.evidence === "object" ? intel.evidence : {};
      if (String(evidence.dual_name_source || "") !== "shared_saved_directions") return false;
      if (Number(evidence.dual_name_support || 0) < 2) return false;
      const primary = directionWrittenCleanV17315(intel?.primary_road);
      const alias = directionWrittenCleanV17315(intel?.local_road_name);
      if (!primary || !alias) return false;
      const lower = String(sentence || "").toLowerCase();
      return lower.includes(primary.toLowerCase()) && lower.includes(alias.toLowerCase());
    }

    function directionSimpleStartFromV17317(rawValue, renderedValue) {
      const raw = directionWrittenCleanV17315(rawValue);
      const rendered = directionWrittenCleanV17315(renderedValue);
      const match = raw.match(/^From\s+([^,]{2,45}),\s*(?:take|head|go|follow)\s+((?:(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}[A-Z]?|(?:State\s+Route|Route)\s*\d{1,4}[A-Z]?))(?:\s+(north|south|east|west))?\.?$/i);
      if (!match) return rendered;
      const origin = directionWrittenCleanV17315(match[1]);
      const road = directionWrittenCleanV17315(match[2]);
      const bearing = directionWrittenCleanV17315(match[3]);
      return `Start from ${origin} on ${road}${bearing ? ` ${bearing.charAt(0).toUpperCase()}${bearing.slice(1).toLowerCase()}` : ""}.`;
    }

    function directionWrittenDisplayMetaV17317(entry, p) {
      const sourceStepOrder = Number(entry?.sourceStepOrder || 0);
      const raw = directionStepCleanV17316(entry?.instruction || "");
      let sentence = directionWrittenSentenceV17315(raw, p, sourceStepOrder);
      sentence = directionSimpleStartFromV17317(raw, sentence);
      const distance = directionDistanceBadgeFromSentenceV17317(sentence);
      const doubleName = directionExplicitDoubleNameV17317(distance.text)
        || directionDoubleNameFromIntelV17317(p, sourceStepOrder, distance.text);
      return {
        instruction:distance.text,
        distance:distance.label,
        doubleName
      };
    }

    const directionGlobalWrittenPrimaryHtmlBeforeV17317 = directionGlobalWrittenPrimaryHtmlV17315;
    directionGlobalWrittenPrimaryHtmlV17315 = function directionGlobalWrittenPrimaryHtmlMileageV17317(clearText, p) {
      const parsed = directionGlobalWrittenEntriesV17315(clearText);
      if (!parsed.steps.length) return directionGlobalWrittenPrimaryHtmlBeforeV17317(clearText, p);
      return `<section class="direction-route-group direction-clear-primary direction-written-global direction-written-v17317">
        <div class="direction-route-heading"><span>PRIMARY ROUTE</span></div>
        <ol class="direction-pro-steps direction-clear-steps">${parsed.steps.map((entry, index) => {
          const display = directionWrittenDisplayMetaV17317(entry, p);
          const notes = (entry.notes || []).map(note => directionWrittenSentenceV17315(note, p, entry.sourceStepOrder)).filter(Boolean);
          if (!display.instruction) return "";
          return `<li class="direction-pro-step direction-clear-step direction-written-step">
            <span class="direction-pro-number">${index + 1}</span>
            <div class="direction-pro-main direction-clear-card direction-written-card-v17317">
              <div class="direction-written-row-v17317">
                <div class="direction-clear-fallback direction-written-instruction">${esc(display.instruction)}</div>
                ${display.distance ? `<span class="direction-clear-distance direction-written-distance-v17317">${esc(display.distance)}</span>` : ""}
              </div>
              ${display.doubleName ? `<div class="direction-written-double-name-v17317" title="This road is saved with two names for this segment">DOUBLE NAME</div>` : ""}
              ${notes.length ? `<div class="direction-clear-note direction-written-note">${esc(notes.join(" · "))}</div>` : ""}
            </div>
          </li>`;
        }).join("")}</ol>
      </section>`;
    };

    window.directionWrittenDisplayMetaV17317 = directionWrittenDisplayMetaV17317;
    window.directionExplicitDoubleNameV17317 = directionExplicitDoubleNameV17317;
