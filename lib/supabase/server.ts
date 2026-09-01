import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let dbClient: any = null

export function createClient(): any {
  if (!dbClient) {
    dbClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
  }
  return dbClient
}
