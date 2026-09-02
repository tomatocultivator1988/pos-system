'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/session'

export async function getSales(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin'])()

  const supabase = await createClient()
  let query = supabase
    .from('orders')
    .select(`
      id, order_number, grand_total, payment_method, status, payment_status,
      created_at, business_date,
      cashier:users!orders_cashier_user_id_fkey(name),
      customer:customers(name),
      order_items(id, item_name, variant_name, unit_price, quantity, line_total)
    `)
    .order('created_at', { ascending: false })

  if (dateFrom) query = query.gte('business_date', dateFrom)
  if (dateTo) query = query.lte('business_date', dateTo)

  const { data } = await query
  return data || []
}

export async function getSale(id: string) {
  await requireRole(['admin'])()

  const supabase = await createClient()
  const { data } = await supabase
    .from('orders')
    .select(`
      *,
      order_items(*, order_item_addons(*)),
      payments(*),
      order_status_history(*),
      order_reversals(*)
    `)
    .eq('id', id)
    .single()

  return data
}
