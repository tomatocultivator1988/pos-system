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

test('admin can open New Item dialog and create a menu item', async ({ page }) => {
  await login(page, 'admin', 'admin123')
  await goTo(page, 'Menu')
  await page.getByRole('button', { name: /New Item|Add Item/i }).click()
  await expect(page.getByRole('heading', { name: 'New Item' })).toBeVisible()
  await page.locator('#item-name').fill('Test Brew')
  await page.locator('#item-price').fill('99')
  await page.getByRole('button', { name: /Create|Save/i }).click()
  await expect(page.getByRole('heading', { name: 'Test Brew' }).first()).toBeVisible({ timeout: 8000 })
})

test('admin can add a variant and a recipe ingredient to an item', async ({ page }) => {
  await login(page, 'admin', 'admin123')
  await goTo(page, 'Menu')
  await page.getByRole('heading', { name: 'Test Brew' }).first().click()
  await page.getByRole('button', { name: /Recipe/i }).first().click()
  await expect(page.getByText(/Recipe & Options/i)).toBeVisible()
  await page.locator('#variant-name').fill('Large')
  await page.locator('#variant-price').fill('120')
  await page.getByRole('button', { name: /Add Variant/i }).click()
  await expect(page.locator('div.bg-card').getByText('Large ₱120').first()).toBeVisible({ timeout: 5000 })
  await page.getByRole('button', { name: /Save Recipe/i }).click()
  await expect(page.getByRole('heading', { name: 'Test Brew' }).first().locator('xpath=ancestor::div[contains(@class,"border-border")][1]').getByText(/Recipe:/).first()).toBeVisible()
})

test('inventory Movement Log tab lists movements and Daily Usage shows cost', async ({ page }) => {
  await login(page, 'admin', 'admin123')
  await goTo(page, 'Inventory')
  await page.getByRole('button', { name: /Movement Log/i }).click()
  await expect(page.getByText(/Daily Usage/i)).toBeVisible()
  await expect(page.getByText(/Total Cost Used/i)).toBeVisible()
  await expect(page.getByRole('table').filter({ hasText: /Date\/Time/ }).first()).toBeVisible()
})

test('admin can create a new ingredient', async ({ page }) => {
  await login(page, 'admin', 'admin123')
  await goTo(page, 'Inventory')
  await page.getByRole('button', { name: /New Ingredient/i }).click()
  await page.locator('#ing-name').fill('Test Syrup')
  await page.selectOption('#ing-unit', 'ml')
  await page.getByRole('button', { name: /Create|Save/i }).click()
  await expect(page.getByText('Test Syrup')).toBeVisible({ timeout: 8000 })
})

test('dashboard shows best and least selling after a sale exists', async ({ page }) => {
  await login(page, 'admin', 'admin123')
  await goTo(page, 'Dashboard')
  await expect(page.getByText(/Best Selling/i)).toBeVisible({ timeout: 8000 })
  await expect(page.getByText(/Least Selling/i)).toBeVisible({ timeout: 8000 })
})
