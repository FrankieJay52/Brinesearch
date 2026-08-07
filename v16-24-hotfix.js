/* BrineSearch V16.24 — visibility and scanner controls repair */
(function (root) {
  'use strict';

  const VERSION = '16.24';
  const SETTINGS_ID = 'brinesearch-road-manager-settings-launch';
  const PHOTO_CONTROLS_ID = 'brinesearch-sign-photo-choices';
  let scheduled = false;

  function visible(element) {
    if (!element || !element.isConnected) return false;
    const style = root.getComputedStyle ? root.getComputedStyle(element) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    return true;
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

    try { root.BrineSearchRoadDB?.init?.(); } catch (error) { console.error('[BrineSearch] Road database startup failed', error); }
    try { root.BrineSearchRoadManager?.init?.(); } catch (error) { console.error('[BrineSearch] Road Manager startup failed', error); }
    try { root.BrinesearchFrontSignScanner?.mount?.(); } catch (error) { console.error('[BrineSearch] Sign scanner startup failed', error); }
  }

  function isSettingsView() {
    const hash = root.location?.hash || '';
    if (/^#\/?settings(?:\/|$)/i.test(hash)) return true;
    const heading = Array.from(document.querySelectorAll('h1,h2,[role="heading"]'))
      .find((element) => visible(element) && /^settings$/i.test((element.textContent || '').trim()));
    return Boolean(heading);
  }

  function settingsHost() {
    const selectors = [
      '.settings-page .settings-section',
      '.settings-page',
      '.settings-content',
      '[data-page="settings"]',
      'main'
    ];
    for (const selector of selectors) {
      const element = Array.from(document.querySelectorAll(selector)).find(visible);
      if (element) return element;
    }
    return null;
  }

  function installSettingsStyles() {
    if (document.getElementById('brinesearch-v16-24-styles')) return;
    const style = document.createElement('style');
    style.id = 'brinesearch-v16-24-styles';
    style.textContent = `
      #${SETTINGS_ID}{margin:12px 0 16px;padding:0;border:0;background:transparent;width:100%}
      #${SETTINGS_ID} button{display:grid;grid-template-columns:48px minmax(0,1fr) 28px;gap:12px;align-items:center;width:100%;min-height:72px;padding:12px 14px;border:1px solid rgba(94,207,195,.34);border-radius:18px;background:linear-gradient(135deg,rgba(29,145,135,.16),rgba(49,91,165,.12));color:inherit;text-align:left;font:inherit;cursor:pointer}
      #${SETTINGS_ID} .bs-rm-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:rgba(77,205,193,.14)}
      #${SETTINGS_ID} img{width:25px;height:25px}
      #${SETTINGS_ID} strong{display:block;font-size:1rem;margin-bottom:3px}
      #${SETTINGS_ID} small{display:block;color:var(--muted,#9db0c4);font-size:.79rem;line-height:1.35}
      #${SETTINGS_ID} .bs-rm-arrow{font-size:1.7rem;opacity:.7;text-align:right}
      #${PHOTO_CONTROLS_ID}{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      #${PHOTO_CONTROLS_ID} button{min-height:58px;border:1px solid rgba(75,213,199,.4);border-radius:15px;background:rgba(75,213,199,.11);color:inherit;font:inherit;font-weight:900;padding:10px;cursor:pointer}
      #${PHOTO_CONTROLS_ID} button:last-child{border-color:rgba(109,148,255,.42);background:rgba(109,148,255,.10)}
      @media(max-width:480px){#${PHOTO_CONTROLS_ID}{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function mountRoadManagerSetting() {
    if (!isSettingsView()) return;
    const existing = document.getElementById(SETTINGS_ID);
    if (existing && visible(existing)) return;
    existing?.remove();

    const host = settingsHost();
    if (!host) return;
    const section = document.createElement('section');
    section.id = SETTINGS_ID;
    section.setAttribute('aria-label', 'Road Manager');
    section.innerHTML = `
      <button type="button">
        <span class="bs-rm-icon"><img src="./icons/fm-road-inactive.svg" alt=""></span>
        <span><strong>Road Manager</strong><small>Search, verify, edit, merge, and connect roads to pads</small></span>
        <span class="bs-rm-arrow" aria-hidden="true">›</span>
      </button>`;
    section.querySelector('button').addEventListener('click', async () => {
      await ensureFeatures();
      if (root.BrineSearchRoadManager?.open) root.BrineSearchRoadManager.open();
      else root.location.hash = '#/roads';
    });

    if (host.matches('.settings-section')) host.parentNode.insertBefore(section, host);
    else host.prepend(section);
  }

  function mountPhotoChoices() {
    const modal = document.getElementById('brinesearchFrontSignModal');
    if (!modal) return;
    if (modal.querySelector('#' + PHOTO_CONTROLS_ID)) return;
    const input = modal.querySelector('#bssPhotoInput');
    if (!input) return;

    const originalLabel = input.closest('label');
    if (!originalLabel) return;
    originalLabel.style.display = 'none';

    const controls = document.createElement('div');
    controls.id = PHOTO_CONTROLS_ID;
    controls.innerHTML = '<button type="button" data-photo-action="camera">📷 Take Photo</button><button type="button" data-photo-action="library">🖼️ Choose Photo</button>';
    originalLabel.insertAdjacentElement('afterend', controls);

    controls.querySelector('[data-photo-action="camera"]').addEventListener('click', () => {
      input.setAttribute('capture', 'environment');
      input.value = '';
      input.click();
    });
    controls.querySelector('[data-photo-action="library"]').addEventListener('click', () => {
      input.removeAttribute('capture');
      input.value = '';
      input.click();
    });

    const retake = modal.querySelector('#bssRetakeButton');
    if (retake) {
      retake.textContent = 'Choose Another Photo';
      retake.onclick = (event) => {
        event.preventDefault();
        input.removeAttribute('capture');
        input.value = '';
        input.click();
      };
    }
  }

  function refresh() {
    scheduled = false;
    installSettingsStyles();
    mountRoadManagerSetting();
    mountPhotoChoices();
    try { root.BrinesearchFrontSignScanner?.mount?.(); } catch (error) {}
  }

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(refresh, 60);
  }

  async function start() {
    installSettingsStyles();
    await ensureFeatures();
    refresh();
    document.documentElement.dataset.brinesearchVersion = VERSION;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start().catch(console.error), { once: true });
  else start().catch(console.error);

  new MutationObserver(scheduleRefresh).observe(document.documentElement, { childList: true, subtree: true });
  root.addEventListener('hashchange', scheduleRefresh);
  root.addEventListener('pageshow', scheduleRefresh);
  root.addEventListener('brinesearch:features-ready', scheduleRefresh);
})(typeof window !== 'undefined' ? window : globalThis);
