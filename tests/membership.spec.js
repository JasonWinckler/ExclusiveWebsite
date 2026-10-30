import { test, expect } from '@playwright/test';
import { member, mockMembershipApi, musicPost } from './membership-fixtures.js';

async function chooseBasic(page) {
  await page.locator('.pricing-group--basic').getByRole('button', { name: /choose term/i }).click();
  await page.getByRole('dialog').getByRole('button', { name: /choose 30 days and continue/i }).click();
}

test('registration preserves account fields without requiring age evidence or subscribing', async ({ page }) => {
  const state = await mockMembershipApi(page);
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Register', exact: true }).click();
  await dialog.getByLabel('Display name', { exact: true }).fill('New Supporter');
  await dialog.getByLabel('Email address', { exact: true }).fill('supporter@example.test');
  await dialog.locator('input[name="password"]').fill('Synthetic123!');
  await expect(dialog.getByRole('combobox', { name: 'Country of residence', exact: true })).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Country of residence', exact: true }).selectOption('DE');
  await expect(dialog.locator('input[name="privacyNoticeAccepted"]')).not.toBeChecked();
  await dialog.locator('input[name="privacyNoticeAccepted"]').check();
  await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(dialog).toContainText('Verification pending');
  await expect(dialog.getByRole('button', { name: 'Resend confirmation email' })).toBeVisible();
  await expect(dialog).not.toContainText(/age verification|identity-document|live challenge/i);
  expect(state.registerBody).toMatchObject({ name: 'New Supporter', email: 'supporter@example.test', countryCode: 'DE', privacyNoticeAccepted: true, locale: 'en' });
  expect(state.registerBody.password).toBeUndefined();
  expect(state.registerBody.passwordCredential.verifier).toBeTruthy();
  expect(state.registerBody).not.toHaveProperty('newsletterConsent');
  expect(state.requests.filter(({ path }) => /newsletter|age-verification/.test(path))).toEqual([]);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await chooseBasic(page);
  await expect(page.getByRole('dialog')).toContainText('Confirm your email address first.');
  expect(state.paymentBody).toBeNull();
});

test('verified members review billing and explicitly order one-time SEPA support', async ({ page }) => {
  const state = await mockMembershipApi(page, { user: member });
  await page.goto('/?lang=en');
  await expect(page.getByRole('heading', { name: 'Welcome, Test Member' })).toBeVisible();
  await chooseBasic(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Order & SEPA payment' })).toBeVisible();
  await expect(dialog).toContainText('No automatic renewal');
  await expect(dialog.getByRole('button', { name: 'Continue to SEPA payment' })).toBeDisabled();
  expect(state.paymentBody).toBeNull();
  await dialog.getByLabel('Full name', { exact: true }).fill('Synthetic Supporter');
  await dialog.getByLabel('Street and number', { exact: true }).fill('Test Street 1');
  await dialog.getByLabel('Postal code', { exact: true }).fill('12345');
  await dialog.getByLabel('City', { exact: true }).fill('Test City');
  await dialog.getByLabel('Country code (e.g. DE)', { exact: true }).fill('DE');
  const checks = dialog.getByRole('checkbox');
  await expect(checks).toHaveCount(2);
  await expect(checks.nth(0)).not.toBeChecked();
  await expect(checks.nth(1)).not.toBeChecked();
  await checks.nth(0).check();
  await checks.nth(1).check();
  await dialog.getByRole('button', { name: 'Continue to SEPA payment' }).click();
  expect(state.paymentBody).toBeNull();
  await dialog.getByRole('button', { name: 'ORDER & PAY WITH SEPA' }).click();
  await dialog.getByRole('button', { name: 'Payment details', exact: true }).click();
  await expect(dialog).toContainText('Order of Shadows - ID #TEST123');
  expect(state.paymentBody).toMatchObject({ productSku: 'exclusive-basic-30d', locale: 'en', termsVersion: 'ORDER-2026-10-30-V3', digitalContentConsent: true, withdrawalAcknowledgement: true, billing: { name: 'Synthetic Supporter', countryCode: 'DE' } });
  const paymentRequest = state.requests.find(({ path }) => path.endsWith('/payments/sepa-orders'));
  expect(paymentRequest.headers['idempotency-key']).toBeTruthy();
  expect(state.requests.filter(({ path }) => /age-verification/.test(path))).toEqual([]);
  await expect(page.locator('.membership-status-chip')).toContainText('Free Preview');
});

test('newsletter requires a separate action and remains pending until email confirmation', async ({ page }) => {
  const state = await mockMembershipApi(page, { user: member });
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'My account', exact: true }).click();
  await page.getByRole('tab', { name: 'Newsletter', exact: true }).click();
  const newsletter = page.locator('.privacy-card--newsletter');
  await expect(newsletter).toContainText('Not subscribed');
  expect(state.requests.filter(({ path }) => path.endsWith('/newsletter/subscription'))).toEqual([]);
  await newsletter.getByRole('button', { name: 'Subscribe to the music newsletter' }).click();
  await expect(newsletter).toContainText(/confirmation.*pending/i);
  const optIns = state.requests.filter(({ path }) => path.endsWith('/newsletter/subscription'));
  expect(optIns).toHaveLength(1);
  expect(optIns[0]).toMatchObject({ method: 'POST', body: { consent: true, locale: 'en' } });
});

test('member feed respects server access flags and never requests a denied legacy post', async ({ page }) => {
  const state = await mockMembershipApi(page, {
    user: member,
    entitlement: { active: true, tier: 'EXCLUSIVE_BASIC', expiresAt: '2099-12-31T12:00:00.000Z' },
    content: [musicPost,
      { ...musicPost, slug: 'legacy-private-post', title: 'Legacy private post', contentScope: 'LEGACY_ADULT', accessible: false, denialCode: 'LEGACY_CONTENT_QUARANTINED' },
      { ...musicPost, slug: 'wrongly-mixed-private-post', title: 'Wrongly mixed private post', contentScope: 'VIP_ADULT', accessible: true },
    ],
  });
  await page.goto('/?lang=en');
  await expect(page.getByText('Studio diary', { exact: true })).toBeVisible();
  await expect(page.locator('.creator-post__media img')).toBeVisible();
  await expect(page.getByText('Legacy private post')).toHaveCount(0);
  await expect(page.getByText('Wrongly mixed private post')).toHaveCount(0);
  expect(state.requests.filter(({ path }) => path.includes('/content/legacy-private-post'))).toEqual([]);
  expect(state.requests.filter(({ path }) => path.includes('/content/wrongly-mixed-private-post'))).toEqual([]);
  const media = state.requests.find(({ path }) => path === '/api/member/v1/content/studio-diary');
  expect(media.headers['x-device-token']).toBeTruthy();
});

test('a denied protected media response does not render protected media', async ({ page }) => {
  await mockMembershipApi(page, { user: member, content: [musicPost], denyMedia: true });
  await page.goto('/?lang=en');
  await expect(page.getByText('Studio diary', { exact: true })).toBeVisible();
  await expect(page.locator('.creator-post__media img')).toHaveCount(0);
  await expect(page.locator('.creator-post')).toContainText(/could not|not available|unavailable|retry/i);
});

test('administrator VIP simulation preserves the protected, read-only member view', async ({ page }) => {
  const state = await mockMembershipApi(page, {
    user: { ...member, name: 'Administrator', labels: ['admin'], mfa: true },
    entitlement: { active: true, tier: 'EXCLUSIVE_VIP', expiresAt: '2099-12-31T12:00:00.000Z' },
    simulation: 'EXCLUSIVE_VIP', content: [musicPost],
  });
  await page.goto('/?admin-simulation=EXCLUSIVE_VIP&lang=en');
  await expect(page.locator('.admin-simulation-toolbar')).toContainText('VIP Shadow');
  await expect(page.getByRole('heading', { name: 'Welcome, Preview VIP' })).toBeVisible();
  await expect(page.locator('.creator-post__media img')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to admin' })).toBeVisible();
  const media = state.requests.find(({ path }) => path === '/api/member/v1/content/studio-diary');
  expect(media.headers['x-admin-simulation']).toBe('EXCLUSIVE_VIP');
  expect(media.headers['x-admin-session']).toBeTruthy();
  expect(state.requests.filter(({ path, method }) => path.startsWith('/api/member/') && method !== 'GET')).toEqual([]);
  await page.getByRole('button', { name: 'Open private area', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Private content and age evidence are not loaded in simulation.');
  expect(state.requests.filter(({ scope }) => scope === 'VIP_ADULT')).toEqual([]);
});


test('restricted verified accounts cannot enter checkout or request the member feed', async ({ page }) => {
  const state = await mockMembershipApi(page, { user: member, accountStatus: 'RESTRICTED' });
  await page.goto('/?lang=en');
  await expect(page.getByRole('heading', { name: 'Welcome, Test Member' })).toBeVisible();
  await chooseBasic(page);
  await expect(page.getByRole('dialog')).toContainText('Your account is not currently available for orders.');
  expect(state.paymentBody).toBeNull();
  expect(state.requests.filter(({ path }) => path === '/api/member/v1/content')).toEqual([]);
});
