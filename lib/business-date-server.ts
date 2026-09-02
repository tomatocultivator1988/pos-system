// Server-side business-date computation that mirrors the DB's
// get_business_date(): honors business_settings.timezone and
// business_day_cutoff_time instead of hardcoding Asia/Manila + midnight.
// Server actions writing business_date (receipts, adjustments, expenses,
// report windows) must use this so they agree with order business dates.
import { createClient } from '@/lib/supabase/server'

interface BizDateConfig {
  timezone: string
  cutoffMinutes: number
}

let cachedConfig: { value: BizDateConfig; expiresAt: number } | null = null

async function getConfig(): Promise<BizDateConfig> {
  if (cachedConfig && Date.now() < cachedConfig.expiresAt) return cachedConfig.value
  let value: BizDateConfig = { timezone: 'Asia/Manila', cutoffMinutes: 0 }
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('business_settings')
      .select('timezone, business_day_cutoff_time')
      .limit(1)
      .maybeSingle()
    if (data?.timezone) value.timezone = data.timezone
    if (data?.business_day_cutoff_time) {
      const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(data.business_day_cutoff_time)
      if (m) value.cutoffMinutes = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / 60 : 0)
    }
  } catch {
    // Fall back to defaults if settings can't be read.
  }
  cachedConfig = { value, expiresAt: Date.now() + 60_000 }
  return value
}

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  const parts = fmt.formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '0'
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10) + parseInt(get('second'), 10) / 60,
  }
}

export async function getBusinessDateServer(date?: Date): Promise<string> {
  const now = date || new Date()
  const { timezone, cutoffMinutes } = await getConfig()
  const { dateKey, minutes } = zonedParts(now, timezone)
  if (minutes < cutoffMinutes) {
    const [y, m, d] = dateKey.split('-').map(Number)
    const prev = new Date(Date.UTC(y, m - 1, d - 1))
    const mm = String(prev.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(prev.getUTCDate()).padStart(2, '0')
    return `${prev.getUTCFullYear()}-${mm}-${dd}`
  }
  return dateKey
}
