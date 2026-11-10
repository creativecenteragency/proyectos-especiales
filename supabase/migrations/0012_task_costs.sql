-- Subtareas con proveedor y monto ("líneas de costo") dentro de una tarea.
-- Una tarea como "Producción audiovisual" se compone de varias líneas, cada una
-- con su proveedor, su monto en la moneda en que realmente se pagó (ARS),
-- su condición de facturación (tipo de factura + IVA) y el tipo de cambio del
-- momento. El monto convertido a la moneda del proyecto (USD) se calcula acá,
-- en la base, para que sea siempre consistente.
--
-- Si una tarea tiene líneas, tasks.planned_amount / tasks.actual_amount pasan
-- a ser la suma de esas líneas (se mantienen solos vía trigger), así que los
-- ejes, el dashboard y los informes siguen funcionando sin cambios. Las tareas
-- sin líneas siguen cargándose a mano como hasta ahora.

create table public.task_costs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  concept text not null,
  concept_pt text,
  provider_id uuid references public.providers(id) on delete set null,
  currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  amount numeric(16,2) not null default 0 check (amount >= 0),         -- neto, en `currency`
  iva_rate numeric(5,2) not null default 0 check (iva_rate >= 0),      -- % (0 = sin IVA / Factura C)
  invoice_type text,                                                    -- 'A' | 'B' | 'C' | 'otro' (informativo)
  exchange_rate numeric(14,4) check (exchange_rate is null or exchange_rate > 0), -- ARS por 1 USD
  status text not null default 'proyectado' check (status in ('proyectado', 'ejecutado')),
  paid_on date,
  amount_converted numeric(16,2) not null default 0,                   -- con IVA, en moneda del proyecto
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index task_costs_task_id_idx on public.task_costs (task_id);
create index task_costs_provider_id_idx on public.task_costs (provider_id);

-- Calcula amount_converted (monto con IVA, en la moneda del proyecto).
create function public.task_costs_compute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_currency text;
  gross numeric;
begin
  select p.currency into proj_currency
  from public.tasks t
  join public.groups g on g.id = t.group_id
  join public.lists l on l.id = g.list_id
  join public.projects p on p.id = l.project_id
  where t.id = new.task_id;

  gross := new.amount * (1 + new.iva_rate / 100);

  if new.currency = proj_currency then
    new.amount_converted := round(gross, 2);
  elsif new.exchange_rate is null then
    raise exception 'Falta el tipo de cambio (ARS por USD) para convertir % a %.', new.currency, proj_currency;
  elsif new.currency = 'ARS' and proj_currency = 'USD' then
    new.amount_converted := round(gross / new.exchange_rate, 2);
  elsif new.currency = 'USD' and proj_currency = 'ARS' then
    new.amount_converted := round(gross * new.exchange_rate, 2);
  else
    raise exception 'Conversión % -> % no soportada.', new.currency, proj_currency;
  end if;

  return new;
end;
$$;

create trigger task_costs_compute_trg
  before insert or update on public.task_costs
  for each row execute procedure public.task_costs_compute();

-- Mantiene los totales de la tarea = suma de sus líneas (solo si tiene líneas).
create function public.task_costs_recalc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid := coalesce(new.task_id, old.task_id);
begin
  if exists (select 1 from public.task_costs where task_id = tid) then
    update public.tasks t
    set planned_amount = (select coalesce(sum(amount_converted), 0) from public.task_costs where task_id = tid),
        actual_amount = (select coalesce(sum(amount_converted), 0) from public.task_costs where task_id = tid and status = 'ejecutado')
    where t.id = tid;
  end if;
  return null;
end;
$$;

create trigger task_costs_recalc_trg
  after insert or update or delete on public.task_costs
  for each row execute procedure public.task_costs_recalc();

alter table public.task_costs enable row level security;

-- Mismo criterio que las tareas: ven todos los miembros del proyecto, escribe el equipo (y el Owner).
create policy "task_costs_select" on public.task_costs
  for select using (public.is_master() or public.is_project_member(public.project_of_task(task_id)));

create policy "task_costs_write" on public.task_costs
  for all using (public.is_master() or public.is_project_team(public.project_of_task(task_id)))
  with check (public.is_master() or public.is_project_team(public.project_of_task(task_id)));
