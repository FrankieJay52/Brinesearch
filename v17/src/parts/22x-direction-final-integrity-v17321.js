    /* BrineSearch V17.3.21 — final driver-direction integrity.
       Repair only source-grounded turn + travel rows before the V17.3.20 truth
       splitter runs. This prevents landmark/hospital text or a later target road
       from becoming the displayed road and keeps mileage on the road actually
       traveled. No road, side, or mileage is guessed. */

    function directionIntegrityCleanV17321(value) {
      return directionTruthCleanV17320(value)
        .replace(/\s+Nearest\s+Hospital\b[\s\S]*$/i, "")
        .replace(/[.;,]+\s*$/g, "")
        .trim();
    }

    function directionIntegrityDistanceV17321(text) {
      let facts=[];
      try { facts=directionDistanceFactsFinalV17317(text); } catch {}
      return facts.length===1 ? facts[0] : null;
    }

    function directionIntegrityRoadV17321(value,p) {
      let road=directionIntegrityCleanV17321(value)
        .replace(/^(?:on|onto)\s+/i, "")
        .replace(/\s+(?:and|then)\s*$/i, "")
        .trim();
      if (!road) return "";
      try { road=directionTurnRoadTextV17320(road,p) || road; } catch {}
      return directionIntegrityCleanV17321(road);
    }

    function directionIntegrityArrivalNotesV17321(text,seed) {
      const notes=[...(seed||[])];
      let match=String(text||"").match(/\b(?:well\s+pad\s+)?access\s+road\s+(?:is|will\s+be)?\s*(?:on\s+)?(?:the\s+)?(left|right)\b/i);
      if (match) notes.push(`Access road on ${match[1].toLowerCase()}`);
      match=String(text||"").match(/\b(?:well\s+pad|pad)\s+(?:entrance\s+)?(?:is|will\s+be)?\s*(?:on\s+)?(?:the\s+)?(left|right)\b/i);
      if (match) notes.push(`Pad on ${match[1].toLowerCase()}`);
      return directionUniqueNotesV17317(notes).filter(note=>!/^Nearest\s+Hospital\b/i.test(String(note||"")));
    }

    function directionIntegrityTurnTravelV17321(entry,p) {
      const source=directionIntegrityCleanV17321(entry?.instruction||"");
      const side=source.match(/^Turn\s+(left|right)\b/i);
      if (!side) {
        if (source!==directionTruthCleanV17320(entry?.instruction||"")) return {...entry,instruction:source,notes:directionIntegrityArrivalNotesV17321(source,entry?.notes)};
        return entry;
      }
      const fact=directionIntegrityDistanceV17321(source);
      if (!fact) return entry;

      const before=source.slice(0,fact.start);
      const after=source.slice(fact.end);
      let road="";

      // Preferred evidence: the road named directly after this turn.
      let match=before.match(/^Turn\s+(?:left|right)\s+(?:on|onto)\s+([\s\S]+?)(?=\s+(?:Travel|Drive|Continue|Proceed|Go)\b|$)/i);
      if (match) road=directionIntegrityRoadV17321(match[1],p);

      // Legacy import form: "Turn left (context) Travel 3.05 miles on CR-25 to CR-15".
      // The explicit "travel ... on ROAD" proves the road reached by the turn.
      if (!road) {
        match=source.match(/\b(?:Travel|Drive|Continue|Proceed|Go)\s+(?:for\s+)?[^,.;]*?\b(?:miles?|mile|mi|feet|foot|ft|yards?|yard|yd)\s+on\s+(.+?)(?=\s+to\b|\s+(?:and|then)\b|[.;,]|$)/i);
        if (match) road=directionIntegrityRoadV17321(match[1],p);
      }
      if (!road) return entry;

      // Do not accept parser-like fragments as roads.
      if (/^(?:cr|tr|sr|route|road|left|right|north|south|east|west|north\s+east|north\s+west|south\s+east|south\s+west)$/i.test(road)) return entry;
      if (/\b(?:Nearest\s+Hospital|Medical\s+Park|Hospital)\b/i.test(road)) return entry;

      const instruction=`Turn ${side[1].toLowerCase()} on ${road} for ${fact.raw}`;
      return {
        ...entry,
        instruction,
        notes:directionIntegrityArrivalNotesV17321(after,entry?.notes),
        disableRoadIntel:false,
        sourceIntegrityV17321:true
      };
    }

    const directionTruthEntriesBeforeIntegrityV17321=directionTruthEntriesV17320;
    directionTruthEntriesV17320=function directionTruthEntriesIntegrityV17321(entries,p) {
      const repaired=(entries||[]).map(entry=>directionIntegrityTurnTravelV17321(entry,p));
      return directionTruthEntriesBeforeIntegrityV17321(repaired,p);
    };

    function directionIntegrityBadMainV17321(value) {
      const text=directionMainCleanV17317(value||"");
      if (/\bNearest\s+Hospital\b|\bMedical\s+Park\b/i.test(text)) return true;
      if (/\bon\s+(?:CR|TR|SR|County\s+Road|Township\s+Road|State\s+Route)\s*$/i.test(text)) return true;
      if (/\bon\s+(?:North\s+East|North\s+West|South\s+East|South\s+West|Left\s+Nearest|Right\s+Nearest)\s*$/i.test(text)) return true;
      return false;
    }

    const directionFinalCardsBeforeIntegrityV17321=directionFinalCardsFromEntriesV17317;
    directionFinalCardsFromEntriesV17317=function directionFinalCardsIntegrityV17321(entries,p) {
      const cards=directionFinalCardsBeforeIntegrityV17321(entries,p);
      return (cards||[]).map(card=>({
        ...card,
        notes:(card?.notes||[]).filter(note=>!/^Nearest\s+Hospital\b/i.test(String(note||"")))
      }));
    };

    window.directionIntegrityTurnTravelV17321=directionIntegrityTurnTravelV17321;
    window.directionIntegrityBadMainV17321=directionIntegrityBadMainV17321;
