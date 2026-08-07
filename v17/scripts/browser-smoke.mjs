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

  page.on('pageerror', error => pageErrors.push(error.message));
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
    document.querySelectorAll('.fm-icon').forEach(icon => {
      const raw = getComputedStyle(icon).getPropertyValue('--fm-icon').trim();
      const match = raw.match(/url\(["']?([^"')]+)["']?\)/i);
      if (match) iconUrls.add(new URL(match[1], document.baseURI).href);
    });
    document.querySelectorAll('img[src]').forEach(img => {
      try {
        const url = new URL(img.getAttribute('src'), document.baseURI);
        if (url.origin === location.origin) iconUrls.add(url.href);
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

    return {
      title: document.title,
      bodyTextLength: bodyText.length,
      hasBrand: /BrineSearch/i.test(document.title + ' ' + bodyText),
      overflow,
      controls,
      missingIcons: iconChecks.filter(Boolean),
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
  if (!audit.globals.roadDatabase) failures.push(`${testCase.name}: Road Database did not start`);
  if (!audit.globals.roadManager) failures.push(`${testCase.name}: Road Manager did not start`);
  if (!audit.globals.frontSignScanner) failures.push(`${testCase.name}: Front Sign Scanner did not start`);
  for (const error of pageErrors) failures.push(`${testCase.name} page error: ${error}`);
  for (const error of assetFailures) failures.push(`${testCase.name} asset failure: ${error}`);
  for (const error of audit.missingIcons) failures.push(`${testCase.name} missing icon: ${error}`);

  results.push({
    case: testCase.name,
    title: audit.title,
    bodyTextLength: audit.bodyTextLength,
    overflow: audit.overflow,
    iconCount: audit.missingIcons.length,
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
console.log('\nV17 browser audit passed on iPhone and desktop viewports.');
