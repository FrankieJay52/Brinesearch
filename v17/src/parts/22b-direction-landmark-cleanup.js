    /* BrineSearch V17.3.8 — driver direction cleanup.
       Driver cards and copied directions suppress transient landmark identifiers
       while preserving road names, turn direction, mileage, warnings, restrictions,
       gates, CB instructions, and other route-critical safety information. */

    function directionLandmarkPhraseV1738(text) {
      const value = String(text || "").toLowerCase();
      if (!value) return false;
      const withoutRoadNames = value.replace(/\b(?:church|cemetery)\s+(?:rd|road|ln|lane|dr|drive|st|street|ave|avenue|hwy|highway)\b/gi, "");
      return /\b(?:landmark|dairy queen|trump sign|yard fence|old general store|general-store|cemetery|church|school|high school|prison|storage unit|storage-unit|ballfield|police department|fire department|mailbox|house|barn|bar|scrap yard|rest area|rest-area|water tower|power station)\b/i.test(withoutRoadNames);
    }

    function directionSafetyPhraseV1738(text) {
      return /\b(?:truck restriction|restriction|warning|caution|do not|no rig traffic|curfew|narrow|one-lane|one lane|bridge|gate code|cb\b|call[- ]?out|speed limit|weight limit|road closed|closure)\b/i.test(String(text || ""));
    }

    function directionSanitizeInstructionV1738(instruction) {
      let text = String(instruction || "").replace(/\s{2,}/g, " ").trim();
      if (!text) return "";

      if (/^Landmark\s*:/i.test(text)) return "";
      if (/^(?:Look for|Pass|Continue past)\b/i.test(text) && directionLandmarkPhraseV1738(text) && !directionSafetyPhraseV1738(text)) return "";

      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
      if (sentences.length > 1) {
        const kept = sentences.filter((sentence, index) => {
          if (index === 0) return true;
          if (directionSafetyPhraseV1738(sentence)) return true;
          if (/^(?:The saved (?:field )?directions|Landmark|Look for)\b/i.test(sentence) && directionLandmarkPhraseV1738(sentence)) return false;
          return !directionLandmarkPhraseV1738(sentence);
        });
        text = kept.join(" ").trim();
      }

      const turnOnto = text.match(/^((?:Turn|Veer|Bear|Slight|Stay)\s+(?:left|right))\b([\s\S]*?)\bonto\s+(.+)$/i);
      if (turnOnto && directionLandmarkPhraseV1738(turnOnto[2]) && !directionSafetyPhraseV1738(turnOnto[2])) {
        text = `${turnOnto[1]} onto ${turnOnto[3]}`.trim();
      }

      text = text
        .replace(/\s+(?:at|by|beside|next to|across from|just past|past|after|before)\s+(?:the\s+)?(?:old\s+)?(?:cemetery|church|school|high school|prison|storage units?|ballfield|police department|fire department|dairy queen|general[- ]store|scrap yard|rest[- ]area|water tower|power station)(?=[,.;]|\s+(?:onto|and|then|turn|continue|where)\b|$)/gi, "")
        .replace(/\s+where\s+(?:the\s+)?(?:cemetery|church|school|prison|storage units?|ballfield|police department|dairy queen)\s+(?:is|are)\b[^.;]*/gi, "")
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([,.;])/g, "$1")
        .trim();

      return text;
    }

    function directionSanitizeReferenceV1738(reference) {
      return String(reference || "")
        .split(/\s*→\s*/)
        .map(part => part.trim())
        .filter(part => part && (!directionLandmarkPhraseV1738(part) || /\b(?:rd|road|route|cr-|tr-|sr-|oh-|wv-|pa-|us-|i-)\b/i.test(part)))
        .join(" → ");
    }

    const directionClearPolishedStepsBeforeV1738 = directionClearPolishedStepsV1732;
    directionClearPolishedStepsV1732 = function directionClearPolishedStepsLandmarkCleanV1738(clearText) {
      const parsed = directionClearPolishedStepsBeforeV1738(clearText);
      const steps = [];
      for (const entry of parsed.steps || []) {
        const instruction = directionSanitizeInstructionV1738(entry.instruction);
        const notes = (entry.notes || [])
          .map(directionSanitizeInstructionV1738)
          .filter(note => note && (!directionLandmarkPhraseV1738(note) || directionSafetyPhraseV1738(note)));
        if (!instruction) {
          if (notes.length && steps.length) steps[steps.length - 1].notes.push(...notes);
          continue;
        }
        steps.push({ instruction, notes });
      }
      return { reference: directionSanitizeReferenceV1738(parsed.reference), steps };
    };

    function directionDriverSafeClearTextV1738(clearText) {
      const parsed = directionClearPolishedStepsV1732(clearText);
      const lines = [];
      if (parsed.reference) lines.push(`Road sequence reference:\n${parsed.reference}`);
      if (parsed.steps.length) {
        lines.push(`Step-by-step directions:\n${parsed.steps.map((entry,index) => {
          const joined = [entry.instruction, ...(entry.notes || [])].filter(Boolean).join(" ").trim();
          return `${index + 1}. ${joined}`;
        }).join("\n")}`);
      }
      return lines.join("\n\n").trim();
    }

    const directionCopyTextBeforeV1738 = directionCopyText;
    directionCopyText = function directionCopyTextLandmarkCleanV1738(value, p) {
      const clear = String(p?.directionsClear ?? "").trim();
      if (clear) {
        const safe = directionDriverSafeClearTextV1738(clear);
        if (safe) return safe;
      }
      return directionCopyTextBeforeV1738(value, p);
    };
