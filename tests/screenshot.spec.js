import { test, expect } from '@playwright/test';

const pages = [
  { path: '/', name: 'home' },
  { path: '/de/', name: 'seo-de' },
  { path: '/en/', name: 'seo-en' },
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

    await expect(page.getByRole('heading', { name: 'Shadow’s Temptation' })).toBeVisible();
    await expect(page.locator('.tagline')).toHaveText(/where desire becomes temptation|wo verlangen zur versuchung wird/i);
    await expect(page.getByRole('link', { name: /exclusive content/i })).toHaveAttribute('href', 'https://exclusive.jason-shadow.com/');
    await expect(page.getByRole('link', { name: /instagram/i })).toHaveAttribute('href', 'https://www.instagram.com/shadows.temptation_official/');
    await expect(page.getByRole('button', { name: /support.*donate|unterstützen.*spenden/i })).toBeVisible();
    await expect(page.locator('#donate-button-container')).toBeHidden();
    await expect(page.locator('.link-list a')).toHaveCount(2);
    await expect(page.locator('a[href="https://jason-shadow.com/"]')).toHaveCount(0);
    await expect(page.locator('.ai-disclosure')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/music|projects|projekte|künstliche intelligenz|artificial intelligence|ki-technologie/i);
    const banner = page.locator('.banner-wrap img[src="uploads/banner.png"]');
    await expect(banner).toBeVisible();
    await expect.poll(
      () => banner.evaluate((image) => image.naturalWidth),
      { timeout: 15_000 },
    ).toBeGreaterThan(0);
    await expect(page.locator('script[src="https://www.paypalobjects.com/donate/sdk/donate-sdk.js"]')).toHaveCount(1);
  });

  test('/linktree renders the official PayPal donation integration', async ({ page }) => {
    await page.addInitScript(() => {
      window.__paypalOpenUrl = '';
      window.open = (url) => {
        window.__paypalOpenUrl = String(url || '');
        return null;
      };
    });
    await page.route('https://www.paypalobjects.com/donate/sdk/donate-sdk.js', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `window.PayPal={Donation:{Button:(config)=>({render:(selector)=>{window.__paypalDonationConfig=config;const button=document.createElement('button');button.type='button';button.textContent='Donate with PayPal';button.addEventListener('click',()=>window.open('https://www.paypal.com/donate/?hosted_button_id='+config.hosted_button_id,'paypalDonatePopup'));document.querySelector(selector).appendChild(button);}})}};`,
      });
    });
    await page.goto('/linktree/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /support.*donate|unterstützen.*spenden/i })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__paypalDonationConfig), { timeout: 15_000 }).toMatchObject({
      env: 'production',
      hosted_button_id: 'U87BSM6V2TXLC',
      image: {
        src: 'https://www.paypalobjects.com/en_US/DK/i/btn/btn_donateCC_LG.gif',
        alt: 'Donate with PayPal button',
      },
    });
    await page.getByRole('button', { name: /support.*donate|unterstützen.*spenden/i }).click();
    await expect.poll(() => page.evaluate(() => window.__paypalOpenUrl)).toBe(
      'https://www.paypal.com/donate/?hosted_button_id=U87BSM6V2TXLC',
    );
  });

  test('login keeps password recovery compact and lets users verify their input', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Sign in' }).first().click();

    const dialog = page.getByRole('dialog');
    const password = dialog.locator('input[name="password"]');
    await expect(dialog.locator('.auth-tabs button')).toHaveCount(2);
    await expect(password).toHaveAttribute('type', 'password');
    await password.fill('example!');
    await dialog.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await dialog.getByRole('button', { name: 'Hide password' }).click();
    await expect(password).toHaveAttribute('type', 'password');

    await dialog.getByRole('button', { name: 'Forgot your password?' }).click();
    await expect(dialog.getByRole('heading', { name: 'Reset password' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /back to sign in/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Send reset link' })).toBeVisible();
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

  test('localized search landing pages expose unique, crawlable copy', async ({ page }) => {
    await page.goto('/de/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Exklusive Pornos.*Adult-Inhalte/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('heading', { name: /wo verlangen zur versuchung wird/i })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://exclusive.jason-shadow.com/de/');

    await page.goto('/en/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Exclusive Male Porn.*Adult Content/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: /where desire becomes temptation/i })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://exclusive.jason-shadow.com/en/');
  });

  test('dialogs trap keyboard focus and restore it when closed', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const trigger = page.getByRole('button', { name: 'Register' }).first();
    await trigger.focus();
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

  test('mobile home has no horizontal document overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
