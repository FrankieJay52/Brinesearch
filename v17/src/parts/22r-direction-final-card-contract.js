    /* BrineSearch V17.3.17 — final driver-card contract.
       Final UI contract: numbered card; main line is only maneuver + road (or a
       concise arrival when no road maneuver exists); one saved distance appears
       at right; all origin/decision/safety/arrival context is a note underneath.
       This pass also absorbs context-only legacy rows into the next real step. */

    function directionDistanceNumberV17317(raw) {
      const text = String(raw || "").trim().replace(/\s+/g, " ");
      const unicode = {"½":0.5,"¼":0.25,"¾":0.75};
      if (unicode[text] != null) return unicode[text];
      let match = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
      if (match) {
        const denominator = Number(match[3]);
        return denominator ? Number(match[1]) + Number(match[2]) / denominator : NaN;
      }
      match = text.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (match) {
        const denominator = Number(match[2]);
        return denominator ? Number(match[1]) / denominator : NaN;
      }
      if (/^\.\d+$/.test(text)) return Number(`0${text}`);
      return Number(text);
    }

    function directionDistanceFactsFinalV17317(value) {
      const text = String(value || "");
      const number = "(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|[½¼¾]|\\d+(?:\\.\\d+)?|\\.\\d+)";
      const pattern = new RegExp(`(^|[^0-9-])((?:approximately|approx(?:imately)?\\.?|about|roughly)\\s+)?(${number})\\s*(miles?|mile|mi|feet|foot|ft|yards?|yard|yd)\\b`, "ig");
      const facts = [];
      let match;
      while ((match = pattern.exec(text))) {
        const prefixLength = String(match[1] || "").length;
        const rawNumber = String(match[3] || "");
        const valueNumber = directionDistanceNumberV17317(rawNumber);
        if (!Number.isFinite(valueNumber) || valueNumber <= 0) continue;
        const unitRaw = String(match[4] || "").toLowerCase();
        const unit = /^(?:mile|miles|mi)$/.test(unitRaw) ? "mi"
          : /^(?:feet|foot|ft)$/.test(unitRaw) ? "ft"
          : "yd";
        const approximate = Boolean(String(match[2] || "").trim());
        const rounded = Number(valueNumber.toFixed(2));
        facts.push({
          start:(match.index || 0) + prefixLength,
          end:(match.index || 0) + String(match[0] || "").length,
          label:`${approximate ? "≈" : ""}${rounded} ${unit}`,
          raw:String(match[0] || "").slice(prefixLength).trim()
        });
      }
      return facts;
    }

    function directionStripOneDistanceFinalV17317(value, fact) {
      let text = String(value || "");
      if (!fact) return directionMainCleanV17317(text);
      text = `${text.slice(0, fact.start)}${text.slice(fact.end)}`;
      return directionMainCleanV17317(text)
        .replace(/\(\s*\)/g, "")
        .replace(/\b(?:for|in|about|approximately|approx\.?|roughly)\s*$/i, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function directionLeadingContextFinalV17317(value) {
      const text = directionMainCleanV17317(value);
      if (!text) return { work:"", notes:[], contextOnly:false };
      const action = "(?:turn|take|head|go|follow|continue|merge|veer|bear|stay|keep|slight|sharp|travel|proceed)";
      let match = text.match(new RegExp(`^From\\s+(.+?)(?:,\\s*|\\s+)(?=(${action})\\b)([\\s\\S]+)$`, "i"));
      if (match) return { work:directionMainCleanV17317(`${match[2]}${match[3]}`), notes:[`Start: ${directionMainCleanV17317(match[1])}`], contextOnly:false };
      if (/^From\b/i.test(text)) return { work:"", notes:[`Start: ${text.replace(/^From\s+/i, "")}`], contextOnly:true };

      match = text.match(new RegExp(`^(At\\s+.+?)(?:,\\s*|\\s+)(?=(${action})\\b)([\\s\\S]+)$`, "i"));
      if (match) return { work:directionMainCleanV17317(`${match[2]}${match[3]}`), notes:[directionMainCleanV17317(match[1])], contextOnly:false };
      if (/^At\b/i.test(text) && !new RegExp(`\\b${action}\\b`, "i").test(text)) return { work:"", notes:[text], contextOnly:true };
      return { work:text, notes:[], contextOnly:false };
    }

    function directionNormalizeShorthandFinalV17317(value) {
      return directionMainCleanV17317(value)
        .replace(/^make\s+(?:a\s+)?(left|right)\b/i, (_, side) => `Turn ${side.toLowerCase()}`)
        .replace(/^(left|right)\s*\((?:straight|bear|veer)?\)\s+(?:on|onto)\b/i, (_, side) => `Turn ${side.toLowerCase()} on`)
        .replace(/^(left|right)\s+(?:on|onto)\b/i, (_, side) => `Turn ${side.toLowerCase()} on`)
        .replace(/^go\s+(left|right)\s+(?:on|onto)\b/i, (_, side) => `Turn ${side.toLowerCase()} on`);
    }

    function directionSpecialCompoundSplitFinalV17317(value) {
      const text = directionMainCleanV17317(value);
      const facts = directionDistanceFactsFinalV17317(text);
      if (facts.length < 2) return [text];

      // Common import: first road + distance, then shorthand second turn + road + distance.
      const second = text.match(/\s+(?=(?:turn\s+)?(?:left|right)\s*(?:\([^)]*\)\s*)?(?:on|onto)\s+)/i);
      if (second && Number(second.index) > 0) {
        const first = directionMainCleanV17317(text.slice(0, second.index));
        let rest = directionMainCleanV17317(text.slice(second.index));
        rest = directionNormalizeShorthandFinalV17317(rest);
        if (first && rest) return [first, rest];
      }

      // Common import: Take ROAD distance to TARGET ROAD and turn left/right.
      const targetTurn = text.match(/^(.+?\b(?:miles?|mi|feet|ft|yards?|yd))\s+to\s+(.+?)\s+and\s+turn\s+(left|right)\b(.*)$/i);
      if (targetTurn) {
        const first = directionMainCleanV17317(targetTurn[1]);
        const secondStep = directionMainCleanV17317(`Turn ${targetTurn[3]} on ${targetTurn[2]} ${targetTurn[4] || ""}`);
        if (first && secondStep) return [first, secondStep];
      }
      return [text];
    }

    function directionFinalSplitEntriesV17317(entries) {
      const out = [];
      for (const entry of entries || []) {
        const raw = directionStepCleanV17316(entry?.instruction || "");
        if (!raw) continue;
        let parts = [raw];
        const actionCount = (raw.match(/\b(?:turn\s+(?:left|right)|take\s+(?:exit|I-|US-|OH-|WV-|PA-|SR-|Route)|head\s+(?:north|south|east|west)|merge\b|veer\s+(?:left|right)|bear\s+(?:left|right))\b/ig) || []).length;
        const distanceCount = directionDistanceFactsFinalV17317(raw).length;
        if (actionCount > 1 || distanceCount > 1) {
          try {
            const legacyParts = typeof directionSplitDriverStepV17312 === "function" ? directionSplitDriverStepV17312(raw) : [];
            if (legacyParts.length > 1) parts = legacyParts;
          } catch {}
        }
        parts = parts.flatMap(directionSpecialCompoundSplitFinalV17317).map(directionNormalizeShorthandFinalV17317).filter(Boolean);
        parts.forEach((instruction, index) => out.push({
          ...entry,
          instruction,
          notes:index === parts.length - 1 ? [...(entry?.notes || [])] : [],
          fragmentReassembled:parts.length > 1 || entry?.fragmentReassembled,
          disableRoadIntel:parts.length > 1 || entry?.disableRoadIntel
        }));
      }
      return out;
    }

    function directionExplicitRoadDisplayFinalV17317(value, p) {
      const text = String(value || "");
      try {
        const dual = typeof directionInlineDualRoadV17312 === "function" ? directionInlineDualRoadV17312(text, p) : null;
        if (dual?.text && dual?.alias) return { road:`${dual.text} / ${dual.alias}`, doubleName:true };
      } catch {}

      // Preserve two numbered routes sharing pavement; this is not a local-name double name.
      const route = "(?:(?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d{1,4}(?:\\/\\d+)?[A-Z]?|(?:State|County|Township)\\s+(?:Route|Road|Rd|Hwy)\\s*[- ]?\\s*\\d{1,4}(?:\\/\\d+)?[A-Z]?)";
      let match = text.match(new RegExp(`\\b(${route})\\s*\\/\\s*(${route})\\b`, "i"));
      if (match) return { road:`${directionMainCleanV17317(match[1])} / ${directionMainCleanV17317(match[2])}`, doubleName:false };

      const local = "([A-Za-z0-9][A-Za-z0-9 .'-]{0,70}?(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way))";
      match = text.match(new RegExp(`\\b${local}\\s*\\(\\s*(${route})\\s*\\)`, "i"));
      if (match) {
        let primary = directionMainCleanV17317(match[2]);
        const county = primary.match(/^County\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)$/i);
        const township = primary.match(/^Township\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)$/i);
        if (county) primary = `CR-${county[1]}`;
        if (township) primary = `TR-${township[1]}`;
        return { road:`${primary} / ${directionMainCleanV17317(match[1])}`, doubleName:true };
      }
      return null;
    }

    function directionRoadFromViewFinalV17317(value, p) {
      const explicit = directionExplicitRoadDisplayFinalV17317(value, p);
      if (explicit) return explicit;
      let view;
      try { view = directionClearStepViewV1733(value, p); } catch { view = null; }
      const road = directionMainCleanV17317(view?.road?.text || "");
      const alias = directionMainCleanV17317(view?.road?.alias || "");
      if (road && alias) return { road:`${road} / ${alias}`, doubleName:true, view };
      return { road, doubleName:false, view };
    }

    function directionMainActionFinalV17317(value, p) {
      const text = directionNormalizeShorthandFinalV17317(value).replace(/\bonto\b/ig, "on");
      const roadInfo = directionRoadFromViewFinalV17317(text, p);
      const road = roadInfo.road;
      const view = roadInfo.view || (() => { try { return directionClearStepViewV1733(text, p); } catch { return null; } })();
      let match;

      if ((match = text.match(/^Turn\s+(left|right)\b/i))) return { main:`Turn ${match[1].toLowerCase()}${road ? ` on ${road}` : ""}`, roadInfo, view };
      if ((match = text.match(/^(Slight|Veer|Bear|Stay|Keep|Sharp)\s+(left|right)\b/i))) return { main:`${match[1].charAt(0).toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2].toLowerCase()}${road ? ` on ${road}` : ""}`, roadInfo, view };
      if ((match = text.match(/^Head\s+(northwest|northeast|southwest|southeast|north|south|east|west)\b/i))) return { main:`Head ${match[1].toLowerCase()}${road ? ` on ${road}` : ""}`, roadInfo, view };
      if ((match = text.match(/^Go\s+(northwest|northeast|southwest|southeast|north|south|east|west)\b/i))) return { main:`Continue ${match[1].toLowerCase()}${road ? ` on ${road}` : ""}`, roadInfo, view };
      if (/^Take\s+(?:the\s+)?exit\b/i.test(text) || /\bExit\s*\d/i.test(text) && /^Take\b/i.test(text)) return { main:road?.toLowerCase().startsWith("exit ") ? `Take ${road}` : (road ? `Take ${road}` : "Take exit"), roadInfo, view };
      if (/^Take\b/i.test(text)) return { main:road ? `Take ${road}` : "Take route", roadInfo, view };
      if (/^Merge\b/i.test(text)) return { main:road ? `Merge on ${road}` : "Merge", roadInfo, view };
      if (/^(?:Follow|Continue|Travel|Proceed)\b/i.test(text)) return { main:road ? `Continue on ${road}` : "Continue", roadInfo, view };
      if (/^Go\b/i.test(text)) return { main:road ? `Continue on ${road}` : "Continue", roadInfo, view };

      // Route + direction without an action is an imported continuation.
      if (road) {
        const bearing = text.match(/\b(northwest|northeast|southwest|southeast|north|south|east|west)\b/i);
        return { main:`Continue on ${road}${bearing ? ` ${directionTitleCaseBearingV17317(bearing[1])}` : ""}`, roadInfo, view };
      }

      let arrival = text.match(/\b(?:the\s+)?(?:pad|well\s*pad)\s+(?:is|will\s+be)?\s*(?:on\s+)?(?:the\s+)?(left|right)\b/i);
      if (arrival) return { main:`Pad on ${arrival[1].toLowerCase()}`, roadInfo, view };
      if ((arrival = text.match(/\b(?:lease[- ]road|lease\s+road)\s+(?:entrance\s+)?(?:is|will\s+be)?\s*(?:on\s+)?(?:the\s+)?(left|right)\b/i))) return { main:`Lease road entrance on ${arrival[1].toLowerCase()}`, roadInfo, view };
      if ((arrival = text.match(/\baccess\s+road\s+(?:is|will\s+be)?\s*(?:on\s+)?(?:the\s+)?(left|right)\b/i))) return { main:`Access road on ${arrival[1].toLowerCase()}`, roadInfo, view };
      if ((arrival = text.match(/\bentrance\s+(?:is|will\s+be)?\s*(?:on\s+)?(?:the\s+)?(left|right)\b/i))) return { main:`Entrance on ${arrival[1].toLowerCase()}`, roadInfo, view };
      if (/\b(?:pad|lease\s+road|access\s+road|entrance)\b/i.test(text)) return { main:"Arrive", roadInfo, view };
      return { main:"Continue", roadInfo, view };
    }

    function directionNotesFinalV17317(original, working, mainInfo, distanceFact, seedNotes) {
      const notes = [...(seedNotes || [])];
      const text = String(original || "");
      let match;
      if ((match = text.match(/\b(?:to|until)\s+(?:the\s+)?(stop\s+sign|intersection|junction|split|fork|end\s+of\s+(?:the\s+)?road)\b/i))) notes.push(`At the ${match[1].toLowerCase()}`);
      if ((match = text.match(/\b(?:at\s+)?(?:the\s+)?(\d+\s*\/\s*\d+\s+split)\b/i))) notes.push(`At the ${match[1]}`);
      if (/\bone[- ]lane\s+bridge\b/i.test(text)) notes.push("One-lane bridge");
      if ((match = text.match(/\b(?:the\s+)?pad\s+(?:is|will\s+be)?\s*(?:on\s+)?(?:the\s+)?(left|right)\b/i))) notes.push(`Pad on ${match[1].toLowerCase()}`);
      if ((match = text.match(/\blease[- ]road\s+entrance\s+(?:is|will\s+be)?\s*(?:on\s+)?(?:the\s+)?(left|right)\b/i))) notes.push(`Lease road entrance on ${match[1].toLowerCase()}`);
      if ((match = text.match(/\baccess\s+road\s+(?:is|will\s+be)?\s*(?:on\s+)?(?:the\s+)?(left|right)\b/i))) notes.push(`Access road on ${match[1].toLowerCase()}`);
      if ((match = text.match(/\b(?:gate|door|access)\s+code\s*[:#]?\s*[^.;,]+/i))) notes.push(directionMainCleanV17317(match[0]));
      if ((match = text.match(/\bCB\s*(?:channel|ch\.?)?\s*\d+\b/i))) notes.push(directionMainCleanV17317(match[0]));
      if ((match = text.match(/\b(?:curfew|weight\s+limit|truck\s+restriction|road\s+closed|closure)\b[^.;]*/i))) notes.push(directionMainCleanV17317(match[0]));

      try {
        const viewNote = directionMainCleanV17317(mainInfo?.view?.note || "");
        if (viewNote) notes.push(viewNote);
      } catch {}
      notes.push(...(seedNotes || []));
      return directionUniqueNotesV17317(notes).filter(note => note && note.toLowerCase() !== String(mainInfo?.main || "").toLowerCase());
    }

    function directionFinalMetaV17317(entry, p) {
      const original = directionStepCleanV17316(entry?.instruction || "");
      const leading = directionLeadingContextFinalV17317(original);
      if (leading.contextOnly) return { suppress:true, instruction:"", distance:"", doubleName:false, notes:directionUniqueNotesV17317([...leading.notes, ...(entry?.notes || [])]) };
      const working = directionNormalizeShorthandFinalV17317(leading.work || original);
      const facts = directionDistanceFactsFinalV17317(working);
      const fact = facts.length === 1 ? facts[0] : null;
      const withoutDistance = fact ? directionStripOneDistanceFinalV17317(working, fact) : working;
      const mainInfo = directionMainActionFinalV17317(withoutDistance, p);
      let main = directionMainCleanV17317(mainInfo.main);
      if (/^(?:From|At)\b/i.test(main)) main = "Continue";
      if (/\.\s+\S/.test(main)) main = directionMainCleanV17317(main.split(/\.\s+/)[0]);
      const doubleName = Boolean(mainInfo?.roadInfo?.doubleName || directionExplicitDoubleNameV17317(main));
      const notes = directionNotesFinalV17317(original, working, mainInfo, fact, [...leading.notes, ...(entry?.notes || [])]);
      return { suppress:false, instruction:main, distance:fact?.label || "", doubleName, notes };
    }

    function directionFinalCardsFromEntriesV17317(entries, p) {
      const split = directionFinalSplitEntriesV17317(entries);
      const cards = [];
      let pending = [];
      for (const entry of split) {
        const meta = directionFinalMetaV17317(entry, p);
        if (meta.suppress) {
          pending.push(...meta.notes);
          continue;
        }
        meta.notes = directionUniqueNotesV17317([...pending, ...meta.notes]);
        pending = [];
        cards.push(meta);
      }
      if (pending.length && cards.length) cards[cards.length - 1].notes = directionUniqueNotesV17317([...cards[cards.length - 1].notes, ...pending]);
      return cards;
    }

    directionGlobalWrittenPrimaryHtmlV17315 = function directionGlobalWrittenPrimaryHtmlFinalContractV17317(clearText, p) {
      const parsed = directionGlobalWrittenEntriesV17315(clearText);
      const cards = directionFinalCardsFromEntriesV17317(parsed.steps || [], p);
      if (!cards.length) return "";
      return `<section class="direction-route-group direction-clear-primary direction-written-global direction-written-v17317">
        <div class="direction-route-heading"><span>PRIMARY ROUTE</span></div>
        <ol class="direction-pro-steps direction-clear-steps">${cards.map((display, index) => `<li class="direction-pro-step direction-clear-step direction-written-step${display.doubleName ? " direction-written-double-road-v17317" : ""}">
          <span class="direction-pro-number">${index + 1}</span>
          <div class="direction-pro-main direction-clear-card direction-written-card-v17317">
            <div class="direction-written-row-v17317">
              <div class="direction-clear-fallback direction-written-instruction">${esc(display.instruction)}</div>
              ${display.distance ? `<span class="direction-clear-distance direction-written-distance-v17317">${esc(display.distance)}</span>` : ""}
            </div>
            ${display.notes.length ? `<div class="direction-clear-note direction-written-note">${esc(display.notes.join(" · "))}</div>` : ""}
          </div>
        </li>`).join("")}</ol>
      </section>`;
    };

    directionWrittenDisplayMetaV17317 = directionFinalMetaV17317;
    window.directionFinalMetaV17317 = directionFinalMetaV17317;
    window.directionFinalCardsFromEntriesV17317 = directionFinalCardsFromEntriesV17317;
