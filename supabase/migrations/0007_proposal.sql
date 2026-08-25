-- Propuesta Original: resumen estratégico y roadmap anual, aparte de la ejecución.
-- Sirve como guía de lo aprobado — se edita poco, no es el día a día del proyecto.

alter table public.projects add column proposal_summary text;
alter table public.projects add column proposal_objectives text;

create table public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  quarter_label text not null,     -- ej: "Q1 · Ago-Oct 2026"
  title text not null,             -- ej: "Base argentina"
  period_label text,               -- ej: "Invierno -> Primavera"
  bullets text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index roadmap_items_project_id_idx on public.roadmap_items (project_id);

alter table public.roadmap_items enable row level security;

create policy "roadmap_items_select" on public.roadmap_items
  for select using (public.is_master() or public.is_project_member(project_id));

-- Solo el Owner edita el roadmap aprobado (igual criterio que projects_write).
create policy "roadmap_items_write" on public.roadmap_items
  for all using (public.is_master()) with check (public.is_master());
