import { test, expect } from '@playwright/test';

const pages = [
  { path: '/', name: 'home' },
  { path: '/linktree/', name: 'linktree' },
  { path: '/impressum/', name: 'impressum' },
  { path: '/datenschutz/', name: 'datenschutz' },
  { path: '/legal/', name: 'legal' },
  { path: '/legal/us/', name: 'legal-us' },
  { path: '/legal/eu/', name: 'legal-eu' },
];

test.describe('visual smoke screenshots', () => {
  for (const pageInfo of pages) {
    test(`${pageInfo.name} renders and can be screenshotted`, async ({ page }, testInfo) => {
      await page.goto(pageInfo.path, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
      await page.evaluate(() => Promise.all(
        [...document.images].map((image) => image.decode().catch(() => undefined)),
      ));
      await page.waitForTimeout(1_500);
      await expect(page.locator('body')).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`${pageInfo.name}-${testInfo.project.name}.png`),
        fullPage: true,
      });
    });
  }
});

test.describe('membership safety requirements', () => {
  test('home exposes the bilingual launch experience and secure account dialog', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /shadow’s temptation/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /three steps to your private access/i })).toBeVisible();
    await expect(page.locator('#exclusive').getByRole('heading', { name: /what waits beyond the shadow/i })).toBeVisible();
    await expect(page.locator('main form')).toHaveCount(0);
    await page.getByRole('button', { name: 'Register' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel(/display name/i)).toBeVisible();
    await page.getByRole('button', { name: /close dialog/i }).click();
    await expect(page.locator('a[href*="onlyfans" i]')).toHaveCount(0);
    await expect(page.locator('script[src*="paypal" i]')).toHaveCount(0);

    await page.getByRole('button', { name: 'DE' }).click();
    await expect(page.getByRole('heading', { name: /drei schritte bis zu deinem zugang/i })).toBeVisible();
    await expect(page.locator('#exclusive').getByRole('heading', { name: /was hinter dem schatten wartet/i })).toBeVisible();
  });

  test('/linktree exposes only the approved neutral public links', async ({ page }) => {
    await page.goto('/linktree/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('link', { name: /exclusive content/i })).toHaveAttribute('href', 'https://exclusive.jason-shadow.com/');
    await expect(page.getByRole('link', { name: /instagram/i })).toHaveAttribute('href', 'https://www.instagram.com/shadows.temptation_official/');
    await expect(page.locator('.link-list a')).toHaveCount(2);
    await expect(page.locator('a[href="https://jason-shadow.com/"]')).toHaveCount(0);
    const banner = page.locator('.banner-wrap img[src="uploads/banner.png"]');
    await expect(banner).toBeVisible();
    await expect.poll(() => banner.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('script[src^="http"]')).toHaveCount(0);
  });
});


test.describe('legal notices', () => {
  test('main footer exposes the approved social, links and legal destinations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const footerLinks = page.locator('#legal nav a');
    await expect(footerLinks).toHaveCount(3);
    await expect(footerLinks.filter({ hasText: 'Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/shadows.temptation_official/');
    await expect(footerLinks.filter({ hasText: 'Links' })).toHaveAttribute('href', '/linktree/');
    await expect(footerLinks.filter({ hasText: 'LEGAL' })).toHaveAttribute('href', '/legal/');
  });

  test('legal page routes through concise region choices to complete notices', async ({ page }) => {
    await page.goto('/legal/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /legal information, clearly arranged/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^USA/ })).toHaveAttribute('href', '/legal/us/');
    await expect(page.getByRole('link', { name: /^Deutschland \/ EU/ })).toHaveAttribute('href', '/legal/eu/');

    await page.goto('/legal/us/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /additional rules for the united states/i })).toBeVisible();
    await expect(page.locator('.legal-accordion')).toHaveCount(6);
    await expect(page.locator('.legal-accordion summary').filter({ hasText: /18 U\.S\.C\. §§ 2257/ }).first()).toBeVisible();

    await page.goto('/legal/eu/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /trust needs clear rules/i })).toBeVisible();
    await expect(page.locator('.legal-accordion')).toHaveCount(7);
    await expect(page.locator('#imprint')).toContainText('Jason Winckler');

    await page.getByRole('button', { name: 'DE' }).click();
    await page.goto('/legal/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /rechtliches, klar gegliedert/i })).toBeVisible();
    await page.goto('/legal/eu/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#privacy')).toContainText(/DSGVO/);
  });
});
