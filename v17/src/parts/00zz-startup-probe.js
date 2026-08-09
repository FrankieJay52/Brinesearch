    /* Temporary V17.3.12 startup probe + network guard. Remove after CI diagnosis.
       During startup, wait for each response body as well as its headers so a slow
       Supabase body cannot leave the top-level app initializer hanging forever. */
    document.documentElement.dataset.brinesearchAppScriptRunning = "true";
    document.documentElement.dataset.brinesearchStartupStage = "app-script-running";
    document.title = "BrineSearch startup probe · app script running";

    if (!window.__brineStartupNativeFetch) {
      window.__brineStartupNativeFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = async (input, init = {}) => {
        const url = String(typeof input === "string" ? input : input?.url || input || "");
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
          await response.clone().arrayBuffer();
          return response;
        } finally {
          clearTimeout(timer);
          if (upstream) upstream.removeEventListener?.("abort", abortFromUpstream);
        }
      };
    }
