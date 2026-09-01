'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/session'

export async function getBusinessSettings() {
  await requireRole(['admin', 'cashier'])()
  const supabase = await createClient()
  const { data, error } = await supabase.from('business_settings').select('*').limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

function clampRate(value: number | undefined): number {
  if (value === undefined || value === null || isNaN(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export async function updateBusinessSettings(data: {
  business_name?: string; address?: string; phone?: string
  currency_code?: string; timezone?: string; tax_rate?: number
  service_charge_rate?: number; business_day_cutoff_time?: string
  default_low_stock_behavior?: 'warn' | 'block'
}) {
  await requireRole(['admin'])()
  const sanitized = {
    ...data,
    tax_rate: clampRate(data.tax_rate),
    service_charge_rate: clampRate(data.service_charge_rate),
  }
  const supabase = await createClient()
  const existing = await supabase.from('business_settings').select('id').limit(1).maybeSingle()
  if (existing.data) {
    const { error } = await supabase.from('business_settings').update(sanitized).eq('id', existing.data.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('business_settings').insert(sanitized)
    if (error) throw new Error(error.message)
  }
  const { data: result } = await supabase.from('business_settings').select('*').limit(1).maybeSingle()
  return result
}
