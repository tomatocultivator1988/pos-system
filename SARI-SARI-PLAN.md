# Sari-Sari Store POS — Launch Plan

A second POS built from the Bean Brewyage POS codebase, customized for a sari-sari store selling food and beverages.

**Strategy: clone, don't share.** Each store gets its own codebase, Supabase database, and Vercel deployment. A problem in one store cannot touch the other, and the sari-sari store can diverge freely. (Multi-tenant — one system, many stores — is only worth it at 5+ stores.)

---

## Phase 1 — New database (Supabase)

> ⚠️ Free tier allows **2 active projects** and both current slots are used. Options:
> (a) upgrade the org to Pro (~$25/mo), (b) delete or pause the old `BrewhasCoffeeHousePOS` project if it is no longer used, or (c) upgrade just until launch and reassess.

- [ ] Create new Supabase project (region `ap-southeast-1` Singapore, closest to PH)
- [ ] Run migrations `00001` → `00015` in order (SQL editor or `supabase db push` after linking)
- [ ] Create staff accounts with **real passwords** (no defaults): 1 admin + 1–2 cashiers. The `kds` role can be skipped for this store
- [ ] Fill `business_settings`: store name, `Asia/Manila`, cutoff time
- [ ] Storage bucket for product images (migration 00004 creates it)

## Phase 2 — New codebase (repo: `sari-sari-pos`, private)

- [x] Copy files excluding: `.git`, `node_modules`, `.next`, `.vercel`, `.pnpm-store`, `.env.local`, logs, Bean Brewyage media/manuals, `supabase/.temp`
- [x] Fresh `git init` (no history carry-over) — done in this repo
- [x] Placeholder `.env.local` (fill with the new project's keys in Phase 1)
- [ ] Rebrand: app title/metadata, README, login page copy
- [ ] New `.env.local` values once the new Supabase project exists

## Phase 3 — Deploy (Vercel)

- [ ] Vercel → Add New Project → import `sari-sari-pos`
- [ ] Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (login silently breaks without it), `APP_ENV`
- [ ] Deploy, then verify: login works, one test sale, receipt (with the NOT-AN-OFFICIAL-RECEIPT line), reports render

## Phase 4 — Sari-sari features (in this order)

### 1. Utang / pa-utang credit ledger — the defining feature
- [ ] New `credit_transactions` table (customer_id, order_id nullable, type charge/payment, amount, balance_after, note, actor)
- [ ] Checkout option: "Charge to account" (requires a selected customer)
- [ ] Customers page: per-customer balance, "Record Payment" button, credit history
- [ ] Sales report guard: credit sales counted as revenue but tracked separately for cash-up

### 2. Barcode scanning
- [ ] `barcode` column on `menu_items` (+ import + edit UI)
- [ ] POS: scanner types into the search box — exact barcode match auto-adds the item (works with any USB keyboard-wedge scanner, no drivers)

### 3. Per-product stock
- [ ] Simple `stock_qty` on `menu_items` with auto-deduction on sale and restore on void/refund (the café's ingredient/recipe system is the wrong fit for piece-goods)
- [ ] Low-stock alert threshold per product

### 4. CSV catalog importer
- [ ] Script: `name, category, price, barcode, stock` → bulk-create products (the catalog encoding is the biggest manual job; do it in a spreadsheet)

### Not needed from the café build (leave dormant, don't build on)
- Recipes / ingredients / weighted-average costing — wrong model for piece goods
- KDS/orders screen — set "Send to KDS" off on every product
- Variants/add-on groups — rarely needed; available if a product needs sizes

## Costs & gotchas

- **Supabase free tier**: fine per store, but projects pause after 1 week of inactivity, and there are **no automatic backups** — schedule a weekly `pg_dump` for each store, or go Pro. These databases are the stores' books of record.
- **Vercel Hobby** is non-commercial TOS — two live stores want Pro (~$20/mo).
- **Label everything per store** (repo, Supabase project, Vercel project). The #1 clone disaster is running a migration against the wrong database.
- Keep default passwords out of both systems; rotate the exposed Supabase token used during setup.
