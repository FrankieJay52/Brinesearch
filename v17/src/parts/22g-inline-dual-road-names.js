    /* BrineSearch V17.3.12 — explicit dual-name road fallback.
       Live road intelligence remains preferred, but an official county-road
       identity may override a contradictory inferred row. When live road
       intelligence is unavailable, preserve explicit numbered-road/local-road
       pairs written in saved driver directions instead of dropping the local
       road name. Narrative slash text is deliberately rejected so phrases such
       as "Left/East Onto" never become road aliases. */

    function directionUsefulAliasV17312(value) {
      const alias = normalize(value);
      if (!alias || alias.length > 80) return false;
      if (/^(?:County|Township|State|Local|Private|Access|Lease)?\s*(?:Rd|Road|Route|Hwy|Highway)?$/i.test(alias)) return false;
      if (/^(?:left|right|turn|take|follow|continue|head|go|travel|proceed|onto|on)\b/i.test(alias)) return false;
      if (/\b(?:turn|onto|continue|follow|take)\b/i.test(alias)) return false;
      if (/\b(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d/i.test(alias)) return false;
      return /[A-Za-z]/.test(alias);
    }

    function directionInlinePrimaryRouteV17312(value, p, instruction) {
      const raw = normalize(value);
      if (!raw) return "";
      const generic = raw.match(/^Route\s*[- ]?\s*(\d{1,4}[A-Z]?)$/i);
      if (generic) return directionGenericRouteLabelV17312(generic[1], p, instruction || raw);
      return normalizeRoadName(raw, p).text;
    }

    function directionInlineDualRoadV17312(instruction, p) {
      const text = String(instruction || "").replace(/\s{2,}/g, " ").trim();
      if (!text || !text.includes("/")) return null;
      const suffix = "(?:Rd|Road|St|Street|Ave|Avenue|Hwy|Highway|Ln|Lane|Dr|Drive|Pike|Ridge|Crossing|Run|Hollow|Hill|Creek|Fork)";
      const compass = "(?:northwest|northeast|southwest|southeast|north|south|east|west|NW|NE|SW|SE|N|S|E|W)";
      const numbered = "(?:I|US|OH|WV|PA|SR|CR|TR)\\s*[- ]?\\s*\\d{1,4}[A-Z]?";
      const worded = "(?:(?:State\\s+Route|County\\s+(?:Road|Rd|Route|Hwy)|Township\\s+(?:Road|Rd|Route|Hwy)|C\\.?\\s*R\\.?|T\\.?\\s*R\\.?|Co\\.?\\s*Rd\\.?)\\s*[- ]?\\s*\\d{1,4}[A-Z]?)";
      const generic = "(?:Route\\s*[- ]?\\s*\\d{1,4}[A-Z]?)";
      const primaryPattern = `(?:${numbered}|${worded}|${generic})`;

      let match = text.match(new RegExp(`\\b(${primaryPattern})(?:\\s+${compass})?\\s*\\/\\s*(?:${compass}\\s*\\/\\s*)?([A-Za-z0-9][A-Za-z0-9 .'-]{0,70}?${suffix})\\b`, "i"));
      if (match) {
        const primary = directionInlinePrimaryRouteV17312(match[1], p, text);
        const alias = normalizeRoadName(match[2], p).text;
        if (primary && directionUsefulAliasV17312(alias)) return { kind:"route", text:primary, alias };
      }

      match = text.match(new RegExp(`\\b([A-Za-z0-9][A-Za-z0-9 .'-]{0,70}?${suffix})\\.?\\s*\\/\\s*(C\\.?\\s*R\\.?|CR|T\\.?\\s*R\\.?|TR)\\s*[- ]?\\s*(\\d{1,4}[A-Z]?)\\b`, "i"));
      if (match) {
        const prefix = /^C/i.test(match[2]) ? "CR" : "TR";
        const primary = `${prefix}-${match[3].toUpperCase()}`;
        const alias = normalizeRoadName(match[1], p).text;
        if (directionUsefulAliasV17312(alias)) return { kind:"route", text:primary, alias };
      }
      return null;
    }

    /* Jefferson County's official road list resolves a cluster that appears in
       many saved Ascent routes around Bloomingdale. These are not guesses:
       County Highway 22 = Steubenville Street, County Highway 23 =
       Bloomingdale-Smithfield-Chandler Road, and County Highway 26 =
       Fernwood-Bloomingdale Road. Saved driver directions also identify High St
       as the in-town CR-23 name. Keeping this small authoritative fallback here
       prevents a bad shared-intelligence row from relabeling the same physical
       road differently on two nearby pads. */
    function directionOfficialRoadIdentityV17312(instruction, p) {
      if (directionStateCodeV17312(p) !== "OH") return null;
      const county = normalize(p?.county).replace(/\s+county$/i, "");
      if (!/^Jefferson$/i.test(county)) return null;

      const text = String(instruction || "").replace(/[._]+/g, " ").replace(/\s{2,}/g, " ").trim();
      if (!text) return null;

      if (/\b(?:East\s+|E\s+)?Steubenville\s+(?:St|Street)\b/i.test(text)) {
        return { kind:"route", text:"CR-22", alias:/\b(?:East|E)\s+Steubenville\b/i.test(text) ? "E Steubenville St" : "Steubenville St" };
      }

      if (/\bBloomingdale[\s-]*Smithfield[\s-]*(?:Chandl(?:er)?|Chandler)\b/i.test(text)) {
        return {
          kind:"route",
          text:"CR-23",
          alias:/\bHigh\s+(?:St|Street)\b/i.test(text) ? "High St" : "Bloomingdale-Smithfield-Chandler Rd"
        };
      }

      if (/\bFernwood[\s-]*Bloomingdale\s+(?:Rd|Road)\b/i.test(text)) {
        return { kind:"route", text:"CR-26", alias:"Fernwood-Bloomingdale Rd" };
      }

      return null;
    }

    const directionReferencePartBeforeOfficialV17312 = directionReferencePartV17312;
    directionReferencePartV17312 = function directionReferencePartOfficialV17312(part, p) {
      const official = directionOfficialRoadIdentityV17312(part, p);
      if (official) return `${official.text} / ${official.alias}`;
      return directionReferencePartBeforeOfficialV17312(part, p);
    };

    const directionClearRoadTextBeforeDualV17312 = directionClearRoadTextV1732;
    directionClearRoadTextV1732 = function directionClearRoadTextDualV17312(instruction, p) {
      return directionInlineDualRoadV17312(instruction, p)
        || directionOfficialRoadIdentityV17312(instruction, p)
        || directionClearRoadTextBeforeDualV17312(instruction, p);
    };

    const directionClearSignForRoadBeforeDualV17312 = directionClearSignForRoadV1733;
    directionClearSignForRoadV1733 = function directionClearSignForRoadDualV17312(road, p) {
      const baseRoad = road?.alias ? { ...road, alias:"" } : road;
      const sign = directionClearSignForRoadBeforeDualV17312(baseRoad, p);
      if (!sign || !normalize(road?.alias)) return sign;
      return `${sign}<span class="direction-clear-road-alias">${esc(road.alias)}</span>`;
    };

    const directionRoadIntelRoadBeforeDualV17312 = directionRoadIntelRoadV1739;
    directionRoadIntelRoadV1739 = function directionRoadIntelRoadDualV17312(view, intel) {
      const road = directionRoadIntelRoadBeforeDualV17312(view, intel);
      if (normalize(intel?.local_road_name) && road?.alias) return { ...road, alias:"" };
      return road;
    };
