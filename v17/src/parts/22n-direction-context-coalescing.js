    /* BrineSearch V17.3.16 — final approach/arrival context coalescing.
       The first fragment pass removes grammatical orphan rows. This pass handles
       two remaining patterns that are meaningful context but not independent
       driver decisions: an approach-to-junction row immediately before its turn,
       and a transient landmark continuation immediately before the arrival. */

    function directionApproachContextV17316(value) {
      const text = directionStepCleanV17316(value);
      if (!/^(?:Follow|Continue|Go|Proceed|Travel)\b/i.test(text)) return false;
      return /\b(?:to|until)\b[^.;]*\b(?:stop\s+sign|intersection|junction|split|fork|crossroad|cross\s+road|end\s+of\s+(?:the\s+)?road)\b/i.test(text);
    }

    function directionTurnDecisionV17316(value) {
      return /^(?:Turn|Veer|Bear|Stay|Keep|Slight|Sharp)\b/i.test(directionStepCleanV17316(value));
    }

    function directionArrivalSentenceV17316(value) {
      const text = directionStepCleanV17316(value);
      return /\b(?:pad|well[- ]site|lease\s+road|access\s+road|entrance|enterance|access\s+point)\b[^.;]{0,120}\b(?:left|right|end|ahead)\b/i.test(text)
        || /^(?:Arrive|Destination)\b/i.test(text);
    }

    function directionTransientContinuationV17316(value) {
      return /^(?:Continue(?:\s+on)?|Go|Follow)\s+(?:past|passed)\b/i.test(directionStepCleanV17316(value));
    }

    function directionContextHasCriticalFactV17316(value) {
      const text = directionStepCleanV17316(value);
      return /\b(?:\d+(?:\.\d+)?\s*(?:miles?|mi|feet|ft|yards?|yd)|bridge|truck|restriction|curfew|weight|narrow|one[- ]lane|gate|code|cb\b|road\s+closed|closure)\b/i.test(text);
    }

    const directionCoalesceEntriesBeforeContextV17316 = directionCoalesceEntriesV17316;
    directionCoalesceEntriesV17316 = function directionCoalesceEntriesContextV17316(entries) {
      const source = directionCoalesceEntriesBeforeContextV17316(entries);
      const result = [];

      for (let index = 0; index < source.length; index += 1) {
        const current = source[index];
        const next = source[index + 1];
        const currentText = directionStepCleanV17316(current?.instruction);
        const nextText = directionStepCleanV17316(next?.instruction);

        // "Follow CR-26 to the 25/26 split" is the approach to the decision
        // described by the next "Turn left..." row. Keep every saved fact but
        // make it one driver card rather than two numbered steps.
        if (next && directionApproachContextV17316(currentText) && directionTurnDecisionV17316(nextText)) {
          const merged = `${currentText.replace(/[.;]+$/, "")}, then ${nextText.charAt(0).toLowerCase()}${nextText.slice(1)}`;
          result.push({
            ...next,
            instruction:directionStepCleanV17316(merged),
            notes:[...(current?.notes || []), ...(next?.notes || [])],
            sourceStepOrder:Number(current?.sourceStepOrder || next?.sourceStepOrder || result.length + 1),
            fragmentReassembled:true,
            disableRoadIntel:true
          });
          index += 1;
          continue;
        }

        // A transient landmark-only continuation immediately before a clear
        // arrival is not another maneuver. If it carries mileage/safety facts,
        // preserve it as a note; otherwise omit the landmark from the driver UI.
        if (next && directionTransientContinuationV17316(currentText) && directionArrivalSentenceV17316(nextText)) {
          const notes = [...(next?.notes || [])];
          if (directionContextHasCriticalFactV17316(currentText)) notes.unshift(currentText, ...(current?.notes || []));
          else notes.unshift(...(current?.notes || []));
          result.push({
            ...next,
            instruction:nextText,
            notes,
            sourceStepOrder:Number(current?.sourceStepOrder || next?.sourceStepOrder || result.length + 1),
            fragmentReassembled:true,
            disableRoadIntel:true
          });
          index += 1;
          continue;
        }

        result.push(current);
      }
      return result;
    };
