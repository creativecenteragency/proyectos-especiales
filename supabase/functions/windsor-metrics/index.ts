// Edge Function: windsor-metrics
//
// Trae metricas reales desde Windsor.ai para una integracion configurada en un
// proyecto (Marca en Accion, BETA). Solo Owner o Equipo del proyecto pueden
// llamarla — nunca el Auditor/Cliente. La API key de Windsor vive como secreto
// de esta funcion (WINDSOR_API_KEY), nunca llega al navegador.

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

const FIELDS_BY_PROVIDER: Record<string, string[]> = {
  facebook: ['account_name', 'campaign', 'date', 'spend', 'clicks', 'impressions', 'reach'],
  google_ads: ['account_name', 'campaign', 'date', 'spend', 'clicks', 'impressions', 'conversions'],
  instagram: ['account_name', 'date', 'followers_count', 'reach_1d', 'total_interactions', 'likes', 'comments'],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return json({ error: 'missing_auth' }, 401)

  const { integration_id, date_preset } = await req.json().catch(() => ({}))
  if (!integration_id) return json({ error: 'missing_fields' }, 400)

  const anonClient = createClient(SUPABASE_URL, ANON_KEY)
  const { data: userData, error: userError } = await anonClient.auth.getUser(token)
  if (userError || !userData?.user) return json({ error: 'invalid_session' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: integration } = await admin.from('integrations').select('*').eq('id', integration_id).maybeSingle()
  if (!integration) return json({ error: 'integration_not_found' }, 404)

  const { data: callerProfile } = await admin.from('profiles').select('is_master').eq('id', userData.user.id).maybeSingle()
  const { data: membership } = await admin
    .from('project_members')
    .select('role')
    .eq('project_id', integration.project_id)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  const allowed = callerProfile?.is_master || membership?.role === 'team'
  if (!allowed) return json({ error: 'forbidden' }, 403)

  const fields = FIELDS_BY_PROVIDER[integration.provider]
  if (!fields) return json({ error: 'provider_not_supported_yet', provider: integration.provider }, 400)

  const { data: credential } = await admin.from('api_credentials').select('api_key').eq('aggregator', 'windsor').maybeSingle()
  if (!credential?.api_key) return json({ error: 'windsor_not_configured' }, 500)

  const url = new URL(`https://connectors.windsor.ai/${integration.provider}`)
  url.searchParams.set('api_key', credential.api_key)
  url.searchParams.set('fields', fields.join(','))
  url.searchParams.set('date_preset', date_preset || 'last_30d')

  let rows: Record<string, unknown>[] = []
  try {
    const resp = await fetch(url.toString())
    const payload = await resp.json()
    if (!resp.ok) return json({ error: 'windsor_request_failed', detail: payload }, 502)
    rows = Array.isArray(payload) ? payload : (payload.data ?? [])
  } catch (err) {
    return json({ error: 'windsor_request_failed', detail: err instanceof Error ? err.message : String(err) }, 502)
  }

  const ref = integration.account_ref.trim().toLowerCase()
  const matched = rows.filter((r) => String(r.account_name ?? '').toLowerCase().includes(ref))
  const scoped = matched.length > 0 ? matched : rows

  const sum = (key: string) => scoped.reduce((s, r) => s + (Number(r[key]) || 0), 0)

  const summary: Record<string, number> = {}
  for (const f of fields) {
    if (f === 'account_name' || f === 'campaign' || f === 'date') continue
    summary[f] = sum(f)
  }

  const campaigns = integration.provider === 'instagram'
    ? []
    : Object.values(
        scoped.reduce((acc: Record<string, { campaign: string; spend: number; clicks: number; impressions: number }>, r) => {
          const name = String(r.campaign ?? 'Sin nombre')
          if (!acc[name]) acc[name] = { campaign: name, spend: 0, clicks: 0, impressions: 0 }
          acc[name].spend += Number(r.spend) || 0
          acc[name].clicks += Number(r.clicks) || 0
          acc[name].impressions += Number(r.impressions) || 0
          return acc
        }, {}),
      ).sort((a, b) => b.spend - a.spend)

  return json({ ok: true, provider: integration.provider, matchedAccount: matched.length > 0, summary, campaigns, rowCount: scoped.length })
})
