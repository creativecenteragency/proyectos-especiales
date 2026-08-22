import { useState, type FormEvent } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money } from '../lib/taskHelpers'
import type { Integration, IntegrationProvider, Project, Task } from '../types/database'

const PROVIDER_LABEL: Record<IntegrationProvider, string> = {
  facebook: 'Meta Ads (Windsor)',
  google_ads: 'Google Ads (Windsor)',
  instagram: 'Instagram orgánico (Windsor)',
  google_analytics: 'Google Analytics (MasterMetrics)',
  tiendanube: 'Tiendanube (MasterMetrics)',
  metricool_organic: 'Redes orgánicas (Metricool)',
}

const WINDSOR_READY: IntegrationProvider[] = ['facebook', 'google_ads', 'instagram']

const ERROR_LABEL: Record<string, string> = {
  windsor_not_configured: 'Falta configurar la API key de Windsor (WINDSOR_API_KEY) en los secretos del proyecto de Supabase.',
  forbidden: 'No tenés permiso para ver esta conexión.',
  integration_not_found: 'Esta conexión ya no existe.',
  windsor_request_failed: 'Windsor no pudo responder la consulta. Revisá la API key o intentá de nuevo.',
  provider_not_supported_yet: 'Esta fuente todavía no está conectada.',
}

type SyncResult = {
  ok: boolean
  provider?: string
  matchedAccount?: boolean
  summary?: Record<string, number>
  campaigns?: { campaign: string; spend: number; clicks: number; impressions: number }[]
  error?: string
}

export default function MarcaEnAccion() {
  const { slug } = useParams<{ slug: string }>()
  const { profile, session } = useAuth()
  const queryClient = useQueryClient()
  const [provider, setProvider] = useState<IntegrationProvider>('facebook')
  const [accountRef, setAccountRef] = useState('')
  const [label, setLabel] = useState('')
  const [results, setResults] = useState<Record<string, SyncResult>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['marca-en-accion', slug],
    queryFn: async () => {
      const { data: project, error } = await supabase.from('projects').select('*').eq('slug', slug).single()
      if (error) throw error

      const [{ data: integrations }, { data: roleRow }] = await Promise.all([
        supabase.from('integrations').select('*').eq('project_id', project.id).order('created_at'),
        supabase.from('project_members').select('role').eq('project_id', project.id).eq('user_id', session!.user.id).maybeSingle(),
      ])

      const { data: lists } = await supabase.from('lists').select('id').eq('project_id', project.id)
      const listIds = (lists ?? []).map((l) => l.id)
      const { data: groups } = listIds.length
        ? await supabase.from('groups').select('id').in('list_id', listIds)
        : { data: [] as { id: string }[] }
      const groupIds = (groups ?? []).map((g) => g.id)
      const { data: tasks } = groupIds.length
        ? await supabase.from('tasks').select('id, title, campaign_ref').in('group_id', groupIds).not('campaign_ref', 'is', null)
        : { data: [] as Pick<Task, 'id' | 'title' | 'campaign_ref'>[] }

      return {
        project: project as Project,
        integrations: (integrations ?? []) as Integration[],
        role: (roleRow?.role as 'team' | 'auditor' | undefined) ?? null,
        linkedTasks: (tasks ?? []) as Pick<Task, 'id' | 'title' | 'campaign_ref'>[],
      }
    },
    enabled: !!slug && !!session,
  })

  const canAccess = !!profile?.is_master || data?.role === 'team'

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['marca-en-accion', slug] })
  }

  const addIntegration = useMutation({
    mutationFn: async () => {
      if (!data || !accountRef.trim() || !label.trim()) return
      const { error } = await supabase.from('integrations').insert({
        project_id: data.project.id,
        provider,
        account_ref: accountRef.trim(),
        label: label.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      setAccountRef('')
      setLabel('')
      invalidate()
    },
  })

  const deleteIntegration = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('integrations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  async function sync(integration: Integration) {
    setResults((r) => ({ ...r, [integration.id]: { ok: true } }))
    const { data: result, error } = await supabase.functions.invoke<SyncResult>('windsor-metrics', {
      body: { integration_id: integration.id },
    })
    if (error) {
      let message = error.message
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = await ctx.json()
          message = ERROR_LABEL[body.error as string] ?? body.error ?? message
        } catch {
          // el cuerpo no era JSON, se mantiene el mensaje genérico
        }
      }
      setResults((r) => ({ ...r, [integration.id]: { ok: false, error: message } }))
      return
    }
    setResults((r) => ({ ...r, [integration.id]: result ?? { ok: false, error: 'Sin respuesta' } }))
  }

  if (isLoading || !data) return <div className="min-h-screen flex items-center justify-center text-brand-gray">Cargando…</div>
  if (!canAccess) return <Navigate to={`/proyecto/${slug}`} replace />

  return (
    <div className="min-h-screen bg-brand-cream">
      <header className="bg-brand-carbon text-white">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <Link to={`/proyecto/${data.project.slug}`} className="text-xs text-white/60 hover:text-white">← Volver al proyecto</Link>
          <div className="flex items-center gap-2 mt-3">
            <h1 className="text-2xl font-display font-semibold">Marca en Acción</h1>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-brand-orange/20 text-brand-orange">BETA</span>
          </div>
          <p className="text-sm text-white/70 mt-1 max-w-xl">
            Datos reales de campañas y redes, sincronizados vía Windsor / MasterMetrics / Metricool. Solo visible para la agencia y el Owner.
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <section className="bg-white border border-brand-line rounded-xl p-5">
          <h2 className="text-sm font-display font-semibold text-brand-carbon mb-3">Conexiones de este proyecto</h2>

          <div className="space-y-3">
            {data.integrations.map((integration) => {
              const result = results[integration.id]
              const ready = WINDSOR_READY.includes(integration.provider)
              return (
                <div key={integration.id} className="border border-brand-line rounded-lg p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-brand-carbon">{integration.label}</span>
                    <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-brand-cream text-brand-gray">
                      {PROVIDER_LABEL[integration.provider]}
                    </span>
                    <span className="text-xs text-brand-gray">cuenta: {integration.account_ref}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {ready ? (
                        <button
                          onClick={() => sync(integration)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white"
                        >
                          Sincronizar (30d)
                        </button>
                      ) : (
                        <span className="text-xs text-brand-gray">Conexión pendiente de configurar</span>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`¿Quitar la conexión "${integration.label}"?`)) deleteIntegration.mutate(integration.id)
                        }}
                        className="text-xs text-brand-gray hover:text-brand-red"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>

                  {result && (
                    <div className="mt-3 pt-3 border-t border-brand-line text-sm">
                      {!result.ok && <p className="text-brand-red text-xs">Error: {result.error}</p>}
                      {result.ok && !result.summary && <p className="text-brand-gray text-xs">Sincronizando…</p>}
                      {result.ok && result.summary && (
                        <>
                          {!result.matchedAccount && (
                            <p className="text-[11px] text-brand-gray mb-2">
                              No se encontró una cuenta que coincida con "{integration.account_ref}" — mostrando todas las cuentas conectadas.
                            </p>
                          )}
                          <div className="flex flex-wrap gap-4 mb-2">
                            {Object.entries(result.summary).map(([key, value]) => (
                              <div key={key}>
                                <div className="text-[10px] uppercase tracking-wider text-brand-gray">{key}</div>
                                <div className="font-display font-semibold text-brand-carbon">
                                  {key === 'spend' ? money(value) : value.toLocaleString('es-AR')}
                                </div>
                              </div>
                            ))}
                          </div>
                          {result.campaigns && result.campaigns.length > 0 && (
                            <table className="w-full text-xs mt-2">
                              <thead>
                                <tr className="text-left text-brand-gray border-b border-brand-line">
                                  <th className="py-1 pr-2 font-medium">Campaña</th>
                                  <th className="py-1 pr-2 font-medium text-right">Gasto</th>
                                  <th className="py-1 font-medium text-right">Clics</th>
                                </tr>
                              </thead>
                              <tbody>
                                {result.campaigns.slice(0, 8).map((c) => {
                                  const linked = data.linkedTasks.filter((t) =>
                                    t.campaign_ref && c.campaign.toLowerCase().includes(t.campaign_ref.toLowerCase()),
                                  )
                                  return (
                                    <tr key={c.campaign} className="border-b border-brand-line">
                                      <td className="py-1 pr-2">
                                        {c.campaign}
                                        {linked.length > 0 && (
                                          <div className="text-[10px] text-brand-orange">
                                            ↳ potenciada por: {linked.map((t) => t.title).join(', ')}
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-1 pr-2 text-right">{money(c.spend)}</td>
                                      <td className="py-1 text-right">{c.clicks.toLocaleString('es-AR')}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {data.integrations.length === 0 && (
              <p className="text-sm text-brand-gray">Todavía no hay conexiones configuradas para este proyecto.</p>
            )}
          </div>

          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              addIntegration.mutate()
            }}
            className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-brand-line"
          >
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as IntegrationProvider)}
              className="text-sm px-2 py-1.5 rounded-md border border-brand-line"
            >
              {(Object.entries(PROVIDER_LABEL) as [IntegrationProvider, string][]).map(([value, lab]) => (
                <option key={value} value={value}>{lab}</option>
              ))}
            </select>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nombre para identificarla…"
              className="text-sm px-3 py-1.5 rounded-md border border-brand-line flex-1 min-w-[160px]"
            />
            <input
              value={accountRef}
              onChange={(e) => setAccountRef(e.target.value)}
              placeholder="Cuenta (nombre o ID, ej: Oxford - Argentina)"
              className="text-sm px-3 py-1.5 rounded-md border border-brand-line flex-1 min-w-[200px]"
            />
            <button type="submit" className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white">
              + Conexión
            </button>
          </form>
        </section>

        <section className="bg-white border border-brand-line rounded-xl p-5">
          <h2 className="text-sm font-display font-semibold text-brand-carbon mb-2">Cómo vincular una tarea a una campaña</h2>
          <p className="text-sm text-brand-gray">
            Desde el proyecto, abrí cualquier tarea y completá "Campaña / posteo vinculado" con el nombre de la campaña real (o el link
            del posteo). Cuando sincronices acá, si el nombre coincide, la vas a ver marcada como "potenciada por" esa tarea.
          </p>
        </section>
      </main>
    </div>
  )
}
