    /* GitHub #74 — existing-pad writes must cross one server-enforced boundary.
       Keep the existing editor form/validation UI, but replace its legacy direct
       PATCH /pads request with the allow-listed editor_update_pad RPC. The RPC
       compares the row revision under lock before updating, so an older editor
       form cannot silently overwrite a newer save. */
    const editorRequestRevisionBaseIssue74 = editorRequest;

    function editorRevisionConflictMessageIssue74() {
      return "This pad changed after you opened it. Close the editor, reload the pad, and apply your change again so newer work is not overwritten.";
    }

    editorRequest = async function editorRequestRevisionBoundaryIssue74(path, options = {}, retry = true) {
      const method = String(options?.method || "GET").toUpperCase();
      if (method !== "PATCH" || !/^\/rest\/v1\/pads(?:\?|$)/.test(String(path || ""))) {
        return editorRequestRevisionBaseIssue74(path, options, retry);
      }

      const requestUrl = new URL(String(path), "https://brinesearch.invalid");
      const idFilter = requestUrl.searchParams.get("id") || "";
      const match = /^eq\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(idFilter);
      if (!match) throw new Error("BrineSearch blocked an unsafe pad update request.");

      const padId = match[1];
      const pad = pads.find(row => String(row?._dbId || "").toLowerCase() === padId.toLowerCase());
      const expectedUpdatedAt = pad?.updatedAt || pad?.updated_at || null;
      if (!expectedUpdatedAt) {
        throw new Error("Reload this pad before saving so BrineSearch can verify that you are editing the latest revision.");
      }

      let patch;
      try { patch = JSON.parse(String(options?.body || "{}")); }
      catch { throw new Error("BrineSearch blocked a malformed pad update."); }
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new Error("BrineSearch blocked a malformed pad update.");
      }

      // The server derives this provenance value itself. It is deliberately not
      // accepted from a browser payload even though the legacy client supplied it.
      delete patch.directions_clear_method;

      try {
        return await editorRequestRevisionBaseIssue74("/rest/v1/rpc/editor_update_pad", {
          method: "POST",
          body: JSON.stringify({
            p_pad_id: padId,
            p_expected_updated_at: expectedUpdatedAt,
            p_patch: patch
          })
        }, retry);
      } catch (error) {
        const message = String(error?.message || error || "");
        if (/stale_revision|serialization|40001/i.test(message)) {
          throw new Error(editorRevisionConflictMessageIssue74());
        }
        throw error;
      }
    };
