(function (root) {
  'use strict';

  const VERSION = '16.22';
  const SCRIPT_ID = 'brinesearch-front-sign-scanner';
  const STYLE_ID = 'brinesearch-front-sign-scanner-styles';
  const MODAL_ID = 'brinesearchFrontSignModal';
  const DB_NAME = 'brinesearch-front-sign-v1';
  const STORE_NAME = 'scans';
  const FALLBACK_KEY = 'brinesearch.frontSignScans.v1';
  const TESSERACT_SCRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const TESSERACT_WORKER = 'https://cdn.jsdelivr.net/npm/tesseract.js@v5.0.4/dist/worker.min.js';
  const TESSERACT_CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.0.0';
  const TESSERACT_LANG = 'https://tessdata.projectnaptha.com/4.0.0';

  const KNOWN_OPERATORS = [
    'Ascent Resources', 'Ascent', 'Antero Resources', 'Antero', 'EOG Resources', 'EOG',
    'Encino Energy', 'Encino', 'Gulfport Energy', 'Gulfport', 'CNX Resources', 'CNX',
    'Infinity Natural Resources', 'Infinity', 'EQT', 'Chevron', 'XTO Energy', 'XTO',
    'Southwestern Energy', 'SWN', 'HG Energy', 'Rice Energy', 'Range Resources',
    'Diversified Energy', 'Expand Energy', 'Chesapeake Energy', 'Consol Energy'
  ];

  const ROAD_SUFFIX = '(?:Road|Rd\\.?|Street|St\\.?|Avenue|Ave\\.?|Lane|Ln\\.?|Drive|Dr\\.?|Highway|Hwy\\.?|Route|Rte\\.?|Pike|Boulevard|Blvd\\.?|Way|Trail|Trl\\.?|Run|Creek|Fork)';
  const STATE_NAMES = { OH: 'OH', OHIO: 'OH', WV: 'WV', 'WEST VIRGINIA': 'WV', PA: 'PA', PENNSYLVANIA: 'PA' };

  function clean(value) {
    return String(value == null ? '' : value).replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').trim();
  }

  function titleCase(value) {
    return clean(value).toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); })
      .replace(/\b(?:Oh|Wv|Pa)\b/g, function (m) { return m.toUpperCase(); })
      .replace(/\b(\d+)([hv])\b/gi, function (_, n, suffix) { return n + suffix.toUpperCase(); });
  }

  function unique(values) {
    const seen = new Set();
    return values.map(clean).filter(function (value) {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeApiNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 10) return digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5);
    if (digits.length === 12) return digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5, 10) + '-' + digits.slice(10);
    if (digits.length === 14) return digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5, 10) + '-' + digits.slice(10, 12) + '-' + digits.slice(12);
    return clean(value);
  }

  function validLatitude(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= -90 && number <= 90;
  }

  function validLongitude(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= -180 && number <= 180;
  }

  function lineAfterLabel(lines, expression) {
    for (const line of lines) {
      const match = line.match(expression);
      if (match && clean(match[1])) return clean(match[1]);
    }
    return '';
  }

  function parseSignText(rawText) {
    const raw = String(rawText || '').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
    const lines = raw.split('\n').map(function (line) { return clean(line.replace(/[|]/g, ' ')); }).filter(Boolean);
    const joined = lines.join('\n');
    const upper = joined.toUpperCase();
    const fields = {};
    const confidence = {};
    const details = {};

    const explicitOperator = lineAfterLabel(lines, /(?:operator|company|operated by|owner)\s*[:#-]\s*(.+)$/i);
    let operator = explicitOperator;
    if (!operator) {
      operator = KNOWN_OPERATORS.find(function (name) { return upper.includes(name.toUpperCase()); }) || '';
    }
    if (operator) {
      const known = KNOWN_OPERATORS.find(function (name) { return name.toUpperCase() === operator.toUpperCase(); });
      fields.company = known || titleCase(operator.replace(/\b(?:LLC|INC\.?|CORP\.?|L\.P\.)\b/gi, function (m) { return m.toUpperCase(); }));
      confidence.company = explicitOperator ? 0.96 : 0.84;
    }

    const explicitPad = lineAfterLabel(lines, /(?:pad|facility|site|lease)\s*(?:name|#|number)?\s*[:#-]\s*(.+)$/i);
    let padName = explicitPad;
    if (!padName) {
      const candidate = lines.find(function (line) {
        return /\b(?:PAD|LEASE|FACILITY|DISPOSAL|SWD)\b/i.test(line) &&
          !/\b(?:warning|entrance|operator|company|address|speed|safety|well pad safety)\b/i.test(line) && line.length <= 90;
      });
      if (candidate) padName = candidate;
    }
    if (padName) {
      fields.padName = titleCase(padName.replace(/^(?:pad|facility|site|lease)\s*(?:name)?\s*[:#-]?\s*/i, ''));
      confidence.padName = explicitPad ? 0.94 : 0.78;
    }

    const stateLine = joined.match(/\b(?:state\s*[:#-]\s*)?(OH|OHIO|WV|WEST VIRGINIA|PA|PENNSYLVANIA)\b/i);
    if (stateLine) {
      fields.state = STATE_NAMES[stateLine[1].toUpperCase()] || stateLine[1].toUpperCase();
      confidence.state = 0.88;
    }

    let county = lineAfterLabel(lines, /county\s*[:#-]\s*([A-Za-z .'-]+)$/i);
    if (!county) {
      const match = joined.match(/\b([A-Za-z][A-Za-z .'-]{1,35})\s+County\b/i);
      if (match) county = match[1];
    }
    if (county) {
      fields.county = titleCase(county.replace(/\s+County$/i, ''));
      confidence.county = 0.86;
    }

    let township = lineAfterLabel(lines, /(?:township|twp\.?|city)\s*[:#-]\s*([A-Za-z .'-]+)$/i);
    if (!township) {
      const match = joined.match(/\b([A-Za-z][A-Za-z .'-]{1,35})\s+(?:Township|Twp\.?)\b/i);
      if (match) township = match[1];
    }
    if (township) {
      fields.township = titleCase(township.replace(/\s+(?:Township|Twp\.?)$/i, ''));
      confidence.township = 0.82;
    }

    const labeledAddress = lineAfterLabel(lines, /(?:site|pad|facility|physical|street)?\s*address\s*[:#-]\s*(.+)$/i);
    const addressLine = labeledAddress || lines.find(function (line) {
      return new RegExp("\\b\\d{1,6}\\s+[A-Za-z0-9 .\'-]{2,70}\\s+" + ROAD_SUFFIX + "\\b", "i").test(line);
    });
    if (addressLine) {
      fields.address = clean(addressLine);
      confidence.address = labeledAddress ? 0.92 : 0.79;
    }

    let latitude = lineAfterLabel(lines, /(?:lat|latitude)\s*[\s:#=]+(-?\d{1,2}\.\d{4,})/i);
    let longitude = lineAfterLabel(lines, /(?:lon|long|longitude)\s*[\s:#=]+(-?\d{1,3}\.\d{4,})/i);
    if (!latitude || !longitude) {
      const pair = joined.match(/(^|[^\d.])(-?\d{1,2}\.\d{4,})\s*[,;/ ]+\s*(-?\d{2,3}\.\d{4,})(?![\d.])/m);
      if (pair) { pair[1] = pair[2]; pair[2] = pair[3]; }
      if (pair && validLatitude(pair[1]) && validLongitude(pair[2])) {
        latitude = latitude || pair[1];
        longitude = longitude || pair[2];
      }
    }
    if (latitude && longitude && validLatitude(latitude) && validLongitude(longitude)) {
      fields.latitude = Number(latitude).toFixed(Math.min(7, Math.max(5, String(latitude).split('.')[1].length)));
      fields.longitude = Number(longitude).toFixed(Math.min(7, Math.max(5, String(longitude).split('.')[1].length)));
      confidence.latitude = confidence.longitude = 0.97;
    }

    const apiCandidates = [];
    lines.forEach(function (line) {
      const labeled = line.match(/\bAPI(?:\s*(?:number|no\.?|#))?\s*[:#=-]?\s*([0-9][0-9 .\/-]{7,24})/i);
      if (labeled) apiCandidates.push(labeled[1]);
    });
    (joined.match(/\b(?:34|37|47)(?:[-\s]?\d){8,12}\b/g) || []).forEach(function (value) { apiCandidates.push(value); });
    const apiMatches = unique(apiCandidates.map(function (value) {
      const digits = String(value || '').replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 14 ? normalizeApiNumber(digits) : '';
    }));
    if (apiMatches.length) {
      fields.api = apiMatches.join('\n');
      confidence.api = 0.96;
    }

    const propertyValues = [];
    lines.forEach(function (line) {
      const match = line.match(/(?:property|prop(?:erty)?\s*(?:no|number|#)?|parcel)\s*[:#-]\s*([A-Z0-9._/-]{2,30})/i);
      if (match) propertyValues.push(match[1]);
    });
    if (propertyValues.length) {
      fields.property = unique(propertyValues).join('\n');
      confidence.property = 0.88;
    }

    const wellValues = [];
    lines.forEach(function (line, index) {
      let match = line.match(/(?:well(?:\s+name)?|wellbore)\s*[:#-]\s*(.+)$/i);
      if (match && !/^pad\b/i.test(match[1])) wellValues.push(match[1]);
      else if (/\bwell\b/i.test(line) && !/\b(?:well\s+pad|wellhead|well site safety|water well)\b/i.test(line) && line.length <= 80) {
        wellValues.push(line.replace(/^(?:well(?:\s+name)?|wellbore)\s*[:#-]?\s*/i, ''));
      } else if (apiMatches.length && /\b(?:34|37|47)[-\s]?\d{3}/.test(lines[index + 1] || '') && line.length <= 60) {
        wellValues.push(line);
      }
    });
    if (wellValues.length) {
      fields.wellName = unique(wellValues).map(titleCase).join('\n');
      confidence.wellName = 0.74;
    }

    const gateMatch = joined.match(/(?:gate|access)\s*(?:code|pin|password)?\s*[:#-]\s*([A-Z0-9*#-]{3,16})/i);
    if (gateMatch) details.gateCode = gateMatch[1].toUpperCase();

    const phones = unique((joined.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g) || []).map(function (phone) { return clean(phone); }));
    if (phones.length) details.phoneNumbers = phones;

    const contactLines = lines.filter(function (line) { return /\b(?:contact|call|supervisor|foreman|security)\b/i.test(line) && line.length <= 140; });
    if (contactLines.length) details.contact = unique(contactLines);

    const emergencyLines = lines.filter(function (line) { return /\b(?:emergency|24\s*hour|spill|incident)\b/i.test(line) && line.length <= 160; });
    if (emergencyLines.length) details.emergency = unique(emergencyLines);

    const safetyLines = lines.filter(function (line) {
      return /\b(?:warning|caution|danger|h2s|ppe|hard hat|safety glasses|no smoking|speed limit|authorized|stop|flammable|high pressure)\b/i.test(line) && line.length <= 180;
    });
    if (safetyLines.length) details.safetyNotes = unique(safetyLines);

    const accessLines = lines.filter(function (line) {
      return /\b(?:entrance|truck|delivery|visitor|check in|call before|keep gate|road|route|lease access)\b/i.test(line) && line.length <= 180;
    });
    if (accessLines.length) details.accessNotes = unique(accessLines);

    return {
      rawText: raw.trim(),
      fields: fields,
      confidence: confidence,
      details: details,
      lineCount: lines.length,
      foundCount: Object.keys(fields).length + Object.keys(details).length
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function currentPadId() {
    const raw = location.hash.replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    if (parts[0] === 'pad' && parts[1]) return decodeURIComponent(parts.slice(1).join('/'));
    return document.querySelector('[data-pad-id]')?.getAttribute('data-pad-id') || '';
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in root)) return reject(new Error('IndexedDB unavailable'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'padId' });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  async function saveScanRecord(record) {
    try {
      const db = await openDb();
      await new Promise(function (resolve, reject) {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(record);
        transaction.oncomplete = resolve;
        transaction.onerror = function () { reject(transaction.error); };
      });
      db.close();
    } catch (error) {
      const fallback = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '{}');
      fallback[record.padId] = Object.assign({}, record, { photoDataUrl: '' });
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(fallback));
    }
    return record;
  }

  async function getScanRecord(padId) {
    if (!padId) return null;
    try {
      const db = await openDb();
      const record = await new Promise(function (resolve, reject) {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(padId);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error); };
      });
      db.close();
      if (record) return record;
    } catch (error) {}
    try {
      return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '{}')[padId] || null;
    } catch (error) {
      return null;
    }
  }

  async function deleteScanRecord(padId) {
    try {
      const db = await openDb();
      await new Promise(function (resolve, reject) {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).delete(padId);
        transaction.oncomplete = resolve;
        transaction.onerror = function () { reject(transaction.error); };
      });
      db.close();
    } catch (error) {}
    try {
      const fallback = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '{}');
      delete fallback[padId];
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(fallback));
    } catch (error) {}
  }

  function mergeLines(existing, incoming) {
    return unique(String(existing || '').split(/\n|\s*\|\s*/).concat(String(incoming || '').split(/\n|\s*\|\s*/))).join('\n');
  }

  function setFormValue(form, name, value, merge) {
    if (value == null || value === '') return false;
    const control = form.elements.namedItem(name);
    if (!control) return false;
    const next = merge ? mergeLines(control.value, value) : String(value);
    control.value = next;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function buildSignNotes(details, capturedAt) {
    const rows = [];
    if (details.gateCode) rows.push('Gate/access code: ' + details.gateCode);
    if (details.phoneNumbers?.length) rows.push('Phone: ' + details.phoneNumbers.join(' | '));
    if (details.contact?.length) rows.push('Contact: ' + details.contact.join(' | '));
    if (details.emergency?.length) rows.push('Emergency: ' + details.emergency.join(' | '));
    if (details.safetyNotes?.length) rows.push('Safety: ' + details.safetyNotes.join(' | '));
    if (details.accessNotes?.length) rows.push('Access: ' + details.accessNotes.join(' | '));
    if (!rows.length) return '';
    const date = new Date(capturedAt || Date.now()).toLocaleString();
    return ['FRONT SIGN INFORMATION (' + date + ')'].concat(rows).join('\n');
  }

  function applyParsedToForm(form, selectedFields, details, options) {
    const selected = selectedFields || {};
    const opts = options || {};
    const applied = [];
    const directNames = ['padName', 'company', 'state', 'county', 'township', 'address', 'latitude', 'longitude'];
    directNames.forEach(function (name) {
      if (selected[name] && setFormValue(form, name, selected[name], false)) applied.push(name);
    });
    ['wellName', 'api', 'property'].forEach(function (name) {
      if (selected[name] && setFormValue(form, name, selected[name], true)) applied.push(name);
    });
    if (opts.appendSignNotes) {
      const notes = buildSignNotes(details || {}, opts.capturedAt);
      if (notes) {
        const control = form.elements.namedItem('writtenDirections');
        if (control) {
          const cleaned = String(control.value || '').replace(/\n{0,2}FRONT SIGN INFORMATION \([^\n]+\)[\s\S]*$/i, '').trim();
          control.value = [cleaned, notes].filter(Boolean).join('\n\n');
          control.dispatchEvent(new Event('input', { bubbles: true }));
          control.dispatchEvent(new Event('change', { bubbles: true }));
          applied.push('writtenDirections');
        }
      }
    }
    return applied;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .bss-scan-action{border-color:rgba(75,213,199,.42)!important;background:linear-gradient(135deg,rgba(24,139,130,.22),rgba(51,100,176,.16))!important}
      .bss-scan-panel{margin:0 0 16px;padding:14px;border:1px solid rgba(75,213,199,.28);border-radius:16px;background:rgba(75,213,199,.07)}
      .bss-scan-panel strong{display:block;margin-bottom:4px}.bss-scan-panel p{margin:0 0 10px;color:var(--muted,#a9bbcf);font-size:.86rem;line-height:1.45}
      .bss-scan-button{min-height:48px;width:100%;border:1px solid rgba(75,213,199,.4);border-radius:14px;background:rgba(75,213,199,.14);color:inherit;font:inherit;font-weight:850;cursor:pointer}
      .bss-modal{position:fixed;inset:0;z-index:3000;display:grid;place-items:center;padding:12px;background:rgba(2,7,14,.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
      .bss-sheet{width:min(760px,100%);max-height:96dvh;overflow:auto;border:1px solid rgba(121,156,199,.28);border-radius:26px;background:linear-gradient(180deg,#101d2e,#07111d);box-shadow:0 36px 100px rgba(0,0,0,.58);color:#eef5fc;overscroll-behavior:contain}
      [data-theme="day"] .bss-sheet{background:linear-gradient(180deg,#fff,#edf5fb);color:#102033}
      .bss-head{position:sticky;top:0;z-index:4;display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:18px;border-bottom:1px solid rgba(121,156,199,.18);background:rgba(10,21,35,.96)}
      [data-theme="day"] .bss-head{background:rgba(255,255,255,.96)}.bss-head h2{margin:2px 0 4px;font-size:1.25rem}.bss-head p{margin:0;color:#9fb4ca;font-size:.84rem}.bss-close{width:44px;height:44px;border-radius:14px;border:1px solid rgba(121,156,199,.25);background:rgba(255,255,255,.06);color:inherit;font-size:1.25rem;cursor:pointer}
      .bss-body{padding:18px;display:grid;gap:16px}.bss-privacy{padding:11px 13px;border-radius:14px;background:rgba(75,213,199,.08);border:1px solid rgba(75,213,199,.18);font-size:.82rem;line-height:1.45;color:#b8d8d5}
      [data-theme="day"] .bss-privacy{color:#345b59}.bss-camera-label{display:grid;place-items:center;gap:7px;min-height:94px;border:2px dashed rgba(75,213,199,.42);border-radius:18px;background:rgba(75,213,199,.08);font-weight:900;cursor:pointer}.bss-camera-label span:first-child{font-size:1.9rem}
      .bss-preview{display:none;width:100%;max-height:300px;object-fit:contain;border-radius:16px;background:#02070e}.bss-preview.show{display:block}.bss-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.bss-btn{min-height:48px;border-radius:14px;border:1px solid rgba(121,156,199,.28);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-weight:850;cursor:pointer;padding:10px 14px}.bss-btn.primary{border-color:rgba(75,213,199,.55);background:linear-gradient(135deg,#147f76,#315fa8);color:#fff}.bss-btn:disabled{opacity:.45;cursor:not-allowed}.bss-btn.wide{grid-column:1/-1}
      .bss-progress{display:none;gap:8px}.bss-progress.show{display:grid}.bss-progress strong{font-size:.82rem}.bss-progress-track{height:9px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.08)}.bss-progress-bar{width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,#43cfc0,#6d94ff);transition:width .18s ease}
      .bss-error{display:none;padding:11px 13px;border-radius:14px;border:1px solid rgba(255,108,108,.35);background:rgba(255,108,108,.08);color:#ffb7b7;font-size:.84rem;line-height:1.45}.bss-error.show{display:block}.bss-textarea{width:100%;min-height:130px;margin-top:7px;padding:12px;border:1px solid rgba(121,156,199,.26);border-radius:15px;background:rgba(3,11,20,.56);color:inherit;font:inherit;line-height:1.45;resize:vertical}
      [data-theme="day"] .bss-textarea{background:#fff}.bss-results{display:none;gap:12px}.bss-results.show{display:grid}.bss-results h3{margin:0}.bss-warning{padding:10px 12px;border:1px solid rgba(255,190,75,.28);border-radius:13px;background:rgba(255,190,75,.08);color:#ffd797;font-size:.81rem;line-height:1.4}[data-theme="day"] .bss-warning{color:#785000}
      .bss-result-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:10px;align-items:start;padding:12px;border:1px solid rgba(121,156,199,.17);border-radius:15px;background:rgba(255,255,255,.035)}.bss-result-row input[type="checkbox"]{width:21px;height:21px;margin-top:22px}.bss-result-main{min-width:0}.bss-result-main label{display:block;margin-bottom:5px;color:#9fb4ca;font-size:.72rem;font-weight:850;letter-spacing:.07em;text-transform:uppercase}.bss-result-main input,.bss-result-main textarea{width:100%;min-height:44px;padding:10px 11px;border:1px solid rgba(121,156,199,.24);border-radius:12px;background:rgba(3,11,20,.5);color:inherit;font:inherit}.bss-result-main textarea{min-height:72px;resize:vertical}[data-theme="day"] .bss-result-main input,[data-theme="day"] .bss-result-main textarea{background:#fff}.bss-confidence{display:inline-flex;align-items:center;min-height:25px;padding:3px 8px;border-radius:999px;background:rgba(75,213,199,.11);color:#78e1d5;font-size:.67rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase}.bss-confidence.review{background:rgba(255,190,75,.1);color:#ffd17c}
      .bss-details{display:grid;gap:7px;padding:13px;border-radius:15px;border:1px solid rgba(121,156,199,.17);background:rgba(255,255,255,.035)}.bss-details h4{margin:0 0 3px}.bss-detail-line{font-size:.83rem;line-height:1.42}.bss-option{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;align-items:start;padding:12px;border:1px solid rgba(121,156,199,.17);border-radius:15px;font-size:.84rem;line-height:1.45}.bss-option input{width:20px;height:20px;margin:1px 0 0}.bss-edit-banner{margin:0 0 14px;padding:12px 14px;border-radius:14px;border:1px solid rgba(75,213,199,.28);background:rgba(75,213,199,.09);font-weight:800}
      .bss-saved-card{margin:16px 0;padding:16px;border:1px solid rgba(75,213,199,.25);border-radius:22px;background:linear-gradient(135deg,rgba(75,213,199,.08),rgba(62,110,190,.06))}.bss-saved-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.bss-saved-head h2{margin:0 0 3px;font-size:1.05rem}.bss-saved-head small{color:var(--muted,#9fb4ca)}.bss-saved-grid{display:grid;grid-template-columns:minmax(110px,180px) minmax(0,1fr);gap:13px;align-items:start}.bss-saved-photo{width:100%;max-height:150px;object-fit:cover;border-radius:14px;background:#02070e}.bss-saved-lines{display:grid;gap:6px;font-size:.83rem;line-height:1.4}.bss-saved-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}.bss-mini{min-height:42px;border:1px solid rgba(121,156,199,.23);border-radius:12px;background:rgba(255,255,255,.05);color:inherit;font:inherit;font-weight:800;padding:8px 11px;cursor:pointer}
      @media(max-width:600px){.bss-modal{padding:0;align-items:end}.bss-sheet{width:100%;max-height:100dvh;border-radius:24px 24px 0 0;padding-bottom:max(8px,env(safe-area-inset-bottom))}.bss-head{padding:15px 16px}.bss-body{padding:15px}.bss-actions{grid-template-columns:1fr}.bss-btn.wide{grid-column:auto}.bss-result-row{grid-template-columns:24px minmax(0,1fr)}.bss-result-row>.bss-confidence{grid-column:2;justify-self:start}.bss-saved-grid{grid-template-columns:1fr}.bss-saved-photo{max-height:220px;object-fit:contain}.bss-saved-head{align-items:center}}
    `;
    document.head.appendChild(style);
  }

  const FIELD_LABELS = {
    padName: 'Pad or facility name', company: 'Operator / company', state: 'State', county: 'County', township: 'Township / city',
    address: 'Address / entrance', latitude: 'Latitude', longitude: 'Longitude', wellName: 'Well names', api: 'API numbers', property: 'Property numbers'
  };

  function confidenceText(score) {
    if (score >= 0.92) return 'High confidence';
    if (score >= 0.82) return 'Check it';
    return 'Needs review';
  }

  function renderFieldRows(parsed) {
    const rows = Object.keys(parsed.fields).map(function (key) {
      const value = parsed.fields[key];
      const score = Number(parsed.confidence[key] || 0.7);
      const multiline = /^(wellName|api|property)$/.test(key);
      const label = FIELD_LABELS[key] || key;
      const control = multiline
        ? '<textarea data-bss-value="' + key + '">' + escapeHtml(value) + '</textarea>'
        : '<input data-bss-value="' + key + '" value="' + escapeHtml(value) + '">';
      return '<div class="bss-result-row"><input type="checkbox" data-bss-select="' + key + '" checked aria-label="Apply ' + escapeHtml(label) + '"><div class="bss-result-main"><label>' + escapeHtml(label) + '</label>' + control + '</div><span class="bss-confidence ' + (score < 0.86 ? 'review' : '') + '">' + confidenceText(score) + '</span></div>';
    }).join('');
    return rows || '<div class="bss-warning">No standard pad fields were recognized. Check or edit the sign text below, then press Analyze Text Again.</div>';
  }

  function detailsHtml(details) {
    const rows = [];
    if (details.gateCode) rows.push('<div class="bss-detail-line"><strong>Gate/access code:</strong> ' + escapeHtml(details.gateCode) + '</div>');
    if (details.phoneNumbers?.length) rows.push('<div class="bss-detail-line"><strong>Phone:</strong> ' + escapeHtml(details.phoneNumbers.join(' · ')) + '</div>');
    if (details.contact?.length) rows.push('<div class="bss-detail-line"><strong>Contact:</strong> ' + escapeHtml(details.contact.join(' · ')) + '</div>');
    if (details.emergency?.length) rows.push('<div class="bss-detail-line"><strong>Emergency:</strong> ' + escapeHtml(details.emergency.join(' · ')) + '</div>');
    if (details.safetyNotes?.length) rows.push('<div class="bss-detail-line"><strong>Safety:</strong> ' + escapeHtml(details.safetyNotes.join(' · ')) + '</div>');
    if (details.accessNotes?.length) rows.push('<div class="bss-detail-line"><strong>Access:</strong> ' + escapeHtml(details.accessNotes.join(' · ')) + '</div>');
    return rows.length ? '<div class="bss-details"><h4>Other front-sign information</h4>' + rows.join('') + '</div>' : '';
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const existing = Array.from(document.scripts).find(function (script) { return script.src === src; });
      if (existing && root.Tesseract) return resolve();
      const script = existing || document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('The text reader could not load. Check your internet connection.')); };
      if (!existing) document.head.appendChild(script);
    });
  }

  async function preparePhoto(file) {
    const dataUrl = await new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
    const image = await new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('This photo format could not be opened. Retake it or use a screenshot.')); };
      img.src = dataUrl;
    });
    const max = 2200;
    const ratio = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
      data[i] = data[i + 1] = data[i + 2] = contrast;
    }
    ctx.putImageData(pixels, 0, 0);
    const thumbRatio = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = Math.max(1, Math.round(image.naturalWidth * thumbRatio));
    thumbCanvas.height = Math.max(1, Math.round(image.naturalHeight * thumbRatio));
    thumbCanvas.getContext('2d').drawImage(image, 0, 0, thumbCanvas.width, thumbCanvas.height);
    return {
      previewDataUrl: thumbCanvas.toDataURL('image/jpeg', 0.8),
      ocrDataUrl: canvas.toDataURL('image/jpeg', 0.9)
    };
  }

  function collectSelectedFields(modal) {
    const result = {};
    modal.querySelectorAll('[data-bss-select]:checked').forEach(function (checkbox) {
      const key = checkbox.getAttribute('data-bss-select');
      const control = modal.querySelector('[data-bss-value="' + key + '"]');
      const value = clean(control?.value);
      if (value) result[key] = value;
    });
    return result;
  }

  function waitForEditorForm(timeout) {
    return new Promise(function (resolve) {
      const existing = document.getElementById('liveEditorForm') || document.getElementById('padEditorForm');
      if (existing) return resolve(existing);
      const started = Date.now();
      const timer = setInterval(function () {
        const form = document.getElementById('liveEditorForm') || document.getElementById('padEditorForm');
        if (form || Date.now() - started > (timeout || 6000)) {
          clearInterval(timer);
          resolve(form || null);
        }
      }, 80);
    });
  }

  function showEditBanner(form, message) {
    form.querySelector('.bss-edit-banner')?.remove();
    const banner = document.createElement('div');
    banner.className = 'bss-edit-banner';
    banner.textContent = message;
    form.prepend(banner);
    banner.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    const previousOverflow = modal?.dataset.previousBodyOverflow || '';
    modal?.remove();
    document.body.style.overflow = previousOverflow;
  }

  function openScanner(context) {
    injectStyles();
    closeModal();
    const padId = context.padId || currentPadId();
    const launchedFromEdit = context.mode === 'edit';
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'bss-modal';
    modal.dataset.previousBodyOverflow = document.body.style.overflow || '';
    modal.innerHTML = '<section class="bss-sheet" role="dialog" aria-modal="true" aria-label="Scan front sign">' +
      '<header class="bss-head"><div><div class="bss-confidence">V16.22</div><h2>Scan Front Sign</h2><p>Take a clear, straight photo of the entire sign.</p></div><button class="bss-close" type="button" aria-label="Close">×</button></header>' +
      '<div class="bss-body">' +
        '<div class="bss-privacy"><strong>Private on your phone:</strong> BrineSearch reads the photo in your browser. The photo is not uploaded to BrineSearch. An internet connection is needed the first time the text-reading engine loads.</div>' +
        '<label class="bss-camera-label"><span>📷</span><span>Take Photo or Choose Photo</span><input id="bssPhotoInput" type="file" accept="image/*" capture="environment" hidden></label>' +
        '<img class="bss-preview" id="bssPreview" alt="Front sign preview">' +
        '<div class="bss-actions"><button class="bss-btn primary" id="bssReadButton" type="button" disabled>Read Sign</button><button class="bss-btn" id="bssRetakeButton" type="button">Choose Another Photo</button></div>' +
        '<div class="bss-progress" id="bssProgress"><strong id="bssProgressText">Preparing text reader…</strong><div class="bss-progress-track"><div class="bss-progress-bar" id="bssProgressBar"></div></div></div>' +
        '<div class="bss-error" id="bssError"></div>' +
        '<div><label for="bssRawText"><strong>Sign text</strong></label><textarea class="bss-textarea" id="bssRawText" placeholder="Recognized text appears here. You can correct it before applying."></textarea><div class="bss-actions" style="margin-top:10px"><button class="bss-btn wide" id="bssAnalyzeButton" type="button">Analyze Text Again</button></div></div>' +
        '<section class="bss-results" id="bssResults"><h3>Review what BrineSearch found</h3><div class="bss-warning">Check every number against the actual sign. Photo reading can confuse 0/O, 1/I, road numbers, API numbers, and gate codes.</div><div id="bssFieldRows"></div><div id="bssDetails"></div>' +
          '<label class="bss-option"><input id="bssAppendNotes" type="checkbox"><span>Also add gate, emergency, safety, and access details to <strong>Written Directions</strong> so they save with the pad.</span></label>' +
          '<label class="bss-option"><input id="bssSavePhoto" type="checkbox" checked><span>Save a smaller copy of this sign photo on this device and show it on the Pad page.</span></label>' +
          '<div class="bss-actions"><button class="bss-btn primary wide" id="bssApplyButton" type="button">' + (launchedFromEdit ? 'Fill Edit Pad Form' : 'Apply and Save to Pad') + '</button></div>' +
        '</section>' +
      '</div></section>';
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    let preparedPhoto = null;
    let parsed = parseSignText('');
    const input = modal.querySelector('#bssPhotoInput');
    const preview = modal.querySelector('#bssPreview');
    const readButton = modal.querySelector('#bssReadButton');
    const rawText = modal.querySelector('#bssRawText');
    const progress = modal.querySelector('#bssProgress');
    const progressText = modal.querySelector('#bssProgressText');
    const progressBar = modal.querySelector('#bssProgressBar');
    const error = modal.querySelector('#bssError');
    const results = modal.querySelector('#bssResults');

    function setError(message) {
      error.textContent = message || '';
      error.classList.toggle('show', Boolean(message));
    }

    function renderParsed(next) {
      parsed = next;
      modal.querySelector('#bssFieldRows').innerHTML = renderFieldRows(parsed);
      modal.querySelector('#bssDetails').innerHTML = detailsHtml(parsed.details);
      modal.querySelector('#bssAppendNotes').checked = Boolean(parsed.details.gateCode || parsed.details.emergency?.length || parsed.details.safetyNotes?.length || parsed.details.accessNotes?.length);
      results.classList.add('show');
    }

    async function selectPhoto(file) {
      if (!file) return;
      setError('');
      progress.classList.add('show');
      progressText.textContent = 'Preparing photo…';
      progressBar.style.width = '12%';
      try {
        preparedPhoto = await preparePhoto(file);
        preview.src = preparedPhoto.previewDataUrl;
        preview.classList.add('show');
        readButton.disabled = false;
        progressBar.style.width = '100%';
        progressText.textContent = 'Photo ready. Press Read Sign.';
      } catch (problem) {
        preparedPhoto = null;
        readButton.disabled = true;
        setError(problem.message || 'The photo could not be opened.');
      }
    }

    async function readSign() {
      if (!preparedPhoto) return;
      setError('');
      readButton.disabled = true;
      progress.classList.add('show');
      progressBar.style.width = '4%';
      progressText.textContent = 'Loading text reader…';
      try {
        if (!root.Tesseract) await loadScript(TESSERACT_SCRIPT);
        const worker = await root.Tesseract.createWorker('eng', 1, {
          workerPath: TESSERACT_WORKER,
          langPath: TESSERACT_LANG,
          corePath: TESSERACT_CORE,
          logger: function (message) {
            const pct = Math.max(5, Math.min(98, Math.round((message.progress || 0) * 100)));
            progressBar.style.width = pct + '%';
            progressText.textContent = message.status ? titleCase(message.status) + (message.progress ? ' · ' + pct + '%' : '') : 'Reading sign…';
          }
        });
        try {
          await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '3' });
          const output = await worker.recognize(preparedPhoto.ocrDataUrl);
          rawText.value = clean(output.data.text).replace(/\s*\n\s*/g, '\n');
        } finally {
          await worker.terminate();
        }
        progressBar.style.width = '100%';
        progressText.textContent = 'Sign read. Review every field below.';
        renderParsed(parseSignText(rawText.value));
      } catch (problem) {
        setError((problem.message || 'The sign could not be read.') + ' You can type or paste the sign text manually, then press Analyze Text Again.');
        progressText.textContent = 'Automatic reading stopped.';
      } finally {
        readButton.disabled = false;
      }
    }

    input.addEventListener('change', function () { selectPhoto(input.files?.[0]); });
    modal.querySelector('#bssRetakeButton').addEventListener('click', function () { input.click(); });
    readButton.addEventListener('click', readSign);
    modal.querySelector('#bssAnalyzeButton').addEventListener('click', function () {
      setError('');
      renderParsed(parseSignText(rawText.value));
    });
    modal.querySelector('.bss-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (event) { if (event.target === modal) closeModal(); });

    modal.querySelector('#bssApplyButton').addEventListener('click', async function () {
      const selectedFields = collectSelectedFields(modal);
      if (!Object.keys(selectedFields).length && !Object.keys(parsed.details || {}).length) {
        setError('Nothing is selected to apply. Check at least one field or correct the sign text.');
        return;
      }
      const capturedAt = new Date().toISOString();
      const record = {
        padId: padId || 'unassigned-' + Date.now(),
        capturedAt: capturedAt,
        appVersion: VERSION,
        photoDataUrl: modal.querySelector('#bssSavePhoto').checked ? (preparedPhoto?.previewDataUrl || '') : '',
        rawText: rawText.value,
        fields: selectedFields,
        details: parsed.details || {}
      };
      await saveScanRecord(record);
      const appendNotes = modal.querySelector('#bssAppendNotes').checked;

      if (launchedFromEdit) {
        const form = document.getElementById(context.formId) || document.getElementById('liveEditorForm') || document.getElementById('padEditorForm');
        if (!form) {
          setError('The Edit Pad form is no longer open. Reopen Edit Pad and scan again.');
          return;
        }
        const applied = applyParsedToForm(form, selectedFields, parsed.details, { appendSignNotes: appendNotes, capturedAt: capturedAt });
        closeModal();
        showEditBanner(form, applied.length ? 'Front-sign information filled in. Review the fields, then press Save.' : 'The scan was saved, but no matching Edit Pad fields were found.');
        return;
      }

      const editButton = Array.from(document.querySelectorAll('[data-edit-section="all"][data-pad-id]')).find(function (button) {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!editButton) {
        setError('The sign scan was saved on this device, but Pad editing is not available. Sign in with editor access, then open Edit Pad to apply it.');
        mountSavedCard(padId);
        return;
      }
      closeModal();
      editButton.click();
      const form = await waitForEditorForm(7000);
      if (!form) {
        alert('The sign scan was saved, but the Edit Pad form did not open. Sign in with editor access and try Apply again.');
        mountSavedCard(padId);
        return;
      }
      applyParsedToForm(form, selectedFields, parsed.details, { appendSignNotes: appendNotes, capturedAt: capturedAt });
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  async function mountSavedCard(padId) {
    const page = document.querySelector('.field-pad-page');
    if (!page || !padId) return;
    const record = await getScanRecord(padId);
    const old = document.getElementById('bssSavedSignCard');
    if (!record) { old?.remove(); return; }
    const lines = [];
    const fields = record.fields || {};
    if (fields.padName) lines.push('<div><strong>Read pad:</strong> ' + escapeHtml(fields.padName) + '</div>');
    if (fields.company) lines.push('<div><strong>Operator:</strong> ' + escapeHtml(fields.company) + '</div>');
    if (record.details?.gateCode) lines.push('<div><strong>Gate/access code:</strong> ' + escapeHtml(record.details.gateCode) + '</div>');
    if (record.details?.phoneNumbers?.length) lines.push('<div><strong>Phone:</strong> ' + escapeHtml(record.details.phoneNumbers.join(' · ')) + '</div>');
    if (record.details?.emergency?.length) lines.push('<div><strong>Emergency:</strong> ' + escapeHtml(record.details.emergency.join(' · ')) + '</div>');
    if (record.details?.safetyNotes?.length) lines.push('<div><strong>Safety:</strong> ' + escapeHtml(record.details.safetyNotes.join(' · ')) + '</div>');
    const card = old || document.createElement('section');
    card.id = 'bssSavedSignCard';
    card.className = 'bss-saved-card';
    card.innerHTML = '<div class="bss-saved-head"><div><h2>Front Sign</h2><small>Scanned ' + escapeHtml(new Date(record.capturedAt).toLocaleString()) + '</small></div><span class="bss-confidence">Saved on this device</span></div>' +
      '<div class="bss-saved-grid">' + (record.photoDataUrl ? '<img class="bss-saved-photo" src="' + record.photoDataUrl + '" alt="Saved front sign">' : '') + '<div class="bss-saved-lines">' + (lines.join('') || '<div>Photo and recognized text saved.</div>') + '</div></div>' +
      '<div class="bss-saved-actions"><button class="bss-mini" type="button" data-bss-rescan>Scan Again</button><button class="bss-mini" type="button" data-bss-viewtext>View Read Text</button><button class="bss-mini" type="button" data-bss-delete>Remove Saved Photo</button></div>';
    if (!old) {
      const hero = page.querySelector('.field-pad-hero');
      if (hero) hero.insertAdjacentElement('afterend', card); else page.prepend(card);
    }
    card.querySelector('[data-bss-rescan]').onclick = function () { openScanner({ mode: 'pad', padId: padId }); };
    card.querySelector('[data-bss-viewtext]').onclick = function () { alert(record.rawText || 'No recognized text was saved.'); };
    card.querySelector('[data-bss-delete]').onclick = async function () {
      if (!confirm('Remove the locally saved sign photo and scan details? Pad information already applied will not be changed.')) return;
      await deleteScanRecord(padId);
      card.remove();
    };
  }

  function mountPadButton() {
    const page = document.querySelector('.field-pad-page');
    const actions = page?.querySelector('.field-main-actions');
    if (!page || !actions || document.getElementById('bssPadScanButton')) return;
    const padId = currentPadId();
    const button = document.createElement('button');
    button.id = 'bssPadScanButton';
    button.type = 'button';
    button.className = 'field-action span-full field-action-visual bss-scan-action';
    button.innerHTML = '<span class="field-action-emblem" aria-hidden="true">📷</span><span class="field-action-copy"><strong>Scan Front Sign</strong><small>Read the sign and update this pad</small></span>';
    button.addEventListener('click', function () { openScanner({ mode: 'pad', padId: padId }); });
    actions.appendChild(button);
    mountSavedCard(padId);
  }

  function mountEditButton(form) {
    if (!form || form.querySelector('[data-bss-edit-scan]')) return;
    const panel = document.createElement('div');
    panel.className = 'bss-scan-panel';
    panel.setAttribute('data-bss-edit-scan', 'true');
    panel.innerHTML = '<strong>📷 Scan the front sign</strong><p>Take a photo and fill this Edit Pad form with the pad name, operator, address, GPS, wells, API numbers, and sign details that BrineSearch can read.</p><button class="bss-scan-button" type="button">Scan Front Sign</button>';
    const note = form.querySelector('.pad-editor-note');
    if (note) note.insertAdjacentElement('afterend', panel);
    else {
      const body = form.querySelector('.live-editor-body');
      if (body) body.prepend(panel); else form.prepend(panel);
    }
    panel.querySelector('button').addEventListener('click', function () {
      openScanner({ mode: 'edit', padId: currentPadId(), formId: form.id });
    });
  }

  function mount() {
    injectStyles();
    mountPadButton();
    mountEditButton(document.getElementById('padEditorForm'));
    mountEditButton(document.getElementById('liveEditorForm'));
  }

  const API = {
    version: VERSION,
    parseSignText: parseSignText,
    normalizeApiNumber: normalizeApiNumber,
    applyParsedToForm: applyParsedToForm,
    buildSignNotes: buildSignNotes,
    mount: mount,
    openScanner: openScanner,
    getScanRecord: getScanRecord,
    saveScanRecord: saveScanRecord
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.BrinesearchFrontSignScanner = API;
  if (!root.document) return;

  injectStyles();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.addEventListener('hashchange', function () { setTimeout(mount, 50); });
  const observer = new MutationObserver(function () { mount(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(mount, 1200);
})(typeof window !== 'undefined' ? window : globalThis);
