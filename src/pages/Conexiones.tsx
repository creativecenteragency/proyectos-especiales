import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import BrandMark from '../components/BrandMark'
import type { Aggregator, ApiCredential } from '../types/database'

const AGGREGATORS: { id: Aggregator; label: string; description: string }[] = [
  { id: 'windsor', label: 'Windsor.ai', description: 'Meta Ads, Google Ads e Instagram Insights.' },
  { id: 'mastermetrics', label: 'MasterMetrics', description: 'Tiendanube y Google Analytics.' },
  { id: 'metricool', label: 'Metricool', description: 'Redes orgánicas.' },
]

export default function Conexiones() {
  const { profile, session } = useAuth()
  const queryClient = useQueryClient()

  const { data: credentials, isLoading } = useQuery({
    queryKey: ['api-credentials'],
    queryFn: async () => {
      const { data, error } = await supabase.from('api_credentials').select('*')
      if (error) throw error
      return (data ?? []) as ApiCredential[]
    },
    enabled: !!profile?.is_master,
  })

  const save = useMutation({
    mutationFn: async ({ aggregator, apiKey }: { aggregator: Aggregator; apiKey: string }) => {
      const { error } = await supabase
        .from('api_credentials')
        .upsert({ aggregator, api_key: apiKey, updated_at: new Date().toISOString(), updated_by: session?.user.id }, { onConflict: 'aggregator' })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-credentials'] }),
  })

  const remove = useMutation({
    mutationFn: async (aggregator: Aggregator) => {
      const { error } = await supabase.from('api_credentials').delete().eq('aggregator', aggregator)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-credentials'] }),
  })

  if (!profile?.is_master) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-brand-cream">
      <header className="border-b border-brand-line bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark className="h-8 w-8" />
            <h1 className="font-display font-semibold text-brand-carbon">Conexiones</h1>
          </div>
          <Link to="/" className="text-sm text-brand-gray hover:text-brand-carbon">← Proyectos</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-4">
        <p className="text-sm text-brand-gray">
          API keys de los agregadores que alimentan "Marca en Acción". Solo vos las ves y las podés cambiar — se usan del lado del
          servidor, nunca se muestran a Equipo ni Auditor.
        </p>

        {isLoading && <p className="text-sm text-brand-gray">Cargando…</p>}

        {AGGREGATORS.map((agg) => (
          <AggregatorCard
            key={agg.id}
            aggregator={agg}
            credential={credentials?.find((c) => c.aggregator === agg.id) ?? null}
            saving={save.isPending}
            onSave={(apiKey) => save.mutate({ aggregator: agg.id, apiKey })}
            onRemove={() => remove.mutate(agg.id)}
          />
        ))}
      </main>
    </div>
  )
}

function AggregatorCard({
  aggregator,
  credential,
  saving,
  onSave,
  onRemove,
}: {
  aggregator: { id: Aggregator; label: string; description: string }
  credential: ApiCredential | null
  saving: boolean
  onSave: (apiKey: string) => void
  onRemove: () => void
}) {
  const [value, setValue] = useState('')
  const [reveal, setReveal] = useState(false)
  const [editing, setEditing] = useState(!credential)

  return (
    <div className="bg-white border border-brand-line rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-display font-semibold text-brand-carbon">{aggregator.label}</h2>
        {credential ? (
          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-brand-green/10 text-brand-green">
            Configurada
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-brand-cream text-brand-gray">
            No configurada
          </span>
        )}
      </div>
      <p className="text-xs text-brand-gray mb-3">{aggregator.description}</p>

      {credential && !editing && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-brand-gray">
            Actualizada {new Date(credential.updated_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-orange hover:underline ml-auto">
            Cambiar key
          </button>
          <button
            onClick={() => {
              if (confirm(`¿Quitar la API key de ${aggregator.label}? "Marca en Acción" dejará de traer datos de esta fuente.`)) onRemove()
            }}
            className="text-xs text-brand-gray hover:text-brand-red"
          >
            Quitar
          </button>
        </div>
      )}

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!value.trim()) return
            onSave(value.trim())
            setValue('')
            setEditing(false)
          }}
          className="flex items-center gap-2"
        >
          <div className="flex-1 relative">
            <input
              type={reveal ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`API key de ${aggregator.label}…`}
              autoComplete="off"
              className="w-full text-sm pl-3 pr-9 py-1.5 rounded-md border border-brand-line"
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-brand-gray hover:text-brand-carbon"
            >
              {reveal ? 'ocultar' : 'ver'}
            </button>
          </div>
          <button type="submit" disabled={saving} className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white disabled:opacity-50">
            Guardar
          </button>
          {credential && (
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-brand-gray">
              Cancelar
            </button>
          )}
        </form>
      )}
    </div>
  )
}
