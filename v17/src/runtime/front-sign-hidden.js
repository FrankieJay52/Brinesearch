/* BrineSearch front-sign UI visibility switch and V17 legacy-road guard.
   Hidden features remain available in source for future controlled use. */
(function (root) {
  'use strict';

  const STYLE_ID = 'brinesearch-front-sign-ui-hidden';
  const HIDDEN_SELECTOR = [
    '#bssPadScanButton',
    '[data-bss-edit-scan]',
    '#bssSavedSignCard',
    '.bss-scan-action',
    '.bss-scan-panel',
    '.bss-saved-card'
  ].join(',');
  const OBSOLETE_ROAD_SETTINGS_SELECTOR = '#brinesearch-road-manager-settings-launch,#brm-settings-launch';
  const LEGACY_ROAD_PICKER_SELECTOR = '.brm-picker-button';

  let hidden = true;
  let refreshQueued = false;

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        ${HIDDEN_SELECTOR}{display:none!important}
        ${OBSOLETE_ROAD_SETTINGS_SELECTOR}{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important;pointer-events:none!important;opacity:0!important}
        ${LEGACY_ROAD_PICKER_SELECTOR},#brm-root{display:none!important}
      `;
      (document.head || document.documentElement).appendChild(style);
    }
    style.disabled = !hidden;
    return style;
  }

  function suppressLegacyRoadUi(scope) {
    if (!root.document) return;
    const host = scope?.querySelectorAll ? scope : document;
    host.querySelectorAll(OBSOLETE_ROAD_SETTINGS_SELECTOR).forEach((element) => {
      element.setAttribute('aria-hidden', 'true');
      element.dataset.brinesearchObsoleteRoadEntry = 'true';
      element.querySelectorAll('button,a,input,select,textarea').forEach((control) => {
        control.setAttribute('tabindex', '-1');
        if ('disabled' in control) control.disabled = true;
      });
    });
    host.querySelectorAll(LEGACY_ROAD_PICKER_SELECTOR).forEach((button) => button.remove());
    const legacyRoot = document.getElementById('brm-root');
    if (legacyRoot) {
      legacyRoot.setAttribute('aria-hidden', 'true');
      legacyRoot.dataset.open = 'false';
    }
  }

  function patchLegacyRoadManager() {
    const manager = root.BrineSearchRoadManager;
    if (!manager || manager.__v17CentralRoadManagerOnly) return;
    manager.open = () => { root.location.hash = '#/settings/roads'; };
    manager.openPicker = () => { root.location.hash = '#/settings/roads'; return false; };
    manager.__v17CentralRoadManagerOnly = true;
  }

  function guardLegacyRoadRoute() {
    if (/^#\/?roads(?:\/|$)/i.test(root.location?.hash || '')) {
      root.location.hash = '#/settings/roads';
    }
  }

  function markHiddenElements(scope) {
    if (!root.document) return;
    ensureStyle();
    const host = scope?.querySelectorAll ? scope : document;
    host.querySelectorAll(HIDDEN_SELECTOR).forEach((element) => {
      if (hidden) {
        element.hidden = true;
        element.setAttribute('aria-hidden', 'true');
        element.dataset.brinesearchFrontSignHidden = 'true';
      } else if (element.dataset.brinesearchFrontSignHidden === 'true') {
        element.hidden = false;
        element.removeAttribute('aria-hidden');
        delete element.dataset.brinesearchFrontSignHidden;
      }
    });
    suppressLegacyRoadUi(host);
    patchLegacyRoadManager();
    guardLegacyRoadRoute();
    document.documentElement.dataset.brinesearchFrontSignUi = hidden ? 'hidden' : 'visible';
    document.documentElement.dataset.brinesearchRoadManager = 'central-owner-only';
  }

  function setHidden(nextHidden) {
    hidden = Boolean(nextHidden);
    markHiddenElements(document);
    if (!hidden) {
      try { root.BrinesearchFrontSignScanner?.mount?.(); } catch (error) {}
      setTimeout(() => markHiddenElements(document), 80);
    }
    return hidden;
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      markHiddenElements(document);
    });
  }

  const API = {
    version: '17.2-hidden-ui-road-guard',
    get hidden() { return hidden; },
    hide() { return setHidden(true); },
    show() { return setHidden(false); },
    refresh: scheduleRefresh
  };

  root.BrineSearchFrontSignVisibility = API;
  if (!root.document) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => markHiddenElements(document), { once: true });
  } else {
    markHiddenElements(document);
  }

  new MutationObserver(scheduleRefresh).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  root.addEventListener('hashchange', scheduleRefresh);
  root.addEventListener('pageshow', scheduleRefresh);
})(typeof window !== 'undefined' ? window : globalThis);
