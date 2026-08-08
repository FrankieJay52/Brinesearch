    /* BrineSearch V17.3.2 — final Clear Directions card polish.
       Keep driver cards road-first: mileage stays with the road/maneuver it
       describes, while warnings, gate codes, and landmarks become notes on the
       preceding card instead of fake CONTINUE steps. */

    const directionClearManeuverBeforePolishV1732 = directionClearManeuverV1733;
    directionClearManeuverV1733 = function directionClearManeuverPolishV1732(instruction) {
      const text = String(instruction || "").trim();
      let match;
      if ((match = text.match(/^Veer\s+(left|right)\b/i))) return `Veer ${match[1].toLowerCase()}`;
      if ((match = text.match(/^Bear\s+(left|right)\b/i))) return `Bear ${match[1].toLowerCase()}`;
      if ((match = text.match(/^Stay\s+(left|right)\b/i))) return `Stay ${match[1].toLowerCase()}`;
      if ((match = text.match(/\bturn\s+(left|right)\b/i)) && /^(?:At|After|Before|Just|Past|Near|By)\b/i.test(text)) {
        return `Turn ${match[1].toLowerCase()}`;
      }
      const base = directionClearManeuverBeforePolishV1732(instruction);
      if (base === "Continue" && !/^(?:Continue|Follow|Go|Proceed)\b/i.test(text)) return "";
      return base;
    };

    function directionClearNoteOnlyV1732(instruction) {
      return /^(?:Gate code|Access warning|Truck restriction|Warning|Landmark|Note|CB(?:\s|:)|Call out|Speed limit|Do not|Important|Caution)\b/i
        .test(String(instruction || "").trim());
    }

    function directionClearDistanceOnlyV1732(instruction) {
      return /^(?:Continue|Go|Follow|Proceed)\s+(?:(?:approximately|about)\s+)?(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+|[½¼¾])\s*(?:miles?|mi|feet|ft)\b/i
        .test(String(instruction || "").trim());
    }

    function directionClearPolishedStepsV1732(clearText) {
      const parsed = directionClearSectionsV1732(clearText);
      const steps = [];
      parsed.steps.forEach(instruction => {
        const text = String(instruction || "").trim();
        if (!text) return;
        if (directionClearNoteOnlyV1732(text) && steps.length) {
          steps[steps.length - 1].notes.push(text);
          return;
        }
        if (directionClearDistanceOnlyV1732(text) && steps.length) {
          steps[steps.length - 1].instruction = `${steps[steps.length - 1].instruction} ${text}`.replace(/\s{2,}/g, " ").trim();
          return;
        }
        steps.push({ instruction: text, notes: [] });
      });
      return { reference: parsed.reference, steps };
    }

    directionClearPrimaryHtmlV1732 = function directionClearPrimaryHtmlPolishV1732(clearText, p) {
      const parsed = directionClearPolishedStepsV1732(clearText);
      if (!parsed.steps.length) return "";
      return `<section class="direction-route-group direction-clear-primary">
        <div class="direction-route-heading"><span>PRIMARY ROUTE</span></div>
        <ol class="direction-pro-steps direction-clear-steps">${parsed.steps.map((entry, index) => {
          const view = directionClearStepViewV1733(entry.instruction, p);
          const sign = directionClearSignForRoadV1733(view.road, p);
          const meta = view.maneuver || view.distance
            ? `<div class="direction-clear-meta">${view.maneuver ? `<span class="direction-clear-maneuver">${esc(view.maneuver)}</span>` : ""}${view.distance ? `<span class="direction-distance direction-clear-distance">${esc(view.distance)} mi</span>` : ""}</div>`
            : "";
          const roadLine = sign
            ? `<div class="direction-clear-road-row"><span class="direction-clear-sign">${sign}</span>${view.cardinal ? `<span class="direction-clear-cardinal">${esc(view.cardinal)}</span>` : ""}</div>`
            : (view.fallback ? `<div class="direction-clear-fallback">${esc(view.fallback)}</div>` : "");
          const noteParts = [view.note, ...entry.notes].filter(Boolean);
          return `<li class="direction-pro-step direction-clear-step">
            <span class="direction-pro-number">${index + 1}</span>
            <div class="direction-pro-main direction-clear-card">
              ${meta}
              ${roadLine}
              ${noteParts.length ? `<div class="direction-clear-note">${esc(noteParts.join(" · "))}</div>` : ""}
            </div>
          </li>`;
        }).join("")}</ol>
      </section>`;
    };
