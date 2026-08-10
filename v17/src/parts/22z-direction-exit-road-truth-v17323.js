    /* BrineSearch V17.3.23 — post-exit road truth.
       Fixes the class of parser failures where an exit maneuver is followed by a
       false turn back "on" the same highway. Albert/Kirkwood gets an exact
       source-grounded repair; other pads are prevented from displaying a false
       highway name and are marked as source-limited instead of guessed. */

    function directionRouteTokenV17323(value) {
      const text=String(value||"");
      const m=text.match(/\b((?:I|US|OH|WV|PA|SR)\s*[- ]?\s*\d{1,4}[A-Z]?)\b/i);
      if(!m) return "";
      return m[1].toUpperCase().replace(/\s+/g,"").replace(/^(I|US|OH|WV|PA|SR)-?/,"$1-");
    }

    function directionStartRouteV17323(cards,index) {
      for(let i=index;i>=Math.max(0,index-3);i-=1) {
        const card=cards[i]||{};
        for(const note of card.notes||[]) {
          const m=String(note||"").match(/^Start:\s*(.+)$/i);
          if(m) {
            const route=directionRouteTokenV17323(m[1]);
            if(route) return route;
          }
        }
        const route=directionRouteTokenV17323(card.instruction);
        if(route&&!/^Take\s+Exit\b/i.test(String(card.instruction||""))) return route;
      }
      return "";
    }

    function directionIsPostExitSameHighwayV17323(cards,index) {
      if(index<=0) return false;
      const current=cards[index]||{},previous=cards[index-1]||{};
      if(!/^Take\s+Exit\b/i.test(String(previous.instruction||""))) return false;
      const m=String(current.instruction||"").match(/^Turn\s+(left|right)\s+on\s+((?:I|US|OH|WV|PA|SR)\s*[- ]?\s*\d{1,4}[A-Z]?)$/i);
      if(!m) return false;
      const currentRoute=directionRouteTokenV17323(m[2]);
      const startRoute=directionStartRouteV17323(cards,index-1);
      return Boolean(currentRoute&&startRoute&&currentRoute===startRoute);
    }

    function directionIsAlbertKirkwoodV17323(p) {
      const id=String(p?._id||p?.legacy_id||"").toLowerCase();
      const name=String(p?.padName||p?.name||"");
      return id==="ascent--albert" || /\bALBERT\b.*(?:KKW|KIRKWOOD)/i.test(name);
    }

    function directionAlbertCardsV17323() {
      return [
        {instruction:"Take Exit 198",distance:"",notes:["Start: I-70 west"],sourceStepOrder:1},
        {instruction:"Turn left",distance:"",notes:["Go under I-70 to the stop sign"],sourceStepOrder:2},
        {instruction:"Turn left on OH-114",distance:"1.2 mi",notes:[],sourceStepOrder:3},
        {instruction:"Lease road entrance on left",distance:"",notes:[],sourceStepOrder:4}
      ];
    }

    function directionApplyExitRoadTruthV17323(cards,p) {
      if(directionIsAlbertKirkwoodV17323(p)) return directionAlbertCardsV17323();
      const out=(cards||[]).map(card=>({...card,notes:[...(card?.notes||[])]}));
      for(let i=0;i<out.length;i+=1) {
        if(!directionIsPostExitSameHighwayV17323(out,i)) continue;
        const m=String(out[i].instruction||"").match(/^Turn\s+(left|right)\b/i);
        out[i].instruction=`Turn ${String(m?.[1]||"").toLowerCase()}`.trim();
        out[i].notes=directionUniqueNotesV17317([...(out[i].notes||[]),DIRECTION_SOURCE_ROAD_GAP_NOTE_V17322]);
      }
      return out;
    }

    const directionFinalCardsBeforeExitTruthV17323=directionFinalCardsFromEntriesV17317;
    directionFinalCardsFromEntriesV17317=function directionFinalCardsExitTruthV17323(entries,p) {
      return directionApplyExitRoadTruthV17323(directionFinalCardsBeforeExitTruthV17323(entries,p),p);
    };

    window.directionApplyExitRoadTruthV17323=directionApplyExitRoadTruthV17323;
    window.directionIsPostExitSameHighwayV17323=directionIsPostExitSameHighwayV17323;
