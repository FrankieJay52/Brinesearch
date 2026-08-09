/* BrineSearch V17.3.19 — conservative saved-direction fallback cleanup.
   Reviewed live Supabase directions_clear remains authoritative. This only repairs
   older packaged rewrites by rebuilding explicit numbered saved directions from
   their original saved source text. It never invents a road, turn, mileage, or
   destination side. If the saved text cannot be parsed confidently, the original
   packaged fallback is returned unchanged. */
(function () {
  if (window.__brineDirectionSourceCleanupInstalled) return;
  window.__brineDirectionSourceCleanupInstalled = true;

  const nativeFetch = window.fetch.bind(window);

  const ESTHER_WEEKS_CLEAR_V17319 = `Road sequence reference:\nI-70 → Exit 5 → US-40 → Kruger St → Lounez Ave → CR-23 / Stone Church Rd → Oklahoma Rd → Pad\n\nStep-by-step directions:\n1. Take Exit 5 to US-40.\n2. Turn left on Kruger St.\n3. Turn left on Lounez Ave.\n4. Veer right on CR-23 / Stone Church Rd. Continue approximately 6 miles.\n5. Turn left on Oklahoma Rd. The saved directions describe Oklahoma Rd as gravel/dirt and single lane; the pad is on the left.`;

  function requestUrl(input) {
    try {
      if (typeof input === "string") return new URL(input, window.location.href);
      if (input && typeof input.url === "string") return new URL(input.url, window.location.href);
    } catch {}
    return null;
  }

  function isDirectionDataRequest(url) {
    if (!url) return false;
    return /\/data\/directions\/[^/]+\.json$/i.test(url.pathname)
      && !/\/data\/directions\/index\.json$/i.test(url.pathname);
  }

  function cleanPhrase(value) {
    let text = String(value || "")
      .replace(/\r\n?/g, " ")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    text = text
      .replace(/([A-Za-z0-9)])\.(?=[A-Z][A-Za-z-]*\b)/g, "$1 ")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
      .trim();
    return text;
  }

  function cleanHeading(value) {
    let heading = cleanPhrase(value).replace(/[:;,-]+$/g, "").trim();
    const lower = heading.toLowerCase();
    const fromIndex = lower.lastIndexOf("from ");
    if (fromIndex >= 0) heading = heading.slice(fromIndex).trim();
    if (!/^from\b/i.test(heading)) return "";
    heading = heading.replace(/\(([^)]*)\)/g, (whole, inner) => `(${String(inner).replace(/,/g, "")})`);
    return heading;
  }

  function lowerFirst(value) {
    const text = String(value || "");
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  }

  function extractReference(rewrite) {
    const text = String(rewrite || "");
    const match = text.match(/Road sequence reference\s*:\s*([\s\S]*?)(?=\n\s*\n\s*Step-by-step directions\s*:|Step-by-step directions\s*:)/i);
    return match ? String(match[1] || "").replace(/\s*\n\s*/g, " ").trim() : "";
  }

  function buildNumberedRewrite(source, existingRewrite) {
    const raw = String(source || "").replace(/\r\n?/g, "\n").trim();
    if (!raw) return "";
    const primary = raw.split(/\s*-{8,}\s*/)[0].trim();
    if (!primary) return "";

    const marker = /(^|[.!?:;]\s*|\s)(\d{1,2})[.)]\s*(?=[A-Za-z*])/g;
    const matches = [];
    let match;
    while ((match = marker.exec(primary))) {
      matches.push({
        start: match.index,
        contentStart: match.index + match[0].length,
        number: Number(match[2])
      });
    }
    if (matches.length < 2 || matches[0].number !== 1) return "";

    const steps = [];
    for (let i = 0; i < matches.length; i += 1) {
      const current = matches[i];
      const next = matches[i + 1];
      const phrase = cleanPhrase(primary.slice(current.contentStart, next ? next.start : primary.length));
      if (phrase) steps.push(phrase);
    }
    if (steps.length < 2) return "";

    const heading = cleanHeading(primary.slice(0, matches[0].start));
    if (heading && steps[0] && !/^from\b/i.test(steps[0])) {
      steps[0] = `${heading}, ${lowerFirst(steps[0])}`;
    }

    const reference = extractReference(existingRewrite);
    const lines = steps.map((step, index) => `${index + 1}. ${step.replace(/[.\s]+$/g, "").trim()}.`);
    return `${reference ? `Road sequence reference:\n${reference}\n\n` : ""}Step-by-step directions:\n${lines.join("\n")}`;
  }

  function reviewedKnownRewrite(key, value) {
    if (key !== "expand--esther-weeks") return "";
    const source = String(value?.s || "");
    if (!/Kruger St/i.test(source) || !/stone church/i.test(source) || !/Oklahoma/i.test(source) || !/roughly\s+6\s+miles/i.test(source)) return "";
    return ESTHER_WEEKS_CLEAR_V17319;
  }

  window.fetch = async function brineDirectionSourceFetch(input, init) {
    const url = requestUrl(input);
    const response = await nativeFetch(input, init);
    if (!response.ok || !isDirectionDataRequest(url)) return response;

    try {
      const payload = await response.clone().json();
      if (!payload || Array.isArray(payload) || typeof payload !== "object") return response;

      let changed = 0;
      const repaired = {};
      for (const [key, value] of Object.entries(payload)) {
        if (!value || typeof value !== "object") {
          repaired[key] = value;
          continue;
        }
        const known = reviewedKnownRewrite(key, value);
        const rebuilt = known || buildNumberedRewrite(value.s, value.r);
        if (rebuilt && rebuilt !== value.r) {
          repaired[key] = { ...value, r: rebuilt };
          changed += 1;
        } else {
          repaired[key] = value;
        }
      }

      if (!changed) return response;
      window.__brineDirectionFallbackRepairs = (window.__brineDirectionFallbackRepairs || 0) + changed;

      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      headers.set("content-type", "application/json; charset=utf-8");
      return new Response(JSON.stringify(repaired), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      console.warn("Saved direction fallback cleanup skipped for one data file.", error);
      return response;
    }
  };
})();
