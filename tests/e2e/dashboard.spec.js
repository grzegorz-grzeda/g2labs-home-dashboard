const { test, expect } = require('@playwright/test');

async function waitForDashboard(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home Dashboard' })).toBeVisible();
  await expect(page.locator('#cards-container .card')).toHaveCount(3);
  await expect(page.locator('#charts-container .chart-box')).toHaveCount(3);
}

test('renders seeded cards and charts in mock mode', async ({ page }) => {
  await waitForDashboard(page);

  await expect(page.locator('#cards-container .device-name')).toContainText([
    'Living Room',
    'Bedroom',
    'Kitchen',
  ]);

  await expect(page.locator('#connection-status')).toHaveText('Live');
  await expect(page.locator('#charts-container canvas')).toHaveCount(3);
});

test('clock format toggle updates visible timestamp formatting', async ({ page }) => {
  await waitForDashboard(page);

  const timestamp = page.locator('#cards-container .updated-at').first();
  await expect(timestamp).toBeVisible();

  await page.getByRole('button', { name: '24h' }).click();
  await expect(timestamp).not.toContainText(/AM|PM/i);

  await page.getByRole('button', { name: '12h' }).click();
  await expect(timestamp).toContainText(/AM|PM/i);
});

test('locations CRUD works against the mock db', async ({ page }) => {
  await waitForDashboard(page);

  const newName = 'Office';
  const newMac = 'AA:BB:CC:DD:EE:99';

  await page.locator('#new-name').fill(newName);
  await page.locator('#new-mac').fill(newMac);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('#locations-tbody')).toContainText(newName);

  const officeRow = page.locator('#locations-tbody tr').filter({ hasText: newName });
  await officeRow.getByRole('button', { name: 'Edit' }).click();
  await officeRow.locator('.cell-input').first().fill('Office Upstairs');
  await officeRow.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#locations-tbody')).toContainText('Office Upstairs');

  page.once('dialog', dialog => dialog.accept());
  await officeRow.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#locations-tbody')).not.toContainText('Office Upstairs');
});

test('mobile layout keeps the dashboard usable', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'This smoke test is only meaningful for the mobile project.');

  await waitForDashboard(page);

  await expect(page.locator('.theme-toggle')).toHaveCount(2);
  await expect(page.locator('#locations-table tbody tr').first()).toBeVisible();

  const addButton = page.locator('#add-location-btn');
  const buttonBox = await addButton.boundingBox();
  const viewport = page.viewportSize();

  expect(buttonBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(buttonBox.width).toBeLessThan(viewport.width);
});
