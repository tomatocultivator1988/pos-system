-- Seed data — run AFTER 00002_fixes.sql truncate + unique indexes
-- All UUIDs generated with gen_random_uuid() for clean references
--
-- SECURITY WARNING: This ships default credentials (admin/admin123, cashier1/1234).
-- Do NOT run this against a production database without clearing the sessions
-- table and CHANGING the passwords immediately after (see README / phase 3 hardening).
-- Prefer running it only against a dev/staging schema. To force a password change
-- on first login in production, update the rows' password_hash after seeding.

-- ============================================================
-- 1. ADMIN + CASHIER
-- ============================================================
INSERT INTO users (name, username, password_hash, role, is_active)
VALUES ('Admin', 'admin', '$2b$12$T/7IrnUp2D9zSBTr5tRQn.yzNk2DFS5GbkgCNnsi3J4u.OxqtCac.', 'admin', true);
-- password: admin123

INSERT INTO users (name, username, password_hash, role, is_active)
VALUES ('Cashier Juan', 'cashier1', '$2b$12$1qYHS/78yNsS95SBx1Ks..ceVztoEgCEbnlCpJEO1vlN88uXU8k3u', 'cashier', true);
-- password: 1234

-- ============================================================
-- 2. BUSINESS SETTINGS
-- ============================================================
INSERT INTO business_settings (business_name, timezone, currency_code, business_day_cutoff_time)
VALUES ('Café POS', 'Asia/Manila', 'PHP', '00:00');

-- ============================================================
-- 3. CATEGORIES
-- ============================================================
INSERT INTO menu_categories (name, sort_order) VALUES ('Coffee', 1);
INSERT INTO menu_categories (name, sort_order) VALUES ('Pastries', 2);

-- ============================================================
-- 4. MENU ITEMS + VARIANTS
-- ============================================================
-- Latte (Coffee category)
WITH cat AS (SELECT id FROM menu_categories WHERE name = 'Coffee' LIMIT 1),
latte AS (
  INSERT INTO menu_items (category_id, name, base_price, loyalty_points_earned, send_to_kds, sort_order)
  SELECT cat.id, 'Latte', 150, 5, true, 1 FROM cat
  RETURNING id
)
INSERT INTO menu_item_variants (menu_item_id, name, price_mode, price_adjustment, is_default) 
SELECT latte.id, v.name, v.mode, v.adj, v.def FROM latte, (VALUES 
  ('Small', 'adjustment', 0, true),
  ('Large', 'adjustment', 50, false)
) AS v(name, mode, adj, def);

-- Americano (Coffee category)
WITH cat AS (SELECT id FROM menu_categories WHERE name = 'Coffee' LIMIT 1),
am AS (
  INSERT INTO menu_items (category_id, name, base_price, loyalty_points_earned, send_to_kds, sort_order)
  SELECT cat.id, 'Americano', 120, 3, true, 2 FROM cat
  RETURNING id
)
INSERT INTO menu_item_variants (menu_item_id, name, price_mode, price_override, is_default)
SELECT am.id, 'Regular', 'override', 120, true FROM am;

-- Croissant (Pastries category)
WITH cat AS (SELECT id FROM menu_categories WHERE name = 'Pastries' LIMIT 1)
INSERT INTO menu_items (category_id, name, base_price, loyalty_points_earned, send_to_kds, sort_order)
SELECT cat.id, 'Croissant', 80, 2, false, 1 FROM cat;

-- ============================================================
-- 5. INGREDIENTS
-- ============================================================
INSERT INTO ingredients (name, base_unit, quantity_on_hand, reorder_level, weighted_average_unit_cost)
VALUES 
  ('Coffee Beans', 'g', 5000, 1000, 0.50),
  ('Milk', 'ml', 10000, 2000, 0.03);

-- ============================================================
-- 6. RECIPES (base item level)
-- ============================================================
WITH latte_rec AS (SELECT id FROM menu_items WHERE name = 'Latte' LIMIT 1),
     am_rec AS (SELECT id FROM menu_items WHERE name = 'Americano' LIMIT 1),
     ing1 AS (SELECT id FROM ingredients WHERE name = 'Coffee Beans' LIMIT 1),
     ing2 AS (SELECT id FROM ingredients WHERE name = 'Milk' LIMIT 1)
INSERT INTO recipe_lines (menu_item_id, ingredient_id, quantity_required)
SELECT latte_rec.id, ing1.id, 20 FROM latte_rec, ing1
UNION ALL SELECT latte_rec.id, ing2.id, 200 FROM latte_rec, ing2
UNION ALL SELECT am_rec.id, ing1.id, 18 FROM am_rec, ing1;

-- ============================================================
-- 7. CUSTOMER
-- ============================================================
INSERT INTO customers (member_number, name, mobile_number, loyalty_points_balance)
VALUES ('MEM-0001', 'Maria Santos', '09171234567', 0);

-- ============================================================
-- 8. EXPENSE CATEGORIES
-- ============================================================
INSERT INTO expense_categories (name, sort_order) VALUES ('Utilities', 1);
INSERT INTO expense_categories (name, sort_order) VALUES ('Supplies', 2);
