import { test, expect } from '@playwright/test';
import { member, mockMembershipApi } from './membership-fixtures.js';

// Synthetic server statuses only; no ID captures or private media are used.
test('a refreshed terminal status without a case ID replaces local review state without cancelling a new retry', async ({ page }) => {
  const state = await mockMembershipApi(page, {
    user: member,
    entitlement: { active: true, tier: 'EXCLUSIVE_VIP', expiresAt: '2099-12-31T12:00:00.000Z' },
    ageStatus: 'REJECTED',
    ageVerification: { caseId: null, reviewStatus: null },
  });
  let casesCreated = 0;
  await page.route('**/api/member/v1/age-verification/cases', async (route) => {
    casesCreated += 1;
    await route.fulfill({ json: {
      caseId: `synthetic-retry-${casesCreated}`, status: 'PENDING', reviewStatus: 'UPLOADING',
      documentType: 'PASSPORT', requiredEvidence: ['DOCUMENT_FRONT', 'VIDEO'],
      // Existing evidence flags simulate resuming a previously captured case.
      evidenceKinds: ['DOCUMENT_FRONT', 'VIDEO'],
      livenessCode: '123456', livenessChallenge: ['WRITE_AND_SHOW_CODE', 'FACE_CAMERA'],
      uploadExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    } });
  });
  await page.route('**/api/member/v1/age-verification/cases/*/submit', async (route) => {
    state.ageStatus = 'REJECTED';
    state.ageVerification = { caseId: null, reviewStatus: null };
    await route.fulfill({ json: { caseId: 'synthetic-retry-1', status: 'PENDING', reviewStatus: 'READY_FOR_REVIEW' } });
  });

  await page.goto('/?lang=en');
  await page.getByRole('button', { name: 'Open private area', exact: true }).click();
  await page.getByRole('button', { name: 'Open age verification', exact: true }).click();
  const panel = page.locator('.vip-age-panel');
  await panel.getByRole('combobox').selectOption('PASSPORT');
  await panel.getByRole('checkbox').check();
  await panel.getByRole('button', { name: 'Start secure verification', exact: true }).click();
  // The parent's pre-create REJECTED/null snapshot must not erase this case.
  await expect(panel.getByRole('button', { name: 'Submit securely', exact: true })).toBeVisible();
  await panel.getByRole('checkbox').check();
  await panel.getByRole('button', { name: 'Submit securely', exact: true }).click();
  // onComplete refreshes membership; terminal responses no longer include ID.
  await expect(panel.getByRole('button', { name: 'Start secure verification', exact: true })).toBeVisible();
  await expect(panel).toContainText('You can start a new review.');
  await expect(panel).not.toContainText('Submitted for review');

  await panel.getByRole('checkbox').check();
  await panel.getByRole('button', { name: 'Start secure verification', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Submit securely', exact: true })).toBeVisible();
  expect(casesCreated).toBe(2);
});
