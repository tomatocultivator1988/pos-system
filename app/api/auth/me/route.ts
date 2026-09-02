import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { sha256 } from '@/lib/crypto'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('cafe_session')
    if (!sessionCookie) {
      return NextResponse.json({ user: null })
    }

    const tokenHash = await sha256(sessionCookie.value)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data } = await supabase
      .from('sessions')
      .select('user:users(id, name, username, role, is_active)')
      .eq('token_hash', tokenHash)
      .gte('expires_at', new Date().toISOString())
      .is('revoked_at', null)
      .single()

    const user = data?.user as { is_active?: boolean } | undefined
    const active = !!user && user.is_active !== false
    return NextResponse.json({ user: active ? user : null })
  } catch {
    return NextResponse.json({ user: null })
  }
}
