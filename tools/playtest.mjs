// Real-browser regression: controls, pause, upgrades, Drop, persistent records, and mobile layout.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve, launch } from './serve.mjs';

const { server, url } = await serve();
const browser = await launch();
await mkdir('tmp/playtest', { recursive: true });
const errors = [];
const watch = (page) => page.on('pageerror', (error) => errors.push(error.message));
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(page);
  await page.goto(url);
  await page.locator('[data-act=play]').waitFor();
  await page.screenshot({ path: 'tmp/playtest/desktop-title.png' });
  await page.click('[data-act=records]');
  assert.equal(await page.locator('.record-card').count(), 6);
  await page.click('[data-act=back]');
  await page.click('[data-act=settings]');
  await page.uncheck('#set-shake');
  await page.focus('#set-flash');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#set-flash').isChecked(), false);
  await page.focus('#set-volume');
  await page.keyboard.press('Escape');
  await page.locator('.screen-title').waitFor();
  await page.click('[data-act=play]');
  await page.locator('.card').first().waitFor();
  await page.screenshot({ path: 'tmp/playtest/desktop-select.png' });
  await page.keyboard.press('1');
  await page.waitForFunction(() => window.__LS.game.state === 'playing');
  await page.keyboard.down('d');
  await page.keyboard.press('Shift');
  await page.waitForTimeout(240);
  await page.keyboard.up('d');
  const dash = await page.evaluate(() => ({ x: window.__LS.game.player.x, count: window.__LS.game.dashes }));
  assert.equal(dash.count, 1);
  assert.ok(dash.x > 90, `Dash should cover meaningful distance, got ${dash.x}`);
  await page.keyboard.press('Escape');
  const pausedTime = await page.evaluate(() => window.__LS.game.time);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__LS.game.time), pausedTime);
  await page.screenshot({ path: 'tmp/playtest/desktop-pause.png' });
  await page.click('[data-act=resume]');
  await page.evaluate(() => { window.__LS.game.pendingLevels = 1; });
  await page.locator('.screen-levelup').waitFor();
  const rerolls = await page.evaluate(() => window.__LS.game.rerolls);
  await page.keyboard.press('r');
  assert.equal(await page.evaluate(() => window.__LS.game.rerolls), rerolls - 1);
  await page.screenshot({ path: 'tmp/playtest/desktop-upgrade.png' });
  await page.keyboard.press('2');
  await page.waitForFunction(() => window.__LS.game.state === 'playing');
  await page.evaluate(() => { const g = window.__LS.game; g.dropCharge = g.dropMax; g.opts.solo = true; g.opts.god = true; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__LS.game.drops === 1, null, { timeout: 7000 });
  await page.screenshot({ path: 'tmp/playtest/desktop-play.png' });
  await page.evaluate(() => {
    const g = window.__LS.game;
    g.time = Math.max(62, g.time); g.bestCombo = 30; g.perfectDashes = 10;
    g.opts.god = false; g.player.iframes = 0; g.player.dashT = 0; g.hurt(10000, null);
  });
  await page.locator('.screen-end').waitFor();
  await page.screenshot({ path: 'tmp/playtest/desktop-end.png' });
  const career = await page.evaluate(() => JSON.parse(localStorage.getItem('loop-survivors:v1')).career);
  assert.equal(career.runs, 1);
  assert.ok(career.records.includes('on-beat'));
  await page.reload();
  await page.click('[data-act=records]');
  assert.equal(await page.locator('.record-card.earned').count(), 3);
  await page.screenshot({ path: 'tmp/playtest/desktop-records.png' });
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  watch(mobile);
  await mobile.goto(url);
  await mobile.screenshot({ path: 'tmp/playtest/mobile-title.png' });
  await mobile.tap('[data-act=play]');
  await mobile.locator('.card').first().waitFor();
  await mobile.screenshot({ path: 'tmp/playtest/mobile-select.png' });
  await mobile.tap('.card[data-i="1"]');
  await mobile.waitForFunction(() => window.__LS.game.state === 'playing');
  await mobile.tap('.dashmeter');
  assert.equal(await mobile.evaluate(() => window.__LS.game.dashes), 1);
  for (const selector of ['.dashmeter', '.dropmeter', '.mixer', '.transport', '.pausebtn']) {
    const box = await mobile.locator(selector).boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 391 && box.y + box.height <= 845, `${selector} should fit mobile viewport: ${JSON.stringify(box)}`);
  }
  await mobile.screenshot({ path: 'tmp/playtest/mobile-play.png' });
  await mobile.tap('.pausebtn');
  await mobile.tap('[data-act=resume]');
  assert.equal(await mobile.evaluate(() => window.__LS.game.state), 'playing');
  await mobile.close();

  // The downloadable build must also start offline, including its CSS and game code.
  const offline = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  watch(offline);
  await offline.route('https://**/*', (route) => route.abort());
  await offline.route('http://**/*', (route) => route.abort());
  await offline.goto(new URL('../dist/loop-survivors.html', import.meta.url).href);
  await offline.click('[data-act=play]');
  await offline.keyboard.press('Enter');
  await offline.waitForFunction(() => window.__LS.game.state === 'playing');
  await offline.keyboard.press('Shift');
  assert.equal(await offline.evaluate(() => window.__LS.game.dashes), 1);
  await offline.close();
  assert.deepEqual(errors, []);
  console.log('PASS: desktop + mobile controls, dash, pause, upgrades, Drop, persistence, layouts, keyboard settings, offline build; no browser errors. Screenshots: tmp/playtest/');
} finally {
  await browser.close();
  server.close();
}
