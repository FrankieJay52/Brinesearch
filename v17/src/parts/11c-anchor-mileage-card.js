    /* V17.3.5 driver-safe road reference mileage.
       Only the hardened live public projection is loaded. Private staging,
       review notes, unavailable distances and conflicts never enter the browser.
       The mileage card intentionally has no offline cache: if the current safe
       snapshot cannot be fetched, the card stays hidden rather than risking a
       stale reference after a later route edit. */
    const PAD_ANCHOR_BY_DB_ID_V1735 = new Map();
    const PAD_ANCHOR_BY_LEGACY_ID_V1735 = new Map();

    function padAnchorMileageRememberV1735(rows) {
      PAD_ANCHOR_BY_DB_ID_V1735.clear();
      PAD_ANCHOR_BY_LEGACY_ID_V1735.clear();
      for (const row of Array.isArray(rows) ? rows : []) {
        if (!row || row.is_stale) continue;
        if (row.pad_id) PAD_ANCHOR_BY_DB_ID_V1735.set(String(row.pad_id), row);
        if (row.legacy_id) PAD_ANCHOR_BY_LEGACY_ID_V1735.set(String(row.legacy_id), row);
      }
    }

    async function padAnchorMileageLoadV1735() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const url = new URL(`${SUPABASE_URL}/rest/v1/public_pad_anchor_mileage`);
        url.searchParams.set("select", "pad_id,legacy_id,pad_name,company,anchor_label,distance_miles,distance_text,distance_kind,target_text,reference_point,source_label,distance_mode,is_stale,verified_at");
        url.searchParams.set("is_stale", "eq.false");
        url.searchParams.set("order", "company.asc,pad_name.asc");
        url.searchParams.set("limit", "1000");
        const response = await fetch(url.toString(), {
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Anchor mileage returned ${response.status}`);
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error("Unexpected anchor mileage response");
        padAnchorMileageRememberV1735(rows);
      } catch (error) {
        console.warn("Current road-reference mileage unavailable; hiding the mileage card for safety.", error);
        padAnchorMileageRememberV1735([]);
      } finally {
        clearTimeout(timer);
      }
    }

    await padAnchorMileageLoadV1735();

    function padAnchorMileageForPadV1735(p) {
      if (!p) return null;
      return PAD_ANCHOR_BY_DB_ID_V1735.get(String(p._dbId || ""))
        || PAD_ANCHOR_BY_LEGACY_ID_V1735.get(String(p._id || ""))
        || null;
    }

    function padAnchorMileageHtmlV1735(p) {
      const row = padAnchorMileageForPadV1735(p);
      if (!row || !normalize(row.anchor_label) || !normalize(row.distance_text)) return "";
      const ref = normalize(row.reference_point);
      const source = normalize(row.source_label) || "Verified route evidence";
      const kind = normalize(row.distance_kind).replace(/[^a-z0-9_-]/gi, "") || "saved";
      return `<section class="pad-anchor-mileage-card" id="padAnchorMileageCard" data-distance-kind="${esc(kind)}">
        <div class="pad-anchor-mileage-head">
          <div><span class="pad-anchor-mileage-kicker">✓ VERIFIED ROAD REFERENCE</span><h2>Closest Known Road</h2></div>
          <span class="pad-anchor-mileage-source">${esc(source)}</span>
        </div>
        <div class="pad-anchor-mileage-main">
          <div class="pad-anchor-mileage-road"><small>Reference road</small><strong>${esc(row.anchor_label)}</strong></div>
          <div class="pad-anchor-mileage-distance"><strong>${esc(row.distance_text)}</strong><span>${esc(row.target_text || "to pad/access")}</span></div>
        </div>
        ${ref ? `<div class="pad-anchor-mileage-reference"><small>Reference starts at</small><strong>${esc(ref)}</strong></div>` : ""}
        <p>This is a road-distance reference only. Keep using Clear Directions for the actual truck route.</p>
      </section>`;
    }

    const padAnchorMileageRenderBaseV1735 = renderPad;
    renderPad = function padAnchorMileageRenderV1735(id) {
      const result = padAnchorMileageRenderBaseV1735(id);
      const p = padById(id);
      if (!p || document.getElementById("padAnchorMileageCard")) return result;
      const html = padAnchorMileageHtmlV1735(p);
      if (!html) return result;
      const directions = document.querySelector(".compact-directions");
      if (directions) {
        directions.insertAdjacentHTML("beforebegin", html);
      } else {
        const official = document.getElementById("publicPadDataCard");
        const wells = document.querySelector(".compact-wells-section");
        const anchor = official || wells;
        if (anchor) anchor.insertAdjacentHTML("afterend", html);
      }
      return result;
    };
