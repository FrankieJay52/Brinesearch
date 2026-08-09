    /* BrineSearch V17.3.17 — concise driver-card grammar.
       The main line is only the maneuver + road + optional right-side mileage.
       Context, arrivals, stop signs, gate/CB details, bridges, restrictions, and
       other useful facts are notes below the main instruction. No road-sign
       graphics are created. Double names are represented inline as
       numbered-route / local-road-name when that pair is already evidenced. */

    function directionIntelRowV17317(p, sourceStepOrder) {
      const rows = Array.isArray(p?.directionRoadIntelligence) ? p.directionRoadIntelligence : [];
      return rows.find(row => Number(row?.step_order) === Number(sourceStepOrder)) || null;
    }

    function directionTitleCaseBearingV17317(value) {
      const text = String(value || "").toLowerCase();
      return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
    }

    function directionMainCleanV17317(value) {
      return directionWrittenCleanV17315(value)
        .replace(/^[,;:\s-]+/, "")
        .replace(/[.;]+$/, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function directionStrongSharedDoubleV17317(intel) {
      const evidence = intel?.evidence && typeof intel.evidence === "object" ? intel.evidence : {};
      return String(evidence.dual_name_source || "") === "shared_saved_directions"
        && Number(evidence.dual_name_support || 0) >= 2
        && directionWrittenCleanV17315(intel?.primary_road)
        && directionWrittenCleanV17315(intel?.local_road_name);
    }

    function directionNormalizeRoadV17317(rawValue, p, sourceStepOrder, fullSentence) {
      let road = directionMainCleanV17317(rawValue).replace(/^the\s+/i, "");
      if (!road) return "";

      const bearingMatch = road.match(/\s+(north|south|east|west)$/i);
      const bearing = bearingMatch ? directionTitleCaseBearingV17317(bearingMatch[1]) : "";
      if (bearingMatch) road = road.slice(0, bearingMatch.index).trim();

      const intel = directionIntelRowV17317(p, sourceStepOrder);
      const primary = directionWrittenCleanV17315(intel?.primary_road);
      const local = directionWrittenCleanV17315(intel?.local_road_name);
      const sentence = String(fullSentence || "");

      // When the saved instruction itself proves local-name + route-number,
      // normalize it to route first for fast field scanning: CR-23 / High St.
      if (directionExplicitDoubleNameV17317(road) && primary && local) {
        const lower = road.toLowerCase();
        if (lower.includes(primary.toLowerCase()) || lower.includes(local.toLowerCase())) {
          road = `${primary} / ${local}`;
        }
      } else if (primary && directionRouteTokenV17317(road)) {
        // Canonicalize Route 250 / County Road 23 style text when the live
        // intelligence has already resolved its highway family.
        road = primary;
      } else if (primary && local && directionStrongSharedDoubleV17317(intel)) {
        const lowerSentence = sentence.toLowerCase();
        if (lowerSentence.includes(primary.toLowerCase()) && lowerSentence.includes(local.toLowerCase())) {
          road = `${primary} / ${local}`;
        }
      }

      road = road
        .replace(/\s*\(\s*((?:(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?|(?:State|County|Township)\s+(?:Route|Road|Rd|Hwy)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?))\s*\)\s*$/i, " / $1")
        .replace(/\s{2,}/g, " ")
        .trim();

      return `${road}${bearing ? ` ${bearing}` : ""}`;
    }

    function directionContextNoteV17317(value) {
      let text = directionMainCleanV17317(value);
      if (!text) return "";

      text = text.replace(/^(?:Follow|Continue|Go|Proceed|Travel)\s+.+?\s+(?:to|until)\s+/i, "At ");
      text = text.replace(/^At\s+the\s+the\s+/i, "At the ");
      text = text.replace(/^and\s+/i, "");
      text = text.replace(/^then\s+/i, "");

      if (/^(?:go|continue)\s+into\s+/i.test(text)) {
        text = text.replace(/^(?:go|continue)\s+into\s+/i, "Continue into ");
      }
      if (/\bthe\s+pad\s+is\s+on\s+the\s+(left|right)\b/i.test(text)) {
        return `Pad on ${RegExp.$1.toLowerCase()}`;
      }
      if (/\bpad\s+on\s+(?:the\s+)?(left|right)\b/i.test(text)) {
        return `Pad on ${RegExp.$1.toLowerCase()}`;
      }
      if (/\b(?:the\s+)?lease[- ]road\s+entrance\s+is\s+on\s+the\s+(left|right)\b/i.test(text)) {
        return `Lease road entrance on ${RegExp.$1.toLowerCase()}`;
      }
      if (/\b(?:the\s+)?access\s+road\s+(?:is\s+)?on\s+(?:the\s+)?(left|right)\b/i.test(text)) {
        return `Access road on ${RegExp.$1.toLowerCase()}`;
      }
      if (/\b(?:the\s+)?entrance\s+(?:is\s+)?on\s+(?:the\s+)?(left|right)\b/i.test(text)) {
        return `Entrance on ${RegExp.$1.toLowerCase()}`;
      }

      // Landmark-only phrasing is not useful as a numbered instruction. Keep a
      // safety/decision fact if one exists, otherwise omit the landmark.
      if (/^(?:past|through|continue\s+past|pass)\b/i.test(text)) {
        const stop = text.match(/\b(?:to|until)\s+(?:the\s+)?(stop\s+sign|intersection|junction|split|fork)\b/i);
        if (stop) return `At the ${stop[1].toLowerCase()}`;
        const safety = text.match(/\b(down\s+the\s+hill[^.;]*|across\s+(?:the\s+)?one[- ]lane\s+bridge[^.;]*|one[- ]lane\s+bridge[^.;]*|narrow\s+bridge[^.;]*|gate[^.;]*|curfew[^.;]*|weight\s+limit[^.;]*|truck\s+restriction[^.;]*)/i);
        if (safety) return directionMainCleanV17317(safety[1]);
        if (!/\b(?:lease|access|entrance|pad|bridge|gate|cb\b|restriction|curfew|weight|stop\s+sign)\b/i.test(text)) return "";
      }

      return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function directionUniqueNotesV17317(values) {
      const seen = new Set();
      const result = [];
      for (const value of values || []) {
        const note = directionContextNoteV17317(value);
        if (!note) continue;
        const key = note.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(note);
      }
      return result;
    }

    function directionSplitLeadingContextV17317(value) {
      let work = directionMainCleanV17317(value);
      const notes = [];
      let match = work.match(/^From\s+([^,]{1,80}),\s*(.+)$/i);
      if (match) {
        notes.push(`Start: ${directionMainCleanV17317(match[1])}`);
        work = directionMainCleanV17317(match[2]);
      }

      match = work.match(/^(At\s+[^,]{2,120}),\s*(.+)$/i);
      if (match) {
        notes.push(directionMainCleanV17317(match[1]));
        work = directionMainCleanV17317(match[2]);
      }

      // V17.3.16 can merge an approach-to-decision sentence with its turn.
      // Keep the decision as the main line and the approach point as a note.
      match = work.match(/^(.+?)(?:,\s*|\s+)then\s+((?:turn|veer|bear|slight|sharp|stay|keep)\b.+)$/i);
      if (match) {
        notes.push(directionMainCleanV17317(match[1]));
        work = directionMainCleanV17317(match[2]);
      }
      return { work, notes };
    }

    function directionTurnRoadMatchV17317(work) {
      const action = work.match(/^((?:Turn|Veer|Bear|Slight|Sharp|Stay|Keep)\s+(?:left|right))\b/i);
      if (!action) return null;
      const tail = work.slice(action[0].length);
      const roadMatch = tail.match(/\b(?:continue\s+)?on\s+(.+?)(?=\s+(?:past|through|until|toward|towards|to|at)\b|[;,]|$)/i);
      return { action:action[1], tail, roadMatch };
    }

    function directionConciseMetaV17317(entry, p) {
      const sourceStepOrder = Number(entry?.sourceStepOrder || 0);
      const raw = directionStepCleanV17316(entry?.instruction || "");
      let sentence = directionWrittenSentenceV17315(raw, p, sourceStepOrder);
      const extracted = directionDistanceBadgeFromSentenceV17317(sentence);
      sentence = directionMainCleanV17317(extracted.text);

      let distance = extracted.label;
      if (!distance && !directionSentenceHasDistanceUnitV17317(sentence)) {
        distance = directionSavedDistanceFromIntelV17317(entry, p);
      }

      const split = directionSplitLeadingContextV17317(sentence);
      let work = split.work.replace(/\bonto\b/ig, "on");
      const notes = [...split.notes];
      let main = "";
      const intel = directionIntelRowV17317(p, sourceStepOrder);

      // Arrival wording is already concise and is useful as the main line when
      // the source does not specify an actual turn onto the lease/access road.
      if (!/^(?:Turn|Veer|Bear|Slight|Sharp|Stay|Keep)\b/i.test(work)) {
        let arrival = work.match(/\b(?:the\s+)?lease[- ]road\s+entrance\s+is\s+on\s+the\s+(left|right)\b/i);
        if (arrival) main = `Lease road entrance on ${arrival[1].toLowerCase()}`;
        if (!main && (arrival = work.match(/\b(?:the\s+)?access\s+road\s+(?:is\s+)?on\s+(?:the\s+)?(left|right)\b/i))) main = `Access road on ${arrival[1].toLowerCase()}`;
        if (!main && (arrival = work.match(/\b(?:the\s+)?pad\s+(?:is\s+)?on\s+(?:the\s+)?(left|right)\b/i))) main = `Pad on ${arrival[1].toLowerCase()}`;
        if (!main && (arrival = work.match(/\b(?:the\s+)?entrance\s+(?:is\s+)?on\s+(?:the\s+)?(left|right)\b/i))) main = `Entrance on ${arrival[1].toLowerCase()}`;
      }

      const turn = directionTurnRoadMatchV17317(work);
      if (!main && turn) {
        const canonicalAction = turn.action.charAt(0).toUpperCase() + turn.action.slice(1).toLowerCase();
        if (turn.roadMatch) {
          const road = directionNormalizeRoadV17317(turn.roadMatch[1], p, sourceStepOrder, sentence);
          main = `${canonicalAction} on ${road}`;
          const roadEnd = (turn.roadMatch.index || 0) + turn.roadMatch[0].length;
          notes.push(turn.tail.slice(roadEnd));
        } else {
          const primary = directionWrittenCleanV17315(intel?.primary_road);
          main = primary ? `${canonicalAction} on ${primary}` : canonicalAction;
          notes.push(turn.tail);
        }
      }

      if (!main) {
        const head = work.match(/^Head\s+(north|south|east|west)\s+on\s+(.+?)(?=\s+(?:past|through|until|toward|towards|to)\b|[;,]|$)/i);
        if (head) {
          const road = directionNormalizeRoadV17317(head[2], p, sourceStepOrder, sentence);
          main = `Take ${road} ${directionTitleCaseBearingV17317(head[1])}`;
          notes.push(work.slice((head.index || 0) + head[0].length));
        }
      }

      if (!main) {
        const numericExit = work.match(/^Take\s+(?:the\s+)?exit\s+(\d+[A-Z]?)(.*)$/i);
        if (numericExit) {
          let rest = directionMainCleanV17317(numericExit[2]);
          const forRoad = rest.match(/^for\s+((?:(?:I|US|OH|WV|PA|SR)\s*[- ]?\s*\d{1,4}[A-Z]?|(?:State\s+Route|Route)\s+\d{1,4}[A-Z]?))/i);
          main = `Take Exit ${numericExit[1]}`;
          if (forRoad) {
            const road = directionNormalizeRoadV17317(forRoad[1], p, sourceStepOrder, sentence);
            main += ` for ${road}`;
            rest = directionMainCleanV17317(rest.slice(forRoad[0].length));
          }
          notes.push(rest);
        }
      }

      if (!main) {
        const namedExit = work.match(/^Take\s+(?:the\s+)?(.+?\bexit)\b(.*)$/i);
        if (namedExit) {
          main = `Take ${directionMainCleanV17317(namedExit[1])}`;
          notes.push(namedExit[2].replace(/^\s*and\s+go\s+into\s+/i, "Continue into "));
        }
      }

      if (!main) {
        const take = work.match(/^Take\s+(.+?)(?=\s+(?:through|past|toward|towards|until|and)\b|[;,]|$)/i);
        if (take) {
          const road = directionNormalizeRoadV17317(take[1], p, sourceStepOrder, sentence);
          main = `Take ${road}`;
          notes.push(work.slice((take.index || 0) + take[0].length));
        }
      }

      if (!main) {
        const follow = work.match(/^Follow\s+(.+?)(?=\s+(?:through|past|until|to|toward|towards)\b|[;,]|$)/i);
        if (follow) {
          const road = directionNormalizeRoadV17317(follow[1], p, sourceStepOrder, sentence);
          main = `Continue on ${road}`;
          notes.push(work.slice((follow.index || 0) + follow[0].length));
        }
      }

      if (!main) {
        const cont = work.match(/^Continue(?:\s+straight)?\s+on\s+(.+?)(?=\s+(?:through|past|until|to|toward|towards)\b|[;,]|$)/i);
        if (cont) {
          const road = directionNormalizeRoadV17317(cont[1], p, sourceStepOrder, sentence);
          main = `Continue on ${road}`;
          notes.push(work.slice((cont.index || 0) + cont[0].length));
        } else if (/^(?:Go|Continue)\s+straight\b/i.test(work)) {
          main = "Continue straight";
          notes.push(work.replace(/^(?:Go|Continue)\s+straight\b/i, ""));
        }
      }

      // Intelligence is a fallback for grammar only; never use an uncertain
      // catalog alias to manufacture a double name.
      if (!main && intel) {
        const primary = directionWrittenCleanV17315(intel.primary_road);
        const local = directionWrittenCleanV17315(intel.local_road_name);
        const safeRoad = primary
          ? (local && directionStrongSharedDoubleV17317(intel) ? `${primary} / ${local}` : primary)
          : "";
        const maneuver = String(intel.maneuver_class || "");
        const action = maneuver === "turn_left" ? "Turn left"
          : maneuver === "turn_right" ? "Turn right"
          : maneuver === "stay_left" ? "Stay left"
          : maneuver === "stay_right" ? "Stay right"
          : maneuver === "straight" ? "Continue straight"
          : maneuver === "merge" ? "Merge"
          : maneuver === "follow" || maneuver === "continue" ? "Continue"
          : "";
        if (action && safeRoad) main = `${action}${action === "Continue" ? " on" : action === "Merge" ? " on" : " on"} ${safeRoad}`;
      }

      // Last resort: keep only the first compact action clause as the main line
      // and move the remaining detail below. This avoids narrative paragraphs in
      // the primary instruction without inventing a new road or maneuver.
      if (!main) {
        const clauses = work.split(/;|\.\s+/).map(directionMainCleanV17317).filter(Boolean);
        main = clauses.shift() || work;
        notes.push(...clauses);
      }

      main = directionMainCleanV17317(main);
      const doubleName = directionExplicitDoubleNameV17317(main)
        || directionDoubleNameFromIntelV17317(p, sourceStepOrder, main);
      const allNotes = directionUniqueNotesV17317([
        ...notes,
        ...(entry?.notes || []).map(note => directionWrittenSentenceV17315(note, p, sourceStepOrder))
      ]).filter(note => note.toLowerCase() !== main.toLowerCase());

      return { instruction:main, distance, doubleName, notes:allNotes };
    }

    directionWrittenDisplayMetaV17317 = directionConciseMetaV17317;

    directionGlobalWrittenPrimaryHtmlV17315 = function directionGlobalWrittenPrimaryHtmlConciseV17317(clearText, p) {
      const parsed = directionGlobalWrittenEntriesV17315(clearText);
      if (!parsed.steps.length) return "";
      return `<section class="direction-route-group direction-clear-primary direction-written-global direction-written-v17317">
        <div class="direction-route-heading"><span>PRIMARY ROUTE</span></div>
        <ol class="direction-pro-steps direction-clear-steps">${parsed.steps.map((entry, index) => {
          const display = directionConciseMetaV17317(entry, p);
          if (!display.instruction) return "";
          return `<li class="direction-pro-step direction-clear-step direction-written-step${display.doubleName ? " direction-written-double-road-v17317" : ""}">
            <span class="direction-pro-number">${index + 1}</span>
            <div class="direction-pro-main direction-clear-card direction-written-card-v17317">
              <div class="direction-written-row-v17317">
                <div class="direction-clear-fallback direction-written-instruction">${esc(display.instruction)}</div>
                ${display.distance ? `<span class="direction-clear-distance direction-written-distance-v17317">${esc(display.distance)}</span>` : ""}
              </div>
              ${display.notes.length ? `<div class="direction-clear-note direction-written-note">${esc(display.notes.join(" · "))}</div>` : ""}
            </div>
          </li>`;
        }).join("")}</ol>
      </section>`;
    };

    window.directionConciseMetaV17317 = directionConciseMetaV17317;
