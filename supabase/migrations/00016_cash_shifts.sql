-- One shared cash drawer. Cash movements are append-only and created with
-- the sale, expense, void, or refund that caused them.

CREATE TABLE cash_shifts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by_user_id uuid NOT NULL REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_cash numeric(12,2) NOT NULL CHECK (opening_cash >= 0),
  opening_note text,
  closed_by_user_id uuid REFERENCES users(id),
  closed_at timestamptz,
  counted_cash numeric(12,2) CHECK (counted_cash >= 0),
  expected_cash numeric(12,2),
  variance numeric(12,2),
  closing_note text,
  variance_reason text,
  business_date date NOT NULL DEFAULT get_business_date(now()),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'open' AND closed_at IS NULL AND counted_cash IS NULL)
      OR (status = 'closed' AND closed_at IS NOT NULL AND counted_cash IS NOT NULL))
);

CREATE UNIQUE INDEX cash_shifts_one_open_drawer ON cash_shifts ((true)) WHERE status = 'open';
CREATE INDEX cash_shifts_opened_at_idx ON cash_shifts(opened_at DESC);

CREATE TABLE cash_drawer_movements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cash_shift_id uuid NOT NULL REFERENCES cash_shifts(id),
  movement_type text NOT NULL CHECK (movement_type IN (
    'opening_cash', 'cash_sale', 'cash_refund', 'cash_void',
    'cash_expense', 'cash_in', 'cash_out'
  )),
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text,
  order_id uuid REFERENCES orders(id),
  payment_id uuid REFERENCES payments(id),
  payment_reversal_id uuid REFERENCES payment_reversals(id),
  expense_id uuid REFERENCES expenses(id),
  recorded_by_user_id uuid REFERENCES users(id),
  business_date date NOT NULL DEFAULT get_business_date(now()),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_id),
  UNIQUE(payment_reversal_id),
  UNIQUE(expense_id)
);

CREATE INDEX cash_drawer_movements_shift_idx ON cash_drawer_movements(cash_shift_id, created_at);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS cash_shift_id uuid REFERENCES cash_shifts(id);
ALTER TABLE payment_reversals ADD COLUMN IF NOT EXISTS cash_shift_id uuid REFERENCES cash_shifts(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cash_shift_id uuid REFERENCES cash_shifts(id);

CREATE OR REPLACE FUNCTION active_cash_shift_id_v1()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_shift_id uuid;
BEGIN
  SELECT id INTO v_shift_id FROM cash_shifts WHERE status = 'open' FOR UPDATE;
  IF v_shift_id IS NULL THEN RAISE EXCEPTION 'Open a cash shift before recording a cash transaction'; END IF;
  RETURN v_shift_id;
END;
$$;

CREATE OR REPLACE FUNCTION record_cash_payment_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_shift_id uuid;
BEGIN
  IF NEW.method <> 'cash' THEN RETURN NEW; END IF;
  v_shift_id := active_cash_shift_id_v1();
  UPDATE payments SET cash_shift_id = v_shift_id WHERE id = NEW.id;
  INSERT INTO cash_drawer_movements (cash_shift_id, movement_type, direction, amount, reason, order_id, payment_id, recorded_by_user_id, business_date)
  VALUES (v_shift_id, 'cash_sale', 'in', NEW.amount, 'Cash sale', NEW.order_id, NEW.id, NEW.received_by_user_id, NEW.business_date);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION record_cash_expense_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_shift_id uuid;
BEGIN
  IF COALESCE(NEW.payment_method, '') <> 'cash' THEN RETURN NEW; END IF;
  v_shift_id := active_cash_shift_id_v1();
  UPDATE expenses SET cash_shift_id = v_shift_id WHERE id = NEW.id;
  INSERT INTO cash_drawer_movements (cash_shift_id, movement_type, direction, amount, reason, expense_id, recorded_by_user_id, business_date)
  VALUES (v_shift_id, 'cash_expense', 'out', NEW.amount, NEW.description, NEW.id, NEW.recorded_by_user_id, NEW.business_date);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION record_cash_reversal_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_shift_id uuid; v_payment payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = NEW.payment_id;
  IF v_payment.method <> 'cash' THEN RETURN NEW; END IF;
  v_shift_id := active_cash_shift_id_v1();
  UPDATE payment_reversals SET cash_shift_id = v_shift_id WHERE id = NEW.id;
  INSERT INTO cash_drawer_movements (cash_shift_id, movement_type, direction, amount, reason, order_id, payment_id, payment_reversal_id, recorded_by_user_id, business_date)
  VALUES (v_shift_id, CASE WHEN NEW.reversal_type = 'void' THEN 'cash_void' ELSE 'cash_refund' END, 'out', NEW.amount,
    CASE WHEN NEW.reversal_type = 'void' THEN 'Cash void' ELSE 'Cash refund' END,
    v_payment.order_id, NEW.payment_id, NEW.id, NEW.processed_by_user_id, NEW.business_date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cash_payment_movement_trigger ON payments;
CREATE TRIGGER cash_payment_movement_trigger AFTER INSERT ON payments FOR EACH ROW EXECUTE FUNCTION record_cash_payment_v1();
DROP TRIGGER IF EXISTS cash_expense_movement_trigger ON expenses;
CREATE TRIGGER cash_expense_movement_trigger AFTER INSERT ON expenses FOR EACH ROW EXECUTE FUNCTION record_cash_expense_v1();
DROP TRIGGER IF EXISTS cash_reversal_movement_trigger ON payment_reversals;
CREATE TRIGGER cash_reversal_movement_trigger AFTER INSERT ON payment_reversals FOR EACH ROW EXECUTE FUNCTION record_cash_reversal_v1();

CREATE OR REPLACE FUNCTION open_cash_shift_v1(p_actor_user_id uuid, p_opening_cash numeric, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_date date;
BEGIN
  IF p_opening_cash < 0 THEN RAISE EXCEPTION 'Starting cash cannot be negative'; END IF;
  v_date := get_business_date(now());
  INSERT INTO cash_shifts (opened_by_user_id, opening_cash, opening_note, business_date)
  VALUES (p_actor_user_id, p_opening_cash, NULLIF(trim(p_note), ''), v_date) RETURNING id INTO v_id;
  IF p_opening_cash > 0 THEN
    INSERT INTO cash_drawer_movements (cash_shift_id, movement_type, direction, amount, reason, recorded_by_user_id, business_date)
    VALUES (v_id, 'opening_cash', 'in', p_opening_cash, 'Starting cash', p_actor_user_id, v_date);
  END IF;
  RETURN jsonb_build_object('id', v_id, 'status', 'open');
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'A cash shift is already open';
END;
$$;

CREATE OR REPLACE FUNCTION record_cash_movement_v1(p_actor_user_id uuid, p_direction text, p_amount numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_shift_id uuid; v_type text;
BEGIN
  IF p_direction NOT IN ('in', 'out') THEN RAISE EXCEPTION 'Invalid cash movement type'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  v_shift_id := active_cash_shift_id_v1();
  v_type := CASE WHEN p_direction = 'in' THEN 'cash_in' ELSE 'cash_out' END;
  INSERT INTO cash_drawer_movements (cash_shift_id, movement_type, direction, amount, reason, recorded_by_user_id)
  VALUES (v_shift_id, v_type, p_direction, p_amount, trim(p_reason), p_actor_user_id);
  RETURN jsonb_build_object('status', 'recorded', 'cash_shift_id', v_shift_id);
END;
$$;

CREATE OR REPLACE FUNCTION close_cash_shift_v1(p_actor_user_id uuid, p_counted_cash numeric, p_note text DEFAULT NULL, p_variance_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_shift cash_shifts%ROWTYPE; v_expected numeric(12,2); v_variance numeric(12,2);
BEGIN
  IF p_counted_cash < 0 THEN RAISE EXCEPTION 'Counted cash cannot be negative'; END IF;
  SELECT * INTO v_shift FROM cash_shifts WHERE status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open cash shift'; END IF;
  SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
  INTO v_expected FROM cash_drawer_movements WHERE cash_shift_id = v_shift.id;
  v_variance := round(p_counted_cash - v_expected, 2);
  IF v_variance <> 0 AND COALESCE(trim(p_variance_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required when counted cash differs from expected cash'; END IF;
  UPDATE cash_shifts SET status = 'closed', closed_by_user_id = p_actor_user_id, closed_at = now(),
    counted_cash = p_counted_cash, expected_cash = v_expected, variance = v_variance,
    closing_note = NULLIF(trim(p_note), ''), variance_reason = NULLIF(trim(p_variance_reason), '')
  WHERE id = v_shift.id;
  RETURN jsonb_build_object('status', 'closed', 'expected_cash', v_expected, 'variance', v_variance);
END;
$$;
