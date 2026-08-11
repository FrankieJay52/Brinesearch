    /* Issue #89 — live pad editor reconnect.
       A transient public-directory startup failure must not permanently turn an
       online editor session into an offline-only pad. Re-hydrate the selected
       pad from the least-privilege public detail view, then let authenticated
       editor writes continue through the existing RPC/security bridge. */

    const issue89OpenLivePadEditorBase = openLivePadEditor;

    async function issue89HydrateLivePadForEdit(id) {
      const pad = padById(id);
      if (!pad) throw new Error("Pad record was not found.");
      if (!navigator.onLine) throw new Error("Your iPhone is offline.");

      const url = new URL(`${SUPABASE_URL}/rest/v1/public_pad_detail`);
      url.searchParams.set("select", "*");
      if (pad._dbId) url.searchParams.set("id", `eq.${pad._dbId}`);
      else url.searchParams.set("legacy_id", `eq.${pad._id}`);
      url.searchParams.set("limit", "1");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let response;
      try {
        response = await fetch(url.toString(), {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Accept: "application/json"
          },
          cache: "no-store",
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) throw new Error(`Live pad lookup returned ${response.status}.`);
      const rows = await response.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row?.id) throw new Error("The live database did not return this pad.");

      const mapped = mapSupabasePad(row);
      const liveClear = String(row.directions_clear ?? "").trim();
      Object.assign(pad, mapped, {
        originalWrittenDirections: mapped.writtenDirections || pad.originalWrittenDirections || null,
        directionsClear: liveClear || mapped.directionsClear || null,
        directionsClearMethod: liveClear ? (row.directions_clear_method || "Live Clear Directions") : mapped.directionsClearMethod,
        directionsClearUpdatedAt: liveClear ? (row.directions_clear_updated_at || row.updated_at || null) : mapped.directionsClearUpdatedAt,
        _public_summary: false,
        _issue89LiveEditHydrated: true
      });
      return pad;
    }

    openLivePadEditor = async function issue89OpenLivePadEditor(id, section = "all", clearerDraft = "") {
      const pad = padById(id);
      if (!pad) return;
      if (!requireEditorAccess()) return;

      if (!pad._dbId || DATA_SOURCE_LABEL !== "Live database") {
        try {
          await issue89HydrateLivePadForEdit(id);
        } catch (error) {
          console.warn("Live pad editor reconnect failed.", error);
          const message = error?.name === "AbortError"
            ? "Live database reconnect timed out. Try again."
            : (error?.message || "Live database connection is required to edit.");
          showToast(message);
          return;
        }
      }

      const hydrated = padById(id);
      if (!hydrated?._dbId) {
        showToast("Live database connection is required to edit.");
        return;
      }

      // The legacy editor guard checks the directory-wide startup label. A pad
      // that has just been re-hydrated is independently proven live, so satisfy
      // that guard only for this synchronous editor-open call without changing
      // the app's persistent directory-source status.
      const sourceLabel = DATA_SOURCE_LABEL;
      if (sourceLabel !== "Live database") DATA_SOURCE_LABEL = "Live database";
      try {
        return issue89OpenLivePadEditorBase(id, section, clearerDraft);
      } finally {
        DATA_SOURCE_LABEL = sourceLabel;
      }
    };
