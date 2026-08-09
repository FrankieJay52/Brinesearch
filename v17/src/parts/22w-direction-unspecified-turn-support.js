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
      return directionMainCleanV17317(road);
    }

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
