    /* BrineSearch V17.3.30 — generic post-exit road truth.
       Source-verified pad corrections now live in Supabase. This renderer only
       blocks the generic parser failure where an exit is followed by a false turn
       back onto the same highway; it never substitutes a pad-specific route. */

    function directionRouteTokenV17330(value) {
      const text=String(value||"");
      const m=text.match(/\b((?:I|US|OH|WV|PA|SR)\s*[- ]?\s*\d{1,4}[A-Z]?)\b/i);
      if(!m) return "";
      return m[1].toUpperCase().replace(/\s+/g,"").replace(/^(I|US|OH|WV|PA|SR)-?/,"$1-");
    }

    function directionStartRouteV17330(cards,index) {
      for(let i=index;i>=Math.max(0,index-3);i-=1) {
        const card=cards[i]||{};
        for(const note of card.notes||[]) {
          const m=String(note||"").match(/^Start:\s*(.+)$/i);
          if(m) {
            const route=directionRouteTokenV17330(m[1]);
            if(route) return route;
          }
        }
        const route=directionRouteTokenV17330(card.instruction);
        if(route&&!/^Take\s+Exit\b/i.test(String(card.instruction||""))) return route;
      }
      return "";
    }

    function directionIsPostExitSameHighwayV17330(cards,index) {
      if(index<=0) return false;
      const current=cards[index]||{},previous=cards[index-1]||{};
      if(!/^Take\s+Exit\b/i.test(String(previous.instruction||""))) return false;
      const m=String(current.instruction||"").match(/^Turn\s+(left|right)\s+on\s+((?:I|US|OH|WV|PA|SR)\s*[- ]?\s*\d{1,4}[A-Z]?)$/i);
      if(!m) return false;
      const currentRoute=directionRouteTokenV17330(m[2]);
      const startRoute=directionStartRouteV17330(cards,index-1);
      return Boolean(currentRoute&&startRoute&&currentRoute===startRoute);
    }

    function directionApplyExitRoadTruthV17330(cards) {
      const out=(cards||[]).map(card=>({...card,notes:[...(card?.notes||[])]}));
      for(let i=0;i<out.length;i+=1) {
        if(!directionIsPostExitSameHighwayV17330(out,i)) continue;
        const m=String(out[i].instruction||"").match(/^Turn\s+(left|right)\b/i);
        out[i].instruction=`Turn ${String(m?.[1]||"").toLowerCase()}`.trim();
        out[i].notes=directionUniqueNotesV17317([...(out[i].notes||[]),DIRECTION_SOURCE_ROAD_GAP_NOTE_V17322]);
      }
      return out;
    }

    const directionFinalCardsBeforeExitTruthV17330=directionFinalCardsFromEntriesV17317;
    directionFinalCardsFromEntriesV17317=function directionFinalCardsExitTruthV17330(entries,p) {
      return directionApplyExitRoadTruthV17330(directionFinalCardsBeforeExitTruthV17330(entries,p),p);
    };

    window.directionApplyExitRoadTruthV17323=directionApplyExitRoadTruthV17330;
    window.directionIsPostExitSameHighwayV17323=directionIsPostExitSameHighwayV17330;
    window.directionApplyExitRoadTruthV17330=directionApplyExitRoadTruthV17330;
    window.directionIsPostExitSameHighwayV17330=directionIsPostExitSameHighwayV17330;
