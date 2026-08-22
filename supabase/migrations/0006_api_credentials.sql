-- Conexiones (BETA): API keys de agregadores (Windsor, MasterMetrics, Metricool),
-- cargadas desde la plataforma en vez del dashboard de Supabase. Son a nivel agencia
-- (no por proyecto), y solo el Owner puede leerlas o escribirlas.

create table public.api_credentials (
  id uuid primary key default gen_random_uuid(),
  aggregator text not null unique check (aggregator in ('windsor', 'mastermetrics', 'metricool')),
  api_key text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.api_credentials enable row level security;

-- Nadie mas que el Owner puede ver ni tocar esto — ni siquiera el Equipo.
create policy "api_credentials_master_only" on public.api_credentials
  for all using (public.is_master()) with check (public.is_master());
