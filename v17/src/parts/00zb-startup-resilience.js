    /* BrineSearch V17.3.12 — startup resilience.
       Live Supabase and IndexedDB improve the directory, but neither is allowed
       to hold the driver UI on a loading screen. These later declarations are
       intentionally hoisted over the legacy implementations in 00-core-data.js. */

    async function fetchLivePads() {
      const load = async () => {
        const rows = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const url = new URL(`${SUPABASE_URL}/rest/v1/pads`);
          url.searchParams.set("select", "*");
          url.searchParams.set("order", "record_number.asc.nullslast,pad_name.asc");
          url.searchParams.set("limit", String(PAGE_SIZE));
          url.searchParams.set("offset", String(offset));

          const response = await fetchLiveDatabasePage(url.toString(), {
            headers: {
              apikey: SUPABASE_PUBLISHABLE_KEY,
              Accept: "application/json"
            },
            cache: "no-store"
          });
          if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
          const batch = await response.json();
          if (!Array.isArray(batch)) throw new Error("Unexpected Supabase response");
          rows.push(...batch);
          if (batch.length < PAGE_SIZE) break;
        }
        return rows;
      };

      let timer;
      try {
        return await Promise.race([
          load(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Live database startup deadline exceeded")), 1200);
          })
        ]);
      } finally {
        clearTimeout(timer);
      }
    }

    async function hydrateOfflineCacheFromIndexedDb() {
      const local = readOfflinePadCache();
      const hydrate = (async () => {
        const db = await openOfflineDb();
        try {
          const value = await new Promise((resolve, reject) => {
            const tx = db.transaction(OFFLINE_PAD_STORE, "readonly");
            const req = tx.objectStore(OFFLINE_PAD_STORE).get("all");
            req.onsuccess = () => resolve(req.result || {});
            req.onerror = () => reject(req.error);
          });
          if (value && Object.keys(value).length) {
            const merged = { ...value, ...local };
            try { localStorage.setItem(OFFLINE_PAD_CACHE_KEY, JSON.stringify(merged)); } catch {}
            return merged;
          }
          return local;
        } finally {
          try { db.close(); } catch {}
        }
      })();

      let timer;
      try {
        return await Promise.race([
          hydrate.catch(() => local),
          new Promise(resolve => {
            timer = setTimeout(() => resolve(local), 500);
          })
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
