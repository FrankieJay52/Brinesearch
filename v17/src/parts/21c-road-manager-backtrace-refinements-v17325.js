    /* V17.3.25 refinements: always prefer the saved primary route evidence,
       match numbered/local dual-name roads, and measure road-to-road proximity
       against line segments instead of requiring an intersection vertex. */

    function routeBacktraceTokenPartsV17325(value) {
      return String(value || "").split(/\s*\/\s*/).map(part => normalize(part)).filter(Boolean);
    }

    routeBacktracePrimaryTokensV17325 = function routeBacktracePrimarySavedTokensV17325(pad) {
      const sequence = normalize(pad?.Structured_Road_Sequence || "");
      let tokens = sequence ? sequence.split(/\s*(?:→|->)\s*/).map(value => normalize(value)).filter(Boolean) : [];
      if (!tokens.length && Array.isArray(routeMapperSegmentsV17324)) tokens = routeMapperSegmentsV17324.map(segment => normalize(segment?.roadName)).filter(Boolean);
      const alternative = tokens.findIndex(value => /^(?:OR|ALT(?:ERNATE)?(?:\s+ROUTE)?)$/i.test(value));
      if (alternative >= 0) tokens = tokens.slice(0, alternative);
      const clean = [];
      for (const token of tokens) {
        if (!token || /^(?:OR|PRIMARY ROUTE)$/i.test(token)) continue;
        const previous = clean[clean.length - 1];
        if (previous && routeBacktraceSimilarityV17325(previous, token) >= 0.9) continue;
        clean.push(token);
      }
      return clean;
    };

    routeBacktraceRoadManagerMatchesV17325 = function routeBacktraceRoadManagerDualMatchesV17325(token, roads) {
      const tokenParts = routeBacktraceTokenPartsV17325(token);
      return (roads || []).map(road => {
        const labels = routeBacktraceRoadLabelsV17325(road);
        let score = 0;
        tokenParts.forEach(part => labels.forEach(label => { score = Math.max(score, routeBacktraceSimilarityV17325(part, label)); }));
        labels.forEach(label => { score = Math.max(score, routeBacktraceSimilarityV17325(token, label)); });
        return { road, score };
      }).filter(item => item.score >= 0.78).sort((a, b) => b.score - a.score).slice(0, 6);
    };

    routeBacktraceOverpassPatternV17325 = function routeBacktraceOverpassDualPatternV17325(token) {
      const patternForPart = part => {
        const text = normalize(part);
        let match = text.match(/^I[- ]?(\d{1,3})$/i);
        if (match) return `(?:I[- ]?${match[1]}|Interstate ${match[1]})`;
        match = text.match(/^US[- ]?(\d{1,3})$/i);
        if (match) return `(?:US[- ]?${match[1]}|US ${match[1]}|U\\.?S\\.? ${match[1]})`;
        match = text.match(/^(?:OH|SR|State Route)[- ]?(\d{1,4})$/i);
        if (match) return `(?:OH[- ]?${match[1]}|SR[- ]?${match[1]}|State Route ${match[1]})`;
        match = text.match(/^(?:CR|County Road)[- ]?(\d{1,4}(?:\/\d+)?)$/i);
        if (match) return `(?:CR[- ]?${routeBacktraceRegexEscapeV17325(match[1])}|County Road ${routeBacktraceRegexEscapeV17325(match[1])})`;
        match = text.match(/^(?:TR|Township Road)[- ]?(\d{1,4}(?:\/\d+)?)$/i);
        if (match) return `(?:TR[- ]?${routeBacktraceRegexEscapeV17325(match[1])}|Township Road ${routeBacktraceRegexEscapeV17325(match[1])})`;
        const roadEnding = text.match(/^(.*?)(?:\s+(?:Rd|Road))$/i);
        if (roadEnding) return `${routeBacktraceRegexEscapeV17325(roadEnding[1].trim())}\\s+(?:Rd|Road)`;
        return routeBacktraceRegexEscapeV17325(text);
      };
      const patterns = routeBacktraceTokenPartsV17325(token).map(patternForPart).filter(Boolean);
      return `^(?:${patterns.join("|")})$`;
    };

    routeBacktraceOsmMatchScoreV17325 = function routeBacktraceOsmDualMatchScoreV17325(token, element) {
      const tags = element?.tags || {};
      const labels = [tags.name, tags.ref, tags.alt_name, tags.official_name].filter(Boolean);
      let score = 0;
      routeBacktraceTokenPartsV17325(token).forEach(part => labels.forEach(label => { score = Math.max(score, routeBacktraceSimilarityV17325(part, label)); }));
      labels.forEach(label => { score = Math.max(score, routeBacktraceSimilarityV17325(token, label)); });
      return score;
    };

    function routeBacktraceClosestOnSegmentV17325(point, a, b) {
      const latitude = ((Number(point?.[1]) || 0) + (Number(a?.[1]) || 0) + (Number(b?.[1]) || 0)) / 3;
      const scaleX = Math.max(0.2, Math.cos(latitude * Math.PI / 180));
      const px = Number(point?.[0]) * scaleX, py = Number(point?.[1]);
      const ax = Number(a?.[0]) * scaleX, ay = Number(a?.[1]);
      const bx = Number(b?.[0]) * scaleX, by = Number(b?.[1]);
      const dx = bx - ax, dy = by - ay, denominator = dx * dx + dy * dy;
      const t = denominator ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator)) : 0;
      const projected = [Number(a?.[0]) + (Number(b?.[0]) - Number(a?.[0])) * t, Number(a?.[1]) + (Number(b?.[1]) - Number(a?.[1])) * t];
      return { point: projected, distance: routeBacktraceMilesV17325(point, projected), t };
    }

    routeBacktraceClosestVertexV17325 = function routeBacktraceClosestPointOnLineV17325(point, line) {
      let best = { distance: Infinity, index: -1, point: null };
      if (!Array.isArray(line) || !line.length) return best;
      if (line.length === 1) return { distance: routeBacktraceMilesV17325(point, line[0]), index: 0, point: line[0] };
      for (let index = 0; index < line.length - 1; index += 1) {
        const candidate = routeBacktraceClosestOnSegmentV17325(point, line[index], line[index + 1]);
        if (candidate.distance < best.distance) best = { distance: candidate.distance, index: candidate.t > 0.5 ? index + 1 : index, point: candidate.point };
      }
      return best;
    };

    routeBacktraceClosestPairV17325 = function routeBacktraceClosestRoadPairV17325(left, right) {
      let best = { distance: Infinity, left: null, right: null };
      const inspect = (source, target, reverse = false) => {
        const step = Math.max(1, Math.floor((source || []).length / 400));
        for (let index = 0; index < (source || []).length; index += step) {
          const candidate = routeBacktraceClosestVertexV17325(source[index], target);
          if (candidate.distance < best.distance) {
            best = reverse
              ? { distance: candidate.distance, left: candidate.point, right: source[index] }
              : { distance: candidate.distance, left: source[index], right: candidate.point };
          }
        }
        if (source?.length && (source.length - 1) % step) {
          const point = source[source.length - 1];
          const candidate = routeBacktraceClosestVertexV17325(point, target);
          if (candidate.distance < best.distance) best = reverse ? { distance: candidate.distance, left: candidate.point, right: point } : { distance: candidate.distance, left: point, right: candidate.point };
        }
      };
      inspect(left, right, false);
      inspect(right, left, true);
      return best;
    };

    window.routeBacktraceTokenPartsV17325 = routeBacktraceTokenPartsV17325;
