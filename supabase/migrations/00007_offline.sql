-- ==================================================================
-- 00007: Offline POS sync support (non-breaking for online checkouts)
-- Adds gated support so replayed offline sales:
--   1. use the ORIGINAL business date (sold_at) for correct reports,
--   2. record the ORIGINAL totals (sold_subtotal/tax/grand_total),
--   3. are created directly as 'completed' (never appear on the KDS),
--   4. skip the kds_events insert.
-- All changes are gated on p_payload->>'offline_sync' / 'sold_at' so the
-- online path is byte-identical to 00005.
-- ==================================================================

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
  v_offline_sync boolean;
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
  v_offline_sync := COALESCE((p_payload->>'offline_sync')::boolean, false);
  v_biz_date := get_business_date(COALESCE((p_payload->>'sold_at')::timestamptz, now()));

  v_seq := nextval('order_sequence_number_seq');
  v_order_number := 'ORD-' || to_char(v_biz_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 6, '0');

  INSERT INTO orders (order_number, order_sequence_number, cashier_user_id, customer_id, status, payment_status, payment_method, subtotal, discount_total, tax_total, grand_total, loyalty_points_earned, business_date)
  VALUES (v_order_number, v_seq, p_actor_user_id, v_customer_id, CASE WHEN v_offline_sync THEN 'completed' ELSE 'new' END, 'paid', p_payload->>'payment_method', 0, 0, 0, 0, 0, v_biz_date)
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

  -- Offline replay: honor the totals the cashier actually collected at sale time.
  IF v_offline_sync THEN
    v_subtotal := COALESCE((p_payload->>'sold_subtotal')::numeric, v_subtotal);
    v_tax_total := COALESCE((p_payload->>'sold_tax_total')::numeric, v_tax_total);
    v_grand_total := COALESCE((p_payload->>'sold_grand_total')::numeric, v_grand_total);
  END IF;

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
  IF NOT v_offline_sync THEN
    INSERT INTO kds_events (order_id, event_type) VALUES (v_order_id, 'order_created');
  END IF;

  UPDATE idempotency_requests SET status = 'completed', order_id = v_order_id, completed_at = now() WHERE id = p_idempotency_key;

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'subtotal', v_subtotal, 'tax_total', v_tax_total, 'grand_total', v_grand_total, 'loyalty_points_earned', COALESCE(v_loyalty_points, 0));
END;
$$;
