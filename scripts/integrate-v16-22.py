#!/usr/bin/env python3
"""Integrate BrineSearch V16.22 Scan Front Sign into the current app source."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
scanner_path = ROOT / 'sign-scanner.js'
css_path = ROOT / 'sign-scanner.css'
index_path = ROOT / 'index.html'
sw_path = ROOT / 'sw.js'
road_manager_path = ROOT / 'road-manager.js'

scanner = scanner_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')

replacements = [
    (
        "var TESSERACT_LOCAL = './vendor/tesseract/tesseract.min.js';",
        "var TESSERACT_LOCAL = './vendor/tesseract/tesseract.min.js';\n  var TESSERACT_WORKER_LOCAL = './vendor/tesseract/worker.min.js';",
    ),
    (
        "var editorMarker = document.querySelector('[data-pad-editor], .pad-editor, #pad-editor, #padEditor, form[data-pad-form]');",
        "var editorMarker = document.querySelector('#liveEditorShell, .live-editor-shell, #liveEditorForm, #padEditorShell, .pad-editor-shell, .pad-editor-panel, #padEditorForm, [data-pad-editor], .pad-editor, #pad-editor, #padEditor, form[data-pad-form]');",
    ),
    (
        "var edit = /(?:\\/edit(?:\\/|$)|edit-pad|pad-editor)/.test(hash) || editorHeadingPresent() || (editorMarker && hasFormFields);",
        "var edit = !!document.querySelector('#liveEditorShell, .live-editor-shell, #liveEditorForm, #padEditorShell, .pad-editor-shell, #padEditorForm') || /(?:\\/edit(?:\\/|$)|edit-pad|pad-editor)/.test(hash) || editorHeadingPresent() || (editorMarker && hasFormFields);",
    ),
    (
        "    if (context === 'edit') {\n      var heading =",
        "    if (context === 'edit') {\n      var liveForm = document.getElementById('liveEditorForm');\n      if (liveForm && visible(liveForm)) {\n        var steps = liveForm.querySelector('.live-editor-steps');\n        return { node: steps || liveForm, mode: steps ? 'after' : 'prepend' };\n      }\n      var padForm = document.getElementById('padEditorForm');\n      if (padForm && visible(padForm)) {\n        var note = padForm.querySelector('.pad-editor-note');\n        return { node: note || padForm, mode: note ? 'after' : 'prepend' };\n      }\n      var heading =",
    ),
    (
        "    var fields = qsa('input:not([type=\"hidden\"]):not([type=\"file\"]), textarea, select').filter(visible);",
        "    var editorRoot = document.querySelector('#liveEditorShell, #padEditorShell');\n    var fields = qsa('input:not([type=\"hidden\"]):not([type=\"file\"]), textarea, select', editorRoot || document).filter(function (field) {\n      if (field.id === INPUT_ID || field.closest('#' + MODAL_ID)) return false;\n      return editorRoot ? true : visible(field);\n    });",
    ),
    (
        "var worker = await Tesseract.createWorker('eng', 1, { logger: updateProgress });",
        "var worker = await Tesseract.createWorker('eng', 1, { logger: updateProgress, workerPath: TESSERACT_WORKER_LOCAL });",
    ),
]

for old, new in replacements:
    if new in scanner:
        continue
    if old not in scanner:
        raise SystemExit('Expected scanner integration point was not found: ' + old[:100])
    scanner = scanner.replace(old, new, 1)

css = css.replace(
    'font: 16px/1.35 inherit;',
    'font: inherit;\n  font-size: 16px;\n  line-height: 1.35;',
)
scanner_path.write_text(scanner, encoding='utf-8')
css_path.write_text(css, encoding='utf-8')

index = index_path.read_text(encoding='utf-8')
assert '</head>' in index.lower(), 'index.html has no closing head tag'
assert '</body>' in index.lower(), 'index.html has no closing body tag'
css_tag = '<link rel="stylesheet" href="./sign-scanner.css?v=16.22" data-brinesearch-sign-scanner="style">'
js_tag = '<script src="./sign-scanner.js?v=16.22" defer data-brinesearch-sign-scanner="script"></script>'
if 'data-brinesearch-sign-scanner="style"' not in index:
    index = re.sub(r'</head>', css_tag + '\n</head>', index, count=1, flags=re.I)
if 'data-brinesearch-sign-scanner="script"' not in index:
    index = re.sub(r'</body>', js_tag + '\n</body>', index, count=1, flags=re.I)

version_patterns = [
    r"((?:const|let|var)\s+(?:APP_)?VERSION\s*=\s*['\"])16\.21",
    r"((?:const|let|var)\s+CURRENT_VERSION\s*=\s*['\"])16\.21",
    r"((?:const|let|var)\s+VERSION_NUMBER\s*=\s*['\"])16\.21",
    r"(BrineSearch\s+V)16\.21",
]
for pattern in version_patterns:
    index = re.sub(pattern, r'\g<1>16.22', index, flags=re.I)
index_path.write_text(index, encoding='utf-8')

sw = sw_path.read_text(encoding='utf-8')
sw = sw.replace('brinesearch-v16-21', 'brinesearch-v16-22')
assets = "'./sign-scanner.js', './sign-scanner.css', './vendor/tesseract/tesseract.min.js', './vendor/tesseract/worker.min.js', "
if "'./sign-scanner.js'" not in sw:
    sw = sw.replace('const APP_SHELL = [', 'const APP_SHELL = [' + assets, 1)
sw_path.write_text(sw, encoding='utf-8')

if road_manager_path.exists():
    road = road_manager_path.read_text(encoding='utf-8')
    road = road.replace('BrineSearch V16.21 — Road Manager', 'BrineSearch V16.22 — Road Manager', 1)
    road = road.replace("var VERSION = '16.21';", "var VERSION = '16.22';", 1)
    road_manager_path.write_text(road, encoding='utf-8')

assert '#liveEditorShell' in scanner
assert '#padEditorShell' in scanner
assert "workerPath: TESSERACT_WORKER_LOCAL" in scanner
assert 'font: 16px/1.35 inherit;' not in css
assert index.count('data-brinesearch-sign-scanner="style"') == 1
assert index.count('data-brinesearch-sign-scanner="script"') == 1
assert 'brinesearch-v16-22' in sw
assert "'./sign-scanner.js'" in sw
assert "'./vendor/tesseract/worker.min.js'" in sw

print('V16.22 source integration complete')
