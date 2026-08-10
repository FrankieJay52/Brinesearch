    /* BrineSearch V17.3.30 — final generic driver-safety contract.
       Strip transient landmark/contact identifiers after every other direction
       layer has run. Keep route-critical warnings, restrictions, gates, CB info,
       unsigned-road notes, road names, turns and mileage. */

    function directionTransientLandmarkV17330(value) {
      const text=String(value||"");
      if (!text) return false;
      const roadSafe=text.replace(/\b(?:church|cemetery|school|hospital)\s+(?:rd|road|ln|lane|dr|drive|st|street|ave|avenue|hwy|highway|run|ridge|fork|hollow|creek)\b/gi,"");
      return /\b(?:nearest\s+hospital|medical\s+park|medical\s+center|hospital|mcdonald'?s?|dealership|ymca|vfd|post\s+office|dairy\s+queen|restaurant|landmark|cemetery|church|school|high\s+school|prison|storage\s+units?|ballfield|police\s+department|fire\s+department|mailbox|house|barn|bar|scrap\s+yard|rest\s+area|water\s+tower|power\s+station)\b/i.test(roadSafe);
    }

    function directionDriverSafetyPhraseV17330(value) {
      return /\b(?:truck\s+restriction|restriction|warning|caution|do\s+not|no\s+rig\s+traffic|curfew|narrow|one[- ]lane|bridge|gate\s+code|cb\b|call[- ]?out|speed\s+limit|weight\s+limit|road\s+closed|closure|unsigned)\b/i.test(String(value||""));
    }

    function directionDriverSafeTextV17330(value) {
      let text=String(value||"").replace(/\s{2,}/g," ").trim();
      if(!text) return "";

      text=text.replace(/\s+Nearest\s+Hospital\b[\s\S]*$/i,"");
      text=text.replace(/\s*\([^)]*(?:McDonald'?s?|dealership|YMCA|VFD|post\s+office|Dairy\s+Queen|restaurant|church\s+(?:is|parking)|cemetery\s+(?:is|at|on)|school\s+(?:is|on)|hospital|medical\s+center)[^)]*\)/gi,"");
      text=text.replace(/\s+(?:There\s+(?:is|are)|A|An|The)\s+[^.;]{0,160}\b(?:McDonald'?s?|dealership|YMCA|VFD|post\s+office|Dairy\s+Queen|restaurant|church|cemetery|school|hospital|medical\s+center)\b[^.;]*(?=[.;]|$)/gi,"");
      text=text.replace(/\s{2,}/g," ").replace(/\s+([,.;])/g,"$1").trim();
      return text;
    }

    function directionDriverSafeNoteV17330(value) {
      const note=directionDriverSafeTextV17330(value);
      if(!note) return "";
      if(directionDriverSafetyPhraseV17330(note)) return note;
      if(directionTransientLandmarkV17330(note)) return "";
      return note;
    }

    const directionFinalCardsBeforeSafetyContractV17330=directionFinalCardsFromEntriesV17317;
    directionFinalCardsFromEntriesV17317=function directionFinalCardsSafetyContractV17330(entries,p) {
      const cards=directionFinalCardsBeforeSafetyContractV17330(entries,p)||[];
      return cards.map(card=>{
        const instruction=directionDriverSafeTextV17330(card?.instruction||"");
        const notes=directionUniqueNotesV17317((card?.notes||[]).map(directionDriverSafeNoteV17330).filter(Boolean));
        return {...card,instruction,notes};
      }).filter(card=>String(card?.instruction||"").trim());
    };

    const directionCopyTextBeforeSafetyContractV17330=directionCopyText;
    directionCopyText=function directionCopyTextSafetyContractV17330(value,p) {
      const text=String(directionCopyTextBeforeSafetyContractV17330(value,p)||"");
      return text.split(/\n/).map(line=>directionDriverSafeTextV17330(line)).filter(Boolean).join("\n").trim();
    };

    window.directionDriverSafeTextV17330=directionDriverSafeTextV17330;
    window.directionTransientLandmarkV17330=directionTransientLandmarkV17330;
