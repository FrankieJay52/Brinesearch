    /* BrineSearch V17.3.17 — known source cleanup for a verified malformed import.
       Van Aston's saved source was split into five parser fragments. The 0.65-mile
       distance belongs to Brushy Run after the left turn, while CR-17 / Fork Ridge
       Rd is the preceding double-name road. Keep those facts in their correct
       driver steps and move schedule/unsigned-road context into notes. */

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
