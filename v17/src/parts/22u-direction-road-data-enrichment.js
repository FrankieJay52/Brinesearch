    /* BrineSearch V17.3.18 — road-by-road data recovery.
       COLOGIE is the display contract: one numbered card per actual road leg,
       maneuver + road on the main line, mileage at right, and supporting facts
       below as notes. Saved mileage always wins. When a saved mileage is absent,
       a previously accepted pad-specific official-centerline road segment may fill
       the badge as approximate. Rejected measurements never reach this layer.

       Verified official local-name/route-number pairs are also restored when the
       card already names the local road and that name maps to exactly one verified
       route in the pad's county. Route-number-only cards are never given a local
       name merely because that number has a name somewhere else. */

    const directionRoadDataRequestsV17318 = new Map();

    function directionStateCodeV17318(p) {
      const state = String(p?.state || "").trim().toLowerCase();
      if (state === "oh" || state === "ohio") return "OH";
      if (state === "wv" || state === "west virginia") return "WV";
      if (state === "pa" || state === "pennsylvania") return "PA";
      return String(p?.state || "").trim().toUpperCase();
    }

    function directionCanonicalRouteKeyV17318(value, p) {
      let text = String(value || "").trim();
      let match = text.match(/\b(Interstate|I)\s*[- ]?\s*(\d{1,4}[A-Z]?)\b/i);
      if (match) return `I-${match[2].toUpperCase()}`;
      match = text.match(/\b(?:U\.?S\.?|US)(?:\s+Route)?\s*[- ]?\s*(\d{1,4}[A-Z]?)\b/i);
      if (match) return `US-${match[1].toUpperCase()}`;
      match = text.match(/\b(?:County\s+(?:Road|Rd|Route|Hwy)|C\.?\s*R\.?|CR)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)\b/i);
      if (match) return `CR-${match[1].toUpperCase()}`;
      match = text.match(/\b(?:Township\s+(?:Road|Rd|Route|Hwy)|T\.?\s*R\.?|TR)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)\b/i);
      if (match) return `TR-${match[1].toUpperCase()}`;
      match = text.match(/\b(OH|WV|PA|SR|State\s+Route)\s*[- ]?\s*(\d{1,4}[A-Z]?)\b/i);
      if (match) {
        const family = /^OH$/i.test(match[1]) ? "OH" : /^WV$/i.test(match[1]) ? "WV" : /^PA$/i.test(match[1]) ? "PA" : directionStateCodeV17318(p);
        return family ? `${family}-${match[2].toUpperCase()}` : `SR-${match[2].toUpperCase()}`;
      }
      return "";
    }

    function directionNameKeyV17318(value) {
      return String(value || "")
        .toLowerCase()
        .replace(/\broad\b/g, "rd")
        .replace(/\bstreet\b/g, "st")
        .replace(/\bavenue\b/g, "ave")
        .replace(/\bboulevard\b/g, "blvd")
        .replace(/\blane\b/g, "ln")
        .replace(/\bdrive\b/g, "dr")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function directionRoadPartsV17318(instruction) {
      const text = String(instruction || "").trim();
      const patterns = [
        /^(Turn\s+(?:left|right)\s+on\s+)(.+)$/i,
        /^((?:Slight|Veer|Bear|Sharp|Stay|Keep)\s+(?:left|right)\s+on\s+)(.+)$/i,
        /^(Head\s+(?:northwest|northeast|southwest|southeast|north|south|east|west)\s+on\s+)(.+)$/i,
        /^(Continue\s+on\s+)(.+)$/i,
        /^(Merge\s+on\s+)(.+)$/i,
        /^(Take\s+)(?!Exit\b)(.+)$/i
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return { prefix:match[1], road:match[2] };
      }
      return { prefix:"", road:"" };
    }

    function directionSplitRoadBearingV17318(value) {
      const text = String(value || "").trim();
      const match = text.match(/^(.*?)(?:\s+(Northwest|Northeast|Southwest|Southeast|North|South|East|West))$/i);
      if (!match) return { road:text, bearing:"" };
      return { road:match[1].trim(), bearing:match[2].charAt(0).toUpperCase()+match[2].slice(1).toLowerCase() };
    }

    function directionRouteOnlyTextV17318(value, p) {
      const text = String(value || "").trim();
      if (!text) return false;
      const route = directionCanonicalRouteKeyV17318(text, p);
      if (!route) return false;
      const without = text
        .replace(/\b(?:Interstate|I)\s*[- ]?\s*\d{1,4}[A-Z]?\b/ig, "")
        .replace(/\b(?:U\.?S\.?|US)(?:\s+Route)?\s*[- ]?\s*\d{1,4}[A-Z]?\b/ig, "")
        .replace(/\b(?:County\s+(?:Road|Rd|Route|Hwy)|C\.?\s*R\.?|CR)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?\b/ig, "")
        .replace(/\b(?:Township\s+(?:Road|Rd|Route|Hwy)|T\.?\s*R\.?|TR)\s*[- ]?\s*\d{1,4}(?:\/\d+)?[A-Z]?\b/ig, "")
        .replace(/\b(?:OH|WV|PA|SR|State\s+Route)\s*[- ]?\s*\d{1,4}[A-Z]?\b/ig, "")
        .replace(/\b(?:Northwest|Northeast|Southwest|Southeast|North|South|East|West)\b/ig, "")
        .replace(/[\s/()-]+/g, "")
        .trim();
      return !without;
    }

    function directionOfficialPairForLocalRoadV17318(roadValue, p) {
      const split = directionSplitRoadBearingV17318(roadValue);
      const road = split.road;
      if (!road || directionCanonicalRouteKeyV17318(road, p)) return null;
      const key = directionNameKeyV17318(road);
      if (!key) return null;
      const rows = Array.isArray(p?.officialRoadAliasesV17318) ? p.officialRoadAliasesV17318 : [];
      const matches = rows.filter(row => {
        const names = [row?.canonical_name, ...(Array.isArray(row?.aliases) ? row.aliases : [])]
          .filter(Boolean)
          .filter(name => !directionCanonicalRouteKeyV17318(name, p));
        return names.some(name => directionNameKeyV17318(name) === key);
      });
      const labels = [...new Set(matches.map(row => String(row?.route_label || "").trim()).filter(Boolean))];
      if (labels.length !== 1) return null;
      return { display:`${labels[0]} / ${road}${split.bearing ? ` ${split.bearing}` : ""}`, routeKey:directionCanonicalRouteKeyV17318(labels[0], p) };
    }

    function directionEnrichCardRoadV17318(card, p) {
      const next = { ...card, notes:[...(card?.notes || [])] };
      const parts = directionRoadPartsV17318(next.instruction);
      if (!parts.road) {
        next.__roadKeyV17318="";
        next.__roadNameKeyV17318="";
        return next;
      }
      let road = parts.road;
      const existingRoute = directionCanonicalRouteKeyV17318(road, p);
      const explicitDouble = Boolean(existingRoute && /\s\/\s/.test(road) && !directionRouteOnlyTextV17318(road, p));
      if (!existingRoute) {
        const official = directionOfficialPairForLocalRoadV17318(road, p);
        if (official) {
          road=official.display;
          next.instruction=`${parts.prefix}${road}`.trim();
          next.doubleName=true;
        }
      }
      const split=directionSplitRoadBearingV17318(road);
      next.__roadKeyV17318=directionCanonicalRouteKeyV17318(road,p);
      let local=split.road;
      if (next.__roadKeyV17318) {
        const sides=split.road.split(/\s+\/\s+/).map(part=>part.trim()).filter(Boolean);
        const nonRoute=sides.find(part=>!directionCanonicalRouteKeyV17318(part,p));
        local=nonRoute || "";
      }
      next.__roadNameKeyV17318=directionNameKeyV17318(local);
      next.__roadGroupKeyV17318=next.__roadKeyV17318
        ? `${next.__roadKeyV17318}|${next.__roadNameKeyV17318}`
        : (next.__roadNameKeyV17318 ? `name:${next.__roadNameKeyV17318}` : "");
      if (explicitDouble) next.doubleName=true;
      return next;
    }

    function directionSameRoadDecisionNoteV17318(card) {
      const text=String(card?.instruction || "").trim();
      let match=text.match(/^(Turn\s+(left|right)|(?:Slight|Veer|Bear|Sharp|Stay|Keep)\s+(left|right))\b/i);
      if (!match) return "";
      const action=match[1].charAt(0).toUpperCase()+match[1].slice(1).toLowerCase();
      const roadParts=directionRoadPartsV17318(text);
      return `${action} and stay on ${roadParts.road || "the same road"}`;
    }

    function directionUniqueTextV17318(values) {
      const seen=new Set();
      const out=[];
      for (const value of values || []) {
        const text=String(value || "").replace(/\s{2,}/g," ").trim();
        if (!text) continue;
        const key=text.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);out.push(text);
      }
      return out;
    }

    function directionFormatMeasuredMilesV17318(value) {
      const miles=Number(value);
      if (!Number.isFinite(miles) || miles<=0) return "";
      const precision=miles>=1 ? 1 : 2;
      return `≈ ${Number(miles.toFixed(precision))} mi`;
    }

    function directionMeasuredSegmentMapV17318(p) {
      const map=new Map();
      for (const row of (Array.isArray(p?.measuredRoadSegmentsV17318) ? p.measuredRoadSegmentsV17318 : [])) {
        const key=directionCanonicalRouteKeyV17318(row?.road_key,p);
        if (!key) continue;
        if (!map.has(key)) map.set(key,[]);
        map.get(key).push(row);
      }
      return map;
    }

    function directionGroupRoadCardsV17318(cards,p) {
      const enriched=(cards || []).map(card=>directionEnrichCardRoadV17318(card,p));
      const groups=[];
      for (const card of enriched) {
        const prev=groups[groups.length-1];
        const same=Boolean(prev && card.__roadGroupKeyV17318 && prev.__roadGroupKeyV17318===card.__roadGroupKeyV17318);
        const prevDistanceCount=Number(prev?.__distanceCountV17318 || (prev?.distance ? 1 : 0));
        const nextDistanceCount=prevDistanceCount+(card?.distance ? 1 : 0);
        if (same && nextDistanceCount<=1) {
          const decision=directionSameRoadDecisionNoteV17318(card);
          prev.notes=directionUniqueTextV17318([...(prev.notes||[]),...(card.notes||[]),decision]);
          if (!prev.distance && card.distance) prev.distance=card.distance;
          prev.doubleName=Boolean(prev.doubleName || card.doubleName);
          prev.__distanceCountV17318=nextDistanceCount;
          continue;
        }
        groups.push({ ...card, notes:directionUniqueTextV17318(card.notes||[]), __distanceCountV17318:card?.distance ? 1 : 0 });
      }

      const routeCounts=new Map();
      for (const card of groups) if (card.__roadKeyV17318) routeCounts.set(card.__roadKeyV17318,(routeCounts.get(card.__roadKeyV17318)||0)+1);
      const measured=directionMeasuredSegmentMapV17318(p);
      for (const card of groups) {
        if (card.distance || !card.__roadKeyV17318 || routeCounts.get(card.__roadKeyV17318)!==1) continue;
        const segments=measured.get(card.__roadKeyV17318) || [];
        if (segments.length!==1) continue;
        card.distance=directionFormatMeasuredMilesV17318(segments[0]?.distance_miles);
      }
      return groups.map(card => {
        const clean={...card};
        delete clean.__roadKeyV17318;delete clean.__roadNameKeyV17318;delete clean.__roadGroupKeyV17318;delete clean.__distanceCountV17318;
        return clean;
      });
    }

    async function directionRoadDataHydrateV17318(id) {
      const pad=padById(id);
      if (!pad || pad.__directionRoadDataLoadedV17318) return pad;
      if (!pad._dbId || !navigator.onLine) return pad;
      if (directionRoadDataRequestsV17318.has(id)) return directionRoadDataRequestsV17318.get(id);
      const request=(async()=>{
        const headers={apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${SUPABASE_PUBLISHABLE_KEY}`,"Content-Type":"application/json",Accept:"application/json"};
        const rpc=async name=>{
          const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:"POST",headers,body:JSON.stringify({p_pad_id:pad._dbId}),cache:"no-store"});
          if (!response.ok) throw new Error(`${name} returned ${response.status}`);
          const rows=await response.json();return Array.isArray(rows)?rows:[];
        };
        const results=await Promise.allSettled([rpc("brinesearch_pad_measured_road_segments"),rpc("brinesearch_pad_official_road_aliases")]);
        if (results[0].status==="fulfilled") pad.measuredRoadSegmentsV17318=results[0].value;
        else console.warn("Measured road segments could not be loaded.",results[0].reason);
        if (results[1].status==="fulfilled") pad.officialRoadAliasesV17318=results[1].value;
        else console.warn("Official road aliases could not be loaded.",results[1].reason);
        pad.__directionRoadDataLoadedV17318=true;
        return pad;
      })().finally(()=>directionRoadDataRequestsV17318.delete(id));
      directionRoadDataRequestsV17318.set(id,request);return request;
    }

    const directionFinalCardsBeforeRoadDataV17318=directionFinalCardsFromEntriesV17317;
    directionFinalCardsFromEntriesV17317=function directionFinalCardsRoadDataV17318(entries,p) {
      return directionGroupRoadCardsV17318(directionFinalCardsBeforeRoadDataV17318(entries,p),p);
    };

    const directionRoadDataBaseRenderV17318=renderPad;
    renderPad=async function directionRoadDataRenderV17318(id) {
      try { await directionRoadDataHydrateV17318(id); } catch (error) { console.warn("Road mileage/name enrichment could not be loaded.",error); }
      return directionRoadDataBaseRenderV17318(id);
    };

    window.directionGroupRoadCardsV17318=directionGroupRoadCardsV17318;
    window.directionOfficialPairForLocalRoadV17318=directionOfficialPairForLocalRoadV17318;
    window.directionRoadDataHydrateV17318=directionRoadDataHydrateV17318;
