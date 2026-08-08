    /* BrineSearch V17.3.1 — show the actual saved Clear Directions on pad pages.
       The older card renderer preferred the plain structured road sequence, so
       completed pads such as Bannock showed road signs but hid their turns and
       mileage. Clear Directions are now the primary display whenever available. */

    function directionClearSectionsV1732(value) {
      const text = String(value ?? "").replace(/\r\n?/g, "\n").trim();
      if (!text) return { reference: "", steps: [] };

      const stepMarker = /Step-by-step directions\s*:/i;
      const markerMatch = stepMarker.exec(text);
      const beforeSteps = markerMatch ? text.slice(0, markerMatch.index) : "";
      const stepText = markerMatch ? text.slice(markerMatch.index + markerMatch[0].length).trim() : text;
      const referenceMatch = beforeSteps.match(/Road sequence reference\s*:\s*([\s\S]*)/i);
      const reference = String(referenceMatch?.[1] || "")
        .split(/\n\s*\n/)[0]
        .replace(/\s*\n\s*/g, " ")
        .trim();

      const steps = [];
      const numbered = /(?:^|\n)\s*(\d+)\.\s*([\s\S]*?)(?=(?:\n\s*\d+\.\s)|$)/g;
      let match;
      while ((match = numbered.exec(stepText))) {
        const instruction = String(match[2] || "").replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
        if (instruction) steps.push(instruction);
      }

      if (!steps.length) {
        stepText
          .split(/\n+|(?=\s\d+\.\s+)/)
          .map(line => line.replace(/^\s*\d+\.\s*/, "").replace(/\s{2,}/g, " ").trim())
          .filter(Boolean)
          .forEach(line => steps.push(line));
      }

      return { reference, steps };
    }

    function directionClearDistanceV1732(instruction) {
      const text = String(instruction || "");
      const fraction = text.match(/\b(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)\s*(?:miles?|mi)\b/i);
      if (fraction) {
        const whole = Number(fraction[1] || 0);
        const numerator = Number(fraction[2]);
        const denominator = Number(fraction[3]);
        const value = denominator ? whole + (numerator / denominator) : 0;
        if (Number.isFinite(value) && value > 0) return String(Number(value.toFixed(2)));
      }

      const unicodeFraction = text.match(/([½¼¾])\s*(?:miles?|mi)\b/i);
      if (unicodeFraction) return ({ "½":"0.5", "¼":"0.25", "¾":"0.75" })[unicodeFraction[1]] || "";

      const withoutFractions = text.replace(/\b\d+\s*\/\s*\d+\s*(?:miles?|mi)\b/gi, "");
      const miles = withoutFractions.match(/\b(?:approximately|approx(?:imately)?\.?|about)?\s*(\d+(?:\.\d+)?)\s*(?:miles?|mi)\b/i);
      if (miles) return String(Number(miles[1]));

      const feet = text.match(/\b(\d+(?:\.\d+)?)\s*(?:feet|ft)\b/i);
      if (!feet) return "";
      const converted = Number(feet[1]) / 5280;
      if (!Number.isFinite(converted) || converted <= 0) return "";
      return converted < 0.1 ? converted.toFixed(2) : converted.toFixed(1);
    }

    function directionClearRoadTextV1732(instruction, p) {
      const text = String(instruction || "").trim();
      const exit = text.match(/\bExit\s*([0-9A-Z-]+)/i);
      if (exit) return { kind: "exit", text: `Exit ${exit[1]}` };

      const route = text.match(/\b(?:I|US|OH|WV|PA|SR)\s*[- ]?\s*\d{1,4}[NSEW]?\b/i);
      if (route) return { kind: "route", text: normalizeRoadName(route[0], p).text };

      const destination = text.match(/\b(?:lease|access)\s+road\b/i);
      if (destination) return { kind: "road", text: /access/i.test(destination[0]) ? "Access Road" : "Lease Road" };

      const named = text.match(/\b(?:onto|on|along|follow|take)\s+(?:the\s+)?(.+?)(?=\s+(?:for|and|then|until|toward|towards|continue|down\s+the\s+road|approximately|approx(?:imately)?\.?|about)\b|[.;]|$)/i);
      if (named?.[1]) {
        const candidate = named[1]
          .replace(/^(?:north|south|east|west|northeast|northwest|southeast|southwest)\s+/i, "")
          .replace(/\s*,\s*$/, "")
          .trim();
        if (candidate) return { kind: "road", text: normalizeRoadName(candidate, p).text };
      }

      return { kind: "", text: "" };
    }

    function directionClearSignForRoadV1733(road, p) {
      if (!road?.text) return "";
      if (road.kind === "exit") return directionSpecialSign(road.text, null);
      const badge = directionBadge(road.text, p);
      if (badge) return `<span class="direction-highway-badge ${badge.tone}" aria-label="${esc(badge.label)}">${esc(badge.label)}</span>`;
      return directionSpecialSign(road.text, null)
        || `<span class="direction-road-sign street-sign" aria-label="${esc(road.text)}"><span class="street-sign-board">${esc(road.text)}</span><span class="street-sign-post"></span></span>`;
    }

    function directionClearSignV1732(instruction, p) {
      return directionClearSignForRoadV1733(directionClearRoadTextV1732(instruction, p), p);
    }

    function directionClearManeuverV1733(instruction) {
      const text = String(instruction || "").trim();
      let match;
      if (/\btake\s+Exit\b/i.test(text)) return "Take exit";
      if ((match = text.match(/^From\s+(.+?),\s*/i))) return `Start from ${match[1].trim()}`;
      if ((match = text.match(/^Turn\s+(left|right)\b/i))) return `Turn ${match[1].toLowerCase()}`;
      if ((match = text.match(/^Slight\s+(left|right)\b/i))) return `Slight ${match[1].toLowerCase()}`;
      if ((match = text.match(/^Head\s+(northwest|northeast|southwest|southeast|north|south|east|west)\b/i))) return `Head ${match[1].toLowerCase()}`;
      if (/^Continue\s+straight\b/i.test(text)) return "Continue straight";
      if (/^Continue\b/i.test(text)) return "Continue";
      if (/^Follow\b/i.test(text)) return "Follow";
      if (/^Merge\b/i.test(text)) return "Merge";
      if (/^Keep\s+left\b/i.test(text)) return "Keep left";
      if (/^Keep\s+right\b/i.test(text)) return "Keep right";
      if (/^Take\b/i.test(text)) return "Take";
      if (/\b(?:pad|entrance)\b/i.test(text)) return "Arrive";
      return "Continue";
    }

    function directionClearCardinalV1733(instruction, maneuver) {
      if (/\b(?:northwest|northeast|southwest|southeast|north|south|east|west)\b/i.test(maneuver || "")) return "";
      const text = String(instruction || "");
      const match = text.match(/\b(?:I|US|OH|WV|PA|SR)\s*[- ]?\s*\d{1,4}\s+(northwest|northeast|southwest|southeast|north|south|east|west|NW|NE|SW|SE|N|S|E|W)\b/i)
        || text.match(/\bhead\s+(northwest|northeast|southwest|southeast|north|south|east|west|NW|NE|SW|SE|N|S|E|W)\b/i);
      if (!match) return "";
      return compassDirectionLabel(normalizeCompassDirection(match[1])) || match[1].toUpperCase();
    }

    function directionClearNoteV1733(instruction, road) {
      const text = String(instruction || "").trim();
      let match = text.match(/\b(?:the\s+)?(pad|entrance|lease road|access road)\s+(?:is|will be)\s+(?:on\s+)?(?:the\s+)?(left|right)\b/i);
      if (match) {
        const label = match[1].toLowerCase() === "pad" ? "Pad"
          : match[1].toLowerCase() === "entrance" ? "Entrance"
          : match[1].replace(/\b\w/g, letter => letter.toUpperCase());
        return `${label} on ${match[2].toLowerCase()}`;
      }

      match = text.match(/\b(?:the\s+)?(pad|entrance)\s+is\s+at\s+the\s+end\b/i);
      if (match) return `${match[1].replace(/\b\w/g, letter => letter.toUpperCase())} at end`;

      if (road?.kind === "exit") {
        match = text.match(/\bExit\s*[0-9A-Z-]+\s+for\s+(.+?)(?:[.;]|$)/i);
        if (match) return `For ${match[1].trim()}`;
      }

      match = text.match(/^Continue\s+to\s+the\s+(.+?)(?:[.;]|$)/i);
      if (match) return match[1].trim();
      return "";
    }

    function directionClearFallbackV1733(instruction, maneuver) {
      let text = String(instruction || "").trim();
      text = text
        .replace(/\s*(?:Continue|Follow|Go|Proceed)\s+(?:approximately\s+|about\s+)?\d+(?:\.\d+)?\s*(?:miles?|mi)\.?/gi, "")
        .replace(/\s+for\s+(?:approximately\s+|about\s+)?\d+(?:\.\d+)?\s*(?:miles?|mi)\.?/gi, "")
        .replace(/\s+for\s+\d+(?:\.\d+)?\s*(?:feet|ft)\.?/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (maneuver && text.toLowerCase().startsWith(maneuver.toLowerCase())) text = text.slice(maneuver.length).trim();
      return text.replace(/^[,.;:\s-]+/, "").replace(/\s+([.;,])/g, "$1").trim();
    }

    function directionClearStepViewV1733(instruction, p) {
      const road = directionClearRoadTextV1732(instruction, p);
      const maneuver = directionClearManeuverV1733(instruction);
      return {
        road,
        maneuver,
        distance: directionClearDistanceV1732(instruction),
        cardinal: directionClearCardinalV1733(instruction, maneuver),
        note: directionClearNoteV1733(instruction, road),
        fallback: directionClearFallbackV1733(instruction, maneuver)
      };
    }

    function directionClearPrimaryHtmlV1732(clearText, p) {
      const parsed = directionClearSectionsV1732(clearText);
      if (!parsed.steps.length) return "";
      return `<section class="direction-route-group direction-clear-primary">
        <div class="direction-route-heading"><span>PRIMARY ROUTE</span></div>
        <ol class="direction-pro-steps direction-clear-steps">${parsed.steps.map((instruction, index) => {
          const view = directionClearStepViewV1733(instruction, p);
          const sign = directionClearSignForRoadV1733(view.road, p);
          const meta = view.maneuver || view.distance
            ? `<div class="direction-clear-meta">${view.maneuver ? `<span class="direction-clear-maneuver">${esc(view.maneuver)}</span>` : ""}${view.distance ? `<span class="direction-distance direction-clear-distance">${esc(view.distance)} mi</span>` : ""}</div>`
            : "";
          const roadLine = sign
            ? `<div class="direction-clear-road-row"><span class="direction-clear-sign">${sign}</span>${view.cardinal ? `<span class="direction-clear-cardinal">${esc(view.cardinal)}</span>` : ""}</div>`
            : (view.fallback ? `<div class="direction-clear-fallback">${esc(view.fallback)}</div>` : "");
          return `<li class="direction-pro-step direction-clear-step">
            <span class="direction-pro-number">${index + 1}</span>
            <div class="direction-pro-main direction-clear-card">
              ${meta}
              ${roadLine}
              ${view.note ? `<div class="direction-clear-note">${esc(view.note)}</div>` : ""}
            </div>
          </li>`;
        }).join("")}</ol>
      </section>`;
    }

    function directionAlternateHtmlV1732(value, p) {
      const routes = splitDirectionRoutes(value);
      if (routes.length < 2) return "";
      return routes.slice(1).map(route => {
        const routeValue = route.join(" → ");
        return directionRoutesHtml(routeValue, p)
          .replace("PRIMARY ROUTE", "ALTERNATE ROUTE")
          .replace("direction-route-groups", "direction-route-groups direction-alternate-route-groups");
      }).join("");
    }

    function directionClearDisplayHtmlV1732(clearText, structuredValue, p) {
      const primary = directionClearPrimaryHtmlV1732(clearText, p);
      if (!primary) return directionRoutesHtml(structuredValue || clearText, p);
      return `<div class="direction-route-groups direction-clear-route-groups">${primary}</div>${directionAlternateHtmlV1732(structuredValue, p)}`;
    }

    const directionSequenceSummaryBeforeClearV1732 = directionSequenceSummary;
    directionSequenceSummary = function directionSequenceSummaryClearV1732(value, p) {
      const parsed = directionClearSectionsV1732(p?.directionsClear);
      return parsed.reference || directionSequenceSummaryBeforeClearV1732(value, p);
    };

    const directionCopyTextBeforeClearV1732 = directionCopyText;
    directionCopyText = function directionCopyTextClearV1732(value, p) {
      const clear = String(p?.directionsClear ?? "").replace(/\r\n?/g, "\n").trim();
      return clear || directionCopyTextBeforeClearV1732(value, p);
    };

    const fieldRoadStepsHtmlBeforeClearV1732 = fieldRoadStepsHtml;
    fieldRoadStepsHtml = function fieldRoadStepsHtmlClearV1732(value, p) {
      const clear = String(p?.directionsClear ?? "").trim();
      if (clear && directionClearSectionsV1732(clear).steps.length) {
        return directionClearDisplayHtmlV1732(clear, value, p);
      }
      return fieldRoadStepsHtmlBeforeClearV1732(value, p);
    };
