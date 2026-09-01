# Café POS Backend Implementation Plan

## 1. Agreed product scope

Build a cloud-based, single-branch outdoor café POS using the existing CafePOS UI/UX as the front end. The system is software-only and will serve:

- one cashier POS screen;
- one Kitchen Display System (KDS) screen;
- an owner/admin monitoring from a mobile browser;
- Cash and GCash payments only.

Out of scope for the first release:

- table management;
- delivery, pickup, or online ordering;
- multi-branch support;
- supplier purchasing, purchase orders, and delivery receiving;
- printer, barcode scanner, cash drawer, or other hardware integrations;
- loyalty redemption. Points will be earned and tracked only.

## 2. First-release requirements

### POS ordering

- Browse active menu categories and products.
- Select product variants and add-ons.
- Every variant may have its own independent recipe. Example: a small latte may use 150 ml milk while a large latte uses 250 ml.
- Add an optional member/customer to the order before checkout.
- Accept Cash or GCash.
- Generate a unique order number and receipt view.
- Save a completed sale and send the order to KDS.

### KDS

- Display completed/paid orders sent by POS in real time on a separate screen.
- Status flow: `new -> preparing -> ready -> completed`.
- Show order number, elapsed time, items, variants, add-ons, quantities, and order notes.
- Retain completed orders for the configured business day/history view.

### Users

- Roles: `admin`, `cashier`, and a dedicated device-only `kds` role.
- Cashier: login, create and complete sales, search/register members during checkout, view KDS as permitted, and view only operational data required for sales.
- Admin: all cashier actions plus users, menu, recipes, inventory, costs, restocking, adjustments, members, loyalty adjustments, expenses, dashboard, and reports.
- KDS device: can view the KDS projection and perform only valid KDS status transitions. It cannot open POS, view payments/customers/reports, or make any menu, inventory, loyalty, or user change.
- All important changes are recorded in an audit log.

### Members and loyalty

- Register a member with name and mobile number; email is optional.
- Search/select a member before checkout.
- Configure the number of loyalty points earned by each menu item.
- Add points cumulatively when the sale is successfully completed.
- Member profile shows current balance, loyalty transactions, and purchase history.
- First release has no redemption mechanism. The data model will support a later redemption feature without modifying historical records.

### Recipe-based ingredient inventory

- Store ingredients independently from menu products.
- Support units such as g, kg, ml, L, pc, pack, and bottle.
- Configure stock on hand, reorder level, and weighted-average unit cost for each ingredient.
- Configure recipes for menu items, variants, and inventory-consuming add-ons.
- Automatically deduct the exact recipe quantities for every completed sale.
- Allow manual stock-in/restocking because the café buys supplies directly from grocery stores.
- Allow waste, spoilage, and manual adjustment entries with a mandatory reason.
- Show low-stock items.

### Dashboard and reports

- Owner-accessible on mobile browser.
- Daily, weekly, and monthly sales.
- Cash versus GCash sales totals.
- Expenses by date/category.
- Top-selling and least-selling menu items.
- Current inventory quantity and inventory value.
- Low-stock items.
- Daily ingredient usage: opening, restocked, used, adjusted, closing quantity, and peso value used.

## 3. Technical architecture

```text
Existing Next.js application and UI
        |
        v
Next.js Server Actions / Route Handlers
        |
        +-- Custom authentication and role authorization
        |
        v
Supabase PostgreSQL database
        |
        +-- Supabase Realtime for POS-to-KDS updates
```

### Technology decisions

- **Frontend:** existing Next.js App Router application and its current visual design.
- **Database:** Supabase PostgreSQL.
- **Realtime:** Supabase Realtime `postgres_changes` subscriptions on an append-only `kds_events` table for new-order and status-change notifications. On an event, the KDS fetches the current KDS-safe order projection through an authorized Next.js endpoint. This is sufficient for one KDS screen and café-scale volume; Broadcast channels are not required for the first release. Because authentication is custom, the application server issues a short-lived, KDS-scoped Supabase Realtime JWT after validating the custom session; RLS allows that token to subscribe only to KDS event rows. No anonymous database read policy is used.
- **Authentication:** custom application authentication, not Supabase Auth.
- **Sessions:** encrypted/signed, HTTP-only, Secure, SameSite cookies.
- **Password/PIN storage:** Argon2id hash preferred; bcrypt is acceptable if deployment constraints require it. Never store plaintext passwords or PINs.
- **Database access:** server-side only for protected operations. The Supabase service-role key is never exposed to the browser.
- **Time/currency:** store timestamps in UTC. The first release is pinned to the Philippine timezone (`Asia/Manila`) in the PostgreSQL business-date function and application display formatter; do not rely on database/server/browser defaults. Currency is PHP/Peso. The timezone is retained in settings for a future multi-branch expansion, but is not editable in the first-release UI.
- **Payments:** GCash is a manual tender type in the first release. The cashier verifies payment in the café's GCash app, selects GCash in POS, and may record the GCash reference number. There is no GCash gateway, API payment verification, or automatic reconciliation.
- **Connectivity:** an active connection is required to finalize a payment/sale in the first release. The POS keeps an unsent cart locally and clearly shows an offline/reconnecting banner, but does not silently mark an offline cart as paid. A durable offline sales outbox is a later enhancement because it needs conflict handling for stock, KDS timing, and payment confirmation.

## 4. Custom authentication and authorization

### Login flow

1. User submits username/email plus password or PIN to a server route.
2. Server finds an active user and verifies the password/PIN hash.
3. Server creates a session record or signed session token containing user ID, role, and expiration.
4. Server writes the session into an HTTP-only cookie.
5. Middleware/server guards redirect unauthenticated users to login.
6. Every protected server action checks the active session and required role before querying or mutating data.

### Required safeguards

- Rate-limit failed login attempts and failed bearer-token validation attempts.
- Expire sessions and support explicit logout.
- Rotate session identifiers after login.
- Prevent inactive users from logging in.
- Use role checks on the server; hiding UI buttons alone is not authorization.
- Log login, logout, failed login, user creation, role change, inventory changes, voids, and manual loyalty changes.

### Role matrix

| Capability | Admin | Cashier |
|---|---:|---:|
| Process Cash/GCash sale | Yes | Yes |
| Register/search a member | Yes | Yes |
| View KDS | Yes | Yes, if enabled |
| Change KDS status | Yes | Yes, if enabled |
| Use dedicated KDS device mode | No | No |
| Manage users | Yes | No |
| Manage menu, variants, add-ons, recipes | Yes | No |
| Manage ingredient costs, restocks, adjustments | Yes | No |
| Record/manage expenses | Yes | No |
| View owner reports and inventory cost | Yes | No |
| Adjust loyalty points | Yes | No |

### KDS device identity

The KDS screen uses a dedicated device identity, not a cashier's personal session. Device
authentication is via a pre-provisioned bearer token, never a password or PIN.

#### Device registration and tokens

Admin creates a `kds_devices` record (device name, linked `kds`-role user, active status). The
server generates a cryptographically random bearer token, stores its SHA-256 hash, displays the
plaintext token once for the admin to configure on the device. If lost, the token is revoked and
a replacement is issued.

The device presents the token in `Authorization: Bearer <token>` on every KDS request. The server
hashes the presented token, looks up the active device record, and resolves the linked `kds` user
for audit identity. A device's token is treated as invalid if its linked `kds_user.is_active` is
`false`. No interactive login on the KDS screen.

Tokens are long-lived (default 90 days, configurable per device, revocable by admin at any time).
Expiry is checked on every request; near-expiry devices display a warning banner. Automated token
refresh is deferred to a later release — the admin generates and applies a replacement manually.

#### Separate routes, separate audit identity

The dedicated KDS device route (`/kds`) and the cashier-permitted KDS view (`/orders`) are
distinct code paths with different session semantics:

- **`/kds` device route:** bearer-token authentication, status-change buttons enabled.
  `order_status_history.changed_by_user_id` resolves to the device-linked `kds` user. Status
  transitions are unambiguously attributed to the kitchen device.
- **`/orders` cashier view:** the cashier's own HTTP-only cookie session. View-only unless the
  role matrix explicitly grants status-change permission; if granted, the change is attributed
  to that cashier's user ID.

If per-staff accountability on a shared kitchen device is needed later, a staff PIN prompt can
record the individual staff member ID in `changed_by_user_id` without schema changes.

## 5. Database design

All primary keys use UUIDs. Every operational table includes `created_at`; mutable tables also include `updated_at`. Monetary values use `numeric(12,2)`, never floating point.

### 5.1 Business and users

#### `business_settings`

- `id`
- `business_name`, `address`, `phone`
- `currency_code` (default `PHP`)
- `timezone` (`Asia/Manila` in first release; retained for future expansion)
- `tax_rate` and optional service-charge settings, if the café uses them
- `business_day_cutoff_time` (default `00:00`, configurable by admin)
- `default_low_stock_behavior` (`warn` or `block`)
- `created_at`, `updated_at`

#### `users`

- `id`
- `name`
- `username` (unique) and optional `email` (unique)
- `password_hash`
- `role` (`admin`, `cashier`)
- `is_active`
- `last_login_at`, `created_at`, `updated_at`

#### `sessions`

- `id`
- `user_id`
- `token_hash`
- `expires_at`, `revoked_at`, `created_at`

Store only a hash of a database-backed session token. A signed-cookie-only approach is acceptable only if revocation is not required; database-backed sessions are recommended for POS operations.

#### `kds_devices`

- `id`
- `device_name`
- `kds_user_id` (references `users`, role must be `kds`)
- `is_active`
- `last_seen_at`, `created_at`, `updated_at`

#### `kds_device_tokens`

- `id`
- `kds_device_id`
- `token_hash`
- `label` optional (e.g. "initial", "replacement-2026-08")
- `expires_at`, `revoked_at`, `created_at`

One active token per device is enforced by a partial unique index:
`CREATE UNIQUE INDEX idx_active_kds_token ON kds_device_tokens(kds_device_id) WHERE revoked_at IS NULL`.
Issuing a new token inserts with `revoked_at = NULL`; revoking the prior token sets its
`revoked_at` to now.

### Business-day rule

`business_day_cutoff_time` is a single configuration value in the one-row `business_settings` table. PostgreSQL exposes one shared `get_business_date(timestamp)` function that explicitly converts UTC input to `Asia/Manila` and then applies this cutoff. Every daily report query, order/payment/inventory/expense write, and KDS completed-order retention query must call this function or use its persisted result; no route, browser, report, or KDS query may hardcode a separate cutoff calculation.

#### `audit_logs`

- `id`, `actor_user_id`
- `operation_id`, `request_id`, `source` (`trigger` or `operation`)
- `action`, `entity_type`, `entity_id`
- `old_data` JSONB, `new_data` JSONB
- `ip_address` if available, `created_at`

### 5.2 Menu, variants, add-ons, and recipes

#### `menu_categories`

- `id`, `name`, `sort_order`, `is_active`

#### `menu_items`

- `id`, `category_id`
- `name`, `description`, `base_price`
- `loyalty_points_earned`
- `is_active`, `send_to_kds`
- `image_url` optional, `sort_order`

#### `menu_item_variants`

- `id`, `menu_item_id`
- `name`, `price_mode` (`override` or `adjustment`)
- `price_override` or `price_adjustment`
- `is_default`, `is_active`, `sort_order`

If an item has variants, the POS must select exactly one valid variant before adding it to the cart. Menu items without variants use the base item recipe.

#### `addon_groups`

- `id`, `menu_item_id`
- `name`
- `min_selections`, `max_selections`
- `is_required`, `sort_order`, `is_active`

#### `addons`

- `id`, `addon_group_id`
- `name`, `price_adjustment`
- `is_active`, `sort_order`

#### `ingredients`

- `id`, `name`, `base_unit`
- `quantity_on_hand`
- `reorder_level`
- `weighted_average_unit_cost`
- `is_active`, `created_at`, `updated_at`

Use a canonical base unit for each ingredient. Example: record coffee in grams and milk in millilitres. Convert purchase quantities to that unit during stock-in.

#### `recipe_lines`

- `id`
- `menu_item_id` nullable
- `menu_item_variant_id` nullable
- `addon_id` nullable
- `ingredient_id`
- `quantity_required`

Exactly one of `menu_item_id`, `menu_item_variant_id`, or `addon_id` is set on a recipe line. Validation prevents ambiguous recipe lines.

Recipe resolution rule:

1. Use variant recipe lines when the ordered variant has a recipe.
2. Otherwise use the parent menu-item recipe lines.
3. Add recipe lines for every selected inventory-consuming addon.

The resolved recipe is snapshotted through the `sale_usage` inventory movements created at checkout. A void/refund must reverse those original sale-usage movements—including addon ingredients—not re-resolve today's menu/variant/addon recipe. This preserves correctness if recipes or addon definitions change after the sale.

### 5.3 Inventory and costing

#### `stock_receipts`

- `id`, `received_at`, `received_by_user_id`
- `reference_number` optional, `notes`
- `business_date`, `created_at`

#### `stock_receipt_items`

- `id`, `stock_receipt_id`, `ingredient_id`
- `quantity_received`
- `unit_cost`
- `line_total`

#### `inventory_adjustments`

- `id`, `ingredient_id`
- `adjustment_type` (`waste`, `spoilage`, `manual_count`, `correction`, `opening_balance`)
- `quantity_delta`
- `reason`
- `recorded_by_user_id`, `approved_by_user_id` optional
- `business_date`, `created_at`

#### `inventory_movements`

This is the permanent inventory ledger and source of truth.

- `id`, `ingredient_id`
- `movement_type` (`opening_balance`, `restock`, `sale_usage`, `waste`, `spoilage`, `manual_adjustment`, `sale_reversal`)
- `quantity_in`, `quantity_out`
- `unit_cost_at_movement`
- `total_cost`
- `quantity_balance_after`, `average_unit_cost_after`
- `order_item_id` nullable
- `reference_type`, `reference_id`
- `notes`, `actor_user_id`, `created_at`
- `business_date`

The displayed quantity and weighted-average cost on `ingredients` are a current-state cache updated in the same transaction as every movement. Reports can be reconstructed from `inventory_movements`.

For sales, `sale_usage` is written at **ingredient × order-item** granularity, including every ingredient consumed by the selected variant and add-ons. A stock check may aggregate ingredient requirements temporarily to lock/check balances efficiently, but the saved ledger remains tied to the originating `order_item_id`. This allows exact historical analysis and supports future item-level void/split-order capabilities; first release exposes whole-order reversal only.

### 5.4 Customers and loyalty

#### `customers`

- `id`, `member_number` (unique)
- `name`, `mobile_number` (unique when present), `email` optional
- `loyalty_points_balance`
- `is_active`, `created_at`, `updated_at`

#### `loyalty_transactions`

- `id`, `customer_id`, `order_id` nullable
- `transaction_type` (`earn`, `redeem`, `adjust`, `reversal`)
- `points_delta`, `balance_after`
- `reason`, `actor_user_id`, `created_at`

First release creates only `earn`, `adjust` (admin only), and `reversal` records. `redeem` is reserved for future use.

#### Loyalty points calculation

Points earned per order item are calculated from the snapshot values captured at checkout, not
from current menu prices or any future post-discount total:

    points per order item = order_items.loyalty_points_per_unit × order_items.quantity

`loyalty_points_per_unit` is sourced from `menu_items.loyalty_points_earned` at the time of
sale and stored in the `order_items` snapshot alongside `unit_price`. This makes points
deterministically fixed at checkout — unaffected by later menu price edits, recipe changes, or
any discount mechanic. The reversal of an `earn` transaction subtracts the originally-recorded
points from the order's `loyalty_points_earned`, never a re-computation.

### 5.5 Orders, payments, and KDS

#### `orders`

- `id`, `order_number` (unique)
- `order_sequence_number` (unique, database-generated)
- `cashier_user_id`, `customer_id` nullable
- `status` (`new`, `preparing`, `ready`, `completed`, `voided`)
- `payment_status` (`paid`, `voided`, `refunded`)
- `payment_method` (`cash`, `gcash`)
- `subtotal`, `discount_total`, `tax_total`, `grand_total`
- `loyalty_points_earned`
- `created_at`, `preparing_at`, `ready_at`, `completed_at`, `voided_at`
- `business_date`
- `notes`

Note: `discount_total` exists for forward compatibility and is always `0` in the first release.
The checkout RPC must set it to `0` explicitly, not `NULL`, so aggregation queries work
unchanged before and after a discount mechanic is added.

Order numbers are generated only in PostgreSQL from a database sequence, inside the checkout RPC. Example display format: `ORD-20260719-000123`, where the numeric portion comes from `nextval()` and the date uses the derived business date. The unique sequence-backed value makes concurrent checkouts and accidental rapid double-clicks safe; the browser never calculates or increments order numbers.

#### `order_items`

- `id`, `order_id`
- `menu_item_id`, `menu_item_variant_id` nullable
- snapshot values: `item_name`, `variant_name`, `unit_price`, `loyalty_points_per_unit`
- `quantity`, `line_total`, `notes`

Snapshots preserve historical order data even when a product, price, or points rule changes later.

#### `order_item_addons`

- `id`, `order_item_id`, `addon_id`
- snapshot values: `addon_name`, `unit_price`
- `quantity`, `line_total`

#### `payments`

- `id`, `order_id`
- `method` (`cash`, `gcash`)
- `amount`
- `gcash_reference` nullable
- `status` (`paid`, `voided`, `refunded`)
- `received_by_user_id`, `paid_at`, `business_date`, `voided_at`, `refunded_at`

#### `payment_reversals`

- `id`, `payment_id`, `order_reversal_id`
- `reversal_type` (`void`, `refund`)
- `amount`, `business_date`
- `processed_by_user_id`, `created_at`

The original payment row is preserved. A void/refund RPC creates a payment-reversal ledger row and updates the payment/order status atomically, allowing reports to distinguish original gross tender from voided/refunded amounts and net tender collected.

#### `order_status_history`

- `id`, `order_id`
- `from_status`, `to_status`
- `changed_by_user_id`, `created_at`

#### `kds_events`

- `id`, `order_id`
- `event_type` (`order_created`, `status_changed`)
- `event_version`
- `business_date`, `created_at`

This append-only table contains no payment, customer, pricing, or item-detail data. Checkout and valid KDS status RPCs insert an event within the same transaction as the order/status write. The KDS uses the event only to trigger a refetch of its current KDS-safe order projection from the Next.js server, authenticated with its custom session.

### 5.6 Expenses

#### `expense_categories`

- `id`, `name`, `is_active`, `sort_order`

#### `expenses`

- `id`, `expense_category_id`
- `expense_date`, `description`, `amount`
- `payment_method` optional
- `recorded_by_user_id`
- `reference_number` optional, `notes`, `business_date`, `created_at`

#### `idempotency_requests`

- `id` (client-generated idempotency UUID)
- `operation_type` (`checkout`, `void`, `refund`)
- `actor_user_id`
- `order_id` nullable until successful completion
- `request_hash`, `status`, `created_at`, `completed_at`, `expires_at`

The POS generates one idempotency UUID when the cashier presses Complete Sale. Retrying the same request after a timeout or double-click returns the already-created order instead of creating another paid sale, another inventory deduction, or another loyalty accrual. Void and refund requests use the same mechanism with their own operation type.

Keys are retained for 90 days. The scheduled cleanup is allowed to delete only an expired, completed/failed `idempotency_requests` retry record; it never deletes or cascades to orders, payments, inventory movements, loyalty transactions, reversal records, or audit entries. Those permanent records, linked by `order_id` and `operation_id`, remain the source of truth for disputes and reconciliation. The cleanup job is restricted to this table and is tested against foreign-key/cascade configuration before production release.

#### `order_reversals`

- `id`, `order_id`, `operation_id`
- `reversal_type` (`void`, `refund`)
- `reason`
- `inventory_restoration_basis` (`automatic_new_not_prepared`, `admin_attested_not_prepared`, `not_restored_prepared`)
- `ingredient_stock_restored` boolean
- `authorized_by_user_id`, `created_at`

This table preserves why ingredients were or were not restored, independently of the KDS status. It is required for every void/refund and links directly to the audit operation and reversal inventory movements.

## 6. Database constraints, indexes, and security

### Constraints

- Quantity fields must be non-negative where appropriate.
- Sale usage quantities must be positive `quantity_out` values.
- `Cash` and `GCash` are the only first-release payment methods.
- A sale cannot have zero order items.
- A payment reversal cannot exceed the unreversed original payment amount, and an order cannot be voided/refunded more than once.
- Loyalty point balances cannot go negative in the first release.
- A recipe line must point to one, and only one, recipe owner.
- Unique order numbers and member numbers.
- Ingredient and menu records referenced by historical orders/movements are archived (`is_active = false`), never physically deleted.

### Indexes

- `orders(business_date)`, `orders(created_at)`, `orders(status)`, `orders(payment_method, created_at)`, `orders(customer_id)`.
- `order_items(menu_item_id)`.
- `payments(method, business_date)`, `payment_reversals(business_date, reversal_type)`.
- `inventory_movements(ingredient_id, created_at)`.
- `kds_events(business_date, created_at)`.
- `stock_receipt_items(ingredient_id)`.
- `loyalty_transactions(customer_id, created_at)`.
- `customers(mobile_number)`, `customers(member_number)`.
- `audit_logs(entity_type, entity_id, created_at)`.

### Supabase security

- Enable Row Level Security on all application tables.
- Use deny-by-default RLS policies: the browser's anon/authenticated roles cannot read or mutate operational, financial, inventory, customer, or user tables directly.
- Browser clients do not directly write protected operational tables. The only browser-facing database capability allowed for KDS is a narrowly scoped realtime subscription to notification-only `kds_events`; it has no mutation rights and exposes no order/payment/customer data.
- Custom authentication means Supabase does not receive a Supabase Auth user JWT. Therefore server-side custom-session/role checks remain mandatory for every application request, while RLS prevents direct browser/database access as a second boundary.
- Use authenticated Next.js server routes/actions with the service-role database client for controlled mutations and RPC calls. Do not use the service-role client in client-side code.
- The service-role key remains server-only in environment variables.
- Database functions accept only validated server inputs and use a restricted function execution role; direct table grants are not used as a substitute for the checkout/void RPCs.

### Audit log mechanism

Use both database triggers and explicit contextual audit writes. They have separate purposes and are linked by an `operation_id`, so they are not treated as duplicate audit events:

- **Database triggers** write immutable row-change audit records for `users` (including role/active changes), `menu_items`, `menu_item_variants`, `addons`, `recipe_lines`, `ingredients`, `stock_receipts`, `stock_receipt_items`, `inventory_adjustments`, `inventory_movements`, `orders`, `order_items`, `payments`, `payment_reversals`, `order_reversals`, and `loyalty_transactions`. Each records table, row ID, action, old/new values, actor ID, operation ID, and timestamp. This prevents a future mutation path from silently bypassing change logging.
- **Checkout/void/refund RPCs** set a transaction-local actor ID and request ID (for example with `set_config`) so trigger rows identify the responsible user and operation.
- **Explicit operation audit entries** are created only for business actions needing intent/context: checkout completed, order void/refund, inventory adjustment, waste/spoilage, stock-in, menu/recipe publish/archive, user role change, and loyalty adjustment. They contain the mandatory reason where applicable and link to the trigger row changes by `operation_id`.
- Audit tables are append-only to the application. No UI operation can edit or delete an audit entry.

## 7. Core transaction workflows

### 7.1 Admin creates menu and recipes

1. Admin creates category, menu item, variants, and add-on groups.
2. Admin configures menu price and loyalty points per product.
3. Admin creates ingredients, units, reorder level, and current cost.
4. Admin assigns recipe lines to the menu item, each variant, and stock-consuming add-ons.
5. Server validates that active, KDS-enabled sellable items have a valid recipe before allowing them to be sold when inventory tracking is enabled.

### 7.2 Manual restocking

1. Admin opens Stock-in and records grocery purchases.
2. For each ingredient, enter quantity in canonical unit and purchase unit cost.
3. In one transaction, create receipt and receipt items, calculate new weighted-average cost, update ingredient balance, and create `restock` movement records.
4. Audit log records the stock-in event.

Weighted-average formula:

```text
new average cost =
  ((current quantity × current average cost) + (received quantity × received unit cost))
  / (current quantity + received quantity)
```

If current quantity is zero, the new average cost is the received unit cost.

Waste, spoilage, and quantity-only manual adjustments change quantity on hand but do **not** recalculate or distort the weighted-average unit cost. Their movement cost is recorded using the current weighted-average unit cost so the inventory-value reduction is traceable. A correction to an ingredient's cost basis is a separate, admin-only cost-correction operation with its own reason and audit record.

### 7.3 Database RPC boundary for financial and stock operations

Checkout is implemented as one PostgreSQL stored function called through Supabase RPC, for example `complete_sale_v1(payload jsonb, actor_user_id uuid, idempotency_key uuid)`. It executes as one database transaction; Next.js makes one RPC call rather than calling several server actions in sequence. The function must:

1. validate the caller identity/role already verified by the server; claim/lock the idempotency request before side effects, and return its saved result if it already completed;
2. lock the relevant ingredient rows and, when a member is attached, the customer row, using a stable order;
3. resolve recipe data and revalidate product prices/selections from database data;
4. generate the database-backed order number;
5. create order, items, addon snapshots, payment, inventory movements, loyalty transaction, and persisted `business_date` values;
6. update current ingredient balances and member point balance;
7. create audit/status records; and
8. return the single saved order result.

Any validation, stock, payment-data, or database error rolls back the entire transaction. A retry with the same idempotency key returns the original successful result. This prevents partial paid orders, duplicate points, and duplicate inventory deductions during page refreshes, timeouts, or double-clicks.

The same rule applies to the admin-only `void_order_v1` and `refund_order_v1` database RPCs: each creates the payment-reversal ledger row, performs the financial status change, loyalty reversal, applicable inventory movement/reversal, status history, KDS event where needed, and audit record atomically. Each request requires a non-empty reason and creates one contextual operation audit entry plus its linked trigger audit rows.

### 7.4 POS sale and automatic deduction

The checkout operation is a single database transaction:

1. Validate active cashier session and cart data.
2. Validate every item, variant, addon, price, and selection rule from database data; do not trust browser totals.
3. Resolve all recipe lines, including variant and addon recipes.
4. Aggregate required ingredient quantities across all ordered items only for efficient stock validation, while retaining the originating order-item recipe lines.
5. Lock relevant ingredient rows and the selected customer row (if any), then check stock availability and loyalty balance update safety.
6. If low stock is configured as blocking, reject insufficient stock with a clear ingredient list. If warning-only, record the sale and allow negative stock only if explicitly enabled by admin.
7. Create order, items, addons, and Cash/GCash payment rows with their derived `business_date`.
8. Create `sale_usage` inventory movements per ingredient per order item, including variant and addon recipe ingredients, using the ingredient's weighted-average cost at sale time.
9. Decrease ingredient quantities in the current-state table.
10. If a member was selected, read `loyalty_points_per_unit` from the configured menu item, snapshot it into `order_items`, calculate `loyalty_points_per_unit × quantity`, update the member's `loyalty_points_balance`, and write an `earn` `loyalty_transaction`.
11. Set the order to `new` and publish/realtime-notify it for KDS.
12. Commit. If any step fails, roll back all of them.

### 7.5 KDS status updates

1. KDS subscribes to notification-only `kds_events` and initially fetches its current `new`/`preparing`/`ready` order projection from an authorized Next.js endpoint.
2. A new paid POS order writes `order_created` in the same checkout transaction; KDS receives the event and refetches, so the order appears automatically.
3. KDS user changes status only in the allowed sequence: `new -> preparing -> ready -> completed`.
4. Server verifies authorization and valid status transition.
5. Store timestamp and status history record, insert a `status_changed` KDS event in the same transaction, then let KDS refetch the updated projection.

Inventory is deducted at sale completion, not when KDS marks an item ready. This matches the agreed requirement. If the business later wants deduction only after preparation, that rule can be changed deliberately.

### 7.6 Void/refund rule

This is an admin-only controlled workflow. Every void/refund requires a non-empty reason, actor identity, timestamp, and operation ID in the audit log.

- **Before preparation (`new`):** this is an exact atomic inverse of checkout. Mark the order voided, reverse its payment/reporting effect, reverse the loyalty points, create `sale_reversal` inventory movements that restore every deducted recipe ingredient at its original sale-use cost, restore current stock balances, create status history, write audit records, and store `automatic_new_not_prepared` in `order_reversals.inventory_restoration_basis`.
- **After preparation has started (`preparing`, `ready`, or `completed`):** an admin can refund/cancel the financial sale and reverse loyalty points atomically, but ingredients are not restored automatically because they may already have been consumed. The original `sale_usage` remains valid; if required, the operation records the food/ingredients as waste or consumed according to the reason. This prevents falsely increasing stock.
- If the kitchen confirms that preparation did not begin despite a `preparing`, `ready`, or `completed` status, admin must explicitly select **Restore ingredients** and attest to the fact. That choice is recorded as `admin_attested_not_prepared`, with the reason and actor, and creates the same `sale_reversal` movements as a pre-preparation void.
- When stock is not restored because food was prepared/consumed, `order_reversals` stores `not_restored_prepared`. This distinguishes an automatic new-order void, an admin-attested non-preparation restoration, and a true post-preparation refund during later reconciliation.
- A void/refund cannot be executed twice. The RPC checks current order/payment state and uses its own idempotency/operation key.

## 8. Reporting formulas

### Sales

- **Gross sales:** sum of original payment amounts captured in the selected business-date range, before any void/refund reversal.
- **Voids/refunds:** sum of `payment_reversals.amount` by reversal business date and type.
- **Net sales:** gross sales less voided/refunded payment-reversal amounts.
- **Cash sales / GCash sales:** original tender amount less reversal amount, grouped by original payment method.
- **Average order value:** net sales divided by completed paid order count.

### Inventory

- **Current inventory value:** sum of `quantity_on_hand × weighted_average_unit_cost` for active ingredients.
- **Daily beginning quantity:** closing quantity before the report date.
- **Added quantity:** restock movements on the report date.
- **Used quantity:** `sale_usage` movements on the report date.
- **Adjustment quantity:** waste, spoilage, and manual adjustment movements on the report date.
- **Closing quantity:** beginning + added - used + adjustments.
- **Daily ingredient value used:** sum of `sale_usage.total_cost` on the report date.

The daily report displays each ingredient’s beginning, added, used, adjusted, closing, and peso cost used, plus the overall “Today’s ingredients used: ₱X” total.

### Product performance

- **Top-selling:** menu products ordered by sold quantity or net sales in selected range.
- **Least-selling:** active products with the lowest sold quantity in selected range. Clearly separate products with zero sales from products that were not available/active.

### Profit context

The first dashboard may show sales, expenses, and ingredient cost consumed. If “profit” is displayed, label it clearly:

```text
estimated gross margin = net sales - ingredient cost consumed
estimated operating result = net sales - ingredient cost consumed - recorded expenses
```

This is only accurate when all costs and expenses are recorded.

## 9. UI/UX implementation map

Keep the existing visual style: sidebar, cards, tables, charts, spacing, and cafe POS workflow. Replace mock/context data with server-fetched data and mutation flows.

| Existing route | Final behavior |
|---|---|
| `/login` | Custom username/PIN or password login, no Supabase Auth |
| `/dashboard` | Live owner dashboard with sales, payment split, inventory value, low stock, ingredient usage, and product performance |
| `/pos` | Product grid, variant/add-on selector, cart, member lookup/new-member modal, Cash/GCash checkout, receipt confirmation |
| `/orders` | Full-screen-capable KDS with live orders and New/Preparing/Ready/Completed columns or filters |
| `/menu` | Admin menu, category, variant, addon, product points, and recipe management |
| `/inventory` | Ingredient list, valuation, low stock, stock-in, movement history, waste/spoilage/manual adjustment forms |
| `/customers` | Member enrollment, current points, loyalty ledger, purchase history |
| `/sales` | Saved sales history, receipt details, payment, customer, item snapshots, controlled void/refund actions |
| `/reports` | Date-range sales, Cash/GCash, expenses, inventory usage/cost, top/least sellers |
| `/settings` | Business settings, tax configuration, low-stock behavior, user administration, expense categories |

### Required UX additions

- Member search/register modal in POS.
- Variant/add-on selection modal that enforces minimum/maximum selections.
- GCash payment field for optional reference number.
- Clear “out of stock”/“low stock” state before checkout.
- Stock-in, adjustment, and recipe editor flows for admin.
- Full-screen KDS layout with prominent elapsed-order timer and status buttons.
- Mobile-responsive dashboard/report cards for owner monitoring.

## 10. Delivery phases

### Phase 0: project preparation

- Inspect and fix current TypeScript issues.
- Remove mock-data dependencies incrementally.
- Configure environment variables, Supabase project, migrations, and seed data.
- Define PHP currency formatter, business timezone, and ID/order-number format.
- Add repeatable fresh-install bootstrap tooling:
  - a versioned migration inserts the single `business_settings` row with `PHP`, `Asia/Manila`, and the agreed default business-day cutoff;
  - a server-only `bootstrap-admin` CLI reads initial admin credentials from environment variables, creates the password/PIN hash, and refuses to run when an admin already exists unless an explicit maintenance override is supplied;
  - development/demo seed data is separate from production bootstrap data and is never applied automatically in production. The seed command requires an explicit non-production environment value (for example `APP_ENV=development` or `test`) and exits with an error when `APP_ENV=production`; production build/deploy scripts never invoke it.

### Phase 1: foundation and custom auth

- Create schema migrations for business, users, sessions, settings, and audit logs.
- Implement password/PIN hashing, session creation, middleware, logout, and role guards.
- Replace client-only authentication state with server-backed session state.
- Build admin user management.

### Phase 2: master data and recipes

- Build categories, menu items, variants, addon groups, and addons.
- Build ingredient management and canonical-unit validation.
- Build recipe editor for base menu item, variant, and addon recipes.
- Build customer/member enrollment and member search.

### Phase 3: inventory and costing engine

- Build stock-in, weighted-average-cost calculation, and movement ledger.
- Build opening balance, waste/spoilage, and manual adjustment workflows.
- Implement low-stock queries and inventory valuation.
- Add audit logs for all stock changes.

### Phase 4: POS, loyalty, and KDS

- Implement server-validated cart pricing and POS checkout.
- Implement Cash and GCash payment records.
- Implement atomic sale, recipe deduction, inventory movement, and loyalty earning transaction.
- Implement real-time KDS subscription and valid status transitions.
- Build void/refund controls.

### Phase 5: dashboard, reports, and polish

- Replace all mock dashboard/report figures with database queries.
- Add sales/payment, inventory usage, expenses, top/least seller, and member history reports.
- Make dashboard and reports mobile-friendly.
- Add loading, empty, error, and permission-denied states.

### Phase 6: testing, import, and launch

- Import real menu, variants, recipes, ingredients, opening inventory, customers, and users.
- Test cashier and KDS on separate devices.
- Run role, stock, loyalty, void, and concurrent-checkout tests.
- Configure backups, deployment, and production environment variables.
- Train owner/cashier on stock-in, recipe maintenance, KDS, and end-of-day checks.

## 11. Testing strategy

### Database/RPC integration tests

The critical checkout, void, and refund rules are tested against a real disposable PostgreSQL/Supabase local database, not mocked Supabase client calls. Test setup applies the actual migrations, runs test data setup, calls the real RPCs, asserts database state, and tears down/reset the test database.

Required cases include:

- checkout writes order, items, addons, payment, loyalty, ingredient movements, and audit records together;
- intentional failure at a validation/stock/payment step leaves no partial records;
- repeated checkout request with the same idempotency key returns one order and does not duplicate points or deductions;
- parallel checkout attempts produce unique sequence-backed order numbers and correct locked stock balances;
- variants and inventory-consuming add-ons deduct exactly their own resolved recipe quantities;
- each saved `sale_usage` movement links to its originating order item, including addon ingredient usage;
- void of a `new` order reverses the exact original base-item, variant, and addon `sale_usage` movements;
- post-preparation refund does not restore stock unless the admin-attested restore option is selected;
- loyalty reversal, order reversal record, status history, contextual operation audit, and trigger row audits are all present;
- business-date assignment around the configured cutoff uses `Asia/Manila` consistently;
- idempotency cleanup deletes only eligible retry rows and never deletes/cascades permanent records;
- RLS denies direct browser-role table access and server authorization rejects cashier access to admin operations.

### Application tests

- Unit tests cover input validation, pricing display, unit conversion, and role-aware UI states.
- End-to-end tests cover login, stock-in, member enrollment, Cash sale, GCash sale, KDS update on a separate session, void/refund, and mobile owner-dashboard views.
- A manual pre-launch test uses two browser sessions to simulate the cashier POS and KDS on separate devices.

## 12. Acceptance criteria

The first release is ready only when all of these are true:

- Admin and cashier can log in using custom authentication; Supabase Auth is not used.
- Cashier can sell active products using Cash or GCash.
- POS requires valid variants/add-ons and calculates totals on the server.
- Cashier can attach or create a member before checkout.
- Product-based points are added once per completed paid sale and visible in member history.
- Variant and addon recipes deduct the correct ingredient quantities.
- A sale writes order, payment, loyalty, and inventory movement data atomically.
- Sale-usage inventory ledger rows preserve ingredient-by-order-item provenance for base items, variants, and add-ons.
- Checkout, void, and refund use a single PostgreSQL RPC transaction and idempotency key; repeat submission cannot create a duplicate order, points, or stock deduction.
- A pre-preparation void is the exact atomic inverse of checkout for payment/reporting, loyalty, and ingredients; a post-preparation refund never restores stock unless an admin explicitly confirms preparation did not begin.
- Each reversal persists whether inventory restoration was automatic for a new order, admin-attested despite a later KDS status, or intentionally not restored because preparation occurred.
- Every void, refund, waste, spoilage, and manual adjustment requires a reason and produces linked contextual and row-change audit evidence.
- Order numbers are generated by a database sequence and remain unique during concurrent checkouts.
- Restocking updates stock and weighted-average cost correctly.
- Waste/spoilage changes stock at the current weighted-average cost without recalculating that cost basis.
- Waste/spoilage/manual adjustment creates traceable movement and audit records.
- KDS receives a new order in real time from a separate browser/device.
- KDS enforces `new -> preparing -> ready -> completed`.
- Dashboard/report values come from real database data, not mock arrays.
- Daily inventory report shows ingredient opening, added, used, adjusted, closing, and peso cost used.
- Owner can securely access dashboard/reports on mobile browser.
- Daily reports and KDS retention use the configured business-day cutoff, not an uncontrolled device date.
- The business-day cutoff comes from one `business_settings` value through one database function used by all relevant writes and queries.
- The business-date function explicitly uses `Asia/Manila`; it does not depend on a server, browser, or database default timezone.
- GCash is labelled and handled as manually verified tender; no payment gateway verification is implied.
- POS does not finalize an offline sale silently and preserves an unsent cart with clear connection feedback.
- Cashier cannot access admin-only inventory cost, menu setup, reports, users, or settings.
- No privileged Supabase key, password hash, or session secret is exposed in client-side code.

## 13. Deferred enhancements

The schema intentionally leaves room for these later features:

- loyalty redemption as cash discount or free selected products;
- receipt printing and thermal printer integration;
- supplier records and purchase orders;
- multi-branch inventory and reporting;
- table management;
- online/delivery ordering;
- barcode support;
- staff shifts and cash reconciliation;
- stock counts and inventory variance reports;
- automated low-stock notifications;
- exports and accounting integrations.

## 14. Remaining implementation decisions

The following can be decided during implementation without changing the agreed first-release scope:

- whether insufficient stock blocks sales or warns the cashier;
- exact GCash reference capture requirement;
- product/menu import format and opening inventory count;
- order number format and receipt branding.
- tax mode: included-in-price vs. added-at-checkout. Must be decided before the checkout RPC, as it changes `tax_total`, `grand_total`, receipt display, and reporting formulas.
