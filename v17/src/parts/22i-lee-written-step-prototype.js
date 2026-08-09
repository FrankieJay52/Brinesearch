    /* BrineSearch V17.3.14 — LEE-only written-step prototype.
       This intentionally changes only Ascent LEE so the driver can approve the
       simpler direction-card style before it is applied globally. The saved
       Clear Directions remain authoritative and are not modified. Road-sign
       graphics and the structured alternate-route renderer are suppressed only
       for this prototype pad. */

    function directionLeeWrittenPrototypeV17314(p) {
      return normalize(p?._id).toLowerCase() === "ascent--lee";
    }

    function directionLeeWrittenSentenceV17314(value) {
      let text = String(value || "").replace(/\s{2,}/g, " ").trim();
      if (!text) return "";

      // The starting town is useful source context, but the driver card should
      // begin with the actual maneuver just like a normal written direction.
      text = text.replace(/^From\s+Colerain,\s*/i, "");

      // Keep the road name in the sentence instead of creating a separate sign.
      text = text.replace(/\bonto\b/gi, "on");

      // For the prototype, prefer the familiar local road name over the parallel
      // county-road alias. The alias stays preserved in the saved source data.
      text = text.replace(/\s*\/\s*CR-\d+[A-Z]?\b/gi, "");

      // Keep known mileage with the same maneuver rather than creating another
      // card or a detached mileage badge.
      text = text.replace(/\.\s*Continue\s+(?:approximately\s+|about\s+)?(\d+(?:\.\d+)?)\s*(?:miles?|mi)\.?$/i, " for $1 mi.");
      text = text.replace(/\.\s*Continue\s+(?:approximately\s+|about\s+)?(\d+(?:\.\d+)?)\s*(?:feet|ft)\.?$/i, " for $1 ft.");

      text = text.replace(/^The\s+access\s+road\s+is\s+on\s+the\s+(left|right)\.?$/i, (_, side) => `Access road is on the ${side.toLowerCase()}.`);
      text = text.replace(/^The\s+lease\s+road\s+is\s+on\s+the\s+(left|right)\.?$/i, (_, side) => `Lease road is on the ${side.toLowerCase()}.`);
      text = text.replace(/\s+([.;,])/g, "$1").replace(/\s{2,}/g, " ").trim();
      if (text) text = text.charAt(0).toUpperCase() + text.slice(1);
      return text;
    }

    function directionLeeWrittenStepsV17314(clearText) {
      const parsed = directionClearSectionsV1732(clearText);
      return (parsed.steps || []).map(directionLeeWrittenSentenceV17314).filter(Boolean);
    }

    const directionClearPrimaryHtmlBeforeLeePrototypeV17314 = directionClearPrimaryHtmlV1732;
    directionClearPrimaryHtmlV1732 = function directionClearPrimaryHtmlLeePrototypeV17314(clearText, p) {
      if (!directionLeeWrittenPrototypeV17314(p)) {
        return directionClearPrimaryHtmlBeforeLeePrototypeV17314(clearText, p);
      }

      const steps = directionLeeWrittenStepsV17314(clearText);
      if (!steps.length) return directionClearPrimaryHtmlBeforeLeePrototypeV17314(clearText, p);

      return `<section class="direction-route-group direction-clear-primary direction-written-step-prototype">
        <div class="direction-route-heading"><span>PRIMARY ROUTE</span></div>
        <ol class="direction-pro-steps direction-clear-steps">${steps.map((instruction, index) => `
          <li class="direction-pro-step direction-clear-step direction-written-step">
            <span class="direction-pro-number">${index + 1}</span>
            <div class="direction-pro-main direction-clear-card">
              <div class="direction-clear-fallback">${esc(instruction)}</div>
            </div>
          </li>`).join("")}</ol>
      </section>`;
    };

    const directionClearDisplayHtmlBeforeLeePrototypeV17314 = directionClearDisplayHtmlV1732;
    directionClearDisplayHtmlV1732 = function directionClearDisplayHtmlLeePrototypeV17314(clearText, structuredValue, p) {
      if (!directionLeeWrittenPrototypeV17314(p)) {
        return directionClearDisplayHtmlBeforeLeePrototypeV17314(clearText, structuredValue, p);
      }
      const primary = directionClearPrimaryHtmlV1732(clearText, p);
      return primary ? `<div class="direction-route-groups direction-clear-route-groups">${primary}</div>` : "";
    };
