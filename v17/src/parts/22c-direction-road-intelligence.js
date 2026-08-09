    /* BrineSearch V17.3.9 — shared-road direction intelligence.
       Adds safe dual road names, shared-route mileage when multiple matching saved
       routes agree, and clearer same-road continuation cues. Source directions
       remain unchanged; weak or conflicting mileage is never invented. */

    const directionRoadIntelBaseRenderV1739 = renderPad;
    const directionRoadIntelRequestsV1739 = new Map();

    async function directionRoadIntelHydrateV1739(id) {
      const pad = padById(id);
      if (!pad || pad.__directionRoadIntelLoadedV1739) return pad?.directionRoadIntelligence || [];
      if (!pad._dbId || DATA_SOURCE_LABEL !== "Live database" || !navigator.onLine) return pad.directionRoadIntelligence || [];
      if (directionRoadIntelRequestsV1739.has(id)) return directionRoadIntelRequestsV1739.get(id);

      const request = (async () => {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/brinesearch_direction_step_intelligence`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ p_pad_id: pad._dbId }),
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`Direction road intelligence returned ${response.status}`);
        const rows = await response.json();
        pad.directionRoadIntelligence = Array.isArray(rows) ? rows : [];
        pad.__directionRoadIntelLoadedV1739 = true;
        return pad.directionRoadIntelligence;
      })().finally(() => directionRoadIntelRequestsV1739.delete(id));

      directionRoadIntelRequestsV1739.set(id, request);
      return request;
    }

    function directionRoadIntelForStepV1739(p, index, entry) {
      if (entry?.disableRoadIntel) return null;
      const rows = Array.isArray(p?.directionRoadIntelligence) ? p.directionRoadIntelligence : [];
      const sourceOrder = Number(entry?.sourceStepOrder || index + 1);
      return rows.find(row => Number(row?.step_order) === sourceOrder) || null;
    }

    function directionRoadIntelManeuverV1739(view, intel) {
      if (!intel?.same_road_continuation) return view.maneuver;
      if (intel.maneuver_class === "turn_left" || intel.maneuver_class === "stay_left") return "Stay on road — left";
      if (intel.maneuver_class === "turn_right" || intel.maneuver_class === "stay_right") return "Stay on road — right";
      return "Stay on road";
    }

    function directionRoadIntelRoadV1739(view, intel) {
      if (view?.road?.text) return view.road;
      const primary = normalize(intel?.primary_road);
      if (!primary) return view?.road || { kind:"", text:"" };
      const isRoute = /^(?:I|US|OH|WV|PA|SR|CR|TR|Route)\b/i.test(primary);
      return { kind:isRoute ? "route" : "road", text:primary };
    }

    const directionClearPrimaryHtmlBeforeV1739 = directionClearPrimaryHtmlV1732;
    directionClearPrimaryHtmlV1732 = function directionClearPrimaryHtmlRoadIntelV1739(clearText, p) {
      const parsed = directionClearPolishedStepsV1732(clearText);
      if (!parsed.steps.length) return "";

      return `<section class="direction-route-group direction-clear-primary">
        <div class="direction-route-heading"><span>PRIMARY ROUTE</span></div>
        <ol class="direction-pro-steps direction-clear-steps">${parsed.steps.map((entry, index) => {
          if (entry.compoundSource) {
            const noteParts = [...(entry.notes || [])].filter(Boolean);
            return `<li class="direction-pro-step direction-clear-step direction-compound-source">
              <span class="direction-pro-number">${index + 1}</span>
              <div class="direction-pro-main direction-clear-card">
                <div class="direction-clear-meta"><span class="direction-clear-maneuver">Detailed route</span></div>
                <div class="direction-clear-fallback">${esc(entry.instruction)}</div>
                ${noteParts.length ? `<div class="direction-clear-note">${esc(noteParts.join(" · "))}</div>` : ""}
                <div class="direction-intel-warning">Multiple turns or mileages are stored in this one source step. BrineSearch is showing the saved wording together instead of attaching one mileage to the wrong road.</div>
              </div>
            </li>`;
          }

          const view = directionClearStepViewV1733(entry.instruction, p);
          const intel = directionRoadIntelForStepV1739(p, index, entry);
          const road = directionRoadIntelRoadV1739(view, intel);
          const sign = directionClearSignForRoadV1733(road, p);
          const maneuver = directionRoadIntelManeuverV1739(view, intel);
          const savedDistance = intel?.distance_source === "saved_direction" ? normalize(intel.distance_label) : "";
          const inferredDistance = !view.distance && intel?.distance_source === "shared_road_consensus" && !intel?.same_road_continuation
            ? normalize(intel.distance_label)
            : "";
          const distanceText = savedDistance || (view.distance ? `${view.distance} mi` : inferredDistance);
          const meta = maneuver || distanceText
            ? `<div class="direction-clear-meta">${maneuver ? `<span class="direction-clear-maneuver">${esc(maneuver)}</span>` : ""}${distanceText ? `<span class="direction-distance direction-clear-distance${inferredDistance ? " direction-distance-shared" : ""}">${esc(distanceText)}</span>` : ""}</div>`
            : "";
          const alias = normalize(intel?.local_road_name);
          const roadLine = sign
            ? `<div class="direction-clear-road-row"><span class="direction-clear-sign">${sign}</span>${view.cardinal ? `<span class="direction-clear-cardinal">${esc(view.cardinal)}</span>` : ""}${alias ? `<span class="direction-clear-road-alias">${esc(alias)}</span>` : ""}</div>`
            : (view.fallback ? `<div class="direction-clear-fallback">${esc(view.fallback)}</div>` : "");
          const noteParts = [view.note, ...entry.notes].filter(Boolean);
          const sourceLine = inferredDistance
            ? `<div class="direction-intel-source">Shared-road mileage · ${Number(intel?.shared_support_count || 0)} matching routes</div>`
            : (intel?.suspicious_distance ? `<div class="direction-intel-warning">Saved mileage needs a shared-road review</div>` : "");
          return `<li class="direction-pro-step direction-clear-step${intel?.same_road_continuation ? " direction-same-road" : ""}">
            <span class="direction-pro-number">${index + 1}</span>
            <div class="direction-pro-main direction-clear-card">
              ${meta}
              ${roadLine}
              ${noteParts.length ? `<div class="direction-clear-note">${esc(noteParts.join(" · "))}</div>` : ""}
              ${sourceLine}
            </div>
          </li>`;
        }).join("")}</ol>
      </section>`;
    };

    renderPad = async function directionRoadIntelRenderV1739(id) {
      try {
        await directionRoadIntelHydrateV1739(id);
      } catch (error) {
        console.warn("Direction road intelligence could not be loaded.", error);
      }
      return directionRoadIntelBaseRenderV1739(id);
    };
