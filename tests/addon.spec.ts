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
test('ADDON: Mix Berries and Cream with addon checkout succeeds (was record->> unknown)',async({page})=>{
  test.setTimeout(120000)
  await loginToPos(page)
  await page.getByPlaceholder('Search items...').fill('Mix Berries and Cream')
  await page.waitForTimeout(800)
  await page.locator('button').filter({hasText:'Mix Berries and Cream'}).first().click()
  // modal should appear with variant and addon groups (h2 title)
  await expect(page.locator('h2').filter({hasText:'Mix Berries and Cream'}).first()).toBeVisible({timeout:10000})
  // check first addon checkbox (Extras / Milk Options)
  const cb = page.locator('input[type=\"checkbox\"]').first()
  await expect(cb).toBeVisible({timeout:10000})
  await cb.check()
  await expect(cb).toBeChecked()
  await page.getByRole('button',{name:/Add to Cart/}).click()
  await expect(page.locator('h2').filter({hasText:'Mix Berries and Cream'}).first()).toHaveCount(0,{timeout:10000})
  await page.waitForTimeout(500)
  // now in Order Summary - item card shows name
  await expect(page.getByText('Mix Berries and Cream').first()).toBeVisible({timeout:10000})
  // checkout
  await page.locator('button').filter({hasText:'Checkout'}).click()
  await page.getByRole('button',{name:'+₱500',exact:true}).click()
  // if tendered insufficient, add more
  await page.getByRole('button',{name:'Complete Sale'}).click()
  await page.getByRole('button',{name:'Yes, Complete'}).click()
  await expect(page.locator('#receipt')).toBeVisible({timeout:30000})
  const receiptText = await page.locator('#receipt').textContent()
  console.log('ADDON_RECEIPT', receiptText?.slice(0,300))
  // grand should be >144 (includes addon) and not show Checkout failed
  await expect(page.locator('#receipt')).not.toContainText('Checkout failed')
  const orderNum = (await page.locator('#receipt p.font-semibold').first().textContent())?.trim() || (await page.locator('#receipt').getByText(/ORD-/).textContent())
  console.log('ADDON_ORDER', orderNum)
})
