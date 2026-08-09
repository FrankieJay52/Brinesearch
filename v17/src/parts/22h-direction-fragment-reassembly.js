    /* BrineSearch V17.3.13 — reassemble broken Clear Directions fragments.
       Some legacy Clear Directions were saved with sentence fragments as their
       own numbered rows (for example: "As you leave Deersville" / "turn" /
       "Turn left Adams Rd", or "Follow to" / "Access Road"). Those fragments
       are not real navigation steps. This pass only joins obvious grammatical
       fragments and suppresses destination phrases such as "to stop sign" from
       being rendered as green road signs. It never adds roads, turns, or mileage. */

    function directionFragmentCleanV17313(value) {
      return String(value || "").replace(/\s{2,}/g, " ").trim();
    }

    function directionContextOnlyV17313(value) {
      const text = directionFragmentCleanV17313(value);
      if (!/^(?:As|When|Once|After|Before|Upon)\b/i.test(text)) return false;
      if (/\b(?:turn|take|follow|continue|head|merge|bear|veer|stay|keep|go|travel|proceed)\b/i.test(text)) return false;
      if (/\b(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d/i.test(text)) return false;
      if (/\b(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Route)\b/i.test(text)) return false;
      if (directionClearDistanceV1732(text)) return false;
      return text.split(/\s+/).length <= 12;
    }

    function directionExplicitTurnV17313(value) {
      return /^(?:Turn\s+(?:left|right)\b|(?:Left|Right)\s+(?:turn\s+)?(?:onto|on)\b|(?:Left|Right)\s+turn\b)/i
        .test(directionFragmentCleanV17313(value));
    }

    function directionFragmentConnectorOnlyV17313(value) {
      return /^(?:to|onto|on|toward|towards)$/i.test(directionFragmentCleanV17313(value));
    }

    function directionFragmentNeedsTargetV17313(value) {
      return /^(?:(?:turn(?:\s+(?:left|right))?)|follow|continue|go|proceed|travel|take|head|merge|bear|veer|stay|keep)(?:\s+(?:to|onto|on|toward|towards))?$/i
        .test(directionFragmentCleanV17313(value));
    }

    function directionFragmentTargetV17313(value) {
      const text = directionFragmentCleanV17313(value);
      if (!text) return false;
      if (directionFragmentConnectorOnlyV17313(text)) return true;
      if (/^(?:left|right)(?:\s+(?:onto|on))?$/i.test(text)) return true;
      if (/^(?:access|lease)(?:\s+road)?$/i.test(text)) return true;
      if (/^(?:pad|entrance|site\s+entrance|well[- ]site\s+entrance)$/i.test(text)) return true;
      if (/^(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d/i.test(text) || /^Route\s+\d/i.test(text)) return true;
      return /\b(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Way|Run|Ridge|Fork|Hollow|Creek|Crossing)\b/i.test(text);
    }

    function directionReassembleStepEntriesV17313(entries) {
      const source = (entries || []).map(entry => ({
        ...entry,
        instruction:directionFragmentCleanV17313(entry?.instruction),
        notes:[...(entry?.notes || [])]
      }));
      const steps = [];
      const pendingNotes = [];

      for (let index = 0; index < source.length; index += 1) {
        let entry = source[index];
        let text = directionFragmentCleanV17313(entry.instruction);
        if (!text) continue;

        if (directionContextOnlyV17313(text)) {
          pendingNotes.push(text, ...(entry.notes || []));
          continue;
        }

        const nextText = directionFragmentCleanV17313(source[index + 1]?.instruction);
        if (/^turn$/i.test(text) && directionExplicitTurnV17313(nextText)) {
          pendingNotes.push(...(entry.notes || []));
          continue;
        }

        if (directionFragmentNeedsTargetV17313(text)) {
          let cursor = index + 1;
          let merged = false;
          const mergedNotes = [...(entry.notes || [])];
          let partsUsed = 0;

          while (cursor < source.length && partsUsed < 3) {
            const candidate = source[cursor];
            const candidateText = directionFragmentCleanV17313(candidate?.instruction);
            if (!candidateText || directionContextOnlyV17313(candidateText)) break;
            if (!directionFragmentTargetV17313(candidateText)) break;

            text = `${text} ${candidateText}`.replace(/\s{2,}/g, " ").trim();
            mergedNotes.push(...(candidate?.notes || []));
            merged = true;
            partsUsed += 1;
            cursor += 1;
            if (!directionFragmentNeedsTargetV17313(text)) break;
          }

          if (merged) {
            entry = {
              ...entry,
              instruction:text,
              notes:mergedNotes,
              disableRoadIntel:true,
              compoundSource:false,
              compoundSplit:true,
              fragmentReassembled:true
            };
            index = cursor - 1;
          }
        }

        const notes = [...pendingNotes, ...(entry.notes || [])].filter(Boolean);
        pendingNotes.length = 0;
        steps.push({ ...entry, instruction:directionFragmentCleanV17313(entry.instruction), notes });
      }

      if (pendingNotes.length && steps.length) {
        steps[steps.length - 1] = {
          ...steps[steps.length - 1],
          notes:[...(steps[steps.length - 1].notes || []), ...pendingNotes]
        };
      }
      return steps;
    }

    const directionClearPolishedStepsBeforeFragmentsV17313 = directionClearPolishedStepsV1732;
    directionClearPolishedStepsV1732 = function directionClearPolishedStepsFragmentsV17313(clearText) {
      const parsed = directionClearPolishedStepsBeforeFragmentsV17313(clearText);
      return { reference:parsed.reference, steps:directionReassembleStepEntriesV17313(parsed.steps || []) };
    };

    function directionFalseRoadTargetV17313(value) {
      const text = directionFragmentCleanV17313(value);
      return /^(?:stop\s+sign|intersection|junction|gate|dead\s+end|end(?:\s+of\s+(?:road|street))?|traffic\s+light)\b/i.test(text);
    }

    const directionClearRoadTextBeforeFragmentsV17313 = directionClearRoadTextV1732;
    directionClearRoadTextV1732 = function directionClearRoadTextFragmentsV17313(instruction, p) {
      const road = directionClearRoadTextBeforeFragmentsV17313(instruction, p);
      const roadText = directionFragmentCleanV17313(road?.text);
      if (!roadText || road?.kind !== "road") return road;

      const prefixed = roadText.match(/^(?:to|onto|on)\s+(.+)$/i);
      if (prefixed) {
        const target = directionFragmentCleanV17313(prefixed[1]);
        if (directionFalseRoadTargetV17313(target)) return { kind:"", text:"" };
        if (directionActionableRoadV17312(target, p)) {
          return { ...road, text:normalizeRoadName(target, p).text };
        }
        return { kind:"", text:"" };
      }

      if (/^(?:to|onto|on|at|until|toward|towards)$/i.test(roadText)) return { kind:"", text:"" };
      if (directionFalseRoadTargetV17313(roadText)) return { kind:"", text:"" };
      return road;
    };
