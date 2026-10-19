// Browser integration: earn a spotlight through real movement, choose a remix, and use it on touch.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve, launch } from './serve.mjs';

const { server, url } = await serve();
const browser = await launch();
const errors = [];
await mkdir('tmp/playtest', { recursive: true });
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => { if (message.type() === 'error' && message.text().startsWith('[game]')) errors.push(message.text()); });
};
const offset = (page) => page.evaluate(() => {
  const g = window.__LS.game, s = g.spotlight;
  return s ? { x: s.x - g.player.x, y: s.y - g.player.y, r: s.r } : null;
});
const fits = async (page, selector, width, height) => {
  const b = await page.locator(selector).boundingBox();
  assert.ok(b && b.x >= -1 && b.y >= -1 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1, `${selector} must fit: ${JSON.stringify(b)}`);
};

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(page);
  await page.goto(`${url}/?god=1&density=0&seed=31`);
  await page.click('[data-act=play]');
  await page.keyboard.press('1');
  await page.waitForFunction(() => window.__LS.game.state === 'playing');
  // Wait for the real first objective. No reward, progress, position or draft is injected.
  await page.waitForFunction(() => window.__LS.game.spotlight, null, { timeout: 20000 });
  const held = new Set();
  for (let i = 0; i < 80; i++) {
    const d = await offset(page);
    if (!d || Math.hypot(d.x, d.y) < d.r * 0.4) break;
    const wanted = new Set();
    if (Math.abs(d.x) > 12) wanted.add(d.x > 0 ? 'd' : 'a');
    if (Math.abs(d.y) > 12) wanted.add(d.y > 0 ? 's' : 'w');
    for (const key of held) if (!wanted.has(key)) { await page.keyboard.up(key); held.delete(key); }
    for (const key of wanted) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
    await page.waitForTimeout(100);
  }
  for (const key of held) await page.keyboard.up(key);
  await page.waitForFunction(() => window.__LS.game.spotlight?.progress > 2, null, { timeout: 7000 });
  await page.screenshot({ path: 'tmp/playtest/desktop-spotlight.png' });
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => ({ progress: window.__LS.game.spotlight.progress, remaining: window.__LS.game.spotlight.remaining }));
  await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(() => ({ progress: window.__LS.game.spotlight.progress, remaining: window.__LS.game.spotlight.remaining })), paused);
  await page.click('[data-act=resume]');
  await page.locator('.remix-draft').waitFor({ timeout: 7000 });
  assert.equal(await page.evaluate(() => window.__LS.game.spotlightsCleared), 1);
  assert.equal(await page.locator('.card-remix').count(), 3);
  assert.equal(await page.locator('[data-act=reroll]').count(), 0);
  const chosen = await page.evaluate(() => ({ id: window.__LS.game.offers[0].remix.id, name: window.__LS.game.offers[0].remix.name }));
  const rerolls = await page.evaluate(() => window.__LS.game.rerolls);
  await page.keyboard.press('r');
  assert.equal(await page.evaluate(() => window.__LS.game.rerolls), rerolls);
  await page.screenshot({ path: 'tmp/playtest/desktop-remix.png' });
  await page.keyboard.press('1');
  await page.waitForFunction(() => window.__LS.game.state === 'playing');
  assert.deepEqual(await page.evaluate(() => window.__LS.game.remixes), [chosen.id]);
  await page.locator('.remix-badge').waitFor();
  await page.keyboard.press('Escape');
  assert.ok((await page.locator('.build-remixes').innerText()).includes(chosen.name));
  await page.screenshot({ path: 'tmp/playtest/desktop-remix-build.png' });
  await page.click('[data-act=resume]');
  assert.deepEqual(await page.evaluate(() => window.__LS.game.remixes), [chosen.id]);
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  watch(mobile);
  await mobile.goto(`${url}/?god=1&density=0&seed=32`);
  await mobile.tap('[data-act=play]');
  await mobile.tap('.card[data-i="1"]');
  await mobile.waitForFunction(() => window.__LS.game.state === 'playing');
  // Only shorten the wait to the objective on the second viewport. Touch still earns its reward.
  await mobile.evaluate(() => { const g = window.__LS.game; g.nextSpotlight = g.time + 0.2; });
  await mobile.waitForFunction(() => window.__LS.game.spotlight);
  for (const selector of ['.spotlight-objective', '.dashmeter', '.dropmeter', '.mixer', '.transport', '.pausebtn']) await fits(mobile, selector, 390, 844);
  const cdp = await mobile.context().newCDPSession(mobile);
  const origin = { x: 95, y: 540 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...origin, id: 1 }] });
  for (let i = 0; i < 80; i++) {
    const d = await offset(mobile);
    if (!d || Math.hypot(d.x, d.y) < d.r * 0.4) break;
    const length = Math.hypot(d.x, d.y);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: origin.x + d.x / length * 48, y: origin.y + d.y / length * 48, id: 1 }] });
    await mobile.waitForTimeout(100);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForFunction(() => window.__LS.game.spotlight?.progress > 1, null, { timeout: 5000 });
  await mobile.screenshot({ path: 'tmp/playtest/mobile-spotlight.png' });
  await mobile.locator('.remix-draft').waitFor({ timeout: 8000 });
  assert.equal(await mobile.evaluate(() => window.__LS.game.spotlightsCleared), 1);
  assert.equal(await mobile.locator('.card-remix').count(), 3);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await mobile.screenshot({ path: 'tmp/playtest/mobile-remix.png' });
  const mobileChoice = await mobile.evaluate(() => window.__LS.game.offers[1].remix.id);
  await mobile.tap('.card-remix[data-i="1"]');
  await mobile.waitForFunction(() => window.__LS.game.state === 'playing');
  assert.deepEqual(await mobile.evaluate(() => window.__LS.game.remixes), [mobileChoice]);
  await mobile.tap('.dashmeter');
  assert.equal(await mobile.evaluate(() => window.__LS.game.dashes), 1);
  await mobile.tap('.pausebtn');
  assert.equal(await mobile.locator('.build-remixes li').count(), 1);
  await mobile.tap('[data-act=resume]');
  assert.equal(await mobile.evaluate(() => window.__LS.game.remixes.length), 1);
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('PASS: desktop keyboard + mobile touch earn real spotlights; capture freezes on pause; remix drafts, selections, build persistence, controls and mobile layout work without browser errors. Screenshots: tmp/playtest/');
} finally {
  await browser.close();
  server.close();
}
