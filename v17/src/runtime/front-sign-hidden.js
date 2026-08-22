/* BrineSearch front-sign UI visibility switch and V17 Road Manager access guard.
   Hidden features remain available in source for future controlled use.
   Master road writes remain Owner-only; #97 permits Editor/Administrator accounts
   to inspect authoritative official roads and junctions read-only. */
(function (root) {
  'use strict';

  const STYLE_ID = 'brinesearch-front-sign-ui-hidden';
  const ROAD_STYLE_ID = 'brinesearch-road-manager-owner-guard';
  const OWNER_ROAD_ENTRY_ID = 'brinesearch-owner-road-manager-entry';
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
  const SUPABASE_URL = 'https://wvxzqtoiwhrgovzddtvz.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_5_sw9B-bcSdWgDzp4Z3pnQ_b-tutvtd';
  const EDITOR_SESSION_KEY = 'brinesearch.editorSession.v1';

  let hidden = true;
  let refreshQueued = false;
  let roadAccessCheckUserId = '';
  let roadAccessCheckPromise = null;

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

  function ensureRoadStyle() {
    let style = document.getElementById(ROAD_STYLE_ID);
    if (style) return style;
    style = document.createElement('style');
    style.id = ROAD_STYLE_ID;
    style.textContent = `
      ${OBSOLETE_ROAD_SETTINGS_SELECTOR}{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important;pointer-events:none!important;opacity:0!important}
      ${LEGACY_ROAD_PICKER_SELECTOR},#brm-root{display:none!important}
      html[data-brinesearch-road-manager-access="checking"] .road-manager-page,
      html[data-brinesearch-road-manager-access="denied"] .road-manager-page{display:none!important}
    `;
    (document.head || document.documentElement).appendChild(style);
    return style;
  }

  function readEditorSession() {
    try {
      const value = JSON.parse(localStorage.getItem(EDITOR_SESSION_KEY) || 'null');
      return value?.access_token && value?.user?.id ? value : null;
    } catch (error) {
      return null;
    }
  }

  async function roadManagerAccessLevel() {
    const session = readEditorSession();
    const userId = session?.user?.id || '';
    if (!session || !userId) return 'denied';
    if (roadAccessCheckPromise && roadAccessCheckUserId === userId) return roadAccessCheckPromise;
    roadAccessCheckUserId = userId;
    roadAccessCheckPromise = fetch(`${SUPABASE_URL}/rest/v1/editor_accounts?user_id=eq.${encodeURIComponent(userId)}&select=role,permissions&limit=1`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json'
      },
      cache: 'no-store'
    }).then(async (response) => {
      if (!response.ok) return 'denied';
      const rows = await response.json();
      const record = Array.isArray(rows) ? rows[0] : null;
      const role = String(record?.role || '').toLowerCase();
      const permissions = Array.isArray(record?.permissions)
        ? record.permissions.map((value) => String(value).toLowerCase())
        : [];
      if (role === 'owner' || permissions.includes('owner')) return 'owner';
      if (role === 'administrator' || role === 'editor'
          || permissions.includes('administrator') || permissions.includes('editor')) return 'readonly';
      return 'denied';
    }).catch(() => 'denied');
    return roadAccessCheckPromise;
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

  function mountOwnerRoadManagerEntry() {
    const existing = document.getElementById(OWNER_ROAD_ENTRY_ID);
    const settingsPage = document.querySelector('.settings-page');
    if (!settingsPage) {
      existing?.remove();
      return;
    }
    const ownerSection = Array.from(settingsPage.querySelectorAll('.settings-section')).find((section) => {
      const heading = section.querySelector(':scope > h2');
      return /^Owner controls\b/i.test((heading?.textContent || '').trim());
    });
    if (!ownerSection) {
      existing?.remove();
      return;
    }
    if (existing?.isConnected && ownerSection.contains(existing)) return;
    existing?.remove();
    const list = ownerSection.querySelector('.settings-list');
    if (!list) return;
    const button = document.createElement('button');
    button.id = OWNER_ROAD_ENTRY_ID;
    button.className = 'settings-row';
    button.type = 'button';
    button.innerHTML = '<span class="settings-icon"><span class="fm-icon fm-road"></span></span><span class="settings-copy"><strong>Road Manager</strong><small>Manage the shared road database, warnings, restrictions and verification</small></span><span class="settings-caret">›</span>';
    button.addEventListener('click', () => { root.location.hash = '#/settings/roads'; });
    list.prepend(button);
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

  async function guardOwnerRoadManagerRoute() {
    const route = root.location?.hash || '';
    if (!/^#\/?settings\/roads(?:\/|$)/i.test(route)) {
      delete document.documentElement.dataset.brinesearchRoadManagerAccess;
      return;
    }
    document.documentElement.dataset.brinesearchRoadManagerAccess = 'checking';
    const access = await roadManagerAccessLevel();
    if (!/^#\/?settings\/roads(?:\/|$)/i.test(root.location?.hash || '')) return;
    document.documentElement.dataset.brinesearchRoadManagerAccess = access;
    if (access === 'denied') {
      setTimeout(() => {
        if (/^#\/?settings\/roads(?:\/|$)/i.test(root.location?.hash || '')) root.location.hash = '#/settings';
      }, 0);
    }
  }

  function markHiddenElements(scope) {
    if (!root.document) return;
    ensureStyle();
    ensureRoadStyle();
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
    mountOwnerRoadManagerEntry();
    patchLegacyRoadManager();
    guardLegacyRoadRoute();
    guardOwnerRoadManagerRoute();
    document.documentElement.dataset.brinesearchFrontSignUi = hidden ? 'hidden' : 'visible';
    // Master brinesearch_roads writes remain Owner-only in Supabase. The #97
    // authoritative source/junction view may be read by approved Editors.
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
    version: '17.3-issue97-road-read-access',
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
