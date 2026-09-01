-- Fixes migration: addon totals, refund function, validation, inventory reference

-- ============================================================
-- FIX: complete_sale_v1 — addon totals, empty items, GCash ref, inventory reference_id
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
  v_addon_row_id uuid;
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

  -- Validate items
  IF jsonb_array_length(p_payload->'items') = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
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
        v_unit_price := COALESCE(v_variant_record.price_override, v_menu_item.base_price);
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
      VALUES (v_order_item_id, v_addon_record.id, v_addon_record.name, v_addon_record.price_adjustment, (v_addon->>'quantity')::numeric, v_addon_record.price_adjustment * (v_addon->>'quantity')::numeric)
      RETURNING id INTO v_addon_row_id;

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
        SELECT v_recipe.ingredient_id, 'sale_usage', v_recipe.quantity_required * (v_addon->>'quantity')::numeric, i.weighted_average_unit_cost, v_recipe.quantity_required * (v_addon->>'quantity')::numeric * i.weighted_average_unit_cost, i.quantity_on_hand - v_recipe.quantity_required * (v_addon->>'quantity')::numeric, i.weighted_average_unit_cost, v_order_item_id, 'order_item_addon', v_addon_row_id, p_actor_user_id, v_biz_date
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

  -- Include addon totals
  v_subtotal := v_subtotal + COALESCE((
    SELECT SUM(line_total) FROM order_item_addons
    WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = v_order_id)
  ), 0);

  -- Calculate tax and totals (guard against empty business_settings)
  SELECT COALESCE(tax_rate, 0) INTO v_tax_rate FROM business_settings;
  IF v_tax_rate IS NULL THEN v_tax_rate := 0; END IF;
  v_tax_total := round(v_subtotal * v_tax_rate / 100, 2);
  v_grand_total := v_subtotal + v_tax_total;
  UPDATE orders SET subtotal = v_subtotal, tax_total = v_tax_total, grand_total = v_grand_total WHERE id = v_order_id;

  -- Validate GCash reference
  IF p_payload->>'payment_method' = 'gcash' AND COALESCE(p_payload->>'gcash_reference', '') = '' THEN
    RAISE EXCEPTION 'GCash reference number is required';
  END IF;

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
-- NEW: process_refund_v1 — refund payment without restoring inventory
-- ============================================================
CREATE OR REPLACE FUNCTION process_refund_v1(
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
  VALUES (p_idempotency_key, 'refund', p_actor_user_id, 'pending')
  ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT status, order_id INTO v_status, v_order_id
    FROM idempotency_requests WHERE id = p_idempotency_key;
    IF v_status = 'completed' THEN
      RETURN jsonb_build_object('status', 'already_refunded', 'order_id', v_order_id);
    END IF;
    RAISE EXCEPTION 'Concurrent refund in progress for idempotency key %', p_idempotency_key;
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status = 'voided' THEN RAISE EXCEPTION 'Cannot refund voided order'; END IF;
  IF v_order.payment_status = 'refunded' THEN RAISE EXCEPTION 'Order already refunded'; END IF;

  SELECT * INTO v_payment FROM payments WHERE order_id = p_order_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'No payment found for order %', p_order_id; END IF;
  IF v_payment.status = 'refunded' THEN RAISE EXCEPTION 'Payment already refunded'; END IF;

  -- Create order reversal record
  INSERT INTO order_reversals (order_id, operation_id, reversal_type, reason, inventory_restoration_basis, ingredient_stock_restored, authorized_by_user_id)
  VALUES (p_order_id, p_idempotency_key, 'refund', p_reason, 'not_restored_prepared', false, p_actor_user_id)
  RETURNING id INTO v_order_reversal_id;

  -- Record payment reversal
  INSERT INTO payment_reversals (payment_id, order_reversal_id, reversal_type, amount, business_date, processed_by_user_id)
  VALUES (v_payment.id, v_order_reversal_id, 'refund', v_payment.amount, get_business_date(now()), p_actor_user_id);

  -- Mark payment as refunded
  UPDATE payments SET status = 'refunded', refunded_at = now() WHERE id = v_payment.id;

  -- Reverse loyalty points
  IF v_order.customer_id IS NOT NULL AND v_order.loyalty_points_earned > 0 THEN
    UPDATE customers SET loyalty_points_balance = GREATEST(0, loyalty_points_balance - v_order.loyalty_points_earned)
    WHERE id = v_order.customer_id;

    INSERT INTO loyalty_transactions (customer_id, order_id, transaction_type, points_delta, balance_after, actor_user_id)
    SELECT v_order.customer_id, p_order_id, 'refund_reversal', -v_order.loyalty_points_earned, loyalty_points_balance, p_actor_user_id
    FROM customers WHERE id = v_order.customer_id;
  END IF;

  -- Update order payment status only (not order status)
  UPDATE orders SET payment_status = 'refunded' WHERE id = p_order_id;

  -- History
  INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id)
  VALUES (p_order_id, v_order.status, v_order.status, p_actor_user_id);

  UPDATE idempotency_requests SET status = 'completed', order_id = p_order_id, completed_at = now() WHERE id = p_idempotency_key;

  RETURN jsonb_build_object('status', 'refunded', 'order_id', p_order_id);
END;
$$;

-- ============================================================
-- UNIQUE INDEXES — prevent name duplicates
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_name_unique ON menu_items(name) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_item_name_unique ON menu_item_variants(menu_item_id, name) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_addon_groups_item_name_unique ON addon_groups(menu_item_id, name) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_addons_group_name_unique ON addons(addon_group_id, name) WHERE is_active = true;

-- Missing FK indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_cashier ON orders(cashier_user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(menu_item_variant_id);
CREATE INDEX IF NOT EXISTS idx_order_item_addons_addon ON order_item_addons(addon_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_received_by ON payments(received_by_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_reversals_payment ON payment_reversals(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_reversals_reversal ON payment_reversals(order_reversal_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_user ON order_status_history(changed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_kds_events_order ON kds_events(order_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(expense_category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_recorded_by ON expenses(recorded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_actor ON idempotency_requests(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_order_reversals_order ON order_reversals(order_id);
CREATE INDEX IF NOT EXISTS idx_order_reversals_auth_by ON order_reversals(authorized_by_user_id);
CREATE INDEX IF NOT EXISTS idx_stock_receipts_received_by ON stock_receipts(received_by_user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_recorded ON inventory_adjustments(recorded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_approved ON inventory_adjustments(approved_by_user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_actor ON loyalty_transactions(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_kds_devices_user ON kds_devices(kds_user_id);

-- Missing unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredients_name_unique ON ingredients(name) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_categories_name_unique ON expense_categories(name) WHERE is_active = true;

-- Missing FK constraint on loyalty_transactions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_loyalty_tx_order') THEN
    ALTER TABLE loyalty_transactions ADD CONSTRAINT fk_loyalty_tx_order FOREIGN KEY (order_id) REFERENCES orders(id);
  END IF;
END;
$$;

-- Missing updated_at on expense_categories
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Enforce variant price logic at DB level
ALTER TABLE menu_item_variants DROP CONSTRAINT IF EXISTS chk_variant_price;
ALTER TABLE menu_item_variants ADD CONSTRAINT chk_variant_price CHECK (
  (price_mode = 'override' AND price_override IS NOT NULL) OR
  (price_mode = 'adjustment' AND price_adjustment IS NOT NULL)
);
