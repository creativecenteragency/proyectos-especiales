import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money } from '../lib/taskHelpers'
import type { Axis, Client, Project, RoadmapItem } from '../types/database'

export default function ProjectProposal() {
  const { t } = useTranslation()
  const { slug } = useParams<{ slug: string }>()
  const { profile, session } = useAuth()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['project-proposal', slug],
    queryFn: async () => {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*, clients(*)')
        .eq('slug', slug)
        .single()
      if (projectError) throw projectError

      const [{ data: axes }, { data: roadmap }] = await Promise.all([
        supabase.from('axes').select('*').eq('project_id', project.id).order('sort_order'),
        supabase.from('roadmap_items').select('*').eq('project_id', project.id).order('sort_order'),
      ])

      return {
        project: project as Project & { clients: Client | null },
        axes: (axes ?? []) as Axis[],
        roadmap: (roadmap ?? []) as RoadmapItem[],
      }
    },
    enabled: !!slug && !!session,
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['project-proposal', slug] })
  }

  const updateProject = useMutation({
    mutationFn: async (patch: Partial<Project>) => {
      if (!data) return
      const { error } = await supabase.from('projects').update(patch).eq('id', data.project.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const addRoadmapItem = useMutation({
    mutationFn: async () => {
      if (!data) return
      const { error } = await supabase.from('roadmap_items').insert({
        project_id: data.project.id,
        quarter_label: 'Q_ · ',
        title: t('projectProposal.newQuarterDefaultTitle'),
        period_label: '',
        bullets: [],
        sort_order: data.roadmap.length + 1,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateRoadmapItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RoadmapItem> }) => {
      const { error } = await supabase.from('roadmap_items').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteRoadmapItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('roadmap_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  if (isLoading || !data) return <div className="min-h-screen flex items-center justify-center text-brand-gray">{t('common.loading')}</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-brand-red">{t('projectProposal.loadError')}</div>

  const { project, axes, roadmap } = data
  const isMaster = !!profile?.is_master
  const brandColor = project.clients?.brand_color ?? '#f47a20'

  return (
    <div className="min-h-screen bg-brand-cream">
      <header className="bg-brand-carbon text-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link to={`/proyecto/${project.slug}`} className="text-xs text-white/60 hover:text-white">{t('projectProposal.backToProject')}</Link>
          <div className="flex items-center gap-2 mt-3 mb-1">
            <span
              className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full"
              style={{ backgroundColor: brandColor + '30', color: brandColor }}
            >
              {project.clients?.name}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-white/50">{t('projectProposal.badge')}</span>
          </div>
          <h1 className="text-3xl font-display font-semibold mb-2">{project.name}</h1>
          <p className="text-sm text-white/70 max-w-2xl">{t('projectProposal.subtitle')}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <EditableSection
          title={t('projectProposal.ideaTitle')}
          value={project.proposal_summary}
          placeholder={t('projectProposal.ideaPlaceholder')}
          canEdit={isMaster}
          large
          onSave={(v) => updateProject.mutate({ proposal_summary: v })}
        />

        <EditableSection
          title={t('projectProposal.objectivesTitle')}
          value={project.proposal_objectives}
          placeholder={t('projectProposal.objectivesPlaceholder')}
          canEdit={isMaster}
          onSave={(v) => updateProject.mutate({ proposal_objectives: v })}
        />

        <section className="bg-white border border-brand-line rounded-xl p-5">
          <h2 className="text-sm font-display font-semibold text-brand-carbon mb-3">{t('projectProposal.budgetTitle')}</h2>
          <div className="text-2xl font-display font-semibold text-brand-carbon mb-4">
            {project.currency} {money(Number(project.total_budget))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {axes.map((axis) => {
              const pct = Number(project.total_budget) > 0 ? (Number(axis.budget_amount) / Number(project.total_budget)) * 100 : 0
              return (
                <div key={axis.id} className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: axis.color }} />
                  <span className="flex-1 text-brand-carbon">{axis.name}</span>
                  <span className="text-brand-gray text-xs">{pct.toFixed(0)}%</span>
                </div>
              )
            })}
          </div>
          {axes.length === 0 && <p className="text-sm text-brand-gray">{t('projectProposal.noAxesYet')}</p>}
        </section>

        <section>
          <h2 className="text-sm font-display font-semibold text-brand-carbon mb-3">{t('projectProposal.roadmapTitle')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {roadmap.map((item) => (
              <RoadmapCard
                key={item.id}
                item={item}
                canEdit={isMaster}
                onSave={(patch) => updateRoadmapItem.mutate({ id: item.id, patch })}
                onDelete={() => {
                  if (confirm(t('projectProposal.deleteConfirm', { title: item.title }))) deleteRoadmapItem.mutate(item.id)
                }}
              />
            ))}
          </div>
          {roadmap.length === 0 && <p className="text-sm text-brand-gray mb-3">{t('projectProposal.noRoadmapYet')}</p>}
          {isMaster && (
            <button
              onClick={() => addRoadmapItem.mutate()}
              className="mt-3 text-sm font-semibold px-3 py-1.5 rounded-md border border-dashed border-brand-line text-brand-gray hover:text-brand-carbon hover:border-brand-carbon"
            >
              {t('projectProposal.addQuarter')}
            </button>
          )}
        </section>
      </main>
    </div>
  )
}

function EditableSection({
  title,
  value,
  placeholder,
  canEdit,
  large,
  onSave,
}: {
  title: string
  value: string | null
  placeholder: string
  canEdit: boolean
  large?: boolean
  onSave: (value: string) => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  return (
    <section className="bg-white border border-brand-line rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-display font-semibold text-brand-carbon">{title}</h2>
        {canEdit && !editing && (
          <button
            onClick={() => {
              setDraft(value ?? '')
              setEditing(true)
            }}
            className="text-xs font-semibold text-brand-orange hover:underline"
          >
            {value ? t('projectProposal.edit') : t('projectProposal.complete')}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="w-full text-sm rounded-md border border-brand-line p-3 min-h-[120px]"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                onSave(draft.trim())
                setEditing(false)
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white"
            >
              {t('projectProposal.save')}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-brand-gray">
              {t('projectProposal.cancel')}
            </button>
          </div>
        </div>
      ) : value ? (
        <p className={`text-brand-carbon whitespace-pre-line ${large ? 'text-lg leading-relaxed' : 'text-sm leading-relaxed'}`}>
          {value}
        </p>
      ) : (
        <p className="text-sm text-brand-gray italic">{canEdit ? placeholder : t('projectProposal.notLoadedYet')}</p>
      )}
    </section>
  )
}

function RoadmapCard({
  item,
  canEdit,
  onSave,
  onDelete,
}: {
  item: RoadmapItem
  canEdit: boolean
  onSave: (patch: Partial<RoadmapItem>) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [quarterLabel, setQuarterLabel] = useState(item.quarter_label)
  const [title, setTitle] = useState(item.title)
  const [periodLabel, setPeriodLabel] = useState(item.period_label ?? '')
  const [bulletsText, setBulletsText] = useState(item.bullets.join('\n'))

  if (editing) {
    return (
      <div className="bg-white border border-brand-line rounded-lg p-4 space-y-2">
        <input
          value={quarterLabel}
          onChange={(e) => setQuarterLabel(e.target.value)}
          placeholder={t('projectProposal.quarterLabelPlaceholder')}
          className="w-full text-[10px] uppercase tracking-wider font-bold text-brand-orange border border-brand-line rounded px-2 py-1"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('projectProposal.quarterTitlePlaceholder')}
          className="w-full text-sm font-semibold border border-brand-line rounded px-2 py-1"
        />
        <input
          value={periodLabel}
          onChange={(e) => setPeriodLabel(e.target.value)}
          placeholder={t('projectProposal.periodPlaceholder')}
          className="w-full text-xs text-brand-gray border border-brand-line rounded px-2 py-1"
        />
        <textarea
          value={bulletsText}
          onChange={(e) => setBulletsText(e.target.value)}
          placeholder={t('projectProposal.bulletsPlaceholder')}
          className="w-full text-xs border border-brand-line rounded px-2 py-1 min-h-[80px]"
        />
        <div className="flex gap-2">
          <button
            onClick={() => {
              onSave({
                quarter_label: quarterLabel.trim(),
                title: title.trim(),
                period_label: periodLabel.trim() || null,
                bullets: bulletsText.split('\n').map((b) => b.trim()).filter(Boolean),
              })
              setEditing(false)
            }}
            className="text-xs font-semibold px-2 py-1 rounded-md bg-brand-orange text-white"
          >
            {t('projectProposal.save')}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-brand-gray">{t('projectProposal.cancel')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-brand-line rounded-lg p-4 relative">
      {canEdit && (
        <div className="absolute top-2 right-2 flex gap-1">
          <button onClick={() => setEditing(true)} title={t('common.rename')} className="h-5 w-5 rounded-full bg-brand-carbon text-white text-[11px] flex items-center justify-center">✎</button>
          <button onClick={onDelete} title={t('common.delete')} className="h-5 w-5 rounded-full bg-brand-carbon text-white text-[11px] flex items-center justify-center">×</button>
        </div>
      )}
      <div className="text-[10px] uppercase tracking-wider font-bold text-brand-orange mb-1">{item.quarter_label}</div>
      <h3 className="text-base font-display font-semibold text-brand-carbon mb-1">{item.title}</h3>
      {item.period_label && <p className="text-xs text-brand-gray mb-2">{item.period_label}</p>}
      {item.bullets.length > 0 && (
        <ul className="text-xs text-brand-carbon/80 list-disc pl-4 space-y-0.5">
          {item.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
