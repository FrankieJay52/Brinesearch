    /* BrineSearch V17.3.30 — final generic driver-safety contract.
       Strip transient landmark/contact identifiers after every other direction
       layer has run. Keep route-critical warnings, restrictions, gates, CB info,
       unsigned-road notes, actual road names, turns and mileage. */

    function directionTransientLandmarkV17330(value) {
      const text=String(value||"");
      if (!text) return false;
      // Do not mistake a landmark word that is genuinely part of a road name for
      // a transient landmark. Examples: Stone Church Road, YMCA Camp Road,
      // Water Tower Road.
      const roadSafe=text.replace(/\b(?:(?:stone\s+)?church|cemetery|school|hospital|ymca\s+camp|water\s+tower|barn|rest\s+area|fire\s+department|post\s+office|power\s+station)\s+(?:rd|road|ln|lane|dr|drive|st|street|ave|avenue|hwy|highway|run|ridge|fork|hollow|creek)\b/gi,"");
      return /\b(?:nearest\s+hospital|medical\s+park|medical\s+center|hospital|mcdonald'?s?|dealership|ymca|vfd|post\s+office|dairy\s+queen|restaurant|landmark|cemetery|church|school|high\s+school|prison|storage\s+units?|ballfield|police\s+department|fire\s+department|mailbox|house|barn|bar|scrap\s+yard|rest\s+area|water\s+tower|power\s+station)\b/i.test(roadSafe);
    }

    function directionDriverSafetyPhraseV17330(value) {
      return /\b(?:truck\s+restriction|restriction|warning|caution|do\s+not|no\s+rig\s+traffic|curfew|narrow|one[- ]lane|bridge|gate\s+code|cb\b|call[- ]?out|speed\s+limit|weight\s+limit|road\s+closed|closure|unsigned)\b/i.test(String(value||""));
    }

    function directionStripLandmarkContextV17330(value) {
      let text=String(value||"").trim();
      if(!text) return "";
      const landmark="(?:nearest\\s+hospital|medical\\s+park|medical\\s+center|hospital|mcdonald'?s?|dealership|ymca|vfd|post\\s+office|dairy\\s+queen|restaurant|landmark|cemetery|church|school|high\\s+school|prison|storage\\s+units?|ballfield|police\\s+department|fire\\s+department|mailbox|house|barn|bar|scrap\\s+yard|rest\\s+area|water\\s+tower|power\\s+station)";
      // Remove whole leading/trailing landmark context clauses. This keeps an
      // actual maneuver that follows/preceded the landmark instead of retaining
      // the business/building as a navigation fact.
      text=text.replace(new RegExp(`^(?:just\\s+)?(?:past|before|after|near|by|at|across\\s+from)\\s+(?:the\\s+)?[^,.;]*?\\b${landmark}\\b[^,.;]*[,.;]?\\s*`,"i"),"");
      text=text.replace(new RegExp(`\\s+(?:just\\s+)?(?:past|before|after|near|by|at|across\\s+from)\\s+(?:the\\s+)?[^,.;]*?\\b${landmark}\\b[^,.;]*(?=[,.;]|$)`,"ig"),"");
      return text.replace(/[ \t]{2,}/g," ").replace(/[ \t]+([,.;])/g,"$1").replace(/^[,.;]\s*/,"").trim();
    }

    function directionDriverSafeTextV17330(value) {
      let text=String(value||"").replace(/[ \t]{2,}/g," ").trim();
      if(!text) return "";

      text=text.replace(/\s+Nearest\s+Hospital\b[\s\S]*$/i,"");
      text=text.replace(/\s*\([^)]*(?:McDonald'?s?|dealership|YMCA|VFD|post\s+office|Dairy\s+Queen|restaurant|church\s+(?:is|parking)|cemetery\s+(?:is|at|on)|school\s+(?:is|on)|hospital|medical\s+center)[^)]*\)/gi,"");
      text=text.replace(/\s+(?:There\s+(?:is|are)|A|An|The)\s+[^.;]{0,160}\b(?:McDonald'?s?|dealership|YMCA|VFD|post\s+office|Dairy\s+Queen|restaurant|church|cemetery|school|hospital|medical\s+center)\b[^.;]*(?=[.;]|$)/gi,"");
      text=text.replace(/\bhttps?:\/\/\S+/gi,"");
      text=text.replace(/\bhttps?:\/\/maps\s+app\s+goo\s+gl\/\S+/gi,"");
      text=directionStripLandmarkContextV17330(text);
      return text.replace(/[ \t]{2,}/g," ").replace(/[ \t]+([,.;])/g,"$1").trim();
    }

    function directionRoadLikeV17330(value) {
      return /\b(?:(?:I|US|OH|WV|PA|SR|CR|TR|TWP)\s*[- ]?\s*\d|Route\s+\d|County\s+Road\s*[- ]?\s*\d|Township\s+Road\s*[- ]?\s*\d|State\s+Route\s*[- ]?\s*\d|Access\s+Road|Lease\s+Road|(?:[A-Z][\w'.-]*\s+){0,4}(?:Rd|Road|Ln|Lane|Dr|Drive|St|Street|Ave|Avenue|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek))\b/i.test(String(value||""));
    }

    function directionManeuverWithoutLandmarkV17330(value) {
      const text=directionDriverSafeTextV17330(value);
      if(!text || !directionTransientLandmarkV17330(text)) return text;

      // Prefer a source-explicit road maneuver if one exists anywhere in the
      // contaminated sentence. Never manufacture a road name.
      const turnMatches=[...text.matchAll(/\b(?:turn|bear|veer|slight)\s+(left|right)\b[\s\S]*?\b(?:on|onto)\s+([^,.;]+)/ig)];
      if(turnMatches.length) {
        const match=turnMatches[turnMatches.length-1];
        let road=String(match[2]||"").replace(/\s+(?:at|near|past|before|after|by|across\s+from)\b[\s\S]*$/i,"").trim();
        if(directionRoadLikeV17330(road) && !directionTransientLandmarkV17330(road)) {
          return `${/^slight/i.test(match[0])?"Slight":"Turn"} ${String(match[1]).toLowerCase()} on ${road}`;
        }
      }

      const roadActionMatches=[...text.matchAll(/\b(head|follow|continue|travel|proceed)\s+(?:(?:north|south|east|west|northbound|southbound|eastbound|westbound)\s+)?(?:on|onto)\s+([^,.;]+)/ig)];
      if(roadActionMatches.length) {
        const match=roadActionMatches[roadActionMatches.length-1];
        let road=String(match[2]||"").replace(/\s+(?:at|near|past|before|after|by|across\s+from)\b[\s\S]*$/i,"").trim();
        if(directionRoadLikeV17330(road) && !directionTransientLandmarkV17330(road)) {
          return `${String(match[1]).replace(/^./,c=>c.toUpperCase())} on ${road}`;
        }
      }

      // A turn side is still a source fact even if the source only located it by
      // a transient landmark. Keep the maneuver, drop the landmark.
      const side=text.match(/\bturn\s+(left|right)\b/i);
      if(side) return `Turn ${side[1].toLowerCase()}`;

      // Landmark-only travel/pass cards are not driver route steps.
      return "";
    }

    function directionDriverSafeNoteV17330(value) {
      const note=directionDriverSafeTextV17330(value);
      if(!note) return "";
      if(directionTransientLandmarkV17330(note)) {
        const without=directionStripLandmarkContextV17330(note);
        if(without && !directionTransientLandmarkV17330(without) && directionDriverSafetyPhraseV17330(without)) return without;
        return "";
      }
      return note;
    }

    const directionFinalCardsBeforeSafetyContractV17330=directionFinalCardsFromEntriesV17317;
    directionFinalCardsFromEntriesV17317=function directionFinalCardsSafetyContractV17330(entries,p) {
      const cards=directionFinalCardsBeforeSafetyContractV17330(entries,p)||[];
      return cards.map(card=>{
        const instruction=directionManeuverWithoutLandmarkV17330(card?.instruction||"");
        const notes=directionUniqueNotesV17317((card?.notes||[]).map(directionDriverSafeNoteV17330).filter(Boolean));
        return {...card,instruction,notes};
      }).filter(card=>String(card?.instruction||"").trim());
    };

    const directionCopyTextBeforeSafetyContractV17330=directionCopyText;
    directionCopyText=function directionCopyTextSafetyContractV17330(value,p) {
      const text=String(directionCopyTextBeforeSafetyContractV17330(value,p)||"");
      return text.split(/\n/).map(directionManeuverWithoutLandmarkV17330).filter(Boolean).join("\n").trim();
    };

    window.directionDriverSafeTextV17330=directionDriverSafeTextV17330;
    window.directionManeuverWithoutLandmarkV17330=directionManeuverWithoutLandmarkV17330;
    window.directionTransientLandmarkV17330=directionTransientLandmarkV17330;
