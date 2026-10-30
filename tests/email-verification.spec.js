import { test, expect } from '@playwright/test';
import { member, mockMembershipApi } from './membership-fixtures.js';

const pendingMember = { ...member, emailVerification: false };

async function mockEmailVerification(page, options = {}) {
  const state = await mockMembershipApi(page, options);
  state.authRequests = [];
  state.mfaPending = false;
  await page.route('**/api/auth/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON?.();
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    state.authRequests.push({ path, body });
    if (path.endsWith('/email-verification/confirm')) {
      if (body.code !== '012345' && body.token !== 'T'.repeat(43)) {
        return json({ error: { code: body.token ? 'AUTH_TOKEN_INVALID_OR_EXPIRED' : 'EMAIL_VERIFICATION_CODE_INVALID_OR_EXPIRED' } }, 400);
      }
      if (options.loginRequired) return json({ ok: true, emailVerified: true, sessionReady: false, loginRequired: true });
      if (options.mfaRequired) {
        state.mfaPending = true;
        return json({ ok: true, emailVerified: true, mfaRequired: true, sessionReady: false, challenge: { $id: 'mfa-session' } });
      }
      state.user = { ...(state.user || member), emailVerification: true };
      return json({ ok: true, emailVerified: true, sessionReady: true, user: state.user, session: { $id: 'confirmed-session' } });
    }
    if (path.endsWith('/email-verification/request')) {
      if (options.resendError) return json({ error: { code: options.resendError } }, 429);
      return json({ accepted: true, verification: {
        expiresAt: new Date(Date.now() + 900000).toISOString(), resendAfter: new Date(Date.now() + 60000).toISOString(), delivery: options.deliveryFailed ? 'failed' : 'sent',
      } });
    }
    if (path.endsWith('/mfa/challenge/confirm')) {
      if (body.otp !== '654321') return json({ error: { code: 'INVALID_MFA_CODE' } }, 400);
      state.mfaPending = false;
      state.user = { ...member, emailVerification: true, mfa: true };
      return json({ user: state.user, session: { $id: 'confirmed-mfa-session' } });
    }
    if (path.endsWith('/mfa/challenge')) return json({ $id: 'mfa-challenge' });
    if (path.endsWith('/account') && state.mfaPending) return json({ error: { code: 'user_more_factors_required' } }, 401);
    return route.fallback();
  });
  return state;
}

test('registration stays on the page, accepts a leading-zero email code and signs in', async ({ page }) => {
  const state = await mockEmailVerification(page);
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Register', exact: true }).click();
  await dialog.getByLabel('Display name', { exact: true }).fill('New Supporter');
  await dialog.getByLabel('Email address', { exact: true }).fill('supporter@example.test');
  await dialog.locator('input[name="password"]').fill('Synthetic123!');
  await dialog.locator('input[name="privacyNoticeAccepted"]').check();
  await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Verify your email address' })).toBeVisible();
  await expect(page).toHaveURL(/\/?\?lang=en$/);
  await expect(dialog).toContainText('supporter@example.test');
  await expect(dialog.getByRole('button', { name: /Request another code in/ })).toBeDisabled();
  await expect(dialog.getByLabel('6-digit email code')).toHaveAttribute('autocomplete', 'one-time-code');
  await dialog.getByLabel('6-digit email code').fill('012345');
  await dialog.getByRole('button', { name: 'Verify email & sign in' }).click();
  await expect(dialog.getByRole('heading', { name: 'Email address verified!' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue to membership' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, New Supporter' })).toBeVisible();
  expect(state.authRequests.find(({ path }) => path.endsWith('/email-verification/confirm')).body).toEqual({ code: '012345' });
  expect(state.authRequests.filter(({ path }) => path.endsWith('/login') || path.endsWith('/logout'))).toEqual([]);
  expect(state.requests.filter(({ path }) => path.includes('/newsletter/'))).toEqual([]);
});

test('wrong codes remain in the form and a resend enforces the cooldown', async ({ page }) => {
  const state = await mockEmailVerification(page, { user: pendingMember });
  await page.goto('/?lang=en');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('6-digit email code').fill('999999');
  await dialog.getByRole('button', { name: 'Verify email & sign in' }).click();
  await expect(dialog.getByRole('status')).toContainText('The email code is invalid or has expired.');
  await expect(dialog.getByLabel('6-digit email code')).toHaveValue('999999');
  await dialog.getByRole('button', { name: 'Send a new code' }).click();
  await expect(dialog.getByLabel('6-digit email code')).toHaveValue('');
  await expect(dialog.getByRole('button', { name: /Request another code in/ })).toBeDisabled();
  expect(state.authRequests.filter(({ path }) => path.endsWith('/email-verification/request'))).toHaveLength(1);
  expect(state.user.emailVerification).toBe(false);
});

test('server resend cooldown is explained and does not send another request', async ({ page }) => {
  const state = await mockEmailVerification(page, { user: pendingMember, resendError: 'VERIFICATION_RESEND_TOO_SOON' });
  await page.goto('/?lang=de');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Neuen Code senden' }).click();
  await expect(dialog.getByRole('status')).toContainText('Bitte warte eine Minute');
  await expect(dialog.getByRole('button', { name: /Neuen Code anfordern in/ })).toBeDisabled();
  expect(state.authRequests.filter(({ path }) => path.endsWith('/email-verification/request'))).toHaveLength(1);
});

for (const [lang, heading] of [['en', 'Email address verified!'], ['de', 'E-Mail Adresse bestätigt!']]) {
  test(`fallback link signs in, removes the token and shows the ${lang} popup on the homepage`, async ({ page }) => {
    const state = await mockEmailVerification(page);
    await page.goto(`/?action=verify-email&token=${'T'.repeat(43)}&lang=${lang}`);
    await expect(page).toHaveURL('http://127.0.0.1:8080/');
    await expect(page.getByRole('dialog').getByRole('heading', { name: heading })).toBeVisible();
    expect(state.user.emailVerification).toBe(true);
    expect(state.authRequests.filter(({ path }) => path.endsWith('/logout') || path.endsWith('/login'))).toEqual([]);
    expect(state.authRequests.filter(({ path }) => path.endsWith('/email-verification/confirm'))).toHaveLength(1);
  });
}

test('expired fallback links show a recoverable error rather than a success or forced logout', async ({ page }) => {
  const state = await mockEmailVerification(page, { user: pendingMember });
  await page.goto(`/?action=verify-email&token=${'X'.repeat(43)}&lang=en`);
  const dialog = page.getByRole('dialog');
  await expect(page).toHaveURL('http://127.0.0.1:8080/');
  await expect(dialog.getByRole('status')).toContainText('This secure link has expired');
  await dialog.getByRole('button', { name: 'Enter email code' }).click();
  await expect(dialog.getByLabel('6-digit email code')).toBeVisible();
  expect(state.authRequests.filter(({ path }) => path.endsWith('/logout'))).toEqual([]);
});

test('fallback verification honors an enabled second factor before welcoming the member', async ({ page }) => {
  const state = await mockEmailVerification(page, { mfaRequired: true });
  await page.goto(`/?action=verify-email&token=${'T'.repeat(43)}&lang=en`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Confirm sign-in' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Email address verified!' })).toHaveCount(0);
  await dialog.getByLabel('6-digit security code').fill('654321');
  await dialog.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(dialog.getByRole('heading', { name: 'Email address verified!' })).toBeVisible();
  expect(state.mfaPending).toBe(false);
});

test('confirmation requiring password sign-in does not claim an authenticated session', async ({ page }) => {
  const state = await mockEmailVerification(page, { loginRequired: true });
  await page.goto(`/?action=verify-email&token=${'T'.repeat(43)}&lang=en`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Email address verified!' })).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('Please sign in to continue');
  await expect(dialog).not.toContainText('You are now signed in');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(state.user).toBeNull();
});

test('a failed resend does not claim the verification email was delivered', async ({ page }) => {
  await mockEmailVerification(page, { user: pendingMember, deliveryFailed: true });
  await page.goto('/?lang=en');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Send a new code' }).click();
  await expect(dialog.getByRole('status')).toContainText('the email could not be sent');
  await expect(dialog).not.toContainText('A new confirmation email is on its way.');
  await expect(dialog.getByLabel('6-digit email code')).toBeVisible();
});
