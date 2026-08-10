    /* BrineSearch V17.3.30 — generic final driver-direction integrity.
       Pad-specific source corrections now live in Supabase. This layer repairs
       only source-grounded turn + travel rows and keeps mileage on the road
       actually traveled. No road, side, mileage, or pad-specific route is guessed. */

    function directionIntegrityKnownClearV17330(clearText) {
      return String(clearText || "");
    }

    function directionIntegrityCleanV17330(value) {
      return directionTruthCleanV17320(value)
        .replace(/\s+Nearest\s+Hospital\b[\s\S]*$/i, "")
        .replace(/[.;,]+\s*$/g, "")
        .trim();
    }

    function directionIntegrityDistanceV17330(text) {
      let facts=[];
      try { facts=directionDistanceFactsFinalV17317(text); } catch {}
      return facts.length===1 ? facts[0] : null;
    }

    function directionIntegrityRoadV17330(value,p) {
      let road=directionIntegrityCleanV17330(value)
        .replace(/^(?:on|onto)\s+/i, "")
        .replace(/\s+(?:and|then)\s*$/i, "")
        .trim();
      if (!road) return "";
      try { road=directionTurnRoadTextV17320(road,p) || road; } catch {}
      return directionIntegrityCleanV17330(road);
    }

    function directionIntegrityArrivalNotesV17330(text,seed) {
      const notes=[...(seed||[])];
      let match=String(text||"").match(/\b(?:well\s+pad\s+)?access\s+road\s+(?:is|will\s+be)?\s*(?:on\s+)?(?:the\s+)?(left|right)\b/i);
      if (match) notes.push(`Access road on ${match[1].toLowerCase()}`);
      match=String(text||"").match(/\b(?:well\s+pad|pad)\s+(?:entrance\s+)?(?:is|will\s+be)?\s*(?:on\s+)?(?:the\s+)?(left|right)\b/i);
      if (match) notes.push(`Pad on ${match[1].toLowerCase()}`);
      return directionUniqueNotesV17317(notes).filter(note=>!/^Nearest\s+Hospital\b/i.test(String(note||"")));
    }

    function directionIntegrityTurnTravelV17330(entry,p) {
      const source=directionIntegrityCleanV17330(entry?.instruction||"");
      const side=source.match(/^Turn\s+(left|right)\b/i);
      if (!side) {
        if (source!==directionTruthCleanV17320(entry?.instruction||"")) return {...entry,instruction:source,notes:directionIntegrityArrivalNotesV17330(source,entry?.notes)};
        return entry;
      }
      const fact=directionIntegrityDistanceV17330(source);
      if (!fact) return entry;

      const before=source.slice(0,fact.start);
      const after=source.slice(fact.end);
      let road="";

      let match=before.match(/^Turn\s+(?:left|right)\s+(?:on|onto)\s+([\s\S]+?)(?=\s+(?:Travel|Drive|Continue|Proceed|Go)\b|$)/i);
      if (match) road=directionIntegrityRoadV17330(match[1],p);

      if (!road) {
        match=source.match(/\b(?:Travel|Drive|Continue|Proceed|Go)\s+(?:for\s+)?[^,.;]*?\b(?:miles?|mile|mi|feet|foot|ft|yards?|yard|yd)\s+on\s+(.+?)(?=\s+to\b|\s+(?:and|then)\b|[.;,]|$)/i);
        if (match) road=directionIntegrityRoadV17330(match[1],p);
      }
      if (!road) return entry;

      if (/^(?:cr|tr|sr|route|road|left|right|north|south|east|west|north\s+east|north\s+west|south\s+east|south\s+west)$/i.test(road)) return entry;
      if (/\b(?:Nearest\s+Hospital|Medical\s+Park|Hospital)\b/i.test(road)) return entry;

      return {
        ...entry,
        instruction:`Turn ${side[1].toLowerCase()} on ${road} for ${fact.raw}`,
        notes:directionIntegrityArrivalNotesV17330(after,entry?.notes),
        disableRoadIntel:false,
        sourceIntegrityV17330:true
      };
    }

    const directionTruthEntriesBeforeIntegrityV17330=directionTruthEntriesV17320;
    directionTruthEntriesV17320=function directionTruthEntriesIntegrityV17330(entries,p) {
      const repaired=(entries||[]).map(entry=>directionIntegrityTurnTravelV17330(entry,p));
      return directionTruthEntriesBeforeIntegrityV17330(repaired,p);
    };

    function directionIntegrityBadMainV17330(value) {
      const text=directionMainCleanV17317(value||"");
      if (/\bNearest\s+Hospital\b|\bMedical\s+Park\b/i.test(text)) return true;
      if (/\bon\s+(?:CR|TR|SR|Route|Road|County\s+Road|Township\s+Road|State\s+Route)\s*$/i.test(text)) return true;
      if (/\bon\s+(?:North\s+East|North\s+West|South\s+East|South\s+West|Left\s+Nearest|Right\s+Nearest)\s*$/i.test(text)) return true;
      return false;
    }

    const directionFinalCardsBeforeIntegrityV17330=directionFinalCardsFromEntriesV17317;
    directionFinalCardsFromEntriesV17317=function directionFinalCardsIntegrityV17330(entries,p) {
      const cards=directionFinalCardsBeforeIntegrityV17330(entries,p);
      return (cards||[]).map(card=>({
        ...card,
        notes:(card?.notes||[]).filter(note=>!/^Nearest\s+Hospital\b/i.test(String(note||"")))
      }));
    };

    window.directionIntegrityKnownClearV17321=directionIntegrityKnownClearV17330;
    window.directionIntegrityTurnTravelV17321=directionIntegrityTurnTravelV17330;
    window.directionIntegrityBadMainV17321=directionIntegrityBadMainV17330;
    window.directionIntegrityKnownClearV17330=directionIntegrityKnownClearV17330;
    window.directionIntegrityTurnTravelV17330=directionIntegrityTurnTravelV17330;
    window.directionIntegrityBadMainV17330=directionIntegrityBadMainV17330;
