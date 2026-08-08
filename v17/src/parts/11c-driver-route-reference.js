    /* V17.3.5 driver approach reference.
       This uses only the safe finalized public route-reference table. Private
       research candidates and straight-line-only references never surface as
       driving instructions. */
    const driverRouteReferenceBaseV1735 = renderPad;
    const driverRouteReferenceRequestsV1735 = new Map();

    async function driverRouteReferenceHydrateV1735(id) {
      const pad = padById(id);
      if (!pad) return null;
      if (pad.__driverRouteReferenceLoadedV1735) return pad.driverRouteReference || null;
      if (pad.driverRouteReference && !navigator.onLine) return pad.driverRouteReference;
      if (DATA_SOURCE_LABEL !== "Live database" || !navigator.onLine) return pad.driverRouteReference || null;
      if (driverRouteReferenceRequestsV1735.has(id)) return driverRouteReferenceRequestsV1735.get(id);

      const request = (async () => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/brinesearch_driver_route_reference`);
        url.searchParams.set("select", "pad_id,legacy_id,anchor_name,anchor_kind,distance_miles,display_distance,status,distance_mode,reference_point,source_label,source_version,updated_at");
        if (pad._dbId) url.searchParams.set("pad_id", `eq.${pad._dbId}`);
        else url.searchParams.set("legacy_id", `eq.${pad._id}`);
        url.searchParams.set("limit", "1");
        const response = await fetch(url.toString(), {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            Accept: "application/json"
          },
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`Driver route reference returned ${response.status}`);
        const rows = await response.json();
        const row = Array.isArray(rows) ? rows[0] : null;
        pad.driverRouteReference = row || null;
        pad.__driverRouteReferenceLoadedV1735 = true;
        return pad.driverRouteReference;
      })().finally(() => driverRouteReferenceRequestsV1735.delete(id));

      driverRouteReferenceRequestsV1735.set(id, request);
      return request;
    }

    function driverRouteReferenceToneV1735(status) {
      if (["verified_distance","verified_approximate","verified_range","direct_on_anchor","located_on_anchor","route_marker"].includes(status)) return "ready";
      if (status === "blocked_conflict") return "blocked";
      return "pending";
    }

    function driverRouteReferenceLabelV1735(status) {
      if (status === "verified_distance") return "VERIFIED ROAD MILEAGE";
      if (status === "verified_approximate") return "SAVED APPROX. MILEAGE";
      if (status === "verified_range") return "SAVED MILEAGE RANGE";
      if (status === "located_on_anchor") return "PAD ON VERIFIED ROAD";
      if (status === "route_marker") return "VERIFIED ROUTE MARKER";
      if (status === "direct_on_anchor") return "DIRECT ROAD REFERENCE";
      if (status === "blocked_conflict") return "ROUTE CONFLICT";
      return "ROUTE REFERENCE";
    }

    function driverRouteReferenceHtmlV1735(ref) {
      if (!ref) return "";
      const status = normalize(ref.status);
      const tone = driverRouteReferenceToneV1735(status);
      const anchor = normalize(ref.anchor_name);
      const distance = normalize(ref.display_distance) || "Mileage not verified";
      const referencePoint = normalize(ref.reference_point);
      const source = normalize(ref.source_label);
      const canDriveFromAnchor = Boolean(anchor) && !["research_only","no_route_evidence","blocked_conflict"].includes(status);
      const title = status === "blocked_conflict"
        ? "Do Not Use This Route Yet"
        : (canDriveFromAnchor ? "Approach Reference" : "Approach Reference Pending");
      const statusMessage = status === "research_only"
        ? "A nearby highway was found for research, but BrineSearch has not proven a usable truck connection to this pad."
        : status === "no_route_evidence"
          ? "There is not enough saved route evidence to publish a driving reference for this pad."
          : status === "blocked_conflict"
            ? "Saved route or location evidence conflicts. BrineSearch is withholding a driving reference instead of guessing."
            : status === "distance_unavailable"
              ? "The road reference is usable, but the remaining road mileage is not verified."
              : "Distance is measured or preserved from the saved haul route; it does not replace the turn-by-turn directions below.";

      return `<section class="driver-route-reference-card driver-route-reference-${esc(tone)}" id="driverRouteReferenceCard">
        <div class="driver-route-reference-head">
          <div><span>${esc(driverRouteReferenceLabelV1735(status))}</span><h2>${esc(title)}</h2></div>
          <span class="driver-route-reference-state">${tone === "ready" ? "✓" : tone === "blocked" ? "!" : "?"}</span>
        </div>
        ${canDriveFromAnchor ? `<div class="driver-route-reference-main">
          <div class="driver-route-reference-anchor"><small>FROM</small><strong>${esc(anchor)}</strong></div>
          <div class="driver-route-reference-distance"><strong>${esc(distance)}</strong><small>${status === "located_on_anchor" || status === "route_marker" || status === "direct_on_anchor" ? "PAD / ACCESS REFERENCE" : "TO PAD / ACCESS"}</small></div>
        </div>` : `<div class="driver-route-reference-message"><strong>${esc(distance)}</strong></div>`}
        ${referencePoint && canDriveFromAnchor ? `<div class="driver-route-reference-point"><small>Reference point</small><strong>${esc(referencePoint)}</strong></div>` : ""}
        <p>${esc(statusMessage)}</p>
        ${source ? `<div class="driver-route-reference-source"><small>Basis</small><span>${esc(source)}</span></div>` : ""}
      </section>`;
    }

    renderPad = async function driverRouteReferenceRenderV1735(id) {
      try {
        await driverRouteReferenceHydrateV1735(id);
      } catch (error) {
        console.warn("Driver route reference could not be loaded.", error);
      }
      const result = await driverRouteReferenceBaseV1735(id);
      const pad = padById(id);
      document.getElementById("driverRouteReferenceCard")?.remove();
      const html = driverRouteReferenceHtmlV1735(pad?.driverRouteReference);
      if (!html) return result;
      const directions = document.querySelector(".compact-directions");
      const publicData = document.getElementById("publicPadDataCard");
      const target = directions || publicData;
      if (target) target.insertAdjacentHTML("beforebegin", html);
      return result;
    };
