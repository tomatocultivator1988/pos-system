import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { sha256 } from '@/lib/crypto'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('cafe_session')
    if (sessionCookie) {
      const tokenHash = await sha256(sessionCookie.value)

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      )
      await supabase.from('sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', tokenHash)
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set('cafe_session', '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: 0
    })
    return response
  } catch {
    return NextResponse.json({ error: 'Failed to logout' }, { status: 500 })
  }
}
