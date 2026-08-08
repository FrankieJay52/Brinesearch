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
      const miles = text.match(/\b(?:approximately|approx(?:imately)?\.?|about)?\s*(\d+(?:\.\d+)?)\s*(?:miles?|mi)\b/i);
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

      const named = text.match(/\b(?:onto|on|along|follow|take)\s+(?:the\s+)?(.+?)(?=\s+(?:for|and|then|until|toward|towards|approximately|approx(?:imately)?\.?|about)\b|[.;]|$)/i);
      if (named?.[1]) {
        const candidate = named[1]
          .replace(/^(?:north|south|east|west|northeast|northwest|southeast|southwest)\s+/i, "")
          .replace(/\s*,\s*$/, "")
          .trim();
        if (candidate) return { kind: "road", text: normalizeRoadName(candidate, p).text };
      }

      const destination = text.match(/\b(?:lease|access)\s+road\b/i);
      if (destination) return { kind: "road", text: /access/i.test(destination[0]) ? "Access Road" : "Lease Road" };
      return { kind: "", text: "" };
    }

    function directionClearSignV1732(instruction, p) {
      const road = directionClearRoadTextV1732(instruction, p);
      if (!road.text) return "";
      if (road.kind === "exit") return directionSpecialSign(road.text, null);
      const badge = directionBadge(road.text, p);
      if (badge) return `<span class="direction-highway-badge ${badge.tone}" aria-label="${esc(badge.label)}">${esc(badge.label)}</span>`;
      return directionSpecialSign(road.text, null)
        || `<span class="direction-road-sign street-sign" aria-label="${esc(road.text)}"><span class="street-sign-board">${esc(road.text)}</span><span class="street-sign-post"></span></span>`;
    }

    function directionClearPrimaryHtmlV1732(clearText, p) {
      const parsed = directionClearSectionsV1732(clearText);
      if (!parsed.steps.length) return "";
      return `<section class="direction-route-group direction-clear-primary">
        <div class="direction-route-heading"><span>PRIMARY ROUTE</span></div>
        <ol class="direction-pro-steps direction-clear-steps">${parsed.steps.map((instruction, index) => {
          const distance = directionClearDistanceV1732(instruction);
          const sign = directionClearSignV1732(instruction, p);
          return `<li class="direction-pro-step direction-clear-step">
            <span class="direction-pro-number">${index + 1}</span>
            <div class="direction-pro-main">
              <div class="direction-pro-line direction-clear-line">
                ${sign ? `<span class="direction-clear-sign">${sign}</span>` : ""}
                <span class="direction-clear-instruction">${esc(instruction)}</span>
                ${distance ? `<span class="direction-distance direction-clear-distance">${esc(distance)} mi</span>` : ""}
              </div>
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
