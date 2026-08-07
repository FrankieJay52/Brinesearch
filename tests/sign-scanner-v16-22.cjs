const { chromium } = require('playwright');
const assert = require('assert');

const baseUrl = process.env.BRINESEARCH_TEST_URL || 'http://127.0.0.1:8080';
const padRoute = '#/pad/antero--albert';
const sampleText = [
  'GULFPORT ENERGY LLC',
  'RUBEL DODD WELL PAD',
  '1234 COUNTY ROAD 12',
  'GATE CODE: 2580',
  'API NO 34-111-23456-00',
  'EMERGENCY CALL 740-555-1212',
  'H2S DANGER - FR CLOTHING REQUIRED',
  'WELLS: RUBEL DODD 1H, 2H'
].join('\n');

const viewports = [
  { name: 'iPhone compact', width: 390, height: 844, mobile: true },
  { name: 'iPhone large', width: 430, height: 932, mobile: true },
  { name: 'Desktop', width: 1280, height: 800, mobile: false }
];
const themes = ['night', 'day'];

async function waitForScanner(page) {
  await page.waitForFunction(() => window.BrineSearchSignScanner && window.BrineSearchSignScanner.version === '16.22', null, { timeout: 15000 });
  await page.evaluate(() => window.BrineSearchSignScanner.refresh());
  await page.locator('[data-bs-open-sign-scanner]').waitFor({ state: 'visible', timeout: 10000 });
}

async function assertNoOverflow(page, label) {
  const values = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    html: document.documentElement.scrollWidth,
    body: document.body ? document.body.scrollWidth : 0,
    sheet: document.querySelector('.bs-sign-sheet')?.scrollWidth || 0,
    sheetClient: document.querySelector('.bs-sign-sheet')?.clientWidth || 0
  }));
  assert(values.html <= values.viewport + 1, `${label}: html horizontal overflow ${JSON.stringify(values)}`);
  assert(values.body <= values.viewport + 1, `${label}: body horizontal overflow ${JSON.stringify(values)}`);
  if (values.sheet) assert(values.sheet <= values.sheetClient + 1, `${label}: scanner sheet overflow ${JSON.stringify(values)}`);
}

async function mountRealEditPadShell(page) {
  await page.evaluate(() => {
    document.getElementById('liveEditorShell')?.remove();
    const shell = document.createElement('div');
    shell.className = 'live-editor-shell live-editor-wizard-shell';
    shell.id = 'liveEditorShell';
    shell.innerHTML = `
      <section class="live-editor-panel live-editor-wizard-panel" role="dialog" aria-modal="true" aria-label="Edit Test Pad">
        <header class="live-editor-head"><div><h2>Edit pad information</h2><p>Update the pad one simple step at a time.</p></div></header>
        <form id="liveEditorForm" novalidate>
          <nav class="live-editor-steps" id="liveEditorSteps" aria-label="Edit pad steps">
            <button class="live-editor-step" type="button">Basics</button>
            <button class="live-editor-step" type="button">Location</button>
            <button class="live-editor-step" type="button">Wells</button>
            <button class="live-editor-step" type="button">Directions</button>
            <button class="live-editor-step" type="button">Review</button>
          </nav>
          <section class="live-editor-page" data-step="basics">
            <label for="livePadName">Pad name</label><input id="livePadName" name="padName">
            <label for="liveCompany">Company</label><input id="liveCompany" name="company">
          </section>
          <section class="live-editor-page" data-step="location" style="display:none">
            <label for="liveAddress">Address</label><input id="liveAddress" name="address">
            <label for="liveGateCode">Gate code</label><input id="liveGateCode" name="gateCode">
            <label for="livePhone">Emergency phone</label><input id="livePhone" name="phone">
          </section>
          <section class="live-editor-page" data-step="wells" style="display:none">
            <label for="liveWells">Well names</label><textarea id="liveWells" name="wellName"></textarea>
            <label for="liveApi">API numbers</label><textarea id="liveApi" name="api"></textarea>
          </section>
          <section class="live-editor-page" data-step="review" style="display:none">
            <label for="liveNotes">Pad notes</label><textarea id="liveNotes" name="notes"></textarea>
          </section>
          <button type="submit">Save Changes</button>
        </form>
      </section>`;
    document.body.appendChild(shell);
    window.BrineSearchSignScanner.refresh();
  });
  await page.waitForFunction(() => window.BrineSearchSignScanner.determineContext() === 'edit');
  await page.locator('#liveEditorForm #bs-sign-scan-entry').waitFor({ state: 'visible' });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of viewports) {
      for (const theme of themes) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: viewport.mobile,
          hasTouch: viewport.mobile,
          deviceScaleFactor: viewport.mobile ? 2 : 1,
          userAgent: viewport.mobile
            ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
            : undefined
        });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.addInitScript(value => {
          localStorage.setItem('brinesearch-theme', value);
          window.confirm = () => true;
        }, theme);

        await page.goto(`${baseUrl}/${padRoute}`, { waitUntil: 'domcontentloaded' });
        await waitForScanner(page);
        assert.strictEqual(await page.locator('#bs-sign-scan-entry').count(), 1, `${viewport.name}/${theme}: duplicate pad scanner entry`);
        await assertNoOverflow(page, `${viewport.name}/${theme} pad page`);

        const parsed = await page.evaluate(text => window.BrineSearchSignScanner.parseSignText(text), sampleText);
        assert(/Rubel Dodd Pad/i.test(parsed.padName), `pad parser: ${parsed.padName}`);
        assert(/Gulfport Energy/i.test(parsed.operator), `operator parser: ${parsed.operator}`);
        assert.strictEqual(parsed.gateCode, '2580');
        assert(parsed.apiNumber.includes('34-111-23456-00'));
        assert(/H2S/i.test(parsed.notes));

        await page.evaluate(text => window.BrineSearchSignScanner.openReviewFromText(text), sampleText);
        await page.locator('#bs-sign-modal:not([hidden])').waitFor({ state: 'visible' });
        assert.strictEqual(await page.locator('#bs-sign-value-gateCode').inputValue(), '2580');
        assert.strictEqual(await page.locator('#bs-sign-value-apiNumber').inputValue(), '34-111-23456-00');
        await assertNoOverflow(page, `${viewport.name}/${theme} review modal`);
        await page.locator('[data-bs-close-sign]').last().click();

        await mountRealEditPadShell(page);
        assert.strictEqual(await page.locator('#bs-sign-scan-entry').count(), 1, `${viewport.name}/${theme}: duplicate Edit Pad scanner entry`);
        assert.strictEqual(await page.evaluate(() => window.BrineSearchSignScanner.determineContext()), 'edit');
        assert.strictEqual(await page.locator('#liveEditorForm > #bs-sign-scan-entry').count(), 1, `${viewport.name}/${theme}: scanner is not inside the real Edit Pad form`);
        await assertNoOverflow(page, `${viewport.name}/${theme} Edit Pad`);

        assert.deepStrictEqual(pageErrors, [], `${viewport.name}/${theme}: page errors: ${pageErrors.join(' | ')}`);
        results.push(`${viewport.name} / ${theme}: Pad Page + real Edit Pad shell + modal + overflow passed`);
        await context.close();
      }
    }

    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/${padRoute}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.BrineSearchSignScanner, null, { timeout: 15000 });
      await mountRealEditPadShell(page);
      await page.evaluate(text => window.BrineSearchSignScanner.openReviewFromText(text), sampleText);
      await page.locator('[data-bs-apply-sign]').click();
      await page.waitForTimeout(300);
      assert.strictEqual(await page.locator('#liveGateCode').inputValue(), '2580');
      assert.strictEqual(await page.locator('#liveApi').inputValue(), '34-111-23456-00');
      assert(/Rubel Dodd Pad/i.test(await page.locator('#livePadName').inputValue()));
      assert(/Gulfport Energy/i.test(await page.locator('#liveCompany').inputValue()));
      assert(/1234 County Road 12/i.test(await page.locator('#liveAddress').inputValue()));
      assert(/H2S/i.test(await page.locator('#liveNotes').inputValue()));
      results.push('Real Edit Pad wizard field population passed, including hidden steps');
      await context.close();
    }

    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/${padRoute}`, { waitUntil: 'domcontentloaded' });
      await waitForScanner(page);
      await page.evaluate(text => {
        window.Tesseract = {
          createWorker: async (_lang, _oem, options) => ({
            recognize: async () => {
              options?.logger?.({ status: 'recognizing text', progress: 1 });
              return { data: { text } };
            },
            terminate: async () => {}
          })
        };
      }, sampleText);
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZkM8AAAAASUVORK5CYII=', 'base64');
      await page.locator('input[data-bs-sign-file]').setInputFiles({ name: 'front-sign.png', mimeType: 'image/png', buffer: png });
      await page.locator('#bs-sign-modal:not([hidden])').waitFor({ state: 'visible', timeout: 10000 });
      await page.locator('#bs-sign-fill-editor').uncheck();
      await page.locator('[data-bs-apply-sign]').click();
      await page.locator('#bs-sign-scan-card').waitFor({ state: 'visible' });
      assert(/2580/.test(await page.locator('#bs-sign-scan-card').innerText()));
      const saved = await page.evaluate(() => window.BrineSearchSignScanner.getRecord());
      assert.strictEqual(saved.fields.gateCode, '2580');
      assert(!Object.prototype.hasOwnProperty.call(saved, 'photo'), 'full photo must not be persisted');
      results.push('Camera file + OCR + review + Pad Page card save passed');
      await context.close();
    }

    console.log('\nV16.22 SIGN SCANNER AUDIT PASSED');
    results.forEach(item => console.log(`- ${item}`));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
