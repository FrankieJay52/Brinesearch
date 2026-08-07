import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.V17_PREVIEW_URL || 'http://127.0.0.1:4173';
const visualAuditDir = process.env.V17_VISUAL_AUDIT_DIR || '';
if (visualAuditDir) await fs.mkdir(visualAuditDir, { recursive: true });
const capture = async (page, testCase, route) => {
  if (!visualAuditDir) return;
  await page.screenshot({ path: path.join(visualAuditDir, `${testCase.name}-${route}.png`), fullPage: true });
};
const cases = [
  { name: 'iphone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false }
];

const failures = [];
const results = [];

for (const testCase of cases) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: testCase.viewport,
    isMobile: testCase.isMobile,
    hasTouch: testCase.hasTouch,
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  const pageErrors = [];
  const assetFailures = [];

  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('response', response => {
    try {
      const url = new URL(response.url());
      const base = new URL(baseUrl);
      if (url.origin === base.origin && response.status() >= 400) {
        assetFailures.push(`${response.status()} ${url.pathname}`);
      }
    } catch {}
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 80, null, { timeout: 30000 });
  await page.waitForTimeout(3500);
  await capture(page, testCase, 'home');

  const audit = await page.evaluate(async () => {
    const bodyText = document.body?.innerText || '';
    const overflow = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) - window.innerWidth;
    const controls = Array.from(document.querySelectorAll('button,a'))
      .filter(el => {
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map(el => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const iconUrls = new Set();
    const stylesheetBase = new URL('/styles/field-mark-icons.css', document.baseURI);
    document.querySelectorAll('.fm-icon').forEach(icon => {
      const style = getComputedStyle(icon);
      const resolvedMask = style.webkitMaskImage || style.maskImage || '';
      const resolvedMatch = resolvedMask.match(/url\(["']?([^"')]+)["']?\)/i);
      if (resolvedMatch) {
        iconUrls.add(new URL(resolvedMatch[1], document.baseURI).href);
        return;
      }
      const raw = style.getPropertyValue('--fm-icon').trim();
      const rawMatch = raw.match(/url\(["']?([^"')]+)["']?\)/i);
      if (rawMatch) iconUrls.add(new URL(rawMatch[1], stylesheetBase).href);
    });

    const imageUrls = new Set();
    document.querySelectorAll('img[src]').forEach(img => {
      try {
        const url = new URL(img.getAttribute('src'), document.baseURI);
        if (url.origin === location.origin) imageUrls.add(url.href);
      } catch {}
    });

    const iconChecks = await Promise.all(Array.from(iconUrls).map(async url => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        return response.ok ? null : `${response.status} ${new URL(url).pathname}`;
      } catch (error) {
        return `${new URL(url).pathname}: ${error.message}`;
      }
    }));

    const imageChecks = await Promise.all(Array.from(imageUrls).map(async url => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        return response.ok ? null : `${response.status} ${new URL(url).pathname}`;
      } catch (error) {
        return `${new URL(url).pathname}: ${error.message}`;
      }
    }));

    const brokenImages = Array.from(document.images)
      .filter(img => !img.src.startsWith('data:') && img.complete && img.naturalWidth === 0)
      .map(img => {
        try { return new URL(img.src, document.baseURI).pathname; }
        catch { return img.src; }
      });

    const quickIcons = Array.from(document.querySelectorAll('.dashboard-quick .fm-icon'));
    const quickIconMasks = quickIcons.map(icon => {
      const style = getComputedStyle(icon);
      return style.webkitMaskImage || style.maskImage || '';
    });
    const scripts = Array.from(document.scripts).map(script => script.src).filter(Boolean);

    return {
      title: document.title,
      bodyTextLength: bodyText.length,
      hasBrand: /BrineSearch/i.test(document.title + ' ' + bodyText),
      overflow,
      controls,
      quickIconCount: quickIcons.length,
      quickIconMasks,
      missingIcons: iconChecks.filter(Boolean),
      missingImages: imageChecks.filter(Boolean),
      brokenImages,
      structuredVersion: document.documentElement.dataset.brinesearchVersion || '',
      hasStructuredScript: scripts.some(src => /\/app\/front-sign-structured\.js/i.test(src)),
      hasLegacyOcrHotfix: scripts.some(src => /\/v16-25-hotfix\.js/i.test(src)),
      globals: {
        roadDatabase: Boolean(window.BrineSearchRoadDB),
        roadManager: Boolean(window.BrineSearchRoadManager),
        frontSignScanner: Boolean(window.BrinesearchFrontSignScanner)
      }
    };
  });

  let productAudit = { favoritesPage: false, feedPage: false, blockingFeedPrompt: false, guestBanner: false, settingsVersion: '', duplicateRoadEntries: 0 };
  try {
    await page.evaluate(() => { location.hash = '#/favorites'; });
    await page.waitForSelector('.favorites-page', { state: 'visible', timeout: 5000 });
    const favoritesPage = await page.evaluate(() => Boolean(document.querySelector('.favorites-page')) && !/Page not found/i.test(document.body.innerText));
    await capture(page, testCase, 'favorites');

    await page.evaluate(() => { location.hash = '#/feed'; });
    await page.waitForSelector('.field-feed-page', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(250);
    const feedState = await page.evaluate(() => ({
      feedPage: Boolean(document.querySelector('.field-feed-page')),
      blockingFeedPrompt: Boolean(document.querySelector('.feed-login-overlay')),
      guestBanner: Boolean(document.querySelector('.feed-guest-banner'))
    }));
    await capture(page, testCase, 'feed');

    await page.evaluate(() => { location.hash = '#/settings'; });
    await page.waitForSelector('.settings-page', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(200);
    const settingsState = await page.evaluate(() => ({
      settingsVersion: document.querySelector('.settings-version')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      duplicateRoadEntries: Array.from(document.querySelectorAll('.settings-row')).filter(row => /Road Manager/i.test(row.textContent || '')).length
    }));
    await capture(page, testCase, 'settings');

    productAudit = { favoritesPage, ...feedState, ...settingsState };
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForSelector('.v173-dashboard', { state: 'visible', timeout: 5000 });
  } catch (error) {
    failures.push(`${testCase.name}: V17.3 product-route audit failed: ${error.message}`);
  }

  let scannerAudit = { opened: false, version: '', readButton: '', photoActions: [], rawVisible: true, detailsVisible: true };
  try {
    await page.evaluate(() => window.BrinesearchFrontSignScanner?.openScanner?.({ mode: 'pad', padId: 'browser-audit-pad' }));
    await page.waitForSelector('#brinesearchFrontSignModal', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(250);
    scannerAudit = await page.evaluate(() => {
      const modal = document.getElementById('brinesearchFrontSignModal');
      const raw = modal?.querySelector('#bssRawText')?.closest('div');
      const details = modal?.querySelector('#bssDetails');
      const isVisible = element => {
        if (!element) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      return {
        opened: Boolean(modal),
        version: modal?.querySelector('.bss-head .bss-confidence')?.textContent?.trim() || '',
        readButton: modal?.querySelector('#bssReadButton')?.textContent?.trim() || '',
        photoActions: Array.from(modal?.querySelectorAll('#brinesearch-sign-photo-choices button') || []).map(button => button.textContent.trim()),
        structuredNote: modal?.querySelector('#brinesearch-sign-structured-note')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        rawVisible: isVisible(raw),
        detailsVisible: isVisible(details)
      };
    });
    await page.locator('#brinesearchFrontSignModal .bss-close').click();
  } catch (error) {
    failures.push(`${testCase.name}: structured scanner did not open: ${error.message}`);
  }

  if (!audit.hasBrand) failures.push(`${testCase.name}: BrineSearch branding did not render`);
  if (audit.bodyTextLength < 80) failures.push(`${testCase.name}: page rendered too little content`);
  if (audit.overflow > 2) failures.push(`${testCase.name}: horizontal overflow of ${audit.overflow}px`);
  if (!audit.controls.some(text => /^Home$/i.test(text) || /Search/i.test(text))) {
    failures.push(`${testCase.name}: core navigation controls were not visible`);
  }
  if (audit.quickIconCount !== 6) failures.push(`${testCase.name}: expected 6 dashboard quick-action icons, found ${audit.quickIconCount}`);
  if (audit.quickIconMasks.some(mask => !/\/icons\//.test(mask))) failures.push(`${testCase.name}: a dashboard quick-action icon did not resolve to /icons/`);
  if (!audit.globals.roadDatabase) failures.push(`${testCase.name}: Road Database did not start`);
  if (!audit.globals.roadManager) failures.push(`${testCase.name}: Road Manager did not start`);
  if (!audit.globals.frontSignScanner) failures.push(`${testCase.name}: Front Sign Scanner did not start`);
  if (!productAudit.favoritesPage) failures.push(`${testCase.name}: Favorites route did not render the V17.3 Favorites page`);
  if (!productAudit.feedPage) failures.push(`${testCase.name}: Field Feed did not render`);
  if (productAudit.blockingFeedPrompt) failures.push(`${testCase.name}: blocking Field Feed login prompt still appeared`);
  if (!productAudit.guestBanner) failures.push(`${testCase.name}: public Feed guest banner is missing`);
  if (!/V 17\.3/i.test(productAudit.settingsVersion)) failures.push(`${testCase.name}: Settings does not report V17.3`);
  if (productAudit.duplicateRoadEntries > 1) failures.push(`${testCase.name}: Settings displayed ${productAudit.duplicateRoadEntries} Road Manager entries`);
  if (audit.structuredVersion !== '17.2') failures.push(`${testCase.name}: structured scanner runtime reported ${audit.structuredVersion || 'no version'} instead of 17.2`);
  if (!audit.hasStructuredScript) failures.push(`${testCase.name}: V17.2 structured scanner script was not loaded`);
  if (audit.hasLegacyOcrHotfix) failures.push(`${testCase.name}: legacy V16.25 OCR hotfix is still loaded`);
  if (!scannerAudit.opened) failures.push(`${testCase.name}: Scan Front Sign modal did not open`);
  if (scannerAudit.version !== 'V17.2') failures.push(`${testCase.name}: scanner modal shows ${scannerAudit.version || 'no version'} instead of V17.2`);
  if (scannerAudit.readButton !== 'Read Database Fields') failures.push(`${testCase.name}: scanner read button is not the V17.2 database-field action`);
  if (!scannerAudit.photoActions.some(text => /Take Photo/i.test(text)) || !scannerAudit.photoActions.some(text => /Choose Photo/i.test(text))) failures.push(`${testCase.name}: scanner photo choices are incomplete`);
  if (!/Only database fields/i.test(scannerAudit.structuredNote)) failures.push(`${testCase.name}: structured database-field review notice is missing`);
  if (scannerAudit.rawVisible) failures.push(`${testCase.name}: raw OCR dump is still visible in the normal scanner workflow`);
  if (scannerAudit.detailsVisible) failures.push(`${testCase.name}: unrelated sign detail section is still visible in the normal scanner workflow`);
  for (const error of pageErrors) failures.push(`${testCase.name} page error: ${error}`);
  for (const error of assetFailures) failures.push(`${testCase.name} asset failure: ${error}`);
  for (const error of audit.missingIcons) failures.push(`${testCase.name} missing icon: ${error}`);
  for (const error of audit.missingImages) failures.push(`${testCase.name} missing image: ${error}`);
  for (const error of audit.brokenImages) failures.push(`${testCase.name} broken image: ${error}`);

  results.push({
    case: testCase.name,
    title: audit.title,
    bodyTextLength: audit.bodyTextLength,
    overflow: audit.overflow,
    quickIconCount: audit.quickIconCount,
    missingIconCount: audit.missingIcons.length,
    missingImageCount: audit.missingImages.length,
    brokenImages: audit.brokenImages,
    structuredVersion: audit.structuredVersion,
    productAudit,
    scannerAudit,
    globals: audit.globals,
    pageErrors,
    assetFailures
  });

  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
if (failures.length) {
  console.error('\nV17 browser audit failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('\nV17.3 browser audit passed on iPhone and desktop with structured sign-scanner workflow and resolved Field Mark icons.');
