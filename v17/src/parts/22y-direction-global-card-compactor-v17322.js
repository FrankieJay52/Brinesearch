    /* BrineSearch V17.3.22 — global malformed-card compactor.
       Runs after all source/road truth layers. It removes parser filler, restores
       continuation mileage to the active named road when sequence proves it,
       promotes arrivals, strips hospital-directory leakage, and marks genuine
       saved-source road-name gaps instead of fabricating a road. */

    const DIRECTION_SOURCE_ROAD_GAP_NOTE_V17322="Road name not present in saved directions";

    function directionCardRoadTailV17322(value) {
      const text=directionMainCleanV17317(value||"");
      let match=text.match(/\bon\s+(.+)$/i);
      if (match) return directionMainCleanV17317(match[1]);
      match=text.match(/^Take\s+(?!Exit\b)(.+)$/i);
      if (match) return directionMainCleanV17317(match[1]);
      return "";
    }

    function directionCardHasUsableRoadV17322(value) {
      const tail=directionCardRoadTailV17322(value);
      if (!tail) return false;
      if (/^(?:cr|tr|sr|route|road|county\s+road|township\s+road|state\s+route|left|right|north|south|east|west|north\s+east|north\s+west|south\s+east|south\s+west)$/i.test(tail)) return false;
      if (/^(?:left|right)\s+nearest$/i.test(tail)) return false;
      if (/\bNearest\s+Hospital\b|\bMedical\s+Park\b/i.test(tail)) return false;
      return true;
    }

    function directionCardGenericRoadlessV17322(value) {
      const text=directionMainCleanV17317(value||"");
      if (/^(?:Continue|Continue\s+on)$/i.test(text)) return true;
      if (/^(?:Head|Continue)\s+(?:northwest|northeast|southwest|southeast|north|south|east|west)$/i.test(text)) return true;
      if (/^(?:Turn\s+(?:left|right)|Turn|Merge|Take\s+route)$/i.test(text)) return true;
      return false;
    }

    function directionCardGenericTurnV17322(value) {
      return /^(?:Turn\s+(?:left|right)|Turn)$/i.test(directionMainCleanV17317(value||""));
    }

    function directionCardGenericContinuationV17322(value) {
      return /^(?:Continue|Continue\s+on|Head\s+(?:northwest|northeast|southwest|southeast|north|south|east|west)|Continue\s+(?:northwest|northeast|southwest|southeast|north|south|east|west))$/i.test(directionMainCleanV17317(value||""));
    }

    function directionCardMalformedRoadActionV17322(value) {
      const text=directionMainCleanV17317(value||"");
      const bad="(?:CR|TR|SR|Route|Road|County\\s+Road|Township\\s+Road|State\\s+Route|North\\s+East|North\\s+West|South\\s+East|South\\s+West|Left\\s+Nearest|Right\\s+Nearest)";
      let match=text.match(new RegExp(`^(Turn\\s+(?:left|right)|Turn|Continue|Head\\s+(?:northwest|northeast|southwest|southeast|north|south|east|west)|Merge)\\s+on\\s+${bad}$`,'i'));
      if (!match) return "";
      return directionMainCleanV17317(match[1]);
    }

    function directionCleanDriverNoteV17322(value) {
      let text=directionMainCleanV17317(value||"");
      if (!text) return "";
      text=text.replace(/\s*\bNearest\s+Hospital\b[\s\S]*$/i,"").trim();
      return text;
    }

    function directionCleanDriverNotesV17322(notes) {
      return directionUniqueNotesV17317((notes||[]).map(directionCleanDriverNoteV17322).filter(Boolean));
    }

    function directionArrivalFromNotesV17322(notes) {
      for (const note of notes||[]) {
        const text=directionMainCleanV17317(note||"");
        let m=text.match(/^(Access\s+road|Lease\s+road(?:\s+entrance)?|Entrance|Pad)\s+on\s+(left|right)$/i);
        if (!m) continue;
        const kind=m[1].toLowerCase(),side=m[2].toLowerCase();
        if (/^access/.test(kind)) return `Access road on ${side}`;
        if (/^lease/.test(kind)) return `Lease road entrance on ${side}`;
        if (/^entrance/.test(kind)) return `Entrance on ${side}`;
        return `Pad on ${side}`;
      }
      return "";
    }

    function directionNotesWithoutArrivalV17322(notes) {
      return (notes||[]).filter(note=>!directionArrivalFromNotesV17322([note]));
    }

    function directionCardIsArrivalV17322(value) {
      return /^(?:Access\s+road|Lease\s+road(?:\s+entrance)?|Entrance|Pad)\s+on\s+(?:left|right)$/i.test(directionMainCleanV17317(value||""));
    }

    function directionNextUsableRoadV17322(cards,index) {
      for(let i=index+1;i<Math.min((cards||[]).length,index+4);i+=1) {
        const next=cards[i];
        const road=directionCardRoadTailV17322(next?.instruction);
        if (road&&directionCardHasUsableRoadV17322(next?.instruction)) return road;
        if (!directionCardGenericRoadlessV17322(next?.instruction)&&!/^Arrive$/i.test(String(next?.instruction||""))) break;
      }
      return "";
    }

    function directionSourceGapNotesV17322(notes) {
      return directionUniqueNotesV17317([...directionCleanDriverNotesV17322(notes),DIRECTION_SOURCE_ROAD_GAP_NOTE_V17322]);
    }

    function directionCompactFinalCardsV17322(cards) {
      const source=(cards||[]).map(card=>({...card,notes:directionCleanDriverNotesV17322(card?.notes||[])}));
      const out=[];
      let pending=[];
      for (let index=0;index<source.length;index+=1) {
        const raw=source[index];
        const card={...raw,notes:[...(raw?.notes||[])]};
        let main=directionMainCleanV17317(card.instruction||"");
        const malformedAction=directionCardMalformedRoadActionV17322(main);
        if (malformedAction) {
          main=malformedAction;
          card.instruction=main;
          card.notes=directionSourceGapNotesV17322(card.notes);
        }
        const generic=directionCardGenericRoadlessV17322(main);
        const arrival=directionArrivalFromNotesV17322(card.notes);
        const prev=out[out.length-1];
        const prevRoad=prev&&directionCardHasUsableRoadV17322(prev.instruction)?directionCardRoadTailV17322(prev.instruction):"";

        if (/^Arrive$/i.test(main)&&prev&&directionCardIsArrivalV17322(prev.instruction)) {
          prev.notes=directionUniqueNotesV17317([...(prev.notes||[]),...pending,...card.notes]);
          pending=[];
          continue;
        }

        if (generic&&card.distance&&directionCardGenericContinuationV17322(main)&&prevRoad) {
          if (!prev.distance) {
            prev.distance=card.distance;
            prev.notes=directionUniqueNotesV17317([...(prev.notes||[]),...pending,...directionNotesWithoutArrivalV17322(card.notes)]);
            pending=[];
            if (arrival) out.push({...card,instruction:arrival,distance:"",notes:directionNotesWithoutArrivalV17322(card.notes)});
            continue;
          }
          const bearing=main.match(/^(?:Head|Continue)\s+(northwest|northeast|southwest|southeast|north|south|east|west)$/i);
          card.instruction=bearing?`Head ${bearing[1].toLowerCase()} on ${prevRoad}`:`Continue on ${prevRoad}`;
          card.notes=directionUniqueNotesV17317([...pending,...directionNotesWithoutArrivalV17322(card.notes)]);
          pending=[];
          out.push(card);
          if (arrival) out.push({...card,instruction:arrival,distance:"",notes:[]});
          continue;
        }

        if (generic&&card.distance&&directionCardGenericContinuationV17322(main)) {
          const nextRoad=directionNextUsableRoadV17322(source,index);
          const bearing=main.match(/^(?:Head|Continue)\s+(northwest|northeast|southwest|southeast|north|south|east|west)$/i);
          if (nextRoad) card.instruction=bearing?`Head ${bearing[1].toLowerCase()} toward ${nextRoad}`:`Continue toward ${nextRoad}`;
          else {
            card.instruction=bearing?`Head ${bearing[1].toLowerCase()}`:"Proceed";
            card.notes=directionSourceGapNotesV17322(card.notes);
          }
          card.notes=directionUniqueNotesV17317([...pending,...directionNotesWithoutArrivalV17322(card.notes)]);
          pending=[];
          out.push(card);
          if (arrival) out.push({...card,instruction:arrival,distance:"",notes:[]});
          continue;
        }

        if (generic&&card.distance&&directionCardGenericTurnV17322(main)) {
          card.instruction=main;
          card.notes=directionUniqueNotesV17317([...pending,...directionSourceGapNotesV17322(card.notes)]);
          pending=[];
          out.push(card);
          if (arrival) out.push({...card,instruction:arrival,distance:"",notes:[]});
          continue;
        }

        if (generic&&!card.distance) {
          if (arrival) {
            out.push({...card,instruction:arrival,distance:"",notes:directionUniqueNotesV17317([...pending,...directionNotesWithoutArrivalV17322(card.notes)])});
            pending=[];
          } else if (directionCardGenericTurnV17322(main)) {
            card.notes=directionUniqueNotesV17317([...pending,...directionSourceGapNotesV17322(card.notes)]);
            pending=[];
            out.push(card);
          } else {
            pending=directionUniqueNotesV17317([...pending,...card.notes]);
          }
          continue;
        }

        card.notes=directionUniqueNotesV17317([...pending,...card.notes]);
        pending=[];
        out.push(card);
      }
      if (pending.length&&out.length) out[out.length-1].notes=directionUniqueNotesV17317([...(out[out.length-1].notes||[]),...pending]);
      return out;
    }

    const directionFinalCardsBeforeGlobalCompactorV17322=directionFinalCardsFromEntriesV17317;
    directionFinalCardsFromEntriesV17317=function directionFinalCardsGlobalCompactorV17322(entries,p) {
      return directionCompactFinalCardsV17322(directionFinalCardsBeforeGlobalCompactorV17322(entries,p));
    };

    if (typeof directionApplyLiveClearRowV17316==="function"&&typeof directionRepairLeadingDecimalMileageV17322==="function") {
      const directionApplyLiveClearRowBeforeDecimalTruthV17322=directionApplyLiveClearRowV17316;
      directionApplyLiveClearRowV17316=function directionApplyLiveClearRowDecimalTruthV17322(pad,row) {
        const source=String(pad?.originalWrittenDirections||pad?.writtenDirections||"");
        const clear=directionRepairLeadingDecimalMileageV17322(source,row?.directions_clear||"");
        return directionApplyLiveClearRowBeforeDecimalTruthV17322(pad,{...row,directions_clear:clear});
      };
    }

    window.directionCompactFinalCardsV17322=directionCompactFinalCardsV17322;
    window.directionCardHasUsableRoadV17322=directionCardHasUsableRoadV17322;
    window.directionCardGenericRoadlessV17322=directionCardGenericRoadlessV17322;
    window.directionSourceRoadGapNoteV17322=DIRECTION_SOURCE_ROAD_GAP_NOTE_V17322;
