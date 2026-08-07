/* BrineSearch front-sign UI visibility switch.
   The scanner code and locally saved scans remain available for future use. */
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

  let hidden = true;
  let refreshQueued = false;

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `${HIDDEN_SELECTOR}{display:none!important}`;
      (document.head || document.documentElement).appendChild(style);
    }
    style.disabled = !hidden;
    return style;
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
    document.documentElement.dataset.brinesearchFrontSignUi = hidden ? 'hidden' : 'visible';
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
    version: '17.2-hidden-ui',
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
