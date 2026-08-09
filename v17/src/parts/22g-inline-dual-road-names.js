    /* BrineSearch V17.3.12 — explicit dual-name road fallback.
       Live road intelligence remains authoritative. When it is unavailable,
       preserve an explicit numbered-road/local-road pair written in the saved
       driver directions instead of dropping the local road name. */

    function directionInlineDualRoadV17312(instruction, p) {
      const text = String(instruction || "").replace(/\s{2,}/g, " ").trim();
      if (!text || !text.includes("/")) return null;
      const suffix = "(?:Rd|Road|St|Street|Ave|Avenue|Hwy|Highway|Ln|Lane|Dr|Drive|Pike)";
      const compass = "(?:northwest|northeast|southwest|southeast|north|south|east|west|NW|NE|SW|SE|N|S|E|W)";

      let match = text.match(new RegExp(`\\b((?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d{1,4}[A-Z]?)(?:\\s+${compass})?\\s*\\/\\s*(?:${compass}\\s*\\/\\s*)?([A-Za-z0-9][A-Za-z0-9 .'-]{0,70}?${suffix})\\b`, "i"));
      if (match) {
        const primary = normalizeRoadName(match[1], p).text;
        const alias = normalizeRoadName(match[2], p).text;
        if (primary && alias && !/\\b(?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d/i.test(alias)) {
          return { kind:"route", text:primary, alias };
        }
      }

      match = text.match(new RegExp(`\\b([A-Za-z0-9][A-Za-z0-9 .'-]{0,70}?${suffix})\\.?\\s*\\/\\s*(C\\.?\\s*R\\.?|CR|T\\.?\\s*R\\.?|TR)\\s*[- ]?\\s*(\\d{1,4}[A-Z]?)\\b`, "i"));
      if (match) {
        const prefix = /^C/i.test(match[2]) ? "CR" : "TR";
        const primary = `${prefix}-${match[3].toUpperCase()}`;
        const alias = normalizeRoadName(match[1], p).text;
        if (alias && !/\\b(?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d/i.test(alias)) {
          return { kind:"route", text:primary, alias };
        }
      }
      return null;
    }

    const directionClearRoadTextBeforeDualV17312 = directionClearRoadTextV1732;
    directionClearRoadTextV1732 = function directionClearRoadTextDualV17312(instruction, p) {
      return directionInlineDualRoadV17312(instruction, p) || directionClearRoadTextBeforeDualV17312(instruction, p);
    };

    const directionClearSignForRoadBeforeDualV17312 = directionClearSignForRoadV1733;
    directionClearSignForRoadV1733 = function directionClearSignForRoadDualV17312(road, p) {
      const baseRoad = road?.alias ? { ...road, alias:"" } : road;
      const sign = directionClearSignForRoadBeforeDualV17312(baseRoad, p);
      if (!sign || !normalize(road?.alias)) return sign;
      return `${sign}<span class="direction-clear-road-alias">${esc(road.alias)}</span>`;
    };

    const directionRoadIntelRoadBeforeDualV17312 = directionRoadIntelRoadV1739;
    directionRoadIntelRoadV1739 = function directionRoadIntelRoadDualV17312(view, intel) {
      const road = directionRoadIntelRoadBeforeDualV17312(view, intel);
      if (normalize(intel?.local_road_name) && road?.alias) return { ...road, alias:"" };
      return road;
    };
