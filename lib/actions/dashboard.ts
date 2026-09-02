'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/session'
import { getBusinessDateServer } from '@/lib/business-date-server'

export async function getDashboardSummary(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()

  // Default to the current business date — the dashboard presents these
  // numbers as "Today's Sales", so an unscoped (all-time) query is wrong.
  if (!dateFrom && !dateTo) {
    const today = await getBusinessDateServer()
    dateFrom = today
    dateTo = today
  }

  let orderQuery = supabase
    .from('orders')
    .select('grand_total, payment_method, id')
    .eq('payment_status', 'paid')

  if (dateFrom) orderQuery = orderQuery.gte('business_date', dateFrom)
  if (dateTo) orderQuery = orderQuery.lte('business_date', dateTo)

  const { data: orders } = await orderQuery
  const completed = orders ?? []

  const total_sales = Math.round(completed.reduce((sum: number, o: any) => sum + Number(o.grand_total), 0) * 100) / 100
  const cash_sales = Math.round(completed
    .filter((o: any) => o.payment_method === 'cash')
    .reduce((sum: number, o: any) => sum + Number(o.grand_total), 0) * 100) / 100
  const gcash_sales = Math.round(completed
    .filter((o: any) => o.payment_method === 'gcash')
    .reduce((sum: number, o: any) => sum + Number(o.grand_total), 0) * 100) / 100
  const bpi_sales = Math.round(completed
    .filter((o: any) => o.payment_method === 'bpi_bank_transfer')
    .reduce((sum: number, o: any) => sum + Number(o.grand_total), 0) * 100) / 100
  const unionbank_sales = Math.round(completed
    .filter((o: any) => o.payment_method === 'unionbank_bank_transfer')
    .reduce((sum: number, o: any) => sum + Number(o.grand_total), 0) * 100) / 100
  const order_count = completed.length
  const average_order_value = order_count > 0 ? Math.round((total_sales / order_count) * 100) / 100 : 0

  let invQuery = supabase
    .from('inventory_movements')
    .select('total_cost')
    .eq('movement_type', 'sale_usage')

  if (dateFrom) invQuery = invQuery.gte('business_date', dateFrom)
  if (dateTo) invQuery = invQuery.lte('business_date', dateTo)

  const { data: movements } = await invQuery
  const ingredient_cost_used = Math.round((movements ?? []).reduce((sum: number, m: any) => sum + Number(m.total_cost), 0) * 100) / 100
  const estimated_gross_margin = Math.round((total_sales - ingredient_cost_used) * 100) / 100

  return {
    total_sales,
    cash_sales,
    gcash_sales,
    bpi_sales,
    unionbank_sales,
    order_count,
    average_order_value,
    ingredient_cost_used,
    estimated_gross_margin,
  }
}

export async function getSalesTrend(days: number = 7) {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()

  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - days + 1)
  const from = await getBusinessDateServer(fromDate)
  const to = await getBusinessDateServer()

  const { data: orders } = await supabase
    .from('orders')
    .select('business_date, grand_total')
    .eq('payment_status', 'paid')
    .gte('business_date', from)
    .lte('business_date', to)
    .order('business_date')

  const daily: Record<string, number> = {}
  for (let i = 0; i < days; i++) {
    const d = new Date(fromDate)
    d.setDate(d.getDate() + i)
    daily[await getBusinessDateServer(d)] = 0
  }

  for (const o of orders ?? []) {
    const key = o.business_date
    if (daily[key] !== undefined) {
      daily[key] = Math.round((daily[key] + Number(o.grand_total)) * 100) / 100
    }
  }

  return Object.entries(daily).map(([date, total]) => ({
    date,
    total,
  }))
}

export async function getPaymentSplit(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()

  let query = supabase
    .from('payments')
    .select('method, amount')
    .is('voided_at', null)
    .is('refunded_at', null)

  if (dateFrom) query = query.gte('business_date', dateFrom)
  if (dateTo) query = query.lte('business_date', dateTo)

  const { data: payments } = await query
  const list = payments ?? []

  const byMethod: Record<string, number> = {}
  let total = 0
  for (const p of list) {
    const m = p.method || 'unknown'
    byMethod[m] = Math.round(((byMethod[m] || 0) + Number(p.amount)) * 100) / 100
    total = Math.round((total + Number(p.amount)) * 100) / 100
  }

  return { ...byMethod, total }
}

export async function getTopSellingItems(dateFrom?: string, dateTo?: string, limit: number = 10) {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()

  let query = supabase
    .from('order_items')
    .select('menu_item_id, item_name, quantity, unit_price, line_total, order:orders!inner(business_date, payment_status)')
    .eq('order.payment_status', 'paid')

  if (dateFrom) query = query.gte('order.business_date', dateFrom)
  if (dateTo) query = query.lte('order.business_date', dateTo)

  const { data: items } = await query
  const agg: Record<string, { name: string; quantity: number; revenue: number }> = {}

  for (const i of items ?? []) {
    if (!agg[i.menu_item_id]) {
      agg[i.menu_item_id] = { name: i.item_name, quantity: 0, revenue: 0 }
    }
    agg[i.menu_item_id].quantity += i.quantity
    agg[i.menu_item_id].revenue += Number(i.line_total)
  }

  return Object.entries(agg)
    .map(([id, v]) => ({ id, name: v.name, quantity: v.quantity, revenue: Math.round(v.revenue * 100) / 100 }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit)
}

export async function getLeastSellingItems(dateFrom?: string, dateTo?: string, limit: number = 5) {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()

  let orderItemsQuery = supabase
    .from('order_items')
    .select('menu_item_id, item_name, quantity, order:orders!inner(business_date, payment_status)')
    .eq('order.payment_status', 'paid')

  if (dateFrom) orderItemsQuery = orderItemsQuery.gte('order.business_date', dateFrom)
  if (dateTo) orderItemsQuery = orderItemsQuery.lte('order.business_date', dateTo)

  const { data: sold } = await orderItemsQuery
  const soldQty: Record<string, number> = {}
  const soldNames: Record<string, string> = {}
  for (const i of sold ?? []) {
    if (!soldQty[i.menu_item_id]) { soldQty[i.menu_item_id] = 0; soldNames[i.menu_item_id] = i.item_name }
    soldQty[i.menu_item_id] += i.quantity
  }

  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name, is_active')
    .eq('is_active', true)
    .order('name')

  const items = (menuItems ?? [])
    .map((m: any) => ({
      id: m.id,
      name: m.name,
      quantity_sold: soldQty[m.id] ?? 0,
    }))
    .sort((a: any, b: any) => a.quantity_sold - b.quantity_sold)
    .slice(0, limit)

  return items
}

export async function getLowStockSummary() {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()
  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('id, name, quantity_on_hand, reorder_level, base_unit')
    .eq('is_active', true)
    .not('reorder_level', 'is', null)

  const all = (ingredients ?? []).map((i: any) => ({
    ...i,
    status: Number(i.quantity_on_hand) === 0 ? 'out' : Number(i.quantity_on_hand) <= Number(i.reorder_level) ? 'low' : 'ok',
  }))
  const flagged = all.filter((i: any) => i.status !== 'ok')
  const outCount = all.filter((i: any) => i.status === 'out').length
  const lowCount = all.filter((i: any) => i.status === 'low').length
  const low = flagged.map((i: any) => ({ ...i, is_out: i.status === 'out' }))
  return { count: low.length, outCount, lowCount, items: low }
}

export async function getInventoryValue() {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('quantity_on_hand, weighted_average_unit_cost')
    .eq('is_active', true)

  const total = (ingredients ?? []).reduce(
    (sum: number, i: any) => sum + Number(i.quantity_on_hand) * Number(i.weighted_average_unit_cost),
    0
  )

  return Math.round(total * 100) / 100
}
