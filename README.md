# Bean Brewyage POS

A point-of-sale system for a coffee shop, built with **Next.js (App Router)**, **React**, **Tailwind CSS**, and **Supabase** (Postgres + Storage). PWA-enabled with offline sale queueing and Bluetooth thermal-printer support.

## Modules

| Page | Route | Access | Purpose |
| --- | --- | --- | --- |
| Dashboard | `/dashboard` | admin | Today's sales, 7-day trend, payment split, stock alerts, best/least sellers |
| POS Terminal | `/pos` | admin, cashier | Cart, variants/add-ons, discounts (SC/PWD 20%, Employee 10%), payments (cash, GCash, BPI, UnionBank), receipts, offline mode |
| Inventory | `/inventory` | admin | Ingredients, stock receipts (weighted-average costing), adjustments/waste, movement log, daily usage |
| Menu | `/menu` | admin | Items, categories, variants, add-on groups, recipes (per item / variant / add-on), images |
| Customers | `/customers` | admin, cashier | Customer profiles, loyalty balances, admin point adjustments |
| Orders (KDS) | `/orders` | admin, cashier, kds | Kitchen display, status transitions (new → preparing → ready → completed) |
| Sales | `/sales` | admin | Sales history, receipts, void/refund with inventory + loyalty reversal |
| Expenses | `/expenses` | admin | Expense entry by category; feeds the Expenses report |
| Reports | `/reports`, `/reports/{items,category,payment}` | admin (items/category/payment), admin+cashier (main) | Sales, expenses, inventory usage, voids/refunds, customer spend, per-item/category/payment profit |
| Settings | `/settings` | admin | Store info, tax rate, business-day cutoff, printer & cash drawer |

## Key behaviors

- **Money is computed server-side.** `complete_sale_v1` (Postgres RPC) re-prices every line from current menu data, computes tax/discount/totals, deducts ingredient stock atomically (row locks), enforces add-on group rules, and handles idempotency. The client never dictates totals — including for offline replays.
- **Idempotent operations.** Checkout, void, and refund all take an idempotency key; retries return the original result.
- **Void vs refund.** Only `new`/`preparing` orders can be voided (stock is restored only when the kitchen hasn't started); only `ready`/`completed` orders can be refunded (stock always restored). Both reverse loyalty points and leave a full audit trail.
- **Offline mode.** When the network drops, sales are queued in `localStorage` and replayed when back online. Replay uses the original `sold_at` for the business date, but the server recomputes all amounts. Failed replays stay queued (with attempt counters) until discarded with confirmation or force-retried.
- **Business day.** Orders/payments/receipts get their business date from `business_settings.timezone` + `business_day_cutoff_time` — honored both in the DB (`get_business_date`) and by server actions (`lib/business-date-server.ts`).
- **Auth.** Session cookies (SHA-256-hashed server-side, 24h), role gates: `admin`, `cashier`, `kds`. Origin-checked CSRF protection on `/api/*` via middleware.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase URL + keys
pnpm dev                     # http://localhost:3000
```

Database migrations live in `supabase/migrations` (apply in order; 00015 is the latest). Seed data (demo menu, admin/cashier users) is in `00003_seed.sql` — **default credentials are public knowledge, change them before any real deployment.**

## Tech stack

- Next.js App Router + React server actions + API routes
- Tailwind CSS v4, Recharts, Lucide icons
- Supabase Postgres (all business logic in SECURITY DEFINER RPCs), Storage for menu images
- Web Bluetooth / WebUSB for thermal printers and cash drawers; service worker PWA

## Testing

Playwright e2e specs are in `tests/` (`npx playwright test`), covering checkout, add-ons, discounts, payment methods, recipe deduction, inventory, offline queueing, and full system flows.
