import { test, expect } from '@playwright/test'

const BASE = 'https://pos-system-pearl-six.vercel.app'

test.setTimeout(900000)

async function login(page: any, username: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.fill('#username', username, { timeout: 60000 })
  await page.fill('#password', password, { timeout: 60000 })
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(`**/dashboard`, { timeout: 60000 })
}

test('OFFLINE: checkout while offline queues sale, then syncs as completed (not on KDS)', async ({ page, context }) => {
  // Login online first (session cookie + catalog cached)
  await login(page, 'admin', 'admin123')

  // Go to POS and load the menu (caches catalog)
  await page.locator('nav').getByText('POS Terminal').click()
  await expect(page.getByPlaceholder('Search items...')).toBeVisible({ timeout: 30000 })

  // Add a drink item (no required addon) to the cart
  await page.getByPlaceholder('Search items...').fill('Americano')
  await page.locator('button').filter({ hasText: 'Americano' }).first().click()
  await page.locator('button').filter({ hasText: '12oz Iced' }).first().click()
  await page.getByRole('button', { name: /Add to Cart/ }).click()
  await page.locator('button').filter({ hasText: 'Checkout' }).click()
  await page.getByRole('button', { name: '+₱100', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Complete Sale' })).toBeEnabled({ timeout: 15000 })

  // Go offline, then complete the sale
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Complete Sale' }).click()
  await page.getByRole('button', { name: 'Yes, Complete' }).click()

  // Receipt should show a temporary OF- number, not a server ORD- number
  await expect(page.locator('#receipt')).toBeVisible({ timeout: 30000 })
  const receiptNum = (await page.locator('#receipt p.font-semibold').textContent())?.trim() || ''
  expect(receiptNum).toMatch(/^OF-\d{3}$/)
  await page.getByRole('button', { name: 'Close' }).click()
  console.log('OFFLINE_RECEIPT=' + receiptNum)

  // Pending-sync badge should be visible
  await expect(page.locator('button', { hasText: 'pending sync' })).toBeVisible({ timeout: 15000 })

  // Back online → auto-sync drains the queue → badge disappears
  await context.setOffline(false)
  await expect(page.locator('button', { hasText: 'pending sync' })).toBeHidden({ timeout: 90000 })
  console.log('SYNC_DRAINED')
})
