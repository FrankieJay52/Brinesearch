    /* BrineSearch V17.3.12 — full driver road/direction rebuild.
       Repairs imported compound direction paragraphs at render time, prefers the
       evidence-backed canonical highway family returned by Supabase, normalizes
       recurring legacy Route/"right N" wording, preserves dual road names, and
       keeps access codes / curfews as notes instead of fake road steps. */

    function directionStateCodeV17312(p) {
      const state = normalize(p?.state).toLowerCase();
      if (state === "ohio" || state === "oh") return "OH";
      if (state === "west virginia" || state === "wv") return "WV";
      if (state === "pennsylvania" || state === "pa") return "PA";
      return roadStatePrefix(p);
    }

    function directionGenericRouteLabelV17312(number, p, source = "") {
      const n = String(number || "").replace(/[^0-9A-Z]/gi, "").toUpperCase();
      if (!n) return "";
      const text = String(source || "");
      const rows = Array.isArray(p?.directionRoadIntelligence) ? p.directionRoadIntelligence : [];
      const supported = [...new Set(rows.map(row => normalize(row?.primary_road)).filter(name =>
        name && !/^Route\s+/i.test(name) && new RegExp(`(?:-|\\s)${n}$`, "i").test(name)
      ))];
      if (supported.length === 1) return supported[0];
      if (new RegExp(`\\b(?:I|Interstate)[ -]*0*${n}\\b`, "i").test(text)) return `I-${n}`;
      if (new RegExp(`\\b(?:U\\.?S\\.?|US)(?:\\s+Route)?[ -]*0*${n}\\b`, "i").test(text)) return `US-${n}`;
      const state = directionStateCodeV17312(p);
      if (state && new RegExp(`\\b(?:State\\s+Route|S\\.?R\\.?|SR|${state})[ -]*0*${n}\\b`, "i").test(text)) return `${state}-${n}`;

      // Only normalize a bare Route N without DB evidence when the highway family is
      // unambiguous in this service area. Do not turn local Route/CR/TR numbers into
      // state highways just because a state has a highway with the same number.
      if (state === "OH") {
        if (["70","77","470"].includes(n)) return `I-${n}`;
        if (["22","30","40","250"].includes(n)) return `US-${n}`;
      }
      if (state === "WV") {
        if (["64","68","70","77","79","81"].includes(n)) return `I-${n}`;
        if (["19","22","33","40","50","119","250"].includes(n)) return `US-${n}`;
      }
      if (state === "PA") {
        if (["70","76","79","80","376"].includes(n)) return `I-${n}`;
        if (["19","22","30","40","119","219","250"].includes(n)) return `US-${n}`;
      }
      return `Route ${n}`;
    }

    function directionCanonicalizeRouteTextV17312(value, p, source = "") {
      const text = normalize(value);
      const match = text.match(/^Route\s*[- ]?\s*(\d{1,4}[A-Z]?)(.*)$/i);
      if (!match) return text;
      return `${directionGenericRouteLabelV17312(match[1], p, source || text)}${match[2] || ""}`.trim();
    }

    function directionActionableRoadV17312(value, p) {
      const text = normalize(value);
      return Boolean(text && (
        /^(?:I|US|OH|WV|PA|SR|CR|TR)-\d/i.test(text)
        || /^Route\s+\d/i.test(text)
        || /\b(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Way|Run|Ridge)\b/i.test(text)
        || /^(?:Access|Lease) Road$/i.test(text)
        || directionBadge(text, p)
      ));
    }

    const directionClearRoadTextBeforeV17312 = directionClearRoadTextV1732;
    directionClearRoadTextV1732 = function directionClearRoadTextRebuiltV17312(instruction, p) {
      const text = String(instruction || "").replace(/\s{2,}/g, " ").trim();

      let match = text.match(/^From\s+(?:I|Interstate)\s*[- ]?\s*\d{1,3}\b[^.;]{0,45}?\b(?:State\s+Route|SR|OH)\s*[- ]?\s*(\d{1,4}[A-Z]?)\s+(?:north|south|east|west)\b/i);
      if (match) return { kind:"route", text:`${directionStateCodeV17312(p) || "OH"}-${match[1].toUpperCase()}` };
      match = text.match(/^From\s+[^.;]{0,60}?\b(?:take|follow|head[^.;]{0,20}?\bon)\s+(?:the\s+)?((?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d{1,4}[A-Z]?|Route\s+\d{1,4}[A-Z]?)/i);
      if (match?.[1]) {
        const raw = match[1].trim();
        const generic = raw.match(/^Route\s+(\d{1,4}[A-Z]?)/i);
        return { kind:"route", text:generic ? directionGenericRouteLabelV17312(generic[1], p, text) : normalizeRoadName(raw, p).text };
      }

      let road = directionClearRoadTextBeforeV17312(instruction, p);
      if (road?.text && /^Route\s*[- ]?\s*\d/i.test(road.text)) {
        road = { ...road, kind:"route", text:directionCanonicalizeRouteTextV17312(road.text, p, text) };
      }
      if (directionActionableRoadV17312(road?.text, p)) return road;

      match = text.match(/\b(?:Take\s+(?:the\s+)?right|Follow\s+right)\s+(\d{1,4}[A-Z]?)\b/i)
        || text.match(/^Follow\s+(\d{1,4}[A-Z]?)\b/i)
        || text.match(/\b(?:from|on)\s+(\d{1,4}[A-Z]?)\s+(?:east|west|north|south)\b/i);
      if (match) return { kind:"route", text:directionGenericRouteLabelV17312(match[1], p, text) };

      match = text.match(/\b(?:left|right)\s+(?:turn\s+)?(?:onto|on)\s+(?:the\s+)?(.+?)(?=\s+(?:for|and|then|until|toward|towards|continue|go|travel)\b|[.;]|$)/i);
      if (match?.[1]) {
        const target = match[1].trim();
        const numbered = target.match(/^(?:Route\s*)?(\d{1,4}[A-Z]?)\b/i);
        if (numbered) return { kind:"route", text:directionGenericRouteLabelV17312(numbered[1], p, text) };
        return { kind:"road", text:normalizeRoadName(target, p).text };
      }

      match = text.match(/\bgo\s+to\s+(?:the\s+)?([A-Za-z0-9][A-Za-z0-9 .'-]*?(?:Rd|Road|St|Street|Dr|Drive|Ave|Avenue|Hwy|Highway|Ln|Lane|Pike))\b/i);
      if (match?.[1]) return { kind:"road", text:normalizeRoadName(match[1], p).text };
      return road || { kind:"", text:"" };
    };

    const directionClearManeuverBeforeV17312 = directionClearManeuverV1733;
    directionClearManeuverV1733 = function directionClearManeuverRebuiltV17312(instruction) {
      const text = String(instruction || "").trim();
      let match = text.match(/^(?:Left\s+(?:turn\s+)?onto|Turn\s+left\b)/i);
      if (match) return "Turn left";
      match = text.match(/^(?:Right\s+(?:turn\s+)?onto|Turn\s+right\b)/i);
      if (match) return "Turn right";
      if (/^Go\s+to\b/i.test(text)) return "Continue";
      if (/^Travel\b/i.test(text)) return "Continue";
      return directionClearManeuverBeforeV17312(instruction);
    };

    function directionLeadingSafetyV17312(value) {
      const text = String(value || "").trim();
      const patterns = [
        /^(CONTROL ROOM ACCESS CODE\s*:[\s\S]*?\))\s+(?=From|Take|Follow|Turn|Head|Go|Travel)/i,
        /^((?:School\s+)?Curfew\b[\s\S]*?)\s+(?=From|Take|Follow|Turn|Head|Go|Travel)/i,
        /^((?:Gate|Door|Access)\s+code\s*:[^.;]+)[.;]?\s+(?=From|Take|Follow|Turn|Head|Go|Travel)/i
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return { note:match[1].trim(), text:text.slice(match[0].length - (text.match(/(?:From|Take|Follow|Turn|Head|Go|Travel)/i)?.[0]?.length || 0)).trim() };
      }
      return { note:"", text };
    }

    function directionSplitDriverStepV17312(value) {
      let text = String(value || "").replace(/\s{2,}/g, " ").trim();
      if (!text) return [];
      text = text
        .replace(/\s+(?=(?:turn\s+(?:left|right)\b|left\s+(?:turn\s+)?onto\b|right\s+(?:turn\s+)?onto\b|slight\s+(?:left|right)\b|veer\s+(?:left|right)\b|bear\s+(?:left|right)\b|stay\s+(?:left|right)\b|keep\s+(?:left|right)\b|follow\b|take\b|merge\b|head\b|go\s+to\b|travel\b))/gi, "\n")
        .replace(/\s+(?=((?:State\s+Route|SR|OH|WV|PA|US|I|Route)\s*[- ]?\s*\d{1,4}[A-Z]?\s+(?:for\s+)?\d+(?:\.\d+)?\s*(?:miles?|mile|mi|feet|ft)\b))/gi, "\n")
        .replace(/\s+(?=(?:Will\s+be\s+on\s+(?:the\s+)?(?:left|right)\b|(?:The\s+)?(?:pad|lease\s+road|access\s+road|site\s+entrance|well[- ]site\s+entrance)\b))/gi, "\n");
      const raw = text.split(/\n+/).map(part => part.trim()).filter(Boolean);
      const parts = [];
      for (const part of raw) {
        if (/^Continue\s+(?:for\s+)?(?:approximately\s+|about\s+)?(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+|[½¼¾])\s*(?:miles?|mi|feet|ft)\b/i.test(part) && parts.length) {
          parts[parts.length - 1] = `${parts[parts.length - 1]} ${part}`.replace(/\s{2,}/g, " ").trim();
        } else {
          parts.push(part);
        }
      }
      if (parts.length > 1 && /^From\s+[^,.;]{1,55}$/i.test(parts[0])) {
        parts[1] = `${parts[0]}. ${parts[1]}`;
        parts.shift();
      }
      return parts;
    }

    const directionClearPolishedStepsBeforeV17312 = directionClearPolishedStepsV1732;
    directionClearPolishedStepsV1732 = function directionClearPolishedStepsRebuiltV17312(clearText) {
      const parsed = directionClearPolishedStepsBeforeV17312(clearText);
      const steps = [];
      for (const entry of parsed.steps || []) {
        const safety = directionLeadingSafetyV17312(entry.instruction);
        const parts = directionSplitDriverStepV17312(safety.text);
        if (parts.length > 1 || entry.compoundSource) {
          const useParts = parts.length ? parts : [safety.text];
          useParts.forEach((instruction, index) => {
            steps.push({
              instruction,
              notes:[...(index === 0 && safety.note ? [safety.note] : []), ...(index === useParts.length - 1 ? (entry.notes || []) : [])],
              sourceStepOrder:entry.sourceStepOrder,
              disableRoadIntel:useParts.length > 1,
              compoundSource:false,
              compoundSplit:useParts.length > 1
            });
          });
        } else if (parts[0]) {
          steps.push({ ...entry, instruction:parts[0], notes:[...(safety.note ? [safety.note] : []), ...(entry.notes || [])], compoundSource:false });
        }
      }
      return { reference:parsed.reference, steps };
    };

    const directionRoadIntelRoadBeforeV17312 = directionRoadIntelRoadV1739;
    directionRoadIntelRoadV1739 = function directionRoadIntelRoadRebuiltV17312(view, intel) {
      const primary = normalize(intel?.primary_road);
      const viewText = normalize(view?.road?.text);
      const viewGeneric = /^Route\s*[- ]?\s*\d/i.test(viewText);
      if (primary && (!viewText || viewGeneric) && !/^Route\s/i.test(primary)) {
        return { kind:/^(?:I|US|OH|WV|PA|SR|CR|TR)-/i.test(primary) ? "route" : "road", text:primary };
      }
      return directionRoadIntelRoadBeforeV17312(view, intel);
    };

    function directionReferencePartV17312(part, p) {
      let text = normalize(part);
      if (!text) return "";
      text = text.replace(/^Route\s*[- ]?\s*(\d{1,4}[A-Z]?)/i, (_, n) => directionGenericRouteLabelV17312(n, p, text));
      return text;
    }

    const directionSequenceSummaryBeforeV17312 = directionSequenceSummary;
    directionSequenceSummary = function directionSequenceSummaryRebuiltV17312(value, p) {
      const parsed = directionClearSectionsV1732(p?.directionsClear);
      if (parsed.reference) {
        return parsed.reference.split(/\s*→\s*/).map(part => directionReferencePartV17312(part, p)).filter(Boolean).join(" → ");
      }
      return directionSequenceSummaryBeforeV17312(value, p);
    };

    const directionCopyTextBeforeV17312 = directionCopyText;
    directionCopyText = function directionCopyTextRebuiltV17312(value, p) {
      const clear = String(p?.directionsClear || "").trim();
      if (!clear) return directionCopyTextBeforeV17312(value, p);
      const parsed = directionClearPolishedStepsV1732(clear);
      const reference = parsed.reference
        ? `Road sequence reference:\n${parsed.reference.split(/\s*→\s*/).map(part => directionReferencePartV17312(part, p)).join(" → ")}`
        : "";
      const steps = parsed.steps.map((entry,index) => `${index + 1}. ${[entry.instruction, ...(entry.notes || [])].filter(Boolean).join(" ")}`).join("\n");
      return [reference, steps ? `Step-by-step directions:\n${steps}` : ""].filter(Boolean).join("\n\n");
    };
