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

const PAUSE = 800

test('Demo: Kopiko Black — Add-on Groups + Add-ons + Recipe on Add-on → POS', async ({ page }) => {

  // ============================================================
  // 1. LOGIN → MENU → CREATE ITEM
  // ============================================================
  await login(page, 'admin', 'admin123')
  await page.locator('a').filter({ hasText: 'Menu' }).first().click({ force: true })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1000)
  await expect(page.locator('h1:has-text("Menu Management")')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(PAUSE)

  await page.locator('button:has-text("New Item")').click()
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('h2:has-text("New Item")')).toBeVisible()
  await page.locator('#item-name').fill('Kopiko Black')
  await page.locator('#item-price').clear()
  await page.locator('#item-price').fill('120')
  await page.locator('button:has-text("Create")').click()
  await page.waitForTimeout(PAUSE * 2)
  await expect(page.locator('h3:has-text("Kopiko Black")').first()).toBeVisible({ timeout: 8000 })

  // ============================================================
  // 2. OPEN RECIPE — CREATE ADD-ON GROUP "Syrup Shot"
  // ============================================================
  const card = page.locator('.grid > div').filter({ hasText: 'Kopiko Black' }).first()
  await card.locator('button:has-text("Recipe")').click()
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('text=Recipe & Options: Kopiko Black')).toBeVisible({ timeout: 8000 })

  await page.locator('input[placeholder="Group name"]').fill('Syrup Shot')
  await page.waitForTimeout(300)
  await page.locator('button:has-text("Add Group")').click()
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('text=Syrup Shot').first()).toBeVisible()

  // ============================================================
  // 3. ADD ADD-ONS TO THE GROUP (via Enter on input)
  // ============================================================
  const addonInput = page.locator('input[placeholder="Add-on name"]').first()
  await addonInput.fill('Vanilla')
  await addonInput.press('Enter')
  await page.waitForTimeout(PAUSE)
  await addonInput.fill('Caramel')
  await addonInput.press('Enter')
  await page.waitForTimeout(PAUSE)
  await addonInput.fill('Hazelnut')
  await addonInput.press('Enter')
  await page.waitForTimeout(PAUSE)

  // ============================================================
  // 4. ASSIGN INGREDIENT RECIPE TO "Vanilla" ADDON
  // ============================================================
  const vanillaTab = page.locator('button:has-text("Vanilla")').last()
  await vanillaTab.click()
  await page.waitForTimeout(PAUSE)

  await page.locator('select').last().selectOption({ label: 'Coffee Beans' })
  await page.locator('input[placeholder="Qty"]').fill('5')
  await page.getByRole('button', { name: 'Add' }).last().click()
  await page.waitForTimeout(PAUSE)

  // ============================================================
  // 5. SAVE → POS
  // ============================================================
  await page.locator('button:has-text("Save Recipe")').click()
  await page.waitForTimeout(PAUSE * 2)
  // Fallback: close modal manually if save didn't close it
  await page.locator('button:has-text("Close")').click().catch(() => {})
  await page.waitForTimeout(PAUSE)
  await page.locator('a').filter({ hasText: 'POS Terminal' }).first().click({ force: true })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1000)
  await expect(page.locator('h1:has-text("POS Terminal")')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(PAUSE)

  // ============================================================
  // 6. POS — PICK KOPIKO BLACK, SELECT ADD-ONS
  // ============================================================
  await page.locator('h3:has-text("Kopiko Black")').first().click()
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('h2:has-text("Kopiko Black")')).toBeVisible({ timeout: 5000 })

  // Addon group "Syrup Shot" visible with its name
  await expect(page.locator('text=Syrup Shot').first()).toBeVisible()
  await page.waitForTimeout(PAUSE)

  // Check Vanilla ONLY (group defaults to max 1 selection)
  await page.locator('label').filter({ hasText: 'Vanilla' }).locator('input[type="checkbox"]').first().check()
  await page.waitForTimeout(PAUSE)

  // Add to Cart button shows ₱120 (add-ons via quick-add have price 0)
  const addBtn = page.locator('button:has-text("Add to Cart —")').first()
  await expect(addBtn).toBeVisible()
  const txt = await addBtn.textContent()
  expect(txt).toContain('120')
  await page.waitForTimeout(PAUSE)

  await addBtn.click()
  await page.waitForTimeout(PAUSE)

  // Cart shows item + addon name
  await expect(page.locator('text=Kopiko Black').first()).toBeVisible()
  await expect(page.locator('text=Vanilla').first()).toBeVisible()
  await page.waitForTimeout(PAUSE)

  // ============================================================
  // 7. CHECKOUT
  // ============================================================
  await page.locator('button:has-text("Checkout")').click()
  await page.waitForTimeout(PAUSE)
  await page.locator('button:has-text("Complete Sale")').click()
  await page.waitForTimeout(PAUSE)
  await page.locator('button:has-text("Yes, Complete")').click()
  await page.waitForTimeout(4000)

  await expect(page.locator('text=Order #').first()).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(PAUSE * 2)
  await page.locator('button:has-text("OK")').first().click()
  await page.waitForTimeout(PAUSE)
  await expect(page.locator('text=No items added')).toBeVisible({ timeout: 5000 })
})
