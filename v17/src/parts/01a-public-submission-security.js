    /* Public pad submissions must pass a server-validated Turnstile challenge.
       Approved editors continue to use the authenticated editor_add_pad path. */
    let securityTurnstileWidgetV174 = null;
    let securityTurnstileConfigV174 = null;
    let securityTurnstileLoadingV174 = null;

    function securitySubmissionHostV174() {
      let host = document.getElementById("publicSubmissionSecurityV174");
      if (host) return host;
      host = document.createElement("section");
      host.id = "publicSubmissionSecurityV174";
      host.className = "public-submission-security";
      host.innerHTML = `<div class="public-submission-security-title">Security check</div>
        <div id="publicSubmissionChallengeV174"></div>
        <p id="publicSubmissionSecurityStatusV174">Loading the security check…</p>`;
      const actions = document.getElementById("addWizardFinalActions");
      actions?.insertAdjacentElement("afterbegin", host);
      return host;
    }

    function securitySubmissionStatusV174(message, kind = "") {
      const status = document.getElementById("publicSubmissionSecurityStatusV174");
      if (!status) return;
      status.textContent = message;
      status.className = kind;
    }

    function securitySubmissionButtonV174() {
      return document.getElementById("submitAddPad");
    }

    async function securityTurnstileConfigV174Load() {
      if (securityTurnstileConfigV174) return securityTurnstileConfigV174;
      const response = await fetch(`${SECURITY_EDGE_BASE_V174}/public-submit-pad`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Security check unavailable.");
      securityTurnstileConfigV174 = body;
      return body;
    }

    function securityLoadTurnstileV174() {
      if (globalThis.turnstile?.render) return Promise.resolve(globalThis.turnstile);
      if (securityTurnstileLoadingV174) return securityTurnstileLoadingV174;
      securityTurnstileLoadingV174 = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-brinesearch-turnstile="true"]');
        if (existing) {
          const started = Date.now();
          const timer = setInterval(() => {
            if (globalThis.turnstile?.render) { clearInterval(timer); resolve(globalThis.turnstile); }
            else if (Date.now() - started > 12000) { clearInterval(timer); reject(new Error("Security check timed out.")); }
          }, 100);
          return;
        }
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.brinesearchTurnstile = "true";
        script.onload = () => globalThis.turnstile?.render
          ? resolve(globalThis.turnstile)
          : reject(new Error("Security check did not initialize."));
        script.onerror = () => reject(new Error("Security check could not load."));
        document.head.appendChild(script);
      });
      return securityTurnstileLoadingV174;
    }

    async function securityMountPublicSubmissionV174() {
      const host = securitySubmissionHostV174();
      const button = securitySubmissionButtonV174();
      if (editorCanEdit()) {
        host.hidden = true;
        globalThis.__brineTurnstileTokenV174 = "";
        if (button) button.disabled = false;
        return;
      }

      host.hidden = false;
      globalThis.__brineTurnstileTokenV174 = "";
      if (button) button.disabled = true;
      securitySubmissionStatusV174("Loading the security check…");

      try {
        const config = await securityTurnstileConfigV174Load();
        if (!config?.configured || !config?.siteKey) {
          securitySubmissionStatusV174(
            "Public submissions are temporarily unavailable while the security challenge is being configured.",
            "error"
          );
          return;
        }
        const turnstileApi = await securityLoadTurnstileV174();
        const target = document.getElementById("publicSubmissionChallengeV174");
        if (!target) return;
        if (securityTurnstileWidgetV174 !== null) {
          try { turnstileApi.remove(securityTurnstileWidgetV174); } catch {}
          securityTurnstileWidgetV174 = null;
        }
        target.innerHTML = "";
        securityTurnstileWidgetV174 = turnstileApi.render(target, {
          sitekey: config.siteKey,
          action: config.action || "public_pad_submission",
          theme: document.documentElement.getAttribute("data-theme") === "day" ? "light" : "dark",
          callback: token => {
            globalThis.__brineTurnstileTokenV174 = String(token || "");
            if (button) button.disabled = !globalThis.__brineTurnstileTokenV174;
            securitySubmissionStatusV174(
              config.preview ? "Preview security check complete. The preview will not create a live submission." : "Security check complete.",
              "success"
            );
          },
          "expired-callback": () => {
            globalThis.__brineTurnstileTokenV174 = "";
            if (button) button.disabled = true;
            securitySubmissionStatusV174("The security check expired. Complete it again.", "error");
          },
          "error-callback": () => {
            globalThis.__brineTurnstileTokenV174 = "";
            if (button) button.disabled = true;
            securitySubmissionStatusV174("The security check could not be completed. Try again.", "error");
          }
        });
      } catch (error) {
        securitySubmissionStatusV174(error?.message || "Security check unavailable.", "error");
      }
    }

    const securityOpenAddPadBaseV174 = openAddPad;
    openAddPad = function securityOpenAddPadV174() {
      securityOpenAddPadBaseV174();
      setTimeout(() => securityMountPublicSubmissionV174(), 0);
    };

    const securityRenderAddWizardStepBaseV174 = renderAddWizardStep;
    renderAddWizardStep = function securityRenderAddWizardStepV174(nextStep = addWizardStep) {
      securityRenderAddWizardStepBaseV174(nextStep);
      if (addWizardStep === ADD_WIZARD_STEPS.length - 1) {
        setTimeout(() => securityMountPublicSubmissionV174(), 0);
      }
    };

    addPadForm?.addEventListener("submit", event => {
      if (editorCanEdit()) return;
      if (!globalThis.__brineTurnstileTokenV174) {
        event.preventDefault();
        event.stopImmediatePropagation();
        securitySubmissionStatusV174("Complete the security check before submitting.", "error");
        securityMountPublicSubmissionV174();
      }
    }, true);

    globalThis.addEventListener("brinesearch:public-submission-complete", () => {
      globalThis.__brineTurnstileTokenV174 = "";
      const button = securitySubmissionButtonV174();
      if (!editorCanEdit() && button) button.disabled = true;
      if (securityTurnstileWidgetV174 !== null && globalThis.turnstile?.reset) {
        try { globalThis.turnstile.reset(securityTurnstileWidgetV174); } catch {}
      }
    });
