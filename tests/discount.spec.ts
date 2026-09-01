import { test, expect } from '@playwright/test'

const BASE = 'https://pos-system-pearl-six.vercel.app'

async function loginToPos(page: any) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.fill('#username', 'cashier1')
  await page.fill('#password', '1234')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/dashboard', { timeout: 60000 })
  await page.locator('nav').getByText('POS Terminal', { exact: true }).click()
  await page.waitForURL('**/pos', { timeout: 60000 })
  await expect(page.getByPlaceholder('Search items...')).toBeVisible({ timeout: 30000 })
}

async function addAmericano(page: any) {
  await page.getByPlaceholder('Search items...').fill('Americano')
  await page.locator('button').filter({ hasText: 'Americano' }).first().click()
  await page.locator('button').filter({ hasText: '12oz Iced' }).first().click()
  await page.getByRole('button', { name: /Add to Cart/ }).click()
}

test('DISCOUNT: senior/pwd 20% - correct label, cart, receipt', async ({ page }) => {
  test.setTimeout(300000)
  await loginToPos(page)
  await addAmericano(page)
  await page.locator('button').filter({ hasText: 'Checkout' }).click()
  await page.getByRole('button', { name: 'Senior/PWD 20%' }).click()

  // Fix #1: label shows only the applicable rate, never "(20%/10%)"
  await expect(page.getByText('Senior/PWD 20%:')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('(20%/10%)')).toHaveCount(0)
  await expect(page.getByText('-₱17.80')).toBeVisible()

  await page.getByRole('button', { name: '+₱100', exact: true }).click()
  await page.getByRole('button', { name: 'Complete Sale' }).click()
  await page.getByRole('button', { name: 'Yes, Complete' }).click()
  await expect(page.locator('#receipt')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#receipt')).toContainText('SC/PWD Discount')
  await expect(page.locator('#receipt')).toContainText('-₱17.80')
  await expect(page.locator('#receipt')).toContainText('₱71.20')
  console.log('SENIOR_ORDER=' + (await page.locator('#receipt p.font-semibold').textContent())?.trim())
})

test('DISCOUNT: employee 10% + resets when cart empties', async ({ page }) => {
  test.setTimeout(300000)
  await loginToPos(page)
  await addAmericano(page)
  await page.locator('button').filter({ hasText: 'Checkout' }).click()
  await page.getByRole('button', { name: 'Employee 10%' }).click()
  await expect(page.getByText('Employee 10%:')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('-₱8.90')).toBeVisible()

  // Fix #2: emptying the cart via the item trash icon must clear the discount
  await page.locator('button').filter({ hasText: 'Back' }).click()
  await page.locator('.lucide-trash-2').first().click()
  await expect(page.getByText('No items added')).toBeVisible({ timeout: 10000 })
  await addAmericano(page)
  await expect(page.getByText('-₱8.90')).toHaveCount(0)
  await expect(page.getByText('Employee 10%:')).toHaveCount(0)

  // Full price now: 89.00
  await expect(page.getByText('₱89.00').first()).toBeVisible({ timeout: 10000 })
  console.log('DISCOUNT_RESET_OK')
})
