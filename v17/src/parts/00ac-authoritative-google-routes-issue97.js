    /* GitHub #97 — load the narrow public route-manifest projection. Missing,
       stale, held or malformed receipts never become authoritative directions. */

    async function applyAuthoritativeGoogleRoutesIssue97() {
      if (DATA_SOURCE_LABEL !== "Live database") return 0;
      const rows = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const url = new URL(`${SUPABASE_URL}/rest/v1/brinesearch_driver_google_routes_public`);
        url.searchParams.set("select", "pad_id,legacy_id,route_revision,source_revision,manifest");
        url.searchParams.set("order", "pad_id.asc");
        url.searchParams.set("limit", String(PAGE_SIZE));
        url.searchParams.set("offset", String(offset));
        const response = await fetchLiveDatabasePage(url.toString(), {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            Accept: "application/json"
          },
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`Authoritative Google routes returned ${response.status}`);
        const batch = await response.json();
        if (!Array.isArray(batch)) throw new Error("Unexpected authoritative Google route response");
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }

      const byKey = new Map();
      for (const row of rows) {
        try {
          const plan = BrinesearchGoogleRouteIssue97.buildPublicPlan(row);
          const receipt = { ...row, plan };
          if (row.legacy_id) byKey.set(String(row.legacy_id), receipt);
          if (row.pad_id) byKey.set(String(row.pad_id), receipt);
        } catch (error) {
          console.warn("Held malformed Google route manifest.", row?.pad_id || row?.legacy_id, error);
        }
      }

      let applied = 0;
      for (const pad of pads || []) {
        const receipt = byKey.get(String(pad?._id ?? "")) || byKey.get(String(pad?._dbId ?? ""));
        pad.googleMapsRouteManifestIssue97 = receipt?.manifest || null;
        pad.googleMapsRoutePlanIssue97 = receipt?.plan || null;
        if (receipt?.plan?.first_url) applied += 1;
      }
      globalThis.__brineAuthoritativeGoogleRoutesAppliedIssue97 = applied;
      globalThis.__brineAuthoritativeGoogleRoutesFailedIssue97 = false;
      return applied;
    }

    if (DATA_SOURCE_LABEL === "Live database") {
      try {
        await applyAuthoritativeGoogleRoutesIssue97();
      } catch (error) {
        console.warn("Authoritative Google routes are unavailable; exact pad pins remain available.", error);
        globalThis.__brineAuthoritativeGoogleRoutesAppliedIssue97 = 0;
        globalThis.__brineAuthoritativeGoogleRoutesFailedIssue97 = true;
      }
    }
