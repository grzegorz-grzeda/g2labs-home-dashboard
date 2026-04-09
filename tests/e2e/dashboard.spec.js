const { test, expect } = require('@playwright/test');

async function login(page, username, password) {
  await page.goto('/');
  await expect(page.locator('#auth-shell')).toBeVisible();
  await page.locator('#login-username').fill(username);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

async function waitForDashboard(page) {
  await expect(page.getByRole('heading', { name: 'Home Dashboard' })).toBeVisible();
  await expect(page.locator('#dashboard-shell')).toBeVisible();
  await expect(page.locator('#auth-shell')).toBeHidden();
  await expect(page.locator('#cards-container .card')).toHaveCount(4);
  await expect(page.locator('#charts-container .chart-box')).toHaveCount(4);
}

test('renders seeded cards and charts in mock mode', async ({ page }) => {
  await login(page, 'grzegorz', 'grzegorz');
  await waitForDashboard(page);

  await expect(page.locator('#cards-container .device-name')).toContainText([
    'Living Room',
    'Bedroom',
    'Kitchen',
    'Garage',
  ]);

  await expect(page.locator('#connection-status')).toHaveText('Live');
  await expect(page.locator('#user-role')).toHaveText('Admin');
  await expect(page.locator('#charts-container canvas')).toHaveCount(4);
  await expect(page.locator('#group-summary')).toContainText('All groups');
  await expect(page.locator('#group-summary')).toContainText('Family');
  await expect(page.locator('#group-summary')).toContainText('Garage');
});

test('clock format toggle updates visible timestamp formatting', async ({ page }) => {
  await login(page, 'grzegorz', 'grzegorz');
  await waitForDashboard(page);

  const timestamp = page.locator('#cards-container .updated-at').first();
  await expect(timestamp).toBeVisible();

  await page.getByRole('button', { name: '24h' }).click();
  await expect(timestamp).not.toContainText(/AM|PM/i);

  await page.getByRole('button', { name: '12h' }).click();
  await expect(timestamp).toContainText(/AM|PM/i);
});

test('locations CRUD works against the mock db', async ({ page }) => {
  await login(page, 'grzegorz', 'grzegorz');
  await waitForDashboard(page);

  const newName = 'Office';
  const newMac = 'AA:BB:CC:DD:EE:99';

  await page.locator('#new-name').fill(newName);
  await page.locator('#new-mac').fill(newMac);
  await page.locator('#new-group').selectOption({ label: 'Garage' });
  await page.locator('#add-location-btn').click();
  await expect(page.locator('#locations-tbody')).toContainText(newName);
  await expect(page.locator('#locations-tbody')).toContainText('Garage');

  const officeRow = page.locator('#locations-tbody tr').filter({ hasText: newName });
  await officeRow.getByRole('button', { name: 'Edit' }).click();
  await officeRow.locator('.cell-input').first().fill('Office Upstairs');
  await officeRow.locator('.group-input').selectOption({ label: 'Family' });
  await officeRow.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#locations-tbody')).toContainText('Office Upstairs');
  await expect(officeRow).toContainText('Family');

  page.once('dialog', dialog => dialog.accept());
  await officeRow.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#locations-tbody')).not.toContainText('Office Upstairs');
});

test('switching users filters locations by group access', async ({ page }) => {
  await login(page, 'anna', 'anna');
  await expect(page.locator('#cards-container .card')).toHaveCount(3);
  await expect(page.locator('#charts-container .chart-box')).toHaveCount(3);
  await expect(page.locator('#cards-container')).not.toContainText('Garage');
  await expect(page.locator('#locations-tbody')).not.toContainText('Garage');
  await expect(page.locator('#user-role')).toHaveText('Member');
  await expect(page.locator('#group-summary')).toHaveText('Family');
  await expect(page.locator('#access-section')).toBeHidden();
});

test('admin can manage groups and user memberships', async ({ page }) => {
  await login(page, 'grzegorz', 'grzegorz');
  await waitForDashboard(page);

  await page.locator('#group-name').fill('Attic');
  await page.locator('#group-description').fill('Top floor sensors');
  await page.getByRole('button', { name: 'Create Group' }).click();

  await expect(page.locator('#groups-list')).toContainText('Attic');
  await expect(page.locator('#new-group')).toContainText('Attic');

  await page.locator('#new-user-name').fill('Marek');
  await page.locator('#new-user-username').fill('marek');
  await page.locator('#new-user-password').fill('marek');
  await page.locator('#new-user-role').selectOption('member');
  await page.locator('#new-user-groups').selectOption([{ label: 'Family' }]);
  await page.getByRole('button', { name: 'Add User' }).click();

  await expect(page.locator('#users-tbody')).toContainText('Marek');

  const marekRow = page.locator('#users-tbody tr').filter({ hasText: 'Marek' });
  await marekRow.locator('.user-password-input').fill('marek');
  await marekRow.locator('.user-groups-input').selectOption([
    { label: 'Family' },
    { label: 'Garage' },
  ]);
  await marekRow.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('button', { name: 'Log Out' }).click();
  await login(page, 'marek', 'marek');
  await expect(page.locator('#cards-container .card')).toHaveCount(4);
  await expect(page.locator('#cards-container')).toContainText('Garage');
});

test('mobile layout keeps the dashboard usable', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'This smoke test is only meaningful for the mobile project.');

  await login(page, 'grzegorz', 'grzegorz');
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
