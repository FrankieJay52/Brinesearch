    const FALLBACK_DATA_URL = "pad-fallback-data.json";
    const VERIFIED_DIRECTION_REWRITES = await fetch("./data/directions/index.json", { cache: "no-store" })
      .then(async response => response.ok ? response.json() : { files: [] })
      .then(async manifest => Object.assign({}, ...(await Promise.all((manifest.files || []).map(async file => {
        try {
          const response = await fetch(`./data/directions/${file}`, { cache: "no-store" });
          return response.ok ? response.json() : {};
        } catch {
          return {};
        }
      })))))
      .catch(() => ({}));
    function verifiedDirectionFor(id, source) {
      const entry = VERIFIED_DIRECTION_REWRITES[String(id || "")];
      const current = String(source ?? "").trim();
      return entry && String(entry.s ?? "").trim() === current ? String(entry.r ?? "") : "";
    }
    const SUPABASE_URL = "https://wvxzqtoiwhrgovzddtvz.supabase.co";
    const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd";
    const PAGE_SIZE = 1000;
    const LIVE_DATABASE_FETCH_TIMEOUT_MS = 2200;

    async function fetchLiveDatabasePage(url, options = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("Live database request timed out")), LIVE_DATABASE_FETCH_TIMEOUT_MS);
      try {
        return await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }

    function mapSupabasePad(row) {
      const extra = row.extra_data && typeof row.extra_data === "object" ? row.extra_data : {};
      return {
        ...extra,
        _dbId: row.id,
        company: row.company,
        state: row.state,
        padName: row.pad_name,
        address: row.address,
        latitude: row.latitude,
        longitude: row.longitude,
        county: row.county,
        township: row.township,
        wellName: row.well_name,
        api: row.api,
        property: row.property_number,
        wellEntries: Array.isArray(row.well_entries) ? row.well_entries : [],
        Structured_Road_Sequence: row.structured_road_sequence,
        writtenDirections: row.written_directions,
        directionsClear: verifiedDirectionFor(row.legacy_id || row.id, row.written_directions) || row.directions_clear,
        directionsClearMethod: verifiedDirectionFor(row.legacy_id || row.id, row.written_directions)
          ? "Numbered field rewrite preserving saved mileage"
          : row.directions_clear_method,
        directionsClearUpdatedAt: row.directions_clear_updated_at,
        _id: row.legacy_id || row.id,
        _recordNumber: row.record_number,
        recordType: row.record_type || "pad",
        roadSequenceStatus: row.road_sequence_status,
        roadSequenceReviewedDate: row.road_sequence_reviewed_date,
        roadSequenceFinalCleanupDate: row.road_sequence_final_cleanup_date,
        verificationStatus: row.verification_status,
        operatingStatus: row.operating_status,
        importSource: row.import_source,
        importStatus: row.import_status,
        researchStatus: row.research_status,
        researchNote: row.research_note,
        researchSources: row.research_sources || [],
        researchDate: row.research_date,
        listOnly: Boolean(row.list_only),
        researchMethod: row.research_method,
        researchNotes: row.research_notes,
        numberOfRoadSteps: row.number_of_road_steps,
        sourceWorkbookRows: row.source_workbook_rows || [],
        alternateLocations: row.alternate_locations || [],
        lastUpdatedBy: row.last_updated_by,
        lastUpdatedDate: row.last_updated_date,
        auditSource: row.audit_source,
        auditVerified: row.audit_verified,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    }

    async function fetchLivePads() {
      const rows = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const url = new URL(`${SUPABASE_URL}/rest/v1/pads`);
        url.searchParams.set("select", "*");
        url.searchParams.set("order", "record_number.asc.nullslast,pad_name.asc");
        url.searchParams.set("limit", String(PAGE_SIZE));
        url.searchParams.set("offset", String(offset));

        const response = await fetchLiveDatabasePage(url.toString(), {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Accept: "application/json"
          },
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error(`Supabase returned ${response.status}`);
        }

        const batch = await response.json();
        if (!Array.isArray(batch)) throw new Error("Unexpected Supabase response");
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      return rows;
    }

    const appLoading = document.getElementById("app");
    if (appLoading) {
      appLoading.innerHTML = `<section class="home-hero"><div class="eyebrow">BrineSearch</div><h1>Loading directory…</h1><p class="lead">Connecting to the live pad database.</p></section>`;
    }

    async function fetchFallbackDb() {
      const response = await fetch(FALLBACK_DATA_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`Fallback dataset returned ${response.status}`);
      return response.json();
    }

    let DB;
    let DATA_SOURCE_LABEL;
    try {
      const liveRows = await fetchLivePads();
      if (!liveRows.length) throw new Error("Live database returned no rows");
      DB = {
        metadata: {
          source: "Supabase live database",
          total_records: liveRows.length,
          total_searchable_locations: liveRows.length
        },
        pads: liveRows.map(mapSupabasePad)
      };
      DATA_SOURCE_LABEL = "Live database";
    } catch (error) {
      console.warn("Live BrineSearch database unavailable; using offline backup.", error);
      DB = await fetchFallbackDb();
      DATA_SOURCE_LABEL = "Offline backup";
    }

    const PAD_EDIT_STORAGE_KEY = "brineSearch.padEdits.v1";

    function loadSavedPadEdits() {
      try {
        const parsed = JSON.parse(localStorage.getItem(PAD_EDIT_STORAGE_KEY) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    }

    const savedPadEdits = loadSavedPadEdits();

    // Must be available before automatic direction rewrites are generated.
    const normalize = value => String(value ?? "").trim();

    const OFFLINE_PAD_CACHE_KEY = "brinesearch.offlinePads.v1";
    const OFFLINE_PAD_DB_NAME = "brinesearch-offline-v1";
    const OFFLINE_PAD_STORE = "pads";
    const OFFLINE_RECENT_LIMIT = 10;
    function openOfflineDb(){
      return new Promise((resolve,reject)=>{
        if(!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
        const req=indexedDB.open(OFFLINE_PAD_DB_NAME,1);
        req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(OFFLINE_PAD_STORE)) db.createObjectStore(OFFLINE_PAD_STORE); };
        req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
      });
    }
    async function persistOfflineCacheToIndexedDb(cache){
      try{ const db=await openOfflineDb(); await new Promise((resolve,reject)=>{ const tx=db.transaction(OFFLINE_PAD_STORE,'readwrite'); tx.objectStore(OFFLINE_PAD_STORE).put(cache,'all'); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); }); db.close(); }catch{}
    }
    async function hydrateOfflineCacheFromIndexedDb(){
      try{ const db=await openOfflineDb(); const value=await new Promise((resolve,reject)=>{ const tx=db.transaction(OFFLINE_PAD_STORE,'readonly'); const req=tx.objectStore(OFFLINE_PAD_STORE).get('all'); req.onsuccess=()=>resolve(req.result||{}); req.onerror=()=>reject(req.error); }); db.close(); if(value&&Object.keys(value).length){ const local=readOfflinePadCache(); const merged={...value,...local}; localStorage.setItem(OFFLINE_PAD_CACHE_KEY,JSON.stringify(merged)); return merged; } }catch{} return readOfflinePadCache();
    }
    function readOfflinePadCache() {
      try {
        const parsed = JSON.parse(localStorage.getItem(OFFLINE_PAD_CACHE_KEY) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch { return {}; }
    }
    function writeOfflinePadCache(cache) {
      try { localStorage.setItem(OFFLINE_PAD_CACHE_KEY, JSON.stringify(cache)); } catch {}
      persistOfflineCacheToIndexedDb(cache);
    }
    const hydratedOfflinePadCache = await hydrateOfflineCacheFromIndexedDb();
    function offlineCachedRecord(id) { return readOfflinePadCache()[id]?.pad || hydratedOfflinePadCache[id]?.pad || null; }
    if (DATA_SOURCE_LABEL === "Offline backup" || !navigator.onLine) {
      const cached = hydratedOfflinePadCache;
      const byId = new Map((DB.pads || []).map(row => [row._id, row]));
      Object.values(cached).forEach(entry => { if (entry?.pad?._id) byId.set(entry.pad._id, entry.pad); });
      DB.pads = Array.from(byId.values());
    }

    const pads = (DB.pads || []).map(record => ({
      ...record,
      originalWrittenDirections: record.originalWrittenDirections || record.writtenDirections || null,
      directionsClear: verifiedDirectionFor(record._id, record.writtenDirections)
        || record.directionsClear
        || smartRewriteDirections(record.writtenDirections, record.Structured_Road_Sequence)
        || null,
      directionsClearMethod: verifiedDirectionFor(record._id, record.writtenDirections)
        ? "Numbered field rewrite preserving saved mileage"
        : (record.directionsClearMethod || (record.writtenDirections ? "Automatic field-format rewrite preserving saved facts" : null))
    }));
    const padRecords = pads.filter(p => p.recordType !== "disposal");
    const disposalRecords = pads.filter(p => p.recordType === "disposal");
    const app = document.getElementById("app");
    const toast = document.getElementById("toast");
    const footerCount = document.getElementById("footerCount");
    const dataSourceStatus = document.getElementById("dataSourceStatus");
    const globalSearchModal = document.getElementById("globalSearchModal");
    const addPadModal = document.getElementById("addPadModal");
    const addPadForm = document.getElementById("addPadForm");
    const addPadStatus = document.getElementById("addPadStatus");
    const submitAddPadButton = document.getElementById("submitAddPad");
    const alwaysSearchInput = document.getElementById("alwaysSearchInput");
    const alwaysSearchResults = document.getElementById("alwaysSearchResults");
    const alwaysSearchInfo = document.getElementById("alwaysSearchInfo");
    const advancedSearchPanel = document.getElementById("advancedSearchPanel");
    const toggleAdvancedSearch = document.getElementById("toggleAdvancedSearch");
    const advancedSearchField = document.getElementById("advancedSearchField");
    const advancedMatchMode = document.getElementById("advancedMatchMode");
    const advancedCompany = document.getElementById("advancedCompany");
    const advancedState = document.getElementById("advancedState");
    const advancedCounty = document.getElementById("advancedCounty");
    const advancedTownship = document.getElementById("advancedTownship");
    const advancedMissing = document.getElementById("advancedMissing");
    const advancedSort = document.getElementById("advancedSort");
    const advancedLimit = document.getElementById("advancedLimit");
    const activeSearchFilters = document.getElementById("activeSearchFilters");
    const requireMapReady = document.getElementById("requireMapReady");
    const requireGps = document.getElementById("requireGps");
    const requireAddress = document.getElementById("requireAddress");
    const requireApi = document.getElementById("requireApi");
    const requireProperty = document.getElementById("requireProperty");
    const requireWell = document.getElementById("requireWell");
    const requireRoad = document.getElementById("requireRoad");
    const requireDirections = document.getElementById("requireDirections");
    let currentAdvancedResults = [];
    if (footerCount) footerCount.textContent = "";
    if (dataSourceStatus) dataSourceStatus.textContent = `${DATA_SOURCE_LABEL} · ${pads.length.toLocaleString()} locations`;

    const esc = value => normalize(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
    const display = value => normalize(value) || "Not listed";
    const has = value => normalize(value).length > 0;
    const routeUrl = route => `#/${route}`;
    function debounce(fn, delay) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    }

    function submissionClientToken() {
      const key = "brinesearch.submissionClientToken.v1";
      let token = localStorage.getItem(key);
      if (!token) {
        const random = globalThis.crypto?.randomUUID?.() ||
          `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        token = `bs-${random}`;
        localStorage.setItem(key, token);
      }
      return token;
    }

    const NEW_WELL_DRAFT_KEY = "brinesearch.newPadWellEntries.v1";
    let newWellEntries = [];

    function populateNewCompanyOptions() {
      const select = document.getElementById("newCompany");
      if (!select || select.dataset.ready === "true") return;
      const companies = [...new Set(allCompanies.map(normalize).filter(company => company && company !== "Unknown"))]
        .sort((a, b) => a.localeCompare(b));
      select.innerHTML = `<option value="">Choose a company</option>${companies.map(company =>
        `<option value="${esc(company)}">${esc(company)}</option>`
      ).join("")}<option value="__other__">Other / new company…</option>`;
      select.dataset.ready = "true";
    }

    function updateOtherCompanyField() {
      const select = document.getElementById("newCompany");
      const other = document.getElementById("newCompanyOther");
      const help = document.getElementById("newCompanyHelp");
      const isOther = select?.value === "__other__";
      other?.classList.toggle("hide", !isOther);
      if (other) other.required = Boolean(isOther);
      if (help) help.textContent = isOther
        ? "Enter the company name below."
        : "Choose from companies already in BrineSearch.";
      if (isOther) setTimeout(() => other?.focus(), 25);
    }

    function selectedNewCompany() {
      const selected = normalize(document.getElementById("newCompany")?.value);
      return selected === "__other__"
        ? normalize(document.getElementById("newCompanyOther")?.value)
        : selected;
    }

    function readWellEntryDraft() {
      return {
        well_name: normalize(document.getElementById("newWellNameDraft")?.value),
        api: normalize(document.getElementById("newApiDraft")?.value),
        property_number: normalize(document.getElementById("newPropertyDraft")?.value)
      };
    }

    function saveWellEntryDraft() {
      localStorage.setItem(NEW_WELL_DRAFT_KEY, JSON.stringify(newWellEntries));
    }

    function restoreWellEntryDraft() {
      try {
        const saved = JSON.parse(localStorage.getItem(NEW_WELL_DRAFT_KEY) || "[]");
        if (Array.isArray(saved)) {
          newWellEntries = saved.slice(0, 50).map(entry => ({
            well_name: normalize(entry?.well_name),
            api: normalize(entry?.api),
            property_number: normalize(entry?.property_number)
          })).filter(entry => entry.well_name || entry.api || entry.property_number);
        }
      } catch {
        newWellEntries = [];
      }
      renderWellEntries();
    }

    function renderWellEntries() {
      const list = document.getElementById("wellEntryList");
      const status = document.getElementById("wellEntryStatus");
      if (!list) return;
      if (!newWellEntries.length) {
        list.innerHTML = `<div class="well-entry-empty">No wells added yet.</div>`;
        if (status) {
          status.textContent = "Add each well separately. It is saved in this form until the master save.";
          status.className = "";
        }
        return;
      }
      list.innerHTML = newWellEntries.map((entry, index) => `
        <div class="well-entry-card">
          <div>
            <strong>${esc(entry.well_name || `Well ${index + 1}`)}</strong>
            <small>${entry.api ? `API: ${esc(entry.api)}` : "API not entered"}${entry.property_number ? ` · Property: ${esc(entry.property_number)}` : ""}</small>
          </div>
          <button class="well-entry-remove" data-well-index="${index}" type="button">Remove</button>
        </div>`).join("");
      if (status) {
        status.textContent = `${newWellEntries.length} well${newWellEntries.length === 1 ? "" : "s"} saved in this form.`;
        status.className = "success";
      }
    }
