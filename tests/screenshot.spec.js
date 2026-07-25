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
    await expect(page.getByRole('heading', { name: /three deliberate steps/i })).toBeVisible();
    await expect(page.locator('#exclusive').getByRole('heading', { name: /exclusive content/i })).toBeVisible();
    await expect(page.getByText(/content locked/i).first()).toBeVisible();
    await expect(page.locator('main form')).toHaveCount(0);
    await page.getByRole('button', { name: 'Register' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel(/display name/i)).toBeVisible();
    await page.getByRole('button', { name: /close dialog/i }).click();
    await expect(page.locator('a[href*="onlyfans" i]')).toHaveCount(0);
    await expect(page.locator('script[src*="paypal" i]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Secure Membership');
    await expect(page.evaluate(() => window.ExclusiveBackend.canViewExclusiveContent({ status: 'ACTIVE', emailVerified: true, ageVerificationApproved: true, secondFactorConfigured: true, stepUpAuthenticated: true, jurisdictionAllowed: true }, { status: 'ACTIVE' }))).resolves.toMatchObject({ allowed: false, reason: 'EXCLUSIVE_CONTENT_DISABLED' });

    await page.getByRole('button', { name: 'DE' }).click();
    await expect(page.getByRole('heading', { name: /drei bewusste schritte/i })).toBeVisible();
    await expect(page.getByText(/inhalt gesperrt/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /exklusive inhalte/i }).first()).toBeVisible();
  });

  test('/linktree routes membership locally without external links', async ({ page }) => {
    await page.goto('/linktree/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('link', { name: /exclusive content/i })).toHaveAttribute('href', '../#exclusive');
    await expect(page.locator('a[href^="http"]')).toHaveCount(0);
    await expect(page.locator('script[src^="http"]')).toHaveCount(0);
  });
});


test.describe('legal notices', () => {
  test('main footer only exposes the legal center link', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const footerLinks = page.locator('#legal nav a');
    await expect(footerLinks).toHaveCount(1);
    await expect(footerLinks.first()).toHaveAttribute('href', '/legal/');
    await expect(footerLinks.first()).toHaveText(/legal/i);
  });

  test('legal page routes to region-specific DE/EN notices without production claims', async ({ page }) => {
    await page.goto('/legal/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /where are you located/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /US United States legal notices/i })).toHaveAttribute('href', '/legal/us/');
    await expect(page.getByRole('link', { name: /EU European Union legal notices/i })).toHaveAttribute('href', '/legal/eu/');

    await page.goto('/legal/us/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /united states legal notices/i })).toBeVisible();
    await expect(page.locator('.legal-menu a')).toHaveCount(7);
    await expect(page.getByText(/18 U\.S\.C\. §§ 2257/)).toBeVisible();

    await page.goto('/legal/eu/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /european union legal notices/i })).toBeVisible();
    await expect(page.locator('.legal-menu a')).toHaveCount(7);
    await expect(page.locator('[data-legal=euImprintText]')).toContainText('[LEGAL_BUSINESS_NAME]');

    await page.getByRole('button', { name: 'DE' }).click();
    await page.goto('/legal/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /wo befindest du dich/i })).toBeVisible();
    await page.goto('/legal/eu/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-legal=euPrivacyText]')).toContainText(/DSGVO/);
  });
});
