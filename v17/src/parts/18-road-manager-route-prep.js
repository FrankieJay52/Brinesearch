    /* BrineSearch Road Manager Route Prep
       Turns the saved 833-pad route inventory into an Owner-only review queue.
       Safety rule: local/county/township/private roads are never guessed. A
       generic "Route N" can only exist as a non-publishable state-route
       candidate until the Owner explicitly reviews it. */

    const ROUTE_PREP_STATUS = {
      ready_for_road_matching:["Ready for road matching","ready"],
      needs_state_route_candidate_review:["State-route candidate review","candidate"],
      needs_highway_anchor:["Needs highway anchor","warning"],
      needs_sequence_reorder:["Highway must be moved first","warning"],
      needs_sequence_rebuild:["Route sequence must be rebuilt","danger"],
      needs_sequence_cleanup:["Route sequence needs cleanup","warning"],
      needs_gps_review:["GPS needs review","danger"],
      ready_for_geometry:["Ready for geometry","ready"],
      geometry_measured:["Geometry measured","measured"],
      field_check:["Field check required","field"],
      approved:["Approved","approved"],
      blocked:["Blocked — do not use","danger"]
    };
    const ROUTE_PREP_ISSUES = {
      gps_outside_expected_state:"GPS falls outside the expected state",
      not_enough_road_steps:"Not enough road steps",
      too_many_road_steps:"Too many steps for safe automatic cleanup",
      narrative_text_in_sequence:"Narrative instructions are mixed into the road sequence",
      missing_explicit_highway_anchor:"No explicit interstate, U.S. route, or state route",
      state_route_candidate_only:"Only a generic Route number was found",
      highway_not_first_road_step:"The highway is not the first road step",
      sequence_mostly_generic:"The route is mostly generic labels"
    };
    const ROUTE_PREP_STEP_KIND = {
      interstate:"Interstate",us_route:"U.S. route",state_route:"State route",
      state_route_candidate:"State-route candidate",county_road:"County road",
      township_road:"Township road",local_road:"Local road",private_segment:"Private / lease segment",
      exit_note:"Exit note",generic:"Generic step",unknown:"Unknown step"
    };
    const ROUTE_PREP_MATCH = {
      exact_master:"Exact Road Manager match",explicit_highway:"Explicit highway",
      state_route_candidate:"State-route candidate only",needs_official_match:"Needs official road match",
      private_segment:"Private / field-only segment",route_note:"Route note",needs_review:"Needs review",
      rejected:"Rejected"
    };
    const routePrepState = {
      tab: localStorage.getItem("brinesearch.roadManagerTab.v1") === "prep" ? "prep" : "roads",
      search:"",status:"all",state:"all",company:"all",offset:0,limit:30,total:0,
      summary:null,items:[],loading:false,detail:null
    };

    function routePrepStatusInfo(status){
      const row=ROUTE_PREP_STATUS[status]||[String(status||"Needs review").replace(/_/g," "),"warning"];
      return {label:row[0],tone:row[1]};
    }
    function routePrepIssueLabel(value){return ROUTE_PREP_ISSUES[value]||String(value||"").replace(/_/g," ");}
    function routePrepStepKind(value){return ROUTE_PREP_STEP_KIND[value]||String(value||"Road step").replace(/_/g," ");}
    function routePrepMatchLabel(value){return ROUTE_PREP_MATCH[value]||String(value||"Pending").replace(/_/g," ");}
    function routePrepDate(value){if(!value)return "";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});}
    function routePrepMiles(value){const n=Number(value);return Number.isFinite(n)?`${n.toFixed(n<1?2:1)} mi`:"";}
    async function routePrepRpc(name,body={}){
      return editorRequest(`/rest/v1/rpc/${name}`,{method:"POST",body:JSON.stringify(body)});
    }

    const renderSettingsWithoutRoutePrep = renderSettings;
    renderSettings = function(){
      renderSettingsWithoutRoutePrep();
      if(!settingsRoleInfo().isOwner)return;
      const ownerSection=[...document.querySelectorAll(".settings-section")].find(section=>section.querySelector("h2")?.textContent?.includes("Owner controls"));
      const list=ownerSection?.querySelector(".settings-list");
      if(!list)return;
      [...list.querySelectorAll(".settings-row")].forEach(row=>{
        const title=row.querySelector("strong")?.textContent?.trim().toLowerCase();
        if(title==="road manager"||title==="road database")row.remove();
      });
      const button=document.createElement("button");
      button.className="settings-row";
      button.type="button";
      button.innerHTML=`<span class="settings-icon"><span class="fm-icon fm-road"></span></span><span class="settings-copy"><strong>Road Manager</strong><small>Master roads, 833-pad Route Prep, mileage readiness and no-guess review</small></span><span class="settings-caret">›</span>`;
      button.addEventListener("click",()=>{location.hash="#/settings/roads";});
      list.prepend(button);
    };

    function renderRoadManagerTabs(){
      const tabs=document.getElementById("roadManagerTabs");
      if(!tabs)return;
      tabs.querySelectorAll("[data-road-manager-tab]").forEach(button=>{
        const active=button.dataset.roadManagerTab===routePrepState.tab;
        button.classList.toggle("active",active);
        button.setAttribute("aria-selected",String(active));
        button.onclick=()=>{
          routePrepState.tab=button.dataset.roadManagerTab;
          localStorage.setItem("brinesearch.roadManagerTab.v1",routePrepState.tab);
          renderRoadManagerTabPanel();
          renderRoadManagerTabs();
        };
      });
    }

    function renderMasterRoadTab(){
      const panel=document.getElementById("roadManagerTabPanel");
      if(!panel)return;
      panel.innerHTML=`<section class="road-manager-card road-master-panel">
        <div class="road-manager-section-head"><div><span class="road-manager-kicker">Shared master database</span><h2>Road records</h2><p>Fix a road once, preserve aliases and official sources, then reuse it across pad routes.</p></div><span class="road-manager-count">${roadManagerRows.length||"—"}</span></div>
        <div class="road-manager-tools"><input id="roadManagerSearch" placeholder="Search official names, aliases or route numbers…" autocomplete="off"><button class="btn primary" id="roadManagerAdd" type="button"><span class="fm-icon fm-add"></span> Add road</button></div>
        <div class="road-list" id="roadManagerList"></div>
      </section><div id="roadManagerEditor"></div>`;
      let timer;
      document.getElementById("roadManagerSearch").oninput=()=>{clearTimeout(timer);timer=setTimeout(loadRoadManager,180);};
      document.getElementById("roadManagerAdd").onclick=()=>renderRoadForm();
      loadRoadManager();
    }

    function routePrepSummaryCard(status,count){
      const info=routePrepStatusInfo(status);
      return `<button type="button" class="route-prep-summary-card ${info.tone}" data-route-prep-summary="${esc(status)}"><strong>${Number(count||0).toLocaleString()}</strong><span>${esc(info.label)}</span></button>`;
    }
    function routePrepOverviewMarkup(summary){
      const readiness=summary?.readiness||{};
      const order=["ready_for_road_matching","needs_state_route_candidate_review","needs_highway_anchor","needs_sequence_reorder","needs_sequence_rebuild","needs_sequence_cleanup","needs_gps_review","field_check","ready_for_geometry","geometry_measured","approved","blocked"];
      return `<section class="route-prep-overview">
        <div class="route-prep-policy"><span class="fm-icon fm-locked"></span><div><strong>Strict no-guess policy</strong><p>${esc(summary?.policy||"Local roads are never guessed. State-route candidates never publish until Owner review.")}</p></div></div>
        <div class="route-prep-headline-stats">
          <div><strong>${Number(summary?.distinct_pads||0).toLocaleString()}</strong><span>Pads prepared</span></div>
          <div><strong>${Number(summary?.route_variants||0).toLocaleString()}</strong><span>Route variants</span></div>
          <div><strong>${Number(summary?.matched_steps||0).toLocaleString()}</strong><span>Exact road matches</span></div>
          <div><strong>${Number(summary?.unmatched_local_steps||0).toLocaleString()}</strong><span>Local roads still requiring official matches</span></div>
        </div>
        <div class="route-prep-summary-grid">${order.filter(key=>Number(readiness[key]||0)>0).map(key=>routePrepSummaryCard(key,readiness[key])).join("")}</div>
      </section>`;
    }

    function routePrepItemMarkup(item){
      const info=routePrepStatusInfo(item.readiness_status);
      const issues=Array.isArray(item.issue_codes)?item.issue_codes:[];
      const variant=item.route_group==="alternate"?`Alternate ${item.variant_index}`:"Primary route";
      return `<article class="route-prep-card" data-route-prep-card="${esc(item.id)}">
        <button type="button" class="route-prep-card-main" data-route-prep-open="${esc(item.id)}">
          <span class="route-prep-status ${info.tone}">${esc(info.label)}</span>
          <span class="route-prep-card-title"><strong>${esc(item.pad_name)}</strong><small>${esc([item.company,item.state,item.county,variant].filter(Boolean).join(" · "))}</small></span>
          <span class="route-prep-card-sequence">${esc(item.normalized_sequence||item.source_sequence)}</span>
          <span class="route-prep-card-metrics">
            <span><b>${Number(item.step_matched||0)}</b> / ${Number(item.step_total||0)} matched</span>
            ${Number(item.step_unmatched_local||0)?`<span class="warn"><b>${Number(item.step_unmatched_local)}</b> official road matches needed</span>`:""}
            ${Number(item.step_candidates||0)?`<span class="candidate"><b>${Number(item.step_candidates)}</b> state-route candidate${Number(item.step_candidates)===1?"":"s"}</span>`:""}
            ${Number(item.step_private||0)?`<span><b>${Number(item.step_private)}</b> private / lease</span>`:""}
          </span>
          ${issues.length?`<span class="route-prep-issue-row">${issues.map(issue=>`<span>${esc(routePrepIssueLabel(issue))}</span>`).join("")}</span>`:""}
        </button>
        <div class="route-prep-card-actions"><a href="#/pad/${encodeURIComponent(item.legacy_id||item.pad_id)}">Open pad</a><button type="button" data-route-prep-open="${esc(item.id)}">Review</button></div>
      </article>`;
    }

    async function loadRoutePrepSummary(){
      try{
        routePrepState.summary=await routePrepRpc("road_manager_route_prep_summary");
        const host=document.getElementById("routePrepOverview");
        if(host)host.innerHTML=routePrepOverviewMarkup(routePrepState.summary);
        document.querySelectorAll("[data-route-prep-summary]").forEach(button=>button.onclick=()=>{
          routePrepState.status=button.dataset.routePrepSummary;
          routePrepState.offset=0;
          const select=document.getElementById("routePrepStatus");if(select)select.value=routePrepState.status;
          loadRoutePrepList();
        });
      }catch(error){
        const host=document.getElementById("routePrepOverview");
        if(host)host.innerHTML=`<div class="route-prep-error"><strong>Could not load Route Prep totals</strong><p>${esc(error.message||"Try again.")}</p></div>`;
      }
    }

    async function loadRoutePrepList(){
      const list=document.getElementById("routePrepList");
      const count=document.getElementById("routePrepResultCount");
      if(!list)return;
      routePrepState.loading=true;
      list.innerHTML=`<div class="route-prep-loading"><span class="fm-icon fm-sync"></span> Loading prepared routes…</div>`;
      try{
        const data=await routePrepRpc("road_manager_route_prep_list",{
          p_search:routePrepState.search||null,
          p_status:routePrepState.status==="all"?null:routePrepState.status,
          p_state:routePrepState.state==="all"?null:routePrepState.state,
          p_company:routePrepState.company==="all"?null:routePrepState.company,
          p_limit:routePrepState.limit,p_offset:routePrepState.offset
        });
        routePrepState.total=Number(data?.total||0);
        routePrepState.items=Array.isArray(data?.items)?data.items:[];
        if(count)count.textContent=`${routePrepState.total.toLocaleString()} route variant${routePrepState.total===1?"":"s"}`;
        list.innerHTML=routePrepState.items.length?routePrepState.items.map(routePrepItemMarkup).join(""):`<div class="route-prep-empty"><span class="fm-icon fm-search"></span><strong>No prepared routes matched</strong><p>Change a filter or refresh the 833-pad analysis.</p></div>`;
        list.querySelectorAll("[data-route-prep-open]").forEach(button=>button.onclick=()=>openRoutePrepDetail(button.dataset.routePrepOpen));
        renderRoutePrepPager();
      }catch(error){
        list.innerHTML=`<div class="route-prep-error"><strong>Could not load Route Prep</strong><p>${esc(error.message||"Try again.")}</p><button class="btn secondary" type="button" id="routePrepRetry">Retry</button></div>`;
        document.getElementById("routePrepRetry")?.addEventListener("click",loadRoutePrepList);
      }finally{routePrepState.loading=false;}
    }

    function renderRoutePrepPager(){
      const host=document.getElementById("routePrepPager");if(!host)return;
      const first=routePrepState.total?routePrepState.offset+1:0;
      const last=Math.min(routePrepState.total,routePrepState.offset+routePrepState.limit);
      host.innerHTML=`<button type="button" class="btn ghost small" id="routePrepPrevious" ${routePrepState.offset<=0?"disabled":""}>← Previous</button><span>${first.toLocaleString()}–${last.toLocaleString()} of ${routePrepState.total.toLocaleString()}</span><button type="button" class="btn ghost small" id="routePrepNext" ${last>=routePrepState.total?"disabled":""}>Next →</button>`;
      document.getElementById("routePrepPrevious")?.addEventListener("click",()=>{routePrepState.offset=Math.max(0,routePrepState.offset-routePrepState.limit);loadRoutePrepList();window.scrollTo({top:0,behavior:"smooth"});});
      document.getElementById("routePrepNext")?.addEventListener("click",()=>{routePrepState.offset+=routePrepState.limit;loadRoutePrepList();window.scrollTo({top:0,behavior:"smooth"});});
    }

    function renderRoutePrepTab(){
      const panel=document.getElementById("roadManagerTabPanel");if(!panel)return;
      const statuses=Object.entries(ROUTE_PREP_STATUS).map(([value,[label]])=>`<option value="${esc(value)}">${esc(label)}</option>`).join("");
      const states=[...new Set(pads.map(p=>p.state).filter(Boolean))].sort();
      const companies=[...new Set(pads.map(p=>p.company).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
      panel.innerHTML=`<div class="route-prep-page">
        <div id="routePrepOverview"><div class="route-prep-loading"><span class="fm-icon fm-sync"></span> Loading the 833-pad preparation summary…</div></div>
        <section class="road-manager-card route-prep-queue">
          <div class="road-manager-section-head"><div><span class="road-manager-kicker">Owner review queue</span><h2>Pad Route Prep</h2><p>Clean the saved route, match only exact roads, then measure intersection-to-intersection mileage. Nothing here changes live directions by itself.</p></div><button type="button" class="btn secondary" id="routePrepRefresh"><span class="fm-icon fm-refresh"></span> Refresh analysis</button></div>
          <div class="route-prep-filters">
            <label class="route-prep-search"><span class="fm-icon fm-search"></span><input id="routePrepSearch" type="search" placeholder="Pad, company, road or route…" value="${esc(routePrepState.search)}"></label>
            <select id="routePrepStatus" aria-label="Route readiness status"><option value="all">All statuses</option>${statuses}</select>
            <select id="routePrepState" aria-label="Pad state"><option value="all">All states</option>${states.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join("")}</select>
            <select id="routePrepCompany" aria-label="Pad company"><option value="all">All companies</option>${companies.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join("")}</select>
          </div>
          <div class="route-prep-results-head"><strong id="routePrepResultCount">Loading routes…</strong><span>State-route candidates remain review-only. Local roads never receive an educated guess.</span></div>
          <div class="route-prep-list" id="routePrepList"></div>
          <div class="route-prep-pager" id="routePrepPager"></div>
        </section>
      </div>`;
      const status=document.getElementById("routePrepStatus"),state=document.getElementById("routePrepState"),company=document.getElementById("routePrepCompany");
      status.value=routePrepState.status;state.value=routePrepState.state;company.value=routePrepState.company;
      let timer;
      document.getElementById("routePrepSearch").oninput=event=>{clearTimeout(timer);timer=setTimeout(()=>{routePrepState.search=event.target.value.trim();routePrepState.offset=0;loadRoutePrepList();},220);};
      status.onchange=()=>{routePrepState.status=status.value;routePrepState.offset=0;loadRoutePrepList();};
      state.onchange=()=>{routePrepState.state=state.value;routePrepState.offset=0;loadRoutePrepList();};
      company.onchange=()=>{routePrepState.company=company.value;routePrepState.offset=0;loadRoutePrepList();};
      document.getElementById("routePrepRefresh").onclick=async event=>{
        const button=event.currentTarget;
        if(!confirm("Refresh all 833 pads from their saved GPS and road sequences? This rebuilds only the Owner Route Prep queue and will not rewrite live directions."))return;
        button.disabled=true;button.innerHTML='<span class="fm-icon fm-sync"></span> Refreshing…';
        try{const result=await routePrepRpc("road_manager_refresh_route_prep");showToast(`Route Prep refreshed: ${Number(result?.active_routes||0).toLocaleString()} variants`);routePrepState.offset=0;await Promise.all([loadRoutePrepSummary(),loadRoutePrepList()]);}
        catch(error){alert(error.message||"Could not refresh Route Prep.");}
        finally{button.disabled=false;button.innerHTML='<span class="fm-icon fm-refresh"></span> Refresh analysis';}
      };
      loadRoutePrepSummary();
      loadRoutePrepList();
    }

    function routePrepStepMarkup(step){
      const source=step.source_details||{};
      const road=step.road;
      const candidate=step.step_kind==="state_route_candidate";
      const unmatched=["local_road","county_road","township_road"].includes(step.step_kind)&&step.match_status!=="exact_master";
      const privateStep=step.step_kind==="private_segment";
      const statusTone=step.match_status==="exact_master"?"ready":candidate?"candidate":privateStep?"private":"warning";
      return `<article class="route-prep-step ${statusTone}">
        <div class="route-prep-step-number">${Number(step.step_order)}</div>
        <div class="route-prep-step-copy">
          <div class="route-prep-step-head"><strong>${esc(step.raw_text)}</strong><span>${esc(routePrepStepKind(step.step_kind))}</span></div>
          <div class="route-prep-step-status">${esc(routePrepMatchLabel(step.match_status))}${road?` · <b>${esc(road.canonical_name)}</b>`:""}</div>
          ${(step.turn_direction||step.distance_miles!=null)?`<div class="route-prep-measurement">${step.turn_direction?`Turn ${esc(step.turn_direction)}`:"Continue"}${step.distance_miles!=null?` · ${esc(routePrepMiles(step.distance_miles))}`:""}</div>`:""}
          ${(road?.source_agency||source.source_agency)?`<div class="route-prep-source">Source: ${esc([road?.source_agency||source.source_agency,road?.source_dataset||source.source_dataset,road?.source_record_id||source.source_record_id].filter(Boolean).join(" · "))}</div>`:""}
          ${candidate?`<div class="route-prep-candidate-note"><strong>Candidate only:</strong> ${step.owner_decision==="approved"?"Owner accepted this as a Road Manager candidate, but it still cannot publish until officially verified.":"The pad state was used only to form a possible state-route label. It is not a verified route and is not published."}</div>`:""}
          ${unmatched?`<div class="route-prep-no-guess"><strong>No guess made.</strong> Match this exact saved name to an official or field-verified Road Manager record.</div>`:""}
          ${privateStep?`<div class="route-prep-private-note">Private, lease, access and driveway segments require field confirmation. Public-road mapping cannot safely invent them.</div>`:""}
          ${step.owner_notes?`<div class="route-prep-owner-note">Owner note: ${esc(step.owner_notes)}</div>`:""}
          <div class="route-prep-step-actions">
            ${candidate&&step.owner_decision==="pending"?`<button type="button" class="btn small secondary" data-route-prep-step="approve_state_route_candidate" data-step-id="${esc(step.id)}">Approve candidate for Road Manager</button><button type="button" class="btn small ghost" data-route-prep-step="reject_state_route_candidate" data-step-id="${esc(step.id)}">Reject</button>`:""}
            ${candidate&&step.owner_decision!=="pending"?`<button type="button" class="btn small ghost" data-route-prep-step="reset_pending" data-step-id="${esc(step.id)}">Reset candidate decision</button>`:""}
            ${unmatched?`<button type="button" class="btn small secondary" data-route-prep-search-road="${esc(step.raw_text)}">Search exact road in Road Manager</button>`:""}
            ${!candidate&&step.owner_decision!=="field_check"?`<button type="button" class="btn small ghost" data-route-prep-step="field_check" data-step-id="${esc(step.id)}">Needs field check</button>`:""}
          </div>
        </div>
      </article>`;
    }

    async function openRoutePrepDetail(id){
      let overlay=document.getElementById("routePrepDetailOverlay");
      if(!overlay){overlay=document.createElement("div");overlay.id="routePrepDetailOverlay";overlay.className="route-prep-detail-overlay";document.body.appendChild(overlay);}
      overlay.classList.add("open");overlay.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";
      overlay.innerHTML=`<section class="route-prep-detail"><div class="route-prep-detail-loading"><span class="fm-icon fm-sync"></span> Loading route details…</div></section>`;
      try{
        const data=await routePrepRpc("road_manager_route_prep_detail",{p_route_prep_id:id});
        routePrepState.detail=data;
        renderRoutePrepDetail(data);
      }catch(error){overlay.innerHTML=`<section class="route-prep-detail"><button class="route-prep-detail-close" type="button" data-close-route-prep>×</button><div class="route-prep-error"><strong>Could not load this route</strong><p>${esc(error.message||"Try again.")}</p></div></section>`;overlay.querySelector("[data-close-route-prep]").onclick=closeRoutePrepDetail;}
    }

    function closeRoutePrepDetail(){
      const overlay=document.getElementById("routePrepDetailOverlay");overlay?.classList.remove("open");overlay?.setAttribute("aria-hidden","true");document.body.style.overflow="";routePrepState.detail=null;
    }

    function renderRoutePrepDetail(data){
      const overlay=document.getElementById("routePrepDetailOverlay");if(!overlay)return;
      const route=data?.route||{};const steps=Array.isArray(data?.steps)?data.steps:[];const info=routePrepStatusInfo(route.readiness_status);
      overlay.innerHTML=`<section class="route-prep-detail" role="dialog" aria-modal="true" aria-label="Route Prep review">
        <header class="route-prep-detail-header"><button class="route-prep-detail-close" type="button" data-close-route-prep aria-label="Close">×</button><div><span class="route-prep-status ${info.tone}">${esc(info.label)}</span><h2>${esc(route.pad_name||"Pad route")}</h2><p>${esc([route.company,route.state,route.county,route.route_group==="alternate"?`Alternate ${route.variant_index}`:"Primary route"].filter(Boolean).join(" · "))}</p></div><a class="btn secondary small" href="#/pad/${encodeURIComponent(route.legacy_id||route.pad_id)}">Open pad</a></header>
        <div class="route-prep-detail-body">
          <div class="route-prep-policy compact"><span class="fm-icon fm-locked"></span><div><strong>No route guessing</strong><p>Only saved road names and exact Road Manager/official matches are used. A state-route candidate is review-only and cannot publish.</p></div></div>
          <section class="route-prep-detail-card"><h3>Saved route</h3><p class="route-prep-saved-sequence">${esc(route.source_sequence||"No sequence")}</p>${route.normalized_sequence&&route.normalized_sequence!==route.source_sequence?`<h4>Prepared sequence</h4><p>${esc(route.normalized_sequence)}</p>`:""}${Array.isArray(route.issue_codes)&&route.issue_codes.length?`<div class="route-prep-issue-row">${route.issue_codes.map(issue=>`<span>${esc(routePrepIssueLabel(issue))}</span>`).join("")}</div>`:""}</section>
          <section class="route-prep-detail-card"><div class="route-prep-detail-card-head"><h3>Road steps</h3><span>${steps.filter(step=>step.match_status==="exact_master").length} of ${steps.length} exact matches</span></div><div class="route-prep-steps">${steps.map(routePrepStepMarkup).join("")}</div></section>
          <section class="route-prep-detail-card"><h3>Owner decision</h3><label class="route-prep-notes-label">Review note<textarea id="routePrepOwnerNotes" rows="3" placeholder="Why this route is blocked, needs field confirmation, or is ready for the next stage…">${esc(route.owner_notes||"")}</textarea></label><div class="route-prep-detail-actions"><button type="button" class="btn secondary" data-route-prep-status="field_check">Mark field check</button><button type="button" class="btn ghost" data-route-prep-status="blocked">Block — do not use</button>${route.readiness_status!=="ready_for_road_matching"?`<button type="button" class="btn ghost" data-route-prep-status="ready_for_road_matching">Return to road matching</button>`:""}</div></section>
          ${route.written_directions?`<details class="route-prep-detail-card"><summary>Original written directions</summary><p class="route-prep-original-directions">${esc(route.written_directions)}</p></details>`:""}
        </div>
      </section>`;
      overlay.querySelector("[data-close-route-prep]").onclick=closeRoutePrepDetail;
      overlay.onclick=event=>{if(event.target===overlay)closeRoutePrepDetail();};
      overlay.querySelectorAll("[data-route-prep-search-road]").forEach(button=>button.onclick=()=>openRoadManagerExactSearch(button.dataset.routePrepSearchRoad));
      overlay.querySelectorAll("[data-route-prep-step]").forEach(button=>button.onclick=()=>decideRoutePrepStep(button));
      overlay.querySelectorAll("[data-route-prep-status]").forEach(button=>button.onclick=()=>setRoutePrepStatus(button));
    }

    async function decideRoutePrepStep(button){
      const decision=button.dataset.routePrepStep,stepId=button.dataset.stepId;
      const notes=document.getElementById("routePrepOwnerNotes")?.value?.trim()||null;
      if(decision==="approve_state_route_candidate"&&!confirm("Approve this only as an educated state-route candidate inside Road Manager? It will remain non-publishable and will not change the pad directions until officially verified."))return;
      if(decision==="reject_state_route_candidate"&&!confirm("Reject this state-route candidate and block the route from automatic use?"))return;
      button.disabled=true;
      try{const data=await routePrepRpc("road_manager_route_prep_step_decision",{p_step_id:stepId,p_decision:decision,p_owner_notes:notes});showToast("Route Prep decision saved");routePrepState.detail=data;renderRoutePrepDetail(data);loadRoutePrepSummary();loadRoutePrepList();}
      catch(error){alert(error.message||"Could not save the Route Prep decision.");button.disabled=false;}
    }

    async function setRoutePrepStatus(button){
      const route=routePrepState.detail?.route;if(!route)return;
      const status=button.dataset.routePrepStatus;const notes=document.getElementById("routePrepOwnerNotes")?.value?.trim()||null;
      if(status==="blocked"&&!confirm("Block this route variant so it cannot be treated as ready?"))return;
      button.disabled=true;
      try{await routePrepRpc("road_manager_route_prep_set_review",{p_route_prep_id:route.id,p_readiness_status:status,p_owner_notes:notes});showToast("Route Prep status saved");await openRoutePrepDetail(route.id);loadRoutePrepSummary();loadRoutePrepList();}
      catch(error){alert(error.message||"Could not update Route Prep.");button.disabled=false;}
    }

    function openRoadManagerExactSearch(value){
      closeRoutePrepDetail();routePrepState.tab="roads";localStorage.setItem("brinesearch.roadManagerTab.v1","roads");renderRoadManagerTabPanel();renderRoadManagerTabs();
      setTimeout(()=>{const input=document.getElementById("roadManagerSearch");if(input){input.value=value;input.dispatchEvent(new Event("input",{bubbles:true}));input.focus();}},80);
    }

    function renderRoadManagerTabPanel(){
      if(routePrepState.tab==="prep")renderRoutePrepTab();else renderMasterRoadTab();
    }

    renderRoadManagerSettings = async function(){
      document.title="Road Manager · BrineSearch";
      if(!requireOwnerSettingsPage("Road Manager"))return;
      app.innerHTML=`<main class="road-manager-page route-prep-road-manager">
        <section class="road-manager-hero"><div><span class="road-manager-kicker">Owner control</span><h1>Road Manager</h1><p>One shared road database plus a strict preparation queue for all 833 pads that have GPS and a saved road sequence.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section>
        <div class="road-manager-tabs" id="roadManagerTabs" role="tablist" aria-label="Road Manager sections"><button type="button" data-road-manager-tab="roads" role="tab"><span class="fm-icon fm-road"></span> Master roads</button><button type="button" data-road-manager-tab="prep" role="tab"><span class="fm-icon fm-directions"></span> Pad Route Prep</button></div>
        <div id="roadManagerTabPanel"></div>
      </main>`;
      renderRoadManagerTabs();renderRoadManagerTabPanel();
    };
