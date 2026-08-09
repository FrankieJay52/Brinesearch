    /* BrineSearch V17.3.15 — reverse-order dual-name safety.
       Saved directions sometimes put the local street name first and the route
       number second (for example, Fernwood-Bloomingdale Rd / CR-26). Preserve
       that explicit pair exactly; never append a third shared/inferred alias. */

    function directionWrittenHasExplicitReverseAliasV17315(value) {
      const text = directionWrittenCleanV17315(value);
      if (!text) return false;
      const namedSuffix = "(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Trail|Byway|Way|Run|Ridge|Fork|Hollow|Creek|Crossing)";
      const numbered = "(?:(?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d{1,4}(?:\\/\\d+)?[A-Z]?|(?:State|County|Township)\\s+(?:Road|Rd|Route|Hwy)\\s*[- ]?\\s*\\d{1,4}(?:\\/\\d+)?[A-Z]?)";
      return new RegExp(`\\b[A-Za-z0-9][A-Za-z0-9 .'-]{0,90}?${namedSuffix}\\s*\\/\\s*${numbered}\\b`, "i").test(text)
        || new RegExp(`\\b${numbered}\\s*\\([^)]*[A-Za-z][^)]*${namedSuffix}[^)]*\\)`, "i").test(text);
    }

    const directionWrittenStrongSharedAliasBeforeReverseSafetyV17315 = directionWrittenStrongSharedAliasV17315;
    directionWrittenStrongSharedAliasV17315 = function directionWrittenStrongSharedAliasReverseSafeV17315(text, p, sourceStepOrder) {
      if (directionWrittenHasExplicitReverseAliasV17315(text)) return directionWrittenCleanV17315(text);
      return directionWrittenStrongSharedAliasBeforeReverseSafetyV17315(text, p, sourceStepOrder);
    };
