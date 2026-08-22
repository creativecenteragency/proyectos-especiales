-- logo_url ya existente = versión "positiva" (para fondos claros).
-- Se agrega la versión "negativa" (para fondos oscuros, como el header del proyecto).
alter table public.clients add column logo_url_negative text;
