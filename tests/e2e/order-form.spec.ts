import { expect, test, type Page } from '@playwright/test';

const openForm = async (page: Page) => {
  await page.goto('/#/order/default-user/1');
  await expect(page.getByRole('button', { name: 'Submit Order' })).toBeVisible();
};

const fillRequiredExceptProduct = async (page: Page) => {
  await page.getByLabel('First & Last Name').fill('Reliability Test');
  await page.getByLabel('Contact Number').fill('09171234567');
  await page.getByRole('button', { name: 'Set delivery address' }).click();
  await page.getByLabel(/complete delivery address/i).fill('Unit 3, Test Street, Cebu City');
  await page.getByRole('button', { name: 'Confirm Address' }).click();
  await page.getByLabel('Date of Delivery / Pickup').fill('2099-12-31');
  await page.getByLabel('Time of Delivery / Pickup').selectOption('10:00');
  await page.getByRole('button', { name: 'GCash' }).click();
};

test('off-screen Product Type failure is visible and focused', async ({ page }) => {
  await openForm(page);
  await fillRequiredExceptProduct(page);
  await page.getByRole('button', { name: 'Submit Order' }).click();

  await expect(page.getByText('Please check the highlighted details:')).toBeVisible();
  await expect(page.getByText('Please select a product type').first()).toBeVisible();
  await expect(page.locator('#products-0-productType')).toBeFocused();
  await expect(page.locator('#products-0-productType')).toBeInViewport();
});

test('manual address remains usable and reachable in a short keyboard viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390x320', 'Short viewport scenario');
  await openForm(page);
  await page.getByRole('button', { name: 'Set delivery address' }).click();

  await expect(page.getByText('Manual address mode')).toBeVisible();
  const address = page.getByLabel(/complete delivery address/i);
  await address.scrollIntoViewIfNeeded();
  await expect(address).toBeVisible();
  await address.fill('Typed address survives a small viewport');
  await page.getByRole('button', { name: 'Confirm Address' }).click();
  await expect(page.getByRole('button', { name: 'Set delivery address' })).toContainText('Typed address survives');
});

test('offline image upload ends with a retryable error and preserves form state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One browser covers the network failure scenario');
  await openForm(page);
  await fillRequiredExceptProduct(page);
  await page.getByRole('button', { name: '4 Tier' }).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'design.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.route('**/storage/v1/object/files/**', (route) => route.abort('internetdisconnected'));

  await page.getByRole('button', { name: 'Submit Order' }).click();

  await expect(page.getByText('Order not submitted')).toBeVisible();
  await expect(page.getByText(/design\.png could not be uploaded after one retry/i)).toBeVisible();
  await expect(page.getByText(/Attempt ID:/)).toBeVisible();
  await expect(page.getByLabel('First & Last Name')).toHaveValue('Reliability Test');
  await expect(page.getByRole('button', { name: 'Set delivery address' })).toContainText('Unit 3, Test Street');
});
