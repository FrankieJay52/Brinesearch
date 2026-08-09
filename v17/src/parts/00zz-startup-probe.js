    /* Temporary V17.3.12 startup probe + network guard. Remove after CI diagnosis.
       During startup, wait for each response body as well as its headers so a slow
       request cannot leave the top-level app initializer hanging forever. */
    document.documentElement.dataset.brinesearchAppScriptRunning = "true";
    document.documentElement.dataset.brinesearchStartupStage = "app-script-running";
    document.title = "BrineSearch startup probe · app script running";

    if (!window.__brineStartupNativeFetch) {
      window.__brineStartupNativeFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = async (input, init = {}) => {
        const url = String(typeof input === "string" ? input : input?.url || input || "");
        const shortUrl = url.replace(location.origin, "").slice(0, 150);
        document.documentElement.dataset.brinesearchStartupStage = `fetch:${shortUrl}`;
        document.title = `BrineSearch startup probe · fetch ${shortUrl}`;
        const timeoutMs = /supabase\.co/i.test(url) ? 2400 : 2200;
        const controller = new AbortController();
        const upstream = init?.signal;
        const abortFromUpstream = () => controller.abort(upstream?.reason || new Error("Startup request aborted"));
        if (upstream) {
          if (upstream.aborted) abortFromUpstream();
          else upstream.addEventListener("abort", abortFromUpstream, { once:true });
        }
        const timer = setTimeout(() => controller.abort(new Error(`Startup request timed out after ${timeoutMs} ms`)), timeoutMs);
        try {
          const response = await window.__brineStartupNativeFetch(input, { ...init, signal:controller.signal });
          document.title = `BrineSearch startup probe · body ${shortUrl}`;
          await response.clone().arrayBuffer();
          try {
            const nativeJson = response.json.bind(response);
            Object.defineProperty(response, "json", {
              configurable:true,
              value:async () => {
                document.title = `BrineSearch startup probe · json ${shortUrl}`;
                const value = await nativeJson();
                document.title = `BrineSearch startup probe · parsed ${shortUrl}`;
                return value;
              }
            });
          } catch {}
          document.documentElement.dataset.brinesearchStartupStage = `fetched:${shortUrl}`;
          document.title = `BrineSearch startup probe · fetched ${shortUrl}`;
          return response;
        } finally {
          clearTimeout(timer);
          if (upstream) upstream.removeEventListener?.("abort", abortFromUpstream);
        }
      };
    }

    try {
      if (globalThis.indexedDB && !window.__brineStartupIndexedDbOpen) {
        window.__brineStartupIndexedDbOpen = indexedDB.open.bind(indexedDB);
        indexedDB.open = (...args) => {
          document.documentElement.dataset.brinesearchStartupStage = `indexeddb:${String(args[0] || "")}`;
          document.title = `BrineSearch startup probe · indexedDB ${String(args[0] || "")}`;
          return window.__brineStartupIndexedDbOpen(...args);
        };
      }
    } catch {}
