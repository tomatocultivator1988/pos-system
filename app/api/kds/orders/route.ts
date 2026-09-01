import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { sha256 } from '@/lib/crypto'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('cafe_session')
    if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tokenHash = await sha256(sessionCookie.value)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data: session } = await supabase
      .from('sessions')
      .select('user:users(id, role)')
      .eq('token_hash', tokenHash)
      .gte('expires_at', new Date().toISOString())
      .is('revoked_at', null)
      .single()

    const user = session?.user as unknown as { id: string; role: string } | undefined
    if (!user || (user.role !== 'kds' && user.role !== 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: orders } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, created_at, notes,
        order_items(id, item_name, variant_name, quantity, notes, send_to_kds, order_item_addons(id, addon_name, quantity))
      `)
      .in('status', ['new', 'preparing', 'ready'])
      .neq('payment_status', 'refunded')
      .order('created_at', { ascending: true })

    const filtered = (orders || [])
      .map((o: any) => ({
        ...o,
        order_items: (o.order_items || []).filter((it: any) => it.send_to_kds === true),
      }))
      .filter((o: any) => o.order_items.length > 0)

    return NextResponse.json({ orders: filtered })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}
