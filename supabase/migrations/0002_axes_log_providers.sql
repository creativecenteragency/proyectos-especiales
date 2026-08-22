-- Proyectos Especiales — ejes editables con historial, proveedores, y soporte de proyección.

-- ============================================================
-- AXIS_CHANGE_LOG — por qué se creó/modificó un eje (redistribución de presupuesto)
-- ============================================================
create table public.axis_change_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  axis_id uuid references public.axes(id) on delete set null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  before jsonb,
  after jsonb,
  reason text,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index axis_change_log_project_id_idx on public.axis_change_log (project_id, created_at desc);

alter table public.axis_change_log enable row level security;

create policy "axis_change_log_select" on public.axis_change_log
  for select using (public.is_master() or public.is_project_member(project_id));

create policy "axis_change_log_insert" on public.axis_change_log
  for insert with check (public.is_master());

-- ============================================================
-- PROVIDERS — proveedores/cobradores, transversal a todos los proyectos (uso directivo)
-- ============================================================
create table public.providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cuit text,
  created_at timestamptz not null default now()
);

alter table public.providers enable row level security;

-- cualquier miembro de algun proyecto (o master) puede ver/crear proveedores para poder
-- asignarlos a una tarea; el analisis de % de inversion se restringe en la UI a is_master.
create policy "providers_select" on public.providers
  for select using (
    public.is_master()
    or exists (select 1 from public.project_members pm where pm.user_id = auth.uid())
  );

create policy "providers_insert" on public.providers
  for insert with check (
    public.is_master()
    or exists (select 1 from public.project_members pm where pm.user_id = auth.uid() and pm.role = 'team')
  );

create policy "providers_update" on public.providers
  for update using (public.is_master());

create policy "providers_delete" on public.providers
  for delete using (public.is_master());

alter table public.tasks add column provider_id uuid references public.providers(id) on delete set null;
create index tasks_provider_id_idx on public.tasks (provider_id);
