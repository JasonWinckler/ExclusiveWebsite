const { test, expect } = require('@playwright/test');

const pages = [
  { path: '/', name: 'home', unlockAgeGate: true },
  { path: '/linktree/', name: 'linktree' },
  { path: '/impressum/', name: 'impressum' },
  { path: '/datenschutz/', name: 'datenschutz' },
];

test.describe('visual smoke screenshots', () => {
  for (const pageInfo of pages) {
    test(`${pageInfo.name} renders and can be screenshotted`, async ({ page }, testInfo) => {
      await page.goto(pageInfo.path, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts?.ready).catch(() => undefined);

      if (pageInfo.unlockAgeGate) {
        await page.getByRole('button', { name: /i am 18\+/i }).click();
        await expect(page.locator('[data-age-gate]')).toBeHidden();
      }

      await expect(page.locator('body')).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`${pageInfo.name}-${testInfo.project.name}.png`),
        fullPage: true,
      });
    });
  }
});
