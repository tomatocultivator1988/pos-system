import { test, expect, Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function login(page: Page, username: string, password: string) {
  await page.goto('/login')
  await page.waitForTimeout(400)
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 15000 })
  await page.waitForTimeout(600)
}

async function onHand(names: string[]) {
  const { data } = await sb.from('ingredients').select('name,quantity_on_hand').in('name', names)
  return data || []
}

async function saleUsageCount() {
  const { count } = await sb
    .from('inventory_movements')
    .select('*', { count: 'exact', head: true })
    .eq('movement_type', 'sale_usage')
  return count || 0
}

test('completing a Latte sale deducts recipe ingredients and logs movement', async ({ page }) => {
  await login(page, 'admin', 'admin123')

  const before = await onHand(['Coffee Beans', 'Milk'])
  const beansBefore = before.find(i => i.name === 'Coffee Beans')!.quantity_on_hand as number
  const milkBefore = before.find(i => i.name === 'Milk')!.quantity_on_hand as number
  const movesBefore = await saleUsageCount()

  // POS: navigate via SPA nav link (avoids full-reload RSC redirect)
  await page.locator('a').filter({ hasText: 'POS Terminal' }).first().click({ force: true })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1000)
  const latteBtn = page.getByRole('button', { name: 'Latte' }).first()
  await expect(latteBtn).toBeVisible({ timeout: 30000 })
  await latteBtn.click()
  await expect(page.getByText('Add to Cart')).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: /Add to Cart/ }).click()
  await expect(page.getByText(/Latte/).first()).toBeVisible()

  await page.getByRole('button', { name: 'Checkout' }).click()
  await page.getByRole('button', { name: 'Complete Sale' }).click()
  const yesBtn = page.getByRole('button', { name: /Yes, Complete/ })
  await expect(yesBtn).toBeVisible({ timeout: 8000 })
  await yesBtn.click()
  await expect(page.getByText(/Order Complete/)).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'OK' }).click()
  await page.waitForTimeout(500)

  const after = await onHand(['Coffee Beans', 'Milk'])
  const beansAfter = after.find(i => i.name === 'Coffee Beans')!.quantity_on_hand as number
  const milkAfter = after.find(i => i.name === 'Milk')!.quantity_on_hand as number
  const movesAfter = await saleUsageCount()

  // Latte recipe: 20g beans + 200ml milk per unit (default variant -> base-item recipe)
  expect(beansBefore - beansAfter).toBe(20)
  expect(milkBefore - milkAfter).toBe(200)
  expect(movesAfter).toBeGreaterThan(movesBefore)
})
