    /* BrineSearch V17.3.10 — compound direction-step safety.
       Older source records sometimes store an entire multi-turn route inside one
       numbered Clear Directions step. Split obvious inline 1.) 2.) lists for the
       driver. When the source has multiple mileages but no safe inline structure,
       keep the exact wording together and disable single-road intelligence so one
       mileage cannot be attached to the wrong road. */

    function directionCompoundDistanceCountV17310(value) {
      return (String(value || "").match(/\b\d+(?:\.\d+)?\s*(?:miles?|mi|feet|ft)\b/gi) || []).length;
    }

    function directionInlineNumberedPartsV17310(value) {
      const text = String(value || "").trim();
      const marker = /(?:^|\s)(\d+)\.\)\s*/g;
      const marks = [];
      let match;
      while ((match = marker.exec(text))) {
        marks.push({ number:Number(match[1]), start:match.index, bodyStart:marker.lastIndex });
      }
      if (marks.length < 2) return null;
      const parts = [];
      const prefix = text.slice(0, marks[0].start).trim();
      if (prefix) parts.push(prefix);
      marks.forEach((item, index) => {
        const end = index + 1 < marks.length ? marks[index + 1].start : text.length;
        const body = text.slice(item.bodyStart, end).trim();
        if (body) parts.push(body);
      });
      return parts.length >= 2 ? parts : null;
    }

    const directionClearPolishedStepsBeforeCompoundV17310 = directionClearPolishedStepsV1732;
    directionClearPolishedStepsV1732 = function directionClearPolishedStepsCompoundSafeV17310(clearText) {
      const parsed = directionClearPolishedStepsBeforeCompoundV17310(clearText);
      const steps = [];
      for (const entry of parsed.steps || []) {
        const inlineParts = directionInlineNumberedPartsV17310(entry.instruction);
        if (inlineParts) {
          inlineParts.forEach((instruction, index) => {
            steps.push({
              instruction,
              notes:index === inlineParts.length - 1 ? [...(entry.notes || [])] : [],
              sourceStepOrder:entry.sourceStepOrder,
              disableRoadIntel:true,
              compoundSource:false,
              compoundSplit:true
            });
          });
          continue;
        }
        if (directionCompoundDistanceCountV17310(entry.instruction) > 1) {
          steps.push({ ...entry, disableRoadIntel:true, compoundSource:true });
          continue;
        }
        steps.push(entry);
      }
      return { reference: parsed.reference, steps };
    };
