    /* BrineSearch V17.3.10 — target-road parsing audit fix.
       When a direction sentence mentions both the road being left and the road
       being entered, prefer the explicit target road instead of the first route
       number in the sentence. */

    const directionClearRoadTextBeforeV17310 = directionClearRoadTextV1732;
    directionClearRoadTextV1732 = function directionClearRoadTextTargetV17310(instruction, p) {
      const text = String(instruction || "").trim();
      const routePattern = '((?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d{1,4}[NSEW]?|Route\\s+\\d{1,4}[NSEW]?)';
      const targetPatterns = [
        new RegExp(`\\b(?:turn|veer|bear|slight)\\s+(?:left|right)\\b[^.;]*?\\bonto\\s+(?:the\\s+)?${routePattern}`, 'i'),
        new RegExp(`\\b(?:merge|continue|stay|keep)\\b[^.;]*?\\b(?:onto|on)\\s+(?:the\\s+)?${routePattern}`, 'i'),
        new RegExp(`\\bhead\\s+(?:northwest|northeast|southwest|southeast|north|south|east|west|NW|NE|SW|SE|N|S|E|W)\\b[^.;]*?\\bon\\s+(?:the\\s+)?${routePattern}`, 'i'),
        new RegExp(`\\b(?:follow|take)\\s+(?:the\\s+)?${routePattern}`, 'i')
      ];
      for (const pattern of targetPatterns) {
        const match = text.match(pattern);
        const target = match?.[1];
        if (target) return { kind:"route", text:normalizeRoadName(target, p).text };
      }
      return directionClearRoadTextBeforeV17310(instruction, p);
    };
