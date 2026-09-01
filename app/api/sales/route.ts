import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { sha256 } from '@/lib/crypto'

async function getActor(requireAdmin = false) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('cafe_session')
  if (!sessionCookie) return null

  const tokenHash = await sha256(sessionCookie.value)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: session } = await supabase
    .from('sessions')
    .select('user:users(id, role, is_active)')
    .eq('token_hash', tokenHash)
    .gte('expires_at', new Date().toISOString())
    .is('revoked_at', null)
    .single()

  const user = session?.user as { id: string; role: string; is_active: boolean } | undefined
  if (!user || !user.is_active) return null
  if (requireAdmin && user.role !== 'admin') return null
  return { id: user.id, supabase }
}

export async function GET(request: Request) {
  try {
    const actor = await getActor(true)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { supabase } = actor

    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    if (isNaN(page)) return NextResponse.json({ error: 'Invalid page parameter' }, { status: 400 })
    const pageSize = 50
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data: sales, count, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, grand_total, subtotal, discount_total, discount_type, tax_total, payment_method, status, payment_status, created_at,
        order_items(id, item_name, variant_name, unit_price, quantity, line_total, order_item_addons(id, addon_name, unit_price, quantity))
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw new Error('Failed to load sales')

    return NextResponse.json({ sales: sales || [], total: count || 0, page, pageSize })
  } catch {
    return NextResponse.json({ error: 'Failed to load sales' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getActor(true)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { supabase } = actor

    const body = await request.json()
    const action = body.action
    if (action !== 'void' && action !== 'refund') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    if (!body.order_id || !body.reason) {
      return NextResponse.json({ error: 'order_id and reason are required' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc(action === 'void' ? 'void_order_v1' : 'process_refund_v1', {
      p_order_id: body.order_id,
      p_actor_user_id: actor.id,
      p_reason: body.reason,
      p_idempotency_key: body.idempotency_key || crypto.randomUUID(),
    })

    if (error) return NextResponse.json({ error: error.message || `${action} failed` }, { status: 400 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
