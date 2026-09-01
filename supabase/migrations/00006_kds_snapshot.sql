-- 00006: snapshot send_to_kds onto order_items so the KDS is stable
-- against later menu-item edits (drinks stay out of the kitchen display).

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS send_to_kds boolean NOT NULL DEFAULT false;

-- Backfill existing rows from their menu item.
UPDATE order_items oi
   SET send_to_kds = mi.send_to_kds
  FROM menu_items mi
 WHERE oi.menu_item_id = mi.id;

-- Snapshot the flag at insert time (checkout RPC does not set it).
CREATE OR REPLACE FUNCTION set_order_item_send_to_kds() RETURNS trigger AS $$
BEGIN
  NEW.send_to_kds := COALESCE((SELECT send_to_kds FROM menu_items WHERE id = NEW.menu_item_id), false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_item_send_to_kds ON order_items;
CREATE TRIGGER trg_order_item_send_to_kds
  BEFORE INSERT ON order_items
  FOR EACH ROW EXECUTE FUNCTION set_order_item_send_to_kds();
