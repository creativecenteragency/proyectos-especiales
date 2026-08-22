-- Bucket público para logos de clientes (y en el futuro, de la agencia si hiciera falta).
insert into storage.buckets (id, name, public)
values ('client-logos', 'client-logos', true)
on conflict (id) do nothing;

-- Lectura pública (son logos, no hay nada sensible), escritura solo para el Owner.
create policy "client_logos_public_read" on storage.objects
  for select using (bucket_id = 'client-logos');

create policy "client_logos_master_write" on storage.objects
  for insert with check (bucket_id = 'client-logos' and public.is_master());

create policy "client_logos_master_update" on storage.objects
  for update using (bucket_id = 'client-logos' and public.is_master());

create policy "client_logos_master_delete" on storage.objects
  for delete using (bucket_id = 'client-logos' and public.is_master());
