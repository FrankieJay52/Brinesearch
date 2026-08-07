import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.V17_PREVIEW_URL || 'http://127.0.0.1:4173';
const outputDir = process.env.V17_SCREENSHOT_DIR || 'visual-audit';
await fs.mkdir(outputDir, { recursive: true });

const devices = [
  { name: 'iphone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false }
];
const screens = [
  { name: 'home', hash: '#/' },
  { name: 'feed', hash: '#/feed' },
  { name: 'pad', hash: '#/pad/expand--albert-hohman' },
  { name: 'favorites', hash: '#/favorites' },
  { name: 'offline', hash: '#/offline' },
  { name: 'settings', hash: '#/settings' }
];

for (const device of devices) {
  for (const theme of ['night', 'day']) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: device.viewport,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
      serviceWorkers: 'block',
      colorScheme: theme === 'day' ? 'light' : 'dark'
    });
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.dismiss());

    await page.goto(`${baseUrl}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(value => localStorage.setItem('brinesearch.theme.v1', value), theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    for (const screen of screens) {
      await page.evaluate(hash => { location.hash = hash; }, screen.hash);
      await page.waitForTimeout(screen.name === 'feed' ? 2200 : 1000);
      await page.evaluate(() => window.scrollTo(0, 0));
      const filename = `${outputDir}/${device.name}-${theme}-${screen.name}.png`;
      await page.screenshot({ path: filename, fullPage: true });
    }

    // Capture the global search overlay as a separate core workflow.
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForTimeout(900);
    const searchButton = page.locator('#mobileSearchBtn, #openGlobalSearch, [data-open-global-search]').first();
    if (await searchButton.count()) {
      await searchButton.click().catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${outputDir}/${device.name}-${theme}-search-overlay.png`, fullPage: true });
    }

    await browser.close();
  }
}

console.log(`Saved BrineSearch visual audit screenshots to ${outputDir}.`);
