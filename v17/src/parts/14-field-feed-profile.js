

    function qualityRecords(type) {
      const hasDirections = p => Boolean(normalize(p.Structured_Road_Sequence) || normalize(p.writtenDirections) || normalize(p.directionsClear) || normalize(p.address));
      if (type === "missing-gps") return pads.filter(p => !padNavigationGps(p));
      if (type === "missing-directions") return pads.filter(p => !hasDirections(p));
      if (type === "field-check") return pads.filter(p => normalize(p.verificationDecision || p.reviewDecision || p.extra_data?.verification_decision).toLowerCase() === "field_check" || normalize(p.researchStatus).toLowerCase().includes("conflict"));
      if (type === "unverified") return pads.filter(p => !(p.official_pad_record && typeof p.official_pad_record === "object"));
      return [];
    }

    function renderQualityPage(type) {
      if (!editorIsOwner()) {
        app.innerHTML = `<div class="empty"><h2>Owner access required</h2><p>Sign in with the BrineSearch owner account to open data-quality lists.</p><button class="btn primary" type="button" onclick="document.getElementById('editorBtn')?.click()">Open editor sign in</button></div>`;
        return;
      }
      const labels = {
        "missing-gps":["Missing navigation GPS","These records have neither saved driver coordinates nor verified official fallback coordinates."],
        "missing-directions":["Missing directions","These records have no written directions, road sequence, clear directions, or address."],
        "field-check":["Needs field check","These records have unresolved location or verification conflicts."],
        "unverified":["Official record not attached","These records do not currently have an attached official pad or lease record."]
      };
      const [title,desc] = labels[type] || ["Data quality","Review records that need attention."];
      const rows = qualityRecords(type).sort((a,b)=>normalize(a.company).localeCompare(normalize(b.company)) || normalize(a.padName).localeCompare(normalize(b.padName)));
      document.title = `${title} · BrineSearch`;
      app.innerHTML = `<section class="quality-page"><div class="quality-head"><div><div class="eyebrow">Owner data quality</div><h1>${esc(title)}</h1><p class="quality-summary">${esc(desc)} ${rows.length.toLocaleString()} record${rows.length===1?'':'s'} found.</p></div><a class="btn ghost" href="#/">Back home</a></div><div class="quality-list">${rows.map(p=>`<a class="quality-card" href="${routeUrl(`pad/${encodeURIComponent(p._id)}`)}"><strong>${esc(display(p.padName))}</strong><span>${esc(display(p.company))} · ${esc(p.county || p.state || 'Location unavailable')}</span></a>`).join('') || '<div class="empty"><h2>No records need attention</h2><p>This check is clear.</p></div>'}</div></section>`;
    }

    function duplicateCandidates(company, state, padName) {
      const targetName = normalize(padName).toLowerCase();
      const targetCompany = normalize(company).toLowerCase();
      const targetState = normalize(state).toLowerCase();
      if (!targetName) return [];
      return pads.filter(p => {
        const sameCompany = normalize(p.company).toLowerCase() === targetCompany;
        const sameState = normalize(p.state).toLowerCase() === targetState;
        const name = normalize(p.padName).toLowerCase();
        return sameCompany && sameState && (name === targetName || name.includes(targetName) || targetName.includes(name));
      }).slice(0,5);
    }

    function refreshAddDuplicateWarning() {
      const box = document.getElementById("addDuplicateWarning");
      if (!box) return;
      const matches = duplicateCandidates(selectedNewCompany(), document.getElementById("newState")?.value, document.getElementById("newPadName")?.value);
      if (!matches.length) { box.classList.remove("show"); box.innerHTML = ""; return; }
      box.innerHTML = `Possible existing record${matches.length===1?'':'s'}: ${matches.map(p=>`<a href="${routeUrl(`pad/${encodeURIComponent(p._id)}`)}">${esc(display(p.padName))}</a>`).join(', ')}. Open and confirm before adding another pad.`;
      box.classList.add("show");
    }

    async function loadMyEditorDashboard() {
      if (!editorCanEdit() || editorIsOwner()) return;
      try {
        const data = await editorRequest("/rest/v1/rpc/my_editor_dashboard", { method:"POST", body:"{}" });
        const d = Array.isArray(data) ? data[0] : data;
        const summary = d?.summary || {};
        const sumEl = document.getElementById("editorMySummary");
        if (sumEl) sumEl.innerHTML = [[summary.success_count||0,"Successful"],[summary.error_count||0,"Failed"],[summary.added_pads||0,"Pads added"],[summary.edits||0,"Saved edits"]].map(([v,l])=>`<div class="editor-stat"><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join('');
        const list = document.getElementById("editorMyActivity");
        if (list) list.innerHTML = (d?.activity||[]).map(item=>`<div class="editor-activity ${esc(item.status||'info')}"><div class="editor-activity-top"><strong>${esc((item.action||'activity').replaceAll('_',' '))}</strong><small>${esc(formatEditorTime(item.created_at))}</small></div><div>${esc([item.company,item.pad_name].filter(Boolean).join(' · ')||'No pad recorded')}</div>${item.error_message?`<div class="editor-activity-error">${esc(item.error_message)}</div>`:''}</div>`).join('') || '<p class="editor-dashboard-empty">No activity recorded yet.</p>';
      } catch (error) {
        const list = document.getElementById("editorMyActivity"); if (list) list.innerHTML = `<p class="editor-dashboard-empty">${esc(error.message)}</p>`;
      }
    }

    function renderNotFound() {
      document.title = "Not found · BrineSearch";
      app.innerHTML = `
        <div class="empty">
          <h2>Page not found</h2>
          <p>That company or pad link does not exist.</p>
          <a class="btn primary" href="#/">Return home</a>
        </div>`;
    }


    // =====================================================================
    // Field Feed v11.8
    // =====================================================================
    const FIELD_TERMS_VERSION = "2026-08-05-v2";
    const FIELD_CATEGORIES = [
      ["","All"],["field_alert","Field alert"],["road_closure","Road closure"],["hazard","Hazard"],
      ["pad_update","Pad update"],["disposal","Disposal"],["weather","Weather"],["frac_activity","Frac activity"],["question","Question"],["meme","Memes"]
    ];
    let fieldFeedCategory = "";
    let fieldFeedSearch = "";
    let fieldFeedRows = [];
    let fieldMyProfile = null;

    function fieldBadgeClass(badge){ return String(badge||"member").toLowerCase().replace(/\s+/g,"-"); }
    function fieldInitials(name){ return String(name||"B").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase(); }
    function fieldAvatar(profile={}){ const name=profile.real_name||profile.display_name||"BrineSearch member"; return profile.avatar_url ? `<span class="feed-avatar"><img src="${esc(profile.avatar_url)}" alt="${esc(name)}" loading="lazy" decoding="async"></span>` : `<span class="feed-avatar" aria-label="${esc(name)}">${esc(fieldInitials(name))}</span>`; }
    function fieldTime(value){ const d=new Date(value); const diff=Date.now()-d.getTime(); if(diff<60000)return"Just now"; if(diff<3600000)return`${Math.floor(diff/60000)}m`; if(diff<86400000)return`${Math.floor(diff/3600000)}h`; if(diff<604800000)return`${Math.floor(diff/86400000)}d`; return d.toLocaleDateString(); }
    
function fieldCategoryIcon(category){const m={field_alert:'fm-warning',road_closure:'fm-road',hazard:'fm-warning',pad_update:'fm-pad',disposal:'fm-disposal',weather:'fm-weather',frac_activity:'fm-pad',question:'fm-info',meme:'fm-camera'};return `<span class="fm-icon ${m[category]||'fm-feed'}"></span>`;}
function fieldCategoryLabel(value){ return (FIELD_CATEGORIES.find(x=>x[0]===value)||[value||"Update",value||"Update"])[1]; }
    function fieldIsModerator(){ return editorHasPermission("owner") || editorHasPermission("administrator") || editorHasPermission("moderator"); }
    async function fieldApi(path,options={}){ return editorRequest(path,options); }

    async function fieldLoadMyProfile(){
      if(!editorSession?.access_token){ fieldMyProfile=null; return null; }
      try{
        const rows=await fieldApi(`/rest/v1/field_profiles?user_id=eq.${encodeURIComponent(editorSession.user.id)}&select=*`);
        fieldMyProfile=Array.isArray(rows)?rows[0]||null:null;
      }catch{ fieldMyProfile=null; }
      return fieldMyProfile;
    }
    async function fieldHasAcceptedTerms(){
      if(!editorSession?.access_token)return false;
      const rows=await fieldApi(`/rest/v1/field_terms_acceptance?user_id=eq.${encodeURIComponent(editorSession.user.id)}&terms_version=eq.${encodeURIComponent(FIELD_TERMS_VERSION)}&select=user_id`);
      return Array.isArray(rows)&&rows.length>0;
    }
    function fieldRulesHtml(){ return `
      <h2>Field Feed Terms & Rules</h2><p><strong>Effective August 5, 2026</strong></p>
      <p>Field Feed is for practical oilfield and trucking information. Posts may be read by the public. Do not post anything you are not authorized to share.</p>
      <h3>1. No personal attacks or company bashing</h3>
      <p class="feed-rules-highlight"><strong>Do not insult, mock, threaten, provoke, shame, or talk trash about another person, driver, employer, contractor, operator, disposal, or service company.</strong> You may report factual operational problems—such as a road closure, long wait, incorrect directions, locked gate, or unsafe condition—but describe what happened without name-calling, rumors, or attacks.</p>
      <h3>2. Safety and accuracy</h3><ul><li>Post only information you reasonably believe is accurate.</li><li>Never encourage unsafe, illegal, overloaded, distracted, or restricted-road driving.</li><li>Emergency information must be directed to 911 or the proper company emergency contact, not only posted here.</li><li>Field information can change. Drivers remain responsible for signs, laws, dispatch instructions, and safe judgment.</li></ul>
      <h3>3. Privacy and confidential information</h3><ul><li>No private phone numbers, home addresses, medical information, payroll details, passwords, gate codes, proprietary schedules, customer lists, or confidential company documents unless you are clearly authorized to share them.</li><li>No doxxing, stalking, impersonation, or posting another person's image to embarrass them.</li><li>Do not post photos while driving or photos that expose restricted information.</li></ul>
      <h3>4. Content rules</h3><ul><li>No harassment, discrimination, threats, pornography, graphic gore, spam, scams, illegal sales, political fighting, or repeated off-topic posts. Oilfield, trucking, diesel, frac, disposal, mechanic, weather, CDL, and work-related memes are allowed when they follow every other rule.</li><li>No unsupported accusations of crimes, drug use, theft, safety violations, or misconduct.</li><li>Use Pad Update, Road Closure, Hazard, Disposal, Weather, Frac Activity, Question, or Field Alert accurately.</li></ul>
      <h3>5. Moderation</h3><p>BrineSearch may label, hide, remove, preserve, or review content; limit posting; issue strikes; suspend accounts; and provide information when legally required. Moderation decisions are based on safety and usefulness, not on which company someone works for. Reports may be reviewed by the owner, administrators, and an AI-assisted moderator. AI review supports—but does not replace—human judgment.</p>
      <h3>6. No guarantee</h3><p>BrineSearch and Field Feed are provided as-is. Information may be incomplete, outdated, or wrong. BrineSearch does not replace dispatch, official maps, road signs, company policy, permits, or emergency services.</p>
      <h3>7. Identity and account responsibility</h3><p>You are responsible for your account and posts. A genuine first and last name is required on every posting profile. An optional username may be used for tagging and search, but it does not replace the real name shown with posts. Impersonation, fake names, or misleading employment claims may result in suspension. Company Representative badges require separate verification.</p>
      <h3>8. Independent platform disclaimer</h3><p><strong>BrineSearch is independently owned and operated.</strong> It is not affiliated with, sponsored by, endorsed by, or operated on behalf of the owner's employer or any oil-and-gas operator, trucking company, contractor, disposal, service provider, or other company unless BrineSearch explicitly states otherwise. User posts are the users' own statements and do not represent their employers. No employer or company is responsible for BrineSearch, Field Feed content, moderation decisions, directions, or user conduct.</p>
      <h3>9. Privacy summary</h3><p>BrineSearch stores account/profile details, posts, comments, confirmations, reports, moderation records, terms acceptance, and technical timestamps. Public profile fields and published content can be seen by others. Passwords are handled by Supabase authentication and are not displayed to BrineSearch moderators.</p>`; }
    async function fieldRequireReady(){
      if(!editorSession?.access_token){ openEditorAuth(); editorStatusElement("Log in or sign up to post on Field Feed.","info"); return false; }
      await fieldLoadMyProfile();
      if(!fieldMyProfile||!fieldMyProfile.real_name||!String(fieldMyProfile.real_name).trim().includes(" ")){ fieldOpenProfileSetup(); return false; }
      if(fieldMyProfile.status!=="active"){ alert("Your Field Feed profile is suspended. Contact BrineSearch support."); return false; }
      if(!(await fieldHasAcceptedTerms())){ fieldOpenTerms(); return false; }
      return true;
    }
    function fieldOpenTerms(){
      document.getElementById("fieldTermsOverlay")?.remove();
      const el=document.createElement("div"); el.id="fieldTermsOverlay"; el.className="feed-terms-overlay";
      el.innerHTML=`<div class="feed-terms-sheet">${fieldRulesHtml()}<label style="display:flex;gap:9px;align-items:flex-start;margin-top:13px"><input id="fieldTermsCheck" type="checkbox" style="width:22px;height:22px;flex:0 0 auto"><span style="font-size:.82rem">I have read and agree to the Terms, Privacy Summary, and Community Rules, including the real-name requirement, independent-platform disclaimer, and rule against personal attacks and company bashing.</span></label><div class="feed-terms-actions"><button class="feed-secondary" id="fieldTermsClose">Not now</button><button class="feed-primary" id="fieldTermsAccept" disabled>Accept & continue</button></div></div>`;
      document.body.appendChild(el);
      const check=el.querySelector("#fieldTermsCheck"), accept=el.querySelector("#fieldTermsAccept");
      check.addEventListener("change",()=>accept.disabled=!check.checked);
      el.querySelector("#fieldTermsClose").addEventListener("click",()=>el.remove());
      accept.addEventListener("click",async()=>{ try{ await fieldApi("/rest/v1/field_terms_acceptance",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({user_id:editorSession.user.id,terms_version:FIELD_TERMS_VERSION})}); el.remove(); renderFieldFeed(); }catch(e){alert(e.message);} });
    }
    function fieldOpenProfileSetup(){
      document.getElementById("fieldTermsOverlay")?.remove();
      const current=fieldMyProfile||{};
      const name=current.display_name||editorProfile?.display_name||editorSession?.user?.user_metadata?.display_name||"";
      const el=document.createElement("div"); el.id="fieldTermsOverlay"; el.className="feed-terms-overlay";
      el.innerHTML=`<div class="feed-terms-sheet"><h2>${current.user_id?'Edit':'Create'} your Field Feed profile</h2><p>Your genuine first and last name is required and appears with every post. A username is optional and is used for tagging and search. Company affiliation is self-reported unless a Verified Rep badge is shown.</p><div class="feed-profile-form"><div class="feed-avatar-picker"><div id="fpAvatarPreview">${fieldAvatar({...current,real_name:current.real_name||name,display_name:current.real_name||name})}</div><div class="feed-avatar-tools"><label class="feed-secondary" for="fpAvatarFile">Choose photo</label><input id="fpAvatarFile" type="file" accept="image/*" hidden><button class="feed-secondary" type="button" id="fpAvatarRemove">Remove photo</button></div></div><input id="fpName" maxlength="80" placeholder="Real first and last name" value="${esc(current.real_name||name)}"><input id="fpUsername" maxlength="24" placeholder="Username (optional, e.g. frankh)" value="${esc(current.username||'')}" autocapitalize="off" autocorrect="off" spellcheck="false"><input id="fpCompany" maxlength="80" placeholder="Company (optional)" value="${esc(current.company||'')}"><select id="fpRole">${['Driver','Dispatcher','Company representative','Water hauling','Frac crew','Disposal','Service provider','Other'].map(x=>`<option value="${x}" ${current.job_role===x?'selected':''}>${x}</option>`).join('')}</select><textarea id="fpBio" maxlength="240" placeholder="Short bio (optional)">${esc(current.bio||'')}</textarea></div><p style="font-size:.75rem;color:var(--muted)">Your real name is public with posts and comments. Usernames must be 3–24 letters, numbers, or underscores. Photos are resized on your phone before saving.</p><div class="feed-terms-actions"><button class="feed-secondary" id="fpClose">Cancel</button><button class="feed-primary" id="fpSave">Save profile</button></div></div>`;
      document.body.appendChild(el); const previousAvatar=current.avatar_url||null; let avatar=previousAvatar, pendingAvatarBlob=null, previewUrl="", uploadedAvatarUrl="";
      const cleanPreview=()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl="";}};
      el.querySelector("#fpClose").onclick=()=>{cleanPreview();el.remove();};
      el.querySelector("#fpAvatarRemove").onclick=()=>{cleanPreview();avatar=null;pendingAvatarBlob=null;el.querySelector("#fpAvatarPreview").innerHTML=fieldAvatar({real_name:el.querySelector('#fpName').value||name});};
      el.querySelector("#fpAvatarFile").onchange=async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>8*1024*1024)return alert('Choose an image under 8 MB.');try{cleanPreview();pendingAvatarBlob=await fieldResizeAvatarBlob(file);previewUrl=URL.createObjectURL(pendingAvatarBlob);el.querySelector("#fpAvatarPreview").innerHTML=fieldAvatar({avatar_url:previewUrl,real_name:el.querySelector('#fpName').value||name});}catch(err){alert(err.message);}};
      el.querySelector("#fpSave").onclick=async()=>{ const save=el.querySelector("#fpSave"); const real_name=el.querySelector("#fpName").value.trim().replace(/\s+/g," "); const username=el.querySelector("#fpUsername").value.trim().toLowerCase().replace(/^@/,""); if(real_name.length<3||!real_name.includes(" "))return alert("Enter your real first and last name."); if(username&&!/^[a-z0-9_]{3,24}$/.test(username))return alert("Username must be 3–24 letters, numbers, or underscores."); save.disabled=true;save.textContent="Saving…"; try{ if(pendingAvatarBlob){uploadedAvatarUrl=await fieldUploadAvatar(pendingAvatarBlob);avatar=uploadedAvatarUrl;} await fieldApi("/rest/v1/field_profiles",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({user_id:editorSession.user.id,display_name:real_name,real_name,username:username||null,company:el.querySelector("#fpCompany").value.trim()||null,job_role:el.querySelector("#fpRole").value,bio:el.querySelector("#fpBio").value.trim()||null,avatar_url:avatar})}); if(previousAvatar&&previousAvatar!==avatar)fieldDeleteOwnedAvatar(previousAvatar).catch(()=>{}); await fieldLoadMyProfile(); cleanPreview(); el.remove(); if(!(await fieldHasAcceptedTerms()))fieldOpenTerms();else fieldRenderProfilePage(); }catch(e){if(uploadedAvatarUrl)fieldDeleteOwnedAvatar(uploadedAvatarUrl).catch(()=>{});save.disabled=false;save.textContent="Save profile";alert(e.message.includes("field_profiles_username_unique")?"That username is already taken.":e.message);} };
    }
    function fieldResizeAvatarBlob(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not read that image.'));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error('That image could not be opened.'));img.onload=()=>{const size=256,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d');const scale=Math.max(size/img.width,size/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('The profile photo could not be prepared.')),'image/jpeg',.84);};img.src=reader.result;};reader.readAsDataURL(file);});}
    async function fieldUploadAvatar(blob){
      if(!editorSession?.access_token||!editorSession?.user?.id)throw new Error('Sign in again before saving a profile photo.');
      const path=`${editorSession.user.id}/avatar-${Date.now()}-${crypto.randomUUID()}.jpg`;
      const response=await fetch(`${SUPABASE_URL}/storage/v1/object/field-feed-images/${path}`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${editorSession.access_token}`,'Content-Type':'image/jpeg','x-upsert':'false'},body:blob});
      if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.message||'Profile photo upload failed.');}
      return `${SUPABASE_URL}/storage/v1/object/public/field-feed-images/${path}`;
    }
    async function fieldDeleteOwnedAvatar(url){
      if(!editorSession?.access_token||!editorSession?.user?.id||!url)return;
      const prefix=`${SUPABASE_URL}/storage/v1/object/public/field-feed-images/${editorSession.user.id}/`;
      if(!String(url).startsWith(prefix))return;
      const path=decodeURIComponent(String(url).slice(`${SUPABASE_URL}/storage/v1/object/public/field-feed-images/`.length));
      await fetch(`${SUPABASE_URL}/storage/v1/object/field-feed-images/${path}`,{method:'DELETE',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${editorSession.access_token}`}});
    }
    async function fieldFetchRows(){
      const body={p_search:fieldFeedSearch||null,p_category:fieldFeedCategory||null,p_limit:50,p_offset:0};
      const rows=await fieldApi("/rest/v1/rpc/field_feed_list",{method:"POST",body:JSON.stringify(body)}); fieldFeedRows=Array.isArray(rows)?rows:[]; return fieldFeedRows;
    }
    function fieldPostCard(p){
      const meta=[]; if(p.company_tag)meta.push(`<span><span class="fm-icon fm-company"></span> ${esc(p.company_tag)}</span>`); if(p.road_name)meta.push(`<span><span class="fm-icon fm-road"></span> ${esc(p.road_name)}</span>`); if(p.pad_id){const pad=pads.find(x=>x._dbId===p.pad_id||x.id===p.pad_id); if(pad)meta.push(`<a href="#/pad/${encodeURIComponent(pad._id)}"><span class="fm-icon fm-pad"></span> ${esc(display(pad.padName))}</a>`);} if(p.latitude&&p.longitude)meta.push(`<a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.latitude},${p.longitude}`)}">Map pin</a>`);
      const canManage=Boolean(editorSession?.user?.id&&(p.author_id===editorSession.user.id||fieldIsModerator()));
      const ownPost=Boolean(editorSession?.user?.id&&p.author_id===editorSession.user.id);
      const menu=canManage?`<div class="feed-post-menu-wrap"><div style="text-align:right"><div class="feed-category-label">${fieldCategoryIcon(p.category)} ${esc(fieldCategoryLabel(p.category))}</div><div class="feed-time">${esc(fieldTime(p.created_at))}</div></div><button class="feed-post-more" type="button" data-post-menu-toggle="${p.id}" aria-label="Post options"><span class="fm-icon fm-more"></span></button><div class="feed-post-menu" id="feedPostMenu-${p.id}" hidden>${ownPost?`<button class="danger" type="button" data-delete-own-post="${p.id}"><span class="fm-icon fm-delete"></span> Delete post</button>`:`<button class="danger" type="button" data-remove-post="${p.id}"><span class="fm-icon fm-delete"></span> Remove post</button>`}</div></div>`:`<div style="text-align:right"><div class="feed-category-label">${fieldCategoryIcon(p.category)} ${esc(fieldCategoryLabel(p.category))}</div><div class="feed-time">${esc(fieldTime(p.created_at))}</div></div>`;
      return `<article class="feed-card ${p.category==='field_alert'?'alert':''}" data-feed-post="${esc(p.id)}"><div class="feed-card-head"><div class="feed-author"><a class="feed-author-link" href="#/feed/member/${encodeURIComponent(p.author_id)}" aria-label="Open ${esc(p.real_name||p.display_name)} profile">${fieldAvatar(p)}<div class="feed-author-copy"><strong>${esc(p.real_name||p.display_name)}${p.username?` <span class="feed-username">@${esc(p.username)}</span>`:''}<span class="feed-badge ${fieldBadgeClass(p.badge)}">${esc(p.badge)}</span>${p.verified_company_rep?'<span class="feed-badge company-rep">Verified Rep</span>':''}</strong><small>${esc([p.job_role,p.profile_company].filter(Boolean).join(' · ')||'BrineSearch member')}</small></div></a></div>${menu}</div><div class="feed-body">${esc(p.body)}</div>${Array.isArray(p.image_urls)&&p.image_urls.length?`<div class="feed-images ${p.image_urls.length===1?'single':''}">${p.image_urls.map(url=>`<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="Field Feed image" loading="lazy"></a>`).join('')}</div>`:''}${meta.length?`<div class="feed-meta">${meta.join('')}</div>`:''}<div class="feed-actions"><button data-feed-vote="helpful" data-post-id="${p.id}"><span class="fm-icon fm-like"></span> Helpful ${p.helpful_count||''}</button><button data-feed-vote="confirmed" data-post-id="${p.id}"><span class="fm-icon fm-check"></span> Confirm ${p.confirm_count||''}</button><button data-feed-comments="${p.id}"><span class="fm-icon fm-comment"></span> ${p.comment_count||'Comment'}</button><button data-feed-report="${p.id}"><span class="fm-icon fm-report"></span> Report</button></div><div class="feed-comments" id="feedComments-${p.id}" hidden></div></article>`;
    }
    function fieldPadFuzzyKey(value){return normalize(value).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
    function fieldPadEditDistance(a,b){
      if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;
      const prev=Array.from({length:b.length+1},(_,i)=>i),cur=new Array(b.length+1);
      for(let i=1;i<=a.length;i++){cur[0]=i;for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));for(let j=0;j<=b.length;j++)prev[j]=cur[j];}
      return prev[b.length];
    }
    function fieldPadFuzzyScore(pad,query){
      const q=fieldPadFuzzyKey(query);if(!q)return 0;
      const name=fieldPadFuzzyKey(display(pad.padName)),company=fieldPadFuzzyKey(display(pad.company)),county=fieldPadFuzzyKey(display(pad.county)),township=fieldPadFuzzyKey(display(pad.township)),state=fieldPadFuzzyKey(display(pad.state));
      const hay=[name,company,county,township,state].filter(Boolean).join(" ");
      if(name===q)return 1000;if(name.startsWith(q))return 900-q.length;if(name.includes(q))return 800-name.indexOf(q);
      const words=hay.split(/\s+/);if(words.some(w=>w.startsWith(q)))return 700;
      if(hay.includes(q))return 650;
      const qwords=q.split(/\s+/).filter(Boolean);if(qwords.length>1&&qwords.every(t=>hay.includes(t)))return 600;
      let qi=0;for(const ch of name){if(ch===q[qi])qi++;if(qi===q.length)return 500-q.length;}
      if(q.length>=3){let best=99;for(const w of words){if(Math.abs(w.length-q.length)<=2)best=Math.min(best,fieldPadEditDistance(w,q));}if(best<=1)return 450;if(best===2&&q.length>=5)return 350;}
      return -1;
    }
    function fieldPadCandidates(query){
      return padRecords.filter(p=>p._dbId && display(p.padName)).map(p=>({p,score:fieldPadFuzzyScore(p,query)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score||display(a.p.padName).localeCompare(display(b.p.padName))).slice(0,20).map(x=>x.p);
    }
    const FIELD_FEED_PAD_PREFILL_KEY = "brinesearch.feedPadPrefill.v1";
    function fieldStorePadPrefill(p){
      sessionStorage.setItem(FIELD_FEED_PAD_PREFILL_KEY, JSON.stringify({
        pad_id:p._dbId||"", pad_name:display(p.padName), company:display(p.company), category:"pad_update"
      }));
    }
    function fieldApplyPadPrefill(){
      const raw=sessionStorage.getItem(FIELD_FEED_PAD_PREFILL_KEY);
      if(!raw)return;
      let data=null;try{data=JSON.parse(raw)}catch{}
      if(!data)return;
      const hidden=document.getElementById("feedPostPad"),label=document.getElementById("feedPostPadLabel"),company=document.getElementById("feedPostCompany"),category=document.getElementById("feedPostCategory"),body=document.getElementById("feedPostBody"),open=document.getElementById("feedPostPadOpen");
      if(hidden)hidden.value=data.pad_id||"";
      if(label)label.textContent=[data.pad_name,data.company].filter(Boolean).join(" · ")||"Linked pad";
      if(open)open.classList.add("has-pad");
      if(company&&!company.value)company.value=data.company||"";
      if(category)category.value=data.category||"pad_update";
      if(body&&!body.value)body.placeholder=`What should drivers know about ${data.pad_name||"this pad"}?`;
      sessionStorage.removeItem(FIELD_FEED_PAD_PREFILL_KEY);
      setTimeout(()=>{body?.focus();document.querySelector('.feed-composer')?.scrollIntoView({behavior:'smooth',block:'start'});},120);
    }
    function fieldSetupPadPicker(){
      const openButton=document.getElementById("feedPostPadOpen"),hidden=document.getElementById("feedPostPad"),label=document.getElementById("feedPostPadLabel");
      if(!openButton||!hidden||!label)return;
      let selectedPad=padRecords.find(p=>String(p._dbId||"")===String(hidden.value||""))||null;
      const setSelected=pad=>{
        selectedPad=pad||null;
        hidden.value=pad?pad._dbId:"";
        label.textContent=pad?`${display(pad.padName)} · ${display(pad.company)}`:"Link a pad (optional)";
        openButton.classList.toggle("has-pad",Boolean(pad));
      };
      openButton.addEventListener("click",()=>{
        document.getElementById("feedPadSearchOverlay")?.remove();
        const overlay=document.createElement("div");overlay.id="feedPadSearchOverlay";overlay.className="feed-pad-search-overlay";
        overlay.innerHTML=`<section class="feed-pad-search-sheet" role="dialog" aria-modal="true" aria-label="Link a pad"><div class="feed-pad-search-head"><div><h2>Link a pad</h2><small style="color:var(--muted)">Type a pad name, company, county, or township.</small></div><button type="button" class="feed-pad-search-close" aria-label="Close"><span class="fm-icon fm-close"></span></button></div>${selectedPad?`<div class="feed-pad-selected-row"><span><strong>${esc(display(selectedPad.padName))}</strong><small style="display:block;color:var(--muted)">${esc(display(selectedPad.company))}</small></span><button type="button" id="feedPadRemove">Remove</button></div>`:""}<input class="feed-pad-search-input" id="feedPadSheetInput" type="search" placeholder="Start typing…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search"><div class="feed-pad-sheet-results" id="feedPadSheetResults"><div class="feed-pad-sheet-empty">Start typing to find a pad.</div></div></section>`;
        document.body.appendChild(overlay);
        const input=overlay.querySelector("#feedPadSheetInput"),results=overlay.querySelector("#feedPadSheetResults");
        const close=()=>overlay.remove();
        overlay.querySelector(".feed-pad-search-close").onclick=close;
        overlay.addEventListener("click",e=>{if(e.target===overlay)close();});
        overlay.querySelector("#feedPadRemove")?.addEventListener("click",()=>{setSelected(null);close();});
        const draw=()=>{
          const q=input.value.trim();
          if(!q){results.innerHTML='<div class="feed-pad-sheet-empty">Start typing to find a pad.</div>';return;}
          const matches=fieldPadCandidates(q);
          results.innerHTML=matches.length?matches.map((pad,i)=>`<button type="button" class="feed-pad-sheet-result" data-sheet-pad="${i}"><span><strong>${esc(display(pad.padName))}</strong><small>${esc([display(pad.company),display(pad.county),display(pad.township),display(pad.state)].filter(Boolean).join(' · '))}</small></span><b>Link</b></button>`).join(''):'<div class="feed-pad-sheet-empty">No close match found. Try fewer letters or the company name.</div>';
          results.querySelectorAll('[data-sheet-pad]').forEach(btn=>btn.onclick=()=>{setSelected(matches[Number(btn.dataset.sheetPad)]);close();});
        };
        input.addEventListener("input",draw);
        setTimeout(()=>input.focus(),80);
      });
    }
    function fieldMaybeShowLoginPrompt() {
      // V17.3 keeps public Feed reading uninterrupted. Account prompts stay inline
      // on the Feed page instead of following users around the rest of the app.
      return;
    }

    async function renderFieldFeed(subpage="", detail=""){
      document.title="Field Feed · BrineSearch"; document.body.classList.remove("pad-nav-active");
      await fieldLoadMyProfile();
      if(subpage==="rules")return fieldRenderRulesPage();
      if(subpage==="profile")return fieldRenderProfilePage();
      if(subpage==="notifications")return fieldRenderNotifications();
      if(subpage==="moderation")return fieldRenderModeration();
      if(subpage==="member"&&detail)return fieldRenderPublicProfile(detail);
      app.innerHTML=`<main class="field-feed-page"><div class="feed-top"><div><h1>Field Feed</h1><p>Useful updates from people working in the field.</p></div><div class="feed-top-actions"><button class="feed-icon-btn" id="feedRulesBtn" title="Rules" aria-label="Field Feed rules"><span class="fm-icon fm-legal"></span></button><button class="feed-icon-btn" id="feedProfileBtn" title="Profile" aria-label="Field Feed profile"><span class="fm-icon fm-profile"></span></button><button class="feed-icon-btn" id="feedNotificationsBtn" title="Notifications" aria-label="Field Feed notifications"><span class="fm-icon fm-notify"></span></button>${fieldIsModerator()?'<button class="feed-icon-btn" id="feedModerationBtn" title="Moderation" aria-label="Field Feed moderation"><span class="fm-icon fm-role-moderator"></span></button>':''}</div></div><div class="feed-toolbar feed-toolbar-compact"><button class="feed-search-toggle" id="feedSearchToggle" type="button" aria-expanded="${fieldFeedSearch?'true':'false'}" aria-controls="feedSearchPanel"><span class="fm-icon fm-search" aria-hidden="true"></span><span>Search</span></button><select id="feedSort" aria-label="Sort Field Feed posts"><option>Newest first</option></select></div><div class="feed-search-panel${fieldFeedSearch?' is-open':''}" id="feedSearchPanel" ${fieldFeedSearch?'':'hidden'}><label for="feedSearch">Search posts</label><div class="feed-search-row"><input id="feedSearch" type="search" placeholder="Posts, roads, companies, or people" value="${esc(fieldFeedSearch)}" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search"><button class="feed-search-clear" id="feedSearchClear" type="button">Clear</button></div></div><div class="feed-category-filter"><label for="feedCategoryFilter">Filter posts</label><select id="feedCategoryFilter" aria-label="Filter Field Feed posts by category">${FIELD_CATEGORIES.map(([v,l])=>`<option value="${esc(v)}" ${fieldFeedCategory===v?'selected':''}>${esc(v?l:'All posts')}</option>`).join('')}</select></div>${editorSession?.access_token?`<section class="feed-composer feed-composer-social"><div class="feed-composer-head"><strong>Create a post</strong><span class="feed-badge ${fieldBadgeClass((editorPermissions()[0]||'member'))}">${esc(editorIsOwner()?'Owner':editorHasPermission('administrator')?'Administrator':editorHasPermission('moderator')?'Moderator':editorHasPermission('editor')?'Editor':'Member')}</span></div><div class="feed-social-write">${fieldAvatar(fieldMyProfile||{display_name:editorProfile?.display_name||'Member'})}<textarea id="feedPostBody" maxlength="1200" placeholder="What's happening in the field?"></textarea></div><div class="feed-social-tools"><label class="feed-social-tool" for="feedPostImages"><span class="feed-social-tool-icon" aria-hidden="true"><span class="fm-icon fm-camera"></span></span><span>Photo</span></label><button class="feed-social-tool" type="button" id="feedPostPadOpen"><span class="feed-social-tool-icon" aria-hidden="true"><span class="fm-icon fm-pad"></span></span><span>Pad</span></button><button class="feed-social-tool" type="button" id="feedRoadFocus"><span class="feed-social-tool-icon" aria-hidden="true"><span class="fm-icon fm-road"></span></span><span>Road</span></button><button class="feed-social-tool" type="button" id="feedCompanyFocus"><span class="feed-social-tool-icon" aria-hidden="true"><span class="fm-icon fm-company"></span></span><span>Company</span></button></div><div class="feed-social-options"><div class="feed-social-category-label">Choose a post type</div><div class="feed-post-type-picker"><div class="feed-post-type-search-wrap"><input id="feedPostTypeSearch" type="search" placeholder="Search post types" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div><select id="feedPostCategory" aria-label="Post type">${FIELD_CATEGORIES.filter(x=>x[0]).map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}</select></div><div class="feed-post-type-empty" id="feedPostTypeEmpty">No matching post type</div><div class="feed-social-extra"><input id="feedPostCompany" maxlength="80" placeholder="Company (optional)"><div id="feedPadPicker"><input id="feedPostPad" type="hidden" value=""><button type="button" class="feed-pad-link-button" id="feedPostPadOpenSecondary"><span id="feedPostPadLabel">Link a pad (optional)</span><span class="feed-pad-link-caret">Search ›</span></button></div><input id="feedPostRoad" maxlength="100" placeholder="Road name (optional)"><div class="feed-image-picker"><input id="feedPostImages" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden><span id="feedImageStatus">No photos selected · up to 4</span></div></div><div id="feedImagePreview" class="feed-image-preview"></div></div><div class="feed-independent-note">BrineSearch is independent. Posts are public and represent the person posting—not their employer.</div><div class="feed-social-footer"><span class="feed-social-helper">Keep it factual. No personal attacks or company bashing.</span><button class="feed-primary" id="feedPublishBtn">Post</button></div></section>`:`<section class="feed-guest-banner"><span class="feed-guest-icon"><span class="fm-icon fm-feed"></span></span><div><strong>Public field updates stay open to everyone.</strong><p>Sign in only when you want to post, reply, confirm information, follow pads, or report a problem.</p></div><button class="feed-primary" id="feedLoginBtn">Sign in to contribute</button></section>`}<div id="feedList"><div class="feed-empty">Loading field updates…</div></div></main>`;
      document.getElementById("feedRulesBtn").onclick=()=>location.hash="#/feed/rules"; document.getElementById("feedProfileBtn").onclick=()=>location.hash="#/feed/profile"; document.getElementById("feedNotificationsBtn").onclick=()=>location.hash="#/feed/notifications"; document.getElementById("feedModerationBtn")?.addEventListener("click",()=>location.hash="#/feed/moderation"); document.getElementById("feedLoginBtn")?.addEventListener("click",openEditorAuth);
      const feedCategoryFilter=document.getElementById("feedCategoryFilter"); if(feedCategoryFilter) feedCategoryFilter.onchange=()=>{fieldFeedCategory=feedCategoryFilter.value||"";renderFieldFeed();};
      const refreshVisibleFeed=async()=>{const list=document.getElementById("feedList");if(!list)return;try{await fieldFetchRows();list.innerHTML=fieldFeedRows.length?fieldFeedRows.map(fieldPostCard).join(""):'<div class="feed-empty">No posts match this view yet.</div>';fieldBindPostActions();}catch(e){list.innerHTML=`<div class="feed-empty">${esc(e.message)}</div>`;}};
      const feedSearchToggle=document.getElementById("feedSearchToggle"),feedSearchPanel=document.getElementById("feedSearchPanel"),feedSearchInput=document.getElementById("feedSearch"),feedSearchClear=document.getElementById("feedSearchClear");
      const setFeedSearchOpen=open=>{if(!feedSearchPanel||!feedSearchToggle)return;feedSearchPanel.hidden=!open;feedSearchPanel.classList.toggle("is-open",open);feedSearchToggle.setAttribute("aria-expanded",String(open));if(open)requestAnimationFrame(()=>feedSearchInput?.focus());};
      feedSearchToggle?.addEventListener("click",()=>setFeedSearchOpen(feedSearchPanel?.hidden!==false));
      let timer; feedSearchInput?.addEventListener("input",e=>{clearTimeout(timer);timer=setTimeout(()=>{fieldFeedSearch=e.target.value.trim();refreshVisibleFeed();},300)});
      feedSearchInput?.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();setFeedSearchOpen(false);feedSearchToggle?.focus();}});
      feedSearchClear?.addEventListener("click",()=>{clearTimeout(timer);fieldFeedSearch="";if(feedSearchInput)feedSearchInput.value="";refreshVisibleFeed();feedSearchInput?.focus();});
      document.getElementById("feedPublishBtn")?.addEventListener("click",fieldPublishPost);
      const feedBody=document.getElementById("feedPostBody");
      if(feedBody){
        const resizeFeedBody=()=>{feedBody.style.height="88px";feedBody.style.height=Math.min(220,Math.max(88,feedBody.scrollHeight))+"px";feedBody.style.overflowY=feedBody.scrollHeight>220?"auto":"hidden";};
        feedBody.addEventListener("input",resizeFeedBody);
        requestAnimationFrame(resizeFeedBody);
      }
      fieldSetupImagePicker();
      fieldApplyPadPrefill();
      fieldSetupPadPicker();
      document.getElementById("feedPostPadOpenSecondary")?.addEventListener("click",()=>document.getElementById("feedPostPadOpen")?.click());
      document.getElementById("feedRoadFocus")?.addEventListener("click",()=>document.getElementById("feedPostRoad")?.focus());
      document.getElementById("feedCompanyFocus")?.addEventListener("click",()=>document.getElementById("feedPostCompany")?.focus());
      const postTypeSearch=document.getElementById("feedPostTypeSearch"),postTypeSelect=document.getElementById("feedPostCategory"),postTypeEmpty=document.getElementById("feedPostTypeEmpty");
      if(postTypeSearch&&postTypeSelect){
        const postTypes=FIELD_CATEGORIES.filter(x=>x[0]);
        const renderPostTypeOptions=()=>{
          const query=postTypeSearch.value.trim().toLowerCase();
          const current=postTypeSelect.value;
          const matches=postTypes.filter(([value,label])=>!query||label.toLowerCase().includes(query)||value.toLowerCase().includes(query));
          postTypeSelect.innerHTML=matches.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join("");
          if(matches.some(([value])=>value===current))postTypeSelect.value=current;
          postTypeSelect.disabled=!matches.length;
          postTypeEmpty?.classList.toggle("show",!matches.length);
        };
        postTypeSearch.addEventListener("input",renderPostTypeOptions);
        postTypeSearch.addEventListener("search",renderPostTypeOptions);
      }
      await refreshVisibleFeed();
    }
    let fieldPendingImages=[];
    async function fieldResizePostImage(file){
      if(file.type==='image/gif'){ if(file.size>6*1024*1024)throw new Error('GIF must be under 6 MB.'); return file; }
      const bitmap=await createImageBitmap(file); const max=1600,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)); const canvas=document.createElement('canvas'); canvas.width=Math.round(bitmap.width*scale); canvas.height=Math.round(bitmap.height*scale); canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height); return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(new File([b],file.name.replace(/\.[^.]+$/,'.jpg'),{type:'image/jpeg'})):reject(new Error('Could not prepare image.')),'image/jpeg',.84));
    }
    function fieldSetupImagePicker(){
      fieldPendingImages=[]; const input=document.getElementById('feedPostImages'),preview=document.getElementById('feedImagePreview'),status=document.getElementById('feedImageStatus'); if(!input)return;
      input.onchange=async()=>{const files=[...(input.files||[])].slice(0,4); try{fieldPendingImages=[];const allowedTypes=new Set(['image/jpeg','image/png','image/webp','image/gif']);for(const f of files){if(!allowedTypes.has(String(f.type||'').toLowerCase()))throw new Error('Only JPG, PNG, WebP, or GIF images are allowed.');if(f.size>10*1024*1024)throw new Error('Choose images under 10 MB.');fieldPendingImages.push(await fieldResizePostImage(f));}status.textContent=`${fieldPendingImages.length} image${fieldPendingImages.length===1?'':'s'} ready`;preview.innerHTML=fieldPendingImages.map((f,i)=>`<div><img src="${URL.createObjectURL(f)}" alt="Preview"><button type="button" data-remove-feed-image="${i}"><span class="fm-icon fm-close"></span></button></div>`).join('');preview.querySelectorAll('[data-remove-feed-image]').forEach(b=>b.onclick=()=>{fieldPendingImages.splice(Number(b.dataset.removeFeedImage),1);status.textContent=`${fieldPendingImages.length} image${fieldPendingImages.length===1?'':'s'} ready`;b.parentElement.remove();});}catch(e){alert(e.message);input.value='';fieldPendingImages=[];preview.innerHTML='';status.textContent='Up to 4 images';}};
    }
    async function fieldUploadPostImages(){
      const urls=[]; for(const file of fieldPendingImages){const safe=(file.name||'image.jpg').toLowerCase().replace(/[^a-z0-9._-]+/g,'-');const path=`${editorSession.user.id}/${Date.now()}-${crypto.randomUUID()}-${safe}`;const res=await fetch(`${SUPABASE_URL}/storage/v1/object/field-feed-images/${path}`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${editorSession.access_token}`,'Content-Type':file.type,'x-upsert':'false'},body:file});if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.message||'Image upload failed.');}urls.push(`${SUPABASE_URL}/storage/v1/object/public/field-feed-images/${path}`);} return urls;
    }
    async function fieldPublishPost(){
      if(!(await fieldRequireReady()))return;
      const category=document.getElementById("feedPostCategory").value, body=document.getElementById("feedPostBody").value.trim(); if(body.length<5)return alert("Add a little more detail.");
      const banned=/\b(idiot|moron|stupid ass|piece of shit|trash company|garbage company|fuck (him|her|them|that company)|dumbass)\b/i; if(banned.test(body))return alert("Rewrite this as a factual field update. Personal attacks and company bashing are not allowed.");
      const payload={author_id:editorSession.user.id,category,body,company_tag:document.getElementById("feedPostCompany").value.trim()||null,pad_id:document.getElementById("feedPostPad").value||null,road_name:document.getElementById("feedPostRoad").value.trim()||null,image_urls:[]}; if(category==='field_alert')payload.expires_at=new Date(Date.now()+48*3600000).toISOString();
      try{ const btn=document.getElementById('feedPublishBtn');btn.disabled=true;btn.textContent=fieldPendingImages.length?'Uploading…':'Posting…';payload.image_urls=await fieldUploadPostImages();await fieldApi("/rest/v1/field_posts",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(payload)}); fieldPendingImages=[]; renderFieldFeed(); }catch(e){alert(e.message);const btn=document.getElementById('feedPublishBtn');if(btn){btn.disabled=false;btn.textContent='Post update';}}
    }
    function fieldClosePostMenus(exceptId=""){
      document.querySelectorAll('.feed-post-menu').forEach(menu=>{if(menu.id!==`feedPostMenu-${exceptId}`)menu.hidden=true;});
    }
    function fieldConfirmDeletePost(postId,moderator=false){
      document.getElementById('feedDeleteOverlay')?.remove();
      const overlay=document.createElement('div');overlay.id='feedDeleteOverlay';overlay.className='feed-delete-overlay';
      overlay.innerHTML=`<section class="feed-delete-sheet" role="dialog" aria-modal="true"><h2>${moderator?'Remove this post?':'Delete this post?'}</h2><p>${moderator?'The post will be removed from public view and retained in the moderation record.':'The post will disappear from the Feed. You will have 10 seconds to undo it.'}</p><div class="feed-delete-actions"><button class="feed-delete-cancel" type="button">Cancel</button><button class="feed-delete-confirm" type="button">${moderator?'Remove':'Delete'}</button></div></section>`;
      document.body.appendChild(overlay);const close=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)close();};overlay.querySelector('.feed-delete-cancel').onclick=close;
      overlay.querySelector('.feed-delete-confirm').onclick=async()=>{const btn=overlay.querySelector('.feed-delete-confirm');btn.disabled=true;btn.textContent=moderator?'Removing…':'Deleting…';try{if(moderator){await fieldApi('/rest/v1/rpc/field_moderate_content',{method:'POST',body:JSON.stringify({p_target_type:'post',p_target_id:postId,p_action:'remove',p_reason:'Removed by moderator'})});}else{await fieldApi('/rest/v1/rpc/field_delete_own_post',{method:'POST',body:JSON.stringify({p_post_id:postId})});}close();document.querySelector(`[data-feed-post="${postId}"]`)?.remove();if(!moderator)fieldShowUndoDelete(postId);}catch(e){alert(e.message);btn.disabled=false;btn.textContent=moderator?'Remove':'Delete';}};
    }
    function fieldShowUndoDelete(postId){
      document.querySelector('.feed-undo-toast')?.remove();const toast=document.createElement('div');toast.className='feed-undo-toast';toast.innerHTML='<span>Post deleted</span><button type="button">Undo</button>';document.body.appendChild(toast);
      const timer=setTimeout(()=>toast.remove(),10000);toast.querySelector('button').onclick=async()=>{clearTimeout(timer);try{await fieldApi('/rest/v1/rpc/field_restore_own_post',{method:'POST',body:JSON.stringify({p_post_id:postId})});toast.remove();renderFieldFeed();}catch(e){toast.remove();alert(e.message);}};
    }
    function fieldBindPostActions(){
      document.querySelectorAll("[data-feed-vote]").forEach(b=>b.onclick=async()=>{if(!(await fieldRequireReady()))return; try{await fieldApi("/rest/v1/field_post_votes",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({post_id:b.dataset.postId,user_id:editorSession.user.id,vote:b.dataset.feedVote})});renderFieldFeed();}catch(e){alert(e.message);}});
      document.querySelectorAll("[data-feed-comments]").forEach(b=>b.onclick=()=>fieldToggleComments(b.dataset.feedComments));
      document.querySelectorAll("[data-feed-report]").forEach(b=>b.onclick=()=>fieldReportPost(b.dataset.feedReport));
      document.querySelectorAll('[data-post-menu-toggle]').forEach(b=>b.onclick=e=>{e.stopPropagation();const id=b.dataset.postMenuToggle,menu=document.getElementById(`feedPostMenu-${id}`);const opening=menu?.hidden;fieldClosePostMenus(id);if(menu)menu.hidden=!opening;});
      document.querySelectorAll('[data-delete-own-post]').forEach(b=>b.onclick=e=>{e.stopPropagation();fieldClosePostMenus();fieldConfirmDeletePost(b.dataset.deleteOwnPost,false);});
      document.querySelectorAll('[data-remove-post]').forEach(b=>b.onclick=e=>{e.stopPropagation();fieldClosePostMenus();fieldConfirmDeletePost(b.dataset.removePost,true);});
      document.addEventListener('click',()=>fieldClosePostMenus(),{once:true});
    }
    async function fieldToggleComments(postId){ const box=document.getElementById(`feedComments-${postId}`); if(!box)return; if(!box.hidden){box.hidden=true;return;} box.hidden=false;box.innerHTML='Loading comments…'; try{const rows=await fieldApi("/rest/v1/rpc/field_comments_list",{method:"POST",body:JSON.stringify({p_post_id:postId})});box.innerHTML=`${(rows||[]).map(c=>`<div class="feed-comment"><a class="feed-author-link" href="#/feed/member/${encodeURIComponent(c.author_id)}" aria-label="Open ${esc(c.real_name||c.display_name)} profile">${fieldAvatar(c)}</a><div class="feed-comment-body"><a class="feed-author-link" href="#/feed/member/${encodeURIComponent(c.author_id)}"><strong>${esc(c.real_name||c.display_name)}${c.username?` <span class="feed-username">@${esc(c.username)}</span>`:""} <span class="feed-badge ${fieldBadgeClass(c.badge)}">${esc(c.badge)}</span></strong></a><p>${esc(c.body)}</p></div></div>`).join('')||'<p style="color:var(--muted);font-size:.78rem">No comments yet.</p>'}${editorSession?.access_token?`<div class="feed-comment-form"><input maxlength="500" id="feedCommentInput-${postId}" placeholder="Write a useful reply…"><button class="feed-primary" data-submit-comment="${postId}">Post</button></div>`:''}`;box.querySelector("[data-submit-comment]")?.addEventListener("click",()=>fieldSubmitComment(postId));}catch(e){box.innerHTML=esc(e.message);} }
    async function fieldSubmitComment(postId){if(!(await fieldRequireReady()))return;const input=document.getElementById(`feedCommentInput-${postId}`),body=input.value.trim();if(body.length<2)return;try{await fieldApi("/rest/v1/field_comments",{method:"POST",body:JSON.stringify({post_id:postId,author_id:editorSession.user.id,body})});await fieldToggleComments(postId);await fieldToggleComments(postId);}catch(e){alert(e.message);}}
    async function fieldReportPost(postId){if(!(await fieldRequireReady()))return;const reason=prompt("Report reason: personal attack, company bashing, false information, unsafe advice, spam, privacy, or other");if(!reason)return;const details=prompt("Optional details for the moderator:")||null;try{await fieldApi("/rest/v1/field_reports",{method:"POST",body:JSON.stringify({reporter_id:editorSession.user.id,post_id:postId,reason:reason.trim().toLowerCase(),details})});alert("Report sent for moderation.");}catch(e){alert(e.message);}}
    function fieldRenderRulesPage(){document.title="Field Feed Rules · BrineSearch";app.innerHTML=`<main class="field-feed-page field-rules-page"><a class="feed-secondary" href="#/feed">‹ Feed</a><section class="branded-page-hero"><div class="branded-page-wordmark" aria-label="BrineSearch"><span aria-hidden="true">B</span><strong>BrineSearch</strong></div><p class="branded-page-subtitle">Field Feed Terms, Safety & Community Rules</p></section><section class="feed-legal-card">${fieldRulesHtml()}</section></main>`;}
    async function fieldRenderProfilePage(){
      document.title="Field Profile · BrineSearch";
      if(!editorSession?.access_token){app.innerHTML=`<main class="field-feed-page"><section class="feed-empty"><h2>Field Feed profile</h2><p>Log in to create or edit your profile.</p><button class="feed-primary" id="fpLogin">Log in or sign up</button></section></main>`;document.getElementById("fpLogin").onclick=openEditorAuth;return;}
      await fieldLoadMyProfile();if(!fieldMyProfile){fieldOpenProfileSetup();return;}
      let posts=[],comments=[],badgeText=editorProfile?.role||'Member';
      try{const [b,p,c]=await Promise.all([fieldApi("/rest/v1/rpc/field_badge_for_user",{method:"POST",body:JSON.stringify({p_user_id:editorSession.user.id})}),fieldApi(`/rest/v1/field_posts?author_id=eq.${editorSession.user.id}&select=id,category,body,status,created_at&order=created_at.desc&limit=10`),fieldApi(`/rest/v1/field_comments?author_id=eq.${editorSession.user.id}&select=id,body,status,created_at&order=created_at.desc&limit=10`)]);badgeText=typeof b==='string'?b:(b?.field_badge_for_user||badgeText);posts=Array.isArray(p)?p:[];comments=Array.isArray(c)?c:[];}catch{}
      app.innerHTML=`<main class="field-feed-page"><a class="feed-secondary" href="#/feed">‹ Feed</a><section class="feed-profile-card" style="margin-top:10px"><div class="feed-profile-header">${fieldAvatar(fieldMyProfile)}<div><h2 style="margin:0">${esc(fieldMyProfile.real_name||fieldMyProfile.display_name)}</h2>${fieldMyProfile.username?`<div class="feed-profile-username">@${esc(fieldMyProfile.username)}</div>`:""}<span class="feed-badge ${fieldBadgeClass(badgeText)}">${esc(badgeText)}</span>${fieldMyProfile.verified_company_rep?'<span class="feed-badge company-rep">Verified Rep</span>':''}<p style="margin:4px 0;color:var(--muted);font-size:.78rem">${esc([fieldMyProfile.job_role,fieldMyProfile.company].filter(Boolean).join(' · ')||'BrineSearch member')}</p><small class="${fieldMyProfile.status==='active'?'feed-status-active':'feed-status-suspended'}">${esc(fieldMyProfile.status==='active'?'Active profile':fieldMyProfile.status)}</small></div></div><div class="feed-profile-stats"><div><strong>${fieldMyProfile.reputation||0}</strong><small>Reputation</small></div><div><strong>${posts.length}</strong><small>Recent posts</small></div><div><strong>${comments.length}</strong><small>Recent replies</small></div></div><p>${esc(fieldMyProfile.bio||'No bio added.')}</p><div class="feed-profile-actions"><button class="feed-primary" id="fpEdit">Edit profile</button><button class="feed-secondary" id="fpOffline">Offline Mode</button><button class="feed-danger" id="fpDeactivate">Deactivate profile</button></div></section><section class="feed-profile-card"><h3>Your recent activity</h3><div class="feed-profile-activity">${posts.map(x=>`<div class="feed-profile-activity-item"><strong>${esc(fieldCategoryLabel(x.category))} · ${esc(x.status)}</strong><p>${esc(x.body)}</p><small>${esc(fieldTime(x.created_at))}</small></div>`).join('')}${comments.map(x=>`<div class="feed-profile-activity-item"><strong>Comment · ${esc(x.status)}</strong><p>${esc(x.body)}</p><small>${esc(fieldTime(x.created_at))}</small></div>`).join('')||'<p>No feed activity yet.</p>'}</div></section><section class="feed-legal-card"><h3>Independent platform</h3><p>BrineSearch is independently owned and operated. It is not affiliated with or endorsed by your employer or any company unless explicitly stated. User posts are their own statements and do not represent their employers.</p></section><section class="feed-legal-card"><h3>Badge meanings</h3><p><strong>Owner:</strong> BrineSearch owner. <strong>Administrator:</strong> app management and moderation. <strong>Editor:</strong> approved to improve pad records. <strong>Contributor:</strong> useful verified activity. <strong>Company Rep:</strong> affiliation separately verified. <strong>Member:</strong> community account.</p><p><small>Deactivating hides your profile and stops new posting. Existing public posts may remain for safety context and moderation records.</small></p></section></main>`;
      document.getElementById("fpEdit").onclick=fieldOpenProfileSetup;
      document.getElementById("fpOffline").onclick=()=>location.hash="#/offline";
      document.getElementById("fpDeactivate").onclick=async()=>{if(!confirm('Deactivate your Field Feed profile? You can reactivate it by editing and saving your profile later.'))return;try{await fieldApi(`/rest/v1/field_profiles?user_id=eq.${editorSession.user.id}`,{method:'PATCH',body:JSON.stringify({status:'inactive'})});await fieldLoadMyProfile();fieldRenderProfilePage();}catch(e){alert(e.message);}};
    }
    async function fieldRenderPublicProfile(userId){
      document.title="Member Profile · BrineSearch";
      let profile=null,posts=[];
      try{
        const [pr,po]=await Promise.all([
          fieldApi("/rest/v1/rpc/field_public_profile",{method:"POST",body:JSON.stringify({p_user_id:userId})}),
          fieldApi("/rest/v1/rpc/field_public_profile_posts",{method:"POST",body:JSON.stringify({p_user_id:userId,p_limit:200,p_offset:0})})
        ]);
        profile=Array.isArray(pr)?pr[0]||null:pr;
        posts=Array.isArray(po)?po:[];
      }catch(e){app.innerHTML=`<main class="field-feed-page"><a class="feed-secondary feed-public-profile-back" href="#/feed">‹ Feed</a><div class="feed-empty">${esc(e.message)}</div></main>`;return;}
      if(!profile){app.innerHTML='<main class="field-feed-page"><a class="feed-secondary feed-public-profile-back" href="#/feed">‹ Feed</a><div class="feed-empty">This profile is unavailable or inactive.</div></main>';return;}
      const displayName=profile.real_name||'BrineSearch member';
      app.innerHTML=`<main class="field-feed-page"><a class="feed-secondary feed-public-profile-back" href="#/feed">‹ Feed</a><section class="feed-profile-card"><div class="feed-profile-header">${fieldAvatar({...profile,display_name:displayName})}<div><h2 class="feed-public-profile-name">${esc(displayName)}</h2>${profile.username?`<div class="feed-profile-username">@${esc(profile.username)}</div>`:''}<span class="feed-badge ${fieldBadgeClass(profile.badge)}">${esc(profile.badge||'Member')}</span>${profile.verified_company_rep?'<span class="feed-badge company-rep">Verified Rep</span>':''}<p style="margin:4px 0;color:var(--muted);font-size:.78rem">${esc([profile.job_role,profile.company].filter(Boolean).join(' · ')||'BrineSearch member')}</p><div class="feed-public-profile-count">Joined ${esc(new Date(profile.joined_at).toLocaleDateString())}</div></div></div><div class="feed-profile-stats"><div><strong>${profile.reputation||0}</strong><small>Reputation</small></div><div><strong>${profile.post_count||posts.length}</strong><small>Posts</small></div><div><strong>${profile.comment_count||0}</strong><small>Replies</small></div></div><p>${esc(profile.bio||'No bio added.')}</p></section><section class="feed-profile-card"><h3 style="margin-top:0">Posts by ${esc(displayName)}</h3><div class="feed-public-posts" id="fieldPublicPosts">${posts.length?posts.map(fieldPostCard).join(''):'<div class="feed-empty">No published posts yet.</div>'}</div></section></main>`;
      fieldBindPostActions();
    }

    async function fieldRenderNotifications(){document.title="Notifications · BrineSearch";if(!editorSession?.access_token){return fieldRenderProfilePage();}let rows=[];try{rows=await fieldApi(`/rest/v1/field_notifications?user_id=eq.${editorSession.user.id}&select=*&order=created_at.desc&limit=50`);}catch{}app.innerHTML=`<main class="field-feed-page"><a class="feed-secondary" href="#/feed">‹ Feed</a><section class="feed-profile-card" style="margin-top:10px"><h2>Notifications</h2>${rows.length?rows.map(n=>`<div class="feed-notification ${n.read_at?'':'unread'}"><strong>${esc(n.title)}</strong><div>${esc(n.body||'')}</div><small>${esc(fieldTime(n.created_at))}</small></div>`).join(''):'<p>No notifications yet.</p>'}</section></main>`;if(rows.some(x=>!x.read_at))fieldApi(`/rest/v1/field_notifications?user_id=eq.${editorSession.user.id}&read_at=is.null`,{method:"PATCH",body:JSON.stringify({read_at:new Date().toISOString()})}).catch(()=>{});}
    async function fieldRenderModeration(){
      document.title="Field Feed Moderation · BrineSearch";
      if(!fieldIsModerator()){app.innerHTML='<main class="field-feed-page"><div class="feed-empty">Moderator access required.</div></main>';return;}
      let data={reports:[],hidden_posts:[],profiles:[]},actions=[];
      try{const [r,a]=await Promise.all([fieldApi("/rest/v1/rpc/field_moderation_queue",{method:"POST",body:"{}"}),fieldApi('/rest/v1/field_moderation_actions?select=*&order=created_at.desc&limit=40')]);data=typeof r==='object'&&!Array.isArray(r)?r:(r?.[0]||data);actions=Array.isArray(a)?a:[];}catch(e){return app.innerHTML=`<main class="field-feed-page"><div class="feed-empty">${esc(e.message)}</div></main>`;}
      const reports=data.reports||[], profiles=data.profiles||[], hidden=data.hidden_posts||[];
      app.innerHTML=`<main class="field-feed-page"><a class="feed-secondary" href="#/feed">‹ Feed</a><section class="feed-moderation-card" style="margin-top:10px"><h2>Moderator Dashboard</h2><p>Owner and Administrators can review reports, content, accounts, and the audit trail.</p><div class="feed-mod-summary"><div><strong>${reports.length}</strong><small>Open reports</small></div><div><strong>${hidden.length}</strong><small>Hidden/removed</small></div><div><strong>${profiles.length}</strong><small>Flagged accounts</small></div></div></section><section class="feed-moderation-card"><h3>Open reports</h3>${reports.map(r=>`<div class="feed-mod-row"><strong>${esc(String(r.reason||'Report').replaceAll('_',' '))}</strong><div>${esc(r.details||'No details supplied.')}</div>${r.content_body?`<div class="feed-mod-content">${esc(r.content_body)}</div>`:''}<small>${esc(fieldTime(r.created_at))}${r.reporter_name?' · Reported by '+esc(r.reporter_name):''}</small><div class="feed-mod-actions">${r.post_id?`<button class="feed-secondary" data-mod-type="post" data-mod-id="${r.post_id}" data-mod-action="hide">Hide</button><button class="feed-danger" data-mod-type="post" data-mod-id="${r.post_id}" data-mod-action="remove">Remove</button><button class="feed-secondary" data-mod-type="post" data-mod-id="${r.post_id}" data-mod-action="restore">Restore</button>`:''}${r.comment_id?`<button class="feed-secondary" data-mod-type="comment" data-mod-id="${r.comment_id}" data-mod-action="hide">Hide comment</button><button class="feed-danger" data-mod-type="comment" data-mod-id="${r.comment_id}" data-mod-action="remove">Remove comment</button>`:''}<button class="feed-secondary" data-close-report="${r.id}">No violation / close</button></div></div>`).join('')||'<p>No open reports.</p>'}</section><section class="feed-moderation-card"><h3>Accounts needing attention</h3>${profiles.map(p=>`<div class="feed-mod-row" data-user-row="${p.user_id}"><strong>${esc(p.display_name)} <span class="feed-badge ${fieldBadgeClass(p.badge)}">${esc(p.badge)}</span></strong><div>${esc([p.job_role,p.company].filter(Boolean).join(' · ')||'Member')}</div><small>Status: ${esc(p.status)} · Strikes: ${esc(p.rules_strikes||0)} · Reputation: ${esc(p.reputation||0)}</small><div class="feed-mod-user-actions"><button class="feed-secondary" data-user-action="warn" data-user="${p.user_id}">Add strike</button><button class="feed-secondary" data-user-action="unwarn" data-user="${p.user_id}">Remove strike</button><button class="feed-danger" data-user-action="suspend" data-user="${p.user_id}">Suspend feed</button><button class="feed-secondary" data-user-action="activate" data-user="${p.user_id}">Reactivate</button><button class="feed-secondary" data-user-action="contributor" data-user="${p.user_id}">Contributor badge</button><button class="feed-secondary" data-user-action="rep" data-user="${p.user_id}">Verify company rep</button></div></div>`).join('')||'<p>No flagged accounts. Accounts appear here after reports, strikes, suspension, or moderation attention.</p>'}</section><section class="feed-moderation-card"><h3>Hidden and removed posts</h3>${hidden.map(p=>`<div class="feed-mod-row"><strong>${esc(p.display_name||'Member')} · ${esc(p.status)}</strong><div class="feed-mod-content">${esc(p.body||'')}</div><small>${esc(fieldTime(p.created_at))}</small><div class="feed-mod-actions"><button class="feed-secondary" data-mod-type="post" data-mod-id="${p.id}" data-mod-action="restore">Restore</button></div></div>`).join('')||'<p>No hidden content.</p>'}</section><section class="feed-moderation-card"><h3>Moderation history</h3><div class="feed-mod-history">${actions.map(a=>`<div class="feed-mod-row"><strong>${esc(String(a.action||'action').replaceAll('_',' '))}</strong><div>${esc(a.reason||'No reason recorded.')}</div><small>${esc(new Date(a.created_at).toLocaleString())}</small></div>`).join('')||'<p>No moderation actions yet.</p>'}</div></section></main>`;
      document.querySelectorAll('[data-mod-id]').forEach(b=>b.onclick=async()=>{const reason=prompt('Moderation reason:','Violation of Field Feed rules');if(reason===null)return;try{await fieldApi('/rest/v1/rpc/field_moderate_content',{method:'POST',body:JSON.stringify({p_target_type:b.dataset.modType,p_target_id:b.dataset.modId,p_action:b.dataset.modAction,p_reason:reason||'Moderation action'})});fieldRenderModeration();}catch(e){alert(e.message);}});
      document.querySelectorAll('[data-close-report]').forEach(b=>b.onclick=async()=>{try{await fieldApi(`/rest/v1/field_reports?id=eq.${b.dataset.closeReport}`,{method:'PATCH',body:JSON.stringify({status:'closed',reviewed_at:new Date().toISOString(),reviewed_by:editorSession.user.id})});fieldRenderModeration();}catch(e){alert(e.message);}});
      document.querySelectorAll('[data-user-action]').forEach(b=>b.onclick=async()=>{const uid=b.dataset.user,action=b.dataset.userAction;const row=profiles.find(x=>x.user_id===uid);if(!row)return;let patch={};if(action==='warn')patch.rules_strikes=(row.rules_strikes||0)+1;if(action==='unwarn')patch.rules_strikes=Math.max(0,(row.rules_strikes||0)-1);if(action==='suspend')patch.status='suspended';if(action==='activate')patch.status='active';if(action==='contributor')patch.contributor_override=!row.contributor_override;if(action==='rep')patch.verified_company_rep=!row.verified_company_rep;const reason=prompt('Reason for this account action:','Moderator review');if(reason===null)return;try{await fieldApi(`/rest/v1/field_profiles?user_id=eq.${uid}`,{method:'PATCH',body:JSON.stringify(patch)});await fieldApi('/rest/v1/field_moderation_actions',{method:'POST',body:JSON.stringify({moderator_id:editorSession.user.id,target_user_id:uid,action:`profile_${action}`,reason:reason||'Moderator review'})});fieldRenderModeration();}catch(e){alert(e.message);}});
    }
