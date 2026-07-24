const { test, expect } = require('@playwright/test');

const pages = [
  { path: '/', name: 'home' },
  { path: '/linktree/', name: 'linktree' },
  { path: '/impressum/', name: 'impressum' },
  { path: '/datenschutz/', name: 'datenschutz' },
  { path: '/legal/', name: 'legal' },
];

test.describe('visual smoke screenshots', () => {
  for (const pageInfo of pages) {
    test(`${pageInfo.name} renders and can be screenshotted`, async ({ page }, testInfo) => {
      await page.goto(pageInfo.path, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
      await expect(page.locator('body')).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`${pageInfo.name}-${testInfo.project.name}.png`),
        fullPage: true,
      });
    });
  }
});

test.describe('membership safety requirements', () => {
  test('home exposes bilingual locked membership sections without external adult redirects', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /exclusive content/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /limited free content/i })).toBeVisible();
    await expect(page.locator('#exclusive').getByRole('heading', { name: /exclusive content/i })).toBeVisible();
    await expect(page.getByText(/content locked/i).first()).toBeVisible();
    await expect(page.locator('a[href*="onlyfans" i]')).toHaveCount(0);
    await expect(page.locator('script[src*="paypal" i]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Secure Membership');
    await expect(page.evaluate(() => window.ExclusiveBackend.canViewExclusiveContent({ status: 'ACTIVE', emailVerified: true, ageVerificationApproved: true, secondFactorConfigured: true, stepUpAuthenticated: true, jurisdictionAllowed: true }, { status: 'ACTIVE' }))).resolves.toMatchObject({ allowed: false, reason: 'EXCLUSIVE_CONTENT_DISABLED' });

    await page.getByRole('button', { name: 'DE' }).click();
    await expect(page.getByRole('heading', { name: /begrenzte kostenlose inhalte/i })).toBeVisible();
    await expect(page.getByText(/inhalt gesperrt/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /exklusive inhalte/i }).first()).toBeVisible();
  });

  test('/linktree remains local and routes to the one-page site', async ({ page }) => {
    await page.goto('/linktree/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('link', { name: /exclusive content/i })).toHaveAttribute('href', '../#exclusive');
    await expect(page.locator('a[href^="http"]')).toHaveCount(0);
    await expect(page.locator('script[src^="http"]')).toHaveCount(0);
  });
});


test.describe('legal notices', () => {
  test('legal page provides DE/EN notices and placeholders without production claims', async ({ page }) => {
    await page.goto('/legal/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /legal notices/i })).toBeVisible();
    await expect(page.getByText(/18 U\.S\.C\. §2257/)).toBeVisible();
    await expect(page.getByText(/\[LEGAL_BUSINESS_NAME\]/)).toBeVisible();
    await page.getByRole('button', { name: 'DE' }).click();
    await page.goto('/legal/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /rechtliche hinweise/i })).toBeVisible();
    await expect(page.locator('[data-legal=privacyText]')).toContainText(/DSGVO/);
    await expect(page.getByText(/keine gesetzliche Zulassung/i)).toBeVisible();
  });
});
