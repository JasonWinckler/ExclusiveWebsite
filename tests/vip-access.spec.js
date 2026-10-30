import { test, expect } from '@playwright/test';
import { member, mockMembershipApi, musicPost } from './membership-fixtures.js';

const entitlement = (tier) => ({ active: true, tier, expiresAt: '2099-12-31T12:00:00.000Z' });
// This fixture is a neutral transparent pixel, never adult media.
const privatePost = { ...musicPost, slug: 'vip-neutral-fixture', title: 'VIP neutral fixture', bodyText: 'Synthetic private-access verification.', contentScope: 'VIP_ADULT', tier: 'EXCLUSIVE_VIP' };

async function expectDiscountLayout(page) {
  const discount = await page.locator('.service-discount').evaluate((card) => {
    const amount = card.querySelector(':scope > strong').getBoundingClientRect();
    const copy = card.querySelector(':scope > div').getBoundingClientRect();
    return { separated: amount.right <= copy.left + 1 || amount.bottom <= copy.top + 1 };
  });
  expect(discount.separated).toBe(true);
}

for (const tier of ['EXCLUSIVE_BASIC', 'EXCLUSIVE_PREMIUM', 'EXCLUSIVE_VIP']) {
  test(`${tier} shares the same BTS feed and receives only its own benefits`, async ({ page }) => {
    const state = await mockMembershipApi(page, {
      user: member, entitlement: entitlement(tier),
      content: [musicPost, { ...musicPost, slug: 'voice-rehearsal', title: 'Voice rehearsal' }],
      adultContent: [privatePost],
    });
    await page.goto('/?lang=en');
    const feed = page.locator('#member-gallery');
    await expect(feed.getByText('Studio diary', { exact: true })).toBeVisible();
    await expect(feed.locator('.gallery-tier-tabs, [role="tablist"]')).toHaveCount(0);
    await feed.getByRole('button', { name: 'Next post' }).click();
    await expect(feed.getByText('Voice rehearsal', { exact: true })).toBeVisible();
    expect(state.requests.filter(({ path }) => path === '/api/member/v1/content').every(({ scope }) => scope === 'MUSIC')).toBe(true);
    await expect(page.getByText('VIP neutral fixture')).toHaveCount(0);
    if (tier !== 'EXCLUSIVE_VIP') await expect(page.getByRole('button', { name: 'Open private area', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'My account', exact: true }).click();
    await page.getByRole('tab', { name: 'Access & perks', exact: true }).click();
    const dialog = page.getByRole('dialog');
    if (tier === 'EXCLUSIVE_BASIC') await expect(dialog.locator('.service-discount')).toHaveCount(0);
    else {
      await expect(dialog.locator('.service-discount')).toContainText('15 %');
      await expect(dialog.locator('.service-discount')).toContainText('every Jason Shadow service');
      await expectDiscountLayout(page);
    }
    if (tier === 'EXCLUSIVE_PREMIUM') {
      await expect(dialog.locator('.telegram-access-card')).toBeVisible();
      expect(state.requests.some(({ path }) => path === '/api/member/v1/perks/telegram')).toBe(true);
    } else {
      await expect(dialog.locator('.telegram-access-card')).toHaveCount(0);
      expect(state.requests.filter(({ path }) => path === '/api/member/v1/perks/telegram')).toEqual([]);
    }
    expect(state.requests.filter(({ scope }) => scope === 'VIP_ADULT')).toEqual([]);
    if (tier !== 'EXCLUSIVE_BASIC') {
      await page.goto('/?lang=de');
      await page.getByRole('button', { name: 'Mein Konto', exact: true }).click();
      await page.getByRole('tab', { name: 'Zugang & Vorteile', exact: true }).click();
      await expect(page.locator('.service-discount')).toContainText('15 %');
      await expectDiscountLayout(page);
    }
  });
}

test('unverified VIP members see optional age verification without private metadata or media', async ({ page }) => {
  const state = await mockMembershipApi(page, { user: member, entitlement: entitlement('EXCLUSIVE_VIP'), adultContent: [privatePost] });
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'Open private area', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Your music membership and shared behind-the-scenes access do not require age verification.');
  await expect(dialog.getByText('VIP neutral fixture')).toHaveCount(0);
  await expect(dialog.locator('.creator-post, .creator-post__media')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Open age verification', exact: true }).click();
  await expect(dialog.locator('.vip-age-panel')).toBeVisible();
  await expect(dialog.locator('input[name="consent"]')).not.toBeChecked();
  expect(state.requests.filter(({ scope }) => scope === 'VIP_ADULT')).toEqual([]);
  expect(state.requests.filter(({ path }) => path.includes('/content/vip-neutral-fixture'))).toEqual([]);
  expect(state.requests.filter(({ path }) => path.includes('/age-verification/'))).toEqual([]);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).toHaveCount(0);
});

test('age-approved VIP opens only its scoped content and closing revokes the media URL', async ({ page }) => {
  await page.addInitScript(() => {
    window.__revokedMediaUrls = [];
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => { window.__revokedMediaUrls.push(url); revoke(url); };
  });
  const state = await mockMembershipApi(page, {
    user: member, entitlement: entitlement('EXCLUSIVE_VIP'), ageStatus: 'APPROVED',
    adultContent: [privatePost, { ...musicPost, slug: 'wrong-scope', title: 'Wrong scope' }, { ...privatePost, slug: 'legacy-quarantine', title: 'Legacy quarantine', contentScope: 'LEGACY_ADULT' }],
  });
  await page.goto('/?lang=en');
  await expect(page.getByRole('button', { name: 'Open private area', exact: true })).toBeVisible();
  expect(state.requests.filter(({ scope }) => scope === 'VIP_ADULT')).toEqual([]);
  await page.getByRole('button', { name: 'Open private area', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'VIP neutral fixture' })).toBeVisible();
  const image = dialog.locator('.creator-post__media img');
  await expect(image).toBeVisible();
  const mediaUrl = await image.getAttribute('src');
  expect(mediaUrl).toMatch(/^blob:/);
  await expect(dialog).not.toContainText('Wrong scope');
  await expect(dialog).not.toContainText('Legacy quarantine');
  const requests = state.requests.filter(({ scope }) => scope === 'VIP_ADULT');
  expect(requests).toHaveLength(1);
  expect(requests[0].headers['x-device-token']).toBeTruthy();
  expect(state.requests.filter(({ path }) => path.includes('/content/legacy-quarantine') || path.includes('/content/wrong-scope'))).toEqual([]);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate((url) => window.__revokedMediaUrls.includes(url), mediaUrl)).toBe(true);
});

test('server denial keeps private media unavailable even after an optimistic VIP status response', async ({ page }) => {
  const state = await mockMembershipApi(page, { user: member, entitlement: entitlement('EXCLUSIVE_VIP'), ageStatus: 'APPROVED', adultContent: [privatePost], denyAdultList: true });
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'Open private area', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.form-notice')).toBeVisible();
  await expect(dialog.getByText('VIP neutral fixture')).toHaveCount(0);
  await expect(dialog.locator('.creator-post__media')).toHaveCount(0);
  expect(state.requests.filter(({ path }) => path.includes('/content/vip-neutral-fixture'))).toEqual([]);
});

test('approved VIP without an authorized device confirms the device before any private fetch', async ({ page }) => {
  const state = await mockMembershipApi(page, {
    user: member, entitlement: entitlement('EXCLUSIVE_VIP'), ageStatus: 'APPROVED', adultContent: [privatePost],
    adultArea: { available: false, deviceRegistered: false, status: 'DEVICE_REQUIRED' },
  });
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'Open private area', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Your age is verified. Confirm this device for private access.');
  await expect(dialog.getByRole('button', { name: 'Open age verification', exact: true })).toHaveCount(0);
  await expect(dialog.locator('.creator-post')).toHaveCount(0);
  expect(state.requests.filter(({ scope }) => scope === 'VIP_ADULT')).toEqual([]);
  state.adultArea = { available: true, deviceRegistered: true, status: 'READY' };
  await dialog.getByRole('button', { name: 'Confirm device', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'VIP neutral fixture' })).toBeVisible();
  expect(state.requests.filter(({ path }) => path.endsWith('/membership/status')).every(({ headers }) => Boolean(headers['x-device-token']))).toBe(true);
  expect(state.requests.filter(({ scope }) => scope === 'VIP_ADULT')).toHaveLength(1);
});
