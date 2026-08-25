-- Los proveedores son transversales (tabla global), pero para dejar la plataforma lista para
-- múltiples proyectos necesitamos poder "tildar" a qué proyecto(s) está asignado cada uno.
-- (Las personas ya tienen esto resuelto vía project_members — un miembro por proyecto/rol.)
create table public.provider_projects (
  provider_id uuid not null references public.providers(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider_id, project_id)
);

create index provider_projects_project_id_idx on public.provider_projects (project_id);

alter table public.provider_projects enable row level security;

create policy "provider_projects_select" on public.provider_projects
  for select using (
    public.is_master()
    or exists (select 1 from public.project_members pm where pm.user_id = auth.uid())
  );

create policy "provider_projects_write" on public.provider_projects
  for all using (public.is_master() or public.is_project_team(project_id))
  with check (public.is_master() or public.is_project_team(project_id));
