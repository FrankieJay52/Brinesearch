    /* BrineSearch V17.3.15 — written-step start-context fix.
       The first global renderer used a road-presence guard that matched only the
       first digit of a numbered highway before checking a word boundary, so a
       normal route such as US-250 could fail the guard and retain `From Colerain,`.
       Keep useful route context in the saved source, but remove that introductory
       phrase from the driver card when the remaining instruction is a complete,
       road-named maneuver. */

    const directionWrittenDropStartContextBeforeRouteFixV17315 = directionWrittenDropStartContextV17315;
    directionWrittenDropStartContextV17315 = function directionWrittenDropStartContextRouteFixV17315(value) {
      const text = directionWrittenCleanV17315(value);
      const previous = directionWrittenDropStartContextBeforeRouteFixV17315(text);
      if (previous !== text) return previous;

      const match = text.match(/^From\s+(.{1,110}?),\s*(.+)$/i);
      if (!match) return text;
      const remainder = directionWrittenCleanV17315(match[2]);
      if (!/^(?:head|take|turn|follow|continue|merge|keep|slight|veer|bear|stay|proceed|travel)\b/i.test(remainder)) return text;

      const numberedRoad = /\b(?:Exit\s*\d+[A-Z]?|I\s*[- ]?\s*\d{1,4}[A-Z]?|US\s*[- ]?\s*\d{1,4}[A-Z]?|OH\s*[- ]?\s*\d{1,4}[A-Z]?|WV\s*[- ]?\s*\d{1,4}[A-Z]?|PA\s*[- ]?\s*\d{1,4}[A-Z]?|SR\s*[- ]?\s*\d{1,4}[A-Z]?|CR\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?|TR\s*[- ]?\s*\d{1,4}[A-Z]?|Route\s+\d{1,4}[A-Z]?|County\s+(?:Road|Rd|Route|Hwy)\s*\d{1,4}(?:\/\d+)?[A-Z]?|Township\s+(?:Road|Rd|Route|Hwy)\s*\d{1,4}[A-Z]?)\b/i;
      const namedRoad = /\b[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,8}\s+(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Trail|Byway|Way|Run|Ridge|Fork|Hollow|Creek|Crossing)\b/i;
      if (!numberedRoad.test(remainder) && !namedRoad.test(remainder)) return text;
      return remainder;
    };
