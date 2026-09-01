import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { sha256 } from '@/lib/crypto'

const SESSION_COOKIE = 'cafe_session'

type SessionUser = {
  id: string
  name: string
  username: string
  role: 'admin' | 'cashier' | 'kds'
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(SESSION_COOKIE)
    if (!sessionCookie) return null

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const tokenHash = await sha256(sessionCookie.value)
    const { data: session } = await supabase
      .from('sessions')
      .select('user:users(id, name, username, role, is_active)')
      .eq('token_hash', tokenHash)
      .gte('expires_at', new Date().toISOString())
      .is('revoked_at', null)
      .single()

    const u = session?.user as unknown as { is_active?: boolean } | undefined
    if (!session?.user || u?.is_active === false) return null
    return session.user as unknown as SessionUser
  } catch {
    return null
  }
}

export function requireRole(roles: string[]) {
  return async function guard() {
    const user = await getSession()
    if (!user) throw new Error('Unauthorized')
    if (!roles.includes(user.role)) throw new Error('Forbidden')
    return user
  }
}
