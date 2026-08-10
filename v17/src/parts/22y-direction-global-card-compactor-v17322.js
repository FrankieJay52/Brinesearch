    /* BrineSearch V17.3.22 — global malformed-card compactor.
       This pass operates only on already source-grounded final cards. It removes
       roadless filler cards, carries their distance/notes onto the immediately
       preceding real road leg when that association is explicit from sequence,
       and promotes arrival-side notes into a driver-sized arrival card.
       It never invents a road, turn side, or mileage. */

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
      if (/^(?:cr|tr|sr|route|road|left|right|north|south|east|west|north\s+east|north\s+west|south\s+east|south\s+west)$/i.test(tail)) return false;
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

    function directionArrivalFromNotesV17322(notes) {
      for (const note of notes||[]) {
        const text=directionMainCleanV17317(note||"");
        let m=text.match(/^(Access\s+road|Lease\s+road(?:\s+entrance)?|Entrance|Pad)\s+on\s+(left|right)$/i);
        if (!m) continue;
        const kind=m[1].toLowerCase();
        const side=m[2].toLowerCase();
        if (/^access/.test(kind)) return `Access road on ${side}`;
        if (/^lease/.test(kind)) return `Lease road on ${side}`;
        if (/^entrance/.test(kind)) return `Entrance on ${side}`;
        return `Pad on ${side}`;
      }
      return "";
    }

    function directionNotesWithoutArrivalV17322(notes) {
      return (notes||[]).filter(note=>!directionArrivalFromNotesV17322([note]));
    }

    function directionCompactFinalCardsV17322(cards) {
      const out=[];
      let pending=[];
      for (const raw of cards||[]) {
        const card={...raw,notes:[...(raw?.notes||[])]};
        const main=directionMainCleanV17317(card.instruction||"");
        const generic=directionCardGenericRoadlessV17322(main);
        const arrival=directionArrivalFromNotesV17322(card.notes);
        const prev=out[out.length-1];

        if (generic && card.distance && prev && directionCardHasUsableRoadV17322(prev.instruction) && !prev.distance) {
          prev.distance=card.distance;
          prev.notes=directionUniqueNotesV17317([...(prev.notes||[]),...pending,...directionNotesWithoutArrivalV17322(card.notes)]);
          pending=[];
          if (arrival) out.push({...card,instruction:arrival,distance:"",notes:directionNotesWithoutArrivalV17322(card.notes)});
          continue;
        }

        if (generic && !card.distance) {
          if (arrival) {
            out.push({...card,instruction:arrival,distance:"",notes:directionUniqueNotesV17317([...pending,...directionNotesWithoutArrivalV17322(card.notes)])});
            pending=[];
          } else {
            pending=directionUniqueNotesV17317([...pending,...card.notes]);
          }
          continue;
        }

        card.notes=directionUniqueNotesV17317([...pending,...card.notes]);
        pending=[];
        out.push(card);
      }
      if (pending.length && out.length) out[out.length-1].notes=directionUniqueNotesV17317([...(out[out.length-1].notes||[]),...pending]);
      return out;
    }

    const directionFinalCardsBeforeGlobalCompactorV17322=directionFinalCardsFromEntriesV17317;
    directionFinalCardsFromEntriesV17317=function directionFinalCardsGlobalCompactorV17322(entries,p) {
      return directionCompactFinalCardsV17322(directionFinalCardsBeforeGlobalCompactorV17322(entries,p));
    };

    window.directionCompactFinalCardsV17322=directionCompactFinalCardsV17322;
    window.directionCardHasUsableRoadV17322=directionCardHasUsableRoadV17322;
    window.directionCardGenericRoadlessV17322=directionCardGenericRoadlessV17322;
