const { chromium } = require('playwright');
const assert = require('assert');

const baseUrl = process.env.BRINESEARCH_TEST_URL || 'http://127.0.0.1:8080';
const sampleText = [
  'ASCENT RESOURCES',
  'MILLER PAD',
  'Operator: Ascent Resources',
  'Address: 1234 Bean Ridge Road, Barnesville OH 43713',
  'County: Belmont County',
  'Township: Warren Township',
  'Latitude: 39.875432',
  'Longitude: -81.123456',
  'Well: Miller 1H',
  'API: 34-013-2-1234',
  'Property No: 908772',
  'Gate Code: 2468',
  'Emergency Contact 740-555-1212',
  'H2S AREA - PPE REQUIRED - 10 MPH'
].join('\n');

const cases = [
  { name: 'iPhone compact', width: 390, height: 844, mobile: true },
  { name: 'iPhone large', width: 430, height: 932, mobile: true },
  { name: 'desktop', width: 1280, height: 800, mobile: false }
];

function fixture(theme) {
  return `<!doctype html>
  <html data-theme="${theme}">
    <head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      :root{--bg:#07111d;--card:#101d2c;--text:#f5f8fb;--muted:#a9bbcf}html[data-theme="day"]{--bg:#eef3f7;--card:#fff;--text:#172230;--muted:#617184}
      *{box-sizing:border-box}html,body{margin:0;max-width:100%;overflow-x:hidden;background:var(--bg);color:var(--text);font-family:system-ui,sans-serif}
      main{width:min(100%,900px);margin:auto;padding:16px}.field-pad-hero,.editor{padding:16px;margin:0 0 16px;border-radius:16px;background:var(--card)}
      .field-main-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.editor input,.editor textarea{width:100%;margin:4px 0 10px}
      #liveEditorForm{display:block}#padEditorForm{display:block}
    </style></head>
    <body><main>
      <div class="field-pad-page" data-pad-id="test-pad"><section class="field-pad-hero"><h1>Miller Pad</h1><div class="field-main-actions"></div></section></div>
      <section class="editor"><h2>Edit pad information</h2><form id="padEditorForm"><p class="pad-editor-note">Standard Edit Pad</p><input name="padName"><input name="company"><input name="state"><input name="county"><input name="township"><input name="address"><input name="latitude"><input name="longitude"><textarea name="wellName"></textarea><textarea name="api"></textarea><textarea name="property"></textarea><textarea name="writtenDirections"></textarea><button type="button">Save</button></form></section>
      <section class="editor"><h2>Edit pad information</h2><form id="liveEditorForm"><div class="live-editor-body"></div><input name="padName"><input name="company"><input name="state"><input name="county"><input name="township"><input name="address"><input name="latitude"><input name="longitude"><textarea name="wellName"></textarea><textarea name="api"></textarea><textarea name="property"></textarea><textarea name="writtenDirections"></textarea><button type="button">Save</button></form></section>
    </main></body>
  </html>`;
}

async function noOverflow(page, label) {
  const sizes = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    sheet: document.querySelector('.bss-sheet')?.scrollWidth || 0,
    sheetClient: document.querySelector('.bss-sheet')?.clientWidth || 0
  }));
  assert(sizes.html <= sizes.client + 1, `${label}: document overflow ${JSON.stringify(sizes)}`);
  assert(sizes.body <= sizes.client + 1, `${label}: body overflow ${JSON.stringify(sizes)}`);
  if (sizes.sheet) assert(sizes.sheet <= sizes.sheetClient + 1, `${label}: scanner sheet overflow ${JSON.stringify(sizes)}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const device of cases) {
      for (const theme of ['night', 'day']) {
        const context = await browser.newContext({
          viewport: { width: device.width, height: device.height },
          isMobile: device.mobile,
          hasTouch: device.mobile,
          deviceScaleFactor: device.mobile ? 2 : 1
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${baseUrl}/#/pad/test-pad`, { waitUntil: 'domcontentloaded' });
        await page.setContent(fixture(theme));
        await page.addScriptTag({ url: `${baseUrl}/front-sign-scanner.js` });
        await page.waitForFunction(() => window.BrinesearchFrontSignScanner?.version === '16.22');
        await page.evaluate(() => window.BrinesearchFrontSignScanner.mount());

        assert.strictEqual(await page.locator('#bssPadScanButton').count(), 1, `${device.name}/${theme}: Pad Page scanner missing or duplicated`);
        assert.strictEqual(await page.locator('#padEditorForm [data-bss-edit-scan]').count(), 1, `${device.name}/${theme}: standard Edit Pad scanner missing`);
        assert.strictEqual(await page.locator('#liveEditorForm [data-bss-edit-scan]').count(), 1, `${device.name}/${theme}: live Edit Pad scanner missing`);
        await noOverflow(page, `${device.name}/${theme} mounted controls`);

        await page.evaluate(() => window.BrinesearchFrontSignScanner.openScanner({ mode: 'edit', padId: 'test-pad', formId: 'liveEditorForm' }));
        await page.locator('#bssRawText').fill(sampleText);
        await page.locator('#bssAnalyzeButton').click();
        await page.locator('[data-bss-select="company"]').waitFor({ state: 'visible' });
        assert.strictEqual(await page.locator('#bssPhotoInput').getAttribute('capture'), 'environment');
        assert.strictEqual(await page.locator('#bssPhotoInput').getAttribute('accept'), 'image/*');
        assert.strictEqual(await page.locator('[data-bss-select="api"]').count(), 1);
        assert.strictEqual(await page.locator('[data-bss-select="wellName"]').count(), 1);
        await noOverflow(page, `${device.name}/${theme} review screen`);

        const applyText = await page.locator('#bssApplyButton').innerText();
        assert(/Fill Edit Pad Form/i.test(applyText), `${device.name}/${theme}: Edit Pad apply action is incorrect`);
        await page.locator('#bssApplyButton').click();
        await page.waitForTimeout(100);
        assert.strictEqual(await page.locator('#liveEditorForm [name="company"]').inputValue(), 'Ascent Resources');
        assert(/Miller Pad/i.test(await page.locator('#liveEditorForm [name="padName"]').inputValue()));
        assert.strictEqual(await page.locator('#liveEditorForm [name="county"]').inputValue(), 'Belmont');
        assert.strictEqual(await page.locator('#liveEditorForm [name="township"]').inputValue(), 'Warren');
        assert(/Miller 1H/i.test(await page.locator('#liveEditorForm [name="wellName"]').inputValue()));
        assert(/34-013-21234/i.test(await page.locator('#liveEditorForm [name="api"]').inputValue()));
        assert(/Gate\/access code: 2468/i.test(await page.locator('#liveEditorForm [name="writtenDirections"]').inputValue()));

        assert.deepStrictEqual(errors, [], `${device.name}/${theme}: page errors: ${errors.join(' | ')}`);
        results.push(`${device.name} / ${theme}: Pad Page + both Edit Pad controls + review + fill + overflow passed`);
        await context.close();
      }
    }

    console.log('V16.22 FRONT SIGN BROWSER AUDIT PASSED');
    results.forEach(result => console.log(`- ${result}`));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
