
    // Remove the outdated Independent platform provenance card from the public Data Sources page.
    // Keep this after 15-settings-road-tools.js so the router uses the cleaned renderer.
    const renderDataSourcesSettingsBeforeProvenanceCleanup = renderDataSourcesSettings;
    renderDataSourcesSettings = function renderDataSourcesSettings() {
      renderDataSourcesSettingsBeforeProvenanceCleanup();
      app?.querySelectorAll?.(".provenance-card").forEach(card => {
        if (card.querySelector("h2")?.textContent?.trim() === "Independent platform") card.remove();
      });
    };
