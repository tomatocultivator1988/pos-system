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

  if (data.member_number) {
    const { data: result, error } = await supabase
      .from('customers')
      .insert({ ...data, member_number: data.member_number })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return result
  }

  // Two cashiers creating customers at once can compute the same next number;
  // retry on the unique violation with a freshly-read counter.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: last } = await supabase
      .from('customers')
      .select('member_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const lastNum = last?.member_number ? parseInt((last.member_number as string).replace(/\D/g, '')) || 0 : 0
    const member_number = `MEM-${String(lastNum + 1).padStart(4, '0')}`

    const { data: result, error } = await supabase
      .from('customers')
      .insert({ name: data.name, mobile_number: data.mobile_number, email: data.email, member_number })
      .select()
      .single()

    if (!error) return result
    if (!error.message.includes('member_number') && !error.message.includes('duplicate')) {
      throw new Error(error.message)
    }
  }
  throw new Error('Could not allocate a member number — please try again')
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

  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error('Point delta must be a non-zero whole number')
  }

  // Atomic server-side: locks the customer row, clamps at zero, and logs the
  // actually-applied delta so the balance reconciles with the ledger.
  const { data, error } = await supabase.rpc('adjust_customer_points_v1', {
    p_customer_id: customerId,
    p_delta: delta,
    p_reason: reason || null,
    p_actor_user_id: user.id,
  })
  if (error) throw new Error(error.message)

  return data?.balance ?? null
}
