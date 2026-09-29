-- Migration 00017: Cash Shift Hardening
-- 1. Snapshot columns on cash_shifts
-- 2. Expense paid_from_drawer column
-- 3. Row Level Security on cash_shifts and cash_drawer_movements
-- 4. Idempotency & safety checks on cash movements
-- 5. Safe handling for offline sync sales and non-drawer cash expenses

-- 1. Snapshot columns on cash_shifts
ALTER TABLE cash_shifts
  ADD COLUMN IF NOT EXISTS cash_sales numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS non_cash_sales numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_refunds numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_voids numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_expenses numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_in numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_out numeric(12,2) DEFAULT 0;

-- 2. Add paid_from_drawer to expenses
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS paid_from_drawer boolean NOT NULL DEFAULT false;

-- 3. Row Level Security
ALTER TABLE cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_drawer_movements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cash_shifts' AND policyname = 'Allow authenticated users read cash_shifts') THEN
    CREATE POLICY "Allow authenticated users read cash_shifts" ON cash_shifts FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cash_shifts' AND policyname = 'Allow service_role full access to cash_shifts') THEN
    CREATE POLICY "Allow service_role full access to cash_shifts" ON cash_shifts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cash_drawer_movements' AND policyname = 'Allow authenticated users read cash_drawer_movements') THEN
    CREATE POLICY "Allow authenticated users read cash_drawer_movements" ON cash_drawer_movements FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cash_drawer_movements' AND policyname = 'Allow service_role full access to cash_drawer_movements') THEN
    CREATE POLICY "Allow service_role full access to cash_drawer_movements" ON cash_drawer_movements FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Refined record_cash_payment_v1
-- Safe for offline replay without crashing sync
CREATE OR REPLACE FUNCTION record_cash_payment_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_shift_id uuid;
  v_order orders%ROWTYPE;
BEGIN
  IF NEW.method <> 'cash' THEN RETURN NEW; END IF;

  SELECT * INTO v_order FROM orders WHERE id = NEW.order_id;
  SELECT id INTO v_shift_id FROM cash_shifts WHERE status = 'open' FOR UPDATE;

  IF v_shift_id IS NULL THEN
    -- If this was an offline sync replay, do NOT crash the order
    IF v_order.status = 'completed' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Open a cash shift before recording a cash transaction';
  END IF;

  UPDATE payments SET cash_shift_id = v_shift_id WHERE id = NEW.id;
  INSERT INTO cash_drawer_movements (cash_shift_id, movement_type, direction, amount, reason, order_id, payment_id, recorded_by_user_id, business_date)
  VALUES (v_shift_id, 'cash_sale', 'in', NEW.amount, 'Cash sale', NEW.order_id, NEW.id, NEW.received_by_user_id, NEW.business_date);

  RETURN NEW;
END;
$$;

-- 5. Refined record_cash_expense_v1
-- Only deducts from drawer if paid_from_drawer is explicitly true
CREATE OR REPLACE FUNCTION record_cash_expense_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_shift_id uuid;
BEGIN
  IF NOT COALESCE(NEW.paid_from_drawer, false) OR COALESCE(NEW.payment_method, '') <> 'cash' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_shift_id FROM cash_shifts WHERE status = 'open' FOR UPDATE;
  IF v_shift_id IS NULL THEN
    RAISE EXCEPTION 'Cannot pay expense from drawer: No cash shift is currently open';
  END IF;

  UPDATE expenses SET cash_shift_id = v_shift_id WHERE id = NEW.id;
  INSERT INTO cash_drawer_movements (cash_shift_id, movement_type, direction, amount, reason, expense_id, recorded_by_user_id, business_date)
  VALUES (v_shift_id, 'cash_expense', 'out', NEW.amount, NEW.description, NEW.id, NEW.recorded_by_user_id, NEW.business_date);

  RETURN NEW;
END;
$$;

-- 6. Refined record_cash_reversal_v1
-- Does not crash if no shift is open during administrative adjustments
CREATE OR REPLACE FUNCTION record_cash_reversal_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_shift_id uuid; v_payment payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = NEW.payment_id;
  IF v_payment.method <> 'cash' THEN RETURN NEW; END IF;

  SELECT id INTO v_shift_id FROM cash_shifts WHERE status = 'open' FOR UPDATE;
  IF v_shift_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE payment_reversals SET cash_shift_id = v_shift_id WHERE id = NEW.id;
  INSERT INTO cash_drawer_movements (cash_shift_id, movement_type, direction, amount, reason, order_id, payment_id, payment_reversal_id, recorded_by_user_id, business_date)
  VALUES (v_shift_id, CASE WHEN NEW.reversal_type = 'void' THEN 'cash_void' ELSE 'cash_refund' END, 'out', NEW.amount,
    CASE WHEN NEW.reversal_type = 'void' THEN 'Cash void' ELSE 'Cash refund' END,
    v_payment.order_id, NEW.payment_id, NEW.id, NEW.processed_by_user_id, NEW.business_date);

  RETURN NEW;
END;
$$;

-- 7. Refined record_cash_movement_v1
-- Supports idempotency key and prevents negative drawer cash
DROP FUNCTION IF EXISTS public.record_cash_movement_v1(uuid, text, numeric, text);
CREATE OR REPLACE FUNCTION record_cash_movement_v1(
  p_actor_user_id uuid,
  p_direction text,
  p_amount numeric,
  p_reason text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_shift_id uuid;
  v_type text;
  v_expected numeric(12,2);
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_requests (id, operation_type, actor_user_id, status)
    VALUES (p_idempotency_key, 'cash_movement', p_actor_user_id, 'pending')
    ON CONFLICT (id) DO NOTHING;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'already_processed');
    END IF;
  END IF;

  IF p_direction NOT IN ('in', 'out') THEN RAISE EXCEPTION 'Invalid cash movement type'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;

  SELECT id INTO v_shift_id FROM cash_shifts WHERE status = 'open' FOR UPDATE;
  IF v_shift_id IS NULL THEN RAISE EXCEPTION 'No open cash shift'; END IF;

  IF p_direction = 'out' THEN
    SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
    INTO v_expected FROM cash_drawer_movements WHERE cash_shift_id = v_shift_id;
    IF p_amount > v_expected THEN
      RAISE EXCEPTION 'Cannot remove ₱%: Drawer only has ₱% in cash', round(p_amount, 2), round(v_expected, 2);
    END IF;
  END IF;

  v_type := CASE WHEN p_direction = 'in' THEN 'cash_in' ELSE 'cash_out' END;
  INSERT INTO cash_drawer_movements (cash_shift_id, movement_type, direction, amount, reason, recorded_by_user_id)
  VALUES (v_shift_id, v_type, p_direction, p_amount, trim(p_reason), p_actor_user_id);

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE idempotency_requests SET status = 'completed', completed_at = now() WHERE id = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object('status', 'recorded', 'cash_shift_id', v_shift_id);
END;
$$;

-- 8. Refined close_cash_shift_v1 with complete snapshots
CREATE OR REPLACE FUNCTION close_cash_shift_v1(
  p_actor_user_id uuid,
  p_counted_cash numeric,
  p_note text DEFAULT NULL,
  p_variance_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_shift cash_shifts%ROWTYPE;
  v_expected numeric(12,2);
  v_variance numeric(12,2);
  v_cash_sales numeric(12,2) := 0;
  v_non_cash_sales numeric(12,2) := 0;
  v_cash_refunds numeric(12,2) := 0;
  v_cash_voids numeric(12,2) := 0;
  v_cash_expenses numeric(12,2) := 0;
  v_cash_in numeric(12,2) := 0;
  v_cash_out numeric(12,2) := 0;
BEGIN
  IF p_counted_cash < 0 THEN RAISE EXCEPTION 'Counted cash cannot be negative'; END IF;
  SELECT * INTO v_shift FROM cash_shifts WHERE status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open cash shift'; END IF;

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0),
    COALESCE(SUM(CASE WHEN movement_type = 'cash_sale' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN movement_type = 'cash_refund' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN movement_type = 'cash_void' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN movement_type = 'cash_expense' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN movement_type = 'cash_in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN movement_type = 'cash_out' THEN amount ELSE 0 END), 0)
  INTO
    v_expected,
    v_cash_sales,
    v_cash_refunds,
    v_cash_voids,
    v_cash_expenses,
    v_cash_in,
    v_cash_out
  FROM cash_drawer_movements WHERE cash_shift_id = v_shift.id;

  SELECT COALESCE(SUM(grand_total), 0) INTO v_non_cash_sales
  FROM orders
  WHERE payment_method <> 'cash'
    AND payment_status = 'paid'
    AND created_at >= v_shift.opened_at;

  v_variance := round(p_counted_cash - v_expected, 2);
  IF v_variance <> 0 AND COALESCE(trim(p_variance_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required when counted cash differs from expected cash';
  END IF;

  UPDATE cash_shifts SET
    status = 'closed',
    closed_by_user_id = p_actor_user_id,
    closed_at = now(),
    counted_cash = p_counted_cash,
    expected_cash = v_expected,
    variance = v_variance,
    closing_note = NULLIF(trim(p_note), ''),
    variance_reason = NULLIF(trim(p_variance_reason), ''),
    cash_sales = v_cash_sales,
    non_cash_sales = v_non_cash_sales,
    cash_refunds = v_cash_refunds,
    cash_voids = v_cash_voids,
    cash_expenses = v_cash_expenses,
    cash_in = v_cash_in,
    cash_out = v_cash_out
  WHERE id = v_shift.id;

  RETURN jsonb_build_object(
    'status', 'closed',
    'expected_cash', v_expected,
    'counted_cash', p_counted_cash,
    'variance', v_variance,
    'cash_sales', v_cash_sales,
    'non_cash_sales', v_non_cash_sales,
    'cash_in', v_cash_in,
    'cash_out', v_cash_out,
    'cash_expenses', v_cash_expenses,
    'cash_refunds', v_cash_refunds + v_cash_voids
  );
END;
$$;

-- 9. Allow payment reversals to reference payment_id without violating uniqueness
ALTER TABLE cash_drawer_movements DROP CONSTRAINT IF EXISTS cash_drawer_movements_payment_id_key;
DROP INDEX IF EXISTS cash_drawer_movements_unique_sale_payment;
CREATE UNIQUE INDEX IF NOT EXISTS cash_drawer_movements_unique_sale_payment
  ON cash_drawer_movements(payment_id)
  WHERE movement_type = 'cash_sale';

