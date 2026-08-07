
    function editorHasPermission(permission) {
      return Boolean(editorSession?.access_token && editorPermissions().includes(String(permission).toLowerCase()));
    }

    function editorCanEdit() {
      return editorHasPermission("owner") || editorHasPermission("administrator") || editorHasPermission("editor");
    }

    function editorIsOwner() {
      return editorHasPermission("owner");
    }

    function editorHeaders(includeJson = true) {
      const headers = { apikey: SUPABASE_PUBLISHABLE_KEY };
      if (editorSession?.access_token) headers.Authorization = `Bearer ${editorSession.access_token}`;
      if (includeJson) headers["Content-Type"] = "application/json";
      return headers;
    }

    async function editorRequest(path, options = {}, retry = true) {
      await ensureEditorSession();
      const response = await fetch(`${SUPABASE_URL}${path}`, {
        ...options,
        headers: { ...editorHeaders(options.body !== undefined), ...(options.headers || {}) },
        cache: "no-store"
      });
      let data = null;
      const text = await response.text();
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
      if (!response.ok) {
        const message = data?.msg || data?.message || data?.error_description || data?.hint || `Request failed (${response.status})`;
        const expired = response.status === 401 || /jwt|token.*expired|expired.*token/i.test(String(message));
        if (retry && expired && editorSession?.refresh_token) {
          try { await refreshEditorToken(); return editorRequest(path, options, false); }
          catch { saveEditorSession(null); editorProfile = null; updateEditorButton(); throw new Error("Your session expired. Sign in again to continue."); }
        }
        throw new Error(message);
      }
      return data;
    }

    async function refreshEditorToken() {
      if (!editorSession?.refresh_token) throw new Error("Please sign in again.");
      const data = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: editorSession.refresh_token })
      }).then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error_description || "Please sign in again.");
        return body;
      });
      saveEditorSession(data);
      return data;
    }

    async function ensureEditorSession() {
      if (!editorSession) return null;
      const expiresAt = Number(editorSession.expires_at || 0);
      if (expiresAt && expiresAt * 1000 < Date.now() + 60000) {
        try { await refreshEditorToken(); }
        catch { saveEditorSession(null); editorProfile = null; return null; }
      }
      return editorSession;
    }

    function editorStatusElement(message, kind = "") {
      const el = document.getElementById("editorAuthStatus");
      if (!el) return;
      el.textContent = message || "";
      el.className = `editor-auth-status${kind ? ` ${kind}` : ""}`;
    }

    function showEditorAuthPanel(panel = "login") {
      const login = panel !== "signup";
      document.getElementById("editorLoginPanel")?.toggleAttribute("hidden", !login);
      document.getElementById("editorSignupPanel")?.toggleAttribute("hidden", login);
      const loginTab = document.getElementById("editorLoginTab");
      const signupTab = document.getElementById("editorSignupTab");
      loginTab?.classList.toggle("active", login);
      signupTab?.classList.toggle("active", !login);
      loginTab?.setAttribute("aria-selected", String(login));
      signupTab?.setAttribute("aria-selected", String(!login));
      editorStatusElement("");
      setTimeout(() => document.getElementById(login ? "editorLoginEmail" : "editorSignupName")?.focus(), 40);
    }

    async function sendEditorPasswordReset() {
      const email = normalize(document.getElementById("editorLoginEmail")?.value);
      if (!email) {
        editorStatusElement("Enter your email first.", "error");
        return;
      }
      editorStatusElement("Sending password reset…");
      const response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: "POST",
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        editorStatusElement(data?.msg || data?.error_description || "Could not send the reset email.", "error");
        return;
      }
      editorStatusElement("Password reset email sent.", "success");
    }

    function openEditorAuth(message = "") {
      closeGlobalSearch();
      closeAssistant();
      document.getElementById("editorAuthModal")?.classList.add("open");
      document.body.style.overflow = "hidden";
      renderEditorAccount();
      if (message) editorStatusElement(message);
      setTimeout(() => {
        const target = editorSession ? document.getElementById("editorRefreshStatus") : document.getElementById("editorLoginEmail");
        target?.focus();
      }, 60);
    }

    function closeEditorAuth() {
      document.getElementById("editorAuthModal")?.classList.remove("open");
      if (!globalSearchModal.classList.contains("open") && !assistantShell.classList.contains("open")) {
        document.body.style.overflow = "";
      }
    }

    function updateEditorButton() {
      const legacy = document.getElementById("editorBtn");
      if (legacy) {
        const label = legacy.querySelector(".editor-word");
        if (!editorSession) { if (label) label.textContent = "Editor"; legacy.title = "Editor sign in"; }
        else if (editorCanEdit()) { if (label) label.textContent = "Editing"; legacy.title = `Signed in as ${editorProfile?.role || "editor"}`; }
        else { if (label) label.textContent = "Pending"; legacy.title = "Editor approval pending"; }
      }
      const account = document.getElementById("accountBtn");
      const word = document.getElementById("accountBtnWord");
      const icon = document.getElementById("accountBtnIcon");
      if (!account) return;
      account.hidden = false;
      if (editorSession?.access_token) {
        if (word) word.textContent = "Account";
        if (icon) icon.textContent = "👤";
        account.classList.add("signed-in");
        account.title = "Account";
        account.setAttribute("aria-label", "Open account menu");
      } else {
        if (word) word.textContent = "Sign in";
        if (icon) icon.textContent = "👤";
        account.classList.remove("signed-in");
        account.title = "Sign in or sign up";
        account.setAttribute("aria-label", "Sign in or sign up");
      }
    }

    async function loadEditorProfile() {
      if (!await ensureEditorSession()) {
        editorProfile = null;
        updateEditorButton();
        return null;
      }
      const status = await editorRequest("/rest/v1/rpc/my_editor_status", {
        method: "POST",
        body: "{}"
      });
      editorProfile = Array.isArray(status) ? status[0] : status;
      if (editorProfile) {
        try {
          const rows = await editorRequest(`/rest/v1/editor_accounts?user_id=eq.${encodeURIComponent(editorSession.user.id)}&select=user_id,email,display_name,role,permissions,created_at,updated_at`);
          if (Array.isArray(rows) && rows[0]) editorProfile = { ...editorProfile, ...rows[0] };
        } catch {}
      }
      if (!editorProfile) {
        const displayName = normalize(editorSession.user?.user_metadata?.display_name);
        const registered = await editorRequest("/rest/v1/rpc/register_editor_profile", {
          method: "POST",
          body: JSON.stringify({ p_display_name: displayName || null })
        });
        editorProfile = Array.isArray(registered) ? registered[0] : registered;
      }
      if (editorProfile && !Array.isArray(editorProfile.permissions)) {
        try { const rows=await editorRequest(`/rest/v1/editor_accounts?user_id=eq.${encodeURIComponent(editorSession.user.id)}&select=*`); if(Array.isArray(rows)&&rows[0]) editorProfile={...editorProfile,...rows[0]}; } catch {}
      }
      updateEditorButton();
      renderEditorAccount();
      return editorProfile;
    }

    function renderEditorAccount() {
      const signedOut = document.getElementById("editorSignedOut");
      const signedIn = document.getElementById("editorSignedIn");
      if (!signedOut || !signedIn) return;
      signedOut.hidden = Boolean(editorSession);
      signedIn.hidden = !editorSession;

      if (!editorSession) {
        document.getElementById("editorManager")?.setAttribute("hidden", "");
        return;
      }

      document.getElementById("editorAccountName").textContent =
        editorProfile?.display_name || editorSession.user?.user_metadata?.display_name || "Editor account";
      document.getElementById("editorAccountEmail").textContent =
        editorProfile?.email || editorSession.user?.email || "";
      document.getElementById("editorAccountRole").textContent = editorIsOwner() ? "Owner" : editorPermissions().filter(x=>!["member","suspended"].includes(x)).map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(" + ") || (editorPermissions().includes("suspended") ? "Suspended" : "Regular User");

      const message = document.getElementById("editorPermissionMessage");
      if (message) {
        if (editorCanEdit()) {
          message.innerHTML = editorProfile?.role === "administrator" ? `<p>Administrator access is active. You can add and edit live pad information.</p>` : `<p>You can edit every section of every pad. Changes save directly to the live database.</p>`;
        } else {
          message.innerHTML = `<p>Your Regular User account is active. You can use the directory and Field Feed. The owner can add Editor, Moderator, or Administrator permissions later.</p>`;
        }
      }

      const reviewButton = document.getElementById("openVerificationReview");
      if (reviewButton) reviewButton.hidden = !editorIsOwner();

      // Account modal is intentionally account-only. Management dashboards live in Settings.
      const manager = document.getElementById("editorManager");
      if (manager) manager.hidden = true;
      const myDashboard = document.getElementById("editorMyDashboard");
      if (myDashboard) myDashboard.hidden = true;
    }

    async function createEditorAccount() {
      const email = normalize(document.getElementById("editorSignupEmail")?.value);
      const password = String(document.getElementById("editorSignupPassword")?.value || "");
      const confirmPassword = String(document.getElementById("editorSignupConfirm")?.value || "");
      const displayName = normalize(document.getElementById("editorSignupName")?.value);
      if (!displayName) {
        editorStatusElement("Enter your name.", "error");
        return;
      }
      if (!email || password.length < 8) {
        editorStatusElement("Enter a valid email and a password with at least 8 characters.", "error");
        return;
      }
      if (password !== confirmPassword) {
        editorStatusElement("The passwords do not match.", "error");
        return;
      }
      editorStatusElement("Creating account…");
      const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, data: { display_name: displayName } })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        editorStatusElement(data?.msg || data?.error_description || "Could not create the account.", "error");
        return;
      }
      if (!data.access_token) {
        editorStatusElement("Account created. Confirm your email, then return and log in. Your account will wait for owner approval.", "success");
        showEditorAuthPanel("login");
        const loginEmail = document.getElementById("editorLoginEmail");
        if (loginEmail) loginEmail.value = email;
        return;
      }
      saveEditorSession(data);
      try {
        await loadEditorProfile();
        editorStatusElement("Account created and waiting for owner approval.", "success");
      } catch (error) {
        editorStatusElement(error.message, "error");
      }
    }

    async function signInEditor() {
      const email = normalize(document.getElementById("editorLoginEmail")?.value);
      const password = String(document.getElementById("editorLoginPassword")?.value || "");
      if (!email || !password) {
        editorStatusElement("Enter your email and password.", "error");
        return;
      }
      editorStatusElement("Signing in…");
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        editorStatusElement(data?.error_description || data?.msg || "Sign-in failed.", "error");
        return;
      }
      saveEditorSession(data);
      try {
        await loadEditorProfile();
        editorStatusElement(editorCanEdit() ? "Signed in with editing access." : "Signed in. Owner approval is still needed.", "success");
      } catch (error) {
        editorStatusElement(error.message, "error");
      }
    }

    async function clearBrineSearchDeviceData() {
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith("brinesearch.") || key.startsWith("brinesearch_")) localStorage.removeItem(key);
        });
        try { indexedDB.deleteDatabase("brinesearch-offline-v1"); } catch {}
      } catch {}
      try {
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith("brinesearch.") || key.startsWith("brinesearch_")) sessionStorage.removeItem(key);
        });
      } catch {}
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter(key => key.startsWith("brinesearch-")).map(key => caches.delete(key)));
        }
      } catch {}
    }

    async function signOutEditor() {
      try {
        if (editorSession?.access_token) {
          await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
            method: "POST",
            headers: editorHeaders(false)
          });
        }
      } catch {}
      saveEditorSession(null);
      editorProfile = null;
      await clearBrineSearchDeviceData();
      editorStatusElement("Signed out. Saved account and offline data were cleared from this device.", "success");
      renderEditorAccount();
      updateEditorButton();
      const protectedRoute = /^#\/(verification|audit|settings|feed\/(profile|moderation|notifications))/.test(location.hash);
      if (protectedRoute) location.hash = "#/";
    }

    function formatEditorTime(value) {
      if (!value) return "Never";
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return "Unknown";
      return date.toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
    }
