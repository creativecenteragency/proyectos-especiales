// Edge Function: member-status
//
// Para una lista de user_id (de project_members), devuelve si esa persona ya
// activó su cuenta (confirmó el mail / puso contraseña) o sigue con la
// invitación pendiente. Requiere que quien llama sea master (Owner) — usa la
// service role solo para leer auth.users, nunca se expone al cliente.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return json({ error: 'missing_auth' }, 401)

  const { user_ids } = await req.json().catch(() => ({}))
  if (!Array.isArray(user_ids) || user_ids.length === 0) return json({ error: 'missing_fields' }, 400)

  const anonClient = createClient(SUPABASE_URL, ANON_KEY)
  const { data: userData, error: userError } = await anonClient.auth.getUser(token)
  if (userError || !userData?.user) return json({ error: 'invalid_session' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('is_master')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (!callerProfile?.is_master) return json({ error: 'forbidden' }, 403)

  const statuses: Record<string, { confirmed: boolean; last_sign_in_at: string | null; invited_at: string | null }> = {}

  await Promise.all(
    (user_ids as string[]).map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id)
      if (error || !data?.user) {
        statuses[id] = { confirmed: false, last_sign_in_at: null, invited_at: null }
        return
      }
      const u = data.user
      statuses[id] = {
        confirmed: !!(u.email_confirmed_at || u.confirmed_at),
        last_sign_in_at: u.last_sign_in_at ?? null,
        invited_at: u.invited_at ?? u.created_at ?? null,
      }
    }),
  )

  return json({ ok: true, statuses })
})
