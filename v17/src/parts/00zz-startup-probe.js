    /* Temporary V17.3.12 startup probe + network guard. Remove after CI diagnosis.
       During startup, wait for each response body as well as its headers so a slow
       request cannot leave the top-level app initializer hanging forever. */
    document.documentElement.dataset.brinesearchAppScriptRunning = "true";
    document.documentElement.dataset.brinesearchStartupStage = "app-script-running";
    document.title = "BrineSearch startup probe · app script running";

    const startupStageV17312 = value => {
      const stage = String(value || "");
      document.documentElement.dataset.brinesearchStartupStage = stage;
      document.title = `BrineSearch startup probe · ${stage}`;
    };

    if (!window.__brineStartupNativeFetch) {
      window.__brineStartupNativeFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = async (input, init = {}) => {
        const url = String(typeof input === "string" ? input : input?.url || input || "");
        const shortUrl = url.replace(location.origin, "").slice(0, 170);
        const tracked = /(?:\/data\/directions\/|pad-fallback-data\.json|supabase\.co\/rest\/v1\/(?:pads|public_pad_detail))/i.test(url);
        if (tracked) startupStageV17312(`fetch ${shortUrl}`);
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
          if (tracked) startupStageV17312(`body ${shortUrl}`);
          await response.clone().arrayBuffer();
          try {
            const nativeJson = response.json.bind(response);
            Object.defineProperty(response, "json", {
              configurable:true,
              value:async () => {
                if (tracked) startupStageV17312(`json ${shortUrl}`);
                const value = await nativeJson();
                if (tracked) startupStageV17312(`parsed ${shortUrl}`);
                return value;
              }
            });
          } catch {}
          if (tracked) startupStageV17312(`fetched ${shortUrl}`);
          return response;
        } finally {
          clearTimeout(timer);
          if (upstream) upstream.removeEventListener?.("abort", abortFromUpstream);
        }
      };
    }

    try {
      if (globalThis.IDBFactory?.prototype?.open && !window.__brineStartupIndexedDbOpen) {
        window.__brineStartupIndexedDbOpen = globalThis.IDBFactory.prototype.open;
        globalThis.IDBFactory.prototype.open = function(...args) {
          const name = String(args[0] || "");
          startupStageV17312(`indexedDB open ${name}`);
          const request = window.__brineStartupIndexedDbOpen.apply(this, args);
          request.addEventListener("upgradeneeded", () => startupStageV17312(`indexedDB upgrade ${name}`));
          request.addEventListener("success", () => startupStageV17312(`indexedDB open success ${name}`));
          request.addEventListener("error", () => startupStageV17312(`indexedDB open error ${name}`));
          request.addEventListener("blocked", () => startupStageV17312(`indexedDB blocked ${name}`));
          return request;
        };
      }
      if (globalThis.IDBObjectStore?.prototype?.get && !window.__brineStartupIndexedDbGet) {
        window.__brineStartupIndexedDbGet = globalThis.IDBObjectStore.prototype.get;
        globalThis.IDBObjectStore.prototype.get = function(...args) {
          startupStageV17312(`indexedDB get ${String(args[0] || "")}`);
          const request = window.__brineStartupIndexedDbGet.apply(this, args);
          request.addEventListener("success", () => startupStageV17312(`indexedDB get success ${String(args[0] || "")}`));
          request.addEventListener("error", () => startupStageV17312(`indexedDB get error ${String(args[0] || "")}`));
          return request;
        };
      }
    } catch (error) {
      startupStageV17312(`indexedDB probe error ${String(error?.message || error)}`);
    }
