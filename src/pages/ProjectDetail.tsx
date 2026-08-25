import { useMemo, useState, type FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { STATUS_LABEL, STATUS_COLOR, money, projectedClose } from '../lib/taskHelpers'
import BrandMark from '../components/BrandMark'
import ClientLogoEditor from '../components/ClientLogoEditor'
import ProjectMembersPanel from '../components/ProjectMembersPanel'
import Dropdown, { DropdownItem, DropdownLink } from '../components/Dropdown'
import type { Axis, AxisChangeLog, Client, Group, List, Project, Provider, Task, TaskStatus } from '../types/database'

type ProjectDetailData = {
  project: Project & { clients: Client | null }
  axes: Axis[]
  lists: List[]
  groups: Group[]
  tasks: Task[]
  role: 'team' | 'auditor' | null
  changeLog: AxisChangeLog[]
}

export default function ProjectDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { profile, session } = useAuth()
  const queryClient = useQueryClient()
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [showAxisEditor, setShowAxisEditor] = useState(false)
  const [showLogoEditor, setShowLogoEditor] = useState(false)
  const [showMembers, setShowMembers] = useState(false)

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

      return {
        project: project as Project & { clients: Client | null },
        axes: axes ?? [],
        lists: lists ?? [],
        groups: groups ?? [],
        tasks: (tasks ?? []) as Task[],
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
  })

  const updateTask = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { error } = await supabase.from('tasks').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
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
            reason: `Ajuste de presupuesto total: ${reason}`,
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

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-brand-gray">Cargando…</div>
  if (error || !data) return <div className="min-h-screen flex items-center justify-center text-brand-red">No se pudo cargar el proyecto.</div>

  const { project, axes, tasks } = data
  const plannedTotal = tasks.reduce((sum, t) => sum + Number(t.planned_amount), 0)
  const actualTotal = tasks.reduce((sum, t) => sum + Number(t.actual_amount), 0)
  const projectedTotal = projectedClose(tasks)
  const balance = Number(project.total_budget) - actualTotal
  const overBudget = projectedTotal > Number(project.total_budget)
  const brandColor = project.clients?.brand_color ?? '#f47a20'

  return (
    <div className="min-h-screen bg-brand-cream">
      <header className="bg-brand-carbon text-white">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-xs text-white/60 hover:text-white">← Proyectos</Link>
            <div className="flex items-center gap-4">
              {(isMaster || canEdit) && (
                <Dropdown trigger={<span className="text-xs text-white/60 hover:text-white">Ajustes ▾</span>}>
                  {isMaster && (
                    <DropdownItem onClick={() => setShowLogoEditor((v) => !v)}>Logo del cliente</DropdownItem>
                  )}
                  {isMaster && (
                    <DropdownItem onClick={() => setShowMembers((v) => !v)}>Miembros del proyecto</DropdownItem>
                  )}
                  {canEdit && (
                    <DropdownLink to={`/proyecto/${project.slug}/marca-en-accion`}>
                      Marca en Acción
                      <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-brand-orange/20 text-brand-orange">BETA</span>
                    </DropdownLink>
                  )}
                </Dropdown>
              )}
              <Link to={`/proyecto/${project.slug}/propuesta`} className="text-xs text-white/60 hover:text-white">
                Propuesta original
              </Link>
              <Link to={`/proyecto/${project.slug}/informe`} className="text-xs text-white/60 hover:text-white">
                Informe imprimible →
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
            <span className="text-[10px] uppercase tracking-wider text-white/50">{project.status}</span>
          </div>
          {isMaster && showLogoEditor && project.clients && (
            <ClientLogoEditor client={project.clients} onSaved={invalidate} />
          )}
          <h1 className="text-3xl font-display font-semibold mb-2">{project.name}</h1>
          <p className="text-sm text-white/70 max-w-2xl mb-6">{project.description}</p>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-white/10 rounded-lg overflow-hidden">
            <Stat label="Presupuesto total" value={`${project.currency} ${money(Number(project.total_budget))}`} />
            <Stat label="Proyectado" value={`${project.currency} ${money(plannedTotal)}`} />
            <Stat label="Ejecutado" value={`${project.currency} ${money(actualTotal)}`} />
            <Stat label="Saldo" value={`${project.currency} ${money(balance)}`} />
            <Stat
              label="Proyección de cierre"
              value={`${project.currency} ${money(projectedTotal)}`}
              alert={overBudget}
            />
          </div>
          {overBudget && (
            <p className="text-xs text-red-300 mt-2">
              ⚠ Si se ejecuta todo lo comprometido, el proyecto cierra {project.currency} {money(projectedTotal - Number(project.total_budget))} por encima del presupuesto.
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
            <h2 className="text-xs uppercase tracking-wider text-brand-gray font-semibold">Ejes de presupuesto</h2>
            {isMaster && (
              <button
                onClick={() => setShowAxisEditor((v) => !v)}
                className="text-xs font-semibold text-brand-orange hover:underline"
              >
                {showAxisEditor ? 'Cerrar editor' : 'Editar ejes'}
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
                    Proyectado {money(axisPlanned)} · Ejecutado {money(axisActual)}
                  </div>
                  <div className={`text-[10px] font-semibold mt-0.5 ${axisOver ? 'text-brand-red' : 'text-brand-gray'}`}>
                    Proyección de cierre {money(axisProjected)} {axisOver && '⚠'}
                  </div>
                </div>
              )
            })}
            {axes.length === 0 && <p className="text-sm text-brand-gray col-span-full">Todavía no hay ejes definidos.</p>}
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
                  if (confirm(`¿Eliminar la lista "${l.name}" y todo su contenido?`)) deleteList.mutate(l.id)
                }}
              />
            ))}
            {canEdit && <AddInline placeholder="Nueva lista…" onSubmit={(name) => addList.mutate(name)} />}
          </div>

          {!list && <p className="text-sm text-brand-gray">Todavía no hay listas en este proyecto.</p>}

          {list && (
            <div className="space-y-6">
              {groupsOfList.map((group) => {
                const groupTasks = tasks.filter((t) => t.group_id === group.id)
                const gPlanned = groupTasks.reduce((s, t) => s + Number(t.planned_amount), 0)
                const gActual = groupTasks.reduce((s, t) => s + Number(t.actual_amount), 0)
                return (
                  <div key={group.id} className="bg-white border border-brand-line rounded-xl overflow-hidden">
                    <GroupHeader
                      group={group}
                      canEdit={canEdit}
                      summary={`Proyectado ${money(gPlanned)} · Ejecutado ${money(gActual)}`}
                      onRename={(name) => updateGroup.mutate({ id: group.id, name })}
                      onDelete={() => {
                        if (confirm(`¿Eliminar el grupo "${group.name}" y sus tareas?`)) deleteGroup.mutate(group.id)
                      }}
                    />
                    <div className="divide-y divide-brand-line">
                      {groupTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          axes={axes}
                          providers={providers ?? []}
                          currency={project.currency}
                          canEdit={canEdit}
                          isOpen={openTaskId === task.id}
                          onToggle={() => setOpenTaskId(openTaskId === task.id ? null : task.id)}
                          onUpdate={(patch) => updateTask.mutate({ id: task.id, patch })}
                          onDelete={() => {
                            if (confirm(`¿Eliminar la tarea "${task.title}"?`)) deleteTask.mutate(task.id)
                          }}
                          onAddProvider={(input) => addProvider.mutateAsync(input)}
                        />
                      ))}
                      {groupTasks.length === 0 && (
                        <p className="text-sm text-brand-gray px-5 py-4">Sin tareas todavía.</p>
                      )}
                    </div>
                    {canEdit && (
                      <div className="px-5 py-3 bg-brand-cream/50">
                        <AddTaskForm axes={axes} onSubmit={(input) => addTask.mutate({ groupId: group.id, ...input })} />
                      </div>
                    )}
                  </div>
                )
              })}

              {canEdit && (
                <AddInline placeholder="Nuevo grupo…" onSubmit={(name) => addGroup.mutate({ listId: list.id, name })} />
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
          <IconButton title="Renombrar" onClick={() => setEditing(true)}>✎</IconButton>
          <IconButton title="Eliminar" onClick={onDelete}>×</IconButton>
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
            <IconButton title="Renombrar" onClick={() => setEditing(true)} dark>✎</IconButton>
            <IconButton title="Eliminar" onClick={onDelete} dark>×</IconButton>
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
        Agregar
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
        placeholder="Título de la tarea…"
        className="flex-1 min-w-[180px] text-sm px-3 py-1.5 rounded-md border border-brand-line focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
      />
      <select
        value={axisId}
        onChange={(e) => setAxisId(e.target.value)}
        className="text-sm px-2 py-1.5 rounded-md border border-brand-line"
      >
        <option value="">Sin eje</option>
        {axes.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <input
        type="number"
        value={planned}
        onChange={(e) => setPlanned(e.target.value)}
        className="w-28 text-sm px-2 py-1.5 rounded-md border border-brand-line"
        placeholder="Proyectado"
      />
      <button type="submit" className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white">
        + Tarea
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
      alert('Contá el motivo del cambio para dejarlo asentado en el historial.')
      return
    }
    if (floorErrors.length > 0) {
      alert('Hay ejes con menos presupuesto del que ya tienen comprometido o ejecutado. Ajustá esos valores primero.')
      return
    }
    if (!adjustTotal && !balanced) {
      alert('La suma de los ejes tiene que ser igual al presupuesto total para redistribuir sin tocarlo.')
      return
    }
    if (adjustTotal && totalFloorError) {
      alert('No podés bajar el presupuesto total por debajo de lo que ya se ejecutó en todo el proyecto.')
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
        <h3 className="text-sm font-display font-semibold text-brand-carbon">Redistribución de presupuesto</h3>
        <p className="text-xs text-brand-gray mt-0.5">
          Cambiá los montos, agregá ejes nuevos, y elegí si ese dinero sale de otros ejes (redistribuir) o se suma al total del proyecto.
        </p>
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
                placeholder={row.id ? undefined : 'Nombre del eje nuevo…'}
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
                    mínimo {money(floor)} (ya comprometido/ejecutado)
                  </span>
                )}
              </div>
              {row.id === null ? (
                <button type="button" onClick={() => removeDraftRow(row.key)} className="text-xs text-brand-gray hover:text-brand-red">
                  Quitar
                </button>
              ) : floor === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const original = axes.find((a) => a.id === row.id)
                    const r = original && prompt(`¿Por qué eliminás el eje "${original.name}"?`)
                    if (r && original) {
                      onDelete(original, r)
                      removeDraftRow(row.key)
                    }
                  }}
                  className="text-xs text-brand-gray hover:text-brand-red"
                >
                  Eliminar eje
                </button>
              ) : (
                <span className="text-[10px] text-brand-gray" title="Tiene presupuesto comprometido o ejecutado">
                  no se puede eliminar
                </span>
              )}
            </div>
          )
        })}
        <button onClick={addDraftRow} className="text-xs font-semibold text-brand-orange hover:underline">
          + Agregar eje nuevo
        </button>
      </div>

      <div className={`text-sm rounded-md p-3 ${balanced ? 'bg-brand-cream' : 'bg-brand-red/10'}`}>
        <div className="flex justify-between">
          <span className="text-brand-gray">Suma de ejes</span>
          <span className="font-semibold text-brand-carbon">{currency} {money(sum)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-gray">Presupuesto total del proyecto</span>
          <span className="font-semibold text-brand-carbon">{currency} {money(totalBudget)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-gray">Diferencia</span>
          <span className={`font-semibold ${balanced ? 'text-brand-green' : 'text-brand-red'}`}>
            {delta > 0 ? '+' : ''}{money(delta)}
          </span>
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-brand-line">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo del cambio (queda en el historial)…"
          className="w-full text-sm px-3 py-1.5 rounded-md border border-brand-line"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => submit(false)}
            disabled={!balanced}
            className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-carbon text-white disabled:opacity-40"
          >
            Guardar redistribuyendo (sin tocar el total)
          </button>
          <button
            onClick={() => submit(true)}
            className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-orange text-white"
          >
            Guardar y ajustar el total a {currency} {money(sum)}
          </button>
        </div>
      </div>

      <button onClick={() => setShowLog((v) => !v)} className="text-xs font-semibold text-brand-gray hover:text-brand-carbon">
        {showLog ? 'Ocultar historial' : `Ver historial de cambios (${changeLog.length})`}
      </button>

      {showLog && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {changeLog.length === 0 && <p className="text-xs text-brand-gray">Todavía no hay cambios registrados.</p>}
          {changeLog.map((entry) => (
            <div key={entry.id} className="text-xs bg-brand-cream rounded-md p-2">
              <div className="font-semibold text-brand-carbon">
                {entry.action === 'created' ? 'Eje creado' : entry.action === 'deleted' ? 'Eje eliminado' : 'Cambio de presupuesto'}
                <span className="text-brand-gray font-normal"> · {new Date(entry.created_at).toLocaleString('es-AR')}</span>
              </div>
              {entry.reason && <div className="text-brand-gray">Motivo: {entry.reason}</div>}
              {entry.action === 'updated' && entry.before && entry.after && (
                <div className="text-brand-gray">
                  {String((entry.before as { name?: string }).name ?? 'Presupuesto total')}:{' '}
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

function TaskRow({
  task,
  axes,
  providers,
  currency,
  canEdit,
  isOpen,
  onToggle,
  onUpdate,
  onDelete,
  onAddProvider,
}: {
  task: Task
  axes: Axis[]
  providers: Provider[]
  currency: string
  canEdit: boolean
  isOpen: boolean
  onToggle: () => void
  onUpdate: (patch: Partial<Task>) => void
  onDelete: () => void
  onAddProvider: (input: { name: string; cuit: string }) => Promise<Provider | undefined>
}) {
  const axis = axes.find((a) => a.id === task.axis_id)
  const [actual, setActual] = useState(String(task.actual_amount))
  const [planned, setPlanned] = useState(String(task.planned_amount))
  const [titleEditing, setTitleEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [newProviderName, setNewProviderName] = useState('')
  const [newProviderCuit, setNewProviderCuit] = useState('')
  const subtasks = (task.custom_fields?.subtasks as string[] | undefined) ?? []
  const deliverable = (task.custom_fields?.deliverable as string | undefined) ?? ''

  return (
    <div>
      <div className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-brand-cream/60">
        <button onClick={onToggle} className="flex-1 text-left">
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
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <span className="text-sm font-semibold text-brand-carbon w-28 text-right">
          {currency} {money(Number(task.planned_amount))}
        </span>
        {canEdit && (
          <span className="flex gap-1">
            <IconButton title="Renombrar" onClick={() => setTitleEditing(true)}>✎</IconButton>
            <IconButton title="Eliminar" onClick={onDelete}>×</IconButton>
          </span>
        )}
      </div>

      {isOpen && (
        <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">Subtareas</h4>
            <textarea
              defaultValue={subtasks.join('\n')}
              disabled={!canEdit}
              onBlur={(e) =>
                onUpdate({
                  custom_fields: { ...task.custom_fields, subtasks: e.target.value.split('\n').filter(Boolean) },
                })
              }
              placeholder="Una subtarea por línea…"
              className="w-full text-sm rounded-md border border-brand-line p-2 min-h-[80px] disabled:bg-brand-cream/50"
            />
          </div>
          <div className="space-y-3">
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">Entregable</h4>
              <textarea
                defaultValue={deliverable}
                disabled={!canEdit}
                onBlur={(e) => onUpdate({ custom_fields: { ...task.custom_fields, deliverable: e.target.value } })}
                className="w-full text-sm rounded-md border-l-4 border-brand-orange bg-brand-cream p-2 min-h-[50px] disabled:opacity-70"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">Proyectado</h4>
                <input
                  type="number"
                  value={planned}
                  disabled={!canEdit}
                  onChange={(e) => setPlanned(e.target.value)}
                  onBlur={() => onUpdate({ planned_amount: Number(planned) || 0 })}
                  className="w-full text-sm px-2 py-1.5 rounded-md border border-brand-line disabled:bg-brand-cream/50"
                />
              </div>
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">Ejecutado (real)</h4>
                <input
                  type="number"
                  value={actual}
                  disabled={!canEdit}
                  onChange={(e) => setActual(e.target.value)}
                  onBlur={() => onUpdate({ actual_amount: Number(actual) || 0 })}
                  className="w-full text-sm px-2 py-1.5 rounded-md border border-brand-line disabled:bg-brand-cream/50"
                />
              </div>
            </div>
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">Proveedor / cobra</h4>
              <select
                value={task.provider_id ?? ''}
                disabled={!canEdit}
                onChange={(e) => onUpdate({ provider_id: e.target.value || null })}
                className="w-full text-sm px-2 py-1.5 rounded-md border border-brand-line disabled:bg-brand-cream/50"
              >
                <option value="">Sin asignar</option>
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
                    if (created) onUpdate({ provider_id: created.id })
                    setNewProviderName('')
                    setNewProviderCuit('')
                  }}
                  className="flex items-center gap-1 mt-1"
                >
                  <input
                    value={newProviderName}
                    onChange={(e) => setNewProviderName(e.target.value)}
                    placeholder="Proveedor nuevo…"
                    className="flex-1 text-xs px-2 py-1 rounded-md border border-brand-line"
                  />
                  <input
                    value={newProviderCuit}
                    onChange={(e) => setNewProviderCuit(e.target.value)}
                    placeholder="CUIT"
                    className="w-24 text-xs px-2 py-1 rounded-md border border-brand-line"
                  />
                  <button type="submit" className="text-xs font-semibold px-2 py-1 rounded-md bg-brand-orange text-white">+</button>
                </form>
              )}
            </div>
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-brand-gray font-semibold mb-1">Campaña / posteo vinculado</h4>
              <input
                defaultValue={task.campaign_ref ?? ''}
                disabled={!canEdit}
                onBlur={(e) => onUpdate({ campaign_ref: e.target.value.trim() || null })}
                placeholder="Ej: campaña de Meta o link del posteo que potenció esto…"
                className="w-full text-sm px-2 py-1.5 rounded-md border border-brand-line disabled:bg-brand-cream/50"
              />
              <p className="text-[10px] text-brand-gray mt-0.5">Se usa en "Marca en Acción" para mostrar qué acción del plan impulsó cada resultado.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
