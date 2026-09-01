import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { STATUS_LABEL, STATUS_COLOR, money, projectedClose } from '../lib/taskHelpers'
import { useUnsavedChangesGuard } from '../lib/useUnsavedChangesGuard'
import BrandMark from '../components/BrandMark'
import ClientLogoEditor from '../components/ClientLogoEditor'
import ProjectMembersPanel from '../components/ProjectMembersPanel'
import LanguageSwitcher from '../components/LanguageSwitcher'
import Dropdown, { DropdownItem, DropdownLink } from '../components/Dropdown'
import type { Axis, AxisChangeLog, Client, Group, List, Project, Provider, Task, TaskDependency, TaskStatus } from '../types/database'

type ProjectDetailData = {
  project: Project & { clients: Client | null }
  axes: Axis[]
  lists: List[]
  groups: Group[]
  tasks: Task[]
  dependencies: TaskDependency[]
  role: 'team' | 'auditor' | null
  changeLog: AxisChangeLog[]
}

// Tablero de tareas en edición: mientras haya arrastres o duplicados pendientes, nada se
// escribe en la base — solo se aplica al confirmar con "Guardar cambios".
type BoardDraft = Record<string, string[]> // group_id -> ids ordenados ("new:<uuid>" = duplicado sin guardar)
type PendingDuplicate = { source: Task; targetGroupId: string }

export default function ProjectDetail() {
  const { t } = useTranslation()
  const { slug } = useParams<{ slug: string }>()
  const { profile, session } = useAuth()
  const queryClient = useQueryClient()
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [showAxisEditor, setShowAxisEditor] = useState(false)
  const [showLogoEditor, setShowLogoEditor] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [boardDraft, setBoardDraft] = useState<BoardDraft | null>(null)
  const [pendingDuplicates, setPendingDuplicates] = useState<Record<string, PendingDuplicate>>({})
  const boardDirty = boardDraft !== null || Object.keys(pendingDuplicates).length > 0
  useUnsavedChangesGuard(boardDirty)

  const { data, isLoading, error } = useQuery({
    queryKey: ['project-detail', slug],
    queryFn: async (): Promise<ProjectDetailData> => {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*, clients(*)')
        .eq('slug', slug)
        .single()
      if (projectError) throw projectError

      const [{ data: axes }, { data: lists }, { data: roleRow }, { data: changeLog }] = await Promise.all([
        supabase.from('axes').select('*').eq('project_id', project.id).order('sort_order'),
        supabase.from('lists').select('*').eq('project_id', project.id).order('sort_order'),
        supabase
          .from('project_members')
          .select('role')
          .eq('project_id', project.id)
          .eq('user_id', session!.user.id)
          .maybeSingle(),
        supabase
          .from('axis_change_log')
          .select('*')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      const listIds = (lists ?? []).map((l) => l.id)
      const { data: groups } = listIds.length
        ? await supabase.from('groups').select('*').in('list_id', listIds).order('sort_order')
        : { data: [] as Group[] }

      const groupIds = (groups ?? []).map((g) => g.id)
      const { data: tasks } = groupIds.length
        ? await supabase.from('tasks').select('*').in('group_id', groupIds).order('sort_order')
        : { data: [] as Task[] }

      const taskIds = (tasks ?? []).map((t) => t.id)
      const { data: dependencies } = taskIds.length
        ? await supabase.from('task_dependencies').select('*').in('task_id', taskIds)
        : { data: [] as TaskDependency[] }

      return {
        project: project as Project & { clients: Client | null },
        axes: axes ?? [],
        lists: lists ?? [],
        groups: groups ?? [],
        tasks: (tasks ?? []) as Task[],
        dependencies: (dependencies ?? []) as TaskDependency[],
        role: (roleRow?.role as 'team' | 'auditor' | undefined) ?? null,
        changeLog: (changeLog ?? []) as AxisChangeLog[],
      }
    },
    enabled: !!slug && !!session,
  })

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('providers').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Provider[]
    },
  })

  const canEdit = !!profile?.is_master || data?.role === 'team'
  const isMaster = !!profile?.is_master

  const list = data?.lists.find((l) => l.id === activeListId) ?? data?.lists[0] ?? null
  const groupsOfList = useMemo(
    () => (data && list ? data.groups.filter((g) => g.list_id === list.id) : []),
    [data, list],
  )

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['project-detail', slug] })
  }
  function invalidateProviders() {
    queryClient.invalidateQueries({ queryKey: ['providers'] })
  }

  const addList = useMutation({
    mutationFn: async (name: string) => {
      if (!data) return
      const sort_order = data.lists.length + 1
      const { error } = await supabase.from('lists').insert({ project_id: data.project.id, name, sort_order })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateList = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('lists').update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteList = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lists').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setActiveListId(null)
      invalidate()
    },
  })

  const addGroup = useMutation({
    mutationFn: async ({ listId, name }: { listId: string; name: string }) => {
      const sort_order = groupsOfList.length + 1
      const { error } = await supabase.from('groups').insert({ list_id: listId, name, sort_order })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateGroup = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('groups').update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('groups').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const addTask = useMutation({
    mutationFn: async (input: { groupId: string; title: string; axisId: string | null; planned: number }) => {
      const count = data?.tasks.filter((t) => t.group_id === input.groupId).length ?? 0
      const { error } = await supabase.from('tasks').insert({
        group_id: input.groupId,
        axis_id: input.axisId,
        title: input.title,
        planned_amount: input.planned,
        sort_order: count + 1,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err: unknown) => alert(t('projectDetail.taskCreateError', { error: err instanceof Error ? err.message : String(err) })),
  })

  const updateTask = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { error } = await supabase.from('tasks').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err: unknown) => alert(t('projectDetail.taskUpdateError', { error: err instanceof Error ? err.message : String(err) })),
  })

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err: unknown) => alert(t('projectDetail.taskDeleteError', { error: err instanceof Error ? err.message : String(err) })),
  })

  const commitBoard = useMutation({
    mutationFn: async () => {
      const ops: PromiseLike<{ error: { message: string } | null }>[] = []

      if (boardDraft) {
        for (const [groupId, ids] of Object.entries(boardDraft)) {
          ids.forEach((id, index) => {
            if (id.startsWith('new:')) return
            const sortOrder = index + 1
            const original = data?.tasks.find((t) => t.id === id)
            if (!original) return
            if (original.group_id !== groupId || original.sort_order !== sortOrder) {
              ops.push(supabase.from('tasks').update({ group_id: groupId, sort_order: sortOrder }).eq('id', id))
            }
          })
        }
      }

      const dupEntries = Object.entries(pendingDuplicates)
      for (const [tempId, { source, targetGroupId }] of dupEntries) {
        let sortOrder: number
        if (boardDraft?.[targetGroupId]) {
          sortOrder = boardDraft[targetGroupId].indexOf(tempId) + 1
        } else {
          const existingCount = data?.tasks.filter((t) => t.group_id === targetGroupId).length ?? 0
          const priorInGroup = dupEntries.filter(([id, d]) => d.targetGroupId === targetGroupId && id < tempId).length
          sortOrder = existingCount + priorInGroup + 1
        }
        ops.push(
          supabase.from('tasks').insert({
            group_id: targetGroupId,
            axis_id: source.axis_id,
            provider_id: source.provider_id,
            campaign_ref: source.campaign_ref,
            title: `${source.title}${t('projectDetail.copySuffix')}`,
            description: source.description,
            status: 'preparacion',
            tags: source.tags,
            custom_fields: source.custom_fields,
            planned_amount: source.planned_amount,
            actual_amount: 0,
            due_date: source.due_date,
            sort_order: sortOrder,
          }),
        )
      }

      const results = await Promise.all(ops)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw new Error(failed.error.message)
    },
    onSuccess: () => {
      setBoardDraft(null)
      setPendingDuplicates({})
      invalidate()
    },
    onError: (err: unknown) => alert(t('projectDetail.boardSaveError', { error: err instanceof Error ? err.message : String(err) })),
  })

  const addDependency = useMutation({
    mutationFn: async ({ taskId, dependsOnId }: { taskId: string; dependsOnId: string }) => {
      const { error } = await supabase.from('task_dependencies').insert({ task_id: taskId, depends_on_task_id: dependsOnId })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err: unknown) => alert(t('projectDetail.dependencyLinkError', { error: err instanceof Error ? err.message : String(err) })),
  })

  const removeDependency = useMutation({
    mutationFn: async ({ taskId, dependsOnId }: { taskId: string; dependsOnId: string }) => {
      const { error } = await supabase.from('task_dependencies').delete().eq('task_id', taskId).eq('depends_on_task_id', dependsOnId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const saveAxisPlan = useMutation({
    mutationFn: async ({
      rows,
      reason,
      adjustTotal,
    }: {
      rows: { id: string | null; name: string; color: string; budget: number }[]
      reason: string
      adjustTotal: boolean
    }) => {
      if (!data) return
      let sortOrder = data.axes.length + 1
      for (const row of rows) {
        if (row.id === null) {
          const { data: inserted, error } = await supabase
            .from('axes')
            .insert({ project_id: data.project.id, name: row.name, color: row.color, budget_amount: row.budget, sort_order: sortOrder++ })
            .select()
            .single()
          if (error) throw error
          await supabase.from('axis_change_log').insert({
            project_id: data.project.id,
            axis_id: inserted.id,
            action: 'created',
            after: inserted,
            reason,
            user_id: session!.user.id,
          })
        } else {
          const original = data.axes.find((a) => a.id === row.id)
          if (!original) continue
          const changed = original.name !== row.name || original.color !== row.color || Number(original.budget_amount) !== row.budget
          if (!changed) continue
          const { data: updated, error } = await supabase
            .from('axes')
            .update({ name: row.name, color: row.color, budget_amount: row.budget })
            .eq('id', row.id)
            .select()
            .single()
          if (error) throw error
          await supabase.from('axis_change_log').insert({
            project_id: data.project.id,
            axis_id: row.id,
            action: 'updated',
            before: original,
            after: updated,
            reason,
            user_id: session!.user.id,
          })
        }
      }

      if (adjustTotal) {
        const newTotal = rows.reduce((s, r) => s + r.budget, 0)
        if (newTotal !== Number(data.project.total_budget)) {
          const { error } = await supabase.from('projects').update({ total_budget: newTotal }).eq('id', data.project.id)
          if (error) throw error
          await supabase.from('axis_change_log').insert({
            project_id: data.project.id,
            axis_id: null,
            action: 'updated',
            before: { total_budget: data.project.total_budget },
            after: { total_budget: newTotal },
            reason: t('projectDetail.axisEditor.totalAdjustReason', { reason }),
            user_id: session!.user.id,
          })
        }
      }
    },
    onSuccess: invalidate,
  })

  const deleteAxis = useMutation({
    mutationFn: async ({ axis, reason }: { axis: Axis; reason: string }) => {
      if (!data) return
      await supabase.from('axis_change_log').insert({
        project_id: data.project.id,
        axis_id: null,
        action: 'deleted',
        before: axis,
        reason,
        user_id: session!.user.id,
      })
      const { error } = await supabase.from('axes').delete().eq('id', axis.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const addProvider = useMutation({
    mutationFn: async (input: { name: string; cuit: string }) => {
      const { data: inserted, error } = await supabase
        .from('providers')
        .insert({ name: input.name, cuit: input.cuit || null })
        .select()
        .single()
      if (error) throw error
      return inserted as Provider
    },
    onSuccess: invalidateProviders,
  })

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-brand-gray">{t('common.loading')}</div>
  if (error || !data) return <div className="min-h-screen flex items-center justify-center text-brand-red">{t('projectDetail.loadError')}</div>

  const { project, axes, tasks } = data
  const plannedTotal = tasks.reduce((sum, t) => sum + Number(t.planned_amount), 0)
  const actualTotal = tasks.reduce((sum, t) => sum + Number(t.actual_amount), 0)
  const projectedTotal = projectedClose(tasks)
  const balance = Number(project.total_budget) - actualTotal
  const overBudget = projectedTotal > Number(project.total_budget)
  const brandColor = project.clients?.brand_color ?? '#f47a20'

  function cloneBoardDraft(draft: BoardDraft): BoardDraft {
    return Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, [...v]]))
  }

  function boardDraftFromServer(): BoardDraft {
    const draft: BoardDraft = {}
    for (const g of groupsOfList) {
      draft[g.id] = tasks
        .filter((t) => t.group_id === g.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t) => t.id)
    }
    return draft
  }

  function moveTaskInBoard(taskId: string, toGroupId: string, toIndex: number) {
    setBoardDraft((prev) => {
      const draft = prev ? cloneBoardDraft(prev) : boardDraftFromServer()
      for (const gid of Object.keys(draft)) draft[gid] = draft[gid].filter((id) => id !== taskId)
      if (!draft[toGroupId]) draft[toGroupId] = []
      const clamped = Math.max(0, Math.min(toIndex, draft[toGroupId].length))
      draft[toGroupId].splice(clamped, 0, taskId)
      return draft
    })
  }

  function duplicateTaskTo(source: Task, targetGroupId: string) {
    const tempId = `new:${crypto.randomUUID()}`
    setPendingDuplicates((prev) => ({ ...prev, [tempId]: { source, targetGroupId } }))
    if (groupsOfList.some((g) => g.id === targetGroupId)) {
      setBoardDraft((prev) => {
        const draft = prev ? cloneBoardDraft(prev) : boardDraftFromServer()
        draft[targetGroupId] = [...(draft[targetGroupId] ?? []), tempId]
        return draft
      })
    }
  }

  function removePendingDuplicate(tempId: string) {
    setPendingDuplicates((prev) => {
      const next = { ...prev }
      delete next[tempId]
      return next
    })
    setBoardDraft((prev) => {
      if (!prev) return prev
      const draft = cloneBoardDraft(prev)
      for (const gid of Object.keys(draft)) draft[gid] = draft[gid].filter((id) => id !== tempId)
      return draft
    })
  }

  function discardBoard() {
    setBoardDraft(null)
    setPendingDuplicates({})
  }

  const crossListDuplicates = Object.entries(pendingDuplicates).filter(
    ([, pd]) => !groupsOfList.some((g) => g.id === pd.targetGroupId),
  )

  return (
    <div className="min-h-screen bg-brand-cream">
      <header className="bg-brand-carbon text-white">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-xs text-white/60 hover:text-white">{t('projectDetail.backToProjects')}</Link>
            <div className="flex items-center gap-4">
              <LanguageSwitcher className="border-white/20 text-white/80" />
              {(isMaster || canEdit) && (
                <Dropdown trigger={<span className="text-xs text-white/60 hover:text-white">{t('projectDetail.settings')} ▾</span>}>
                  {isMaster && (
                    <DropdownItem onClick={() => setShowLogoEditor((v) => !v)}>{t('projectDetail.clientLogo')}</DropdownItem>
                  )}
                  {isMaster && (
                    <DropdownItem onClick={() => setShowMembers((v) => !v)}>{t('projectDetail.projectMembers')}</DropdownItem>
                  )}
                  {canEdit && (
                    <DropdownLink to={`/proyecto/${project.slug}/marca-en-accion`}>
                      {t('projectDetail.brandInAction')}
                      <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-brand-orange/20 text-brand-orange">BETA</span>
                    </DropdownLink>
                  )}
                </Dropdown>
              )}
              <Link to={`/proyecto/${project.slug}/propuesta`} className="text-xs text-white/60 hover:text-white">
                {t('projectDetail.originalProposal')}
              </Link>
              <Link to={`/proyecto/${project.slug}/informe`} className="text-xs text-white/60 hover:text-white">
                {t('projectDetail.printableReport')}
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4 mb-1">
            <BrandMark variant="negative" className="h-6 w-6" />
            {(project.clients?.logo_url_negative || project.clients?.logo_url) && (
              <img
                src={project.clients.logo_url_negative || project.clients.logo_url || ''}
                alt={project.clients.name ?? ''}
                className="h-6 max-w-[120px] object-contain"
              />
            )}
            <span
              className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full"
              style={{ backgroundColor: brandColor + '30', color: brandColor }}
            >
              {project.clients?.name}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-white/50">{t(`common.projectStatus.${project.status}`)}</span>
          </div>
          {isMaster && showLogoEditor && project.clients && (
            <ClientLogoEditor client={project.clients} onSaved={invalidate} />
          )}
          <h1 className="text-3xl font-display font-semibold mb-2">{project.name}</h1>
          <p className="text-sm text-white/70 max-w-2xl mb-6">{project.description}</p>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-white/10 rounded-lg overflow-hidden">
            <Stat label={t('projectDetail.stats.totalBudget')} value={`${project.currency} ${money(Number(project.total_budget))}`} />
            <Stat label={t('projectDetail.stats.planned')} value={`${project.currency} ${money(plannedTotal)}`} />
            <Stat label={t('projectDetail.stats.actual')} value={`${project.currency} ${money(actualTotal)}`} />
            <Stat label={t('projectDetail.stats.balance')} value={`${project.currency} ${money(balance)}`} />
            <Stat
              label={t('projectDetail.stats.projectedClose')}
              value={`${project.currency} ${money(projectedTotal)}`}
              alert={overBudget}
            />
          </div>
          {overBudget && (
            <p className="text-xs text-red-300 mt-2">
              {t('projectDetail.overBudgetWarning', {
                currency: project.currency,
                amount: money(projectedTotal - Number(project.total_budget)),
              })}
            </p>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {isMaster && showMembers && (
          <section>
            <ProjectMembersPanel projectId={project.id} />
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-wider text-brand-gray font-semibold">{t('projectDetail.axes.title')}</h2>
            {isMaster && (
              <button
                onClick={() => setShowAxisEditor((v) => !v)}
                className="text-xs font-semibold text-brand-orange hover:underline"
              >
                {showAxisEditor ? t('projectDetail.axes.closeEditor') : t('projectDetail.axes.editAxes')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            {axes.map((axis) => {
              const axisTasks = tasks.filter((t) => t.axis_id === axis.id)
              const axisPlanned = axisTasks.reduce((s, t) => s + Number(t.planned_amount), 0)
              const axisActual = axisTasks.reduce((s, t) => s + Number(t.actual_amount), 0)
              const axisProjected = projectedClose(axisTasks)
              const axisOver = axisProjected > Number(axis.budget_amount)
              const pct = axis.budget_amount > 0 ? Math.min(100, (axisActual / Number(axis.budget_amount)) * 100) : 0
              return (
                <div key={axis.id} className={`bg-white border rounded-lg p-4 ${axisOver ? 'border-brand-red' : 'border-brand-line'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: axis.color }} />
                    <span className="text-xs font-semibold text-brand-carbon">{axis.name}</span>
                  </div>
                  <div className="text-sm font-display font-semibold text-brand-carbon">
                    {project.currency} {money(Number(axis.budget_amount))}
                  </div>
                  <div className="h-1.5 bg-brand-line rounded-full mt-2 mb-1 overflow-hidden">
                    <div className="h-full" style={{ width: `${pct}%`, backgroundColor: axis.color }} />
                  </div>
                  <div className="text-[10px] text-brand-gray">
                    {t('projectDetail.axes.summary', { planned: money(axisPlanned), actual: money(axisActual) })}
                  </div>
                  <div className={`text-[10px] font-semibold mt-0.5 ${axisOver ? 'text-brand-red' : 'text-brand-gray'}`}>
                    {t('projectDetail.axes.projectedClose', { amount: money(axisProjected) })} {axisOver && '⚠'}
                  </div>
                </div>
              )
            })}
            {axes.length === 0 && <p className="text-sm text-brand-gray col-span-full">{t('projectDetail.axes.none')}</p>}
          </div>

          {isMaster && showAxisEditor && (
            <AxisEditor
              axes={axes}
              tasks={tasks}
              totalBudget={Number(project.total_budget)}
              projectActualTotal={actualTotal}
              currency={project.currency}
              changeLog={data.changeLog}
              onSave={(rows, reason, adjustTotal) => saveAxisPlan.mutate({ rows, reason, adjustTotal })}
              onDelete={(axis, reason) => deleteAxis.mutate({ axis, reason })}
            />
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {data.lists.map((l) => (
              <ListTab
                key={l.id}
                list={l}
                active={list?.id === l.id}
                canEdit={canEdit}
                onSelect={() => setActiveListId(l.id)}
                onRename={(name) => updateList.mutate({ id: l.id, name })}
                onDelete={() => {
                  if (confirm(t('projectDetail.board.deleteListConfirm', { name: l.name }))) deleteList.mutate(l.id)
                }}
              />
            ))}
            {canEdit && <AddInline placeholder={t('projectDetail.board.newList')} onSubmit={(name) => addList.mutate(name)} />}
          </div>

          {boardDirty && (
            <div className="sticky top-2 z-30 mb-4 bg-brand-carbon text-white rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow">
              <div className="text-sm">
                <span className="font-semibold">{t('projectDetail.board.unsaved')}</span>
                <span className="text-white/70">{t('projectDetail.board.unsavedHint')}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={discardBoard}
                  disabled={commitBoard.isPending}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-50"
                >
                  {t('projectDetail.board.discard')}
                </button>
                <button
                  onClick={() => commitBoard.mutate()}
                  disabled={commitBoard.isPending}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white disabled:opacity-50"
                >
                  {commitBoard.isPending ? t('common.saving') : t('common.saveChanges')}
                </button>
              </div>
            </div>
          )}

          {crossListDuplicates.length > 0 && (
            <div className="mb-4 space-y-1">
              {crossListDuplicates.map(([tempId, pd]) => {
                const targetGroup = data.groups.find((g) => g.id === pd.targetGroupId)
                const targetList = data.lists.find((l) => l.id === targetGroup?.list_id)
                return (
                  <div key={tempId} className="text-xs bg-white border border-brand-line rounded-md px-3 py-2 flex items-center justify-between">
                    <span>
                      {t('projectDetail.board.copyOf', {
                        title: pd.source.title,
                        list: targetList?.name,
                        group: targetGroup?.name,
                      })}
                    </span>
                    <button onClick={() => removePendingDuplicate(tempId)} className="text-brand-gray hover:text-brand-red">
                      {t('common.remove')}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {!list && <p className="text-sm text-brand-gray">{t('projectDetail.board.noListsYet')}</p>}

          {list && (
            <div className="space-y-6">
              {groupsOfList.map((group) => {
                const groupTaskIds = boardDraft
                  ? boardDraft[group.id] ?? []
                  : tasks
                      .filter((t) => t.group_id === group.id)
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((t) => t.id)
                const groupTasks = groupTaskIds
                  .map((id): Task | null => {
                    if (id.startsWith('new:')) {
                      const pd = pendingDuplicates[id]
                      return pd ? { ...pd.source, id, group_id: pd.targetGroupId } : null
                    }
                    return tasks.find((t) => t.id === id) ?? null
                  })
                  .filter((t): t is Task => !!t)
                const gPlanned = groupTasks.reduce((s, t) => s + Number(t.planned_amount), 0)
                const gActual = groupTasks.reduce((s, t) => s + Number(t.actual_amount), 0)

                function dropOnGroup(toIndex: number) {
                  if (!draggedTaskId) return
                  moveTaskInBoard(draggedTaskId, group.id, toIndex)
                  setDraggedTaskId(null)
                }

                return (
                  <div key={group.id} className="bg-white border border-brand-line rounded-xl overflow-hidden">
                    <GroupHeader
                      group={group}
                      canEdit={canEdit}
                      summary={t('projectDetail.axes.summary', { planned: money(gPlanned), actual: money(gActual) })}
                      onRename={(name) => updateGroup.mutate({ id: group.id, name })}
                      onDelete={() => {
                        if (confirm(t('projectDetail.board.deleteGroupConfirm', { name: group.name }))) deleteGroup.mutate(group.id)
                      }}
                    />
                    <div className="divide-y divide-brand-line">
                      {groupTasks.map((task) =>
                        task.id.startsWith('new:') ? (
                          <PendingTaskRow
                            key={task.id}
                            task={task}
                            axes={axes}
                            currency={project.currency}
                            draggable={canEdit}
                            isDragging={draggedTaskId === task.id}
                            onDragStart={() => setDraggedTaskId(task.id)}
                            onDragEnd={() => setDraggedTaskId(null)}
                            onDropOn={() => {
                              if (!draggedTaskId || draggedTaskId === task.id) return
                              dropOnGroup(groupTaskIds.indexOf(task.id))
                            }}
                            onRemove={() => removePendingDuplicate(task.id)}
                          />
                        ) : (
                          <TaskRow
                            key={task.id}
                            task={task}
                            axes={axes}
                            providers={providers ?? []}
                            allTasks={tasks}
                            dependencies={data.dependencies}
                            currency={project.currency}
                            canEdit={canEdit}
                            isOpen={openTaskId === task.id}
                            onToggle={() => setOpenTaskId(openTaskId === task.id ? null : task.id)}
                            onUpdate={(patch) => updateTask.mutate({ id: task.id, patch })}
                            onDelete={() => {
                              if (confirm(t('projectDetail.board.deleteTaskConfirm', { title: task.title }))) deleteTask.mutate(task.id)
                            }}
                            onAddProvider={(input) => addProvider.mutateAsync(input)}
                            onAddDependency={(dependsOnId) => addDependency.mutate({ taskId: task.id, dependsOnId })}
                            onRemoveDependency={(dependsOnId) => removeDependency.mutate({ taskId: task.id, dependsOnId })}
                            draggable={canEdit}
                            isDragging={draggedTaskId === task.id}
                            onDragStart={() => setDraggedTaskId(task.id)}
                            onDragEnd={() => setDraggedTaskId(null)}
                            onDropOn={() => {
                              if (!draggedTaskId || draggedTaskId === task.id) return
                              dropOnGroup(groupTaskIds.indexOf(task.id))
                            }}
                            lists={data.lists}
                            allGroups={data.groups}
                            onDuplicate={(targetGroupId) => duplicateTaskTo(task, targetGroupId)}
                          />
                        ),
                      )}
                      {groupTasks.length === 0 && (
                        <p className="text-sm text-brand-gray px-5 py-4">{t('projectDetail.board.noTasksYet')}</p>
                      )}
                      {canEdit && (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault()
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            dropOnGroup(groupTaskIds.length)
                          }}
                          className="h-3"
                        />
                      )}
                    </div>
                    {canEdit && !boardDirty && (
                      <div className="px-5 py-3 bg-brand-cream/50">
                        <AddTaskForm axes={axes} onSubmit={(input) => addTask.mutate({ groupId: group.id, ...input })} />
                      </div>
                    )}
                    {canEdit && boardDirty && (
                      <p className="px-5 py-3 bg-brand-cream/50 text-xs text-brand-gray">
                        {t('projectDetail.board.blockedByPending')}
                      </p>
                    )}
                  </div>
                )
              })}

              {canEdit && (
                <AddInline placeholder={t('projectDetail.board.newGroup')} onSubmit={(name) => addGroup.mutate({ listId: list.id, name })} />
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={alert ? 'bg-brand-red px-4 py-3' : 'bg-brand-carbon px-4 py-3'}>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="text-lg font-display font-semibold">{value}</div>
    </div>
  )
}

function ListTab({
  list,
  active,
  canEdit,
  onSelect,
  onRename,
  onDelete,
}: {
  list: List
  active: boolean
  canEdit: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(list.name)

  function commit() {
    setEditing(false)
    if (name.trim() && name.trim() !== list.name) onRename(name.trim())
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          commit()
        }}
        className="flex items-center gap-1"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          className="text-sm px-2 py-1 rounded-md border border-brand-line"
        />
      </form>
    )
  }

  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        className={`text-sm font-semibold px-3 py-1.5 rounded-md border ${
          active
            ? 'bg-brand-carbon text-white border-brand-carbon'
            : 'bg-white text-brand-carbon border-brand-line hover:border-brand-carbon'
        }`}
      >
        {list.name}
      </button>
      {canEdit && (
        <span className="absolute -top-2 -right-2 hidden group-hover:flex gap-0.5">
          <IconButton title={t('common.rename')} onClick={() => setEditing(true)}>✎</IconButton>
          <IconButton title={t('common.delete')} onClick={onDelete}>×</IconButton>
        </span>
      )}
    </div>
  )
}

function GroupHeader({
  group,
  canEdit,
  summary,
  onRename,
  onDelete,
}: {
  group: Group
  canEdit: boolean
  summary: string
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)

  function commit() {
    setEditing(false)
    if (name.trim() && name.trim() !== group.name) onRename(name.trim())
  }

  return (
    <div className="bg-brand-carbon text-white px-5 py-3 flex items-center justify-between gap-3">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            commit()
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            className="text-sm px-2 py-1 rounded-md text-brand-carbon"
          />
        </form>
      ) : (
        <h3 className="font-display font-semibold">{group.name}</h3>
      )}
      <div className="flex items-center gap-3">
        <span className="text-xs text-white/70">{summary}</span>
        {canEdit && !editing && (
          <span className="flex gap-1">
            <IconButton title={t('common.rename')} onClick={() => setEditing(true)} dark>✎</IconButton>
            <IconButton title={t('common.delete')} onClick={onDelete} dark>×</IconButton>
          </span>
        )}
      </div>
    </div>
  )
}

function IconButton({
  children,
  title,
  onClick,
  dark,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  dark?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-5 w-5 rounded-full text-[11px] flex items-center justify-center ${
        dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-brand-carbon text-white shadow'
      }`}
    >
      {children}
    </button>
  )
}

function AddInline({ placeholder, onSubmit }: { placeholder: string; onSubmit: (value: string) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [editing, setEditing] = useState(false)

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-sm font-semibold px-3 py-1.5 rounded-md border border-dashed border-brand-line text-brand-gray hover:text-brand-carbon hover:border-brand-carbon"
      >
        + {placeholder}
      </button>
    )
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    onSubmit(value.trim())
    setValue('')
    setEditing(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => !value && setEditing(false)}
        placeholder={placeholder}
        className="text-sm px-3 py-1.5 rounded-md border border-brand-line focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
      />
      <button type="submit" className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white">
        {t('common.add')}
      </button>
    </form>
  )
}

function AddTaskForm({
  axes,
  onSubmit,
}: {
  axes: Axis[]
  onSubmit: (input: { title: string; axisId: string | null; planned: number }) => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [axisId, setAxisId] = useState<string>('')
  const [planned, setPlanned] = useState('0')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({ title: title.trim(), axisId: axisId || null, planned: Number(planned) || 0 })
    setTitle('')
    setPlanned('0')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('projectDetail.taskForm.titlePlaceholder')}
        className="flex-1 min-w-[180px] text-sm px-3 py-1.5 rounded-md border border-brand-line focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
      />
      <select
        value={axisId}
        onChange={(e) => setAxisId(e.target.value)}
        className="text-sm px-2 py-1.5 rounded-md border border-brand-line"
      >
        <option value="">{t('common.noAxis')}</option>
        {axes.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <input
        type="number"
        value={planned}
        onChange={(e) => setPlanned(e.target.value)}
        className="w-28 text-sm px-2 py-1.5 rounded-md border border-brand-line"
        placeholder={t('projectDetail.taskForm.plannedPlaceholder')}
      />
      <button type="submit" className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white">
        {t('projectDetail.taskForm.submit')}
      </button>
    </form>
  )
}

type AxisRow = { key: string; id: string | null; name: string; color: string; budget: string }

function AxisEditor({
  axes,
  tasks,
  totalBudget,
  projectActualTotal,
  currency,
  changeLog,
  onSave,
  onDelete,
}: {
  axes: Axis[]
  tasks: Task[]
  totalBudget: number
  projectActualTotal: number
  currency: string
  changeLog: AxisChangeLog[]
  onSave: (rows: { id: string | null; name: string; color: string; budget: number }[], reason: string, adjustTotal: boolean) => void
  onDelete: (axis: Axis, reason: string) => void
}) {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.resolvedLanguage === 'pt-BR' ? 'pt-BR' : 'es-AR'
  const floors = useMemo(() => {
    const map = new Map<string, number>()
    for (const axis of axes) {
      const axisTasks = tasks.filter((t) => t.axis_id === axis.id)
      const planned = axisTasks.reduce((s, t) => s + Number(t.planned_amount), 0)
      const actual = axisTasks.reduce((s, t) => s + Number(t.actual_amount), 0)
      map.set(axis.id, Math.max(planned, actual))
    }
    return map
  }, [axes, tasks])

  const [rows, setRows] = useState<AxisRow[]>(() =>
    axes.map((a) => ({ key: a.id, id: a.id, name: a.name, color: a.color, budget: String(a.budget_amount) })),
  )
  const [reason, setReason] = useState('')
  const [showLog, setShowLog] = useState(false)

  const sum = rows.reduce((s, r) => s + (Number(r.budget) || 0), 0)
  const delta = sum - totalBudget
  const balanced = delta === 0

  const rowsDirty =
    rows.length !== axes.length ||
    rows.some((r) => {
      if (r.id === null) return r.name.trim().length > 0
      const original = axes.find((a) => a.id === r.id)
      return !original || original.name !== r.name || original.color !== r.color || String(original.budget_amount) !== r.budget
    })
  useUnsavedChangesGuard(reason.trim().length > 0 || rowsDirty)

  const floorErrors = rows
    .filter((r) => r.id !== null)
    .map((r) => ({ row: r, floor: floors.get(r.id!) ?? 0 }))
    .filter(({ row, floor }) => Number(row.budget) < floor)

  const totalFloorError = sum < projectActualTotal

  function updateRow(key: string, patch: Partial<AxisRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function addDraftRow() {
    setRows((rs) => [...rs, { key: crypto.randomUUID(), id: null, name: '', color: '#f47a20', budget: '0' }])
  }

  function removeDraftRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key))
  }

  function submit(adjustTotal: boolean) {
    if (!reason.trim()) {
      alert(t('projectDetail.axisEditor.alerts.needReason'))
      return
    }
    if (floorErrors.length > 0) {
      alert(t('projectDetail.axisEditor.alerts.floorError'))
      return
    }
    if (!adjustTotal && !balanced) {
      alert(t('projectDetail.axisEditor.alerts.mustBalance'))
      return
    }
    if (adjustTotal && totalFloorError) {
      alert(t('projectDetail.axisEditor.alerts.totalFloorError'))
      return
    }
    const payload = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ id: r.id, name: r.name.trim(), color: r.color, budget: Number(r.budget) || 0 }))
    onSave(payload, reason.trim(), adjustTotal)
    setReason('')
  }

  return (
    <div className="bg-white border border-brand-line rounded-xl p-5 mb-4 space-y-4">
      <div>
        <h3 className="text-sm font-display font-semibold text-brand-carbon">{t('projectDetail.axisEditor.title')}</h3>
        <p className="text-xs text-brand-gray mt-0.5">{t('projectDetail.axisEditor.subtitle')}</p>
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const floor = row.id ? floors.get(row.id) ?? 0 : 0
          const overFloor = Number(row.budget) < floor
          return (
            <div key={row.key} className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                value={row.color}
                onChange={(e) => updateRow(row.key, { color: e.target.value })}
                className="h-8 w-8 rounded border border-brand-line flex-shrink-0"
              />
              <input
                value={row.name}
                onChange={(e) => updateRow(row.key, { name: e.target.value })}
                placeholder={row.id ? undefined : t('projectDetail.axisEditor.newAxisPlaceholder')}
                className="flex-1 min-w-[140px] text-sm px-2 py-1.5 rounded-md border border-brand-line"
              />
              <div className="flex flex-col">
                <input
                  type="number"
                  value={row.budget}
                  onChange={(e) => updateRow(row.key, { budget: e.target.value })}
                  className={`w-28 text-sm px-2 py-1.5 rounded-md border ${overFloor ? 'border-brand-red' : 'border-brand-line'}`}
                />
                {floor > 0 && (
                  <span className={`text-[10px] ${overFloor ? 'text-brand-red' : 'text-brand-gray'}`}>
                    {t('projectDetail.axisEditor.minimum', { amount: money(floor) })}
                  </span>
                )}
              </div>
              {row.id === null ? (
                <button type="button" onClick={() => removeDraftRow(row.key)} className="text-xs text-brand-gray hover:text-brand-red">
                  {t('common.remove')}
                </button>
              ) : floor === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const original = axes.find((a) => a.id === row.id)
                    const r = original && prompt(t('projectDetail.axisEditor.deleteAxisPrompt', { name: original.name }))
                    if (r && original) {
                      onDelete(original, r)
                      removeDraftRow(row.key)
                    }
                  }}
                  className="text-xs text-brand-gray hover:text-brand-red"
                >
                  {t('projectDetail.axisEditor.deleteAxis')}
                </button>
              ) : (
                <span className="text-[10px] text-brand-gray" title={t('projectDetail.axisEditor.cannotDeleteTitle')}>
                  {t('projectDetail.axisEditor.cannotDelete')}
                </span>
              )}
            </div>
          )
        })}
        <button onClick={addDraftRow} className="text-xs font-semibold text-brand-orange hover:underline">
          {t('projectDetail.axisEditor.addAxis')}
        </button>
      </div>

      <div className={`text-sm rounded-md p-3 ${balanced ? 'bg-brand-cream' : 'bg-brand-red/10'}`}>
        <div className="flex justify-between">
          <span className="text-brand-gray">{t('projectDetail.axisEditor.sumOfAxes')}</span>
          <span className="font-semibold text-brand-carbon">{currency} {money(sum)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-gray">{t('projectDetail.axisEditor.projectTotalBudget')}</span>
          <span className="font-semibold text-brand-carbon">{currency} {money(totalBudget)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-gray">{t('projectDetail.axisEditor.difference')}</span>
          <span className={`font-semibold ${balanced ? 'text-brand-green' : 'text-brand-red'}`}>
            {delta > 0 ? '+' : ''}{money(delta)}
          </span>
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-brand-line">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('projectDetail.axisEditor.reasonPlaceholder')}
          className="w-full text-sm px-3 py-1.5 rounded-md border border-brand-line"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => submit(false)}
            disabled={!balanced}
            className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-carbon text-white disabled:opacity-40"
          >
            {t('projectDetail.axisEditor.saveRedistribute')}
          </button>
          <button
            onClick={() => submit(true)}
            className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white"
          >
            {t('projectDetail.axisEditor.saveAndAdjust', { currency, amount: money(sum) })}
          </button>
        </div>
      </div>

      <button onClick={() => setShowLog((v) => !v)} className="text-xs font-semibold text-brand-gray hover:text-brand-carbon">
        {showLog ? t('projectDetail.axisEditor.hideLog') : t('projectDetail.axisEditor.showLog', { count: changeLog.length })}
      </button>

      {showLog && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {changeLog.length === 0 && <p className="text-xs text-brand-gray">{t('projectDetail.axisEditor.noLogEntries')}</p>}
          {changeLog.map((entry) => (
            <div key={entry.id} className="text-xs bg-brand-cream rounded-md p-2">
              <div className="font-semibold text-brand-carbon">
                {entry.action === 'created'
                  ? t('projectDetail.axisEditor.logCreated')
                  : entry.action === 'deleted'
                    ? t('projectDetail.axisEditor.logDeleted')
                    : t('projectDetail.axisEditor.logUpdated')}
                <span className="text-brand-gray font-normal"> · {new Date(entry.created_at).toLocaleString(dateLocale)}</span>
              </div>
              {entry.reason && <div className="text-brand-gray">{t('projectDetail.axisEditor.logReason', { reason: entry.reason })}</div>}
              {entry.action === 'updated' && entry.before && entry.after && (
                <div className="text-brand-gray">
                  {String((entry.before as { name?: string }).name ?? t('projectDetail.axisEditor.totalBudgetFallback'))}:{' '}
                  {money(Number((entry.before as { budget_amount?: number; total_budget?: number }).budget_amount ?? (entry.before as { total_budget?: number }).total_budget ?? 0))} →{' '}
                  {money(Number((entry.after as { budget_amount?: number; total_budget?: number }).budget_amount ?? (entry.after as { total_budget?: number }).total_budget ?? 0))} {currency}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type TaskDraft = {
  axisId: string
  planned: string
  actual: string
  providerId: string
  campaignRef: string
  subtasksText: string
  deliverable: string
}

function draftFromTask(task: Task): TaskDraft {
  return {
    axisId: task.axis_id ?? '',
    planned: String(task.planned_amount),
    actual: String(task.actual_amount),
    providerId: task.provider_id ?? '',
    campaignRef: task.campaign_ref ?? '',
    subtasksText: ((task.custom_fields?.subtasks as string[] | undefined) ?? []).join('\n'),
    deliverable: (task.custom_fields?.deliverable as string | undefined) ?? '',
  }
}

function TaskRow({
  task,
  axes,
  providers,
  allTasks,
  dependencies,
  currency,
  canEdit,
  isOpen,
  onToggle,
  onUpdate,
  onDelete,
  onAddProvider,
  onAddDependency,
  onRemoveDependency,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  onDropOn,
  lists,
  allGroups,
  onDuplicate,
}: {
  task: Task
  axes: Axis[]
  providers: Provider[]
  allTasks: Task[]
  dependencies: TaskDependency[]
  currency: string
  canEdit: boolean
  isOpen: boolean
  onToggle: () => void
  onUpdate: (patch: Partial<Task>) => void
  onDelete: () => void
  onAddProvider: (input: { name: string; cuit: string }) => Promise<Provider | undefined>
  onAddDependency: (dependsOnId: string) => void
  onRemoveDependency: (dependsOnId: string) => void
  draggable: boolean
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropOn: () => void
  lists: List[]
  allGroups: Group[]
  onDuplicate: (targetGroupId: string) => void
}) {
  const { t } = useTranslation()
  const axis = axes.find((a) => a.id === task.axis_id)
  const dependsOn = dependencies.filter((d) => d.task_id === task.id).map((d) => allTasks.find((t) => t.id === d.depends_on_task_id)).filter((t): t is Task => !!t)
  const neededBy = dependencies.filter((d) => d.depends_on_task_id === task.id).map((d) => allTasks.find((t) => t.id === d.task_id)).filter((t): t is Task => !!t)
  const [dependencyPick, setDependencyPick] = useState('')
  const [titleEditing, setTitleEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [newProviderName, setNewProviderName] = useState('')
  const [newProviderCuit, setNewProviderCuit] = useState('')
  const [draft, setDraft] = useState<TaskDraft>(() => draftFromTask(task))
  const [dragOver, setDragOver] = useState(false)
  const [showDuplicate, setShowDuplicate] = useState(false)

  // Vuelve a sincronizar el borrador con el servidor cuando la tarea cambia por fuera
  // (guardado exitoso, u otro cambio remoto) — evita pisar ediciones a medio hacer sin motivo.
  const [syncedAt, setSyncedAt] = useState(task.updated_at)
  if (task.updated_at !== syncedAt) {
    setSyncedAt(task.updated_at)
    setDraft(draftFromTask(task))
  }

  const original = draftFromTask(task)
  const dirty =
    draft.axisId !== original.axisId ||
    draft.planned !== original.planned ||
    draft.actual !== original.actual ||
    draft.providerId !== original.providerId ||
    draft.campaignRef !== original.campaignRef ||
    draft.subtasksText !== original.subtasksText ||
    draft.deliverable !== original.deliverable
  useUnsavedChangesGuard(dirty)

  function saveDraft() {
    onUpdate({
      axis_id: draft.axisId || null,
      planned_amount: Number(draft.planned) || 0,
      actual_amount: Number(draft.actual) || 0,
      provider_id: draft.providerId || null,
      campaign_ref: draft.campaignRef.trim() || null,
      custom_fields: {
        ...task.custom_fields,
        subtasks: draft.subtasksText.split('\n').map((s) => s.trim()).filter(Boolean),
        deliverable: draft.deliverable,
      },
    })
  }

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!draggable) return
        e.preventDefault()
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!draggable) return
        e.preventDefault()
        setDragOver(false)
        onDropOn()
      }}
      className={`${isDragging ? 'opacity-40' : ''} ${dragOver ? 'border-t-2 border-brand-orange' : ''}`}
    >
      <div className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-brand-cream/60">
        {draggable && (
          <span title={t('common.dragToReorder')} className="cursor-grab text-brand-gray/50 select-none">⠿</span>
        )}
        <button onClick={onToggle} className="flex-1 text-left flex items-center gap-2">
          <span className="text-[10px] font-mono text-brand-gray/70 flex-shrink-0">#{task.display_id}</span>
          {titleEditing ? (
            <input
              autoFocus
              value={title}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                setTitleEditing(false)
                if (title.trim() && title !== task.title) onUpdate({ title: title.trim() })
              }}
              className="text-sm font-semibold text-brand-carbon border border-brand-line rounded px-1"
            />
          ) : (
            <span className="text-sm font-semibold text-brand-carbon">{task.title}</span>
          )}
        </button>
        {axis && (
          <span
            className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full"
            style={{ backgroundColor: axis.color + '20', color: axis.color }}
          >
            {axis.name}
          </span>
        )}
        <select
          value={task.status}
          disabled={!canEdit}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
          style={{ color: STATUS_COLOR[task.status], backgroundColor: STATUS_COLOR[task.status] + '18' }}
          className="text-[11px] uppercase tracking-wider font-bold border-none rounded-full px-2 py-1 disabled:appearance-none"
        >
          {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((value) => (
            <option key={value} value={value}>{t(`common.status.${value}`)}</option>
          ))}
        </select>
        <span className="text-sm font-semibold text-brand-carbon w-28 text-right">
          {currency} {money(Number(task.planned_amount))}
        </span>
        {canEdit && (
          <span className="flex gap-1 relative">
            <IconButton title={t('common.rename')} onClick={() => setTitleEditing(true)}>✎</IconButton>
            <IconButton title={t('projectDetail.taskRow.duplicate')} onClick={() => setShowDuplicate((v) => !v)}>⧉</IconButton>
            {showDuplicate && (
              <DuplicatePicker
                lists={lists}
                allGroups={allGroups}
                currentGroupId={task.group_id}
                onDuplicate={onDuplicate}
                onClose={() => setShowDuplicate(false)}
              />
            )}
            <IconButton title={t('common.delete')} onClick={onDelete}>×</IconButton>
          </span>
        )}
      </div>

      {isOpen && (
        <div className="px-5 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">{t('projectDetail.taskRow.subtasks')}</h4>
              <textarea
                value={draft.subtasksText}
                disabled={!canEdit}
                onChange={(e) => setDraft((d) => ({ ...d, subtasksText: e.target.value }))}
                placeholder={t('projectDetail.taskRow.subtasksPlaceholder')}
                className="w-full text-sm rounded-md border border-brand-line p-2 min-h-[80px] disabled:bg-brand-cream/50"
              />
            </div>
            <div className="space-y-3">
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">{t('projectDetail.taskRow.deliverable')}</h4>
                <textarea
                  value={draft.deliverable}
                  disabled={!canEdit}
                  onChange={(e) => setDraft((d) => ({ ...d, deliverable: e.target.value }))}
                  className="w-full text-sm rounded-md border-l-4 border-brand-orange bg-brand-cream p-2 min-h-[50px] disabled:opacity-70"
                />
              </div>
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">{t('projectDetail.taskRow.axis')}</h4>
                <select
                  value={draft.axisId}
                  disabled={!canEdit}
                  onChange={(e) => setDraft((d) => ({ ...d, axisId: e.target.value }))}
                  className="w-full text-sm px-2 py-1.5 rounded-md border border-brand-line disabled:bg-brand-cream/50"
                >
                  <option value="">{t('common.noAxis')}</option>
                  {axes.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">{t('projectDetail.taskRow.planned')}</h4>
                  <input
                    type="number"
                    value={draft.planned}
                    disabled={!canEdit}
                    onChange={(e) => setDraft((d) => ({ ...d, planned: e.target.value }))}
                    className="w-full text-sm px-2 py-1.5 rounded-md border border-brand-line disabled:bg-brand-cream/50"
                  />
                </div>
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">{t('projectDetail.taskRow.actual')}</h4>
                  <input
                    type="number"
                    value={draft.actual}
                    disabled={!canEdit}
                    onChange={(e) => setDraft((d) => ({ ...d, actual: e.target.value }))}
                    className="w-full text-sm px-2 py-1.5 rounded-md border border-brand-line disabled:bg-brand-cream/50"
                  />
                </div>
              </div>
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">{t('projectDetail.taskRow.provider')}</h4>
                <select
                  value={draft.providerId}
                  disabled={!canEdit}
                  onChange={(e) => setDraft((d) => ({ ...d, providerId: e.target.value }))}
                  className="w-full text-sm px-2 py-1.5 rounded-md border border-brand-line disabled:bg-brand-cream/50"
                >
                  <option value="">{t('projectDetail.taskRow.noProvider')}</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.cuit ? ` · ${p.cuit}` : ''}</option>
                  ))}
                </select>
                {canEdit && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!newProviderName.trim()) return
                      const created = await onAddProvider({ name: newProviderName.trim(), cuit: newProviderCuit.trim() })
                      if (created) setDraft((d) => ({ ...d, providerId: created.id }))
                      setNewProviderName('')
                      setNewProviderCuit('')
                    }}
                    className="flex items-center gap-1 mt-1"
                  >
                    <input
                      value={newProviderName}
                      onChange={(e) => setNewProviderName(e.target.value)}
                      placeholder={t('projectDetail.taskRow.newProviderPlaceholder')}
                      className="flex-1 text-xs px-2 py-1 rounded-md border border-brand-line"
                    />
                    <input
                      value={newProviderCuit}
                      onChange={(e) => setNewProviderCuit(e.target.value)}
                      placeholder={t('projectDetail.taskRow.cuitPlaceholder')}
                      className="w-24 text-xs px-2 py-1 rounded-md border border-brand-line"
                    />
                    <button type="submit" className="text-xs font-semibold px-2 py-1 rounded-md bg-brand-orange text-white">+</button>
                  </form>
                )}
              </div>
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">{t('projectDetail.taskRow.campaignRef')}</h4>
                <input
                  value={draft.campaignRef}
                  disabled={!canEdit}
                  onChange={(e) => setDraft((d) => ({ ...d, campaignRef: e.target.value }))}
                  placeholder={t('projectDetail.taskRow.campaignRefPlaceholder')}
                  className="w-full text-sm px-2 py-1.5 rounded-md border border-brand-line disabled:bg-brand-cream/50"
                />
                <p className="text-[10px] text-brand-gray mt-0.5">{t('projectDetail.taskRow.campaignRefHelp')}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-4 pt-3 border-t border-brand-line">
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">{t('projectDetail.taskRow.dependsOn')}</h4>
              <p className="text-[10px] text-brand-gray mb-1">{t('projectDetail.taskRow.dependsOnHelp')}</p>
              <div className="flex flex-wrap gap-1 mb-1">
                {dependsOn.map((dep) => (
                  <span key={dep.id} className="inline-flex items-center gap-1 text-xs bg-brand-cream rounded-full px-2 py-1">
                    #{dep.display_id} {dep.title}
                    {canEdit && (
                      <button onClick={() => onRemoveDependency(dep.id)} className="text-brand-gray hover:text-brand-red">×</button>
                    )}
                  </span>
                ))}
                {dependsOn.length === 0 && <span className="text-xs text-brand-gray">{t('common.none')}</span>}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <select
                    value={dependencyPick}
                    onChange={(e) => setDependencyPick(e.target.value)}
                    className="flex-1 text-xs px-2 py-1 rounded-md border border-brand-line"
                  >
                    <option value="">{t('projectDetail.taskRow.pickTask')}</option>
                    {allTasks
                      .filter((at) => at.id !== task.id && !dependsOn.some((d) => d.id === at.id))
                      .map((at) => (
                        <option key={at.id} value={at.id}>#{at.display_id} · {at.title}</option>
                      ))}
                  </select>
                  <button
                    onClick={() => {
                      if (!dependencyPick) return
                      onAddDependency(dependencyPick)
                      setDependencyPick('')
                    }}
                    className="text-xs font-semibold px-2 py-1 rounded-md bg-brand-orange text-white"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">{t('projectDetail.taskRow.neededBy')}</h4>
              <div className="flex flex-wrap gap-1">
                {neededBy.map((dep) => (
                  <span key={dep.id} className="text-xs bg-brand-cream rounded-full px-2 py-1">#{dep.display_id} {dep.title}</span>
                ))}
                {neededBy.length === 0 && <span className="text-xs text-brand-gray">{t('common.none')}</span>}
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-brand-line">
              <button
                onClick={saveDraft}
                disabled={!dirty}
                className="text-sm font-semibold px-4 py-1.5 rounded-md bg-brand-orange text-white disabled:opacity-40"
              >
                {t('common.saveChanges')}
              </button>
              {dirty ? (
                <span className="text-xs text-brand-gray">{t('common.unsavedChanges')}</span>
              ) : (
                <span className="text-xs text-brand-green">{t('common.allSaved')}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DuplicatePicker({
  lists,
  allGroups,
  currentGroupId,
  onDuplicate,
  onClose,
}: {
  lists: List[]
  allGroups: Group[]
  currentGroupId: string
  onDuplicate: (targetGroupId: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const currentGroup = allGroups.find((g) => g.id === currentGroupId)
  const [listId, setListId] = useState(currentGroup?.list_id ?? lists[0]?.id ?? '')
  const groupsOfSelectedList = allGroups.filter((g) => g.list_id === listId)
  const [groupId, setGroupId] = useState(currentGroupId)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-full mt-1 z-20 bg-white border border-brand-line rounded-lg shadow-lg p-3 space-y-2 w-56"
    >
      <p className="text-xs font-semibold text-brand-carbon">{t('projectDetail.duplicatePicker.title')}</p>
      <select
        value={listId}
        onChange={(e) => {
          setListId(e.target.value)
          const firstGroup = allGroups.find((g) => g.list_id === e.target.value)
          setGroupId(firstGroup?.id ?? '')
        }}
        className="w-full text-xs px-2 py-1.5 rounded-md border border-brand-line"
      >
        {lists.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <select
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        className="w-full text-xs px-2 py-1.5 rounded-md border border-brand-line"
      >
        {groupsOfSelectedList.length === 0 && <option value="">{t('projectDetail.duplicatePicker.noGroupsInList')}</option>}
        {groupsOfSelectedList.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="text-xs text-brand-gray hover:text-brand-carbon">{t('common.cancel')}</button>
        <button
          onClick={() => {
            if (!groupId) return
            onDuplicate(groupId)
            onClose()
          }}
          disabled={!groupId}
          className="text-xs font-semibold px-2 py-1 rounded-md bg-brand-orange text-white disabled:opacity-40"
        >
          {t('projectDetail.duplicatePicker.duplicate')}
        </button>
      </div>
    </div>
  )
}

function PendingTaskRow({
  task,
  axes,
  currency,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  onDropOn,
  onRemove,
}: {
  task: Task
  axes: Axis[]
  currency: string
  draggable: boolean
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropOn: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const axis = axes.find((a) => a.id === task.axis_id)
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!draggable) return
        e.preventDefault()
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!draggable) return
        e.preventDefault()
        setDragOver(false)
        onDropOn()
      }}
      className={`px-5 py-3 flex items-center gap-3 bg-brand-orange/5 ${isDragging ? 'opacity-40' : ''} ${dragOver ? 'border-t-2 border-brand-orange' : ''}`}
    >
      {draggable && <span title={t('common.dragToReorder')} className="cursor-grab text-brand-gray/50 select-none">⠿</span>}
      <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-brand-orange text-white flex-shrink-0">
        {t('projectDetail.pendingTask.badge')}
      </span>
      <span className="flex-1 text-sm font-semibold text-brand-carbon">{task.title}</span>
      {axis && (
        <span
          className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full"
          style={{ backgroundColor: axis.color + '20', color: axis.color }}
        >
          {axis.name}
        </span>
      )}
      <span className="text-sm font-semibold text-brand-carbon w-28 text-right">
        {currency} {money(Number(task.planned_amount))}
      </span>
      <IconButton title={t('common.remove')} onClick={onRemove}>×</IconButton>
    </div>
  )
}
