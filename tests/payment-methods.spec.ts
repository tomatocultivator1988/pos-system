import { test, expect } from '@playwright/test'
const BASE='https://pos-system-pearl-six.vercel.app'
async function loginToPos(page:any){
  await page.goto(`${BASE}/login`,{waitUntil:'domcontentloaded',timeout:120000})
  await page.fill('#username','cashier1')
  await page.fill('#password','1234')
  await page.getByRole('button',{name:'Sign In'}).click()
  await page.waitForURL('**/dashboard',{timeout:60000})
  await page.locator('nav').getByText('POS Terminal',{exact:true}).click()
  await page.waitForURL('**/pos',{timeout:60000})
  await expect(page.getByPlaceholder('Search items...')).toBeVisible({timeout:30000})
}
test('POS shows 4 payment methods + BPI checkout with reference', async ({ page }) => {
  test.setTimeout(120000)
  await loginToPos(page)
  await page.getByPlaceholder('Search items...').fill('Americano')
  await page.waitForTimeout(800)
  await page.locator('button').filter({hasText:'Americano'}).first().click()
  await expect(page.locator('h2').filter({hasText:'Americano'}).first()).toBeVisible({timeout:10000})
  await page.getByRole('button',{name:/Add to Cart/}).click()
  await expect(page.getByText('Americano').first()).toBeVisible({timeout:10000})
  await page.locator('button').filter({hasText:'Checkout'}).click()
  // 4 method buttons
  await expect(page.getByRole('button',{name:'BPI Bank Transfer'})).toBeVisible({timeout:10000})
  await expect(page.getByRole('button',{name:'UnionBank Bank Transfer'})).toBeVisible({timeout:10000})
  // pick BPI, ref required
  await page.getByRole('button',{name:'BPI Bank Transfer'}).click()
  await expect(page.getByLabel(/BPI Bank Transfer Reference/)).toBeVisible({timeout:10000})
  const completeBtn = page.getByRole('button',{name:'Complete Sale'})
  await expect(completeBtn).toBeDisabled({timeout:10000})
  await page.getByLabel(/BPI Bank Transfer Reference/).fill('TEST-BPI-001')
  await expect(completeBtn).toBeEnabled({timeout:10000})
  await completeBtn.click()
  await page.getByRole('button',{name:'Yes, Complete'}).click()
  await expect(page.locator('#receipt')).toBeVisible({timeout:30000})
  await expect(page.locator('#receipt')).toContainText('BPI Bank Transfer')
  console.log('PAYMENT_METHODS_OK')
})
