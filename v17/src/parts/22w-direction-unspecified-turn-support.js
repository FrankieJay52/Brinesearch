    /* BrineSearch V17.3.20 — source-grounded turn wording.
       Some saved directions say "turn onto", "turn west onto", etc. without a
       left/right side. Preserve that truth exactly: Turn on / Turn west on. Never
       invent a left/right side just to fit the older renderer. */

    function directionTurnRoadTextV17320(value, p) {
      let road = directionMainCleanV17317(value || "")
        .replace(/[.;,]\s*$/g, "")
        .replace(/\s+(?=(?:toward|towards|until|then|and\s+then)\b)[\s\S]*$/i, "")
        .trim();
      if (!road) return "";
      try {
        const explicit = directionExplicitRoadDisplayFinalV17317(road, p);
        if (explicit?.road) road = explicit.road;
      } catch {}
      try {
        road = directionNormalizeTargetRoadV17310(road, p) || road;
      } catch {}
      return directionMainCleanV17317(road);
    }

    function directionSourceActionNormalizeV17320(value, p) {
      let text = directionTruthCleanV17320(value);
      text = text
        .replace(/^Turn\s+(northwest|northeast|southwest|southeast|north|south|east|west)\s+onto\s+/i, (_, bearing) => `Turn ${bearing.toLowerCase()} on `)
        .replace(/^Turn\s+onto\s+/i, "Turn on ")
        .replace(/^(Travel|Go|Proceed)\s+(northwest|northeast|southwest|southeast|north|south|east|west)\s+on\s+/i, (_, action, bearing) => `Head ${bearing.toLowerCase()} on `);

      let match = text.match(/^Turn\s+on\s+((?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?)\s+(northwest|northeast|southwest|southeast|north|south|east|west)(\b[\s\S]*)$/i);
      if (match) {
        let road = match[1];
        try { road = directionNormalizeTargetRoadV17310(road, p) || road; } catch {}
        return `Turn ${match[2].toLowerCase()} on ${road}${match[3] || ""}`;
      }
      return text;
    }

    function directionOriginActionEntryV17320(entry, p) {
      const raw = directionTruthCleanV17320(entry?.instruction || "");
      if (!/^From\b/i.test(raw)) return entry;
      /* Take is included here so a sentence such as
         "From Bloomingdale, take US-22 and go south on SR-152" stays intact for
         the two-road transition splitter instead of swallowing the US-22 leg. */
      let match = raw.match(/^From\s+(.+?),\s*((?:Take|Turn|Head|Travel|Go|Proceed)\b[\s\S]+)$/i);
      if (!match) {
        match = raw.match(/^From\s+(.+?)\s+((?:Take\s+[\s\S]+|Turn(?:\s+(?:left|right|northwest|northeast|southwest|southeast|north|south|east|west))?\s+(?:on|onto)[\s\S]+|Head\s+(?:northwest|northeast|southwest|southeast|north|south|east|west)\s+on[\s\S]+|Travel\s+(?:northwest|northeast|southwest|southeast|north|south|east|west)\s+on[\s\S]+|Go\s+(?:northwest|northeast|southwest|southeast|north|south|east|west)\s+on[\s\S]+|Proceed\s+(?:northwest|northeast|southwest|southeast|north|south|east|west)\s+on[\s\S]+))$/i);
      }
      if (!match) return entry;
      const start = directionTruthCleanV17320(match[1]);
      const action = directionSourceActionNormalizeV17320(match[2], p);
      if (!action) return entry;
      return {
        ...entry,
        instruction:action,
        notes:directionUniqueNotesV17317([...(entry?.notes || []), start ? `Start: ${start}` : ""]),
        disableRoadIntel:true,
        sourceTruthOriginV17320:true
      };
    }

    const directionTruthEntriesBeforeOriginV17320 = directionTruthEntriesV17320;
    directionTruthEntriesV17320 = function directionTruthEntriesOriginV17320(entries, p) {
      return directionTruthEntriesBeforeOriginV17320((entries || []).map(entry => directionOriginActionEntryV17320(entry, p)), p);
    };

    const directionMainActionBeforeUnspecifiedTurnV17320 = directionMainActionFinalV17317;
    directionMainActionFinalV17317 = function directionMainActionUnspecifiedTurnV17320(value, p) {
      const text = directionNormalizeShorthandFinalV17317(value).replace(/\bonto\b/ig, "on");
      let match = text.match(/^Turn\s+(northwest|northeast|southwest|southeast|north|south|east|west)\s+on\s+(.+)$/i);
      if (match) {
        const road = directionTurnRoadTextV17320(match[2], p);
        const roadInfo = { road, doubleName:/\s\/\s/.test(road), view:null };
        return { main:`Turn ${match[1].toLowerCase()}${road ? ` on ${road}` : ""}`, roadInfo, view:null };
      }
      match = text.match(/^Turn\s+on\s+(.+)$/i);
      if (match) {
        const road = directionTurnRoadTextV17320(match[1], p);
        const roadInfo = { road, doubleName:/\s\/\s/.test(road), view:null };
        return { main:road ? `Turn on ${road}` : "Turn", roadInfo, view:null };
      }
      return directionMainActionBeforeUnspecifiedTurnV17320(value, p);
    };

    const directionRoadPartsBeforeUnspecifiedTurnV17320 = directionRoadPartsV17318;
    directionRoadPartsV17318 = function directionRoadPartsUnspecifiedTurnV17320(instruction) {
      const text = String(instruction || "").trim();
      let match = text.match(/^(Turn\s+(?:northwest|northeast|southwest|southeast|north|south|east|west)\s+on\s+)(.+)$/i);
      if (match) return { prefix:match[1], road:match[2] };
      match = text.match(/^(Turn\s+on\s+)(.+)$/i);
      if (match) return { prefix:match[1], road:match[2] };
      return directionRoadPartsBeforeUnspecifiedTurnV17320(instruction);
    };

    const directionTruthRoadBeforeUnspecifiedTurnV17320 = directionTruthRoadV17320;
    directionTruthRoadV17320 = function directionTruthRoadUnspecifiedTurnV17320(value, p) {
      const text = directionTruthCleanV17320(value);
      let match = text.match(/^Turn\s+(?:northwest|northeast|southwest|southeast|north|south|east|west)\s+on\s+(.+?)(?=\s+(?:for|toward|towards|until|then)\b|[.;,]|$)/i);
      if (match) return directionTruthCleanV17320(match[1]);
      match = text.match(/^Turn\s+on\s+(.+?)(?=\s+(?:for|toward|towards|until|then)\b|[.;,]|$)/i);
      if (match) return directionTruthCleanV17320(match[1]);
      return directionTruthRoadBeforeUnspecifiedTurnV17320(value, p);
    };

    window.directionMainActionFinalV17320 = directionMainActionFinalV17317;
    window.directionOriginActionEntryV17320 = directionOriginActionEntryV17320;
