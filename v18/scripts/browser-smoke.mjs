import assert from "node:assert/strict";
import { chromium } from "playwright";

const previewUrl = new URL(process.env.V18_PREVIEW_URL || "http://127.0.0.1:4181/v18/");
const browser = await chromium.launch({ headless: true });

function appUrl(route = "/") {
  const url = new URL(previewUrl);
  url.hash = `#${route}`;
  return url.href;
}

async function assertV18Boundary(page, label) {
  const current = new URL(page.url());
  assert.ok(current.pathname.includes("/v18/"), `${label} escaped the V18 path: ${current.href}`);
  assert.equal(await page.locator('a[href*="/index.html"], a[href*="/v17"]').count(), 0, `${label} exposes a legacy-page link`);
  const text = await page.locator("body").innerText();
  assert.doesNotMatch(text, /V17(?:\.3)?|Loading directory/i, `${label} rendered legacy-page copy`);
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1, `${label} has horizontal overflow: ${JSON.stringify(overflow)}`);
}

async function runViewport(label, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));

  await page.goto(appUrl("/control-center"), { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Open the V18 road workspace", exact: true }).waitFor();
  await assertV18Boundary(page, `${label} Control Center`);

  await page.getByRole("link", { name: "Continue to V18 Road Map", exact: true }).click();
  await page.waitForURL(/#\/settings\/approved-routes$/);
  await page.getByRole("heading", { name: "Sign in before opening the road map", exact: true }).waitFor();
  await assertV18Boundary(page, `${label} owner boundary`);

  await page.goBack();
  await page.getByRole("heading", { name: "Open the V18 road workspace", exact: true }).waitFor();
  assert.match(page.url(), /#\/control-center$/);

  await page.getByRole("link", { name: "Sign in to V18", exact: true }).click();
  await page.waitForURL(/#\/sign-in\?next=\/settings\/approved-routes$/);
  await page.getByRole("heading", { name: "Sign in without leaving V18", exact: true }).waitFor();
  await assertV18Boundary(page, `${label} sign-in`);

  await page.getByRole("link", { name: "Back to Control Center", exact: true }).click();
  await page.getByRole("heading", { name: "Open the V18 road workspace", exact: true }).waitFor();
  assert.match(page.url(), /#\/control-center$/);

  await page.goto(appUrl("/more"), { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "More", exact: true }).waitFor();
  await assertV18Boundary(page, `${label} More`);
  await page.getByRole("link", { name: /Control Center/ }).waitFor();
  await page.getByRole("link", { name: /Field Updates/ }).waitFor();

  await page.goto(appUrl("/settings"), { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Make it comfortable", exact: true }).waitFor();
  await assertV18Boundary(page, `${label} Settings`);

  await page.goto(appUrl("/field-updates"), { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "What crews are seeing", exact: true }).waitFor();
  await assertV18Boundary(page, `${label} Field Updates`);

  assert.deepEqual(pageErrors, [], `${label} emitted page errors:\n${pageErrors.join("\n")}`);
  await context.close();
}

try {
  await runViewport("iPhone", { width: 390, height: 844 });
  await runViewport("desktop", { width: 1440, height: 900 });
  console.log(`V18 browser smoke passed at ${previewUrl.href}: native Control Center, owner boundary, sign-in, Back, More, Settings, and Field Updates stayed in V18 with no legacy links or horizontal overflow.`);
} finally {
  await browser.close();
}
