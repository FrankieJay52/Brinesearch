    /* BrineSearch V17.3.12 — startup + saved-mileage resilience.
       Live Supabase and IndexedDB improve the directory, but neither is allowed
       to hold the driver UI on a loading screen. Packaged direction rewrites are
       also rejected when they introduce a mileage value that is not present in
       the saved source text. These later declarations are intentionally hoisted
       over the legacy implementations in 00-core-data.js. */

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

    function directionMileageTokensV17312(value) {
      const text = String(value ?? "");
      const regex = /(\d+\s*\/\s*\d+|[½¼¾]|\d+\.\d+|\.\d+|\d+)\s*\.?\s*(miles?|mile|mi\b|feet|foot|ft\b)/gi;
      const values = [];
      let match;
      while ((match = regex.exec(text))) {
        const raw = String(match[1] || "").replace(/\s+/g, "");
        const unit = String(match[2] || "").toLowerCase();
        let number = null;
        if (raw === "½") number = 0.5;
        else if (raw === "¼") number = 0.25;
        else if (raw === "¾") number = 0.75;
        else if (/^\d+\/\d+$/.test(raw)) {
          const [a,b] = raw.split("/").map(Number);
          if (b) number = a / b;
        } else if (raw.startsWith(".") && /^(?:feet|foot|ft)/i.test(unit)) {
          // Legacy workbook punctuation sometimes produced ".300ft" for 300 ft.
          number = Number(raw.slice(1));
        } else number = Number(raw);
        if (!Number.isFinite(number)) continue;
        values.push(/^(?:feet|foot|ft)/i.test(unit) ? number / 5280 : number);
      }
      return values;
    }

    function directionRewriteAddsMileageV17312(source, rewrite) {
      const sourceValues = directionMileageTokensV17312(source);
      const rewriteValues = directionMileageTokensV17312(rewrite);
      if (!rewriteValues.length) return false;
      return rewriteValues.some(value => !sourceValues.some(saved => Math.abs(saved - value) <= 0.00001));
    }

    function directionFusedRouteMileagePatternV17312() {
      return /\b((?:(?:I|US|OH|WV|PA|SR)-\d{1,4})|(?:(?:County|Township)\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*\d{1,4})|(?:(?:C\.?\s*R\.?|T\.?\s*R\.?|CR|TR|Co\.?\s*Rd\.?)\s*[- ]?\s*\d{1,4}))\.(\d+)(?=\s*\.?\s*(?:miles?|mile|mi)\b)/gi;
    }

    function directionSourceNeedsMileageRepairV17312(value) {
      const pattern = directionFusedRouteMileagePatternV17312();
      return pattern.test(String(value ?? ""));
    }

    function directionSavedMileageSourceV17312(value) {
      return String(value ?? "")
        // "OH-39.5 miles" / "Township Road 118.1 mile" are a route number
        // immediately followed by a legacy leading-decimal mileage.
        .replace(directionFusedRouteMileagePatternV17312(), (_, road, digits) => `${road} for 0.${digits}`)
        // ".5 miles", ".02 mile", ".75.MILES" are legacy decimal-mile forms.
        .replace(/(^|[^0-9])\.(\d+)(?=\s*\.?\s*(?:miles?|mile|mi)\b)/gi, (_, prefix, digits) => `${prefix}0.${digits}`)
        // ".300ft" is punctuation followed by 300 ft, not three-tenths of a foot.
        .replace(/(^|[^0-9])\.(\d+)(?=\s*(?:feet|foot|ft)\b)/gi, (_, prefix, digits) => `${prefix}${digits}`);
    }

    function verifiedDirectionFor(id, source) {
      const entry = VERIFIED_DIRECTION_REWRITES[String(id || "")];
      const current = String(source ?? "").trim();
      if (!entry || String(entry.s ?? "").trim() !== current) return "";
      const rewrite = String(entry.r ?? "");
      const sourceNeedsRepair = directionSourceNeedsMileageRepairV17312(current);
      if (!sourceNeedsRepair && !directionRewriteAddsMileageV17312(current, rewrite)) return rewrite;

      const safeSource = directionSavedMileageSourceV17312(current);
      const record = Array.isArray(DB?.pads) ? DB.pads.find(row => String(row?._id || "") === String(id || "")) : null;
      const regenerated = smartRewriteDirections(safeSource, record?.Structured_Road_Sequence || "");
      if (regenerated && !directionRewriteAddsMileageV17312(safeSource, regenerated)) return regenerated;

      console.warn("Rejected direction rewrite because saved mileage could not be preserved", id);
      return "";
    }
