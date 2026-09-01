-- Café POS Schema Migration
-- All monetary values use numeric(12,2), never floating point.
-- All primary keys use UUIDs.
-- Timestamps are stored in UTC.

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- BUSINESS-DATE FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION get_business_date(p_ts timestamptz)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tz text;
  v_cutoff time;
BEGIN
  SELECT COALESCE(timezone, 'Asia/Manila'), COALESCE(business_day_cutoff_time, '00:00'::time)
  INTO v_tz, v_cutoff
  FROM business_settings LIMIT 1;
  IF (p_ts AT TIME ZONE v_tz)::time < v_cutoff THEN
    RETURN (p_ts AT TIME ZONE v_tz)::date - 1;
  ELSE
    RETURN (p_ts AT TIME ZONE v_tz)::date;
  END IF;
END;
$$;

-- ============================================================
-- 5.1 BUSINESS AND USERS
-- ============================================================

CREATE TABLE business_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  currency_code text NOT NULL DEFAULT 'PHP',
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  service_charge_rate numeric(5,2) NOT NULL DEFAULT 0,
  business_day_cutoff_time time NOT NULL DEFAULT '00:00',
  default_low_stock_behavior text NOT NULL DEFAULT 'warn' CHECK (default_low_stock_behavior IN ('warn', 'block')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce single row
CREATE UNIQUE INDEX idx_single_business_settings ON business_settings((true));

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  username text NOT NULL UNIQUE,
  email text UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'cashier', 'kds')),
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE kds_devices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_name text NOT NULL,
  kds_user_id uuid NOT NULL REFERENCES users(id),
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kds_device_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kds_device_id uuid NOT NULL REFERENCES kds_devices(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  label text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_active_kds_token ON kds_device_tokens(kds_device_id) WHERE revoked_at IS NULL;

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id uuid REFERENCES users(id),
  operation_id uuid,
  request_id text,
  source text NOT NULL CHECK (source IN ('trigger', 'operation')),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_operation ON audit_logs(operation_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ============================================================
-- 5.2 MENU, VARIANTS, ADD-ONS, AND RECIPES
-- ============================================================

CREATE TABLE menu_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE menu_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id uuid NOT NULL REFERENCES menu_categories(id),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  base_price numeric(12,2) NOT NULL CHECK (base_price >= 0),
  loyalty_points_earned numeric(10,0) NOT NULL DEFAULT 0 CHECK (loyalty_points_earned >= 0),
  is_active boolean NOT NULL DEFAULT true,
  send_to_kds boolean NOT NULL DEFAULT true,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_items_category ON menu_items(category_id);

CREATE TABLE menu_item_variants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_mode text NOT NULL CHECK (price_mode IN ('override', 'adjustment')),
  price_override numeric(12,2) CHECK (price_override >= 0),
  price_adjustment numeric(12,2),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_variants_menu_item ON menu_item_variants(menu_item_id);

CREATE TABLE addon_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_selections integer NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
  max_selections integer NOT NULL DEFAULT 0 CHECK (max_selections >= 0),
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_addon_groups_menu_item ON addon_groups(menu_item_id);

CREATE TABLE addons (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  addon_group_id uuid NOT NULL REFERENCES addon_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_adjustment numeric(12,2) NOT NULL DEFAULT 0 CHECK (price_adjustment >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_addons_group ON addons(addon_group_id);

CREATE TABLE ingredients (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  base_unit text NOT NULL CHECK (base_unit IN ('g', 'kg', 'ml', 'L', 'pc', 'pack', 'bottle')),
  quantity_on_hand numeric(12,4) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_level numeric(12,4) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  weighted_average_unit_cost numeric(12,4) NOT NULL DEFAULT 0 CHECK (weighted_average_unit_cost >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recipe_lines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  menu_item_variant_id uuid REFERENCES menu_item_variants(id) ON DELETE CASCADE,
  addon_id uuid REFERENCES addons(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  quantity_required numeric(12,4) NOT NULL CHECK (quantity_required > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_owner_check CHECK (
    (CASE WHEN menu_item_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN menu_item_variant_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN addon_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX idx_recipe_lines_menu_item ON recipe_lines(menu_item_id);
CREATE INDEX idx_recipe_lines_variant ON recipe_lines(menu_item_variant_id);
CREATE INDEX idx_recipe_lines_addon ON recipe_lines(addon_id);
CREATE INDEX idx_recipe_lines_ingredient ON recipe_lines(ingredient_id);

-- ============================================================
-- 5.3 INVENTORY AND COSTING
-- ============================================================

CREATE TABLE stock_receipts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by_user_id uuid NOT NULL REFERENCES users(id),
  reference_number text,
  notes text,
  business_date date NOT NULL DEFAULT get_business_date(now()),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_receipt_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_receipt_id uuid NOT NULL REFERENCES stock_receipts(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  quantity_received numeric(12,4) NOT NULL CHECK (quantity_received > 0),
  unit_cost numeric(12,4) NOT NULL CHECK (unit_cost >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX idx_stock_receipt_items_ingredient ON stock_receipt_items(ingredient_id);
CREATE INDEX idx_stock_receipt_items_receipt ON stock_receipt_items(stock_receipt_id);

CREATE TABLE inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('waste', 'spoilage', 'manual_count', 'correction', 'opening_balance')),
  quantity_delta numeric(12,4) NOT NULL,
  reason text NOT NULL,
  recorded_by_user_id uuid NOT NULL REFERENCES users(id),
  approved_by_user_id uuid REFERENCES users(id),
  business_date date NOT NULL DEFAULT get_business_date(now()),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_adjustments_ingredient ON inventory_adjustments(ingredient_id);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  movement_type text NOT NULL CHECK (movement_type IN ('opening_balance', 'restock', 'sale_usage', 'waste', 'spoilage', 'manual_adjustment', 'sale_reversal')),
  quantity_in numeric(12,4) NOT NULL DEFAULT 0 CHECK (quantity_in >= 0),
  quantity_out numeric(12,4) NOT NULL DEFAULT 0 CHECK (quantity_out >= 0),
  unit_cost_at_movement numeric(12,4) NOT NULL DEFAULT 0,
  total_cost numeric(12,2) NOT NULL DEFAULT 0,
  quantity_balance_after numeric(12,4) NOT NULL,
  average_unit_cost_after numeric(12,4) NOT NULL,
  order_item_id uuid,
  reference_type text,
  reference_id uuid,
  notes text,
  actor_user_id uuid,
  business_date date NOT NULL DEFAULT get_business_date(now()),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_movements_ingredient ON inventory_movements(ingredient_id, created_at);
CREATE INDEX idx_inventory_movements_date ON inventory_movements(business_date);

-- ============================================================
-- 5.4 CUSTOMERS AND LOYALTY
-- ============================================================

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_number text NOT NULL UNIQUE,
  name text NOT NULL,
  mobile_number text UNIQUE,
  email text,
  loyalty_points_balance numeric(10,0) NOT NULL DEFAULT 0 CHECK (loyalty_points_balance >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_mobile ON customers(mobile_number);
CREATE INDEX idx_customers_member_number ON customers(member_number);

CREATE TABLE loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  order_id uuid,
  transaction_type text NOT NULL CHECK (transaction_type IN ('earn', 'redeem', 'adjust', 'reversal')),
  points_delta numeric(10,0) NOT NULL,
  balance_after numeric(10,0) NOT NULL,
  reason text,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_transactions_customer ON loyalty_transactions(customer_id, created_at);

-- ============================================================
-- 5.5 ORDERS, PAYMENTS, AND KDS
-- ============================================================

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number text NOT NULL UNIQUE,
  order_sequence_number integer NOT NULL,
  cashier_user_id uuid NOT NULL REFERENCES users(id),
  customer_id uuid REFERENCES customers(id),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'preparing', 'ready', 'completed', 'voided')),
  payment_status text NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'voided', 'refunded')),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'gcash')),
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total numeric(12,2) NOT NULL CHECK (grand_total >= 0),
  loyalty_points_earned numeric(10,0) NOT NULL DEFAULT 0,
  notes text,
  business_date date NOT NULL DEFAULT get_business_date(now()),
  created_at timestamptz NOT NULL DEFAULT now(),
  preparing_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz
);

CREATE INDEX idx_orders_business_date ON orders(business_date);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment ON orders(payment_method, created_at);
CREATE INDEX idx_orders_customer ON orders(customer_id);

CREATE SEQUENCE order_sequence_number_seq START 1;

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id),
  menu_item_variant_id uuid REFERENCES menu_item_variants(id),
  item_name text NOT NULL,
  variant_name text,
  unit_price numeric(12,2) NOT NULL,
  loyalty_points_per_unit numeric(10,0) NOT NULL DEFAULT 0,
  quantity numeric(10,0) NOT NULL CHECK (quantity > 0),
  line_total numeric(12,2) NOT NULL,
  notes text
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_menu_item ON order_items(menu_item_id);

CREATE TABLE order_item_addons (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  addon_id uuid NOT NULL REFERENCES addons(id),
  addon_name text NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  quantity numeric(10,0) NOT NULL CHECK (quantity > 0),
  line_total numeric(12,2) NOT NULL
);

CREATE INDEX idx_order_item_addons_item ON order_item_addons(order_item_id);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id),
  method text NOT NULL CHECK (method IN ('cash', 'gcash')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  gcash_reference text,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'voided', 'refunded')),
  received_by_user_id uuid NOT NULL REFERENCES users(id),
  paid_at timestamptz NOT NULL DEFAULT now(),
  business_date date NOT NULL DEFAULT get_business_date(now()),
  voided_at timestamptz,
  refunded_at timestamptz
);

CREATE INDEX idx_payments_method ON payments(method, business_date);

-- ============================================================
-- IDEMPOTENCY & ORDER REVERSALS
-- ============================================================

CREATE TABLE idempotency_requests (
  id uuid PRIMARY KEY,
  operation_type text NOT NULL CHECK (operation_type IN ('checkout', 'void', 'refund')),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  order_id uuid REFERENCES orders(id),
  request_hash text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days'
);

CREATE INDEX idx_idempotency_expires ON idempotency_requests(expires_at);

CREATE TABLE order_reversals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id),
  operation_id uuid,
  reversal_type text NOT NULL CHECK (reversal_type IN ('void', 'refund')),
  reason text NOT NULL,
  inventory_restoration_basis text NOT NULL CHECK (inventory_restoration_basis IN ('automatic_new_not_prepared', 'admin_attested_not_prepared', 'not_restored_prepared')),
  ingredient_stock_restored boolean NOT NULL DEFAULT false,
  authorized_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_reversals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  order_reversal_id uuid NOT NULL REFERENCES order_reversals(id),
  reversal_type text NOT NULL CHECK (reversal_type IN ('void', 'refund')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  business_date date NOT NULL DEFAULT get_business_date(now()),
  processed_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_reversals_date ON payment_reversals(business_date, reversal_type);

CREATE TABLE order_status_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id),
  from_status text NOT NULL,
  to_status text NOT NULL,
  changed_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_history_order ON order_status_history(order_id);

CREATE TABLE kds_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id),
  event_type text NOT NULL CHECK (event_type IN ('order_created', 'status_changed')),
  event_version integer NOT NULL DEFAULT 1,
  business_date date NOT NULL DEFAULT get_business_date(now()),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kds_events_date ON kds_events(business_date, created_at);

-- ============================================================
-- 5.6 EXPENSES
-- ============================================================

CREATE TABLE expense_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_category_id uuid NOT NULL REFERENCES expense_categories(id),
  expense_date date NOT NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text,
  recorded_by_user_id uuid NOT NULL REFERENCES users(id),
  reference_number text,
  notes text,
  business_date date NOT NULL DEFAULT get_business_date(now()),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_date ON expenses(business_date);

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kds_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE kds_device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE addon_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE kds_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_reversals ENABLE ROW LEVEL SECURITY;

-- Deny all by default for anon and authenticated roles
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM anon, authenticated;

-- Grant KDS read-only on kds_events for realtime subscription
CREATE POLICY kds_events_select ON kds_events FOR SELECT USING (
  current_setting('role', true) = 'kds_device'
);

-- ============================================================
-- AUDIT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  op_id uuid;
  actor_id uuid;
BEGIN
  op_id := COALESCE(nullif(current_setting('app.operation_id', true), '')::uuid, uuid_generate_v4());
  actor_id := nullif(current_setting('app.actor_user_id', true), '')::uuid;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (actor_user_id, operation_id, source, action, entity_type, entity_id, new_data)
    VALUES (actor_id, op_id, 'trigger', 'INSERT', TG_TABLE_NAME, NEW.id, row_to_json(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (actor_user_id, operation_id, source, action, entity_type, entity_id, old_data, new_data)
    VALUES (actor_id, op_id, 'trigger', 'UPDATE', TG_TABLE_NAME, NEW.id, row_to_json(OLD), row_to_json(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (actor_user_id, operation_id, source, action, entity_type, entity_id, old_data)
    VALUES (actor_id, op_id, 'trigger', 'DELETE', TG_TABLE_NAME, OLD.id, row_to_json(OLD));
    RETURN OLD;
  END IF;
END;
$$;

-- Apply audit triggers to key tables
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_menu_items AFTER INSERT OR UPDATE OR DELETE ON menu_items FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_menu_item_variants AFTER INSERT OR UPDATE OR DELETE ON menu_item_variants FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_addons AFTER INSERT OR UPDATE OR DELETE ON addons FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_recipe_lines AFTER INSERT OR UPDATE OR DELETE ON recipe_lines FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_ingredients AFTER INSERT OR UPDATE OR DELETE ON ingredients FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_stock_receipts AFTER INSERT OR UPDATE OR DELETE ON stock_receipts FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_stock_receipt_items AFTER INSERT OR UPDATE OR DELETE ON stock_receipt_items FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_inventory_adjustments AFTER INSERT OR UPDATE OR DELETE ON inventory_adjustments FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_inventory_movements AFTER INSERT OR UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_order_items AFTER INSERT OR UPDATE OR DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_payment_reversals AFTER INSERT OR UPDATE OR DELETE ON payment_reversals FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_order_reversals AFTER INSERT OR UPDATE OR DELETE ON order_reversals FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_loyalty_transactions AFTER INSERT OR UPDATE OR DELETE ON loyalty_transactions FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ============================================================
-- CHECKOUT RPC (complete_sale_v1)
-- ============================================================
CREATE OR REPLACE FUNCTION complete_sale_v1(
  p_payload jsonb,
  p_actor_user_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing jsonb;
  v_order_id uuid;
  v_order_number text;
  v_seq integer;
  v_biz_date date;
  v_customer_id uuid;
  v_item jsonb;
  v_variant jsonb;
  v_variant_id uuid;
  v_addon jsonb;
  v_menu_item record;
  v_variant_record record;
  v_addon_record record;
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_grand_total numeric(12,2);
  v_order_item_id uuid;
  v_loyalty_points numeric(10,0);
  v_recipe record;
  v_has_variant_recipe boolean;
  v_tax_rate numeric(5,2);
  v_tax_total numeric(12,2);
  v_status text;
  v_group record;
  v_count integer;
BEGIN
  -- Atomic idempotency claim
  INSERT INTO idempotency_requests (id, operation_type, actor_user_id, status)
  VALUES (p_idempotency_key, 'checkout', p_actor_user_id, 'pending')
  ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT status, order_id INTO v_status, v_order_id
    FROM idempotency_requests WHERE id = p_idempotency_key;
    IF v_status = 'completed' AND v_order_id IS NOT NULL THEN
      SELECT order_number, subtotal, tax_total, grand_total
      INTO v_order_number, v_subtotal, v_tax_total, v_grand_total
      FROM orders WHERE id = v_order_id;
      RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'subtotal', v_subtotal, 'tax_total', v_tax_total, 'grand_total', v_grand_total, 'status', 'already_completed');
    END IF;
    RAISE EXCEPTION 'Concurrent checkout in progress for idempotency key %', p_idempotency_key;
  END IF;

  v_customer_id := (p_payload->>'customer_id')::uuid;

  -- Lock ingredient and customer rows
  PERFORM id FROM ingredients ORDER BY id FOR UPDATE;
  IF v_customer_id IS NOT NULL THEN
    PERFORM id FROM customers WHERE id = v_customer_id FOR UPDATE;
  END IF;
  v_biz_date := get_business_date(now());

  -- Generate order number
  v_seq := nextval('order_sequence_number_seq');
  v_order_number := 'ORD-' || to_char(v_biz_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 6, '0');

  -- Create order
  INSERT INTO orders (order_number, order_sequence_number, cashier_user_id, customer_id, status, payment_status, payment_method, subtotal, discount_total, tax_total, grand_total, loyalty_points_earned, business_date)
  VALUES (v_order_number, v_seq, p_actor_user_id, v_customer_id, 'new', 'paid', p_payload->>'payment_method', 0, 0, 0, 0, 0, v_biz_date)
  RETURNING id INTO v_order_id;

  -- Process items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
  LOOP
    SELECT * INTO v_menu_item FROM menu_items WHERE id = (v_item->>'menu_item_id')::uuid AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid menu item %', v_item->>'menu_item_id'; END IF;

    v_unit_price := v_menu_item.base_price;
    v_variant_id := (v_item->>'menu_item_variant_id')::uuid;

    IF v_variant_id IS NOT NULL THEN
      SELECT * INTO v_variant_record FROM menu_item_variants WHERE id = v_variant_id AND is_active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid variant'; END IF;
      IF v_variant_record.price_mode = 'override' THEN
        v_unit_price := v_variant_record.price_override;
      ELSE
        v_unit_price := v_unit_price + COALESCE(v_variant_record.price_adjustment, 0);
      END IF;
    END IF;

    v_line_total := v_unit_price * (v_item->>'quantity')::numeric;
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO order_items (order_id, menu_item_id, menu_item_variant_id, item_name, variant_name, unit_price, loyalty_points_per_unit, quantity, line_total, notes)
    VALUES (v_order_id, v_menu_item.id, v_variant_id, v_menu_item.name, (SELECT name FROM menu_item_variants WHERE id = v_variant_id), v_unit_price, v_menu_item.loyalty_points_earned, (v_item->>'quantity')::numeric, v_line_total, v_item->>'notes')
    RETURNING id INTO v_order_item_id;

    -- Deduct ingredients: use variant recipe if exists, otherwise base item recipe
    SELECT EXISTS(SELECT 1 FROM recipe_lines WHERE menu_item_variant_id = v_variant_id) INTO v_has_variant_recipe;

    FOR v_recipe IN
      SELECT rl.*, i.quantity_on_hand AS current_stock
      FROM recipe_lines rl
      JOIN ingredients i ON i.id = rl.ingredient_id
      WHERE CASE WHEN v_has_variant_recipe AND v_variant_id IS NOT NULL
        THEN rl.menu_item_variant_id = v_variant_id
        ELSE rl.menu_item_id = v_menu_item.id AND rl.menu_item_variant_id IS NULL
      END
    LOOP
      IF v_recipe.current_stock < v_recipe.quantity_required * (v_item->>'quantity')::numeric THEN
        RAISE EXCEPTION 'Insufficient stock for ingredient %', v_recipe.ingredient_id;
      END IF;

      INSERT INTO inventory_movements (ingredient_id, movement_type, quantity_out, unit_cost_at_movement, total_cost, quantity_balance_after, average_unit_cost_after, order_item_id, reference_type, reference_id, actor_user_id, business_date)
      SELECT v_recipe.ingredient_id, 'sale_usage', v_recipe.quantity_required * (v_item->>'quantity')::numeric, weighted_average_unit_cost, v_recipe.quantity_required * (v_item->>'quantity')::numeric * weighted_average_unit_cost, quantity_on_hand - v_recipe.quantity_required * (v_item->>'quantity')::numeric, weighted_average_unit_cost, v_order_item_id, 'order_item', v_order_item_id, p_actor_user_id, v_biz_date
      FROM ingredients WHERE id = v_recipe.ingredient_id;

      UPDATE ingredients SET quantity_on_hand = quantity_on_hand - v_recipe.quantity_required * (v_item->>'quantity')::numeric
      WHERE id = v_recipe.ingredient_id;
    END LOOP;

    -- Process addons
    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons', '[]'::jsonb))
    LOOP
      SELECT * INTO v_addon_record FROM addons WHERE id = (v_addon->>'addon_id')::uuid AND is_active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid addon %', v_addon->>'addon_id'; END IF;

      INSERT INTO order_item_addons (order_item_id, addon_id, addon_name, unit_price, quantity, line_total)
      VALUES (v_order_item_id, v_addon_record.id, v_addon_record.name, v_addon_record.price_adjustment, (v_addon->>'quantity')::numeric, v_addon_record.price_adjustment * (v_addon->>'quantity')::numeric);

      -- Deduct addon ingredients
      FOR v_recipe IN
        SELECT rl.*, i.quantity_on_hand AS current_stock
        FROM recipe_lines rl
        JOIN ingredients i ON i.id = rl.ingredient_id
        WHERE rl.addon_id = v_addon_record.id
      LOOP
        IF v_recipe.current_stock < v_recipe.quantity_required * (v_addon->>'quantity')::numeric THEN
          RAISE EXCEPTION 'Insufficient stock for ingredient % (addon %)', v_recipe.ingredient_id, v_addon_record.name;
        END IF;

        INSERT INTO inventory_movements (ingredient_id, movement_type, quantity_out, unit_cost_at_movement, total_cost, quantity_balance_after, average_unit_cost_after, order_item_id, reference_type, reference_id, actor_user_id, business_date)
        SELECT v_recipe.ingredient_id, 'sale_usage', v_recipe.quantity_required * (v_addon->>'quantity')::numeric, i.weighted_average_unit_cost, v_recipe.quantity_required * (v_addon->>'quantity')::numeric * i.weighted_average_unit_cost, i.quantity_on_hand - v_recipe.quantity_required * (v_addon->>'quantity')::numeric, i.weighted_average_unit_cost, v_order_item_id, 'order_item_addon', v_order_item_id, p_actor_user_id, v_biz_date
        FROM ingredients i WHERE i.id = v_recipe.ingredient_id;

        UPDATE ingredients SET quantity_on_hand = quantity_on_hand - v_recipe.quantity_required * (v_addon->>'quantity')::numeric
        WHERE id = v_recipe.ingredient_id;
      END LOOP;
    END LOOP;

    -- Validate addon group constraints
    FOR v_group IN SELECT ag.* FROM addon_groups ag WHERE ag.menu_item_id = v_menu_item.id AND ag.is_active = true
    LOOP
      SELECT COUNT(*) INTO v_count FROM jsonb_array_elements(COALESCE(v_item->'addons', '[]'::jsonb)) a(item)
      JOIN addons ad ON ad.id = (a.item->>'addon_id')::uuid
      WHERE ad.addon_group_id = v_group.id;

      IF v_group.is_required AND v_count = 0 THEN
        RAISE EXCEPTION 'Required addon group "%" has no selections', v_group.name;
      END IF;
      IF v_count < v_group.min_selections THEN
        RAISE EXCEPTION 'Addon group "%" requires at least % selection(s), got %', v_group.name, v_group.min_selections, v_count;
      END IF;
      IF v_group.max_selections > 0 AND v_count > v_group.max_selections THEN
        RAISE EXCEPTION 'Addon group "%" allows at most % selection(s), got %', v_group.name, v_group.max_selections, v_count;
      END IF;
    END LOOP;
  END LOOP;

  -- Calculate tax and totals
  SELECT COALESCE(tax_rate, 0) INTO v_tax_rate FROM business_settings;
  v_tax_total := round(v_subtotal * v_tax_rate / 100, 2);
  v_grand_total := v_subtotal + v_tax_total;
  UPDATE orders SET subtotal = v_subtotal, tax_total = v_tax_total, grand_total = v_grand_total WHERE id = v_order_id;

  -- Payment
  INSERT INTO payments (order_id, method, amount, gcash_reference, received_by_user_id, business_date)
  VALUES (v_order_id, p_payload->>'payment_method', v_grand_total, p_payload->>'gcash_reference', p_actor_user_id, v_biz_date);

  -- Loyalty points if customer
  IF v_customer_id IS NOT NULL THEN
    UPDATE orders SET loyalty_points_earned = (
      SELECT COALESCE(SUM(oi.loyalty_points_per_unit * oi.quantity), 0) FROM order_items oi WHERE oi.order_id = v_order_id
    ) WHERE id = v_order_id RETURNING loyalty_points_earned INTO v_loyalty_points;

    IF v_loyalty_points > 0 THEN
      UPDATE customers SET loyalty_points_balance = loyalty_points_balance + v_loyalty_points WHERE id = v_customer_id;
      INSERT INTO loyalty_transactions (customer_id, order_id, transaction_type, points_delta, balance_after, actor_user_id)
      SELECT v_customer_id, v_order_id, 'earn', v_loyalty_points, loyalty_points_balance, p_actor_user_id FROM customers WHERE id = v_customer_id;
    END IF;
  END IF;

  -- Status history and KDS event
  INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id) VALUES (v_order_id, 'new', 'new', p_actor_user_id);
  INSERT INTO kds_events (order_id, event_type) VALUES (v_order_id, 'order_created');

  -- Mark idempotency completed
  UPDATE idempotency_requests SET status = 'completed', order_id = v_order_id, completed_at = now() WHERE id = p_idempotency_key;

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'subtotal', v_subtotal, 'tax_total', v_tax_total, 'grand_total', v_grand_total, 'loyalty_points_earned', COALESCE(v_loyalty_points, 0));
END;
$$;

-- ============================================================
-- VOID ORDER RPC (void_order_v1)
-- ============================================================
CREATE OR REPLACE FUNCTION void_order_v1(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_payment record;
  v_order_reversal_id uuid;
  v_order_id uuid;
  v_status text;
BEGIN
  -- Atomic idempotency claim
  INSERT INTO idempotency_requests (id, operation_type, actor_user_id, status)
  VALUES (p_idempotency_key, 'void', p_actor_user_id, 'pending')
  ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT status, order_id INTO v_status, v_order_id
    FROM idempotency_requests WHERE id = p_idempotency_key;
    IF v_status = 'completed' THEN
      RETURN jsonb_build_object('status', 'already_voided', 'order_id', v_order_id);
    END IF;
    RAISE EXCEPTION 'Concurrent void in progress for idempotency key %', p_idempotency_key;
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status NOT IN ('new', 'preparing') THEN RAISE EXCEPTION 'Cannot void order in status %', v_order.status; END IF;

  SELECT * INTO v_payment FROM payments WHERE order_id = p_order_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'No payment found for order %', p_order_id; END IF;

  -- Create order reversal record FIRST (needed for payment_reversal FK)
  INSERT INTO order_reversals (order_id, operation_id, reversal_type, reason, inventory_restoration_basis, ingredient_stock_restored, authorized_by_user_id)
  VALUES (p_order_id, p_idempotency_key, 'void', p_reason,
    CASE WHEN v_order.status = 'new' THEN 'automatic_new_not_prepared' ELSE 'not_restored_prepared' END,
    v_order.status = 'new', p_actor_user_id)
  RETURNING id INTO v_order_reversal_id;

  -- Reverse payment
  INSERT INTO payment_reversals (payment_id, order_reversal_id, reversal_type, amount, business_date, processed_by_user_id)
  VALUES (v_payment.id, v_order_reversal_id, 'void', v_payment.amount, get_business_date(now()), p_actor_user_id);

  UPDATE payments SET status = 'voided', voided_at = now() WHERE id = v_payment.id;

  -- Reverse inventory if 'new'
  IF v_order.status = 'new' THEN
    INSERT INTO inventory_movements (ingredient_id, movement_type, quantity_in, unit_cost_at_movement, total_cost, quantity_balance_after, average_unit_cost_after, reference_type, reference_id, actor_user_id, business_date)
    SELECT im.ingredient_id, 'sale_reversal', im.quantity_out, im.unit_cost_at_movement, im.total_cost, i.quantity_on_hand + im.quantity_out, i.weighted_average_unit_cost, 'order_reversal', p_order_id, p_actor_user_id, get_business_date(now())
    FROM inventory_movements im
    JOIN ingredients i ON i.id = im.ingredient_id
    WHERE im.reference_type IN ('order_item', 'order_item_addon') AND im.reference_id IN (SELECT id FROM order_items WHERE order_id = p_order_id);

    UPDATE ingredients SET quantity_on_hand = quantity_on_hand + COALESCE((
      SELECT SUM(im.quantity_out)
      FROM inventory_movements im
      WHERE im.ingredient_id = ingredients.id
      AND im.reference_type IN ('order_item', 'order_item_addon')
      AND im.reference_id IN (SELECT id FROM order_items WHERE order_id = p_order_id)
    ), 0)
    WHERE id IN (
      SELECT im.ingredient_id
      FROM inventory_movements im
      WHERE im.reference_type IN ('order_item', 'order_item_addon')
      AND im.reference_id IN (SELECT id FROM order_items WHERE order_id = p_order_id)
    );
  END IF;

  -- Reverse loyalty points
  IF v_order.customer_id IS NOT NULL AND v_order.loyalty_points_earned > 0 THEN
    UPDATE customers SET loyalty_points_balance = GREATEST(0, loyalty_points_balance - v_order.loyalty_points_earned)
    WHERE id = v_order.customer_id;
  END IF;

  -- Update order
  UPDATE orders SET status = 'voided', payment_status = 'voided', voided_at = now() WHERE id = p_order_id;

  -- History
  INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id) VALUES (p_order_id, v_order.status, 'voided', p_actor_user_id);

  UPDATE idempotency_requests SET status = 'completed', order_id = p_order_id, completed_at = now() WHERE id = p_idempotency_key;

  RETURN jsonb_build_object('status', 'voided', 'order_id', p_order_id);
END;
$$;
