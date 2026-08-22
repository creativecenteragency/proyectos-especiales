import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import BrandMark from '../components/BrandMark'
import Dropdown, { DropdownLink } from '../components/Dropdown'
import type { Client, Project } from '../types/database'

type ProjectWithClient = Project & { clients: Client | null }

export default function ProjectsList() {
  const { profile, signOut } = useAuth()

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
        <h2 className="text-2xl font-display font-semibold text-brand-carbon mb-6">Tus proyectos</h2>

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
