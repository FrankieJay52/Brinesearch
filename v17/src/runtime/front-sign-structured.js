/* BrineSearch V17.2 — structured front-sign OCR and compatibility helpers */
(function (root) {
  'use strict';

  const VERSION = '17.2';
  const SETTINGS_ID = 'brinesearch-road-manager-settings-launch';
  const PHOTO_CONTROLS_ID = 'brinesearch-sign-photo-choices';
  const STRUCTURED_NOTE_ID = 'brinesearch-sign-structured-note';
  const TESSERACT_SCRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const TESSERACT_WORKER = 'https://cdn.jsdelivr.net/npm/tesseract.js@v5.0.4/dist/worker.min.js';
  const TESSERACT_CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.0.0';
  const TESSERACT_LANG = 'https://tessdata.projectnaptha.com/4.0.0';
  let scheduled = false;

  function visible(element) {
    if (!element || !element.isConnected) return false;
    const style = root.getComputedStyle ? root.getComputedStyle(element) : null;
    return !(style && (style.display === 'none' || style.visibility === 'hidden'));
  }

  function loadScript(id, file, ready) {
    if (ready()) return Promise.resolve();
    const current = document.getElementById(id);
    if (current) {
      return new Promise((resolve) => {
        const finish = () => resolve();
        current.addEventListener('load', finish, { once: true });
        current.addEventListener('error', finish, { once: true });
        setTimeout(finish, 1800);
      });
    }
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.id = id;
      script.src = './' + file + '?v=' + VERSION;
      script.defer = true;
      script.onload = resolve;
      script.onerror = resolve;
      (document.head || document.documentElement).appendChild(script);
    });
  }

  async function ensureFeatures() {
    await loadScript('brinesearch-road-database', 'road-database.js', () => Boolean(root.BrineSearchRoadDB));
    await loadScript('brinesearch-road-manager', 'road-manager.js', () => Boolean(root.BrineSearchRoadManager));
    await loadScript('brinesearch-front-sign-scanner', 'front-sign-scanner.js', () => Boolean(root.BrinesearchFrontSignScanner));
    try { root.BrineSearchRoadDB?.init?.(); } catch (error) { console.error('[BrineSearch] Road DB startup failed', error); }
    try { root.BrineSearchRoadManager?.init?.(); } catch (error) { console.error('[BrineSearch] Road Manager startup failed', error); }
    try { root.BrinesearchFrontSignScanner?.mount?.(); } catch (error) { console.error('[BrineSearch] Scanner startup failed', error); }
  }

  function installStyles() {
    if (document.getElementById('brinesearch-v17-2-styles')) return;
    const style = document.createElement('style');
    style.id = 'brinesearch-v17-2-styles';
    style.textContent = `
      #${SETTINGS_ID}{margin:12px 0 16px;padding:0;border:0;background:transparent;width:100%}
      #${SETTINGS_ID} button{display:grid;grid-template-columns:48px minmax(0,1fr) 28px;gap:12px;align-items:center;width:100%;min-height:72px;padding:12px 14px;border:1px solid rgba(94,207,195,.34);border-radius:18px;background:linear-gradient(135deg,rgba(29,145,135,.16),rgba(49,91,165,.12));color:inherit;text-align:left;font:inherit;cursor:pointer}
      #${SETTINGS_ID} .bs-rm-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:rgba(77,205,193,.14)}
      #${SETTINGS_ID} img{width:25px;height:25px} #${SETTINGS_ID} strong{display:block;font-size:1rem;margin-bottom:3px}
      #${SETTINGS_ID} small{display:block;color:var(--muted,#9db0c4);font-size:.79rem;line-height:1.35} #${SETTINGS_ID} .bs-rm-arrow{font-size:1.7rem;opacity:.7;text-align:right}
      #${PHOTO_CONTROLS_ID}{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      #${PHOTO_CONTROLS_ID} button{min-height:58px;border:1px solid rgba(75,213,199,.4);border-radius:15px;background:rgba(75,213,199,.11);color:inherit;font:inherit;font-weight:900;padding:10px;cursor:pointer}
      #${PHOTO_CONTROLS_ID} button:last-child{border-color:rgba(109,148,255,.42);background:rgba(109,148,255,.10)}
      #${STRUCTURED_NOTE_ID}{padding:12px 14px;border:1px solid rgba(89,210,198,.32);border-radius:15px;background:rgba(62,185,173,.08);line-height:1.4}
      #${STRUCTURED_NOTE_ID} strong{display:block;margin-bottom:4px}
      #brinesearchFrontSignModal .bss-results>h3{margin-top:0}
      #brinesearchFrontSignModal .bss-warning{font-size:.92rem}
      #brinesearchFrontSignModal [data-bss-v172-raw]{display:none!important}
      @media(max-width:480px){#${PHOTO_CONTROLS_ID}{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function isSettingsView() {
    const hash = root.location?.hash || '';
    if (/^#\/?settings(?:\/|$)/i.test(hash)) return true;
    return Array.from(document.querySelectorAll('h1,h2,[role="heading"]')).some((el) => visible(el) && /^settings$/i.test((el.textContent || '').trim()));
  }

  function settingsHost() {
    for (const selector of ['.settings-page .settings-section','.settings-page','.settings-content','[data-page="settings"]','main']) {
      const el = Array.from(document.querySelectorAll(selector)).find(visible);
      if (el) return el;
    }
    return null;
  }

  function mountRoadManagerSetting() {
    if (!isSettingsView()) return;
    const old = document.getElementById(SETTINGS_ID);
    if (old && visible(old)) return;
    old?.remove();
    const host = settingsHost();
    if (!host) return;
    const section = document.createElement('section');
    section.id = SETTINGS_ID;
    section.innerHTML = '<button type="button"><span class="bs-rm-icon"><img src="/icons/fm-road-inactive.svg?v=17.2" alt=""></span><span><strong>Road Manager</strong><small>Search, verify, edit, merge, and connect roads to pads</small></span><span class="bs-rm-arrow">›</span></button>';
    section.querySelector('button').addEventListener('click', async () => {
      await ensureFeatures();
      root.BrineSearchRoadManager?.open ? root.BrineSearchRoadManager.open() : (root.location.hash = '#/roads');
    });
    host.matches('.settings-section') ? host.parentNode.insertBefore(section, host) : host.prepend(section);
  }

  function patchScannerUi(modal) {
    if (!modal) return;
    const version = modal.querySelector('.bss-head .bss-confidence');
    if (version) version.textContent = 'V17.2';
    const intro = modal.querySelector('.bss-head p');
    if (intro) intro.textContent = 'Take a clear photo. BrineSearch will pull only the pad database fields from the sign.';
    const readButton = modal.querySelector('#bssReadButton');
    if (readButton) readButton.textContent = 'Read Database Fields';

    const rawText = modal.querySelector('#bssRawText');
    if (rawText) {
      const rawBlock = rawText.closest('div');
      if (rawBlock) rawBlock.setAttribute('data-bss-v172-raw', 'true');
    }
    const details = modal.querySelector('#bssDetails');
    if (details) details.style.display = 'none';
    const append = modal.querySelector('#bssAppendNotes');
    if (append?.closest('label')) append.closest('label').style.display = 'none';

    const results = modal.querySelector('#bssResults');
    if (results && !modal.querySelector('#' + STRUCTURED_NOTE_ID)) {
      const note = document.createElement('div');
      note.id = STRUCTURED_NOTE_ID;
      note.innerHTML = '<strong>Only database fields will be shown.</strong><span>Well names, API numbers, address/city/state/ZIP, county, and township. Review them against the sign before saving.</span>';
      results.insertBefore(note, results.querySelector('.bss-warning') || results.firstChild);
    }
    const warning = results?.querySelector('.bss-warning');
    if (warning) warning.textContent = 'Verify every well name, API number, and address before applying the update.';
  }

  function mountPhotoChoices() {
    const modal = document.getElementById('brinesearchFrontSignModal');
    if (!modal) return;
    patchScannerUi(modal);
    if (modal.querySelector('#' + PHOTO_CONTROLS_ID)) return;
    const input = modal.querySelector('#bssPhotoInput');
    const originalLabel = input?.closest('label');
    if (!input || !originalLabel) return;
    originalLabel.style.display = 'none';
    const controls = document.createElement('div');
    controls.id = PHOTO_CONTROLS_ID;
    controls.innerHTML = '<button type="button" data-photo-action="camera">📷 Take Photo</button><button type="button" data-photo-action="library">🖼️ Choose Photo</button>';
    originalLabel.insertAdjacentElement('afterend', controls);
    controls.querySelector('[data-photo-action="camera"]').onclick = () => { input.setAttribute('capture','environment'); input.value=''; input.click(); };
    controls.querySelector('[data-photo-action="library"]').onclick = () => { input.removeAttribute('capture'); input.value=''; input.click(); };
  }

  function repairIcons(scope) {
    const rootNode = scope?.querySelectorAll ? scope : document;
    rootNode.querySelectorAll('.fm-icon').forEach((icon) => {
      const style = getComputedStyle(icon);
      const raw = style.getPropertyValue('--fm-icon').trim();
      const match = raw.match(/url\(["']?([^"')]+)["']?\)/i);
      if (!match || !/\/icons\//i.test(match[1])) return;
      const url = new URL(match[1], document.baseURI);
      url.searchParams.set('v', VERSION);
      icon.style.setProperty('--fm-icon', `url("${url.pathname}${url.search}")`);
    });
  }

  function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((s) => s.src === src);
      if (existing) {
        if (root.Tesseract) return resolve();
        existing.addEventListener('load', resolve, { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function imageReady(image) {
    if (image.complete && image.naturalWidth) return;
    await new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once:true });
      image.addEventListener('error', reject, { once:true });
    });
  }

  function analysisCanvas(image, maxWidth = 420) {
    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function findSignBounds(image) {
    const canvas = analysisCanvas(image);
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rowHits = new Uint32Array(canvas.height);
    const colHits = new Uint32Array(canvas.width);
    let totalGray = 0;
    const grays = new Uint8Array(canvas.width * canvas.height);

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const i = (y * canvas.width + x) * 4;
        const gray = Math.round(data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114);
        grays[y * canvas.width + x] = gray;
        totalGray += gray;
      }
    }
    const mean = totalGray / grays.length;
    const threshold = Math.max(62, Math.min(170, mean * 1.2));
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (grays[y * canvas.width + x] < threshold) continue;
        rowHits[y] += 1;
        colHits[x] += 1;
      }
    }

    const rowNeed = Math.max(8, Math.floor(canvas.width * .24));
    const colNeed = Math.max(8, Math.floor(canvas.height * .23));
    let top = 0, bottom = canvas.height - 1, left = 0, right = canvas.width - 1;
    const rows = Array.from(rowHits, (n, i) => n >= rowNeed ? i : -1).filter(i => i >= 0);
    const cols = Array.from(colHits, (n, i) => n >= colNeed ? i : -1).filter(i => i >= 0);
    if (rows.length > canvas.height * .12 && cols.length > canvas.width * .12) {
      top = rows[0]; bottom = rows[rows.length - 1];
      left = cols[0]; right = cols[cols.length - 1];
    } else {
      top = Math.floor(canvas.height * .04);
      bottom = Math.ceil(canvas.height * .94);
      left = Math.floor(canvas.width * .04);
      right = Math.ceil(canvas.width * .96);
    }

    const sx = image.naturalWidth / canvas.width;
    const sy = image.naturalHeight / canvas.height;
    const padX = Math.max(3, Math.round((right - left) * .02));
    const padY = Math.max(3, Math.round((bottom - top) * .02));
    left = Math.max(0, left + padX);
    right = Math.min(canvas.width - 1, right - padX);
    top = Math.max(0, top + padY);
    bottom = Math.min(canvas.height - 1, bottom - padY);

    return {
      x: Math.round(left * sx),
      y: Math.round(top * sy),
      width: Math.max(1, Math.round((right - left + 1) * sx)),
      height: Math.max(1, Math.round((bottom - top + 1) * sy))
    };
  }

  function panelRects(bounds) {
    const ratio = bounds.width / Math.max(1, bounds.height);
    const count = ratio >= 1.62 ? 3 : ratio >= 1.05 ? 2 : 1;
    const overlap = Math.round(bounds.width * .012);
    const width = bounds.width / count;
    const rects = [];
    for (let i = 0; i < count; i += 1) {
      const x = Math.max(bounds.x, Math.round(bounds.x + i * width - (i ? overlap : 0)));
      const right = Math.min(bounds.x + bounds.width, Math.round(bounds.x + (i + 1) * width + (i < count - 1 ? overlap : 0)));
      rects.push({ x, y: bounds.y, width: right - x, height: bounds.height });
    }
    return rects;
  }

  function percentile(hist, total, fraction) {
    const target = total * fraction;
    let count = 0;
    for (let i = 0; i < hist.length; i += 1) {
      count += hist[i];
      if (count >= target) return i;
    }
    return 255;
  }

  function cropBand(image, rect, yStart, yEnd, options = {}) {
    const y = Math.round(rect.y + rect.height * yStart);
    const h = Math.max(1, Math.round(rect.height * (yEnd - yStart)));
    const targetWidth = options.targetWidth || 1900;
    const scale = Math.min(8, Math.max(2, targetWidth / Math.max(1, rect.width)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, rect.x, y, rect.width, h, 0, 0, canvas.width, canvas.height);

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hist = new Uint32Array(256);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = Math.round(pixels.data[i] * .299 + pixels.data[i+1] * .587 + pixels.data[i+2] * .114);
      hist[gray] += 1;
    }
    const total = canvas.width * canvas.height;
    const low = percentile(hist, total, .06);
    const high = Math.max(low + 35, percentile(hist, total, .94));
    const threshold = options.binary ? percentile(hist, total, .52) : null;

    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = Math.round(pixels.data[i] * .299 + pixels.data[i+1] * .587 + pixels.data[i+2] * .114);
      let value = Math.max(0, Math.min(255, Math.round((gray - low) * 255 / (high - low))));
      if (options.binary) value = gray >= threshold ? 255 : 0;
      pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = value;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  }

  function cleanText(value) {
    return String(value || '').replace(/\r/g, '\n').replace(/[|]/g, 'I').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  function unique(values) {
    const seen = new Set();
    return values.map(v => String(v || '').trim()).filter(v => {
      const key = v.toUpperCase();
      if (!v || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeWellCandidate(text) {
    const lines = cleanText(text).split('\n').map(line => line.trim()).filter(Boolean);
    let best = '';
    let bestScore = -99;
    for (const original of lines) {
      let line = original.replace(/^[^A-Z0-9]+/i, '').replace(/\bASCENT(?:\s+RESOURCES)?\b/ig, '').replace(/\b(?:API|EMERGENCY|DIAL|SECTION)\b.*$/i, '').replace(/\s{2,}/g, ' ').trim();
      if (line.length < 6 || line.length > 58) continue;
      if (!/[A-Z]/i.test(line) || !/\d/.test(line)) continue;
      let score = 0;
      if (/\b\d+[A-Z]?\b/.test(line)) score += 3;
      if (/\b(?:SHC|HR|H|V)\b/i.test(line)) score += 2;
      if (/[A-Z]{3,}/.test(line)) score += 1;
      if (/ROAD|COUNTY|TOWNSHIP|OH|WV|PA/i.test(line)) score -= 5;
      if (line.split(/\s+/).length >= 3) score += 2;
      if (score > bestScore) { bestScore = score; best = line; }
    }
    return best.toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function statePrefix(state) {
    return state === 'OH' ? '34' : state === 'PA' ? '37' : state === 'WV' ? '47' : '';
  }

  function detectState(text) {
    const value = cleanText(text).toUpperCase();
    if (/\b(?:OH|0H|OM|0M|OHIO)\b/.test(value)) return 'OH';
    if (/\b(?:WV|W\.?V\.?|WEST VIRGINIA)\b/.test(value)) return 'WV';
    if (/\b(?:PA|PENNSYLVANIA)\b/.test(value)) return 'PA';
    return '';
  }

  function formatApi14(digits, state) {
    if (digits.length !== 14) return '';
    if (state === 'OH' || digits.startsWith('34')) return `${digits.slice(0,2)}-${digits.slice(2,5)}-${digits.slice(5,6)}-${digits.slice(6,10)}-${digits.slice(10,12)}-${digits.slice(12,14)}`;
    return `${digits.slice(0,2)}-${digits.slice(2,5)}-${digits.slice(5,10)}-${digits.slice(10,12)}-${digits.slice(12,14)}`;
  }

  function apiCandidatesFromText(text, state) {
    const normalized = cleanText(text).toUpperCase().replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/Z/g, '2').replace(/S/g, '5').replace(/B/g, '8').replace(/[_,.:]/g, '-');
    const prefix = statePrefix(state);
    const chunks = normalized.match(/[0-9][0-9\s/-]{8,28}/g) || [];
    const found = [];
    for (const chunk of chunks) {
      let digits = chunk.replace(/\D/g, '');
      if (digits.length > 14) {
        const starts = [digits.indexOf('34'), digits.indexOf('37'), digits.indexOf('47')].filter(n => n >= 0).sort((a,b)=>a-b);
        digits = digits.slice(starts.length ? starts[0] : 0, (starts.length ? starts[0] : 0) + 14);
      }
      if (digits.length === 13 && prefix && digits.startsWith(prefix.slice(1))) digits = prefix[0] + digits;
      if (digits.length === 13 && state === 'OH' && digits.startsWith('4')) digits = '3' + digits;
      if (digits.length !== 14) continue;
      if (prefix && !digits.startsWith(prefix) && digits[1] === prefix[1]) digits = prefix[0] + digits.slice(1);
      if (!/^(34|37|47)/.test(digits)) continue;
      found.push(formatApi14(digits, state || (digits.startsWith('34') ? 'OH' : '')));
    }
    return unique(found);
  }

  function bestApi(values, state) {
    const candidates = unique(values.flatMap(value => apiCandidatesFromText(value, state)));
    if (!candidates.length) return '';
    const prefix = statePrefix(state);
    return candidates.sort((a,b) => Number(b.replace(/\D/g,'').startsWith(prefix)) - Number(a.replace(/\D/g,'').startsWith(prefix)))[0];
  }

  function locationLines(text) {
    return cleanText(text).split('\n').map(line => line.replace(/^[^A-Z0-9]+/i,'').trim()).filter(line => line.length >= 3);
  }

  function normalizeRoadWords(line) {
    return line.replace(/\bR[eo]ad\b/ig, 'Road').replace(/\bR[dn]\.?\b/ig, 'Rd').replace(/\bStr[eao]{1,2}t\b/ig, 'Street').replace(/\s{2,}/g, ' ').trim();
  }

  function extractLocation(texts) {
    const lines = texts.flatMap(locationLines);
    let state = detectState(lines.join('\n'));
    const streetCandidates = [], cityCandidates = [], countyCandidates = [], townshipCandidates = [];
    for (let line of lines) {
      line = normalizeRoadWords(line);
      if (/\b(?:COUNTY|COUNIY|COUNTV|COONTY|C0UNTY)\b/i.test(line)) {
        const cleaned = line.replace(/\b(?:COUNTY|COUNIY|COUNTV|COONTY|C0UNTY)\b.*$/i,'').replace(/[^A-Za-z .'-]/g,' ').replace(/\s+/g,' ').trim();
        if (cleaned.length >= 3) countyCandidates.push(cleaned);
      }
      if (/\b(?:TOWNSHIP|TOWNSH|TOWNSIIP|TOWNSIP|T0WNSHIP)\b/i.test(line)) {
        const cleaned = line.replace(/\b(?:TOWNSHIP|TOWNSH|TOWNSIIP|TOWNSIP|T0WNSHIP)\b.*$/i,'').replace(/[^A-Za-z .'-]/g,' ').replace(/\s+/g,' ').trim();
        if (cleaned.length >= 3) townshipCandidates.push(cleaned);
      }
      const city = line.match(/\b([A-Za-z][A-Za-z .'-]{1,28})[, ]+\s*(OH|0H|OM|0M|WV|PA)\s+([0-9OQDILSBZ]{5})\b/i);
      if (city) {
        const st = detectState(city[2]) || state;
        state = state || st;
        const zip = city[3].toUpperCase().replace(/[OQD]/g,'0').replace(/[IL]/g,'1').replace(/S/g,'5').replace(/B/g,'8').replace(/Z/g,'2');
        cityCandidates.push({ city: city[1].trim(), state: st, zip });
      }
      if (/\b(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Drive|Dr|Highway|Hwy|Route|Rte|Pike|Boulevard|Blvd|Way)\b/i.test(line)) {
        const street = line.match(/([0-9A-Z]{3,6}\s+[A-Za-z0-9 .'-]{3,60}\b(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Drive|Dr|Highway|Hwy|Route|Rte|Pike|Boulevard|Blvd|Way)\b)/i);
        if (street) streetCandidates.push(street[1].replace(/^([A-Z])(?=\d)/, m => ({A:'4',I:'1',O:'0',S:'5',B:'8'}[m] || m)));
      }
    }
    function bestText(values) {
      const cleaned = unique(values.map(v => v.replace(/\s+/g,' ').trim()));
      if (!cleaned.length) return '';
      return cleaned.sort((a,b) => ((b.match(/\d/g)||[]).length - (a.match(/\d/g)||[]).length) || b.length - a.length)[0];
    }
    const street = bestText(streetCandidates);
    const city = cityCandidates[0] || null;
    const county = bestText(countyCandidates);
    const township = bestText(townshipCandidates);
    const address = [street, city ? `${city.city}, ${city.state || state} ${city.zip}` : ''].filter(Boolean).join(', ');
    return { address, state: city?.state || state, county, township };
  }

  async function recognize(worker, canvas, psm, whitelist) {
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: String(psm),
      tessedit_char_whitelist: whitelist || "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -.,/#'"
    });
    const output = await worker.recognize(canvas);
    return cleanText(output.data?.text || '');
  }

  function syntheticText(fields) {
    const lines = [];
    String(fields.wellName || '').split('\n').filter(Boolean).forEach(v => lines.push('Well: ' + v));
    String(fields.api || '').split('\n').filter(Boolean).forEach(v => lines.push('API: ' + v));
    if (fields.address) lines.push('Address: ' + fields.address);
    if (fields.state) lines.push('State: ' + fields.state);
    if (fields.county) lines.push('County: ' + fields.county);
    if (fields.township) lines.push('Township: ' + fields.township);
    return lines.join('\n');
  }

  function setResultValue(modal, key, value) {
    if (!value) return;
    const control = modal.querySelector(`[data-bss-value="${key}"]`);
    if (control) control.value = value;
  }

  async function runStructuredOcr(modal) {
    const preview = modal.querySelector('#bssPreview');
    const rawText = modal.querySelector('#bssRawText');
    const analyze = modal.querySelector('#bssAnalyzeButton');
    const readButton = modal.querySelector('#bssReadButton');
    const progress = modal.querySelector('#bssProgress');
    const progressText = modal.querySelector('#bssProgressText');
    const progressBar = modal.querySelector('#bssProgressBar');
    const errorBox = modal.querySelector('#bssError');
    if (!preview?.src) throw new Error('Choose a photo first.');
    await imageReady(preview);
    patchScannerUi(modal);
    progress?.classList.add('show');
    errorBox?.classList.remove('show');
    readButton.disabled = true;
    progressText.textContent = 'Finding the sign…';
    progressBar.style.width = '4%';
    if (!root.Tesseract) await loadExternalScript(TESSERACT_SCRIPT);

    const bounds = findSignBounds(preview);
    const panels = panelRects(bounds);
    progressText.textContent = `Found ${panels.length} sign placard${panels.length === 1 ? '' : 's'}. Reading location fields…`;
    progressBar.style.width = '10%';

    const worker = await root.Tesseract.createWorker('eng', 1, {
      workerPath: TESSERACT_WORKER, langPath: TESSERACT_LANG, corePath: TESSERACT_CORE,
      logger(message) {
        if (message.status === 'recognizing text' && Number.isFinite(message.progress)) {
          const now = Math.round(Number(message.progress) * 100);
          progressText.textContent = progressText.textContent.replace(/\s·\s\d+%$/, '') + ` · ${now}%`;
        }
      }
    });

    const lowerTexts = [], wellTexts = [], apiReads = [];
    try {
      for (let i = 0; i < panels.length; i += 1) {
        progressText.textContent = `Placard ${i + 1}: reading address and location…`;
        progressBar.style.width = `${12 + Math.round((i / Math.max(1, panels.length)) * 25)}%`;
        lowerTexts.push(await recognize(worker, cropBand(preview, panels[i], .40, .82, { targetWidth: 2000 }), 6));
      }
      const preliminaryLocation = extractLocation(lowerTexts);
      const state = preliminaryLocation.state;
      for (let i = 0; i < panels.length; i += 1) {
        progressText.textContent = `Placard ${i + 1}: reading well name…`;
        progressBar.style.width = `${40 + Math.round((i / Math.max(1, panels.length)) * 22)}%`;
        wellTexts.push(await recognize(worker, cropBand(preview, panels[i], .18, .38, { targetWidth: 2100 }), 7, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -/#'));

        progressText.textContent = `Placard ${i + 1}: reading API number…`;
        progressBar.style.width = `${64 + Math.round((i / Math.max(1, panels.length)) * 28)}%`;
        const first = await recognize(worker, cropBand(preview, panels[i], .31, .48, { targetWidth: 2200 }), 7, '0123456789-./ ');
        const reads = [first];
        if (!apiCandidatesFromText(first, state).length) reads.push(await recognize(worker, cropBand(preview, panels[i], .31, .48, { targetWidth: 2200, binary:true }), 7, '0123456789-./ '));
        apiReads.push(reads);
      }

      const locationInfo = extractLocation(lowerTexts);
      const wells = unique(wellTexts.map(normalizeWellCandidate).filter(Boolean));
      const apis = unique(apiReads.map(reads => bestApi(reads, locationInfo.state)).filter(Boolean));
      const fields = {
        wellName: wells.join('\n'),
        api: apis.join('\n'),
        address: locationInfo.address,
        state: locationInfo.state,
        county: locationInfo.county,
        township: locationInfo.township
      };
      const found = Object.values(fields).filter(Boolean).length;
      rawText.value = syntheticText(fields);
      progressBar.style.width = '100%';
      progressText.textContent = found ? `Found ${apis.length} API${apis.length === 1 ? '' : 's'}, ${wells.length} well name${wells.length === 1 ? '' : 's'}, and location details. Review below.` : 'No database fields were clear enough to use. Try a closer, straighter photo.';
      analyze?.click();
      for (const [key, value] of Object.entries(fields)) setResultValue(modal, key, value);
      const warning = modal.querySelector('.bss-warning');
      if (!found && warning) warning.textContent = 'No database fields were clear enough to use. Try a closer photo with the placards filling most of the picture.';
      readButton.disabled = false;
    } finally {
      await worker.terminate();
    }
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('#bssReadButton');
    if (!button) return;
    const modal = button.closest('#brinesearchFrontSignModal');
    if (!modal || modal.dataset.v172Busy === 'true') return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    modal.dataset.v172Busy = 'true';
    try { await runStructuredOcr(modal); }
    catch (error) {
      const box = modal.querySelector('#bssError');
      if (box) { box.textContent = (error.message || 'The sign could not be read.') + ' Try a closer, straighter photo with the sign filling most of the frame.'; box.classList.add('show'); }
      button.disabled = false;
    } finally { delete modal.dataset.v172Busy; }
  }, true);

  function refresh() {
    scheduled = false;
    installStyles(); mountRoadManagerSetting(); mountPhotoChoices(); repairIcons(document);
    try { root.BrinesearchFrontSignScanner?.mount?.(); } catch (error) {}
  }
  function scheduleRefresh() { if (!scheduled) { scheduled = true; setTimeout(refresh, 70); } }
  async function start() { installStyles(); await ensureFeatures(); refresh(); document.documentElement.dataset.brinesearchVersion = VERSION; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start().catch(console.error), { once:true });
  else start().catch(console.error);
  new MutationObserver(scheduleRefresh).observe(document.documentElement, { childList:true, subtree:true });
  root.addEventListener('hashchange', scheduleRefresh);
  root.addEventListener('pageshow', scheduleRefresh);
})(typeof window !== 'undefined' ? window : globalThis);
