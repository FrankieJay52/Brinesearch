    /* BrineSearch V17.3.2 — live Clear Directions are authoritative.
       Packaged direction rewrites are offline fallbacks only. Refresh the
       current public detail view before any pad page can render, and while the
       live database is available never let an older packaged route stand in
       for a pad whose live directions_clear is intentionally blank. */

    async function applyLiveClearDirectionsV1732() {
      if (DATA_SOURCE_LABEL !== "Live database") return 0;

      const rows = [];
      const limit = 1000;
      for (let offset = 0; ; offset += limit) {
        const url = new URL(`${SUPABASE_URL}/rest/v1/public_pad_detail`);
        url.searchParams.set("select", "id,legacy_id,directions_clear,directions_clear_method,directions_clear_updated_at");
        url.searchParams.set("directions_clear", "not.is.null");
        url.searchParams.set("order", "id.asc");
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(offset));

        const response = await fetch(url.toString(), {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            Accept: "application/json"
          },
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`Supabase Clear Directions returned ${response.status}`);

        const batch = await response.json();
        if (!Array.isArray(batch)) throw new Error("Unexpected Clear Directions response");
        rows.push(...batch);
        if (batch.length < limit) break;
      }

      const byKey = new Map();
      rows.forEach(row => {
        const liveText = String(row?.directions_clear ?? "").trim();
        if (!liveText) return;
        if (row.legacy_id) byKey.set(String(row.legacy_id), row);
        if (row.id) byKey.set(String(row.id), row);
      });

      let applied = 0;
      pads.forEach(pad => {
        const row = byKey.get(String(pad?._id ?? "")) || byKey.get(String(pad?._dbId ?? ""));
        if (!row) {
          pad.directionsClear = null;
          pad.directionsClearMethod = null;
          pad.directionsClearUpdatedAt = null;
          return;
        }
        pad.directionsClear = String(row.directions_clear).trim();
        pad.directionsClearMethod = row.directions_clear_method || "Live Clear Directions";
        pad.directionsClearUpdatedAt = row.directions_clear_updated_at || null;
        applied += 1;
      });

      window.__brineLiveClearDirectionsApplied = applied;
      window.__brineLiveClearDirectionsAuthoritative = true;
      return applied;
    }

    try {
      await applyLiveClearDirectionsV1732();
    } catch (error) {
      console.warn("Live Clear Directions refresh failed; keeping packaged offline directions.", error);
    }
