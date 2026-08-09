    (function installPadHeaderDataGuardV17312() {
      if (typeof renderFieldPadHeader !== "function") return;

      const originalRenderFieldPadHeader = renderFieldPadHeader;

      function normalizePadHeaderState(value) {
        const raw = String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
        if (raw === "OH" || raw === "OHIO") return "Ohio";
        if (raw === "WV" || raw === "WEST VIRGINIA") return "West Virginia";
        if (raw === "PA" || raw === "PENNSYLVANIA") return "Pennsylvania";
        return "";
      }

      function safePadHeaderGeo(value, maxLength) {
        const raw = String(value || "").replace(/\s+/g, " ").trim();
        if (!raw || raw.length > maxLength) return "";
        if ((raw.match(/-/g) || []).length > 6) return "";
        if ((raw.match(/[|;]/g) || []).length > 2) return "";
        if (raw.split(/\s+/).filter(Boolean).length > 10) return "";
        return raw;
      }

      function officialHeaderGeo(pad, key, maxLength) {
        const official = pad?.official_pad_record && typeof pad.official_pad_record === "object"
          ? pad.official_pad_record
          : null;
        return safePadHeaderGeo(official?.[key], maxLength);
      }

      renderFieldPadHeader = function guardedFieldPadHeader(pad, fieldReference) {
        const source = pad || {};
        const county = safePadHeaderGeo(source.county, 60)
          || officialHeaderGeo(source, "county", 60);
        const township = safePadHeaderGeo(source.township, 80)
          || officialHeaderGeo(source, "township", 80);
        const state = normalizePadHeaderState(source.state)
          || normalizePadHeaderState(source?.official_pad_record?.state);

        return originalRenderFieldPadHeader({
          ...source,
          county,
          township,
          state
        }, fieldReference);
      };

      window.padHeaderDataGuardV17312 = true;
    })();
