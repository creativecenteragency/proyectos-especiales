import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Profile, ProjectRole } from '../types/database'

type MemberRow = { project_id: string; user_id: string; role: ProjectRole; profiles: Profile | null }

const ROLE_LABEL: Record<ProjectRole, string> = { team: 'Equipo de agencia', auditor: 'Auditor / Cliente' }

export default function ProjectMembersPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ProjectRole>('team')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const { data: members, isLoading } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_members')
        .select('project_id, user_id, role, profiles(*)')
        .eq('project_id', projectId)
      if (error) throw error
      return (data ?? []) as unknown as MemberRow[]
    },
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['project-members', projectId] })
  }

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; invited: boolean; error?: string }>(
        'invite-project-member',
        { body: { email: email.trim(), project_id: projectId, role } },
      )
      if (error) throw error
      if (data && !data.ok) throw new Error(data.error ?? 'No se pudo asignar el acceso.')
      return data
    },
    onSuccess: (data) => {
      setEmail('')
      setError(null)
      setNotice(data?.invited ? 'Invitación enviada por email.' : 'Acceso asignado — ya tenía cuenta.')
      invalidate()
    },
    onError: (err: unknown) => {
      setNotice(null)
      setError(err instanceof Error ? err.message : 'No se pudo asignar el acceso.')
    },
  })

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return (
    <div className="bg-white border border-brand-line rounded-xl p-5 mb-4 space-y-4">
      <div>
        <h3 className="text-sm font-display font-semibold text-brand-carbon">Miembros del proyecto</h3>
        <p className="text-xs text-brand-gray mt-0.5">
          Equipo de agencia: crea y ejecuta, no toca presupuesto aprobado. Auditor/Cliente: solo lectura y comentarios.
        </p>
      </div>

      {isLoading && <p className="text-xs text-brand-gray">Cargando…</p>}

      <div className="space-y-2">
        {(members ?? []).map((m) => (
          <div key={m.user_id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 text-brand-carbon">{m.profiles?.full_name || m.profiles?.email || m.user_id}</span>
            {m.profiles?.full_name && <span className="text-xs text-brand-gray">{m.profiles.email}</span>}
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-brand-cream text-brand-gray">
              {ROLE_LABEL[m.role]}
            </span>
            <button
              onClick={() => {
                if (confirm(`¿Quitar a ${m.profiles?.email ?? 'este usuario'} del proyecto?`)) removeMember.mutate(m.user_id)
              }}
              className="text-xs text-brand-gray hover:text-brand-red"
            >
              Quitar
            </button>
          </div>
        ))}
        {(members ?? []).length === 0 && !isLoading && (
          <p className="text-xs text-brand-gray">Todavía nadie más tiene acceso a este proyecto.</p>
        )}
      </div>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (!email.trim()) return
          invite.mutate()
        }}
        className="flex flex-wrap items-center gap-2 pt-2 border-t border-brand-line"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email de la persona…"
          className="flex-1 min-w-[200px] text-sm px-3 py-1.5 rounded-md border border-brand-line"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ProjectRole)}
          className="text-sm px-2 py-1.5 rounded-md border border-brand-line"
        >
          <option value="team">Equipo de agencia</option>
          <option value="auditor">Auditor / Cliente</option>
        </select>
        <button
          type="submit"
          disabled={invite.isPending}
          className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white disabled:opacity-50"
        >
          {invite.isPending ? 'Asignando…' : '+ Invitar / asignar'}
        </button>
      </form>
      {notice && <p className="text-xs text-brand-green">{notice}</p>}
      {error && <p className="text-xs text-brand-red">{error}</p>}
    </div>
  )
}
