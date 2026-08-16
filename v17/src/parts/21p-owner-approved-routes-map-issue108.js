/* BrineSearch Issue #108 — Owner-only Approved Routes Map.
   Read-only feature module. Final app assembly wiring intentionally waits for PR #98
   because PR #98 currently owns the shared part-order/router files. */
(function () {
  "use strict";

  const TILE_SIZE=256,MIN_ZOOM=8,MAX_ZOOM=19,DEFAULT_CENTER={lat:40.05,lng:-80.72},DEFAULT_ZOOM=10;
  const STATUS_LABELS={approved_by_policy:"Approved by policy",explicitly_approved:"Explicitly approved",candidate:"Candidate",held:"Held",restricted:"Restricted",reference_only:"Reference only"};
  const STATUS_ORDER=Object.keys(STATUS_LABELS),DEFAULT_STATUSES=new Set(STATUS_ORDER.filter(status=>status!=="reference_only"));
  const ROAD_CLASS_LABELS={interstate:"Interstate",us_route:"U.S. Route",state_route:"State route",county:"County road",township:"Township road",municipal:"Municipal road",local:"Local road",ramp:"Ramp",other:"Other"};
  const ROUTE_SYSTEM_OPTIONS=[
    ["1","Interstate · Ohio system 1"],["IR","Interstate · WV system IR"],
    ["2","U.S. Route · Ohio system 2"],["US","U.S. Route · WV system US"],
    ["3","State route · Ohio system 3"],["SR","State route · WV system SR"],
    ["PennDOT NLF","State route · Pennsylvania NLF"]
  ];
  const STATUS_PRIORITY={restricted:0,held:1,explicitly_approved:2,approved_by_policy:3,candidate:4,reference_only:5};
  let state=null;

  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const esc=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const clean=value=>String(value??"").trim();
  const unique=values=>[...new Set(values.filter(Boolean))];

  function world(lat,lng,zoom){
    const scale=TILE_SIZE*(2**zoom),boundedLat=clamp(Number(lat),-85.05112878,85.05112878),sin=Math.sin(boundedLat*Math.PI/180);
    return{x:(Number(lng)+180)/360*scale,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale};
  }
  function latLng(x,y,zoom){
    const scale=TILE_SIZE*(2**zoom),lng=x/scale*360-180,n=Math.PI-(2*Math.PI*y/scale);
    return{lat:clamp(180/Math.PI*Math.atan(Math.sinh(n)),-85.05112878,85.05112878),lng:((lng+540)%360)-180};
  }
  function screenPoint(lat,lng,map=state?.map,center=map?.center){
    if(!map?.root)return null;
    const c=world(center.lat,center.lng,map.zoom),point=world(lat,lng,map.zoom);
    return{x:map.root.clientWidth/2+point.x-c.x,y:map.root.clientHeight/2+point.y-c.y};
  }
  function viewportBounds(map=state?.map){
    if(!map?.root)return null;
    const c=world(map.center.lat,map.center.lng,map.zoom),halfWidth=map.root.clientWidth/2,halfHeight=map.root.clientHeight/2;
    const northWest=latLng(c.x-halfWidth,c.y-halfHeight,map.zoom),southEast=latLng(c.x+halfWidth,c.y+halfHeight,map.zoom);
    return{west:northWest.lng,north:northWest.lat,east:southEast.lng,south:southEast.lat};
  }
  function pointFromScreen(x,y,map=state?.map){
    const c=world(map.center.lat,map.center.lng,map.zoom);
    return latLng(c.x+x-map.root.clientWidth/2,c.y+y-map.root.clientHeight/2,map.zoom);
  }
  function hasOwnerAccess(){
    try{return typeof editorIsOwner==="function"&&editorIsOwner();}catch{return false;}
  }
  async function rpc(name,body,signal){
    if(!hasOwnerAccess())throw new Error("Owner access required.");
    if(typeof editorRequest!=="function")throw new Error("Owner session transport is unavailable.");
    return editorRequest(`/rest/v1/rpc/${name}`,{method:"POST",body:JSON.stringify(body||{}),signal});
  }
  function selected(selector){return[...state.root.querySelectorAll(`${selector}:checked`)].map(element=>element.value);}
  function filters(){
    const value=selector=>state.root.querySelector(selector)?.value||null,routeSystem=value('[data-owner-approved-route-system]');
    return{
      p_state:value('[data-owner-approved-state]'),p_county:clean(value('[data-owner-approved-county]'))||null,
      p_road_classes:selected('[data-owner-approved-class]'),p_route_systems:routeSystem?[routeSystem]:null,
      p_statuses:selected('[data-owner-approved-status]'),p_search:clean(value('[data-owner-approved-search]'))||null,
      p_pad_id:value('[data-owner-approved-pad]')
    };
  }
  function jurisdictionLabel(road){
    return unique([road.state_code,road.county_name||road.county_code,road.township,road.municipality]).join(" · ")||"Jurisdiction unavailable";
  }
  function routeAndClassLabel(road){
    const roadClass=ROAD_CLASS_LABELS[road.road_class]||clean(road.road_class).replaceAll("_"," "),route=clean(road.route_designation);
    return unique([route,roadClass]).join(" · ")||"Road classification unavailable";
  }
  function featureLimit(){
    const width=state.map.root.clientWidth;
    if(width<620)return state.map.zoom<=10?260:340;
    return state.map.zoom<=9?420:state.map.zoom<=12?560:700;
  }

  function renderTiles(){
    const map=state.map,layer=map.tiles,width=map.root.clientWidth,height=map.root.clientHeight;
    if(!width||!height)return;
    const center=world(map.center.lat,map.center.lng,map.zoom),left=center.x-width/2,top=center.y-height/2;
    const minX=Math.floor(left/TILE_SIZE)-1,maxX=Math.floor((left+width)/TILE_SIZE)+1;
    const minY=Math.floor(top/TILE_SIZE)-1,maxY=Math.floor((top+height)/TILE_SIZE)+1,tileCount=2**map.zoom;
    const existing=new Map([...layer.children].map(image=>[image.dataset.tileKey,image])),wanted=new Set();
    for(let tileY=minY;tileY<=maxY;tileY++){
      if(tileY<0||tileY>=tileCount)continue;
      for(let tileX=minX;tileX<=maxX;tileX++){
        const wrappedX=((tileX%tileCount)+tileCount)%tileCount,key=`${map.zoom}/${wrappedX}/${tileY}`;
        wanted.add(key);
        let image=existing.get(key);
        if(!image){
          image=document.createElement("img");image.alt="";image.draggable=false;image.decoding="async";image.dataset.tileKey=key;
          image.src=`https://tile.openstreetmap.org/${key}.png`;layer.appendChild(image);
        }
        image.style.left=`${Math.round(tileX*TILE_SIZE-left)}px`;
        image.style.top=`${Math.round(tileY*TILE_SIZE-top)}px`;
      }
    }
    for(const [key,image] of existing)if(!wanted.has(key))image.remove();
  }
  function lines(geometry){
    if(!geometry)return[];
    if(geometry.type==="LineString")return[geometry.coordinates||[]];
    if(geometry.type==="MultiLineString")return geometry.coordinates||[];
    if(geometry.type==="GeometryCollection")return(geometry.geometries||[]).flatMap(lines);
    return[];
  }
  function pathFor(feature,center){
    return lines(feature?.geometry).map(line=>{
      const points=line.map(([lng,lat])=>screenPoint(lat,lng,state.map,center)).filter(Boolean);
      return points.length<2?"":points.map((point,index)=>`${index?"L":"M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    }).filter(Boolean).join(" ");
  }
  function labelPoint(feature,center){
    const candidates=lines(feature?.geometry).map(line=>line.map(([lng,lat])=>screenPoint(lat,lng,state.map,center)).filter(Boolean)).filter(line=>line.length>1);
    const line=candidates.sort((a,b)=>b.length-a.length)[0];
    return line?.[Math.floor(line.length/2)]||null;
  }
  function overlayOffset(){
    const map=state.map,base=map.overlayCenter;
    if(!base)return{x:0,y:0};
    const oldWorld=world(base.lat,base.lng,map.zoom),currentWorld=world(map.center.lat,map.center.lng,map.zoom);
    return{x:oldWorld.x-currentWorld.x,y:oldWorld.y-currentWorld.y};
  }
  function renderOverlay(force=false){
    const map=state.map,svg=map.overlay,width=Math.max(1,map.root.clientWidth),height=Math.max(1,map.root.clientHeight);
    svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
    const rebuild=force||!map.overlayGroup||map.overlayZoom!==map.zoom||map.overlayWidth!==width||map.overlayHeight!==height;
    if(!rebuild){
      const offset=overlayOffset();map.overlayGroup.setAttribute("transform",`translate(${offset.x.toFixed(1)} ${offset.y.toFixed(1)})`);return;
    }
    svg.replaceChildren();
    const group=document.createElementNS("http://www.w3.org/2000/svg","g"),roadLayer=document.createElementNS("http://www.w3.org/2000/svg","g"),labelLayer=document.createElementNS("http://www.w3.org/2000/svg","g"),padLayer=document.createElementNS("http://www.w3.org/2000/svg","g");
    group.append(roadLayer,labelLayer,padLayer);svg.appendChild(group);
    map.overlayGroup=group;map.overlayCenter={...map.center};map.overlayZoom=map.zoom;map.overlayWidth=width;map.overlayHeight=height;

    for(const feature of state.features){
      const path=pathFor(feature,map.overlayCenter);if(!path)continue;
      const properties=feature.properties||{},status=properties.approval_status||"reference_only";
      const element=document.createElementNS("http://www.w3.org/2000/svg","path"),title=document.createElementNS("http://www.w3.org/2000/svg","title");
      element.setAttribute("d",path);element.setAttribute("class",`owner-approved-road owner-approved-road--${status.replaceAll("_","-")}${properties.identity_id===state.selectedIdentityId?" is-selected":""}`);
      element.dataset.identityId=properties.identity_id||"";element.setAttribute("tabindex","0");element.setAttribute("role","button");
      element.setAttribute("aria-label",`${properties.display_name||"Road"}, ${jurisdictionLabel(properties)}, ${STATUS_LABELS[status]||status}`);
      title.textContent=`${properties.display_name||"Road"} · ${jurisdictionLabel(properties)} · ${STATUS_LABELS[status]||status}`;element.appendChild(title);
      element.addEventListener("click",()=>{if(Date.now()>=map.suppressClickUntil)selectRoad(properties.identity_id);});
      element.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();selectRoad(properties.identity_id);}});
      roadLayer.appendChild(element);
    }

    const labelLimit=width<620?24:64,occupied=new Set();
    const labelFeatures=[...state.features].sort((a,b)=>{
      const ap=a.properties||{},bp=b.properties||{};
      if(ap.identity_id===state.selectedIdentityId)return-1;if(bp.identity_id===state.selectedIdentityId)return 1;
      return(STATUS_PRIORITY[ap.approval_status]??9)-(STATUS_PRIORITY[bp.approval_status]??9);
    });
    let labels=0;
    for(const feature of labelFeatures){
      const properties=feature.properties||{},isSelected=properties.identity_id===state.selectedIdentityId;
      if(!isSelected&&map.zoom<13)continue;if(!isSelected&&labels>=labelLimit)break;
      const point=labelPoint(feature,map.overlayCenter);if(!point||point.x<-60||point.y<-20||point.x>width+60||point.y>height+20)continue;
      const cell=`${Math.floor(point.x/110)}:${Math.floor(point.y/34)}`;if(!isSelected&&occupied.has(cell))continue;occupied.add(cell);
      const text=document.createElementNS("http://www.w3.org/2000/svg","text");text.setAttribute("x",point.x.toFixed(1));text.setAttribute("y",point.y.toFixed(1));
      text.setAttribute("class",`owner-approved-road-label${isSelected?" is-selected":""}`);text.textContent=properties.display_name||properties.route_designation||"Road";labelLayer.appendChild(text);labels++;
    }

    if(state.showPads){
      for(const pad of state.pads){
        if(!Number.isFinite(Number(pad.lat))||!Number.isFinite(Number(pad.lng)))continue;
        const point=screenPoint(Number(pad.lat),Number(pad.lng),map,map.overlayCenter);if(!point)continue;
        const marker=document.createElementNS("http://www.w3.org/2000/svg","circle"),title=document.createElementNS("http://www.w3.org/2000/svg","title");
        marker.setAttribute("cx",point.x);marker.setAttribute("cy",point.y);marker.setAttribute("r","6");marker.setAttribute("class","owner-approved-pad-marker");
        marker.setAttribute("role","img");marker.setAttribute("aria-label",`${pad.company?`${pad.company} — `:""}${pad.pad_name||"Selected pad"}`);
        title.textContent=marker.getAttribute("aria-label");marker.appendChild(title);padLayer.appendChild(marker);
      }
    }
  }
  function renderMap(forceOverlay=false){
    if(!state?.map?.root?.isConnected)return;
    renderTiles();renderOverlay(forceOverlay);
    const zoomLabel=state.root.querySelector('[data-owner-approved-zoom-label]');if(zoomLabel)zoomLabel.textContent=String(state.map.zoom);
  }
  function requestMapRender(forceOverlay=false){
    if(!state)return;state.forceOverlayRender=state.forceOverlayRender||forceOverlay;if(state.renderFrame)return;
    state.renderFrame=requestAnimationFrame(()=>{if(!state)return;const force=state.forceOverlayRender;state.renderFrame=0;state.forceOverlayRender=false;renderMap(force);});
  }
  function setZoom(next,anchorX=null,anchorY=null){
    const map=state.map,zoom=clamp(Math.round(next),MIN_ZOOM,MAX_ZOOM);if(zoom===map.zoom)return;
    const before=anchorX==null?null:pointFromScreen(anchorX,anchorY,map);map.zoom=zoom;
    if(before){const anchor=world(before.lat,before.lng,map.zoom);map.center=latLng(anchor.x-anchorX+map.root.clientWidth/2,anchor.y-anchorY+map.root.clientHeight/2,map.zoom);}
    requestMapRender(true);queueLoad();
  }
  function pan(deltaX,deltaY){
    const map=state.map,center=world(map.center.lat,map.center.lng,map.zoom);map.center=latLng(center.x-deltaX,center.y-deltaY,map.zoom);requestMapRender(false);
  }
  function queueLoad(delay=220){
    if(!state)return;clearTimeout(state.loadTimer);state.loadTimer=setTimeout(loadViewport,delay);
  }
  function setMapStatus(message,kind=""){
    const element=state?.root?.querySelector('[data-owner-approved-map-status]');if(!element)return;
    element.textContent=message;element.className=`owner-approved-map-status${kind?` is-${kind}`:""}`;
  }
  function clearViewport(message){
    state.viewportController?.abort();state.requestSeq++;state.features=[];state.pads=[];requestMapRender(true);renderResults(message);
  }
  async function loadViewport(){
    if(!state?.map?.root?.isConnected)return;
    const activeFilters=filters();
    if(!activeFilters.p_statuses.length){clearViewport("Choose at least one approval status.");setMapStatus("No approval statuses selected.","empty");return;}
    if(!activeFilters.p_road_classes.length){clearViewport("Choose at least one road type.");setMapStatus("No road types selected.","empty");return;}
    const bounds=viewportBounds(),sequence=++state.requestSeq;
    state.viewportController?.abort();state.viewportController=new AbortController();state.root.classList.add("is-loading");setMapStatus("Loading current approved-route evidence…","loading");
    try{
      const data=await rpc("owner_approved_routes_map_viewport",{
        p_west:bounds.west,p_south:bounds.south,p_east:bounds.east,p_north:bounds.north,
        p_zoom:state.map.zoom,p_limit:featureLimit(),...activeFilters
      },state.viewportController.signal),payload=Array.isArray(data)?data[0]:data;
      if(sequence!==state.requestSeq)return;
      state.features=Array.isArray(payload?.features)?payload.features:[];state.pads=Array.isArray(payload?.pads)?payload.pads:[];
      requestMapRender(true);renderResults();
      if(payload?.zoom_required)setMapStatus(`Zoom to level ${payload.zoom_required} or closer to load roads.`,"empty");
      else if(payload?.truncated)setMapStatus(`Showing the first ${state.features.length} matching identities. Zoom in or narrow filters.`,"warning");
      else if(!state.features.length)setMapStatus("No matching exact road identities in this viewport.","empty");
      else setMapStatus(`${state.features.length} matching exact road ${state.features.length===1?"identity":"identities"} in this viewport.`,"ready");
    }catch(error){
      if(sequence!==state.requestSeq||error?.name==="AbortError")return;
      state.features=[];state.pads=[];requestMapRender(true);renderResults("Map data could not be loaded. Adjust the view or retry.");
      setMapStatus(error?.message||"Could not load approved-route map data.","error");
    }finally{if(sequence===state.requestSeq)state.root.classList.remove("is-loading");}
  }
  function renderResults(emptyMessage="No matching exact road identities in this view."){
    const box=state.root.querySelector('[data-owner-approved-results]');if(!box)return;
    if(!state.features.length){box.innerHTML=`<div class="owner-approved-empty">${esc(emptyMessage)}</div>`;return;}
    const nameCounts=new Map();for(const feature of state.features){const name=clean(feature.properties?.display_name).toLowerCase();nameCounts.set(name,(nameCounts.get(name)||0)+1);}
    const visible=state.features.slice(0,160);
    box.innerHTML=visible.map(feature=>{
      const properties=feature.properties||{},selectedRoad=properties.identity_id===state.selectedIdentityId,duplicate=(nameCounts.get(clean(properties.display_name).toLowerCase())||0)>1;
      const jurisdiction=jurisdictionLabel(properties),routeClass=routeAndClassLabel(properties),identity=clean(properties.source_identity_key);
      return`<button type="button" class="owner-approved-result${selectedRoad?" is-selected":""}" data-owner-approved-result="${esc(properties.identity_id)}" aria-label="${esc(`${properties.display_name||"Unnamed road"}; ${jurisdiction}; ${STATUS_LABELS[properties.approval_status]||properties.approval_status}`)}"><span>${esc(properties.display_name||"Unnamed road")}</span><small>${esc(jurisdiction)}</small><small>${esc(routeClass)}${duplicate?' · same-name identity':''}</small><code title="Exact source identity">${esc(identity||"No source identity key")}</code><b class="status status--${esc(properties.approval_status)}">${esc(STATUS_LABELS[properties.approval_status]||properties.approval_status)}</b></button>`;
    }).join("")+(state.features.length>visible.length?`<p class="owner-approved-result-note">Map shows ${state.features.length} identities; the list shows the first ${visible.length}. Narrow filters to inspect the remainder.</p>`:"");
    box.querySelectorAll('[data-owner-approved-result]').forEach(button=>button.addEventListener("click",()=>selectRoad(button.dataset.ownerApprovedResult)));
  }
  async function selectRoad(identityId){
    if(!identityId)return;state.selectedIdentityId=identityId;requestMapRender(true);renderResults();
    const panel=state.root.querySelector('[data-owner-approved-details]');panel?.setAttribute("aria-busy","true");if(panel)panel.innerHTML='<div class="owner-approved-loading">Loading exact road details…</div>';
    const sequence=++state.detailRequestSeq;state.detailController?.abort();state.detailController=new AbortController();
    try{
      const data=await rpc("owner_approved_routes_map_road_detail",{p_identity_id:identityId},state.detailController.signal),detail=Array.isArray(data)?data[0]:data;
      if(sequence!==state.detailRequestSeq)return;renderDetails(detail);
    }catch(error){
      if(sequence!==state.detailRequestSeq||error?.name==="AbortError")return;
      if(panel)panel.innerHTML=`<div class="owner-approved-detail-error" role="alert">${esc(error?.message||"Could not load road details.")}</div>`;
    }finally{if(sequence===state.detailRequestSeq)panel?.removeAttribute("aria-busy");}
  }
  function connectedRoadLabel(road){
    if(typeof road==="string")return road;
    const name=road?.road_name_at_junction||road?.display_name||"Unnamed connected road";
    return`${name} — ${routeAndClassLabel(road)} — ${jurisdictionLabel(road)}`;
  }
  function formatDate(value){
    if(!value)return"Unavailable";const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString():String(value);
  }
  function renderDetails(detail){
    const panel=state.root.querySelector('[data-owner-approved-details]');if(!panel)return;
    if(!detail?.identity_id){panel.textContent="Road detail unavailable.";return;}
    const aliases=(detail.aliases||[]).map(esc).join(", ")||"None recorded";
    const sourceRecords=Array.isArray(detail.source_record_ids)?detail.source_record_ids.join(", "):clean(detail.source_record_ids)||"—";
    const pads=(detail.pads||[]).map(pad=>`<li>${esc(pad.company?`${pad.company} — ${pad.pad_name}`:pad.pad_name)} <small>${esc(pad.occurrence_count)} step occurrence${Number(pad.occurrence_count)===1?"":"s"}</small></li>`).join("")||"<li>No current saved pad-route use.</li>";
    const returnedJunctions=(detail.junctions||[]).slice(0,40),junctionTotal=Number(detail.known_physical_junctions)||0;
    const junctions=returnedJunctions.map(junction=>{
      const connected=(junction.connected_roads||[]).map(connectedRoadLabel).join("; ")||"No connected-road identity available";
      return`<li><button type="button" data-copy-junction="${esc(junction.lat)}, ${esc(junction.lng)}" aria-label="Copy junction coordinates">${esc(Number(junction.lat).toFixed(7))}, ${esc(Number(junction.lng).toFixed(7))}</button><span>${esc(connected)}</span></li>`;
    }).join("")||"<li>No release-current physical junctions are available for this identity.</li>";
    const junctionNote=junctionTotal>returnedJunctions.length?`Showing ${returnedJunctions.length} of ${junctionTotal} release-current junctions.`:`${junctionTotal} release-current physical junction${junctionTotal===1?"":"s"}.`;
    panel.innerHTML=`<div class="owner-approved-detail-head"><div><h3>${esc(detail.display_name||"Unnamed road")}</h3><span class="status status--${esc(detail.approval_status)}">${esc(STATUS_LABELS[detail.approval_status]||detail.approval_status)}</span></div><button type="button" data-owner-approved-focus ${detail.bounds?"":"disabled"}>Focus on map</button></div><dl class="owner-approved-detail-grid"><dt>Canonical name</dt><dd>${esc(detail.canonical_name||"No verified canonical mapping")}</dd><dt>Official identity</dt><dd><code>${esc(detail.source_identity_key)}</code> <button type="button" data-copy-identity>Copy identity</button></dd><dt>Aliases</dt><dd>${aliases}</dd><dt>Structured route</dt><dd>${esc(detail.route_designation||"No exact structured route designation")}<small>${esc(detail.route_system?`System ${detail.route_system} · number ${detail.route_number||"missing"}`:"")}</small></dd><dt>Road type</dt><dd>${esc(ROAD_CLASS_LABELS[detail.road_class]||detail.road_class||"—")}</dd><dt>Jurisdiction</dt><dd>${esc(jurisdictionLabel(detail))}</dd><dt>Source</dt><dd>${esc([detail.source_agency,detail.source_dataset,detail.source_version].filter(Boolean).join(" · ")||"—")}</dd><dt>Source record</dt><dd>${esc(sourceRecords)}</dd><dt>Approval basis</dt><dd>${esc(detail.approval_basis||"—")}</dd><dt>Access / drivable</dt><dd>${esc(`${detail.public_access_status||"unknown"} / ${detail.drivable_status||"unknown"}`)}</dd><dt>Truck evidence</dt><dd>${esc(detail.truck_status||"No positive exact truck-route evidence")}</dd><dt>Restriction</dt><dd>${esc(detail.restriction_summary||"None in exact evidence")}</dd><dt>Held warning</dt><dd>${esc(detail.hold_summary||"None")}</dd><dt>Geometry</dt><dd>${esc(detail.geometry_status||"—")} · ${esc(detail.geometry_segment_count||0)} source segment${Number(detail.geometry_segment_count)===1?"":"s"}</dd><dt>Current graph</dt><dd>${esc(detail.graph_summary||"No release-current graph for this county")}</dd><dt>Verified / sourced</dt><dd>${esc(formatDate(detail.verification_date))}</dd></dl><h4>Pads using this road</h4><ul>${pads}</ul><div class="owner-approved-junction-heading"><h4>Physical junctions</h4><small>${esc(junctionNote)}</small></div><ul class="owner-approved-junction-list">${junctions}</ul>`;
    panel.querySelector('[data-copy-identity]')?.addEventListener("click",event=>copyText(detail.source_identity_key,event.currentTarget,"Identity copied"));
    panel.querySelectorAll('[data-copy-junction]').forEach(button=>button.addEventListener("click",event=>copyText(button.dataset.copyJunction,event.currentTarget,"Coordinates copied")));
    panel.querySelector('[data-owner-approved-focus]')?.addEventListener("click",()=>focusBounds(detail.bounds));
  }
  async function copyText(text,button,successMessage){
    try{await navigator.clipboard.writeText(String(text||""));if(button){const prior=button.textContent;button.textContent=successMessage;setTimeout(()=>{if(button.isConnected)button.textContent=prior;},1300);}}
    catch{setMapStatus("Clipboard access is unavailable. Select and copy the value manually.","warning");}
  }
  function focusBounds(rawBounds){
    if(!rawBounds)return;const bounds={west:Number(rawBounds.west),south:Number(rawBounds.south),east:Number(rawBounds.east),north:Number(rawBounds.north)};
    if(!Object.values(bounds).every(Number.isFinite))return;
    const root=state.map.root,width=Math.max(200,root.clientWidth-80),height=Math.max(200,root.clientHeight-80);let zoom=MIN_ZOOM;
    for(let candidate=MAX_ZOOM;candidate>=MIN_ZOOM;candidate--){const northWest=world(bounds.north,bounds.west,candidate),southEast=world(bounds.south,bounds.east,candidate);if(Math.abs(southEast.x-northWest.x)<=width&&Math.abs(southEast.y-northWest.y)<=height){zoom=candidate;break;}}
    state.map.center={lat:(bounds.north+bounds.south)/2,lng:(bounds.west+bounds.east)/2};state.map.zoom=zoom;requestMapRender(true);queueLoad(80);
  }
  async function populatePads(){
    const select=state.root.querySelector('[data-owner-approved-pad]');
    try{
      const data=await rpc("owner_approved_routes_map_pad_options",{},state.padController.signal),rows=Array.isArray(data)?data:(data?.rows||[]);
      state.padOptions=new Map(rows.map(pad=>[pad.pad_id,pad]));
      if(select)select.innerHTML='<option value="">All pads</option>'+rows.map(pad=>`<option value="${esc(pad.pad_id)}">${esc(pad.company?`${pad.company} — ${pad.pad_name}`:pad.pad_name)}</option>`).join("");
    }catch(error){if(error?.name!=="AbortError"&&select){select.innerHTML='<option value="">Pad list unavailable</option>';select.disabled=true;select.title=error?.message||"Could not load pads";}}
  }
  function selectPad(){
    const select=state.root.querySelector('[data-owner-approved-pad]'),pad=state.padOptions.get(select?.value);
    if(pad&&Number.isFinite(Number(pad.lat))&&Number.isFinite(Number(pad.lng))){
      state.map.center={lat:Number(pad.lat),lng:Number(pad.lng)};state.map.zoom=Math.max(state.map.zoom,13);state.showPads=true;
      const toggle=state.root.querySelector('[data-owner-approved-show-pads]');if(toggle)toggle.checked=true;requestMapRender(true);
    }
    queueLoad(80);
  }
  function bindGestures(){
    const map=state.map,root=map.root;
    root.addEventListener("wheel",event=>{event.preventDefault();const rect=root.getBoundingClientRect();setZoom(map.zoom+(event.deltaY<0?1:-1),event.clientX-rect.left,event.clientY-rect.top);},{passive:false});
    root.addEventListener("pointerdown",event=>{
      if(event.pointerType!=="touch"&&event.button!==0)return;
      map.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});root.setPointerCapture?.(event.pointerId);
      if(map.pointers.size===1){map.drag={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};map.pinch=null;}
      else if(map.pointers.size===2){const points=[...map.pointers.values()],dx=points[1].x-points[0].x,dy=points[1].y-points[0].y;map.pinch={distance:Math.hypot(dx,dy),x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2,moved:false};map.drag=null;}
    });
    root.addEventListener("pointermove",event=>{
      if(!map.pointers.has(event.pointerId))return;map.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(map.pointers.size>=2){
        const points=[...map.pointers.values()].slice(0,2),dx=points[1].x-points[0].x,dy=points[1].y-points[0].y,distance=Math.hypot(dx,dy),x=(points[0].x+points[1].x)/2,y=(points[0].y+points[1].y)/2;
        if(!map.pinch)map.pinch={distance,x,y,moved:false};
        pan(x-map.pinch.x,y-map.pinch.y);map.pinch.moved=true;
        const rect=root.getBoundingClientRect(),ratio=distance/Math.max(1,map.pinch.distance);
        if(ratio>1.32){setZoom(map.zoom+1,x-rect.left,y-rect.top);map.pinch.distance=distance;}
        else if(ratio<.76){setZoom(map.zoom-1,x-rect.left,y-rect.top);map.pinch.distance=distance;}
        map.pinch.x=x;map.pinch.y=y;return;
      }
      if(!map.drag||map.drag.id!==event.pointerId)return;
      const deltaX=event.clientX-map.drag.x,deltaY=event.clientY-map.drag.y;if(Math.abs(deltaX)+Math.abs(deltaY)>2)map.drag.moved=true;
      map.drag.x=event.clientX;map.drag.y=event.clientY;pan(deltaX,deltaY);
    });
    const done=event=>{
      const dragMoved=Boolean(map.drag?.moved||map.pinch?.moved);map.pointers.delete(event.pointerId);
      if(map.pointers.size===1){const [id,point]=map.pointers.entries().next().value;map.drag={id,x:point.x,y:point.y,moved:dragMoved};map.pinch=null;}
      else if(!map.pointers.size){map.drag=null;map.pinch=null;if(dragMoved){map.suppressClickUntil=Date.now()+260;queueLoad(100);}}
    };
    root.addEventListener("pointerup",done);root.addEventListener("pointercancel",done);
    root.addEventListener("dblclick",event=>{event.preventDefault();const rect=root.getBoundingClientRect();setZoom(map.zoom+1,event.clientX-rect.left,event.clientY-rect.top);});
    root.addEventListener("keydown",event=>{
      const panKeys={ArrowLeft:[96,0],ArrowRight:[-96,0],ArrowUp:[0,96],ArrowDown:[0,-96]};
      if(panKeys[event.key]){event.preventDefault();pan(...panKeys[event.key]);queueLoad(100);}
      else if(event.key==="+"||event.key==="="){event.preventDefault();setZoom(map.zoom+1);}
      else if(event.key==="-"||event.key==="_"){event.preventDefault();setZoom(map.zoom-1);}
      else if(event.key==="0"){event.preventDefault();map.center={...DEFAULT_CENTER};map.zoom=DEFAULT_ZOOM;requestMapRender(true);queueLoad(80);}
    });
  }
  function template(){
    const statuses=STATUS_ORDER.map(status=>`<label><input type="checkbox" data-owner-approved-status value="${status}" ${DEFAULT_STATUSES.has(status)?"checked":""}> <span>${STATUS_LABELS[status]}</span></label>`).join("");
    const classes=Object.entries(ROAD_CLASS_LABELS).map(([roadClass,label])=>`<label><input type="checkbox" data-owner-approved-class value="${roadClass}" checked> <span>${label}</span></label>`).join("");
    const routeSystems=ROUTE_SYSTEM_OPTIONS.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join("");
    return`<section class="owner-approved-routes" aria-labelledby="ownerApprovedRoutesTitle"><header><div><p class="eyebrow">Owner Settings</p><h2 id="ownerApprovedRoutesTitle">Approved Routes Map</h2><p>Read-only exact road identities. Restrictions override approvals; reference roads are context only.</p></div><span class="owner-approved-readonly">READ ONLY</span></header><div class="owner-approved-toolbar"><input data-owner-approved-search type="search" maxlength="120" inputmode="search" enterkeyhint="search" autocomplete="off" placeholder="Road name, route, jurisdiction, or exact source identity" aria-label="Road search"><select data-owner-approved-state aria-label="State filter"><option value="">OH + WV + PA</option><option>OH</option><option>WV</option><option>PA</option></select><input data-owner-approved-county maxlength="100" placeholder="County code/name" aria-label="County filter"><select data-owner-approved-route-system aria-label="Exact route-system filter"><option value="">All exact route systems</option>${routeSystems}</select><select data-owner-approved-pad aria-label="Pad route filter"><option value="">All pads</option></select><button type="button" data-owner-approved-refresh>Refresh</button></div><details class="owner-approved-filters"><summary>Road layers and filters</summary><div><fieldset><legend>Approval status</legend>${statuses}</fieldset><fieldset><legend>Road type</legend>${classes}</fieldset><label class="owner-approved-pad-toggle"><input type="checkbox" data-owner-approved-show-pads> <span>Show selected pad marker</span></label></div></details><div class="owner-approved-layout"><div><div class="owner-approved-map-shell"><div class="owner-approved-map" data-owner-approved-map tabindex="0" aria-label="Interactive approved routes map. Drag to pan, pinch or use plus and minus to zoom, and use arrow keys to pan."><div class="owner-approved-tiles" aria-hidden="true"></div><svg class="owner-approved-overlay" aria-label="Road identity overlay"></svg><div class="owner-approved-map-controls"><button type="button" data-owner-approved-zoom-in aria-label="Zoom in">+</button><span data-owner-approved-zoom-label aria-label="Current zoom">${DEFAULT_ZOOM}</span><button type="button" data-owner-approved-zoom-out aria-label="Zoom out">−</button><button type="button" data-owner-approved-home aria-label="Return to regional view">⌂</button></div><a class="owner-approved-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a></div><div class="owner-approved-map-status" data-owner-approved-map-status role="status" aria-live="polite"></div></div><div class="owner-approved-legend">${STATUS_ORDER.map(status=>`<span class="legend legend--${status}">${STATUS_LABELS[status]}</span>`).join("")}<small>Reference-only roads are not approved.</small></div></div><aside aria-label="Road results and details"><div class="owner-approved-results" data-owner-approved-results aria-label="Road results"></div><div class="owner-approved-details" data-owner-approved-details><p>Select a road to inspect exact identity, source, approval basis, pads, and release-current junctions.</p></div></aside></div></section>`;
  }
  async function mount(root){
    if(!(root instanceof Element))throw new Error("Approved Routes Map needs a mount element.");
    if(!hasOwnerAccess()){root.replaceChildren();throw new Error("Owner access required.");}
    root.innerHTML=template();const mapRoot=root.querySelector('[data-owner-approved-map]');
    state={root,map:{root:mapRoot,tiles:mapRoot.querySelector('.owner-approved-tiles'),overlay:mapRoot.querySelector('.owner-approved-overlay'),center:{...DEFAULT_CENTER},zoom:DEFAULT_ZOOM,pointers:new Map(),drag:null,pinch:null,overlayGroup:null,overlayCenter:null,overlayZoom:null,suppressClickUntil:0},features:[],pads:[],padOptions:new Map(),showPads:false,selectedIdentityId:null,requestSeq:0,detailRequestSeq:0,loadTimer:0,renderFrame:0,forceOverlayRender:false,viewportController:null,detailController:null,padController:new AbortController(),resizeObserver:null};
    bindGestures();
    root.querySelector('[data-owner-approved-zoom-in]').addEventListener("click",()=>setZoom(state.map.zoom+1));
    root.querySelector('[data-owner-approved-zoom-out]').addEventListener("click",()=>setZoom(state.map.zoom-1));
    root.querySelector('[data-owner-approved-home]').addEventListener("click",()=>{state.map.center={...DEFAULT_CENTER};state.map.zoom=DEFAULT_ZOOM;requestMapRender(true);queueLoad(80);});
    root.querySelector('[data-owner-approved-refresh]').addEventListener("click",loadViewport);
    root.querySelector('[data-owner-approved-show-pads]').addEventListener("change",event=>{state.showPads=event.target.checked;requestMapRender(true);});
    root.querySelector('[data-owner-approved-pad]').addEventListener("change",selectPad);
    root.querySelectorAll('input,select').forEach(element=>{
      if(!element.matches('[data-owner-approved-show-pads],[data-owner-approved-pad],[data-owner-approved-search],[data-owner-approved-county]'))element.addEventListener("change",()=>queueLoad(100));
    });
    root.querySelector('[data-owner-approved-search]').addEventListener("input",()=>queueLoad(320));
    root.querySelector('[data-owner-approved-county]').addEventListener("input",()=>queueLoad(320));
    if(typeof ResizeObserver==="function"){
      state.resizeObserver=new ResizeObserver(()=>{requestMapRender(true);queueLoad(180);});state.resizeObserver.observe(mapRoot);
    }
    await populatePads();renderMap(true);await loadViewport();
    return{refresh:loadViewport,destroy(){if(!state)return;clearTimeout(state.loadTimer);if(state.renderFrame)cancelAnimationFrame(state.renderFrame);state.viewportController?.abort();state.detailController?.abort();state.padController?.abort();state.resizeObserver?.disconnect();root.replaceChildren();state=null;}};
  }

  window.BrineSearchApprovedRoutesMap=Object.freeze({mount,statusLabels:Object.freeze({...STATUS_LABELS})});
})();
