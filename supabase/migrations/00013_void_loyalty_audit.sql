-- 00013: Void now records loyalty_points reversal transaction (audit parity with refund)
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
  IF v_order.payment_status IN ('voided', 'refunded') THEN RAISE EXCEPTION 'Cannot void order with payment status %', v_order.payment_status; END IF;

  SELECT * INTO v_payment FROM payments WHERE order_id = p_order_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'No payment found for order %', p_order_id; END IF;
  IF v_payment.status IN ('voided', 'refunded') THEN RAISE EXCEPTION 'Payment already %', v_payment.status; END IF;

  INSERT INTO order_reversals (order_id, operation_id, reversal_type, reason, inventory_restoration_basis, ingredient_stock_restored, authorized_by_user_id)
  VALUES (p_order_id, p_idempotency_key, 'void', p_reason,
    CASE WHEN v_order.status = 'new' THEN 'automatic_new_not_prepared' ELSE 'not_restored_prepared' END,
    v_order.status = 'new', p_actor_user_id)
  RETURNING id INTO v_order_reversal_id;

  INSERT INTO payment_reversals (payment_id, order_reversal_id, reversal_type, amount, business_date, processed_by_user_id)
  VALUES (v_payment.id, v_order_reversal_id, 'void', v_payment.amount, get_business_date(now()), p_actor_user_id);

  UPDATE payments SET status = 'voided', voided_at = now() WHERE id = v_payment.id;

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

    INSERT INTO loyalty_transactions (customer_id, order_id, transaction_type, points_delta, balance_after, actor_user_id)
    SELECT v_order.customer_id, p_order_id, 'reversal', -v_order.loyalty_points_earned, loyalty_points_balance, p_actor_user_id
    FROM customers WHERE id = v_order.customer_id;
  END IF;

  UPDATE orders SET status = 'voided', payment_status = 'voided', voided_at = now() WHERE id = p_order_id;

  INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id) VALUES (p_order_id, v_order.status, 'voided', p_actor_user_id);

  UPDATE idempotency_requests SET status = 'completed', order_id = p_order_id, completed_at = now() WHERE id = p_idempotency_key;

  RETURN jsonb_build_object('status', 'voided', 'order_id', p_order_id);
END;
$$;