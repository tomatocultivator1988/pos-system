'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/session'

const round = (value: number) => Math.round(value * 100) / 100

export async function getActiveCashShift() {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()
  const { data: shift, error } = await supabase
    .from('cash_shifts')
    .select('*, opened_by:users!cash_shifts_opened_by_user_id_fkey(name)')
    .eq('status', 'open')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!shift) return null

  // Fetch recent movements for UI display (most recent 50)
  const { data: movements, error: movementError } = await supabase
    .from('cash_drawer_movements')
    .select('*')
    .eq('cash_shift_id', shift.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (movementError) throw new Error(movementError.message)

  // Calculate live expected cash across all movements of this shift
  const { data: totals, error: totalsError } = await supabase
    .from('cash_drawer_movements')
    .select('direction, amount, movement_type')
    .eq('cash_shift_id', shift.id)
  if (totalsError) throw new Error(totalsError.message)

  let expected_cash = 0
  let cash_sales = 0
  let cash_in = 0
  let cash_out = 0
  let cash_expenses = 0
  let cash_refunds = 0

  for (const m of totals || []) {
    const amt = Number(m.amount) || 0
    if (m.direction === 'in') {
      expected_cash += amt
      if (m.movement_type === 'cash_sale') cash_sales += amt
      if (m.movement_type === 'cash_in') cash_in += amt
    } else {
      expected_cash -= amt
      if (m.movement_type === 'cash_out') cash_out += amt
      if (m.movement_type === 'cash_expense') cash_expenses += amt
      if (m.movement_type === 'cash_refund' || m.movement_type === 'cash_void') cash_refunds += amt
    }
  }

  return {
    ...shift,
    expected_cash: round(expected_cash),
    stats: {
      cash_sales: round(cash_sales),
      cash_in: round(cash_in),
      cash_out: round(cash_out),
      cash_expenses: round(cash_expenses),
      cash_refunds: round(cash_refunds),
    },
    movements: movements ?? [],
  }
}

export async function getCashShiftHistory() {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cash_shifts')
    .select('*, opened_by:users!cash_shifts_opened_by_user_id_fkey(name), closed_by:users!cash_shifts_closed_by_user_id_fkey(name)')
    .order('opened_at', { ascending: false })
    .limit(30)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function openCashShift(openingCash: number, note?: string) {
  const user = await requireRole(['admin', 'cashier'])()
  if (!Number.isFinite(openingCash) || openingCash < 0) throw new Error('Starting cash must be zero or more')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('open_cash_shift_v1', {
    p_actor_user_id: user.id,
    p_opening_cash: round(openingCash),
    p_note: note || null,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function recordCashMovement(direction: 'in' | 'out', amount: number, reason: string) {
  const user = await requireRole(['admin'])()
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero')
  const supabase = await createClient()
  const idempotencyKey = crypto.randomUUID()
  const { error } = await supabase.rpc('record_cash_movement_v1', {
    p_actor_user_id: user.id,
    p_direction: direction,
    p_amount: round(amount),
    p_reason: reason.trim(),
    p_idempotency_key: idempotencyKey,
  })
  if (error) throw new Error(error.message)
}

export async function closeCashShift(countedCash: number, note?: string, varianceReason?: string) {
  const user = await requireRole(['admin', 'cashier'])()
  if (!Number.isFinite(countedCash) || countedCash < 0) throw new Error('Counted cash must be zero or more')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('close_cash_shift_v1', {
    p_actor_user_id: user.id,
    p_counted_cash: round(countedCash),
    p_note: note || null,
    p_variance_reason: varianceReason || null,
  })
  if (error) throw new Error(error.message)
  return data
}
