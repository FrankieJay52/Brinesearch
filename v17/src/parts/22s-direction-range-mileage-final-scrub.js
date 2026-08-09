    /* BrineSearch V17.3.17 — final mileage-range + road-pair scrub.
       Handles legacy saved forms such as 1-2 miles, 300 feet, and 500ft after
       the main maneuver/road has been selected. Ranges stay ranges; nothing is
       averaged or guessed. Same-road local-name / route-number pairs remain
       inline, while slash-separated intersection references stay notes. */

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

    function directionIntersectionReferenceV17317(value) {
      const text = String(value || "").replace(/\s{2,}/g, " ");
      return /\b(?:from|at)\b[^.;]{0,180}\s*\/\s*[^.;]{0,100}\bintersection\b/i.test(text)
        || /\bintersection\s+(?:of|at)\b[^.;]{0,180}\s*\/\s*[^.;]{0,100}/i.test(text);
    }

    function directionTargetHasExplicitSlashPairV17317(value) {
      const text = String(value || "").replace(/\bonto\b/ig, "on");
      return /^(?:Turn\s+(?:left|right)|Slight\s+(?:left|right)|Veer\s+(?:left|right)|Bear\s+(?:left|right)|Stay\s+(?:left|right)|Keep\s+(?:left|right)|Take|Head|Continue|Follow|Travel|Proceed|Merge)\b[^.;]{0,90}\bon\s+[^.;]{0,100}\s*\/\s*[^.;]{1,100}/i.test(text);
    }

    const directionExplicitRoadDisplayBeforeIntersectionV17317 = directionExplicitRoadDisplayFinalV17317;
    directionExplicitRoadDisplayFinalV17317 = function directionExplicitRoadDisplayIntersectionSafeV17317(value, p) {
      if (directionIntersectionReferenceV17317(value) && !directionTargetHasExplicitSlashPairV17317(value)) return null;
      return directionExplicitRoadDisplayBeforeIntersectionV17317(value, p);
    };

    function directionNormalizeIntersectionReferenceV17317(value) {
      return directionMainCleanV17317(value)
        .replace(/\bCounty\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)/ig, "CR-$1")
        .replace(/\bTownship\s+(?:Road|Rd|Route|Hwy)\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)/ig, "TR-$1")
        .replace(/\bCR\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)/ig, "CR-$1")
        .replace(/\bTR\s*[- ]?\s*(\d{1,4}(?:\/\d+)?[A-Z]?)/ig, "TR-$1")
        .replace(/\s*\/\s*/g, " / ")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    const directionMainActionBeforeIntersectionV17317 = directionMainActionFinalV17317;
    directionMainActionFinalV17317 = function directionMainActionIntersectionSafeV17317(value, p) {
      const text = directionNormalizeShorthandFinalV17317(value).replace(/\bonto\b/ig, "on");
      const turn = text.match(/^Turn\s+(left|right)\b/i);
      if (turn && directionIntersectionReferenceV17317(text) && !/^Turn\s+(?:left|right)\b[^.;]{0,40}\bon\s+/i.test(text)) {
        let view = null;
        try { view = directionClearStepViewV1733(text, p); } catch {}
        return { main:`Turn ${turn[1].toLowerCase()}`, roadInfo:{ road:"", doubleName:false, view }, view };
      }
      return directionMainActionBeforeIntersectionV17317(value, p);
    };

    const directionNotesBeforeIntersectionV17317 = directionNotesFinalV17317;
    directionNotesFinalV17317 = function directionNotesIntersectionSafeV17317(original, working, mainInfo, distanceFact, seedNotes) {
      const notes = directionNotesBeforeIntersectionV17317(original, working, mainInfo, distanceFact, seedNotes);
      const text = String(original || "").replace(/\s{2,}/g, " ");
      let match = text.match(/\b(?:well\s*)?pad\s+access\s+road\s+begins[\s\S]{0,100}?\bfrom\s+(.+?)\s+intersection\b/i);
      if (match) notes.push(`Reference: ${directionNormalizeIntersectionReferenceV17317(match[1])} intersection`);
      match = text.match(/\bNearest\s+Hospital\s+(.+)$/i);
      if (match) notes.push(`Nearest hospital: ${directionMainCleanV17317(match[1])}`);
      return directionUniqueNotesV17317(notes);
    };

    function directionRestoreExplicitPairV17317(mainValue, entry, p) {
      const main = directionMainCleanV17317(mainValue);
      const raw = directionStepCleanV17316(entry?.instruction || "");
      if (directionIntersectionReferenceV17317(raw) && !directionTargetHasExplicitSlashPairV17317(raw)) return { main, doubleName:false };
      let pair = null;
      try { pair = directionExplicitRoadDisplayFinalV17317(raw, p); } catch {}
      if (!pair?.doubleName || !pair.road || main.includes("/")) return { main, doubleName:false };
      const action = main.match(/^((?:Turn\s+(?:left|right)|Slight\s+(?:left|right)|Veer\s+(?:left|right)|Bear\s+(?:left|right)|Stay\s+(?:left|right)|Keep\s+(?:left|right)|Continue|Head\s+(?:north|south|east|west)|Take|Merge))\b/i);
      if (!action) return { main, doubleName:false };
      const prefix = action[1].replace(/\s+$/g, "");
      const joiner = /^(?:Take)$/i.test(prefix) ? " " : " on ";
      return { main:`${prefix}${joiner}${pair.road}`, doubleName:true };
    }

    const directionFinalMetaBeforeRangeV17317 = directionFinalMetaV17317;
    directionFinalMetaV17317 = function directionFinalMetaRangeSafeV17317(entry, p) {
      const raw = directionStepCleanV17316(entry?.instruction || "");
      const meta = directionFinalMetaBeforeRangeV17317(entry, p);
      if (meta?.suppress) return meta;

      /* This malformed import is fully resolved from its own saved sentence:
         CR-17 / Fork Ridge Rd is the preceding road. The left turn is onto
         unsigned Brushy Run Rd, and the pad access road begins about 0.65 mi
         after that turn. */
      if (/well\s+pad\s+access\s+road\s+begins\s+approximately\s+0\.65\s+miles\s+from\s+Brushy\s+Run\s*\/\s*(?:CR|County\s+Road)\s*17\s+intersection/i.test(raw)) {
        return {
          ...meta,
          instruction:"Turn left on Brushy Run Rd",
          distance:"≈0.65 mi",
          doubleName:false,
          notes:directionUniqueNotesV17317(["Brushy Run Rd is unsigned", ...(meta?.notes || [])])
        };
      }

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
