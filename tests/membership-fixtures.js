// Synthetic browser fixtures. No production requests, customers or bank details.
export const products = ['BASIC', 'PREMIUM', 'VIP'].map((tier, index) => ({
  sku: `exclusive-${tier.toLowerCase()}-30d`,
  displayName: `${tier === 'VIP' ? 'VIP' : tier[0] + tier.slice(1).toLowerCase()} Shadow – 30 days`,
  tier: `EXCLUSIVE_${tier}`,
  currency: 'EUR',
  amountMinor: [499, 1999, 4999][index],
  durationUnit: 'DAYS', durationValue: 30,
  perks: [{ id: `bts-${tier}`, title: 'Behind-the-scenes content', description: 'Music and voice-work insights.' }],
}));

export const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4D8AAAAASUVORK5CYII=', 'base64');
export const member = {
  $id: 'synthetic-test-member', email: 'member@example.test', name: 'Test Member',
  emailVerification: true, status: true, labels: [], mfa: false,
};
export const musicPost = {
  slug: 'studio-diary', title: 'Studio diary', bodyText: 'A synthetic rehearsal post for browser verification.',
  publishedAt: '2026-10-30T09:00:00.000Z', tier: 'EXCLUSIVE_BASIC', contentType: 'image/png',
  contentScope: 'MUSIC', sizeBytes: pixel.length, allowComments: true, commentCount: 0, accessible: true, denialCode: null,
};

export async function mockMembershipApi(page, options = {}) {
  const state = {
    user: options.user ?? null,
    requests: [],
    newsletterStatus: 'UNSUBSCRIBED',
    orders: [],
    registerBody: null,
    paymentBody: null,
    ...options,
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const body = request.postDataJSON?.();
    state.requests.push({ path, scope: url.searchParams.get('scope'), method: request.method(), body, headers: request.headers() });
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (path === '/api/auth/v1/account') return state.user ? json(state.user) : json({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401);
    if (path === '/api/auth/v1/register') {
      state.registerBody = body;
      state.user = { ...member, name: body.name, email: body.email, emailVerification: false };
      return json({ user: state.user, session: { $id: 'synthetic-session' } }, 201);
    }
    if (path === '/api/auth/v1/logout') { state.user = null; return json({ success: true }); }
    if (path === '/api/member/v1/products') return json({ products: state.products ?? products, tierPerks: {} });
    if (path === '/api/member/v1/membership/status') {
      const tier = state.entitlement?.active ? state.entitlement.tier : null;
      const ready = state.user?.emailVerification && (state.accountStatus ?? 'ACTIVE') === 'ACTIVE';
      const vip = ready && tier === 'EXCLUSIVE_VIP';
      const approved = state.ageStatus === 'APPROVED';
      return json({
        account: { status: state.accountStatus ?? 'ACTIVE', emailVerified: state.user?.emailVerification, displayName: state.user?.name, privacyProfileComplete: true, countryCode: 'DE' },
        // Ordinary membership must work without age approval.
        ageVerification: { status: state.ageStatus ?? 'NOT_STARTED', ...(state.ageVerification ?? {}) },
        benefits: { serviceDiscountPercent: ready && ['EXCLUSIVE_PREMIUM', 'EXCLUSIVE_VIP'].includes(tier) ? 15 : 0, telegramAvailable: ready && tier === 'EXCLUSIVE_PREMIUM' },
        adultArea: { eligible: vip, ageVerified: approved, deviceRegistered: approved, available: vip && approved && !state.simulation, ageStatus: state.ageStatus ?? 'NOT_STARTED', status: state.simulation ? 'ADMIN_SIMULATION_ADULT_UNAVAILABLE' : !vip ? 'VIP_REQUIRED' : !approved ? 'AGE_VERIFICATION_REQUIRED' : 'READY', ...(state.adultArea ?? {}) },
        entitlement: state.entitlement ?? { active: false, paused: null },
        ...(state.simulation ? { simulation: { role: state.simulation, readOnly: true } } : {}),
      });
    }
    if (path === '/api/member/v1/devices/register') return json({ id: 'synthetic-device', active: true });
    if (path === '/api/member/v1/payments/orders') return json({ orders: state.orders });
    if (path === '/api/member/v1/payments/sepa-orders') {
      state.paymentBody = body;
      const order = {
        id: 'synthetic-order', status: 'PENDING', productSku: body.productSku,
        productName: 'Basic Shadow – 30 days', currency: 'EUR', amountMinor: 499,
        durationUnit: 'DAYS', durationValue: 30,
        beneficiary: 'Synthetic fixture only', iban: 'TEST-NOT-A-BANK-ACCOUNT', bic: '',
        reference: 'Order of Shadows - ID #TEST123', paymentDueAt: '2099-12-31T12:00:00.000Z',
        qr: { payload: 'TEST FIXTURE ONLY' },
      };
      state.orders.push(order);
      return json(order, 201);
    }
    if (path === '/api/member/v1/privacy') return json({
      profile: { complete: true, countryCode: 'DE', regionCode: null, regime: 'EU_GDPR' },
      newsletter: { status: state.newsletterStatus }, requests: [],
    });
    if (path === '/api/member/v1/newsletter/subscription') {
      state.newsletterStatus = request.method() === 'DELETE' ? 'UNSUBSCRIBED' : 'PENDING';
      return json({ status: state.newsletterStatus });
    }
    if (path === '/api/member/v1/perks/telegram') return json({ available: true, active: true, linked: true, connectionStatus: 'ACTIVE' });
    if (path === '/api/member/v1/perks/vip-whatsapp') return json({ error: { code: 'VIP_WHATSAPP_NOT_CONFIGURED' } }, 503);
    if (path === '/api/member/v1/content') {
      if (url.searchParams.get('scope') === 'VIP_ADULT') {
        if (state.denyAdultList || state.entitlement?.tier !== 'EXCLUSIVE_VIP' || state.ageStatus !== 'APPROVED') return json({ error: { code: 'AGE_NOT_APPROVED' } }, 403);
        return json({ items: state.adultContent ?? [] });
      }
      return json({ items: state.content ?? [] });
    }
    if (path.endsWith('/comments')) return json({ comments: [], allowComments: true, canComment: false });
    if (path.startsWith('/api/member/v1/content/')) {
      if (state.denyMedia) return json({ error: { code: 'CONTENT_NOT_FOUND' } }, 404);
      return route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
    }
    if (path === '/api/admin/v1/admin-session') return json({ token: 'A'.repeat(43), expiresAt: new Date(Date.now() + 600000).toISOString() });
    if (/\/age-verification\//.test(path)) return json({ error: { code: 'ACTIVE_VIP_REQUIRED' } }, 410);
    if (/\/analytics\//.test(path)) return json({ success: true });
    if (state.user?.labels?.includes('admin')) return json({});
    return json({});
  });
  return state;
}
