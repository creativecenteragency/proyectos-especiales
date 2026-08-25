import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import BrandMark from '../components/BrandMark'
import type { Project, Provider, ProviderProject, Task } from '../types/database'

const money = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

export default function ProvidersPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [cuit, setCuit] = useState('')

  const { data: providers, isLoading: loadingProviders } = useQuery({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('providers').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Provider[]
    },
  })

  // is_master bypasea RLS: esta consulta trae tareas de TODOS los proyectos visibles,
  // es la base del analisis directivo de inversion por proveedor.
  const { data: tasks, isLoading: loadingTasks } = useQuery({
    queryKey: ['all-tasks-for-providers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('id, provider_id, actual_amount')
      if (error) throw error
      return (data ?? []) as Pick<Task, 'id' | 'provider_id' | 'actual_amount'>[]
    },
    enabled: !!profile?.is_master,
  })

  const { data: projects } = useQuery({
    queryKey: ['all-projects-brief'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name, slug').order('name')
      if (error) throw error
      return (data ?? []) as Pick<Project, 'id' | 'name' | 'slug'>[]
    },
  })

  const { data: providerProjects } = useQuery({
    queryKey: ['provider-projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('provider_projects').select('provider_id, project_id')
      if (error) throw error
      return (data ?? []) as ProviderProject[]
    },
  })

  const toggleProviderProject = useMutation({
    mutationFn: async ({ providerId, projectId, checked }: { providerId: string; projectId: string; checked: boolean }) => {
      if (checked) {
        const { error } = await supabase.from('provider_projects').insert({ provider_id: providerId, project_id: projectId })
        if (error) throw error
      } else {
        const { error } = await supabase.from('provider_projects').delete().eq('provider_id', providerId).eq('project_id', projectId)
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['provider-projects'] }),
  })

  const addProvider = useMutation({
    mutationFn: async () => {
      if (!name.trim()) return
      const { error } = await supabase.from('providers').insert({ name: name.trim(), cuit: cuit.trim() || null })
      if (error) throw error
    },
    onSuccess: () => {
      setName('')
      setCuit('')
      queryClient.invalidateQueries({ queryKey: ['providers'] })
    },
  })

  const deleteProvider = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('providers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['providers'] }),
  })

  if (!profile?.is_master) return <Navigate to="/" replace />

  const totalInvested = (tasks ?? []).reduce((s, t) => s + Number(t.actual_amount), 0)

  return (
    <div className="min-h-screen bg-brand-cream">
      <header className="border-b border-brand-line bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark className="h-8 w-8" />
            <h1 className="font-display font-semibold text-brand-carbon">Proveedores</h1>
          </div>
          <Link to="/" className="text-sm text-brand-gray hover:text-brand-carbon">← Proyectos</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <p className="text-sm text-brand-gray">
          Vista directiva, transversal a todos los proyectos: % de la inversión total ejecutada que se llevó cada proveedor.
        </p>

        {(loadingProviders || loadingTasks) && <p className="text-sm text-brand-gray">Cargando…</p>}

        <div className="bg-white border border-brand-line rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-carbon text-white text-left">
                <th className="px-4 py-2 font-semibold">Proveedor</th>
                <th className="px-4 py-2 font-semibold">CUIT</th>
                <th className="px-4 py-2 font-semibold">Proyectos</th>
                <th className="px-4 py-2 font-semibold text-right">Invertido</th>
                <th className="px-4 py-2 font-semibold text-right">% del total</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-line">
              {(providers ?? [])
                .map((p) => {
                  const invested = (tasks ?? []).filter((t) => t.provider_id === p.id).reduce((s, t) => s + Number(t.actual_amount), 0)
                  const pct = totalInvested > 0 ? (invested / totalInvested) * 100 : 0
                  return { p, invested, pct }
                })
                .sort((a, b) => b.invested - a.invested)
                .map(({ p, invested, pct }) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 text-brand-carbon font-medium">{p.name}</td>
                    <td className="px-4 py-2 text-brand-gray">{p.cuit ?? '—'}</td>
                    <td className="px-4 py-2">
                      <ProviderProjectsPicker
                        projects={projects ?? []}
                        assignedProjectIds={new Set(
                          (providerProjects ?? []).filter((pp) => pp.provider_id === p.id).map((pp) => pp.project_id),
                        )}
                        onToggle={(projectId, checked) => toggleProviderProject.mutate({ providerId: p.id, projectId, checked })}
                      />
                    </td>
                    <td className="px-4 py-2 text-right text-brand-carbon">{money(invested)}</td>
                    <td className="px-4 py-2 text-right text-brand-gray">{pct.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar proveedor "${p.name}"?`)) deleteProvider.mutate(p.id)
                        }}
                        className="text-xs text-brand-red hover:underline"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              {(providers ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-brand-gray">Todavía no hay proveedores cargados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            addProvider.mutate()
          }}
          className="bg-white border border-brand-line rounded-xl p-4 flex flex-wrap items-center gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del proveedor…"
            className="flex-1 min-w-[200px] text-sm px-3 py-1.5 rounded-md border border-brand-line"
          />
          <input
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
            placeholder="CUIT (opcional)"
            className="w-40 text-sm px-3 py-1.5 rounded-md border border-brand-line"
          />
          <button type="submit" className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white">
            + Proveedor
          </button>
        </form>
      </main>
    </div>
  )
}

function ProviderProjectsPicker({
  projects,
  assignedProjectIds,
  onToggle,
}: {
  projects: Pick<Project, 'id' | 'name' | 'slug'>[]
  assignedProjectIds: Set<string>
  onToggle: (projectId: string, checked: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const assigned = projects.filter((pr) => assignedProjectIds.has(pr.id))

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex flex-wrap items-center gap-1 max-w-[220px] text-left"
      >
        {assigned.length === 0 && <span className="text-xs text-brand-gray hover:text-brand-carbon">Sin asignar</span>}
        {assigned.map((pr) => (
          <span
            key={pr.id}
            className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-brand-cream text-brand-gray"
          >
            {pr.name}
          </span>
        ))}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white border border-brand-line rounded-lg shadow-lg py-1.5 min-w-[220px] max-h-64 overflow-y-auto z-20">
          {projects.length === 0 && <p className="px-3 py-2 text-xs text-brand-gray">No hay proyectos creados.</p>}
          {projects.map((pr) => (
            <label
              key={pr.id}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-brand-carbon hover:bg-brand-cream cursor-pointer"
            >
              <input
                type="checkbox"
                checked={assignedProjectIds.has(pr.id)}
                onChange={(e) => onToggle(pr.id, e.target.checked)}
              />
              {pr.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
