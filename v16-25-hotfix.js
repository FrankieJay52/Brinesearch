/* BrineSearch V16.25 — icon recovery and multi-panel sign OCR */
(function (root) {
  'use strict';

  const VERSION = '16.25';
  const SETTINGS_ID = 'brinesearch-road-manager-settings-launch';
  const PHOTO_CONTROLS_ID = 'brinesearch-sign-photo-choices';
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
    if (document.getElementById('brinesearch-v16-25-styles')) return;
    const style = document.createElement('style');
    style.id = 'brinesearch-v16-25-styles';
    style.textContent = `
      #${SETTINGS_ID}{margin:12px 0 16px;padding:0;border:0;background:transparent;width:100%}
      #${SETTINGS_ID} button{display:grid;grid-template-columns:48px minmax(0,1fr) 28px;gap:12px;align-items:center;width:100%;min-height:72px;padding:12px 14px;border:1px solid rgba(94,207,195,.34);border-radius:18px;background:linear-gradient(135deg,rgba(29,145,135,.16),rgba(49,91,165,.12));color:inherit;text-align:left;font:inherit;cursor:pointer}
      #${SETTINGS_ID} .bs-rm-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:rgba(77,205,193,.14)}
      #${SETTINGS_ID} img{width:25px;height:25px} #${SETTINGS_ID} strong{display:block;font-size:1rem;margin-bottom:3px}
      #${SETTINGS_ID} small{display:block;color:var(--muted,#9db0c4);font-size:.79rem;line-height:1.35} #${SETTINGS_ID} .bs-rm-arrow{font-size:1.7rem;opacity:.7;text-align:right}
      #${PHOTO_CONTROLS_ID}{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      #${PHOTO_CONTROLS_ID} button{min-height:58px;border:1px solid rgba(75,213,199,.4);border-radius:15px;background:rgba(75,213,199,.11);color:inherit;font:inherit;font-weight:900;padding:10px;cursor:pointer}
      #${PHOTO_CONTROLS_ID} button:last-child{border-color:rgba(109,148,255,.42);background:rgba(109,148,255,.10)}
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
    section.innerHTML = '<button type="button"><span class="bs-rm-icon"><img src="./icons/fm-road-inactive.svg?v=16.25" alt=""></span><span><strong>Road Manager</strong><small>Search, verify, edit, merge, and connect roads to pads</small></span><span class="bs-rm-arrow">›</span></button>';
    section.querySelector('button').addEventListener('click', async () => {
      await ensureFeatures();
      root.BrineSearchRoadManager?.open ? root.BrineSearchRoadManager.open() : (root.location.hash = '#/roads');
    });
    host.matches('.settings-section') ? host.parentNode.insertBefore(section, host) : host.prepend(section);
  }

  function mountPhotoChoices() {
    const modal = document.getElementById('brinesearchFrontSignModal');
    if (!modal || modal.querySelector('#' + PHOTO_CONTROLS_ID)) return;
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
      const raw = getComputedStyle(icon).getPropertyValue('--fm-icon').trim();
      const match = raw.match(/url\(["']?([^"')]+)["']?\)/i);
      if (!match || !/\/icons\//i.test(match[1])) return;
      const clean = match[1].split('?')[0];
      icon.style.setProperty('--fm-icon', `url("${clean}?v=${VERSION}")`);
    });
    rootNode.querySelectorAll('img[src*="/icons/"]').forEach((img) => {
      const url = new URL(img.getAttribute('src'), document.baseURI);
      if (url.searchParams.get('v') === VERSION) return;
      url.searchParams.set('v', VERSION);
      img.src = url.href;
    });
  }

  function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((s) => s.src === src);
      if (existing) { if (root.Tesseract) return resolve(); existing.addEventListener('load', resolve, { once:true }); existing.addEventListener('error', reject, { once:true }); return; }
      const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
  }

  function canvasFromImage(image, x, y, width, height, maxWidth) {
    const scale = Math.min(3, Math.max(1.5, maxWidth / width));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = pixels.data[i] * .299 + pixels.data[i+1] * .587 + pixels.data[i+2] * .114;
      const boosted = gray < 150 ? Math.max(0, (gray - 105) * 2.1) : Math.min(255, 190 + (gray - 150) * 1.3);
      pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = boosted;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  }

  function formatApiDigits(digits) {
    if (digits.length === 14) return `${digits.slice(0,2)}-${digits.slice(2,5)}-${digits.slice(5,10)}-${digits.slice(10,12)}-${digits.slice(12)}`;
    if (digits.length === 12) return `${digits.slice(0,2)}-${digits.slice(2,5)}-${digits.slice(5,10)}-${digits.slice(10)}`;
    if (digits.length === 10) return `${digits.slice(0,2)}-${digits.slice(2,5)}-${digits.slice(5)}`;
    return '';
  }

  function extractApis(text) {
    const found = new Set();
    const lines = String(text || '').split(/\n/);
    for (const line of lines) {
      const fixed = line.toUpperCase().replace(/[OQD]/g,'0').replace(/[IL|]/g,'1').replace(/Z/g,'2').replace(/S/g,'5').replace(/B/g,'8');
      const chunks = fixed.match(/(?:34|37|47)[0-9\s./-]{8,30}/g) || [];
      for (const chunk of chunks) {
        let digits = chunk.replace(/\D/g,'');
        while (digits.length > 14 && /^(34|37|47)/.test(digits)) digits = digits.slice(0,14);
        const formatted = formatApiDigits(digits);
        if (formatted) found.add(formatted);
      }
    }
    return Array.from(found);
  }

  async function imageReady(image) {
    if (image.complete && image.naturalWidth) return;
    await new Promise((resolve, reject) => { image.addEventListener('load', resolve, { once:true }); image.addEventListener('error', reject, { once:true }); });
  }

  async function runMultiPanelOcr(modal) {
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
    progress?.classList.add('show');
    errorBox?.classList.remove('show');
    readButton.disabled = true;
    progressText.textContent = 'Preparing full sign and 3 sign panels…';
    progressBar.style.width = '5%';
    if (!root.Tesseract) await loadExternalScript(TESSERACT_SCRIPT);

    const w = preview.naturalWidth, h = preview.naturalHeight;
    const overlap = Math.round(w * .035);
    const third = w / 3;
    const sources = [
      canvasFromImage(preview, 0, 0, w, h, 1900),
      canvasFromImage(preview, 0, 0, third + overlap, h, 1500),
      canvasFromImage(preview, Math.max(0, third - overlap), 0, third + overlap * 2, h, 1500),
      canvasFromImage(preview, Math.max(0, third * 2 - overlap), 0, w - (third * 2 - overlap), h, 1500)
    ];

    const worker = await root.Tesseract.createWorker('eng', 1, {
      workerPath: TESSERACT_WORKER, langPath: TESSERACT_LANG, corePath: TESSERACT_CORE,
      logger(message) {
        if (message.status) progressText.textContent = message.status.replace(/\b\w/g, (c) => c.toUpperCase());
      }
    });
    const texts = [];
    try {
      await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' });
      for (let i = 0; i < sources.length; i += 1) {
        progressText.textContent = i === 0 ? 'Reading the complete sign…' : `Reading sign panel ${i} of 3…`;
        progressBar.style.width = `${10 + i * 22}%`;
        const result = await worker.recognize(sources[i]);
        texts.push(result.data?.text || '');
      }
    } finally {
      await worker.terminate();
    }

    const combined = texts.map((t, i) => `--- ${i === 0 ? 'FULL SIGN' : 'PANEL ' + i} ---\n${t.trim()}`).join('\n\n');
    const apis = extractApis(combined);
    rawText.value = combined + (apis.length ? '\n\n--- NORMALIZED API NUMBERS ---\n' + apis.map((api) => 'API: ' + api).join('\n') : '');
    progressBar.style.width = '100%';
    progressText.textContent = apis.length ? `Found ${apis.length} unique API number${apis.length === 1 ? '' : 's'}. Review below.` : 'Reading finished. Review and correct the text below.';
    analyze?.click();
    readButton.disabled = false;
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('#bssReadButton');
    if (!button) return;
    const modal = button.closest('#brinesearchFrontSignModal');
    if (!modal || modal.dataset.v1625Busy === 'true') return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    modal.dataset.v1625Busy = 'true';
    try { await runMultiPanelOcr(modal); }
    catch (error) {
      const box = modal.querySelector('#bssError');
      if (box) { box.textContent = (error.message || 'The sign could not be read.') + ' Try a closer, straighter photo.'; box.classList.add('show'); }
      button.disabled = false;
    } finally { delete modal.dataset.v1625Busy; }
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
  root.addEventListener('hashchange', scheduleRefresh); root.addEventListener('pageshow', scheduleRefresh);
})(typeof window !== 'undefined' ? window : globalThis);
