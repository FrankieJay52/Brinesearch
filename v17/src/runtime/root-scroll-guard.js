(() => {
  const resetHorizontalPageScroll = () => {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    if (window.scrollX !== 0 || document.documentElement.scrollLeft !== 0 || document.body.scrollLeft !== 0) {
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      window.scrollTo(0, y);
    }
  };
  window.addEventListener('load', resetHorizontalPageScroll, { once: true });
  window.addEventListener('resize', resetHorizontalPageScroll, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(resetHorizontalPageScroll, 80), { passive: true });
  window.addEventListener('hashchange', () => requestAnimationFrame(resetHorizontalPageScroll));


    if ("serviceWorker" in navigator && location.protocol === "https:") {
      window.addEventListener("load", async () => {
        try {
          const registration = await navigator.serviceWorker.register("./sw.js");
          const banner = document.getElementById("brinesearchUpdateBanner");
          const reloadButton = document.getElementById("brinesearchUpdateReload");
          let refreshing = false;
          const showUpdate = worker => {
            if (!worker || !navigator.serviceWorker.controller || !banner) return;
            banner.hidden = false;
            if (reloadButton) reloadButton.onclick = () => {
              reloadButton.disabled = true;
              reloadButton.textContent = "Updating…";
              worker.postMessage({ type: "SKIP_WAITING" });
            };
          };
          if (registration.waiting) showUpdate(registration.waiting);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed") showUpdate(worker);
            });
          });
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing) return;
            refreshing = true;
            location.reload();
          });
          registration.update().catch(() => {});
        } catch (error) {
          console.warn("Offline cache unavailable", error);
        }
      });
    }
})();
