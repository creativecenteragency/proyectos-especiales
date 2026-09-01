import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import type { Profile, ProjectRole } from '../types/database'

type MemberRow = { project_id: string; user_id: string; role: ProjectRole; profiles: Profile | null }
type MemberStatus = { confirmed: boolean; last_sign_in_at: string | null; invited_at: string | null }

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)))
}

export default function ProjectMembersPanel({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.resolvedLanguage === 'pt-BR' ? 'pt-BR' : 'es-AR'
  const ROLE_LABEL: Record<ProjectRole, string> = { team: t('membersPanel.roleTeam'), auditor: t('membersPanel.roleAuditor') }
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

  const memberIds = (members ?? []).map((m) => m.user_id)
  const { data: statuses } = useQuery({
    queryKey: ['project-members-status', projectId, memberIds],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; statuses?: Record<string, MemberStatus> }>(
        'member-status',
        { body: { user_ids: memberIds } },
      )
      if (error) throw error
      return data?.statuses ?? {}
    },
    enabled: memberIds.length > 0,
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
      if (data && !data.ok) throw new Error(data.error ?? t('membersPanel.errorGeneric'))
      return data
    },
    onSuccess: (data) => {
      setEmail('')
      setError(null)
      setNotice(data?.invited ? t('membersPanel.invited') : t('membersPanel.assigned'))
      invalidate()
    },
    onError: (err: unknown) => {
      setNotice(null)
      setError(err instanceof Error ? err.message : t('membersPanel.errorGeneric'))
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
        <h3 className="text-sm font-display font-semibold text-brand-carbon">{t('membersPanel.title')}</h3>
        <p className="text-xs text-brand-gray mt-0.5">{t('membersPanel.subtitle')}</p>
      </div>

      {isLoading && <p className="text-xs text-brand-gray">{t('membersPanel.loading')}</p>}

      <div className="space-y-2">
        {(members ?? []).map((m) => {
          const status = statuses?.[m.user_id]
          return (
          <div key={m.user_id} className="flex items-center gap-2 text-sm py-1">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-brand-carbon">{m.profiles?.full_name || m.profiles?.email || m.user_id}</span>
                {m.profiles?.full_name && <span className="text-xs text-brand-gray">{m.profiles.email}</span>}
              </div>
              {status && (
                <p className="text-[11px] text-brand-gray mt-0.5">
                  {status.confirmed
                    ? status.last_sign_in_at
                      ? t('membersPanel.lastSignIn', {
                          date: new Date(status.last_sign_in_at).toLocaleString(dateLocale),
                          days: daysAgo(status.last_sign_in_at),
                        })
                      : t('membersPanel.activeNoSignIn')
                    : status.invited_at
                      ? t('membersPanel.invitedNotEntered', { days: daysAgo(status.invited_at) })
                      : t('membersPanel.notEnteredYet')}
                </p>
              )}
            </div>
            {status && (
              status.confirmed ? (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-brand-green/15 text-brand-green">
                  {t('membersPanel.active')}
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-brand-orange/15 text-brand-orange">
                  {t('membersPanel.pending')}
                </span>
              )
            )}
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-brand-cream text-brand-gray">
              {ROLE_LABEL[m.role]}
            </span>
            <button
              onClick={() => {
                const who = m.profiles?.email ?? t('membersPanel.removeConfirmFallback')
                if (confirm(t('membersPanel.removeConfirm', { who }))) removeMember.mutate(m.user_id)
              }}
              className="text-xs text-brand-gray hover:text-brand-red"
            >
              {t('membersPanel.remove')}
            </button>
          </div>
          )
        })}
        {(members ?? []).length === 0 && !isLoading && (
          <p className="text-xs text-brand-gray">{t('membersPanel.none')}</p>
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
          placeholder={t('membersPanel.emailPlaceholder')}
          className="flex-1 min-w-[200px] text-sm px-3 py-1.5 rounded-md border border-brand-line"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ProjectRole)}
          className="text-sm px-2 py-1.5 rounded-md border border-brand-line"
        >
          <option value="team">{t('membersPanel.roleTeam')}</option>
          <option value="auditor">{t('membersPanel.roleAuditor')}</option>
        </select>
        <button
          type="submit"
          disabled={invite.isPending}
          className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white disabled:opacity-50"
        >
          {invite.isPending ? t('membersPanel.assigning') : t('membersPanel.assign')}
        </button>
      </form>
      {notice && <p className="text-xs text-brand-green">{notice}</p>}
      {error && <p className="text-xs text-brand-red">{error}</p>}
    </div>
  )
}
