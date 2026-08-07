    /* Road Manager state separation
       State routes and local/county/township roads are separated by state.
       Interstates/freeways remain shared across state lines. U.S. routes keep
       their own national identity and never merge with same-number state routes. */

    const ROAD_MANAGER_STATE_FILTER_KEY = "brinesearch.roadManagerStateFilter.v1";
    const ROAD_MANAGER_STATE_LABELS = {
      OH: "Ohio",
      WV: "West Virginia",
      PA: "Pennsylvania",
      UNASSIGNED: "State not assigned"
    };
    let roadManagerStateFilter = localStorage.getItem(ROAD_MANAGER_STATE_FILTER_KEY) || "all";

    function roadManagerStateCode(value) {
      const raw=String(value||"").trim().toUpperCase();
      if(raw==="OHIO")return "OH";
      if(raw==="WEST VIRGINIA")return "WV";
      if(raw==="PENNSYLVANIA")return "PA";
      return raw||"UNASSIGNED";
    }

    function roadManagerRouteNumberBase(road) {
      const fromNumber=String(road?.route_number||"").trim().replace(/[NSEW]$/i,"");
      if(fromNumber)return fromNumber;
      return String(roadManagerBaseName(road).split("-").pop()||"").replace(/[NSEW]$/i,"");
    }

    function roadManagerFamilySectionKey(family) {
      if(family.primary?.road_type==="interstate")return "freeways";
      if(family.primary?.road_type==="us_route")return "us_routes";
      return family.stateCode||"UNASSIGNED";
    }

    function roadManagerFamilySectionLabel(key) {
      if(key==="freeways")return "Shared freeways";
      if(key==="us_routes")return "U.S. routes";
      return `${ROAD_MANAGER_STATE_LABELS[key]||key} roads`;
    }

    function roadManagerFamilySectionOrder(key) {
      const fixed=["freeways","us_routes","OH","WV","PA","UNASSIGNED"];
      const index=fixed.indexOf(key);
      return index<0?fixed.length:index;
    }

    function roadManagerFamilySearchText(family) {
      return family.members.flatMap(row=>[
        row.canonical_name,row.route_number,row.road_type,row.state,row.county,row.township,
        ...(Array.isArray(row.coverage_states)?row.coverage_states:[]),
        ...(Array.isArray(row.aliases)?row.aliases:[])
      ]).filter(Boolean).join(" ").toLowerCase();
    }

    function roadManagerFamilyMatchesState(family, filter) {
      if(filter==="all")return true;
      if(filter==="freeways")return family.primary?.road_type==="interstate";
      if(filter==="us_routes")return family.primary?.road_type==="us_route";
      if(family.primary?.road_type==="interstate")return false;
      if(family.primary?.road_type==="us_route")return family.states.includes(filter);
      return family.stateCode===filter;
    }

    roadManagerFamilyKey = function(road) {
      const number=roadManagerRouteNumberBase(road);
      const state=roadManagerStateCode(road?.state);
      if(road?.road_type==="interstate")return `freeway|${number}`;
      if(road?.road_type==="us_route")return `us_route|${number}`;
      if(road?.road_type==="state_route")return `state_route|${state}|${number}`;
      return `road|${state}|${roadNormalizeKey(road?.canonical_name||road?.normalized_name)}|${String(road?.county||"")}|${String(road?.township||"")}`;
    };

    roadManagerFamilyGroups = function(rows) {
      const groups=new Map();
      (rows||[]).forEach(row=>{
        const key=roadManagerFamilyKey(row);
        if(!groups.has(key))groups.set(key,{key,members:[]});
        groups.get(key).members.push(row);
      });
      return [...groups.values()].map(group=>{
        const members=group.members;
        const primary=[...members].sort((a,b)=>
          Number(b.verification_status==="verified")-Number(a.verification_status==="verified")||
          Number(b.source_method==="official_centerline")-Number(a.source_method==="official_centerline")||
          Number(Boolean(b.source_agency))-Number(Boolean(a.source_agency))||
          String(a.canonical_name).localeCompare(String(b.canonical_name),undefined,{numeric:true})
        )[0];
        const routeNumber=roadManagerRouteNumberBase(primary);
        const stateCode=["interstate","us_route"].includes(primary?.road_type)?null:roadManagerStateCode(primary?.state);
        const states=[...new Set(members.flatMap(row=>[
          ...(Array.isArray(row.coverage_states)?row.coverage_states:[]),
          row.state
        ].filter(Boolean).map(roadManagerStateCode)))].sort();
        const identities=[...new Set(members.map(roadManagerBaseName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
        const aggregate={...primary};
        ROAD_FLAGS.forEach(flag=>aggregate[flag]=members.some(row=>Boolean(row?.[flag])));
        const title=primary?.road_type==="interstate"?`I-${routeNumber}`:
          primary?.road_type==="us_route"?`US-${routeNumber}`:
          primary?.road_type==="state_route"?`${stateCode}-${routeNumber}`:
          primary?.canonical_name||"Road";
        return {
          ...group,primary,routeNumber,stateCode,states,identities,aggregate,title,
          conflict:identities.length>1,
          verified:members.some(row=>row.verification_status==="verified"),
          candidate:members.some(row=>row.candidate_only)
        };
      }).sort((a,b)=>{
        const sectionDiff=roadManagerFamilySectionOrder(roadManagerFamilySectionKey(a))-roadManagerFamilySectionOrder(roadManagerFamilySectionKey(b));
        return sectionDiff||a.title.localeCompare(b.title,undefined,{numeric:true});
      });
    };

    roadManagerFamilyRow = function(family) {
      const type=family.primary?.road_type;
      const stateLabel=family.stateCode?(ROAD_MANAGER_STATE_LABELS[family.stateCode]||family.stateCode):"";
      const coverage=family.states.length?family.states.map(code=>ROAD_MANAGER_STATE_LABELS[code]||code).join(" / "):"";
      const scope=type==="interstate"?`Shared freeway${coverage?` · ${coverage}`:""}`:
        type==="us_route"?`U.S. route${coverage?` · ${coverage}`:""}`:
        type==="state_route"?`${stateLabel} state route`:
        `${stateLabel||"Unassigned"} road`;
      const identities=family.identities.filter(name=>name!==family.title).join(" · ");
      const status=family.candidate?"Candidate only":family.verified?"Official road verified":family.conflict?"Needs identity review":"Needs official review";
      const statusClass=family.candidate?"candidate":family.verified?"verified":family.conflict?"conflict":"";
      return `<article class="road-row road-family-row"><button type="button" data-road-family-open="${esc(family.key)}"><div class="road-row-name">${esc(family.title)}</div><div class="road-row-meta">${esc([scope,identities,`${family.members.length} record${family.members.length===1?"":"s"}`].filter(Boolean).join(" • "))}</div><div class="road-badges">${roadBadgeHtml(family.aggregate)}</div></button><span class="road-status ${statusClass}">${esc(status)}</span></article>`;
    };

    function roadManagerFamilySectionsMarkup(families) {
      const sections=new Map();
      families.forEach(family=>{
        const key=roadManagerFamilySectionKey(family);
        if(!sections.has(key))sections.set(key,[]);
        sections.get(key).push(family);
      });
      return [...sections.entries()]
        .sort(([a],[b])=>roadManagerFamilySectionOrder(a)-roadManagerFamilySectionOrder(b)||a.localeCompare(b))
        .map(([key,items])=>`<section class="road-state-section" data-road-state-section="${esc(key)}" style="margin:0 0 18px"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 2px 9px;padding:0 2px"><h3 style="margin:0;font-size:15px">${esc(roadManagerFamilySectionLabel(key))}</h3><span class="road-manager-count">${items.length}</span></div><div class="road-state-family-list" style="display:grid;gap:10px">${items.map(roadManagerFamilyRow).join("")}</div></section>`)
        .join("");
    }

    renderRoadFamilyDetail = function(key) {
      const family=roadManagerFamilies.find(item=>item.key===key);
      const host=document.getElementById("roadManagerEditor");
      if(!family||!host)return;
      const type=family.primary?.road_type;
      const stateLabel=family.stateCode?(ROAD_MANAGER_STATE_LABELS[family.stateCode]||family.stateCode):"";
      const coverage=family.states.map(code=>ROAD_MANAGER_STATE_LABELS[code]||code).join(" / ");
      const rule=type==="interstate"?
        "This freeway is shared across state lines. Direction and mileage remain attached to each pad route step.":
        type==="us_route"?
        "This U.S. route keeps one national identity and never merges with a same-number state route.":
        "This family is state-specific. A road with the same name or number in another state is a different Road Manager family.";
      host.innerHTML=`<section class="road-family-editor"><div class="road-family-editor-head"><div><span class="road-manager-kicker">${type==="interstate"?"Shared freeway":type==="us_route"?"National U.S. route":`${esc(stateLabel||"State-specific")} road`}</span><h2>${esc(family.title)}</h2><p>${esc([coverage?`Coverage ${coverage}`:"",`${family.members.length} underlying record${family.members.length===1?"":"s"}`].filter(Boolean).join(" · "))}</p></div><button class="btn ghost small" type="button" id="roadFamilyClose">Close</button></div><div class="road-family-note"><strong>Grouping rule:</strong> ${esc(rule)}</div>${family.conflict?`<div class="road-family-conflict"><strong>Multiple identities need review.</strong><p>Route Prep will not choose between ${esc(family.identities.join(" · "))} without evidence.</p></div>`:""}<div class="road-family-members">${family.members.map(member=>`<article class="road-family-member"><div><strong>${esc(member.canonical_name)}</strong><small>${esc([member.road_type,member.state||(Array.isArray(member.coverage_states)&&member.coverage_states.length?member.coverage_states.join(" / "):"Shared master"),roadStatusLabel(member.verification_status)].filter(Boolean).join(" · "))}</small>${member.aliases?.length?`<span>Aliases: ${esc(member.aliases.join(", "))}</span>`:""}${member.source_agency?`<span>Source: ${esc([member.source_agency,member.source_dataset,member.source_record_id].filter(Boolean).join(" · "))}</span>`:""}</div><button class="btn secondary small" type="button" data-road-family-edit="${esc(member.id)}">Edit record</button></article>`).join("")}</div></section>`;
      document.getElementById("roadFamilyClose").onclick=()=>{host.innerHTML="";};
      host.querySelectorAll("[data-road-family-edit]").forEach(button=>button.onclick=()=>renderRoadForm(family.members.find(row=>row.id===button.dataset.roadFamilyEdit)));
      host.scrollIntoView({behavior:"smooth",block:"start"});
    };

    loadRoadManagerFamilies = async function() {
      const input=document.getElementById("roadManagerSearch");
      const list=document.getElementById("roadManagerList");
      const count=document.getElementById("roadManagerFamilyCount");
      if(!list)return;
      const query=String(input?.value||"").trim().toLowerCase();
      list.innerHTML='<p class="admin-empty">Loading state-separated road families…</p>';
      try{
        const rows=await fetchRoads("",1000);
        const allFamilies=roadManagerFamilyGroups(rows);
        roadManagerFamilies=allFamilies.filter(family=>(!query||roadManagerFamilySearchText(family).includes(query))&&roadManagerFamilyMatchesState(family,roadManagerStateFilter));
        const recordCount=roadManagerFamilies.reduce((total,family)=>total+family.members.length,0);
        if(count)count.textContent=`${roadManagerFamilies.length} families · ${recordCount} records`;
        list.innerHTML=roadManagerFamilies.length?roadManagerFamilySectionsMarkup(roadManagerFamilies):'<p class="admin-empty">No road family matched this search and state filter.</p>';
        list.querySelectorAll("[data-road-family-open]").forEach(button=>button.onclick=()=>renderRoadFamilyDetail(button.dataset.roadFamilyOpen));
      }catch(error){
        list.innerHTML=`<p class="admin-empty">${esc(error.message||"Could not load roads.")}</p>`;
      }
    };

    renderMasterRoadTab = function() {
      const panel=document.getElementById("roadManagerTabPanel");
      if(!panel)return;
      panel.innerHTML=`<section class="road-manager-card road-master-panel"><div class="road-manager-section-head"><div><span class="road-manager-kicker">State-separated master database</span><h2>Road families</h2><p>State routes and local roads are kept inside their own state. Interstates/freeways stay shared. U.S. routes stay separate from same-number state routes.</p></div><span class="road-manager-count" id="roadManagerFamilyCount">—</span></div><div class="road-manager-tools" style="grid-template-columns:minmax(0,1fr) minmax(150px,220px) auto"><input id="roadManagerSearch" placeholder="Search route number, road name, alias or state…" autocomplete="off"><select id="roadManagerStateFilter" aria-label="Road state filter"><option value="all">All road sections</option><option value="freeways">Shared freeways</option><option value="us_routes">U.S. routes</option><option value="OH">Ohio roads</option><option value="WV">West Virginia roads</option><option value="PA">Pennsylvania roads</option><option value="UNASSIGNED">State not assigned</option></select><button class="btn primary" id="roadManagerAdd" type="button"><span class="fm-icon fm-add"></span> Add road</button></div><div class="road-family-note" style="margin-bottom:12px"><strong>Separation rule:</strong> OH-2 and WV-2 are different families. I-70 is one shared freeway family.</div><div class="road-list" id="roadManagerList"></div></section><div id="roadManagerEditor"></div>`;
      const filter=document.getElementById("roadManagerStateFilter");
      filter.value=roadManagerStateFilter;
      filter.onchange=()=>{
        roadManagerStateFilter=filter.value;
        localStorage.setItem(ROAD_MANAGER_STATE_FILTER_KEY,roadManagerStateFilter);
        loadRoadManagerFamilies();
      };
      let timer;
      document.getElementById("roadManagerSearch").oninput=()=>{clearTimeout(timer);timer=setTimeout(loadRoadManagerFamilies,180);};
      document.getElementById("roadManagerAdd").onclick=()=>renderRoadForm();
      loadRoadManagerFamilies();
    };

    const renderSettingsWithRoutePrepStateSeparation=renderSettings;
    renderSettings=function(){
      renderSettingsWithRoutePrepStateSeparation();
      const roadRow=[...document.querySelectorAll(".settings-row")].find(row=>row.querySelector("strong")?.textContent?.trim()==="Road Manager");
      const detail=roadRow?.querySelector("small");
      if(detail)detail.textContent="Roads separated by state, shared freeways, Route Prep and strict no-guess review";
    };
