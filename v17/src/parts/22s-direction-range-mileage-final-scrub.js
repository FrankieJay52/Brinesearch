    /* BrineSearch V17.3.17 — final mileage-range + road-pair scrub.
       Handles legacy saved forms such as 1-2 miles, 300 feet, and 500ft after
       the main maneuver/road has been selected. Ranges stay ranges; nothing is
       averaged or guessed. Explicit local-road / numbered-route pairs also get
       one final preservation check so Brushy Run / CR-17 cannot collapse to a
       route number alone. */

    const directionDistanceFactsBeforeRangeV17317 = directionDistanceFactsFinalV17317;
    directionDistanceFactsFinalV17317 = function directionDistanceFactsRangeSafeV17317(value) {
      const text = String(value || "");
      const base = directionDistanceFactsBeforeRangeV17317(text);
      const rangePattern = /(^|[^0-9-])((?:approximately|approx(?:imately)?\.?|about|roughly)\s+)?(\d+(?:\.\d+)?|\.\d+)\s*[-–]\s*(\d+(?:\.\d+)?|\.\d+)\s*(miles?|mile|mi|feet|foot|ft|yards?|yard|yd)\b/ig;
      const ranges = [];
      let match;
      while ((match = rangePattern.exec(text))) {
        const prefixLength = String(match[1] || "").length;
        const a = Number(String(match[3] || "").startsWith(".") ? `0${match[3]}` : match[3]);
        const b = Number(String(match[4] || "").startsWith(".") ? `0${match[4]}` : match[4]);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) continue;
        const unitRaw = String(match[5] || "").toLowerCase();
        const unit = /^(?:mile|miles|mi)$/.test(unitRaw) ? "mi" : /^(?:feet|foot|ft)$/.test(unitRaw) ? "ft" : "yd";
        ranges.push({
          start:(match.index || 0) + prefixLength,
          end:(match.index || 0) + String(match[0] || "").length,
          label:`${String(match[2] || "").trim() ? "≈" : ""}${Number(a.toFixed(2))}–${Number(b.toFixed(2))} ${unit}`,
          raw:String(match[0] || "").slice(prefixLength).trim()
        });
      }
      if (!ranges.length) return base;
      return [
        ...base.filter(fact => !ranges.some(range => fact.start < range.end && fact.end > range.start)),
        ...ranges
      ].sort((a,b) => a.start - b.start);
    };

    function directionTrimFinalMainV17317(value) {
      let text = directionMainCleanV17317(value)
        .replace(/\(\s*\)/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      const boundary = text.search(/\s+(?=(?:Google\s+map|Entrance\s+(?:is|will)|Pad\s+(?:is|will|on)|Access\s+road|Lease\s+road|Gate\s+code|CB\b|At\s+(?:the\s+)?stop\s+sign)\b)/i);
      if (boundary > 0) text = directionMainCleanV17317(text.slice(0, boundary));
      text = text.replace(/\b(?:for|in|about|approximately|approx\.?|roughly)\s*$/i, "").trim();
      return text || "Continue";
    }

    function directionRestoreExplicitPairV17317(mainValue, entry, p) {
      const main = directionMainCleanV17317(mainValue);
      const raw = directionStepCleanV17316(entry?.instruction || "");
      let pair = null;
      try { pair = directionExplicitRoadDisplayFinalV17317(raw, p); } catch {}
      if (!pair?.doubleName || !pair.road || main.includes("/")) return { main, doubleName:false };

      // Only replace the road portion of an actual maneuver/continuation. The
      // pair itself comes from the saved instruction, never from a catalog-only
      // alias. This handles forms like Brushy Run / County Road 17.
      const action = main.match(/^((?:Turn\s+(?:left|right)|Slight\s+(?:left|right)|Veer\s+(?:left|right)|Bear\s+(?:left|right)|Stay\s+(?:left|right)|Keep\s+(?:left|right)|Continue|Head\s+(?:north|south|east|west)|Take|Merge))\b/i);
      if (!action) return { main, doubleName:false };
      const prefix = action[1].replace(/\s+$/g, "");
      const joiner = /^(?:Take)$/i.test(prefix) ? " " : /^(?:Head)\b/i.test(prefix) ? " on " : " on ";
      return { main:`${prefix}${joiner}${pair.road}`, doubleName:true };
    }

    const directionFinalMetaBeforeRangeV17317 = directionFinalMetaV17317;
    directionFinalMetaV17317 = function directionFinalMetaRangeSafeV17317(entry, p) {
      const meta = directionFinalMetaBeforeRangeV17317(entry, p);
      if (meta?.suppress) return meta;
      let main = String(meta?.instruction || "");
      let distance = String(meta?.distance || "");
      const mainFacts = directionDistanceFactsFinalV17317(main);
      if (mainFacts.length === 1) {
        if (!distance) distance = mainFacts[0].label;
        main = directionStripOneDistanceFinalV17317(main, mainFacts[0]);
      }
      main = directionTrimFinalMainV17317(main);
      const restored = directionRestoreExplicitPairV17317(main, entry, p);
      main = restored.main;
      return { ...meta, instruction:main, distance, doubleName:Boolean(meta.doubleName || restored.doubleName) };
    };

    directionWrittenDisplayMetaV17317 = directionFinalMetaV17317;
    window.directionFinalMetaV17317 = directionFinalMetaV17317;
