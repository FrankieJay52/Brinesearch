
    // Remove the outdated Independent platform provenance card from the public Data Sources page.
    // Also force every BrineSearch email action to the owner's inbox while preserving subject/body text.
    // Keep this after 15-settings-road-tools.js so the router uses the cleaned renderers.
    const BRINESEARCH_CONTACT_EMAIL_V17311 = "Frankjhaller@gmail.com";

    function brineSearchOwnerMailtoV17311(value) {
      const raw = String(value || "").trim();
      if (!/^mailto:/i.test(raw)) return raw;
      const queryIndex = raw.indexOf("?");
      const params = new URLSearchParams(queryIndex >= 0 ? raw.slice(queryIndex + 1) : "");
      params.delete("to");
      params.delete("cc");
      params.delete("bcc");
      const query = params.toString();
      return `mailto:${BRINESEARCH_CONTACT_EMAIL_V17311}${query ? `?${query}` : ""}`;
    }

    function brineSearchRouteEmailActionsV17311(root = document) {
      root?.querySelectorAll?.('[href^="mailto:"],[action^="mailto:"]').forEach(node => {
        if (node.hasAttribute("href")) {
          const current = node.getAttribute("href") || "";
          const next = brineSearchOwnerMailtoV17311(current);
          if (next && next !== current) node.setAttribute("href", next);
        }
        if (node.hasAttribute("action")) {
          const current = node.getAttribute("action") || "";
          const next = brineSearchOwnerMailtoV17311(current);
          if (next && next !== current) node.setAttribute("action", next);
        }
      });
    }

    const renderDataSourcesSettingsBeforeProvenanceCleanup = renderDataSourcesSettings;
    renderDataSourcesSettings = function renderDataSourcesSettings() {
      renderDataSourcesSettingsBeforeProvenanceCleanup();
      app?.querySelectorAll?.(".provenance-card").forEach(card => {
        if (card.querySelector("h2")?.textContent?.trim() === "Independent platform") card.remove();
      });
      brineSearchRouteEmailActionsV17311(app);
    };

    const renderCopyrightSettingsBeforeEmailCleanup = renderCopyrightSettings;
    renderCopyrightSettings = function renderCopyrightSettings() {
      renderCopyrightSettingsBeforeEmailCleanup();
      brineSearchRouteEmailActionsV17311(app);
    };

    document.addEventListener("click", event => {
      const anchor = event.target?.closest?.('a[href^="mailto:"]');
      if (!anchor) return;
      const current = anchor.getAttribute("href") || "";
      const next = brineSearchOwnerMailtoV17311(current);
      if (next && next !== current) anchor.setAttribute("href", next);
    }, true);

    if (document.documentElement && typeof MutationObserver !== "undefined") {
      const brineSearchEmailObserverV17311 = new MutationObserver(records => {
        for (const record of records) {
          if (record.type === "attributes") brineSearchRouteEmailActionsV17311(record.target?.parentElement || document);
          for (const node of record.addedNodes || []) {
            if (node?.nodeType === 1) brineSearchRouteEmailActionsV17311(node);
          }
        }
      });
      brineSearchEmailObserverV17311.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["href", "action"]
      });
      brineSearchRouteEmailActionsV17311(document);
    }
