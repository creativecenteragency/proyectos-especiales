import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, projectedClose } from '../lib/taskHelpers'
import { localized } from '../lib/translate'
import BrandMark from '../components/BrandMark'
import type { Axis, Client, Group, List, Project, Provider, Task } from '../types/database'

type Sections = { financial: boolean; axes: boolean; tasks: boolean }

export default function ReportPrint() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? 'es'
  const dateLocale = lang === 'pt-BR' ? 'pt-BR' : 'es-AR'
  const { slug } = useParams<{ slug: string }>()
  const { session } = useAuth()
  const [sections, setSections] = useState<Sections>({ financial: true, axes: true, tasks: true })

  const { data, isLoading } = useQuery({
    queryKey: ['project-report', slug],
    queryFn: async () => {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*, clients(*)')
        .eq('slug', slug)
        .single()
      if (projectError) throw projectError

      const [{ data: axes }, { data: lists }, { data: providers }] = await Promise.all([
        supabase.from('axes').select('*').eq('project_id', project.id).order('sort_order'),
        supabase.from('lists').select('*').eq('project_id', project.id).order('sort_order'),
        supabase.from('providers').select('*'),
      ])

      const listIds = (lists ?? []).map((l) => l.id)
      const { data: groups } = listIds.length
        ? await supabase.from('groups').select('*').in('list_id', listIds).order('sort_order')
        : { data: [] as Group[] }

      const groupIds = (groups ?? []).map((g) => g.id)
      const { data: tasks } = groupIds.length
        ? await supabase.from('tasks').select('*').in('group_id', groupIds).order('sort_order')
        : { data: [] as Task[] }

      return {
        project: project as Project & { clients: Client | null },
        axes: (axes ?? []) as Axis[],
        lists: (lists ?? []) as List[],
        groups: (groups ?? []) as Group[],
        tasks: (tasks ?? []) as Task[],
        providers: (providers ?? []) as Provider[],
      }
    },
    enabled: !!slug && !!session,
  })

  if (isLoading || !data) return <div className="p-10 text-brand-gray">{t('reportPrint.loading')}</div>

  const { project, axes, lists, groups, tasks, providers } = data
  const plannedTotal = tasks.reduce((s, t) => s + Number(t.planned_amount), 0)
  const actualTotal = tasks.reduce((s, t) => s + Number(t.actual_amount), 0)
  const projectedTotal = projectedClose(tasks)

  return (
    <div className="min-h-screen bg-white text-brand-carbon">
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Link to={`/proyecto/${project.slug}`} className="text-sm text-brand-gray hover:text-brand-carbon">{t('reportPrint.backToProject')}</Link>
        </div>

        <div className="print:hidden bg-brand-cream border border-brand-line rounded-xl p-4 mb-6 flex flex-wrap items-center gap-4">
          <span className="text-xs font-semibold text-brand-carbon uppercase tracking-wider">{t('reportPrint.includeLabel')}</span>
          <SectionToggle label={t('reportPrint.financialSummaryToggle')} checked={sections.financial} onChange={(v) => setSections((s) => ({ ...s, financial: v }))} />
          <SectionToggle label={t('reportPrint.axesToggle')} checked={sections.axes} onChange={(v) => setSections((s) => ({ ...s, axes: v }))} />
          <SectionToggle label={t('reportPrint.tasksToggle')} checked={sections.tasks} onChange={(v) => setSections((s) => ({ ...s, tasks: v }))} />
          <button
            onClick={() => window.print()}
            className="ml-auto text-sm font-semibold px-4 py-2 rounded-md bg-brand-orange text-white"
          >
            {t('reportPrint.downloadPrint')}
          </button>
        </div>

        <div className="flex items-start justify-between border-b-2 border-brand-carbon pb-4 mb-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-brand-gray">
              {t('reportPrint.reportSubtitle', { client: project.clients?.name })}
            </div>
            <h1 className="text-2xl font-display font-semibold">{localized(project.name, project.name_pt, lang)}</h1>
            <p className="text-sm text-brand-gray mt-1">
              {t('reportPrint.issuedOn', { date: new Date().toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' }) })}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {project.clients?.logo_url && <img src={project.clients.logo_url} alt={project.clients.name} className="h-10 max-w-[140px] object-contain" />}
            <BrandMark full className="h-8 w-auto" />
          </div>
        </div>

        {sections.financial && (
          <section className="mb-8">
            <h2 className="text-sm font-display font-semibold uppercase tracking-wider mb-2">{t('reportPrint.financial.title')}</h2>
            <table className="w-full text-sm border-collapse">
              <tbody>
                <Row label={t('reportPrint.financial.total')} value={`${project.currency} ${money(Number(project.total_budget))}`} />
                <Row label={t('reportPrint.financial.planned')} value={`${project.currency} ${money(plannedTotal)}`} />
                <Row label={t('reportPrint.financial.actual')} value={`${project.currency} ${money(actualTotal)}`} />
                <Row label={t('reportPrint.financial.balance')} value={`${project.currency} ${money(Number(project.total_budget) - actualTotal)}`} />
                <Row
                  label={t('reportPrint.financial.projectedClose')}
                  value={`${project.currency} ${money(projectedTotal)}`}
                  warn={projectedTotal > Number(project.total_budget)}
                />
              </tbody>
            </table>
          </section>
        )}

        {sections.axes && (
          <section className="mb-8">
            <h2 className="text-sm font-display font-semibold uppercase tracking-wider mb-2">{t('reportPrint.axesTitle')}</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-brand-carbon text-left">
                  <th className="py-1.5 pr-2 font-semibold">{t('reportPrint.axesTable.axis')}</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">{t('reportPrint.axesTable.budget')}</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">{t('reportPrint.axesTable.planned')}</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">{t('reportPrint.axesTable.actual')}</th>
                  <th className="py-1.5 font-semibold text-right">{t('reportPrint.axesTable.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {axes.map((axis) => {
                  const axisTasks = tasks.filter((t) => t.axis_id === axis.id)
                  const p = axisTasks.reduce((s, t) => s + Number(t.planned_amount), 0)
                  const a = axisTasks.reduce((s, t) => s + Number(t.actual_amount), 0)
                  return (
                    <tr key={axis.id} className="border-b border-brand-line">
                      <td className="py-1.5 pr-2">
                        <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ backgroundColor: axis.color }} />
                        {localized(axis.name, axis.name_pt, lang)}
                      </td>
                      <td className="py-1.5 pr-2 text-right">{money(Number(axis.budget_amount))}</td>
                      <td className="py-1.5 pr-2 text-right">{money(p)}</td>
                      <td className="py-1.5 pr-2 text-right">{money(a)}</td>
                      <td className="py-1.5 text-right">{money(Number(axis.budget_amount) - a)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}

        {sections.tasks && lists.map((list) => (
          <section key={list.id} className="mb-8 break-inside-avoid">
            <h2 className="text-sm font-display font-semibold uppercase tracking-wider mb-2">{localized(list.name, list.name_pt, lang)}</h2>
            {groups.filter((g) => g.list_id === list.id).map((group) => {
              const groupTasks = tasks.filter((t) => t.group_id === group.id)
              if (groupTasks.length === 0) return null
              return (
                <div key={group.id} className="mb-4">
                  <h3 className="text-xs font-semibold text-brand-gray uppercase tracking-wider mb-1">{localized(group.name, group.name_pt, lang)}</h3>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-brand-line text-left text-brand-gray">
                        <th className="py-1 pr-2 font-medium">{t('reportPrint.tasksTable.task')}</th>
                        <th className="py-1 pr-2 font-medium">{t('reportPrint.tasksTable.status')}</th>
                        <th className="py-1 pr-2 font-medium">{t('reportPrint.tasksTable.provider')}</th>
                        <th className="py-1 pr-2 font-medium text-right">{t('reportPrint.tasksTable.planned')}</th>
                        <th className="py-1 font-medium text-right">{t('reportPrint.tasksTable.actual')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupTasks.map((task) => {
                        const provider = providers.find((p) => p.id === task.provider_id)
                        return (
                          <tr key={task.id} className="border-b border-brand-line">
                            <td className="py-1 pr-2">{localized(task.title, task.title_pt, lang)}</td>
                            <td className="py-1 pr-2">{t(`common.status.${task.status}`)}</td>
                            <td className="py-1 pr-2">{provider?.name ?? '—'}</td>
                            <td className="py-1 pr-2 text-right">{money(Number(task.planned_amount))}</td>
                            <td className="py-1 text-right">{money(Number(task.actual_amount))}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}

function SectionToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-brand-carbon cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-brand-orange" />
      {label}
    </label>
  )
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <tr className="border-b border-brand-line">
      <td className="py-1.5 text-brand-gray">{label}</td>
      <td className={`py-1.5 text-right font-semibold ${warn ? 'text-brand-red' : 'text-brand-carbon'}`}>{value}</td>
    </tr>
  )
}
