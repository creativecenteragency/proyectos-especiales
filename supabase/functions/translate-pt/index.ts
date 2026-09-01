// Edge Function: translate-pt
//
// Traduce texto de ES a PT-BR vía la API de DeepL, para la Fase 2 del soporte
// multi-idioma (traducción del contenido que carga la gente — tareas,
// listas, grupos, ejes, proyectos). Requiere sesión válida (cualquier
// miembro con permiso de escritura ya está cubierto por RLS del lado de la
// tabla; acá solo se valida que haya un usuario autenticado real).
//
// La API key de DeepL vive como secreto DEEPL_API_KEY en este proyecto de
// Supabase — nunca se expone al cliente. Si termina en ":fx" es del plan
// gratuito y hay que pegarle a api-free.deepl.com en vez de api.deepl.com.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const DEEPL_API_KEY = Deno.env.get('DEEPL_API_KEY')

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

  const anonClient = createClient(SUPABASE_URL, ANON_KEY)
  const { data: userData, error: userError } = await anonClient.auth.getUser(token)
  if (userError || !userData?.user) return json({ error: 'invalid_session' }, 401)

  if (!DEEPL_API_KEY) return json({ error: 'deepl_not_configured' }, 500)

  const { texts } = await req.json().catch(() => ({}))
  if (!Array.isArray(texts) || texts.length === 0) return json({ error: 'missing_fields' }, 400)
  if (texts.length > 50) return json({ error: 'too_many_texts' }, 400)

  const nonEmpty = texts.filter((t: unknown) => typeof t === 'string' && t.trim().length > 0)
  if (nonEmpty.length === 0) return json({ ok: true, translations: texts.map(() => '') })

  const base = DEEPL_API_KEY.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'

  const params = new URLSearchParams()
  for (const t of texts as string[]) params.append('text', t)
  params.append('source_lang', 'ES')
  params.append('target_lang', 'PT-BR')

  const resp = await fetch(`${base}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '')
    return json({ error: 'deepl_request_failed', detail }, 502)
  }

  const result = await resp.json()
  const translations = (result.translations as { text: string }[]).map((t) => t.text)
  return json({ ok: true, translations })
})
