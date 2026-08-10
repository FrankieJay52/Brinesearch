    /* BrineSearch V17.3.22 — saved leading-decimal mileage truth.
       Some legacy rewrite rows dropped the decimal point from saved values such as
       .72 mile -> 72 miles or .5 mile -> 5 miles. Repair only when the saved
       source and rewritten distance facts line up in order, unit family matches,
       and the rewritten value is exactly the source digits with the dot removed.
       This is source restoration, never estimation. */

    function directionDistanceFactsSourceV17322(value) {
      const text=String(value||"");
      const out=[];
      const re=/(^|[^0-9])((?:\.\d+|\d+(?:\.\d+)?))\s*(miles?|mile|mi|feet|foot|ft|yards?|yard|yd)\b/ig;
      let match;
      while((match=re.exec(text))) {
        const prefix=String(match[1]||"").length;
        const number=String(match[2]||"");
        const unitRaw=String(match[3]||"").toLowerCase();
        const unit=/^(?:mile|miles|mi)$/.test(unitRaw)?"mi":/^(?:feet|foot|ft)$/.test(unitRaw)?"ft":"yd";
        const start=(match.index||0)+prefix;
        out.push({number,unit,start,end:start+number.length});
      }
      return out;
    }

    function directionRepairLeadingDecimalMileageV17322(sourceValue,clearValue) {
      const source=String(sourceValue||"");
      let clear=String(clearValue||"");
      if (!source||!clear||!/(?:^|[^0-9])\.\d+\s*(?:miles?|mile|mi|feet|foot|ft|yards?|yard|yd)\b/i.test(source)) return clear;
      const sourceFacts=directionDistanceFactsSourceV17322(source);
      const clearFacts=directionDistanceFactsSourceV17322(clear);
      const changes=[];
      const count=Math.min(sourceFacts.length,clearFacts.length);
      for(let i=0;i<count;i+=1) {
        const saved=sourceFacts[i],shown=clearFacts[i];
        if(!/^\.\d+$/.test(saved.number)||saved.unit!==shown.unit) continue;
        const digits=saved.number.slice(1);
        if(!digits) continue;
        const shownNormalized=String(Number(shown.number));
        const digitsNormalized=String(Number(digits));
        if(shownNormalized!==digitsNormalized) continue;
        changes.push({start:shown.start,end:shown.end,replacement:`0${saved.number}`});
      }
      for(const change of changes.sort((a,b)=>b.start-a.start)) clear=`${clear.slice(0,change.start)}${change.replacement}${clear.slice(change.end)}`;
      return clear;
    }

    let directionLeadingDecimalRepairsV17322=0;
    for(const entry of Object.values(VERIFIED_DIRECTION_REWRITES||{})) {
      if(!entry||typeof entry!=="object") continue;
      const before=String(entry.r||"");
      const after=directionRepairLeadingDecimalMileageV17322(entry.s,before);
      if(after!==before){entry.r=after;directionLeadingDecimalRepairsV17322+=1;}
    }

    for(const pad of pads||[]) {
      const source=String(pad?.originalWrittenDirections||pad?.writtenDirections||"");
      const before=String(pad?.directionsClear||"");
      if(!source||!before) continue;
      const after=directionRepairLeadingDecimalMileageV17322(source,before);
      if(after!==before) pad.directionsClear=after;
    }

    window.directionRepairLeadingDecimalMileageV17322=directionRepairLeadingDecimalMileageV17322;
    window.directionLeadingDecimalRepairsV17322=directionLeadingDecimalRepairsV17322;
