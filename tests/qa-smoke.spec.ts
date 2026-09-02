import { test, expect } from '@playwright/test'

// READ-ONLY smoke test: verifies the fixed UI behavior without completing any
// sale or writing any business data (only a login session row).

test.use({ headless: true, video: 'off' })

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('#username', 'admin')
  await page.fill('#password', 'admin123')
  await page.click('button:has-text("Sign In")')
  await expect(page.locator('text=Today\'s Sales')).toBeVisible({ timeout: 30000 })
}

test('dashboard loads with today metrics (admin)', async ({ page }) => {
  await login(page)
  await expect(page.locator('text=Transactions')).toBeVisible()
  await expect(page.locator('text=Inventory Value')).toBeVisible()
  // Server actions must not error out
  await expect(page.locator('text=Failed to load dashboard')).toHaveCount(0)
})

test('POS cart line shows addon price multiplied by item quantity', async ({ page }) => {
  await login(page)
  await page.goto('/pos')
  const tile = page.locator('.grid button', { hasText: 'Americano' }).first()
  await expect(tile).toBeVisible({ timeout: 30000 })
  await tile.click()

  // Item modal: pick the first available addon (any group)
  const modal = page.locator('div.bg-card.rounded-2xl.max-w-md', { hasText: 'Add to Cart' })
  await expect(modal).toBeVisible()
  await modal.locator('input[type=checkbox]').first().check()
  await modal.locator('button', { hasText: 'Add to Cart' }).click()

  // At qty 1 the line total is (item + addon). The reported bug was that the
  // displayed total did not scale the addon with item quantity. So after
  // bumping to qty 2, the line total must be exactly double — with the old
  // bug it would be item*2 + addon (addon counted once).
  const readLine = async () => {
    return (await page.locator('p.text-sm.font-semibold').first().textContent()) ?? ''
  }
  const atQty1 = (await readLine()).replace(/[₱,]/g, '')
  expect(parseFloat(atQty1)).toBeGreaterThan(0)

  await page.getByRole('button', { name: '+', exact: true }).first().click()

  await expect.poll(readLine).toBe(`₱${(parseFloat(atQty1) * 2).toFixed(2)}`)
})

test('expenses page renders (new module)', async ({ page }) => {
  await login(page)
  await page.goto('/expenses')
  await expect(page.locator('h1', { hasText: 'Expenses' })).toBeVisible()
  await expect(page.locator('button', { hasText: 'New Expense' })).toBeVisible()
  await expect(page.locator('text=Total Recorded')).toBeVisible()
})

test('reports page loads sales summary via server actions', async ({ page }) => {
  await login(page)
  await page.goto('/reports')
  await expect(page.locator('text=Total Sales').first()).toBeVisible({ timeout: 30000 })
  await expect(page.locator('text=Failed to load')).toHaveCount(0)
})

test('KDS orders page renders', async ({ page }) => {
  await login(page)
  await page.goto('/orders')
  await expect(page.locator('text=Kitchen Display System')).toBeVisible({ timeout: 30000 })
})
