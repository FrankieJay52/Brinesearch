  /* Temporary V17.3.12 startup diagnostic. This part intentionally lives after
     18-account-theme-startup.js, inside its open .catch(error => { ... }) body,
     so CI can report the caught startup exception instead of only a generic
     fallback page. Remove once the underlying startup failure is fixed. */
  try {
    const detail = String(error?.stack || error?.message || error || "Unknown startup error");
    document.documentElement.dataset.brinesearchStartupError = detail.slice(0, 1200);
    document.title = `BrineSearch startup error · ${String(error?.message || error || "Unknown error").slice(0, 180)}`;
  } catch (diagnosticError) {
    console.error("BrineSearch startup diagnostic failed", diagnosticError);
  }
