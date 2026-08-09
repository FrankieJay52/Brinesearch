    /* BrineSearch V17.3.17 — final source/context corrections.
       Fix the generic From-prefix action parser and one verified malformed Van Aston
       import. No road, turn, or mileage is invented. */

    /* The V17.3.17 leading-context regex used a lookahead capture for the first
       action and then accidentally concatenated that capture with the unchanged
       remainder. "From Cadiz, take US-250 south" became "taketake US-250 south"
       and fell back to Continue. Keep the action exactly once. */
    const directionLeadingContextBeforeActionFixV17317 = directionLeadingContextFinalV17317;
    directionLeadingContextFinalV17317 = function directionLeadingContextActionFixV17317(value) {
      const text = directionMainCleanV17317(value);
      if (!text) return directionLeadingContextBeforeActionFixV17317(value);
      const action = "(?:turn|take|head|go|follow|continue|merge|veer|bear|stay|keep|slight|sharp|travel|proceed)";
      const match = text.match(new RegExp(`^From\\s+(.+?)(?:,\\s*|\\s+)(?=(${action})\\b)([\\s\\S]+)$`, "i"));
      if (match) {
        return {
          work:directionMainCleanV17317(match[3]),
          notes:[`Start: ${directionMainCleanV17317(match[1])}`],
          contextOnly:false
        };
      }
      return directionLeadingContextBeforeActionFixV17317(value);
    };

    const directionFinalMetaBeforeActionFixV17317 = directionFinalMetaV17317;
    directionFinalMetaV17317 = function directionFinalMetaActionFixV17317(entry, p) {
      const meta = directionFinalMetaBeforeActionFixV17317(entry, p);
      if (meta?.suppress) return meta;
      const raw = directionStepCleanV17316(entry?.instruction || "");
      const takeBearing = raw.match(/^From\s+.+?,\s*take\s+.+?\s+(northwest|northeast|southwest|southeast|north|south|east|west)\.?$/i);
      if (takeBearing && /^Take\b/i.test(String(meta?.instruction || ""))) {
        const bearing = directionTitleCaseBearingV17317(takeBearing[1]);
        if (/\b(?:northwest|northeast|southwest|southeast|north|south|east|west)$/i.test(meta.instruction)) {
          meta.instruction = String(meta.instruction).replace(/\b(?:northwest|northeast|southwest|southeast|north|south|east|west)$/i, bearing);
        } else {
          meta.instruction = `${directionMainCleanV17317(meta.instruction)} ${bearing}`;
        }
      }
      return meta;
    };
    directionWrittenDisplayMetaV17317 = directionFinalMetaV17317;
    window.directionFinalMetaV17317 = directionFinalMetaV17317;

    const VAN_ASTON_CLEAR_V17317 = `Road sequence reference:\nWV-250 → CR-17 / Fork Ridge Rd → Brushy Run Rd → Access Road\n\nStep-by-step directions:\n1. Head south on WV-250. Continue 14.17 miles.\n2. Turn right on CR-17 / Fork Ridge Rd. Continue 3.80 miles.\n3. Turn left on Brushy Run Rd. Continue approximately 0.65 miles.\n4. Take the well pad access road.`;

    function directionKnownClearTextCleanupV17317(clearText) {
      const text = String(clearText || "");
      if (/well\s+pad\s+access\s+road\s+begins\s+approximately\s+0\.65\s+miles\s+from\s+Brushy\s+Run\s*\/\s*(?:CR|County\s+Road)\s*17\s+intersection/i.test(text)) {
        return VAN_ASTON_CLEAR_V17317;
      }
      return text;
    }

    const directionGlobalWrittenEntriesBeforeKnownCleanupV17317 = directionGlobalWrittenEntriesV17315;
    directionGlobalWrittenEntriesV17315 = function directionGlobalWrittenEntriesKnownCleanupV17317(clearText) {
      return directionGlobalWrittenEntriesBeforeKnownCleanupV17317(directionKnownClearTextCleanupV17317(clearText));
    };

    const directionFinalCardsBeforeKnownCleanupV17317 = directionFinalCardsFromEntriesV17317;
    directionFinalCardsFromEntriesV17317 = function directionFinalCardsKnownCleanupV17317(entries, p) {
      const cards = directionFinalCardsBeforeKnownCleanupV17317(entries, p);
      const id = String(p?._id || p?.legacy_id || p?.legacyId || "").toLowerCase();
      if (id !== "expand--van-aston") return cards;
      if (cards[0]) cards[0].notes = directionUniqueNotesV17317([
        "Curfew: M,T,T,F 6:30–8:00 AM and 3:30–5:00 PM; Wed 7:30–9:00 AM and 3:30–5:00 PM",
        ...(cards[0].notes || [])
      ]);
      if (cards[2]) cards[2].notes = directionUniqueNotesV17317([
        "Brushy Run Rd is unsigned",
        ...(cards[2].notes || [])
      ]);
      return cards;
    };

    window.directionKnownClearTextCleanupV17317 = directionKnownClearTextCleanupV17317;
