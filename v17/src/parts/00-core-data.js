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
          status.textContent = "Add each well separately. You can submit a pad even if no wells are known yet.";
          status.className = "well-entry-status";
        }
        return;
      }
      list.innerHTML = newWellEntries.map((entry, index) => `
        <article class="well-entry-card">
          <span class="well-entry-number">${index + 1}</span>
          <div class="well-entry-copy">
            <strong>${esc(entry.well_name || `Well ${index + 1}`)}</strong>
            <small>${esc([entry.api && `API ${entry.api}`, entry.property_number && `Property ${entry.property_number}`].filter(Boolean).join(" · ") || "No API or property number entered")}</small>
          </div>
          <button type="button" data-well-index="${index}" aria-label="Remove ${esc(entry.well_name || `well ${index + 1}`)}">Remove</button>
        </article>`).join("");
      if (status) {
        status.textContent = `${newWellEntries.length} well${newWellEntries.length === 1 ? "" : "s"} ready to submit with this pad.`;
        status.className = "well-entry-status ready";
      }
    }

    function addCurrentWellEntry() {
      const entry = readWellEntryDraft();
      const status = document.getElementById("wellEntryStatus");
      if (!entry.well_name && !entry.api && !entry.property_number) {
        if (status) {
          status.textContent = "Enter a well name, API number, or property number before adding this well.";
          status.className = "well-entry-status error";
        }
        return false;
      }
      newWellEntries.push(entry);
      saveWellEntryDraft();
      ["newWellNameDraft", "newApiDraft", "newPropertyDraft"].forEach(id => {
        const field = document.getElementById(id);
        if (field) field.value = "";
      });
      renderWellEntries();
      document.getElementById("newWellNameDraft")?.focus();
      return true;
    }

    const ROAD_NAME_CORRECTIONS = new Map([
      ["fork ridge rd", "Fork Ridge Rd"],
      ["sommerton hwy", "Somerton Hwy"],
      ["sommerton highway", "Somerton Hwy"],
      ["barnesvile bethesda rd", "Barnesville-Bethesda Rd"],
      ["barnesville bethesda rd", "Barnesville-Bethesda Rd"]
    ]);
    const ROAD_NAME_ALIASES = {
      "oh-147": ["Bethesda Belmont Rd", "Barnesville Bethesda Rd", "Barnesville-Bethesda Rd", "Bethesda-Belmont Rd"],
      "oh-149": ["Belmont Warnock Rd", "Warnock Glencoe Rd", "Belmont-Warnock Rd", "Warnock-Glencoe Rd"],
      "oh-151": ["Hopedale Smithfield Rd", "Hopedale-Smithfield Rd"],
      "oh-152": ["Smithfield Dillonvale Rd", "Smithfield-Dillonvale Rd"]
    };
    function roadStatePrefix(p) {
      const state = normalize(p?.state).toLowerCase();
      if (state === "oh" || state === "ohio") return "OH";
      if (state === "wv" || state === "west virginia") return "WV";
      if (state === "pa" || state === "pennsylvania") return "PA";
      return "SR";
    }
    function roadTitleCase(value) {
      return normalize(value).toLowerCase().replace(/\b[a-z]/g, char => char.toUpperCase());
    }
    function splitDirectionRoutes(value) {
      return normalize(value).split(/\s*\|\|\s*/).map(route => route.split(/\s*(?:→|->)\s*/).map(normalize).filter(Boolean)).filter(route => route.length);
    }
    function encodeRoadMeta(name, note, distance, direction) {
      return JSON.stringify({ name:normalize(name), note:normalize(note), distance:normalize(distance), direction:normalize(direction) });
    }
    function decodeRoadMeta(value) {
      try {
        const parsed = JSON.parse(value || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch { return {}; }
    }
    function normalizeCompassDirection(value) {
      const v = normalize(value).toUpperCase().replaceAll(".", "");
      const map = {
        N:"N", NORTH:"N", S:"S", SOUTH:"S", E:"E", EAST:"E", W:"W", WEST:"W",
        NE:"NE", NORTHEAST:"NE", NW:"NW", NORTHWEST:"NW", SE:"SE", SOUTHEAST:"SE", SW:"SW", SOUTHWEST:"SW"
      };
      return map[v] || "";
    }
    function compassDirectionLabel(value) {
      const v = normalizeCompassDirection(value);
      const labels = { N:"North", S:"South", E:"East", W:"West", NE:"Northeast", NW:"Northwest", SE:"Southeast", SW:"Southwest" };
      return labels[v] || "";
    }
    function decodeDirectionMeta(value) {
      const raw = normalize(value);
      const m = raw.match(/^(.*?)\s*⟦d=([^;]*);n=([^;]*);c=([^\]]*)⟧$/);
      if (!m) return { instruction:raw, distance:"", note:"", cardinal:"" };
      let note="";
      try { note=decodeURIComponent(m[3] || ""); } catch { note=m[3] || ""; }
      return { instruction:normalize(m[1]), distance:normalize(m[2]), note:normalize(note), cardinal:normalizeCompassDirection(m[4]) };
    }
    function cleanLegacyDirectionText(value) {
      return normalize(value).replace(/^[•·\-]+\s*/, "").replace(/\s+/g, " ");
    }
    function parseRouteInstruction(value, p) {
      const step=decodeDirectionMeta(value);
      const instruction=normalizeDirectionInstruction(step.instruction,p).text;
      return encodeDirectionStep(instruction,step.distance,step.note,step.cardinal);
    }
    function structuredSequenceToDirections(sequence,p) {
      const routes=splitDirectionRoutes(sequence);
      return routes.map(route=>route.map(step=>parseRouteInstruction(step,p)).join(" → ")).join(" || ");
    }
    function isDirectionRouteEncoded(value) {
      return /⟦d=/.test(normalize(value));
    }
    function normalizeDirectionRouteValue(value,p) {
      const raw=normalize(value);
      if(!raw) return "";
      return splitDirectionRoutes(raw).map(route=>route.map(step=>parseRouteInstruction(step,p)).join(" → ")).join(" || ");
    }
    function smartRewriteDirections(written, structured) {
      const source=normalize(written);
      if(!source) return normalize(structured);
      const cleaned=source.replace(/\s+/g," ").replace(/\s+([,.;])/g,"$1").trim();
      const chunks=cleaned.split(/(?<=[.!?])\s+|\s+(?=(?:Turn|Continue|Head|Take|Merge|Keep|Slight|Destination)\b)/i).map(normalize).filter(Boolean);
      return (chunks.length > 1 ? chunks : [cleaned]).join(" → ");
    }
    function padById(id){return pads.find(p=>p._id===id)||offlineCachedRecord(id);}
    function getModifiedPad(p){
      const saved=savedPadEdits[p._id];
      return saved?{...p,...saved}:p;
    }
    function applyLocalPadEdit(p,updates){
      savedPadEdits[p._id]={...(savedPadEdits[p._id]||{}),...updates};
      localStorage.setItem(PAD_EDIT_STORAGE_KEY,JSON.stringify(savedPadEdits));
      Object.assign(p,updates);
      return p;
    }
    function parseWellEntries(p) {
      const normalizeWellEntry = entry => ({
        well_name: normalize(entry?.well_name ?? entry?.wellName ?? entry?.name),
        api: normalize(entry?.api ?? entry?.api_number ?? entry?.apiNumber),
        property_number: normalize(entry?.property_number ?? entry?.propertyNumber ?? entry?.property)
      });
      const entries = Array.isArray(p?.wellEntries) ? p.wellEntries.map(normalizeWellEntry).filter(entry => entry.well_name || entry.api || entry.property_number) : [];
      if (entries.length) return entries;
      const names=normalize(p?.wellName).split(/\s*\|\s*/).filter(Boolean);
      const apis=normalize(p?.api).split(/\s*\|\s*/).filter(Boolean);
      const properties=normalize(p?.property).split(/\s*\|\s*/).filter(Boolean);
      const count=Math.max(names.length,apis.length,properties.length,0);
      return Array.from({length:count},(_,index)=>({
        well_name:names[index]||"", api:apis[index]||"", property_number:properties[index]||""
      })).filter(entry=>entry.well_name||entry.api||entry.property_number);
    }
    function primaryWellEntry(p){return parseWellEntries(p)[0]||{well_name:"",api:"",property_number:""};}
    function safeNavigateCoordinate(value,axis){
      const n=Number(value);
      if(!Number.isFinite(n)) return null;
      if(axis==="lat" && (n < -90 || n > 90)) return null;
      if(axis==="lon" && (n < -180 || n > 180)) return null;
      return n;
    }
    function padNavigatePoint(p){
      const lat=safeNavigateCoordinate(p.latitude,"lat");
      const lon=safeNavigateCoordinate(p.longitude,"lon");
      if(lat===null||lon===null) return null;
      return {lat,lon};
    }
    function padGoogleMapsUrl(p){
      const point=padNavigatePoint(p);
      if(point) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${point.lat},${point.lon}`)}`;
      if(has(p.address)) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.address)}`;
      return "";
    }
    function padShareUrl(p){
      return `${location.origin}${location.pathname}#/pad/${encodeURIComponent(p._id)}`;
    }
    function appShareText(p){
      const well=primaryWellEntry(p);
      const lines=[`${p.company} — ${p.padName}`,p.address,well.well_name&&`Well: ${well.well_name}`,well.api&&`API: ${well.api}`,well.property_number&&`Property: ${well.property_number}`,p.writtenDirections&&`Directions: ${p.writtenDirections}`,padShareUrl(p)].filter(Boolean);
      return lines.join("\n");
    }
    async function sharePad(p){
      const text=appShareText(p);
      try{
        if(navigator.share){await navigator.share({title:`${p.padName} · BrineSearch`,text,url:padShareUrl(p)});return;}
        await navigator.clipboard.writeText(text);showToast("Pad details copied");
      }catch(error){if(error?.name!=="AbortError")showToast("Could not share pad");}
    }
    function favoriteIds(){try{return new Set(JSON.parse(localStorage.getItem("brinesearch.favorites.v1")||"[]"));}catch{return new Set();}}
    function saveFavoriteIds(set){localStorage.setItem("brinesearch.favorites.v1",JSON.stringify([...set]));}
    function isFavorite(id){return favoriteIds().has(id);}
    function toggleFavorite(id){const set=favoriteIds();if(set.has(id))set.delete(id);else set.add(id);saveFavoriteIds(set);return set.has(id);}
    function recentIds(){try{return JSON.parse(localStorage.getItem("brinesearch.recentPads.v1")||"[]");}catch{return [];}}
    function touchRecent(id){const list=[id,...recentIds().filter(item=>item!==id)].slice(0,8);localStorage.setItem("brinesearch.recentPads.v1",JSON.stringify(list));}
    function saveOfflinePad(p){const cache=readOfflinePadCache();cache[p._id]={pad:p,savedAt:new Date().toISOString()};writeOfflinePadCache(cache);return cache[p._id];}
    function removeOfflinePad(id){const cache=readOfflinePadCache();delete cache[id];writeOfflinePadCache(cache);}
    function isPadOffline(id){return Boolean(readOfflinePadCache()[id]||hydratedOfflinePadCache[id]);}
    function storageUsage(){try{return new Blob([JSON.stringify(readOfflinePadCache())]).size;}catch{return 0;}}
    function formatBytes(bytes){if(!bytes)return"0 KB";if(bytes<1024)return`${bytes} B`;if(bytes<1024*1024)return`${(bytes/1024).toFixed(1)} KB`;return`${(bytes/(1024*1024)).toFixed(1)} MB`;}
    function readServiceWorkerFlag(){return navigator.serviceWorker?.controller?"Ready":"Starting";}
    function readOnlineStatus(){return navigator.onLine?"Online":"Offline";}
    function recordsForSearch(){return pads;}
    function listRoadNames(){return [...new Set(pads.flatMap(p=>splitDirectionRoutes(p.Structured_Road_Sequence).flat()).map(step=>normalizeRoadName(decodeDirectionMeta(step).instruction||step,{}).text).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
    function readAddPadDraft() {
      try { return JSON.parse(localStorage.getItem("brinesearch.addPadDraft.v1") || "{}"); }
      catch { return {}; }
    }
    function writeAddPadDraft(value) { localStorage.setItem("brinesearch.addPadDraft.v1", JSON.stringify(value)); }
    function clearAddPadDraft() { localStorage.removeItem("brinesearch.addPadDraft.v1"); }
    function collectAddPadDraft() {
      const ids=["newPadName","newCompany","newCompanyOther","newState","newAddress","newLatitude","newLongitude","newWrittenDirections","newGateCode","newPadNotes"];
      const draft=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)?.value||""]));
      draft.newCompanyOtherVisible=document.getElementById("newCompany")?.value==="__other__";
      return draft;
    }
    function restoreAddPadDraft() {
      const draft=readAddPadDraft();
      for(const [id,value] of Object.entries(draft)){
        const el=document.getElementById(id);if(el&&id!=="newCompanyOtherVisible")el.value=value;
      }
      updateOtherCompanyField();
    }
    function addPadDuplicateCandidates() {
      const padName=normalize(document.getElementById("newPadName")?.value).toLowerCase();
      const company=selectedNewCompany().toLowerCase();
      const state=normalize(document.getElementById("newState")?.value).toLowerCase();
      if(!padName)return[];
      return pads.filter(p=>normalize(p.padName).toLowerCase()===padName&&(!company||normalize(p.company).toLowerCase()===company)&&(!state||normalize(p.state).toLowerCase()===state)).slice(0,5);
    }
    function refreshAddDuplicateWarning() {
      const box=document.getElementById("addDuplicateWarning");if(!box)return;
      const matches=addPadDuplicateCandidates();
      if(!matches.length){box.hidden=true;box.innerHTML="";return;}
      box.hidden=false;box.innerHTML=`<strong>Possible duplicate</strong>${matches.map(p=>`<a href="#/pad/${encodeURIComponent(p._id)}">${esc(p.company)} · ${esc(p.padName)}</a>`).join("")}`;
    }
    const ADD_PAD_STEPS=["basics","location","directions","wells","review"];
    let addPadWizardStep=0;
    function openAddPad(){
      populateNewCompanyOptions();
      restoreAddPadDraft();
      restoreWellEntryDraft();
      addPadWizardStep=0;renderAddPadWizard();
      addPadModal.classList.add("open");document.body.classList.add("modal-open");document.getElementById("newPadName")?.focus();
    }
    function closeAddPad(){addPadModal.classList.remove("open");document.body.classList.remove("modal-open");}
    function renderAddPadWizard(){
      ADD_PAD_STEPS.forEach((step,index)=>document.querySelector(`[data-add-step="${step}"]`)?.classList.toggle("hide",index!==addPadWizardStep));
      document.getElementById("addWizardBack").disabled=addPadWizardStep===0;
      document.getElementById("addWizardNext").classList.toggle("hide",addPadWizardStep===ADD_PAD_STEPS.length-1);
      document.getElementById("addWizardFinalActions").classList.toggle("wizard-final-hidden",addPadWizardStep!==ADD_PAD_STEPS.length-1);
      document.querySelectorAll("[data-add-progress]").forEach((el,index)=>el.classList.toggle("active",index<=addPadWizardStep));
      if(addPadWizardStep===ADD_PAD_STEPS.length-1)renderAddReview();
    }
    function renderAddReview(){
      const box=document.getElementById("addWizardReview");if(!box)return;
      const company=selectedNewCompany();const wells=newWellEntries.length?`${newWellEntries.length} well${newWellEntries.length===1?"":"s"}`:"No wells added";
      box.innerHTML=`<strong>Review new pad</strong><div>${esc(company||"No company")}</div><div>${esc(document.getElementById("newPadName")?.value||"No pad name")}</div><div>${esc(document.getElementById("newState")?.value||"No state")}</div><div>${esc(wells)}</div>`;
      box.classList.remove("hide");
    }
    function addWizardNext(){writeAddPadDraft(collectAddPadDraft());if(addPadWizardStep<ADD_PAD_STEPS.length-1){addPadWizardStep+=1;renderAddPadWizard();}}
    function addWizardBack(){if(addPadWizardStep>0){addPadWizardStep-=1;renderAddPadWizard();}}
    document.getElementById("addWizardNext")?.addEventListener("click",addWizardNext);
    document.getElementById("addWizardBack")?.addEventListener("click",addWizardBack);
    ["newPadName","newCompany","newCompanyOther","newState","newAddress","newLatitude","newLongitude","newWrittenDirections","newGateCode","newPadNotes"].forEach(id=>document.getElementById(id)?.addEventListener("input",()=>writeAddPadDraft(collectAddPadDraft())));
    document.getElementById("newState")?.addEventListener("change",()=>writeAddPadDraft(collectAddPadDraft()));
    const addPadWizardOriginalSubmit=typeof submitNewPad==="function"?submitNewPad:null;
    async function submitNewPad(event){
      event?.preventDefault();
      if(!addPadWizardOriginalSubmit)return;
      await addPadWizardOriginalSubmit(event);
      if(/submitted|saved/i.test(document.getElementById("addPadStatus")?.textContent||"")){clearAddPadDraft();newWellEntries=[];saveWellEntryDraft();}
    }
    /* SEARCH_GLOBAL_OVERLAY_CORE */
