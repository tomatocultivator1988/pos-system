'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/session'
import { getBusinessDateServer } from '@/lib/business-date-server'

export async function getExpenseCategories() {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()
  const { data } = await supabase.from('expense_categories').select('*').eq('is_active', true).order('sort_order')
  return data ?? []
}

export async function createExpense(data: {
  expense_category_id: string; description: string; amount: number
  expense_date?: string; payment_method?: string; reference_number?: string; notes?: string
}) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const bizDate = await getBusinessDateServer()
  const { data: result, error } = await supabase.from('expenses').insert({
    expense_category_id: data.expense_category_id,
    description: data.description,
    amount: data.amount,
    expense_date: data.expense_date ?? bizDate,
    payment_method: data.payment_method,
    reference_number: data.reference_number,
    notes: data.notes,
    business_date: bizDate,
  }).select().single()
  if (error) throw new Error(error.message)
  return result
}

export async function getExpenses(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  let query = supabase
    .from('expenses')
    .select('*, expense_category:expense_categories(name)')
    .order('created_at', { ascending: false })
  if (dateFrom) query = query.gte('business_date', dateFrom)
  if (dateTo) query = query.lte('business_date', dateTo)
  const { data } = await query
  return data ?? []
}

export async function getExpensesByCategory(dateFrom?: string, dateTo?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  let query = supabase
    .from('expenses')
    .select('amount, expense_category:expense_categories(name)')
  if (dateFrom) query = query.gte('business_date', dateFrom)
  if (dateTo) query = query.lte('business_date', dateTo)
  const { data } = await query

  const agg: Record<string, { total: number; count: number }> = {}
  for (const e of data ?? []) {
    const cat = (e.expense_category as any)?.name ?? 'Uncategorized'
    if (!agg[cat]) agg[cat] = { total: 0, count: 0 }
    agg[cat].total += Number(e.amount)
    agg[cat].count++
  }

  return Object.entries(agg).map(([name, v]) => ({
    name,
    total: Math.round(v.total * 100) / 100,
    count: v.count,
  }))
}
