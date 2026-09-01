'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/session'

export async function getCustomers(search?: string) {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()
  let query = supabase
    .from('customers')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (search) {
    query = query.or(`name.ilike.%${search}%,mobile_number.ilike.%${search}%`)
  }
  const { data } = await query
  return data ?? []
}

export async function createCustomer(data: {
  name: string; mobile_number?: string; email?: string; member_number?: string
}) {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()

  let member_number = data.member_number
  if (!member_number) {
    const { data: last } = await supabase.from('customers').select('member_number').order('created_at', { ascending: false }).limit(1).maybeSingle()
    const lastNum = last?.member_number ? parseInt((last.member_number as string).replace(/\D/g, '')) || 0 : 0
    member_number = `MEM-${String(lastNum + 1).padStart(4, '0')}`
  }
  const { data: result, error } = await supabase
    .from('customers')
    .insert({ ...data, member_number })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function getCustomer(id: string) {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()
  const { data } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()
  return data
}

export async function getCustomerLoyaltyHistory(customerId: string) {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()
  const { data } = await supabase
    .from('loyalty_transactions')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function adjustCustomerPoints(customerId: string, delta: number, reason?: string) {
  const user = await requireRole(['admin'])()
  const supabase = await createClient()

  const { data: cust } = await supabase
    .from('customers')
    .select('loyalty_points_balance')
    .eq('id', customerId)
    .single()
  if (!cust) throw new Error('Customer not found')

  const newBalance = Math.max(0, Number(cust.loyalty_points_balance) + delta)

  const { error } = await supabase
    .from('customers')
    .update({ loyalty_points_balance: newBalance })
    .eq('id', customerId)
  if (error) throw new Error(error.message)

  const { error: txErr } = await supabase
    .from('loyalty_transactions')
    .insert({
      customer_id: customerId,
      transaction_type: 'adjust',
      points_delta: delta,
      balance_after: newBalance,
      reason: reason || null,
      actor_user_id: user.id,
    })
  if (txErr) throw new Error(txErr.message)

  return newBalance
}
