import { expect, test } from '@playwright/test';
const facebookU = '11111111-1111-4111-8111-111111111111';
const query = new URLSearchParams({ previewSession: '22222222-2222-4222-8222-222222222222', previewRevision: '2',
  previewHash: 'a'.repeat(64), previewExpires: String(Math.floor(Date.now() / 1000) + 600), previewToken: 'b'.repeat(64) });
test('signed staff preview renders actual form and cannot submit or write', async ({ page }) => {
  const databaseRequests: string[] = [];
  await page.route('**/*.supabase.co/**', async route => { if (['fetch', 'xhr'].includes(route.request().resourceType())) databaseRequests.push(route.request().url()); await route.abort(); });
  let previewCalls = 0;
  await page.route('https://production.cakesandmemories.com/api/messenger-preview?**', async route => {
    previewCalls++;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({
      draft: { facebookU, Name: 'Preview Customer', contact: '09171234567', Addres: 'Cebu City', DateEvent: '2026-10-09', TimeEvent: '16:00',
        Product1: '6" Round (4" Thickness)', details1: 'Pink cake', quantity1: 1, Candle: 'stick',
        Product2: 'N/A', details2: 'Second cake', quantity2: null, candle2: 'number 2',
        product3: 'N/A', details3: 'Third cake', qty3: '3', candle3: 'number 3',
        messenger_prefill: { eventTime: '16:00', products: [{ flavor: 'Vanilla' }, {}, {}] }, paymentOption: 'GCash' },
      reviewReasons: ['Confirm image selection'], expiresAt: new Date(Date.now() + 600000).toISOString(),
    }) });
  });
  await page.goto(`/#/order/${facebookU}?${query}`);
  await expect(page.getByRole('heading', { name: 'Staff preview — not sent, read-only' })).toBeVisible();
  await expect(page.getByLabel('First & Last Name')).toHaveValue('Preview Customer');
  await expect(page.getByLabel('First & Last Name')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Submit Order' })).toBeDisabled();
  await expect(page.getByText('Confirm image selection')).toBeVisible();
  await expect(page.getByLabel('Candle', { exact: true }).nth(1)).toHaveValue('number 2');
  await expect(page.getByLabel('Candle', { exact: true }).nth(1)).toBeDisabled();
  const loadedPreviewCalls = previewCalls;
  await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(page.getByLabel('First & Last Name')).toHaveValue('Preview Customer');
  expect(previewCalls).toBe(loadedPreviewCalls); expect(previewCalls).toBeGreaterThanOrEqual(1); expect(databaseRequests).toEqual([]);
});
test('missing preview signature fails closed without normal form', async ({ page }) => {
  await page.goto(`/#/order/${facebookU}?previewSession=22222222-2222-4222-8222-222222222222`);
  await expect(page.getByRole('alert')).toContainText('incomplete or invalid');
  await expect(page.getByLabel('First & Last Name')).toHaveCount(0);
});
