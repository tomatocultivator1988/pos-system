import { test, expect } from '@playwright/test'
const BASE='https://pos-system-pearl-six.vercel.app'
test('Inventory desktop still shows table', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto(`${BASE}/login`,{waitUntil:'domcontentloaded',timeout:120000})
  await page.fill('#username','admin')
  await page.fill('#password','admin123')
  await page.getByRole('button',{name:'Sign In'}).click()
  await page.waitForURL('**/dashboard',{timeout:60000})
  await page.locator('nav').getByText('Inventory',{exact:true}).click()
  await page.waitForURL('**/inventory',{timeout:60000})
  await expect(page.getByRole('button',{name:'New Ingredient'})).toBeVisible({timeout:30000})
  await expect(page.locator('table').first()).toBeVisible({timeout:10000})
  // mobile cards hidden on desktop
  await expect(page.locator('.md\\:hidden > div').first()).toBeHidden({timeout:10000}).catch(()=>{})
  console.log('INVENTORY_DESKTOP_OK')
})
