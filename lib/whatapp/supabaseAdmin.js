import { createClient } from '@supabase/supabase-js'

// Client con service role: bypassa le RLS policies.
// Usarlo SOLO qui, in contesti server-to-server già verificati
// (il webhook di Meta), mai esporlo al browser o al client pubblico.
let _client = null

export function getSupabaseAdmin() {
  if (_client) return _client

  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  return _client
}
