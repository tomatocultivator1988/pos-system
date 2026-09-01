'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/session'

const PAGE = 1000

async function fetchAll(build: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += PAGE) {
    const q = build(from, from + PAGE - 1)
    const { data } = await q
    out.push(...(data ?? []))
    if ((data ?? []).length < PAGE) break
  }
  return out
}

function chunk<T>(arr: T[], size = 1000): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function getSalesReport(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()

  const list = await fetchAll((from, to) => {
    let query = supabase
      .from('orders')
      .select('id, customer_id, customers(name, member_number), order_number, grand_total, payment_method, subtotal, discount_total, tax_total, business_date, created_at, status, payment_status')
    if (dateFrom) query = query.gte('business_date', dateFrom)
    if (dateTo) query = query.lte('business_date', dateTo)
    return query.order('created_at', { ascending: false }).range(from, to)
  })
  // paid only: mirrors app/reports/page.tsx:38 and sales page — wag sirain existing, but fix missing voided check
  const valid = list.filter((o: any) => o.status !== 'voided' && o.payment_status !== 'voided' && o.payment_status !== 'refunded')

  const total_sales = valid.reduce((s: number, o: any) => s + Number(o.grand_total), 0)
  const total_discount = valid.reduce((s: number, o: any) => s + Number(o.discount_total || 0), 0)
  const total_orders = valid.length
  const avg_order = total_orders > 0 ? total_sales / total_orders : 0

  const by_method: Record<string, number> = {}
  for (const o of valid) {
    const m = o.payment_method || 'unknown'
    by_method[m] = Math.round(((by_method[m] || 0) + Number(o.grand_total)) * 100) / 100
  }

  return {
    orders: list,
    summary: {
      total_sales: Math.round(total_sales * 100) / 100,
      total_discount: Math.round(total_discount * 100) / 100,
      total_orders,
      average_order_value: Math.round(avg_order * 100) / 100,
      by_method,
    },
  }
}

export async function getExpenseReport(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()

  let query = supabase
    .from('expenses')
    .select('*, expense_category:expense_categories(name)')

  if (dateFrom) query = query.gte('business_date', dateFrom)
  if (dateTo) query = query.lte('business_date', dateTo)

  query = query.order('created_at', { ascending: false })

  const { data: expenses } = await query
  const list = expenses ?? []

  const total_expenses = list.reduce((s: number, e: any) => s + Number(e.amount), 0)
  const by_category: Record<string, { total: number; count: number }> = {}

  for (const e of list) {
    const cat = (e.expense_category as any)?.name || 'Uncategorized'
    if (!by_category[cat]) by_category[cat] = { total: 0, count: 0 }
    by_category[cat].total += Number(e.amount)
    by_category[cat].count++
  }

  return {
    expenses: list,
    summary: {
      total_expenses: Math.round(total_expenses * 100) / 100,
      by_category: Object.entries(by_category).map(([name, v]) => ({
        name,
        total: Math.round(v.total * 100) / 100,
        count: v.count,
      })),
    },
  }
}

export async function getInventoryUsageReport(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()

  let query = supabase
    .from('inventory_movements')
    .select('*, ingredient:ingredients(name, base_unit)')

  if (dateFrom) query = query.gte('business_date', dateFrom)
  if (dateTo) query = query.lte('business_date', dateTo)

  query = query.order('business_date')

  const { data: movements } = await query
  const list = movements ?? []

  const by_ingredient: Record<string, {
    ingredient_name: string
    base_unit: string
    opening: number
    added: number
    used: number
    adjusted: number
    closing: number
  }> = {}

  if (list.length > 0) {
    const { data: snapshot } = await supabase
      .from('ingredients')
      .select('id, name, base_unit, quantity_on_hand')
      .in('id', [...new Set(list.map((m: any) => m.ingredient_id))])

    const currentQty: Record<string, number> = {}
    for (const s of snapshot ?? []) {
      currentQty[s.id] = Number(s.quantity_on_hand)
    }

    for (const m of list) {
      const id = m.ingredient_id
      if (!by_ingredient[id]) {
        const ingredient = m.ingredient as any
        const name = ingredient?.name || 'Unknown'
        const unit = ingredient?.base_unit || 'pcs'
        by_ingredient[id] = {
          ingredient_name: name,
          base_unit: unit,
          opening: 0,
          added: 0,
          used: 0,
          adjusted: 0,
          closing: 0,
        }
      }

      if (m.movement_type === 'restock' || m.movement_type === 'opening_balance') {
        by_ingredient[id].added += Number(m.quantity_in)
      } else if (m.movement_type === 'sale_usage' || m.movement_type === 'waste' || m.movement_type === 'spoilage') {
        by_ingredient[id].used += Number(m.quantity_out)
      } else if (m.movement_type === 'manual_adjustment' || m.movement_type === 'sale_reversal') {
        by_ingredient[id].adjusted += Number(m.quantity_in) - Number(m.quantity_out)
      }
    }

    for (const [id, v] of Object.entries(by_ingredient)) {
      const current = currentQty[id] ?? 0
      v.closing = current
      v.opening = current + v.used - v.added - v.adjusted
    }
  }

  return Object.values(by_ingredient)
}

export async function getProductPerformanceReport(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()

  const list = await fetchAll((from, to) => {
    let query = supabase
      .from('order_items')
      .select('id, menu_item_id, item_name, quantity, line_total, order:orders!inner(business_date, status, payment_status)')
      .neq('order.status', 'voided')
      .neq('order.payment_status', 'voided')
      .neq('order.payment_status', 'refunded')
    if (dateFrom) query = query.gte('order.business_date', dateFrom)
    if (dateTo) query = query.lte('order.business_date', dateTo)
    return query.range(from, to)
  })

  const oids = [...new Set(list.map((i: any) => i.id))]
  const addonSum: Record<string, number> = {}
  if (oids.length > 0) {
    for (const batch of chunk(oids)) {
      const { data: adds } = await supabase.from('order_item_addons').select('order_item_id, line_total').in('order_item_id', batch)
      for (const a of adds ?? []) addonSum[a.order_item_id] = (addonSum[a.order_item_id] || 0) + Number(a.line_total)
    }
  }

  const agg: Record<string, { name: string; quantity: number; revenue: number }> = {}

  for (const i of list) {
    if (!agg[i.menu_item_id]) {
      agg[i.menu_item_id] = { name: i.item_name, quantity: 0, revenue: 0 }
    }
    agg[i.menu_item_id].quantity += i.quantity
    agg[i.menu_item_id].revenue += Number(i.line_total) + (addonSum[i.id] || 0)
  }

  const all = Object.entries(agg).map(([id, v]) => ({
    id,
    name: v.name,
    quantity: v.quantity,
    revenue: Math.round(v.revenue * 100) / 100,
  }))

  const top = [...all].sort((a, b) => b.quantity - a.quantity).slice(0, 10)
  const least = [...all].sort((a, b) => a.quantity - b.quantity).slice(0, 5)

  return { top, least }
}

const round = (n: number) => Math.round(n * 100) / 100

export async function getSalesByItemReport(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()

  const list = await fetchAll((from, to) => {
    let q = supabase
      .from('order_items')
      .select('id, order_id, menu_item_id, item_name, quantity, line_total, order:orders!inner(status, payment_status, business_date, customer_id, discount_total, grand_total)')
      .neq('order.status', 'voided')
      .neq('order.payment_status', 'voided')
      .neq('order.payment_status', 'refunded')
    if (dateFrom) q = q.gte('order.business_date', dateFrom)
    if (dateTo) q = q.lte('order.business_date', dateTo)
    return q.range(from, to)
  })

  const orderItemIds = [...new Set(list.map((i: any) => i.id))]
  const costByOrderItem: Record<string, number> = {}
  const addonSumByItem: Record<string, number> = {}
  if (orderItemIds.length > 0) {
    for (const batch of chunk(orderItemIds)) {
      const { data: movs } = await supabase
        .from('inventory_movements')
        .select('order_item_id, total_cost')
        .eq('movement_type', 'sale_usage')
        .in('order_item_id', batch)
      for (const m of movs ?? []) {
        costByOrderItem[m.order_item_id] = (costByOrderItem[m.order_item_id] || 0) + Number(m.total_cost)
      }
      const { data: adds } = await supabase.from('order_item_addons').select('order_item_id, line_total').in('order_item_id', batch)
      for (const a of adds ?? []) addonSumByItem[a.order_item_id] = (addonSumByItem[a.order_item_id] || 0) + Number(a.line_total)
    }
  }

  // For net sales: need order gross + discount per order to allocate pro-rata
  const grossByOrder: Record<string, number> = {}
  const discountByOrder: Record<string, number> = {}
  for (const i of list) {
    const oid = (i as any).order_id as string
    const gross = Number(i.line_total) + (addonSumByItem[i.id] || 0)
    grossByOrder[oid] = (grossByOrder[oid] || 0) + gross
    const disc = Number((i as any).order?.discount_total || 0)
    // discount same for all items in order, store once
    if (!(oid in discountByOrder)) discountByOrder[oid] = disc
  }

  const customerIds = [...new Set(list.map((i: any) => i.order?.customer_id).filter(Boolean))]
  const custMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    for (const batch of chunk(customerIds)) {
      const { data: custs } = await supabase.from('customers').select('id, name').in('id', batch)
      for (const c of custs ?? []) custMap[c.id] = c.name
    }
  }

  const { data: menuItems } = await supabase.from('menu_items').select('id, name, category_id')
  const { data: cats } = await supabase.from('menu_categories').select('id, name, sort_order')
  const menuMap = Object.fromEntries((menuItems ?? []).map((m: any) => [m.id, m]))
  const catMap = Object.fromEntries((cats ?? []).map((c: any) => [c.id, c.name]))
  const catSort = Object.fromEntries((cats ?? []).map((c: any) => [c.id, c.sort_order ?? 999]))

  type Acc = { name: string; category: string; categoryId: string | null; customer: string; qty: number; sales: number; net: number; cost: number }
  const agg: Record<string, Acc> = {}
  for (const i of list) {
    const mid = i.menu_item_id
    const custId = i.order?.customer_id
    const key = `${mid}|${custId || ''}`
    const oid = (i as any).order_id as string
    const gross = Number(i.line_total) + (addonSumByItem[i.id] || 0)
    const orderGross = grossByOrder[oid] || gross
    const orderDisc = discountByOrder[oid] || 0
    const net = orderDisc > 0 && orderGross > 0 ? gross - (gross / orderGross) * orderDisc : gross
    if (!agg[key]) {
      const mi = menuMap[mid]
      agg[key] = {
        name: i.item_name || mi?.name || 'Unknown',
        category: catMap[mi?.category_id] || '—',
        categoryId: mi?.category_id ?? null,
        customer: custId ? (custMap[custId] || 'Customer') : '—',
        qty: 0,
        sales: 0,
        net: 0,
        cost: 0,
      }
    }
    agg[key].qty += Number(i.quantity)
    agg[key].sales += gross
    agg[key].net += net
    agg[key].cost += costByOrderItem[i.id] || 0
  }

  const rows = Object.entries(agg)
    .map(([key, v]) => {
      const profit = v.net - v.cost
      return {
        id: key,
        menu_item_id: key.split('|')[0],
        name: v.name,
        category: v.category,
        categoryId: v.categoryId,
        customer: v.customer,
        qty: v.qty,
        sales: round(v.sales),
        net: round(v.net),
        cost: round(v.cost),
        profit: round(profit),
        margin: v.net > 0 ? round((profit / v.net) * 100) : 0,
      }
    })
    .sort((a, b) => ((catSort[a.categoryId ?? ''] ?? 999) - (catSort[b.categoryId ?? ''] ?? 999)) || (b.sales - a.sales))

  const itemSales: Record<string, { name: string; sales: number }> = {}
  for (const r of rows) {
    if (!itemSales[r.menu_item_id]) itemSales[r.menu_item_id] = { name: r.name, sales: 0 }
    itemSales[r.menu_item_id].sales += r.sales
  }
  const top = Object.values(itemSales).sort((a, b) => b.sales - a.sales)[0]
  const topProduct = top ? { name: top.name, sales: round(top.sales) } : null

  const totals = {
    items_sold: rows.reduce((s, r) => s + r.qty, 0),
    sales: round(rows.reduce((s, r) => s + r.sales, 0)),
    net: round(rows.reduce((s, r) => s + r.net, 0)),
    cost: round(rows.reduce((s, r) => s + r.cost, 0)),
    profit: round(rows.reduce((s, r) => s + r.profit, 0)),
  }

  return { rows, topProduct, totals }
}

export async function getSalesByCategoryReport(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const list = await fetchAll((from, to) => {
    let q = supabase
      .from('order_items')
      .select('id, order_id, menu_item_id, item_name, quantity, line_total, order:orders!inner(status, payment_status, business_date, discount_total, grand_total)')
      .neq('order.status', 'voided')
      .neq('order.payment_status', 'voided')
      .neq('order.payment_status', 'refunded')
    if (dateFrom) q = q.gte('order.business_date', dateFrom)
    if (dateTo) q = q.lte('order.business_date', dateTo)
    return q.range(from, to)
  })
  const orderItemIds = [...new Set(list.map((i: any) => i.id))]
  const costByOrderItem: Record<string, number> = {}
  const addonSum: Record<string, number> = {}
  if (orderItemIds.length > 0) {
    for (const batch of chunk(orderItemIds)) {
      const { data: movs } = await supabase.from('inventory_movements').select('order_item_id, total_cost').eq('movement_type', 'sale_usage').in('order_item_id', batch)
      for (const m of movs ?? []) costByOrderItem[m.order_item_id] = (costByOrderItem[m.order_item_id] || 0) + Number(m.total_cost)
      const { data: adds } = await supabase.from('order_item_addons').select('order_item_id, line_total').in('order_item_id', batch)
      for (const a of adds ?? []) addonSum[a.order_item_id] = (addonSum[a.order_item_id] || 0) + Number(a.line_total)
    }
  }
  // gross per order for discount allocation
  const grossByOrder: Record<string, number> = {}
  const discountByOrder: Record<string, number> = {}
  for (const i of list) {
    const oid = (i as any).order_id as string
    const gross = Number(i.line_total) + (addonSum[i.id] || 0)
    grossByOrder[oid] = (grossByOrder[oid] || 0) + gross
    if (!(oid in discountByOrder)) discountByOrder[oid] = Number((i as any).order?.discount_total || 0)
  }
  const { data: menuItems } = await supabase.from('menu_items').select('id, name, category_id')
  const { data: cats } = await supabase.from('menu_categories').select('id, name, sort_order')
  const menuMap = Object.fromEntries((menuItems ?? []).map((m: any) => [m.id, m]))
  const catMap = Object.fromEntries((cats ?? []).map((c: any) => [c.id, c.name]))
  const catSort = Object.fromEntries((cats ?? []).map((c: any) => [c.id, c.sort_order ?? 999]))
  type Acc = { name: string; categoryId: string | null; qty: number; sales: number; net: number; cost: number }
  const agg: Record<string, Acc> = {}
  for (const i of list) {
    const mi = menuMap[i.menu_item_id]
    const catId = mi?.category_id ?? null
    const catName = catId ? (catMap[catId] || 'Uncategorized') : 'Uncategorized'
    const key = catId || '__uncat__'
    const oid = (i as any).order_id as string
    const gross = Number(i.line_total) + (addonSum[i.id] || 0)
    const orderGross = grossByOrder[oid] || gross
    const orderDisc = discountByOrder[oid] || 0
    const net = orderDisc > 0 && orderGross > 0 ? gross - (gross / orderGross) * orderDisc : gross
    if (!agg[key]) agg[key] = { name: catName, categoryId: catId, qty: 0, sales: 0, net: 0, cost: 0 }
    agg[key].qty += Number(i.quantity)
    agg[key].sales += gross
    agg[key].net += net
    agg[key].cost += costByOrderItem[i.id] || 0
  }
  const rows = Object.entries(agg)
    .map(([key, v]) => {
      const profit = v.net - v.cost
      return { id: key, category: v.name, categoryId: v.categoryId, qty: v.qty, sales: round(v.sales), net: round(v.net), cost: round(v.cost), profit: round(profit), margin: v.net > 0 ? round((profit / v.net) * 100) : 0 }
    })
    .sort((a, b) => (catSort[a.categoryId ?? ''] ?? 999) - (catSort[b.categoryId ?? ''] ?? 999) || b.sales - a.sales)
  const top = [...rows].sort((a, b) => b.sales - a.sales)[0]
  const topCategory = top ? { name: top.category, sales: top.sales } : null
  const totals = { items_sold: rows.reduce((s, r) => s + r.qty, 0), sales: round(rows.reduce((s, r) => s + r.sales, 0)), net: round(rows.reduce((s, r) => s + r.net, 0)), cost: round(rows.reduce((s, r) => s + r.cost, 0)), profit: round(rows.reduce((s, r) => s + r.profit, 0)) }
  return { rows, topCategory, totals }
}

export async function getSalesByPaymentTypeReport(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const valid = await fetchAll((from, to) => {
    let q = supabase.from('orders').select('id, payment_method, grand_total, business_date, status, payment_status').neq('status', 'voided').neq('payment_status', 'voided').neq('payment_status', 'refunded')
    if (dateFrom) q = q.gte('business_date', dateFrom)
    if (dateTo) q = q.lte('business_date', dateTo)
    return q.range(from, to)
  })
  const orderIds = valid.map((o: any) => o.id)
  const costByOrder: Record<string, number> = {}
  const salesByOrder: Record<string, number> = {}
  const qtyByOrder: Record<string, number> = {}
  if (orderIds.length > 0) {
    let items: any[] = []
    for (const batch of chunk(orderIds)) {
      const { data: it } = await supabase.from('order_items').select('id, order_id, quantity, line_total').in('order_id', batch)
      items.push(...(it ?? []))
    }
    const oids = [...new Set(items.map((i: any) => i.id))]
    const costByItem: Record<string, number> = {}
    const addonSum: Record<string, number> = {}
    if (oids.length > 0) {
      for (const batch of chunk(oids)) {
        const { data: movs } = await supabase.from('inventory_movements').select('order_item_id, total_cost').eq('movement_type', 'sale_usage').in('order_item_id', batch)
        for (const m of movs ?? []) costByItem[m.order_item_id] = (costByItem[m.order_item_id] || 0) + Number(m.total_cost)
        const { data: adds } = await supabase.from('order_item_addons').select('order_item_id, line_total').in('order_item_id', batch)
        for (const a of adds ?? []) addonSum[a.order_item_id] = (addonSum[a.order_item_id] || 0) + Number(a.line_total)
      }
    }
    for (const it of items) {
      const c = (costByItem[it.id] || 0)
      const s = Number(it.line_total) + (addonSum[it.id] || 0)
      costByOrder[it.order_id] = (costByOrder[it.order_id] || 0) + c
      salesByOrder[it.order_id] = (salesByOrder[it.order_id] || 0) + s
      qtyByOrder[it.order_id] = (qtyByOrder[it.order_id] || 0) + Number(it.quantity)
    }
  }
  type Agg = { method: string; orders: number; qty: number; sales: number; net: number; cost: number }
  const agg: Record<string, Agg> = {}
  for (const o of valid) {
    const m = o.payment_method || 'unknown'
    if (!agg[m]) agg[m] = { method: m, orders: 0, qty: 0, sales: 0, net: 0, cost: 0 }
    agg[m].orders += 1
    const gross = salesByOrder[o.id] ?? Number(o.grand_total)
    const net = Number(o.grand_total)
    agg[m].sales += gross
    agg[m].net += net
    agg[m].cost += costByOrder[o.id] || 0
    agg[m].qty += qtyByOrder[o.id] || 0
  }
  const rows = Object.values(agg)
    .map(v => {
      const profit = v.net - v.cost
      return { id: v.method, method: v.method, orders: v.orders, qty: v.qty, sales: round(v.sales), net: round(v.net), cost: round(v.cost), profit: round(profit), margin: v.net > 0 ? round((profit / v.net) * 100) : 0, avg: v.orders ? round(v.net / v.orders) : 0 }
    })
    .sort((a, b) => b.sales - a.sales)
  const top = rows[0]
  const topMethod = top ? { name: top.method, sales: top.sales } : null
  const totals = { orders: rows.reduce((s, r) => s + r.orders, 0), items_sold: rows.reduce((s, r) => s + r.qty, 0), sales: round(rows.reduce((s, r) => s + r.sales, 0)), net: round(rows.reduce((s, r) => s + r.net, 0)), cost: round(rows.reduce((s, r) => s + r.cost, 0)), profit: round(rows.reduce((s, r) => s + r.profit, 0)) }
  return { rows, topMethod, totals }
}
