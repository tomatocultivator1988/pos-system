import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { sha256 } from '@/lib/crypto'

const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['preparing', 'completed'],
  preparing: ['ready', 'completed'],
  ready: ['completed'],
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { status } = await request.json()
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
    const actor_user_id = user.id

    const { data: order } = await supabase
      .from('orders')
      .select('status')
      .eq('id', id)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const allowed = VALID_TRANSITIONS[order.status]
    if (!allowed || !allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 })
    }

    const updateData: Record<string, string> = { status }
    if (status === 'preparing') updateData.preparing_at = new Date().toISOString()
    if (status === 'ready') updateData.ready_at = new Date().toISOString()
    if (status === 'completed') updateData.completed_at = new Date().toISOString()

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .eq('status', order.status)
      .select('id')

    if (updateError) return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })

    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Order status changed; please refresh' }, { status: 409 })
    }

    const { error: historyError } = await supabase.from('order_status_history').insert({
      order_id: id,
      from_status: order.status,
      to_status: status,
      changed_by_user_id: actor_user_id,
    })

    if (historyError) return NextResponse.json({ error: 'Failed to record status' }, { status: 500 })

    await supabase.from('kds_events').insert({
      order_id: id,
      event_type: 'status_changed',
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }
}
