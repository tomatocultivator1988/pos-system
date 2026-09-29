-- Migration 00018: Add 'cash_movement' to idempotency_requests check constraint
-- and default expense_date on expenses table

ALTER TABLE idempotency_requests DROP CONSTRAINT IF EXISTS idempotency_requests_operation_type_check;
ALTER TABLE idempotency_requests ADD CONSTRAINT idempotency_requests_operation_type_check
  CHECK (operation_type IN ('checkout', 'void', 'refund', 'cash_movement'));

ALTER TABLE expenses ALTER COLUMN expense_date SET DEFAULT get_business_date(now());
