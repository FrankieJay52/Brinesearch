#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Preparing V16.22 source"
python3 scripts/integrate-v16-22.py
node --check sign-scanner.js
node --check tests/sign-scanner-v16-22.cjs

echo "Downloading browser OCR files"
mkdir -p vendor/tesseract
curl --retry 3 --fail --location --silent --show-error \
  https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js \
  --output vendor/tesseract/tesseract.min.js
curl --retry 3 --fail --location --silent --show-error \
  https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js \
  --output vendor/tesseract/worker.min.js
curl --retry 3 --fail --location --silent --show-error \
  https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/LICENSE.md \
  --output vendor/tesseract/LICENSE.md
test -s vendor/tesseract/tesseract.min.js
test -s vendor/tesseract/worker.min.js
test -s vendor/tesseract/LICENSE.md

echo "Installing browser audit runner"
npm install --no-save --no-package-lock playwright@1.54.2
npx playwright install chromium

echo "Starting local BrineSearch test server"
python3 -m http.server 8080 > /tmp/brinesearch-v16-22-server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
for _ in {1..30}; do
  if curl -fsS http://127.0.0.1:8080/ >/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:8080/ >/dev/null || {
  cat /tmp/brinesearch-v16-22-server.log
  exit 1
}

echo "Running Pad Page and Edit Pad browser audit"
node tests/sign-scanner-v16-22.cjs

cat > AUDIT_V16.22.md <<'REPORT'
# BrineSearch V16.22 Audit

Status: **Passed**

Automated checks completed against the real BrineSearch application source:

- JavaScript syntax validation
- Pad Page Scan Front Sign control
- Scanner placement inside the real `liveEditorShell` / `liveEditorForm` Edit Pad wizard
- Compatibility with the existing `padEditorShell` / `padEditorForm` editor
- OCR sign-text parser
- Camera file input and mocked OCR worker boundary
- Review-before-apply workflow
- Pad Page Front Sign Scan information card
- Edit Pad matching-field population, including fields on hidden wizard steps
- Existing-value review behavior
- No full sign photo stored in the saved record
- Day theme and night theme
- 390 × 844 iPhone layout
- 430 × 932 iPhone layout
- 1280 × 800 desktop layout
- Horizontal-overflow checks on Pad Page, Edit Pad, and review screens
- Duplicate scanner-control check during SPA/editor transitions
- Browser page-error check
REPORT

git config user.name "BrineSearch Release Bot"
git config user.email "actions@users.noreply.github.com"
git add index.html sw.js road-manager.js sign-scanner.js sign-scanner.css vendor/tesseract tests/sign-scanner-v16-22.cjs CHANGELOG_V16.22.md AUDIT_V16.22.md
if git diff --cached --quiet; then
  echo "No V16.22 changes to commit."
  exit 0
fi

git commit -m "Integrate and audit BrineSearch V16.22 sign scanner"
git push origin "HEAD:${GITHUB_REF_NAME:-main}"
