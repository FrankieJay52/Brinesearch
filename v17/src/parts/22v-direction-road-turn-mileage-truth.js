    /* BrineSearch V17.3.20 — source-aware road / turn / mileage truth.
       COLOGIE remains the card contract. This layer fixes legacy source sentences
       where a distance describes the road being traveled BEFORE a later turn, and
       splits genuine multi-road/multi-turn source rows without inventing geometry.

       Examples:
         Continue 1.3 mi and turn right on Road B
       becomes
         Continue on Road A   1.3 mi
         Turn right on Road B

       Saved source text is never overwritten. This is presentation-only. */

    function directionTruthCleanV17320(value) {
      return String(value || "")
        .replace(/\bonto\b/ig, "on")
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([,.;])/g, "$1")
        .trim();
    }

    function directionTruthRoadV17320(value, p) {
      const raw = directionTruthCleanV17320(value);
      if (!raw) return "";
      let work = raw;
      try {
        const leading = directionLeadingContextFinalV17317(raw);
        if (leading?.work) work = leading.work;
      } catch {}
      try {
        const road = directionRoadFromViewFinalV17317(work, p)?.road;
        return directionTruthCleanV17320(road);
      } catch {
        return "";
      }
    }

    function directionTruthLeadingV17320(value) {
      const raw = directionTruthCleanV17320(value);
      try {
        const leading = directionLeadingContextFinalV17317(raw);
        if (leading && (leading.work || leading.contextOnly)) return {
          work:directionTruthCleanV17320(leading.work || ""),
          notes:[...(leading.notes || [])]
        };
      } catch {}
      return { work:raw, notes:[] };
    }

    function directionTruthNoteFromBeforeTargetV17320(value) {
      const text = directionTruthCleanV17320(value);
      const match = text.match(/\b(before|after|at|near)\s+(.+?)(?=\s+(?:on|onto)\s+[A-Za-z0-9]|$)/i);
      if (!match) return "";
      const lead = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      return `${lead} ${directionTruthCleanV17320(match[2])}`;
    }

    function directionTruthNormalizeTurnTailV17320(value) {
      let text = directionTruthCleanV17320(value)
        .replace(/^(?:and|then)\s+/i, "")
        .replace(/^turn\s+(left|right)\s+(?:on|onto)\s+/i, (_, side) => `Turn ${side.toLowerCase()} on `)
        .replace(/^(stay|keep|veer|bear|slight)\s+(left|right)\s+(?:on|onto)\s+/i, (_, action, side) => `${action.charAt(0).toUpperCase()+action.slice(1).toLowerCase()} ${side.toLowerCase()} on `)
        .replace(/\s+(?:and|then)\s*$/i, "")
        .trim();
      return text;
    }

    function directionTruthTransitionSplitV17320(entry, p) {
      const leading = directionTruthLeadingV17320(entry?.instruction || "");
      const work = leading.work;
      if (!work) return null;

      /* Saved import form: "Take US-22 and go south on E Steubenville St /
         SR-152. Continue 0.3 mile." The mileage belongs to the second road. */
      const transition = work.match(/^Take\s+(.+?)\s+and\s+(?:go|head|travel|continue)\s+(?:(northwest|northeast|southwest|southeast|north|south|east|west)\s+)?(?:on|onto)\s+(.+)$/i);
      if (!transition) return null;
      const firstRoad = directionTruthCleanV17320(transition[1]);
      const second = directionTruthCleanV17320(transition[3]);
      if (!firstRoad || !second) return null;
      const bearing = transition[2] ? transition[2].toLowerCase() : "";
      return [
        { ...entry, instruction:`Take ${firstRoad}`, notes:[...(leading.notes || [])], disableRoadIntel:true, sourceTruthSplitV17320:true },
        { ...entry, instruction:`${bearing ? `Head ${bearing}` : "Continue"} on ${second}`, notes:[...(entry?.notes || [])], disableRoadIntel:true, sourceTruthSplitV17320:true }
      ];
    }

    function directionTruthStayThenTurnSplitV17320(entry, previousRoad, p) {
      const leading = directionTruthLeadingV17320(entry?.instruction || "");
      const work = leading.work;
      if (!work) return null;
      const match = work.match(/^((?:Stay|Keep|Bear|Veer|Slight)\s+(?:left|right))\b(.*?),?\s*(?:then\s+)(turn\s+(?:left|right)\b[\s\S]+)$/i);
      if (!match) return null;
      const firstAction = directionTruthCleanV17320(match[1]);
      const firstContext = directionTruthCleanV17320(match[2]).replace(/^[,\s]+|[,\s]+$/g, "");
      const secondRaw = directionTruthNormalizeTurnTailV17320(match[3]);
      if (!secondRaw) return null;
      const firstInstruction = previousRoad ? `${firstAction} on ${previousRoad}` : firstAction;
      const firstNotes = [...(leading.notes || [])];
      if (firstContext) firstNotes.push(directionTruthCleanV17320(firstContext).replace(/^at\s+/i, "At "));
      const secondNotes = [...(entry?.notes || [])];
      const before = directionTruthNoteFromBeforeTargetV17320(secondRaw);
      if (before) secondNotes.push(before);
      return [
        { ...entry, instruction:firstInstruction, notes:firstNotes, disableRoadIntel:true, sourceTruthSplitV17320:true },
        { ...entry, instruction:secondRaw, notes:secondNotes, disableRoadIntel:true, sourceTruthSplitV17320:true }
      ];
    }

    function directionTruthDistanceBeforeTurnSplitV17320(entry, previousRoad, p) {
      const leading = directionTruthLeadingV17320(entry?.instruction || "");
      const work = leading.work;
      if (!work) return null;
      let facts = [];
      try { facts = directionDistanceFactsFinalV17317(work); } catch {}
      if (!facts.length) return null;

      for (const fact of facts) {
        const after = work.slice(fact.end);
        const turn = after.match(/^[\s,.;]*(?:(?:and|then)\s+)?((?:turn|stay|keep|veer|bear|slight)\s+(?:left|right|straight)\b[\s\S]*)$/i);
        if (!turn) continue;

        const firstRaw = directionTruthCleanV17320(work.slice(0, fact.end));
        let firstRoad = directionTruthRoadV17320(firstRaw, p);
        /* If the clause is only "Continue 1.3 mi", road identity comes from the
           immediately preceding proven road card—not from a road mentioned after
           the turn. */
        if (!firstRoad) firstRoad = directionTruthCleanV17320(previousRoad);
        if (!firstRoad) continue;

        let firstInstruction = firstRaw;
        if (!directionTruthRoadV17320(firstRaw, p)) {
          firstInstruction = `Continue on ${firstRoad} for ${fact.raw}`;
        }
        const secondInstruction = directionTruthNormalizeTurnTailV17320(turn[1]);
        if (!secondInstruction) continue;

        return [
          { ...entry, instruction:firstInstruction, notes:[...(leading.notes || [])], disableRoadIntel:true, sourceTruthSplitV17320:true },
          { ...entry, instruction:secondInstruction, notes:[...(entry?.notes || [])], disableRoadIntel:true, sourceTruthSplitV17320:true }
        ];
      }
      return null;
    }

    function directionTruthThenTurnSplitV17320(entry, p) {
      const leading = directionTruthLeadingV17320(entry?.instruction || "");
      const work = leading.work;
      if (!work) return null;
      const boundary = work.match(/^(.*?)(?:,|;)\s*(?:then\s+)?(turn\s+(?:left|right)\b[\s\S]+)$/i);
      if (!boundary) return null;
      const first = directionTruthCleanV17320(boundary[1]);
      const second = directionTruthNormalizeTurnTailV17320(boundary[2]);
      if (!first || !second) return null;
      const firstHasAction = /\b(?:turn|stay|keep|veer|bear|slight|head|take|follow|continue|travel|proceed|go)\b/i.test(first);
      if (!firstHasAction) return null;
      return [
        { ...entry, instruction:first, notes:[...(leading.notes || [])], disableRoadIntel:true, sourceTruthSplitV17320:true },
        { ...entry, instruction:second, notes:[...(entry?.notes || [])], disableRoadIntel:true, sourceTruthSplitV17320:true }
      ];
    }

    function directionTruthSplitOneV17320(entry, previousRoad, p) {
      return directionTruthTransitionSplitV17320(entry, p)
        || directionTruthStayThenTurnSplitV17320(entry, previousRoad, p)
        || directionTruthDistanceBeforeTurnSplitV17320(entry, previousRoad, p)
        || directionTruthThenTurnSplitV17320(entry, p)
        || [entry];
    }

    function directionTruthEntriesV17320(entries, p) {
      const out = [];
      let previousRoad = "";
      for (const original of entries || []) {
        let queue = [original];
        let guard = 0;
        while (queue.length && guard < 8) {
          guard += 1;
          const current = queue.shift();
          const parts = directionTruthSplitOneV17320(current, previousRoad, p);
          if (parts.length > 1 && !current?.sourceTruthSplitV17320) {
            queue = [...parts, ...queue];
            continue;
          }
          const finalEntry = parts[0] || current;
          out.push(finalEntry);
          const road = directionTruthRoadV17320(finalEntry?.instruction || "", p);
          if (road) previousRoad = road;
        }
      }
      return out;
    }

    const directionFinalCardsBeforeTruthV17320 = directionFinalCardsFromEntriesV17317;
    directionFinalCardsFromEntriesV17317 = function directionFinalCardsTruthV17320(entries, p) {
      return directionFinalCardsBeforeTruthV17320(directionTruthEntriesV17320(entries, p), p);
    };

    window.directionTruthEntriesV17320 = directionTruthEntriesV17320;
    window.directionTruthRoadV17320 = directionTruthRoadV17320;
