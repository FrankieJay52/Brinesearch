    /* BrineSearch urgent security bridge.
       This loads before database access and redirects public traffic to the
       least-privilege directory, verification and submission endpoints. */
    const SECURITY_SUPABASE_ORIGIN_V174 = "https://wvxzqtoiwhrgovzddtvz.supabase.co";
    const SECURITY_NATIVE_FETCH_V174 = globalThis.fetch.bind(globalThis);
    const SECURITY_EDGE_BASE_V174 = `${SECURITY_SUPABASE_ORIGIN_V174}/functions/v1`;

    function securityRequestHeadersV174(input, init) {
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      const extra = new Headers(init?.headers || undefined);
      extra.forEach((value, key) => headers.set(key, value));
      return headers;
    }

    function securityRequestMethodV174(input, init) {
      return String(init?.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();
    }

    function securityHasUserJwtV174(headers) {
      const authorization = headers.get("authorization") || "";
      return /^Bearer\s+eyJ[a-zA-Z0-9_-]+\./.test(authorization);
    }

    function securityCanUseEditorVerificationV174() {
      try { return typeof editorCanEdit === "function" && editorCanEdit(); }
      catch { return false; }
    }

    function securityJsonBodyV174(init) {
      if (typeof init?.body !== "string") return null;
      try { return JSON.parse(init.body); } catch { return null; }
    }

    function securityFetchOptionsV174(input, init, overrides = {}) {
      const base = input instanceof Request ? {
        method: input.method,
        headers: input.headers,
        mode: input.mode,
        credentials: input.credentials,
        redirect: input.redirect,
        referrer: input.referrer,
        referrerPolicy: input.referrerPolicy,
        integrity: input.integrity,
        keepalive: input.keepalive,
        signal: input.signal
      } : {};
      return { ...base, ...(init || {}), ...overrides };
    }

    globalThis.fetch = async function brineSearchSecurityFetchV174(input, init = {}) {
      let url;
      try {
        const source = input instanceof Request ? input.url : String(input);
        url = new URL(source, location.href);
      } catch {
        return SECURITY_NATIVE_FETCH_V174(input, init);
      }

      const method = securityRequestMethodV174(input, init);
      const headers = securityRequestHeadersV174(input, init);
      const isSupabase = url.origin === SECURITY_SUPABASE_ORIGIN_V174;
      const authenticated = securityHasUserJwtV174(headers);

      if (isSupabase && !authenticated && method === "GET" && url.pathname === "/rest/v1/pads") {
        const select = url.searchParams.get("select") || "*";
        const asksForOnePad = url.searchParams.has("id") || url.searchParams.has("legacy_id");
        const asksForDetails = asksForOnePad || /(?:written_directions|directions_clear|extra_data|research_)/i.test(select);

        if (asksForDetails) {
          url.pathname = "/rest/v1/public_pad_detail";
          return SECURITY_NATIVE_FETCH_V174(url.toString(), securityFetchOptionsV174(input, init, {
            method: "GET",
            headers,
            cache: "default"
          }));
        }

        const directoryUrl = new URL(`${SECURITY_EDGE_BASE_V174}/public-pad-directory`);
        directoryUrl.searchParams.set("limit", url.searchParams.get("limit") || "1000");
        directoryUrl.searchParams.set("offset", url.searchParams.get("offset") || "0");
        return SECURITY_NATIVE_FETCH_V174(directoryUrl.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "default"
        });
      }

      if (isSupabase && method === "POST" && url.pathname === "/rest/v1/rpc/pad_verification_get" && !securityCanUseEditorVerificationV174()) {
        url.pathname = "/rest/v1/rpc/pad_verification_public_status";
        return SECURITY_NATIVE_FETCH_V174(url.toString(), securityFetchOptionsV174(input, init, {
          method,
          headers,
          cache: "no-store"
        }));
      }

      if (isSupabase && method === "POST" && url.pathname === "/rest/v1/rpc/submit_pad") {
        const payload = securityJsonBodyV174(init) || {};
        const turnstileToken = String(globalThis.__brineTurnstileTokenV174 || "");
        const edgeResponse = await SECURITY_NATIVE_FETCH_V174(`${SECURITY_EDGE_BASE_V174}/public-submit-pad`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ payload, turnstile_token: turnstileToken }),
          cache: "no-store"
        });
        const responseText = await edgeResponse.text();
        let responseBody = {};
        try { responseBody = responseText ? JSON.parse(responseText) : {}; } catch { responseBody = {}; }
        globalThis.dispatchEvent(new CustomEvent("brinesearch:public-submission-complete", {
          detail: { ok: edgeResponse.ok, status: edgeResponse.status }
        }));

        if (!edgeResponse.ok) {
          const postgrestMessage = edgeResponse.status === 409
            ? "duplicate_submission"
            : (edgeResponse.status === 429 ? "submission_limit" : String(responseBody?.error || "submission_failed"));
          return new Response(JSON.stringify({ message: postgrestMessage }), {
            status: edgeResponse.status,
            headers: { "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify(responseBody?.submission_id || true), {
          status: edgeResponse.status,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (isSupabase && authenticated && method === "POST" && url.pathname === "/rest/v1/field_profiles") {
        let restoreRemovedProfile = false;
        try { restoreRemovedProfile = fieldMyProfile?.status === "removed"; } catch {}
        if (restoreRemovedProfile) {
          const profileResponse = await SECURITY_NATIVE_FETCH_V174(url.toString(), securityFetchOptionsV174(input, init, {
            method,
            headers,
            cache: "no-store"
          }));
          if (!profileResponse.ok) return profileResponse;
          const activationResponse = await SECURITY_NATIVE_FETCH_V174(`${SECURITY_SUPABASE_ORIGIN_V174}/rest/v1/rpc/field_set_profile_active`, {
            method: "POST",
            headers,
            body: JSON.stringify({ p_active: true }),
            cache: "no-store"
          });
          return activationResponse.ok ? profileResponse : activationResponse;
        }
      }

      if (isSupabase && authenticated && method === "PATCH" && url.pathname === "/rest/v1/field_profiles") {
        const body = securityJsonBodyV174(init);
        const requested = String(body?.status || "").toLowerCase();
        if (["active", "removed", "inactive"].includes(requested)) {
          const rpc = new URL(`${SECURITY_SUPABASE_ORIGIN_V174}/rest/v1/rpc/field_set_profile_active`);
          const activationResponse = await SECURITY_NATIVE_FETCH_V174(rpc.toString(), {
            method: "POST",
            headers,
            body: JSON.stringify({ p_active: requested === "active" }),
            cache: "no-store"
          });
          if (!activationResponse.ok) return activationResponse;

          const remaining = { ...(body || {}) };
          delete remaining.status;
          if (!Object.keys(remaining).length) return activationResponse;
          return SECURITY_NATIVE_FETCH_V174(url.toString(), securityFetchOptionsV174(input, init, {
            method,
            headers,
            body: JSON.stringify(remaining),
            cache: "no-store"
          }));
        }
      }

      return SECURITY_NATIVE_FETCH_V174(input, init);
    };
