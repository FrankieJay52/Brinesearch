    /* Temporary V17.3.12 startup stage marker. */
    document.documentElement.dataset.brinesearchStartupStage = "live-clear-directions-ready";
    document.title = "BrineSearch startup probe · live directions ready";
    if (window.__brineStartupNativeFetch) {
      globalThis.fetch = window.__brineStartupNativeFetch;
      delete window.__brineStartupNativeFetch;
    }
