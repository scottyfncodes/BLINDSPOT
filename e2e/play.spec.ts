import { expect, test } from '@playwright/test';

type G = { sim: { player: { pos: { x: number; y: number } } } };
const pos = (page: import('@playwright/test').Page) => page.evaluate(() => ({ ...(window as unknown as { __game: G }).__game.sim.player.pos }));

test('the title opens and the station starts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?qa');
  await expect(page.locator('.wordmark')).toBeVisible();
  await page.locator('[data-p="play"]').click();
  await expect(page.locator('.clock')).toHaveText(/23:1\d/);
  expect(errors).toEqual([]);
});

test('a thumb drag on the world moves Wren (touch)', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'iphone', 'touch only');
  await page.goto('/?qa');
  await page.locator('[data-p="play"]').tap();
  const before = await pos(page);
  const cdp = await context.newCDPSession(page);
  const pt = (x: number, y: number) => [{ x, y, id: 1 }];
  // Start the drag over the HUD area too: touches must reach the world.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(150, 420) });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(150 + i * 7, 420) });
  await page.waitForTimeout(1200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await pos(page);
  expect(after.x - before.x).toBeGreaterThan(2);
});

test('keyboard moves Wren (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'keyboard only');
  await page.goto('/?qa');
  await page.locator('[data-p="play"]').click();
  const before = await pos(page);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyD');
  expect((await pos(page)).x - before.x).toBeGreaterThan(1);
});

test('no horizontal overflow and nothing scrolls', async ({ page }) => {
  await page.goto('/?qa');
  await page.locator('[data-p="play"]').click();
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sy: scrollY }));
  expect(o.sw).toBeLessThanOrEqual(o.cw);
  expect(o.sy).toBe(0);
});
