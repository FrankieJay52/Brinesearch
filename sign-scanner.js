/* BrineSearch V16.22 — Scan Front Sign
 * Camera capture, on-device OCR, review-before-apply, pad-page card,
 * and Edit Pad field population.
 */
(function () {
  'use strict';

  var VERSION = '16.22';
  var STORAGE_KEY = 'brinesearch-sign-scans-v1';
  var TESSERACT_LOCAL = './vendor/tesseract/tesseract.min.js';
  var TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  var ENTRY_ID = 'bs-sign-scan-entry';
  var CARD_ID = 'bs-sign-scan-card';
  var MODAL_ID = 'bs-sign-scan-modal';
  var INPUT_ID = 'bs-sign-scan-file';
  var MAX_RECORDS = 100;
  var observer = null;
  var refreshTimer = null;
  var lastContextKey = '';
  var currentScan = null;
  var currentImageDataUrl = '';
  window.BRINESEARCH_VERSION = VERSION;

  var FIELD_DEFS = [
    { key: 'padName', label: 'Pad name', aliases: ['pad name', 'location name', 'site name', 'pad'] },
    { key: 'operator', label: 'Operator / company', aliases: ['operator', 'company', 'producer', 'owner'] },
    { key: 'address', label: 'Address', aliases: ['physical address', 'lease address', 'site address', 'address'] },
    { key: 'gateCode', label: 'Gate or access code', aliases: ['gate code', 'access code', 'gate pin', 'access pin', 'gate'] },
    { key: 'apiNumber', label: 'API number', aliases: ['api number', 'api #', 'api no', 'api'] },
    { key: 'phone', label: 'Phone / emergency contact', aliases: ['emergency phone', 'contact phone', 'phone number', 'phone', 'contact'] },
    { key: 'wells', label: 'Well names or numbers', aliases: ['well names', 'well name', 'wells', 'well numbers'] },
    { key: 'notes', label: 'Safety and sign notes', aliases: ['pad notes', 'safety notes', 'special instructions', 'instructions', 'notes'] }
  ];

  function qsa(selector, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
    catch (_) { return []; }
  }

  function textOf(node) {
    return String(node && (node.innerText || node.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\r/g, '')
      .replace(/[‐‑‒–—]/g, '-')
      .replace(/[|]/g, 'I')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function cleanLine(value) {
    return String(value || '')
      .replace(/^[\s:;,.#*\-]+|[\s:;,.#*\-]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function unique(values) {
    var out = [];
    values.forEach(function (value) {
      var clean = cleanLine(value);
      if (!clean) return;
      if (!out.some(function (item) { return item.toLowerCase() === clean.toLowerCase(); })) out.push(clean);
    });
    return out;
  }

  function titleCase(value) {
    return cleanLine(value).toLowerCase().replace(/\b([a-z])/g, function (_, letter) { return letter.toUpperCase(); });
  }

  function firstMatch(text, patterns) {
    for (var i = 0; i < patterns.length; i += 1) {
      var match = text.match(patterns[i]);
      if (match && match[1]) return cleanLine(match[1]);
    }
    return '';
  }

  function parseSignText(rawText) {
    var text = normalizeText(rawText);
    var lines = unique(text.split('\n').map(cleanLine).filter(Boolean));
    var upper = text.toUpperCase();

    var apiNumber = firstMatch(text, [
      /\bAPI(?:\s*(?:NO\.?|NUMBER|#))?\s*[:#-]?\s*([0-9]{2}[\s-]?[0-9]{3}[\s-]?[0-9]{5}(?:[\s-]?[0-9]{2})?)/i,
      /\bAPI(?:\s*(?:NO\.?|NUMBER|#))?\s*[:#-]?\s*([0-9]{10,14})\b/i
    ]).replace(/\s+/g, '-');

    var gateCode = firstMatch(text, [
      /\b(?:GATE|ACCESS)\s*(?:CODE|PIN|PASSCODE)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,11})\b/i,
      /\b(?:CODE|PIN)\s*[:#-]\s*([A-Z0-9][A-Z0-9-]{2,11})\b/i
    ]);

    var phone = firstMatch(text, [
      /\b(?:EMERGENCY|CONTACT|PHONE|CALL)?\s*[:#-]?\s*(\+?1?[\s.-]?(?:\([0-9]{3}\)|[0-9]{3})[\s.-]?[0-9]{3}[\s.-]?[0-9]{4})\b/i
    ]);
    if (phone) {
      var digits = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      if (digits.length === 10) phone = '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
    }

    var address = '';
    var addressPattern = /\b\d{1,6}\s+[A-Z0-9.'-]+(?:\s+[A-Z0-9.'-]+){0,6}\s+(?:ROAD|RD\.?|ROUTE|RTE\.?|STREET|ST\.?|AVENUE|AVE\.?|HIGHWAY|HWY\.?|LANE|LN\.?|DRIVE|DR\.?|PIKE|TRAIL|TRL\.?|BOULEVARD|BLVD\.?|COUNTY ROAD|TOWNSHIP ROAD|CR|TR)\b(?:\s+[A-Z0-9-]+)?/i;
    for (var a = 0; a < lines.length; a += 1) {
      var addressMatch = lines[a].match(addressPattern);
      if (addressMatch) { address = titleCase(addressMatch[0]); break; }
    }

    var padCandidates = lines.filter(function (line) {
      var u = line.toUpperCase();
      return /\bPAD\b/.test(u) &&
        !/\b(?:PADLOCK|NOTEPAD|HELICOPTER|LANDING|FOOT PAD)\b/.test(u) &&
        !/\b(?:KEEP|CLOSE|SAFETY|WARNING|NOTICE|AUTHORIZED|EMERGENCY|PPE)\b/.test(u);
    });
    var padName = '';
    if (padCandidates.length) {
      padName = cleanLine(padCandidates[0]
        .replace(/^(?:PAD\s*(?:NAME)?|LOCATION|SITE)\s*[:#-]?\s*/i, '')
        .replace(/\s+(?:WELL\s+)?PAD\b.*$/i, ''));
      if (!padName) padName = cleanLine(padCandidates[0]);
      if (!/\bPAD\b/i.test(padName) && /\bPAD\b/i.test(padCandidates[0])) padName += ' Pad';
      padName = titleCase(padName);
    }

    var operatorCandidates = lines.filter(function (line) {
      var u = line.toUpperCase();
      return /\b(?:ENERGY|RESOURCES|EXPLORATION|OPERATING|PRODUCTION|MIDSTREAM|OIL\s*&?\s*GAS|NATURAL GAS|LLC|L\.L\.C\.|INC\.?|CORP\.?|COMPANY|CO\.?)\b/.test(u) &&
        !/\b(?:EMERGENCY|CALL|CONTRACTOR|TRESPASS|WARNING|NOTICE|PHONE)\b/.test(u) &&
        line.length <= 90;
    });
    var operator = operatorCandidates.length ? titleCase(operatorCandidates[0]) : '';

    var wellLines = lines.filter(function (line) {
      var u = line.toUpperCase();
      return /\bWELL(?:S)?\b/.test(u) &&
        !/\bWELL\s+PAD\b/.test(u) &&
        !/\b(?:WELLNESS|WELL BEING|WELL-BEING)\b/.test(u) &&
        line.length <= 120;
    }).map(function (line) {
      return cleanLine(line.replace(/^(?:WELL(?:S)?|WELL\s+(?:NAME|NUMBER|NO\.?|#))\s*[:#-]?\s*/i, ''));
    }).filter(Boolean);

    var safetyLines = lines.filter(function (line) {
      var u = line.toUpperCase();
      return /\b(?:H2S|HYDROGEN SULFIDE|PPE|HARD HAT|SAFETY GLASSES|FR CLOTHING|NO SMOKING|NO OPEN FLAME|EMERGENCY|AUTHORIZED PERSONNEL|KEEP GATE|CLOSE GATE|SPEED LIMIT|MUSTER|EVACUATION|CB CHANNEL|RADIO CHANNEL|TRUCK|HAZARD|DANGER|WARNING|NOTICE)\b/.test(u);
    });

    var confidence = 0;
    [padName, operator, address, gateCode, apiNumber, phone].forEach(function (value) { if (value) confidence += 12; });
    if (wellLines.length) confidence += 12;
    if (safetyLines.length) confidence += 10;
    confidence = Math.min(98, Math.max(text ? 20 : 0, confidence));

    return {
      padName: padName,
      operator: operator,
      address: address,
      gateCode: gateCode,
      apiNumber: apiNumber,
      phone: phone,
      wells: unique(wellLines).join('\n'),
      notes: unique(safetyLines).join('\n'),
      rawText: text,
      confidence: confidence,
      detectedCount: [padName, operator, address, gateCode, apiNumber, phone, wellLines.length, safetyLines.length].filter(Boolean).length,
      hasEmergencyLanguage: /\b(?:EMERGENCY|DANGER|H2S|HYDROGEN SULFIDE)\b/.test(upper)
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function slugify(value) {
    return String(value || 'unknown-pad').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown-pad';
  }

  function currentPadKey() {
    var route = String(location.hash || location.pathname || '');
    var match = route.match(/\/pad\/([^/?#]+)/i);
    if (match && match[1] && !/^(?:add|new|edit)$/i.test(match[1])) return decodeURIComponent(match[1]).toLowerCase();
    var named = currentPadName();
    return slugify(named);
  }

  function currentPadName() {
    var selectors = [
      '[data-pad-name]', '.pad-name', '.pad-title', '.pad-detail h1', '.pad-detail h2',
      'main h1', 'main h2', '[role="main"] h1', '[role="main"] h2'
    ];
    for (var i = 0; i < selectors.length; i += 1) {
      var nodes = qsa(selectors[i]);
      for (var j = 0; j < nodes.length; j += 1) {
        var value = textOf(nodes[j]);
        if (value && !/^(?:edit|add|review|search|nearby|pad details?)\b/i.test(value) && value.length < 100) return value;
      }
    }
    var field = findEditorField(['pad name', 'location name', 'site name']);
    return field ? String(field.value || '').trim() : '';
  }

  function visible(node) {
    if (!node || !node.isConnected) return false;
    var style = window.getComputedStyle ? window.getComputedStyle(node) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    var rect = node.getBoundingClientRect ? node.getBoundingClientRect() : { width: 1, height: 1 };
    return rect.width > 0 || rect.height > 0;
  }

  function findButtonByText(pattern) {
    var nodes = qsa('button, a, [role="button"]');
    for (var i = 0; i < nodes.length; i += 1) {
      if (visible(nodes[i]) && pattern.test(textOf(nodes[i]))) return nodes[i];
    }
    return null;
  }

  function editorHeadingPresent() {
    return qsa('h1,h2,h3,[role="heading"]').some(function (node) {
      return visible(node) && /\b(?:edit|add)\s+pad\b/i.test(textOf(node));
    });
  }

  function determineContext() {
    var hash = String(location.hash || '').toLowerCase();
    var editorMarker = document.querySelector('[data-pad-editor], .pad-editor, #pad-editor, #padEditor, form[data-pad-form]');
    var hasFormFields = qsa('input, textarea, select').some(function (node) {
      if (!visible(node) || node.type === 'hidden' || node.id === INPUT_ID) return false;
      var meta = fieldMetadata(node);
      return /\b(?:pad name|operator|gate code|well|directions|coordinates|address)\b/.test(meta);
    });
    var edit = /(?:\/edit(?:\/|$)|edit-pad|pad-editor)/.test(hash) || editorHeadingPresent() || (editorMarker && hasFormFields);
    if (edit) return 'edit';
    var pad = /\/pad\//.test(hash) || !!findButtonByText(/\bedit\s+pad\b/i) || !!document.querySelector('.pad-detail,[data-pad-detail],#pad-detail');
    return pad ? 'pad' : 'other';
  }

  function readStorage() {
    try {
      var value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }

  function writeStorage(records) {
    var keys = Object.keys(records).sort(function (a, b) {
      return String(records[b] && records[b].scannedAt || '').localeCompare(String(records[a] && records[a].scannedAt || ''));
    });
    keys.slice(MAX_RECORDS).forEach(function (key) { delete records[key]; });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch (_) {
      keys.slice(Math.max(10, Math.floor(keys.length / 2))).forEach(function (key) { delete records[key]; });
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); return true; }
      catch (error) { console.warn('[BrineSearch Sign Scanner] Could not save scan', error); return false; }
    }
  }

  function getRecord(key) {
    return readStorage()[key || currentPadKey()] || null;
  }

  function saveRecord(record) {
    var records = readStorage();
    records[record.padKey] = record;
    return writeStorage(records);
  }

  function removeRecord(key) {
    var records = readStorage();
    delete records[key];
    writeStorage(records);
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
    } catch (_) { return new Date(value).toLocaleString(); }
  }

  function fieldMetadata(field) {
    var parts = [field.name, field.id, field.placeholder, field.getAttribute('aria-label'), field.getAttribute('data-field')];
    if (field.id) {
      var safeId = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(field.id) : field.id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      var explicit = document.querySelector('label[for="' + safeId + '"]');
      if (explicit) parts.push(textOf(explicit));
    }
    var wrapping = field.closest && field.closest('label,.form-group,.field,.input-group,.control,.form-field');
    if (wrapping) parts.push(textOf(wrapping).slice(0, 160));
    return parts.filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g, ' ');
  }

  function findEditorField(aliases) {
    var fields = qsa('input:not([type="hidden"]):not([type="file"]), textarea, select').filter(visible);
    var best = null;
    var bestScore = 0;
    fields.forEach(function (field) {
      if (field.id === INPUT_ID || field.closest('#' + MODAL_ID)) return;
      var meta = fieldMetadata(field);
      var score = 0;
      aliases.forEach(function (alias) {
        var normalized = alias.toLowerCase();
        if (meta === normalized) score = Math.max(score, 100);
        else if (meta.indexOf(normalized) >= 0) score = Math.max(score, normalized.split(' ').length * 20 + normalized.length);
      });
      if (score > bestScore) { best = field; bestScore = score; }
    });
    return best;
  }

  function displayedValue(aliases) {
    var labels = qsa('dt,th,.label,.field-label,.detail-label,[data-label]');
    for (var i = 0; i < labels.length; i += 1) {
      var labelText = textOf(labels[i]).toLowerCase();
      if (!aliases.some(function (alias) { return labelText.indexOf(alias) >= 0; })) continue;
      var next = labels[i].nextElementSibling;
      if (next && textOf(next)) return textOf(next);
      var row = labels[i].closest('tr,.row,.field,.detail-row,.info-row');
      if (row) {
        var rowText = textOf(row).replace(textOf(labels[i]), '').trim();
        if (rowText) return rowText;
      }
    }
    return '';
  }

  function existingValue(def) {
    var field = findEditorField(def.aliases);
    if (field && String(field.value || '').trim()) return String(field.value).trim();
    return displayedValue(def.aliases);
  }

  function setFieldValue(field, value, append) {
    if (!field || value == null || value === '') return false;
    var nextValue = String(value).trim();
    if (!nextValue) return false;
    if (append && String(field.value || '').trim() && String(field.value).indexOf(nextValue) < 0) {
      nextValue = String(field.value).trim() + '\n\n' + nextValue;
    }
    if (field.tagName === 'SELECT') {
      var options = qsa('option', field);
      var match = options.find(function (option) {
        return option.value.toLowerCase() === nextValue.toLowerCase() || textOf(option).toLowerCase() === nextValue.toLowerCase();
      });
      if (!match) return false;
      field.value = match.value;
    } else {
      var setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value');
      if (setter && setter.set) setter.set.call(field, nextValue);
      else field.value = nextValue;
    }
    ['input', 'change', 'blur'].forEach(function (type) {
      field.dispatchEvent(new Event(type, { bubbles: true }));
    });
    field.classList.add('bs-sign-filled');
    window.setTimeout(function () { field.classList.remove('bs-sign-filled'); }, 1800);
    return true;
  }

  function selectedFieldsFromModal() {
    var selected = {};
    FIELD_DEFS.forEach(function (def) {
      var checkbox = document.querySelector('#bs-sign-use-' + def.key);
      var input = document.querySelector('#bs-sign-value-' + def.key);
      if (checkbox && checkbox.checked && input) selected[def.key] = String(input.value || '').trim();
    });
    return selected;
  }

  function fillEditor(selected) {
    var filled = [];
    var leftovers = [];
    FIELD_DEFS.forEach(function (def) {
      var value = selected[def.key];
      if (!value) return;
      var field = findEditorField(def.aliases);
      var append = def.key === 'notes' || def.key === 'wells';
      if (setFieldValue(field, value, append)) filled.push(def.label);
      else leftovers.push(def.label + ': ' + value);
    });

    if (leftovers.length) {
      var notes = findEditorField(['pad notes', 'safety notes', 'special instructions', 'notes']);
      var block = 'Front sign scan (' + new Date().toLocaleDateString() + '):\n' + leftovers.join('\n');
      if (setFieldValue(notes, block, true)) filled.push('Pad notes');
    }
    return filled;
  }

  function buildEntry(context) {
    var entry = document.getElementById(ENTRY_ID);
    if (!entry) {
      entry = document.createElement('section');
      entry.id = ENTRY_ID;
      entry.className = 'bs-sign-scan-entry';
      entry.innerHTML =
        '<button type="button" class="bs-sign-scan-button" data-bs-open-sign-scanner>' +
          '<img src="./icons/fm-camera-inactive.svg" alt="" aria-hidden="true">' +
          '<span><strong>Scan Front Sign</strong><small>Take a picture and read the pad information</small></span>' +
        '</button>';
      entry.addEventListener('click', function (event) {
        var button = event.target.closest('[data-bs-open-sign-scanner]');
        if (button) beginCapture();
      });
    }
    entry.dataset.context = context;
    return entry;
  }

  function chooseAnchor(context) {
    if (context === 'edit') {
      var heading = qsa('h1,h2,h3,[role="heading"]').find(function (node) { return visible(node) && /\b(?:edit|add)\s+pad\b/i.test(textOf(node)); });
      if (heading) return { node: heading, mode: 'after' };
      var form = qsa('form').find(function (node) { return visible(node) && qsa('input,textarea,select', node).length > 2; });
      if (form) return { node: form, mode: 'before' };
    }
    var editButton = findButtonByText(/\bedit\s+pad\b/i);
    if (editButton) {
      var group = editButton.closest('.actions,.action-grid,.button-row,.pad-actions,.card-actions,section,article');
      return { node: group || editButton, mode: 'after' };
    }
    var main = document.querySelector('main,[role="main"],#app,.app-content');
    return main ? { node: main, mode: 'prepend' } : null;
  }

  function placeEntry(context) {
    if (context === 'other') {
      var oldEntry = document.getElementById(ENTRY_ID);
      if (oldEntry) oldEntry.remove();
      var oldCard = document.getElementById(CARD_ID);
      if (oldCard) oldCard.remove();
      return;
    }
    var anchor = chooseAnchor(context);
    if (!anchor || !anchor.node || !anchor.node.isConnected) return;
    var entry = buildEntry(context);
    if (anchor.mode === 'after') anchor.node.insertAdjacentElement('afterend', entry);
    else if (anchor.mode === 'before') anchor.node.insertAdjacentElement('beforebegin', entry);
    else anchor.node.prepend(entry);
    renderSavedCard();
  }

  function renderSavedCard() {
    var context = determineContext();
    var entry = document.getElementById(ENTRY_ID);
    var old = document.getElementById(CARD_ID);
    if (context === 'other' || !entry) { if (old) old.remove(); return; }
    var record = getRecord();
    if (!record) { if (old) old.remove(); return; }

    var card = old || document.createElement('section');
    card.id = CARD_ID;
    card.className = 'bs-sign-scan-card';
    var values = FIELD_DEFS.map(function (def) {
      var value = record.fields && record.fields[def.key];
      if (!value) return '';
      return '<div class="bs-sign-card-row"><span>' + escapeHtml(def.label) + '</span><strong>' + escapeHtml(value).replace(/\n/g, '<br>') + '</strong></div>';
    }).filter(Boolean).join('');
    card.innerHTML =
      '<div class="bs-sign-card-head">' +
        '<div><span class="bs-sign-kicker">FRONT SIGN SCAN</span><h3>Information read from the entrance sign</h3></div>' +
        '<span class="bs-sign-photo-badge">Photo checked</span>' +
      '</div>' +
      '<p class="bs-sign-card-date">Scanned ' + escapeHtml(formatDate(record.scannedAt)) + '</p>' +
      '<div class="bs-sign-card-values">' + values + '</div>' +
      (record.rawText ? '<details><summary>Show all text read from the sign</summary><pre>' + escapeHtml(record.rawText) + '</pre></details>' : '') +
      '<div class="bs-sign-card-actions">' +
        '<button type="button" data-bs-rescan-sign>Rescan sign</button>' +
        '<button type="button" class="bs-sign-remove" data-bs-remove-sign>Remove scan</button>' +
      '</div>';

    if (!old) {
      card.addEventListener('click', function (event) {
        if (event.target.closest('[data-bs-rescan-sign]')) beginCapture();
        if (event.target.closest('[data-bs-remove-sign]')) {
          if (window.confirm('Remove the saved front-sign information from this pad?')) {
            removeRecord(currentPadKey());
            renderSavedCard();
            showToast('Front-sign information removed.');
          }
        }
      });
    }
    entry.insertAdjacentElement('afterend', card);
  }

  function ensureFileInput() {
    var input = document.getElementById(INPUT_ID);
    if (input) return input;
    input = document.createElement('input');
    input.type = 'file';
    input.id = INPUT_ID;
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.setAttribute('data-bs-sign-file', '');
    input.hidden = true;
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (file) scanFile(file);
    });
    document.body.appendChild(input);
    return input;
  }

  function beginCapture() {
    var input = ensureFileInput();
    try { input.click(); }
    catch (_) { showToast('Camera could not open. Check camera permission and try again.', true); }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = qsa('script').find(function (script) { return script.src === new URL(src, location.href).href; });
      if (existing) {
        if (window.Tesseract && window.Tesseract.createWorker) return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function ensureTesseract() {
    if (window.Tesseract && window.Tesseract.createWorker) return window.Tesseract;
    try { await loadScript(TESSERACT_LOCAL); }
    catch (_) { await loadScript(TESSERACT_CDN); }
    if (!window.Tesseract || !window.Tesseract.createWorker) throw new Error('The text reader did not load.');
    return window.Tesseract;
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      var url = URL.createObjectURL(file);
      image.onload = function () { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('The photo could not be opened.')); };
      image.src = url;
    });
  }

  async function prepareImage(file) {
    var image = await loadImage(file);
    var max = 1800;
    var scale = Math.min(1, max / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    var width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    var height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    try {
      var pixels = ctx.getImageData(0, 0, width, height);
      var data = pixels.data;
      for (var i = 0; i < data.length; i += 4) {
        var gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        var adjusted = Math.max(0, Math.min(255, (gray - 128) * 1.18 + 128));
        data[i] = data[i + 1] = data[i + 2] = adjusted;
      }
      ctx.putImageData(pixels, 0, 0);
    } catch (_) { /* OCR can still use the resized color image. */ }
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  function ensureModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'bs-sign-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'bs-sign-modal-title');
    modal.innerHTML =
      '<div class="bs-sign-modal-backdrop" data-bs-close-sign></div>' +
      '<section class="bs-sign-sheet">' +
        '<header class="bs-sign-sheet-head">' +
          '<div><span class="bs-sign-kicker">BRINESEARCH V' + VERSION + '</span><h2 id="bs-sign-modal-title">Scan Front Sign</h2></div>' +
          '<button type="button" class="bs-sign-close" aria-label="Close sign scanner" data-bs-close-sign>×</button>' +
        '</header>' +
        '<div class="bs-sign-sheet-body" data-bs-sign-body></div>' +
      '</section>';
    modal.addEventListener('click', function (event) {
      if (event.target.closest('[data-bs-close-sign]')) closeModal();
      if (event.target.closest('[data-bs-apply-sign]')) applyReview();
      if (event.target.closest('[data-bs-retry-sign]')) { closeModal(); beginCapture(); }
      if (event.target.closest('[data-bs-use-manual-text]')) {
        var manual = document.getElementById('bs-sign-manual-text');
        if (manual && manual.value.trim()) openReview(parseSignText(manual.value), currentImageDataUrl);
      }
    });
    document.body.appendChild(modal);
    return modal;
  }

  function openModal() {
    var modal = ensureModal();
    modal.hidden = false;
    document.documentElement.classList.add('bs-sign-modal-open');
    var close = modal.querySelector('.bs-sign-close');
    if (close) window.setTimeout(function () { close.focus(); }, 20);
    return modal;
  }

  function closeModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) modal.hidden = true;
    document.documentElement.classList.remove('bs-sign-modal-open');
  }

  function setModalBody(html) {
    var modal = openModal();
    var body = modal.querySelector('[data-bs-sign-body]');
    body.innerHTML = html;
    return body;
  }

  function renderProgress(imageDataUrl, status, progress) {
    var pct = Math.max(3, Math.min(100, Math.round((progress || 0) * 100)));
    setModalBody(
      '<div class="bs-sign-progress-view">' +
        (imageDataUrl ? '<img class="bs-sign-preview" src="' + imageDataUrl + '" alt="Front sign photo being read">' : '') +
        '<div class="bs-sign-progress-copy"><h3>Reading the sign…</h3><p data-bs-progress-status>' + escapeHtml(status || 'Preparing photo') + '</p></div>' +
        '<div class="bs-sign-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div>' +
        '<p class="bs-sign-privacy">The sign photo is read on this device. It is not saved after the scan.</p>' +
      '</div>'
    );
  }

  function updateProgress(message) {
    var status = document.querySelector('[data-bs-progress-status]');
    if (status && message && message.status) status.textContent = String(message.status).replace(/_/g, ' ');
    var bar = document.querySelector('.bs-sign-progress');
    var span = bar && bar.querySelector('span');
    if (bar && span && typeof message.progress === 'number') {
      var pct = Math.max(5, Math.min(100, Math.round(message.progress * 100)));
      bar.setAttribute('aria-valuenow', String(pct));
      span.style.width = pct + '%';
    }
  }

  function renderFailure(error) {
    setModalBody(
      '<div class="bs-sign-error-view">' +
        '<div class="bs-sign-error-icon">!</div>' +
        '<h3>BrineSearch could not read that sign</h3>' +
        '<p>' + escapeHtml(error && error.message || 'The text was not clear enough.') + '</p>' +
        '<p>Retake the photo straight-on in better light, or type the visible sign text below.</p>' +
        '<label for="bs-sign-manual-text">Sign text</label>' +
        '<textarea id="bs-sign-manual-text" rows="7" placeholder="Type the pad name, operator, address, gate code, API number, wells, or safety notes shown on the sign"></textarea>' +
        '<div class="bs-sign-modal-actions"><button type="button" class="bs-sign-secondary" data-bs-retry-sign>Retake photo</button><button type="button" class="bs-sign-primary" data-bs-use-manual-text>Review typed text</button></div>' +
      '</div>'
    );
  }

  async function recognizeImage(imageDataUrl) {
    var Tesseract = await ensureTesseract();
    var worker = await Tesseract.createWorker('eng', 1, { logger: updateProgress });
    try {
      var result = await worker.recognize(imageDataUrl, { preserve_interword_spaces: '1' });
      return result && result.data && result.data.text || '';
    } finally {
      try { await worker.terminate(); } catch (_) { /* no-op */ }
    }
  }

  async function scanFile(file) {
    if (!file || !/^image\//i.test(file.type || '')) {
      showToast('Choose a picture of the front sign.', true);
      return;
    }
    try {
      renderProgress('', 'Opening photo', 0.04);
      currentImageDataUrl = await prepareImage(file);
      renderProgress(currentImageDataUrl, 'Loading text reader', 0.08);
      var rawText = await recognizeImage(currentImageDataUrl);
      var parsed = parseSignText(rawText);
      if (!parsed.rawText || parsed.rawText.replace(/\s/g, '').length < 3) throw new Error('No readable text was found in the picture.');
      openReview(parsed, currentImageDataUrl);
    } catch (error) {
      console.warn('[BrineSearch Sign Scanner]', error);
      renderFailure(error);
    }
  }

  function openReview(parsed, imageDataUrl) {
    currentScan = parsed;
    currentImageDataUrl = imageDataUrl || currentImageDataUrl || '';
    var existing = {};
    FIELD_DEFS.forEach(function (def) { existing[def.key] = existingValue(def); });

    var fields = FIELD_DEFS.map(function (def) {
      var value = parsed[def.key] || '';
      if (!value) return '';
      var current = existing[def.key] || '';
      var conflict = current && current.toLowerCase() !== value.toLowerCase();
      var inputTag = (def.key === 'notes' || def.key === 'wells') ? 'textarea' : 'input';
      var input = inputTag === 'textarea'
        ? '<textarea id="bs-sign-value-' + def.key + '" rows="' + (def.key === 'notes' ? 4 : 3) + '">' + escapeHtml(value) + '</textarea>'
        : '<input id="bs-sign-value-' + def.key + '" type="text" value="' + escapeHtml(value) + '">';
      return '<article class="bs-sign-review-field' + (conflict ? ' has-conflict' : '') + '">' +
        '<div class="bs-sign-field-top"><label><input id="bs-sign-use-' + def.key + '" type="checkbox" checked> <strong>' + escapeHtml(def.label) + '</strong></label>' +
        (conflict ? '<span class="bs-sign-conflict">Different from saved value</span>' : '<span class="bs-sign-found">Found</span>') + '</div>' +
        input +
        (current ? '<p class="bs-sign-existing"><span>Currently saved:</span> ' + escapeHtml(current) + '</p>' : '') +
      '</article>';
    }).filter(Boolean).join('');

    var count = parsed.detectedCount || 0;
    setModalBody(
      '<div class="bs-sign-review">' +
        '<div class="bs-sign-review-summary">' +
          (currentImageDataUrl ? '<img class="bs-sign-review-thumb" src="' + currentImageDataUrl + '" alt="Front sign photo">' : '') +
          '<div><span class="bs-sign-confidence">' + count + ' information ' + (count === 1 ? 'item' : 'items') + ' found</span><h3>Check what BrineSearch read</h3><p>Uncheck anything that should not be added. You can correct the text before applying it.</p></div>' +
        '</div>' +
        (fields || '<div class="bs-sign-empty"><p>No standard pad fields were recognized. Review the full text and add it as notes.</p></div>') +
        '<details class="bs-sign-raw"><summary>Full text read from sign</summary><textarea id="bs-sign-raw-text" rows="8">' + escapeHtml(parsed.rawText || '') + '</textarea></details>' +
        '<label class="bs-sign-editor-option"><input id="bs-sign-fill-editor" type="checkbox" checked> <span><strong>Fill matching Edit Pad fields</strong><small>On a pad page, BrineSearch will open Edit Pad after saving this scan. Existing information remains visible for review.</small></span></label>' +
        '<div class="bs-sign-modal-actions sticky"><button type="button" class="bs-sign-secondary" data-bs-retry-sign>Retake</button><button type="button" class="bs-sign-primary" data-bs-apply-sign>Apply to Pad</button></div>' +
      '</div>'
    );
  }

  function waitForEditor(timeout) {
    timeout = timeout || 5000;
    return new Promise(function (resolve) {
      var started = Date.now();
      (function check() {
        if (determineContext() === 'edit' && qsa('input,textarea,select').some(visible)) return resolve(true);
        if (Date.now() - started >= timeout) return resolve(false);
        window.setTimeout(check, 120);
      })();
    });
  }

  async function applyReview() {
    var selected = selectedFieldsFromModal();
    var raw = document.getElementById('bs-sign-raw-text');
    var padKey = currentPadKey();
    var record = {
      version: VERSION,
      padKey: padKey,
      padName: selected.padName || currentPadName() || padKey,
      scannedAt: new Date().toISOString(),
      fields: selected,
      rawText: String(raw && raw.value || currentScan && currentScan.rawText || '').trim()
    };
    var saved = saveRecord(record);
    var fillEditor = document.getElementById('bs-sign-fill-editor');
    var shouldFill = !fillEditor || fillEditor.checked;
    var context = determineContext();
    closeModal();
    currentImageDataUrl = '';
    currentScan = null;
    renderSavedCard();

    if (!saved) {
      showToast('The scan was read, but this device could not save it.', true);
      return;
    }

    if (shouldFill && context === 'edit') {
      var filled = fillEditorFields(selected);
      showToast(filled.length ? 'Sign information filled into Edit Pad. Review it, then tap Save Pad.' : 'Scan saved to this pad. No matching edit fields were found.');
      return;
    }

    if (shouldFill && context === 'pad') {
      var editButton = findButtonByText(/\bedit\s+pad\b/i);
      if (editButton) {
        editButton.click();
        var opened = await waitForEditor(6000);
        if (opened) {
          placeEntry('edit');
          var fieldsFilled = fillEditorFields(selected);
          showToast(fieldsFilled.length ? 'Sign information filled into Edit Pad. Review it, then tap Save Pad.' : 'Scan saved to the pad page.');
          return;
        }
      }
    }
    showToast('Front-sign information added to the pad page.');
  }

  function fillEditorFields(selected) {
    return fillEditor(selected);
  }

  function showToast(message, danger) {
    var toast = document.querySelector('.bs-sign-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'bs-sign-toast';
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }
    toast.classList.toggle('danger', !!danger);
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 4400);
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 80);
  }

  function refresh() {
    var context = determineContext();
    var contextKey = context + ':' + currentPadKey() + ':' + location.hash;
    if (context === 'other') {
      placeEntry('other');
      lastContextKey = contextKey;
      return;
    }
    var entry = document.getElementById(ENTRY_ID);
    if (!entry || !entry.isConnected || lastContextKey !== contextKey || entry.dataset.context !== context) {
      placeEntry(context);
    } else {
      renderSavedCard();
    }
    ensureFileInput();
    lastContextKey = contextKey;
    patchVisibleVersion();
  }

  function patchVisibleVersion() {
    qsa('[data-app-version],.app-version,.version-number,.version').forEach(function (node) {
      if (node.children.length) return;
      var value = textOf(node);
      if (/^(?:BRINESEARCH\s*)?V?16\.21$/i.test(value)) node.textContent = value.replace(/16\.21/i, VERSION);
    });
  }

  function start() {
    if (window.__BRINESEARCH_SIGN_SCANNER_STARTED__) return;
    window.__BRINESEARCH_SIGN_SCANNER_STARTED__ = true;
    ensureFileInput();
    refresh();
    observer = new MutationObserver(function (mutations) {
      var onlyScannerChanges = mutations.length && mutations.every(function (mutation) {
        var target = mutation.target && (mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement);
        return target && target.closest && target.closest('#' + ENTRY_ID + ',#' + CARD_ID + ',#' + MODAL_ID + ',.bs-sign-toast');
      });
      if (!onlyScannerChanges) scheduleRefresh();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('hashchange', scheduleRefresh);
    window.addEventListener('popstate', scheduleRefresh);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) scheduleRefresh(); });
  }

  window.BrineSearchSignScanner = {
    version: VERSION,
    parseSignText: parseSignText,
    refresh: refresh,
    openReviewFromText: function (text) { openReview(parseSignText(text), ''); },
    getRecord: getRecord,
    removeRecord: removeRecord,
    fillEditorFields: fillEditorFields,
    determineContext: determineContext
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
