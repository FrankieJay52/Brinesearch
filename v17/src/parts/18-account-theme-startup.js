    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && document.getElementById("padEditorShell")) {
        closePadEditor();
        return;
      }
      if (event.key === "Escape" && assistantShell.classList.contains("open")) closeAssistant();
    });
    window.addEventListener("hashchange", () => {
      if (assistantShell.classList.contains("open")) {
        assistantContext.textContent = assistantContextText();
        renderAssistantCurrentCard();
      }
    });


    fillAdvancedBaseOptions();

    document.getElementById("globalSearchBtn").addEventListener("click", () => openGlobalSearch());
    document.getElementById("addPadBtn")?.addEventListener("click", openAddPad);
    document.getElementById("mobileAddPadBtn")?.addEventListener("click", openAddPad);
    document.getElementById("newCompany")?.addEventListener("change", updateOtherCompanyField);
    document.getElementById("captureCoordinates")?.addEventListener("click", captureCurrentCoordinates);
    document.getElementById("addWellEntry")?.addEventListener("click", () => addCurrentWellEntry());
    document.getElementById("wellEntryList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-well-index]");
      if (!button) return;
      const index = Number(button.dataset.wellIndex);
      if (!Number.isInteger(index) || index < 0 || index >= newWellEntries.length) return;
      newWellEntries.splice(index, 1);
      saveWellEntryDraft();
      renderWellEntries();
    });
    document.getElementById("closeAddPad")?.addEventListener("click", closeAddPad);
    document.getElementById("cancelAddPad")?.addEventListener("click", closeAddPad);
    ["newWellNameDraft", "newApiDraft", "newPropertyDraft"].forEach(id => {
      document.getElementById(id)?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          addCurrentWellEntry();
        }
      });
    });
    addPadForm?.addEventListener("submit", submitNewPad);
    document.getElementById("newPadName")?.addEventListener("input", refreshAddDuplicateWarning);
    document.getElementById("newCompany")?.addEventListener("change", refreshAddDuplicateWarning);
    document.getElementById("newCompanyOther")?.addEventListener("input", refreshAddDuplicateWarning);
    document.getElementById("newState")?.addEventListener("change", refreshAddDuplicateWarning);
    addPadModal?.addEventListener("click", event => {
      if (event.target === addPadModal) closeAddPad();
    });
    document.getElementById("closeGlobalSearch").addEventListener("click", closeGlobalSearch);
    document.getElementById("clearAdvancedSearch").addEventListener("click", clearAdvancedSearch);

    toggleAdvancedSearch.addEventListener("click", () => {
      advancedSearchPanel.classList.toggle("open");
      toggleAdvancedSearch.textContent =
        advancedSearchPanel.classList.contains("open") ? "Hide options" : "More options";
    });

    alwaysSearchInput.addEventListener("input", debounce(updateAlwaysSearch, 200));

    [
      advancedSearchField, advancedMatchMode, advancedCounty, advancedTownship,
      advancedMissing, advancedSort, advancedLimit, requireMapReady, requireGps,
      requireAddress, requireApi, requireProperty, requireWell, requireRoad,
      requireDirections
    ].forEach(control => control.addEventListener("change", updateAlwaysSearch));

    advancedCompany.addEventListener("change", () => {
      refreshAdvancedLocationOptions();
      updateAlwaysSearch();
    });
    advancedState.addEventListener("change", () => {
      refreshAdvancedLocationOptions();
      updateAlwaysSearch();
    });
    advancedCounty.addEventListener("change", () => {
      refreshAdvancedLocationOptions();
      updateAlwaysSearch();
    });

    alwaysSearchResults.addEventListener("click", event => {
      if (event.target.closest("a")) closeGlobalSearch();
    });
    globalSearchModal.addEventListener("click", event => {
      if (event.target === globalSearchModal) closeGlobalSearch();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && document.getElementById("verificationDetailShell")) {
        closeVerificationDetail();
        return;
      }
      if (event.key === "Escape" && addPadModal.classList.contains("open")) {
        closeAddPad();
        return;
      }
      if (event.key === "Escape" && globalSearchModal.classList.contains("open")) {
        closeGlobalSearch();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openGlobalSearch();
      }
    });

    function goToDirectoryHome() {
      closeAssistant();
      closeGlobalSearch();
      closePadEditor();

      if (location.hash === "#/" || location.hash === "" || location.hash === "#") {
        renderHome();
      } else {
        location.hash = "#/";
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function closeAccountMenu() {
      document.getElementById("accountMenu")?.classList.remove("open");
      document.getElementById("accountMenuBackdrop")?.classList.remove("open");
    }
    function openAccountMenu() {
      const menu=document.getElementById("accountMenu");
      const backdrop=document.getElementById("accountMenuBackdrop");
      const name=document.getElementById("accountMenuName");
      const email=document.getElementById("accountMenuEmail");
      if(name) name.textContent=editorProfile?.display_name || editorSession?.user?.user_metadata?.display_name || "BrineSearch account";
      if(email) email.textContent=editorSession?.user?.email || "";
      menu?.classList.add("open"); backdrop?.classList.add("open");
    }
    document.getElementById("accountBtn")?.addEventListener("click", () => {
      closeAssistant(); closeGlobalSearch(); closePadEditor();
      if (!editorSession?.access_token) { showEditorAuthPanel("login"); openEditorAuth(); return; }
      const menu=document.getElementById("accountMenu");
      if(menu?.classList.contains("open")) closeAccountMenu(); else openAccountMenu();
    });
    document.getElementById("accountMenuBackdrop")?.addEventListener("click", closeAccountMenu);
    document.getElementById("accountMenuProfile")?.addEventListener("click",()=>{ closeAccountMenu(); location.hash="#/feed/profile"; });
    document.getElementById("accountMenuSettings")?.addEventListener("click",()=>{ closeAccountMenu(); location.hash="#/settings"; });
    document.getElementById("accountMenuSignOut")?.addEventListener("click",()=>{ closeAccountMenu(); signOutEditor().catch(error=>showToast(error.message)); });

    document.getElementById("settingsBtn")?.addEventListener("click", () => { closeAssistant(); closeGlobalSearch(); closePadEditor(); location.hash = "#/settings"; });

    /* Daylight / night theme. A dark UI is right for a night run and hard to
       read through a windshield at noon, when iOS also caps brightness. The
       choice is stored per device so a driver sets it once. */
    (function initThemeToggle() {
      const THEME_KEY = "brinesearch.theme.v1";
      const button = document.getElementById("themeToggleBtn");
      const icon = document.getElementById("themeToggleIcon");
      const meta = document.getElementById("themeColorMeta");
      if (!button) return;

      function applyTheme(theme) {
        const next = theme === "day" ? "day" : "night";
        document.documentElement.setAttribute("data-theme", next);
        if (icon) icon.textContent = next === "day" ? "☾" : "☀";
        if (meta) meta.setAttribute("content", next === "day" ? "#eef3f9" : "#08121f");
        const label = next === "day" ? "Switch to night theme" : "Switch to daylight theme";
        button.setAttribute("aria-label", label);
        button.setAttribute("title", label);
        button.setAttribute("aria-pressed", String(next === "day"));
        try { localStorage.setItem(THEME_KEY, next); } catch (error) {}
      }

      applyTheme(document.documentElement.getAttribute("data-theme"));
      button.addEventListener("click", () => {
        applyTheme(document.documentElement.getAttribute("data-theme") === "day" ? "night" : "day");
      });
    })();
    document.getElementById("mobileHomeBtn")?.addEventListener("click", goToDirectoryHome);

    document.getElementById("mobileSearchBtn")?.addEventListener("click", () => {
      closeAssistant();
      openGlobalSearch();
    });

    document.getElementById("mobileFeedBtn")?.addEventListener("click", () => { location.hash = "#/feed"; });

    document.getElementById("mobileBackBtn")?.addEventListener("click", () => {
      closeAssistant();
      const raw = location.hash.replace(/^#\/?/, "");
      if (!raw) return;
      if (history.length > 1) history.back();
      else location.hash = "#/";
    });


    document.getElementById("editorBtn")?.addEventListener("click", () => openEditorAuth());
    document.getElementById("editorLoginTab")?.addEventListener("click", () => showEditorAuthPanel("login"));
    document.getElementById("editorSignupTab")?.addEventListener("click", () => showEditorAuthPanel("signup"));
    document.getElementById("editorForgotPassword")?.addEventListener("click", () => {
      sendEditorPasswordReset().catch(error => editorStatusElement(error.message, "error"));
    });
    document.getElementById("openVerificationReview")?.addEventListener("click", () => {
      closeEditorAuth();
      location.hash = "#/verification";
    });
    document.getElementById("closeEditorAuth")?.addEventListener("click", closeEditorAuth);
    document.getElementById("editorAuthModal")?.addEventListener("click", event => {
      if (event.target?.id === "editorAuthModal") closeEditorAuth();
    });
    document.getElementById("editorCreateAccount")?.addEventListener("click", () => {
      createEditorAccount().catch(error => editorStatusElement(error.message, "error"));
    });
    document.getElementById("editorSignIn")?.addEventListener("click", () => {
      signInEditor().catch(error => editorStatusElement(error.message, "error"));
    });
    document.getElementById("editorSignOut")?.addEventListener("click", () => {
      signOutEditor().catch(error => editorStatusElement(error.message, "error"));
    });
    document.getElementById("editorRefreshStatus")?.addEventListener("click", () => {
      loadEditorProfile().then(() => editorStatusElement("Access status refreshed.", "success"))
        .catch(error => editorStatusElement(error.message, "error"));
    });
    document.getElementById("refreshEditorDashboard")?.addEventListener("click", () => {
      loadEditorDashboard().then(() => editorStatusElement("Dashboard refreshed.", "success"))
        .catch(error => editorStatusElement(error.message, "error"));
    });
    document.getElementById("editorPeople")?.addEventListener("click", event => {
      const choice = null; // legacy single-role selector removed
      if (choice) {
        const picker = choice.closest("[data-editor-role-picker]");
        if (!picker) return;
        picker.dataset.selectedRole = choice.dataset.chooseEditorRole;
        picker.querySelectorAll("[data-choose-editor-role]").forEach(button => button.classList.toggle("selected", button === choice));
        const save = picker.querySelector("[data-save-editor-role]");
        save?.classList.add("ready");
        if (save) save.textContent = `Save as ${choice.dataset.chooseEditorRole === "administrator" ? "Administrator" : choice.dataset.chooseEditorRole === "editor" ? "Editor" : "Suspended"}`;
        editorStatusElement("Role selected. Tap Save role to apply it.");
        return;
      }
      const save = event.target.closest("[data-save-editor-role]");
      if (!save) return;
      const picker = save.closest("[data-editor-role-picker]");
      const role = picker?.dataset.selectedRole;
      if (!role) return;
      save.disabled = true;
      save.textContent = "Saving…";
      setEditorRole(save.dataset.editorUser, role)
        .catch(error => {
          save.disabled = false;
          save.textContent = "Save role";
          editorStatusElement(error.message, "error");
        });
    });

    app.addEventListener("click", async event => {
      const ownerSignIn = event.target.closest("[data-open-editor-auth]");
      if (ownerSignIn) {
        openEditorAuth("Sign in with the owner account to open verification review.");
        return;
      }

      const summaryFilter = event.target.closest("[data-verification-review-filter]");
      if (summaryFilter) {
        verificationState.reviewStatus = summaryFilter.dataset.verificationReviewFilter;
        verificationState.offset = 0;
        const select = document.getElementById("verificationReviewStatus");
        if (select) select.value = verificationState.reviewStatus;
        loadVerificationQueue().catch(error => showVerificationPageError(error));
        return;
      }

      const resultSummaryFilter = event.target.closest("[data-verification-result-filter]");
      if (resultSummaryFilter) {
        verificationState.result = resultSummaryFilter.dataset.verificationResultFilter;
        verificationState.reviewStatus = "all";
        verificationState.offset = 0;
        const resultSelect = document.getElementById("verificationResult");
        const reviewSelect = document.getElementById("verificationReviewStatus");
        if (resultSelect) resultSelect.value = verificationState.result;
        if (reviewSelect) reviewSelect.value = "all";
        loadVerificationQueue().catch(error => showVerificationPageError(error));
        return;
      }

      const verificationRecord = event.target.closest("[data-verification-pad]");
      if (verificationRecord && (location.hash.startsWith("#/verification") || location.hash.startsWith("#/audit"))) {
        openVerificationDetail(verificationRecord.dataset.verificationPad);
        return;
      }

      const editButton = event.target.closest("[data-edit-section]");
      if (editButton) {
        openLivePadEditor(editButton.dataset.padId, editButton.dataset.editSection);
        return;
      }

      const rewriteButton = event.target.closest("[data-rewrite-directions]");
      if (rewriteButton) {
        const p = padById(rewriteButton.dataset.padId);
        if (!p || !has(p.writtenDirections)) return;
        const rewritten = smartRewriteDirections(p.writtenDirections, p.Structured_Road_Sequence);
        const card = rewriteButton.closest(".clean-card");
        const preview = card?.querySelector("[data-rewrite-preview]");
        if (preview) {
          preview.hidden = false;
          preview.innerHTML = `
            <div class="rewrite-preview-badge">Temporary · not saved</div>
            <div class="direction-label">AI rewrite preview</div>
            <p class="direction-text">${esc(rewritten)}</p>
            <div class="direction-warning">The preview uses only the saved directions and road sequence. It preserves warnings, gates, landmarks, distances, and arrival details, but it cannot verify current road conditions.</div>
            <div class="rewrite-preview-actions">
              <button class="btn small secondary" type="button" data-copy-rewrite>Copy preview</button>
              <button class="btn small ghost" type="button" data-hide-rewrite>Hide preview</button>
            </div>`;
          preview.scrollIntoView({ behavior:"smooth", block:"nearest" });
        }
        return;
      }

      const copyRewrite = event.target.closest("[data-copy-rewrite]");
      if (copyRewrite) {
        const preview = copyRewrite.closest("[data-rewrite-preview]");
        const rewriteText = preview?.querySelector(".direction-text")?.textContent || "";
        if (!rewriteText) return;
        try {
          await navigator.clipboard.writeText(rewriteText);
          showToast("Rewrite preview copied");
        } catch {
          showToast("Press and hold the preview to copy it");
        }
        return;
      }

      const hideRewrite = event.target.closest("[data-hide-rewrite]");
      if (hideRewrite) {
        const preview = hideRewrite.closest("[data-rewrite-preview]");
        if (preview) preview.hidden = true;
      }
    });

    document.addEventListener("click", event => {
      if (event.target.closest("[data-close-verification-detail]")) closeVerificationDetail();
    });

    editorSession = loadEditorSession();
    if (editorSession) {
      try { await loadEditorProfile(); }
      catch {
        try {
          await refreshEditorToken();
          await loadEditorProfile();
        } catch {
          saveEditorSession(null);
          editorProfile = null;
        }
      }
    }
    updateEditorButton();

    window.addEventListener("hashchange", router);
    router();
})().catch(error => {
  console.error("BrineSearch failed to start", error);
  const app = document.getElementById("app");
  if (app) app.innerHTML = `<div class="empty"><h2>BrineSearch could not start</h2><p>Reload the page and try again.</p></div>`;
