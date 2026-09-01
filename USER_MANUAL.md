# Bean Brewyage — User Manual

This guide explains how to use every screen in the Bean Brewyage system, who can use
each screen, and how the business logic (inventory, loyalty, refunds, tax)
behaves. It was written from the actual application code, not from product
marketing.

---

## 1. Roles and sign-in

| Role | Description |
|------|-------------|
| **Admin** | Full access. Runs the store: POS, menu, inventory, customers, sales, reports, settings. |
| **Cashier** | Rings up sales at the POS, manages customers, and can view the Orders (kitchen) screen. |
| **KDS** | Kitchen staff only. Can only open the Orders screen; the app redirects them there. |

### Signing in
1. Open the app in a browser.
2. Enter your **username** and **password** on the sign-in screen.
3. After signing in you land on your default screen (Dashboard for admin, POS for cashier, Orders for KDS).
4. To sign out, click **Logout** in the top-right corner and confirm.

> Dev/test accounts bundled with the seed data: `admin / admin123`, `cashier1 / 1234`, `kds1 / kds123`. Change or delete these before going live.

### What each role can see

| Screen | Admin | Cashier | KDS |
|--------|:-----:|:-------:|:---:|
| Dashboard | ✅ | — | — |
| POS Terminal | ✅ | ✅ | — |
| Inventory | ✅ | — | — |
| Menu | ✅ | — | — |
| Customers | ✅ | ✅ | — |
| Orders (Kitchen) | ✅ | ✅ | ✅ |
| Sales History | ✅ | — | — |
| Reports | ✅ | — | — |
| Settings | ✅ | — | — |

---

## 2. POS Terminal (cashier / admin)

The main screen for ringing up sales.

### Add items
- **Search** the item grid by name, or click a **category** tab to filter (beverages, food, etc.).
- Click an item card:
  - If the item has **variants** and/or **add-ons**, a selection window opens — pick a variant (price override or adjustment) and any add-ons before adding.
  - If an add-on group is **required** or has min/max selections, the system enforces it and shows a message.
  - If the item has none, it is added to the cart immediately.
- Items marked **OUT** (no stock to serve) cannot be added and show a red OUT tag. Items with limited stock show a yellow **LOW** tag but can still be sold.
- **Price shown on the card** is the base/default variant price; the actual line price follows the variant/add-on chosen.

### The order summary (right column)
- Each line shows name, variant, add-ons, and price.
- Use **− / +** to change quantity, the trash icon to remove a line.
- **Clear Cart** empties the whole order.
- The **Total** already includes tax if a tax rate is set in Settings.

### Checkout
1. Click **Checkout**.
2. **Customer** (optional): click **+ Select Customer** and pick from the list. Attaching a customer earns them loyalty points on this sale.
3. **Payment method**:
   - **Cash** – enter the amount tendered. Quick buttons add ₱50/₱100/₱200/₱500/₱1000, or **Round Up** snaps to the next ₱50. Change is shown before completing.
   - **GCash** – a **reference number is required**.
4. Click **Complete Sale**. A confirmation shows the total, tax, and change due. Confirm to finalize.
5. A **receipt** appears on screen. **Print Receipt** prints to the paired Bluetooth thermal printer; if none is paired it falls back to the browser print dialog.

### Receipt printer & cash drawer
- After every sale the app **auto-prints** (if enabled in Settings) and — for **cash** payments — **kicks the cash drawer** open through the printer's RJ12 port.
- Pairing and tests live in **Settings → Bluetooth Printer & Cash Drawer**. Requires Chrome/Edge (Web Bluetooth); the printer must be nearby and powered on.

### Safety nets
- The Complete Sale button is disabled until a valid payment is set (cash ≥ total, or a GCash reference).
- Each transaction uses an **idempotency key**: double-clicking or retrying cannot create duplicate orders with the same cart.
- Cart and checkout reset to empty after a successful sale.

---

## 3. Orders — Kitchen Display System (KDS / admin / cashier)

Real-time kitchen queue. It refreshes automatically every 10 seconds — no reload needed.

- Orders are grouped into three columns: **New**, **Preparing**, **Ready**.
- Every card shows the order number and how long it has been sitting.
- Items (with variant and add-ons) are listed per order.
- Advance an order:
  - **Start Preparing** (New → Preparing)
  - **Mark Ready** (Preparing → Ready)
  - **Complete** (Ready → Completed)
- Only orders containing at least one item with **"Send to KDS"** enabled appear here. A customer who orders only non-KDS items never enters the queue, but the sale still completes.

---

## 4. Inventory (admin)

### Stock tab
- Top cards: **Total Ingredients**, **Total Value** (stock × weighted-average cost), **Low Stock**, **Out of Stock**.
- **Search** by name; filter by **All / Low / Out**.
- Each ingredient row shows unit, stock level, unit cost, total value, and status (In Stock / Low / Out).
- **New Ingredient** – name, unit (g, kg, ml, L, pc, pack, bottle), reorder level.
- **Edit** (pencil) – rename, change unit, reorder level.
- **Adjust** – record a stock change with a type and reason:
  - **Manual Count** – bring stock to the actual physical count.
  - **Correction** – fix data-entry errors.
  - **Waste** / **Spoilage** – write off stock.
  - Enter a **delta (+/-)** number and a reason.
- **Deactivate / Activate** an ingredient — deactivated items stop being sellable in recipes.

### Movement Log tab
Every stock change is an audit trail row (date/time, ingredient, type, in, out, cost, balance after).

- **Daily Usage**: pick a date to see what was consumed by sales and its total cost.
- **Movement ledger**: filter by ingredient and date range. 30 rows per page with Prev/Next.

> Stock only changes through recorded movements (sales, receipts, adjustments), so the ledger always reconciles to the on-hand balance.

---

## 5. Menu (admin)

Manage categories, items, variants, add-ons, and recipes.

### Items
Click an item to **Edit** or use **New Item** to add one:
- **Name, Category, Base Price, Loyalty Points** (points customers earn per unit), **Description**.
- **Image** – upload a photo (stored in the cloud storage bucket) or remove the existing one.
- **Send to KDS** — whether this item appears on the kitchen screen.
- **Active** — inactive items do not appear on the POS.
- **Recipe** button opens the full editor (below).

Deactivate an item with the trash button (it can be reactivated later via **Show Inactive** and *Reactivate*).

### Variants
For example Hot / Iced sizes with different prices:
- **Override** – the variant has its own absolute price.
- **Adjust** – the variant adds/subtracts from the base price (e.g. +₱20).
- The **default variant** drives the price shown on the POS card.

### Add-on groups and add-ons
- Add a group (e.g. "Milk"), then add-ons inside it (Oat +₱30, Soy +₱20).
- On the POS the group's required/min/max rules come from the database schema; define them when the group is created.

### Recipes (ingredients consumed)
The key to automatic stock deduction and availability:
- Recipes are defined per **scope**: the **Base Item**, or a specific **variant**, or a specific **add-on**.
- Each recipe line says how much of an ingredient one unit uses.
- On sale, the app deducts exactly these quantities from stock. On void/refund it restores them.
- The POS **OUT/LOW** tags are computed from recipes: if any ingredient can't cover the recipe, the item is out/low.

> If a dish's price changes, update **Base Price**; if its cost changed, that happens through inventory receipts (weighted-average cost), not here.

---

## 6. Customers (admin / cashier)

- Top cards: **Total Customers**, **Loyalty Members**, **Average Loyalty Points**.
- **Search** by name, email, or phone. **New Customer** creates a profile — a member number (`MEM-XXXX`) is auto-generated.
- **Loyalty points are earned automatically**: when a cashier attaches a customer to a sale, the customer's balance grows by the items' *Loyalty Points × quantity*, logged on the receipt as "Points Earned".
- Points are **reversed automatically** when a sale is voided or refunded.
- Note: points *redemption* is not yet exposed in the UI; the "View Details" button on a customer card is currently cosmetic.

---

## 7. Sales History (admin)

List of all completed transactions (voided/refunded ones are excluded), 50 per page.

- **View** opens a reprintable receipt (print via **Print Receipt**).
- **Void Sale** — only available while an order is **New** or **Preparing**. Marks the order voided, restores the deducted ingredients, and reverses any loyalty points. A reason is required.
- **Refund Sale** — available for any non-refunded sale. Marks the payment refunded, **restores the deducted ingredients**, and reverses loyalty points. A reason is required.

> Both void and refund restore stock. The difference: void cancels an in-progress order; refund reverses a completed, already-paid order.

---

## 8. Reports (admin)

Reached via **Dashboard → View Reports** (it is not in the side navigation). Pick a **date range**, then open a tab:

| Tab | What you see | Export |
|-----|--------------|--------|
| **Sales** | Total sales, transactions, average order; sales-trend line chart; payment-method breakdown; order list; top 10 / least 5 items | Order list CSV |
| **Expenses** | Total expenses, net profit (sales − expenses), expenses by category chart, expense ledger | CSV |
| **Inventory Usage** | Per ingredient: used, adjusted, opening, closing stock over the period | CSV |
| **Voids/Refunds** | Total voided and total refunded, with order lists | — |
| **Customers** | Top customers by total spend and visit count | CSV |

All views exclude voided and refunded money from sales totals.

---

## 9. Dashboard (admin)

Operational summary, refreshed on load:
- **Today's Sales**, gross margin, **Transactions**, average order, **Inventory Value**, and the Cash / GCash split.
- **7-Day Sales Trend** line chart and Cash/GCash breakdown.
- **Stock Alerts** — out-of-stock and low-stock ingredients, linking to Inventory.
- **Best / Least Selling** items.
- **Quick actions**: Start New Sale, Check Inventory, View Reports.

---

## 10. Settings (admin)

| Field | Effect |
|-------|--------|
| Business Name, Address, Phone | Contact info (displayed on header). |
| Currency | PHP only. |
| Timezone | Asia/Manila. |
| **Tax Rate (%)** | Applied to POS totals at checkout and shown on the receipt. |
| Service Charge Rate (%) | Stored for reference; currently not added to POS totals. |
| Business Day Cutoff Time | When the business day rolls over (default 00:00). Sales are filed under a business date. |
| Low Stock Behavior | Warn or Block preference stored here; on the POS, out-of-stock items are always blocked and low-stock items always show a warning badge. |

### Bluetooth Printer & Cash Drawer (Settings)
- **Pair Printer** — opens the browser Bluetooth chooser; pick the thermal printer (e.g. 58mm/80mm ESC/POS).
- **Test Print** — sends a short receipt so you can confirm alignment/paper.
- **Test Drawer** — fires the drawer-kick pulse through the printer port.
- **Auto-print receipt after every sale** — on-screen receipts are always shown; this toggles silent thermal printing on top.
- **Cash drawer method** — *Connected to printer (RJ12)*, *USB cash drawer*, or *No cash drawer*. The drawer opens automatically on **cash** sales only.

Changes save only after confirming the dialog.

---

## 11. How the business logic works

- **Business day**: sales and movements are tagged with a business date (timezone Asia/Manila, cutoff configurable). Reports and daily usage filter by that date.
- **Inventory cost**: ingredients use **weighted-average cost**. A restock at a new price blends into the average; movements record the cost at the time of movement.
- **Loyalty**: earned only when a sale is attached to a customer; reversed on void/refund.
- **Void vs Refund** (both restore stock and points):

| | Void | Refund |
|---|------|--------|
| When | Order New or Preparing | Any completed sale |
| Result | Order marked voided | Payment marked refunded |
| Stock | Restored | Restored |
| Loyalty pts | Reversed | Reversed |

---

## 12. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Can't sign in | Wrong username/password, or on a fresh deploy `NEXT_PUBLIC_SITE_URL` / Supabase env vars are missing. |
| POS shows a whole item OUT | One of its recipe ingredients hit 0 stock. Check Inventory → Out of Stock and restock/adjust. |
| Item missing from the kitchen screen | Its "Send to KDS" is off, or the order was already completed. |
| Receipt prints oddly | Use the browser's print dialog; the receipt uses print CSS sized for thermal roll. |
| Printer won't pair | Use Chrome/Edge (Web Bluetooth), turn the printer on, and keep it within range. After the first pairing, browsers may ask permission again after an update. |
| Auto-print does nothing | The printer wasn't connected at sale time. Check Settings → Bluetooth Printer (pair/reconnect) and run **Test Print**. |
| Cash drawer won't open | Confirm the drawer is wired to the printer's RJ12 port and the Settings drawer method is "Connected to printer". Test it with **Test Drawer**. |
| Reports won't load | Reports need admin rights; verify the signed-in account is admin. |

---

## 13. Deployment notes (for the person operating the server)

- The app is deployed on Vercel: **https://pos-system-pearl-six.vercel.app** (production alias). Redeploy from this folder with `vercel --prod --yes`.
- The database schema, functions, and seed data live in `supabase/migrations/`; migrations are applied to Supabase (e.g. via the dashboard SQL editor or the Supabase CLI).
- Required environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and — for sign-in to work on a deployed host — `NEXT_PUBLIC_SITE_URL`.
- Menu images are stored in the `menu-images` storage bucket and accessed over the public URL stored on each menu item.