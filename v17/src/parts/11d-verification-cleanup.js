    // V17.3.7: evidence-backed pad checks. Public/official evidence clears only the checks it can support.
    function padVerificationEvidenceFor(data, field) {
      const key = ({gps_verified:'gps',directions_verified:'directions',wells_verified:'wells',api_verified:'api',property_verified:'property',roads_verified:'roads'})[field];
      return key ? data?.evidence?.[key] : null;
    }

    function padVerificationHelp(field) {
      return ({
        gps_verified:'Saved driver point still needs independent confirmation.',
        directions_verified:'Truck route still needs reviewed route or field confirmation.',
        wells_verified:'Well list still needs a complete official or field match.',
        api_verified:'One or more API numbers still need an exact official match.',
        property_verified:'Property numbers need field, company, or recorded cleanup evidence.',
        roads_verified:'Road names still need official/source or field confirmation.'
      })[field] || 'Still needs confirmation.';
    }

    padVerificationPanelHtml = function(data, canEdit) {
      const fields=['gps_verified','directions_verified','wells_verified','api_verified','property_verified','roads_verified'];
      const checked=fields.filter(field=>Boolean(data?.[field]));
      const missing=fields.filter(field=>!data?.[field]);
      const compactCount=`${checked.length}/6 checked`;
      const reviewedMarkup=checked.length ? `<details class="pad-check-reviewed"><summary>Checked automatically or previously (${checked.length})</summary><div class="pad-check-reviewed-list">${checked.map(field=>{
        const evidence=padVerificationEvidenceFor(data,field);
        return `<div class="pad-check-reviewed-row"><span class="mark">✓</span><span><strong>${esc(padVerificationFieldLabel(field))}</strong><small>${esc(evidence?.basis || 'Previously confirmed by an editor.')}</small></span></div>`;
      }).join('')}</div></details>` : '';
      const missingMarkup=missing.length ? `<div class="pad-check-list">${missing.map(field=>`<div class="pad-check-row"><span class="mark">!</span><span class="pad-check-copy"><strong>${esc(padVerificationFieldLabel(field))}</strong><small>${esc(padVerificationEvidenceFor(data,field)?.basis || padVerificationHelp(field))}</small></span>${canEdit?`<button class="pad-check-confirm" type="button" data-pad-verify-field="${field}" data-pad-verify-value="true">Confirm</button>`:''}</div>`).join('')}</div>` : '';
      return `<div class="pad-check-head"><div><h2>Pad checks</h2><div class="pad-quality-status">${data?.needs_field_check?'Field confirmation required':missing.length?`${missing.length} check${missing.length===1?'':'s'} still need confirmation`:'All six checks are complete'}</div></div><span class="pad-check-count">${esc(compactCount)}</span></div>
        ${data?.needs_field_check?`<div class="pad-quality-warning"><strong>Needs field check.</strong>${data.review_note?` ${esc(data.review_note)}`:' A driver or trusted field source should confirm the unresolved item.'}</div>`:''}
        ${missingMarkup}${reviewedMarkup}
        ${canEdit?`<div class="pad-check-actions">${missing.length>1?`<button class="btn secondary" type="button" data-pad-verify-action="verify_all">Confirm all manually</button>`:''}<button class="btn secondary" type="button" data-pad-verify-action="needs_field_check">Mark field check</button></div>`:''}`;
    };

    loadPadVerification = async function(pad, targetHost) {
      const host=targetHost || document.getElementById('padQualityPanel');
      if(!host) return;
      if(!pad?._dbId){host.hidden=false;host.innerHTML='<div class="pad-quality-note">Pad checks become available when this record is connected to the live database.</div>';return;}
      try{
        const data=await editorRequest('/rest/v1/rpc/pad_verification_get',{method:'POST',body:JSON.stringify({p_pad_id:pad._dbId})});
        const complete=Number(data?.score||0)===100 && !data?.needs_field_check;
        const shell=host.id==='padQualityPanel'?host:host.closest('.pad-quality-card');
        if(complete){host.innerHTML='';host.hidden=true;if(shell&&shell!==host)shell.hidden=true;return;}
        host.hidden=false;if(shell)shell.hidden=false;
        host.innerHTML=padVerificationPanelHtml(data,editorCanEdit());
        host.querySelectorAll('[data-pad-verify-field]').forEach(btn=>btn.onclick=async()=>{
          const field=btn.dataset.padVerifyField;
          if(!confirm(`Confirm ${padVerificationFieldLabel(field)} for this pad? Use this only when you personally checked it or have a trusted field/company source.`))return;
          btn.disabled=true;
          try{await editorRequest('/rest/v1/rpc/pad_verification_set',{method:'POST',body:JSON.stringify({p_pad_id:pad._dbId,p_field:field,p_value:true,p_action:'set_field',p_note:'Manual confirmation from pad page'})});await loadPadVerification(pad,targetHost);}catch(e){alert(e.message);btn.disabled=false;}
        });
        host.querySelector('[data-pad-verify-action="verify_all"]')?.addEventListener('click',async()=>{
          if(!confirm('Confirm every remaining item manually? Only continue if you personally checked all remaining GPS, directions, wells, API, property, and road-name items.'))return;
          try{await editorRequest('/rest/v1/rpc/pad_verification_set',{method:'POST',body:JSON.stringify({p_pad_id:pad._dbId,p_field:null,p_value:true,p_action:'verify_all',p_note:'Manual all-items confirmation from pad page'})});await loadPadVerification(pad,targetHost);}catch(e){alert(e.message);}
        });
        host.querySelector('[data-pad-verify-action="needs_field_check"]')?.addEventListener('click',async()=>{
          const note=prompt('What needs checked in the field?','Unresolved GPS, directions, road access, well/API, property, or site information needs confirmation.');if(note===null)return;
          try{await editorRequest('/rest/v1/rpc/pad_verification_set',{method:'POST',body:JSON.stringify({p_pad_id:pad._dbId,p_field:null,p_value:true,p_action:'needs_field_check',p_note:note})});await loadPadVerification(pad,targetHost);}catch(e){alert(e.message);}
        });
      }catch(e){host.innerHTML=`<div class="pad-quality-note">Pad checks could not be loaded. ${esc(e.message||'')}</div>`;}
    };
