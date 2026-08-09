    /* BrineSearch V17.3.17 — final road-token safety for concise cards. */
    const directionNormalizeRoadBeforePairSafetyV17317 = directionNormalizeRoadV17317;
    directionNormalizeRoadV17317 = function directionNormalizeRoadPairSafeV17317(rawValue, p, sourceStepOrder, fullSentence) {
      let raw = directionMainCleanV17317(rawValue).replace(/^the\s+/i, "");
      if (!raw) return "";

      const bearingMatch = raw.match(/\s+(north|south|east|west)$/i);
      const bearing = bearingMatch ? directionTitleCaseBearingV17317(bearingMatch[1]) : "";
      const base = bearingMatch ? raw.slice(0, bearingMatch.index).trim() : raw;
      const slashParts = base.split(/\s*\/\s*/).filter(Boolean);

      // Two numbered routes sharing pavement are a concurrency, not a
      // local-name / route-number double name. Preserve both route numbers.
      if (slashParts.length === 2 && slashParts.every(part => directionRouteTokenV17317(part))) {
        return `${base}${bearing ? ` ${bearing}` : ""}`;
      }

      const intel = directionIntelRowV17317(p, sourceStepOrder);
      const primary = directionWrittenCleanV17315(intel?.primary_road);
      if (primary && /^Route\s+\d{1,4}[A-Z]?$/i.test(base)) {
        return `${primary}${bearing ? ` ${bearing}` : ""}`;
      }

      return directionNormalizeRoadBeforePairSafetyV17317(rawValue, p, sourceStepOrder, fullSentence);
    };
