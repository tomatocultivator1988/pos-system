import { test, expect } from '@playwright/test'

const BASE = 'https://pos-system-pearl-six.vercel.app'

test.beforeAll(async () => {
  await fetch(BASE + '/login').catch(() => {})
  await fetch(BASE + '/api/auth/me').catch(() => {})
  await new Promise(r => setTimeout(r, 2000))
})

async function login(page: any, username: string, password: string, dest = '/dashboard') {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.fill('#username', username, { timeout: 60000 })
  await page.fill('#password', password, { timeout: 60000 })
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(`**${dest}`, { timeout: 60000 })
}

async function openNav(page: any, label: string) {
  await page.locator('nav').getByText(label, { exact: true }).click()
}

test.setTimeout(900000)

test('ADMIN: full journey (dashboard→POS→KDS→sales→reports→inventory→menu→customers→settings)', async ({ page }) => {
  // ==== LOGIN + DASHBOARD ====
  await login(page, 'admin', 'admin123')
  await expect(page.getByText(/Welcome back, /)).toBeVisible({ timeout: 30000 })
  await expect(page.getByText("Today's Sales").first()).toBeVisible({ timeout: 30000 })
  await expect(page.locator('nav').getByText('POS Terminal')).toBeVisible()

  // ==== POS: cash sale (food item — goes to KDS) ====
  await openNav(page, 'POS Terminal')
  await expect(page.getByPlaceholder('Search items...')).toBeVisible({ timeout: 30000 })
  await page.getByPlaceholder('Search items...').fill('Potato Fries')
  await page.locator('button').filter({ hasText: 'Potato Fries' }).first().click()
  await page.getByRole('button', { name: /Add to Cart/ }).click()
  await expect(page.locator('button').filter({ hasText: 'Checkout' })).toBeVisible()
  await page.locator('button').filter({ hasText: 'Checkout' }).click()
  await page.getByRole('button', { name: '+₱100', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Complete Sale' })).toBeEnabled({ timeout: 15000 })
  await page.getByRole('button', { name: 'Complete Sale' }).click()
  await page.getByRole('button', { name: 'Yes, Complete' }).click()
  await expect(page.locator('#receipt')).toBeVisible({ timeout: 30000 })
  const saleA = (await page.locator('#receipt p.font-semibold').textContent())?.trim() || ''
  expect(saleA).toMatch(/^ORD-\d{8}-\d{6}$/)
  await expect(page.locator('#receipt')).toContainText('TOTAL')
  await page.getByRole('button', { name: 'Close' }).click()
  console.log('SALE_A=' + saleA)

  // ==== POS: gcash sale (ref required) ====
  await page.getByPlaceholder('Search items...').fill('Americano')
  await page.locator('button').filter({ hasText: 'Americano' }).first().click()
  await page.locator('button').filter({ hasText: '12oz Iced' }).first().click()
  await page.getByRole('button', { name: /Add to Cart/ }).click()
  await page.locator('button').filter({ hasText: 'Checkout' }).click()
  await page.getByRole('button', { name: 'GCash' }).click()
  await expect(page.getByRole('button', { name: 'Complete Sale' })).toBeDisabled()
  await page.getByPlaceholder('Required').fill('QA-TEST-REF-001')
  await page.getByRole('button', { name: 'Complete Sale' }).click()
  await page.getByRole('button', { name: 'Yes, Complete' }).click()
  await expect(page.locator('#receipt')).toBeVisible({ timeout: 30000 })
  const saleB = (await page.locator('#receipt p.font-semibold').textContent())?.trim() || ''
  expect(saleB).toMatch(/^ORD-\d{8}-\d{6}$/)
  await page.getByRole('button', { name: 'Close' }).click()
  console.log('SALE_B=' + saleB)

  // ==== KDS: complete sale A ====
  await openNav(page, 'Orders')
  await expect(page.getByText('Kitchen Display System')).toBeVisible({ timeout: 30000 })
  const card = page.locator('div.rounded-xl').filter({ hasText: saleA }).first()
  await expect(card).toBeVisible({ timeout: 90000 })
  await card.getByRole('button', { name: 'Done' }).click()
  await expect(card).toHaveCount(0, { timeout: 90000 })

  // ==== SALES: void B + refund A ====
  await openNav(page, 'Sales')
  await expect(page.getByRole('heading', { name: 'Sales History' })).toBeVisible({ timeout: 30000 })
  const rowB = page.locator('tr').filter({ hasText: saleB }).first()
  await expect(rowB.getByRole('button', { name: 'Void' })).toBeVisible({ timeout: 30000 })
  await rowB.getByRole('button', { name: 'Void' }).click()
  await page.getByPlaceholder('Reason (required)').fill('QA void test')
  await page.getByRole('button', { name: 'Void Sale' }).click()
  await expect(rowB).toHaveCount(0, { timeout: 30000 })
  const rowA = page.locator('tr').filter({ hasText: saleA }).first()
  await expect(rowA.getByRole('button', { name: 'Refund' })).toBeVisible({ timeout: 30000 })
  await rowA.getByRole('button', { name: 'Refund' }).click()
  await page.getByPlaceholder('Reason (required)').fill('QA refund test')
  await page.getByRole('button', { name: 'Confirm Refund' }).click()
  await expect(rowA).toHaveCount(0, { timeout: 30000 })

  // ==== REPORTS ====
  await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 30000 })
  const tabs: Record<string, string> = {
    Sales: 'Total Sales',
    Expenses: 'Total Expenses',
    'Inventory Usage': 'Ingredient Consumption',
    'Voids/Refunds': 'Total Voided',
    Customers: 'Top Customers by Spend',
  }
  for (const [tab, marker] of Object.entries(tabs)) {
    await page.getByRole('button', { name: tab }).click()
    await expect(page.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 30000 })
  }
  await page.getByRole('button', { name: 'Sales' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toContain('.csv')

  // ==== INVENTORY ====
  await openNav(page, 'Inventory')
  await expect(page.getByText('Inventory Management')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('Total Value').first()).toBeVisible()
  await page.getByPlaceholder('Search ingredients...').fill('Coffee Beans')
  await expect(page.locator('tr').filter({ hasText: 'Coffee Beans' }).first()).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Out of Stock' }).click()
  await page.getByRole('button', { name: 'All Items' }).click()
  const ingName = `QA-Ing-${Date.now().toString().slice(-6)}`
  await page.getByRole('button', { name: 'New Ingredient' }).click()
  await page.fill('#ing-name', ingName)
  await page.selectOption('#ing-unit', 'g')
  await page.fill('#ing-reorder', '50')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByPlaceholder('Search ingredients...').fill(ingName)
  await expect(page.locator('tr').filter({ hasText: ingName })).toBeVisible({ timeout: 30000 })
  await page.locator('tr').filter({ hasText: ingName }).getByRole('button', { name: 'Adjust' }).click()
  await page.getByPlaceholder('Delta (+/-)').fill('100')
  await page.getByPlaceholder('Reason').fill('QA adjust')
  await page.getByRole('button', { name: 'Apply' }).click()
  await page.getByRole('button', { name: 'Movement Log' }).click()
  await expect(page.getByText('Daily Usage')).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Stock' }).click()

  // ==== MENU ====
  await openNav(page, 'Menu')
  await expect(page.getByText('Menu Management')).toBeVisible({ timeout: 30000 })
  const menuCard = page.locator('div.rounded-xl').filter({ hasText: 'Americano' }).filter({ has: page.getByRole('button', { name: 'Recipe' }) }).first()
  await menuCard.getByRole('button', { name: 'Recipe' }).click()
  await expect(page.getByText('Recipe & Options:', { exact: false })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Variants', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  const itemName = `QA-Item-${Date.now().toString().slice(-6)}`
  await page.getByRole('button', { name: 'New Item' }).click()
  await page.fill('#item-name', itemName)
  await page.fill('#item-price', '49')
  await page.fill('#item-points', '2')
  await page.getByRole('button', { name: 'Create' }).click()
  const newCard = page.locator('div.rounded-xl').filter({ hasText: itemName }).first()
  await expect(newCard).toBeVisible({ timeout: 120000 })
  await newCard.getByRole('button').last().click()
  await page.getByRole('button', { name: 'Deactivate' }).click()
  await expect(page.locator('div.rounded-xl').filter({ hasText: itemName })).toHaveCount(0, { timeout: 30000 })

  // ==== CUSTOMERS ====
  await openNav(page, 'Customers')
  await expect(page.getByText('Customer Management')).toBeVisible({ timeout: 30000 })
  const custName = `QA Cust ${Date.now().toString().slice(-6)}`
  await page.getByRole('button', { name: 'New Customer' }).click()
  await page.getByPlaceholder('Name *').fill(custName)
  await page.getByPlaceholder('Mobile Number').fill('09991234567')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('div.rounded-xl').filter({ hasText: custName }).first()).toBeVisible({ timeout: 30000 })

  // ==== SETTINGS ====
  await openNav(page, 'Settings')
  await expect(page.getByText('Manage store configuration')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('Store Information')).toBeVisible()
  await expect(page.getByText('Bluetooth Printer & Cash Drawer')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pair Printer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Test Print' })).toBeVisible()
  await expect(page.getByText('Not paired', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await page.getByRole('button', { name: 'Yes, Save' }).click()

  // ==== LOGOUT ====
  await page.getByRole('button', { name: 'Logout' }).click()
  await page.getByRole('button', { name: 'Yes, Logout' }).click()
  await page.waitForURL('**/login', { timeout: 60000 })
})

test('ROLES: cashier + kds access control', async ({ page }) => {
  await login(page, 'cashier1', '1234')
  await expect(page.getByText('Admin Access Required')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('nav').getByText('Dashboard')).toHaveCount(0)
  await expect(page.locator('nav').getByText('POS Terminal')).toBeVisible()
  await page.getByRole('button', { name: 'Logout' }).click()
  await page.getByRole('button', { name: 'Yes, Logout' }).click()
  await page.waitForURL('**/login', { timeout: 60000 })

  await login(page, 'kds1', 'kds123', '/orders')
  await expect(page.getByText('Kitchen Display System')).toBeVisible({ timeout: 30000 })
})
