import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { sha256 } from '@/lib/crypto'
import { PAYMENT_METHODS, isCash } from '@/lib/utils/payment-methods'

export async function POST(request: NextRequest) {
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
      .select('user_id, user:users(id, role, is_active)')
      .eq('token_hash', tokenHash)
      .gte('expires_at', new Date().toISOString())
      .is('revoked_at', null)
      .single()

    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = session.user as unknown as { id: string; role: string; is_active: boolean } | undefined
    if (!user || !user.is_active || (user.role !== 'admin' && user.role !== 'cashier')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'Order must contain at least one item' }, { status: 400 })
    }
    if (!body.payment_method || !PAYMENT_METHODS.includes(body.payment_method)) {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
    }
    if (!isCash(body.payment_method) && !body.gcash_reference) {
      return NextResponse.json({ error: 'Reference number is required' }, { status: 400 })
    }

    let totalQty = 0
    const hasInvalidQty = body.items.some((item: any) => {
      const qty = Number(item.quantity)
      if (!Number.isInteger(qty) || qty <= 0 || qty > 999) return true
      totalQty += qty
      const seen = new Set<string>()
      for (const a of item.addons || []) {
        if (!a.addon_id) return true
        if (seen.has(a.addon_id)) return true
        seen.add(a.addon_id)
        const aq = Number(a.quantity)
        if (!Number.isInteger(aq) || aq <= 0 || aq > 999) return true
      }
      return false
    })
    if (hasInvalidQty || totalQty === 0) {
      return NextResponse.json({ error: 'Invalid item quantities in order' }, { status: 400 })
    }
    if (body.discount_type && !['senior_pwd', 'employee'].includes(body.discount_type)) {
      return NextResponse.json({ error: 'Invalid discount type' }, { status: 400 })
    }
    if (!body.idempotency_key) {
      return NextResponse.json({ error: 'idempotency_key required' }, { status: 400 })
    }
    if (!isCash(body.payment_method) && !String(body.gcash_reference || '').trim()) {
      return NextResponse.json({ error: 'Reference number is required' }, { status: 400 })
    }

    const idempotencyKey = body.idempotency_key

    const { data: result, error } = await supabase.rpc('complete_sale_v1', {
      p_payload: {
        items: body.items.map((item: any) => ({
          menu_item_id: item.menu_item_id,
          menu_item_variant_id: item.menu_item_variant_id || null,
          quantity: item.quantity,
          addons: item.addons || [],
          notes: item.notes || null,
        })),
        payment_method: body.payment_method,
        gcash_reference: body.gcash_reference || null,
        customer_id: body.customer_id || null,
        amount_tendered: body.amount_tendered || null,
        offline_sync: body.offline_sync || false,
        sold_at: body.sold_at || null,
        // Client-sent sold_* totals are deliberately NOT forwarded — the RPC
        // recomputes all money server-side (see migration 00015).
        discount_type: body.discount_type || null,
      },
      p_actor_user_id: session.user_id,
      p_idempotency_key: idempotencyKey,
    })

    if (error) {
      console.error('[checkout] rpc error', error)
      return NextResponse.json({ error: (error as { message?: string }).message || 'Checkout failed' }, { status: 400 })
    }

    let loyalty_points_balance: number | null = null
    if (body.customer_id) {
      const { data: cust } = await supabase
        .from('customers')
        .select('loyalty_points_balance')
        .eq('id', body.customer_id)
        .single()
      loyalty_points_balance = cust?.loyalty_points_balance ?? null
    }
    return NextResponse.json({ ...result, loyalty_points_balance })
  } catch (e) {
    console.error('[checkout] unhandled', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Checkout failed' }, { status: 500 })
  }
}
