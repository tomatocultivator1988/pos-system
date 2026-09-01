# POS System Improvements — Design Spec

**Date:** 2026-07-19
**Scope:** Menu editor (full + recipes), Inventory movement log + daily usage, Dashboard best/least selling.
**Reference:** `C:\Panoy SSD\brewhas-pos` (used as a structural reference; our implementation improves on it).

## Constraints
- Admin-only: all mutating server actions already enforce `requireRole(['admin'])`. Keep that.
- Reuse existing server actions where they exist. Only two new backend functions are needed.
- Frontend is Next.js App Router, client components under `app/*/page.tsx`, server actions under `lib/actions/*.ts`, shared UI components under `components/`.

---

## 1. Menu Editor (full CRUD + recipes)

**File:** `app/menu/page.tsx` (rewrite; currently read-only stub with dead buttons).

**Data sources (existing):**
- `getCategories()`, `getMenuItems()` — `lib/actions/menu.ts`
- `createMenuItem`, `updateMenuItem` — exist
- `getVariants`, `createVariant`, `updateVariant` — exist
- `getAddonGroups` (returns groups + addons), `createAddonGroup`, `createAddon` — exist

**New action (only real backend addition for this section):**
- `upsertRecipeLines(params)` in `lib/actions/menu.ts`:
  - Input: `{ menuItemId, scope: 'item' | 'variant' | 'addon', refId?, lines: { ingredientId, quantity }[] }`
  - Deletes existing `recipe_lines` matching the scope (item → `menu_item_id`; variant → `menu_item_variant_id`; addon → `addon_id`), then inserts the provided lines.
  - Enforces `requireRole(['admin'])`.

**UI — two dialogs (improvement over brewhas' split Details/Recipe confusion):**

### Details dialog (create/edit item)
- Fields: name (required), category (select from `getCategories`), base price (number), description (textarea), `send_to_kds` toggle (default on), active toggle (default on).
- On submit: create or update the item, then keep dialog open if new so the user can immediately add variants/addons/recipe, OR route to the Recipe dialog.
- Validation: name non-empty; price >= 0.

### Recipe & Options dialog (per selected item)
Tabs or stacked sections:
1. **Variants** — list existing (from `getVariants`), add row: name + price mode (`override` with price / `adjustment` with +/- amount) + default flag. Uses `createVariant`/`updateVariant`. Delete variant.
2. **Addon groups** — add group (name, min/max, required) via `createAddonGroup`; within a group add addons (name, price) via `createAddon`. (No edit/delete actions for addons required in v1 — create only; acceptable simplification, note below.)
3. **Recipe** — choose scope (Base item / a specific variant / a specific addon). For chosen scope, list ingredient rows (ingredient select from `getIngredients`, quantity number). Add/remove rows, then "Save Recipe" → `upsertRecipeLines`.
- Card on the grid shows: variant count + recipe (ingredient) count, so the user sees coverage at a glance.

**Improvement over reference:** single combined editor, recipe attachable at item AND variant AND addon level (our `recipe_lines` schema supports all three; brewhas only per-variant). Our schema already deducts inventory correctly based on variant-vs-base recipe at sale time, so this makes the deduction meaningful.

---

## 2. Inventory — Movement Log + Daily Usage

**File:** `app/inventory/page.tsx` (extend; currently stock table only with a dead "New Ingredient" button).

**Existing actions reused:**
- `getIngredients`, `createIngredient`, `updateIngredient`, `createAdjustment` — exist
- `getInventoryMovements(ingredientId?, dateFrom?, dateTo?, page, pageSize)` — exists; returns rows with `ingredient:ingredients(name)`.

**New action:**
- `getDailyUsage(businessDate?)` in `lib/actions/inventory.ts`:
  - Defaults to today's business date via `getBusinessDate()`.
  - Aggregates `inventory_movements` where `movement_type = 'sale_usage'` and `business_date = target`.
  - Returns: `{ total_cost: number, lines: { ingredient_id, ingredient_name, quantity_out, cost }[] }`.
  - Enforces `requireRole(['admin'])`.

**UI changes:**
1. **Tabs** on the inventory page: "Stock" (existing table) and "Movement Log" (new).
2. **Movement Log tab:**
   - Filters: ingredient dropdown (all ingredients) + date from/to inputs. Calls `getInventoryMovements`.
   - Table columns: Date/Time, Ingredient, Type (badge: restock / sale usage / waste / spoilage / manual / reversal), Qty In, Qty Out, Unit Cost, Total Cost, Balance After.
   - Pagination (reuse existing `page`/`pageSize` params; simple Previous/Next).
   - Type badges color-coded (green in, red out, amber waste/spoilage).
3. **Daily Usage card** (top of Movement Log tab, or its own compact section): shows selected business date's total ingredient cost consumed via sales, and a per-ingredient breakdown (name, qty used, ₱ cost). Date picker defaults to today.
4. **"New Ingredient" button** → dialog (name, base unit select [g/kg/ml/L/pc/pack/bottle], reorder level). Uses `createIngredient`. Refresh list on save.
5. **Adjust** (existing `Edit2` button) → reuse `updateIngredient` for name/unit/reorder OR `createAdjustment` for stock corrections. Keep current toggle-active behavior; add a proper edit dialog for name/unit/reorder level. (Note: live stock adjust via `createAdjustment` is optional v1 — include a simple "Adjust Stock" dialog calling `createAdjustment` with type + delta + reason, since the data model supports it and it's cheap.)

---

## 3. Dashboard — Best & Least Selling

**File:** `app/dashboard/page.tsx` (extend; KPIs + charts already exist).

**Existing actions reused:**
- `getTopSellingItems(dateFrom?, dateTo?, limit)` — exists
- `getLeastSellingItems(dateFrom?, dateTo?, limit)` — exists

**UI:**
- New section under the charts: a card titled "Best & Least Sellers" with two columns (or two sub-cards):
  - **Best Selling** (top 5 by quantity): item name, qty sold, revenue (₱).
  - **Least Selling** (bottom 5 by quantity, includes 0-sale active items): item name, qty sold.
- Date range: default = today's business date. Optionally a small "Today / This Week" toggle reusing the same range pattern as the existing trend chart. Keep simple: default today, with a week toggle like the existing Sales Trend.
- Wire into the existing `fetchData` Promise.all (admin-only, same guard already present).

---

## Out of scope (YAGNI)
- Edit/delete of addon groups and addons (create-only in v1).
- Image upload for menu items (brewhas has it; we skip — no `image_url` management UI needed for the demo).
- Real-time websocket movement feed.
- Export to CSV for logs (can add later).

## Testing
- Extend `tests/full-flow.spec.ts` (or add `tests/improvements.spec.ts`) with:
  - Admin logs in → Menu → create item → add variant → add recipe ingredient → verify card shows counts.
  - Inventory → Movement Log tab shows entries; Daily Usage shows consumed cost after a sale.
  - Dashboard → Best/Least sellers render after a completed sale.
- Keep the existing single-video full-flow test green.

## Risks / Notes
- `upsertRecipeLines` must delete-then-insert within one action; partial recipe edits are fine.
- Recipe scope `addon` uses `addon_id` column; ensure the select only offers addons belonging to the item.
- Daily usage total cost depends on `inventory_movements.total_cost` populated at sale time (already done in `complete_sale_v1`).
