import { test, expect, Page } from '@playwright/test'

async function login(page: Page, username: string, password: string) {
  await page.goto('/login')
  await page.waitForTimeout(500)
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
  await page.waitForTimeout(800)
}

async function logout(page: Page) {
  await page.locator('button:has-text("Logout")').click()
  await page.waitForTimeout(300)
  await page.locator('button:has-text("Yes, Logout")').click()
  await page.waitForURL(/\/login/, { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(500)
}

async function goTo(page: Page, label: string) {
  await page.locator('a').filter({ hasText: label }).first().click({ force: true })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1000)
}

const PAUSE = 900

test('CafePOS Full System Demo — Auth → Dashboard → POS → Loyalty → KDS → Sales → Reports', async ({ page }) => {

  // ============================================================
  // 1. AUTH — Login all 3 roles
  // ============================================================
  await login(page, 'admin', 'admin123')
  await expect(page.locator('h1:has-text("Welcome back")')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(PAUSE * 2)
  await logout(page)

  // Cashier — should see "Admin Access Required"
  await login(page, 'cashier1', '1234')
  await expect(page.locator('text=Admin Access Required')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(PAUSE * 2)
  await goTo(page, 'POS Terminal')
  await expect(page.locator('h1:has-text("POS Terminal")')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(PAUSE)
  await logout(page)

  // KDS
  await login(page, 'kds1', 'kds123')
  await goTo(page, 'Orders')
  await expect(page.locator('h1:has-text("Kitchen Display System")')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(PAUSE)
  await logout(page)

  // ============================================================
  // 2. DASHBOARD — Admin KPIs + navigation
  // ============================================================
  await login(page, 'admin', 'admin123')
  await page.waitForTimeout(2000)
  await expect(page.locator('h1:has-text("Welcome back")')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(PAUSE)

  await expect(page.locator('text=Today\'s Sales')).toBeVisible()
  await expect(page.locator('text=Transactions')).toBeVisible()
  await expect(page.locator('text=Inventory Value')).toBeVisible()
  await expect(page.locator('text=Payment Split')).toBeVisible()
  await page.waitForTimeout(PAUSE)

  await page.evaluate(() => window.scrollBy(0, 400))
  await page.waitForTimeout(PAUSE)

  await goTo(page, 'Reports')
  await page.waitForTimeout(PAUSE)
  await goTo(page, 'Settings')
  await page.waitForTimeout(PAUSE)
  await goTo(page, 'Inventory')
  await page.waitForTimeout(PAUSE)
  await goTo(page, 'Customers')
  await expect(page.locator('text=Maria Santos')).toBeVisible()
  await page.waitForTimeout(PAUSE)
  await logout(page)

  // ============================================================
  // 3. POS — Cash sale with variant + addon
  // ============================================================
  await login(page, 'cashier1', '1234')
  await goTo(page, 'POS Terminal')
  await page.waitForTimeout(PAUSE)

  // Latte with Large variant
  await page.locator('h3:has-text("Latte")').first().click()
  await page.waitForTimeout(800)
  const largeBtn = page.locator('button:has-text("Large")')
  if (await largeBtn.isVisible().catch(() => false)) {
    await largeBtn.click()
    await page.waitForTimeout(400)
  }
  await expect(page.locator('button:has-text("Add to Cart")')).toBeVisible({ timeout: 5000 })
  await page.locator('button:has-text("Add to Cart")').click()
  await page.waitForTimeout(PAUSE)

  // Croissant (no variants)
  await page.locator('h3:has-text("Croissant")').first().click()
  await page.waitForTimeout(800)

  await expect(page.locator('text=Total:')).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(PAUSE)

  // Checkout with Cash
  await page.locator('button:has-text("Checkout")').click()
  await page.waitForTimeout(PAUSE)
  await page.locator('button:has-text("Complete Sale")').click()
  await page.waitForTimeout(800)
  const yesBtn1 = page.locator('button:has-text("Yes, Complete")')
  await expect(yesBtn1).toBeVisible({ timeout: 5000 })
  await yesBtn1.click()
  await page.waitForTimeout(4000)

  await expect(page.locator('text=Order #')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(PAUSE * 2)
  await page.locator('button:has-text("OK")').click()
  await page.waitForTimeout(800)
  await expect(page.locator('text=No items added')).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(PAUSE)
  await logout(page)

  // ============================================================
  // 4. LOYALTY — Attach customer, earn points
  // ============================================================
  await login(page, 'cashier1', '1234')
  await goTo(page, 'POS Terminal')
  await page.waitForTimeout(PAUSE)

  // Latte (5 pts) + Croissant (2 pts)
  await page.locator('h3:has-text("Latte")').first().click()
  await page.waitForTimeout(800)
  const addBtn1 = page.locator('button:has-text("Add to Cart")')
  if (await addBtn1.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addBtn1.click()
    await page.waitForTimeout(500)
  }
  await page.locator('h3:has-text("Croissant")').first().click()
  await page.waitForTimeout(800)
  await expect(page.locator('text=Total:')).toBeVisible({ timeout: 5000 })

  // Checkout
  await page.locator('button:has-text("Checkout")').click()
  await page.waitForTimeout(PAUSE)

  // Attach Maria Santos
  const custInput = page.locator('input[placeholder="Search member..."]')
  await expect(custInput).toBeVisible({ timeout: 5000 })
  await custInput.click()
  await page.waitForTimeout(300)
  await custInput.fill('Maria')
  await page.waitForTimeout(2000)
  await expect(page.locator('button:has-text("Maria Santos")')).toBeVisible({ timeout: 8000 })
  await page.locator('button:has-text("Maria Santos")').click()
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('text=MEM-0001')).toBeVisible()

  // Complete Sale
  await page.locator('button:has-text("Complete Sale")').click()
  await page.waitForTimeout(800)
  const yesBtn2 = page.locator('button:has-text("Yes, Complete")')
  await expect(yesBtn2).toBeVisible({ timeout: 5000 })
  await yesBtn2.click()
  await page.waitForTimeout(4000)

  // Verify loyalty points in receipt
  await expect(page.locator('text=Order #')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(PAUSE)
  const modalText = (await page.locator('text=Order #').locator('..').locator('..').textContent()) || ''
  expect(modalText).toContain('Loyalty Points Earned')
  expect(modalText).toContain('7')
  await page.waitForTimeout(PAUSE)
  await page.locator('button:has-text("OK")').click()
  await page.waitForTimeout(800)
  await expect(page.locator('text=No items added')).toBeVisible()
  await page.waitForTimeout(PAUSE)
  await logout(page)

  // ============================================================
  // 5. KDS — Process orders
  // ============================================================
  await login(page, 'kds1', 'kds123')
  await goTo(page, 'Orders')
  await page.waitForTimeout(PAUSE * 2)
  await expect(page.locator('text=Total Active')).toBeVisible()

  for (const btnName of ['Start Preparing', 'Mark Ready', 'Complete']) {
    const btn = page.locator(`button:has-text("${btnName}")`).first()
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(PAUSE * 2)
    } else break
  }
  await logout(page)

  // ============================================================
  // 6. SALES — History & Receipt
  // ============================================================
  await login(page, 'admin', 'admin123')
  await page.waitForTimeout(2000)
  await goTo(page, 'Sales')
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('text=Sales History')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(PAUSE)

  const viewBtn = page.locator('button:has-text("View")').first()
  if (await viewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await viewBtn.click()
    await page.waitForTimeout(PAUSE)
    await expect(page.locator('text=Order #')).toBeVisible()
    await expect(page.locator('text=Subtotal')).toBeVisible()
    await page.waitForTimeout(PAUSE)
    await page.locator('button:has-text("Close")').click()
    await page.waitForTimeout(500)
  }

  // ============================================================
  // 7. REPORTS + INVENTORY + CUSTOMERS
  // ============================================================
  await goTo(page, 'Reports')
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('h1:has-text("Sales Reports")')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(PAUSE)
  const weekBtn = page.locator('button:has-text("This Week")').first()
  if (await weekBtn.isVisible().catch(() => false)) {
    await weekBtn.click()
    await page.waitForTimeout(PAUSE)
  }

  await goTo(page, 'Inventory')
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('h1:has-text("Inventory Management")')).toBeVisible()
  const searchInput = page.locator('input[placeholder*="earch"]').first()
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill('Coffee')
    await page.waitForTimeout(800)
    await expect(page.locator('text=Coffee Beans')).toBeVisible()
    await page.waitForTimeout(PAUSE)
  }

  await goTo(page, 'Customers')
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('text=Maria Santos')).toBeVisible()
  await expect(page.locator('text=Loyalty Points').first()).toBeVisible()
  await page.waitForTimeout(PAUSE * 2)

  await logout(page)
})
