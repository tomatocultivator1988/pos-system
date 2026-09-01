import { test, expect, Page } from '@playwright/test'

async function login(page: Page, username: string, password: string) {
  await page.goto('/login')
  await page.waitForTimeout(400)
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 15000 })
  await page.waitForTimeout(600)
}

async function goTo(page: Page, label: string) {
  await page.locator('a').filter({ hasText: label }).first().click({ force: true })
  await page.waitForTimeout(800)
}

const PAUSE = 800

test('Demo: Kopiko — Variants (Adjustment vs Override) → POS checkout', async ({ page }) => {

  // ============================================================
  // 1. LOGIN
  // ============================================================
  await login(page, 'admin', 'admin123')
  await goTo(page, 'Menu')
  await expect(page.locator('h1:has-text("Menu Management")')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(PAUSE)

  // ============================================================
  // 2. CREATE "KOPIKO" — base price ₱100
  // ============================================================
  await page.locator('button:has-text("New Item")').click()
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('h2:has-text("New Item")')).toBeVisible()
  await page.locator('#item-name').fill('Kopiko')
  await page.locator('#item-price').clear()
  await page.locator('#item-price').fill('100')
  await page.locator('button:has-text("Create")').click()
  await page.waitForTimeout(PAUSE * 2)
  await expect(page.locator('h3:has-text("Kopiko")').first()).toBeVisible({ timeout: 8000 })

  // ============================================================
  // 3. OPEN RECIPE — CREATE 3 VARIANTS
  // ============================================================

  // Click the Recipe button inside Kopiko's card
  const kopikoCard = page.locator('h3:has-text("Kopiko")').first().locator('xpath=ancestor::div[contains(@class,"bg-card")]')
  await kopikoCard.locator('button:has-text("Recipe")').click()
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('text=Recipe & Options: Kopiko')).toBeVisible({ timeout: 8000 })

  // --- Regular (adjustment +0) → ₱100 (base unchanged) ---
  await page.locator('#variant-name').fill('Regular')
  await page.locator('#variant-price').fill('0')
  await page.locator('select').first().selectOption('adjustment')
  await page.waitForTimeout(300)
  await page.locator('button:has-text("Add Variant")').click()
  await page.waitForTimeout(PAUSE)

  // --- Large (adjustment +30) → ₱130 (100 + 30) ---
  await page.locator('#variant-name').fill('Large')
  await page.locator('#variant-price').fill('30')
  await page.locator('select').first().selectOption('adjustment')
  await page.waitForTimeout(300)
  await page.locator('button:has-text("Add Variant")').click()
  await page.waitForTimeout(PAUSE)

  // --- Jumbo (override ₱150) → ₱150 flat, ignores base ---
  await page.locator('#variant-name').fill('Jumbo')
  await page.locator('#variant-price').fill('150')
  await page.locator('select').first().selectOption('override')
  await page.waitForTimeout(300)
  await page.locator('button:has-text("Add Variant")').click()
  await page.waitForTimeout(PAUSE)

  // Save
  await page.locator('button:has-text("Save Recipe")').click()
  await page.waitForTimeout(PAUSE * 2)
  // Ensure modal closed
  await page.locator('text=Recipe & Options: Kopiko').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(PAUSE)

  // ============================================================
  // 4. POS — VERIFY VARIANTS & PRICES
  // ============================================================
  await page.goto('/pos')
  await page.waitForTimeout(PAUSE)

  // Click Kopiko
  await page.locator('h3:has-text("Kopiko")').first().click()
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('h2:has-text("Kopiko")')).toBeVisible({ timeout: 5000 })

  // Verify 3 variants — each displays correct price mode
  await expect(page.getByRole('button', { name: 'Regular' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Large' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Jumbo' }).first()).toBeVisible()
  await page.waitForTimeout(PAUSE)

  // Select "Large" (adjustment +30) → expect ₱130
  await page.getByRole('button', { name: 'Large' }).first().click()
  await page.waitForTimeout(500)
  let btn = page.locator('button:has-text("Add to Cart —")').first()
  await expect(btn).toBeVisible({ timeout: 3000 })
  let text = await btn.textContent()
  expect(text).toContain('130')
  await page.waitForTimeout(PAUSE)

  // Switch to "Jumbo" (override 150) → expect ₱150
  await page.getByRole('button', { name: 'Jumbo' }).first().click()
  await page.waitForTimeout(PAUSE)
  btn = page.locator('button:has-text("Add to Cart —")').first()
  text = await btn.textContent()
  expect(text).toContain('150')
  await page.waitForTimeout(PAUSE)

  // Add Jumbo to cart
  await btn.click()
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('text=Kopiko (Jumbo)').first()).toBeVisible()
  await expect(page.locator('text=₱150.00').first()).toBeVisible()
  await page.waitForTimeout(PAUSE)

  // ============================================================
  // 5. CHECKOUT
  // ============================================================
  await page.locator('button:has-text("Checkout")').click()
  await page.waitForTimeout(PAUSE)
  await page.locator('button:has-text("Complete Sale")').click()
  await page.waitForTimeout(PAUSE)
  await page.locator('button:has-text("Yes, Complete")').click()
  await page.waitForTimeout(4000)

  await expect(page.locator('text=Order #').first()).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(PAUSE * 2)

  await page.locator('button:has-text("OK")').click()
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('text=No items added')).toBeVisible({ timeout: 5000 })
})
