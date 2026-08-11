    /* BrineSearch V17.3.30 — generic source/context corrections.
       All pad-specific route facts were moved to Supabase. This layer contains
       only source-grounded parser behavior shared by every operator/pad. */

    const directionLeadingContextBeforeActionFixV17330 = directionLeadingContextFinalV17317;
    directionLeadingContextFinalV17317 = function directionLeadingContextActionFixV17330(value) {
      const text = directionMainCleanV17317(value);
      if (!text) return directionLeadingContextBeforeActionFixV17330(value);
      const action = "(?:turn|take|head|go|follow|continue|merge|veer|bear|stay|keep|slight|sharp|travel|proceed)";
      const match = text.match(new RegExp(`^From\\s+(.+?)(?:,\\s*|\\s+)(?=(${action})\\b)([\\s\\S]+)$`, "i"));
      if (match) {
        return {
          work:directionMainCleanV17317(match[3]),
          notes:[`Start: ${directionMainCleanV17317(match[1])}`],
          contextOnly:false
        };
      }
      return directionLeadingContextBeforeActionFixV17330(value);
    };

    function directionPromoteArrivalNoteV17330(meta, raw) {
      const main = directionMainCleanV17317(meta?.instruction || "");
      const notes = Array.isArray(meta?.notes) ? [...meta.notes] : [];
      const rawText = directionMainCleanV17317(raw);

      if (!/^(?:Continue(?:\s+on\s+(?:left|right))?|Arrive)$/i.test(main)) {
        return { ...meta, instruction:main, notes };
      }
      if (/^(?:Turn|Take|Head|Follow|Continue|Go|Merge|Veer|Bear|Stay|Keep|Slight|Sharp|Travel|Proceed)\b/i.test(rawText)) {
        return { ...meta, instruction:main, notes };
      }

      const rawArrival = rawText.match(/\b(pad|well\s*pad|access\s+road|lease[- ]?road(?:\s+entrance)?|entrance)\b[\s\S]{0,90}?\b(?:on\s+)?(?:the\s+)?(left|right)\b/i);
      if (!rawArrival) return { ...meta, instruction:main, notes };

      const side = rawArrival[2].toLowerCase();
      const type = rawArrival[1].toLowerCase();
      const target = /access/.test(type) ? `Access road on ${side}`
        : /lease/.test(type) ? `Lease road entrance on ${side}`
        : /entrance/.test(type) ? `Entrance on ${side}`
        : `Pad on ${side}`;
      const filtered = notes.filter(note => directionMainCleanV17317(note).toLowerCase() !== target.toLowerCase());
      return { ...meta, instruction:target, notes:filtered };
    }

    const directionFinalMetaBeforeActionFixV17330 = directionFinalMetaV17317;
    directionFinalMetaV17317 = function directionFinalMetaActionFixV17330(entry, p) {
      let meta = directionFinalMetaBeforeActionFixV17330(entry, p);
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
      return directionPromoteArrivalNoteV17330(meta, raw);
    };

    directionWrittenDisplayMetaV17317 = directionFinalMetaV17317;
    window.directionFinalMetaV17317 = directionFinalMetaV17317;
