    /* BrineSearch V17.3.10 — target-road parsing audit fix.
       When a direction sentence mentions both the road being left and the road
       being entered, prefer the explicit target road instead of the first route
       number in the sentence. */

    function directionNormalizeTargetRoadV17310(value, p) {
      const raw = String(value || "").trim();
      let match = raw.match(/^(?:County\s+(?:Road|Rd|Hwy)|Co\s+Rd)\s*[- ]?\s*(\d{1,4}[A-Z]?)/i);
      if (match) return normalizeRoadName(`CR-${match[1].toUpperCase()}`, p).text;
      match = raw.match(/^(?:Township\s+(?:Road|Rd|Hwy|Highway)|Twp\s+(?:Road|Rd|Hwy|Highway))\s*[- ]?\s*(\d{1,4}[A-Z]?)/i);
      if (match) return normalizeRoadName(`TR-${match[1].toUpperCase()}`, p).text;
      return normalizeRoadName(raw, p).text;
    }

    const directionClearRoadTextBeforeV17310 = directionClearRoadTextV1732;
    directionClearRoadTextV1732 = function directionClearRoadTextTargetV17310(instruction, p) {
      const text = String(instruction || "").trim();
      const routeAtom = '(?:(?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d{1,4}[A-Z]?|Route\\s+\\d{1,4}[A-Z]?|County\\s+(?:Road|Rd|Hwy)\\s+\\d{1,4}[A-Z]?|Co\\s+Rd\\s+\\d{1,4}[A-Z]?|Township\\s+(?:Road|Rd|Hwy|Highway)\\s+\\d{1,4}[A-Z]?|Twp\\s+(?:Road|Rd|Hwy|Highway)\\s+\\d{1,4}[A-Z]?)';
      const targetPatterns = [
        new RegExp(`\\b(?:turn|veer|bear|slight)\\s+(?:left|right)\\b[^.;]*?\\bonto\\s+(?:the\\s+)?(${routeAtom})`, 'i'),
        new RegExp(`\\b(?:merge|continue|stay|keep)\\b[^.;]*?\\b(?:onto|on)\\s+(?:the\\s+)?(${routeAtom})`, 'i'),
        new RegExp(`\\bhead\\s+(?:northwest|northeast|southwest|southeast|north|south|east|west|NW|NE|SW|SE|N|S|E|W)\\b[^.;]*?\\bon\\s+(?:the\\s+)?(${routeAtom})`, 'i'),
        new RegExp(`\\b(?:follow|take)\\s+(?:the\\s+)?(${routeAtom})`, 'i')
      ];
      for (const pattern of targetPatterns) {
        const match = text.match(pattern);
        const target = match?.[1];
        if (target) return { kind:"route", text:directionNormalizeTargetRoadV17310(target, p) };
      }

      const namedTarget = text.match(/\b(?:onto|along|on)\s+(?:the\s+)?([A-Za-z0-9][A-Za-z0-9 .'-]*?(?:Rd|Road|St|Street|Dr|Drive|Ave|Avenue|Hwy|Highway|Ln|Lane))\b/i);
      if (namedTarget?.[1]) {
        const candidate = namedTarget[1].trim();
        if (!/^(?:the\s+)?(?:left|right)$/i.test(candidate)) return { kind:"road", text:normalizeRoadName(candidate, p).text };
      }

      const intersection = text.match(new RegExp(`\\b(${routeAtom})\\s+(?:and|&)\\s+(${routeAtom})\\s+intersection\\b[^.;]*?\\bturn\\s+(?:left|right)`, 'i'));
      if (intersection?.[2]) return { kind:"route", text:directionNormalizeTargetRoadV17310(intersection[2], p) };

      const wordedRoad = text.match(new RegExp(`^\\s*(?:Follow|Take|Continue(?:\\s+onto)?|Head[^.;]{0,35}(?:on|onto)?)\\s+(?:the\\s+)?(${routeAtom})`, 'i'));
      if (wordedRoad?.[1]) return { kind:"route", text:directionNormalizeTargetRoadV17310(wordedRoad[1], p) };

      return directionClearRoadTextBeforeV17310(instruction, p);
    };
