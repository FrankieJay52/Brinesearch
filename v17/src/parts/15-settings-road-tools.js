
    function settingsRoleInfo() {
      const role = String(editorProfile?.role || (editorSession?.access_token ? "member" : "guest")).toLowerCase();
      const map = {
        owner:["👑","Owner"], administrator:["🛡","Administrator"], editor:["✎","Editor"],
        contributor:["★","Contributor"], member:["👤","Regular User"], pending:["⏳","Pending"], guest:["👤","Guest"]
      };
      const permissions=editorPermissions();
      const isOwner=permissions.includes("owner");
      const canEdit=isOwner||permissions.includes("administrator")||permissions.includes("editor");
      const canModerate=isOwner||permissions.includes("administrator")||permissions.includes("moderator");
      const visibleRole=isOwner?"owner":permissions.includes("administrator")?"administrator":permissions.includes("moderator")?"moderator":permissions.includes("editor")?"editor":role;
      const visibleMap={...map,moderator:["⚑","Moderator"]};
      return { role:visibleRole, icon:(visibleMap[visibleRole]||map.member)[0], label:(visibleMap[visibleRole]||map.member)[1], signedIn:Boolean(editorSession?.access_token), canEdit, canModerate, isOwner };
    }

    function settingsRow(icon,title,detail,attrs="") {
      return `<button class="settings-row" type="button" ${attrs}><span class="settings-icon">${icon}</span><span class="settings-copy"><strong>${esc(title)}</strong><small>${esc(detail)}</small></span><span class="settings-caret">›</span></button>`;
    }

    async function renderUserAccessSettings() {
      document.title = "User Account Access · BrineSearch";
      if (!editorSession?.access_token) {
        app.innerHTML = `<main class="user-access-page"><section class="settings-hero"><div><h1>User Account Access</h1><p>Sign in with the Owner account to manage permissions.</p></div></section><button class="btn primary" type="button" data-open-editor-auth>Sign in</button></main>`;
        return;
      }
      if (!editorIsOwner()) {
        app.innerHTML = `<main class="user-access-page"><section class="settings-hero"><div><h1>User Account Access</h1><p>Only the BrineSearch Owner can change account permissions.</p></div></section><a class="btn secondary" href="#/settings">Back to Settings</a></main>`;
        return;
      }
      app.innerHTML = `<main class="user-access-page">
        <section class="user-access-hero"><div><h1>User Account Access</h1><p>Choose exactly what each person is allowed to do. Every new account starts as a Regular User.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section>
        <p class="user-access-note">Permissions can be combined. Suspended turns off the other permissions until you reactivate the account.</p>
        <div class="user-access-list" id="userAccessList"><section class="user-access-card"><p class="muted">Loading users…</p></section></div>
      </main>`;
      try {
        const people = await editorRequest("/rest/v1/editor_accounts?select=user_id,email,display_name,role,permissions,created_at&order=created_at.asc");
        const list=document.getElementById("userAccessList");
        list.innerHTML=(people||[]).map(person=>{
          const permissions=Array.isArray(person.permissions)&&person.permissions.length?person.permissions:[person.role||"member"];
          const checked=name=>permissions.includes(name)?"checked":"";
          const name=person.display_name||person.email||"User";
          const owner=permissions.includes("owner");
          return `<section class="user-access-card">
            <div class="user-access-person"><div><strong>${esc(name)}</strong><small>${esc(person.email||"")}</small></div><span class="user-access-current">${esc(accessLabel(person))}</span></div>
            ${owner?`<div class="user-access-owner">Owner · All permissions</div>`:`<div data-user-access="${esc(person.user_id)}"><div class="user-access-options">
              <label class="user-access-option"><input type="checkbox" value="editor" ${checked("editor")}><span>✎ Editor</span></label>
              <label class="user-access-option"><input type="checkbox" value="moderator" ${checked("moderator")}><span>⚑ Moderator</span></label>
              <label class="user-access-option"><input type="checkbox" value="administrator" ${checked("administrator")}><span>🛡 Administrator</span></label>
              <label class="user-access-option suspend"><input type="checkbox" value="suspended" ${checked("suspended")}><span>⛔ Suspended</span></label>
            </div><button class="btn primary user-access-save" type="button" data-save-access="${esc(person.user_id)}">Save access</button></div>`}
          </section>`;
        }).join("")||`<section class="user-access-card"><p class="muted">No users found.</p></section>`;
        list.querySelectorAll('[data-user-access]').forEach(box=>{
          const suspend=box.querySelector('input[value="suspended"]');
          const others=[...box.querySelectorAll('input:not([value="suspended"])')];
          suspend?.addEventListener('change',()=>{if(suspend.checked)others.forEach(x=>x.checked=false)});
          others.forEach(x=>x.addEventListener('change',()=>{if(x.checked&&suspend)suspend.checked=false}));
        });
        list.querySelectorAll('[data-save-access]').forEach(button=>button.onclick=async()=>{
          const box=button.closest('[data-user-access]');
          const permissions=[...box.querySelectorAll('input:checked')].map(x=>x.value);
          button.disabled=true; button.textContent="Saving…";
          try { await setUserPermissions(button.dataset.saveAccess,permissions); button.textContent="Saved"; setTimeout(renderUserAccessSettings,450); }
          catch(error){ alert(error.message); button.disabled=false; button.textContent="Save access"; }
        });
      } catch(error) {
        const list=document.getElementById("userAccessList");
        if(list) list.innerHTML=`<section class="user-access-card"><strong>Could not load users</strong><p class="muted">${esc(error.message||"Try again.")}</p><button class="btn secondary" onclick="location.reload()">Retry</button></section>`;
      }
    }


    function requireOwnerSettingsPage(title) {
      if (!editorSession?.access_token) {
        app.innerHTML = `<main class="admin-settings-page"><section class="admin-page-hero"><div><h1>${esc(title)}</h1><p>Sign in with the Owner account to continue.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section><button class="btn primary" type="button" data-open-editor-auth>Sign in</button></main>`;
        return false;
      }
      if (!editorIsOwner()) {
        app.innerHTML = `<main class="admin-settings-page"><section class="admin-page-hero"><div><h1>${esc(title)}</h1><p>Only the BrineSearch Owner can open this page.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section></main>`;
        return false;
      }
      return true;
    }

    async function renderDatabaseHealthSettings() {
      document.title = "Database Health · BrineSearch";
      if (!requireOwnerSettingsPage("Database Health")) return;
      app.innerHTML = `<main class="admin-settings-page"><section class="admin-page-hero"><div><h1>Database Health</h1><p>Live directory totals and data-quality warnings only.</p></div><a class="btn ghost small admin-page-back" href="#/settings">← Settings</a></section><section class="admin-card"><p class="admin-empty">Loading database health…</p></section></main>`;
      try {
        const data = await editorRequest("/rest/v1/rpc/owner_editor_dashboard", {method:"POST",body:"{}"});
        const h=data?.health||{};
        const stats=[
          [h.pads||0,"Pads",false],[h.disposals||0,"Disposals",false],[h.companies||0,"Companies",false],[h.official_attached||0,"Official records attached",false],
          [h.needs_field_check||0,"Needs field check","warn"],[h.missing_navigation_gps||0,"Missing navigation GPS","danger"],[h.missing_directions||0,"Missing all directions/address","warn"],[h.duplicate_name_groups||0,"Duplicate-name groups",false],[h.duplicate_coordinate_groups||0,"Shared saved-coordinate groups","warn"]
        ];
        app.innerHTML = `<main class="admin-settings-page"><section class="admin-page-hero"><div><h1>Database Health</h1><p>Live directory totals and data-quality warnings only.</p></div><a class="btn ghost small admin-page-back" href="#/settings">← Settings</a></section>
          <section class="admin-card"><h2>Current database</h2><div class="admin-stat-grid">${stats.map(([v,l,c])=>`<div class="admin-stat ${c||""}"><strong>${esc(v)}</strong><small>${esc(l)}</small></div>`).join("")}</div></section>
          <section class="admin-card"><h2>Open quality records</h2><div class="settings-list">
            ${settingsRow(`<span class="fm-icon fm-gps"></span>`,"Missing navigation GPS","Records that cannot navigate yet",'data-settings-route="#/quality/missing-gps"')}
            ${settingsRow("🛣","Missing directions","Records without written directions or an address",'data-settings-route="#/quality/missing-directions"')}
            ${settingsRow("✓","Needs field check","Locations needing real-world confirmation",'data-settings-route="#/quality/field-check"')}
            ${settingsRow("📄","Official record not attached","Pads without an official source record",'data-settings-route="#/quality/unverified"')}
          </div></section></main>`;
        document.querySelectorAll("[data-settings-route]").forEach(btn=>btn.onclick=()=>location.hash=btn.dataset.settingsRoute);
      } catch(error) {
        app.querySelector('.admin-card').innerHTML=`<strong>Could not load database health</strong><p class="muted">${esc(error.message||"Try again.")}</p>`;
      }
    }

    async function renderEditorActivitySettings() {
      document.title = "Editor Activity · BrineSearch";
      if (!requireOwnerSettingsPage("Editor Activity")) return;
      app.innerHTML = `<main class="admin-settings-page"><section class="admin-page-hero"><div><h1>Editor Activity</h1><p>Recent editing results and saved changes.</p></div><a class="btn ghost small admin-page-back" href="#/settings">← Settings</a></section><section class="admin-card"><p class="admin-empty">Loading editor activity…</p></section></main>`;
      try {
        const data=await editorRequest("/rest/v1/rpc/owner_editor_dashboard",{method:"POST",body:"{}"});
        const sum=data?.summary||{};
        const activity=(data?.activity||[]).slice(0,40);
        const edits=(data?.recent_edits||[]).slice(0,30);
        app.innerHTML=`<main class="admin-settings-page"><section class="admin-page-hero"><div><h1>Editor Activity</h1><p>Recent editing results and saved changes.</p></div><a class="btn ghost small admin-page-back" href="#/settings">← Settings</a></section>
          <section class="admin-card"><h2>Last 7 days</h2><div class="admin-stat-grid"><div class="admin-stat"><strong>${esc(sum.successful_actions_7d||0)}</strong><small>Successful actions</small></div><div class="admin-stat ${Number(sum.failed_actions_7d||0)?'danger':''}"><strong>${esc(sum.failed_actions_7d||0)}</strong><small>Failed actions</small></div><div class="admin-stat"><strong>${esc(sum.pending_submissions||0)}</strong><small>Pending submissions</small></div><div class="admin-stat"><strong>${esc(sum.editors||0)}</strong><small>Editors</small></div></div></section>
          <section class="admin-card"><h2>Recent activity</h2><div class="admin-list">${activity.length?activity.map(x=>`<div class="admin-list-item"><div><strong>${esc(x.editor_name||"Editor")} · ${esc(x.action||"Action")}</strong><small>${esc([x.company,x.pad_name,x.error_message].filter(Boolean).join(" · ")||x.status||"")}</small></div><time>${esc(formatEditorTime(x.created_at))}</time></div>`).join(""):'<p class="admin-empty">No recent activity.</p>'}</div></section>
          <section class="admin-card"><h2>Recent saved changes</h2><div class="admin-list">${edits.length?edits.map(x=>`<div class="admin-list-item"><div><strong>${esc(x.pad_name||"Pad change")}</strong><small>${esc([x.company,x.editor_name,(x.changed_fields||[]).join(", ")].filter(Boolean).join(" · "))}</small></div><time>${esc(formatEditorTime(x.changed_at))}</time></div>`).join(""):'<p class="admin-empty">No recent saved changes.</p>'}</div></section></main>`;
      } catch(error) {
        app.querySelector('.admin-card').innerHTML=`<strong>Could not load editor activity</strong><p class="muted">${esc(error.message||"Try again.")}</p>`;
      }
    }

    async function renderEditorToolsSettings() {
      document.title = "Editor Tools · BrineSearch";
      const r=settingsRoleInfo();
      if (!r.signedIn) {
        app.innerHTML=`<main class="admin-settings-page"><section class="admin-page-hero"><div><h1>Editor Tools</h1><p>Sign in to review your editing access.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section><button class="btn primary" type="button" data-open-editor-auth>Sign in</button></main>`;
        return;
      }
      let dashboard=null;
      if (r.canEdit && !r.isOwner) { try { dashboard=await editorRequest("/rest/v1/rpc/my_editor_dashboard",{method:"POST",body:"{}"}); } catch{} }
      const summary=dashboard?.summary||{};
      app.innerHTML=`<main class="admin-settings-page"><section class="admin-page-hero"><div><h1>Editor Tools</h1><p>Your role and pad-editing tools—nothing else.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section>
        <section class="admin-card"><h2>Current access</h2><div class="editor-account-card"><strong>${esc(editorProfile?.display_name||editorSession?.user?.user_metadata?.display_name||"Account")}</strong><small>${esc(editorProfile?.email||editorSession?.user?.email||"")}</small><span class="editor-role-pill">${esc(settingsRoleInfo().label)}</span></div></section>
        ${r.canEdit?`<section class="admin-card"><h2>Pad tools</h2><div class="editor-tools-actions"><button class="settings-row" type="button" data-settings-action="addpad"><span class="settings-row-icon">＋</span><span class="settings-row-copy"><strong>Add a pad</strong><small>Add a new pad or disposal</small></span><span class="settings-chevron">›</span></button>${r.isOwner?`<button class="settings-row" type="button" data-settings-route="#/verification"><span class="settings-row-icon">✓</span><span class="settings-row-copy"><strong>Verification review</strong><small>Review official matches and corrections</small></span><span class="settings-chevron">›</span></button>`:""}</div></section>`:""}
        ${dashboard?`<section class="admin-card"><h2>My activity</h2><div class="admin-stat-grid"><div class="admin-stat"><strong>${esc(summary.success_count||0)}</strong><small>Successful actions</small></div><div class="admin-stat ${Number(summary.error_count||0)?'danger':''}"><strong>${esc(summary.error_count||0)}</strong><small>Failed actions</small></div><div class="admin-stat"><strong>${esc(summary.added_pads||0)}</strong><small>Pads added</small></div><div class="admin-stat"><strong>${esc(summary.edits||0)}</strong><small>Saved edits</small></div></div></section>`:""}</main>`;
      document.querySelectorAll('[data-settings-route]').forEach(btn=>btn.onclick=()=>location.hash=btn.dataset.settingsRoute);
      document.querySelectorAll('[data-settings-action="addpad"]').forEach(btn=>btn.onclick=openAddPad);
    }

    function renderDataSourcesSettings() {
      document.title = "Data Sources & Provenance · BrineSearch";
      app.innerHTML = `<main class="provenance-page"><a class="btn ghost small" href="#/settings">← Settings</a>
        <section class="provenance-hero"><h1>Data Sources & Provenance</h1><p>Where BrineSearch information comes from, how it is organized, and how concerns can be reported.</p></section>
        <section class="provenance-card"><h2>Where BrineSearch data comes from</h2><p>BrineSearch is an independently built oilfield directory. Records are compiled and organized from publicly available information, independent internet research, government and regulatory records, operator and well information, maps, field observations, road signs, lease information, and contributions submitted by BrineSearch users.</p><p>BrineSearch does not claim ownership of public facts such as pad names, well names, API numbers, property numbers, coordinates, counties, townships, addresses, or public road information.</p><p>Written descriptions, software, page design, icons, classifications, and the organization of information within BrineSearch are independently created or standardized for BrineSearch.</p></section>
        <section class="provenance-card"><h2>Types of sources used</h2><ul class="provenance-list"><li>State oil and gas regulatory records</li><li>Public well and API records</li><li>County, township, address, and public-road information</li><li>Public maps and satellite imagery</li><li>Operator and company information</li><li>Independent internet research</li><li>Field observations, road signs, and lease information</li><li>Driver, dispatcher, editor, and community contributions</li><li>User-submitted corrections and updates</li></ul></section>
        <section class="provenance-card"><h2>Independent platform</h2><p>BrineSearch is not affiliated with, endorsed by, or operated by BrinePads, any oil and gas operator, service company, employer, mapping provider, or government agency unless specifically stated.</p><p>BrineSearch does not intentionally reproduce another directory's private database, proprietary code, branded graphics, photographs, or written descriptions word-for-word. Reported material is reviewed and may be corrected or removed when appropriate.</p></section>
        <section class="provenance-card"><h2>Accuracy and continuing review</h2><p>Directions and records may combine public information, independent research, field observations, and community contributions. Information is continuously reviewed and standardized to improve clarity and accuracy. Users must independently verify routes, GPS coordinates, restrictions, gates, road conditions, and field information before travel.</p><div class="provenance-actions"><a class="btn secondary" href="mailto:support@brinesearch.com?subject=BrineSearch%20Incorrect%20Data">Report incorrect data</a><a class="btn secondary" href="#/settings/copyright">Report a source or copyright concern</a></div></section></main>`;
    }

    function renderCopyrightSettings() {
      document.title = "Copyright & Content Concerns · BrineSearch";
      app.innerHTML = `<main class="provenance-page"><a class="btn ghost small" href="#/settings">← Settings</a>
        <section class="provenance-hero"><h1>Copyright & Content Concerns</h1><p>A clear process for reporting disputed, inaccurate, private, or potentially infringing material.</p></section>
        <section class="provenance-card"><h2>Respect for third-party rights</h2><p>BrineSearch respects copyrights, trademarks, privacy, confidential information, and other third-party rights. Public facts may be included in the directory, while original photographs, branded graphics, proprietary code, and protectable written material are not intentionally copied without permission.</p></section>
        <section class="provenance-card"><h2>What to include in a report</h2><ul class="provenance-list"><li>Your name and contact information</li><li>The exact BrineSearch page or record involved</li><li>A description of the material and the concern</li><li>Why you believe the material is inaccurate, private, or infringes your rights</li><li>Supporting documentation or the original source when available</li></ul></section>
        <section class="provenance-card"><h2>Review process</h2><p>BrineSearch will review good-faith reports, preserve relevant records, and correct, restrict, or remove material when appropriate. Submitting a report does not guarantee removal when the material is factual, independently sourced, authorized, or otherwise lawful.</p><div class="provenance-actions"><a class="btn primary" href="mailto:support@brinesearch.com?subject=BrineSearch%20Copyright%20or%20Content%20Concern&body=Page%20or%20pad%20URL%3A%0A%0ADescription%20of%20concern%3A%0A%0ASupporting%20information%3A">Report copyright or content concern</a><a class="btn secondary" href="mailto:support@brinesearch.com?subject=BrineSearch%20Incorrect%20Data">Report incorrect data</a></div></section>
        <section class="provenance-card"><p><strong>Important:</strong> This page explains BrineSearch's reporting process and is not a promise that every complaint will produce a particular legal result.</p></section></main>`;
    }

    function renderDataVerificationSettings() {
      document.title = "Data Verification · BrineSearch";
      const rows=[
        ["verified","GPS Verified","The location was checked against a trusted source or confirmed through an approved review."],
        ["comment","Community Verified","A driver or contributor supplied or confirmed useful field information. Conditions can still change."],
        ["edit","Editor Reviewed","An approved editor reviewed or updated the record inside BrineSearch."],
        ["sync","Standardized","Directions or record text were converted into BrineSearch's consistent display format. This is not the same as field verification."],
        ["warning","Needs Review","The record is incomplete, conflicting, old, or needs field confirmation before being treated as verified."]
      ];
      app.innerHTML=`<main class="provenance-page"><a class="btn ghost small" href="#/settings">← Settings</a><section class="provenance-hero"><h1>Data Verification</h1><p>What the different record and review labels mean.</p></section><section class="provenance-card"><div class="verification-legend">${rows.map(([icon,title,copy])=>`<div class="verification-legend-row"><span class="verification-legend-icon"><span class="fm-icon fm-${icon}"></span></span><div><strong>${title}</strong><p>${copy}</p></div></div>`).join("")}</div></section><section class="provenance-card"><h2>Verification does not replace driver judgment</h2><p>Even verified information can become outdated because of construction, temporary restrictions, weather, gate changes, lease activity, or operational changes. Always confirm current conditions before entering.</p></section></main>`;
    }


    const ROAD_FLAGS = ["truck_route","narrow","gravel","steep_grade","low_bridge","weight_limit","one_lane","seasonal","gate","construction"];
    const ROAD_FLAG_LABELS = {truck_route:"Truck route",narrow:"Narrow",gravel:"Gravel",steep_grade:"Steep grade",low_bridge:"Low bridge",weight_limit:"Weight limit",one_lane:"One lane",seasonal:"Seasonal",gate:"Gate",construction:"Construction"};
    let roadManagerRows=[];

    function roadNormalizeKey(v){return String(v||"").toLowerCase().replace(/\b(state route|sr|ohio route)\b/g,"oh").replace(/\bcounty road\b/g,"cr").replace(/\btownship road\b/g,"tr").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}
    async function fetchRoads(search="", limit=100){
      const q=String(search||"").trim();
      let path=`/rest/v1/brinesearch_roads?select=*&order=canonical_name.asc&limit=${limit}`;
      if(q){const safe=encodeURIComponent(`*${q.replace(/[,*()]/g," ")}*`);path+=`&or=(canonical_name.ilike.${safe},normalized_name.ilike.${safe})`;}
      const data=await editorRequest(path,{method:"GET"}); return Array.isArray(data)?data:[];
    }
    function roadBadgeHtml(r){return ROAD_FLAGS.filter(k=>r?.[k]).map(k=>`<span class="road-badge ${k==='low_bridge'||k==='weight_limit'||k==='construction'?'warn':''}">${ROAD_FLAG_LABELS[k]}</span>`).join("");}
    function roadStatusLabel(v){return ({verified:"Official road verified",map_match:"Public map match",field_name:"Local / field name",needs_review:"Needs review"})[v]||"Needs review";}
    function roadRowHtml(r){const loc=[r.state,r.county,r.township].filter(Boolean).join(" • ");return `<article class="road-row"><button type="button" data-road-open="${esc(r.id)}"><div class="road-row-name">${esc(r.canonical_name)}</div><div class="road-row-meta">${esc([r.road_type,loc,r.surface].filter(Boolean).join(" • ")||"Road record")}</div><div class="road-badges">${roadBadgeHtml(r)}</div></button><span class="road-status ${r.verification_status==='verified'?'verified':''}">${esc(roadStatusLabel(r.verification_status))}</span></article>`;}
    function emptyRoadForm(){return {id:"",canonical_name:"",normalized_name:"",road_type:"local",state:"",county:"",township:"",aliases:[],surface:"",truck_route:false,narrow:false,gravel:false,steep_grade:false,low_bridge:false,weight_limit:false,one_lane:false,seasonal:false,gate:false,construction:false,cb_channel:"",notes:"",verification_status:"needs_review"};}
    function renderRoadForm(r=emptyRoadForm()){
      const host=document.getElementById("roadManagerEditor"); if(!host)return;
      host.innerHTML=`<section class="road-manager-card"><h2>${r.id?"Edit road":"Add road"}</h2><form id="roadManagerForm"><input type="hidden" name="id" value="${esc(r.id||"")}"><div class="road-form-grid"><div><label>Official display name</label><input name="canonical_name" required value="${esc(r.canonical_name||"")}" placeholder="OH-800"></div><div><label>Road type</label><select name="road_type"><option value="interstate">Interstate</option><option value="us_route">U.S. route</option><option value="state_route">State route</option><option value="county">County road</option><option value="township">Township road</option><option value="local">Local road</option><option value="access">Access / lease road</option></select></div><div><label>State</label><input name="state" value="${esc(r.state||"")}" placeholder="OH"></div><div><label>County</label><input name="county" value="${esc(r.county||"")}"></div><div><label>Township</label><input name="township" value="${esc(r.township||"")}"></div><div><label>Surface</label><select name="surface"><option value="">Unknown</option><option value="paved">Paved</option><option value="gravel">Gravel</option><option value="mixed">Mixed</option><option value="dirt">Dirt</option></select></div><div class="wide"><label>Aliases / old names (comma separated)</label><input name="aliases" value="${esc((r.aliases||[]).join(", "))}" placeholder="SR 800, State Route 800"></div><div><label>CB channel</label><input name="cb_channel" value="${esc(r.cb_channel||"")}"></div><div><label>Verification</label><select name="verification_status"><option value="needs_review">Needs review</option><option value="map_match">Public map match</option><option value="field_name">Local / field name</option><option value="verified">Official road verified</option></select></div><div class="wide"><label>Road notes / restrictions</label><textarea name="notes" rows="3">${esc(r.notes||"")}</textarea></div></div><h3>Road warnings and features</h3><div class="road-check-grid">${ROAD_FLAGS.map(k=>`<label><input type="checkbox" name="${k}" ${r[k]?"checked":""}> ${ROAD_FLAG_LABELS[k]}</label>`).join("")}</div><div class="road-form-actions"><button class="btn ghost" type="button" id="roadFormCancel">Cancel</button><button class="btn primary" type="submit">Save road</button></div></form></section>`;
      const form=host.querySelector("form"); form.elements.road_type.value=r.road_type||"local"; form.elements.surface.value=r.surface||""; form.elements.verification_status.value=r.verification_status||"needs_review";
      document.getElementById("roadFormCancel").onclick=()=>{host.innerHTML="";};
      form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form),id=fd.get("id"),body={canonical_name:normalize(fd.get("canonical_name")),normalized_name:roadNormalizeKey(fd.get("canonical_name")),road_type:fd.get("road_type"),state:normalize(fd.get("state"))||null,county:normalize(fd.get("county"))||null,township:normalize(fd.get("township"))||null,aliases:String(fd.get("aliases")||"").split(",").map(x=>normalize(x)).filter(Boolean),surface:fd.get("surface")||null,cb_channel:normalize(fd.get("cb_channel"))||null,notes:normalize(fd.get("notes"))||null,verification_status:fd.get("verification_status")};ROAD_FLAGS.forEach(k=>body[k]=fd.get(k)==="on");try{await editorRequest(`/rest/v1/brinesearch_roads${id?`?id=eq.${encodeURIComponent(id)}`:""}`,{method:id?"PATCH":"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(body)});showToast("Road saved");host.innerHTML="";await loadRoadManager();}catch(err){alert(err.message||"Could not save road.");}};
    }
    async function loadRoadManager(){const q=document.getElementById("roadManagerSearch")?.value||"";const list=document.getElementById("roadManagerList");if(!list)return;list.innerHTML='<p class="admin-empty">Loading roads…</p>';try{roadManagerRows=await fetchRoads(q,250);list.innerHTML=roadManagerRows.length?roadManagerRows.map(roadRowHtml).join(""):'<p class="admin-empty">No roads found.</p>';list.querySelectorAll("[data-road-open]").forEach(b=>b.onclick=()=>renderRoadForm(roadManagerRows.find(r=>r.id===b.dataset.roadOpen)));}catch(err){list.innerHTML=`<p class="admin-empty">${esc(err.message||"Could not load roads.")}</p>`;}}
    async function renderRoadManagerSettings(){document.title="Road Manager · BrineSearch";if(!editorCanEdit()){app.innerHTML=`<main class="road-manager-page"><section class="road-manager-hero"><div><h1>Road Manager</h1><p>Sign in with Editor, Administrator, or Owner access.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section><button class="btn primary" data-open-editor-auth>Sign in</button></main>`;document.querySelector('[data-open-editor-auth]')?.addEventListener('click',()=>openEditorAuth());return;}app.innerHTML=`<main class="road-manager-page"><section class="road-manager-hero"><div><h1>Road Database</h1><p>Fix a road once and reuse its official name, aliases, warnings, restrictions, and verification status across pad routes.</p></div><a class="btn ghost small" href="#/settings">← Settings</a></section><section class="road-manager-card"><div class="road-manager-tools"><input id="roadManagerSearch" placeholder="Search roads…" autocomplete="off"><button class="btn primary" id="roadManagerAdd" type="button"><span class="fm-icon fm-add"></span> Add road</button></div><div class="road-list" id="roadManagerList"></div></section><div id="roadManagerEditor"></div></main>`;let t;document.getElementById("roadManagerSearch").oninput=()=>{clearTimeout(t);t=setTimeout(loadRoadManager,180)};document.getElementById("roadManagerAdd").onclick=()=>renderRoadForm();loadRoadManager();}
    function setupPadRoadPicker(p){const search=document.getElementById("padRoadPickerSearch"),results=document.getElementById("padRoadPickerResults"),linked=document.getElementById("padRoadLinkedList"),route=document.getElementById("editRoadSequence");if(!search||!results||!route)return;let selected=[];const renderLinked=()=>{linked.innerHTML=selected.map((r,i)=>`<div class="road-linked-item"><span><strong>${esc(r.canonical_name)}</strong><small style="display:block;color:var(--muted)">${esc(roadStatusLabel(r.verification_status))}</small></span><button type="button" class="btn ghost small" data-remove-road="${i}">Remove</button></div>`).join("");linked.querySelectorAll("[data-remove-road]").forEach(b=>b.onclick=()=>{selected.splice(Number(b.dataset.removeRoad),1);renderLinked();});};let timer;search.oninput=()=>{clearTimeout(timer);timer=setTimeout(async()=>{const q=search.value.trim();if(!q){results.innerHTML='<div class="pad-editor-help">Start typing to find a road.</div>';return;}try{const rows=await fetchRoads(q,30);results.innerHTML=rows.length?rows.map(r=>`<button type="button" class="road-picker-result" data-pick-road="${esc(r.id)}"><span><strong>${esc(r.canonical_name)}</strong><small>${esc([r.state,r.county,roadStatusLabel(r.verification_status)].filter(Boolean).join(" • "))}</small></span><span class="fm-icon fm-add"></span></button>`).join(""):'<div class="pad-editor-help">No road found. Add it in Road Manager.</div>';results.querySelectorAll("[data-pick-road]").forEach(b=>b.onclick=()=>{const r=rows.find(x=>x.id===b.dataset.pickRoad);if(!r)return;if(!selected.some(x=>x.id===r.id))selected.push(r);const current=route.value.trim();const lines=current?current.split(/\s*(?:→|\n)\s*/).filter(Boolean):[];if(!lines.some(x=>roadNormalizeKey(x)===r.normalized_name)){lines.push(r.canonical_name);route.value=lines.join(" → ");route.dispatchEvent(new Event("input",{bubbles:true}));}renderLinked();search.value="";results.innerHTML='<div class="pad-editor-help">Road added to this route.</div>';});}catch(err){results.innerHTML=`<div class="pad-editor-help">${esc(err.message||"Could not load roads.")}</div>`;}},180);};}

    const INSTALL_GUIDES = {
      iphone: {
        label: "iPhone",
        browsers: {
          safari: {
            label: "Safari",
            title: "Install from Safari",
            steps: [
              ["Open BrineSearch", "Open brinesearch.com in Safari."],
              ["Open the Share menu", "Tap the Share button. If the toolbar is hidden, tap More, then Share."],
              ["Choose Add to Home Screen", "Scroll down and tap Add to Home Screen. If it is missing, tap Edit Actions and add it."],
              ["Finish", "Leave Open as Web App turned on when shown, then tap Add."]
            ],
            note: "The BrineSearch icon will appear on this iPhone's Home Screen and open like an app."
          },
          chrome: {
            label: "Chrome",
            title: "Install from Chrome",
            steps: [
              ["Open BrineSearch", "Open brinesearch.com in Chrome."],
              ["Tap Share", "Tap the Share button on the right side of the address bar."],
              ["Choose Add to Home Screen", "Find and tap Add to Home Screen."],
              ["Finish", "Confirm the name BrineSearch, then tap Add."]
            ],
            note: "If the shortcut does not open as a full web app, use Safari and follow the Safari instructions."
          },
          firefox: {
            label: "Firefox",
            title: "Install from Firefox",
            steps: [
              ["Open BrineSearch", "Open brinesearch.com in Firefox."],
              ["Open Share", "Tap the Share icon in the address bar."],
              ["Choose Add to Home Screen", "Tap Add to Home Screen in the share menu."],
              ["Finish", "Keep the name BrineSearch and tap Add in the top-right corner."]
            ],
            note: "The shortcut will appear on the Home Screen of this iPhone."
          },
          other: {
            label: "Other browser",
            title: "Install from another iPhone browser",
            steps: [
              ["Open BrineSearch", "Open brinesearch.com in your browser."],
              ["Open Share", "Look for the Share button or the browser menu."],
              ["Find Add to Home Screen", "Choose Add to Home Screen, then confirm Add."],
              ["Use Safari if needed", "If that option is not available, open BrineSearch in Safari and use the Safari instructions."]
            ],
            note: "Browser menus can use slightly different wording after an update."
          }
        }
      },
      android: {
        label: "Android",
        browsers: {
          chrome: {
            label: "Chrome",
            title: "Install from Chrome",
            steps: [
              ["Open BrineSearch", "Open brinesearch.com in Chrome."],
              ["Open the menu", "Tap the three-dot menu beside the address bar."],
              ["Choose Install", "Tap Install and create shortcut, then tap Install. If Chrome shows Create shortcut instead, tap it."],
              ["Finish", "Follow the on-screen instructions or tap Add to place BrineSearch on the Home Screen."]
            ],
            note: "Chrome may say Install app, Install, or Create shortcut depending on the phone and Chrome version."
          },
          samsung: {
            label: "Samsung Internet",
            title: "Install from Samsung Internet",
            steps: [
              ["Open BrineSearch", "Open brinesearch.com in Samsung Internet."],
              ["Open the menu", "Tap the browser menu, usually the three lines at the bottom-right."],
              ["Choose Add to Home", "Tap Add page to, Add to Home screen, or the plus install icon."],
              ["Finish", "Choose Home screen and tap Add or Install."]
            ],
            note: "Samsung Internet may show an install banner or a plus icon when BrineSearch is ready to install."
          },
          firefox: {
            label: "Firefox",
            title: "Install from Firefox",
            steps: [
              ["Open BrineSearch", "Open brinesearch.com in Firefox."],
              ["Open the menu", "Tap the three-dot menu."],
              ["Choose Install", "Tap Install. If Firefox shows Add to Home Screen instead, tap that."],
              ["Finish", "Tap Add automatically or place the icon where you want it."]
            ],
            note: "Firefox may use either Install or Add to Home Screen depending on whether it recognizes the web app."
          },
          other: {
            label: "Other browser",
            title: "Install from another Android browser",
            steps: [
              ["Open BrineSearch", "Open brinesearch.com in your browser."],
              ["Open the browser menu", "Look for the three-dot menu, three-line menu, or Share button."],
              ["Choose the install option", "Tap Install app, Install, Add to Home screen, or Create shortcut."],
              ["Use Chrome if needed", "If no install option appears, open BrineSearch in Chrome and use the Chrome instructions."]
            ],
            note: "The exact wording depends on the browser and Android phone manufacturer."
          }
        }
      }
    };

    function detectInstallDeviceAndBrowser(){
      const ua=navigator.userAgent||"";
      const device=/Android/i.test(ua)?"android":/iPhone|iPad|iPod/i.test(ua)?"iphone":"iphone";
      let browser="other";
      if(/SamsungBrowser/i.test(ua)) browser="samsung";
      else if(/FxiOS|Firefox/i.test(ua)) browser="firefox";
      else if(/CriOS|Chrome/i.test(ua)) browser="chrome";
      else if(/Safari/i.test(ua)&&!/EdgiOS|OPiOS/i.test(ua)) browser="safari";
      const supported=INSTALL_GUIDES[device]?.browsers||{};
      if(!supported[browser]) browser=device==="android"?"chrome":"safari";
      return {device,browser};
    }
