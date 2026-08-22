-- Proyectos Especiales — esquema inicial
-- Modelo: cuenta MASTER (Owner, agencia) + N clientes + N proyectos especiales por cliente.
-- Cada proyecto tiene: ejes de presupuesto, y una ejecución en forma de Listas > Grupos > Tareas (+ subtareas).
-- Cada tarea puede llevar un monto proyectado y un monto ejecutado, que se descuentan del eje/proyecto.

create extension if not exists "pgcrypto";

-- ============================================================
-- CLIENTS — cliente de la agencia (ej. Oxford). Habilita branding propio por proyecto.
-- ============================================================
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  brand_color text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROFILES — extiende auth.users
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  is_master boolean not null default false,  -- true = Owner/Administrador, control total
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- PROJECTS — un "proyecto especial" (ej. Oxford Argentina 2026-2027)
-- ============================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  total_budget numeric(14,2) not null default 0,
  currency text not null default 'USD',
  start_date date,
  end_date date,
  status text not null default 'propuesta'
    check (status in ('propuesta', 'activo', 'pausado', 'cerrado')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROJECT_MEMBERS — quién tiene acceso a qué proyecto y con qué rol
-- (el Owner/master ve y edita todo sin necesidad de estar acá)
-- ============================================================
create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('team', 'auditor')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- ============================================================
-- AXES (ejes) — desglose del presupuesto del proyecto (ej. Contenido, UGC, Google Ads...)
-- ============================================================
create table public.axes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  color text not null default '#6b7280',
  budget_amount numeric(14,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index axes_project_id_idx on public.axes (project_id);

-- ============================================================
-- LISTS — contenedor de primer nivel dentro de un proyecto (libre: puede ser un trimestre,
-- una fase, o cualquier agrupación que el equipo decida)
-- ============================================================
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index lists_project_id_idx on public.lists (project_id);

-- ============================================================
-- GROUPS — agrupación dentro de una lista (ej. un mes, una etapa)
-- ============================================================
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index groups_list_id_idx on public.groups (list_id);

-- ============================================================
-- TASKS — acción concreta (puede tener subtareas vía parent_task_id)
-- ============================================================
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  axis_id uuid references public.axes(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'preparacion'
    check (status in ('preparacion', 'planificado', 'en_curso', 'hecho', 'bloqueado')),
  tags text[] not null default '{}',
  custom_fields jsonb not null default '{}'::jsonb,  -- campos libres tipo Notion (responsable, link, etc.)
  planned_amount numeric(14,2) not null default 0,   -- proyectado / comprometido
  actual_amount numeric(14,2) not null default 0,    -- efectivamente invertido / ejecutado
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_group_id_idx on public.tasks (group_id);
create index tasks_parent_task_id_idx on public.tasks (parent_task_id);
create index tasks_axis_id_idx on public.tasks (axis_id);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- COMMENTS — comentarios en una tarea (el Auditor/Cliente participa acá)
-- ============================================================
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index comments_task_id_idx on public.comments (task_id);

-- ============================================================
-- ACTIVITY_LOG — trazabilidad de cambios sobre tareas
-- ============================================================
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,       -- 'created' | 'updated' | 'deleted'
  diff jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_project_id_idx on public.activity_log (project_id, created_at desc);

create function public.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_id uuid;
begin
  select l.project_id into proj_id
  from public.groups g
  join public.lists l on l.id = g.list_id
  where g.id = coalesce(new.group_id, old.group_id);

  if tg_op = 'INSERT' then
    insert into public.activity_log (project_id, task_id, user_id, action, diff)
    values (proj_id, new.id, auth.uid(), 'created', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.activity_log (project_id, task_id, user_id, action, diff)
    values (proj_id, new.id, auth.uid(), 'updated',
      jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.activity_log (project_id, task_id, user_id, action, diff)
    values (proj_id, old.id, auth.uid(), 'deleted', to_jsonb(old));
    return old;
  end if;
end;
$$;

create trigger tasks_log_activity
  after insert or update or delete on public.tasks
  for each row execute procedure public.log_task_activity();

-- ============================================================
-- HELPER FUNCTIONS (security definer para evitar recursión de RLS)
-- ============================================================
create function public.is_master()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_master = true
  );
$$;

create function public.project_role(p_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.project_members
  where project_id = p_id and user_id = auth.uid();
$$;

create function public.is_project_member(p_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_id and user_id = auth.uid()
  );
$$;

create function public.is_project_team(p_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_id and user_id = auth.uid() and role = 'team'
  );
$$;

-- list/group -> project helpers, para políticas de tasks/groups
create function public.project_of_list(l_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select project_id from public.lists where id = l_id;
$$;

create function public.project_of_group(g_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select l.project_id from public.groups g join public.lists l on l.id = g.list_id where g.id = g_id;
$$;

create function public.project_of_task(t_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select public.project_of_group(g.id) from public.tasks t join public.groups g on g.id = t.group_id where t.id = t_id;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.axes enable row level security;
alter table public.lists enable row level security;
alter table public.groups enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;
alter table public.activity_log enable row level security;

-- clients: master ve y edita todo; un miembro ve el cliente de sus proyectos
create policy "clients_select" on public.clients
  for select using (
    public.is_master()
    or exists (select 1 from public.projects p where p.client_id = clients.id and public.is_project_member(p.id))
  );
create policy "clients_write" on public.clients
  for all using (public.is_master()) with check (public.is_master());

-- profiles
create policy "profiles_select" on public.profiles
  for select using (public.is_master() or id = auth.uid());
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid() or public.is_master());

-- projects: master ve todo; team/auditor ven los suyos
create policy "projects_select" on public.projects
  for select using (public.is_master() or public.is_project_member(id));
create policy "projects_write" on public.projects
  for all using (public.is_master()) with check (public.is_master());

-- project_members: master administra; el propio usuario puede ver su fila
create policy "project_members_select" on public.project_members
  for select using (public.is_master() or user_id = auth.uid());
create policy "project_members_write" on public.project_members
  for all using (public.is_master()) with check (public.is_master());

-- axes: master y miembros leen; solo master escribe (define el presupuesto aprobado)
create policy "axes_select" on public.axes
  for select using (public.is_master() or public.is_project_member(project_id));
create policy "axes_write" on public.axes
  for all using (public.is_master()) with check (public.is_master());

-- lists: master y equipo leen/escriben; auditor solo lee
create policy "lists_select" on public.lists
  for select using (public.is_master() or public.is_project_member(project_id));
create policy "lists_write" on public.lists
  for all using (public.is_master() or public.is_project_team(project_id))
  with check (public.is_master() or public.is_project_team(project_id));

-- groups
create policy "groups_select" on public.groups
  for select using (public.is_master() or public.is_project_member(public.project_of_list(list_id)));
create policy "groups_write" on public.groups
  for all using (public.is_master() or public.is_project_team(public.project_of_list(list_id)))
  with check (public.is_master() or public.is_project_team(public.project_of_list(list_id)));

-- tasks
create policy "tasks_select" on public.tasks
  for select using (public.is_master() or public.is_project_member(public.project_of_group(group_id)));
create policy "tasks_write" on public.tasks
  for all using (public.is_master() or public.is_project_team(public.project_of_group(group_id)))
  with check (public.is_master() or public.is_project_team(public.project_of_group(group_id)));

-- comments: cualquier miembro (incluido auditor) puede comentar
create policy "comments_select" on public.comments
  for select using (public.is_master() or public.is_project_member(public.project_of_task(task_id)));
create policy "comments_insert" on public.comments
  for insert with check (public.is_master() or public.is_project_member(public.project_of_task(task_id)));
create policy "comments_delete_own" on public.comments
  for delete using (author_id = auth.uid() or public.is_master());

-- activity_log: solo lectura para miembros; el insert lo hace el trigger (security definer)
create policy "activity_log_select" on public.activity_log
  for select using (public.is_master() or public.is_project_member(project_id));

-- ============================================================
-- VISTA — resumen de presupuesto por eje (para el dashboard financiero)
-- ============================================================
create view public.axis_budget_summary as
select
  a.id as axis_id,
  a.project_id,
  a.name,
  a.color,
  a.budget_amount,
  coalesce(sum(t.planned_amount), 0) as planned_total,
  coalesce(sum(t.actual_amount), 0) as actual_total,
  a.budget_amount - coalesce(sum(t.actual_amount), 0) as balance
from public.axes a
left join public.tasks t on t.axis_id = a.id
group by a.id;
