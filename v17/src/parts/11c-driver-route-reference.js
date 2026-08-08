    /* V17.3.6 driver approach intelligence.
       Only finalized safe route-reference fields are loaded in the browser.
       Research-only nearest-road candidates remain private and stale mileage is
       hidden if the underlying saved route changes after review. */
    const driverRouteReferenceBaseV1736 = renderPad;
    const driverRouteReferenceRequestsV1736 = new Map();

    async function driverRouteReferenceHydrateV1736(id) {
      const pad = padById(id);
      if (!pad) return null;
      if (pad.__driverRouteReferenceLoadedV1736) return pad.driverRouteReference || null;
      if (pad.driverRouteReference && !navigator.onLine) return pad.driverRouteReference;
      if (DATA_SOURCE_LABEL !== "Live database" || !navigator.onLine) return pad.driverRouteReference || null;
      if (driverRouteReferenceRequestsV1736.has(id)) return driverRouteReferenceRequestsV1736.get(id);

      const request = (async () => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/brinesearch_driver_route_reference`);
        url.searchParams.set("select", "pad_id,legacy_id,anchor_name,anchor_kind,distance_miles,display_distance,status,distance_mode,reference_point,source_label,source_version,route_hash,is_stale,updated_at");
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
        pad.__driverRouteReferenceLoadedV1736 = true;
        return pad.driverRouteReference;
      })().finally(() => driverRouteReferenceRequestsV1736.delete(id));

      driverRouteReferenceRequestsV1736.set(id, request);
      return request;
    }

    function driverRouteReferenceDateV1736(value) {
      const raw = normalize(value);
      if (!raw) return "";
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
    }

    function driverRouteReferenceRoadTypeV1736(kind) {
      const labels = {
        interstate: "Interstate",
        us_route: "U.S. Route",
        state_route: "State Route",
        signed_highway: "Signed Highway",
        county_road: "County Road",
        township_road: "Township Road",
        verified_named_road: "Verified Public Road",
        local_public_road: "Local Public Road",
        local_road: "Local Public Road"
      };
      return labels[normalize(kind).toLowerCase()] || (normalize(kind) ? normalize(kind).replace(/_/g," ").replace(/\b\w/g, ch => ch.toUpperCase()) : "Verified road");
    }

    function driverRouteReferenceDistanceMeaningV1736(ref) {
      const status = normalize(ref?.status).toLowerCase();
      const mode = normalize(ref?.distance_mode).toLowerCase();
      if (status === "distance_unavailable" || mode === "known_anchor_mileage_unavailable") return "Known approach road; remaining mileage is not verified";
      if (status === "direct_on_anchor") return "Access turns directly off this road";
      if (status === "located_on_anchor") return "Pad / access is located on this road";
      if (status === "route_marker") return "Saved route-marker reference";
      const meanings = {
        road_miles_from_explicit_reference_point_to_pad_or_access: "From the start point below to pad / access",
        from_anchor_entry_to_pad_or_access: "From where the route enters this road to pad / access",
        from_saved_anchor_reference_point_to_pad_or_access: "From the saved start point to pad / access",
        from_anchor_turn_to_pad_or_access: "From the turn onto this road to pad / access",
        from_named_point_on_anchor_or_anchor_departure_to_pad_or_access: "From the named start point to pad / access",
        road_miles_to_lease_or_access_entrance: "Road miles to the lease / access entrance",
        along_anchor_to_access: "Travel on this road to the access",
        along_anchor_to_pad: "Travel on this road to the pad",
        along_anchor_to_lease_entrance: "Travel on this road to the lease entrance",
        along_anchor_then_local: "From this road through the saved local-road section",
        after_leaving_anchor: "Mileage after leaving this road",
        after_leaving_anchor_to_access: "After leaving this road to the access",
        after_leaving_anchor_to_pad: "After leaving this road to the pad",
        after_leaving_anchor_to_lease_entrance: "After leaving this road to the lease entrance",
        full_public_road_segment_to_destination_access: "Full verified public-road segment to the access",
        full_public_road_segment_to_end_of_road_access: "Full verified public road to the road-end access",
        public_road_junction_to_road_end_access: "From the verified public-road junction to road-end access",
        public_road_junction_to_road_end_destination: "From the verified public-road junction to destination",
        qualified_road_distance_to_pad: "Saved field wording to the pad",
        directly_off_selected_anchor: "Access turns directly off this road",
        direct_access_no_numeric_mileage: "Access turns directly off this road",
        direct_turn_from_anchor_no_numeric_mileage_needed: "Access turns directly off this road",
        located_on_anchor: "Pad / access is located on this road",
        route_mile_marker_reference: "Saved mile-marker reference",
        from_anchor_entry_to_pad_or_access_range: "Saved mileage range from this road to pad / access"
      };
      return meanings[mode] || "Reviewed road reference to pad / access";
    }

    function driverRouteReferenceToneV1736(ref) {
      if (ref?.is_stale) return "blocked";
      const status = normalize(ref?.status).toLowerCase();
      if (["verified_distance","verified_approximate","verified_range","direct_on_anchor","located_on_anchor","route_marker"].includes(status)) return "ready";
      if (status === "blocked_conflict") return "blocked";
      return "pending";
    }

    function driverRouteReferenceLabelV1736(ref) {
      if (ref?.is_stale) return "ROUTE REFERENCE OUTDATED";
      const status = normalize(ref?.status).toLowerCase();
      const source = normalize(ref?.source_label).toLowerCase();
      const hasNumericDistance = ref?.distance_miles !== null && ref?.distance_miles !== undefined && normalize(ref.distance_miles) !== "";
      if (status === "verified_distance") return "VERIFIED ROAD MILEAGE";
      if (status === "verified_approximate") return hasNumericDistance ? "SAVED APPROX. MILEAGE" : "SAVED QUALIFIED MILEAGE";
      if (status === "verified_range") return "SAVED MILEAGE RANGE";
      if (status === "located_on_anchor") return "PAD ON VERIFIED ROAD";
      if (status === "route_marker") return "VERIFIED ROUTE MARKER";
      if (status === "direct_on_anchor") return "DIRECT ROAD REFERENCE";
      if (status === "distance_unavailable" && /conflict|ambiguous/.test(source)) return "MILEAGE NEEDS REVIEW";
      if (status === "distance_unavailable" && normalize(ref?.anchor_name)) return "KNOWN APPROACH ROAD";
      if (status === "blocked_conflict") return "ROUTE CONFLICT";
      if (status === "no_route_evidence") return "NO VERIFIED ROUTE";
      if (status === "research_only") return "RESEARCH REFERENCE ONLY";
      return "ROUTE REFERENCE";
    }

    function driverRouteReferenceMessageV1736(ref) {
      if (ref?.is_stale) return "The saved route changed after this reference was reviewed. BrineSearch is hiding the old mileage until the reference is refreshed.";
      const status = normalize(ref?.status).toLowerCase();
      const source = normalize(ref?.source_label).toLowerCase();
      if (status === "research_only") return "A nearby highway was found for research, but BrineSearch has not proven a usable truck connection to this pad.";
      if (status === "no_route_evidence") return "There is not enough saved route evidence to publish a driving reference for this pad.";
      if (status === "blocked_conflict") return "Saved route or location evidence conflicts. BrineSearch is withholding a driving reference instead of guessing.";
      if (status === "distance_unavailable" && /conflict/.test(source)) return "Saved mileage sources conflict. No number is published until the conflict is resolved.";
      if (status === "distance_unavailable" && /ambiguous/.test(source)) return "The saved mileage source is ambiguous. No number is published until it can be tied to the correct road segment.";
      if (status === "distance_unavailable" && normalize(ref?.anchor_name)) return "This approach road is supported by the reviewed route, but the remaining road mileage to the pad or access is not verified.";
      if (status === "distance_unavailable") return "The route was reviewed, but BrineSearch cannot publish a safe road-mileage reference from the available evidence.";
      if (status === "verified_range") return "The saved driver directions give a range, so BrineSearch preserves the range instead of inventing a midpoint.";
      if (status === "verified_approximate" && (ref?.distance_miles === null || ref?.distance_miles === undefined)) return "The original driver wording is preserved exactly because it gives a qualified distance rather than an exact number.";
      if (status === "verified_approximate") return "The mileage is approximate in the reviewed source and is labeled that way instead of being presented as exact.";
      if (status === "direct_on_anchor") return "The saved route places the pad or access directly off this verified road; no numeric distance is invented.";
      if (status === "located_on_anchor") return "The pad or access is located on this verified public road.";
      if (status === "route_marker") return "This is a saved, verified route marker rather than a generated mileage estimate.";
      return "Distance is preserved from the reviewed haul route or verified road geometry; use the Clear Directions below for the actual turns.";
    }

    function driverRouteReferenceHtmlV1736(ref) {
      if (!ref) return "";
      const status = normalize(ref.status).toLowerCase();
      const stale = Boolean(ref.is_stale);
      const tone = driverRouteReferenceToneV1736(ref);
      const anchor = normalize(ref.anchor_name);
      const distance = normalize(ref.display_distance) || "Mileage not verified";
      const referencePoint = normalize(ref.reference_point);
      const source = normalize(ref.source_label);
      const updated = driverRouteReferenceDateV1736(ref.updated_at);
      const roadType = anchor ? driverRouteReferenceRoadTypeV1736(ref.anchor_kind) : "";
      const meaning = anchor ? driverRouteReferenceDistanceMeaningV1736(ref) : "";
      const canShowAnchor = Boolean(anchor) && !stale && !["research_only","no_route_evidence","blocked_conflict"].includes(status);
      const title = stale
        ? "Route Changed — Reference Needs Refresh"
        : status === "blocked_conflict"
          ? "Do Not Use This Reference Yet"
          : status === "distance_unavailable" && canShowAnchor
            ? "Known Approach Road"
            : (canShowAnchor ? "Approach Reference" : "Approach Reference Pending");
      const stateMark = tone === "ready" ? "✓" : tone === "blocked" ? "!" : "?";
      const distanceCaption = status === "distance_unavailable"
        ? "MILEAGE NOT VERIFIED"
        : status === "located_on_anchor"
          ? "PAD / ACCESS IS HERE"
          : status === "route_marker"
            ? "ROUTE MARKER"
            : status === "direct_on_anchor"
              ? "PAD / ACCESS REFERENCE"
              : "TO PAD / ACCESS";

      return `<section class="driver-route-reference-card driver-route-reference-${esc(tone)}" id="driverRouteReferenceCard">
        <div class="driver-route-reference-head">
          <div><span>${esc(driverRouteReferenceLabelV1736(ref))}</span><h2>${esc(title)}</h2></div>
          <span class="driver-route-reference-state">${stateMark}</span>
        </div>
        ${canShowAnchor ? `<div class="driver-route-reference-main">
          <div class="driver-route-reference-anchor"><small>FROM</small><strong>${esc(anchor)}</strong></div>
          <div class="driver-route-reference-distance"><strong>${esc(distance)}</strong><small>${esc(distanceCaption)}</small></div>
        </div>
        <div class="driver-route-reference-meta">
          <div><small>ROAD TYPE</small><strong>${esc(roadType)}</strong></div>
          <div><small>DISTANCE MEANS</small><strong>${esc(meaning)}</strong></div>
        </div>` : `<div class="driver-route-reference-message"><strong>${esc(stale ? "Reference needs refresh" : distance)}</strong></div>`}
        ${referencePoint && canShowAnchor ? `<div class="driver-route-reference-point"><small>START / REFERENCE POINT</small><strong>${esc(referencePoint)}</strong></div>` : ""}
        <p>${esc(driverRouteReferenceMessageV1736(ref))}</p>
        ${(source || updated) ? `<div class="driver-route-reference-source">
          ${source ? `<span><small>BASIS</small><strong>${esc(source)}</strong></span>` : ""}
          ${updated ? `<span><small>REFERENCE UPDATED</small><strong>${esc(updated)}</strong></span>` : ""}
        </div>` : ""}
      </section>`;
    }

    renderPad = async function driverRouteReferenceRenderV1736(id) {
      try {
        await driverRouteReferenceHydrateV1736(id);
      } catch (error) {
        console.warn("Driver route reference could not be loaded.", error);
      }
      const result = await driverRouteReferenceBaseV1736(id);
      const pad = padById(id);
      document.getElementById("driverRouteReferenceCard")?.remove();
      const html = driverRouteReferenceHtmlV1736(pad?.driverRouteReference);
      if (!html) return result;
      const directions = document.querySelector(".compact-directions");
      const publicData = document.getElementById("publicPadDataCard");
      const target = directions || publicData;
      if (target) target.insertAdjacentHTML("beforebegin", html);
      return result;
    };
