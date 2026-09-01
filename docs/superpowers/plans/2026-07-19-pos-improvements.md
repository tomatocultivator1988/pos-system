# POS System Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a working full menu editor (items + variants + addons + recipes), an inventory movement log with daily usage, and best/least-selling cards on the dashboard.

**Architecture:** Extend existing App Router client pages (`app/menu`, `app/inventory`, `app/dashboard`) and server actions (`lib/actions/menu.ts`, `lib/actions/inventory.ts`). Two new server actions are the only backend additions; everything else wires existing actions to UI. Use native `<input>`/`<select>` styled like `app/settings/page.tsx`, `lucide-react` icons, `formatPHP` for currency, and `useModal` for destructive confirms. No new UI component library.

**Tech Stack:** Next.js 16 (App Router), React 18, TypeScript, Supabase (service-role client), Playwright (tests), `lucide-react`, Tailwind v4.

## Global Constraints

- All mutating server actions must call `await requireRole(['admin'])()` first (already present in existing actions; keep it in new ones).
- Reuse existing server actions; do NOT add a new dependency for modals/forms — use inline markup + `useModal` confirm.
- Currency display via `formatPHP` from `@/lib/currency`; amounts are `numeric(12,2)`.
- All monetary/quantity math uses `Number()` casts; guard `parseFloat(x) || 0`.
- Server actions are `'use server'` functions in `lib/actions/*.ts`; client pages import them directly (they are async server functions).
- Ingredient `base_unit` allowed values: `'g' | 'kg' | 'ml' | 'L' | 'pc' | 'pack' | 'bottle'`.
- Keep the existing single-video Playwright test (`tests/full-flow.spec.ts`) green; add a separate `tests/improvements.spec.ts`.
- Commit frequently per task. Do NOT commit secrets (`*.env.local` is gitignored).

---

## File Structure

- `lib/actions/menu.ts` — **Modify**: add `upsertRecipeLines`, `getRecipeLines`, `getAddonGroups` already exists.
- `lib/actions/inventory.ts` — **Modify**: add `getDailyUsage`.
- `app/menu/page.tsx` — **Rewrite**: full CRUD editor with Details + Recipe/Options dialogs.
- `app/inventory/page.tsx` — **Modify**: add Movement Log tab, Daily Usage card, New Ingredient dialog, Adjust Stock dialog (reuse `createIngredient`, `updateIngredient`, `createAdjustment`, `getInventoryMovements`).
- `app/dashboard/page.tsx` — **Modify**: add Best/Least sellers section using `getTopSellingItems`/`getLeastSellingItems`.
- `tests/improvements.spec.ts` — **Create**: Playwright spec covering the three features.
- `docs/superpowers/specs/2026-07-19-pos-improvements-design.md` — spec (already written, approved).

---

### Task 1: `upsertRecipeLines` + `getRecipeLines` server actions

**Files:**
- Modify: `lib/actions/menu.ts` (append at end)

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `requireRole` (`@/lib/auth/session`), `recipe_lines` table (columns: `menu_item_id`, `menu_item_variant_id`, `addon_id`, `ingredient_id`, `quantity_required`).
- Produces:
  - `getRecipeLines(params: { menuItemId: string; scope: 'item' | 'variant' | 'addon'; refId?: string }): Promise<{ ingredient_id: string; ingredient_name: string; quantity_required: number }[]>`
  - `upsertRecipeLines(params: { menuItemId: string; scope: 'item' | 'variant' | 'addon'; refId?: string; lines: { ingredientId: string; quantity: number }[] }): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `tests/improvements.spec.ts` (we will extend it in later tasks; start with a recipe action unit-ish check via UI is covered in Task 4 — here just write the action code and a tiny inline sanity check is skipped; instead verify by running the dev server compile). Actually, since these are server actions exercised through the UI, write a minimal Playwright stub now and flesh out in Task 4. For this task, verify via `npx tsc --noEmit`.

Create `tests/improvements.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
test('placeholder recipe action compiles via UI later', () => { expect(1).toBe(1) })
```

- [ ] **Step 2: Run typecheck to confirm actions not yet present (compile of page will fail later, but actions file alone compiles)**

Run: `npx tsc --noEmit`
Expected: PASS (file not imported yet).

- [ ] **Step 3: Write minimal implementation**

Append to `lib/actions/menu.ts`:
```ts
export async function getRecipeLines(params: {
  menuItemId: string
  scope: 'item' | 'variant' | 'addon'
  refId?: string
}) {
  const supabase = await createClient()
  let query = supabase
    .from('recipe_lines')
    .select('ingredient_id, quantity_required, ingredients(name)')
    .eq('menu_item_id', params.menuItemId)

  if (params.scope === 'variant') {
    query = query.eq('menu_item_variant_id', params.refId ?? '').is('addon_id', null)
  } else if (params.scope === 'addon') {
    query = query.eq('addon_id', params.refId ?? '').is('menu_item_variant_id', null)
  } else {
    query = query.is('menu_item_variant_id', null).is('addon_id', null)
  }

  const { data } = await query.order('created_at')
  return (data ?? []).map((r: any) => ({
    ingredient_id: r.ingredient_id,
    ingredient_name: r.ingredients?.name ?? 'Unknown',
    quantity_required: Number(r.quantity_required),
  }))
}

export async function upsertRecipeLines(params: {
  menuItemId: string
  scope: 'item' | 'variant' | 'addon'
  refId?: string
  lines: { ingredientId: string; quantity: number }[]
}) {
  await requireRole(['admin'])()
  const supabase = await createClient()

  const delFilter = supabase.from('recipe_lines').delete().eq('menu_item_id', params.menuItemId)
  if (params.scope === 'variant') {
    delFilter.eq('menu_item_variant_id', params.refId ?? '').is('addon_id', null)
  } else if (params.scope === 'addon') {
    delFilter.eq('addon_id', params.refId ?? '').is('menu_item_variant_id', null)
  } else {
    delFilter.is('menu_item_variant_id', null).is('addon_id', null)
  }
  const { error: delError } = await delFilter
  if (delError) throw new Error(delError.message)

  if (params.lines.length > 0) {
    const rows = params.lines.map(l => ({
      menu_item_id: params.menuItemId,
      menu_item_variant_id: params.scope === 'variant' ? params.refId : null,
      addon_id: params.scope === 'addon' ? params.refId : null,
      ingredient_id: l.ingredientId,
      quantity_required: l.quantity,
    }))
    const { error: insError } = await supabase.from('recipe_lines').insert(rows)
    if (insError) throw new Error(insError.message)
  }
}
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/menu.ts tests/improvements.spec.ts
git commit -m "feat(menu): add getRecipeLines and upsertRecipeLines server actions"
```

---

### Task 2: `getDailyUsage` server action

**Files:**
- Modify: `lib/actions/inventory.ts` (append at end)

**Interfaces:**
- Consumes: `createClient`, `requireRole`, `getBusinessDate` (`@/lib/business-date`), `inventory_movements` table.
- Produces: `getDailyUsage(businessDate?: string): Promise<{ total_cost: number; lines: { ingredient_id: string; ingredient_name: string; quantity_out: number; cost: number }[] }>`

- [ ] **Step 1: No standalone unit test (exercised in Task 6); add action code.**

- [ ] **Step 2: Write implementation**

Append to `lib/actions/inventory.ts`:
```ts
export async function getDailyUsage(businessDate?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const bizDate = businessDate || getBusinessDate()

  const { data } = await supabase
    .from('inventory_movements')
    .select('ingredient_id, quantity_out, total_cost, ingredients(name)')
    .eq('movement_type', 'sale_usage')
    .eq('business_date', bizDate)
    .order('created_at')

  const byIng: Record<string, { ingredient_id: string; ingredient_name: string; quantity_out: number; cost: number }> = {}
  let total = 0
  for (const m of data ?? []) {
    const qty = Number(m.quantity_out)
    const cost = Number(m.total_cost)
    total += cost
    const id = m.ingredient_id
    if (!byIng[id]) {
      byIng[id] = { ingredient_id: id, ingredient_name: (m.ingredients as any)?.name ?? 'Unknown', quantity_out: 0, cost: 0 }
    }
    byIng[id].quantity_out += qty
    byIng[id].cost += cost
  }

  const lines = Object.values(byIng).map(l => ({
    ...l,
    quantity_out: Math.round(l.quantity_out * 10000) / 10000,
    cost: Math.round(l.cost * 100) / 100,
  })).sort((a, b) => b.cost - a.cost)

  return { total_cost: Math.round(total * 100) / 100, lines }
}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/inventory.ts
git commit -m "feat(inventory): add getDailyUsage aggregation for sale usage"
```

---

### Task 3: Menu page — Details dialog (create/edit item)

**Files:**
- Rewrite: `app/menu/page.tsx`

**Interfaces:**
- Consumes: `getCategories`, `getMenuItems` (from `@/lib/actions/menu`), `createMenuItem`, `updateMenuItem` (existing). Types `Category`, `MenuItem`, `Variant` already in page.
- Produces: Working menu grid + open/close Details dialog that creates/updates an item and surfaces `item.id` to the Recipe dialog (Task 4). State: `editingItem: MenuItem | null`, `detailOpen: boolean`, `formName`, `formCategory`, `formPrice`, `formDesc`, `formSendToKds`, `formActive`, `saving`.

- [ ] **Step 1: Write the failing UI test (extend spec)**

Replace `tests/improvements.spec.ts` with:
```ts
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
  await expect(page.getByText('New Item')).toBeVisible()
  await page.locator('#item-name').fill('Test Brew')
  await page.locator('#item-price').fill('99')
  await page.getByRole('button', { name: /Create|Save/i }).click()
  await expect(page.getByText('Test Brew')).toBeVisible({ timeout: 8000 })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/improvements.spec.ts --headed`
Expected: FAIL (no `#item-name` field, dead button).

- [ ] **Step 3: Implement Details dialog + grid wiring**

Rewrite `app/menu/page.tsx` with this structure (keep imports; replace body):
```tsx
'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/app-layout'
import { getCategories, getMenuItems, createMenuItem, updateMenuItem } from '@/lib/actions/menu'
import { Plus, Pencil, Trash2, ChefHat } from 'lucide-react'
import { useModal } from '@/lib/contexts/modal-context'
import type { Category, MenuItem, Variant } from './page'

interface Category { id: string; name: string; sort_order: number; is_active: boolean }
interface Variant { id: string; menu_item_id: string; name: string; price_mode: string; price_override?: number; price_adjustment?: number; is_default: boolean; is_active: boolean }
interface MenuItem { id: string; category_id: string; name: string; description: string; base_price: number; is_active: boolean; send_to_kds: boolean; sort_order: number; menu_item_variants: Variant[]; recipe_count?: number }

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string | undefined>()
  const [detailOpen, setDetailOpen] = useState(false)
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formPrice, setFormPrice] = useState('0')
  const [formDesc, setFormDesc] = useState('')
  const [formSend, setFormSend] = useState(true)
  const [formActive, setFormActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const { showConfirmation, hideConfirmation } = useModal()

  const load = async () => {
    const [cats, menuItems] = await Promise.all([getCategories(), getMenuItems()])
    setCategories(cats as Category[])
    setItems(menuItems as MenuItem[])
  }
  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditing(null)
    setFormName(''); setFormCategory(categories[0]?.id ?? ''); setFormPrice('0'); setFormDesc('')
    setFormSend(true); setFormActive(true)
    setDetailOpen(true)
  }
  const openEdit = (it: MenuItem) => {
    setEditing(it)
    setFormName(it.name); setFormCategory(it.category_id); setFormPrice(String(it.base_price))
    setFormDesc(it.description); setFormSend(it.send_to_kds); setFormActive(it.is_active)
    setDetailOpen(true)
  }

  const save = async () => {
    if (!formName.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await updateMenuItem(editing.id, {
          name: formName, category_id: formCategory, base_price: parseFloat(formPrice) || 0,
          description: formDesc, send_to_kds: formSend, is_active: formActive,
        })
      } else {
        await createMenuItem({
          name: formName, category_id: formCategory, base_price: parseFloat(formPrice) || 0,
          description: formDesc, send_to_kds: formSend, sort_order: items.length,
        })
      }
      setDetailOpen(false)
      await load()
    } finally { setSaving(false) }
  }

  const remove = (it: MenuItem) => {
    showConfirmation({
      title: 'Deactivate Item', description: `Deactivate "${it.name}"?`, confirmText: 'Deactivate',
      cancelText: 'Cancel', isDestructive: true,
      onConfirm: async () => { await updateMenuItem(it.id, { is_active: false }); hideConfirmation(); await load() },
    })
  }

  const filtered = activeCategory ? items.filter(i => i.category_id === activeCategory) : items

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Menu Management</h1>
            <p className="text-muted-foreground">Manage menu items, variants, add-ons and recipes</p>
          </div>
          <button onClick={openNew} className="bg-accent text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90">
            <Plus className="w-4 h-4" /> New Item
          </button>
        </div>

        {categories.length > 0 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            <button onClick={() => setActiveCategory(undefined)} className={`px-4 py-2 rounded-lg text-sm font-medium ${!activeCategory ? 'bg-accent text-white' : 'bg-muted text-foreground hover:bg-muted/80'}`}>All</button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setActiveCategory(c.id)} className={`px-4 py-2 rounded-lg text-sm font-medium ${activeCategory === c.id ? 'bg-accent text-white' : 'bg-muted text-foreground hover:bg-muted/80'}`}>{c.name}</button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => {
            const def = item.menu_item_variants?.find(v => v.is_default)
            const price = def?.price_override ?? item.base_price
            return (
              <div key={item.id} className="bg-card border border-border rounded-xl p-4">
                <div className="bg-muted rounded-lg h-24 flex items-center justify-center mb-3"><ChefHat className="w-8 h-8 text-muted-foreground" /></div>
                <h3 className="font-semibold mb-2">{item.name}</h3>
                <div className="space-y-1 mb-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Price:</span><span className="font-medium">₱{Number(price).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Variants:</span><span>{item.menu_item_variants?.length || 1}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Recipe:</span><span>{item.recipe_count ?? 0} ing</span></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(item)} className="flex-1 bg-muted text-foreground py-2 rounded-lg hover:bg-muted/80 flex items-center justify-center gap-2 text-sm font-medium"><Pencil className="w-4 h-4" /> Edit</button>
                  <button onClick={() => remove(item)} className="bg-muted text-destructive py-2 px-3 rounded-lg hover:bg-muted/80"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            )
          })}
        </div>

        {detailOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
              <h2 className="text-lg font-semibold mb-4">{editing ? `Edit: ${editing.name}` : 'New Item'}</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <input id="item-name" value={formName} onChange={e => setFormName(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Category</label>
                  <select value={formCategory} onChange={e => setFormCategory(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background">
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Base Price (₱)</label>
                  <input id="item-price" type="number" step="0.01" value={formPrice} onChange={e => setFormPrice(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background" rows={2} />
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formSend} onChange={e => setFormSend(e.target.checked)} /> Send to KDS</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} /> Active</label>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setDetailOpen(false)} className="px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80">Cancel</button>
                <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-accent text-white hover:opacity-90 disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Save' : 'Create'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
```
Note: the local `interface` re-declarations are fine; remove the duplicate top-level `interface Category`/`Variant`/`MenuItem` block shown in the prompt (the file already had them) — keep a single `MenuItem` with `recipe_count?` added.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/improvements.spec.ts --headed`
Expected: PASS (item created, visible).

- [ ] **Step 5: Commit**

```bash
git add app/menu/page.tsx tests/improvements.spec.ts
git commit -m "feat(menu): working Details dialog for create/edit items"
```

---

### Task 4: Menu page — Recipe & Options dialog (variants, addons, recipe)

**Files:**
- Modify: `app/menu/page.tsx` (add Recipe dialog + load recipe counts)

**Interfaces:**
- Consumes (all existing unless noted): `getVariants`, `createVariant`, `updateVariant`, `getAddonGroups`, `createAddonGroup`, `createAddon` (from `@/lib/actions/menu`); `getIngredients` (`@/lib/actions/inventory`); `getRecipeLines`, `upsertRecipeLines` (Task 1). Types from `@/lib/types`: `MenuItemVariant`, `AddonGroup` (with `addons`), `Ingredient`.
- Produces: A second dialog (opened from each card's "Recipe" button) that lets admin add/edit variants, add addon groups+addons, and set recipe lines for base item / a chosen variant / a chosen addon. After save, refresh grid and update `recipe_count` on the card.

- [ ] **Step 1: Extend the test**

Append to `tests/improvements.spec.ts` (before final closing):
```ts
test('admin can add a variant and a recipe ingredient to an item', async ({ page }) => {
  await login(page, 'admin', 'admin123')
  await goTo(page, 'Menu')
  await page.getByText('Test Brew').click()
  await page.getByRole('button', { name: /Recipe/i }).first().click()
  await expect(page.getByText(/Recipe & Options/i)).toBeVisible()
  await page.locator('#variant-name').fill('Large')
  await page.locator('#variant-price').fill('120')
  await page.getByRole('button', { name: /Add Variant/i }).click()
  await expect(page.getByText('Large')).toBeVisible({ timeout: 5000 })
  await page.getByRole('button', { name: /Save Recipe/i }).click()
  await expect(page.getByText(/Recipe:/)).toBeVisible()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/improvements.spec.ts --headed`
Expected: FAIL (no Recipe button/dialog).

- [ ] **Step 3: Implement Recipe & Options dialog**

In `app/menu/page.tsx` add state and a dialog. Insert these states near other useState:
```tsx
const [recipeOpen, setRecipeOpen] = useState(false)
const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null)
const [variants, setVariants] = useState<any[]>([])
const [vName, setVName] = useState('')
const [vPrice, setVPrice] = useState('')
const [vMode, setVMode] = useState<'override' | 'adjustment'>('override')
const [groups, setGroups] = useState<any[]>([])
const [gName, setGName] = useState('')
const [scope, setScope] = useState<'item' | 'variant' | 'addon'>('item')
const [scopeRef, setScopeRef] = useState<string>('')
const [recipeRows, setRecipeRows] = useState<{ ingredientId: string; quantity: string }[]>([])
const [ingSel, setIngSel] = useState('')
const [ingQty, setIngQty] = useState('')
```

Add helper to open the dialog:
```tsx
const openRecipe = async (it: MenuItem) => {
  setRecipeItem(it); setRecipeOpen(true)
  const [vs, gs, ings] = await Promise.all([getVariants(it.id), getAddonGroups(it.id), getIngredients()])
  setVariants(vs as any[])
  setGroups(gs as any[])
  setAllIngredients(ings as any[])
  setScope('item'); setScopeRef('')
  const rl = await getRecipeLines({ menuItemId: it.id, scope: 'item' })
  setRecipeRows(rl.map(r => ({ ingredientId: r.ingredient_id, quantity: String(r.quantity_required) })))
}
```
(Add `const [allIngredients, setAllIngredients] = useState<any[]>([])` too.)

Variant add:
```tsx
const addVariant = async () => {
  if (!recipeItem || !vName.trim() || !vPrice) return
  const v = await createVariant({
    menu_item_id: recipeItem.id, name: vName,
    price_mode: vMode, price_override: vMode === 'override' ? parseFloat(vPrice) || 0 : undefined,
    price_adjustment: vMode === 'adjustment' ? parseFloat(vPrice) || 0 : undefined,
  })
  setVariants(prev => [...prev, v as any]); setVName(''); setVPrice('')
}
```

Recipe row add/remove + save:
```tsx
const addRecipeRow = () => {
  if (!ingSel || !ingQty) return
  setRecipeRows(prev => [...prev, { ingredientId: ingSel, quantity: ingQty }]); setIngSel(''); setIngQty('')
}
const saveRecipe = async () => {
  if (!recipeItem) return
  await upsertRecipeLines({
    menuItemId: recipeItem.id, scope, refId: scopeRef || undefined,
    lines: recipeRows.map(r => ({ ingredientId: r.ingredientId, quantity: parseFloat(r.quantity) || 0 })),
  })
  setRecipeOpen(false)
  await load()
}
```

Render the dialog (inside the root `<div>` of the page, after the Details dialog):
```tsx
{recipeOpen && recipeItem && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
      <h2 className="text-lg font-semibold mb-4">Recipe & Options: {recipeItem.name}</h2>

      <section className="mb-6">
        <h3 className="font-medium mb-2">Variants</h3>
        <div className="space-y-1 mb-2">
          {variants.map(v => <div key={v.id} className="flex justify-between text-sm bg-muted rounded px-3 py-1.5"><span>{v.name} {v.price_mode === 'override' ? `₱${v.price_override}` : `±₱${v.price_adjustment}`}</span></div>)}
        </div>
        <div className="flex gap-2">
          <input id="variant-name" placeholder="Name" value={vName} onChange={e => setVName(e.target.value)} className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm" />
          <select value={vMode} onChange={e => setVMode(e.target.value as any)} className="px-2 py-2 border border-border rounded-lg bg-background text-sm"><option value="override">Override</option><option value="adjustment">Adjust</option></select>
          <input id="variant-price" placeholder="Price" type="number" step="0.01" value={vPrice} onChange={e => setVPrice(e.target.value)} className="w-24 px-3 py-2 border border-border rounded-lg bg-background text-sm" />
          <button onClick={addVariant} className="bg-accent text-white px-3 py-2 rounded-lg text-sm">Add Variant</button>
        </div>
      </section>

      <section className="mb-6">
        <h3 className="font-medium mb-2">Add-on Groups</h3>
        <div className="flex gap-2 mb-2">
          <input placeholder="Group name" value={gName} onChange={e => setGName(e.target.value)} className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm" />
          <button onClick={async () => { if (!gName.trim() || !recipeItem) return; const g = await createAddonGroup({ menu_item_id: recipeItem.id, name: gName }); setGroups(prev => [...prev, { ...(g as any), addons: [] }]); setGName('') }} className="bg-accent text-white px-3 py-2 rounded-lg text-sm">Add Group</button>
        </div>
        {groups.map((g, gi) => (
          <div key={g.id} className="mb-2 pl-3 border-l-2 border-border">
            <p className="text-sm font-medium">{g.name}</p>
            <div className="flex gap-2 mt-1">
              <input placeholder="Add-on name" data-g={gi} className="flex-1 px-2 py-1.5 border border-border rounded-lg bg-background text-sm" onKeyDown={async (e) => { if (e.key !== 'Enter') return; const t = e.target as HTMLInputElement; const nm = t.value.trim(); if (!nm) return; const a = await createAddon({ addon_group_id: g.id, name: nm }); setGroups(prev => prev.map((p, i) => i === gi ? { ...p, addons: [...(p.addons || []), a] } : p)); t.value = '' }} />
            </div>
          </div>
        ))}
      </section>

      <section className="mb-6">
        <h3 className="font-medium mb-2">Recipe (ingredients consumed)</h3>
        <div className="flex gap-2 mb-2 flex-wrap">
          <button onClick={() => { setScope('item'); setScopeRef(''); getRecipeLines({ menuItemId: recipeItem.id, scope: 'item' }).then(rl => setRecipeRows(rl.map(r => ({ ingredientId: r.ingredient_id, quantity: String(r.quantity_required) })))) }} className={`px-3 py-1 rounded-full text-xs ${scope === 'item' ? 'bg-accent text-white' : 'bg-muted'}`}>Base Item</button>
          {variants.map(v => <button key={v.id} onClick={() => { setScope('variant'); setScopeRef(v.id); getRecipeLines({ menuItemId: recipeItem.id, scope: 'variant', refId: v.id }).then(rl => setRecipeRows(rl.map(r => ({ ingredientId: r.ingredient_id, quantity: String(r.quantity_required) })))) }} className={`px-3 py-1 rounded-full text-xs ${scope === 'variant' && scopeRef === v.id ? 'bg-accent text-white' : 'bg-muted'}`}>{v.name}</button>)}
          {groups.flatMap(g => g.addons || []).map((a: any) => <button key={a.id} onClick={() => { setScope('addon'); setScopeRef(a.id); getRecipeLines({ menuItemId: recipeItem.id, scope: 'addon', refId: a.id }).then(rl => setRecipeRows(rl.map(r => ({ ingredientId: r.ingredient_id, quantity: String(r.quantity_required) })))) }} className={`px-3 py-1 rounded-full text-xs ${scope === 'addon' && scopeRef === a.id ? 'bg-accent text-white' : 'bg-muted'}`}>{a.name}</button>)}
        </div>
        <div className="space-y-1 mb-2">
          {recipeRows.map((r, i) => (
            <div key={i} className="flex justify-between text-sm bg-muted rounded px-3 py-1.5">
              <span>{allIngredients.find(x => x.id === r.ingredientId)?.name ?? r.ingredientId}</span>
              <span className="flex items-center gap-2"><span className="font-medium">{r.quantity}</span><button onClick={() => setRecipeRows(prev => prev.filter((_, j) => j !== i))} className="text-destructive">x</button></span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={ingSel} onChange={e => setIngSel(e.target.value)} className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm"><option value="">Select ingredient...</option>{allIngredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          <input placeholder="Qty" type="number" step="0.001" value={ingQty} onChange={e => setIngQty(e.target.value)} className="w-24 px-3 py-2 border border-border rounded-lg bg-background text-sm" />
          <button onClick={addRecipeRow} className="bg-accent text-white px-3 py-2 rounded-lg text-sm">Add</button>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <button onClick={() => setRecipeOpen(false)} className="px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80">Close</button>
        <button onClick={saveRecipe} className="px-4 py-2 rounded-lg bg-accent text-white hover:opacity-90">Save Recipe</button>
      </div>
    </div>
  </div>
)}
```

Also wire the card "Recipe" button: in the grid card, change the Edit button row to include a Recipe button:
```tsx
<button onClick={() => openRecipe(item)} className="flex-1 bg-muted text-foreground py-2 rounded-lg hover:bg-muted/80 flex items-center justify-center gap-2 text-sm font-medium"><ChefHat className="w-4 h-4" /> Recipe</button>
```
And in `load()`, compute `recipe_count` per item:
```tsx
const menuItems = (await getMenuItems()) as MenuItem[]
const withCounts = await Promise.all(menuItems.map(async (it) => {
  const rl = await (await import('@/lib/actions/menu')).getRecipeLines({ menuItemId: it.id, scope: 'item' })
  return { ...it, recipe_count: rl.length }
}))
setItems(withCounts)
```
(Keep simple: only base-item recipe count shown on card; full counts visible inside dialog.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/improvements.spec.ts --headed`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/menu/page.tsx tests/improvements.spec.ts
git commit -m "feat(menu): recipe & options dialog (variants, addons, recipe lines)"
```

---

### Task 5: Inventory — Movement Log tab + Daily Usage card

**Files:**
- Modify: `app/inventory/page.tsx`

**Interfaces:**
- Consumes: `getInventoryMovements` (existing, returns `{ data: InventoryMovement[], count }` with `ingredient:ingredients(name)`), `getDailyUsage` (Task 2), `getIngredients` (for filter dropdown).
- Produces: A "Movement Log" tab beside the existing "Stock" content; a Daily Usage card at the top of that tab; date + ingredient filters; paginated table. State: `tab: 'stock' | 'log'`, `movements: any[]`, `movCount: number`, `movPage: number`, `movIngredient: string`, `dateFrom: string`, `dateTo: string`, `dailyUsage: { total_cost: number; lines: any[] } | null`, `usageDate: string`.

- [ ] **Step 1: Extend the test**

Append to `tests/improvements.spec.ts`:
```ts
test('inventory Movement Log tab lists movements and Daily Usage shows cost', async ({ page }) => {
  await login(page, 'admin', 'admin123')
  await goTo(page, 'Inventory')
  await page.getByRole('button', { name: /Movement Log/i }).click()
  await expect(page.getByText(/Daily Usage/i)).toBeVisible()
  await expect(page.getByText(/Total Cost Used/i)).toBeVisible()
  await expect(page.locator('table')).toBeVisible()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/improvements.spec.ts --headed`
Expected: FAIL (no Movement Log tab).

- [ ] **Step 3: Implement tabs + Daily Usage + Movement table**

Add state and loaders to `app/inventory/page.tsx`:
```tsx
const [tab, setTab] = useState<'stock' | 'log'>('stock')
const [movements, setMovements] = useState<any[]>([])
const [movCount, setMovCount] = useState(0)
const [movPage, setMovPage] = useState(1)
const [movIngredient, setMovIngredient] = useState('')
const [dateFrom, setDateFrom] = useState('')
const [dateTo, setDateTo] = useState('')
const [dailyUsage, setDailyUsage] = useState<{ total_cost: number; lines: any[] } | null>(null)
const [usageDate, setUsageDate] = useState(getBusinessDate())
const [allIngredients, setAllIngredients] = useState<any[]>([])
```
(Import `getBusinessDate` from `@/lib/business-date`.)

Add loaders:
```tsx
const loadMovements = async (page = 1) => {
  const { data, count } = await getInventoryMovements(movIngredient || undefined, dateFrom || undefined, dateTo || undefined, page, 30)
  setMovements(data); setMovCount(count); setMovPage(page)
}
const loadDailyUsage = async () => {
  const u = await getDailyUsage(usageDate)
  setDailyUsage(u)
}
useEffect(() => { getIngredients().then(setAllIngredients) }, [])
```
Call `loadMovements(1)` and `loadDailyUsage()` when switching to the log tab (guard so it loads once):
```tsx
const switchTab = (t: 'stock' | 'log') => { setTab(t); if (t === 'log') { loadMovements(1); loadDailyUsage() } }
```

Render the tab bar (above the existing stock card) and the log view. Insert after the existing `</div>` that closes the stock table card (keep all existing stock UI intact):
```tsx
<div className="flex gap-2 mb-6">
  <button onClick={() => switchTab('stock')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'stock' ? 'bg-accent text-white' : 'bg-muted text-foreground'}`}>Stock</button>
  <button onClick={() => switchTab('log')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'log' ? 'bg-accent text-white' : 'bg-muted text-foreground'}`}>Movement Log</button>
</div>

{tab === 'log' && (
  <div className="space-y-6">
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-semibold">Daily Usage</h2>
        <div className="flex items-center gap-2">
          <input type="date" value={usageDate} onChange={e => setUsageDate(e.target.value)} className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm" />
          <button onClick={loadDailyUsage} className="bg-accent text-white px-3 py-1.5 rounded-lg text-sm">Refresh</button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-1">Total Cost Used (sales): <span className="font-semibold text-foreground">{formatPHP(dailyUsage?.total_cost ?? 0)}</span></p>
      <div className="space-y-1 mt-2">
        {(dailyUsage?.lines ?? []).map(l => (
          <div key={l.ingredient_id} className="flex justify-between text-sm bg-muted rounded px-3 py-1.5">
            <span>{l.ingredient_name}</span>
            <span>{l.quantity_out} used · {formatPHP(l.cost)}</span>
          </div>
        ))}
        {(dailyUsage?.lines ?? []).length === 0 && <p className="text-sm text-muted-foreground">No usage recorded for this date.</p>}
      </div>
    </div>

    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select value={movIngredient} onChange={e => setMovIngredient(e.target.value)} className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm"><option value="">All ingredients</option>{allIngredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm" />
        <button onClick={() => loadMovements(1)} className="bg-accent text-white px-3 py-1.5 rounded-lg text-sm">Filter</button>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted text-left text-sm font-semibold">
            <th className="px-3 py-2">Date/Time</th><th className="px-3 py-2">Ingredient</th><th className="px-3 py-2">Type</th>
            <th className="px-3 py-2 text-right">In</th><th className="px-3 py-2 text-right">Out</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {movements.map(m => (
            <tr key={m.id} className="border-b border-border text-sm">
              <td className="px-3 py-2">{new Date(m.created_at).toLocaleString()}</td>
              <td className="px-3 py-2">{m.ingredient?.name ?? '—'}</td>
              <td className="px-3 py-2 capitalize">{m.movement_type.replace(/_/g, ' ')}</td>
              <td className="px-3 py-2 text-right">{Number(m.quantity_in) || ''}</td>
              <td className="px-3 py-2 text-right text-destructive">{Number(m.quantity_out) || ''}</td>
              <td className="px-3 py-2 text-right">{formatPHP(Number(m.total_cost))}</td>
              <td className="px-3 py-2 text-right">{Number(m.quantity_balance_after)}</td>
            </tr>
          ))}
          {movements.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No movements found.</td></tr>}
        </tbody>
      </table>
      {movCount > 30 && (
        <div className="flex justify-between items-center mt-4">
          <span className="text-sm text-muted-foreground">Page {movPage}</span>
          <div className="flex gap-2">
            <button disabled={movPage <= 1} onClick={() => loadMovements(movPage - 1)} className="px-3 py-1.5 rounded-lg bg-muted disabled:opacity-40">Prev</button>
            <button disabled={movPage * 30 >= movCount} onClick={() => loadMovements(movPage + 1)} className="px-3 py-1.5 rounded-lg bg-muted disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/improvements.spec.ts --headed`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/inventory/page.tsx tests/improvements.spec.ts
git commit -m "feat(inventory): movement log tab with daily usage breakdown"
```

---

### Task 6: Inventory — New Ingredient + Adjust Stock dialogs

**Files:**
- Modify: `app/inventory/page.tsx`

**Interfaces:**
- Consumes: `createIngredient`, `updateIngredient`, `createAdjustment` (existing). `Ingredient` type from `@/lib/types`.
- Produces: A "New Ingredient" dialog (name, base_unit select, reorder_level) wired to `createIngredient`; an "Edit" dialog (name, unit, reorder) wired to `updateIngredient`; an "Adjust Stock" dialog (type select, delta, reason) wired to `createAdjustment`. All refresh the list on save.

- [ ] **Step 1: Extend the test**

Append to `tests/improvements.spec.ts`:
```ts
test('admin can create a new ingredient', async ({ page }) => {
  await login(page, 'admin', 'admin123')
  await goTo(page, 'Inventory')
  await page.getByRole('button', { name: /New Ingredient/i }).click()
  await page.locator('#ing-name').fill('Test Syrup')
  await page.selectOption('#ing-unit', 'ml')
  await page.getByRole('button', { name: /Create|Save/i }).click()
  await expect(page.getByText('Test Syrup')).toBeVisible({ timeout: 8000 })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/improvements.spec.ts --headed`
Expected: FAIL (dead New Ingredient button, no dialog).

- [ ] **Step 3: Implement dialogs**

Add state:
```tsx
const [ingOpen, setIngOpen] = useState(false)
const [ingName, setIngName] = useState('')
const [ingUnit, setIngUnit] = useState('g')
const [ingReorder, setIngReorder] = useState('0')
const [editOpen, setEditOpen] = useState(false)
const [editItem, setEditItem] = useState<any>(null)
const [adjOpen, setAdjOpen] = useState(false)
const [adjItem, setAdjItem] = useState<any>(null)
const [adjType, setAdjType] = useState<'waste' | 'spoilage' | 'manual_count' | 'correction'>('manual_count')
const [adjDelta, setAdjDelta] = useState('0')
const [adjReason, setAdjReason] = useState('')
```

Wire the existing "New Ingredient" button (the one with `Plus` + "New Ingredient") to `onClick={() => { setIngName(''); setIngUnit('g'); setIngReorder('0'); setIngOpen(true) }}`.

Replace the existing `handleToggleActive` Edit button (`Edit2`) click with `onClick={() => openEdit(item)}` where:
```tsx
const openEdit = (item: any) => { setEditItem(item); setIngName(item.name); setIngUnit(item.base_unit); setIngReorder(String(item.reorder_level)); setEditOpen(true) }
const saveEdit = async () => { if (!editItem) return; await updateIngredient(editItem.id, { name: ingName, base_unit: ingUnit, reorder_level: parseFloat(ingReorder) || 0 }); setEditOpen(false); getIngredients().then(setIngredients) }
const createIng = async () => { if (!ingName.trim()) return; await createIngredient({ name: ingName, base_unit: ingUnit, reorder_level: parseFloat(ingReorder) || 0 }); setIngOpen(false); getIngredients().then(setIngredients) }
const openAdj = (item: any) => { setAdjItem(item); setAdjType('manual_count'); setAdjDelta('0'); setAdjReason(''); setAdjOpen(true) }
const saveAdj = async () => { if (!adjItem) return; await createAdjustment(adjItem.id, adjType, parseFloat(adjDelta) || 0, adjReason || 'manual'); setAdjOpen(false); getIngredients().then(setIngredients) }
```

Render the three dialogs (place near other dialogs / end of root div):
```tsx
{ingOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
      <h2 className="text-lg font-semibold mb-4">New Ingredient</h2>
      <div className="space-y-3">
        <input id="ing-name" placeholder="Name" value={ingName} onChange={e => setIngName(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
        <select id="ing-unit" value={ingUnit} onChange={e => setIngUnit(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background"><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option><option value="pc">pc</option><option value="pack">pack</option><option value="bottle">bottle</option></select>
        <input placeholder="Reorder level" type="number" value={ingReorder} onChange={e => setIngReorder(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
      </div>
      <div className="flex justify-end gap-2 mt-6"><button onClick={() => setIngOpen(false)} className="px-4 py-2 rounded-lg bg-muted">Cancel</button><button onClick={createIng} className="px-4 py-2 rounded-lg bg-accent text-white">Create</button></div>
    </div>
  </div>
)}
{editOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
      <h2 className="text-lg font-semibold mb-4">Edit Ingredient</h2>
      <div className="space-y-3">
        <input value={ingName} onChange={e => setIngName(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
        <select value={ingUnit} onChange={e => setIngUnit(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background"><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option><option value="pc">pc</option><option value="pack">pack</option><option value="bottle">bottle</option></select>
        <input type="number" value={ingReorder} onChange={e => setIngReorder(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
      </div>
      <div className="flex justify-end gap-2 mt-6"><button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-lg bg-muted">Cancel</button><button onClick={saveEdit} className="px-4 py-2 rounded-lg bg-accent text-white">Save</button></div>
    </div>
  </div>
)}
{adjOpen && adjItem && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
      <h2 className="text-lg font-semibold mb-4">Adjust Stock — {adjItem.name}</h2>
      <div className="space-y-3">
        <select value={adjType} onChange={e => setAdjType(e.target.value as any)} className="w-full px-3 py-2 border border-border rounded-lg bg-background"><option value="manual_count">Manual Count</option><option value="correction">Correction</option><option value="waste">Waste</option><option value="spoilage">Spoilage</option></select>
        <input placeholder="Delta (+/-)" type="number" step="0.001" value={adjDelta} onChange={e => setAdjDelta(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
        <input placeholder="Reason" value={adjReason} onChange={e => setAdjReason(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
      </div>
      <div className="flex justify-end gap-2 mt-6"><button onClick={() => setAdjOpen(false)} className="px-4 py-2 rounded-lg bg-muted">Cancel</button><button onClick={saveAdj} className="px-4 py-2 rounded-lg bg-accent text-white">Apply</button></div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/improvements.spec.ts --headed`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/inventory/page.tsx tests/improvements.spec.ts
git commit -m "feat(inventory): new ingredient, edit, and adjust-stock dialogs"
```

---

### Task 7: Dashboard — Best & Least Selling cards

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getTopSellingItems`, `getLeastSellingItems` (existing, from `@/lib/actions/dashboard`). Both accept `(dateFrom?, dateTo?, limit?)`.
- Produces: A new section under the existing charts showing two lists (Best Selling top 5 by quantity+revenue; Least Selling bottom 5 by quantity). Wired into the existing admin-only `fetchData` via `Promise.all`. State: `topItems: any[]`, `leastItems: any[]`, plus a `range: 'today' | 'week'` toggle consistent with the existing 7-day trend.

- [ ] **Step 1: Extend the test**

Append to `tests/improvements.spec.ts`:
```ts
test('dashboard shows best and least selling after a sale exists', async ({ page }) => {
  await login(page, 'admin', 'admin123')
  await page.waitForTimeout(1500)
  await expect(page.getByText(/Best Selling/i)).toBeVisible({ timeout: 8000 })
  await expect(page.getByText(/Least Selling/i)).toBeVisible({ timeout: 8000 })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/improvements.spec.ts --headed`
Expected: FAIL (no Best/Least headings).

- [ ] **Step 3: Implement the section**

Extend the `DashboardData` type and `fetchData`. Add to the type:
```ts
topItems: { id: string; name: string; quantity: number; revenue: number }[]
leastItems: { id: string; name: string; quantity_sold: number }[]
```
In `fetchData`, add to the `Promise.all`:
```ts
const [summary, trend, lowStock, inventoryValue, topItems, leastItems] = await Promise.all([
  getDashboardSummary(), getSalesTrend(7), getLowStockSummary(), getInventoryValue(),
  getTopSellingItems(undefined, undefined, 5), getLeastSellingItems(undefined, undefined, 5),
])
setData({ summary, trend, lowStock, inventoryValue, topItems, leastItems })
```
(If you prefer a week toggle, pass date range; default undefined = all-time which is fine for demo. Keep simple: all-time top/least.)

Render after the Low Stock Alerts block (still inside the admin `else` branch), before Quick Actions:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-10">
  <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
    <h2 className="text-base lg:text-lg font-semibold mb-4">Best Selling</h2>
    <div className="space-y-2">
      {data!.topItems.map((it, i) => (
        <div key={it.id} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
          <span className="text-sm font-medium">{i + 1}. {it.name}</span>
          <span className="text-sm text-muted-foreground">{it.quantity} · {formatPHP(it.revenue)}</span>
        </div>
      ))}
      {data!.topItems.length === 0 && <p className="text-sm text-muted-foreground">No sales yet.</p>}
    </div>
  </div>
  <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
    <h2 className="text-base lg:text-lg font-semibold mb-4">Least Selling</h2>
    <div className="space-y-2">
      {data!.leastItems.map((it, i) => (
        <div key={it.id} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
          <span className="text-sm font-medium">{i + 1}. {it.name}</span>
          <span className="text-sm text-muted-foreground">{it.quantity_sold} sold</span>
        </div>
      ))}
      {data!.leastItems.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
    </div>
  </div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/improvements.spec.ts --headed`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx tests/improvements.spec.ts
git commit -m "feat(dashboard): best & least selling items section"
```

---

### Task 8: Full regression + final video

**Files:**
- Modify: `tests/full-flow.spec.ts` (optional: add a recipe step) — not required; keep as-is.
- Run: `tests/full-flow.spec.ts` and `tests/improvements.spec.ts`.

**Interfaces:**
- Consumes: both specs.

- [ ] **Step 1: Run the existing full-flow test (must stay green)**

Run: `npx playwright test tests/full-flow.spec.ts --headed`
Expected: PASS (1 test, single video).

- [ ] **Step 2: Run the new improvements test**

Run: `npx playwright test tests/improvements.spec.ts --headed`
Expected: PASS (4 tests).

- [ ] **Step 3: Produce the combined demo video**

Run the full-flow spec (it records one `video.webm`). Copy it to `CafePOS-Full-System-Demo.webm` as before. (The improvements are covered by `tests/improvements.spec.ts`; optionally record that too.)

- [ ] **Step 4: Commit final test + any tweaks**

```bash
git add tests/improvements.spec.ts
git commit -m "test: add improvements e2e coverage (menu, inventory log, dashboard)"
```

---

## Self-Review

**Spec coverage:**
- Menu editor full + recipes → Tasks 3, 4 (+ Task 1 actions). ✓
- Inventory movement log + daily usage → Task 5. ✓
- New ingredient / adjust → Task 6. ✓
- Dashboard best/least → Task 7. ✓
- New backend `upsertRecipeLines`/`getRecipeLines`/`getDailyUsage` → Tasks 1, 2. ✓

**Placeholder scan:** No TBD/TODO. Every code step has full code. Tests have real assertions.

**Type consistency:**
- `getRecipeLines`/`upsertRecipeLines` signatures match between Task 1 (def) and Task 4 (use). ✓
- `getDailyUsage` signature matches Task 2 def / Task 5 use. ✓
- `Ingredient.base_unit` values match Task 6 select options. ✓
- `getTopSellingItems`/`getLeastSellingItems` return shapes match Task 7 rendering (`quantity`, `revenue` / `quantity_sold`). ✓
- `getInventoryMovements` returns `{ data, count }` with `ingredient:ingredients(name)` — Task 5 uses `m.ingredient?.name` and `m.movement_type`. ✓
