/* BrineSearch V16.21 — Road Manager and road picker */
(function (root, factory) {
  'use strict';
  var api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrineSearchRoadManager = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';

  var VERSION = '16.21';
  var db = null;
  var mounted = false;
  var rootEl = null;
  var previousHash = '#/';
  var unsub = null;
  var observer = null;
  var pickerObserver = null;
  var savedHtmlOverflow = '';
  var savedBodyOverflow = '';
  var state = {
    open: false,
    mode: 'list',
    selectedId: '',
    query: '',
    status: 'all',
    type: 'all',
    roadState: 'all',
    sort: 'name',
    pickerTarget: null,
    pickerTitle: 'Choose a road',
    notice: '',
    noticeKind: 'success',
    mergeKeepId: '',
    mergeRemoveId: '',
    addingForPicker: false
  };

  var ROAD_TYPE_LABELS = {
    'interstate': 'Interstate',
    'us-route': 'U.S. route',
    'state-route': 'State route',
    'county-route': 'County route',
    'township-route': 'Township route',
    'street': 'Street / local road',
    'lease-road': 'Lease road',
    'access-road': 'Access / haul road',
    'unknown': 'Other / unknown'
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeSpace(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function uniq(values) {
    var seen = Object.create(null);
    return (values || []).map(normalizeSpace).filter(function (value) {
      var key = value.toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function identity(value) {
    return normalizeSpace(value).toLowerCase()
      .replace(/\broad\b|\brd\b/g, ' road ')
      .replace(/\bstreet\b|\bst\b/g, ' street ')
      .replace(/\bavenue\b|\bave\b/g, ' avenue ')
      .replace(/\bdrive\b|\bdr\b/g, ' drive ')
      .replace(/\blane\b|\bln\b/g, ' lane ')
      .replace(/\bhighway\b|\bhwy\b/g, ' highway ')
      .replace(/\bstate\s+route\b|\bsr\b/g, ' state route ')
      .replace(/\bcounty\s+(?:road|route)\b|\bcr\b/g, ' county route ')
      .replace(/\btownship\s+(?:road|route)\b|\btr\b/g, ' township route ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function typeLabel(type) {
    return ROAD_TYPE_LABELS[type] || ROAD_TYPE_LABELS.unknown;
  }

  function stateLabel(code) {
    var map = { OH: 'Ohio', WV: 'West Virginia', PA: 'Pennsylvania' };
    return map[code] || code || 'State not set';
  }

  function statusInfo(road) {
    var verification = road && road.verification ? road.verification : {};
    if (verification.needsFieldCheck || verification.status === 'needs-field-check') {
      return { key: 'needs-check', label: 'Needs field check', className: 'warning' };
    }
    if (verification.status === 'verified' || verification.officialNameVerified) {
      return { key: 'verified', label: 'Verified', className: 'verified' };
    }
    return { key: 'unverified', label: 'Unverified', className: 'muted' };
  }

  function formatDate(value) {
    if (!value) return 'Not recorded';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function roadLocation(road) {
    var items = [];
    if (road.state) items.push(stateLabel(road.state));
    if (road.county) items.push(road.county + (/county$/i.test(road.county) ? '' : ' County'));
    if (road.township) items.push(road.township + (/township$/i.test(road.township) ? '' : ' Township'));
    return items.join(' · ') || 'Location not entered';
  }

  function roadSearchText(road) {
    return [
      road.officialName,
      road.displayName,
      typeLabel(road.type),
      road.state,
      stateLabel(road.state),
      road.county,
      road.township,
      road.notes,
      (road.aliases || []).join(' '),
      (road.warnings || []).join(' '),
      (road.restrictions || []).join(' '),
      (road.padIds || []).join(' ')
    ].join(' ').toLowerCase();
  }

  function duplicateGroups(roads) {
    var buckets = Object.create(null);
    (roads || []).forEach(function (road) {
      var routeKey = road.routePrefix && road.routeNumber ? [road.state || 'multi', road.routePrefix, road.routeNumber].join(':') : '';
      var nameKey = [road.state || 'multi', identity(road.officialName || road.displayName)].join(':');
      var keys = uniq([routeKey, nameKey].concat((road.aliases || []).map(function (alias) {
        return [road.state || 'multi', identity(alias)].join(':');
      })));
      keys.forEach(function (key) {
        if (!key || /:multi:$/.test(key)) return;
        (buckets[key] || (buckets[key] = [])).push(road);
      });
    });
    var seen = Object.create(null);
    var groups = [];
    Object.keys(buckets).forEach(function (key) {
      var members = [];
      var memberSeen = Object.create(null);
      buckets[key].forEach(function (road) {
        if (!memberSeen[road.id]) {
          memberSeen[road.id] = true;
          members.push(road);
        }
      });
      if (members.length < 2) return;
      var signature = members.map(function (road) { return road.id; }).sort().join('|');
      if (seen[signature]) return;
      seen[signature] = true;
      groups.push(members.sort(function (a, b) { return a.officialName.localeCompare(b.officialName); }));
    });
    return groups.sort(function (a, b) { return a[0].officialName.localeCompare(b[0].officialName); });
  }

  function getRoads() {
    if (!db || typeof db.getAll !== 'function') return [];
    return db.getAll();
  }

  function getFilteredRoads() {
    var roads = getRoads();
    var query = normalizeSpace(state.query).toLowerCase();
    var duplicateIds = Object.create(null);
    if (state.status === 'duplicates') {
      duplicateGroups(roads).forEach(function (group) {
        group.forEach(function (road) { duplicateIds[road.id] = true; });
      });
    }
    roads = roads.filter(function (road) {
      var status = statusInfo(road);
      if (query && roadSearchText(road).indexOf(query) === -1) return false;
      if (state.type !== 'all' && road.type !== state.type) return false;
      if (state.roadState !== 'all' && (road.state || '') !== state.roadState) return false;
      if (state.status === 'verified' && status.key !== 'verified') return false;
      if (state.status === 'needs-check' && status.key !== 'needs-check') return false;
      if (state.status === 'warnings' && !(road.warnings || []).length) return false;
      if (state.status === 'restrictions' && !(road.restrictions || []).length) return false;
      if (state.status === 'linked' && !(road.padIds || []).length) return false;
      if (state.status === 'duplicates' && !duplicateIds[road.id]) return false;
      return true;
    });
    roads.sort(function (a, b) {
      if (state.sort === 'updated') return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      if (state.sort === 'pads') return (b.padIds || []).length - (a.padIds || []).length || a.officialName.localeCompare(b.officialName);
      if (state.sort === 'status') return statusInfo(a).key.localeCompare(statusInfo(b).key) || a.officialName.localeCompare(b.officialName);
      return a.officialName.localeCompare(b.officialName);
    });
    return roads;
  }

  function getStats() {
    var roads = getRoads();
    var result = { total: roads.length, verified: 0, needsCheck: 0, warnings: 0, restrictions: 0, linkedPads: 0, duplicates: 0 };
    var padIds = Object.create(null);
    roads.forEach(function (road) {
      var status = statusInfo(road);
      if (status.key === 'verified') result.verified += 1;
      if (status.key === 'needs-check') result.needsCheck += 1;
      if ((road.warnings || []).length) result.warnings += 1;
      if ((road.restrictions || []).length) result.restrictions += 1;
      (road.padIds || []).forEach(function (padId) { padIds[padId] = true; });
    });
    result.linkedPads = Object.keys(padIds).length;
    result.duplicates = duplicateGroups(roads).reduce(function (count, group) { return count + group.length; }, 0);
    return result;
  }

  function injectStyles() {
    if (!root.document || root.document.getElementById('brm-v1621-styles')) return;
    var style = root.document.createElement('style');
    style.id = 'brm-v1621-styles';
    style.textContent = [
      ':root{--brm-bg:var(--bg,#08121f);--brm-panel:var(--surface,#101e2d);--brm-panel2:var(--surface-2,#16283a);--brm-text:var(--text,#f3f8fc);--brm-muted:var(--muted,#9fb1c4);--brm-line:var(--border,rgba(255,255,255,.12));--brm-accent:var(--accent,#18a4e0);--brm-good:#2fc68a;--brm-warn:#f4b942;--brm-danger:#ff6b6b;--brm-shadow:0 16px 48px rgba(0,0,0,.35)}',
      '@media(prefers-color-scheme:light){:root{--brm-bg:var(--bg,#f3f6f9);--brm-panel:var(--surface,#fff);--brm-panel2:var(--surface-2,#eef3f7);--brm-text:var(--text,#132235);--brm-muted:var(--muted,#5e6d7c);--brm-line:var(--border,rgba(20,45,70,.14));--brm-shadow:0 16px 48px rgba(20,45,70,.2)}}',
      '#brm-root{position:fixed;inset:0;z-index:2147482000;display:none;background:var(--brm-bg);color:var(--brm-text);font:500 15px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased}',
      '#brm-root[data-open="true"]{display:block}',
      '#brm-root *{box-sizing:border-box}',
      '#brm-root button,#brm-root input,#brm-root select,#brm-root textarea{font:inherit}',
      '.brm-app{height:100%;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}',
      '.brm-header{flex:0 0 auto;display:flex;align-items:center;gap:10px;min-height:62px;padding:10px 14px;border-bottom:1px solid var(--brm-line);background:color-mix(in srgb,var(--brm-panel) 94%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}',
      '.brm-header-copy{min-width:0;flex:1}.brm-eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--brm-accent);font-weight:800}.brm-title{margin:1px 0 0;font-size:20px;line-height:1.1;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.brm-subtitle{margin-top:3px;color:var(--brm-muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.brm-icon-btn,.brm-primary,.brm-secondary,.brm-danger-btn,.brm-chip,.brm-road-card,.brm-settings-launch,.brm-picker-button{appearance:none;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.brm-icon-btn{width:42px;height:42px;flex:0 0 42px;border-radius:13px;display:grid;place-items:center;background:var(--brm-panel2);color:var(--brm-text);border:1px solid var(--brm-line);font-size:20px;font-weight:800}',
      '.brm-icon-btn:active,.brm-primary:active,.brm-secondary:active,.brm-danger-btn:active,.brm-road-card:active{transform:scale(.985)}',
      '.brm-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:14px 14px calc(22px + env(safe-area-inset-bottom))}',
      '.brm-container{width:min(1040px,100%);margin:0 auto}',
      '.brm-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin-bottom:12px}.brm-search-wrap{position:relative}.brm-search{width:100%;height:46px;border-radius:14px;border:1px solid var(--brm-line);background:var(--brm-panel);color:var(--brm-text);padding:0 42px 0 42px;outline:none}.brm-search:focus{border-color:var(--brm-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--brm-accent) 22%,transparent)}.brm-search-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);opacity:.7;font-size:18px}.brm-clear-search{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:0;border-radius:10px;background:transparent;color:var(--brm-muted);font-size:18px}',
      '.brm-primary,.brm-secondary,.brm-danger-btn{min-height:44px;border-radius:13px;padding:10px 14px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:8px}.brm-primary{background:var(--brm-accent);color:white}.brm-secondary{background:var(--brm-panel2);color:var(--brm-text);border:1px solid var(--brm-line)}.brm-danger-btn{background:color-mix(in srgb,var(--brm-danger) 17%,var(--brm-panel));color:var(--brm-danger);border:1px solid color-mix(in srgb,var(--brm-danger) 45%,transparent)}',
      '.brm-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.brm-stat{background:var(--brm-panel);border:1px solid var(--brm-line);border-radius:14px;padding:11px;min-width:0}.brm-stat-value{font-size:20px;font-weight:900;line-height:1}.brm-stat-label{font-size:11px;color:var(--brm-muted);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.brm-filter-scroll{display:flex;gap:8px;overflow:auto;padding:1px 1px 9px;margin:0 -1px 4px;scrollbar-width:none}.brm-filter-scroll::-webkit-scrollbar{display:none}.brm-chip{flex:0 0 auto;min-height:36px;padding:7px 11px;border-radius:999px;background:var(--brm-panel);color:var(--brm-muted);border:1px solid var(--brm-line);font-size:12px;font-weight:800}.brm-chip[data-active="true"]{background:color-mix(in srgb,var(--brm-accent) 18%,var(--brm-panel));color:var(--brm-text);border-color:color-mix(in srgb,var(--brm-accent) 55%,var(--brm-line))}',
      '.brm-advanced{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}.brm-select{width:100%;height:40px;border-radius:12px;border:1px solid var(--brm-line);background:var(--brm-panel);color:var(--brm-text);padding:0 10px;outline:none}',
      '.brm-result-line{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--brm-muted);font-size:12px;margin:8px 2px}.brm-list{display:grid;gap:9px}.brm-road-card{width:100%;text-align:left;background:var(--brm-panel);color:var(--brm-text);border:1px solid var(--brm-line);border-radius:17px;padding:14px;box-shadow:0 1px 0 rgba(255,255,255,.02);transition:transform .1s ease,border-color .15s ease}.brm-road-card:hover{border-color:color-mix(in srgb,var(--brm-accent) 40%,var(--brm-line))}.brm-card-top{display:flex;align-items:flex-start;gap:10px}.brm-road-sign{flex:0 0 auto;min-width:44px;height:32px;padding:0 8px;border-radius:7px;display:grid;place-items:center;background:#f6f7f9;color:#111827;border:2px solid #111827;font-size:11px;font-weight:950;letter-spacing:.02em}.brm-card-copy{min-width:0;flex:1}.brm-road-name{font-size:16px;font-weight:850;line-height:1.2;overflow-wrap:anywhere}.brm-road-meta{margin-top:4px;font-size:12px;color:var(--brm-muted);overflow-wrap:anywhere}.brm-chevron{font-size:22px;color:var(--brm-muted);line-height:1}.brm-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}.brm-badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:850;background:var(--brm-panel2);color:var(--brm-muted);border:1px solid var(--brm-line)}.brm-badge.verified{color:var(--brm-good);border-color:color-mix(in srgb,var(--brm-good) 38%,var(--brm-line));background:color-mix(in srgb,var(--brm-good) 10%,var(--brm-panel))}.brm-badge.warning{color:var(--brm-warn);border-color:color-mix(in srgb,var(--brm-warn) 38%,var(--brm-line));background:color-mix(in srgb,var(--brm-warn) 10%,var(--brm-panel))}.brm-badge.danger{color:var(--brm-danger);border-color:color-mix(in srgb,var(--brm-danger) 38%,var(--brm-line));background:color-mix(in srgb,var(--brm-danger) 10%,var(--brm-panel))}',
      '.brm-empty{padding:34px 18px;text-align:center;border-radius:18px;background:var(--brm-panel);border:1px dashed var(--brm-line)}.brm-empty-icon{font-size:36px}.brm-empty h3{margin:8px 0 4px}.brm-empty p{margin:0 auto 16px;max-width:480px;color:var(--brm-muted)}',
      '.brm-section{background:var(--brm-panel);border:1px solid var(--brm-line);border-radius:18px;padding:15px;margin-bottom:11px}.brm-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px}.brm-section-title{font-size:14px;font-weight:900}.brm-section-help{font-size:11px;color:var(--brm-muted);margin-top:2px}.brm-detail-hero{display:flex;align-items:flex-start;gap:12px}.brm-detail-sign{min-width:62px;height:44px}.brm-detail-name{font-size:22px;line-height:1.12;font-weight:900;overflow-wrap:anywhere}.brm-detail-sub{margin-top:5px;color:var(--brm-muted);font-size:13px}.brm-detail-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
      '.brm-info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.brm-info{background:var(--brm-panel2);border-radius:13px;padding:11px;border:1px solid var(--brm-line);min-width:0}.brm-info-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--brm-muted);font-weight:850}.brm-info-value{margin-top:4px;font-size:13px;font-weight:750;overflow-wrap:anywhere}',
      '.brm-list-block{display:grid;gap:7px}.brm-item{display:flex;align-items:flex-start;gap:8px;background:var(--brm-panel2);border:1px solid var(--brm-line);border-radius:12px;padding:10px}.brm-item-icon{width:22px;flex:0 0 22px;text-align:center}.brm-item-copy{min-width:0;flex:1;overflow-wrap:anywhere}.brm-remove-item{flex:0 0 auto;width:30px;height:30px;border:0;border-radius:9px;background:transparent;color:var(--brm-danger);font-size:18px}.brm-mini-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:9px}.brm-mini-input{width:100%;min-height:42px;border-radius:12px;border:1px solid var(--brm-line);background:var(--brm-panel2);color:var(--brm-text);padding:9px 11px;outline:none}',
      '.brm-form{display:grid;gap:13px}.brm-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.brm-field{display:grid;gap:6px;min-width:0}.brm-field.full{grid-column:1/-1}.brm-label{font-size:12px;font-weight:850}.brm-hint{font-size:11px;color:var(--brm-muted)}.brm-input,.brm-textarea{width:100%;border-radius:13px;border:1px solid var(--brm-line);background:var(--brm-panel2);color:var(--brm-text);padding:10px 12px;outline:none}.brm-input{height:44px}.brm-textarea{min-height:92px;resize:vertical}.brm-input:focus,.brm-textarea:focus,.brm-mini-input:focus,.brm-select:focus{border-color:var(--brm-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--brm-accent) 20%,transparent)}.brm-check-row{display:flex;align-items:flex-start;gap:9px;padding:10px;border-radius:13px;background:var(--brm-panel2);border:1px solid var(--brm-line)}.brm-check-row input{margin-top:3px;width:18px;height:18px}.brm-form-actions{position:sticky;bottom:-14px;display:flex;gap:9px;padding:12px 0 calc(2px + env(safe-area-inset-bottom));background:linear-gradient(transparent,var(--brm-bg) 18%);z-index:2}.brm-form-actions>*{flex:1}',
      '.brm-pad-chips{display:flex;flex-wrap:wrap;gap:7px}.brm-pad-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:7px 10px;border-radius:999px;border:1px solid var(--brm-line);background:var(--brm-panel2);color:var(--brm-text);text-decoration:none;font-size:11px;font-weight:800}.brm-pad-chip span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}',
      '.brm-notice{margin-bottom:11px;padding:10px 12px;border-radius:13px;border:1px solid color-mix(in srgb,var(--brm-good) 45%,var(--brm-line));background:color-mix(in srgb,var(--brm-good) 12%,var(--brm-panel));color:var(--brm-text);font-size:12px}.brm-notice.error{border-color:color-mix(in srgb,var(--brm-danger) 45%,var(--brm-line));background:color-mix(in srgb,var(--brm-danger) 12%,var(--brm-panel))}',
      '.brm-duplicate-group{display:grid;gap:8px}.brm-duplicate-choice{display:flex;align-items:flex-start;gap:9px;padding:10px;border-radius:13px;background:var(--brm-panel2);border:1px solid var(--brm-line)}.brm-duplicate-choice input{margin-top:4px}.brm-duplicate-choice-copy{min-width:0}.brm-duplicate-choice-name{font-weight:850}.brm-duplicate-choice-meta{font-size:11px;color:var(--brm-muted);margin-top:2px}',
      '.brm-picker-footer{position:sticky;bottom:-14px;padding:10px 0 calc(2px + env(safe-area-inset-bottom));background:linear-gradient(transparent,var(--brm-bg) 24%)}',
      '.brm-settings-launch{width:100%;display:flex;align-items:center;gap:12px;text-align:left;padding:14px;border-radius:16px;background:var(--brm-panel,rgba(20,35,52,.95));color:var(--brm-text,#fff);border:1px solid var(--brm-line,rgba(255,255,255,.12));margin:10px 0}.brm-settings-launch-icon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:color-mix(in srgb,var(--brm-accent,#18a4e0) 16%,transparent)}.brm-settings-launch-icon img{width:24px;height:24px}.brm-settings-launch-copy{flex:1;min-width:0}.brm-settings-launch-title{font-weight:850}.brm-settings-launch-sub{font-size:12px;color:var(--brm-muted,#9fb1c4);margin-top:2px}.brm-settings-launch-arrow{font-size:22px;opacity:.65}',
      '.brm-picker-button{display:inline-flex;align-items:center;gap:6px;margin-top:7px;min-height:34px;padding:6px 10px;border-radius:10px;background:color-mix(in srgb,var(--brm-accent,#18a4e0) 13%,transparent);color:inherit;border:1px solid color-mix(in srgb,var(--brm-accent,#18a4e0) 35%,var(--brm-line,rgba(255,255,255,.12)));font-size:11px;font-weight:800}.brm-picker-button img{width:17px;height:17px}',
      '@media(max-width:700px){.brm-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.brm-advanced{grid-template-columns:1fr}.brm-form-grid,.brm-info-grid{grid-template-columns:1fr}.brm-toolbar{grid-template-columns:minmax(0,1fr) auto}.brm-primary .brm-button-label{display:none}.brm-detail-hero{align-items:center}.brm-body{padding-left:11px;padding-right:11px}.brm-header{padding-left:11px;padding-right:11px}}',
      '@media(min-width:900px){.brm-list{grid-template-columns:repeat(2,minmax(0,1fr))}.brm-body{padding-top:20px}.brm-header{padding-left:max(18px,calc((100vw - 1040px)/2));padding-right:max(18px,calc((100vw - 1040px)/2))}}',
      '@media(max-width:370px){.brm-title{font-size:18px}.brm-road-sign{min-width:40px}.brm-chip{padding-left:9px;padding-right:9px}.brm-header .brm-icon-btn{width:39px;height:39px;flex-basis:39px}}'
    ].join('\n');
    root.document.head.appendChild(style);
  }

  function ensureMount() {
    if (!root.document) return null;
    injectStyles();
    if (rootEl) return rootEl;
    rootEl = root.document.createElement('div');
    rootEl.id = 'brm-root';
    rootEl.setAttribute('data-open', 'false');
    rootEl.setAttribute('aria-hidden', 'true');
    root.document.body.appendChild(rootEl);
    bindRootEvents();
    return rootEl;
  }

  function header(title, subtitle, backAction, extra) {
    return '<header class="brm-header">' +
      '<button class="brm-icon-btn" type="button" data-brm-action="' + esc(backAction || 'close') + '" aria-label="' + (backAction ? 'Back' : 'Close Road Manager') + '">' + (backAction ? '‹' : '×') + '</button>' +
      '<div class="brm-header-copy"><div class="brm-eyebrow">Road Intelligence</div><div class="brm-title">' + esc(title) + '</div><div class="brm-subtitle">' + esc(subtitle || '') + '</div></div>' +
      (extra || '') +
      '</header>';
  }

  function noticeHtml() {
    if (!state.notice) return '';
    return '<div class="brm-notice' + (state.noticeKind === 'error' ? ' error' : '') + '" role="status">' + esc(state.notice) + '</div>';
  }

  function statCard(value, label) {
    return '<div class="brm-stat"><div class="brm-stat-value">' + esc(value) + '</div><div class="brm-stat-label">' + esc(label) + '</div></div>';
  }

  function badge(label, kind) {
    return '<span class="brm-badge ' + esc(kind || '') + '">' + esc(label) + '</span>';
  }

  function roadSignText(road) {
    if (road.routePrefix && road.routeNumber) return road.routePrefix + '-' + road.routeNumber;
    var initials = normalizeSpace(road.officialName).split(' ').filter(Boolean).slice(0, 2).map(function (part) { return part[0] || ''; }).join('').toUpperCase();
    return initials || 'RD';
  }

  function roadCard(road, picker) {
    var status = statusInfo(road);
    var warningCount = (road.warnings || []).length;
    var restrictionCount = (road.restrictions || []).length;
    var padCount = (road.padIds || []).length;
    return '<button type="button" class="brm-road-card" data-brm-road="' + esc(road.id) + '"' + (picker ? ' data-brm-pick="true"' : '') + '>' +
      '<div class="brm-card-top"><span class="brm-road-sign">' + esc(roadSignText(road)) + '</span>' +
      '<span class="brm-card-copy"><span class="brm-road-name">' + esc(road.officialName) + '</span><span class="brm-road-meta">' + esc(typeLabel(road.type) + ' · ' + roadLocation(road)) + '</span></span><span class="brm-chevron">›</span></div>' +
      '<span class="brm-badges">' + badge(status.label, status.className) +
      (padCount ? badge(padCount + ' linked pad' + (padCount === 1 ? '' : 's'), '') : '') +
      (warningCount ? badge(warningCount + ' warning' + (warningCount === 1 ? '' : 's'), 'warning') : '') +
      (restrictionCount ? badge(restrictionCount + ' restriction' + (restrictionCount === 1 ? '' : 's'), 'danger') : '') +
      '</span></button>';
  }

  function renderList() {
    var stats = getStats();
    var roads = getFilteredRoads();
    var statuses = [
      ['all', 'All'], ['verified', 'Verified'], ['needs-check', 'Needs check'], ['warnings', 'Warnings'],
      ['restrictions', 'Restrictions'], ['linked', 'Linked pads'], ['duplicates', 'Duplicates']
    ];
    var filters = statuses.map(function (item) {
      return '<button type="button" class="brm-chip" data-brm-filter="' + item[0] + '" data-active="' + (state.status === item[0]) + '">' + esc(item[1]) + '</button>';
    }).join('');
    var typeOptions = '<option value="all">All road types</option>' + Object.keys(ROAD_TYPE_LABELS).map(function (key) {
      return '<option value="' + esc(key) + '"' + (state.type === key ? ' selected' : '') + '>' + esc(ROAD_TYPE_LABELS[key]) + '</option>';
    }).join('');
    var stateOptions = [['all', 'All states'], ['OH', 'Ohio'], ['WV', 'West Virginia'], ['PA', 'Pennsylvania'], ['', 'State not set']].map(function (item) {
      return '<option value="' + esc(item[0]) + '"' + (state.roadState === item[0] ? ' selected' : '') + '>' + esc(item[1]) + '</option>';
    }).join('');
    var sortOptions = [['name', 'Sort: Road name'], ['updated', 'Sort: Recently updated'], ['pads', 'Sort: Most linked pads'], ['status', 'Sort: Verification']].map(function (item) {
      return '<option value="' + item[0] + '"' + (state.sort === item[0] ? ' selected' : '') + '>' + item[1] + '</option>';
    }).join('');
    var listHtml = roads.length ? roads.map(function (road) { return roadCard(road, false); }).join('') :
      '<div class="brm-empty"><div class="brm-empty-icon">🛣️</div><h3>No roads match</h3><p>Change the search or filters, or add a new road record.</p><button type="button" class="brm-primary" data-brm-action="add">＋ Add a road</button></div>';

    return '<div class="brm-app">' + header('Road Manager', stats.total + ' roads · ' + stats.linkedPads + ' linked pads', '',
      '<button class="brm-icon-btn" type="button" data-brm-action="tools" aria-label="Road tools">•••</button>') +
      '<main class="brm-body"><div class="brm-container">' + noticeHtml() +
      '<div class="brm-toolbar"><div class="brm-search-wrap"><span class="brm-search-icon">⌕</span><input class="brm-search" id="brm-search" type="search" value="' + esc(state.query) + '" placeholder="Search road, alias, county, pad…" autocomplete="off"><button type="button" class="brm-clear-search" data-brm-action="clear-search" aria-label="Clear search">' + (state.query ? '×' : '') + '</button></div>' +
      '<button type="button" class="brm-primary" data-brm-action="add">＋ <span class="brm-button-label">Add road</span></button></div>' +
      '<div class="brm-stats">' + statCard(stats.total, 'Total roads') + statCard(stats.verified, 'Verified') + statCard(stats.needsCheck, 'Need field check') + statCard(stats.warnings + stats.restrictions, 'Warnings / limits') + '</div>' +
      '<div class="brm-filter-scroll" aria-label="Road filters">' + filters + '</div>' +
      '<div class="brm-advanced"><select class="brm-select" id="brm-type-filter" aria-label="Filter by road type">' + typeOptions + '</select><select class="brm-select" id="brm-state-filter" aria-label="Filter by state">' + stateOptions + '</select><select class="brm-select" id="brm-sort" aria-label="Sort roads">' + sortOptions + '</select></div>' +
      '<div class="brm-result-line"><span>' + roads.length + ' result' + (roads.length === 1 ? '' : 's') + '</span><span>Tap a road for full details</span></div>' +
      '<div class="brm-list">' + listHtml + '</div></div></main></div>';
  }

  function section(title, help, body, action) {
    return '<section class="brm-section"><div class="brm-section-head"><div><div class="brm-section-title">' + esc(title) + '</div>' + (help ? '<div class="brm-section-help">' + esc(help) + '</div>' : '') + '</div>' + (action || '') + '</div>' + body + '</section>';
  }

  function listItems(items, kind, icon) {
    if (!items || !items.length) return '<div class="brm-section-help">None entered.</div>';
    return '<div class="brm-list-block">' + items.map(function (item, index) {
      return '<div class="brm-item"><span class="brm-item-icon">' + icon + '</span><span class="brm-item-copy">' + esc(item) + '</span><button type="button" class="brm-remove-item" data-brm-remove-item="' + esc(kind) + '" data-brm-item-index="' + index + '" aria-label="Remove">×</button></div>';
    }).join('') + '</div>';
  }

  function miniAdd(kind, placeholder) {
    return '<div class="brm-mini-form"><input class="brm-mini-input" id="brm-add-' + esc(kind) + '" placeholder="' + esc(placeholder) + '"><button type="button" class="brm-secondary" data-brm-add-item="' + esc(kind) + '">Add</button></div>';
  }

  function renderDetail() {
    var road = db && db.get ? db.get(state.selectedId) : null;
    if (!road) {
      state.mode = 'list';
      state.selectedId = '';
      return renderList();
    }
    var status = statusInfo(road);
    var pads = road.padIds || [];
    var aliases = road.aliases || [];
    var padHtml = pads.length ? '<div class="brm-pad-chips">' + pads.map(function (padId) {
      var label = normalizeSpace(padId).replace(/[-_]+/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
      return '<a class="brm-pad-chip" href="#/pad/' + encodeURIComponent(padId) + '" data-brm-pad-link="true"><span>📍 ' + esc(label) + '</span><b>›</b></a>';
    }).join('') + '</div>' : '<div class="brm-section-help">No pads are linked to this road yet. Links are added automatically when a pad direction uses this road.</div>';
    var verification = road.verification || {};
    var detail = '<section class="brm-section"><div class="brm-detail-hero"><span class="brm-road-sign brm-detail-sign">' + esc(roadSignText(road)) + '</span><div><div class="brm-detail-name">' + esc(road.officialName) + '</div><div class="brm-detail-sub">' + esc(typeLabel(road.type) + ' · ' + roadLocation(road)) + '</div><div class="brm-badges">' + badge(status.label, status.className) + ((road.warnings || []).length ? badge((road.warnings || []).length + ' warnings', 'warning') : '') + ((road.restrictions || []).length ? badge((road.restrictions || []).length + ' restrictions', 'danger') : '') + '</div></div></div>' +
      '<div class="brm-detail-actions"><button type="button" class="brm-primary" data-brm-action="edit">✎ Edit road</button>' +
      (status.key === 'verified' ? '<button type="button" class="brm-secondary" data-brm-action="needs-check">⚑ Needs field check</button>' : '<button type="button" class="brm-secondary" data-brm-action="verify">✓ Mark verified</button>') +
      '<button type="button" class="brm-secondary" data-brm-action="merge-current">⇄ Merge duplicate</button></div></section>';
    var info = '<div class="brm-info-grid">' +
      '<div class="brm-info"><div class="brm-info-label">Official name</div><div class="brm-info-value">' + esc(road.officialName) + '</div></div>' +
      '<div class="brm-info"><div class="brm-info-label">Display name</div><div class="brm-info-value">' + esc(road.displayName || road.officialName) + '</div></div>' +
      '<div class="brm-info"><div class="brm-info-label">Road type</div><div class="brm-info-value">' + esc(typeLabel(road.type)) + '</div></div>' +
      '<div class="brm-info"><div class="brm-info-label">Route number</div><div class="brm-info-value">' + esc(road.routePrefix && road.routeNumber ? road.routePrefix + '-' + road.routeNumber : 'Not a numbered route') + '</div></div>' +
      '<div class="brm-info"><div class="brm-info-label">Verification</div><div class="brm-info-value">' + esc(status.label) + '</div></div>' +
      '<div class="brm-info"><div class="brm-info-label">Last verified</div><div class="brm-info-value">' + esc(formatDate(verification.lastVerifiedAt)) + '</div></div>' +
      '<div class="brm-info"><div class="brm-info-label">Created</div><div class="brm-info-value">' + esc(formatDate(road.createdAt)) + '</div></div>' +
      '<div class="brm-info"><div class="brm-info-label">Last updated</div><div class="brm-info-value">' + esc(formatDate(road.updatedAt)) + '</div></div></div>';
    var notes = road.notes ? '<div class="brm-item"><span class="brm-item-icon">📝</span><span class="brm-item-copy">' + esc(road.notes) + '</span></div>' : '<div class="brm-section-help">No general road notes entered.</div>';

    return '<div class="brm-app">' + header(road.officialName, status.label + ' · ' + (pads.length || 0) + ' linked pads', 'back-list') +
      '<main class="brm-body"><div class="brm-container">' + noticeHtml() + detail +
      section('Road record', 'The shared information used anywhere this road appears.', info) +
      section('Warnings', 'Temporary hazards, narrow areas, washouts, mud, traffic, or field observations.', listItems(road.warnings || [], 'warnings', '⚠️') + miniAdd('warnings', 'Add a warning…')) +
      section('Truck restrictions', 'Weight limits, no-oversize sections, bridge limits, closures, or company restrictions.', listItems(road.restrictions || [], 'restrictions', '⛔') + miniAdd('restrictions', 'Add a restriction…')) +
      section('Aliases and other names', 'Old names, local names, route numbers, and alternate spellings all point to this record.', listItems(aliases, 'aliases', '🏷️') + miniAdd('aliases', 'Add an alias or old road name…')) +
      section('Linked pads', 'Pads using this road in their saved directions.', padHtml) +
      section('Road notes', 'General information that does not belong under a warning or restriction.', notes) +
      section('Record controls', 'Deleting removes the shared road record but does not delete any pad.', '<button type="button" class="brm-danger-btn" data-brm-action="delete-road">Delete road record</button>') +
      '</div></main></div>';
  }

  function formField(label, name, value, options) {
    options = options || {};
    var full = options.full ? ' full' : '';
    var hint = options.hint ? '<span class="brm-hint">' + esc(options.hint) + '</span>' : '';
    var control;
    if (options.type === 'textarea') {
      control = '<textarea class="brm-textarea" id="brm-field-' + esc(name) + '" name="' + esc(name) + '" placeholder="' + esc(options.placeholder || '') + '">' + esc(value) + '</textarea>';
    } else if (options.type === 'select') {
      control = '<select class="brm-select" id="brm-field-' + esc(name) + '" name="' + esc(name) + '">' + options.html + '</select>';
    } else {
      control = '<input class="brm-input" id="brm-field-' + esc(name) + '" name="' + esc(name) + '" value="' + esc(value) + '" placeholder="' + esc(options.placeholder || '') + '"' + (options.required ? ' required' : '') + '>';
    }
    return '<label class="brm-field' + full + '"><span class="brm-label">' + esc(label) + '</span>' + control + hint + '</label>';
  }

  function renderForm() {
    var editing = state.mode === 'edit';
    var road = editing && db && db.get ? db.get(state.selectedId) : null;
    road = road || { officialName: '', displayName: '', type: 'unknown', state: '', county: '', township: '', aliases: [], warnings: [], restrictions: [], notes: '', verification: { status: 'unverified', needsFieldCheck: false } };
    var typeOptions = Object.keys(ROAD_TYPE_LABELS).map(function (key) {
      return '<option value="' + esc(key) + '"' + (road.type === key ? ' selected' : '') + '>' + esc(ROAD_TYPE_LABELS[key]) + '</option>';
    }).join('');
    var stateOptions = [['', 'Choose state'], ['OH', 'Ohio'], ['WV', 'West Virginia'], ['PA', 'Pennsylvania']].map(function (item) {
      return '<option value="' + esc(item[0]) + '"' + (road.state === item[0] ? ' selected' : '') + '>' + esc(item[1]) + '</option>';
    }).join('');
    var verification = road.verification || {};
    var fields = '<form class="brm-form" id="brm-road-form"><div class="brm-form-grid">' +
      formField('Official road name', 'officialName', road.officialName, { required: true, full: true, placeholder: 'Example: OH-800 or Bean Ridge Rd', hint: 'Use the road sign or official public spelling when known.' }) +
      formField('Display name', 'displayName', road.displayName || road.officialName, { full: true, placeholder: 'How drivers should see the road', hint: 'Usually the same as the official name.' }) +
      formField('Road type', 'type', road.type, { type: 'select', html: typeOptions }) +
      formField('State', 'state', road.state, { type: 'select', html: stateOptions }) +
      formField('County', 'county', road.county, { placeholder: 'Example: Belmont' }) +
      formField('Township', 'township', road.township, { placeholder: 'Example: Goshen' }) +
      formField('Aliases / old names', 'aliases', (road.aliases || []).join('\n'), { type: 'textarea', full: true, placeholder: 'One name per line', hint: 'Include local names, old names, alternate spellings, and numbered-route names.' }) +
      formField('Warnings', 'warnings', (road.warnings || []).join('\n'), { type: 'textarea', full: true, placeholder: 'One warning per line' }) +
      formField('Truck restrictions', 'restrictions', (road.restrictions || []).join('\n'), { type: 'textarea', full: true, placeholder: 'One restriction per line' }) +
      formField('Road notes', 'notes', road.notes, { type: 'textarea', full: true, placeholder: 'Useful road information for drivers' }) +
      '<label class="brm-check-row full"><input type="checkbox" name="verified"' + ((verification.status === 'verified' || verification.officialNameVerified) ? ' checked' : '') + '><span><strong>Official name verified</strong><br><span class="brm-hint">Use this after checking a road sign, county/state source, or reliable field confirmation.</span></span></label>' +
      '<label class="brm-check-row full"><input type="checkbox" name="needsFieldCheck"' + (verification.needsFieldCheck ? ' checked' : '') + '><span><strong>Needs field check</strong><br><span class="brm-hint">Flags this road for a driver to verify in the field.</span></span></label>' +
      '</div><div class="brm-form-actions"><button type="button" class="brm-secondary" data-brm-action="cancel-form">Cancel</button><button type="submit" class="brm-primary">Save road</button></div></form>';
    return '<div class="brm-app">' + header(editing ? 'Edit Road' : 'Add Road', editing ? road.officialName : 'Create one shared road record', editing ? 'back-detail' : (state.addingForPicker ? 'return-picker' : 'back-list')) +
      '<main class="brm-body"><div class="brm-container">' + noticeHtml() + section(editing ? 'Road information' : 'New road information', 'Detailed fields are available, but only the official road name is required.', fields) + '</div></main></div>';
  }

  function renderPicker() {
    var roads = getFilteredRoads();
    var list = roads.length ? roads.map(function (road) { return roadCard(road, true); }).join('') : '<div class="brm-empty"><div class="brm-empty-icon">🛣️</div><h3>No matching road</h3><p>Search another name or add the road first.</p><button type="button" class="brm-primary" data-brm-action="add-from-picker">＋ Add road</button></div>';
    return '<div class="brm-app">' + header(state.pickerTitle || 'Choose a road', 'Selecting a road fills the direction field', 'close-picker') +
      '<main class="brm-body"><div class="brm-container">' + noticeHtml() +
      '<div class="brm-toolbar"><div class="brm-search-wrap"><span class="brm-search-icon">⌕</span><input class="brm-search" id="brm-search" type="search" value="' + esc(state.query) + '" placeholder="Search roads…" autocomplete="off"><button type="button" class="brm-clear-search" data-brm-action="clear-search" aria-label="Clear search">' + (state.query ? '×' : '') + '</button></div><button type="button" class="brm-primary" data-brm-action="add-from-picker">＋ <span class="brm-button-label">Add</span></button></div>' +
      '<div class="brm-result-line"><span>' + roads.length + ' road' + (roads.length === 1 ? '' : 's') + '</span><span>Tap to use</span></div><div class="brm-list">' + list + '</div>' +
      '<div class="brm-picker-footer"><button type="button" class="brm-secondary" data-brm-action="close-picker" style="width:100%">Cancel</button></div></div></main></div>';
  }

  function renderTools() {
    var stats = getStats();
    var groups = duplicateGroups(getRoads());
    var duplicateBody = groups.length ? groups.slice(0, 8).map(function (group) {
      return '<div class="brm-item"><span class="brm-item-icon">⇄</span><span class="brm-item-copy"><strong>' + esc(group[0].officialName) + '</strong><br><span class="brm-section-help">' + group.length + ' records may describe the same road.</span></span><button type="button" class="brm-secondary" data-brm-review-duplicate="' + esc(group.map(function (r) { return r.id; }).join(',')) + '">Review</button></div>';
    }).join('') : '<div class="brm-section-help">No likely duplicate road records were found.</div>';
    var body = section('Database summary', 'The central database is stored on this device and updates automatically from pad directions.', '<div class="brm-info-grid">' +
      '<div class="brm-info"><div class="brm-info-label">Road records</div><div class="brm-info-value">' + stats.total + '</div></div>' +
      '<div class="brm-info"><div class="brm-info-label">Linked pads</div><div class="brm-info-value">' + stats.linkedPads + '</div></div>' +
      '<div class="brm-info"><div class="brm-info-label">Verified</div><div class="brm-info-value">' + stats.verified + '</div></div>' +
      '<div class="brm-info"><div class="brm-info-label">Need field check</div><div class="brm-info-value">' + stats.needsCheck + '</div></div></div>') +
      section('Duplicate review', 'Merge duplicate spellings so all pads use one shared road record.', '<div class="brm-list-block">' + duplicateBody + '</div>') +
      section('Backup and transfer', 'Export a backup before large edits. Import merges records without deleting current roads.', '<div class="brm-detail-actions"><button type="button" class="brm-secondary" data-brm-action="export">↓ Export backup</button><button type="button" class="brm-secondary" data-brm-action="import">↑ Import backup</button><input type="file" id="brm-import-file" accept="application/json,.json" hidden></div>') +
      section('Re-scan current pads', 'Rebuild road links from pad data already stored in BrineSearch.', '<button type="button" class="brm-secondary" data-brm-action="rescan">⟳ Scan pad directions</button>');
    return '<div class="brm-app">' + header('Road Tools', 'Backups, duplicate review, and database maintenance', 'back-list') + '<main class="brm-body"><div class="brm-container">' + noticeHtml() + body + '</div></main></div>';
  }

  function renderMerge(ids) {
    var roads = (ids || []).map(function (id) { return db.get(id); }).filter(Boolean);
    if (roads.length < 2) {
      state.mode = 'tools';
      return renderTools();
    }
    if (!state.mergeKeepId || !roads.some(function (road) { return road.id === state.mergeKeepId; })) state.mergeKeepId = roads[0].id;
    if (!state.mergeRemoveId || state.mergeRemoveId === state.mergeKeepId || !roads.some(function (road) { return road.id === state.mergeRemoveId; })) state.mergeRemoveId = roads[1].id;
    var choices = roads.map(function (road) {
      var status = statusInfo(road);
      return '<label class="brm-duplicate-choice"><input type="radio" name="brm-keeper" value="' + esc(road.id) + '"' + (state.mergeKeepId === road.id ? ' checked' : '') + '><span class="brm-duplicate-choice-copy"><span class="brm-duplicate-choice-name">' + esc(road.officialName) + '</span><span class="brm-duplicate-choice-meta">' + esc(status.label + ' · ' + (road.padIds || []).length + ' linked pads · ' + roadLocation(road)) + '</span></span></label>';
    }).join('');
    return '<div class="brm-app">' + header('Merge Duplicate Roads', 'Choose the record to keep', 'tools') + '<main class="brm-body"><div class="brm-container">' + noticeHtml() +
      section('Keep this record', 'Everything from the other duplicate will be combined into the selected record.', '<div class="brm-duplicate-group">' + choices + '</div>') +
      section('What the merge keeps', '', '<div class="brm-list-block"><div class="brm-item"><span class="brm-item-icon">✓</span><span class="brm-item-copy">All aliases and alternate names</span></div><div class="brm-item"><span class="brm-item-icon">✓</span><span class="brm-item-copy">All linked pads</span></div><div class="brm-item"><span class="brm-item-icon">✓</span><span class="brm-item-copy">All warnings, restrictions, notes, and sources</span></div></div>') +
      '<div class="brm-form-actions"><button type="button" class="brm-secondary" data-brm-action="tools">Cancel</button><button type="button" class="brm-primary" data-brm-action="confirm-merge">Merge records</button></div></div></main></div>';
  }

  function render() {
    ensureMount();
    if (!rootEl) return;
    var html;
    if (state.mode === 'detail') html = renderDetail();
    else if (state.mode === 'add' || state.mode === 'edit') html = renderForm();
    else if (state.mode === 'picker') html = renderPicker();
    else if (state.mode === 'tools') html = renderTools();
    else if (state.mode === 'merge') html = renderMerge(state.mergeIds || []);
    else html = renderList();
    rootEl.innerHTML = html;
    rootEl.setAttribute('data-open', state.open ? 'true' : 'false');
    rootEl.setAttribute('aria-hidden', state.open ? 'false' : 'true');
    if (state.open) {
      if (!rootEl.dataset.overflowSaved) {
        savedHtmlOverflow = root.document.documentElement.style.overflow || '';
        savedBodyOverflow = root.document.body.style.overflow || '';
        rootEl.dataset.overflowSaved = 'true';
      }
      root.document.documentElement.style.overflow = 'hidden';
      root.document.body.style.overflow = 'hidden';
      root.setTimeout(function () {
        var focus = rootEl.querySelector('#brm-search, input, button');
        if (focus) focus.focus({ preventScroll: true });
      }, 30);
    }
  }

  function open(mode, id) {
    if (!db) db = root.BrineSearchRoadDB;
    if (!db) {
      root.setTimeout(function () { open(mode, id); }, 150);
      return;
    }
    db.init && db.init();
    if (!state.open && root.location && root.location.hash && root.location.hash.indexOf('#/roads') !== 0) previousHash = root.location.hash;
    state.open = true;
    state.mode = mode || 'list';
    state.selectedId = id || state.selectedId || '';
    state.notice = '';
    ensureMount();
    render();
  }

  function close(options) {
    options = options || {};
    state.open = false;
    state.mode = 'list';
    state.pickerTarget = null;
    state.query = '';
    if (rootEl) {
      rootEl.setAttribute('data-open', 'false');
      rootEl.setAttribute('aria-hidden', 'true');
    }
    if (root.document) {
      root.document.documentElement.style.overflow = savedHtmlOverflow;
      root.document.body.style.overflow = savedBodyOverflow;
      if (rootEl) delete rootEl.dataset.overflowSaved;
    }
    if (!options.keepHash && root.location && root.location.hash.indexOf('#/roads') === 0) root.location.hash = previousHash || '#/';
  }

  function setNotice(message, kind) {
    state.notice = message || '';
    state.noticeKind = kind || 'success';
  }

  function lines(value) {
    return uniq(String(value || '').split(/\r?\n|;/).map(normalizeSpace));
  }

  function submitRoadForm(form) {
    var data = new root.FormData(form);
    var officialName = normalizeSpace(data.get('officialName'));
    if (!officialName) {
      setNotice('Enter the official road name before saving.', 'error');
      render();
      return;
    }
    var verified = data.get('verified') === 'on';
    var needsFieldCheck = data.get('needsFieldCheck') === 'on';
    var record = {
      officialName: officialName,
      displayName: normalizeSpace(data.get('displayName')) || officialName,
      type: normalizeSpace(data.get('type')) || 'unknown',
      state: normalizeSpace(data.get('state')),
      county: normalizeSpace(data.get('county')),
      township: normalizeSpace(data.get('township')),
      aliases: lines(data.get('aliases')),
      warnings: lines(data.get('warnings')),
      restrictions: lines(data.get('restrictions')),
      notes: normalizeSpace(data.get('notes')),
      verification: {
        status: needsFieldCheck ? 'needs-field-check' : (verified ? 'verified' : 'unverified'),
        needsFieldCheck: needsFieldCheck,
        officialNameVerified: verified && !needsFieldCheck,
        lastVerifiedAt: verified && !needsFieldCheck ? new Date().toISOString() : null,
        lastVerifiedBy: verified && !needsFieldCheck ? 'BrineSearch field verification' : ''
      }
    };
    var saved;
    if (state.mode === 'edit' && state.selectedId) saved = db.update(state.selectedId, record);
    else saved = db.upsert(record, { reason: 'road-manager' });
    if (!saved) {
      setNotice('The road could not be saved. Check the road name and try again.', 'error');
      render();
      return;
    }
    if (state.addingForPicker && state.pickerTarget) {
      var pickerTarget = state.pickerTarget;
      state.addingForPicker = false;
      fillTarget(pickerTarget, saved);
      close({ keepHash: true });
      return;
    }
    state.selectedId = saved.id;
    state.mode = 'detail';
    setNotice('Road saved to the central database.');
    render();
  }

  function addListItem(kind) {
    var road = db.get(state.selectedId);
    var input = rootEl.querySelector('#brm-add-' + kind);
    var value = normalizeSpace(input && input.value);
    if (!road || !value) return;
    if (kind === 'warnings') db.addWarning(road.id, value);
    else if (kind === 'restrictions') db.addRestriction(road.id, value);
    else if (kind === 'aliases') db.addAlias(road.id, value);
    setNotice((kind === 'aliases' ? 'Alias' : kind === 'warnings' ? 'Warning' : 'Restriction') + ' added.');
    render();
  }

  function removeListItem(kind, index) {
    var road = db.get(state.selectedId);
    if (!road) return;
    var values = (road[kind] || []).slice();
    values.splice(index, 1);
    var patch = {};
    patch[kind] = values;
    db.update(road.id, patch);
    setNotice('Item removed.');
    render();
  }

  function verifyRoad(needsCheck) {
    if (!state.selectedId) return;
    db.setVerification(state.selectedId, needsCheck ? {
      status: 'needs-field-check',
      needsFieldCheck: true,
      officialNameVerified: false
    } : {
      status: 'verified',
      needsFieldCheck: false,
      officialNameVerified: true,
      lastVerifiedAt: new Date().toISOString(),
      lastVerifiedBy: 'BrineSearch field verification'
    });
    setNotice(needsCheck ? 'Road flagged for a field check.' : 'Road marked verified.');
    render();
  }

  function mergeRoads(keepId, removeId) {
    var keep = db.get(keepId);
    var remove = db.get(removeId);
    if (!keep || !remove || keep.id === remove.id) return false;
    var keepStatus = statusInfo(keep);
    var removeStatus = statusInfo(remove);
    var verification = keep.verification || {};
    if (keepStatus.key !== 'verified' && removeStatus.key === 'verified') verification = remove.verification || verification;
    var notes = uniq([keep.notes, remove.notes]).join(' · ');
    var patch = {
      aliases: uniq((keep.aliases || []).concat(remove.aliases || [], remove.officialName, remove.displayName)),
      warnings: uniq((keep.warnings || []).concat(remove.warnings || [])),
      restrictions: uniq((keep.restrictions || []).concat(remove.restrictions || [])),
      padIds: uniq((keep.padIds || []).concat(remove.padIds || [])),
      sources: (keep.sources || []).concat(remove.sources || []),
      notes: notes,
      verification: verification,
      county: keep.county || remove.county,
      township: keep.township || remove.township,
      state: keep.state || remove.state,
      type: keep.type === 'unknown' ? remove.type : keep.type
    };
    db.update(keep.id, patch);
    db.remove(remove.id);
    state.selectedId = keep.id;
    state.mode = 'detail';
    setNotice('Duplicate records merged. All linked pads and road details were kept.');
    return true;
  }

  function exportDatabase() {
    try {
      var text = db.export(true);
      var blob = new root.Blob([text], { type: 'application/json' });
      var url = root.URL.createObjectURL(blob);
      var link = root.document.createElement('a');
      link.href = url;
      link.download = 'BrineSearch-Roads-' + new Date().toISOString().slice(0, 10) + '.json';
      root.document.body.appendChild(link);
      link.click();
      link.remove();
      root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
      setNotice('Road database backup exported.');
      render();
    } catch (error) {
      setNotice('The road database backup could not be exported.', 'error');
      render();
    }
  }

  function importDatabase(file) {
    if (!file) return;
    var reader = new root.FileReader();
    reader.onload = function () {
      try {
        db.import(String(reader.result || ''), { replace: false });
        state.mode = 'list';
        setNotice('Road database imported and merged with current roads.');
      } catch (error) {
        setNotice('That file is not a valid BrineSearch road database backup.', 'error');
      }
      render();
    };
    reader.onerror = function () { setNotice('The selected file could not be read.', 'error'); render(); };
    reader.readAsText(file);
  }

  function rescanPads() {
    var total = { padCount: 0, roadLinks: 0 };
    ['pads', 'PADS', 'padData', 'allPads', 'directoryPads', 'fallbackPads', 'records'].forEach(function (key) {
      try {
        if (root[key]) {
          var result = db.ingestPads(root[key], { source: 'road-manager-rescan:' + key });
          total.padCount += result.padCount || 0;
          total.roadLinks += result.roadLinks || 0;
        }
      } catch (error) { /* continue */ }
    });
    try {
      for (var i = 0; i < root.localStorage.length; i += 1) {
        var key = root.localStorage.key(i);
        if (!key || !/(?:brine|pad|road|route|direction)/i.test(key)) continue;
        var raw = root.localStorage.getItem(key);
        if (raw && /^[\[{]/.test(raw.trim())) {
          var result2 = db.ingestPads(JSON.parse(raw), { source: 'road-manager-rescan:' + key });
          total.padCount += result2.padCount || 0;
          total.roadLinks += result2.roadLinks || 0;
        }
      }
    } catch (error2) { /* continue */ }
    setNotice('Pad scan finished: ' + total.padCount + ' pads and ' + total.roadLinks + ' road links reviewed.');
    render();
  }

  function fillTarget(target, road) {
    if (!target || !road) return;
    var current = String(target.value || '');
    var context = ((target.name || '') + ' ' + (target.id || '') + ' ' + (target.placeholder || '') + ' ' + (target.getAttribute('aria-label') || '')).toLowerCase();
    var useWhole = /road.?name|street.?name|route.?name|official.?road/.test(context) || !current.trim();
    if (!useWhole && db.__test && db.__test.roadFromInstruction) {
      var existing = db.__test.roadFromInstruction(current);
      if (existing) target.value = current.replace(existing, road.officialName);
      else target.value = normalizeSpace(current + ' ' + road.officialName);
    } else target.value = road.officialName;
    target.dataset.roadId = road.id;
    target.dataset.roadName = road.officialName;
    ['input', 'change', 'blur'].forEach(function (name) {
      target.dispatchEvent(new root.Event(name, { bubbles: true }));
    });
    try { target.focus(); } catch (error) { /* noop */ }
  }

  function openPicker(target, options) {
    options = options || {};
    if (!target) return;
    state.pickerTarget = target;
    state.pickerTitle = options.title || 'Choose a road';
    state.query = normalizeSpace(options.query || target.value || '');
    state.status = 'all';
    state.type = 'all';
    state.roadState = 'all';
    open('picker');
  }

  function chooseRoad(id) {
    var road = db.get(id);
    var target = state.pickerTarget;
    if (!road || !target) return;
    fillTarget(target, road);
    close({ keepHash: true });
  }

  function bindRootEvents() {
    if (!rootEl) return;
    rootEl.addEventListener('click', function (event) {
      var actionEl = event.target.closest('[data-brm-action]');
      var roadEl = event.target.closest('[data-brm-road]');
      var filterEl = event.target.closest('[data-brm-filter]');
      var addItemEl = event.target.closest('[data-brm-add-item]');
      var removeItemEl = event.target.closest('[data-brm-remove-item]');
      var duplicateEl = event.target.closest('[data-brm-review-duplicate]');
      var padLink = event.target.closest('[data-brm-pad-link]');

      if (padLink) { close({ keepHash: true }); return; }
      if (filterEl) { state.status = filterEl.dataset.brmFilter; render(); return; }
      if (roadEl) {
        if (roadEl.dataset.brmPick === 'true') chooseRoad(roadEl.dataset.brmRoad);
        else { state.selectedId = roadEl.dataset.brmRoad; state.mode = 'detail'; state.notice = ''; render(); }
        return;
      }
      if (addItemEl) { addListItem(addItemEl.dataset.brmAddItem); return; }
      if (removeItemEl) { removeListItem(removeItemEl.dataset.brmRemoveItem, Number(removeItemEl.dataset.brmItemIndex)); return; }
      if (duplicateEl) {
        state.mergeIds = duplicateEl.dataset.brmReviewDuplicate.split(',');
        state.mode = 'merge';
        state.mergeKeepId = '';
        state.mergeRemoveId = '';
        render();
        return;
      }
      if (!actionEl) return;
      var action = actionEl.dataset.brmAction;
      if (action === 'close') close();
      else if (action === 'back-list') { state.mode = 'list'; state.selectedId = ''; state.notice = ''; render(); }
      else if (action === 'back-detail') { state.mode = 'detail'; state.notice = ''; render(); }
      else if (action === 'add') { state.mode = 'add'; state.selectedId = ''; state.notice = ''; render(); }
      else if (action === 'edit') { state.mode = 'edit'; state.notice = ''; render(); }
      else if (action === 'cancel-form') { state.mode = state.addingForPicker ? 'picker' : (state.selectedId ? 'detail' : 'list'); state.addingForPicker = false; state.notice = ''; render(); }
      else if (action === 'return-picker') { state.mode = 'picker'; state.addingForPicker = false; state.notice = ''; render(); }
      else if (action === 'clear-search') { state.query = ''; render(); }
      else if (action === 'verify') verifyRoad(false);
      else if (action === 'needs-check') verifyRoad(true);
      else if (action === 'delete-road') {
        var road = db.get(state.selectedId);
        if (road && root.confirm('Delete the shared road record for “' + road.officialName + '”? Pads will not be deleted.')) {
          db.remove(road.id);
          state.mode = 'list'; state.selectedId = ''; setNotice('Road record deleted.'); render();
        }
      } else if (action === 'tools') { state.mode = 'tools'; state.notice = ''; render(); }
      else if (action === 'merge-current') {
        var selected = db.get(state.selectedId);
        var candidates = getRoads().filter(function (road) {
          return road.id !== state.selectedId && (identity(road.officialName) === identity(selected.officialName) || (road.routePrefix && selected.routePrefix && road.routePrefix === selected.routePrefix && road.routeNumber === selected.routeNumber));
        });
        state.mergeIds = [state.selectedId].concat(candidates.map(function (road) { return road.id; }));
        if (state.mergeIds.length < 2) {
          setNotice('No likely duplicate was found for this road.', 'error');
          render();
        } else { state.mode = 'merge'; state.mergeKeepId = state.selectedId; state.mergeRemoveId = candidates[0].id; render(); }
      } else if (action === 'confirm-merge') {
        var checked = rootEl.querySelector('input[name="brm-keeper"]:checked');
        var keepId = checked ? checked.value : state.mergeKeepId;
        var removeIds = (state.mergeIds || []).filter(function (id) { return id !== keepId; });
        if (!keepId || !removeIds.length) return;
        if (root.confirm('Merge ' + removeIds.length + ' duplicate road record' + (removeIds.length === 1 ? '' : 's') + ' into the selected record?')) {
          removeIds.forEach(function (removeId) { mergeRoads(keepId, removeId); });
          state.selectedId = keepId; state.mode = 'detail'; setNotice('Duplicate records merged successfully.'); render();
        }
      } else if (action === 'export') exportDatabase();
      else if (action === 'import') { var fileInput = rootEl.querySelector('#brm-import-file'); if (fileInput) fileInput.click(); }
      else if (action === 'rescan') rescanPads();
      else if (action === 'close-picker') close({ keepHash: true });
      else if (action === 'add-from-picker') { state.mode = 'add'; state.selectedId = ''; state.addingForPicker = true; state.notice = 'Save the new road and it will be placed into this direction automatically.'; render(); }
    });

    rootEl.addEventListener('input', function (event) {
      if (event.target.id === 'brm-search') {
        state.query = event.target.value;
        var caret = event.target.selectionStart;
        render();
        var input = rootEl.querySelector('#brm-search');
        if (input) { input.focus(); try { input.setSelectionRange(caret, caret); } catch (error) { /* noop */ } }
      }
    });

    rootEl.addEventListener('change', function (event) {
      if (event.target.id === 'brm-type-filter') { state.type = event.target.value; render(); }
      else if (event.target.id === 'brm-state-filter') { state.roadState = event.target.value; render(); }
      else if (event.target.id === 'brm-sort') { state.sort = event.target.value; render(); }
      else if (event.target.id === 'brm-import-file') importDatabase(event.target.files && event.target.files[0]);
      else if (event.target.name === 'brm-keeper') {
        state.mergeKeepId = event.target.value;
        state.mergeRemoveId = (state.mergeIds || []).find(function (id) { return id !== state.mergeKeepId; }) || '';
      }
    });

    rootEl.addEventListener('submit', function (event) {
      if (event.target.id === 'brm-road-form') { event.preventDefault(); submitRoadForm(event.target); }
    });

    rootEl.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (state.mode === 'list' || state.mode === 'picker') close({ keepHash: state.mode === 'picker' });
        else { state.mode = state.selectedId ? 'detail' : 'list'; render(); }
      }
      if (event.key === 'Enter' && event.target.matches('.brm-mini-input')) {
        event.preventDefault();
        var kind = event.target.id.replace('brm-add-', '');
        addListItem(kind);
      }
    });
  }

  function isRoadField(input) {
    if (!input || input.closest('#brm-root') || input.disabled || input.readOnly) return false;
    if (!/^(?:INPUT|TEXTAREA)$/.test(input.tagName)) return false;
    var type = (input.type || 'text').toLowerCase();
    if (!/^(?:text|search|url|tel)?$/.test(type) && input.tagName !== 'TEXTAREA') return false;
    var closestLabel = input.closest('label');
    var labelText = closestLabel ? closestLabel.textContent : '';
    var previous = input.previousElementSibling ? input.previousElementSibling.textContent : '';
    var context = [input.id, input.name, input.placeholder, input.getAttribute('aria-label'), labelText, previous].join(' ').toLowerCase();
    if (!/(?:road|street|route)/.test(context)) return false;
    if (/(?:search|warning|restriction|note|county|township|road manager|road database search)/.test(context)) return false;
    return true;
  }

  function decorateRoadFields(scope) {
    if (!root.document || !scope || !scope.querySelectorAll) return;
    var fields = [];
    if (scope.matches && scope.matches('input,textarea')) fields.push(scope);
    Array.prototype.push.apply(fields, scope.querySelectorAll('input,textarea'));
    fields.forEach(function (input) {
      if (!isRoadField(input) || input.dataset.brmPickerAttached === 'true') return;
      input.dataset.brmPickerAttached = 'true';
      var button = root.document.createElement('button');
      button.type = 'button';
      button.className = 'brm-picker-button';
      button.innerHTML = '<img src="./icons/fm-road-inactive.svg" alt=""> Choose from Road Database';
      button.addEventListener('click', function () { openPicker(input, { title: 'Choose road for directions' }); });
      if (input.parentNode) input.parentNode.insertBefore(button, input.nextSibling);
    });
  }

  function installFieldPicker() {
    if (!root.document || !root.MutationObserver || pickerObserver) return;
    var run = function () {
      var hash = root.location ? root.location.hash : '';
      if (/(?:add|edit|direction|route|pad)/i.test(hash)) decorateRoadFields(root.document);
    };
    run();
    pickerObserver = new root.MutationObserver(function (mutations) {
      var hash = root.location ? root.location.hash : '';
      if (!/(?:add|edit|direction|route|pad)/i.test(hash)) return;
      mutations.forEach(function (mutation) {
        Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
          if (node && node.nodeType === 1) decorateRoadFields(node);
        });
      });
    });
    pickerObserver.observe(root.document.documentElement, { childList: true, subtree: true });
    root.addEventListener('hashchange', function () { root.setTimeout(run, 100); });
  }

  function installSettingsEntry() {
    if (!root.document || !root.MutationObserver || observer) return;
    var place = function () {
      if (!root.location || root.location.hash.indexOf('#/settings') !== 0) return;
      if (root.document.getElementById('brm-settings-launch')) return;
      var sections = root.document.querySelectorAll('.settings-section');
      var target = sections.length ? sections[0] : root.document.querySelector('main');
      if (!target) return;
      var wrap = root.document.createElement('section');
      wrap.id = 'brm-settings-launch';
      wrap.className = 'settings-section';
      wrap.innerHTML = '<button type="button" class="brm-settings-launch"><span class="brm-settings-launch-icon"><img src="./icons/fm-road-inactive.svg" alt=""></span><span class="brm-settings-launch-copy"><span class="brm-settings-launch-title">Road Manager</span><span class="brm-settings-launch-sub">Search, verify, edit, and link shared roads</span></span><span class="brm-settings-launch-arrow">›</span></button>';
      var button = wrap.querySelector('button');
      button.addEventListener('click', function () { previousHash = root.location.hash || '#/settings'; root.location.hash = '#/roads'; });
      target.parentNode.insertBefore(wrap, target);
    };
    place();
    observer = new root.MutationObserver(function () { place(); });
    observer.observe(root.document.documentElement, { childList: true, subtree: true });
    root.addEventListener('hashchange', function () { root.setTimeout(place, 50); });
  }

  function handleHash() {
    if (!root.location) return;
    var hash = root.location.hash || '';
    var match = hash.match(/^#\/roads(?:\/([^/?#]+))?/i);
    if (!match) {
      if (state.open && state.mode !== 'picker') close({ keepHash: true });
      return;
    }
    var id = match[1] ? decodeURIComponent(match[1]) : '';
    open(id ? 'detail' : 'list', id);
  }

  function init() {
    if (mounted) return api;
    mounted = true;
    if (!root.document) return api;
    db = root.BrineSearchRoadDB;
    ensureMount();
    installSettingsEntry();
    installFieldPicker();
    root.addEventListener('hashchange', handleHash);
    root.document.addEventListener('visibilitychange', function () {
      if (!root.document.hidden && state.open) render();
    });
    var connect = function () {
      db = root.BrineSearchRoadDB;
      if (!db) { root.setTimeout(connect, 100); return; }
      db.init && db.init();
      if (db.subscribe) unsub = db.subscribe(function () { if (state.open) render(); });
      handleHash();
    };
    connect();
    return api;
  }

  var api = {
    version: VERSION,
    init: init,
    open: function (id) { open(id ? 'detail' : 'list', id); },
    close: close,
    openPicker: openPicker,
    refresh: render,
    getState: function () { return JSON.parse(JSON.stringify({ open: state.open, mode: state.mode, selectedId: state.selectedId, query: state.query, status: state.status, type: state.type, roadState: state.roadState, sort: state.sort })); },
    destroy: function () {
      if (unsub) unsub();
      if (observer) observer.disconnect();
      if (pickerObserver) pickerObserver.disconnect();
      if (rootEl) rootEl.remove();
      rootEl = null; mounted = false;
    },
    __test: { identity: identity, duplicateGroups: duplicateGroups, statusInfo: statusInfo, roadSearchText: roadSearchText, uniq: uniq }
  };

  if (root && root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
  return api;
});
