import { chromium } from 'playwright';

const baseUrl = process.env.V17_PREVIEW_URL || 'http://127.0.0.1:4173';
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
      globals: {
        roadDatabase: Boolean(window.BrineSearchRoadDB),
        roadManager: Boolean(window.BrineSearchRoadManager),
        frontSignScanner: Boolean(window.BrinesearchFrontSignScanner)
      }
    };
  });

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
console.log('\nV17 browser audit passed on iPhone and desktop viewports with resolved Field Mark icons.');
