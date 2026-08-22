-- Marca en Accion (BETA) — integraciones de datos externos por proyecto, y el vinculo
-- entre una tarea del plan y la campana/posteo real que ayudo a potenciar.

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null check (provider in ('facebook', 'google_ads', 'instagram', 'google_analytics', 'tiendanube', 'metricool_organic')),
  account_ref text not null,   -- id o nombre de la cuenta en el agregador (Windsor/MasterMetrics/Metricool)
  label text not null,
  created_at timestamptz not null default now()
);

create index integrations_project_id_idx on public.integrations (project_id);

alter table public.integrations enable row level security;

-- Solo agencia (team) y Owner ven esto — nunca el Auditor/Cliente.
create policy "integrations_select" on public.integrations
  for select using (public.is_master() or public.is_project_team(project_id));

create policy "integrations_write" on public.integrations
  for all using (public.is_master() or public.is_project_team(project_id))
  with check (public.is_master() or public.is_project_team(project_id));

-- Vinculo libre: que campana o posteo real se potencio con esta tarea del plan.
alter table public.tasks add column campaign_ref text;
