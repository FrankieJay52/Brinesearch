    /* BrineSearch V17.3.30 — authoritative driver directions.
       Live driver cards come from one narrow, sanitized public database contract.
       Packaged rewrites remain an offline-only fallback. If the live directory is
       reachable but this authoritative direction refresh fails, do not keep stale
       packaged cards on screen. */

    const mapSupabasePadBeforeAuthoritativeDirectionsV17330 = mapSupabasePad;
    mapSupabasePad = function mapSupabasePadAuthoritativeDirectionsV17330(row) {
      const mapped = mapSupabasePadBeforeAuthoritativeDirectionsV17330(row);
      if (row && Object.prototype.hasOwnProperty.call(row, "directions_clear")) {
        const live = String(row.directions_clear ?? "").trim();
        mapped.directionsClear = live || null;
        mapped.directionsClearMethod = live ? "Live authoritative driver directions" : null;
        mapped.directionsClearUpdatedAt = row.directions_clear_updated_at || row.updated_at || null;
      }
      return mapped;
    };

    async function directionAuthoritativeRequestV17330(url) {
      let firstError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetchLiveDatabasePage(url, {
            headers: {
              apikey: SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
              Accept: "application/json"
            },
            cache: "no-store"
          });
          if (response.ok) return response;
          firstError ||= new Error(`Authoritative directions returned ${response.status}`);
        } catch (error) {
          firstError ||= error;
        }
      }
      throw firstError || new Error("Authoritative directions unavailable");
    }

    function directionInvalidateLiveFallbackV17330() {
      for (const pad of pads || []) {
        pad.directionsClear = null;
        pad.directionsClearMethod = null;
        pad.directionsClearUpdatedAt = null;
      }
      window.__brineAuthoritativeDirectionsAppliedV17330 = 0;
      window.__brineAuthoritativeDirectionsFailedV17330 = true;
    }

    async function applyAuthoritativeDriverDirectionsV17330() {
      if (DATA_SOURCE_LABEL !== "Live database") return 0;

      const rows = [];
      const limit = 1000;
      for (let offset = 0; ; offset += limit) {
        const url = new URL(`${SUPABASE_URL}/rest/v1/brinesearch_driver_directions_public`);
        url.searchParams.set("select", "pad_id,legacy_id,directions_clear,source_revision");
        url.searchParams.set("order", "pad_id.asc");
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(offset));

        const response = await directionAuthoritativeRequestV17330(url.toString());
        const batch = await response.json();
        if (!Array.isArray(batch)) throw new Error("Unexpected authoritative directions response");
        rows.push(...batch);
        if (batch.length < limit) break;
      }

      const byKey = new Map();
      for (const row of rows) {
        const liveText = String(row?.directions_clear ?? "").trim();
        if (!liveText) continue;
        if (row.legacy_id) byKey.set(String(row.legacy_id), row);
        if (row.pad_id) byKey.set(String(row.pad_id), row);
      }

      let applied = 0;
      for (const pad of pads || []) {
        const row = byKey.get(String(pad?._id ?? "")) || byKey.get(String(pad?._dbId ?? ""));
        if (!row) {
          // Live truth says there is no verified Clear Directions row. Do not let
          // a packaged rewrite resurrect an older card set for this pad.
          pad.directionsClear = null;
          pad.directionsClearMethod = null;
          pad.directionsClearUpdatedAt = null;
          continue;
        }
        pad.directionsClear = String(row.directions_clear).trim();
        pad.directionsClearMethod = "Live authoritative driver directions";
        pad.directionsClearUpdatedAt = row.source_revision || null;
        applied += 1;
      }

      window.__brineAuthoritativeDirectionsAppliedV17330 = applied;
      window.__brineAuthoritativeDirectionsFailedV17330 = false;
      window.__brineLiveClearDirectionsAuthoritative = true;
      return applied;
    }

    if (DATA_SOURCE_LABEL === "Live database") {
      try {
        await applyAuthoritativeDriverDirectionsV17330();
      } catch (error) {
        console.warn("Authoritative driver directions could not be refreshed; stale packaged cards were invalidated.", error);
        directionInvalidateLiveFallbackV17330();
      }
    }
