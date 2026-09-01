'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/session'
import { getBusinessDate } from '@/lib/business-date'

export async function getIngredients(search?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  let query = supabase.from('ingredients').select('*').order('name')
  if (search) query = query.ilike('name', `%${search}%`)
  const { data } = await query
  return data ?? []
}

export async function createIngredient(data: { name: string; base_unit: string; reorder_level?: number; weighted_average_unit_cost?: number }) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data: result, error } = await supabase.from('ingredients').insert({
    name: data.name,
    base_unit: data.base_unit,
    reorder_level: data.reorder_level ?? 0,
    weighted_average_unit_cost: data.weighted_average_unit_cost ?? 0,
  }).select().single()
  if (error) throw new Error(error.message)
  return result
}

export async function updateIngredient(id: string, data: Partial<{
  name: string; base_unit: string; reorder_level: number; is_active: boolean; weighted_average_unit_cost: number
}>) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data: result, error } = await supabase.from('ingredients').update(data).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return result
}

export async function getInventoryMovements(
  ingredientId?: string, dateFrom?: string, dateTo?: string,
  page = 1, pageSize = 50
) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  let query = supabase
    .from('inventory_movements')
    .select('*, ingredient:ingredients(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (ingredientId) query = query.eq('ingredient_id', ingredientId)
  if (dateFrom) query = query.gte('business_date', dateFrom)
  if (dateTo) query = query.lte('business_date', dateTo)
  const { data, count } = await query
  return { data: data ?? [], count: count ?? 0 }
}

export async function getStockReceipts(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  let query = supabase
    .from('stock_receipts')
    .select('*, stock_receipt_items(*), users!received_by_user_id(name)')
    .order('received_at', { ascending: false })
  if (dateFrom) query = query.gte('business_date', dateFrom)
  if (dateTo) query = query.lte('business_date', dateTo)
  const { data } = await query
  return data ?? []
}

export async function createStockReceipt(
  items: { ingredientId: string; quantity: number; unitCost: number }[]
) {
  const user = await requireRole(['admin'])()
  const supabase = await createClient()
  const bizDate = getBusinessDate()

  const payload = items.map(i => ({
    ingredient_id: i.ingredientId,
    quantity: i.quantity,
    unit_cost: i.unitCost,
  }))

  const { error } = await supabase.rpc('create_stock_receipt_v1', {
    p_received_by_user_id: user.id,
    p_items: payload,
    p_business_date: bizDate,
  })
  if (error) throw new Error(error.message)
}

export async function createAdjustment(
  ingredientId: string,
  type: 'waste' | 'spoilage' | 'manual_count' | 'correction' | 'opening_balance',
  quantityDelta: number,
  reason: string
) {
  const user = await requireRole(['admin'])()
  const supabase = await createClient()
  const bizDate = getBusinessDate()

  const { error } = await supabase.rpc('create_inventory_adjustment_v1', {
    p_ingredient_id: ingredientId,
    p_adjustment_type: type,
    p_quantity_delta: quantityDelta,
    p_reason: reason,
    p_actor_user_id: user.id,
    p_business_date: bizDate,
  })
  if (error) throw new Error(error.message)
}

export async function getLowStockIngredients() {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data } = await supabase.from('ingredients').select('*').eq('is_active', true)
  return (data ?? []).filter((i: any) => Number(i.quantity_on_hand) <= Number(i.reorder_level))
}

export async function getInventoryValuation() {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data } = await supabase.from('ingredients').select('quantity_on_hand, weighted_average_unit_cost').eq('is_active', true)
  const total = (data ?? []).reduce(
    (sum: number, i: any) => sum + Number(i.quantity_on_hand) * Number(i.weighted_average_unit_cost),
    0
  )
  return Math.round(total * 100) / 100
}

export async function getDailyUsage(businessDate?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const bizDate = businessDate || getBusinessDate()

  const { data } = await supabase
    .from('inventory_movements')
    .select('ingredient_id, quantity_out, total_cost, ingredients(name)')
    .eq('movement_type', 'sale_usage')
    .eq('business_date', bizDate)
    .order('created_at')

  const byIng: Record<string, { ingredient_id: string; ingredient_name: string; quantity_out: number; cost: number }> = {}
  let total = 0
  for (const m of data ?? []) {
    const qty = Number(m.quantity_out)
    const cost = Number(m.total_cost)
    total += cost
    const id = m.ingredient_id
    if (!byIng[id]) {
      byIng[id] = { ingredient_id: id, ingredient_name: (m.ingredients as any)?.name ?? 'Unknown', quantity_out: 0, cost: 0 }
    }
    byIng[id].quantity_out += qty
    byIng[id].cost += cost
  }

  const lines = Object.values(byIng).map(l => ({
    ...l,
    quantity_out: Math.round(l.quantity_out * 10000) / 10000,
    cost: Math.round(l.cost * 100) / 100,
  })).sort((a, b) => b.cost - a.cost)

  return { total_cost: Math.round(total * 100) / 100, lines }
}
