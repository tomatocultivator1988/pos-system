-- ============================================================
-- QA FIXES 00005
-- Run this ONCE on the live Supabase DB (SQL Studio / psql).
-- Apply 00002 first if not already applied (addon pricing fix).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) Add amount_tendered column for cash-drawer reconciliation
-- ------------------------------------------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tendered_amount numeric(12,2);

-- ------------------------------------------------------------------
-- 2) Redefine complete_sale_v1:
--    - reject non-integer or non-positive quantities
--    - persist tendered_amount when provided
-- ------------------------------------------------------------------
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
  v_order_id uuid;
  v_order_number text;
  v_seq integer;
  v_biz_date date;
  v_customer_id uuid;
  v_item jsonb;
  v_qty numeric;
  v_variant_id uuid;
  v_addon_row_id uuid;
  v_has_variant_recipe boolean;
  v_menu_item record;
  v_variant_record record;
  v_addon jsonb;
  v_addon_record record;
  v_recipe record;
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_grand_total numeric(12,2);
  v_order_item_id uuid;
  v_loyalty_points numeric(10,0);
  v_tax_rate numeric(5,2);
  v_tax_total numeric(12,2);
  v_status text;
  v_count integer;
  v_group record;
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

  v_seq := nextval('order_sequence_number_seq');
  v_order_number := 'ORD-' || to_char(v_biz_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 6, '0');

  INSERT INTO orders (order_number, order_sequence_number, cashier_user_id, customer_id, status, payment_status, payment_method, subtotal, discount_total, tax_total, grand_total, loyalty_points_earned, business_date)
  VALUES (v_order_number, v_seq, p_actor_user_id, v_customer_id, 'new', 'paid', p_payload->>'payment_method', 0, 0, 0, 0, 0, v_biz_date)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
  LOOP
    v_qty := (v_item->>'quantity')::numeric;
    IF v_qty <= 0 OR v_qty <> floor(v_qty) OR v_qty > 999 THEN
      RAISE EXCEPTION 'Invalid quantity for item %', v_item->>'menu_item_id';
    END IF;

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

    v_line_total := v_unit_price * v_qty;
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO order_items (order_id, menu_item_id, menu_item_variant_id, item_name, variant_name, unit_price, loyalty_points_per_unit, quantity, line_total, notes)
    VALUES (v_order_id, v_menu_item.id, v_variant_id, v_menu_item.name, (SELECT name FROM menu_item_variants WHERE id = v_variant_id), v_unit_price, v_menu_item.loyalty_points_earned, v_qty, v_line_total, v_item->>'notes')
    RETURNING id INTO v_order_item_id;

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
      IF v_recipe.current_stock < v_recipe.quantity_required * v_qty THEN
        RAISE EXCEPTION 'Insufficient stock for ingredient %', v_recipe.ingredient_id;
      END IF;

      INSERT INTO inventory_movements (ingredient_id, movement_type, quantity_out, unit_cost_at_movement, total_cost, quantity_balance_after, average_unit_cost_after, order_item_id, reference_type, reference_id, actor_user_id, business_date)
      SELECT v_recipe.ingredient_id, 'sale_usage', v_recipe.quantity_required * v_qty, weighted_average_unit_cost, v_recipe.quantity_required * v_qty * weighted_average_unit_cost, quantity_on_hand - v_recipe.quantity_required * v_qty, weighted_average_unit_cost, v_order_item_id, 'order_item', v_order_item_id, p_actor_user_id, v_biz_date
      FROM ingredients WHERE id = v_recipe.ingredient_id;

      UPDATE ingredients SET quantity_on_hand = quantity_on_hand - v_recipe.quantity_required * v_qty
      WHERE id = v_recipe.ingredient_id;
    END LOOP;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons', '[]'::jsonb))
    LOOP
      SELECT * INTO v_addon_record FROM addons WHERE id = (v_addon->>'addon_id')::uuid AND is_active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid addon %', v_addon->>'addon_id'; END IF;

      INSERT INTO order_item_addons (order_item_id, addon_id, addon_name, unit_price, quantity, line_total)
      VALUES (v_order_item_id, v_addon_record.id, v_addon_record.name, v_addon_record.price_adjustment, (v_addon->>'quantity')::numeric, v_addon_record.price_adjustment * (v_addon->>'quantity')::numeric)
      RETURNING id INTO v_addon_row_id;

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

  v_subtotal := v_subtotal + COALESCE((
    SELECT SUM(line_total) FROM order_item_addons
    WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = v_order_id)
  ), 0);

  SELECT COALESCE(tax_rate, 0) INTO v_tax_rate FROM business_settings;
  IF v_tax_rate IS NULL THEN v_tax_rate := 0; END IF;
  v_tax_total := round(v_subtotal * v_tax_rate / 100, 2);
  v_grand_total := v_subtotal + v_tax_total;
  UPDATE orders SET subtotal = v_subtotal, tax_total = v_tax_total, grand_total = v_grand_total WHERE id = v_order_id;

  IF p_payload->>'payment_method' = 'gcash' AND COALESCE(p_payload->>'gcash_reference', '') = '' THEN
    RAISE EXCEPTION 'GCash reference number is required';
  END IF;

  INSERT INTO payments (order_id, method, amount, tendered_amount, gcash_reference, received_by_user_id, business_date)
  VALUES (v_order_id, p_payload->>'payment_method', v_grand_total, NULLIF((p_payload->>'amount_tendered')::numeric, 0), p_payload->>'gcash_reference', p_actor_user_id, v_biz_date);

  IF v_customer_id IS NOT NULL THEN
    UPDATE orders SET loyalty_points_earned = FLOOR(v_grand_total / 50) WHERE id = v_order_id RETURNING loyalty_points_earned INTO v_loyalty_points;

    IF v_loyalty_points > 0 THEN
      UPDATE customers SET loyalty_points_balance = loyalty_points_balance + v_loyalty_points WHERE id = v_customer_id;
      INSERT INTO loyalty_transactions (customer_id, order_id, transaction_type, points_delta, balance_after, actor_user_id)
      SELECT v_customer_id, v_order_id, 'earn', v_loyalty_points, loyalty_points_balance, p_actor_user_id FROM customers WHERE id = v_customer_id;
    END IF;
  END IF;

  INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id) VALUES (v_order_id, 'new', 'completed', p_actor_user_id);
  INSERT INTO kds_events (order_id, event_type) VALUES (v_order_id, 'order_created');

  UPDATE idempotency_requests SET status = 'completed', order_id = v_order_id, completed_at = now() WHERE id = p_idempotency_key;

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'subtotal', v_subtotal, 'tax_total', v_tax_total, 'grand_total', v_grand_total, 'loyalty_points_earned', COALESCE(v_loyalty_points, 0));
END;
$$;

-- ------------------------------------------------------------------
-- 3) Fix process_refund_v1: 'refund_reversal' violates the
--    loyalty_transactions CHECK (allowed: earn, redeem, adjust, reversal).
-- ------------------------------------------------------------------
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
  INSERT INTO idempotency_requests (id, operation_type, actor_user_id, status)
  VALUES (p_idempotency_key, 'refund', p_actor_user_id, 'pending')
  ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT status, order_id INTO v_status, v_order_id
    FROM idempotency_requests WHERE id = p_idempotency_key;
    IF v_status = 'completed' THEN
      RETURN jsonb_build_object('status', 'already_refunded', 'order_id', v_order_id);
    END IF;
    RAISE EXCEPTION 'Concurrent refund in progress';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status = 'voided' THEN RAISE EXCEPTION 'Cannot refund voided order'; END IF;
  IF v_order.payment_status = 'refunded' THEN RAISE EXCEPTION 'Order already refunded'; END IF;

  SELECT * INTO v_payment FROM payments WHERE order_id = p_order_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'No payment found'; END IF;
  IF v_payment.status = 'refunded' THEN RAISE EXCEPTION 'Payment already refunded'; END IF;

  INSERT INTO order_reversals (order_id, operation_id, reversal_type, reason, inventory_restoration_basis, ingredient_stock_restored, authorized_by_user_id)
  VALUES (p_order_id, p_idempotency_key, 'refund', p_reason, 'not_restored_prepared', false, p_actor_user_id)
  RETURNING id INTO v_order_reversal_id;

  INSERT INTO payment_reversals (payment_id, order_reversal_id, reversal_type, amount, business_date, processed_by_user_id)
  VALUES (v_payment.id, v_order_reversal_id, 'refund', v_payment.amount, get_business_date(now()), p_actor_user_id);

  UPDATE payments SET status = 'refunded', refunded_at = now() WHERE id = v_payment.id;

  IF v_order.customer_id IS NOT NULL AND v_order.loyalty_points_earned > 0 THEN
    UPDATE customers SET loyalty_points_balance = GREATEST(0, loyalty_points_balance - v_order.loyalty_points_earned)
    WHERE id = v_order.customer_id;

    INSERT INTO loyalty_transactions (customer_id, order_id, transaction_type, points_delta, balance_after, actor_user_id)
    SELECT v_order.customer_id, p_order_id, 'reversal', -v_order.loyalty_points_earned, loyalty_points_balance, p_actor_user_id
    FROM customers WHERE id = v_order.customer_id;
  END IF;

  UPDATE orders SET payment_status = 'refunded' WHERE id = p_order_id;

  INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id)
  VALUES (p_order_id, v_order.status, v_order.status, p_actor_user_id);

  UPDATE idempotency_requests SET status = 'completed', order_id = p_order_id, completed_at = now() WHERE id = p_idempotency_key;

  RETURN jsonb_build_object('status', 'refunded', 'order_id', p_order_id);
END;
$$;

-- ------------------------------------------------------------------
-- 4) Duplicate category names / variant negative price guards
-- ------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_categories_name_unique
  ON menu_categories(name) WHERE is_active = true;

ALTER TABLE menu_item_variants DROP CONSTRAINT IF EXISTS chk_variant_adjustment_nonneg;
ALTER TABLE menu_item_variants ADD CONSTRAINT chk_variant_adjustment_nonneg
  CHECK (price_adjustment IS NULL OR price_adjustment >= 0);

-- ------------------------------------------------------------------
-- 5) Atomic inventory operations (prevent lost-update / partial writes)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_stock_receipt_v1(
  p_received_by_user_id uuid,
  p_items jsonb,
  p_business_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receipt_id uuid;
  v_item jsonb;
  v_ingredient record;
  v_new_qty numeric(12,2);
  v_new_cost numeric(12,4);
  v_line_total numeric(12,2);
BEGIN
  INSERT INTO stock_receipts (received_by_user_id, business_date)
  VALUES (p_received_by_user_id, p_business_date)
  RETURNING id INTO v_receipt_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_total := round((v_item->>'quantity')::numeric * (v_item->>'unit_cost')::numeric, 2);

    INSERT INTO stock_receipt_items (stock_receipt_id, ingredient_id, quantity_received, unit_cost, line_total)
    VALUES (v_receipt_id, (v_item->>'ingredient_id')::uuid, (v_item->>'quantity')::numeric, (v_item->>'unit_cost')::numeric, v_line_total);

    SELECT * INTO v_ingredient FROM ingredients WHERE id = (v_item->>'ingredient_id')::uuid FOR UPDATE;

    IF v_ingredient.quantity_on_hand <= 0 OR v_ingredient.quantity_on_hand IS NULL THEN
      v_new_cost := (v_item->>'unit_cost')::numeric;
    ELSE
      v_new_cost := round((v_ingredient.quantity_on_hand * v_ingredient.weighted_average_unit_cost + (v_item->>'quantity')::numeric * (v_item->>'unit_cost')::numeric) / (v_ingredient.quantity_on_hand + (v_item->>'quantity')::numeric), 4);
    END IF;
    v_new_qty := v_ingredient.quantity_on_hand + (v_item->>'quantity')::numeric;

    UPDATE ingredients SET quantity_on_hand = v_new_qty, weighted_average_unit_cost = v_new_cost
    WHERE id = v_ingredient.id;

    INSERT INTO inventory_movements (ingredient_id, movement_type, quantity_in, quantity_out, unit_cost_at_movement, total_cost, quantity_balance_after, average_unit_cost_after, reference_type, reference_id, actor_user_id, business_date)
    VALUES (v_ingredient.id, 'restock', (v_item->>'quantity')::numeric, 0, (v_item->>'unit_cost')::numeric, v_line_total, v_new_qty, v_new_cost, 'stock_receipt', v_receipt_id, p_received_by_user_id, p_business_date);
  END LOOP;

  RETURN jsonb_build_object('stock_receipt_id', v_receipt_id);
END;
$$;

CREATE OR REPLACE FUNCTION create_inventory_adjustment_v1(
  p_ingredient_id uuid,
  p_adjustment_type text,
  p_quantity_delta numeric,
  p_reason text,
  p_actor_user_id uuid,
  p_business_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ingredient record;
  v_new_qty numeric(12,2);
  v_delta numeric(12,2);
  v_qty_in numeric(12,2) := 0;
  v_qty_out numeric(12,2) := 0;
  v_total_cost numeric(12,2);
  v_adjustment_id uuid;
  v_movement_type text;
BEGIN
  SELECT * INTO v_ingredient FROM ingredients WHERE id = p_ingredient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ingredient not found'; END IF;

  v_new_qty := GREATEST(0, v_ingredient.quantity_on_hand + p_quantity_delta);
  v_delta := v_new_qty - v_ingredient.quantity_on_hand;

  IF v_delta > 0 THEN v_qty_in := v_delta; ELSE v_qty_out := -v_delta; END IF;
  v_total_cost := round(v_qty_out * v_ingredient.weighted_average_unit_cost, 2);

  v_movement_type := CASE p_adjustment_type
    WHEN 'waste' THEN 'waste'
    WHEN 'spoilage' THEN 'spoilage'
    ELSE 'manual_adjustment'
  END;

  INSERT INTO inventory_adjustments (ingredient_id, adjustment_type, quantity_delta, reason, recorded_by_user_id, business_date)
  VALUES (p_ingredient_id, p_adjustment_type, v_delta, p_reason, p_actor_user_id, p_business_date)
  RETURNING id INTO v_adjustment_id;

  UPDATE ingredients SET quantity_on_hand = v_new_qty WHERE id = p_ingredient_id;

  INSERT INTO inventory_movements (ingredient_id, movement_type, quantity_in, quantity_out, unit_cost_at_movement, total_cost, quantity_balance_after, average_unit_cost_after, reference_type, reference_id, actor_user_id, business_date)
  VALUES (p_ingredient_id, v_movement_type, v_qty_in, v_qty_out, v_ingredient.weighted_average_unit_cost, v_total_cost, v_new_qty, v_ingredient.weighted_average_unit_cost, 'inventory_adjustment', v_adjustment_id, p_actor_user_id, p_business_date);

  RETURN jsonb_build_object('adjustment_id', v_adjustment_id, 'actual_delta', v_delta);
END;
$$;

-- ------------------------------------------------------------------
-- 6) Session cleanup (run periodically; prevents expired-row accumulation)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_expired_sessions()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM sessions WHERE expires_at < now() OR revoked_at IS NOT NULL;
  SELECT count(*) FROM sessions;
$$;

-- ------------------------------------------------------------------
-- 7) Fix void_order_v1 inventory reversal: addon ingredient movements
--    store reference_id = order_item_addons.id (not an order_items.id),
--    so the old reference_id IN (SELECT id FROM order_items) match missed
--    add-on ingredient usage, leaking stock. Match on order_item_id
--    instead, which all sale_usage movements (item + addon) share.
-- ------------------------------------------------------------------
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

  INSERT INTO order_reversals (order_id, operation_id, reversal_type, reason, inventory_restoration_basis, ingredient_stock_restored, authorized_by_user_id)
  VALUES (p_order_id, p_idempotency_key, 'void', p_reason,
    CASE WHEN v_order.status = 'new' THEN 'automatic_new_not_prepared' ELSE 'not_restored_prepared' END,
    v_order.status = 'new', p_actor_user_id)
  RETURNING id INTO v_order_reversal_id;

  INSERT INTO payment_reversals (payment_id, order_reversal_id, reversal_type, amount, business_date, processed_by_user_id)
  VALUES (v_payment.id, v_order_reversal_id, 'void', v_payment.amount, get_business_date(now()), p_actor_user_id);

  UPDATE payments SET status = 'voided', voided_at = now() WHERE id = v_payment.id;

  -- Reverse inventory if 'new' (match by order_item_id to cover item + addon)
  IF v_order.status = 'new' THEN
    INSERT INTO inventory_movements (ingredient_id, movement_type, quantity_in, unit_cost_at_movement, total_cost, quantity_balance_after, average_unit_cost_after, reference_type, reference_id, actor_user_id, business_date)
    SELECT im.ingredient_id, 'sale_reversal', im.quantity_out, im.unit_cost_at_movement, im.total_cost, i.quantity_on_hand + im.quantity_out, i.weighted_average_unit_cost, 'order_reversal', p_order_id, p_actor_user_id, get_business_date(now())
    FROM inventory_movements im
    JOIN ingredients i ON i.id = im.ingredient_id
    WHERE im.reference_type IN ('order_item', 'order_item_addon')
      AND im.order_item_id IN (SELECT id FROM order_items WHERE order_id = p_order_id);

    UPDATE ingredients SET quantity_on_hand = quantity_on_hand + COALESCE((
      SELECT SUM(im.quantity_out)
      FROM inventory_movements im
      WHERE im.ingredient_id = ingredients.id
        AND im.reference_type IN ('order_item', 'order_item_addon')
        AND im.order_item_id IN (SELECT id FROM order_items WHERE order_id = p_order_id)
    ), 0)
    WHERE id IN (
      SELECT im.ingredient_id
      FROM inventory_movements im
      WHERE im.reference_type IN ('order_item', 'order_item_addon')
        AND im.order_item_id IN (SELECT id FROM order_items WHERE order_id = p_order_id)
    );
  END IF;

  IF v_order.customer_id IS NOT NULL AND v_order.loyalty_points_earned > 0 THEN
    UPDATE customers SET loyalty_points_balance = GREATEST(0, loyalty_points_balance - v_order.loyalty_points_earned)
    WHERE id = v_order.customer_id;
  END IF;

  UPDATE orders SET status = 'voided', payment_status = 'voided', voided_at = now() WHERE id = p_order_id;

  INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id) VALUES (p_order_id, v_order.status, 'voided', p_actor_user_id);

  UPDATE idempotency_requests SET status = 'completed', order_id = p_order_id, completed_at = now() WHERE id = p_idempotency_key;

  RETURN jsonb_build_object('status', 'voided', 'order_id', p_order_id);
END;
$$;

-- ------------------------------------------------------------------
-- 8) Addon-group min/max cross-validation (min <= max) to prevent
--    creating groups that make an item permanently un-orderable.
-- ------------------------------------------------------------------
ALTER TABLE addon_groups DROP CONSTRAINT IF EXISTS chk_addon_group_minmax;
ALTER TABLE addon_groups ADD CONSTRAINT chk_addon_group_minmax
  CHECK (max_selections = 0 OR max_selections >= min_selections);

-- ------------------------------------------------------------------
-- 9) Atomic recipe-line upsert (delete + insert in one transaction)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_recipe_lines_v1(
  p_menu_item_id uuid,
  p_scope text,
  p_ref_id uuid,
  p_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF p_scope = 'item' THEN
    DELETE FROM recipe_lines WHERE menu_item_id = p_menu_item_id AND menu_item_variant_id IS NULL AND addon_id IS NULL;
  ELSIF p_scope = 'variant' THEN
    DELETE FROM recipe_lines WHERE menu_item_variant_id = p_ref_id;
  ELSIF p_scope = 'addon' THEN
    DELETE FROM recipe_lines WHERE addon_id = p_ref_id;
  END IF;

  IF jsonb_typeof(p_lines) = 'array' THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO recipe_lines (menu_item_id, menu_item_variant_id, addon_id, ingredient_id, quantity_required)
      VALUES (
        CASE WHEN p_scope = 'item' THEN p_menu_item_id ELSE NULL END,
        CASE WHEN p_scope = 'variant' THEN p_ref_id ELSE NULL END,
        CASE WHEN p_scope = 'addon' THEN p_ref_id ELSE NULL END,
        (v_row->>'ingredientId')::uuid,
        (v_row->>'quantity')::numeric
      );
    END LOOP;
  END IF;
END;
$$;

-- ------------------------------------------------------------------
-- 10) Fix process_refund_v1 to restore ingredient stock on refund.
--     Before, only money + loyalty were reversed; the ingredients sold
--     with the order were never returned to inventory, so stock drifted
--     down on every refund. Mirrors the void restore logic (match by
--     order_item_id to cover both item and addon usage).
-- ------------------------------------------------------------------
ALTER TABLE order_reversals DROP CONSTRAINT IF EXISTS order_reversals_inventory_restoration_basis_check;
ALTER TABLE order_reversals ADD CONSTRAINT order_reversals_inventory_restoration_basis_check
  CHECK (inventory_restoration_basis IN ('automatic_new_not_prepared', 'admin_attested_not_prepared', 'not_restored_prepared', 'automatic_refund'));

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
  INSERT INTO idempotency_requests (id, operation_type, actor_user_id, status)
  VALUES (p_idempotency_key, 'refund', p_actor_user_id, 'pending')
  ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT status, order_id INTO v_status, v_order_id
    FROM idempotency_requests WHERE id = p_idempotency_key;
    IF v_status = 'completed' THEN
      RETURN jsonb_build_object('status', 'already_refunded', 'order_id', v_order_id);
    END IF;
    RAISE EXCEPTION 'Concurrent refund in progress';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status = 'voided' THEN RAISE EXCEPTION 'Cannot refund voided order'; END IF;
  IF v_order.payment_status = 'refunded' THEN RAISE EXCEPTION 'Order already refunded'; END IF;

  SELECT * INTO v_payment FROM payments WHERE order_id = p_order_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'No payment found'; END IF;
  IF v_payment.status = 'refunded' THEN RAISE EXCEPTION 'Payment already refunded'; END IF;

  INSERT INTO order_reversals (order_id, operation_id, reversal_type, reason, inventory_restoration_basis, ingredient_stock_restored, authorized_by_user_id)
  VALUES (p_order_id, p_idempotency_key, 'refund', p_reason, 'automatic_refund', true, p_actor_user_id)
  RETURNING id INTO v_order_reversal_id;

  INSERT INTO payment_reversals (payment_id, order_reversal_id, reversal_type, amount, business_date, processed_by_user_id)
  VALUES (v_payment.id, v_order_reversal_id, 'refund', v_payment.amount, get_business_date(now()), p_actor_user_id);

  UPDATE payments SET status = 'refunded', refunded_at = now() WHERE id = v_payment.id;

  -- Restore ingredient stock used by the order (item + addon usage)
  INSERT INTO inventory_movements (ingredient_id, movement_type, quantity_in, unit_cost_at_movement, total_cost, quantity_balance_after, average_unit_cost_after, reference_type, reference_id, actor_user_id, business_date)
  SELECT im.ingredient_id, 'sale_reversal', im.quantity_out, im.unit_cost_at_movement, im.total_cost, i.quantity_on_hand + im.quantity_out, i.weighted_average_unit_cost, 'order_reversal', p_order_id, p_actor_user_id, get_business_date(now())
  FROM inventory_movements im
  JOIN ingredients i ON i.id = im.ingredient_id
  WHERE im.reference_type IN ('order_item', 'order_item_addon')
    AND im.order_item_id IN (SELECT id FROM order_items WHERE order_id = p_order_id);

  UPDATE ingredients SET quantity_on_hand = quantity_on_hand + COALESCE((
    SELECT SUM(im.quantity_out)
    FROM inventory_movements im
    WHERE im.ingredient_id = ingredients.id
      AND im.reference_type IN ('order_item', 'order_item_addon')
      AND im.order_item_id IN (SELECT id FROM order_items WHERE order_id = p_order_id)
  ), 0)
  WHERE id IN (
    SELECT im.ingredient_id
    FROM inventory_movements im
    WHERE im.reference_type IN ('order_item', 'order_item_addon')
      AND im.order_item_id IN (SELECT id FROM order_items WHERE order_id = p_order_id)
  );

  IF v_order.customer_id IS NOT NULL AND v_order.loyalty_points_earned > 0 THEN
    UPDATE customers SET loyalty_points_balance = GREATEST(0, loyalty_points_balance - v_order.loyalty_points_earned)
    WHERE id = v_order.customer_id;

    INSERT INTO loyalty_transactions (customer_id, order_id, transaction_type, points_delta, balance_after, actor_user_id)
    SELECT v_order.customer_id, p_order_id, 'reversal', -v_order.loyalty_points_earned, loyalty_points_balance, p_actor_user_id
    FROM customers WHERE id = v_order.customer_id;
  END IF;

  UPDATE orders SET payment_status = 'refunded' WHERE id = p_order_id;

  INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id)
  VALUES (p_order_id, v_order.status, v_order.status, p_actor_user_id);

  UPDATE idempotency_requests SET status = 'completed', order_id = p_order_id, completed_at = now() WHERE id = p_idempotency_key;

  RETURN jsonb_build_object('status', 'refunded', 'order_id', p_order_id);
END;
$$;