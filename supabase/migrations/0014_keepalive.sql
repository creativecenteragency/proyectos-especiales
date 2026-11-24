-- Latido para que el plan gratuito de Supabase no pause el proyecto por inactividad.
-- Una tarea programada de GitHub (keep-alive.yml) llama a keepalive_ping() todos los días:
-- es una ESCRITURA real en la base (más fuerte que una simple lectura).
-- La tabla no tiene policies: nadie puede leerla ni modificarla directo desde la API;
-- solo se toca a través de la función, que únicamente incrementa un contador.

create table public.keepalive (
  id int primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now(),
  pings bigint not null default 0
);

insert into public.keepalive (id) values (1);

alter table public.keepalive enable row level security;

create function public.keepalive_ping()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  update public.keepalive set pinged_at = now(), pings = pings + 1 where id = 1 returning pinged_at;
$$;

revoke all on function public.keepalive_ping() from public;
grant execute on function public.keepalive_ping() to anon, authenticated;
