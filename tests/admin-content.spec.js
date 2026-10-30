import { test, expect } from '@playwright/test';
import { member, mockMembershipApi, pixel } from './membership-fixtures.js';

async function mockAdminContent(page, items = []) {
  await mockMembershipApi(page, { user: { ...member, name: 'Administrator', labels: ['admin'], mfa: true } });
  const requests = [];
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : null;
    requests.push({ path, method: request.method(), body, headers: request.headers(), reviewFlag: url.searchParams.get('adultContentReviewed') });
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (path.endsWith('/admin-session')) return json({ token: 'A'.repeat(43), expiresAt: new Date(Date.now() + 600000).toISOString() });
    if (path.endsWith('/content/items')) return request.method() === 'POST' ? json({ id: 'new-neutral-post', contentScope: body.contentScope }, 201) : json({ items });
    if (path.endsWith('/media')) return request.method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'image/png', body: pixel }) : json({ success: true });
    if (path.endsWith('/publish-adult')) {
      const item = items.find(({ id }) => path.includes(`/items/${id}/`));
      if (item) { item.content_scope = 'VIP_ADULT'; item.content_status = 'ACTIVE'; }
      return json({ success: true });
    }
    return json({});
  });
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'Content studio', exact: true }).click();
  return requests;
}

for (const scope of ['MUSIC', 'VIP_ADULT']) {
  test(`admin publishes ${scope} with explicit scope and the matching access contract`, async ({ page }) => {
    const requests = await mockAdminContent(page);
    const composer = page.locator('.post-composer');
    await composer.getByLabel('Title', { exact: true }).fill('Synthetic neutral post');
    await composer.getByLabel('Slug', { exact: true }).fill('synthetic-neutral-post');
    await composer.getByRole('combobox', { name: 'Content area', exact: true }).selectOption(scope);
    await composer.locator('input[name="file"]').setInputFiles({ name: 'neutral.png', mimeType: 'image/png', buffer: pixel });
    await expect(composer.locator('select[name="tier"]')).toHaveCount(0);
    if (scope === 'VIP_ADULT') {
      const approval = composer.locator('input[name="adultContentReviewed"]');
      await expect(approval).not.toBeChecked();
      await composer.getByRole('button', { name: 'Publish post now' }).click();
      expect(requests.filter(({ path, method }) => path.endsWith('/content/items') && method === 'POST')).toEqual([]);
      await approval.check();
    } else await expect(composer).toContainText('Shared access: Basic Shadow, Premium Shadow and VIP Shadow.');
    await composer.getByRole('button', { name: 'Publish post now' }).click();
    await expect(page.locator('.form-notice--success')).toContainText('The post was published.');
    const create = requests.find(({ path, method }) => path.endsWith('/content/items') && method === 'POST');
    expect(create.body).toMatchObject({ contentScope: scope, tier: scope === 'VIP_ADULT' ? 'EXCLUSIVE_VIP' : 'EXCLUSIVE_BASIC', adultContentReviewed: scope === 'VIP_ADULT' });
    const upload = requests.find(({ method }) => method === 'PUT');
    expect(upload.reviewFlag).toBe(scope === 'VIP_ADULT' ? 'true' : null);
    expect(upload.headers['x-admin-session']).toBeTruthy();
    expect(upload.headers['idempotency-key']).toBeTruthy();
  });
}

test('quarantined archive requires private per-item review and explicitly approved publication', async ({ page }) => {
  await page.addInitScript(() => {
    window.__revokedMediaUrls = [];
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => { window.__revokedMediaUrls.push(url); revoke(url); };
  });
  const items = ['first', 'second'].map((id) => ({ id, title: `Neutral archive ${id}`, content_scope: 'LEGACY_ADULT', content_status: 'INACTIVE', content_type: 'image/png', size_bytes: pixel.length, required_tier: 'EXCLUSIVE_VIP' }));
  const requests = await mockAdminContent(page, items);
  const archive = page.locator('.admin-content-scope').filter({ has: page.getByRole('heading', { name: 'Quarantined archive · individual review required' }) });
  await expect(archive.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(archive.getByRole('button', { name: 'Send as New Drop' })).toHaveCount(0);
  await expect(page.locator('.evidence-preview')).toHaveCount(0);
  expect(requests.filter(({ path }) => path.endsWith('/media'))).toEqual([]);
  await archive.locator('.content-admin-card').filter({ hasText: 'Neutral archive first' }).getByRole('button', { name: 'Review privately' }).click();
  const review = page.locator('.adult-content-review');
  const image = review.getByRole('img', { name: 'Protected content review' });
  await expect(image).toBeVisible();
  const mediaUrl = await image.getAttribute('src');
  expect(mediaUrl).toMatch(/^blob:/);
  const approval = review.locator('input[name="adultContentReviewed"]');
  await expect(approval).not.toBeChecked();
  await review.getByRole('button', { name: 'Publish reviewed post for VIP' }).click();
  expect(requests.filter(({ path }) => path.endsWith('/publish-adult'))).toEqual([]);
  await approval.check();
  await review.getByLabel('Documented review reason', { exact: true }).fill('Synthetic neutral fixture individually reviewed.');
  await review.getByRole('button', { name: 'Publish reviewed post for VIP' }).click();
  await expect(review).toHaveCount(0);
  const publishes = requests.filter(({ path }) => path.endsWith('/publish-adult'));
  expect(publishes).toHaveLength(1);
  expect(publishes[0]).toMatchObject({ path: '/api/admin/v1/content/items/first/publish-adult', body: { adultContentReviewed: true, reason: 'Synthetic neutral fixture individually reviewed.' } });
  expect(publishes[0].headers['x-admin-session']).toBeTruthy();
  expect(requests.filter(({ path }) => path.includes('/items/second/'))).toEqual([]);
  await expect(archive).toContainText('Neutral archive second');
  await expect(archive).not.toContainText('Neutral archive first');
  await expect.poll(() => page.evaluate((url) => window.__revokedMediaUrls.includes(url), mediaUrl)).toBe(true);
});
