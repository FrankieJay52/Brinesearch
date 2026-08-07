/* BrineSearch V16.20 — Central Road Database foundation */
(function (root, factory) {
  'use strict';
  var api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrineSearchRoadDB = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var STORAGE_KEY = 'brinesearch-road-database-v1';
  var STORAGE_BACKUP_KEY = STORAGE_KEY + '-backup';
  var MAX_ALIASES = 40;
  var MAX_WARNINGS = 40;
  var ROAD_TYPES = Object.freeze({
    INTERSTATE: 'interstate',
    US_ROUTE: 'us-route',
    STATE_ROUTE: 'state-route',
    COUNTY_ROUTE: 'county-route',
    TOWNSHIP_ROUTE: 'township-route',
    STREET: 'street',
    LEASE_ROAD: 'lease-road',
    ACCESS_ROAD: 'access-road',
    UNKNOWN: 'unknown'
  });

  var memoryStorage = (function () {
    var values = Object.create(null);
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem: function (key, value) { values[key] = String(value); },
      removeItem: function (key) { delete values[key]; },
      key: function (index) { return Object.keys(values)[index] || null; },
      get length() { return Object.keys(values).length; }
    };
  })();

  function storage() {
    try {
      if (root.localStorage) {
        var probe = '__brinesearch_road_db_probe__';
        root.localStorage.setItem(probe, '1');
        root.localStorage.removeItem(probe);
        return root.localStorage;
      }
    } catch (error) { /* fall through */ }
    return memoryStorage;
  }

  function nowIso() { return new Date().toISOString(); }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function unique(values) {
    var seen = Object.create(null);
    return (values || []).filter(function (value) {
      var key = normalizeWhitespace(value).toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
  function normalizeWhitespace(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }
  function titleCaseWords(value) {
    return normalizeWhitespace(value).toLowerCase().replace(/(^|[\s\-/])([a-z])/g, function (_, boundary, letter) {
      return boundary + letter.toUpperCase();
    }).replace(/\bUs\b/g, 'US').replace(/\bOh\b/g, 'OH').replace(/\bWv\b/g, 'WV').replace(/\bPa\b/g, 'PA')
      .replace(/\bCr\b/g, 'CR').replace(/\bTr\b/g, 'TR').replace(/\bSr\b/g, 'SR').replace(/\bI-(\d+)/g, 'I-$1');
  }
  function slug(value) {
    return normalizeWhitespace(value).toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'road';
  }
  function identityRoadName(value) {
    return normalizeWhitespace(value).toLowerCase()
      .replace(/\b(?:rd|road)\b/g, ' road ')
      .replace(/\b(?:st|street)\b/g, ' street ')
      .replace(/\b(?:ave|avenue)\b/g, ' avenue ')
      .replace(/\b(?:dr|drive)\b/g, ' drive ')
      .replace(/\b(?:ln|lane)\b/g, ' lane ')
      .replace(/\b(?:hwy|highway)\b/g, ' highway ')
      .replace(/\b(?:blvd|boulevard)\b/g, ' boulevard ')
      .replace(/\b(?:trl|trail)\b/g, ' trail ')
      .replace(/\b(?:ct|court)\b/g, ' court ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  function normalizeState(value) {
    var raw = normalizeWhitespace(value).toUpperCase();
    var map = { OHIO: 'OH', PENNSYLVANIA: 'PA', 'WEST VIRGINIA': 'WV' };
    return map[raw] || (/^(OH|PA|WV)$/.test(raw) ? raw : '');
  }
  function normalizeRouteNumber(value) {
    var match = normalizeWhitespace(value).match(/\d+[A-Z]?/i);
    return match ? match[0].toUpperCase() : '';
  }
  function stripTravelLanguage(value) {
    var text = normalizeWhitespace(value)
      .replace(/\b(?:turn|bear|keep|veer|take|continue|head|travel|go|proceed)\s+(?:slight\s+)?(?:left|right|straight)\b\s*/ig, '')
      .replace(/\b(?:north(?:east|west)?|south(?:east|west)?|east|west)bound\b\s*/ig, '')
      .replace(/^(?:north(?:east|west)?|south(?:east|west)?|east|west)\s+(?:on|onto|along)\s+/i, '')
      .replace(/^(?:on|onto|along|toward|towards|follow)\s+/i, '')
      .replace(/\s+for\s+\d+(?:\.\d+)?\s*(?:mi|miles?)\b.*$/i, '')
      .replace(/\s+\d+(?:\.\d+)?\s*(?:mi|miles?)\b.*$/i, '');
    return normalizeWhitespace(text);
  }
  function normalizeRoadDisplay(value) {
    var text = stripTravelLanguage(value)
      .replace(/\bRdcontinue\b/ig, 'Rd Continue')
      .replace(/\bUip\b/ig, 'Up')
      .replace(/\s*\/\s*/g, ' / ')
      .replace(/\bRoad\s+Road\b/ig, 'Road');
    if (!text) return '';
    var stateRoute = text.match(/^(OH|WV|PA|SR)\s*[- ]?\s*(\d+[A-Z]?)(?:\s+(.*))?$/i);
    if (stateRoute) {
      var prefix = stateRoute[1].toUpperCase() === 'SR' ? 'SR' : stateRoute[1].toUpperCase();
      return prefix + '-' + stateRoute[2].toUpperCase() + (stateRoute[3] ? ' ' + titleCaseWords(stateRoute[3]) : '');
    }
    var usRoute = text.match(/^US\s*[- ]?\s*(\d+[A-Z]?)(?:\s+(.*))?$/i);
    if (usRoute) return 'US-' + usRoute[1].toUpperCase() + (usRoute[2] ? ' ' + titleCaseWords(usRoute[2]) : '');
    var interstate = text.match(/^I\s*[- ]?\s*(\d+[A-Z]?)(?:\s+(.*))?$/i);
    if (interstate) return 'I-' + interstate[1].toUpperCase() + (interstate[2] ? ' ' + titleCaseWords(interstate[2]) : '');
    var localRoute = text.match(/^(CR|TR)\s*[- ]?\s*(\d+[A-Z]?)(?:\s+(.*))?$/i);
    if (localRoute) return localRoute[1].toUpperCase() + '-' + localRoute[2].toUpperCase() + (localRoute[3] ? ' ' + titleCaseWords(localRoute[3]) : '');
    return titleCaseWords(text);
  }

  function classifyRoad(name, hint) {
    var text = normalizeWhitespace(name);
    var lower = text.toLowerCase();
    var hinted = normalizeWhitespace(hint).toLowerCase();
    if (/\b(?:interstate|i\s*[- ]?\s*\d+)/i.test(text) || hinted === ROAD_TYPES.INTERSTATE) return ROAD_TYPES.INTERSTATE;
    if (/\b(?:u\.?s\.?|us)\s*[- ]?\s*\d+/i.test(text) || hinted === ROAD_TYPES.US_ROUTE) return ROAD_TYPES.US_ROUTE;
    if (/\b(?:oh|wv|pa|sr|state\s+(?:route|road))\s*[- ]?\s*\d+/i.test(text) || hinted === ROAD_TYPES.STATE_ROUTE) return ROAD_TYPES.STATE_ROUTE;
    if (/\b(?:cr|county\s+(?:route|road))\s*[- ]?\s*\d+/i.test(text) || hinted === ROAD_TYPES.COUNTY_ROUTE) return ROAD_TYPES.COUNTY_ROUTE;
    if (/\b(?:tr|township\s+(?:route|road))\s*[- ]?\s*\d+/i.test(text) || hinted === ROAD_TYPES.TOWNSHIP_ROUTE) return ROAD_TYPES.TOWNSHIP_ROUTE;
    if (/\blease\s+(?:road|rd)\b/i.test(text) || hinted === ROAD_TYPES.LEASE_ROAD) return ROAD_TYPES.LEASE_ROAD;
    if (/\b(?:access|private|haul)\s+(?:road|rd)\b/i.test(text) || hinted === ROAD_TYPES.ACCESS_ROAD) return ROAD_TYPES.ACCESS_ROAD;
    if (/\b(?:road|rd|street|st|avenue|ave|drive|dr|lane|ln|highway|hwy|pike|boulevard|blvd|way|trail|trl|circle|ct|court)\b/i.test(lower)) return ROAD_TYPES.STREET;
    return ROAD_TYPES.UNKNOWN;
  }

  function parseRoad(value, context) {
    context = context || {};
    var original = normalizeWhitespace(value);
    if (!original) return null;
    var display = normalizeRoadDisplay(original);
    if (!display) return null;
    var type = classifyRoad(display, context.type);
    var routeMatch = display.match(/^(I|US|OH|WV|PA|SR|CR|TR)-?(\d+[A-Z]?)/i);
    var routePrefix = routeMatch ? routeMatch[1].toUpperCase() : '';
    var routeNumber = routeMatch ? routeMatch[2].toUpperCase() : '';
    var state = normalizeState(context.state);
    if (!state && /^(OH)-/i.test(display)) state = 'OH';
    if (!state && /^(WV)-/i.test(display)) state = 'WV';
    if (!state && /^(PA)-/i.test(display)) state = 'PA';
    var keyName = routeMatch ? routePrefix + '-' + routeNumber : identityRoadName(display);
    var canonicalKey = [type, state || 'multi', slug(keyName)].join(':');
    return {
      originalName: original,
      displayName: display,
      officialName: normalizeRoadDisplay(context.officialName || display),
      type: type,
      routePrefix: routePrefix,
      routeNumber: routeNumber,
      state: state,
      county: normalizeWhitespace(context.county),
      township: normalizeWhitespace(context.township),
      canonicalKey: canonicalKey
    };
  }

  function defaultVerification(needsFieldCheck) {
    return {
      status: needsFieldCheck ? 'needs-field-check' : 'unverified',
      officialNameVerified: false,
      aliasesVerified: false,
      warningsVerified: false,
      needsFieldCheck: !!needsFieldCheck,
      lastVerifiedAt: null,
      lastVerifiedBy: ''
    };
  }
  function emptyDatabase() {
    var time = nowIso();
    return { schemaVersion: 1, appVersion: '16.20', createdAt: time, updatedAt: time, roads: {}, aliases: {}, stats: { roadCount: 0, linkedPadCount: 0, lastMigrationAt: null } };
  }
  function sanitizeArray(values, max) {
    return unique((Array.isArray(values) ? values : values ? [values] : []).map(normalizeWhitespace)).slice(0, max || 40);
  }
  function sanitizeRecord(record) {
    var parsed = parseRoad(record.officialName || record.displayName || record.name || '', record);
    if (!parsed) return null;
    var time = nowIso();
    var verification = Object.assign(defaultVerification(false), record.verification || {});
    verification.needsFieldCheck = !!verification.needsFieldCheck || verification.status === 'needs-field-check';
    if (verification.needsFieldCheck) verification.status = 'needs-field-check';
    return {
      id: normalizeWhitespace(record.id) || 'road-' + slug(parsed.canonicalKey),
      canonicalKey: parsed.canonicalKey,
      officialName: parsed.officialName || parsed.displayName,
      displayName: parsed.displayName,
      type: parsed.type,
      routePrefix: parsed.routePrefix,
      routeNumber: parsed.routeNumber,
      state: parsed.state,
      county: normalizeWhitespace(record.county || parsed.county),
      township: normalizeWhitespace(record.township || parsed.township),
      aliases: sanitizeArray([parsed.originalName].concat(record.aliases || []), MAX_ALIASES),
      warnings: sanitizeArray(record.warnings, MAX_WARNINGS),
      restrictions: sanitizeArray(record.restrictions, MAX_WARNINGS),
      notes: normalizeWhitespace(record.notes),
      verification: verification,
      padIds: sanitizeArray(record.padIds, 500),
      sources: Array.isArray(record.sources) ? record.sources.slice(0, 100) : [],
      createdAt: record.createdAt || time,
      updatedAt: time
    };
  }

  var db = loadDatabase();
  var listeners = [];
  var saveTimer = null;
  var initialized = false;
  var originalStorageSetItem = null;

  function loadDatabase() {
    var raw = null;
    try { raw = storage().getItem(STORAGE_KEY); } catch (error) { raw = null; }
    if (!raw) return emptyDatabase();
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.schemaVersion !== 1 || !parsed.roads) return emptyDatabase();
      parsed.aliases = parsed.aliases || {};
      parsed.stats = parsed.stats || {};
      return parsed;
    } catch (error) {
      try { storage().setItem(STORAGE_BACKUP_KEY, raw); } catch (ignored) { /* noop */ }
      return emptyDatabase();
    }
  }
  function rebuildAliases() {
    var map = {};
    Object.keys(db.roads).forEach(function (id) {
      var road = db.roads[id];
      [road.officialName, road.displayName].concat(road.aliases || []).forEach(function (name) {
        var key = aliasKey(name, road.state);
        if (key) map[key] = id;
        var globalKey = aliasKey(name, '');
        if (globalKey && !map[globalKey]) map[globalKey] = id;
      });
    });
    db.aliases = map;
  }
  function recalculateStats() {
    var pads = Object.create(null);
    Object.keys(db.roads).forEach(function (id) {
      (db.roads[id].padIds || []).forEach(function (padId) { pads[padId] = true; });
    });
    db.stats = db.stats || {};
    db.stats.roadCount = Object.keys(db.roads).length;
    db.stats.linkedPadCount = Object.keys(pads).length;
  }
  function persistNow() {
    saveTimer = null;
    db.updatedAt = nowIso();
    rebuildAliases();
    recalculateStats();
    try {
      storage().setItem(STORAGE_KEY, JSON.stringify(db));
      emit('saved', { stats: clone(db.stats) });
      return true;
    } catch (error) {
      emit('error', { operation: 'save', message: error && error.message ? error.message : String(error) });
      return false;
    }
  }
  function scheduleSave() {
    if (saveTimer) return;
    var later = root.setTimeout || setTimeout;
    saveTimer = later(persistNow, 80);
  }
  function aliasKey(name, state) {
    var display = normalizeRoadDisplay(name);
    if (!display) return '';
    return [normalizeState(state) || 'multi', slug(display)].join(':');
  }
  function findIdByParsed(parsed) {
    if (!parsed) return '';
    var direct = Object.keys(db.roads).find(function (id) { return db.roads[id].canonicalKey === parsed.canonicalKey; });
    if (direct) return direct;
    return db.aliases[aliasKey(parsed.displayName, parsed.state)] || db.aliases[aliasKey(parsed.displayName, '')] || '';
  }
  function createUniqueId(parsed) {
    var base = 'road-' + slug(parsed.canonicalKey);
    var id = base;
    var index = 2;
    while (db.roads[id]) { id = base + '-' + index; index += 1; }
    return id;
  }
  function mergeRecord(existing, incoming) {
    var merged = Object.assign({}, existing);
    var oldOfficial = existing.officialName;
    if (incoming.officialName && incoming.officialName !== existing.officialName) {
      if (incoming.verification && incoming.verification.officialNameVerified) merged.officialName = incoming.officialName;
      else merged.aliases = sanitizeArray((merged.aliases || []).concat(incoming.officialName), MAX_ALIASES);
    }
    merged.displayName = incoming.displayName || merged.displayName;
    merged.type = incoming.type !== ROAD_TYPES.UNKNOWN ? incoming.type : merged.type;
    merged.routePrefix = incoming.routePrefix || merged.routePrefix;
    merged.routeNumber = incoming.routeNumber || merged.routeNumber;
    merged.state = incoming.state || merged.state;
    merged.county = incoming.county || merged.county;
    merged.township = incoming.township || merged.township;
    merged.aliases = sanitizeArray((merged.aliases || []).concat(incoming.aliases || [], oldOfficial || []), MAX_ALIASES);
    merged.warnings = sanitizeArray((merged.warnings || []).concat(incoming.warnings || []), MAX_WARNINGS);
    merged.restrictions = sanitizeArray((merged.restrictions || []).concat(incoming.restrictions || []), MAX_WARNINGS);
    merged.padIds = sanitizeArray((merged.padIds || []).concat(incoming.padIds || []), 500);
    merged.sources = (merged.sources || []).concat(incoming.sources || []).slice(-100);
    merged.notes = incoming.notes || merged.notes;
    merged.verification = Object.assign({}, merged.verification || defaultVerification(false), incoming.verification || {});
    if ((incoming.verification || {}).needsFieldCheck) {
      merged.verification.needsFieldCheck = true;
      merged.verification.status = 'needs-field-check';
    }
    merged.updatedAt = nowIso();
    return merged;
  }

  function upsertRoad(record, options) {
    options = options || {};
    var clean = sanitizeRecord(record || {});
    if (!clean) return null;
    var parsed = parseRoad(clean.officialName || clean.displayName, clean);
    var aliasMatch = '';
    (clean.aliases || []).some(function (alias) {
      aliasMatch = findIdByParsed(parseRoad(alias, clean));
      return !!aliasMatch;
    });
    var id = normalizeWhitespace(options.id || record.id) || findIdByParsed(parsed) || aliasMatch || createUniqueId(parsed);
    clean.id = id;
    if (db.roads[id]) clean = mergeRecord(db.roads[id], clean);
    db.roads[id] = clean;
    rebuildAliases();
    scheduleSave();
    emit('road-updated', { road: clone(clean), reason: options.reason || (record.id ? 'updated' : 'upserted') });
    return clone(clean);
  }
  function getRoad(id) { return db.roads[id] ? clone(db.roads[id]) : null; }
  function getAllRoads(filters) {
    filters = filters || {};
    return Object.keys(db.roads).map(function (id) { return clone(db.roads[id]); }).filter(function (road) {
      if (filters.type && road.type !== filters.type) return false;
      if (filters.state && road.state !== normalizeState(filters.state)) return false;
      if (filters.needsFieldCheck != null && !!road.verification.needsFieldCheck !== !!filters.needsFieldCheck) return false;
      if (filters.padId && (road.padIds || []).indexOf(String(filters.padId)) === -1) return false;
      return true;
    }).sort(function (a, b) { return a.officialName.localeCompare(b.officialName); });
  }
  function findRoad(name, context) {
    var parsed = parseRoad(name, context || {});
    var id = findIdByParsed(parsed);
    return id ? getRoad(id) : null;
  }
  function resolveName(name, context) {
    var road = findRoad(name, context || {});
    return road ? road.officialName : normalizeRoadDisplay(name);
  }
  function updateRoad(id, patch) {
    if (!db.roads[id]) return null;
    patch = patch || {};
    var current = db.roads[id];
    var candidate = Object.assign({}, current, patch, { id: id });
    if (patch.officialName && patch.officialName !== current.officialName) {
      candidate.aliases = sanitizeArray((current.aliases || []).concat(current.officialName, patch.aliases || []), MAX_ALIASES);
    }
    var clean = sanitizeRecord(candidate);
    clean.id = id;
    db.roads[id] = clean;
    rebuildAliases();
    scheduleSave();
    emit('road-updated', { road: clone(clean), reason: 'updated' });
    return clone(clean);
  }
  function removeRoad(id) {
    if (!db.roads[id]) return false;
    var removed = clone(db.roads[id]);
    delete db.roads[id];
    rebuildAliases();
    scheduleSave();
    emit('road-removed', { road: removed });
    return true;
  }
  function addAlias(id, alias) {
    if (!db.roads[id]) return null;
    db.roads[id].aliases = sanitizeArray((db.roads[id].aliases || []).concat(alias), MAX_ALIASES);
    db.roads[id].updatedAt = nowIso();
    rebuildAliases();
    scheduleSave();
    emit('road-updated', { road: clone(db.roads[id]), reason: 'alias-added' });
    return clone(db.roads[id]);
  }
  function linkPad(id, padId) {
    if (!db.roads[id] || !normalizeWhitespace(padId)) return null;
    db.roads[id].padIds = sanitizeArray((db.roads[id].padIds || []).concat(String(padId)), 500);
    db.roads[id].updatedAt = nowIso();
    scheduleSave();
    return clone(db.roads[id]);
  }
  function unlinkPad(id, padId) {
    if (!db.roads[id]) return null;
    db.roads[id].padIds = (db.roads[id].padIds || []).filter(function (value) { return value !== String(padId); });
    db.roads[id].updatedAt = nowIso();
    scheduleSave();
    return clone(db.roads[id]);
  }
  function setVerification(id, verification) {
    if (!db.roads[id]) return null;
    var merged = Object.assign({}, db.roads[id].verification || defaultVerification(false), verification || {});
    merged.needsFieldCheck = !!merged.needsFieldCheck;
    if (merged.needsFieldCheck) merged.status = 'needs-field-check';
    else if (merged.status === 'verified') {
      merged.officialNameVerified = true;
      merged.lastVerifiedAt = merged.lastVerifiedAt || nowIso();
    }
    db.roads[id].verification = merged;
    db.roads[id].updatedAt = nowIso();
    scheduleSave();
    emit('road-updated', { road: clone(db.roads[id]), reason: 'verification' });
    return clone(db.roads[id]);
  }
  function addWarning(id, warning) {
    if (!db.roads[id]) return null;
    db.roads[id].warnings = sanitizeArray((db.roads[id].warnings || []).concat(warning), MAX_WARNINGS);
    db.roads[id].updatedAt = nowIso();
    scheduleSave();
    emit('road-updated', { road: clone(db.roads[id]), reason: 'warning-added' });
    return clone(db.roads[id]);
  }
  function addRestriction(id, restriction) {
    if (!db.roads[id]) return null;
    db.roads[id].restrictions = sanitizeArray((db.roads[id].restrictions || []).concat(restriction), MAX_WARNINGS);
    db.roads[id].updatedAt = nowIso();
    scheduleSave();
    emit('road-updated', { road: clone(db.roads[id]), reason: 'restriction-added' });
    return clone(db.roads[id]);
  }

  function looksRoadLike(value) {
    var text = normalizeWhitespace(value);
    if (!text || text.length > 180) return false;
    if (/^(?:none|n\/a|unknown|pad|destination|arrive)$/i.test(text)) return false;
    if (/\b(?:I|US|OH|WV|PA|SR|CR|TR)\s*[- ]?\s*\d+/i.test(text)) return true;
    if (/\b(?:road|rd|street|st|avenue|ave|drive|dr|lane|ln|highway|hwy|pike|boulevard|blvd|way|route|lease road|access road)\b/i.test(text)) return true;
    return false;
  }
  function roadFromInstruction(value) {
    var text = normalizeWhitespace(value);
    if (!text) return '';
    var match = text.match(/\b(?:onto|on|follow|along|becomes|continue\s+on|continue\s+to\s+follow)\s+(.+?)(?:\s+for\s+\d|\s+\d+(?:\.\d+)?\s*(?:mi|miles?)|$)/i);
    var candidate = match ? match[1] : text;
    candidate = candidate.replace(/^(?:north(?:east|west)?|south(?:east|west)?|east|west)\s+/i, '');
    return looksRoadLike(candidate) ? normalizeWhitespace(candidate) : '';
  }
  function getPadId(pad, index) {
    if (!pad || typeof pad !== 'object') return 'pad-' + index;
    var direct = pad.id || pad.record_id || pad.recordId || pad.padId || pad.slug || pad.key;
    if (direct) return String(direct);
    var operator = pad.operator || pad.company || pad.operatorName || '';
    var name = pad.name || pad.padName || pad.title || pad.facilityName || '';
    return slug([operator, name].filter(Boolean).join('--') || 'pad-' + index);
  }
  function getContext(pad) {
    return {
      state: pad && (pad.state || pad.stateCode || (pad.location && pad.location.state)),
      county: pad && (pad.county || (pad.location && pad.location.county)),
      township: pad && (pad.township || (pad.location && pad.location.township))
    };
  }
  function collectRoadCandidates(value, results, depth, seen) {
    if (depth > 7 || value == null) return;
    if (typeof value === 'string') {
      var road = roadFromInstruction(value);
      if (road) results.push(road);
      return;
    }
    if (typeof value !== 'object') return;
    if (seen.indexOf(value) !== -1) return;
    seen.push(value);
    if (Array.isArray(value)) {
      value.forEach(function (item) { collectRoadCandidates(item, results, depth + 1, seen); });
      return;
    }
    ['roadName', 'road', 'street', 'streetName', 'routeName', 'officialRoadName', 'name'].forEach(function (key) {
      if (typeof value[key] === 'string' && looksRoadLike(value[key])) results.push(value[key]);
    });
    ['instruction', 'text', 'display', 'direction', 'step'].forEach(function (key) {
      if (typeof value[key] === 'string') {
        var road = roadFromInstruction(value[key]);
        if (road) results.push(road);
      }
    });
    Object.keys(value).forEach(function (key) {
      if (/^(?:directions?|roads?|routes?|steps?|primaryRoute|alternateRoutes?|roadSequence|truckDirections)$/i.test(key)) {
        collectRoadCandidates(value[key], results, depth + 1, seen);
      }
    });
  }
  function ingestPad(pad, options) {
    options = options || {};
    if (!pad || typeof pad !== 'object') return { padId: '', roads: [] };
    var padId = getPadId(pad, options.index || 0);
    var context = getContext(pad);
    var candidates = [];
    collectRoadCandidates(pad, candidates, 0, []);
    var roads = [];
    unique(candidates).forEach(function (name) {
      var record = upsertRoad({
        officialName: name,
        displayName: name,
        state: context.state,
        county: context.county,
        township: context.township,
        aliases: [name],
        padIds: [padId],
        sources: [{ type: options.source || 'pad', padId: padId, capturedAt: nowIso() }]
      }, { reason: 'pad-ingest' });
      if (record) roads.push(record.id);
    });
    return { padId: padId, roads: roads };
  }
  function findPadCollections(value, out, depth, seen) {
    if (depth > 6 || value == null || typeof value !== 'object') return;
    if (seen.indexOf(value) !== -1) return;
    seen.push(value);
    if (Array.isArray(value)) {
      var padScore = value.slice(0, 10).filter(function (item) {
        return item && typeof item === 'object' && (item.padName || item.name || item.operator || item.company) && (item.directions || item.roads || item.route || item.roadSequence || item.primaryRoute);
      }).length;
      if (padScore) out.push(value);
      value.forEach(function (item) { findPadCollections(item, out, depth + 1, seen); });
      return;
    }
    Object.keys(value).forEach(function (key) {
      if (/pads?|records?|results?|data|locations?/i.test(key)) findPadCollections(value[key], out, depth + 1, seen);
    });
  }
  function ingestPads(value, options) {
    options = options || {};
    var collections = [];
    findPadCollections(value, collections, 0, []);
    if (Array.isArray(value)) collections.unshift(value);
    var seenPads = Object.create(null);
    var padCount = 0;
    var links = 0;
    collections.forEach(function (collection) {
      collection.forEach(function (pad, index) {
        if (!pad || typeof pad !== 'object') return;
        var id = getPadId(pad, index);
        if (seenPads[id]) return;
        seenPads[id] = true;
        var result = ingestPad(pad, { index: index, source: options.source || 'pad-collection' });
        if (result.roads.length) { padCount += 1; links += result.roads.length; }
      });
    });
    db.stats.lastMigrationAt = nowIso();
    scheduleSave();
    emit('migration-complete', { source: options.source || 'pads', padCount: padCount, roadLinks: links, roadCount: Object.keys(db.roads).length });
    return { padCount: padCount, roadLinks: links, roadCount: Object.keys(db.roads).length };
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = '';
    var quoted = false;
    for (var index = 0; index < text.length; index += 1) {
      var char = text[index];
      var next = text[index + 1];
      if (char === '"' && quoted && next === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { row.push(field); field = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') index += 1;
        row.push(field); field = '';
        if (row.some(function (item) { return item !== ''; })) rows.push(row);
        row = [];
      } else field += char;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    var headers = rows.shift().map(function (value) { return normalizeWhitespace(value); });
    return rows.map(function (values) {
      var object = {};
      headers.forEach(function (header, i) { object[header] = values[i] || ''; });
      return object;
    });
  }
  function ingestRoadReviewCsv(text) {
    var count = 0;
    parseCsv(text || '').forEach(function (row) {
      var name = row.standardized_display || row.original_step;
      var roadName = roadFromInstruction(name) || name;
      if (!looksRoadLike(roadName)) return;
      var reason = normalizeWhitespace(row.review_reason);
      var needsFieldCheck = /verify|verification|review|source/i.test(reason);
      var record = upsertRoad({
        officialName: roadName,
        displayName: roadName,
        state: row.state,
        aliases: [row.original_step, row.standardized_display],
        padIds: [row.record_id],
        notes: reason,
        verification: defaultVerification(needsFieldCheck),
        sources: [{ type: 'road-name-review', padId: row.record_id, capturedAt: nowIso() }]
      }, { reason: 'road-review-import' });
      if (record) count += 1;
    });
    return count;
  }

  function exportDatabase(pretty) { return JSON.stringify(db, null, pretty ? 2 : 0); }
  function importDatabase(value, options) {
    options = options || {};
    var incoming = typeof value === 'string' ? JSON.parse(value) : clone(value);
    if (!incoming || incoming.schemaVersion !== 1 || !incoming.roads) throw new Error('Unsupported BrineSearch road database format.');
    if (options.replace) db = emptyDatabase();
    Object.keys(incoming.roads).forEach(function (id) { upsertRoad(incoming.roads[id], { id: id, reason: 'database-import' }); });
    persistNow();
    return getStats();
  }
  function resetDatabase() {
    db = emptyDatabase();
    persistNow();
    emit('reset', { stats: clone(db.stats) });
    return getStats();
  }
  function getStats() { recalculateStats(); return clone(db.stats); }
  function snapshot() { rebuildAliases(); recalculateStats(); return clone(db); }

  function transformRoadNames(value, context) {
    if (typeof value === 'string') {
      var road = roadFromInstruction(value);
      if (!road) return value;
      var resolved = resolveName(road, context || {});
      return road === value ? resolved : value.replace(road, resolved);
    }
    if (!value || typeof value !== 'object') return value;
    var copy = Array.isArray(value) ? [] : {};
    Object.keys(value).forEach(function (key) {
      if (/^(?:road|roadName|street|streetName|routeName|officialRoadName)$/i.test(key) && typeof value[key] === 'string') copy[key] = resolveName(value[key], context || value);
      else copy[key] = transformRoadNames(value[key], context || value);
    });
    return copy;
  }

  function emit(type, detail) {
    listeners.slice().forEach(function (listener) {
      try { listener(type, clone(detail)); } catch (error) { /* listener isolation */ }
    });
    try {
      if (root.dispatchEvent && typeof root.CustomEvent === 'function') root.dispatchEvent(new root.CustomEvent('brinesearch:road-db-' + type, { detail: clone(detail) }));
    } catch (error) { /* noop */ }
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.push(listener);
    return function () { listeners = listeners.filter(function (item) { return item !== listener; }); };
  }

  function decorateRoadElements(scope) {
    if (!scope || !scope.querySelectorAll) return;
    var selectors = '[data-road-name], .road-name, .direction-road, .route-road-name, .road-sign, .street-sign';
    var elements = [];
    if (scope.matches && scope.matches(selectors)) elements.push(scope);
    Array.prototype.push.apply(elements, scope.querySelectorAll(selectors));
    elements.forEach(function (element) {
      if (!element || element.children.length > 2) return;
      var source = element.getAttribute('data-road-name') || normalizeWhitespace(element.textContent);
      if (!source || source.length > 100) return;
      var road = findRoad(source, { state: element.getAttribute('data-state') || '' });
      if (!road || road.officialName === source) return;
      if (element.getAttribute('data-road-db-original') == null) element.setAttribute('data-road-db-original', source);
      if (element.children.length === 0) element.textContent = road.officialName;
      element.setAttribute('data-road-id', road.id);
      element.setAttribute('data-road-name', road.officialName);
    });
  }
  function installDomBridge() {
    if (!root.document || !root.MutationObserver) return;
    var start = function () {
      decorateRoadElements(root.document);
      var observer = new root.MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
            if (node && node.nodeType === 1) decorateRoadElements(node);
          });
        });
      });
      observer.observe(root.document.documentElement, { childList: true, subtree: true });
      subscribe(function (type) { if (type === 'road-updated') decorateRoadElements(root.document); });
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
  function installStorageBridge() {
    try {
      if (!root.Storage || !root.localStorage || originalStorageSetItem) return;
      originalStorageSetItem = root.Storage.prototype.setItem;
      root.Storage.prototype.setItem = function (key, value) {
        var result = originalStorageSetItem.apply(this, arguments);
        if (this === root.localStorage && key !== STORAGE_KEY && /(?:brine|pad|road|route|direction)/i.test(String(key)) && typeof value === 'string' && /^[\[{]/.test(value.trim())) {
          (root.setTimeout || setTimeout)(function () {
            try { ingestPads(JSON.parse(value), { source: 'local-storage:' + key }); } catch (error) { /* non-pad JSON */ }
          }, 0);
        }
        return result;
      };
    } catch (error) { /* safe fallback */ }
  }
  function inspectExistingStorage() {
    var store = storage();
    for (var index = 0; index < store.length; index += 1) {
      var key = store.key(index);
      if (!key || key === STORAGE_KEY || !/(?:brine|pad|road|route|direction)/i.test(key)) continue;
      try {
        var raw = store.getItem(key);
        if (raw && /^[\[{]/.test(raw.trim())) ingestPads(JSON.parse(raw), { source: 'existing-storage:' + key });
      } catch (error) { /* ignore unrelated or inaccessible values */ }
    }
  }
  function ingestKnownGlobals() {
    ['pads', 'PADS', 'padData', 'allPads', 'directoryPads', 'fallbackPads', 'records'].forEach(function (key) {
      try { if (root[key]) ingestPads(root[key], { source: 'window:' + key }); } catch (error) { /* noop */ }
    });
  }
  function fetchSeedData() {
    if (typeof root.fetch !== 'function') return Promise.resolve([]);
    var jobs = [
      root.fetch('./road_name_review.csv', { cache: 'no-cache' }).then(function (response) { return response.ok ? response.text() : ''; }).then(ingestRoadReviewCsv).catch(function () { return 0; }),
      root.fetch('./pad-fallback-data.json', { cache: 'force-cache' }).then(function (response) { return response.ok ? response.json() : null; }).then(function (data) { return data ? ingestPads(data, { source: 'pad-fallback-data' }) : null; }).catch(function () { return null; })
    ];
    return Promise.all(jobs);
  }
  function bindAppEvents() {
    if (!root.addEventListener) return;
    ['brinesearch:pads-loaded', 'brinesearch:pad-saved', 'brinesearch:pad-updated'].forEach(function (name) {
      root.addEventListener(name, function (event) {
        var detail = event && event.detail;
        if (!detail) return;
        if (name === 'brinesearch:pads-loaded') ingestPads(detail.pads || detail, { source: name });
        else ingestPad(detail.pad || detail, { source: name });
      });
    });
    root.addEventListener('storage', function (event) {
      if (event.key === STORAGE_KEY && event.newValue) {
        try { db = JSON.parse(event.newValue); rebuildAliases(); emit('external-update', { stats: getStats() }); } catch (error) { /* noop */ }
      }
    });
  }
  function init() {
    if (initialized) return api;
    initialized = true;
    rebuildAliases();
    recalculateStats();
    installStorageBridge();
    bindAppEvents();
    installDomBridge();
    var idle = root.requestIdleCallback || function (callback) { return (root.setTimeout || setTimeout)(callback, 250); };
    idle(function () {
      inspectExistingStorage();
      ingestKnownGlobals();
      fetchSeedData().then(function () {
        persistNow();
        emit('ready', { version: VERSION, stats: getStats() });
      });
    });
    return api;
  }

  var api = {
    version: VERSION,
    schemaVersion: 1,
    storageKey: STORAGE_KEY,
    roadTypes: ROAD_TYPES,
    init: init,
    parseRoad: parseRoad,
    classifyRoad: classifyRoad,
    normalizeRoadName: normalizeRoadDisplay,
    upsert: upsertRoad,
    update: updateRoad,
    remove: removeRoad,
    get: getRoad,
    getAll: getAllRoads,
    find: findRoad,
    resolveName: resolveName,
    addAlias: addAlias,
    linkPad: linkPad,
    unlinkPad: unlinkPad,
    setVerification: setVerification,
    addWarning: addWarning,
    addRestriction: addRestriction,
    ingestPad: ingestPad,
    ingestPads: ingestPads,
    ingestRoadReviewCsv: ingestRoadReviewCsv,
    transformRoadNames: transformRoadNames,
    export: exportDatabase,
    import: importDatabase,
    reset: resetDatabase,
    getStats: getStats,
    snapshot: snapshot,
    save: persistNow,
    subscribe: subscribe,
    decorate: decorateRoadElements,
    __test: { roadFromInstruction: roadFromInstruction, looksRoadLike: looksRoadLike, parseCsv: parseCsv, slug: slug }
  };

  if (root && root.document) init();
  return api;
});
