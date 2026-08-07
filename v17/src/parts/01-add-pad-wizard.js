    function addCurrentWellEntry({ silent = false } = {}) {
      const status = document.getElementById("wellEntryStatus");
      const entry = readWellEntryDraft();
      if (!entry.well_name && !entry.api && !entry.property_number) {
        if (!silent && status) {
          status.textContent = "Enter a well name, API, or property number first.";
          status.className = "error";
        }
        return false;
      }
      if (newWellEntries.length >= 50) {
        if (status) {
          status.textContent = "A maximum of 50 wells can be added to one pad.";
          status.className = "error";
        }
        return false;
      }
      newWellEntries.push(entry);
      saveWellEntryDraft();
      renderWellEntries();
      ["newWellNameDraft", "newApiDraft", "newPropertyDraft"].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = "";
      });
      if (!silent) document.getElementById("newWellNameDraft")?.focus();
      return true;
    }

    function clearWellEntryDraft() {
      newWellEntries = [];
      localStorage.removeItem(NEW_WELL_DRAFT_KEY);
      renderWellEntries();
    }

    function captureCurrentCoordinates() {
      const button = document.getElementById("captureCoordinates");
      const status = document.getElementById("coordinateCaptureStatus");
      if (!navigator.geolocation) {
        if (status) {
          status.textContent = "This browser cannot capture location.";
          status.className = "coordinate-capture-status error";
        }
        return;
      }
      if (button) {
        button.disabled = true;
        button.textContent = "Capturing…";
      }
      if (status) {
        status.textContent = "Waiting for iPhone location permission and GPS…";
        status.className = "coordinate-capture-status";
      }
      navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        document.getElementById("newLatitude").value = lat;
        document.getElementById("newLongitude").value = lng;
        if (status) {
          status.textContent = `Captured ${lat}, ${lng} · accuracy about ${Math.round(position.coords.accuracy)} meters.`;
          status.className = "coordinate-capture-status success";
        }
        if (button) {
          button.disabled = false;
          button.innerHTML = `<span class="fm-icon fm-gps"></span> Capture again`;
        }
      }, error => {
        const messages = {
          1: "Location permission was denied. Allow location access for BrineSearch in Safari settings.",
          2: "Your current location could not be determined.",
          3: "Location capture timed out. Try again while outdoors or near a window."
        };
        if (status) {
          status.textContent = messages[error.code] || "Location capture failed.";
          status.className = "coordinate-capture-status error";
        }
        if (button) {
          button.disabled = false;
          button.innerHTML = `<span class="fm-icon fm-gps"></span> Try capture again`;
        }
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    }

    const ADD_WIZARD_STEPS = [
      { title:"Basic pad information", help:"Choose the company and identify the pad or disposal.", ids:["newRecordType","newCompany","newPadName","newState","newCounty","newTownship"] },
      { title:"Entrance and location", help:"Add the best truck entrance address or coordinates. You can leave unknown fields blank.", ids:["newAddress","newLatitude","newLongitude","captureCoordinates"] },
      { title:"Wells and official numbers", help:"Add each well separately. Skip this step when the information is not available.", ids:["newWellNameDraft","addWellEntry"] },
      { title:"Driver directions", help:"Keep road sequence short, then add landmarks, gate information, and truck cautions.", ids:["newRoadSequence","newDirections","newNotes"] },
      { title:"Review and save", help:"Check the summary before adding it live or sending it for owner review.", ids:["newSubmitterName","newSubmitterContact"] }
    ];
    let addWizardStep = 0;
    function setupAddWizardFields() {
      ADD_WIZARD_STEPS.forEach((step, stepIndex) => step.ids.forEach(id => {
        const el = document.getElementById(id); const field = el?.closest(".add-pad-field");
        if (field) field.dataset.wizardStep = String(stepIndex);
      }));
      document.querySelectorAll("#addPadForm .add-pad-field").forEach(field => {
        if (!field.dataset.wizardStep && !field.classList.contains("add-pad-honeypot")) field.dataset.wizardStep = "4";
      });
    }
    function wizardValue(id) { return normalize(document.getElementById(id)?.value); }
    function validateAddWizardStep(step) {
      if (step === 0) {
        if (!wizardValue("newCompany") || !wizardValue("newPadName") || !wizardValue("newState")) { showToast("Company, pad name, and state are required"); return false; }
        refreshAddDuplicateWarning();
        if (duplicateCandidates(wizardValue("newCompany") === "__other__" ? wizardValue("newCompanyOther") : wizardValue("newCompany"), wizardValue("newState"), wizardValue("newPadName")).length) { showToast("Open the possible duplicate before continuing"); return false; }
      }
      if (step === 1) {
        try { optionalNumber("newLatitude",-90,90); optionalNumber("newLongitude",-180,180); } catch(error) { showToast(error.message); return false; }
      }
      return true;
    }
    function buildAddWizardReview() {
      const company = wizardValue("newCompany") === "__other__" ? wizardValue("newCompanyOther") : wizardValue("newCompany");
      const coords = [wizardValue("newLatitude"),wizardValue("newLongitude")].filter(Boolean).join(", ") || "Not provided";
      const items = [
        ["Pad", `${company || "Company missing"} · ${wizardValue("newPadName") || "Name missing"}`],
        ["Location", [wizardValue("newCounty"),wizardValue("newTownship"),wizardValue("newState")].filter(Boolean).join(" · ") || "Not provided"],
        ["Entrance", wizardValue("newAddress") || coords],
        ["Wells", newWellEntries.length ? `${newWellEntries.length} well entr${newWellEntries.length===1?"y":"ies"}` : "No wells added"],
        ["Directions", wizardValue("newDirections") || wizardValue("newRoadSequence") || "Not provided"]
      ];
      const review = document.getElementById("addWizardReview");
      if (review) review.innerHTML = items.map(([label,value]) => `<div class="add-wizard-review-card"><strong>${esc(label)}</strong><span>${esc(value)}</span></div>`).join("");
    }
    function renderAddWizardStep(nextStep=addWizardStep) {
      addWizardStep = Math.max(0,Math.min(ADD_WIZARD_STEPS.length-1,nextStep));
      setupAddWizardFields();
      document.querySelectorAll("#addPadForm .add-pad-field[data-wizard-step]").forEach(field => field.classList.toggle("wizard-visible", Number(field.dataset.wizardStep)===addWizardStep));
      document.querySelectorAll("[data-wizard-go]").forEach(button => { const n=Number(button.dataset.wizardGo); button.classList.toggle("active",n===addWizardStep); button.classList.toggle("done",n<addWizardStep); });
      const step=ADD_WIZARD_STEPS[addWizardStep];
      document.getElementById("addWizardTitle").textContent=step.title; document.getElementById("addWizardHelp").textContent=step.help; document.getElementById("addWizardCount").textContent=`Step ${addWizardStep+1} of ${ADD_WIZARD_STEPS.length}`;
      document.getElementById("addWizardBack").style.visibility=addWizardStep===0?"hidden":"visible";
      document.getElementById("addWizardNext").classList.toggle("hide",addWizardStep===ADD_WIZARD_STEPS.length-1);
      document.getElementById("addWizardReview").classList.toggle("hide",addWizardStep!==ADD_WIZARD_STEPS.length-1);
      document.getElementById("addWizardFinalActions").classList.toggle("wizard-final-hidden",addWizardStep!==ADD_WIZARD_STEPS.length-1);
      if(addWizardStep===ADD_WIZARD_STEPS.length-1) buildAddWizardReview();
      const addBody = document.querySelector(".add-pad-body");
      addBody?.scrollTo({top:0,left:0,behavior:"auto"});
      const progress = document.getElementById("addWizardProgress");
      if (progress) progress.scrollLeft = 0;
    }
    document.getElementById("addWizardNext")?.addEventListener("click",()=>{ if(validateAddWizardStep(addWizardStep)) renderAddWizardStep(addWizardStep+1); });
    document.getElementById("addWizardBack")?.addEventListener("click",()=>renderAddWizardStep(addWizardStep-1));
    document.getElementById("addWizardProgress")?.addEventListener("click",event=>{ const b=event.target.closest("[data-wizard-go]"); if(!b)return; renderAddWizardStep(Number(b.dataset.wizardGo)); });

    function openAddPad() {
      closeGlobalSearch();
      closeAssistant();
      addPadStatus.textContent = "";
      addPadStatus.className = "add-pad-status";
      populateNewCompanyOptions();
      updateOtherCompanyField();
      renderWellEntries();
      setupAddPadDirectionWizard();
      renderAddWizardStep(0);
      const addHead = addPadModal.querySelector(".add-pad-head p");
      const addSubmit = document.getElementById("submitAddPad");
      const addHelp = addPadModal.querySelector(".add-pad-help");
      if (addHead) addHead.textContent = editorCanEdit() ? "You are signed in as an approved editor. This pad will be added directly to the live directory." : "Send the location for owner review. It will not appear publicly until approved.";
      if (addSubmit) addSubmit.textContent = editorCanEdit() ? "Add pad to live directory" : "Master save & submit";
      if (addHelp) addHelp.innerHTML = editorCanEdit()
        ? 'Required fields are marked with *. Tap <strong>Add this well</strong> after each well, then tap <strong>Add pad to live directory</strong> when the review is complete.'
        : 'Required fields are marked with *. Tap <strong>Add this well</strong> after each well, then use <strong>Master save &amp; submit</strong> at the bottom. Submissions remain private until approved.';
      addPadModal.classList.add("open");
      document.body.style.overflow = "hidden";
      // Do not auto-focus on iPhone; it can zoom the sheet and make the whole app appear clipped.
    }

    function closeAddPad() {
      addPadModal.classList.remove("open");
      if (!globalSearchModal.classList.contains("open") && !assistantShell.classList.contains("open")) {
        document.body.style.overflow = "";
      }
    }

    function optionalNumber(id, min, max) {
      const value = normalize(document.getElementById(id)?.value);
      if (!value) return null;
      const number = Number(value);
      if (!Number.isFinite(number) || number < min || number > max) {
        throw new Error(id === "newLatitude" ? "Enter a valid latitude." : "Enter a valid longitude.");
      }
      return number;
    }

    async function submitNewPad(event) {
      event.preventDefault();
      addPadStatus.textContent = "";
      addPadStatus.className = "add-pad-status";

      const company = selectedNewCompany();
      const padName = normalize(document.getElementById("newPadName").value);
      const state = normalize(document.getElementById("newState").value);
      const submitterName = normalize(document.getElementById("newSubmitterName").value);

      if (!company || !padName || !state || !submitterName) {
        addPadStatus.textContent = "Fill in company, pad name, state, and your name.";
        addPadStatus.classList.add("error");
        return;
      }

      let latitude;
      let longitude;
      try {
        latitude = optionalNumber("newLatitude", -90, 90);
        longitude = optionalNumber("newLongitude", -180, 180);
      } catch (error) {
        addPadStatus.textContent = error.message;
        addPadStatus.classList.add("error");
        return;
      }

      const pendingWellDraft = readWellEntryDraft();
      if (pendingWellDraft.well_name || pendingWellDraft.api || pendingWellDraft.property_number) {
        if (!addCurrentWellEntry({ silent: true })) return;
      }

      const duplicateMatches = duplicateCandidates(company, state, padName);
      if (duplicateMatches.length) {
        addPadStatus.innerHTML = `Possible duplicate found: ${duplicateMatches.map(p => `<a href="${routeUrl(`pad/${encodeURIComponent(p._id)}`)}">${esc(display(p.padName))}</a>`).join(", ")}. Open the existing record first. If this is truly a different physical pad, change the name to clearly distinguish it.`;
        addPadStatus.classList.add("error");
        refreshAddDuplicateWarning();
        return;
      }

      submitAddPadButton.disabled = true;
      submitAddPadButton.textContent = "Master saving…";

      const payload = {
        p_record_type: document.getElementById("newRecordType").value,
        p_company: company,
        p_state: state,
        p_pad_name: padName,
        p_address: normalize(document.getElementById("newAddress").value) || null,
        p_latitude: latitude,
        p_longitude: longitude,
        p_county: normalize(document.getElementById("newCounty").value) || null,
        p_township: normalize(document.getElementById("newTownship").value) || null,
        p_well_name: newWellEntries.map(entry => entry.well_name).filter(Boolean).join(" | ") || null,
        p_api: newWellEntries.map(entry => entry.api).filter(Boolean).join(" | ") || null,
        p_property_number: newWellEntries.map(entry => entry.property_number).filter(Boolean).join(" | ") || null,
        p_well_entries: newWellEntries,
        p_structured_road_sequence: normalize(document.getElementById("newRoadSequence").value) || null,
        p_written_directions: normalize(document.getElementById("newDirections").value) || null,
        p_notes: normalize(document.getElementById("newNotes").value) || null,
        p_submitter_name: submitterName,
        p_submitter_contact: normalize(document.getElementById("newSubmitterContact").value) || null,
        p_client_token: submissionClientToken(),
        p_source_page: location.href,
        p_website: normalize(document.getElementById("newWebsite").value) || null
      };

      try {
        if (editorCanEdit()) {
          const directPayload = {
            p_record_type: payload.p_record_type, p_company: payload.p_company, p_state: payload.p_state, p_pad_name: payload.p_pad_name,
            p_address: payload.p_address, p_latitude: payload.p_latitude, p_longitude: payload.p_longitude,
            p_county: payload.p_county, p_township: payload.p_township, p_well_name: payload.p_well_name,
            p_api: payload.p_api, p_property_number: payload.p_property_number, p_well_entries: payload.p_well_entries,
            p_structured_road_sequence: payload.p_structured_road_sequence, p_written_directions: payload.p_written_directions, p_notes: payload.p_notes
          };
          const result = await editorRequest("/rest/v1/rpc/editor_add_pad", { method: "POST", body: JSON.stringify(directPayload) });
          const direct = Array.isArray(result) ? result[0] : result;
          if (!direct?.success) throw new Error(direct?.error || "The live pad could not be added.");
          addPadForm.reset();
          clearWellEntryDraft();
          document.getElementById("newState").value = "Ohio";
          document.getElementById("newCompanyOther")?.classList.add("hide");
          addPadStatus.textContent = "Added live! Reloading BrineSearch so the new pad appears in search.";
          addPadStatus.classList.add("success");
          showToast("Pad added to the live directory");
          setTimeout(() => location.reload(), 900);
          return;
        }

        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_pad`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        });

        const body = await response.text();
        if (!response.ok) {
          let message = body;
          try { message = JSON.parse(body)?.message || body; } catch {}
          if (message.includes("duplicate_submission")) {
            throw new Error("That pad is already waiting for review.");
          }
          if (message.includes("submission_limit")) {
            throw new Error("Too many submissions were sent recently. Try again later.");
          }
          throw new Error("The submission could not be sent. Please try again.");
        }

        addPadForm.reset();
        clearWellEntryDraft();
        document.getElementById("newState").value = "Ohio";
        document.getElementById("newCompanyOther")?.classList.add("hide");
        document.getElementById("coordinateCaptureStatus").textContent = "Use while stopped at the lease entrance or pad.";
        document.getElementById("coordinateCaptureStatus").className = "coordinate-capture-status";
        addPadStatus.textContent = "Submitted! The pad and all added wells are waiting for review before appearing in search.";
        addPadStatus.classList.add("success");
        showToast("Pad submitted for review");
      } catch (error) {
        addPadStatus.textContent = error.message || "The submission could not be sent.";
        addPadStatus.classList.add("error");
      } finally {
        submitAddPadButton.disabled = false;
        submitAddPadButton.textContent = editorCanEdit() ? "Add pad to live directory" : "Master save & submit";
      }
    }
    const allCompanies = [...new Set(padRecords.map(p => normalize(p.company) || "Unknown"))]
      .sort((a,b) => a.localeCompare(b));
    const liveCompanies = [...new Set(
      (DB.metadata?.live_companies_observed || allCompanies).map(normalize).filter(Boolean)
    )].sort((a,b) => a.localeCompare(b));
    populateNewCompanyOptions();
    restoreWellEntryDraft();

    const hiddenCompanyGroups = new Set(["Montage"]);
    const populatedCompanies = allCompanies.filter(company =>
      !hiddenCompanyGroups.has(company) &&
      padRecords.some(record => normalize(record.company) === company)
    );

    const allGroups = disposalRecords.length
      ? ["Disposals", ...populatedCompanies]
      : populatedCompanies;
    const allStates = [...new Set(pads.map(p => normalize(p.state)).filter(Boolean))]
      .sort((a,b) => a.localeCompare(b));
    const allCounties = [...new Set(pads.map(p => normalize(p.county)).filter(Boolean))]
      .sort((a,b) => a.localeCompare(b));

    function companyPads(company) {
      return pads.filter(p => normalize(p.company) === company)
        .sort((a,b) => normalize(a.padName).localeCompare(normalize(b.padName)));
    }

    function padById(id) {
      return pads.find(p => p._id === id);
    }

    function searchable(p) {
      const officialPad = p?.official_pad_record && typeof p.official_pad_record === "object"
        ? p.official_pad_record : {};
      const officialWells = Array.isArray(p?.official_well_records) ? p.official_well_records : [];
      const sourceText = Array.isArray(p?.researchSources)
        ? p.researchSources.map(source => typeof source === "string"
          ? source
          : [source?.agency, source?.service, source?.database, source?.type].filter(Boolean).join(" ")).join(" ")
        : "";
      return [
        p.company, p.padName, p.state, p.county, p.township, p.address,
        p.wellName, p.api, p.property, p.Structured_Road_Sequence, p.writtenDirections,
        p.directionsClear, p.recordType, p.verificationStatus, p.operatingStatus,
        p.researchStatus, p.researchNote, p.researchNotes, sourceText,
        officialPad.pad_name, officialPad.pad_id, officialPad.pad_permit,
        officialPad.pad_status, officialPad.operator, officialPad.county,
        officialPad.township, officialPad.source_method,
        ...officialWells.flatMap(well => [well?.well_name, well?.api, well?.well_status, well?.operator])
      ].map(normalize).join(" ").toLowerCase();
    }
