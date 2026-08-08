    /* Search results use the safe summary view. Load the selected pad's safe
       public details only when the driver opens that pad page. Live Supabase
       directions_clear always overrides packaged/offline direction rewrites. */
    const securityPadDetailRequestsV174 = new Map();
    const securityRenderPadBaseV174 = renderPad;

    async function securityHydratePublicPadDetailV174(id) {
      const pad = padById(id);
      if (!pad || !pad._public_summary || DATA_SOURCE_LABEL !== "Live database") return pad;
      if (!navigator.onLine) {
        const cached = offlineCachedRecord(id);
        if (cached) Object.assign(pad, cached);
        return pad;
      }
      if (securityPadDetailRequestsV174.has(id)) return securityPadDetailRequestsV174.get(id);

      const request = (async () => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/public_pad_detail`);
        url.searchParams.set("select", "*");
        if (pad._dbId) url.searchParams.set("id", `eq.${pad._dbId}`);
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
        if (!response.ok) throw new Error(`Pad details returned ${response.status}`);
        const rows = await response.json();
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) throw new Error("Pad details were not found");
        const mapped = mapSupabasePad(row);
        const liveClear = String(row.directions_clear ?? "").trim();
        Object.assign(pad, mapped, {
          originalWrittenDirections: mapped.writtenDirections || pad.originalWrittenDirections || null,
          directionsClear: liveClear || null,
          directionsClearMethod: liveClear ? (row.directions_clear_method || "Live Clear Directions") : null,
          directionsClearUpdatedAt: liveClear ? (row.directions_clear_updated_at || null) : null,
          _public_summary: false
        });
        return pad;
      })().finally(() => securityPadDetailRequestsV174.delete(id));

      securityPadDetailRequestsV174.set(id, request);
      return request;
    }

    renderPad = async function securityRenderPadV174(id) {
      try {
        await securityHydratePublicPadDetailV174(id);
      } catch (error) {
        console.warn("Safe public pad detail could not be loaded; showing available summary data.", error);
      }
      return securityRenderPadBaseV174(id);
    };
