import { test, expect } from '@playwright/test';
import { mockMembershipApi } from './membership-fixtures.js';

const pages = [
  ['/', 'home'], ['/de/', 'seo-de'], ['/en/', 'seo-en'], ['/linktree/', 'linktree'],
  ['/impressum/', 'impressum'], ['/datenschutz/', 'datenschutz'],
  ['/legal/', 'legal'], ['/legal/us/', 'legal-us'], ['/legal/eu/', 'legal-eu'],
];

test.describe('responsive page smoke screenshots', () => {
  for (const [path, name] of pages) {
    test(`${name} renders without browser errors or horizontal overflow`, async ({ page }, testInfo) => {
      const browserErrors = [];
      page.on('pageerror', (error) => browserErrors.push(error.message));
      await mockMembershipApi(page);
      await page.goto(`${path}?lang=en`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1').first()).toBeVisible();
      await page.evaluate(() => document.fonts?.ready);
      await page.evaluate(() => Promise.all([...document.images].filter((image) => image.loading !== "lazy").map((image) => image.decode().catch(() => undefined))));
      await expect(page.locator('body')).not.toContainText(/Shadow’s Temptation|exclusive male porn|exklusive pornos/i);
      expect(browserErrors).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`), fullPage: true, animations: 'disabled' });
      if (name === 'home') await page.screenshot({ path: testInfo.outputPath(`home-${testInfo.project.name}-viewport.png`), animations: 'disabled' });
    });
  }
});

test.describe('membership public experience', () => {
  test.beforeEach(async ({ page }) => { await mockMembershipApi(page); });

  test('home uses the music brand, bilingual copy and official logo', async ({ page }) => {
    await page.goto('/?lang=en');
    await expect(page).toHaveTitle(/Jason Shadow.*Exclusive Membership/);
    await expect(page.locator('.order-brand')).toHaveAttribute('href', 'https://jason-shadow.com/');
    await expect(page.locator('.order-brand img')).toHaveAttribute('src', '/assets/music/logo.png');
    await expect(page.locator('#pricing')).toContainText(/no automatic renewal/i);
    await expect(page.locator('body')).not.toContainText(/telegram/i);
    await expect(page.locator('a[href*="onlyfans" i], script[src*="paypal" i]')).toHaveCount(0);
    await page.getByRole('button', { name: 'DE', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('#pricing')).toContainText(/keine automatische Verlängerung/i);
    await expect(page.locator('body')).not.toContainText(/telegram/i);
  });

  test('German membership heading fits narrow phone viewports', async ({ page }) => {
    for (const width of [320, 360, 393]) {
      await page.setViewportSize({ width, height: 850 });
      await page.goto('/?lang=de');
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('h1')).toContainText('Mitgliedschaft.');
      const dimensions = await page.evaluate(() => {
        const heading = document.querySelector('h1');
        return { pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, headingOverflow: heading.scrollWidth - heading.clientWidth };
      });
      expect(dimensions.pageOverflow).toBeLessThanOrEqual(1);
      expect(dimensions.headingOverflow).toBeLessThanOrEqual(1);
    }
  });

  test('login offers password visibility and recovery without exposing secrets', async ({ page }) => {
    await page.goto('/?lang=en');
    await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    const password = dialog.locator('input[name="password"]');
    await expect(dialog.locator('.auth-tabs button')).toHaveCount(2);
    await password.fill('example!');
    await expect(password).toHaveAttribute('type', 'password');
    await dialog.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await dialog.getByRole('button', { name: 'Hide password' }).click();
    await expect(password).toHaveAttribute('type', 'password');
    await dialog.getByRole('button', { name: 'Forgot your password?' }).click();
    await expect(dialog.getByRole('heading', { name: 'Reset password' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Send reset link' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /back to sign in/i })).toBeVisible();
  });

  test('account dialogs trap keyboard focus and return it to the trigger', async ({ page }) => {
    await page.goto('/?lang=en');
    const trigger = page.getByRole('button', { name: 'Sign in', exact: true }).first();
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: /close dialog/i })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('linktree connects the music site and membership without former adult destinations', async ({ page }) => {
    await page.goto('/linktree/?lang=en');
    await expect(page.locator('body')).toContainText('Jason Shadow');
    await expect(page.locator('a[href="https://jason-shadow.com/"]').first()).toBeVisible();
    await expect(page.locator('a[href="https://exclusive.jason-shadow.com/"]').first()).toBeVisible();
    await expect(page.locator('a[href*="shadows.temptation"], a[href*="onlyfans"]')).toHaveCount(0);
  });

  test('footer and legal pages retain reachable membership notices', async ({ page }) => {
    await page.goto('/?lang=en');
    const footer = page.locator('#legal');
    await expect(footer.locator('a[href="/legal/"]')).toBeVisible();
    await expect(footer.locator('a[href="/datenschutz/"]')).toBeVisible();
    await page.goto('/legal/?lang=en');
    await expect(page.locator('a[href="/legal/us/"]').first()).toBeVisible();
    await expect(page.locator('a[href="/legal/eu/"]').first()).toBeVisible();
    await page.goto('/legal/eu/?lang=en');
    await expect(page.locator('#imprint')).toContainText('Jason Winckler');
    await expect(page.locator('#privacy')).toContainText(/GDPR|DSGVO/);
    await expect(page.locator('#terms')).toContainText(/membership|Mitgliedschaft/i);
  });

  test('localized landing pages have crawlable music membership SEO', async ({ page }) => {
    for (const language of ['de', 'en']) {
      await page.goto(`/${language}/`);
      await expect(page).toHaveTitle(language === 'de' ? /Jason Shadow.*Exklusive Mitgliedschaft/ : /Jason Shadow.*Exclusive Membership/);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('h1')).toContainText(language === 'de' ? /Exklusive\s*Mitgliedschaft/ : /Exclusive\s*Membership/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://exclusive.jason-shadow.com/${language}/`);
      expect(await page.locator('script[type="application/ld+json"]').count()).toBeGreaterThan(0);
    }
  });
});
