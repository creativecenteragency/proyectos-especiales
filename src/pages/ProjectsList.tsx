import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import BrandMark from '../components/BrandMark'
import Dropdown, { DropdownLink } from '../components/Dropdown'
import type { Client, Project } from '../types/database'

type ProjectWithClient = Project & { clients: Client | null }

const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

export default function ProjectsList() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, clients(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ProjectWithClient[]
    },
  })

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Client[]
    },
    enabled: !!profile?.is_master,
  })

  return (
    <div className="min-h-screen bg-brand-cream">
      <header className="border-b border-brand-line bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark className="h-8 w-8" />
            <div>
              <h1 className="font-display font-semibold text-brand-carbon leading-tight">Proyectos Especiales</h1>
              <p className="text-xs text-brand-gray">{profile?.full_name || profile?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {profile?.is_master && (
              <Dropdown trigger={<span className="text-sm text-brand-gray hover:text-brand-carbon">Ajustes ▾</span>}>
                <DropdownLink to="/proveedores">Proveedores</DropdownLink>
                <DropdownLink to="/conexiones">Conexiones</DropdownLink>
              </Dropdown>
            )}
            <button onClick={() => signOut()} className="text-sm text-brand-gray hover:text-brand-carbon">
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-display font-semibold text-brand-carbon">Tus proyectos</h2>
          {profile?.is_master && (
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white"
            >
              {showCreate ? 'Cancelar' : '+ Nuevo proyecto'}
            </button>
          )}
        </div>

        {showCreate && (
          <NewProjectForm
            clients={clients ?? []}
            onCreated={(slug) => {
              setShowCreate(false)
              queryClient.invalidateQueries({ queryKey: ['projects'] })
              queryClient.invalidateQueries({ queryKey: ['clients'] })
              navigate(`/proyecto/${slug}`)
            }}
          />
        )}

        {isLoading && <p className="text-brand-gray text-sm">Cargando…</p>}

        {!isLoading && (projects?.length ?? 0) === 0 && (
          <p className="text-brand-gray text-sm">Todavía no hay proyectos cargados.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects?.map((p) => (
            <Link
              key={p.id}
              to={`/proyecto/${p.slug}`}
              className="block bg-white border border-brand-line rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: (p.clients?.brand_color ?? '#f47a20') + '20',
                    color: p.clients?.brand_color ?? '#f47a20',
                  }}
                >
                  {p.clients?.name ?? 'Sin cliente'}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-brand-gray">{p.status}</span>
              </div>
              <h3 className="font-display font-semibold text-brand-carbon mb-1">{p.name}</h3>
              <p className="text-sm text-brand-gray line-clamp-2 mb-4">{p.description}</p>
              <div className="text-sm font-semibold text-brand-carbon">
                {p.currency} {p.total_budget.toLocaleString('es-AR')}
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}

function NewProjectForm({ clients, onCreated }: { clients: Client[]; onCreated: (slug: string) => void }) {
  const [clientMode, setClientMode] = useState<'existing' | 'new'>(clients.length > 0 ? 'existing' : 'new')
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [newClientName, setNewClientName] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [totalBudget, setTotalBudget] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Poné un nombre para el proyecto.')
      if (clientMode === 'new' && !newClientName.trim()) throw new Error('Poné un nombre para el cliente nuevo.')
      if (clientMode === 'existing' && !clientId) throw new Error('Elegí un cliente.')

      let resolvedClientId = clientId
      if (clientMode === 'new') {
        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({ name: newClientName.trim(), slug: slugify(newClientName) })
          .select()
          .single()
        if (clientError) throw clientError
        resolvedClientId = newClient.id
      }

      const finalSlug = slug.trim() || slugify(name)

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          client_id: resolvedClientId,
          name: name.trim(),
          slug: finalSlug,
          description: description.trim() || null,
          total_budget: totalBudget ? Number(totalBudget) : 0,
          currency,
          start_date: startDate || null,
          end_date: endDate || null,
          status: 'propuesta',
        })
        .select()
        .single()
      if (projectError) throw projectError
      return project.slug as string
    },
    onSuccess: (createdSlug) => onCreated(createdSlug),
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo crear el proyecto.'),
  })

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        setError(null)
        create.mutate()
      }}
      className="bg-white border border-brand-line rounded-xl p-5 mb-6 space-y-4"
    >
      <div>
        <label className="block text-xs font-semibold text-brand-gray mb-1.5">Cliente</label>
        <div className="flex items-center gap-4 mb-2 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={clientMode === 'existing'}
              onChange={() => setClientMode('existing')}
              disabled={clients.length === 0}
            />
            Cliente existente
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={clientMode === 'new'} onChange={() => setClientMode('new')} />
            Cliente nuevo
          </label>
        </div>
        {clientMode === 'existing' ? (
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full text-sm px-3 py-1.5 rounded-md border border-brand-line"
          >
            {clients.length === 0 && <option value="">No hay clientes todavía</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            placeholder="Nombre del cliente…"
            className="w-full text-sm px-3 py-1.5 rounded-md border border-brand-line"
          />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-brand-gray mb-1.5">Nombre del proyecto</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!slugTouched) setSlug(slugify(e.target.value))
            }}
            placeholder="Ej. Oxford Argentina 2026"
            className="w-full text-sm px-3 py-1.5 rounded-md border border-brand-line"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-brand-gray mb-1.5">Slug (URL)</label>
          <input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value)
              setSlugTouched(true)
            }}
            placeholder="oxford-argentina-2026"
            className="w-full text-sm px-3 py-1.5 rounded-md border border-brand-line"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-brand-gray mb-1.5">Descripción</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full text-sm px-3 py-1.5 rounded-md border border-brand-line"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-semibold text-brand-gray mb-1.5">Presupuesto total</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={totalBudget}
            onChange={(e) => setTotalBudget(e.target.value)}
            className="w-full text-sm px-3 py-1.5 rounded-md border border-brand-line"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-brand-gray mb-1.5">Moneda</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full text-sm px-3 py-1.5 rounded-md border border-brand-line"
          >
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-brand-gray mb-1.5">Inicio</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full text-sm px-3 py-1.5 rounded-md border border-brand-line"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-brand-gray mb-1.5">Fin</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full text-sm px-3 py-1.5 rounded-md border border-brand-line"
          />
        </div>
      </div>

      {error && <p className="text-xs text-brand-red">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={create.isPending}
          className="text-sm font-semibold px-4 py-2 rounded-md bg-brand-orange text-white disabled:opacity-50"
        >
          {create.isPending ? 'Creando…' : 'Crear proyecto'}
        </button>
      </div>
    </form>
  )
}
