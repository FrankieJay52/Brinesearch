
    function normalizeRoadName(value, p) {
      let text = normalize(value).replace(/[“”]/g, '"').replace(/[’]/g, "'");
      const corrected = ROAD_NAME_CORRECTIONS.get(text.toLowerCase());
      if (corrected) return { text: corrected, corrected:true, review:false };

      const statePrefix = roadStatePrefix(p);
      text = text
        .replace(/\bInterstate\s+(\d{1,3})\b/gi, "I-$1")
        .replace(/\bI\s*[- ]?\s*(\d{1,3})\b/gi, "I-$1")
        .replace(/\bU\.?S\.?\s+(?:Route\s+)?(\d{1,3})\b/gi, "US-$1")
        .replace(/\bUS\s*[- ]?\s*(\d{1,3})\b/gi, "US-$1")
        .replace(/\b(?:State Route|S\.?R\.?|SR|OH|WV|PA)\s*[- ]?\s*(\d{1,4})\b/gi, (_, n) => `${statePrefix}-${n}`)
        .replace(/\b(?:County Road|C\.?R\.?|CR)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?)\b/gi, "CR-$1")
        .replace(/\b(?:Township Road|Township Route|T\.?R\.?|TR)\s*[- ]?\s*(\d{1,4}[A-Z]?)\b/gi, "TR-$1")
        .replace(/\bRoad\b/gi, "Rd")
        .replace(/\bStreet\b/gi, "St")
        .replace(/\bAvenue\b/gi, "Ave")
        .replace(/\bBoulevard\b/gi, "Blvd")
        .replace(/\bHighway\b/gi, "Hwy")
        .replace(/\bLane\b/gi, "Ln")
        .replace(/\bDrive\b/gi, "Dr")
        .replace(/\bCourt\b/gi, "Ct")
        .replace(/\bPike\b/gi, "Pike")
        .replace(/\s{2,}/g, " ").trim();

      if (!/^(?:I|US|OH|WV|PA|SR|CR|TR)-\d/i.test(text) && !/^(?:Access|Lease) Rd$/i.test(text)) {
        text = roadTitleCase(text);
      }
      text = text
        .replace(/\bAccess Rd\b/i, "Access Road")
        .replace(/\bLease Rd\b/i, "Lease Road")
        .replace(/\bRd Rd\b/gi, "Rd");

      const review = /[A-Za-z][^0-9]\/[A-Za-z]/.test(text) || /\b(?:unknown|unnamed|private|local)\b/i.test(text);
      return { text, corrected:false, review };
    }

    function directionTypeParts(instruction) {
      const value = cleanLegacyDirectionText(instruction);
      const tests = [
        ["continue", /^(?:Rd\s+)?Continue (?:to follow|on|onto)\s+(.+)$/i],
        ["continue", /^Continue (?:to follow|on|onto)\s+(.+)$/i],
        ["left", /^Turn left (?:on|onto)\s+(.+)$/i],
        ["right", /^Turn right (?:on|onto)\s+(.+)$/i],
        ["merge", /^Merge onto\s+(.+)$/i], ["exit", /^Take Exit\s*(.*)$/i],
        ["keep-left", /^Keep left(?: onto)?\s*(.*)$/i], ["keep-right", /^Keep right(?: onto)?\s*(.*)$/i],
        ["slight-left", /^Slight left(?: onto)?\s*(.*)$/i], ["slight-right", /^Slight right(?: onto)?\s*(.*)$/i],
        ["straight", /^Continue straight\s*(.*)$/i],
        ["destination-left", /^(?:Destination (?:will be )?on (?:the )?left|Pad (?:is|will be) on (?:the )?left)$/i],
        ["destination-right", /^(?:Destination (?:will be )?on (?:the )?right|Pad (?:is|will be) on (?:the )?right)$/i]
      ];
      for (const [type, pattern] of tests) {
        const m = value.match(pattern); if (m) return { type, detail: normalize(m[1] || "") };
      }
      return { type:"custom", detail:value };
    }

    function splitCardinalDirection(detail, explicitDirection = "") {
      let value = cleanLegacyDirectionText(detail);
      let direction = normalizeCompassDirection(explicitDirection);
      const leadingHead = value.match(/^Head\s+(northwest|northeast|southwest|southeast|north|south|east|west|NW|NE|SW|SE|N|S|E|W)(?:\s+(?:on|onto|along|toward|towards))?\s+(.+)$/i);
      const leadingOn = value.match(/^(northwest|northeast|southwest|southeast|north|south|east|west|NW|NE|SW|SE|N|S|E|W)\s+(?:on|onto|along|toward|towards)\s+(.+)$/i);
      const leading = leadingHead || leadingOn;
      if (leading) {
        direction = direction || normalizeCompassDirection(leading[1]);
        value = normalize(leading[2]);
      }
      const suffix = value.match(/^(.*?)(?:\s+|[-–—])(northwest|northeast|southwest|southeast|north|south|east|west|NW|NE|SW|SE|N|S|E|W)$/i);
      if (suffix && normalize(suffix[1])) {
        direction = direction || normalizeCompassDirection(suffix[2]);
        value = normalize(suffix[1]);
      }
      return { detail:value, direction };
    }

    function buildDirectionInstruction(type, detail) {
      const d = cleanLegacyDirectionText(detail);
      const prefixes = { continue:"Continue on", left:"Turn left onto", right:"Turn right onto", merge:"Merge onto", exit:"Take Exit", "keep-left":"Keep left", "keep-right":"Keep right", "slight-left":"Slight left", "slight-right":"Slight right", straight:"Continue straight" };
      if (type === "destination-left") return "Destination on left";
      if (type === "destination-right") return "Destination on right";
      if (type === "custom") return d;
      return [prefixes[type] || "", d].filter(Boolean).join(" ");
    }

    function encodeDirectionStep(instruction, distance, note, cardinal = "") {
      const text = cleanLegacyDirectionText(instruction);
      const d = normalize(distance).replace(/[^0-9.]/g, "");
      const n = normalize(note);
      const c = normalizeCompassDirection(cardinal);
      return `${text}${d || n || c ? ` ⟦d=${d};n=${encodeURIComponent(n)};c=${c}⟧` : ""}`;
    }

    function normalizeDirectionInstruction(instruction, p) {
      const cleaned = cleanLegacyDirectionText(instruction);
      const parts = directionTypeParts(cleaned);
      if (parts.type === "destination-left") return { text:"Destination on left", corrected:false, review:false };
      if (parts.type === "destination-right") return { text:"Destination on right", corrected:false, review:false };
      if (parts.type === "straight" && !parts.detail) return { text:"Continue straight", corrected:false, review:false };
      const roadParts = splitCardinalDirection(parts.detail);
      const road = normalizeRoadName(roadParts.detail || cleaned, p);
      return { text: buildDirectionInstruction(parts.type, road.text), corrected:road.corrected, review:road.review };
    }

    function directionBadge(instruction, p) {
      const text = normalizeRoadName(instruction, p).text.toUpperCase();
      let m;
      if ((m = text.match(/\bI-(\d{1,3})\b/))) return { label:`I-${m[1]}`, tone:"interstate" };
      if ((m = text.match(/\bUS-(\d{1,3})\b/))) return { label:`US-${m[1]}`, tone:"us" };
      if ((m = text.match(/\b(OH|WV|PA|SR)-(\d{1,4})\b/))) return { label:`${m[1]}-${m[2]}`, tone:"state" };
      if ((m = text.match(/\bCR-(\d{1,4}(?:\/\d+)?)\b/))) return { label:`CR-${m[1]}`, tone:"county" };
      if ((m = text.match(/\bTR-(\d{1,4}[A-Z]?)\b/))) return { label:`TR-${m[1]}`, tone:"county" };
      if (/^(?:PAD|WELL PAD)$/.test(text)) return { label:"PAD", tone:"lease" };
      if (/\b(?:LEASE ROAD|ACCESS ROAD|TRUCK ENTRANCE)\b/.test(text)) return { label:/ACCESS ROAD/.test(text)?"ACCESS":"LEASE", tone:"lease" };
      return null;
    }

    function isRoadSignText(value, p) {
      const text = normalize(value);
      return Boolean(directionBadge(text, p)) || /\b(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Way|Trail|Run|Ridge|Route)\b/i.test(text);
    }

    function directionDisplayParts(instruction, p, explicitCardinal = "") {
      const cleaned = cleanLegacyDirectionText(instruction);
      const parts = directionTypeParts(cleaned);
      const roadParts = splitCardinalDirection(parts.detail, explicitCardinal);
      const labels = {
        continue:"Continue", left:"Turn left", right:"Turn right", merge:"Merge",
        exit:"Take", "keep-left":"Keep left", "keep-right":"Keep right",
        "slight-left":"Slight left", "slight-right":"Slight right",
        straight:"Continue straight", "destination-left":"Destination on left",
        "destination-right":"Destination on right"
      };
      const roadResult = parts.type.startsWith("destination-")
        ? { text:parts.type === "destination-left" ? "Destination" : "Destination", corrected:false, review:false }
        : normalizeRoadName(roadParts.detail || cleaned, p);
      const road = roadResult.text;
      return {
        normalized: buildDirectionInstruction(parts.type, road),
        maneuver: parts.type === "custom" ? "" : (labels[parts.type] || ""),
        compass: compassDirectionLabel(roadParts.direction),
        cardinal: roadParts.direction,
        road,
        corrected: roadResult.corrected,
        review: roadResult.review,
        isRoad: isRoadSignText(road, p) || parts.type.startsWith("destination-")
      };
    }

    function directionSpecialSign(roadText, badge) {
      const text = normalize(roadText);
      const exitMatch = text.match(/^Exit\s*([0-9A-Z-]+)?/i);
      if (exitMatch) {
        const exitNumber = normalize(exitMatch[1] || "");
        return `<span class="direction-road-sign exit-sign" aria-label="Exit ${esc(exitNumber)}"><span>EXIT</span>${exitNumber ? `<strong>${esc(exitNumber)}</strong>` : ""}</span>`;
      }
      if (!badge && /\b(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Way|Trail|Run|Ridge|Route)\b/i.test(text)) {
        return `<span class="direction-road-sign street-sign" aria-label="${esc(text)}"><span class="street-sign-board">${esc(text)}</span><span class="street-sign-post"></span></span>`;
      }
      return "";
    }

    function directionPlainText(raw, p) {
      const step = decodeDirectionMeta(raw);
      const display = directionDisplayParts(step.instruction, p, step.cardinal);
      return [display.maneuver, display.compass, display.road].filter(Boolean).join(" ");
    }

    function directionSequenceSummary(value, p) {
      const routes = splitDirectionRoutes(value);
      const primary = routes[0] || [];
      return primary.map(raw => directionPlainText(raw, p)).join(" → ");
    }

    function directionCopyText(value, p) {
      const routes = splitDirectionRoutes(value);
      return routes.map((route, routeIndex) => {
        const heading = routeIndex ? "ALTERNATE ROUTE" : "PRIMARY ROUTE";
        const lines = route.map((raw, index) => {
          const step = decodeDirectionMeta(raw);
          const display = directionDisplayParts(step.instruction, p, step.cardinal);
          const main = [display.maneuver, display.compass, display.road, step.distance ? `${step.distance} mi` : ""].filter(Boolean).join(" ");
          return `${index + 1}. ${main}${step.note ? ` — ${step.note}` : ""}`;
        });
        return [heading, ...lines].join("\n");
      }).join("\n\n");
    }

    function directionRoutesHtml(value, p) {
      const routes = splitDirectionRoutes(value);
      if (!routes.length) return `<span class="muted">Not listed</span>`;
      return `<div class="direction-route-groups">${routes.map((route, routeIndex) => `
        <section class="direction-route-group">
          <div class="direction-route-heading"><span>${routeIndex ? "ALTERNATE ROUTE" : "PRIMARY ROUTE"}</span></div>
          <ol class="direction-pro-steps">${route.map((raw, index) => {
            const step = decodeDirectionMeta(raw);
            const display = directionDisplayParts(step.instruction, p, step.cardinal);
            const badge = directionBadge(display.road, p);
            const sign = badge
              ? `<span class="direction-highway-badge ${badge.tone}" aria-label="${esc(badge.label)}">${esc(badge.label)}</span>`
              : directionSpecialSign(display.road, badge);
            const mainContent = sign || (display.isRoad
              ? `<span class="direction-road-sign street-sign" aria-label="${esc(display.road)}"><span class="street-sign-board">${esc(display.road)}</span><span class="street-sign-post"></span></span>`
              : `<span class="direction-custom-instruction">${esc(display.road)}</span>`);
            const noteParts = [step.note, display.corrected ? "Road spelling standardized" : "", display.review ? "Road name needs official-source review" : ""].filter(Boolean);
            return `<li class="direction-pro-step">
              <span class="direction-pro-number">${index + 1}</span>
              <div class="direction-pro-main">
                <div class="direction-pro-line">${display.maneuver ? `<span class="direction-maneuver">${esc(display.maneuver)}</span>` : ""}${display.compass ? `<span class="direction-compass">${esc(display.compass)}</span>` : ""}${mainContent}${step.distance ? `<span class="direction-distance">${esc(step.distance)} mi</span>` : ""}</div>
                ${noteParts.length ? `<div class="direction-note">${esc(noteParts.join(" · "))}</div>` : ""}
              </div>
            </li>`;
          }).join("")}</ol>
        </section>`).join("")}</div>`;
    }

    function mountDirectionWizard(routeField, mountTarget, options = {}) {
      if (!routeField || !mountTarget || routeField.dataset.directionWizardMounted === "true") return null;
      routeField.dataset.directionWizardMounted = "true";
      const wizard = document.createElement("section");
      wizard.className = `direction-wizard ${options.className || ""}`.trim();
      wizard.innerHTML = `<div class="direction-wizard-head"><div><div class="eyebrow">Truck directions</div><h3>Directions Wizard</h3><p>Choose the maneuver, travel direction, road, and optional mileage.</p></div><button type="button" class="btn small secondary" data-add-route>Add alternate route</button></div><div class="direction-wizard-routes"></div><details class="direction-legacy-details"><summary>Original saved direction text</summary><p>This stays available for backward compatibility and is never deleted automatically.</p></details>`;
      mountTarget.prepend(wizard);
      const legacyDetails = wizard.querySelector(".direction-legacy-details");
      (options.legacyFields || []).filter(Boolean).forEach(field => {
        field.classList.add("direction-legacy-field");
        legacyDetails.appendChild(field);
      });
      const routesHost = wizard.querySelector(".direction-wizard-routes");

      const addStepRow = (routeEl, raw = "") => {
        const parsed = decodeDirectionMeta(raw);
        const parts = directionTypeParts(parsed.instruction);
        const roadParts = splitCardinalDirection(parts.detail, parsed.cardinal);
        const row = document.createElement("div");
        row.className = "direction-wizard-step";
        row.innerHTML = `<div class="direction-drag">↕</div><div class="direction-wizard-fields"><select data-direction-type aria-label="Direction type">${DIRECTION_TYPES.map(([v,l])=>`<option value="${v}" ${parts.type===v?"selected":""}>${l}</option>`).join("")}</select><input data-direction-detail required placeholder="Road or instruction" value="${esc(roadParts.detail)}"><div class="direction-wizard-secondary"><label>Travel direction (optional)<select data-direction-cardinal aria-label="Travel direction"><option value="">None</option>${COMPASS_DIRECTIONS.map(([value,label])=>`<option value="${value}" ${roadParts.direction===value?"selected":""}>${label}</option>`).join("")}</select></label><label>Distance (optional)<input data-direction-distance inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" placeholder="4.5" value="${esc(parsed.distance)}"></label><label>Note (optional)<input data-direction-note placeholder="Narrow road, gate code…" value="${esc(parsed.note)}"></label></div></div><div class="direction-step-actions"><button type="button" data-step-up aria-label="Move up"><span class="fm-icon fm-back fm-rotate-up"></span></button><button type="button" data-step-down aria-label="Move down"><span class="fm-icon fm-back fm-rotate-down"></span></button><button type="button" data-step-delete aria-label="Delete step"><span class="fm-icon fm-delete"></span></button></div>`;
        routeEl.querySelector(".direction-wizard-steps").appendChild(row);
        const type = row.querySelector("[data-direction-type]");
        const detail = row.querySelector("[data-direction-detail]");
        const cardinal = row.querySelector("[data-direction-cardinal]");
        const cardinalLabel = cardinal.closest("label");
        const updateRequired = () => {
          const noDetail = type.value.startsWith("destination-");
          detail.required = !noDetail;
          detail.hidden = noDetail;
          cardinalLabel.hidden = noDetail;
          if (noDetail) cardinal.value = "";
        };
        type.addEventListener("change", updateRequired); updateRequired();
      };

      const addRoute = (steps = [], routeIndex = routesHost.children.length) => {
        const route = document.createElement("section");
        route.className = "direction-wizard-route";
        route.innerHTML = `<div class="direction-wizard-route-title"><strong>${routeIndex ? "ALTERNATE ROUTE" : "PRIMARY ROUTE"}</strong>${routeIndex ? '<button type="button" data-delete-route>Remove route</button>' : ""}</div><div class="direction-wizard-steps"></div><button type="button" class="direction-add-step" data-add-step>＋ Add direction step</button>`;
        routesHost.appendChild(route);
        (steps.length ? steps : [""]).forEach(step => addStepRow(route, step));
      };

      const currentRoutes = splitDirectionRoutes(routeField.value);
      (currentRoutes.length ? currentRoutes : [[""]]).forEach((route, i) => addRoute(route, i));
      wizard.querySelector("[data-add-route]").addEventListener("click", () => addRoute([], routesHost.children.length));
      wizard.addEventListener("click", event => {
        const route = event.target.closest(".direction-wizard-route");
        const row = event.target.closest(".direction-wizard-step");
        if (event.target.closest("[data-add-step]")) addStepRow(route, "");
        if (event.target.closest("[data-delete-route]")) { route.remove(); [...routesHost.children].forEach((r,i)=>r.querySelector("strong").textContent=i?"ALTERNATE ROUTE":"PRIMARY ROUTE"); }
        if (event.target.closest("[data-step-delete]")) {
          if (route.querySelectorAll(".direction-wizard-step").length > 1) row.remove();
          else { row.querySelectorAll("input").forEach(input => input.value=""); row.querySelectorAll("select").forEach(select => select.selectedIndex=0); }
        }
        if (event.target.closest("[data-step-up]") && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
        if (event.target.closest("[data-step-down]") && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
        sync();
      });

      const sync = () => {
        const routes = [...routesHost.querySelectorAll(".direction-wizard-route")].map(route => [...route.querySelectorAll(".direction-wizard-step")].map(row => {
          const type = row.querySelector("[data-direction-type]").value;
          const detail = row.querySelector("[data-direction-detail]").value;
          const cardinal = row.querySelector("[data-direction-cardinal]").value;
          const instruction = buildDirectionInstruction(type, detail);
          return instruction ? encodeDirectionStep(instruction, row.querySelector("[data-direction-distance]").value, row.querySelector("[data-direction-note]").value, cardinal) : "";
        }).filter(Boolean)).filter(route => route.length);
        routeField.value = routes.map(route => route.join(" → ")).join(" → OR → ");
        options.onSync?.(routeField.value);
      };
      wizard.addEventListener("input", sync);
      wizard.addEventListener("change", sync);
      options.form?.addEventListener("submit", sync, { capture:true });
      sync();
      return wizard;
    }

    function setupDirectionWizard(p, section) {
      if (!(section === "route" || section === "directions" || section === "all")) return;
      const grid = document.querySelector('#liveEditorShell [data-live-editor-panel="directions"] .live-editor-grid') || document.querySelector("#liveEditorShell .live-editor-grid");
      if (!grid) return;
      let routeField = document.getElementById("live-Structured_Road_Sequence");
      if (!routeField) {
        routeField = document.createElement("textarea");
        routeField.id = "live-Structured_Road_Sequence";
        routeField.name = "Structured_Road_Sequence";
        routeField.hidden = true;
        routeField.value = p.Structured_Road_Sequence || "";
        grid.appendChild(routeField);
      }
      const legacyFields = [
        routeField.closest(".live-editor-field"),
        document.getElementById("live-writtenDirections")?.closest(".live-editor-field"),
        document.getElementById("live-directionsClear")?.closest(".live-editor-field")
      ];
      mountDirectionWizard(routeField, grid, { legacyFields, form:document.getElementById("liveEditorForm") });
    }

    function setupAddPadDirectionWizard() {
      const routeField = document.getElementById("newRoadSequence");
      const routeFieldShell = routeField?.closest(".add-pad-field");
      if (!routeField || !routeFieldShell || routeField.dataset.directionWizardMounted === "true") return;
      const shell = document.createElement("div");
      shell.className = "add-pad-field full add-direction-wizard-field";
      shell.dataset.wizardStep = "3";
      routeFieldShell.parentNode.insertBefore(shell, routeFieldShell);
      mountDirectionWizard(routeField, shell, { legacyFields:[routeFieldShell], form:addPadForm });
    }

    function routeSteps(value, p) {
      return directionRoutesHtml(value, p);
    }

    function splitMulti(value) {
      if (!has(value)) return [];
      return normalize(value).split('|').map(v => v.trim()).filter(Boolean);
    }
