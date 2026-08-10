    /* BrineSearch V17.3.25 — Owner Route Mapper backward road trace.
       Starts at the selected pad, reads the saved PRIMARY road sequence backward,
       and highlights only roads whose geometry can be matched to Road Manager or
       OpenStreetMap. Unnamed/unmatched access gaps remain visibly untraced. */

    const ROUTE_BACKTRACE_RADIUS_M_V17325 = 30000;
    const routeBacktraceMemoryV17325 = new Map();

    function routeBacktraceRoadKeyV17325(value) {
      return String(value || "").toLowerCase()
        .replace(/\binterstate\b/g, "i")
        .replace(/\bu\.?s\.?\s*(?:route|highway|hwy)?\b/g, "us")
        .replace(/\b(?:state route|sr|ohio route|oh route)\b/g, "oh")
        .replace(/\bcounty\s+(?:road|rd|route|highway|hwy)\b/g, "cr")
        .replace(/\btownship\s+(?:road|rd|route|highway|hwy)\b/g, "tr")
        .replace(/\broad\b/g, "rd")
        .replace(/\bstreet\b/g, "st")
        .replace(/\bhighway\b/g, "hwy")
        .replace(/[^a-z0-9]+/g, "")
        .trim();
    }

    function routeBacktraceEditDistanceV17325(a, b) {
      const left = String(a || ""), right = String(b || "");
      if (!left) return right.length;
      if (!right) return left.length;
      const prev = Array.from({ length: right.length + 1 }, (_, index) => index);
      for (let i = 1; i <= left.length; i += 1) {
        let diagonal = prev[0];
        prev[0] = i;
        for (let j = 1; j <= right.length; j += 1) {
          const saved = prev[j];
          prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
          diagonal = saved;
        }
      }
      return prev[right.length];
    }

    function routeBacktraceSimilarityV17325(a, b) {
      const left = routeBacktraceRoadKeyV17325(a), right = routeBacktraceRoadKeyV17325(b);
      if (!left || !right) return 0;
      if (left === right) return 1;
      if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
      const max = Math.max(left.length, right.length);
      return max ? 1 - routeBacktraceEditDistanceV17325(left, right) / max : 0;
    }

    function routeBacktracePrimaryTokensV17325(pad) {
      const mapperRoads = Array.isArray(routeMapperSegmentsV17324) && routeMapperSegmentsV17324.length
        ? routeMapperSegmentsV17324.map(segment => segment.roadName).filter(Boolean)
        : [];
      let tokens = mapperRoads;
      if (!tokens.length) {
        const sequence = normalize(pad?.Structured_Road_Sequence || "");
        tokens = sequence.split(/\s*(?:→|->)\s*/).map(value => normalize(value)).filter(Boolean);
        const alternative = tokens.findIndex(value => /^(?:OR|ALT(?:ERNATE)?(?:\s+ROUTE)?)$/i.test(value));
        if (alternative >= 0) tokens = tokens.slice(0, alternative);
      }
      const clean = [];
      for (const token of tokens) {
        if (!token || /^(?:OR|PRIMARY ROUTE)$/i.test(token)) continue;
        const previous = clean[clean.length - 1];
        if (previous && routeBacktraceSimilarityV17325(previous, token) >= 0.9) continue;
        clean.push(token);
      }
      return clean;
    }

    function routeBacktraceTokenKindV17325(token) {
      const text = normalize(token);
      if (/^Exit\s+\d+/i.test(text)) return "exit";
      if (/^(?:Access|Lease|Pad|Entrance)(?:\s+Road)?\b/i.test(text)) return "access";
      if (/^(?:Stop sign|Gate|Destination|Turnaround)$/i.test(text)) return "context";
      return "road";
    }

    function routeBacktraceRoadTokensV17325(pad) {
      const primary = routeBacktracePrimaryTokensV17325(pad);
      return primary.map((label, index) => ({ label, index, kind: routeBacktraceTokenKindV17325(label) })).reverse();
    }

    function routeBacktraceGeoLinesV17325(value) {
      const geometry = value?.type === "Feature" ? value.geometry : value;
      if (!geometry) return [];
      if (geometry.type === "FeatureCollection") return (geometry.features || []).flatMap(routeBacktraceGeoLinesV17325);
      if (geometry.type === "GeometryCollection") return (geometry.geometries || []).flatMap(routeBacktraceGeoLinesV17325);
      if (geometry.type === "LineString") return [geometry.coordinates || []].filter(line => line.length > 1);
      if (geometry.type === "MultiLineString") return (geometry.coordinates || []).filter(line => Array.isArray(line) && line.length > 1);
      return [];
    }

    function routeBacktraceMilesV17325(a, b) {
      if (!a || !b) return Infinity;
      const toRad = value => value * Math.PI / 180;
      const lat1 = toRad(Number(a[1])), lat2 = toRad(Number(b[1]));
      const dLat = lat2 - lat1, dLng = toRad(Number(b[0]) - Number(a[0]));
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
    }

    function routeBacktraceLineLengthV17325(line) {
      let total = 0;
      for (let index = 1; index < (line || []).length; index += 1) total += routeBacktraceMilesV17325(line[index - 1], line[index]);
      return total;
    }

    function routeBacktraceClosestVertexV17325(point, line) {
      let best = { distance: Infinity, index: -1, point: null };
      const step = Math.max(1, Math.floor((line || []).length / 500));
      for (let index = 0; index < (line || []).length; index += step) {
        const distance = routeBacktraceMilesV17325(point, line[index]);
        if (distance < best.distance) best = { distance, index, point: line[index] };
      }
      if (line?.length && (line.length - 1) % step) {
        const index = line.length - 1, distance = routeBacktraceMilesV17325(point, line[index]);
        if (distance < best.distance) best = { distance, index, point: line[index] };
      }
      return best;
    }

    function routeBacktraceClosestPairV17325(left, right) {
      let best = { distance: Infinity, left: null, right: null };
      const leftStep = Math.max(1, Math.floor((left || []).length / 350));
      const rightStep = Math.max(1, Math.floor((right || []).length / 350));
      for (let i = 0; i < (left || []).length; i += leftStep) {
        for (let j = 0; j < (right || []).length; j += rightStep) {
          const distance = routeBacktraceMilesV17325(left[i], right[j]);
          if (distance < best.distance) best = { distance, left: left[i], right: right[j] };
        }
      }
      return best;
    }

    function routeBacktraceMergeLinesV17325(lines) {
      const pending = (lines || []).map(line => line.map(point => [Number(point[0]), Number(point[1])]).filter(point => point.every(Number.isFinite))).filter(line => line.length > 1);
      const merged = [];
      while (pending.length) {
        let current = pending.shift();
        let changed = true;
        while (changed) {
          changed = false;
          for (let index = 0; index < pending.length; index += 1) {
            const next = pending[index];
            const a0 = current[0], a1 = current[current.length - 1], b0 = next[0], b1 = next[next.length - 1];
            const joins = [
              [routeBacktraceMilesV17325(a1, b0), "append"],
              [routeBacktraceMilesV17325(a1, b1), "appendReverse"],
              [routeBacktraceMilesV17325(a0, b1), "prepend"],
              [routeBacktraceMilesV17325(a0, b0), "prependReverse"]
            ].sort((a, b) => a[0] - b[0]);
            if (joins[0][0] > 0.04) continue;
            const mode = joins[0][1];
            if (mode === "append") current = current.concat(next.slice(1));
            else if (mode === "appendReverse") current = current.concat([...next].reverse().slice(1));
            else if (mode === "prepend") current = next.concat(current.slice(1));
            else current = [...next].reverse().concat(current.slice(1));
            pending.splice(index, 1);
            changed = true;
            break;
          }
        }
        merged.push(current);
      }
      return merged;
    }

    function routeBacktraceRoadLabelsV17325(road) {
      return [road?.canonical_name, ...(Array.isArray(road?.aliases) ? road.aliases : []), road?.route_number].filter(Boolean);
    }

    function routeBacktraceRoadManagerMatchesV17325(token, roads) {
      return (roads || []).map(road => ({
        road,
        score: Math.max(...routeBacktraceRoadLabelsV17325(road).map(label => routeBacktraceSimilarityV17325(token, label)), 0)
      })).filter(item => item.score >= 0.78).sort((a, b) => b.score - a.score).slice(0, 6);
    }

    function routeBacktraceRegexEscapeV17325(value) {
      return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function routeBacktraceOverpassPatternV17325(token) {
      const text = normalize(token);
      let match = text.match(/^I[- ]?(\d{1,3})$/i);
      if (match) return `^(?:I[- ]?${match[1]}|Interstate ${match[1]})$`;
      match = text.match(/^US[- ]?(\d{1,3})$/i);
      if (match) return `^(?:US[- ]?${match[1]}|US ${match[1]}|U\\.?S\\.? ${match[1]})$`;
      match = text.match(/^(?:OH|SR|State Route)[- ]?(\d{1,4})$/i);
      if (match) return `^(?:OH[- ]?${match[1]}|SR[- ]?${match[1]}|State Route ${match[1]})$`;
      match = text.match(/^(?:CR|County Road)[- ]?(\d{1,4}(?:\/\d+)?)$/i);
      if (match) return `^(?:CR[- ]?${routeBacktraceRegexEscapeV17325(match[1])}|County Road ${routeBacktraceRegexEscapeV17325(match[1])})$`;
      match = text.match(/^(?:TR|Township Road)[- ]?(\d{1,4}(?:\/\d+)?)$/i);
      if (match) return `^(?:TR[- ]?${routeBacktraceRegexEscapeV17325(match[1])}|Township Road ${routeBacktraceRegexEscapeV17325(match[1])})$`;
      const local = routeBacktraceRegexEscapeV17325(text).replace(/\\\b(?:Rd|Road)\\\b$/i, "(?:Rd|Road)");
      return `^${local}$`;
    }

    async function routeBacktraceOverpassV17325(tokens, coords) {
      if (!tokens.length || !coords) return [];
      const statements = tokens.slice(0, 12).map(token => {
        const pattern = routeBacktraceOverpassPatternV17325(token.label);
        return `way(around:${ROUTE_BACKTRACE_RADIUS_M_V17325},${coords.lat},${coords.lng})[\"highway\"][\"name\"~\"${pattern}\",i];way(around:${ROUTE_BACKTRACE_RADIUS_M_V17325},${coords.lat},${coords.lng})[\"highway\"][\"ref\"~\"${pattern}\",i];`;
      }).join("");
      const query = `[out:json][timeout:18];(${statements});out tags geom;`;
      const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
      let lastError = null;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
          if (!response.ok) throw new Error(`Map road lookup returned ${response.status}`);
          const data = await response.json();
          return Array.isArray(data?.elements) ? data.elements : [];
        } catch (error) { lastError = error; }
      }
      throw lastError || new Error("Map road lookup unavailable");
    }

    function routeBacktraceOsmMatchScoreV17325(token, element) {
      const tags = element?.tags || {};
      return Math.max(
        routeBacktraceSimilarityV17325(token, tags.name),
        routeBacktraceSimilarityV17325(token, tags.ref),
        routeBacktraceSimilarityV17325(token, tags.alt_name),
        routeBacktraceSimilarityV17325(token, tags.official_name)
      );
    }

    function routeBacktraceCandidateComponentsV17325(token, roads, osmElements) {
      const lines = [];
      const sources = new Set();
      routeBacktraceRoadManagerMatchesV17325(token.label, roads).forEach(item => {
        const geometryLines = routeBacktraceGeoLinesV17325(item.road?.centerline_geojson);
        if (geometryLines.length) {
          lines.push(...geometryLines);
          sources.add("Road Manager geometry");
        }
      });
      (osmElements || []).forEach(element => {
        if (routeBacktraceOsmMatchScoreV17325(token.label, element) < 0.76) return;
        const line = (element.geometry || []).map(point => [Number(point.lon), Number(point.lat)]).filter(point => point.every(Number.isFinite));
        if (line.length > 1) { lines.push(line); sources.add("OpenStreetMap"); }
      });
      return { components: routeBacktraceMergeLinesV17325(lines), source: Array.from(sources).join(" + ") };
    }

    function routeBacktraceBestComponentV17325(components, reference, previousLine) {
      let best = null;
      for (const line of components || []) {
        let distance;
        if (previousLine) distance = routeBacktraceClosestPairV17325(previousLine, line).distance;
        else distance = routeBacktraceClosestVertexV17325(reference, line).distance;
        if (!best || distance < best.distance) best = { line, distance };
      }
      return best;
    }

    function routeBacktraceSliceV17325(line, startPoint, endPoint) {
      if (!line?.length) return [];
      const start = startPoint ? routeBacktraceClosestVertexV17325(startPoint, line) : null;
      const end = endPoint ? routeBacktraceClosestVertexV17325(endPoint, line) : null;
      if (start?.index >= 0 && end?.index >= 0 && start.index !== end.index) {
        const low = Math.min(start.index, end.index), high = Math.max(start.index, end.index);
        return line.slice(low, high + 1);
      }
      const anchor = start?.index >= 0 ? start.index : (end?.index >= 0 ? end.index : Math.floor(line.length / 2));
      let low = anchor, high = anchor, accumulated = 0;
      while (low > 0 && accumulated < 0.75) { accumulated += routeBacktraceMilesV17325(line[low], line[low - 1]); low -= 1; }
      accumulated = 0;
      while (high < line.length - 1 && accumulated < 0.75) { accumulated += routeBacktraceMilesV17325(line[high], line[high + 1]); high += 1; }
      return line.slice(low, high + 1);
    }

    function routeBacktraceBuildTraceV17325(tokens, roads, osmElements, coords) {
      const roadTokens = tokens.filter(token => token.kind === "road");
      const selected = [];
      let previous = null;
      for (const token of roadTokens) {
        const candidate = routeBacktraceCandidateComponentsV17325(token, roads, osmElements);
        const best = routeBacktraceBestComponentV17325(candidate.components, [coords.lng, coords.lat], previous?.line || null);
        const threshold = previous ? 0.45 : 2.5;
        if (!best || best.distance > threshold) {
          selected.push({ token, matched: false, source: candidate.source || "" });
          continue;
        }
        const row = { token, matched: true, line: best.line, distanceToPrior: best.distance, source: candidate.source || "Map geometry" };
        selected.push(row);
        previous = row;
      }

      const matched = selected.filter(row => row.matched);
      for (let index = 0; index < matched.length - 1; index += 1) {
        const left = matched[index], right = matched[index + 1];
        const pair = routeBacktraceClosestPairV17325(left.line, right.line);
        const leftPos = selected.indexOf(left), rightPos = selected.indexOf(right);
        const consecutive = rightPos === leftPos + 1;
        if (consecutive && pair.distance <= 0.45) {
          left.nextPoint = pair.left;
          right.previousPoint = pair.right;
          left.connectedNext = true;
          right.connectedPrevious = true;
        }
      }
      if (matched.length) matched[0].padPoint = routeBacktraceClosestVertexV17325([coords.lng, coords.lat], matched[0].line).point;
      matched.forEach((row, index) => {
        const start = row.previousPoint || (index === 0 ? row.padPoint : null);
        const end = row.nextPoint || null;
        row.traceLine = routeBacktraceSliceV17325(row.line, start, end);
        row.traceMiles = row.traceLine.length > 1 ? routeBacktraceLineLengthV17325(row.traceLine) : null;
      });
      return selected;
    }

    function routeBacktraceMercatorYV17325(lat) {
      const clamped = Math.max(-85, Math.min(85, Number(lat)));
      return Math.log(Math.tan(Math.PI / 4 + clamped * Math.PI / 360));
    }

    function routeBacktraceLatFromMercatorYV17325(y) {
      return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
    }

    function routeBacktraceBoundsV17325(points, aspect) {
      const valid = (points || []).filter(point => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite));
      if (!valid.length) return null;
      let west = Math.min(...valid.map(point => point[0])), east = Math.max(...valid.map(point => point[0]));
      let southY = Math.min(...valid.map(point => routeBacktraceMercatorYV17325(point[1]))), northY = Math.max(...valid.map(point => routeBacktraceMercatorYV17325(point[1])));
      let width = Math.max((east - west) * Math.PI / 180, 0.004 * Math.PI / 180);
      let height = Math.max(northY - southY, 0.004 * Math.PI / 180);
      const ratio = Math.max(0.55, Number(aspect) || 1.6);
      if (width / height < ratio) width = height * ratio; else height = width / ratio;
      width *= 1.18; height *= 1.18;
      const centerX = ((west + east) / 2) * Math.PI / 180, centerY = (southY + northY) / 2;
      west = (centerX - width / 2) * 180 / Math.PI; east = (centerX + width / 2) * 180 / Math.PI;
      southY = centerY - height / 2; northY = centerY + height / 2;
      return { west, east, south: routeBacktraceLatFromMercatorYV17325(southY), north: routeBacktraceLatFromMercatorYV17325(northY), southY, northY };
    }

    function routeBacktraceOsmUrlForBoundsV17325(coords, bounds) {
      const bbox = [bounds.west, bounds.south, bounds.east, bounds.north].join(",");
      return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${coords.lat},${coords.lng}`)}`;
    }

    function routeBacktraceProjectV17325(point, bounds) {
      const width = (bounds.east - bounds.west) * Math.PI / 180;
      const x = ((Number(point[0]) * Math.PI / 180) - bounds.west * Math.PI / 180) / width * 1000;
      const yValue = routeBacktraceMercatorYV17325(point[1]);
      const y = (bounds.northY - yValue) / (bounds.northY - bounds.southY) * 625;
      return [x, y];
    }

    function routeBacktracePathV17325(line, bounds) {
      return (line || []).map((point, index) => {
        const projected = routeBacktraceProjectV17325(point, bounds);
        return `${index ? "L" : "M"}${projected[0].toFixed(1)},${projected[1].toFixed(1)}`;
      }).join(" ");
    }

    function routeBacktraceStatusMarkupV17325(tokens, selected) {
      const byLabel = new Map(selected.map(row => [row.token.label, row]));
      return tokens.map(token => {
        if (token.kind === "access") return `<span class="route-backtrace-chip gap"><b>${esc(token.label)}</b><small>access / unnamed gap</small></span>`;
        if (token.kind === "exit") return `<span class="route-backtrace-chip anchor"><b>${esc(token.label)}</b><small>saved highway anchor</small></span>`;
        if (token.kind !== "road") return `<span class="route-backtrace-chip gap"><b>${esc(token.label)}</b><small>context only</small></span>`;
        const match = byLabel.get(token.label);
        if (!match?.matched) return `<span class="route-backtrace-chip missing"><b>${esc(token.label)}</b><small>not matched — not drawn</small></span>`;
        return `<span class="route-backtrace-chip matched"><b>${esc(token.label)}</b><small>${esc(match.source || "map geometry")}${Number.isFinite(match.traceMiles) ? ` • ≈${match.traceMiles.toFixed(2)} mi road trace` : ""}</small></span>`;
      }).join('<span class="route-backtrace-arrow" aria-hidden="true">←</span>');
    }

    function routeBacktraceClearV17325() {
      const pad = routeMapperSelectedPadV17324;
      const coords = routeMapperPadCoordinateV17324(pad);
      const frame = document.querySelector(".route-mapper-map-frame");
      const iframe = frame?.querySelector("iframe");
      frame?.querySelector(".route-backtrace-overlay-v17325")?.remove();
      if (iframe && coords) { iframe.src = routeMapperOsmUrlV17324(coords); iframe.style.pointerEvents = ""; }
      document.getElementById("routeBacktracePanelV17325")?.remove();
      const clear = document.getElementById("routeBacktraceClearV17325"); if (clear) clear.hidden = true;
    }

    function routeBacktraceRenderV17325(result) {
      const pad = routeMapperSelectedPadV17324;
      const coords = routeMapperPadCoordinateV17324(pad);
      const frame = document.querySelector(".route-mapper-map-frame");
      const iframe = frame?.querySelector("iframe");
      if (!frame || !iframe || !coords) return;
      frame.querySelector(".route-backtrace-overlay-v17325")?.remove();
      document.getElementById("routeBacktracePanelV17325")?.remove();
      const traceLines = result.selected.filter(row => row.matched && row.traceLine?.length > 1);
      const points = [[coords.lng, coords.lat], ...traceLines.flatMap(row => row.traceLine)];
      const aspect = Math.max(0.6, frame.clientWidth / Math.max(frame.clientHeight, 1));
      const bounds = routeBacktraceBoundsV17325(points, aspect);
      if (!bounds) return;
      iframe.src = routeBacktraceOsmUrlForBoundsV17325(coords, bounds);
      iframe.style.pointerEvents = "none";
      const padPoint = routeBacktraceProjectV17325([coords.lng, coords.lat], bounds);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "route-backtrace-overlay-v17325");
      svg.setAttribute("viewBox", "0 0 1000 625");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.innerHTML = `${traceLines.map((row, index) => `<path class="route-backtrace-halo-v17325" d="${routeBacktracePathV17325(row.traceLine, bounds)}"></path><path class="route-backtrace-road-v17325" data-road-index="${index}" d="${routeBacktracePathV17325(row.traceLine, bounds)}"></path>`).join("")}<circle class="route-backtrace-pad-ring-v17325" cx="${padPoint[0].toFixed(1)}" cy="${padPoint[1].toFixed(1)}" r="13"></circle><circle class="route-backtrace-pad-v17325" cx="${padPoint[0].toFixed(1)}" cy="${padPoint[1].toFixed(1)}" r="7"></circle>`;
      frame.appendChild(svg);
      const help = frame.nextElementSibling;
      const panel = document.createElement("section");
      panel.id = "routeBacktracePanelV17325";
      panel.className = "route-backtrace-panel-v17325";
      panel.innerHTML = `<div class="route-backtrace-title-v17325"><strong>Backward trace from pad</strong><span>${traceLines.length} road${traceLines.length === 1 ? "" : "s"} highlighted</span></div><div class="route-backtrace-chain-v17325"><span class="route-backtrace-chip pad"><b>PAD</b><small>${esc(coords.source)}</small></span><span class="route-backtrace-arrow" aria-hidden="true">←</span>${routeBacktraceStatusMarkupV17325(result.tokens, result.selected)}</div><p>Trace follows the saved primary route in reverse. Only matched road geometry is highlighted; missing access roads or uncertain connections stay blank instead of being guessed.</p>`;
      (help || frame).insertAdjacentElement("afterend", panel);
      const clear = document.getElementById("routeBacktraceClearV17325"); if (clear) clear.hidden = false;
    }

    async function routeBacktraceRunV17325() {
      const button = document.getElementById("routeBacktraceRunV17325");
      const pad = routeMapperSelectedPadV17324;
      const coords = routeMapperPadCoordinateV17324(pad);
      if (!pad || !coords) { showToast("This pad needs a verified or saved GPS point first"); return; }
      const tokens = routeBacktraceRoadTokensV17325(pad);
      const roadTokens = tokens.filter(token => token.kind === "road");
      if (!roadTokens.length) { showToast("No usable primary road sequence is saved for this pad"); return; }
      const cacheKey = `${routeMapperLegacyIdV17324(pad)}|${roadTokens.map(token => token.label).join("|")}`;
      button.disabled = true; button.textContent = "Tracing roads…";
      try {
        let result = routeBacktraceMemoryV17325.get(cacheKey);
        if (!result) {
          let roads = Array.isArray(roadManagerRows) && roadManagerRows.length ? roadManagerRows : [];
          if (!roads.length) roads = await fetchRoads("", 500);
          let osmElements = [];
          try { osmElements = await routeBacktraceOverpassV17325(roadTokens, coords); }
          catch (error) { console.warn("OSM backward trace fallback unavailable", error); }
          const selected = routeBacktraceBuildTraceV17325(tokens, roads, osmElements, coords);
          result = { tokens, selected };
          routeBacktraceMemoryV17325.set(cacheKey, result);
        }
        routeBacktraceRenderV17325(result);
        const matched = result.selected.filter(row => row.matched).length;
        showToast(matched ? `Highlighted ${matched} saved-route road${matched === 1 ? "" : "s"} backward from the pad` : "No saved-route road geometry could be matched");
      } catch (error) {
        showToast(error.message || "Could not trace this route");
      } finally {
        button.disabled = false; button.textContent = "Highlight route backward";
      }
    }

    function routeBacktraceMountV17325() {
      const pad = routeMapperSelectedPadV17324;
      const frame = document.querySelector(".route-mapper-map-frame");
      const actions = document.querySelector(".route-mapper-map-actions");
      if (!pad || !frame || !actions || document.getElementById("routeBacktraceRunV17325")) return;
      const run = document.createElement("button");
      run.type = "button";
      run.className = "btn secondary route-backtrace-run-v17325";
      run.id = "routeBacktraceRunV17325";
      run.textContent = "Highlight route backward";
      run.onclick = routeBacktraceRunV17325;
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "btn ghost";
      clear.id = "routeBacktraceClearV17325";
      clear.textContent = "Clear highlight";
      clear.hidden = true;
      clear.onclick = routeBacktraceClearV17325;
      actions.append(run, clear);
      frame.insertAdjacentHTML("beforebegin", `<div class="route-backtrace-intro-v17325"><strong>Pad-first route trace</strong><span>Uses the saved primary directions backward from the pad and highlights only map-matched roads.</span></div>`);
    }

    const routeMapperRenderWorkspaceBeforeBacktraceV17325 = routeMapperRenderWorkspaceV17324;
    routeMapperRenderWorkspaceV17324 = function routeMapperRenderWorkspaceBacktraceV17325() {
      routeMapperRenderWorkspaceBeforeBacktraceV17325();
      routeBacktraceMountV17325();
    };

    window.routeBacktraceRunV17325 = routeBacktraceRunV17325;
    window.routeBacktraceRoadTokensV17325 = routeBacktraceRoadTokensV17325;
    window.routeBacktraceBuildTraceV17325 = routeBacktraceBuildTraceV17325;
